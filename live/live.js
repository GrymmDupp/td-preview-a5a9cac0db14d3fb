/* Twisted Deeds · Live navigator. Private preview, noindex. Pure client side:
 * pins come from the app's own feed (+ the Jackson pins); "What's here?" reads free public sources
 * (OpenStreetMap Nominatim, Wikipedia, Wikidata). Saved field leads stay in this phone's localStorage only. */
(function () {
'use strict';
const FEED_URL = 'https://grymmdupp.github.io/twisted-deeds-feed/feed/listings.json';
const FEED_FALLBACK = '../data/listings.snapshot.json';
const JX = [42.2459, -84.4013];
const CATS = { deed: 'Twisted Deed', story: 'Strong Story', lead: 'Stigmatized lead', unverified: 'Unverified', context: 'Context' };
const LETTER = { deed: 'D', story: 'S', lead: 'L', unverified: '?', context: 'C' };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const sess = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// ---------- settings
// First open / no saved live prefs: every layer chip starts off so testers pick what they want.
// Returning visitors who already saved td-live-settings keep those picks; missing keys keep the
// former on-by-default so a layer they never toggled does not silently vanish.
const SHOW_OFF = { deed: false, story: false, lead: false, unverified: false, context: false, archive: false, hmark: false, cem: false };
const SHOW_LEGACY = { deed: true, story: true, lead: true, unverified: true, context: false, archive: true, hmark: true, cem: true };
const savedS = store.get('td-live-settings', null);
const RAD_MIN = 1, RAD_MAX = 25;
function clampRad(v) { const n = Number(v); if (!Number.isFinite(n)) return RAD_MIN; return Math.min(RAD_MAX, Math.max(RAD_MIN, Math.round(n))); }
function radLabel(mi) { return mi + ' mi'; }
const S = Object.assign({ radius: RAD_MIN, chime: false, speak: false, show: { ...SHOW_OFF } }, savedS && typeof savedS === 'object' ? savedS : {});
S.show = Object.assign({}, (savedS && typeof savedS === 'object') ? SHOW_LEGACY : SHOW_OFF, (savedS && savedS.show && typeof savedS.show === 'object') ? savedS.show : {});
S.radius = clampRad(S.radius);
const saveS = () => store.set('td-live-settings', S);
if (savedS && typeof savedS === 'object' && Number(savedS.radius) !== S.radius) saveS();

// ---------- geometry
const R_MI = 3958.8;
function hav(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R_MI * Math.asin(Math.sqrt(x)); }
function bearing(a, b, c, d) { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; }
const COMP = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMP[Math.round(deg / 45) % 8];
function fmtDist(mi) { return mi < 0.1 ? (Math.max(10, Math.round(mi * 5280 / 10) * 10) + ' ft') : (mi < 10 ? mi.toFixed(mi < 1 ? 2 : 1) : Math.round(mi)) + ' mi'; }
// Private-home neighborhood circle (Grymm t225u). See js/privacy.js. Public data already
// carries the offset center + radiusM; alerts fire anywhere inside that circle.
const isPriv = (p) => !!(p && p.privateHome);
const locLabel = (p) => isPriv(p) ? (p.area || p.areaLabel || 'an area of town') : (p.addr || '');
const radMi = (p) => isPriv(p) ? ((Number(p.radiusM) || 201.17) / 1609.344) : 0;
const inPrivArea = (lat, lon, p) => isPriv(p) && hav(lat, lon, p.lat, p.lon) <= radMi(p);
const dirUrl = (p) => isPriv(p) ? '' : 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon + '&travelmode=driving';
const dirBtn = (p, cls) => dirUrl(p) ? '<a class="btn ' + (cls || 'p g') + '" target="_blank" rel="noopener" href="' + dirUrl(p) + '">Directions</a>' : '';
function sanitizePrivacy(p) {
  if (!isPriv(p)) return p;
  p.approx = true; p.find = false; p.addr = '';
  p.area = p.area || p.areaLabel || 'an area of town';
  p.radiusM = Number(p.radiusM) || 201.17;
  return p;
}

// ---------- state
let PINS = [];
let me = null, meAcc = 0, meTs = 0, meHead = null;
let watchId = null, running = false, follow = true, wakeLock = null;
const mine = [];   // private field-lead markers
const markers = new Map();

// ---------- map
const map = L.map('map', { zoomControl: false, attributionControl: true, tap: true }).setView(...(function () { try { const l = JSON.parse(localStorage.getItem('td_live_last') || 'null'); if (l && isFinite(l[0]) && isFinite(l[1])) return [[l[0], l[1]], 12]; } catch (e) {} return [[39.5, -98.35], 4]; })());   // last place this phone was, else all of the US
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);
const layer = L.layerGroup().addTo(map);
const mineLayer = L.layerGroup().addTo(map);
let meMarker = null, meCircle = null;

// ---------- pins
const inactive = (p) => !!p.off;
// Reveals (subtle only): a pin you have already been alerted to and walked away from fades to a small
// crossed-out gravestone (still tappable). Motion off when the app's Reduce motion / Effects are off.
const calm = () => { try { if (localStorage.getItem('td-rm') === '1' || localStorage.getItem('td-fx') === '0') return true; } catch (e) { /* ignore */ } return matchMedia('(prefers-reduced-motion: reduce)').matches; };
let passed = new Set(sess.get('td-live-passed', []));
const GRAVE = '<svg viewBox="0 0 20 24" width="20" height="24" aria-hidden="true"><path d="M3 23V9a7 7 0 0 1 14 0v14z" fill="#4a4744" stroke="#cfc8bb" stroke-width="1.4"/><path d="M6.5 11.5l7 7M13.5 11.5l-7 7" stroke="#e8dcc4" stroke-width="1.6" stroke-linecap="round"/><path d="M1 23h18" stroke="#cfc8bb" stroke-width="1.4"/></svg>';
// Twisted Passport (live/passport-live.js) may draw a stamped place as its stamp, and an unvisited one faded.
const TDP = () => window.TDPassport || null;
function pinIcon(p) {
  const tp = TDP(), sh = tp && tp.pinHtml(p);
  if (sh) return L.divIcon({ className: '', html: sh, iconSize: [40, 40], iconAnchor: [20, 20] });
  if (passed.has(p.id)) return L.divIcon({ className: '', html: '<div class="pin grave ' + p.cat + (calm() ? '' : ' fade') + '" title="Passed">' + GRAVE + '</div>', iconSize: [22, 26], iconAnchor: [11, 22] });
  const cls = 'pin ' + p.cat + (inactive(p) ? ' off' : '') + (p.approx ? ' approx' : '') + (tp ? tp.pinClass(p) : '');
  const sz = p.cat === 'context' ? 24 : 34;
  return L.divIcon({ className: '', html: '<div class="' + cls + '">' + LETTER[p.cat] + '</div>', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
}
const DEED_GRADES = ['sovereign', 'death', 'diseased', 'split'];
function feedToPins(data) {
  const out = [];
  for (const l of (Array.isArray(data && data.listings) ? data.listings : [])) {
    const lat = Number(l.lat), lon = Number(l.lon);
    if (!l.id || !isFinite(lat) || !isFinite(lon) || l.lat === null || l.lon === null) continue;
    if (l.collection === 'heritage' || l.grade === 'heritage') continue;
    const cat = DEED_GRADES.includes(l.grade) ? 'deed' : (l.grade === 'story' ? 'story' : null);
    if (!cat) continue;
    const st = l.status || 'Active';
    out.push({ id: l.id, cat, label: CATS[cat], name: l.name, addr: l.address || l.place || '', lat, lon, status: st, price: l.price || '',
      hook: l.summary || l.loreTeaser || '', src: [], app: true, approx: l.geo_precision && l.geo_precision !== 'address',
      off: !(st === 'Active' || st === 'Pending') });
  }
  return out;
}
async function getJson(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 10000);
  try { const r = await fetch(url, { cache: 'no-cache', signal: c.signal }); if (!r.ok) throw new Error(r.status + ' ' + url); return await r.json(); }
  finally { clearTimeout(t); }
}
async function loadPins() {
  let feed = [], src = 'live feed';
  try { feed = feedToPins(await getJson(FEED_URL, 8000)); }
  catch (e) { try { feed = feedToPins(await getJson(FEED_FALLBACK, 8000)); src = 'saved copy of the feed'; } catch (e2) { src = 'no app feed'; } }
  let jx = [];
  try { jx = (await getJson('jackson_pins.json')).map((p) => Object.assign({}, p, { off: p.cat === 'deed' || p.cat === 'story' ? !/^active|^pending/i.test(p.status) : false })); } catch (e) { /* ignore */ }
  const byId = new Map(feed.map((p) => [p.id, p]));
  for (const p of jx) { const f = byId.get(p.id); byId.set(p.id, Object.assign({}, f || {}, p, f ? { app: true, approx: f.approx } : {})); }
  PINS = [...byId.values()].map((p) => sanitizePrivacy(Object.assign({ src: [], hook: '', price: '', addr: '' }, p, { label: CATS[p.cat] })));
  return src;
}
function prefAreaOk(p) { const P = window.TDPrefs; if (!P || P.showMoreArea()) return true; return P.inArea(p.lat, p.lon, P.placeState(p)); }
function visible(p) { return !!S.show[p.cat] && prefAreaOk(p); }
const isLyr = (id) => typeof id === 'string' && id.startsWith('L:');
function findAny(id) { return isLyr(id) ? LYR.items.get(id) : PINS.find((x) => x.id === id); }
function alertable(p) { return visible(p) && !inactive(p) && (!p.approx || isPriv(p)); }
function drawPins() {
  layer.clearLayers(); markers.clear();
  for (const p of PINS) {
    if (!visible(p)) continue;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), keyboard: false, zIndexOffset: p.cat === 'context' ? -500 : 0 });
    m.on('click', () => showDetails(p.id));
    layer.addLayer(m); markers.set(p.id, m);
    if (isPriv(p)) {
      L.circle([p.lat, p.lon], { radius: Number(p.radiusM) || 201.17, color: '#c9a96a', weight: 2, dashArray: '6 6', fillColor: '#c9a96a', fillOpacity: 0.12, interactive: false }).addTo(layer);
    }
  }
  refreshNearby();
}

