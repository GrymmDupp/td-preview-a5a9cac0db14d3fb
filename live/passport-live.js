// Twisted Passport on the live map (2026-11-21, Grymm t219u-t221u).
// Drive-by stamps: within ~90 m (300 ft) of a place, after a GPS dwell / accuracy check, once per place. Nothing asks you
// to leave the road. Driving (moving faster than ~15 mph) stamps silently and shows what you collected once you slow or stop.
// Stamped places turn into their stamp on the map; unvisited ones fade. "Stamps" chip hides them for a clean map.
import * as P from '../js/passport.js';
(() => { if (!document.querySelector('link[href="passport.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'passport.css'; document.head.appendChild(l); } })();

const STAMP_M = 91;            // 300 ft
const MAX_ACC = 60;            // ignore fixes worse than ±60 m
const DRIVE_MS = 6.7;          // 15 mph
const SLOW_MS = 2.2;           // 5 mph
const SLOW_FOR = 15000;        // slowed / stopped this long -> show the drive summary
const $ = (s) => document.querySelector(s);
const esc = P.esc;
let api = null, catalog = new Map(), stamped = new Set(), archLayer = null;
const cand = new Map();        // id -> { t0, n, last }
let lastFix = null, speeds = [], driving = false, slowSince = 0, pending = [];
// Driving mode (live/drive.js, phone mounted) always stamps quietly; the summary waits until you leave Driving mode or stop.
const driveMode = () => !!(window.TDDrive && window.TDDrive.on());
const quiet = () => driving || driveMode();

function refreshSet() { stamped = new Set(P.stamps().map((s) => s.id)); }
const R = 6371000;
function meters(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

/* ------------------------------------------------ what can be stamped */
function metaFor(p) {
  if (!p) return null;
  if (p.lyr) return p.r >= 1 && String(p.name || '').trim() && !/^(unnamed |)cemetery$/i.test(String(p.name).trim()) ? P.metaFromLayer(p) : null;   // named markers / cemeteries only
  if (p.arch) return p.meta;
  if (p.cat === 'context' || !isFinite(p.lat)) return null;
  if (api.isPriv ? api.isPriv(p) : p.privateHome) {   // private home (js/privacy.js): the whole public area circle is the stamp zone
    const m = P.metaFromPin(p, catalog.get(p.id));
    return Object.assign(m, { lat: p.lat, lon: p.lon, exact: true, area: api.radMi ? api.radMi(p) * 1609.344 : (Number(p.radiusM) || 201.17),
      areaLabel: api.locLabel ? api.locLabel(p) : (p.area || ''), priv: true, firstOk: false, inArea: (la, lo) => (api.inPrivArea ? api.inPrivArea(la, lo, p) : false) });
  }
  if (p.approx) return null;
  return P.metaFromPin(p, catalog.get(p.id));
}
function targets() {
  const out = [];
  for (const p of api.pins) { const m = metaFor(p); if (m && m.exact) out.push(m); }
  for (const x of api.lyr.values()) { const m = metaFor(x); if (m) out.push(m); }
  for (const m of catalog.values()) if (m.layer === 'archive' && m.exact && (!m.priv || m.area) && !api.pins.some((p) => p.id === m.id)) out.push(m);
  return out;
}

/* ------------------------------------------------ pins (called by live.js) */
const stampable = (p) => !!metaFor(p);
function pinHtml(p) {
  if (!P.showOnMap() || !stamped.has(p.id)) return null;
  const s = P.stampOf(p.id); if (!s) return null;
  return '<div class="tdp-pin' + (p.lyr ? ' sm' : '') + '" title="Stamped ' + esc(P.fmtDate(s.at)) + '">' + P.stampSvg(s, { mini: true, size: p.lyr ? 30 : 40 }) + '</div>';
}
function pinClass(p) { return P.showOnMap() && stampable(p) && !stamped.has(p.id) ? ' unstamped' : ''; }

/* ------------------------------------------------ Archive places (not otherwise on the live map) */
function drawArchive() {
  if (!archLayer) archLayer = L.layerGroup().addTo(api.map);
  archLayer.clearLayers();
  for (const m of catalog.values()) {
    if (m.layer !== 'archive' || !m.exact || m.priv || api.pins.some((p) => p.id === m.id)) continue;   // never an exact pin for a private home
    const s = P.showOnMap() && stamped.has(m.id) ? P.stampOf(m.id) : null;
    const html = s ? '<div class="tdp-pin">' + P.stampSvg(s, { mini: true, size: 40 }) + '</div>' : '<div class="pin archive' + (P.showOnMap() ? ' unstamped' : '') + '" title="The Archive">A</div>';
    const mk = L.marker([m.lat, m.lon], { icon: L.divIcon({ className: '', html, iconSize: [34, 34], iconAnchor: [17, 17] }), keyboard: false, zIndexOffset: -200, title: m.name });
    mk.on('click', () => archDetails(m)); archLayer.addLayer(mk);
  }
}
function archDetails(m) {
  let h = '<div><span class="tag archive">The Archive</span>' + (m.unwritten ? ' <span class="tag off">Unwritten story</span>' : '') + '</div><div class="addr" style="margin-top:8px">' + esc(m.name) + '</div><p class="muted">' + esc([m.town, m.county, m.state].filter(Boolean).join(', ')) + '</p>'
    + (m.unwritten ? '<p><b>We haven’t found this place’s story yet.</b></p><div class="row"><button class="btn p g" id="tdp-tell">Know this place? Tell us</button></div>' : '')
    + '<div class="row"><a class="btn p g" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + m.lat + ',' + m.lon + '&travelmode=driving">Directions</a><a class="btn g" href="../#/l/' + encodeURIComponent(m.id) + '">Open in app</a></div>';
  api.openSheet('details', 'Details', h); details({ id: m.id, arch: true, meta: m }, $('#sh-body'));
  const t = $('#tdp-tell'); if (t) t.onclick = () => suggestForm(m);
}
function redraw() { refreshSet(); api.redraw(); drawArchive(); }

/* ------------------------------------------------ details block (called by live.js) */
function details(p, el) {
  const m = metaFor(p); if (!m || !el) return;
  const s = P.stampOf(m.id);
  const box = document.createElement('div'); box.className = 'tdp-det';
  box.innerHTML = '<h4>Twisted Passport</h4>' + (s
    ? '<div class="tdp-row">' + P.stampSvg(s, { size: 86 }) + '<div><b>Stamped ' + esc(P.fmtDate(s.at)) + '</b>' + ((s.rare || []).length ? '<br><span class="tdp-rare">Rare: ' + esc(s.rare.map((r) => P.RARE[r]).join(', ')) + '</span>' : '') + (s.first ? '<br><span class="tdp-rare">First to find</span>' : '') + '</div></div>'
    : '<p class="note">Not stamped yet. ' + (m.area ? 'Drive through its area with <b>Start</b> on and it lands in your passport.' : 'Pass within about 300 ft with <b>Start</b> on and it lands in your passport.') + ' ' + (m.priv ? 'This is a private home: stamp it from the road, and please don’t stop, park or approach.' : 'Stamp it from the road or the public grounds.') + '</p>')
    + '<p class="tdp-cnt" hidden></p>'
    + (m.firstOk && P.remote.ready && !s ? '<p class="note tdp-first">The first traveler to stamp this public place gets a rare “first to find” seal.</p>' : '')
    + '<div class="row"><a class="btn sm g" href="../passport/">Open my passport</a></div>';
  el.appendChild(box);
  P.counts([m.id]).then((c) => { const n = c.get(m.id); const q = box.querySelector('.tdp-cnt'); if (n && q) { q.textContent = P.countLine(n); q.hidden = false; } }).catch(() => {});
}

/* ------------------------------------------------ stamping */
async function townFor(lat, lon) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=' + lat + '&lon=' + lon, { headers: { Accept: 'application/json' } });
    const j = await r.json(); const a = j.address || {};
    const st = (a['ISO3166-2-lvl4'] || '').split('-')[1] || '';
    return { town: a.city || a.town || a.village || a.hamlet || a.municipality || '', county: a.county || '', state: st };
  } catch { return null; }
}
function onFix(pos) {
  if (!api) return;
  const c = pos.coords, now = pos.timestamp || Date.now(), here = [c.latitude, c.longitude], acc = c.accuracy || 999;
  // speed: the GPS's own if it has one, else from the last fix
  let v = (c.speed != null && !isNaN(c.speed)) ? c.speed : null;
  if (v == null && lastFix && now - lastFix.t > 500) v = meters(lastFix.p[0], lastFix.p[1], here[0], here[1]) / ((now - lastFix.t) / 1000);
  lastFix = { p: here, t: now };
  if (v != null && acc <= 100) { speeds.push(v); speeds = speeds.slice(-3); }
  const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  if (!driving && speeds.length >= 2 && speeds.every((x) => x >= DRIVE_MS)) { driving = true; slowSince = 0; paintMode(); }
  if (driving) {
    if (avg < SLOW_MS) { slowSince = slowSince || now; if (now - slowSince >= SLOW_FOR) { driving = false; paintMode(); if (!driveMode()) summary(); } }
    else slowSince = 0;
  }
  if (acc > MAX_ACC) return;                                             // too fuzzy to stamp anything
  for (const [id, x] of cand) if (now - x.last > 60000) cand.delete(id);
  for (const m of targets()) {
    const reach = m.area || (STAMP_M + (m.rad || 0));
    if (stamped.has(m.id) || Math.abs(m.lat - here[0]) > 0.001 + reach / 111000 || Math.abs(m.lon - here[1]) > 0.0014 + reach / 80000) continue;
    const dc = meters(here[0], here[1], m.lat, m.lon);
    const d = m.area ? dc : Math.max(0, dc - (m.rad || 0)), lim = m.area || STAMP_M;   // area circle: anywhere inside it
    if (m.area ? !(m.inArea ? m.inArea(here[0], here[1]) : d <= lim) : d > lim) continue;
    const x = cand.get(m.id) || { t0: now, n: 0, last: now }; x.n++; x.last = now; cand.set(m.id, x);
    const sure = (d + acc <= lim && acc <= 25) || (x.n >= 2 && now - x.t0 >= 2000);   // dwell or a tight fix
    if (sure) stamp(m, new Date(now));
  }
}
function stamp(m, at) {
  const s = P.addStamp(m, at); cand.delete(m.id); if (!s) return;
  refreshSet(); redraw();
  if (!s.town && (m.layer === 'marker' || m.layer === 'cemetery')) townFor(m.lat, m.lon).then((t) => { if (t) { P.patchStamp(s.id, t); } });
  if (quiet()) { pending.push(s); paintMode(); }
  else { showStamp(s); try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch { /* ignore */ } }
  syncSoon();
}
let syncT = null;
function syncSoon() {
  if (P.remote.status !== 'on') return;
  clearTimeout(syncT); syncT = setTimeout(async () => {
    const r = await P.sync().catch(() => null); refreshSet(); redraw();
    for (const s of r?.firsts || []) if (!quiet()) api.toast('First to find! You are the first traveler to stamp ' + s.name + '.', 6000);
  }, 1500);
}
function showStamp(s) {
  let el = $('#tdp-pop'); if (!el) { el = document.createElement('div'); el.id = 'tdp-pop'; el.setAttribute('role', 'status'); $('#stage').appendChild(el); }
  el.innerHTML = '<div class="tdp-pop-in">' + P.stampSvg(s, { size: 132 }) + '<div><div class="tdp-k">Stamped</div><div class="tdp-n">' + esc(P.noAddr(s.name)) + '</div>'
    + '<div class="tdp-t">' + esc(P.placeLine(s)) + '</div>'
    + ((s.rare || []).length ? '<div class="tdp-rare">Rare: ' + esc(s.rare.map((r) => P.RARE[r]).join(', ')) + '</div>' : '')
    + '<div class="row"><a class="btn sm p" href="../passport/">My passport</a><button class="btn sm" id="tdp-ok">OK</button></div></div></div>';
  el.hidden = false; el.classList.remove('thunk'); void el.offsetWidth; el.classList.add('thunk');
  clearTimeout(showStamp.t); showStamp.t = setTimeout(() => { el.hidden = true; }, 9000);
  $('#tdp-ok').onclick = () => { el.hidden = true; };
}
function summary() {
  if (!pending.length) return;
  const list = pending; pending = []; paintMode();
  api.openSheet('stamps', list.length === 1 ? '1 new stamp' : list.length + ' new stamps',
    '<p class="note">Collected while you were driving.</p><div class="tdp-grid">' + list.map((s) => '<figure>' + P.stampSvg(s, { size: 110 }) + '<figcaption>' + esc(P.noAddr(s.name)) + '<br><small>' + esc(P.placeLine(s)) + '</small></figcaption></figure>').join('') + '</div>'
    + '<div class="row"><a class="btn p g" href="../passport/">Open my passport</a></div>');
}
function onStop() { driving = false; speeds = []; slowSince = 0; paintMode(); summary(); }
function paintMode() {
  let b = $('#tdp-mode');
  if (!b) { b = document.createElement('span'); b.id = 'tdp-mode'; b.className = 'tdp-mode'; b.setAttribute('role', 'status'); $('#stage').appendChild(b); }
  b.hidden = !quiet() || driveMode(); b.textContent = 'Driving' + (pending.length ? ' · ' + pending.length + ' new' : '');
  b.title = 'Driving: stamps are saved quietly and shown when you stop.';
}

/* ------------------------------------------------ controls: Stamps chip, Passport button, Suggest a place */
function controls() {
  const row = $('#lyrs');
  if (row && !$('#tdp-chip')) {
    const b = document.createElement('button'); b.id = 'tdp-chip'; b.className = 'chip lchip pchip' + (P.showOnMap() ? ' on' : ''); b.setAttribute('aria-pressed', P.showOnMap());
    b.setAttribute('aria-label', 'Passport stamps on the map');
    b.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#b33a32" stroke-width="2"/><circle cx="10" cy="10" r="5.2" fill="none" stroke="#b33a32" stroke-width="1"/><path d="M6.5 11 10 7l3.5 4M8 10.5v3h4v-3" fill="none" stroke="#b33a32" stroke-width="1.3"/></svg><span>Stamps</span>';
    b.onclick = () => { P.setShowOnMap(!P.showOnMap()); b.classList.toggle('on', P.showOnMap()); b.setAttribute('aria-pressed', P.showOnMap()); redraw(); api.toast(P.showOnMap() ? 'Stamps on the map' : 'Clean map: stamps hidden (still in your passport)', 1800); };
    row.appendChild(b);
  }
  const mini = $('#dock .mini');
  if (mini && !$('#tdp-btn')) {
    const a = document.createElement('button'); a.id = 'tdp-btn'; a.innerHTML = 'Passport <span id="tdp-count">0</span>'; a.onclick = passportSheet; mini.insertBefore(a, mini.firstChild.nextSibling);
  }
  paintCount();
}
function paintCount() { const c = $('#tdp-count'); if (c) c.textContent = P.stamps().length; }
function passportSheet() {
  const list = P.stamps().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  api.openSheet('passport', 'Twisted Passport',
    '<p class="note">Drive past a place with <b>Start</b> on and it is stamped automatically. Never leave the road for a stamp: many of these are private homes.</p>'
    + (list.length ? '<div class="tdp-grid">' + list.slice(0, 6).map((s) => '<figure>' + P.stampSvg(s, { size: 100 }) + '<figcaption>' + esc(P.noAddr(s.name)) + '</figcaption></figure>').join('') + '</div>' : '<p>No stamps yet.</p>')
    + '<div class="row"><a class="btn p g" href="../passport/">Open my passport</a><button class="btn g" id="tdp-sug">Suggest a place</button></div>');
  $('#tdp-sug').onclick = () => suggestForm();
}
function suggestForm(about) {
  about = about && about.id ? about : null;
  const st = P.remote.status;
  if (st === 'off' || st === 'local') { api.openSheet('suggest', 'Suggest a place', '<p>Suggestions open soon. For now, tell us through <a href="../#/stories">Stories &amp; Corrections</a>.</p>'); return; }
  if (st === 'signed-out') { api.openSheet('suggest', 'Suggest a place', '<p>Sign in to suggest a place, so we can thank you with a Scout stamp when it’s approved.</p><div class="row"><a class="btn p g" href="../#/account">Sign in</a></div>'); return; }
  const me = api.me, c = api.map.getCenter();
  let pt = about && isFinite(about.lat) ? [about.lat, about.lon] : me ? [me[0], me[1]] : [c.lat, c.lng];
  let how = about ? (about.area ? 'the place’s area' : 'the place') : me ? 'your GPS position' : 'the middle of the map';
  api.openSheet('suggest', 'Suggest a place',
    '<p class="note">Know a place with a dark past? Tell us. Every suggestion is checked by hand against public records before anything appears, and it stays private until then.</p>'
    + '<p class="note"><b>Please never trespass, knock, or bother the people who live there.</b> Only suggest what you saw from a public road.</p>'
    + (about ? '<p class="note">About: <b>' + esc(about.areaLabel && about.priv ? about.areaLabel : about.name) + '</b>' + (about.unwritten ? ' (an Unwritten story: we haven’t found its story yet)' : '') + '</p>' : '')
    + '<form id="tdp-form" class="tdp-form"><p class="muted">Spot: <span id="tdp-pt"></span> <button type="button" class="btn sm" id="tdp-mid">Use map middle</button></p>'
    + '<label>Name of the place<input name="name" required minlength="3" maxlength="120" placeholder="e.g. the old county poor farm" value="' + esc(about ? (about.priv ? '' : about.name) : '') + '"></label>'
    + '<label>The story, briefly<textarea name="story" required minlength="20" maxlength="1500" rows="4" placeholder="What happened here, and when?"></textarea></label>'
    + '<label>Source link (optional)<input name="source_url" type="url" maxlength="500" placeholder="https://…"></label>'
    + '<label class="check"><input type="checkbox" name="public_road" required> I saw it from a public road and didn’t go onto the property.</label>'
    + '<input name="website" tabindex="-1" autocomplete="off" class="tdp-hp" aria-hidden="true">'
    + '<div class="row"><button class="btn p g">Send for review</button></div></form>');
  const paint = () => { $('#tdp-pt').textContent = pt[0].toFixed(5) + ', ' + pt[1].toFixed(5) + ' (' + how + ')'; };
  paint();
  $('#tdp-mid').onclick = () => { const m = api.map.getCenter(); pt = [m.lat, m.lng]; how = 'the middle of the map'; paint(); };
  $('#tdp-form').onsubmit = async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    if (d.website) { api.closeSheet(); api.toast('Thank you. It’s in the review queue.'); return; }   // honeypot
    const btn = e.target.querySelector('button.p'); btn.disabled = true;
    try { await P.suggest({ lat: pt[0], lon: pt[1], name: d.name, story: d.story, source_url: d.source_url, public_road: !!d.public_road, place_id: about ? about.id : null }); api.closeSheet(); api.toast('Thank you. It’s in the private review queue. If it’s approved you’ll get a Scout stamp.', 6000); }
    catch (err) { api.toast(err.message, 5000); btn.disabled = false; }
  };
}

/* ------------------------------------------------ boot */
async function boot() {
  api = window.__tdLiveApi; refreshSet();
  window.TDPassport = { pinHtml, pinClass, onFix, details, onStop };
  controls(); api.redraw();
  catalog = await P.loadCatalog('../').catch(() => new Map());
  drawArchive(); api.redraw();
  window.addEventListener('td-passport', () => { refreshSet(); paintCount(); });
  let wasDrive = false;   // leaving Driving mode shows what was stamped on the way
  setInterval(() => { const d = driveMode(); if (wasDrive && !d && !driving) summary(); wasDrive = d; }, 1500);
  window.addEventListener('storage', (e) => { if (e.key === 'td-passport') { refreshSet(); paintCount(); redraw(); } });
  await P.backend();
  if (P.remote.status === 'on') { await P.sync().catch(() => null); redraw(); paintCount(); }
  document.documentElement.dataset.passport = P.remote.status;
  const sg = location.hash.match(/^#suggest(?:=(.+))?$/);
  if (sg) { history.replaceState(null, '', location.pathname); const id = sg[1] ? decodeURIComponent(sg[1]) : ''; suggestForm(id ? (catalog.get(id) || { id, name: '' }) : null); }
}
if (window.__tdLiveApi) boot(); else window.addEventListener('td-live-api', boot, { once: true });
window.__tdPassportDebug = { get state() { return { stamps: P.stamps(), driving, pending: pending.length, cand: [...cand.keys()], remote: { ...P.remote }, catalog: catalog.size }; }, P, get catalog() { return catalog; }, suggestForm };
