// Apply the reader's interests and area to the live map chips, alerts, and a Show more control.
import { bootPrefs, chipDefaults, hasSoftFilter, prefsSummary, setShowMoreCats, setShowMoreArea, showMoreCats, showMoreArea, interestOn, current, onPrefsChange } from '../js/prefs.js';

const $ = (s) => document.querySelector(s);

function css() {
  if (document.querySelector('link[data-td-prefs-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.tdPrefsCss = '1'; l.href = '../assets/css/prefs.css'; document.head.appendChild(l);
}

function applyChips() {
  const api = window.__tdLiveApi; if (!api || !api.setShowChip) return;
  const d = chipDefaults();
  for (const k of ['deed', 'story', 'lead', 'unverified', 'archive', 'hmark', 'cem']) api.setShowChip(k, !!d[k]);
  api.redraw();
  const fam = $('#anc-chip');
  if (fam && !!fam.classList.contains('on') !== !!d.ancestors) fam.click();
}

function moreButton() {
  if ($('#prefs-live-more') || !hasSoftFilter()) return;
  const row = $('#lyrs') || $('#chips'); if (!row) return;
  const b = document.createElement('button');
  b.id = 'prefs-live-more';
  b.className = 'prefs-live-more' + (showMoreCats() || showMoreArea() ? ' on' : '');
  b.type = 'button';
  const paint = () => {
    const on = showMoreCats() || showMoreArea();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.textContent = on ? 'Showing the rest' : 'Show more';
    b.title = on ? 'Return to your usual picks' : ('Your usual map: ' + (prefsSummary() || 'your picks'));
  };
  paint();
  b.onclick = () => {
    const on = !(showMoreCats() || showMoreArea());
    setShowMoreCats(on); setShowMoreArea(on);
    applyChips();
    paint();
    const api = window.__tdLiveApi;
    if (api && api.toast) api.toast(on ? 'Showing the rest of the map and its alerts.' : 'Back to your usual picks.', 3000);
    api && api.redraw();
  };
  row.parentNode.insertBefore(b, row.nextSibling);
}

function maybeCenter() {
  const api = window.__tdLiveApi, a = current().area;
  if (!api || !api.map || !a || a.everywhere || a.lat == null || a.lon == null) return;
  let last = null;
  try { last = JSON.parse(localStorage.getItem('td_live_last') || 'null'); } catch { /* */ }
  if (last && isFinite(last[0]) && isFinite(last[1])) return;
  const z = a.radius_mi <= 25 ? 10 : a.radius_mi <= 50 ? 9 : a.radius_mi <= 100 ? 8 : 7;
  api.map.setView([a.lat, a.lon], z);
}

async function boot() {
  css();
  try { const { getBackend } = await import('../js/backend/adapter.js'); const be = await getBackend(); await bootPrefs(be); } catch { /* signed out or local */ }
  if (hasSoftFilter() || current().seen) applyChips();
  moreButton();
  maybeCenter();
  onPrefsChange(() => { applyChips(); moreButton(); });
}

if (window.__tdLiveApi) boot(); else window.addEventListener('td-live-api', boot, { once: true });