// ---------- Markers + Cemeteries layers (static tiles in layers/, built from open data: OpenStreetMap
// contributors (ODbL), Michigan History Center / DNR historical markers (public record), National Park
// Service National Register (public domain), state marker programs (Texas Historical Commission, Maryland
// MDOT SHA, Montana DOT, Vermont DHP open data). Name, spot, type and source link only; no marker text.
// Cemeteries also from USGS GNIS + National Structures Dataset (public domain) and Oakland / Barry County MI
// open data, merged with OSM into one pin each (live_nav/cem_sources.py). Find a Grave is a link-out only.
// Nationwide (US + Canada from OSM): 0.25° tiles, loaded only for the map view and the GPS spot; per-5° block
// files give tile counts for the zoomed-out cluster bubbles (live_nav/build_national.py).)
// Find a Grave location ids, each checked on findagrave.com (Nunavut not checked: no link there)
const FAG_US = 'AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA PR RI SC SD TN TX UT VA VT WA WI WV WY'.split(' ');
const FAG_CA = ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'];
const FAG_LOC = {}; FAG_US.forEach((a, i) => { FAG_LOC[a] = 'state_' + (i + 2); }); FAG_CA.forEach((a, i) => { FAG_LOC[a] = 'state_' + (823 + i); });
const ST_NAME = { AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DC: 'the District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming' };
const LYR = { idx: null, tiles: new Map(), loading: new Map(), items: new Map(), blk: new Map(), blkLoading: new Map() };
const LTYPE = { M: 'Michigan historical marker', S: 'State historical marker', N: 'National Register site', U: 'Museum', K: 'Historical marker', P: 'Plaque', B: 'History board', C: 'Cemetery' };
const LSAY = { M: 'Michigan historical marker', S: 'Historical marker', N: 'Historic place', U: 'Museum', K: 'Historical marker', P: 'Historical plaque', B: 'History board', C: 'Cemetery' };
const LPRI = { M: 0, S: 0, N: 0, U: 0, K: 0, P: 1, B: 1, C: 2 };
const HIST_LINE = 'Historical record; the cemetery may no longer be visible.';
const APPROX_LINE = 'Approximate location; the exact spot isn’t known.';
const XSRC = { tx: ['Texas Historical Commission marker', (v) => 'https://atlas.thc.texas.gov/Details/' + encodeURIComponent(v)],
  md: ['Maryland roadside marker list (MDOT SHA)', () => 'https://www.arcgis.com/home/item.html?id=082e58dd45f941fda1cdfc33a5b91d81'],
  mt: ['Montana highway marker list (MDT)', () => 'https://www.arcgis.com/home/item.html?id=b9b601302cfa4cada68caad1150e081e'],
  vt: ['Vermont roadside marker list (Division for Historic Preservation)', () => 'https://www.arcgis.com/home/item.html?id=9f1c255148b3411296e549849ea7f342'] };
