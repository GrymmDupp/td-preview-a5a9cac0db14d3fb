// Twisted Deeds "tomes": the BOOK (every listing's free preview) and the SCROLL (what was paid for:
// an unlocked full file, a commissioned research file). Ported from the Design Lab (Shadow look).
// Views render the markup with bookShell()/scrollShell(); app.js calls mountTomes() after each render.
import { esc } from './util.js';

import { playOpenFx } from './effects.js';
export const reduced = () => document.documentElement.classList.contains('rm');
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];
export const rule = (cls = '') => `<svg class="orn-rule ${cls}" viewBox="0 0 200 14" aria-hidden="true"><use href="#rule"/></svg>`;
export const wordmark = (cls) => `<div class="${cls}">Twisted <span>Deeds</span></div>`;

// Round status seal (rating on top, status + date below). Text is the public label only.
export function statusSeal({ top, bottom, mid = 'TD', era = '', label = '' }, size = 112) {
  const uid = 's' + Math.random().toString(36).slice(2, 8);
  return `<svg class="status-seal" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${esc(label || top)}">
    <defs><path id="${uid}a" d="M60 60m-44 0a44 44 0 1 1 88 0"/><path id="${uid}b" d="M60 60m-49 0a49 49 0 0 0 98 0"/></defs>
    <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" stroke-width=".6" stroke-dasharray="1.5 2.5"/>
    <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="1"/>
    <text font-size="10.5" letter-spacing="2.2" fill="currentColor" font-family="Cinzel,serif"><textPath href="#${uid}a" startOffset="50%" text-anchor="middle">${esc(top.toUpperCase())}</textPath></text>
    <text font-size="6.4" letter-spacing="1.2" fill="currentColor" font-family="Cinzel,serif"><textPath href="#${uid}b" startOffset="50%" text-anchor="middle">${esc(bottom.toUpperCase())}</textPath></text>
    <text x="60" y="${era ? 58 : 67}" text-anchor="middle" font-size="20" font-family="Cinzel,serif" font-weight="700" fill="currentColor">${esc(mid)}</text>
    ${era ? `<text x="60" y="74" text-anchor="middle" font-size="7" letter-spacing="1.5" font-family="Cinzel,serif" fill="currentColor">${esc(String(era).replace(/\s/g, '').slice(0, 14))}</text>` : ''}
  </svg>`;
}
const waxSeal = () => `<svg viewBox="0 0 120 120" aria-hidden="true">
  <g filter="url(#wax-edge)"><circle cx="60" cy="60" r="51" fill="url(#wax-th)"/></g>
  <circle cx="60" cy="60" r="38" fill="url(#wax-th-in)" stroke="#2a0603" stroke-width="2"/>
  <circle cx="60" cy="60" r="34" fill="none" stroke="#c9584a" stroke-opacity=".45" stroke-width="1.4"/>
  <image href="assets/th/th-letters.png" x="28" y="28.2" width="66" height="66" filter="url(#th-dark)" opacity=".85"/>
  <image href="assets/th/th-letters.png" x="27" y="27" width="66" height="66" opacity=".5"/>
  <ellipse cx="43" cy="37" rx="13" ry="5.5" fill="#fff" opacity=".14" transform="rotate(-30 43 37)"/></svg>`;

