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
const S = Object.assign({ radius: 0.5, chime: false, show: { deed: true, story: true, lead: true, unverified: true, context: false } }, store.get('td-live-settings', {}));
S.show = Object.assign({ deed: true, story: true, lead: true, unverified: true, context: false }, S.show);
const saveS = () => store.set('td-live-settings', S);

// ---------- geometry
const R_MI = 3958.8;
function hav(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R_MI * Math.asin(Math.sqrt(x)); }
function bearing(a, b, c, d) { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; }
const COMP = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMP[Math.round(deg / 45) % 8];
function fmtDist(mi) { return mi < 0.1 ? (Math.max(10, Math.round(mi * 5280 / 10) * 10) + ' ft') : (mi < 10 ? mi.toFixed(mi < 1 ? 2 : 1) : Math.round(mi)) + ' mi'; }
const dirUrl = (p) => 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon + '&travelmode=driving';

// ---------- state
let PINS = [];
let me = null, meAcc = 0, meTs = 0;
let watchId = null, running = false, follow = true, wakeLock = null;
const mine = [];   // private field-lead markers
const markers = new Map();

// ---------- map
const map = L.map('map', { zoomControl: false, attributionControl: true, tap: true }).setView(JX, 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);
const layer = L.layerGroup().addTo(map);
const mineLayer = L.layerGroup().addTo(map);
let meMarker = null, meCircle = null;

// ---------- pins
const inactive = (p) => !!p.off;
function pinIcon(p) {
  const cls = 'pin ' + p.cat + (inactive(p) ? ' off' : '') + (p.approx ? ' approx' : '');
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
  PINS = [...byId.values()].map((p) => Object.assign({ src: [], hook: '', price: '', addr: '' }, p, { label: CATS[p.cat] }));
  return src;
}
function visible(p) { return !!S.show[p.cat]; }
function alertable(p) { return visible(p) && !inactive(p) && !p.approx; }
function drawPins() {
  layer.clearLayers(); markers.clear();
  for (const p of PINS) {
    if (!visible(p)) continue;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p), keyboard: false, zIndexOffset: p.cat === 'context' ? -500 : 0 });
    m.on('click', () => showDetails(p.id));
    layer.addLayer(m); markers.set(p.id, m);
  }
  refreshNearby();
}

// ---------- nearby + alerts
let alerted = new Set(sess.get('td-live-alerted', []));
let queue = [], showing = null;
function origin() { return me || (function () { const c = map.getCenter(); return [c.lat, c.lng]; })(); }
function nearbyList() {
  const o = origin();
  return PINS.filter(visible).map((p) => ({ p, d: hav(o[0], o[1], p.lat, p.lon), b: bearing(o[0], o[1], p.lat, p.lon) })).sort((a, b) => a.d - b.d);
}
function refreshNearby() {
  const n = me ? nearbyList().filter((x) => x.d <= S.radius && !inactive(x.p)).length : 0;
  $('#ncount').textContent = n;
  if ($('#sheet').dataset.kind === 'nearby') renderNearby();
}
function checkAlerts() {
  if (!me || (meAcc && meAcc > 500)) return;
  const fresh = nearbyList().filter((x) => x.d <= S.radius && alertable(x.p) && !alerted.has(x.p.id));
  for (const x of fresh) { alerted.add(x.p.id); queue.push(x.p.id); }
  if (fresh.length) { sess.set('td-live-alerted', [...alerted]); buzz(); }
  if (!showing && queue.length) nextAlert();
  else if (showing) renderAlert();
}
function nextAlert() {
  showing = queue.shift() || null;
  if (!showing) { $('#alert').hidden = true; $('#stage').classList.remove('has-alert'); return; }
  renderAlert();
}
function renderAlert() {
  const el = $('#alert'); const p = PINS.find((x) => x.id === showing);
  if (!p) { nextAlert(); return; }
  const o = me || origin(); const d = hav(o[0], o[1], p.lat, p.lon), b = compass(bearing(o[0], o[1], p.lat, p.lon));
  el.hidden = false;
  const compact = !$('#sheet').hidden; el.classList.toggle('compact', compact); $('#stage').classList.toggle('has-alert', compact);
  el.innerHTML = '<div class="a-top"><span class="a-near">NEARBY</span><span class="tag ' + p.cat + '">' + esc(CATS[p.cat]) + '</span><button class="x" id="a-x" aria-label="Dismiss">×</button></div>'
    + '<div class="a-name">' + esc(p.name) + '</div><div class="a-dist">' + esc(fmtDist(d)) + ' ' + b + '</div>'
    + '<div class="a-sub">' + esc(p.addr) + (inactive(p) ? ' · not currently listed' : '') + '</div>'
    + (p.hook ? '<p class="a-hook">' + esc(p.hook) + '</p>' : '')
    + '<div class="a-btns"><a class="btn p g" target="_blank" rel="noopener" href="' + dirUrl(p) + '">Directions</a><button class="btn g" id="a-d">Details</button></div>'
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
    [660, 880].forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.18); g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.3); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.32); });
  } catch (e) { /* no audio */ }
}
function buzz() { try { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); } catch (e) { /* ignore */ } chime(); }