const MI_MARKERS_MAP = 'https://experience.arcgis.com/experience/0810844003f149faa1a3aeaa64d7d42e';
const lyrLayer = L.layerGroup().addTo(map);
const PLAQUE = '<svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true"><path d="M7 12h2v7H7z" fill="#8a7a5c"/><rect x="1" y="1" width="14" height="11" rx="2" fill="#2f3a2c" stroke="#c9a96a" stroke-width="1.4"/><path d="M4 5h8M4 8h6" stroke="#c9a96a" stroke-width="1.2" stroke-linecap="round"/></svg>';
const STONE_H = '<svg viewBox="0 0 14 17" width="14" height="17" aria-hidden="true"><path d="M2 16V7a5 5 0 0 1 10 0v9z" fill="rgba(20,20,20,.35)" stroke="#b9a6d6" stroke-width="1.3" stroke-dasharray="2 1.6"/><path d="M7 6v6M5 8h4" stroke="#b9a6d6" stroke-width="1.1" stroke-linecap="round"/></svg>';
const STONE = '<svg viewBox="0 0 14 17" width="14" height="17" aria-hidden="true"><path d="M2 16V7a5 5 0 0 1 10 0v9z" fill="#55605a" stroke="#c7cdc4" stroke-width="1.2"/><path d="M7 6v6M5 8h4" stroke="#dfe4dc" stroke-width="1.2" stroke-linecap="round"/><path d="M0.5 16h13" stroke="#c7cdc4" stroke-width="1.2"/></svg>';
function lyrKind(t) { return t === 'C' ? 'cem' : 'hmark'; }
function lyrSrc(code, srcs) {
  const k = code.slice(0, 1), v = code.slice(2);
  if (code === 'u') { const g = (srcs || []).find((c) => c.slice(0, 2) === 'g:'); code = g ? 'u:' + g.slice(2) : ''; return code ? lyrSrc(code) : null; }
  if (k === 'x') { const x = XSRC[v.slice(0, 2)]; return x ? { label: x[0], url: x[1](v.slice(2)) } : null; }
  if (k === 'o') { const ty = { n: 'node', w: 'way', r: 'relation' }[v[0]]; return { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' + ty + '/' + v.slice(1) }; }
  if (k === 'm') return { label: 'Michigan Historical Markers map (' + v + ')', url: MI_MARKERS_MAP };
  if (k === 'n') return { label: 'National Register file', url: 'https://npgallery.nps.gov/AssetDetail/NRIS/' + encodeURIComponent(v) };
  if (k === 'g') return { label: 'USGS place names (GNIS ' + v + ')', url: 'https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data' };
  if (k === 'u') return { label: 'USGS National Map record', url: 'https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer/2/query?outFields=name,city,state,gnis_id&returnGeometry=true&outSR=4326&f=html&where=' + encodeURIComponent(v[0] === 'p' ? "permanent_identifier='" + v.slice(1) + "'" : "gnis_id='" + v + "'") };
  if (k === 'c') { const oak = v.slice(0, 3) === 'oak'; return { label: (oak ? 'Oakland' : 'Barry') + ' County cemetery list', url: 'https://www.arcgis.com/home/item.html?id=' + (oak ? '4eb0bf9a2bb340dbbba2c80bd53d05dc' : 'ffebf574a0e94f0cb53a59e66c9080ec') }; }
  return null;
}
async function lyrIndex() {
  if (LYR.idx) return LYR.idx;
  if (!LYR.idxP) LYR.idxP = getJson('layers/index.json', 10000).then((j) => (LYR.idx = j)).catch(() => { LYR.idxP = null; return null; });
  return LYR.idxP;
}
// block index (one small file per 5° square that has anything), used for tile existence and cluster counts
function lyrBlkKeys(s, w, n, e) {
  const B = LYR.idx.block || 5, out = [];
  for (let a = Math.floor(s / B) * B; a <= n; a += B) for (let o = Math.floor(w / B) * B; o <= e; o += B) { const k = a + '_' + o; if (LYR.idx.blocks[k]) out.push(k); }
  return out;
}
async function lyrBlocks(s, w, n, e) {
  const idx = await lyrIndex(); if (!idx || !idx.blocks) return [];
  const keys = lyrBlkKeys(s, w, n, e);
  if (keys.length > 40) return keys.filter((k) => LYR.blk.has(k));
  await Promise.all(keys.filter((k) => !LYR.blk.has(k)).map((k) => {
    if (!LYR.blkLoading.has(k)) LYR.blkLoading.set(k, getJson('layers/i/' + k + '.json?v=' + idx.v, 15000).then((j) => { LYR.blk.set(k, j.t || {}); }).catch(() => {}).finally(() => LYR.blkLoading.delete(k)));
    return LYR.blkLoading.get(k);
  }));
  return keys.filter((k) => LYR.blk.has(k));
}
function lyrTileExists(k) {
  const B = LYR.idx.block || 5, [a, o] = k.split('_').map(Number);
  const t = LYR.blk.get(Math.floor(a / B) * B + '_' + Math.floor(o / B) * B);
  return !!(t && t[k]);
}
// keep memory bounded while browsing the whole country: forget tiles far from the view and from GPS
function lyrEvict() {
  if (LYR.items.size < 60000) return;
  const c = map.getCenter();
  for (const [k, ids] of LYR.tiles) {
    const [a, o] = k.split('_').map(Number);
    const far = (p) => Math.abs(a - p[0]) > 1.5 || Math.abs(o - p[1]) > 2;
    if (far([c.lat, c.lng]) && (!me || far(me))) { for (const id of ids) LYR.items.delete(id); LYR.tiles.delete(k); }
  }
}
async function lyrLoad(s, w, n, e) {
  const idx = await lyrIndex(); if (!idx) return;
  await lyrBlocks(s, w, n, e);
  const T = idx.tile || 0.25, jobs = [];
  for (let a = Math.floor(s / T) * T; a <= n; a += T) for (let o = Math.floor(w / T) * T; o <= e; o += T) {
    const k = a.toFixed(2) + '_' + o.toFixed(2);
    if (LYR.tiles.has(k) || !lyrTileExists(k)) continue;
    if (jobs.length >= 48) break;     // never a whole region at once
    if (!LYR.loading.has(k)) LYR.loading.set(k, getJson('layers/t/' + k + '.json?v=' + idx.v, 15000).then((j) => {
      const ids = [];
      for (const r of j.f || []) {
        const srcs = String(r[5]).split('|');
        const id = 'L:' + srcs[0];
        LYR.items.set(id, { id, lyr: true, t: r[3], kind: lyrKind(r[3]), name: r[2], lat: r[0], lon: r[1], r: r[4], rad: r[6] || 0, srcs, place: (j.p || [])[r[7]] || '', fl: r[8] || 0 });
        ids.push(id);
      }
      LYR.tiles.set(k, ids);
    }).catch(() => { /* offline and not cached: try again later */ }).finally(() => LYR.loading.delete(k)));
    jobs.push(LYR.loading.get(k));
  }
  if (jobs.length) { await Promise.all(jobs); lyrEvict(); lyrDraw(); }
}
function lyrNear(pt) { const d = 0.05; return lyrLoad(pt[0] - d, pt[1] - d * 1.4, pt[0] + d, pt[1] + d * 1.4).catch(() => {}); }
function lyrOn(x) { return !!S.show[x.kind] && prefAreaOk(x); }
function lyrIcon(x) {
  const big = x.r >= 2, tp = TDP(), sh = tp && tp.pinHtml(x);
  if (sh) return L.divIcon({ className: '', html: sh, iconSize: [30, 30], iconAnchor: [15, 15] });
  const un = tp ? tp.pinClass(x) : '';
  if (x.t === 'C' && (x.fl & 3)) return L.divIcon({ className: '', html: '<div class="lyr cem hist' + (big ? '' : ' sm') + un + '" title="' + ((x.fl & 1) ? 'Historical cemetery record' : 'Cemetery, approximate spot') + '">' + STONE_H + '</div>', iconSize: [14, 17], iconAnchor: [7, 16] });
  return x.t === 'C'
    ? L.divIcon({ className: '', html: '<div class="lyr cem' + (big ? '' : ' sm') + un + '" title="Cemetery">' + STONE + '</div>', iconSize: [14, 17], iconAnchor: [7, 16] })
    : L.divIcon({ className: '', html: '<div class="lyr hm' + (big ? '' : ' sm') + un + '" title="Historical marker">' + PLAQUE + '</div>', iconSize: [16, 20], iconAnchor: [8, 19] });
}
// zoomed out: count bubbles (per tile at z9-10, ~1° at z7-8, ~2.5° at z5-6, per 5° block below that)
function lyrCount(v) { return (S.show.hmark ? v[0] : 0) + (S.show.cem ? v[1] : 0); }
function lyrClusters(z) {
  if (!LYR.idx || !LYR.idx.blocks || !(S.show.hmark || S.show.cem)) return;
  const b = map.getBounds().pad(0.2), cells = new Map();
  const add = (key, la, lo, n) => { if (!n) return; const c = cells.get(key) || [0, 0, 0]; c[0] += n; c[1] += la * n; c[2] += lo * n; cells.set(key, c); };
  if (z < 5) {
    for (const [k, v] of Object.entries(LYR.idx.blocks)) if (b.contains([v[2], v[3]])) add(k, v[2], v[3], lyrCount(v));
  } else {
    const C = z >= 9 ? 0.25 : z >= 7 ? 1 : 2.5;
    const keys = lyrBlkKeys(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    for (const bk of keys) {
      const t = LYR.blk.get(bk);
      if (!t) { const v = LYR.idx.blocks[bk]; add('B' + bk, v[2], v[3], lyrCount(v)); continue; }
      for (const [k, v] of Object.entries(t)) { if (!b.contains([v[2], v[3]])) continue; const [a, o] = k.split('_').map(Number); add(Math.floor(a / C) + '_' + Math.floor(o / C), v[2], v[3], lyrCount(v)); }
    }
  }
  for (const [, c] of cells) {
    const n = c[0], la = c[1] / n, lo = c[2] / n, d = Math.round(Math.min(56, 24 + Math.log10(n) * 9));
    const txt = n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
    const m = L.marker([la, lo], { icon: L.divIcon({ className: '', html: '<div class="lyr-cl" style="width:' + d + 'px;height:' + d + 'px">' + txt + '</div>', iconSize: [d, d], iconAnchor: [d / 2, d / 2] }), keyboard: false, zIndexOffset: -900, title: n + ' markers and cemeteries here: tap to zoom in' });
    m.on('click', () => map.setView([la, lo], Math.min(11, z + (z < 5 ? 3 : 2))));
    lyrLayer.addLayer(m);
  }
}
function lyrDraw() {
  lyrLayer.clearLayers();
  const z = map.getZoom(); if (z < 11) { lyrClusters(z); return; }
  const b = map.getBounds().pad(0.15); let n = 0;
  for (const x of LYR.items.values()) {
    if (!lyrOn(x) || !b.contains([x.lat, x.lon])) continue;
    if (z < 13 && x.r < 2) continue;          // zoomed out: only the bigger / official ones
    if (z < 14 && (x.r < 1 || (x.fl & 4))) continue;   // unnamed cemeteries and small family / pioneer plots only when close in
    if (++n > 600) break;
    const m = L.marker([x.lat, x.lon], { icon: lyrIcon(x), keyboard: false, zIndexOffset: -800, title: x.name });
    m.on('click', () => showLyr(x.id)); lyrLayer.addLayer(m);
  }
}
let lyrAttrOn = false;
function lyrAttr() {
  const want = S.show.hmark || S.show.cem, t = 'Markers: NPS, Michigan History Center, Texas Historical Commission, MDOT SHA, Montana DOT, Vermont DHP · Cemeteries: USGS, Oakland &amp; Barry Co.';
  if (want && !lyrAttrOn) map.attributionControl.addAttribution(t); else if (!want && lyrAttrOn) map.attributionControl.removeAttribution(t);
  lyrAttrOn = want;
}
// browse anywhere: the view's own tiles load wherever the map is (alerts still use the real GPS spot)
function lyrRefresh() {
  const z = map.getZoom(), b = map.getBounds();
  if (S.show.hmark || S.show.cem) {
    if (z >= 10) lyrLoad(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()).catch(() => {});
    else if (z >= 5) lyrIndex().then((i) => i && lyrBlocks(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())).then(() => { if (map.getZoom() < 11) lyrDraw(); }).catch(() => {});
    else lyrIndex().then(() => { if (map.getZoom() < 5) lyrDraw(); });
  }
  lyrDraw();
}
map.on('moveend', lyrRefresh);
// distance to the edge of a cemetery (inner radius), not its middle
function lyrDist(o, x) { return Math.max(0, hav(o[0], o[1], x.lat, x.lon) - (x.rad || 0) / 1609.34); }
function lyrAround(lat, lon, mi) {
  const out = [];
  for (const x of LYR.items.values()) { if (!lyrOn(x) || Math.abs(x.lat - lat) > 0.1 || Math.abs(x.lon - lon) > 0.14) continue; const d = lyrDist([lat, lon], x); if (d <= mi) out.push({ p: x, d, b: bearing(lat, lon, x.lat, x.lon) }); }
  return out.sort((a, b) => a.d - b.d);
}
// Alerts: quieter than the Twisted Deeds pins. Named places only; official markers, National Register
// sites and museums within ½ mi (or your radius if smaller), plaques and boards within ¼ mi, big or
// notable cemeteries within ½ mi, other named cemeteries within 0.2 mi. One at a time, never ahead of a
// listing or Archive place, at least 45 s apart and 0.3 mi of travel apart (or 3 min), spoken at most
// once every 90 s.
let lyrLast = sess.get('td-live-lyr-last', null), lyrSpoke = 0;
function lyrCap(x) { return x.t === 'C' ? (x.r >= 2 ? 0.5 : 0.2) : (LPRI[x.t] === 0 ? 0.5 : 0.25); }
function lyrCheck() {
  if (!me || (meAcc && meAcc > 500) || !(S.show.hmark || S.show.cem)) return;
  if (queue.length || showing) return;     // something more important (or another marker) is on screen
  const now = Date.now();
  if (lyrLast) { const gap = now - lyrLast.ts, moved = hav(me[0], me[1], lyrLast.lat, lyrLast.lon); if (gap < 45000 || (moved < 0.3 && gap < 180000)) return; }
  const c = lyrAround(me[0], me[1], 0.5).filter((x) => x.p.r >= 1 && !alerted.has(x.p.id) && x.d <= Math.min(S.radius, lyrCap(x.p)));
  if (!c.length) return;
  c.sort((a, b) => (LPRI[a.p.t] + (a.p.t === 'C' && a.p.r < 2 ? 1 : 0)) - (LPRI[b.p.t] + (b.p.t === 'C' && b.p.r < 2 ? 1 : 0)) || a.d - b.d);
  const x = c[0];
  alerted.add(x.p.id); sess.set('td-live-alerted', [...alerted]);
  lyrLast = { ts: now, lat: me[0], lon: me[1] }; sess.set('td-live-lyr-last', lyrLast);
  queue.push(x.p.id);
  try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { /* ignore */ }
  if (speakOn() && now - lyrSpoke >= 90000) { lyrSpoke = now; const dir = sayDir(x.b); say(LSAY[x.p.t] + ' ' + (dir ? dir + ', ' : 'nearby, ') + sayDist(x.d) + '. ' + x.p.name + '.' + lyrCaveat(x.p, ' '), 0, { id: x.p.id, prio: 2 }); }
}
function lyrCaveat(p, pre) { return p.t !== 'C' ? '' : (p.fl & 1) ? pre + HIST_LINE : (p.fl & 2) ? pre + APPROX_LINE : ''; }
function lyrTag(x) { return '<span class="tag lyr-' + x.kind + (x.t === 'C' && (x.fl & 3) ? ' hist' : '') + '">' + esc(x.t === 'C' && (x.fl & 1) ? 'Historical cemetery' : x.t === 'C' && (x.fl & 2) ? 'Cemetery (approx.)' : (LTYPE[x.t] || 'Marker')) + '</span>'; }
function renderLyrAlert(el, p) {
  const o = me || origin(); const d = lyrDist(o, p), b = compass(bearing(o[0], o[1], p.lat, p.lon));
  el.hidden = false;
  const compact = !$('#sheet').hidden; el.classList.toggle('compact', compact); $('#stage').classList.toggle('has-alert', compact);
  el.innerHTML = '<div class="a-top"><span class="a-near">NEARBY</span>' + lyrTag(p) + '<button class="x" id="a-x" aria-label="Dismiss">×</button></div>'
    + '<div class="a-name">' + esc(p.name) + '</div><div class="a-dist">' + esc(d === 0 ? 'You are here' : fmtDist(d) + ' ' + b) + '</div>'
    + (lyrCaveat(p, '') ? '<div class="a-hist">' + esc(lyrCaveat(p, '')) + '</div>' : '')
    + '<div class="a-btns"><a class="btn p g" target="_blank" rel="noopener" href="' + dirUrl(p) + '">Directions</a><button class="btn g" id="a-d">Details</button></div>'
    + (queue.length ? '<div class="a-more">+' + queue.length + ' more nearby</div>' : '');
  $('#a-x').onclick = (e) => { e.stopPropagation(); nextAlert(); };
  el.onclick = () => { if (el.classList.contains('compact')) closeSheet(); };
  $('#a-d').onclick = (e) => { e.stopPropagation(); showing = null; $('#alert').hidden = true; showLyr(p.id); };
}
// Card details (photo, marker text, facts, burials) live in small files per 0.1-degree cell (layers/e/), keyed by the
// place's first source id, listed in layers/e/index.json. Fetched on the first tap only, then kept for the session.
LYR.enr = new Map();
async function lyrEnrIndex() {
  if (!LYR.eidxP) LYR.eidxP = getJson('layers/e/index.json', 10000).then((j) => (j.cells = new Set(j.cells || []), j)).catch(() => { LYR.eidxP = null; return null; });
  return LYR.eidxP;
}
async function lyrEnrich(p) {
  const ix = await lyrEnrIndex(); if (!ix) return null;
  const C = ix.cell || 0.1, k = (Math.floor(p.lat / C + 1e-9) * C).toFixed(1) + '_' + (Math.floor(p.lon / C + 1e-9) * C).toFixed(1);
  if (!ix.cells.has(k)) return null;
  if (!LYR.enr.has(k)) LYR.enr.set(k, getJson('layers/e/' + k + '.json?v=' + ix.v, 15000).then((j) => j.e || {}).catch(() => { LYR.enr.delete(k); return null; }));
  const e = await LYR.enr.get(k); if (!e) return null;
  for (const s of p.srcs) if (e[s]) return e[s];
  return {};
}
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : '');
const linkUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '');
function lyrCard(p, e) {
  const o = me; let h = '';
  const ph = e && e.ph && safeUrl(e.ph.u) ? e.ph : null;
  if (ph) h += '<figure class="ly-hero"><a href="' + esc(safeUrl(ph.l) || safeUrl(ph.u)) + '" target="_blank" rel="noopener"><img src="' + esc(ph.u) + '" alt="' + esc(ph.alt || p.name) + '" decoding="async" referrerpolicy="no-referrer" onerror="this.closest(\'figure\').remove()"></a>'
    + '<figcaption>' + esc(/^photo/i.test(ph.a) ? ph.a : 'Photo: ' + ph.a) + ' · ' + (safeUrl(ph.licu) ? '<a href="' + esc(ph.licu) + '" target="_blank" rel="noopener">' + esc(ph.lic) + '</a>' : esc(ph.lic)) + ' · <a href="' + esc(safeUrl(ph.l) || safeUrl(ph.u)) + '" target="_blank" rel="noopener">' + esc(ph.src) + '</a></figcaption></figure>';
  h += '<div class="ly-head"><div>' + lyrTag(p) + '</div><div class="addr">' + esc(p.name) + '</div>';
  if (o) h += '<div class="ly-dist">' + esc(fmtDist(lyrDist(o, p)) + ' ' + compass(bearing(o[0], o[1], p.lat, p.lon))) + ' from you</div>';
  if (e && e.d) h += '<div class="ly-desc">' + esc(e.d.charAt(0).toUpperCase() + e.d.slice(1)) + '</div>';
  h += '</div>';
  if (e && e.ins) {
    h += '<div class="ly-story"><div class="ly-k">Marker text</div>';
    e.ins.forEach((x, i) => { if (x[0] && (x[0] !== p.name || i > 0)) h += '<div class="ly-st">' + esc(x[0]) + '</div>'; h += '<p>' + esc(x[1]) + '</p>'; });
    h += '<div class="ly-cite">Text of the state marker, from the Michigan History Center’s open marker records (public record).</div></div>';
  } else if (e && e.wx) {
    h += '<div class="ly-story"><p>' + esc(e.wx[0]) + '</p><div class="ly-cite">From <a href="' + esc(safeUrl(e.wx[1])) + '" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA 4.0.</div></div>';
  }
  const facts = (e && e.f ? e.f.slice() : []);
  if (e && e.hrs) facts.push(['Hours', e.hrs]);
  if (facts.length) h += '<div class="ly-facts">' + facts.map((f) => '<div class="ly-fact' + (String(f[1]).length > 26 ? ' w' : '') + '"><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>').join('') + '</div>';
  if (e && e.bu && e.bu.length) h += '<h4>Notable burials</h4><ul class="ly-bur">' + e.bu.map((b) => '<li><b>' + esc(b[0]) + '</b>' + (b[1] ? ' <span class="muted">' + esc(b[1]) + '</span>' : '') + '</li>').join('') + '</ul>'
    + (e.bn > e.bu.length ? '<p class="note">' + e.bn + ' people with a Wikidata record are buried here.</p>' : '');
  if (p.t !== 'C' && p.place) h += '<p class="muted" style="margin-top:2px">' + esc(p.place) + '</p>';
  if (p.t === 'N') h += '<p class="note">' + (e && e.pv === 0 ? 'Listed on the National Register of Historic Places.' : 'Listed on the National Register of Historic Places. Many are private homes: please view from the road.') + '</p>';
  if (p.t === 'C') {
    if (p.place) h += '<p class="muted" style="margin-top:2px">' + esc(p.place) + '</p>';
    if (p.fl & 1) h += '<p class="note hist">' + HIST_LINE + ' It is listed in the records but may be gone, moved or hard to see today.</p>';
    if (p.fl & 2) h += '<p class="note hist">' + APPROX_LINE + ' The record gives only a suspected spot.</p>';
    if (p.fl & 4) h += '<p class="note">A small family or pioneer burial ground. Many are on private land: please view from the road.</p>';
    h += '<p class="note">Please respect posted hours and visitors.</p>';
  }
  h += '<div class="row"><a class="btn p g" target="_blank" rel="noopener" href="' + dirUrl(p) + '">Directions</a><button class="btn g" id="ly-here">What’s here?</button></div><div class="row ly-links">';
  (e && e.lk ? e.lk : []).forEach((l) => { if (linkUrl(l[1])) h += '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(l[1]) + '">' + esc(l[0]) + '</a>'; });
  p.srcs.map((c) => lyrSrc(c, p.srcs)).filter(Boolean).forEach((s) => { h += '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(s.url) + '">' + esc(s.label) + '</a>'; });
  const fag = p.t === 'C' ? fagUrl(p) : '';
  if (fag) h += '</div><div class="row"><a class="btn sm g" id="ly-fag" target="_blank" rel="noopener" href="' + esc(fag) + '">Look it up on Find a Grave</a>';
  h += '</div>' + (fag ? '<p class="note">Opens a Find a Grave search for “' + esc(fagName(p.name)) + '” in ' + esc(fagWhere(p)) + '. Find a Grave is a separate site; nothing is copied from it.</p>' : '');
  const cr = ['Map data: OpenStreetMap contributors (ODbL)'];
  if (p.t === 'C') cr.push('cemeteries also from USGS GNIS and The National Map (public domain) and Oakland and Barry County MI open data');
  if (p.srcs.some((x) => x.startsWith('m:'))) cr.push('Michigan Historical Markers, Michigan History Center / DNR (public record)');
  if (p.srcs.some((x) => x.startsWith('n:'))) cr.push('National Register of Historic Places, National Park Service (public domain)');
  if (p.srcs.some((x) => x.startsWith('x:tx'))) cr.push('marker data courtesy of the Texas Historical Commission');
  if (p.srcs.some((x) => /^x:(md|mt|vt)/.test(x))) cr.push('state roadside marker lists: Maryland MDOT SHA, Montana DOT, Vermont Division for Historic Preservation (provided as is)');
  if (e && (e.d || (e.lk || []).some((l) => l[0] === 'Wikidata') || e.bu)) cr.push('Wikidata (CC0)');
  if (ph && ph.src === 'Wikimedia Commons') cr.push('Photo: Wikimedia Commons, ' + ph.lic);
  if (e && e.wx) cr.push('Wikipedia (CC BY-SA 4.0)');
  h += '<p class="note ly-credits">Sources: ' + esc(cr.join(' · ')) + '.</p>';
  if (e === undefined) h += '<p class="note" id="ly-wait">Loading photo and details…</p>';
  return h;
}
function showLyr(id) {
  const p = LYR.items.get(id); if (!p) return;
  const paint = (e) => {
    openSheet('details', 'Details', lyrCard(p, e)); TDP() && TDP().details(p, $('#sh-body'));
    $('#ly-here').onclick = () => whatsHere([p.lat, p.lon], p.name);
  };
  paint(undefined);
  lyrEnrich(p).then((e) => { if ($('#sheet').dataset.kind === 'details' && $('#sh-body .addr') && $('#sh-body .addr').textContent === p.name) paint(e || null); });
}
// Find a Grave link-out (never copied): its own cemetery search, by name within the state (or Canada)
function fagName(n) { return String(n || '').replace(/\s*\/.*$/, '').replace(/\(.*?\)/g, '').replace(/\b(cemetery|cemetary|graveyard)\b/ig, '').replace(/\s+/g, ' ').trim(); }
function fagSt(p) { const a = String(p.place || '').split(', '); return a[a.length - 1] === 'Canada' ? a[a.length - 2] : a[a.length - 1]; }
function fagWhere(p) { const st = fagSt(p); return ST_NAME[st] || st || ''; }
function fagUrl(p) {
  const n = fagName(p.name), loc = FAG_LOC[fagSt(p)];
  if (!n || p.r < 1 || !loc) return '';
  return 'https://www.findagrave.com/cemetery/search?cemetery-name=' + encodeURIComponent(n) + '&locationId=' + loc;
}
function lyrNearbyHtml() {
  if (!(S.show.hmark || S.show.cem)) return '';
  const o = origin(); const list = lyrAround(o[0], o[1], 3).filter((x) => x.p.r >= 1).slice(0, 15);
  if (!list.length) return '';
  return '<h4 style="margin:14px 0 6px">Markers and cemeteries</h4>' + list.map((x) => '<div class="item"><div>' + lyrTag(x.p) + '</div><div class="t">' + esc(x.p.name) + '</div><div class="m"><span class="dist">' + esc(fmtDist(x.d)) + ' ' + compass(x.b) + '</span></div>'
    + '<div class="it-act"><a class="btn p sm g" target="_blank" rel="noopener" href="' + dirUrl(x.p) + '">Directions</a><button class="btn sm g" data-det="' + esc(x.p.id) + '">Details</button><button class="btn sm" data-see="' + esc(x.p.id) + '">Map</button></div></div>').join('');
}
lyrAttr();
// ---------- Find a place: town, county, state or ZIP (US + Canada) via OpenStreetMap Nominatim, at most one
// request every 1.1 s, results cached for the session. Browsing does not move the GPS spot or its alerts.
const FIND = { last: 0, busy: false };
async function findPlace(q) {
  q = String(q || '').trim(); if (!q || FIND.busy) return null;
  const key = 'td-find:' + q.toLowerCase(); const hit = sess.get(key, null); if (hit) return hit;
  const wait = FIND.last + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  FIND.busy = true; FIND.last = Date.now();
  try {
    const zip = /^\d{5}(-\d{4})?$/.test(q);
    const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&countrycodes=' + (zip ? 'us&postalcode=' + encodeURIComponent(q.slice(0, 5)) : 'us,ca&q=' + encodeURIComponent(q));
    const j = await getJson(u, 10000);
    const r = j && j[0]; if (!r) return { none: true };
    const out = { name: r.display_name, lat: +r.lat, lon: +r.lon, bb: (r.boundingbox || []).map(Number), town: zip || /^(city|town|village|hamlet|suburb|neighbourhood|quarter|postcode|municipality|locality)$/.test(r.addresstype || r.type || '') };
    sess.set(key, out); return out;
  } catch (e) { return { err: true }; } finally { FIND.busy = false; FIND.last = Date.now(); }
}
function findGo(r) {
  follow = false; if (running) $('#recenter').hidden = false;
  if (r.town) map.setView([r.lat, r.lon], 13);     // a town or ZIP: close enough to see its pins
  else if (r.bb && r.bb.length === 4 && r.bb.every(isFinite)) {
    map.fitBounds([[r.bb[0], r.bb[2]], [r.bb[1], r.bb[3]]], { maxZoom: 14, padding: [10, 10] });
  } else map.setView([r.lat, r.lon], 13);
  toast('Showing ' + r.name.split(', ').slice(0, 3).join(', '), 3500);
}
$('#findbtn').onclick = () => { const f = $('#find'); f.hidden = !f.hidden; if (!f.hidden) $('#find-q').focus(); };
$('#find-x').onclick = () => { $('#find').hidden = true; };
$('#find').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#find-q').value, st = $('#find-st'); st.textContent = 'Searching…';
  const r = await findPlace(q);
  if (!r) { st.textContent = ''; return; }
  if (r.none) { st.textContent = 'No place found for “' + q + '”.'; return; }
  if (r.err) { st.textContent = 'Search is not reachable right now.'; return; }
  st.textContent = ''; $('#find').hidden = true; $('#find-q').blur(); findGo(r);
};

// ---------- nearby + alerts
let alerted = new Set(sess.get('td-live-alerted', []));
let queue = [], showing = null;
function origin() { return me || (function () { const c = map.getCenter(); return [c.lat, c.lng]; })(); }
function nearbyList() {
  const o = origin();
  return PINS.filter(visible).map((p) => ({ p, d: hav(o[0], o[1], p.lat, p.lon), b: bearing(o[0], o[1], p.lat, p.lon) })).sort((a, b) => a.d - b.d);
}
function inAlertRange(x, lat, lon, radiusMi) { return isPriv(x.p) ? inPrivArea(lat, lon, x.p) : x.d <= radiusMi; }
function distText(x, lat, lon) { return (lat != null && isPriv(x.p) && inPrivArea(lat, lon, x.p)) ? 'in this area' : (fmtDist(x.d) + ' ' + compass(x.b)); }
function refreshNearby() {
  const n = me ? nearbyList().filter((x) => inAlertRange(x, me[0], me[1], S.radius) && !inactive(x.p)).length : 0;
  $('#ncount').textContent = n;
  if ($('#sheet').dataset.kind === 'nearby') renderNearby();
}
function checkAlerts() {
  if (!me || (meAcc && meAcc > 500)) return;
  const fresh = nearbyList().filter((x) => inAlertRange(x, me[0], me[1], S.radius) && alertable(x.p) && !alerted.has(x.p.id));
  for (const x of fresh) { alerted.add(x.p.id); queue.push(x.p.id); }
  if (fresh.length) {
    sess.set('td-live-alerted', [...alerted]); buzz(); speakAlerts(fresh);
    // Twisted Deeds listings and Archive places always go ahead of markers and cemeteries
    queue = queue.filter((id) => !isLyr(id)).concat(queue.filter(isLyr));
    if (showing && isLyr(showing)) { showing = null; }
  }
  if (!fresh.length) lyrCheck();
  if (!showing && queue.length) nextAlert();
  else if (showing) renderAlert();
}
function nextAlert() {
  showing = queue.shift() || null;
  if (!showing) { $('#alert').hidden = true; $('#stage').classList.remove('has-alert'); return; }
  renderAlert(); lantern();
}
function renderAlert() {
  const el = $('#alert'); const p = findAny(showing);
  if (!p) { nextAlert(); return; }
  if (p.lyr) { renderLyrAlert(el, p); return; }
  const o = me || origin(); const d = hav(o[0], o[1], p.lat, p.lon), b = compass(bearing(o[0], o[1], p.lat, p.lon));
  const dLab = (me && inPrivArea(me[0], me[1], p)) ? 'in this area' : (fmtDist(d) + ' ' + b);
  el.hidden = false;
  const compact = !$('#sheet').hidden; el.classList.toggle('compact', compact); $('#stage').classList.toggle('has-alert', compact);
  el.innerHTML = '<div class="a-top"><span class="a-near">NEARBY</span><span class="tag ' + p.cat + '">' + esc(CATS[p.cat]) + '</span><button class="x" id="a-x" aria-label="Dismiss">×</button></div>'
    + '<div class="a-name">' + esc(p.name) + '</div><div class="a-dist">' + esc(dLab) + '</div>'
    + '<div class="a-sub">' + esc(locLabel(p)) + (inactive(p) ? ' · not currently listed' : '') + (isPriv(p) ? ' · private home, area only' : '') + '</div>'
    + (p.hook ? '<p class="a-hook">' + esc(p.hook) + '</p>' : '')
    + '<div class="a-btns">' + dirBtn(p) + '<button class="btn g" id="a-d">Details</button></div>'
    + (queue.length ? '<div class="a-more">+' + queue.length + ' more nearby</div>' : '');
  $('#a-x').onclick = (e) => { e.stopPropagation(); nextAlert(); };
  el.onclick = () => { if (el.classList.contains('compact')) closeSheet(); };
  $('#a-d').onclick = (e) => { e.stopPropagation(); showing = null; $('#alert').hidden = true; showDetails(p.id); };
}
let actx = null;
function chime() {
  if (!S.chime) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    // soft hand bell: two strikes (same timing as before), each a fundamental + inharmonic bell partials
    [660, 880].forEach((f, i) => { const t0 = t + i * 0.18;
      [[1, 0.32, 1.1], [2.01, 0.12, 0.7], [2.76, 0.07, 0.45], [4.07, 0.03, 0.3]].forEach(([m, a, d]) => {
        const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f * m; o.type = 'sine'; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.start(t0); o.stop(t0 + d + 0.05); }); });
  } catch (e) { /* no audio */ }
}
// ---------- Speak alerts (optional, off by default; browser speechSynthesis, nothing leaves the phone)
const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
function sayDist(mi) {
  if (mi < 0.1) return Math.max(50, Math.round(mi * 5280 / 50) * 50) + ' feet';
  if (mi < 1.6) { const q = Math.max(1, Math.round(mi * 4)); return ({ 1: 'a quarter mile', 2: 'half a mile', 3: 'three quarters of a mile', 4: 'a mile', 5: 'a mile and a quarter', 6: 'a mile and a half' })[q] || mi.toFixed(1) + ' miles'; }
  return (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' miles';
}
function sayDir(b) {
  if (meHead == null) return '';
  const r = (b - meHead + 360) % 360;
  return r < 45 || r >= 315 ? 'ahead' : r < 135 ? 'on the right' : r < 225 ? 'behind you' : 'on the left';
}
function speakLine(x) {
  const dir = sayDir(x.b);
  return CATS[x.p.cat] + ' ' + (dir ? dir + ', ' : 'nearby, ') + sayDist(x.d) + '. ' + (x.p.name || '') + '.';
}
// Driving mode (live/drive.js) takes over speech when it is on: its own queue, priority and privacy-safe wording.
const DRV = () => (window.TDDrive && window.TDDrive.on()) ? window.TDDrive : null;
const speakOn = () => S.speak || !!DRV();
function say(text, delay, ctx) {
  const dv = DRV(); if (dv) { if (ctx) dv.alert(ctx); return; }
  if (!S.speak || !canSpeak) return;
  setTimeout(() => { if (!S.speak) return; try { const u = new SpeechSynthesisUtterance(text); u.rate = 1; u.pitch = 1; u.volume = 1; u.lang = 'en-US'; speechSynthesis.speak(u); } catch (e) { /* ignore */ } }, delay || 0);
}
function speakAlerts(fresh) { if (!speakOn()) return; fresh.forEach((x, i) => say(speakLine(x), (S.chime ? 700 : 0) + i * 50, { id: x.p.id, prio: 0 })); }
function paintSpeak() { const b = $('#speak'); if (!b) return; b.hidden = !canSpeak; b.textContent = 'Speak: ' + (S.speak ? 'on' : 'off'); b.setAttribute('aria-pressed', S.speak); }
function buzz() { try { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); } catch (e) { /* ignore */ } chime(); }

// ---------- location
function setGps(txt, cls) { const g = $('#gps'); g.textContent = txt; g.className = 'gps ' + (cls || 'off'); }
function toast(t, ms) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 4000); }
function onFix(pos) {
  gpsErr = 0; me = [pos.coords.latitude, pos.coords.longitude]; meAcc = pos.coords.accuracy || 0; meTs = Date.now();
  meHead = (pos.coords.heading != null && !isNaN(pos.coords.heading) && (pos.coords.speed == null || pos.coords.speed > 0.5)) ? pos.coords.heading : null;
  const first = !meMarker;
  if (first) {
    meMarker = L.marker(me, { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 2000, interactive: false }).addTo(map);
    meCircle = L.circle(me, { radius: meAcc, color: '#2b8cff', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map);
  } else { meMarker.setLatLng(me); meCircle.setLatLng(me).setRadius(meAcc); }
  setGps('GPS ±' + Math.round(meAcc) + ' m', meAcc > 100 ? 'warn' : 'on');
  try { localStorage.setItem('td_live_last', JSON.stringify([+me[0].toFixed(2), +me[1].toFixed(2)])); } catch (e) {}
  if (first) map.setView(me, Math.max(map.getZoom(), 15)); else if (follow) map.panTo(me, { animate: true });
  lyrNear(me).then(() => { checkAlerts(); refreshNearby(); }); checkAlerts(); markPassed(); refreshNearby();
  try { TDP() && TDP().onFix(pos); } catch (e) { console.warn('passport', e); }
  try { window.TDAncestors && window.TDAncestors.onFix(pos); } catch (e) { console.warn('ancestors', e); }
  try { window.TDTrails && window.TDTrails.onFix(pos); } catch (e) { console.warn('trails', e); }
  try { if (window.TDPrefs && window.TDPrefs.noteGps && window.TDPrefs.noteGps(me[0], me[1])) { toast('You\'re outside your usual area. Showing what\'s around you. You can switch back with Show more.', 5000); drawPins(); lyrRefresh(); } } catch (e) { /* */ }
}
function markPassed() {
  if (!me || (meAcc && meAcc > 500)) return;
  let changed = false;
  for (const id of alerted) {
    if (passed.has(id) || id === showing || queue.includes(id)) continue;
    const p = PINS.find((x) => x.id === id); if (!p) continue;
    if (hav(me[0], me[1], p.lat, p.lon) > S.radius * 1.25) { passed.add(id); changed = true; markers.get(id)?.setIcon(pinIcon(p)); }
  }
  if (changed) sess.set('td-live-passed', [...passed]);
}
// Brief lantern flicker around a new alert (a glow outside the card; the text never moves or dims).
function lantern() {
  const el = $('#alert'); if (calm()) return;
  el.classList.remove('lantern'); void el.offsetWidth; el.classList.add('lantern');
  clearTimeout(lantern.t); lantern.t = setTimeout(() => el.classList.remove('lantern'), 1400);
}
// GPS problems are always shown: the status pill says what is wrong (tap it to try again) and a toast says how to fix it.
let gpsErr = 0;
const GPS_MSG = {
  1: 'Location is blocked for this site. Turn it on in your browser or phone settings (Android Chrome: long-press the app icon › App info, or Chrome › Settings › Site settings › Location; iPhone: Settings › Privacy › Location Services), then tap GPS to try again.',
  2: 'Your phone isn’t giving a location. Check that Location is turned on in your phone settings (swipe down from the top, tap Location), then tap GPS to try again.',
  3: 'Still looking for GPS… check you are outdoors or near a window. Tap GPS to try again.',
};
function gpsMsg() { return GPS_MSG[gpsErr] || ''; }
function onErr(err) {
  gpsErr = err && err.code ? err.code : 2;
  const msg = GPS_MSG[gpsErr] || ('Location error' + (err && err.message ? ': ' + err.message : '') + '. Tap GPS to try again.');
  if (gpsErr === 1) { stop(); setGps('Location blocked · tap', 'err'); toast(msg, 12000); }
  else if (gpsErr === 2 && !me) { setGps('No location · tap', 'err'); toast(msg, 9000); }
  else { setGps(me ? 'GPS weak' : 'Searching…', 'warn'); if (!me) toast(msg, 6000); }
}
// Tapping the GPS pill (or the Driving card when it has no fix): turn GPS on, retry after an error, or recenter.
function gpsTap() {
  if (running && me && !gpsErr) { follow = true; $('#recenter').hidden = true; map.panTo(me, { animate: true }); return; }
  if (running) stop();
  start();
  try {
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'geolocation' }).then((st) => {
      if (st && st.state === 'denied') { gpsErr = 1; if (running) stop(); setGps('Location blocked · tap', 'err'); toast(GPS_MSG[1], 12000); }
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}
async function lockScreen() {
  try { if ('wakeLock' in navigator && running && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* not allowed */ }
}
function start() {
  if (!navigator.geolocation) { toast('This browser cannot share location.'); return; }
  if (running) return;
  running = true; follow = true; gpsErr = 0; $('#recenter').hidden = true;
  const b = $('#start'); b.textContent = '■ Stop'; b.classList.add('running'); setGps('Finding you…', 'warn');
  watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  lockScreen();
  if (S.chime) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* ignore */ } }
}
function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null; running = false;
  try { if (canSpeak) speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  const b = $('#start'); b.textContent = '▶ Start'; b.classList.remove('running');
  if (me) setGps('Stopped · tap', 'off'); else setGps('GPS off · tap', 'off');
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null;
  $('#recenter').hidden = true;
  TDP() && TDP().onStop(); try { window.TDAncestors && window.TDAncestors.onStop(); } catch (e) { /* ignore */ } try { window.TDTrails && window.TDTrails.onStop(); } catch (e) { /* ignore */ }
}
// Phones stop sending GPS to a web page that is off screen (screen locked, or another app such as Google Maps in front),
// so nothing can be stamped or announced then. Say so when the map comes back after a gap.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (running && !wakeLock) lockScreen();
  if (running && hiddenAt && Date.now() - hiddenAt > 60000) toast('GPS was paused while the map was off screen. Keep the Live map open on screen (phone in a mount) to collect stamps and alerts.', 7000);
  hiddenAt = 0;
});
$('#start').onclick = () => (running ? stop() : start());
$('#gps').onclick = gpsTap;
map.on('dragstart', () => { if (running && follow) { follow = false; $('#recenter').hidden = false; } });
$('#recenter').onclick = () => { follow = true; $('#recenter').hidden = true; if (me) map.setView(me, Math.max(map.getZoom(), 15)); };

