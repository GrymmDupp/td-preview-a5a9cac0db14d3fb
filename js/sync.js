// Synced saves, reading log and finds. Signed out: everything stays in this browser (localStorage), as before.
// Signed in: one small JSON document per account (table user_state, RLS owner-only) is merged with the
// device on sign-in and after changes. Merge is three-way against the last synced copy, so un-saving on one phone
// sticks on the others. "Field leads" from the Live navigator are NOT synced: they hold locations and stay on the phone.
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
const J = (k, d) => { try { return JSON.parse(ls.get(k) || 'null') ?? d; } catch { return d; } };
const WATCH = ['td-saved', 'td-opened', 'td-nyx', 'td-nightowl'];
const BASE = 'td-sync-base', LASTUID = 'td-sync-uid';

let be = null, uid = null, timer = null, busy = null, applying = false, onChanged = () => {}, dead = false, lastAt = 0;
export const syncState = { status: 'local', at: null };   // 'local' | 'syncing' | 'synced' | 'unavailable'

const byId = (a) => new Map((a || []).filter((x) => x && x.id).map((x) => [x.id, x]));
const newer = (a, b) => (!a ? b : !b ? a : String(a.at) >= String(b.at) ? a : b);

// Three-way merge of a list of {id, at} items. base = ids present at the last sync.
function mergeList(local, remote, base, cap) {
  const L = byId(local), R = byId(remote), B = new Set(base || []), out = [];
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    if (B.has(id) && (!L.has(id) || !R.has(id))) continue;   // deleted on one side since the last sync
    out.push(newer(L.get(id), R.get(id)));
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, cap);
}
const earliest = (a, b) => (!a ? b : !b ? a : String(a.at) <= String(b.at) ? a : b);

export function readLocal() {
  return { saved: J('td-saved', []), opened: J('td-opened', []), nyx: J('td-nyx', []), nightowl: J('td-nightowl', null) };
}
function writeLocal(d) {
  applying = true;
  try {
    ls.set('td-saved', JSON.stringify(d.saved)); ls.set('td-opened', JSON.stringify(d.opened)); ls.set('td-nyx', JSON.stringify(d.nyx));
    if (d.nightowl) ls.set('td-nightowl', JSON.stringify(d.nightowl));
  } finally { applying = false; }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function merge(local, remote, base, replace = false) {
  remote = remote || {}; base = base || {};
  if (replace) return { saved: remote.saved || [], opened: remote.opened || [], nyx: remote.nyx || [], nightowl: remote.nightowl || null };
  return {
    saved: mergeList(local.saved, remote.saved, base.saved, 300),
    opened: mergeList(local.opened, remote.opened, base.opened, 200),
    nyx: [...new Set([...(local.nyx || []), ...(remote.nyx || [])])],
    nightowl: earliest(local.nightowl, remote.nightowl),
  };
}

async function syncNow() {
  if (!be?.getUserState || !uid || dead) return;
  if (busy) return busy;
  busy = (async () => {
    syncState.status = 'syncing';
    try {
      const row = await be.getUserState();
      const remote = row?.data && row.data.v === 1 ? row.data : null;
      const local = readLocal();
      const foreign = ls.get(LASTUID) && ls.get(LASTUID) !== uid;      // another account used this device last: do not mix people
      const base = foreign ? null : J(BASE + ':' + uid, null);
      const merged = merge(local, remote, base, !!foreign);
      const changedLocal = !same(merged, local);
      if (changedLocal) { writeLocal(merged); }
      const doc = { v: 1, ...merged };
      if (!remote || !same({ saved: remote.saved, opened: remote.opened, nyx: remote.nyx, nightowl: remote.nightowl || null }, merged)) await be.putUserState(doc);
      ls.set(BASE + ':' + uid, JSON.stringify({ saved: merged.saved.map((x) => x.id), opened: merged.opened.map((x) => x.id) }));
      ls.set(LASTUID, uid);
      syncState.status = 'synced'; syncState.at = new Date().toISOString(); lastAt = Date.now();
      if (changedLocal) onChanged();
    } catch (e) {
      console.warn('sync unavailable:', e?.message || e);
      syncState.status = 'unavailable'; dead = true;     // e.g. table not created yet: stay local, quietly
    }
  })();
  try { await busy; } finally { busy = null; }
}

const schedule = () => { if (!uid || dead) return; clearTimeout(timer); timer = setTimeout(syncNow, 2500); };
let patched = false;
function patchStorage() {
  if (patched) return; patched = true;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { const r = orig.call(this, k, v); if (!applying && this === window.localStorage && WATCH.includes(k)) schedule(); return r; };
}

// Call with the backend and the signed-in account (or null). Safe to call again after sign-in or sign-out.
export function syncStart(backend, me, changed) {
  be = backend; onChanged = changed || onChanged;
  patchStorage();
  const next = me?.id && backend?.mode === 'supabase' && backend.features?.sync && backend.getUserState ? me.id : null;
  if (next === uid) return;   // already running for this account
  uid = next;
  dead = false; syncState.status = uid ? 'syncing' : 'local';
  if (uid) syncNow(); else clearTimeout(timer);
}
document.addEventListener('visibilitychange', () => { if (uid && document.visibilityState === 'visible' && Date.now() - lastAt > 60000) syncNow(); });
