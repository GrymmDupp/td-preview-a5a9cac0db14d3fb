// Ancestors Trail client (2026-11-27): the signed-in reader's own family tree, shared by the Ancestors page, the live map
// and the passport book. Family data is private: it comes only from the reader's own Supabase row (RLS owner = auth.uid())
// and a copy on this device keyed by their account id. Nothing here is ever sent anywhere else.
import * as P from './passport.js';
import { buildTrail, indexTree, relationship, EVENT_LABEL, yearOf } from './ancestors-core.js';
export { relationship, indexTree, yearOf };
export const esc = P.esc;
const CK = (u) => 'td-anc:' + u;
const SK = (u) => 'td-anc-stamps:' + u;
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }, del(k) { try { localStorage.removeItem(k); } catch { /* */ } } };
export const state = { status: 'loading', uid: null, tree: null, byId: null, home: null, stamps: {}, err: '' };   // status: loading | off | signed-out | none | ready | error

export async function init() {
  const sb = await P.backend();
  if (!sb) { state.status = 'off'; return state; }
  state.uid = P.remote.uid;
  if (!state.uid) { state.status = 'signed-out'; clearOthers(null); return state; }
  clearOthers(state.uid);
  const cached = ls.get(CK(state.uid), null);
  if (cached && cached.tree) use(cached.tree, cached.home, ls.get(SK(state.uid), {}));
  try {
    const st = await sb.from('app_settings').select('value').eq('key', 'ancestors_enabled').maybeSingle();
    if (st.error || st.data?.value !== 'true') { if (!state.tree) state.status = 'off'; return state; }
    const r = await sb.from('ancestor_trees').select('tree,stamps,home_person,updated_at').eq('owner', state.uid).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) { forget(); state.status = 'none'; return state; }
    const local = ls.get(SK(state.uid), {});
    const stamps = Object.assign({}, r.data.stamps || {}, local);
    use(r.data.tree, r.data.home_person || r.data.tree.home, stamps);
    ls.set(CK(state.uid), { tree: r.data.tree, home: state.home, at: r.data.updated_at });
    if (Object.keys(local).some((k) => !(r.data.stamps || {})[k])) pushStamps();
  } catch (e) { if (!state.tree) { state.status = 'error'; state.err = e.message || String(e); } }
  return state;
}
// a different account signed in on this phone: never show the last one's tree
function clearOthers(uid) { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^td-anc(-stamps)?:/.test(k) && (!uid || !k.endsWith(':' + uid))) localStorage.removeItem(k); } } catch { /* */ } }
function forget() { if (state.uid) { ls.del(CK(state.uid)); ls.del(SK(state.uid)); } state.tree = null; state.byId = null; }
function use(tree, home, stamps) {
  state.tree = tree; state.byId = indexTree(tree); state.home = home && state.byId.has(home) ? home : tree.home; state.stamps = stamps || {}; state.status = 'ready';
  relCache.clear(); placePeople = null;
}
const relCache = new Map();
export function rel(id) { if (!relCache.has(id)) relCache.set(id, relationship(state.byId, state.home, id)); return relCache.get(id); }
export async function setHome(id) {
  state.home = id; relCache.clear();
  ls.set(CK(state.uid), Object.assign(ls.get(CK(state.uid), {}), { home: id }));
  const sb = await P.backend(); if (sb) await sb.from('ancestor_trees').update({ home_person: id }).eq('owner', state.uid);
}

/* ------------------------------------------------ places and people */
let placePeople = null;   // place index -> [[personId, eventIdx], ...]
export function peopleAt(i) {
  if (!placePeople) { placePeople = new Map(); for (const p of state.tree.people) p.e.forEach((e, k) => { if (e[2] >= 0) { if (!placePeople.has(e[2])) placePeople.set(e[2], []); placePeople.get(e[2]).push([p.i, k]); } }); }
  return placePeople.get(i) || [];
}
export function mappedPlaces() { const out = []; state.tree.places.forEach((pl, i) => { if (pl.q !== 'state' && isFinite(pl.la) && peopleAt(i).length) out.push(i); }); return out; }
export const evLabel = (e) => EVENT_LABEL[e[0]] || e[0];
export const lifeLine = (p) => { const b = yearOf(p.b), d = yearOf(p.d); return p.liv ? (b ? 'b. ' + b + ' · living' : 'living') : (b || d ? (b || '?') + '–' + (d || '?') : ''); };
export const QWORD = { exact: 'exact address', cemetery: 'cemetery', town: 'town', township: 'township', county: 'county', state: 'state only' };
export function precisionNote(pl) {
  if (!pl) return '';
  if (pl.lv) return 'A living relative: shown only as a wide area around ' + (pl.q === 'county' ? 'the county' : 'the town') + ', never their home.';
  if (pl.q === 'cemetery') return pl.cf === 'high' ? 'The record names this cemetery, and it matches one on the map.' : 'The record names a cemetery that probably matches this one.';
  if (pl.q === 'exact') return 'The record gives a street address.';
  if (pl.q === 'town') return 'The record gives only the town, so this is the town, not a spot in it.';
  if (pl.q === 'township') return 'The record gives only the township, so this is the township, not a spot in it.';
  if (pl.q === 'county') return 'The record gives only the county, so this is the whole county.';
  return '';
}
// "Your 3rd great-grandfather <name> was buried"; used by nudges and cards
export function verbLine(p, e) {
  const v = { BIRT: 'was born', CHR: 'was christened', BAPM: 'was baptized', DEAT: 'died', BURI: 'was buried', MARR: 'married', RESI: 'lived', CENS: 'was counted in the census', DIV: 'divorced', IMMI: 'arrived', EMIG: 'left', NATU: 'was naturalized', _MILT: 'served', PROB: 'had probate', PROP: 'held property' }[e[0]] || 'was recorded';
  const r = rel(p.i);
  const who = r && r !== 'you' ? r.charAt(0).toUpperCase() + r.slice(1) + ' ' + p.n : r === 'you' ? 'You' : p.n;
  return who + ' ' + (r === 'you' && v === 'was born' ? 'were born' : v);
}