// ---------- controls
const radEl = $('#rad-range'), radVal = $('#rad-val');
function paintRad() {
  if (!radEl) return;
  radEl.value = String(S.radius);
  radEl.style.setProperty('--rad-pct', ((S.radius - RAD_MIN) / (RAD_MAX - RAD_MIN) * 100) + '%');
  radEl.setAttribute('aria-valuenow', S.radius);
  radEl.setAttribute('aria-valuetext', S.radius === 1 ? '1 mile' : S.radius + ' miles');
  if (radVal) radVal.textContent = radLabel(S.radius);
}
function applyRad() { S.radius = clampRad(radEl && radEl.value); paintRad(); saveS(); checkAlerts(); refreshNearby(); }
if (radEl) { paintRad(); radEl.addEventListener('input', applyRad); }
document.querySelectorAll('.chip').forEach((b) => {
  const k = b.dataset.k; b.classList.toggle('on', !!S.show[k]); b.setAttribute('aria-pressed', !!S.show[k]);
  b.onclick = () => { S.show[k] = !S.show[k]; saveS(); b.classList.toggle('on', S.show[k]); b.setAttribute('aria-pressed', S.show[k]); if (k === 'hmark' || k === 'cem') { lyrRefresh(); lyrAttr(); refreshNearby(); toast((k === 'hmark' ? 'Historical markers' : 'Cemeteries') + (S.show[k] ? ' on' : ' off'), 1500); } else drawPins(); if (k === 'archive') window.dispatchEvent(new Event('td-arch-toggle')); checkAlerts(); };
});
$('#speak') && ($('#speak').onclick = () => {
  S.speak = !S.speak; saveS(); paintSpeak();
  try { if (canSpeak) { speechSynthesis.cancel(); if (S.speak) speechSynthesis.speak(new SpeechSynthesisUtterance('Alerts will be spoken.')); } } catch (e) { /* ignore */ }
});
paintSpeak();
function paintSound() { const b = $('#sound'); b.textContent = 'Chime: ' + (S.chime ? 'on' : 'off'); b.setAttribute('aria-pressed', S.chime); }
$('#sound').onclick = () => { S.chime = !S.chime; saveS(); paintSound(); if (S.chime) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* ignore */ } chime(); } };
paintSound();

