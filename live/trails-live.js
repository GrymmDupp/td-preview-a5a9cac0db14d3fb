// Twisted Trails on the live map (2026-11-27, Grymm t296u-t300u): metaphysical and occult shops, oddities, dark museums,
// spiritual places and haunted eats. Preview layer: it only exists for accounts the server lets in (public.trails_access():
// admins/staff, the trails_allowlist, or app_settings 'trails_public' = 'true'). The places come from public.twisted_trails
// behind row level security, so nobody else can read them; for everyone else this file draws nothing and adds no chip.
import * as P from '../js/passport.js';
const $ = (s) => document.querySelector(s);
const esc = P.esc;
const SHOW = 'td-trails-show', CACHE = 'td-trails-cache';
const NEAR_M = 3219;          // nudge within 2 mi when open
const STAMP_M = 120;          // Curiosity stamp when you pass within ~400 ft
const GAP_MS = 45000;
const CAT = {
  metaphysical: { label: 'Metaphysical & occult', short: 'metaphysical shop', col: '#7b4fa6' },
  oddities: { label: 'Oddities & curiosities', short: 'oddities shop', col: '#a3742c' },
  dark_museum: { label: 'Dark museum', short: 'dark museum', col: '#8e1b22' },
  spiritual: { label: 'Spiritual place', short: 'spiritual place', col: '#3f6f7a' },
  haunted_eats: { label: 'Haunted eats & drinks', short: 'haunted haunt for a drink or a meal', col: '#5e5a2a' },
};
const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'], DAYN = { mo: 'Mon', tu: 'Tue', we: 'Wed', th: 'Thu', fr: 'Fri', sa: 'Sat', su: 'Sun' };
let api = null, lyr = null, on = true, places = [], uid = null, lastNudge = 0, queue = [], last = null;
const told = new Set(JSON.parse(sessionStorage.getItem('td-trails-told') || '[]'));
try { on = localStorage.getItem(SHOW) !== '0'; } catch { /* */ }
const R = 6371000;
function meters(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function bearing(a, b, c, d) { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; }
const LANTERN = (c, s) => '<svg viewBox="0 0 20 24" width="' + s + '" height="' + Math.round(s * 1.2) + '" aria-hidden="true"><path d="M7 3h6M10 1v2" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/><path d="M5 6h10l-1 2v9l1 2H5l1-2V8z" fill="#1a1416" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 10c1.6 1.6 1.6 3.6 0 5-1.6-1.4-1.6-3.4 0-5z" fill="#f2c55c"/><path d="M4 21h12" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/></svg>';

/* ------------------------------------------------ hours (in the place's own time zone) */
function localNow(tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Detroit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { d: DAYS.indexOf(p.weekday.slice(0, 2).toLowerCase()), m: (+p.hour % 24) * 60 + (+p.minute) };
}
const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const clock = (t) => { let [h, m] = String(t).split(':').map(Number); if (h === 24 || (h === 0 && m === 0 && t !== '00:00')) return 'midnight'; const ap = h >= 12 && h < 24 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap; };
// -> { known: bool, open: bool, until?: 'HH:MM', next?: string }
function openState(p) {
  const h = p.hours; if (!h || typeof h !== 'object') return { known: false };
  const n = localNow(p.tz);
  // today's spans, plus yesterday's spans that run past midnight
  const today = h[DAYS[n.d]] || [], yday = h[DAYS[(n.d + 6) % 7]] || [];
  for (const [a, b] of yday) { const A = mins(a), B = mins(b); if (B <= A && n.m < B) return { known: true, open: true, until: b }; }
  for (const [a, b] of today) { const A = mins(a), B = mins(b); if (n.m >= A && (B <= A ? true : n.m < B)) return { known: true, open: true, until: b }; }
  for (let k = 0; k < 7; k++) {
    const d = (n.d + k) % 7, sp = (h[DAYS[d]] || []).filter(([a]) => k > 0 || mins(a) > n.m).sort((x, y) => mins(x[0]) - mins(y[0]));
    if (sp.length) return { known: true, open: false, next: (k === 0 ? 'today' : k === 1 ? 'tomorrow' : DAYN[DAYS[d]]) + ' at ' + clock(sp[0][0]) };
  }
  return { known: true, open: false };
}
function hoursTable(p) {
  if (!p.hours) return '<p class="muted">' + esc(p.hours_text || 'Hours aren’t published. Check their site or call before you go.') + '</p>';
  const rows = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => '<tr><th>' + DAYN[d] + '</th><td>' + ((p.hours[d] || []).length ? p.hours[d].map(([a, b]) => clock(a) + '–' + clock(b)).join(', ') : 'Closed') + '</td></tr>').join('');
  return '<table class="trl-h">' + rows + '</table>' + (p.hours_text ? '<p class="muted">' + esc(p.hours_text) + '</p>' : '');
}
function stateLine(p) {
  const s = openState(p);
  if (!s.known) return '<span class="trl-st unk">Hours not published</span>';
  return s.open ? '<span class="trl-st open">Open now · until ' + esc(clock(s.until)) + '</span>' : '<span class="trl-st shut">Closed now' + (s.next ? ' · opens ' + esc(s.next) : '') + '</span>';
}