/* ------------------------------------------------ family stamps (one per place) */
export const stampId = (i) => 'fam:' + i;
export function addStamp(i, at = new Date()) {
  const id = stampId(i); if (state.stamps[id]) return null;
  state.stamps[id] = { at: at.toISOString() };
  ls.set(SK(state.uid), state.stamps);
  try { window.dispatchEvent(new CustomEvent('td-family-stamp', { detail: { id, place: i } })); } catch { /* */ }
  clearTimeout(addStamp.t); addStamp.t = setTimeout(pushStamps, 1500);
  return state.stamps[id];
}
async function pushStamps() {
  const sb = await P.backend(); if (!sb || !state.uid) return;
  const r = await sb.from('ancestor_trees').update({ stamps: state.stamps }).eq('owner', state.uid);
  if (!r.error) ls.set(SK(state.uid), state.stamps);
}
export function familyStamps() { return Object.entries(state.stamps || {}).map(([id, s]) => ({ id, place: +id.slice(4), at: s.at })).filter((s) => state.tree && state.tree.places[s.place]).sort((a, b) => String(b.at).localeCompare(String(a.at))); }

/* ------------------------------------------------ upload: parse on the phone, save the processed trail */
export async function processFile(file, base, onStep) {
  const text = await file.text();
  if (!/^\s*\uFEFF?0\s+HEAD/.test(text.slice(0, 200))) throw new Error('That does not look like a GEDCOM family tree file (.ged).');
  onStep && onStep('Reading ' + (text.match(/^0 @[^@]+@ INDI/gm) || []).length.toLocaleString() + ' people…');
  const gz = new Map(), tl = new Map();
  const loadGaz = (st) => { if (!gz.has(st)) gz.set(st, fetch(base + 'ancestors/gaz/' + st + '.json').then((r) => (r.ok ? r.json() : null))); return gz.get(st); };
  const loadTile = (k) => { if (!tl.has(k)) tl.set(k, fetch(base + 'live/layers/t/' + k + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)); return tl.get(k); };
  const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; };
  const t = await buildTrail(text, { loadGaz, loadTile, rand: rnd });
  onStep && onStep('Found ' + t.people.length.toLocaleString() + ' people with US records. Saving to your account…');
  return t;
}
export async function saveTree(t, sourceName) {
  const sb = await P.backend(); if (!sb || !P.remote.uid) throw new Error('Sign in first.');
  const used = new Set(); for (const p of t.people) for (const e of p.e) if (e[2] >= 0 && t.places[e[2]].q !== 'state') used.add(e[2]);
  const keep = state.tree && state.stamps ? {} : {};   // a new tree has new place numbers, so old family stamps do not carry over
  const r = await sb.from('ancestor_trees').upsert({ owner: P.remote.uid, tree: t, stamps: keep, home_person: t.home, source: String(sourceName || 'GEDCOM file').slice(0, 120), people: t.people.length, places: used.size }, { onConflict: 'owner' });
  if (r.error) throw new Error(/relation|schema cache|does not exist/i.test(r.error.message) ? 'The Ancestors Trail is not switched on for accounts yet.' : r.error.message);
  ls.set(SK(P.remote.uid), {});
  use(t, t.home, {}); ls.set(CK(P.remote.uid), { tree: t, home: t.home, at: new Date().toISOString() });
}
export async function deleteTree() {
  const sb = await P.backend(); if (!sb || !P.remote.uid) return;
  const r = await sb.from('ancestor_trees').delete().eq('owner', P.remote.uid);
  if (r.error) throw new Error(r.error.message);
  forget(); state.status = 'none';
}
