// Twisted Deeds "reveals": small Victorian-goth micro-interactions and hidden touches (Nyx, the house
// sigil spider). No libraries. Each one is CSS transform/opacity (or a tiny SVG), removes itself
// when done, and is skipped under Reduce motion or with Effects off (static versions stay usable).
// Sounds are off by default and only play after a user gesture with Sound on.
import { fxOn } from './effects.js';
import { buzz } from './world.js';

const root = document.documentElement;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const json = (k, d) => { try { return JSON.parse(ls.get(k) || 'null') ?? d; } catch { return d; } };
export const calm = () => root.classList.contains('rm') || !fxOn() || matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- sound (off by default) ---------------- */
export const soundOn = () => ls.get('td-snd') === '1';
export const setSound = (on) => ls.set('td-snd', on ? '1' : '0');
let ac = null;
function audio() {
  if (!soundOn()) return null;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; }
}
// A soft breathy whisper: band-passed noise in two "syllables", panned left to right. ~1.7 s.
export function whisper() {
  const a = audio(); if (!a) return false;
  const t = a.currentTime, len = 1.8, buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.4;
  bp.frequency.setValueAtTime(1300, t); bp.frequency.linearRampToValueAtTime(2500, t + 0.45); bp.frequency.linearRampToValueAtTime(1000, t + 1.6);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.2); g.gain.exponentialRampToValueAtTime(0.025, t + 0.55); g.gain.exponentialRampToValueAtTime(0.07, t + 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
  src.connect(bp); bp.connect(g);
  if (a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.setValueAtTime(-0.6, t); p.pan.linearRampToValueAtTime(0.6, t + 1.6); g.connect(p); p.connect(a.destination); } else g.connect(a.destination);
  src.start(t); src.stop(t + len);
  return true;
}

/* ---------------- Save (this browser) ---------------- */
export const savedList = () => json('td-saved', []).filter((x) => x && x.id);
export const isSaved = (id) => savedList().some((x) => x.id === id);
export function toggleSave(id) {
  let s = savedList(); const on = !s.some((x) => x.id === id);
  s = on ? [{ id, at: new Date().toISOString() }, ...s] : s.filter((x) => x.id !== id);
  ls.set('td-saved', JSON.stringify(s.slice(0, 300)));
  document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.querySelector('.sv-t') && (b.querySelector('.sv-t').textContent = on ? 'Saved' : 'Save'); });
  document.querySelectorAll(`[data-book="${CSS.escape(id)}"]`).forEach((bk) => { bk.toggleAttribute('data-saved', on); bk.querySelectorAll('.bookmark').forEach((r) => { r.classList.toggle('in', on); if (on && !calm()) { r.classList.remove('slip'); void r.offsetWidth; r.classList.add('slip'); } }); });
  if (on) buzz('ribbon');
  return on;
}

/* ---------------- local reading log + earned seals (real criteria only, this browser) ---------------- */
export const openedList = () => json('td-opened', []).filter((x) => x && x.id);
export function logOpened(id) {
  if (!id) return; const a = openedList().filter((x) => x.id !== id); a.unshift({ id, at: new Date().toISOString() });
  ls.set('td-opened', JSON.stringify(a.slice(0, 200)));
}
export const nightOwl = () => json('td-nightowl', null);
export const fieldLeads = () => json('td-live-field-leads', []).filter((l) => l && l.lat != null && l.lon != null);
// Client-side "View as visitor" (admins/moderators): hides staff UI only; roles and RLS are untouched.
export const visitorView = () => ls.get('td-visitor') === '1';
export const setVisitorView = (on) => ls.set('td-visitor', on ? '1' : '0');

