// Personalized interests and area: a short welcome after sign-in, the same form in Account,
// and soft filters for the shelf, the live map chips, driving alerts and family nudges.
// Skipped picks stay in the library behind "Show more"; nothing is deleted.
import { STATES } from './taxonomy.js';

export const INTERESTS = [
  { key: 'deeds', label: 'Homes for sale with a dark past', note: 'Twisted Deeds and Strong Stories on the market now.' },
  { key: 'legends', label: 'Local legends and leads', note: 'Stigmatized leads and unverified finds on the live map.' },
  { key: 'archive', label: 'The Archive', note: 'Verified places that are not for sale.' },
  { key: 'cemeteries', label: 'Cemeteries', note: 'Cemetery layers and alerts along the road.' },
  { key: 'markers', label: 'Historic markers', note: 'Historical markers and plaques.' },
  { key: 'ancestors', label: 'Ancestors Trail', note: 'Your family’s places, private to your account.' },
];
export const RADII = [25, 50, 100, 250];
export const INTEREST_KEYS = INTERESTS.map((x) => x.key);
const LS = 'td-user-prefs';
const MORE_AREA = 'td-prefs-show-more-area';
const MORE_CATS = 'td-prefs-show-more-cats';
const R = 6371000;

const INTEREST_ON = () => Object.fromEntries(INTEREST_KEYS.map((k) => [k, true]));

export function defaults() {
  return {
    interests: INTEREST_ON(),
    area: { everywhere: true, states: [], label: '', lat: null, lon: null, radius_mi: 50 },
    seen: false,
    updated_at: null,
  };
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function sessGet(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function sessSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }
function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } }
function lsSet(p) { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* */ } }

function normStates(a) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(a) ? a : []) {
    const s = String(raw || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(s) && STATES[s] && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

export function normalize(raw) {
  const d = defaults();
  const src = raw && typeof raw === 'object' ? raw : {};
  const iIn = src.interests && typeof src.interests === 'object' ? src.interests : {};
  const aIn = src.area && typeof src.area === 'object' ? src.area : {};
  const interests = { ...d.interests };
  for (const k of INTEREST_KEYS) if (k in iIn) interests[k] = iIn[k] !== false;
  let rad = Number(aIn.radius_mi);
  if (!RADII.includes(rad)) rad = 50;
  const lat = aIn.lat == null || aIn.lat === '' ? null : Number(aIn.lat);
  const lon = aIn.lon == null || aIn.lon === '' ? null : Number(aIn.lon);
  return {
    interests,
    area: {
      everywhere: aIn.everywhere !== false,
      states: normStates(aIn.states),
      label: String(aIn.label || '').trim().slice(0, 80),
      lat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
      lon: Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null,
      radius_mi: rad,
    },
    seen: !!(src.seen || src.seen_welcome),
    updated_at: src.updated_at || null,
  };
}

let currentPrefs = normalize(lsGet());
const listeners = new Set();

export function current() { return currentPrefs; }
export function interestOn(key) { return currentPrefs.interests[key] !== false; }
export function everywhere() { return !!currentPrefs.area.everywhere; }
export function hasSoftFilter() {
  const p = currentPrefs;
  if (INTEREST_KEYS.some((k) => p.interests[k] === false)) return true;
  if (p.area.everywhere) return false;
  return !!(p.area.states.length || (p.area.lat != null && p.area.lon != null));
}

export function showMoreArea() { return !!sessGet(MORE_AREA, false); }
export function showMoreCats() { return !!sessGet(MORE_CATS, false); }
export function setShowMoreArea(on) { sessSet(MORE_AREA, !!on); notify(); }
export function setShowMoreCats(on) { sessSet(MORE_CATS, !!on); notify(); }

export function onPrefsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of listeners) try { fn(currentPrefs); } catch { /* */ } }

