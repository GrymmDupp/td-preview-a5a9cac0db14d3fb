// Twisted Passport book (2026-11-21). Reads this device's stamps (and the account's, once synced) and lays them out
// as leather-bound pages: every stamp, then sets by town, county, theme and collection with honest progress.
// Empty slots are real places from the app's own feed that you have not passed yet. No sample stamps, no fake counts.
import * as P from '../js/passport.js';
import { moonPhase } from '../js/world.js';

const $ = (s) => document.querySelector(s);
const esc = P.esc;
let catalog = new Map(), tab = 'all', sets = [];
const GHOSTS = 12;

function toast(t, ms) { const el = $('#pp-toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 3500); }
const list = () => P.enrich(P.stamps(), catalog).sort((a, b) => String(b.at).localeCompare(String(a.at)));
const place = (s) => P.placeLine(s);
const fig = (s) => '<figure>' + P.stampSvg(s, { size: 124 }) + '<figcaption>' + esc(s.layer === 'scout' ? 'Scout: ' + s.name : P.noAddr(s.name)) + '<small>' + esc([place(s), P.fmtDate(s.at)].filter(Boolean).join(' · ')) + '</small>'
  + ((s.rare || []).length ? '<small>Rare: ' + esc(s.rare.map((r) => P.RARE[r]).join(', ')) + '</small>' : '') + (s.first ? '<small><b>First to find</b></small>' : '') + '</figcaption></figure>';
const ghost = (m) => '<figure class="ghost">' + P.stampSvg(m, { size: 124, ghost: true }) + '<figcaption>' + esc(P.noAddr(m.name)) + '<small>' + esc(place(m) || 'Not stamped yet') + '</small></figcaption></figure>';

function render() {
  const all = list();
  sets = P.computeSets(catalog, all);
  const done = sets.filter((s) => s.complete).length;
  $('#pp-stats').innerHTML = '<div><b>' + all.length + '</b>' + (all.length === 1 ? 'stamp' : 'stamps') + '</div><div><b>' + sets.filter((s) => s.kind === 'town').length + '</b>towns started</div><div><b>' + done + '</b>' + (done === 1 ? 'set' : 'sets') + ' complete</div>';
  const kinds = [['all', 'Every stamp'], ['town', 'Towns'], ['county', 'Counties'], ['layer', 'Markers & cemeteries'], ['theme', 'Themes'], ['collection', 'Collections']].filter(([k]) => k === 'all' || sets.some((s) => s.kind === k));
  if (!kinds.some(([k]) => k === tab)) tab = 'all';
  $('#pp-tabs').innerHTML = kinds.map(([k, t]) => '<button role="tab" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' + t + '</button>').join('');
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(); }; });
  const pages = $('#pp-pages');
  if (!all.length) {
    pages.innerHTML = '<article class="pp-page pp-empty"><h2>No stamps yet</h2><p>Your first page is waiting. Open the live map, press <b>Start</b>, and drive past any pin.</p>'
      + '<div class="pp-actions" style="justify-content:center"><a class="btn" href="../live/">Open the live map</a></div></article>';
    return;
  }
  if (tab === 'all') {
    pages.innerHTML = '<article class="pp-page"><span class="pp-kind">Every stamp</span><h2>Newest first</h2><div class="pp-prog">' + all.length + ' ' + (all.length === 1 ? 'place' : 'places') + ' stamped</div><div class="pp-grid">' + all.map(fig).join('') + '</div></article>'
      + (sets.length ? '<article class="pp-page"><span class="pp-kind">Sets in progress</span><h2>Where to next</h2><ul class="pp-prog-list">' + sets.slice(0, 12).map((S) => '<li>' + esc(P.progressText(S)) + (S.complete ? ' · complete' : '') + '</li>').join('') + '</ul></article>' : '');
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
  if (P.remote.status === 'on') { await P.sync().catch(() => null); render(); }
  document.documentElement.dataset.ready = '1';
}
window.addEventListener('storage', (e) => { if (e.key === 'td-passport') render(); });
boot();