/* ---------------- Nyx: the hidden spider ---------------- */
// One swappable file: assets/th/nyx.svg. Places she can be found (distinct ones count toward Friend of Nyx).
export const NYX_PLACES = { home: 'the title card', shelf: 'the empty shelf', cover: 'a book cover', torn: 'a lost record', endpaper: 'the endpapers', footer: 'the colophon', scroll: 'a sealed scroll', card: 'your reader’s card' };
export const NYX_GOAL = 5;
export const nyxFound = () => json('td-nyx', []).filter((p) => p in NYX_PLACES);
export const nyxFriend = () => nyxFound().length >= NYX_GOAL;
export const nyx = (place, cls = '') => `<button type="button" class="nyx ${cls}" data-nyx="${place}" aria-label="A small spider"><img src="assets/th/nyx.svg" alt="" width="40" height="44" draggable="false"></button>`;
// Cobweb (SVG). corner: 'tl' | 'tr' | 'full'
export function web(corner = 'tl', cls = '') {
  const R = [];
  if (corner === 'full') {
    const cx = 60, cy = 60, n = 12, rings = [10, 20, 31, 43, 56];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.2; R.push(`M${cx} ${cy}L${(cx + Math.cos(a) * 62).toFixed(1)} ${(cy + Math.sin(a) * 62).toFixed(1)}`); }
    for (const r of rings) { let d = ''; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2 + 0.2, a0 = ((i - 0.5) / n) * Math.PI * 2 + 0.2, rr = r * 0.86;
      d += i ? `Q${(cx + Math.cos(a0) * rr).toFixed(1)} ${(cy + Math.sin(a0) * rr).toFixed(1)} ${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}` : `M${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`; } R.push(d); }
    return `<svg class="web web-full ${cls}" viewBox="0 0 120 120" aria-hidden="true"><path d="${R.join('')}"/></svg>`;
  }
  const n = 6, rings = [14, 28, 44, 62, 82];
  for (let i = 0; i < n; i++) { const a = (i / (n - 1)) * Math.PI / 2; R.push(`M0 0L${(Math.cos(a) * 100).toFixed(1)} ${(Math.sin(a) * 100).toFixed(1)}`); }
  for (const r of rings) { let d = ''; for (let i = 0; i < n; i++) { const a = (i / (n - 1)) * Math.PI / 2, a0 = ((i - 0.5) / (n - 1)) * Math.PI / 2, rr = r * 0.8;
    d += i ? `Q${(Math.cos(a0) * rr).toFixed(1)} ${(Math.sin(a0) * rr).toFixed(1)} ${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}` : `M${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`; } R.push(d); }
  return `<svg class="web web-${corner} ${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${R.join('')}"/></svg>`;
}
let toastFn = () => {};
function foundNyx(btn) {
  const place = btn.dataset.nyx;
  const had = nyxFound(), fresh = place in NYX_PLACES && !had.includes(place);
  if (fresh) ls.set('td-nyx', JSON.stringify([...had, place]));
  const n = nyxFound().length;
  if (!calm()) { btn.classList.remove('scurry'); btn.style.setProperty('--sx', (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 40) + 'px'); void btn.offsetWidth; btn.classList.add('scurry'); setTimeout(() => btn.classList.remove('scurry'), 2600); }
  if (fresh && n === NYX_GOAL) toastFn('You found Nyx in five places. She has made you a Friend of Nyx: see your Account.');
  else if (fresh) toastFn(`You found Nyx on ${NYX_PLACES[place]} (${n} of ${NYX_GOAL}).`);
  else toastFn(n >= NYX_GOAL ? 'Nyx scurries off. Friend of Nyx.' : 'Nyx scurries off. She has been found here already.');
}
export const friendSeal = () => `<div class="nyx-seal" role="img" aria-label="Friend of Nyx seal"><img src="assets/th/nyx.svg" alt="" width="40" height="44"><span>Friend of Nyx</span></div>`;

/* ---------------- everyday: candle loader, torn page ---------------- */
export const candle = (msg = 'Opening the archive…') => `<div class="loading candle-load" role="status"><span class="candle" aria-hidden="true"><i class="flame"></i><i class="wick"></i><i class="wax"><i class="drip"></i></i><i class="dish"></i></span><span class="cl-t">${esc(msg)}</span></div>`;
export const torn = ({ title = 'This record has been lost.', detail = '', back = '#/', backText = 'Back to the archive' } = {}) => `<div class="empty-state torn-page" role="alert"><div class="tp-sheet">
  ${web('tr', 'tp-web')}${nyx('torn', 'tp-nyx')}
  <p class="tp-k">Archive notice</p><h1>${esc(title)}</h1>${detail ? `<p class="tp-sub">${detail}</p>` : ''}<p><a class="btn ghost" href="${esc(back)}">${esc(backText)}</a></p></div></div>`;