function meters(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function placeState(obj) {
  if (!obj) return '';
  if (obj.state && STATES[String(obj.state).toUpperCase()]) return String(obj.state).toUpperCase();
  const line = String(obj.place || obj.addr || obj.address || obj.name || '');
  const m = line.match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  return m && STATES[m[1]] ? m[1] : '';
}

export function inArea(lat, lon, state) {
  const a = currentPrefs.area;
  if (a.everywhere || showMoreArea()) return true;
  const st = state || '';
  if (a.states.length) {
    if (st && a.states.includes(st)) return true;
    if (st) return false;
    // no state on the pin: fall through to radius if we have one, else keep it (don't hard-block)
    if (a.lat == null || a.lon == null) return !st;
  }
  if (a.lat != null && a.lon != null && Number.isFinite(+lat) && Number.isFinite(+lon)) {
    return meters(a.lat, a.lon, +lat, +lon) <= a.radius_mi * 1609.344;
  }
  return true;
}

export function isArchiveListing(l) {
  return !!(l && (l.collection === 'archive' || l.shelf === 'archive' || l.layer === 'archive'));
}
export function isSaleListing(l) {
  if (!l || isArchiveListing(l) || l.collection === 'heritage') return false;
  const st = String(l.status || '');
  return st === 'Active' || st === 'Pending' || l.tier === 1 || l.tier === 2;
}

export function listingInterest(l) {
  if (!l) return null;
  if (isArchiveListing(l)) return 'archive';
  if (l.collection === 'heritage') return null;
  return 'deeds';
}

export function listingWanted(l) {
  if (showMoreCats() && (everywhere() || showMoreArea() || inArea(l.lat, l.lon, placeState(l)))) return true;
  const kind = listingInterest(l);
  if (kind && !interestOn(kind)) return false;
  return inArea(l.lat, l.lon, placeState(l));
}

export function pinCatInterest(cat, lyrKind) {
  if (lyrKind === 'cem' || cat === 'cem') return 'cemeteries';
  if (lyrKind === 'hmark' || cat === 'hmark') return 'markers';
  if (cat === 'deed' || cat === 'story') return 'deeds';
  if (cat === 'lead' || cat === 'unverified') return 'legends';
  if (cat === 'archive') return 'archive';
  return null;
}

export function pinWanted(p) {
  if (!p) return true;
  const kind = pinCatInterest(p.cat, p.kind);
  if (kind && !showMoreCats() && !interestOn(kind)) return false;
  return inArea(p.lat, p.lon, placeState(p));
}

export function chipDefaults() {
  const more = showMoreCats();
  return {
    deed: more || interestOn('deeds'),
    story: more || interestOn('deeds'),
    lead: more || interestOn('legends'),
    unverified: more || interestOn('legends'),
    archive: more || interestOn('archive'),
    hmark: more || interestOn('markers'),
    cem: more || interestOn('cemeteries'),
    ancestors: more || interestOn('ancestors'),
  };
}

export function partitionList(list) {
  const primary = [], more = [];
  for (const l of list || []) (listingWanted(l) ? primary : more).push(l);
  return { primary, more };
}

export function areaLabel() {
  const a = currentPrefs.area;
  if (a.everywhere) return 'the whole road, a trip with no usual map';
  if (a.label && a.lat != null) return 'within ' + a.radius_mi + ' miles of ' + a.label;
  if (a.states.length) return a.states.map((s) => STATES[s] || s).join(', ');
  return 'your usual area';
}

export function prefsSummary() {
  if (!hasSoftFilter()) return '';
  const off = INTERESTS.filter((x) => !interestOn(x.key)).map((x) => x.label);
  const bits = [];
  if (!everywhere()) bits.push(areaLabel());
  const on = INTERESTS.filter((x) => interestOn(x.key)).map((x) => x.label);
  if (on.length && on.length < INTEREST_KEYS.length) bits.push(on.join(', '));
  else if (off.length) bits.push('everything except ' + off.join(', '));
  return bits.join(' · ');
}

function merge(a, b) {
  const A = normalize(a), B = normalize(b);
  const at = Date.parse(A.updated_at || 0) || 0, bt = Date.parse(B.updated_at || 0) || 0;
  const newer = bt >= at ? B : A, older = bt >= at ? A : B;
  return normalize({
    interests: { ...older.interests, ...newer.interests },
    area: { ...older.area, ...newer.area },
    seen: A.seen || B.seen,
    updated_at: newer.updated_at || older.updated_at,
  });
}

let remote = { get: null, set: null };

function canSync(be) {
  if (!be) return false;
  if (be.mode === 'supabase') return !!be.uid;
  if (typeof be.me === 'function') return !!be.me();
  return !!(be.uid || be.session);
}
export function attachPrefsBackend(be) {
  remote.get = be && be.getUserPrefs && canSync(be) ? () => be.getUserPrefs() : null;
  remote.set = be && be.setUserPrefs && canSync(be) ? (p) => be.setUserPrefs(p) : null;
}

export async function bootPrefs(be) {
  attachPrefsBackend(be);
  const local = normalize(lsGet());
  currentPrefs = local;
  if (!remote.get) { notify(); return currentPrefs; }
  try {
    const row = await remote.get();
    if (row) {
      const server = normalize({ ...row, seen: row.seen_welcome ?? row.seen });
      currentPrefs = merge(local, server);
      lsSet(currentPrefs);
      if ((local.seen && !server.seen) || (local.updated_at && local.updated_at !== server.updated_at && Date.parse(local.updated_at) > Date.parse(server.updated_at || 0))) {
        await persist(currentPrefs, { quiet: true });
      }
    } else if (local.seen || local.updated_at) {
      await persist(local, { quiet: true });
    }
  } catch { /* migration not run yet, or signed out */ }
  notify();
  return currentPrefs;
}

async function persist(p, { quiet } = {}) {
  currentPrefs = normalize(p);
  currentPrefs.updated_at = currentPrefs.updated_at || new Date().toISOString();
  lsSet(currentPrefs);
  if (remote.set) {
    try { const row = await remote.set(currentPrefs); if (row) currentPrefs = normalize({ ...row, seen: row.seen_welcome ?? row.seen }); lsSet(currentPrefs); }
    catch { if (!quiet) throw new Error('Saved on this device. The account copy could not be updated yet.'); }
  }
  notify();
  return currentPrefs;
}

export async function savePrefs(partial) {
  const next = normalize({ ...currentPrefs, ...partial, interests: { ...currentPrefs.interests, ...(partial.interests || {}) }, area: { ...currentPrefs.area, ...(partial.area || {}) }, seen: true });
  next.updated_at = new Date().toISOString();
  sessSet(MORE_AREA, false);
  sessSet(MORE_CATS, false);
  return persist(next);
}

export async function dismissWelcome() {
  return persist({ ...currentPrefs, seen: true, updated_at: new Date().toISOString() });
}

export function needsWelcome(me) { return !!me && !currentPrefs.seen; }

/* ---------------------------------------------------------------- geocode (same Nominatim Find as the live map) */
let findLast = 0, findBusy = false;
const findCache = new Map();

export async function geocodePlace(q) {
  q = String(q || '').trim();
  if (!q) return { none: true };
  const key = q.toLowerCase();
  if (findCache.has(key)) return findCache.get(key);
  const wait = findLast + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (findBusy) return null;
  findBusy = true; findLast = Date.now();
  try {
    const zip = /^\d{5}(-\d{4})?$/.test(q);
    const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&countrycodes=' + (zip ? 'us&postalcode=' + encodeURIComponent(q.slice(0, 5)) : 'us,ca&q=' + encodeURIComponent(q));
    const r = await fetch(u, { headers: { Accept: 'application/json' } });
    if (!r.ok) return { err: true };
    const j = await r.json();
    const hit = j && j[0];
    if (!hit) return { none: true };
    const out = { name: String(hit.display_name || q).split(', ').slice(0, 3).join(', '), lat: +hit.lat, lon: +hit.lon };
    findCache.set(key, out);
    return out;
  } catch { return { err: true }; }
  finally { findBusy = false; findLast = Date.now(); }
}

/* ---------------------------------------------------------------- forms */
function toggleRow(x, on) {
  return '<button type="button" class="prefs-tog' + (on ? ' on' : '') + '" data-pref-int="' + x.key + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
    + '<span class="prefs-lever" aria-hidden="true"><i></i></span>'
    + '<span class="prefs-tog-t"><b>' + esc(x.label) + '</b><small>' + esc(x.note) + '</small></span></button>';
}

function stateChips(selected) {
  const sel = new Set(selected);
  const codes = Object.keys(STATES);
  return '<div class="prefs-states" role="group" aria-label="States">'
    + codes.map((s) => '<button type="button" class="prefs-st' + (sel.has(s) ? ' on' : '') + '" data-pref-st="' + s + '" aria-pressed="' + (sel.has(s) ? 'true' : 'false') + '">' + esc(STATES[s]) + '</button>').join('')
    + '</div>';
}

export function prefsFormHtml(p = currentPrefs, { id = 'prefs-form', save = false } = {}) {
  const a = p.area, road = a.everywhere;
  return '<form class="prefs-form" id="' + id + '" data-user-prefs>'
    + '<fieldset class="prefs-fs"><legend>What should we put first?</legend>'
    + '<div class="prefs-togs">' + INTERESTS.map((x) => toggleRow(x, p.interests[x.key] !== false)).join('') + '</div></fieldset>'
    + '<fieldset class="prefs-fs"><legend>Where shall we look?</legend>'
    + '<button type="button" class="prefs-tog prefs-road' + (road ? ' on' : '') + '" data-pref-road aria-pressed="' + (road ? 'true' : 'false') + '">'
    + '<span class="prefs-lever" aria-hidden="true"><i></i></span>'
    + '<span class="prefs-tog-t"><b>Show me everything — I’m on a road trip</b><small>The whole shelf and the whole map, with no usual area.</small></span></button>'
    + '<div class="prefs-area' + (road ? ' is-off' : '') + '" data-pref-area>'
    + '<p class="prefs-or">Pick one or more states, or a town or ZIP and a radius. Not both at once.</p>'
    + '<p class="prefs-sub">States</p>' + stateChips(a.states)
    + '<p class="prefs-sub">Or a town or ZIP</p>'
    + '<label class="prefs-lab">Town or ZIP <input name="place" type="search" enterkeyhint="search" autocomplete="off" placeholder="Horton, MI or 49241" value="' + esc(a.lat != null ? a.label : '') + '"></label>'
    + '<p class="prefs-geo" data-pref-geo></p>'
    + '<div class="prefs-radii" role="group" aria-label="Radius">' + RADII.map((n) => '<button type="button" class="prefs-rad' + (a.radius_mi === n ? ' on' : '') + '" data-pref-rad="' + n + '" aria-pressed="' + (a.radius_mi === n ? 'true' : 'false') + '">' + n + ' mi</button>').join('') + '</div>'
    + '</div></fieldset>'
    + '<p class="prefs-note">Skipped shelves stay in the library, behind Show more. You can change this anytime in Account.</p>'
    + '<input type="hidden" name="lat" value="' + (a.lat ?? '') + '"><input type="hidden" name="lon" value="' + (a.lon ?? '') + '"><input type="hidden" name="label" value="' + esc(a.label) + '">'
    + (save ? '<div class="prefs-actions"><button class="btn prefs-save" type="submit">Save these picks</button></div>' : '')
    + '</form>';
}

export function readPrefsForm(root) {
  const p = normalize(currentPrefs);
  root.querySelectorAll('[data-pref-int]').forEach((b) => { p.interests[b.dataset.prefInt] = b.classList.contains('on'); });
  p.area.everywhere = !!root.querySelector('[data-pref-road].on');
  p.area.states = p.area.everywhere ? [] : [...root.querySelectorAll('[data-pref-st].on')].map((b) => b.dataset.prefSt);
  const rad = root.querySelector('[data-pref-rad].on');
  p.area.radius_mi = rad ? +rad.dataset.prefRad : p.area.radius_mi;
  const lat = root.querySelector('[name=lat]')?.value, lon = root.querySelector('[name=lon]')?.value, label = root.querySelector('[name=label]')?.value;
  if (!p.area.everywhere && lat && lon) { p.area.lat = +lat; p.area.lon = +lon; p.area.label = String(label || '').trim(); p.area.states = []; }
  else { p.area.lat = null; p.area.lon = null; if (p.area.states.length) p.area.label = ''; }
  p.seen = true;
  return normalize(p);
}

export function bindPrefsForm(root, { toast } = {}) {
  const road = () => root.querySelector('[data-pref-road]');
  const area = () => root.querySelector('[data-pref-area]');
  const geo = () => root.querySelector('[data-pref-geo]');
  const setRoad = (on) => {
    const b = road(); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    if (area()) area().classList.toggle('is-off', on);
  };
  root.addEventListener('click', (e) => {
    const int = e.target.closest('[data-pref-int]');
    if (int) { const on = !int.classList.contains('on'); int.classList.toggle('on', on); int.setAttribute('aria-pressed', on); return; }
    const r = e.target.closest('[data-pref-road]');
    if (r) { setRoad(!r.classList.contains('on')); return; }
    const st = e.target.closest('[data-pref-st]');
    if (st) {
      setRoad(false);
      const on = !st.classList.contains('on'); st.classList.toggle('on', on); st.setAttribute('aria-pressed', on);
      const lat = root.querySelector('[name=lat]'); if (lat) { lat.value = ''; root.querySelector('[name=lon]').value = ''; }
      return;
    }
    const rad = e.target.closest('[data-pref-rad]');
    if (rad) {
      root.querySelectorAll('[data-pref-rad]').forEach((b) => { b.classList.toggle('on', b === rad); b.setAttribute('aria-pressed', b === rad); });
      setRoad(false);
    }
  });
  const input = root.querySelector('input[name=place]');
  let t;
  const lookup = async () => {
    const q = (input?.value || '').trim();
    if (!q) { if (geo()) geo().textContent = ''; return; }
    if (geo()) geo().textContent = 'Looking it up…';
    const r = await geocodePlace(q);
    if (!r) return;
    if (r.none) { if (geo()) geo().textContent = 'No place found for “' + q + '”. Try a town and state, or a ZIP.'; return; }
    if (r.err) { if (geo()) geo().textContent = 'Search is not reachable right now.'; return; }
    root.querySelector('[name=lat]').value = r.lat;
    root.querySelector('[name=lon]').value = r.lon;
    root.querySelector('[name=label]').value = r.name;
    root.querySelectorAll('[data-pref-st].on').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    setRoad(false);
    if (geo()) geo().textContent = 'Centered on ' + r.name + '.';
    if (toast) toast('Centered on ' + r.name + '.', 2500);
  };
  if (input) {
    input.addEventListener('change', lookup);
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(lookup, 700); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
  }
}

/* ---------------------------------------------------------------- welcome sheet */
let welcomeEl = null;

export function closeWelcome() {
  if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; }
}

