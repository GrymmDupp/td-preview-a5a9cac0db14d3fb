// Installable app (PWA): service worker registration, "Install the app" button / card, iOS
// "Add to Home Screen" instructions, and a quiet "new version ready" notice.
// Entry points in the page: any element with data-install-app opens the install flow;
// elements with data-install-entry are hidden once the app is installed or running standalone.
import { esc, toast } from './util.js';

const LS_DISMISS = 'td-install-dismissed';
const LS_INSTALLED = 'td-installed';
const LS_FIRSTRUN = 'td-firstrun-dismissed';
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isSamsung = /SamsungBrowser/i.test(ua);
const isFirefox = /Firefox|FxiOS/i.test(ua);
const isEdge = /Edg(e|A|iOS)?\//.test(ua);
const isChromium = /Chrome|Chromium|CriOS/.test(ua) && !isSamsung;
const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg\/|Firefox/.test(ua);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let deferred = null;   // the saved beforeinstallprompt event (Chrome, Edge, Samsung Internet, Android)
let card = null;

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: window-controls-overlay)').matches || window.navigator.standalone === true;

function setState() {
  const b = document.body.classList;
  b.toggle('pwa-standalone', isStandalone());
  b.toggle('pwa-installed', ls.get(LS_INSTALLED) === '1');
  b.toggle('pwa-can-prompt', !!deferred);
  b.toggle('pwa-ios', isIOS);
  const head = document.getElementById('install-head');
  if (head) head.hidden = isStandalone() || ls.get(LS_INSTALLED) === '1' || !(deferred || isIOS);
}

// ---------- sheets
const SHARE_ICON = '<svg class="ios-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ADD_ICON = '<svg class="ios-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function sheet(inner) {
  const d = document.createElement('dialog'); d.className = 'modal install-sheet'; d.innerHTML = inner;
  document.body.appendChild(d); d.showModal();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  return d;
}
const head = (title) => `<div class="install-head-row"><img src="icons/icon-192.png" alt="" width="48" height="48"><div><h2>${esc(title)}</h2><p class="small muted">Opens full screen from your home screen, like an app.</p></div></div>`;

function iosSheet() {
  const ipad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  sheet(`${head('Add Twisted Deeds to your Home Screen')}
    <ol class="install-steps">
      <li>Tap the <b>Share</b> button ${SHARE_ICON} ${ipad ? 'at the top of Safari' : 'in Safari’s toolbar at the bottom of the screen'}.</li>
      <li>Scroll down and choose <b>Add to Home Screen</b> ${ADD_ICON}.</li>
      <li>Tap <b>Add</b>. Twisted Deeds appears on your Home Screen.</li>
    </ol>
    <p class="small muted">In Chrome or another browser on ${ipad ? 'iPad' : 'iPhone'}, the Share button is in the address bar; the steps are the same. Don’t see “Add to Home Screen”? Open this page in Safari.</p>
    <div class="row"><button class="btn" data-close>Got it</button></div>`);
}

function otherSheet() {
  let main;
  if (isMacSafari) main = 'In Safari on a Mac, open the <b>File</b> menu (or the <b>Share</b> button) and choose <b>Add to Dock</b>. Needs macOS Sonoma or later.';
  else if (isSamsung) main = 'Open the menu <b>☰</b> at the bottom, then <b>Add page to</b> › <b>Home screen</b>.';
  else if (isFirefox && isAndroid) main = 'Open the menu <b>⋮</b>, then <b>Install</b> or <b>Add to Home screen</b>.';
  else if (isFirefox) main = 'Firefox on a computer can’t install web apps. Open this page in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b> to install it, or bookmark it here.';
  else if (isAndroid) main = 'Open the browser menu <b>⋮</b>, then <b>Install app</b> or <b>Add to Home screen</b>.';
  else if (isEdge) main = 'Click the install icon at the right end of the address bar, or open the menu <b>…</b> › <b>Apps</b> › <b>Install this site as an app</b>.';
  else if (isChromium) main = 'Click the install icon <b>⊕</b> at the right end of the address bar, or open the menu <b>⋮</b> › <b>Cast, save and share</b> › <b>Install page as app</b>.';
  else main = 'Open your browser’s menu and look for <b>Install</b>, <b>Add to Home screen</b> or <b>Add to Dock</b>.';
  sheet(`${head('Install Twisted Deeds')}
    <p>${main}</p>
    <details class="small"><summary>Other browsers</summary><ul class="install-other">
      <li><b>iPhone / iPad:</b> Share › Add to Home Screen.</li>
      <li><b>Android (Chrome):</b> menu ⋮ › Install app.</li>
      <li><b>Samsung Internet:</b> menu ☰ › Add page to › Home screen.</li>
      <li><b>Chrome or Edge on a computer:</b> the install icon in the address bar.</li>
      <li><b>Safari on a Mac:</b> File › Add to Dock.</li></ul></details>
    <div class="row"><button class="btn" data-close>Got it</button></div>`);
}