/* ---------------- markup ---------------- */
// B = { id, name, kicker, place, city, state, era, sealHTML, pages: [plate, title, facts, timeline, sources, finis] (HTML strings) }
export function bookShell(B) {
  return `<section class="tome th tome-book" data-book="${esc(B.id)}" aria-label="${esc(B.name)}: the book"${B.fx ? ` data-fx="${esc(B.fx)}"` : ''}${B.leather ? ` style="--leather:${esc(B.leather)};--band:${esc(B.band || '#8d2012')}"` : ''}>
    <div class="book-stage" data-book-stage></div>
    <div class="ctl">
      <button class="ctl-b" data-act="prev" aria-label="Previous page">‹</button>
      <span class="ctl-l" aria-live="polite">Tap the book to open it</span>
      <button class="ctl-b" data-act="next" aria-label="Next page">›</button>
    </div>
    <template data-book-pages>${B.pages.map((p) => `<div data-p>${p}</div>`).join('')}</template>
    <template data-book-cover>${B.cover}</template>
  </section>`;
}
export const pageHead = (name, t) => `<header class="pg-head ink"><span>${esc(name)}</span><span>${esc(t)}</span></header>`;
export const folio = (n) => `<footer class="folio">— ${ROMAN[n] || n} —</footer>`;
export function bookCover({ kicker, name, place, era }) {
  return `<div class="cover-front">
      <div class="tool tool1"></div><div class="tool tool2"></div>
      ${['tl', 'tr', 'bl', 'br'].map((c) => `<img class="cv-vine ${c}" src="assets/th/vine-corner.png" alt="" aria-hidden="true" draggable="false">`).join('')}
      <img class="cv-th" src="assets/th/th-seal.png" alt="" aria-hidden="true" draggable="false">
      <div class="cv-inner">
        <img class="cv-logo" src="assets/logo-shield-144.png" alt="" width="64" height="66">
        ${wordmark('cv-brand')}
        <div class="cv-kick">${esc(kicker)}</div>
        <h2 class="cv-title">${esc(name)}</h2>
        <div class="cv-rule"></div>
        <div class="cv-place">${esc(place)}</div>
        ${era ? `<div class="cv-era">${esc(era)}</div>` : ''}
      </div>
      <div class="cv-tap">Tap to open</div>
    </div>`;
}
const endpaper = () => `<div class="endpaper">
    <img class="ep-gent" src="assets/th/gentleman.webp" alt="" aria-hidden="true" draggable="false">
    <img class="ep-vine" src="assets/th/vine-edge.png" alt="" aria-hidden="true" draggable="false">
    <div class="ep-in"><img src="assets/logo-shield-144.png" alt="" width="72" height="74"><span>Twisted Deeds</span><small>A record of houses with a past</small><em class="ep-tag">where the past has a presence</em><small class="ep-credit">a Twisted History Tours production</small></div></div>`;

// S = { id, name, content (HTML; mark reveal lines with class "line"), hint, locked, lockedNote, kind }
export function scrollShell(S) {
  return `<section class="tome th tome-scroll${S.locked ? ' is-locked' : ''}" data-scroll="${esc(S.id)}" data-kind="${esc(S.kind || '')}" aria-label="${esc(S.label || S.name + ': the scroll')}">
    <div class="scroll-stage"><div class="scroll" data-state="sealed">
      <div class="rod top"><i class="knob l"></i><i class="knob r"></i></div>
      <div class="sheet"><div class="sheet-content">${S.content || ''}</div><i class="curl"></i></div>
      <div class="roll"><i class="knob l"></i><i class="knob r"></i>
        <div class="tribbon"></div>
        <button class="seal" ${S.locked ? 'disabled aria-disabled="true"' : ''} aria-label="${S.locked ? esc(S.lockedNote || 'Still sealed') : 'Break the seal to unroll'}">
          <span class="half a">${waxSeal()}</span><span class="half b">${waxSeal()}</span>
        </button>
        <div class="sc-brandroll">Twisted <span>Deeds</span></div><div class="sc-name">${esc(S.name)}</div>
      </div>
      <div class="sc-hint">${esc(S.hint || (S.locked ? 'Sealed' : 'Tap the seal'))}</div>
    </div></div>
    <div class="ctl">${S.locked ? `<span class="ctl-l sealed-note">${esc(S.lockedNote || 'Still sealed')}</span>` : '<button class="ctl-w" data-roll>Break the seal</button>'}</div>
  </section>`;
}

/* ---------------- ink helper ---------------- */
function inkIn(root, step = 90, start = 0) {
  const els = [...root.querySelectorAll('.ink')];
  els.forEach((el, i) => el.style.setProperty('--d', (reduced() ? 0 : start + i * step) + 'ms'));
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('inked')));
}