export function openWelcome({ existing = true, toast } = {}) {
  closeWelcome();
  if (!document.querySelector('link[data-td-prefs-css]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.tdPrefsCss = '1'; l.href = 'assets/css/prefs.css'; document.head.appendChild(l);
  }
  const el = document.createElement('div');
  el.id = 'td-prefs';
  el.innerHTML = '<div class="prefs-sheet" role="dialog" aria-modal="true" aria-labelledby="td-prefs-title">'
    + '<div class="prefs-bar"><b id="td-prefs-title">What shall we put first?</b>'
    + '<button type="button" class="prefs-x" data-prefs-skip aria-label="Dismiss">×</button></div>'
    + '<div class="prefs-body">'
    + '<p class="prefs-lead">' + (existing
      ? 'A short stop, just this once. Tell us what you care about, and the shelf, the live map and the alerts will lead with that. Everything else stays in the library, behind Show more.'
      : 'Welcome in. Tell us what you care about, and the shelf, the live map and the alerts will lead with that. Everything else stays in the library, behind Show more.')
    + '</p>'
    + prefsFormHtml(currentPrefs, { id: 'prefs-welcome' })
    + '<div class="prefs-actions"><button type="button" class="btn prefs-save" data-prefs-save>Save these picks</button>'
    + '<button type="button" class="btn ghost" data-prefs-skip>Skip for now</button></div>'
    + '</div></div>';
  document.body.appendChild(el);
  welcomeEl = el;
  bindPrefsForm(el, { toast });
  const skip = async () => { await dismissWelcome().catch(() => {}); closeWelcome(); if (toast) toast('You can set this anytime in Account.', 3500); };
  el.querySelectorAll('[data-prefs-skip]').forEach((b) => { b.onclick = skip; });
  el.querySelector('[data-prefs-save]').onclick = async () => {
    const btn = el.querySelector('[data-prefs-save]');
    btn.disabled = true;
    try { await savePrefs(readPrefsForm(el)); closeWelcome(); if (toast) toast('We’ll lead with your picks. Change them anytime in Account.', 4000); }
    catch (e) { btn.disabled = false; if (toast) toast(e.message || 'Could not save.', 4000); }
  };
  el.addEventListener('click', (e) => { if (e.target === el) skip(); });
}

export function maybeOpenWelcome(me, opts) {
  if (!needsWelcome(me) || welcomeEl) return false;
  openWelcome({ existing: true, ...opts });
  return true;
}

export function noteGps(lat, lon) {
  if (!hasSoftFilter() || everywhere() || showMoreArea()) return false;
  if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return false;
  if (inArea(lat, lon, '')) return false;
  // inArea with empty state + radius: if they only picked states, empty state returns true when no lat. If they have radius, check distance.
  const a = currentPrefs.area;
  if (a.lat != null && a.lon != null) {
    if (meters(a.lat, a.lon, +lat, +lon) <= a.radius_mi * 1609.344) return false;
  } else if (a.states.length) {
    return false; // state is unknown from GPS alone; don't auto-expand
  } else return false;
  setShowMoreArea(true);
  return true;
}

// Live.js reads these without importing the module.
if (typeof window !== 'undefined') {
  window.TDPrefs = {
    current, interestOn, everywhere, hasSoftFilter, inArea, pinWanted, listingWanted,
    showMoreArea, showMoreCats, setShowMoreArea, setShowMoreCats, chipDefaults,
    placeState, noteGps, areaLabel, prefsSummary, onPrefsChange, pinCatInterest,
  };
}
