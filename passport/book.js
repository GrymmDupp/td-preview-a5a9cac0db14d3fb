// Twisted Passport book (2026-11-21). Reads this device's stamps (and the account's, once synced) and lays them out
// as leather-bound pages: every stamp, then sets by town, county, theme and collection with honest progress.
// Empty slots are real places from the app's own feed that you have not passed yet. No sample stamps, no fake counts.
import * as P from '../js/passport.js';
import { moonPhase } from '../js/world.js';
import * as A from '../js/ancestors.js';

const $ = (s) => document.querySelector(s);
const esc = P.esc;
let catalog = new Map(), tab = 'all', sets = [];
const GHOSTS = 12;

function toast(t, ms) { const el = $('#pp-toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 3500); }
const list = () => P.enrich(P.stamps(), catalog).sort((a, b) => String(b.at).localeCompare(String(a.at)));
const place = (s) => P.placeLine(s);
const cutText = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 20).replace(/\s+\S*$/, '') + '…' : s; };
const fig = (s) => '<figure class="pp-tap" data-open="' + esc(s.id) + '" tabindex="0" role="button" aria-label="Open the card for ' + esc(P.noAddr(s.name) || 'this stamp') + '">' + P.stampSvg(s, { size: 124 }) + '<figcaption>' + esc(s.layer === 'scout' ? 'Scout: ' + s.name : P.noAddr(s.name)) + '<small>' + esc([place(s), P.fmtDate(s.at)].filter(Boolean).join(' · ')) + '</small>'
  + (s.tier === 'wax' ? '<small class="pp-wax">Wax seal</small>' : '') + ((s.rare || []).length ? '<small>Rare: ' + esc(s.rare.map((r) => P.RARE[r]).join(', ')) + '</small>' : '') + (s.first ? '<small><b>First to find</b></small>' : '') + '</figcaption></figure>';
const ghost = (m) => '<figure class="ghost">' + P.stampSvg(m, { size: 124, ghost: true }) + '<figcaption>' + esc(P.noAddr(m.name)) + '<small>' + esc(place(m) || 'Not stamped yet') + '</small></figcaption></figure>';

// Family stamps (Ancestors Trail): the reader's own family places, from their private tree. Never synced to passport_stamps.
function famList() {
  if (A.state.status !== 'ready') return [];
  return A.familyStamps().map((f) => { const pl = A.state.tree.places[f.place]; const parts = pl.lb.split(', ');
    return { id: f.id, place: f.place, name: pl.q === 'cemetery' ? pl.cm : parts[0], town: pl.q === 'cemetery' ? parts[1] || '' : parts.length > 2 ? parts[1] : '', state: parts[parts.length - 1], layer: 'family', at: f.at, rare: [], fam: true }; });
}
const famFig = (s) => '<figure class="pp-tap" data-fam="' + s.place + '" tabindex="0" role="button" aria-label="Open the family card for ' + esc(s.name) + '">' + P.stampSvg(s, { size: 124 }) + '<figcaption>' + esc(s.name) + '<small>' + esc([s.town, s.state].filter(Boolean).join(', ')) + '</small></figcaption></figure>';
function openFam(i) {
  const pl = A.state.tree.places[i]; if (!pl) return;
  const rows = A.peopleAt(i).map(([pid, k]) => { const p = A.state.byId.get(pid); return { p, e: p.e[k] }; });
  $('#pp-card-in').innerHTML = '<h2 id="pp-card-h">' + esc(pl.lb) + '</h2><p class="muted">' + esc(A.precisionNote(pl)) + '</p><ul>' + rows.slice(0, 30).map(({ p, e }) => '<li><b>' + esc(p.n) + '</b>' + (A.rel(p.i) ? ', ' + esc(A.rel(p.i)) : '') + '<br><small>' + esc(A.evLabel(e) + (e[1] ? ' ' + e[1] : '')) + '</small></li>').join('') + '</ul>'
    + '<p class="row"><a class="btn" href="../ancestors/#p=' + i + '">Open in Ancestors Trail</a><button class="btn ghost" id="pp-card-x">Close</button></p>';
  $('#pp-card').showModal(); $('#pp-card-x').onclick = () => $('#pp-card').close();
}
function wireFam(root) { root.querySelectorAll('[data-fam]').forEach((f) => { f.onclick = () => openFam(+f.dataset.fam); f.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFam(+f.dataset.fam); } }; }); }