export async function startInstall() {
  if (isStandalone()) { toast('You’re already in the Twisted Deeds app.'); return; }
  if (deferred) {
    const ev = deferred; deferred = null; setState();
    try { await ev.prompt(); const { outcome } = await ev.userChoice; if (outcome !== 'accepted') ls.set(LS_DISMISS, String(Date.now())); }
    catch (e) { otherSheet(); }
    hideCard(); return;
  }
  hideCard();
  if (isIOS) iosSheet(); else otherSheet();
}

// ---------- dismissible card
function hideCard() { if (card) { card.remove(); card = null; } }
function maybeShowCard() {
  if (strip) return;   // the first-run strip already carries the install link; never stack the two
  if (card || isStandalone() || ls.get(LS_INSTALLED) === '1' || ls.get(LS_DISMISS)) return;
  if (!deferred && !isIOS) return;
  card = document.createElement('aside'); card.className = 'install-card'; card.setAttribute('aria-label', 'Install the app');
  card.innerHTML = `<img src="icons/icon-192.png" alt="" width="44" height="44">
    <div class="ic-text"><b>Keep the archive close</b><span>Install Twisted Deeds on your ${isIOS || isAndroid ? 'home screen' : 'computer'}. It opens like an app, and the archive still opens when the signal drops.</span></div>
    <div class="ic-btns"><button class="btn sm" data-install-app>${isIOS ? 'How to install' : 'Install'}</button><button class="link small" data-install-dismiss>Not now</button></div>`;
  document.body.appendChild(card);
  requestAnimationFrame(() => card?.classList.add('show'));
}

// ---------- first-visit strip (once per browser, remembered in localStorage)
let strip = null;
const installedish = () => isStandalone() || ls.get(LS_INSTALLED) === '1';
function closeStrip() { ls.set(LS_FIRSTRUN, String(Date.now())); strip?.remove(); strip = null; }
export function showFirstRun(price = '$5') {
  if (strip || ls.get(LS_FIRSTRUN)) return;
  strip = document.createElement('aside'); strip.className = 'firstrun'; strip.setAttribute('aria-label', 'Welcome');
  strip.innerHTML = `<p><span class="fr-mark" aria-hidden="true">✦</span> <b>Free preview on every listing.</b> Unlock the full sourced file for ${esc(price)}.<span class="fr-install"${installedish() ? ' hidden' : ''}> <button type="button" class="link" data-firstrun-install>Install to your home screen.</button></span></p>
    <button type="button" class="fr-x" data-firstrun-close aria-label="Dismiss this tip">×</button>`;
  const main = document.getElementById('main'); main.parentNode.insertBefore(strip, main);
  hideCard();
}

// ---------- update notice
function updateNotice() {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div'); bar.className = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>A new version of the archive is ready.</span><button class="btn sm" data-sw-refresh>Refresh</button><button class="link small" data-sw-later aria-label="Dismiss">Later</button>';
  document.body.appendChild(bar);
}

function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  // Local development: no worker (avoids stale caches while editing). Set localStorage td-sw-dev=1 to test it.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && ls.get('td-sw-dev') !== '1') return;
  const hadController = !!navigator.serviceWorker.controller;
  let shown = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !shown) { shown = true; updateNotice(); } });
  const go = () => navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then((reg) => { setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); })
    .catch((e) => console.warn('Service worker not registered', e));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}

export function initPwa() {
  setState();
  registerSW();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e; setState();
    setTimeout(maybeShowCard, 2500);
  });
  window.addEventListener('appinstalled', () => {
    ls.set(LS_INSTALLED, '1'); deferred = null; hideCard(); setState(); strip?.querySelector('.fr-install')?.setAttribute('hidden', '');
    toast('Installed. Twisted Deeds is in your apps.');
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', setState);
  if (isIOS) setTimeout(maybeShowCard, 4000);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-install-app], [data-install-dismiss], [data-sw-refresh], [data-sw-later], [data-firstrun-install], [data-firstrun-close]'); if (!t) return;
    e.preventDefault();
    if ('firstrunClose' in t.dataset) closeStrip();
    else if ('firstrunInstall' in t.dataset) { closeStrip(); startInstall(); }
    else if ('installApp' in t.dataset) startInstall();
    else if ('installDismiss' in t.dataset) { ls.set(LS_DISMISS, String(Date.now())); hideCard(); }
    else if ('swRefresh' in t.dataset) location.reload();
    else if ('swLater' in t.dataset) t.closest('.update-bar')?.remove();
  });
}