/* ------------------------------------------------ passport (Curiosity stamps; public places, so counts and first-to-find work) */
const metaOf = (p) => ({ id: p.id, name: p.name, town: p.town, county: '', state: p.state, layer: 'trail', sub: p.category, theme: '', crew: false, priv: false, firstOk: true, lat: p.lat, lon: p.lon, exact: true });
function passportBox(p, el) {
  const s = P.stampOf(p.id), wax = s && s.tier === 'wax';
  const box = document.createElement('div'); box.className = 'tdp-det';
  box.innerHTML = '<h4>Twisted Passport · Curiosity stamp</h4>' + (s
    ? '<div class="tdp-row">' + P.stampSvg(s, { size: 86 }) + '<div><b>' + (wax ? 'Wax seal' : 'Curiosity stamp') + ' · ' + esc(P.fmtDate(wax ? (s.sealedAt || s.at) : s.at)) + '</b>' + (s.first ? '<br><span class="tdp-rare">First to find</span>' : '') + '</div></div>'
    : '<p class="note">Not stamped yet. Pass within about 400 ft with <b>Start</b> on and it lands as a Curiosity stamp in your passport. Linger about 3 minutes, or add a photo, for a wax seal.</p>'
      + (P.remote.ready ? '<p class="note tdp-first">The first traveler to stamp this place gets a rare “first to find” seal.</p>' : ''))
    + '<p class="tdp-cnt" hidden></p><div class="row"><a class="btn sm g" href="../passport/">Open my passport</a></div>';
  el.appendChild(box);
  P.counts([p.id]).then((c) => { const n = c.get(p.id); const q = box.querySelector('.tdp-cnt'); if (n && q) { q.textContent = P.countLine(n); q.hidden = false; } }).catch(() => {});
}
function stamp(p) {
  const s = P.addStamp(metaOf(p)); if (!s) return;
  draw();
  setTimeout(() => api.toast('✓ Curiosity stamp: ' + p.name, 4000), 600);
  try { if (navigator.vibrate) navigator.vibrate([40, 30, 40]); } catch { /* */ }
  if (P.remote.status === 'on') setTimeout(async () => { const r = await P.sync().catch(() => null); for (const f of r?.firsts || []) if (f.id === p.id) api.toast('First to find! You are the first traveler to stamp ' + p.name + '.', 6000); draw(); }, 1500);
}