// ---------- location
function setGps(txt, cls) { const g = $('#gps'); g.textContent = txt; g.className = 'gps ' + (cls || 'off'); }
function toast(t, ms) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 4000); }
function onFix(pos) {
  me = [pos.coords.latitude, pos.coords.longitude]; meAcc = pos.coords.accuracy || 0; meTs = Date.now();
  const first = !meMarker;
  if (first) {
    meMarker = L.marker(me, { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 2000, interactive: false }).addTo(map);
    meCircle = L.circle(me, { radius: meAcc, color: '#2b8cff', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map);
  } else { meMarker.setLatLng(me); meCircle.setLatLng(me).setRadius(meAcc); }
  setGps('GPS ±' + Math.round(meAcc) + ' m', meAcc > 100 ? 'warn' : 'on');
  if (first) map.setView(me, Math.max(map.getZoom(), 15)); else if (follow) map.panTo(me, { animate: true });
  checkAlerts(); refreshNearby();
}
function onErr(err) {
  const msg = err.code === 1 ? 'Location is blocked. Allow location for this site in the browser or phone settings, then tap Start.' : err.code === 3 ? 'Still looking for GPS… check you are outdoors or near a window.' : 'Location error' + (err.message ? ': ' + err.message : '') + '. Still trying.';
  if (err.code === 1) { stop(); setGps('Location blocked', 'err'); toast(msg, 7000); }
  else { setGps(me ? 'GPS weak' : 'Searching…', 'warn'); if (!me) toast(msg, 5000); }
}
async function lockScreen() {
  try { if ('wakeLock' in navigator && running && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* not allowed */ }
}
function start() {
  if (!navigator.geolocation) { toast('This browser cannot share location.'); return; }
  if (running) return;
  running = true; follow = true; $('#recenter').hidden = true;
  const b = $('#start'); b.textContent = '■ Stop'; b.classList.add('running'); setGps('Finding you…', 'warn');
  watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  lockScreen();
  if (S.chime) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* ignore */ } }
}
function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null; running = false;
  const b = $('#start'); b.textContent = '▶ Start'; b.classList.remove('running');
  if (me) setGps('Stopped', 'off'); else setGps('GPS off', 'off');
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null;
  $('#recenter').hidden = true;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && running && !wakeLock) lockScreen(); });
$('#start').onclick = () => (running ? stop() : start());
map.on('dragstart', () => { if (running && follow) { follow = false; $('#recenter').hidden = false; } });
$('#recenter').onclick = () => { follow = true; $('#recenter').hidden = true; if (me) map.setView(me, Math.max(map.getZoom(), 15)); };

