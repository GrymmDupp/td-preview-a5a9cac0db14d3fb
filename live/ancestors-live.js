// Ancestors Trail on the live map (2026-11-27): your own family's places as a toggleable layer (signed-in owner only),
// a nudge when you drive near one ("Your 3rd great-grandfather ... was buried 2 mi ahead"), and a family stamp in your
// passport when you reach it. Same GPS feed and drive-by idea as the Twisted Passport (live/passport-live.js).
import * as A from '../js/ancestors.js';
const $ = (s) => document.querySelector(s);
const esc = A.esc;
const SHOW = 'td-anc-show';
const NEAR_M = 3219;          // 2 mi: nudge for a grave or an exact spot
const STAMP_M = 200;          // reach for an exact spot / cemetery
const GAP_MS = 40000;         // at most one nudge every 40 s
let api = null, lyr = null, on = true, last = null, lastNudge = 0, queue = [];
const told = new Set(JSON.parse(sessionStorage.getItem('td-anc-told') || '[]'));
const R = 6371000;
function meters(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function bearing(a, b, c, d) { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; }
const COL = { exact: '#e6c352', cemetery: '#d7dcd2', town: '#c9a227', township: '#b0813a', county: '#8a5a2c', living: '#7f9a6a' };
const colOf = (pl) => (pl.lv ? COL.living : COL[pl.q] || COL.town);
try { on = localStorage.getItem(SHOW) === '1'; } catch { /* */ }

function draw() {
  if (!lyr) lyr = L.layerGroup().addTo(api.map);
  lyr.clearLayers();
  if (!on || A.state.status !== 'ready') return;
  const T = A.state.tree;
  const idx = A.mappedPlaces().sort((a, b) => (T.places[b].r || 0) - (T.places[a].r || 0));
  for (const i of idx) {
    const pl = T.places[i], got = !!A.state.stamps[A.stampId(i)], c = colOf(pl);
    let m;
    if (pl.q === 'exact' || pl.q === 'cemetery') m = L.circleMarker([pl.la, pl.lo], { radius: 7, color: got ? '#ff4a4a' : '#120d0d', weight: 2, fillColor: c, fillOpacity: 1 });
    else m = L.circle([pl.la, pl.lo], { radius: pl.r, color: got ? '#ff4a4a' : c, weight: 1.3, dashArray: pl.lv ? '6 6' : (pl.q === 'county' ? '2 5' : '4 3'), fillColor: c, fillOpacity: pl.q === 'county' ? 0.04 : 0.1 });
    m.bindTooltip('Family: ' + esc(pl.lb), { sticky: true });
    m.on('click', () => sheet(i));
    lyr.addLayer(m);
  }
}
const nearScore = (p) => { const r = A.rel(p.i); if (!r) return 9; if (/of your|spouse’s/.test(r)) return 6; if (/father|mother|parent/.test(r)) { const g = r.match(/(\d+)(st|nd|rd|th) great/); return /great/.test(r) ? 2 + (g ? +g[1] / 10 : 0) : /grand/.test(r) ? 1.5 : 1; } return 4; };
const evScore = (e) => ({ BURI: 0, DEAT: 1, BIRT: 2, MARR: 3, RESI: 4 }[e[0]] ?? 5);
function best(i) {
  const rows = A.peopleAt(i).map(([pid, k]) => ({ p: A.state.byId.get(pid), e: A.state.byId.get(pid).e[k] }));
  rows.sort((a, b) => nearScore(a.p) - nearScore(b.p) || evScore(a.e) - evScore(b.e));
  return rows;
}
function sheet(i) {
  const pl = A.state.tree.places[i], rows = best(i), got = A.state.stamps[A.stampId(i)];
  api.openSheet('family', 'Your family', '<div><span class="tag">Ancestors Trail</span>' + (got ? ' <span class="tag">Family stamp</span>' : '') + '</div><div class="addr" style="margin-top:8px">' + esc(pl.lb) + '</div><p class="muted">' + esc(A.precisionNote(pl)) + '</p>'
    + '<ul class="anc-l">' + rows.slice(0, 25).map(({ p, e }) => '<li><a href="../ancestors/#i=' + encodeURIComponent(p.i) + '"><b>' + esc(p.n) + '</b></a><br><small>' + esc([A.rel(p.i), A.evLabel(e) + (e[1] ? ' ' + e[1] : '')].filter(Boolean).join(' · ')) + '</small></li>').join('') + '</ul>'
    + (rows.length > 25 ? '<p class="muted">+ ' + (rows.length - 25) + ' more</p>' : '')
    + '<div class="row"><a class="btn p g" href="../ancestors/#p=' + i + '">Open in Ancestors Trail</a>' + (!pl.lv && (pl.q === 'cemetery' || pl.q === 'exact') ? '<a class="btn g" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + pl.la + ',' + pl.lo + '&travelmode=driving">Directions</a>' : '') + '</div>');
}
function miles(m) { const mi = m / 1609.344; return mi < 0.2 ? 'right here' : (mi < 1 ? mi.toFixed(1) : Math.round(mi * 10) / 10) + ' mi'; }
function line(i, d, ahead) {
  const pl = A.state.tree.places[i], top = best(i)[0]; if (!top) return '';
  const what = A.verbLine(top.p, top.e) + (top.e[1] && A.yearOf(top.e[1]) ? ' in ' + A.yearOf(top.e[1]) : '');
  const where = pl.q === 'cemetery' ? ' at ' + pl.cm : pl.q === 'exact' ? '' : ' in ' + pl.lb.split(', ')[0];
  if (pl.q === 'cemetery' || pl.q === 'exact') return what + where + ', ' + miles(d) + (d > 300 ? (ahead ? ' ahead' : ' from here') : '') + '.';
  return 'You’re in ' + pl.lb.split(', ').slice(0, 2).join(', ') + '. ' + what + ' here.';
}
const pl0 = (i) => A.state.tree.places[i];
function nudge(i, d, ahead) {
  const P = window.TDPrefs;
  if (P && !P.showMoreCats() && P.interestOn && !P.interestOn('ancestors')) return;
  if (P && !P.showMoreArea() && P.inArea) {
    const pl = A.state.tree.places[i];
    if (pl && !P.inArea(pl.la, pl.lo, '')) return;
  }
  if (told.has(i)) return; told.add(i); sessionStorage.setItem('td-anc-told', JSON.stringify([...told]));
  const t = line(i, d, ahead); if (!t) return;
  queue.push({ i, t, k: { cemetery: 0, exact: 0, town: 1, township: 2, county: 3 }[pl0(i).q] ?? 2 }); queue.sort((a, b) => a.k - b.k); flush();
}
function flush() {
  if (!queue.length || Date.now() - lastNudge < GAP_MS) { if (queue.length) setTimeout(flush, GAP_MS); return; }
  const { i, t } = queue.shift(); lastNudge = Date.now();
  api.toast('🕯 ' + t, 9000);
  const tEl = $('#toast'); if (tEl) tEl.onclick = () => sheet(i);
  let speak = false; try { speak = !!JSON.parse(localStorage.getItem('td-live-settings') || '{}').speak; } catch { /* */ }
  if (speak && 'speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(t.replace(/ mi\b/g, ' miles')); u.lang = 'en-US'; speechSynthesis.speak(u); } catch { /* */ } }
}
function onFix(pos) {
  if (A.state.status !== 'ready' || !pos || !pos.coords) return;
  const c = pos.coords; if ((c.accuracy || 999) > 150) return;
  const here = [c.latitude, c.longitude];
  const head = c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 3 ? c.heading : (last && meters(last[0], last[1], here[0], here[1]) > 25 ? bearing(last[0], last[1], here[0], here[1]) : null);
  if (!last || meters(last[0], last[1], here[0], here[1]) > 25) last = here;
  const T = A.state.tree, hits = [];
  for (const i of A.mappedPlaces()) {
    const pl = T.places[i];
    if (Math.abs(pl.la - here[0]) > 0.6 || Math.abs(pl.lo - here[1]) > 0.8) continue;
    const d = meters(here[0], here[1], pl.la, pl.lo);
    const spot = pl.q === 'cemetery' || pl.q === 'exact';
    if (spot) {
      if (d <= NEAR_M) { const b = bearing(here[0], here[1], pl.la, pl.lo); const ahead = head != null && Math.abs(((b - head + 540) % 360) - 180) < 50; hits.push({ i, d, ahead, k: 0 }); }
      if (d <= STAMP_M) stamp(i);
    } else if (d <= pl.r) { hits.push({ i, d, ahead: false, k: { town: 1, township: 2, county: 3 }[pl.q] || 2 }); stamp(i); }
  }
  // graves and exact spots first, then towns, townships, counties; closest relatives first within each
  const top = (i) => { const b = best(i)[0]; return b ? nearScore(b.p) : 9; };
  hits.sort((a, b) => a.k - b.k || top(a.i) - top(b.i) || a.d - b.d);
  for (const h of hits) nudge(h.i, h.d, h.ahead);
}
function stamp(i) {
  const s = A.addStamp(i); if (!s) return;
  draw();
  const pl = A.state.tree.places[i];
  setTimeout(() => api.toast('✓ Family stamp: ' + pl.lb.split(', ').slice(0, 2).join(', '), 4000), 9500);
}
function chip() {
  const row = $('#lyrs'); if (!row || $('#anc-chip')) return;
  const b = document.createElement('button'); b.id = 'anc-chip'; b.className = 'chip lchip' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', 'Your Ancestors Trail');
  b.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 18V9M10 9 5 4M10 9l5-5M10 13l-4-3M10 13l4-3" stroke="#c9a227" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="5" cy="4" r="2" fill="#c9a227"/><circle cx="15" cy="4" r="2" fill="#c9a227"/></svg><span>Family</span>';
  b.onclick = () => { on = !on; try { localStorage.setItem(SHOW, on ? '1' : '0'); } catch { /* */ } b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); draw(); api.toast(on ? 'Your family’s places are on the map' : 'Family places hidden', 1800); };
  row.appendChild(b);
}
async function boot() {
  api = window.__tdLiveApi;
  window.TDAncestors = { onFix, onStop() { last = null; } };
  await A.init();
  if (A.state.status !== 'ready') return;
  if (!document.querySelector('style#anc-css')) { const s = document.createElement('style'); s.id = 'anc-css'; s.textContent = '.anc-l{list-style:none;padding:0;margin:8px 0}.anc-l li{padding:6px 0;border-bottom:1px solid #2a2122}.anc-l a{color:#e6c352;text-decoration:none}.anc-l small{color:#a3967f}'; document.head.appendChild(s); }
  chip(); draw();
}
if (window.__tdLiveApi) boot(); else window.addEventListener('td-live-api', boot, { once: true });
window.__tdAncLiveDebug = { get state() { return { status: A.state.status, on, drawn: lyr ? lyr.getLayers().length : 0, told: told.size }; }, onFix };