/* ------------------------------------------------ map */
function draw() {
  if (!lyr) lyr = L.layerGroup().addTo(api.map);
  lyr.clearLayers();
  if (!on) return;
  for (const p of places) {
    const c = (CAT[p.category] || CAT.oddities).col, s = P.showOnMap() ? P.stampOf(p.id) : null;
    const html = s ? '<div class="tdp-pin">' + P.stampSvg(s, { mini: true, size: 36 }) + '</div>' : '<div class="trl-pin" style="--c:' + c + '">' + LANTERN('#f2d27a', 16) + '</div>';
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html, iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: false, title: p.name, zIndexOffset: -100 });
    m.on('click', () => card(p)); lyr.addLayer(m);
  }
}
function card(p) {
  const c = CAT[p.category] || CAT.oddities;
  api.openSheet('trail', 'Twisted Trails', '<div><span class="tag trl-tag" style="--c:' + c.col + '">' + esc(c.label) + '</span> <span class="tag off">Preview</span></div>'
    + '<div class="addr" style="margin-top:8px">' + esc(p.name) + '</div>'
    + (p.kind ? '<p class="muted" style="margin:2px 0">' + esc(p.kind) + '</p>' : '')
    + '<p class="muted" style="margin:2px 0">' + esc(p.address || [p.town, p.state].filter(Boolean).join(', ')) + '</p>'
    + '<p>' + stateLine(p) + (p.seasonal ? ' <span class="trl-st unk">Seasonal</span>' : '') + '</p>'
    + '<p class="trl-blurb">' + esc(p.blurb) + '</p>'
    + '<details class="trl-hd"><summary>Hours</summary>' + hoursTable(p) + '</details>'
    + '<p class="muted trl-chk">Hours last checked ' + esc(P.fmtDate(p.last_checked + 'T12:00:00')) + '. Shops change their hours often, so check before a long drive.</p>'
    + '<div class="row"><a class="btn p g" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon + '&travelmode=driving">Directions</a>'
    + (p.website ? '<a class="btn g" target="_blank" rel="noopener" href="' + esc(p.website) + '">Their site</a>' : '') + '</div>');
  passportBox(p, $('#sh-body'));
}