// ---------- sheet
function openSheet(kind, title, html) { const s = $('#sheet'); s.hidden = false; if (showing) renderAlert(); s.dataset.kind = kind; $('#sh-title').textContent = title; $('#sh-body').innerHTML = html; $('#sh-body').scrollTop = 0; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').dataset.kind = ''; if (pickMode) endPick(); if (showing) renderAlert(); else $('#stage').classList.remove('has-alert'); }
$('#sh-close').onclick = closeSheet;
function tagHtml(p) { return '<span class="tag ' + p.cat + '">' + esc(CATS[p.cat]) + '</span>' + (inactive(p) ? ' <span class="tag off">Not currently listed</span>' : '') + (p.approx ? ' <span class="tag off">Area only</span>' : ''); }
function renderNearby() {
  const list = nearbyList().slice(0, 40);
  const o = me || origin();
  const inR = me ? list.filter((x) => inAlertRange(x, me[0], me[1], S.radius) && !inactive(x.p)).length : 0;
  const head = me ? '<p class="note">Sorted by distance from you. ' + inR + ' inside your alert radius (a private home alerts only inside its area circle).</p>' : '<p class="note">Tap <b>Start</b> to measure from your GPS. For now this is sorted from the middle of the map.</p>';
  const card = (x) => '<div class="item"><div>' + tagHtml(x.p) + '</div><div class="t">' + esc(x.p.name) + '</div><div class="m"><span class="dist">' + esc(distText(x, o[0], o[1])) + '</span> · ' + esc(locLabel(x.p)) + '</div>'
    + '<div class="it-act">' + dirBtn(x.p, 'p sm g') + '<button class="btn sm g" data-det="' + esc(x.p.id) + '">Details</button><button class="btn sm" data-see="' + esc(x.p.id) + '">Map</button></div></div>';
  // markers and cemeteries go after the listings within 3 mi, before the farther ones
  const cut = list.findIndex((x) => x.d > 3), k = cut < 0 ? list.length : cut;
  $('#sh-body').innerHTML = head + (list.length ? list.slice(0, k).map(card).join('') + lyrNearbyHtml() + list.slice(k).map(card).join('') : lyrNearbyHtml() || '<p>Nothing to show with these filters.</p>');
  bindItems();
}
function bindItems() {
  document.querySelectorAll('[data-det]').forEach((b) => { b.onclick = () => showDetails(b.dataset.det); });
  document.querySelectorAll('[data-see]').forEach((b) => { b.onclick = () => { const p = findAny(b.dataset.see); closeSheet(); follow = false; if (running) $('#recenter').hidden = false; map.setView([p.lat, p.lon], isPriv(p) ? 15 : 17); }; });
}
$('#nearby').onclick = () => { openSheet('nearby', 'Nearby', ''); renderNearby(); };
function showDetails(id) {
  if (isLyr(id)) { showLyr(id); return; }
  const p = PINS.find((x) => x.id === id); if (!p) return;
  let h = '<div>' + tagHtml(p) + '</div><div class="addr" style="margin-top:8px">' + esc(p.name) + '</div><p class="muted">' + esc(locLabel(p)) + '</p>';
  if (isPriv(p)) h += '<p class="note">A private home: shown as a neighborhood area about a quarter mile across, not an exact pin or street address.</p>';
  if (p.price) h += '<p><b>' + esc(p.price) + '</b></p>';
  h += '<p class="muted">Status: ' + esc(p.status) + '</p>';
  if (p.hook) h += '<p>' + esc(p.hook) + '</p>';
  if (p.photo) h += '<a href="' + esc(p.photo) + '" target="_blank" rel="noopener"><img class="photo" src="' + esc(p.photo) + '" alt="' + esc(p.photo_cap || 'Field photo') + '" loading="lazy"></a><p class="note">' + esc(p.photo_cap || 'Field photo') + '</p>';
  if (p.field) h += '<div class="fact"><b>Field note:</b> ' + esc(p.field) + '</div>';
  if (p.cat === 'lead' || p.cat === 'unverified') h += '<p class="note">Unverified: needs a second story source and a live listing check before it counts as a Twisted Deed or Strong Story.' + (p.conf ? ' Confidence: ' + esc(p.conf) + '.' : '') + '</p>';
  if (p.cat === 'context') h += '<p class="note">Context only: not for sale and not part of the archive.</p>';
  if (p.asof) h += '<p class="note">Checked ' + esc(p.asof) + '.</p>';
  h += '<div class="row">' + dirBtn(p);
  if (p.app) h += '<a class="btn g" href="../#/l/' + encodeURIComponent(p.id) + '">Open in app</a>';
  h += '</div><div class="row">';
  if (p.find && !isPriv(p) && p.addr) h += '<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent(p.addr + ' for sale') + '">Find listing</a>';
  (p.src || []).slice(0, 3).forEach((s, i) => { h += '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(s) + '">Source ' + (i + 1) + '</a>'; });
  h += '</div>';
  openSheet('details', 'Details', h); TDP() && TDP().details(p, $('#sh-body'));
}

// ---------- What's here?
let pickMode = false, pickPoint = null;
function endPick() { pickMode = false; $('#pickcancel').hidden = true; }
$('#pickcancel').onclick = () => { endPick(); };
map.on('click', (e) => { if (pickMode) { endPick(); whatsHere([e.latlng.lat, e.latlng.lng], 'a spot you tapped'); } });
map.on('contextmenu', (e) => { whatsHere([e.latlng.lat, e.latlng.lng], 'a spot you pressed on the map'); });
let hereBusy = false;
$('#here').onclick = () => {
  if (me && Date.now() - meTs < 30000) { whatsHere(me, 'your GPS position'); return; }
  if (!navigator.geolocation) { toast('This browser cannot share location. Use Pick a spot.'); return; }
  openSheet('here', 'What’s here?', '<p>Finding where you are…</p>');
  navigator.geolocation.getCurrentPosition((pos) => { onFixQuiet(pos); whatsHere([pos.coords.latitude, pos.coords.longitude], 'your GPS position'); },
    (err) => { openSheet('here', 'What’s here?', '<p>' + esc(err.code === 1 ? 'Location is blocked for this site. Allow it in settings, or pick a spot on the map instead.' : 'Could not get your position (' + err.message + ').') + '</p><div class="row"><button class="btn p g" id="pk">Pick a spot on the map</button></div>'); $('#pk').onclick = startPick; },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
};
function onFixQuiet(pos) { if (!running) { me = [pos.coords.latitude, pos.coords.longitude]; meAcc = pos.coords.accuracy || 0; meTs = Date.now(); } }
function startPick() { closeSheet(); pickMode = true; $('#pickcancel').hidden = false; }

let lastNom = 0; const nomCache = new Map();
async function nominatim(lat, lon) {
  const key = lat.toFixed(5) + ',' + lon.toFixed(5);
  if (nomCache.has(key)) return nomCache.get(key);
  const wait = Math.max(0, lastNom + 1100 - Date.now()); if (wait) await new Promise((r) => setTimeout(r, wait));
  lastNom = Date.now();
  const u = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&extratags=1&namedetails=1&accept-language=en&lat=' + lat + '&lon=' + lon;
  const j = await getJson(u, 12000); nomCache.set(key, j); return j;
}
async function wikiNear(lat, lon) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=' + lat + '%7C' + lon + '&ggsradius=500&ggslimit=6&prop=extracts%7Ccoordinates&exintro=1&explaintext=1&exsentences=3&exlimit=max&colimit=max';
  const j = await getJson(u, 12000);
  return Object.values((j.query && j.query.pages) || {}).map((pg) => {
    const c = pg.coordinates && pg.coordinates[0]; const d = c ? hav(lat, lon, c.lat, c.lon) * 1609.34 : null;
    return { title: pg.title, id: pg.pageid, text: (pg.extract || '').trim(), m: d };
  }).sort((a, b) => (a.m == null) - (b.m == null) || a.m - b.m).slice(0, 4);
}
async function wikidataNear(lat, lon) {
  const q = 'SELECT ?item ?itemLabel ?itemDescription ?inc ?nrhp ?dist WHERE { SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(' + lon + ' ' + lat + ')"^^geo:wktLiteral . bd:serviceParam wikibase:radius "0.25" . bd:serviceParam wikibase:distance ?dist . } OPTIONAL { ?item wdt:P571 ?inc } OPTIONAL { ?item wdt:P649 ?nrhp } FILTER(BOUND(?inc) || BOUND(?nrhp)) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY ?dist LIMIT 6';
  const j = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 15000);
  const seen = new Set();
  return j.results.bindings.map((b) => ({ qid: b.item.value.split('/').pop(), label: b.itemLabel && b.itemLabel.value, desc: b.itemDescription && b.itemDescription.value,
    inc: b.inc && (b.inc.value.match(/^-?\d{4}/) || [])[0], nrhp: b.nrhp && b.nrhp.value, m: +b.dist.value * 1000 }))
    .filter((x) => x.label && !/^Q\d+$/.test(x.label) && !seen.has(x.qid) && seen.add(x.qid));
}
function addrLine(j) {
  const a = j.address || {};
  const road = [a.house_number, a.road].filter(Boolean).join(' ');
  const city = a.city || a.town || a.village || a.hamlet || a.county || '';
  return [road, city, a.state && a.postcode ? a.state + ' ' + a.postcode : a.state].filter(Boolean).join(', ') || j.display_name || '';
}
let hereCtx = null;
async function whatsHere(pt, how) {
  if (hereBusy) return; hereBusy = true;
  const [lat, lon] = pt;
  openSheet('here', 'What’s here?', '<p>Looking up ' + esc(how) + '…</p><p class="note">Checking the address, our own files, Wikipedia and Wikidata.</p>');
  const own = PINS.map((p) => ({ p, m: hav(lat, lon, p.lat, p.lon) * 1609.34 })).filter((x) => isPriv(x.p) ? x.m <= (Number(x.p.radiusM) || 201.17) : (x.m <= 150 && !x.p.approx)).sort((a, b) => a.m - b.m);
  const [nom, wiki, wd] = await Promise.allSettled([nominatim(lat, lon), wikiNear(lat, lon), wikidataNear(lat, lon)]);
  hereBusy = false;
  const j = nom.status === 'fulfilled' ? nom.value : null;
  const address = j ? addrLine(j) : ('near ' + lat.toFixed(5) + ', ' + lon.toFixed(5));
  const bname = j && ((j.namedetails && j.namedetails.name) || j.name) || '';
  const ex = (j && j.extratags) || {};
  let facts = 0, h = '';
  h += '<div class="muted note">Looked up for ' + esc(how) + '</div><div class="addr">' + esc(bname || address) + '</div>' + (bname ? '<p class="muted">' + esc(address) + '</p>' : '');
  if (!j) h += '<p class="note">The address service did not answer, so only the coordinates are shown.</p>';
  // OSM tags
  const osm = [];
  if (ex.start_date) osm.push('Start date tagged on the map: ' + ex.start_date);
  if (ex.heritage || ex['heritage:operator'] || ex['nrhp:ref'] || ex['ref:nrhp']) osm.push('Marked as a heritage site' + (ex['ref:nrhp'] || ex['nrhp:ref'] ? ' (NRHP ref ' + (ex['ref:nrhp'] || ex['nrhp:ref']) + ')' : '') + ' on OpenStreetMap');
  if (ex.old_name) osm.push('Older name: ' + ex.old_name);
  if (ex.description) osm.push(ex.description);
  if (osm.length) {
    facts += osm.length; h += '<h4>Map tags</h4>';
    osm.forEach((t) => { h += '<div class="fact"><span class="badge">Reported (OpenStreetMap)</span>' + esc(t) + '<div class="src"><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/' + esc(j.osm_type) + '/' + esc(j.osm_id) + '">Source: OpenStreetMap</a></div></div>'; });
  }
  if (own.length) {
    facts += own.length; h += '<h4>In our files (within 150 m)</h4>';
    own.forEach((x) => { h += '<div class="item"><div>' + tagHtml(x.p) + '</div><div class="t">' + esc(x.p.name) + '</div><div class="m"><span class="dist">' + (isPriv(x.p) ? 'in this area' : (Math.round(x.m) + ' m')) + '</span> · ' + esc(locLabel(x.p)) + '</div><p style="margin:6px 0 0">' + esc(x.p.hook) + '</p><div class="it-act"><button class="btn sm g" data-det="' + esc(x.p.id) + '">Details</button></div></div>'; });
  }
  const lyrHere = lyrAround(lat, lon, 150 / 1609.34).slice(0, 6);
  if (lyrHere.length) {
    facts += lyrHere.length; h += '<h4>Markers and cemeteries (within 150 m)</h4>';
    lyrHere.forEach((x) => { h += '<div class="item"><div>' + lyrTag(x.p) + '</div><div class="t">' + esc(x.p.name) + '</div><div class="m"><span class="dist">' + Math.round(x.d * 1609.34) + ' m</span></div><div class="it-act"><button class="btn sm g" data-det="' + esc(x.p.id) + '">Details</button></div></div>'; });
  }
  if (wiki.status === 'fulfilled' && wiki.value.length) {
    facts += wiki.value.length; h += '<h4>Wikipedia, closest first</h4><p class="note">These are articles about places near this spot. An article may be about a neighbor, not this exact building.</p>';
    wiki.value.forEach((a) => { h += '<div class="fact"><span class="badge">Reported (Wikipedia)</span><b>' + esc(a.title) + '</b>' + (a.m != null ? ' <span class="dist">' + Math.round(a.m) + ' m away</span>' : '') + '<div>' + esc(a.text.length > 380 ? a.text.slice(0, 380).replace(/\s+\S*$/, '') + '…' : a.text) + '</div><div class="src"><a target="_blank" rel="noopener" href="https://en.wikipedia.org/?curid=' + a.id + '">Source: Wikipedia</a></div></div>'; });
  } else if (wiki.status === 'rejected') h += '<p class="note">Wikipedia could not be reached just now.</p>';
  if (wd.status === 'fulfilled' && wd.value.length) {
    facts += wd.value.length; h += '<h4>Wikidata records nearby</h4>';
    wd.value.forEach((x) => { h += '<div class="fact"><span class="badge">Reported (Wikidata)</span><b>' + esc(x.label) + '</b> <span class="dist">' + Math.round(x.m) + ' m away</span>' + (x.desc ? '<div>' + esc(x.desc) + '</div>' : '') + '<div class="muted">' + (x.inc ? 'Inception: ' + esc(x.inc) : '') + (x.inc && x.nrhp ? ' · ' : '') + (x.nrhp ? 'NRHP reference #' + esc(x.nrhp) : '') + '</div><div class="src"><a target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/' + esc(x.qid) + '">Source: Wikidata</a></div></div>'; });
  } else if (wd.status === 'rejected') h += '<p class="note">Wikidata could not be reached just now.</p>';
  if (!facts) h += '<div class="fact"><b>No public history found nearby yet.</b><div class="muted">Nothing in our files, OpenStreetMap tags, Wikipedia or Wikidata matched this spot. That does not mean there is no history, only that it is not in these free sources.</div></div>';
  h += '<h4>Next</h4><textarea id="fl-note" placeholder="Optional note (sign text, what you saw, who told you)" maxlength="600"></textarea>'
    + '<div class="row"><button class="btn p g" id="fl-save">Save as field lead</button><button class="btn g" id="fl-ask">Ask the Research Director</button></div>'
    + '<p class="note">Saving keeps it on this phone only. Nothing is sent anywhere. “Ask” copies the address so you can paste it into chat.</p>';
  openSheet('here', 'What’s here?', h);
  hereCtx = { lat, lon, address, name: bname };
  bindItems();
  $('#fl-save').onclick = () => { saveLead({ name: bname, addr: address, lat, lon, note: $('#fl-note').value.trim() }); $('#fl-save').textContent = 'Saved ✓'; };
  $('#fl-ask').onclick = async () => {
    const t = 'Research Director: please look up the history of ' + (bname ? bname + ', ' : '') + address + ' (' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '). Found by Twisted Deeds Live.';
    const ok = await copyText(t); $('#fl-ask').textContent = ok ? 'Copied: paste it in chat' : 'Copy failed'; };
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = 0; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
  }
}

// ---------- field leads (this phone only)
const LK = 'td-live-field-leads';
const leadsGet = () => store.get(LK, []);
function saveLead(l) {
  const a = leadsGet(); a.unshift({ id: 'fl-' + Date.now(), name: l.name || '', addr: l.addr, lat: l.lat, lon: l.lon, note: l.note || '', ts: new Date().toISOString() });
  store.set(LK, a); paintLeads(); toast('Saved on this phone');
}
function paintLeads() {
  const a = leadsGet(); $('#lcount').textContent = a.length; mineLayer.clearLayers();
  a.forEach((l) => L.marker([l.lat, l.lon], { icon: L.divIcon({ className: '', html: '<div class="pin mine">★</div>', iconSize: [34, 34], iconAnchor: [17, 17] }) }).on('click', () => showLeads()).addTo(mineLayer));
  if ($('#sheet').dataset.kind === 'leads') renderLeads();
}
const leadText = (l) => '• ' + (l.name ? l.name + ', ' : '') + l.addr + '\n  ' + Number(l.lat).toFixed(5) + ', ' + Number(l.lon).toFixed(5) + ' · saved ' + new Date(l.ts).toLocaleString() + (l.note ? '\n  Note: ' + l.note : '') + '\n  https://www.google.com/maps/search/?api=1&query=' + l.lat + ',' + l.lon;
const allText = () => 'Twisted Deeds field leads (private, from my phone)\n\n' + leadsGet().map(leadText).join('\n\n');
function renderLeads() {
  const a = leadsGet();
  $('#sh-body').innerHTML = (a.length ? '<div class="row"><button class="btn p g" id="l-share">Share all</button><button class="btn g" id="l-copy">Copy as text</button></div>' : '')
    + (a.map((l) => '<div class="item"><span class="tag mine">Field lead · private</span><div class="t" style="margin-top:6px">' + esc(l.name || l.addr) + '</div><div class="m">' + esc(l.name ? l.addr : '') + '</div><div class="m">' + new Date(l.ts).toLocaleString() + '</div>' + (l.note ? '<p style="margin:6px 0 0">' + esc(l.note) + '</p>' : '')
      + '<div class="it-act"><a class="btn p sm g" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + l.lat + ',' + l.lon + '&travelmode=driving">Directions</a><button class="btn sm g" data-ml="' + esc(l.id) + '">On map</button><button class="btn sm d" data-del="' + esc(l.id) + '">Delete</button></div></div>').join('')
    || '<p>No field leads yet. Tap <b>What’s here?</b>, then <b>Save as field lead</b>. They stay on this phone only.</p>');
  const sh = $('#l-share'); if (sh) sh.onclick = async () => { try { if (navigator.share) await navigator.share({ title: 'Twisted Deeds field leads', text: allText() }); else { await copyText(allText()); toast('Sharing is not available here. Copied as text instead.'); } } catch (e) { /* cancelled */ } };
  const cp = $('#l-copy'); if (cp) cp.onclick = async () => { toast((await copyText(allText())) ? 'Copied' : 'Copy failed'); };
  document.querySelectorAll('[data-ml]').forEach((b) => { b.onclick = () => { const l = leadsGet().find((x) => x.id === b.dataset.ml); closeSheet(); follow = false; if (running) $('#recenter').hidden = false; map.setView([l.lat, l.lon], 17); }; });
  document.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { if (confirm('Delete this field lead from this phone?')) { store.set(LK, leadsGet().filter((x) => x.id !== b.dataset.del)); paintLeads(); } }; });
}
function showLeads() { openSheet('leads', 'My field leads', ''); renderLeads(); }
$('#leads').onclick = showLeads;