/* ---------------- the shelf: lean + dust motes, pull out / slide back ---------------- */
const leanAt = new WeakMap();
function lean(sp, dir) {
  if (calm()) return; const now = performance.now(); if (now - (leanAt.get(sp) || 0) < 520) return; leanAt.set(sp, now);
  sp.style.setProperty('--lean', (dir < 0 ? -1 : 1) * 3.2 + 'deg');
  sp.classList.remove('lean'); void sp.offsetWidth; sp.classList.add('lean'); setTimeout(() => sp.classList.remove('lean'), 650);
  const bk = sp.querySelector('.bk'); if (!bk) return;
  for (let i = 0; i < 3; i++) { const m = document.createElement('i'); m.className = 'mote';
    m.style.cssText = `left:${15 + Math.random() * 70}%;--x:${(Math.random() * 28 - 14).toFixed(0)}px;--y:${(-16 - Math.random() * 24).toFixed(0)}px;animation-delay:${i * 80}ms`;
    m.addEventListener('animationend', () => m.remove(), { once: true }); bk.appendChild(m); }
}
let lastX = 0, lastSpine = null, lastLayer = null;
function onMove(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.('.shelf .spine');
  if (el && el !== lastSpine) lean(el, x - lastX);
  lastSpine = el; lastX = x;
}