function render() {
  const all = list();
  const fam = famList();
  sets = P.computeSets(catalog, all);
  const done = sets.filter((s) => s.complete).length;
  if ($('#pp-reader').open) paintReader(0);
  const rk = P.ranks(all);
  $('#pp-stats').innerHTML = '<div><b>' + all.length + '</b>' + (all.length === 1 ? 'stamp' : 'stamps') + '</div><div><b>' + rk.wax + '</b>' + (rk.wax === 1 ? 'wax seal' : 'wax seals') + '</div><div><b>' + sets.filter((s) => s.kind === 'town').length + '</b>towns started</div><div><b>' + done + '</b>' + (done === 1 ? 'set' : 'sets') + ' complete</div>';
  const rankEl = $('#pp-rank');
  if (rankEl) {
    const left = rk.next ? rk.next.need - rk.wax : 0;
    rankEl.innerHTML = '<p class="pp-rank-line"><b>' + (rk.current ? 'Rank: ' + esc(rk.current.name) : 'No rank yet.') + '</b>'
      + (rk.next ? ' ' + left + ' more wax seal' + (left === 1 ? '' : 's') + ' to become a ' + esc(rk.next.name) + '.' : (rk.current ? ' Every rank is earned.' : ' Stop at 5 places for Wanderer.')) + '</p>'
      + (rk.badges.length ? '<p class="pp-badges">' + rk.badges.map((x) => '<span class="pp-badge">' + esc(x.name) + '</span>').join(' ') + '</p>' : '')
      + '<p class="muted small">A drive-by leaves ink. Stay about 3 minutes at walking speed, or take a photo from the public road, and it becomes a wax seal. Seals count toward Wanderer, Pilgrim and Keeper.</p>';
  }
  const kinds = [['all', 'Every stamp'], ['family', 'Family'], ['town', 'Towns'], ['county', 'Counties'], ['layer', 'Markers & cemeteries'], ['theme', 'Themes'], ['collection', 'Collections']].filter(([k]) => k === 'all' || (k === 'family' ? A.state.status === 'ready' : sets.some((s) => s.kind === k)));
  if (!kinds.some(([k]) => k === tab)) tab = 'all';
  $('#pp-tabs').innerHTML = kinds.map(([k, t]) => '<button role="tab" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' + t + '</button>').join('');
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(); }; });
  const pages = $('#pp-pages');
  if (tab === 'family') {
    const n = A.mappedPlaces().length;
    pages.innerHTML = '<article class="pp-page"><span class="pp-kind">Family</span><h2>Your ancestors’ places</h2><div class="pp-prog"><span class="pp-bar"><i style="width:' + Math.round(100 * fam.length / Math.max(1, n)) + '%"></i></span><span>' + fam.length + ' of ' + n.toLocaleString() + ' family places visited</span></div>'
      + (fam.length ? '<div class="pp-grid">' + fam.map(famFig).join('') + '</div>' : '<p>No family stamps yet. With the <a href="../live/">live map</a> running, reach any of your family’s places (a grave, a home town, a county) and its stamp lands here.</p>')
      + '<div class="pp-actions"><a class="btn" href="../ancestors/">Open the Ancestors Trail</a></div><p class="muted small">Only you can see your family stamps.</p></article>';
    wireFam(pages);
    return;
  }
  if (!all.length) {
    pages.innerHTML = '<article class="pp-page pp-empty"><h2>No stamps yet</h2><p>Your first page is waiting. Open the live map, press <b>Start</b>, and drive past any pin.</p>'
      + '<div class="pp-actions" style="justify-content:center"><a class="btn" href="../live/">Open the live map</a></div></article>';
    return;
  }
  if (tab === 'all') {
    pages.innerHTML = '<article class="pp-page"><span class="pp-kind">Every stamp</span><h2>Newest first</h2><div class="pp-prog">' + all.length + ' ' + (all.length === 1 ? 'place' : 'places') + ' stamped</div><div class="pp-grid">' + all.map(fig).join('') + '</div></article>'
      + (sets.length ? '<article class="pp-page"><span class="pp-kind">Sets in progress</span><h2>Where to next</h2><ul class="pp-prog-list">' + sets.slice(0, 12).map((S) => '<li>' + esc(P.progressText(S)) + (S.complete ? ' · complete' : '') + '</li>').join('') + '</ul></article>' : '');
    wireTaps(pages);
    return;
  }
  pages.innerHTML = sets.filter((S) => S.kind === tab).map((S, i) => {
    const got = [...S.got.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const miss = S.open ? [] : [...S.places.values()].filter((m) => !S.got.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
    const pct = S.open ? 100 : Math.round(100 * S.got.size / S.total);
    return '<article class="pp-page" data-set="' + esc(S.key) + '">' + (S.complete ? '<div class="pp-seal">' + P.sealSvg(84) + '</div>' : '')
      + '<span class="pp-kind">' + esc({ town: 'Town', county: 'County', layer: 'Markers & cemeteries', theme: 'Theme', collection: 'Collection' }[S.kind]) + '</span><h2>' + esc(S.label) + '</h2>'
      + '<div class="pp-prog">' + (S.open ? '' : '<span class="pp-bar"><i style="width:' + pct + '%"></i></span>') + '<span>' + esc(P.progressText(S)) + (S.complete ? ' · set complete' : '') + '</span></div>'
      + '<div class="pp-grid">' + got.map(fig).join('') + miss.slice(0, GHOSTS).map(ghost).join('') + '</div>'
      + (miss.length > GHOSTS ? '<p class="pp-more">+ ' + (miss.length - GHOSTS) + ' more to find</p>' : '')
      + '<div class="pp-actions"><button class="btn" data-share="' + i + '">Share this page</button></div></article>';
  }).join('');
  wireTaps($('#pp-pages'));
  const mine = sets.filter((S) => S.kind === tab);
  document.querySelectorAll('[data-share]').forEach((b) => { b.onclick = () => share(mine[+b.dataset.share], b); });
}

async function share(S, btn) {
  btn.disabled = true;
  try {
    const c = await P.shareCard(S);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const url = URL.createObjectURL(blob);
    $('#pp-share-img').src = url; $('#pp-share-dl').href = url;
    const file = new File([blob], 'twisted-passport.png', { type: 'image/png' });
    const can = navigator.canShare && navigator.canShare({ files: [file] });
    $('#pp-share-go').hidden = !can;
    $('#pp-share-go').onclick = async () => { try { await navigator.share({ files: [file], title: 'My Twisted Passport', text: P.progressText(S) + ' · Twisted Deeds' }); } catch { /* cancelled */ } };
    $('#pp-share').showModal();
  } catch (e) { toast('Could not make the card: ' + e.message); }
  finally { btn.disabled = false; }
}
$('#pp-share-x').onclick = () => $('#pp-share').close();

// ---- Tap a stamp: that place's card (2026-11-23). Only what the app already shows publicly. Private homes: area only,
// no street, no photo, no story text that could name the house; a stay-on-the-road reminder instead.
function wireTaps(root) {
  root.querySelectorAll('[data-open]').forEach((f) => {
    f.onclick = () => openCard(f.dataset.open);
    f.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(f.dataset.open); } };
  });
}
const LAYER_NAME = { listing: 'For sale now', archive: 'From the Archive', marker: 'Historical marker', cemetery: 'Cemetery', lead: 'Twisted place', place: 'Twisted place', scout: 'Scout stamp' };
const unwritten = (r) => !!r && [r.story_status, r.storyStatus].some((v) => String(v || '').toLowerCase() === 'unwritten');
function openCard(id) {
  const s = list().find((x) => x.id === id); if (!s) return;
  const r = P.RAW.get(id) || null, priv = !!(s.priv || r?.privateHome || r?.townOnly);
  const name = s.layer === 'scout' ? s.name : priv ? (s.area || P.placeLine(s) || 'A private home') : P.noAddr(s.name);
  const story = priv || !r ? '' : String(r.preview?.summary || r.preview?.teaser || r.hook || r._pinInfo?.hook || '').trim();
  const inApp = r && !r._pin && s.layer !== 'scout';      // a feed or Archive record with its own page in the app
  const meta = [P.placeLine(s) === name ? '' : P.placeLine(s), s.county && !(P.placeLine(s) || '').includes(s.county) ? s.county : ''].filter(Boolean).join(' · ');
  const rare = (s.rare || []).map((x) => P.RARE[x]).filter(Boolean);
  let h = '<div class="pp-card-stamp">' + P.stampSvg(s, { size: 180 }) + '</div>'
    + '<span class="pp-kind">' + esc(LAYER_NAME[s.layer] || 'Twisted place') + (priv ? ' · private home' : '') + '</span>'
    + '<h2 id="pp-card-h">' + esc(name) + '</h2>' + (meta && meta !== name ? '<p class="pp-card-where">' + esc(meta) + '</p>' : '')
    + '<p class="pp-card-when">' + (s.tier === 'wax' ? 'Wax seal' : 'Ink stamp') + ' · ' + esc(P.fmtDate(s.tier === 'wax' ? (s.sealedAt || s.at) : s.at)) + (rare.length ? ' · <b>Rare: ' + esc(rare.join(', ')) + '</b>' : '') + (s.first ? ' · <b>First to find</b>' : '') + '</p>';
  if (s.tier === 'wax' && s.sealPhoto) h += '<figure class="pp-seal-photo"><img src="' + esc(s.sealPhoto) + '" alt="Your photo from the public road"><figcaption>Your photo from the public road</figcaption></figure>';
  if (s.layer === 'scout') h += '<p>Your tip about this place was approved after a check against public records. Thank you for scouting.</p>';
  else if (unwritten(r)) h += '<p><b>We haven’t found this place’s story yet.</b></p><p><a class="btn" href="../live/#suggest=' + encodeURIComponent(id) + '">Know this place? Tell us</a></p>';
  else if (story) h += '<p class="pp-card-story">' + esc(cutText(story, 420)) + '</p>';
  if (s.tier === 'wax' && !priv) {
    const teaser = String(r?.preview?.teaser || '').trim();
    const loreLine = String(Array.isArray(r?.lore) ? (r.lore[0]?.text || r.lore[0] || '') : '').trim();
    const lore = (teaser && teaser !== story) ? teaser : (loreLine && loreLine !== story ? loreLine : '');
    if (lore) h += '<p class="pp-card-lore"><span class="pp-kind">Lore, unlocked with your wax seal</span> ' + esc(cutText(lore, 360)) + '</p>';
    else h += '<p class="pp-card-lore muted small">Your wax seal is in the book. Lore for this place will show here when we have a line to share.</p>';
  } else if (s.tier !== 'wax' && s.layer !== 'scout') {
    h += '<p class="muted small">Ink from a drive-by. Stay about 3 minutes, or add a photo from the public road, to earn a wax seal and unlock a lore line on this page.</p>';
  }
    if (priv) h += '<p class="pp-warn">This is a private home with people living in it. Only its area is shown. Stay on the public road: don’t stop, park, knock or go onto the property.</p>';
  h += '<p class="pp-card-count muted small" id="pp-card-count"></p><p class="row">'
    + (inApp ? '<a class="btn p" href="../#/l/' + encodeURIComponent(id) + '">' + (s.layer === 'archive' ? 'Read its story' : 'Open its page') + '</a>' : '')
    + (!priv && isFinite(s.lat) && isFinite(s.lon) ? '<a class="btn" href="https://www.openstreetmap.org/?mlat=' + s.lat + '&mlon=' + s.lon + '#map=17/' + s.lat + '/' + s.lon + '" target="_blank" rel="noopener">Where it is ↗</a>' : '')
    + '<a class="btn" href="../live/">Live map</a><button class="btn ghost" id="pp-card-x">Close</button></p>';
  const d = $('#pp-card'); $('#pp-card-in').innerHTML = h; $('#pp-card-x').onclick = () => d.close();
  if (!d.open) d.showModal();
  if (s.layer !== 'scout') P.counts([id]).then((m) => { const n = m && (m.get ? m.get(id) : m[id]); const el = $('#pp-card-count'); if (el && n > 0) el.textContent = P.countLine(n); }).catch(() => {});
}
$('#pp-card').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