// ---------- update prompt + service worker (shared with the main app: scope is the app folder)
function updateBar() {
  if ($('#upd')) return;
  const d = document.createElement('div'); d.id = 'upd'; d.setAttribute('role', 'status');
  d.innerHTML = '<span>Update available, tap to refresh</span><button>Refresh</button>';
  d.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(d);
}
const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && (!LOCALHOST || localStorage.getItem('td-sw-dev') === '1')) {
  const had = !!navigator.serviceWorker.controller;
  // A new version took over (sw.js skips waiting and claims open pages): reload straight away when it's safe (GPS not
  // running, so no drive is interrupted); during a drive show the Refresh bar instead.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had) return; if (!running) location.reload(); else updateBar(); });
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).then((reg) => {
    reg.update().catch(() => {});
    // An installed app can sit in the background for days without reloading: check for a new version every time it comes back.
    let lastChk = Date.now();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastChk > 30000) { lastChk = Date.now(); reg.update().catch(() => {}); } });
    setInterval(() => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }, 15 * 60 * 1000);
    if (reg.waiting && had && running) updateBar();
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller && running) updateBar(); }); });
  }).catch(() => {});
}

// For live/drive.js (Driving mode): read-only map state, the shared distance/direction wording, and a few actions.
window.__tdLiveDriveApi = { get pins() { return PINS; }, get lyr() { return LYR.items; }, get me() { return me; }, get meAcc() { return meAcc; }, get meHead() { return meHead; },
  get running() { return running; }, get showing() { return showing; }, get queue() { return queue.slice(); }, get alerted() { return alerted; }, get show() { return S.show; }, get radius() { return S.radius; },
  invalidate() { map.invalidateSize(); if (me) map.panTo(me); },
  CATS, LTYPE, LSAY, hav, bearing, lyrDist, sayDist, sayDir, dirUrl, findAny, inactive, start, stop, toast, gpsTap, gpsMsg, get gpsErr() { return gpsErr; }, skip() { nextAlert(); },
  setLayer(k, on) { const b = document.querySelector('#lyrs [data-k="' + k + '"]'); if (b && !!S.show[k] !== !!on) b.click(); return !!S.show[k]; } };