/* ---------------- pull to refresh (installed app on phones): pocket watch winding ---------------- */
export const WATCH = `<svg class="pw" viewBox="0 0 64 76" aria-hidden="true"><g class="crown"><rect x="28" y="2" width="8" height="7" rx="1.5"/><rect x="26" y="9" width="12" height="4" rx="1"/></g><circle cx="32" cy="16" r="4" fill="none" class="bow"/>
  <circle cx="32" cy="45" r="27" class="case"/><circle cx="32" cy="45" r="22.5" class="face"/>
  ${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${(32 + Math.sin(a) * 18.5).toFixed(1)}" y1="${(45 - Math.cos(a) * 18.5).toFixed(1)}" x2="${(32 + Math.sin(a) * 21).toFixed(1)}" y2="${(45 - Math.cos(a) * 21).toFixed(1)}" class="tick"/>`; }).join('')}
  <line x1="32" y1="45" x2="32" y2="33" class="hand h"/><line x1="32" y1="45" x2="32" y2="28" class="hand m"/><circle cx="32" cy="45" r="1.6" class="pin"/></svg>`;
function watchEl() { const w = document.createElement('div'); w.className = 'ptr-watch'; w.setAttribute('role', 'status'); w.innerHTML = WATCH + '<span>Pull to wind</span>'; document.body.appendChild(w); return w; }
function initPull(refresh) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone || !('ontouchstart' in window)) return;
  root.classList.add('ptr-on');
  let y0 = null, w = null;
  addEventListener('touchstart', (e) => { y0 = null; if (scrollY > 2 || e.touches.length > 1 || document.body.classList.contains('is-map') || document.querySelector('dialog[open]') || e.target.closest('.book-stage,#map,input,textarea,select,.tome-scroll')) return; y0 = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return; const d = e.touches[0].clientY - y0;
    if (d <= 8 || scrollY > 2) { if (w) w.style.setProperty('--p', '0'); return; }
    w = w || watchEl(); const p = Math.min(1, (d - 8) / 110); w.style.setProperty('--p', p.toFixed(3)); w.classList.toggle('ready', p >= 1);
    w.querySelector('span').textContent = p >= 1 ? 'Release to wind' : 'Pull to wind';
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 == null || !w) { y0 = null; return; }
    const go = w.classList.contains('ready'), el = w; y0 = null; w = null;
    if (!go) { el.remove(); return; }
    el.classList.add('winding'); el.querySelector('span').textContent = 'Winding…';
    try { await Promise.all([refresh(), new Promise((r) => setTimeout(r, calm() ? 0 : 900))]); } finally { el.classList.add('done'); setTimeout(() => el.remove(), 400); }
  });
}
// Design Lab: play the watch once.
export function demoWatch(host) {
  const w = document.createElement('div'); w.className = 'ptr-watch demo winding'; w.innerHTML = WATCH + '<span>Winding…</span>'; w.style.setProperty('--p', '1'); host.appendChild(w);
  setTimeout(() => { w.classList.add('done'); setTimeout(() => w.remove(), 400); }, 2200);
}

/* ---------------- Share: close the book under a wax seal ---------------- */
export function sealBook(bookRoot) {
  return new Promise((res) => {
    if (!bookRoot || calm()) return res();
    window.TD_TOMES?.book?.root === bookRoot && window.TD_TOMES.book.shut?.();
    const stage = bookRoot.querySelector('[data-book-stage]'); if (!stage) return res();
    stage.querySelector('.share-seal')?.remove();
    const s = document.createElement('div'); s.className = 'share-seal'; s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<span class="ss-wax"><img src="assets/th/th-seal.png" alt="" draggable="false"></span>';
    stage.appendChild(s); setTimeout(res, 620); setTimeout(() => s.classList.add('out'), 2200); setTimeout(() => s.remove(), 2800);
  });
}

/* ---------------- easter eggs ---------------- */
const GENT = 'assets/th/gentleman.webp', GENT_GLOW = 'assets/th/gentleman-glow.webp';
export function seasons(now = new Date()) {
  const witching = now.getHours() === 0 && fxOn();
  const heavy = (now.getDay() === 5 && now.getDate() === 13) || (now.getMonth() === 9 && now.getDate() === 31);
  root.classList.toggle('witching', witching); root.classList.toggle('fog-heavy', heavy);
  document.querySelectorAll('img[src$="gentleman.webp"], img[src$="gentleman-glow.webp"]').forEach((img) => { const want = witching ? GENT_GLOW : GENT; if (!img.getAttribute('src').endsWith(want)) img.setAttribute('src', want); });
}
let sealTaps = [];
function sealTap(el) {
  const t = Date.now(); sealTaps = sealTaps.filter((x) => t - x < 3000); sealTaps.push(t);
  if (sealTaps.length < 5) return; sealTaps = [];
  const spoke = whisper();
  if (!calm()) { el.classList.remove('seal-shiver'); void el.offsetWidth; el.classList.add('seal-shiver'); setTimeout(() => el.classList.remove('seal-shiver'), 1800); }
  if (!spoke && !soundOn()) toastFn('Something stirs… (turn Sound on to hear it)');
}

/* ---------------- home: Nyx lowers on her thread now and then ---------------- */
let dropTimer = 0;
function scheduleDrop() {
  clearTimeout(dropTimer);
  dropTimer = setTimeout(() => {
    const n = document.querySelector('.th-card .nyx-home');
    if (n && !calm() && !document.hidden && !n.classList.contains('scurry')) { n.classList.remove('drop'); void n.offsetWidth; n.classList.add('drop'); setTimeout(() => n.classList.remove('drop'), 6200); }
    if (document.querySelector('.th-card .nyx-home')) scheduleDrop();
  }, 20000 + Math.random() * 20000);
}
export function nyxDrop(n) { if (!n || calm()) return; n.classList.remove('drop'); void n.offsetWidth; n.classList.add('drop'); setTimeout(() => n.classList.remove('drop'), 6200); }

/* ---------------- after every render ---------------- */
export function afterRender(main, { path = '' } = {}) {
  seasons();
  // shelf: animate the book that was just pulled out, and the one that slid back in
  const shelf = main.querySelector('form[data-filters] .shelf');
  if (shelf) {
    const cur = shelf.querySelector('.spine.on')?.dataset.spine || null;
    if (!calm()) {
      if (cur && cur !== lastLayer) shelf.querySelector(`.spine[data-spine="${CSS.escape(cur)}"]`)?.classList.add('pulling');
      if (lastLayer && lastLayer !== cur) shelf.querySelector(`.spine[data-spine="${CSS.escape(lastLayer)}"]`)?.classList.add('returning');
    }
    lastLayer = cur;
  }
  if (main.querySelector('.th-card .nyx-home')) scheduleDrop(); else clearTimeout(dropTimer);
  // books: the saved ribbon state
  main.querySelectorAll('[data-book]').forEach((bk) => { const on = isSaved(bk.dataset.book); bk.toggleAttribute('data-saved', on); bk.querySelectorAll('.bookmark').forEach((r) => r.classList.toggle('in', on)); });
  void path;
}

/* ---------------- boot ---------------- */
export function initReveals({ refresh, toast }) {
  toastFn = toast || toastFn;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') onMove(e.clientX, e.clientY); }, { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t && e.target.closest?.('.shelf')) onMove(t.clientX, t.clientY); }, { passive: true });
  document.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nyx]'); if (n) { e.preventDefault(); e.stopPropagation(); foundNyx(n); return; }
  }, true);
  document.addEventListener('pointerdown', (e) => { const s = e.target.closest('img[src*="th-seal"], .thc-seal, .cv-th'); if (s) sealTap(s); }, { passive: true });
  seasons(); setInterval(() => seasons(), 60000);
  const h = new Date().getHours(); if (h < 4 && !nightOwl()) ls.set('td-nightowl', JSON.stringify({ at: new Date().toISOString() }));
  initPull(refresh || (async () => {}));
  // the colophon spider (footer)
  const fc = document.querySelector('.foot-credit');
  if (fc && !fc.querySelector('[data-nyx]')) fc.insertAdjacentHTML('beforeend', nyx('footer', 'nyx-foot'));
}