// ---- Open the book: earned stamps as pages (2026-11-23). Oldest first, like the paper passport: a title page,
// then four stamps to a page. Swipe, arrow keys or the page buttons turn pages; tap a stamp for its card.
const PER = 4;
let pg = 0;
function readerPages() {
  const all = list().slice().reverse();
  const rk = P.ranks(all);
  const out = ['<div class="pp-leaf pp-title-leaf"><div class="pp-leaf-in"><span class="pp-kind">Twisted Passport</span><h2>This passport has traveled</h2>'
    + '<p class="pp-big">' + all.length + '</p><p>' + (all.length === 1 ? 'stamp' : 'stamps') + (all.length ? ' since ' + esc(P.fmtDate(all[0].at)) : '') + (rk.wax ? ' · ' + rk.wax + ' wax ' + (rk.wax === 1 ? 'seal' : 'seals') : '') + '</p>'
    + (rk.current ? '<p class="pp-rank-line"><b>' + esc(rk.current.name) + '</b></p>' : '')
    + (rk.badges.length ? '<p class="pp-badges">' + rk.badges.map((x) => '<span class="pp-badge">' + esc(x.name) + '</span>').join(' ') + '</p>' : '')
    + (all.length ? '<p class="muted-ink">Turn the page to see them. Tap any stamp to open its place. Wax seals show your photo and a lore line.</p>' : '<p class="muted-ink">No stamps yet. Open the live map, press Start, and drive past any pin. Your first page is waiting.</p>') + '</div></div>'];
  for (let i = 0; i < all.length; i += PER) {
    const n = out.length;
    out.push('<div class="pp-leaf"><div class="pp-leaf-in"><div class="pp-leaf-grid">' + all.slice(i, i + PER).map((s) => '<button class="pp-leaf-stamp" data-open="' + esc(s.id) + '" aria-label="Open the card for ' + esc(P.noAddr(s.name) || 'this stamp') + '" style="--r:' + (((s.id.length * 7 + i) % 9) - 4) + 'deg">'
      + P.stampSvg(s, { size: 128 }) + '<small>' + (s.tier === 'wax' ? 'Wax · ' : '') + esc(P.fmtDate(s.at)) + '</small></button>').join('') + '</div><span class="pp-folio">' + n + '</span></div></div>');
  }
  return out;
}
function paintReader(dir) {
  const pages = readerPages(); pg = Math.max(0, Math.min(pg, pages.length - 1));
  const body = $('#pp-reader-pages');
  body.innerHTML = pages[pg]; body.className = 'pp-reader-pages' + (dir ? ' turn-' + (dir > 0 ? 'next' : 'prev') : '');
  $('#pp-reader-n').textContent = pg === 0 ? 'Title page' : 'Page ' + pg + ' of ' + (pages.length - 1);
  $('#pp-prev').disabled = pg === 0; $('#pp-next').disabled = pg >= pages.length - 1;
  wireTaps(body);
}
function openBook() { pg = 0; paintReader(0); const d = $('#pp-reader'); if (!d.open) d.showModal(); $('#pp-next').focus(); }
const turn = (k) => { const before = pg; pg += k; paintReader(k); if (pg === before) paintReader(0); };
document.querySelector('.pp-book').onclick = openBook;
document.querySelector('.pp-book').style.cursor = 'pointer';
$('#pp-prev').onclick = () => turn(-1); $('#pp-next').onclick = () => turn(1);
$('#pp-reader-x').onclick = () => $('#pp-reader').close();
$('#pp-reader').addEventListener('keydown', (e) => { if ($('#pp-card').open) return; if (e.key === 'ArrowRight') turn(1); if (e.key === 'ArrowLeft') turn(-1); });
{ let x0 = null; const el = $('#pp-reader-pages');
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) turn(dx < 0 ? 1 : -1); }, { passive: true }); }