// ---------- controls
document.querySelectorAll('.rad button').forEach((b) => {
  b.classList.toggle('on', +b.dataset.r === S.radius);
  b.onclick = () => { S.radius = +b.dataset.r; saveS(); document.querySelectorAll('.rad button').forEach((x) => x.classList.toggle('on', x === b)); checkAlerts(); refreshNearby(); toast('Alerting within ' + (S.radius === 0.25 ? '¼' : S.radius === 0.5 ? '½' : S.radius) + ' mile', 1800); };
});
document.querySelectorAll('.chip').forEach((b) => {
  const k = b.dataset.k; b.classList.toggle('on', !!S.show[k]); b.setAttribute('aria-pressed', !!S.show[k]);
  b.onclick = () => { S.show[k] = !S.show[k]; saveS(); b.classList.toggle('on', S.show[k]); b.setAttribute('aria-pressed', S.show[k]); drawPins(); checkAlerts(); };
});
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
  const inR = me ? list.filter((x) => x.d <= S.radius && !inactive(x.p)).length : 0;
  const head = me ? '<p class="note">Sorted by distance from you. ' + inR + ' inside your ' + S.radius + ' mi alert radius.</p>' : '<p class="note">Tap <b>Start</b> to measure from your GPS. For now this is sorted from the middle of the map.</p>';
  $('#sh-body').innerHTML = head + (list.map((x) => '<div class="item"><div>' + tagHtml(x.p) + '</div><div class="t">' + esc(x.p.name) + '</div><div class="m"><span class="dist">' + esc(fmtDist(x.d)) + ' ' + compass(x.b) + '</span> · ' + esc(x.p.addr) + '</div>'
    + '<div class="it-act"><a class="btn p sm g" target="_blank" rel="noopener" href="' + dirUrl(x.p) + '">Directions</a><button class="btn sm g" data-det="' + esc(x.p.id) + '">Details</button><button class="btn sm" data-see="' + esc(x.p.id) + '">Map</button></div></div>').join('') || '<p>Nothing to show with these filters.</p>');
  bindItems();
}
function bindItems() {
  document.querySelectorAll('[data-det]').forEach((b) => { b.onclick = () => showDetails(b.dataset.det); });
  document.querySelectorAll('[data-see]').forEach((b) => { b.onclick = () => { const p = PINS.find((x) => x.id === b.dataset.see); closeSheet(); follow = false; if (running) $('#recenter').hidden = false; map.setView([p.lat, p.lon], 17); }; });
}
$('#nearby').onclick = () => { openSheet('nearby', 'Nearby', ''); renderNearby(); };
function showDetails(id) {
  const p = PINS.find((x) => x.id === id); if (!p) return;
  let h = '<div>' + tagHtml(p) + '</div><div class="addr" style="margin-top:8px">' + esc(p.name) + '</div><p class="muted">' + esc(p.addr) + '</p>';
  if (p.price) h += '<p><b>' + esc(p.price) + '</b></p>';
  h += '<p class="muted">Status: ' + esc(p.status) + '</p>';
  if (p.hook) h += '<p>' + esc(p.hook) + '</p>';
  if (p.photo) h += '<a href="' + esc(p.photo) + '" target="_blank" rel="noopener"><img class="photo" src="' + esc(p.photo) + '" alt="' + esc(p.photo_cap || 'Field photo') + '" loading="lazy"></a><p class="note">' + esc(p.photo_cap || 'Field photo') + '</p>';
  if (p.field) h += '<div class="fact"><b>Field note:</b> ' + esc(p.field) + '</div>';
  if (p.cat === 'lead' || p.cat === 'unverified') h += '<p class="note">Unverified: needs a second story source and a live listing check before it counts as a Twisted Deed or Strong Story.' + (p.conf ? ' Confidence: ' + esc(p.conf) + '.' : '') + '</p>';
  if (p.cat === 'context') h += '<p class="note">Context only: not for sale and not part of the archive.</p>';
  if (p.asof) h += '<p class="note">Checked ' + esc(p.asof) + '.</p>';
  h += '<div class="row"><a class="btn p g" target="_blank" rel="noopener" href="' + dirUrl(p) + '">Directions</a>';
  if (p.app) h += '<a class="btn g" href="../#/l/' + encodeURIComponent(p.id) + '">Open in app</a>';
  h += '</div><div class="row">';
  if (p.find) h += '<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent(p.addr + ' for sale') + '">Find listing</a>';
  (p.src || []).slice(0, 3).forEach((s, i) => { h += '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(s) + '">Source ' + (i + 1) + '</a>'; });
  h += '</div>';
  openSheet('details', 'Details', h);
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
  const own = PINS.map((p) => ({ p, m: hav(lat, lon, p.lat, p.lon) * 1609.34 })).filter((x) => x.m <= 150 && !x.p.approx).sort((a, b) => a.m - b.m);
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
    own.forEach((x) => { h += '<div class="item"><div>' + tagHtml(x.p) + '</div><div class="t">' + esc(x.p.name) + '</div><div class="m"><span class="dist">' + Math.round(x.m) + ' m</span> · ' + esc(x.p.addr) + '</div><p style="margin:6px 0 0">' + esc(x.p.hook) + '</p><div class="it-act"><button class="btn sm g" data-det="' + esc(x.p.id) + '">Details</button></div></div>'; });
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
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) updateBar(); });
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).then((reg) => {
    reg.update().catch(() => {});
    if (reg.waiting && had) updateBar();
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateBar(); }); });
  }).catch(() => {});
}

// ---------- boot
paintLeads();
loadPins().then((src) => { drawPins(); window.__tdLive = { pins: PINS.length, src }; document.documentElement.dataset.ready = '1'; });
window.__tdLiveDebug = { get state() { return { running, me, alerted: [...alerted], queue: [...queue], showing }; } };
})();