/* ------------------------------------------------ nudges and stamps while driving */
function wanted() {
  const Pf = window.TDPrefs;
  if (Pf && Pf.showMoreCats && !Pf.showMoreCats() && Pf.interestOn && !Pf.interestOn('trails')) return false;
  return on;
}
function miles(m) { const mi = m / 1609.344; return mi < 0.2 ? 'right here' : (mi < 1 ? mi.toFixed(1) : Math.round(mi * 10) / 10) + ' mi'; }
function onFix(pos) {
  if (!places.length || !pos || !pos.coords) return;
  const c = pos.coords; if ((c.accuracy || 999) > 150) return;
  const here = [c.latitude, c.longitude];
  const head = c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 3 ? c.heading : (last && meters(last[0], last[1], here[0], here[1]) > 25 ? bearing(last[0], last[1], here[0], here[1]) : null);
  if (!last || meters(last[0], last[1], here[0], here[1]) > 25) last = here;
  for (const p of places) {
    if (Math.abs(p.lat - here[0]) > 0.05 || Math.abs(p.lon - here[1]) > 0.07) continue;
    const d = meters(here[0], here[1], p.lat, p.lon);
    if (d <= STAMP_M && on) stamp(p);
    if (d <= NEAR_M && wanted() && !told.has(p.id)) {
      const st = openState(p); if (!st.open) continue;           // only nudge when they're open
      told.add(p.id); sessionStorage.setItem('td-trails-told', JSON.stringify([...told]));
      const b = bearing(here[0], here[1], p.lat, p.lon), ahead = head != null && Math.abs(((b - head + 540) % 360) - 180) < 50;
      const what = (CAT[p.category] || CAT.oddities).short;
      queue.push({ p, t: 'A ' + what + ' is ' + miles(d) + (d > 300 ? (ahead ? ' ahead' : ' from here') : '') + ': ' + p.name + ', open until ' + clock(st.until) + '.' });
    }
  }
  flush();
}
function flush() {
  if (!queue.length || Date.now() - lastNudge < GAP_MS) { if (queue.length) setTimeout(flush, GAP_MS); return; }
  const { p, t } = queue.shift(); lastNudge = Date.now();
  api.toast('🏮 ' + t, 9000);
  const tEl = $('#toast'); if (tEl) tEl.onclick = () => card(p);
  let speak = false; try { speak = !!JSON.parse(localStorage.getItem('td-live-settings') || '{}').speak; } catch { /* */ }
  if (speak && 'speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(t.replace(/ mi\b/g, ' miles')); u.lang = 'en-US'; speechSynthesis.speak(u); } catch { /* */ } }
}

/* ------------------------------------------------ chip + boot */
function chip() {
  const row = $('#lyrs'); if (!row || row.querySelector('[data-k="trails"]')) return;
  const b = document.createElement('button'); b.id = 'trl-chip'; b.dataset.k = 'trails'; b.className = 'chip lchip' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', 'Twisted Trails (preview)');
  b.innerHTML = LANTERN('#d9a6ff', 16) + '<span>Trails</span>';
  b.onclick = () => { on = !on; try { localStorage.setItem(SHOW, on ? '1' : '0'); } catch { /* */ } b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); draw(); api.toast(on ? 'Twisted Trails on: oddities, occult shops, dark museums' : 'Twisted Trails hidden', 1800); };
  row.appendChild(b);
}
function css() {
  if ($('style#trl-css')) return;
  const s = document.createElement('style'); s.id = 'trl-css';
  s.textContent = '.trl-pin{width:28px;height:28px;border-radius:50%;background:#140f14;border:2px solid var(--c);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px rgba(0,0,0,.5),0 0 10px var(--c)}'
    + '#trl-chip svg{margin-right:2px}#trl-chip.on{border-color:#9b6cc4}.trl-tag{background:var(--c)!important;color:#f6ecd9}'
    + '.trl-st{display:inline-block;font-size:.85em;padding:2px 8px;border-radius:10px;border:1px solid #3a2f30}.trl-st.open{color:#9fe0a0;border-color:#3d6b3e}.trl-st.shut{color:#e7a3a3;border-color:#6b3d3d}.trl-st.unk{color:#cbbf9f}'
    + '.trl-blurb{font-style:italic;line-height:1.45}.trl-h{border-collapse:collapse;margin:6px 0}.trl-h th{text-align:left;padding:2px 12px 2px 0;color:#a3967f;font-weight:normal}.trl-h td{padding:2px 0}.trl-hd summary{cursor:pointer;color:#e6c352}.trl-chk{font-size:.82em}';
  document.head.appendChild(s);
}
async function load() {
  const sb = await P.client(); if (!sb) return false;
  const { data: ses } = await sb.auth.getSession();
  uid = ses.session?.user?.id || null;
  // a cache from another account (or from before sign-out) is never used and is cleared
  let cache = null; try { cache = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { /* */ }
  if (cache && cache.u !== uid) { try { localStorage.removeItem(CACHE); } catch { /* */ } cache = null; }
  try {
    const acc = await sb.rpc('trails_access');
    if (acc.error) throw acc.error;
    if (acc.data !== true) { try { localStorage.removeItem(CACHE); } catch { /* */ } return false; }
    const r = await sb.from('twisted_trails').select('id,name,category,kind,address,town,state,lat,lon,hours,hours_text,seasonal,website,blurb,last_checked,tz').limit(2000);
    if (r.error) throw r.error;
    places = r.data || [];
    if (uid) try { localStorage.setItem(CACHE, JSON.stringify({ u: uid, at: Date.now(), places })); } catch { /* */ }
    return places.length > 0;
  } catch {
    if (cache && uid && cache.u === uid && Date.now() - cache.at < 14 * 864e5) { places = cache.places || []; return places.length > 0; }   // offline on a drive
    return false;
  }
}
async function boot() {
  api = window.__tdLiveApi;
  if (!(await load().catch(() => false))) return;      // no access: nothing at all
  window.TDTrails = { onFix, onStop() { last = null; }, card, get places() { return places; } };
  css(); chip(); draw();
  window.addEventListener('td-passport', () => draw());
}
if (window.__tdLiveApi) boot(); else window.addEventListener('td-live-api', boot, { once: true });
window.__tdTrailsDebug = { get state() { return { n: places.length, on, uid: !!uid, told: told.size }; }, openState, onFix };