function tonight() {
  const m = moonPhase(), now = new Date(), parts = [];
  if (m.full) parts.push('the moon is full'); if (now.getMonth() === 9) parts.push('it’s October');
  $('#pp-tonight').textContent = 'Rare stamps only come from real conditions: after dark, under a full moon, or in October. Tonight’s moon: ' + m.name.toLowerCase() + '.'
    + (parts.length ? ' Right now ' + parts.join(' and ') + ', so new stamps come out rare.' : '');
}
function paintSync() {
  const n = P.stamps().length, st = P.remote.status;
  $('#pp-sync').textContent = st === 'on' ? 'Synced with your account, so your stamps follow you to any phone you sign in on.'
    : st === 'signed-out' ? 'Saved on this phone. Sign in on the Account page to keep your passport on all your devices.'
      : 'Saved on this phone.' + (n ? '' : '');
}
async function boot() {
  const show = $('#pp-show'); show.checked = P.showOnMap(); show.onchange = () => { P.setShowOnMap(show.checked); toast(show.checked ? 'Stamps will show on the live map.' : 'The live map will stay clean.'); };
  $('#pp-clear').onclick = () => { if (confirm('Clear every stamp saved on this phone? Stamps already synced to your account come back when you sign in.')) { P.clearDevice(); render(); } };
  tonight(); paintSync(); render();
  catalog = await P.loadCatalog('../').catch(() => new Map()); render();
  await P.backend(); paintSync();
  A.init().then(() => render()).catch(() => {});
  window.addEventListener('td-family-stamp', () => render());
  if (P.remote.status === 'on') { await P.sync().catch(() => null); render(); }
  document.documentElement.dataset.ready = '1';
}
// Debug line: which app version this phone is running (the service worker's cache name) and the newest one online.
async function paintVersion() {
  const el = $('#pp-ver'); if (!el) return;
  let have = '', latest = '';
  try { have = (await caches.keys()).map((k) => (k.match(/^(td-pwa-\d{8}-\d{6})-shell$/) || [])[1]).filter(Boolean).sort().pop() || ''; } catch { /* no caches */ }
  const ctl = navigator.serviceWorker && navigator.serviceWorker.controller ? '' : ' (not installed offline)';
  el.textContent = 'App version: ' + (have || 'unknown') + ctl + ' · stamps on this phone: ' + P.stamps().length;
  try { latest = ((await (await fetch('../sw.js', { cache: 'no-store' })).text()).match(/VERSION = '(td-pwa-[\d-]+)'/) || [])[1] || ''; } catch { /* offline */ }
  if (latest && !have) el.textContent = 'App version: ' + latest + ' (straight from the web)' + ' · stamps on this phone: ' + P.stamps().length;
  if (latest && have && latest !== have) {
    el.innerHTML = esc(el.textContent) + ' · <b>update ready (' + esc(latest) + ')</b> <button class="btn sm" id="pp-reload">Reload</button>';
    $('#pp-reload').onclick = () => location.reload();
  }
}
paintVersion();
window.addEventListener('storage', (e) => { if (e.key === 'td-passport') render(); });
boot();