/* ---------------- the book ---------------- */
let activeBook = null;
function mountBook(root) {
  const stage = root.querySelector('[data-book-stage]'), label = root.querySelector('.ctl-l');
  const pages = [...root.querySelector('[data-book-pages]').content.querySelectorAll('[data-p]')].map((d) => d.innerHTML);
  const cover = root.querySelector('[data-book-cover]').innerHTML;
  const id = root.dataset.book, name = root.getAttribute('aria-label').replace(/: the book$/, '');
  const NAMES = ['Plate', 'Story', 'Facts', 'Timeline', 'Sources', 'Finis'];
  const KEY = 'td-book-' + id;
  let mode = 'spread', W = 300, H = 420, leaves = [], k = 0, busy = false;
  try { k = +(sessionStorage.getItem(KEY) || 0) || 0; } catch { /* private mode */ }
  const verso = () => '<div class="verso"></div>';
  // category opening effect (js/effects.js), keyed off data-fx on the book root; skipped under reduced motion
  const fx = () => { if (root.dataset.fx) setTimeout(() => playOpenFx(stage, root.dataset.fx), 120); };
  function build() {
    const faces = mode === 'spread'
      ? [[cover, pages[0]], [pages[1], pages[2]], [pages[3], pages[4]], [pages[5], endpaper()]]
      : [[cover, endpaper()], ...pages.map((p) => [p, verso()])];
    stage.innerHTML = `<div class="book ${mode}" style="--pw:${W}px;--ph:${H}px">
      <div class="book-body">
        <div class="back-cover"></div>
        <div class="page-block"></div>
        <div class="spine"><span><b>Twisted Deeds · </b>${esc(name)}</span><img src="assets/logo-shield-48.png" alt="" width="20" height="21"></div>
        ${faces.map(([f, b], i) => `<div class="leaf${i === 0 ? ' is-cover' : ''}" data-i="${i}"><div class="face front${i === 0 ? ' cover' : ' paper'}">${f}<i class="shade"></i></div><div class="face back paper">${b}<i class="shade"></i></div></div>`).join('')}
      </div></div>`;
    stage.style.height = (H + 80) + 'px';
    leaves = [...stage.querySelectorAll('.leaf')];
    k = Math.max(0, Math.min(k, leaves.length)); place();
  }
  const z = (i, turned) => (turned ? i + 1 : leaves.length - i);
  function setLeaf(el, ang, lift = 0) {
    const i = +el.dataset.i, turned = ang < -90;
    el.style.transform = `translateZ(${z(i, turned) * 1.2 + lift}px) rotateY(${ang}deg)`;
    el.style.setProperty('--s', Math.sin(Math.abs(ang) * Math.PI / 180).toFixed(3));
  }
  function place() {
    leaves.forEach((el, i) => {
      const t = i < k; setLeaf(el, t ? -180 : 0); el.classList.toggle('turned', t);
      el.style.visibility = (mode === 'single' && t && i < k - 1) ? 'hidden' : '';
      // keep links on hidden faces out of the tab order
      const vis = new Set(pagesAt(k));
      el.querySelectorAll('.face').forEach((f) => { const on = vis.has(f) || (k === 0 && i === 0 && f.classList.contains('front')); f.toggleAttribute('inert', !on); f.setAttribute('aria-hidden', String(!on)); });
    });
    const b = stage.querySelector('.book'); b.classList.toggle('open', k > 0); b.classList.toggle('at-end', k === leaves.length);
    root.classList.toggle('is-open', k > 0);
    try { sessionStorage.setItem(KEY, String(k)); } catch { /* ignore */ }
    updateLabel(); pagesAt(k).forEach((p, j) => { if (!p.classList.contains('inked')) inkIn(p, 85, 150 + j * 350); });
  }
  function pagesAt(kk) {
    if (kk <= 0 || !leaves.length) return [];
    if (mode === 'spread') return [leaves[kk - 1]?.querySelector('.back'), leaves[kk]?.querySelector('.front')].filter(Boolean);
    return [leaves[kk]?.querySelector('.front')].filter(Boolean);
  }
  const preInk = (kk) => pagesAt(kk).forEach((p, j) => { if (!p.classList.contains('inked')) inkIn(p, 85, 380 + j * 300); });
  function updateLabel() {
    if (k === 0) { label.textContent = 'Tap the book to open it'; return; }
    if (k >= leaves.length) { label.textContent = 'The end'; return; }
    label.textContent = mode === 'spread' ? [['Plate', 'Story'], ['Facts', 'Timeline'], ['Sources', 'Finis']][k - 1].join(' · ') : `${NAMES[k - 1]}  ·  ${k} of 6`;
  }
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function animate(el, from, to, dur, done) {
    if (reduced()) { setLeaf(el, to); done(); return; }
    const t0 = performance.now(); el.classList.add('moving');
    const f = (now) => {
      const t = Math.min(1, (now - t0) / dur), a = from + (to - from) * ease(t);
      setLeaf(el, a, Math.sin(t * Math.PI) * 30); el.style.zIndex = 99;
      if (t < 1) requestAnimationFrame(f); else { el.classList.remove('moving'); el.style.zIndex = ''; done(); }
    };
    requestAnimationFrame(f);
  }
  function go(dir) {
    if (busy || !stage.isConnected) return;
    const n = leaves.length;
    if ((dir > 0 && k >= n) || (dir < 0 && k <= 0)) return;
    busy = true;
    const el = dir > 0 ? leaves[k] : leaves[k - 1];
    if (mode === 'single' && dir < 0) el.style.visibility = '';
    el.querySelectorAll('.face').forEach((f) => f.removeAttribute('inert'));
    preInk(k + dir);
    const b = stage.querySelector('.book');
    if (dir > 0 && k === 0) {
      fx();
      b.classList.add('open');
      const r = stage.getBoundingClientRect();
      const hh = document.querySelector('.site-head')?.offsetHeight || 0;
      if (r.bottom > innerHeight - 140 || r.top < hh) window.scrollTo({ top: Math.max(0, r.top + scrollY - hh - 6), behavior: reduced() ? 'auto' : 'smooth' });
    }
    if (dir < 0 && k === 1) b.classList.remove('open');
    animate(el, dir > 0 ? 0 : -180, dir > 0 ? -180 : 0, k === 0 || (dir < 0 && k === 1) ? 1100 : 850, () => { k += dir; busy = false; place(); });
  }
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (busy || e.button > 0 || e.target.closest('a,button,input,select,textarea')) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), el: null, dir: 0, ang: 0, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) { if (Math.abs(dy) > 14) drag = null; return; }
      drag.moved = true; drag.dir = dx < 0 ? 1 : -1;
      if ((drag.dir > 0 && k >= leaves.length) || (drag.dir < 0 && k <= 0) || reduced()) { const d = drag; drag = null; if (reduced()) go(d.dir); return; }
      drag.el = drag.dir > 0 ? leaves[k] : leaves[k - 1];
      if (mode === 'single') drag.el.style.visibility = '';
      drag.el.style.zIndex = 99; stage.setPointerCapture?.(e.pointerId); preInk(k + drag.dir);
      if (drag.dir > 0 && k === 0) stage.querySelector('.book').classList.add('open');
    }
    const span = W * 1.1;
    drag.ang = drag.dir > 0 ? Math.max(-180, Math.min(0, dx / span * 180)) : Math.max(-180, Math.min(0, -180 + dx / span * 180));
    setLeaf(drag.el, drag.ang, Math.sin(Math.abs(drag.ang) * Math.PI / 180) * 30);
  });
  stage.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) {
      const r = stage.querySelector('.book-body').getBoundingClientRect();
      if (k === 0) go(1); else if (mode === 'spread') go(e.clientX > r.left + r.width / 2 ? 1 : -1); else go(e.clientX > r.left + r.width * .35 ? 1 : -1);
      return;
    }
    const v = (e.clientX - d.x) / (performance.now() - d.t);
    const commit = d.dir > 0 ? (d.ang < -80 || v < -.5) : (d.ang > -100 || v > .5);
    busy = true;
    const to = d.dir > 0 ? (commit ? -180 : 0) : (commit ? 0 : -180);
    if (!commit && d.dir > 0 && k === 0) stage.querySelector('.book').classList.remove('open');
    if (commit && d.dir < 0 && k === 1) stage.querySelector('.book').classList.remove('open');
    if (commit && d.dir > 0 && k === 0) fx();
    animate(d.el, d.ang, to, 420, () => { if (commit) k += d.dir; busy = false; place(); });
  });
  stage.addEventListener('pointercancel', () => { if (drag?.el) { drag = null; place(); } drag = null; });
  stage.addEventListener('click', (e) => { if (e.target.closest('[data-act=close]')) closeAll(); });
  function closeAll() {
    if (busy || k === 0) return;
    if (reduced()) { k = 0; place(); return; }
    const step = () => { if (k > 0) { busy = false; go(-1); setTimeout(step, k === 1 ? 1150 : 300); } };
    step();
  }
  root.querySelector('.ctl').addEventListener('click', (e) => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'next') go(1); if (a === 'prev') go(-1); });
  function layout() {
    if (!stage.isConnected) return;
    const cw = stage.clientWidth || innerWidth - 24;
    const newMode = cw < 620 ? 'single' : 'spread';
    const maxH = Math.max(380, Math.min(innerHeight - (cw < 620 ? 370 : 260), 640));
    W = Math.floor(newMode === 'single' ? Math.min(cw - 40, 380) : Math.min((cw - 40) / 2, 400));
    H = Math.floor(Math.min(W * 1.42, maxH)); W = Math.min(W, Math.floor(H / 1.3));
    if (newMode !== mode && leaves.length) {
      const page = mode === 'spread' ? (k ? (k - 1) * 2 : -1) : k - 1;
      mode = newMode; k = page < 0 ? 0 : (mode === 'spread' ? Math.floor(page / 2) + 1 : page + 1);
    } else mode = newMode;
    build();
  }
  layout();
  return { go, layout, closeAll, get k() { return k; }, get pages() { return leaves.length; }, root };
}
addEventListener('keydown', (e) => {
  const b = activeBook; if (!b || !b.root.isConnected || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  if (e.key === 'ArrowRight') b.go(1); if (e.key === 'ArrowLeft') b.go(-1);
});
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => activeBook?.layout(), 150); });