// ---------- boot
paintLeads();
map.fire('moveend');
loadPins().then((src) => { drawPins(); window.__tdLive = { pins: PINS.length, src }; document.documentElement.dataset.ready = '1'; });
// For live/passport-live.js (Twisted Passport): read-only views of the map state plus the sheet/toast helpers.
function setShowChip(k, on) {
  const b = document.querySelector('#chips [data-k="' + k + '"], #lyrs [data-k="' + k + '"]');
  if (b && !!S.show[k] !== !!on) b.click();
  else if (!b) { S.show[k] = !!on; saveS(); }
  return !!S.show[k];
}
window.__tdLiveApi = { map, get pins() { return PINS; }, get lyr() { return LYR.items; }, get me() { return me; }, get meAcc() { return meAcc; }, get running() { return running; },
  get show() { return S.show; }, isPriv, inPrivArea, locLabel, radMi,
  redraw() { drawPins(); lyrDraw(); }, openSheet, closeSheet, toast, showDetails, setShowChip, findGo, findPlace };
window.dispatchEvent(new Event('td-live-api'));
window.__tdLiveDebug = { center: () => { const c = map.getCenter(); return [+c.lat.toFixed(4), +c.lng.toFixed(4)]; }, find: (q) => findPlace(q).then((r) => { if (r && !r.none && !r.err) findGo(r); return r; }), lyrStats: () => ({ items: LYR.items.size, tiles: LYR.tiles.size, blocks: LYR.blk.size, drawn: lyrLayer.getLayers().length, zoom: map.getZoom() }),  view: (la, lo, z) => map.setView([la, lo], z), lyr: () => [...LYR.items.values()], get state() { return { running, me, alerted: [...alerted], queue: [...queue], showing, lyrItems: LYR.items.size, lyrTiles: [...LYR.tiles.keys()], lyrLast }; } };
})();