/* ---------------- the scroll ---------------- */
function mountScroll(root, { autoOpen = false } = {}) {
  const sc = root.querySelector('.scroll'), btn = root.querySelector('[data-roll]');
  const locked = root.classList.contains('is-locked');
  let st = 'sealed', timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, reduced() ? 0 : ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const sheet = sc.querySelector('.sheet'), content = sheet.firstElementChild;
  content.setAttribute('aria-hidden', 'true'); content.inert = true;
  function setState(s) {
    st = s; sc.dataset.state = s; root.dataset.state = s;
    if (btn) { btn.textContent = s === 'open' ? 'Roll it back up' : s === 'sealed' ? 'Break the seal' : '…'; btn.disabled = !(s === 'open' || s === 'sealed'); }
    const open = s === 'open' || s === 'opening'; content.inert = !open; content.setAttribute('aria-hidden', String(!open));
  }
  function open() {
    if (st !== 'sealed' || locked) return;
    clear(); setState('breaking');
    root.dispatchEvent(new CustomEvent('tome-open', { bubbles: true }));
    later(() => {
      setState('opening');
      const h = content.scrollHeight, rm = reduced();
      const dur = rm ? 0 : Math.min(3600, 1500 + h * 1.3);
      sheet.style.setProperty('--dur', dur + 'ms'); sc.style.setProperty('--dur', dur + 'ms');
      sheet.style.height = h + 'px';
      content.querySelectorAll('.line').forEach((el) => {
        const p = Math.min(1, (el.offsetTop + el.offsetHeight * .6) / h);
        el.style.setProperty('--d', (rm ? 0 : dur * (1 - Math.sqrt(1 - p)) * 0.95 + 120) + 'ms');
      });
      requestAnimationFrame(() => sheet.classList.add('inked'));
      if (!rm) {
        let touched = false; const off = () => { touched = true; };
        addEventListener('touchstart', off, { once: true, passive: true }); addEventListener('wheel', off, { once: true, passive: true });
        const roll = sc.querySelector('.roll'), t0 = performance.now();
        const follow = () => {
          if (touched || st !== 'opening' || performance.now() - t0 > dur + 200) return;
          const b = roll.getBoundingClientRect().bottom, lim = innerHeight * .88;
          if (b > lim) window.scrollBy(0, Math.min(40, b - lim));
          requestAnimationFrame(follow);
        };
        requestAnimationFrame(follow);
      }
      later(() => { setState('open'); sheet.style.height = 'auto'; }, dur + 80);
    }, 900);
  }
  function close() {
    if (st !== 'open') return;
    clear();
    const h = content.scrollHeight, rm = reduced();
    const dur = rm ? 0 : Math.min(2400, 1000 + h * .5);
    sheet.style.height = h + 'px'; sheet.style.setProperty('--dur', dur + 'ms'); sc.style.setProperty('--dur', dur + 'ms');
    content.querySelectorAll('.line').forEach((el) => el.style.setProperty('--d', '0ms'));
    sheet.classList.remove('inked'); setState('closing');
    const top = root.getBoundingClientRect().top + scrollY - 90;
    if (scrollY > top) window.scrollTo({ top, behavior: rm ? 'auto' : 'smooth' });
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.style.height = '0px'; }));
    later(() => { setState('resealing'); later(() => setState('sealed'), 700); }, dur + 60);
  }
  sc.querySelector('.seal').addEventListener('click', open);
  btn?.addEventListener('click', () => (st === 'open' ? close() : open()));
  root.addEventListener('click', (e) => { if (e.target.closest('[data-reroll]')) close(); });
  setState('sealed');
  if (autoOpen && !locked) setTimeout(open, reduced() ? 0 : 700);
  return { open, close, get state() { return st; } };
}

// Called by app.js after every render.
export function mountTomes(main, { openScroll = false } = {}) {
  activeBook = null;
  main.querySelectorAll('[data-book]').forEach((el) => { const b = mountBook(el); if (!activeBook) activeBook = b; });
  const scrolls = [...main.querySelectorAll('[data-scroll]')].map((el) => mountScroll(el, { autoOpen: openScroll && el.dataset.kind === 'file' }));
  window.TD_TOMES = { book: activeBook, scrolls };
  return window.TD_TOMES;
}

/* ---------------- reduce motion (app-wide) ---------------- */
export function setReduceMotion(on, persist = true) {
  document.documentElement.classList.toggle('rm', on);
  if (persist) try { localStorage.setItem('td-rm', on ? '1' : '0'); } catch { /* ignore */ }
  dispatchEvent(new CustomEvent('td-rm', { detail: on }));
}
