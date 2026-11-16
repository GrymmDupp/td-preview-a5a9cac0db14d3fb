/* Twisted Deeds Design Lab: Book + Scroll concepts. Vanilla JS, no libraries. */
(() => {
'use strict';
const DATA = window.LAB_DATA || [];
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${dd}, ${y}`; };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const findUrl = (l) => 'https://www.google.com/search?q=' + encodeURIComponent(l.address + ' for sale');
const appUrl = (l) => '../#/l/' + encodeURIComponent(l.id);
const isIllus = (img) => img && img.rights === 'illustration';
const stop = (t) => /[.!?”’"']$/.test(t.trim()) ? t : t.trim() + '.';
const cap = (img) => isIllus(img) ? 'Illustration, not a photo' : img.caption;
DATA.forEach((l) => { l.hook = stop(l.hook); l.summary = stop(l.summary); });

const params = new URLSearchParams(location.search);
const state = {
  id: DATA.some((l) => l.id === params.get('l')) ? params.get('l') : DATA[0]?.id,
  view: ['book', 'scroll', 'both'].includes(params.get('v')) ? params.get('v') : 'book',
  theme: document.documentElement.dataset.theme === 'gilded' ? 'gilded' : 'th', // 'th' = Shadow look (URL t=shadow; t=th still accepted)
};
const TH = () => state.theme === 'th';
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = localStorage.getItem('td-lab-rm') ? localStorage.getItem('td-lab-rm') === '1' : mq.matches;
const listing = () => DATA.find((l) => l.id === state.id);

/* ---------- shared bits ---------- */
const rule = () => '<svg class="orn-rule" viewBox="0 0 200 14" aria-hidden="true"><use href="#rule"/></svg>';
function sealSVG(l, size = 120) {
  const top = l.tier === 1 ? 'TWISTED DEED' : 'STRONG STORY';
  const bottom = `${l.status.toUpperCase()} · CHECKED ${fmtDate(l.lastChecked).toUpperCase()}`;
  const uid = 's' + Math.random().toString(36).slice(2, 8);
  return `<svg class="status-seal" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${esc(l.label)}, ${esc(l.status)}, last checked ${esc(fmtDate(l.lastChecked))}">
    <defs><path id="${uid}a" d="M60 60m-44 0a44 44 0 1 1 88 0"/><path id="${uid}b" d="M60 60m-49 0a49 49 0 0 0 98 0"/></defs>
    <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" stroke-width=".6" stroke-dasharray="1.5 2.5"/>
    <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="1"/>
    <text font-size="10.5" letter-spacing="2.2" fill="currentColor" font-family="Cinzel,serif"><textPath href="#${uid}a" startOffset="50%" text-anchor="middle">${top}</textPath></text>
    <text font-size="6.4" letter-spacing="1.2" fill="currentColor" font-family="Cinzel,serif"><textPath href="#${uid}b" startOffset="50%" text-anchor="middle">${esc(bottom)}</textPath></text>
    <text x="60" y="58" text-anchor="middle" font-size="20" font-family="Cinzel,serif" font-weight="700" fill="currentColor">TD</text>
    <text x="60" y="74" text-anchor="middle" font-size="7" letter-spacing="1.5" font-family="Cinzel,serif" fill="currentColor">${esc(l.era.replace(/\s/g, ''))}</text>
  </svg>`;
}
function plate(l, n = 0) {
  const img = l.images[n];
  if (!img) return `<figure class="plate empty"><div class="plate-frame"><div class="plate-none"><svg viewBox="0 0 60 60" width="60"><use href="#fleuron"/></svg><span>No photo on file</span></div></div><figcaption>Plate ${ROMAN[n]}</figcaption></figure>`;
  return `<figure class="plate${isIllus(img) ? ' illus' : ''}">
    <div class="plate-no">Plate ${ROMAN[n]}</div>
    <div class="plate-frame"><img src="${esc(img.url)}" alt="${esc(img.caption || l.name)}" decoding="async" referrerpolicy="no-referrer" draggable="false"></div>
    <figcaption><span class="pc">${esc(cap(img))}</span><span class="pcr">${esc(img.credit)}</span></figcaption>
  </figure>`;
}

/* ---------- picker / tabs ---------- */
function renderPicker() {
  $('#picker').innerHTML = DATA.map((l) => `<button role="radio" aria-checked="${l.id === state.id}" data-id="${l.id}" class="pick">
    <span class="pk-l ${l.tier === 1 ? 'deed' : 'story'}">${esc(l.label)}</span><span class="pk-n">${esc(l.name)}</span><span class="pk-p">${esc(l.place.replace(/, [^,]+ County/, ''))}</span></button>`).join('');
}
$('#picker').addEventListener('click', (e) => {
  const b = e.target.closest('.pick'); if (!b || b.dataset.id === state.id) return;
  state.id = b.dataset.id; renderPicker(); syncUrl(); book.load(listing()); scroll.load(listing());
});
document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
function setView(v) {
  if (v === 'both' && innerWidth < 1100) v = 'book';
  state.view = v;
  document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  $('#views').dataset.view = v;
  $('#view-book').hidden = v === 'scroll';
  $('#view-scroll').hidden = v === 'book';
  syncUrl(); book.layout();
}
function syncUrl() { history.replaceState(null, '', `?v=${state.view}&l=${state.id}&t=${state.theme === 'th' ? 'shadow' : 'gilded'}`); }
function setTheme(t, rebuild = true) {
  state.theme = t === 'gilded' ? 'gilded' : 'th';
  document.documentElement.dataset.theme = state.theme;
  try { localStorage.setItem('td-lab-theme', state.theme); } catch (e) { /* private mode */ }
  document.querySelectorAll('.theme-sw [role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === state.theme)));
  $('meta[name=theme-color]').setAttribute('content', TH() ? '#1b1b1a' : '#0b0909');
  syncUrl();
  if (rebuild) { book.load(listing()); scroll.load(listing()); }
  window.dispatchEvent(new CustomEvent('td-theme', { detail: state.theme }));
}
document.querySelectorAll('.theme-sw [role=radio]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.theme !== state.theme) setTheme(b.dataset.theme); }));
function setReduce(on) {
  reduce = on; document.documentElement.classList.toggle('rm', on); window.dispatchEvent(new CustomEvent('td-rm', { detail: on }));
  $('#rm').setAttribute('aria-pressed', String(on)); $('#rm').textContent = on ? 'Motion reduced' : 'Reduce motion';
}
$('#rm').addEventListener('click', () => { setReduce(!reduce); localStorage.setItem('td-lab-rm', reduce ? '1' : '0'); });
mq.addEventListener?.('change', (e) => { if (!localStorage.getItem('td-lab-rm')) setReduce(e.matches); });

/* ---------- ink-in helper ---------- */
function inkIn(root, step = 90, start = 0) {
  const els = [...root.querySelectorAll('.ink')];
  els.forEach((el, i) => el.style.setProperty('--d', (reduce ? 0 : start + i * step) + 'ms'));
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('inked')));
}

/* =====================================================================
   THE BOOK
   ===================================================================== */
const book = (() => {
  const stage = $('#bookStage'), label = $('#bookLabel');
  let L = null, mode = 'spread', W = 300, H = 420, leaves = [], k = 0, busy = false;
  // pages: 0 plate, 1 title, 2 facts, 3 timeline, 4 sources, 5 colophon
  const NAMES = ['Plate', 'Title', 'Facts', 'Timeline', 'Sources', 'Finis'];

  function pageHTML(i) {
    const l = L;
    const head = (t) => `<header class="pg-head ink"><span>${esc(l.name)}</span><span>${t}</span></header>`;
    const folio = (n) => `<footer class="folio">— ${n} —</footer>`;
    switch (i) {
      case 0: return `<div class="pg pg-plate">${plate(l, 0)}${folio('i')}</div>`;
      case 1: return `<div class="pg pg-title">
          <div class="ink pg-brand th-only">Twisted <span>Deeds</span></div>
          <div class="ink kicker">${esc(l.label)}</div>
          <h2 class="ink">${esc(l.name)}</h2>
          <div class="ink place">${esc(l.place)}</div>
          ${rule().replace('orn-rule', 'orn-rule ink')}
          <p class="ink hook"><span class="drop">${esc(l.hook[0])}</span>${esc(l.hook.slice(1))}</p>
          <div class="ink era"><span>Era</span> ${esc(l.era)}</div>
          <div class="ink seal-wrap">${sealSVG(l, 112)}</div>
          ${folio('ii')}</div>`;
      case 2: return `<div class="pg pg-facts">${head('Facts')}
          <h3 class="ink">Particulars</h3>
          <dl class="facts">
            <div class="ink"><dt>Address</dt><dd>${esc(l.address)}</dd></div>
            <div class="ink"><dt>Asking</dt><dd>${esc(l.price)}</dd></div>
            <div class="ink"><dt>Status</dt><dd>${esc(l.status)} <small>(checked ${esc(fmtDate(l.lastChecked))})</small></dd></div>
            <div class="ink"><dt>Rating</dt><dd>${esc(l.label)}</dd></div>
            ${l.facts.length ? `<div class="ink"><dt>On record</dt><dd>${l.facts.map(esc).join(' · ')}</dd></div>` : ''}
          </dl>
          <p class="ink summ">${esc(l.summary)}</p>
          ${folio('iii')}</div>`;
      case 3: return `<div class="pg pg-time">${head('Timeline')}
          <h3 class="ink">The Record</h3>
          <ol class="tl">${l.timeline.map(([d, t]) => `<li class="ink"><b>${esc(d)}</b><span>${esc(t)}</span></li>`).join('')}</ol>
          ${folio('iv')}</div>`;
      case 4: return `<div class="pg pg-src">${head('Sources')}
          <h3 class="ink">Sources</h3>
          <ul class="src">
            ${l.refs.map((r) => `<li class="ink">${esc(r)}</li>`).join('')}
            ${l.images.map((im) => `<li class="ink">${esc(im.caption)}. ${im.source && !isIllus(im) ? `<a href="${esc(im.source)}" target="_blank" rel="noopener nofollow">${esc(im.credit)}</a>` : esc(im.credit)}</li>`).join('')}
          </ul>
          <p class="ink note">This is the free preview. The full research file, with every documented source, opens from the listing in the app.</p>
          ${folio('v')}</div>`;
      case 5: return `<div class="pg pg-fin">
          <div class="ink fin-orn gd-only"><svg viewBox="0 0 60 60" width="54"><use href="#fleuron"/></svg></div>
          <div class="ink fin-rose th-only"><img src="th/rose.webp" alt="" width="84" height="84" draggable="false"></div>
          <div class="ink fin">Finis</div>
          <a class="ink bk-btn gold" href="${appUrl(l)}">Open the full file</a>
          <a class="ink bk-btn" href="${findUrl(l)}" target="_blank" rel="noopener">Find listing</a>
          <p class="ink note">View from public ground only. Many of these places are occupied homes.</p>
          <button class="ink bk-btn ghost" data-act="close">Close the book</button>
          ${folio('vi')}</div>`;
    }
  }
  const coverHTML = () => `<div class="cover-front">
      <div class="tool tool1"></div><div class="tool tool2"></div>
      ${['tl', 'tr', 'bl', 'br'].map((c) => `<svg class="corner gd-only ${c}" viewBox="0 0 60 60" aria-hidden="true"><use href="#fleuron"/></svg>`).join('')}
      ${['tl', 'tr', 'bl', 'br'].map((c) => `<img class="cv-vine th-only ${c}" src="th/vine-corner.png" alt="" aria-hidden="true" draggable="false">`).join('')}
      <img class="cv-th th-only" src="th/th-seal.png" alt="" aria-hidden="true" draggable="false">
      <div class="cv-inner">
        <img class="cv-logo" src="../assets/logo-shield-144.png" alt="" width="64" height="66">
        <div class="cv-brand th-only">Twisted <span>Deeds</span></div>
        <div class="cv-kick">${esc(L.label)}</div>
        <h2 class="cv-title">${esc(L.name)}</h2>
        <div class="cv-rule"></div>
        <div class="cv-place">${esc(L.place.split(',')[0])} · ${esc(L.address.split(',').pop().trim().split(' ')[0])}</div>
        <div class="cv-era">${esc(L.era)}</div>
      </div>
      <div class="cv-tap">Tap to open</div>
    </div>`;
  const endpaper = () => `<div class="endpaper">
      <img class="ep-gent th-only" src="th/gentleman.webp" alt="" aria-hidden="true" draggable="false">
      <img class="ep-vine th-only" src="th/vine-edge.png" alt="" aria-hidden="true" draggable="false">
      <div class="ep-in"><img src="../assets/logo-shield-144.png" alt="" width="72" height="74"><span>Twisted Deeds</span><small>A record of houses with a past</small><em class="th-only ep-tag">where the past has a presence</em><small class="th-only ep-credit">a Twisted History Tours production</small></div></div>`;
  const verso = () => `<div class="verso"></div>`;

  function build() {
    // Leaf list: cover + content leaves.
    let faces;
    if (mode === 'spread') faces = [[coverHTML(), pageHTML(0)], [pageHTML(1), pageHTML(2)], [pageHTML(3), pageHTML(4)], [pageHTML(5), endpaper()]];
    else faces = [[coverHTML(), endpaper()], ...[0, 1, 2, 3, 4, 5].map((i) => [pageHTML(i), verso()])];
    stage.innerHTML = `<div class="book ${mode}" style="--pw:${W}px;--ph:${H}px">
      <div class="book-body">
        <div class="back-cover"></div>
        <div class="page-block"></div>
        <div class="spine"><span><b class="th-only">Twisted Deeds · </b>${esc(L.name)}</span><img src="../assets/logo-shield-48.png" alt="" width="20" height="21"></div>
        ${faces.map(([f, b], i) => `<div class="leaf${i === 0 ? ' is-cover' : ''}" data-i="${i}"><div class="face front${i === 0 ? ' cover' : ' paper'}">${f}<i class="shade"></i></div><div class="face back paper">${b}<i class="shade"></i></div></div>`).join('')}
      </div></div>`;
    stage.style.height = (H + 80) + 'px';
    leaves = [...stage.querySelectorAll('.leaf')];
    k = Math.min(k, leaves.length); place();
  }
  function z(i, turned) { return turned ? i + 1 : leaves.length - i; }
  function setLeaf(el, ang, lift = 0) {
    const i = +el.dataset.i, turned = ang < -90;
    el.style.transform = `translateZ(${z(i, turned) * 1.2 + lift}px) rotateY(${ang}deg)`;
    const s = Math.sin(Math.abs(ang) * Math.PI / 180);
    el.style.setProperty('--s', s.toFixed(3));
  }
  function place() {
    leaves.forEach((el, i) => { const t = i < k; setLeaf(el, t ? -180 : 0); el.classList.toggle('turned', t); el.style.visibility = (mode === 'single' && t && i < k - 1) ? 'hidden' : ''; });
    const b = stage.querySelector('.book'); b.classList.toggle('open', k > 0);
    b.classList.toggle('at-end', k === leaves.length);
    updateLabel(); inkVisible();
  }
  function visiblePages() {
    if (k === 0) return [];
    if (mode === 'spread') return [leaves[k - 1].querySelector('.back'), leaves[k]?.querySelector('.front')].filter(Boolean);
    return [leaves[k]?.querySelector('.front')].filter(Boolean);
  }
  function pagesAt(kk) {
    if (kk <= 0) return [];
    if (mode === 'spread') return [leaves[kk - 1]?.querySelector('.back'), leaves[kk]?.querySelector('.front')].filter(Boolean);
    return [leaves[kk]?.querySelector('.front')].filter(Boolean);
  }
  function preInk(kk) { pagesAt(kk).forEach((p, j) => { if (!p.classList.contains('inked')) inkIn(p, 85, 380 + j * 300); }); }
  function inkVisible() { visiblePages().forEach((p, j) => { if (!p.classList.contains('inked')) inkIn(p, 85, 150 + j * 350); }); }
  function updateLabel() {
    if (k === 0) { label.textContent = 'Tap the book to open it'; return; }
    if (mode === 'spread') label.textContent = [['Plate', 'Title'], ['Facts', 'Timeline'], ['Sources', 'Finis'], ['Endpaper', '']][k - 1].filter(Boolean).join(' · ');
    else label.textContent = k >= leaves.length ? 'The end' : `${NAMES[k - 1]}  ·  ${k} of 6`;
    if (mode === 'spread' && k >= leaves.length) label.textContent = 'The end';
  }
  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function animate(el, from, to, dur, done) {
    if (reduce) { setLeaf(el, to); done(); return; }
    const t0 = performance.now(); el.classList.add('moving');
    const f = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t), a = from + (to - from) * e;
      setLeaf(el, a, Math.sin(t * Math.PI) * 30); el.style.zIndex = 99;
      if (t < 1) requestAnimationFrame(f); else { el.classList.remove('moving'); el.style.zIndex = ''; done(); }
    };
    requestAnimationFrame(f);
  }
  function go(dir) {
    if (busy) return;
    const n = leaves.length;
    if (dir > 0 && k >= n) return; if (dir < 0 && k <= 0) return;
    busy = true;
    const el = dir > 0 ? leaves[k] : leaves[k - 1];
    if (mode === 'single' && dir < 0) el.style.visibility = '';
    preInk(k + dir);
    const b = stage.querySelector('.book');
    if (dir > 0 && k === 0) {
      b.classList.add('open');
      const r = stage.getBoundingClientRect();
      if (r.bottom > innerHeight + 10 || r.top < 0) stage.scrollIntoView({ block: r.height + 70 < innerHeight ? 'center' : 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
    if (dir < 0 && k === 1) b.classList.remove('open');
    animate(el, dir > 0 ? 0 : -180, dir > 0 ? -180 : 0, k === 0 || (dir < 0 && k === 1) ? 1100 : 850, () => { k += dir; busy = false; place(); });
  }
  // Drag to turn
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (busy || e.button > 0 || e.target.closest('a,button')) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), el: null, dir: 0, ang: 0, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) { if (Math.abs(dy) > 14) drag = null; return; }
      drag.moved = true; drag.dir = dx < 0 ? 1 : -1;
      if ((drag.dir > 0 && k >= leaves.length) || (drag.dir < 0 && k <= 0) || reduce) { drag = null; return; }
      drag.el = drag.dir > 0 ? leaves[k] : leaves[k - 1];
      if (mode === 'single') drag.el.style.visibility = '';
      drag.el.style.zIndex = 99; stage.setPointerCapture?.(e.pointerId); preInk(k + drag.dir);
      if (drag.dir > 0 && k === 0) stage.querySelector('.book').classList.add('open');
    }
    const span = W * 1.1;
    drag.ang = drag.dir > 0 ? Math.max(-180, Math.min(0, dx / span * 180)) : Math.max(-180, Math.min(0, -180 + dx / span * 180));
    setLeaf(drag.el, drag.ang, Math.sin(Math.abs(drag.ang) * Math.PI / 180) * 30);
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { // tap
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
    animate(d.el, d.ang, to, 420, () => { if (commit) k += d.dir; busy = false; place(); });
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', () => { if (drag?.el) { drag = null; place(); } drag = null; });
  stage.addEventListener('click', (e) => { if (e.target.closest('[data-act=close]')) closeAll(); });
  function closeAll() {
    if (busy || k === 0) return;
    if (reduce) { k = 0; place(); return; }
    const step = () => { if (k > 0) { busy = false; go(-1); setTimeout(step, k === 1 ? 1150 : 300); } };
    step();
  }
  $('#bookCtl').addEventListener('click', (e) => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'next') go(1); if (a === 'prev') go(-1); });
  addEventListener('keydown', (e) => { if (state.view === 'scroll') return; if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); });

  function layout() {
    const cw = stage.clientWidth || innerWidth - 24;
    const newMode = cw < 620 ? 'single' : 'spread';
    const maxH = Math.max(400, Math.min(innerHeight - (cw < 620 ? 330 : 290), 680));
    W = Math.floor(newMode === 'single' ? Math.min(cw - 40, 380) : Math.min((cw - 40) / 2, 400));
    H = Math.floor(Math.min(W * 1.42, maxH)); W = Math.min(W, Math.floor(H / 1.3));
    if (newMode !== mode && L) {
      // keep roughly the same page when switching modes
      const page = mode === 'spread' ? (k ? (k - 1) * 2 : -1) : k - 1;
      mode = newMode; k = page < 0 ? 0 : (mode === 'spread' ? Math.floor(page / 2) + 1 : page + 1);
    } else mode = newMode;
    if (L) build();
  }
  function load(l) { L = l; k = 0; layout(); }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 150); });
  return { load, layout, go, get k() { return k; } };
})();

/* =====================================================================
   THE SCROLL
   ===================================================================== */
const scroll = (() => {
  const stage = $('#scrollStage'), btn = $('#rollBtn');
  let L = null, st = 'sealed', timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, reduce ? 0 : ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const waxSeal = () => TH() ? `<svg viewBox="0 0 120 120" aria-hidden="true">
      <g filter="url(#wax-edge)"><circle cx="60" cy="60" r="51" fill="url(#wax-th)"/></g>
      <circle cx="60" cy="60" r="38" fill="url(#wax-th-in)" stroke="#2a0603" stroke-width="2"/>
      <circle cx="60" cy="60" r="34" fill="none" stroke="#c9584a" stroke-opacity=".45" stroke-width="1.4"/>
      <image href="th/th-letters.png" x="28" y="28.2" width="66" height="66" filter="url(#th-dark)" opacity=".85"/>
      <image href="th/th-letters.png" x="27" y="27" width="66" height="66" opacity=".5"/>
      <ellipse cx="43" cy="37" rx="13" ry="5.5" fill="#fff" opacity=".14" transform="rotate(-30 43 37)"/></svg>` : `<svg viewBox="0 0 120 120" aria-hidden="true">
      <g filter="url(#wax-edge)"><circle cx="60" cy="60" r="50" fill="url(#wax)"/></g>
      <circle cx="60" cy="60" r="36" fill="url(#wax-in)" stroke="#5b0812" stroke-width="2"/>
      <circle cx="60" cy="60" r="31" fill="none" stroke="#e3606e" stroke-opacity=".55" stroke-width="1" stroke-dasharray="2 3"/>
      <text x="60" y="69" text-anchor="middle" font-family="Cinzel,serif" font-weight="700" font-size="27" fill="#5c0712" stroke="#f08a95" stroke-opacity=".5" stroke-width=".6">TD</text>
      <ellipse cx="44" cy="38" rx="13" ry="6" fill="#fff" opacity=".18" transform="rotate(-30 44 38)"/></svg>`;
  function contentHTML(l) {
    const img = l.images[0];
    return `<div class="sc-in">
      <div class="line sc-brand th-only">Twisted <span>Deeds</span></div>
      <div class="line sc-kick">${esc(l.label)}</div>
      <h2 class="line">${esc(l.name)}</h2>
      <div class="line sc-place">${esc(l.place)}</div>
      ${rule().replace('orn-rule', 'orn-rule line')}
      <p class="line sc-hook"><span class="drop">${esc(l.hook[0])}</span>${esc(l.hook.slice(1))}</p>
      ${img ? `<figure class="line sc-fig${isIllus(img) ? ' illus' : ''}"><div class="sc-frame"><img src="${esc(img.url)}" alt="${esc(img.caption || l.name)}" referrerpolicy="no-referrer" decoding="async"></div><figcaption>${esc(isIllus(img) ? img.credit : img.caption + " · " + img.credit)}</figcaption></figure>` : ''}
      <h3 class="line">Particulars</h3>
      <dl class="sc-facts">
        <div class="line"><dt>Address</dt><dd>${esc(l.address)}</dd></div>
        <div class="line"><dt>Asking</dt><dd>${esc(l.price)}</dd></div>
        <div class="line"><dt>Status</dt><dd>${esc(l.status)}, checked ${esc(fmtDate(l.lastChecked))}</dd></div>
        <div class="line"><dt>Era</dt><dd>${esc(l.era)}</dd></div>
        ${l.facts.length ? `<div class="line"><dt>On record</dt><dd>${l.facts.map(esc).join(' · ')}</dd></div>` : ''}
      </dl>
      <h3 class="line">The History</h3>
      <ol class="sc-tl">${l.timeline.map(([d, t]) => `<li class="line"><b>${esc(d)}</b> ${esc(t)}</li>`).join('')}</ol>
      <h3 class="line">Sources</h3>
      <ul class="sc-src">${l.refs.map((r) => `<li class="line">${esc(r)}</li>`).join('')}${l.images.map((im) => `<li class="line">${esc(im.caption)}: ${im.source && !isIllus(im) ? `<a href="${esc(im.source)}" target="_blank" rel="noopener nofollow">${esc(im.credit)}</a>` : esc(im.credit)}</li>`).join('')}</ul>
      <p class="line sc-note">Free preview. The full research file opens from the listing in the app. View from public ground only.</p>
      <div class="line sc-btns"><a class="bk-btn gold" href="${appUrl(l)}">Open the full file</a><a class="bk-btn" href="${findUrl(l)}" target="_blank" rel="noopener">Find listing</a></div>
      <div class="line sc-sign">${sealSVG(l, 96)}</div>
    </div>`;
  }
  function build() {
    stage.innerHTML = `<div class="scroll" data-state="sealed">
      <div class="rod top"><i class="knob l"></i><i class="knob r"></i></div>
      <div class="sheet"><div class="sheet-content">${contentHTML(L)}</div><i class="curl"></i></div>
      <div class="roll"><i class="knob l"></i><i class="knob r"></i>
        <div class="ribbon"></div>
        <button class="seal" aria-label="Break the seal to unroll">
          <span class="half a">${waxSeal()}</span><span class="half b">${waxSeal()}</span>
        </button>
        <div class="sc-brandroll th-only">Twisted <span>Deeds</span></div><div class="sc-name">${esc(L.name)}</div>
      </div>
      <div class="sc-hint">Tap the seal</div>
    </div>`;
    stage.querySelector('.seal').addEventListener('click', open);
    setBtn();
  }
  const sc = () => stage.querySelector('.scroll');
  function setState(s) { st = s; sc().dataset.state = s; setBtn(); }
  function setBtn() { btn.textContent = st === 'open' ? 'Roll it back up' : st === 'sealed' ? 'Break the seal' : '…'; btn.disabled = !(st === 'open' || st === 'sealed'); }
  function open() {
    if (st !== 'sealed') return;
    clear(); setState('breaking');
    const sheet = sc().querySelector('.sheet'), content = sheet.firstElementChild;
    later(() => {
      setState('opening');
      const h = content.scrollHeight;
      const dur = reduce ? 0 : Math.min(3600, 1500 + h * 1.3);
      sheet.style.setProperty('--dur', dur + 'ms');
      sc().style.setProperty('--dur', dur + 'ms');
      sheet.style.height = h + 'px';
      // ink each line as the roll passes it
      content.querySelectorAll('.line').forEach((el) => {
        const y = el.offsetTop + el.offsetHeight * .6;
        const p = Math.min(1, y / h);
        // ease-out timing curve inverse approximation: t = 1 - (1-p)^(1/2) ... use simple linear plus lead
        const t = reduce ? 0 : dur * (1 - Math.sqrt(1 - p)) * 0.95 + 120;
        el.style.setProperty('--d', t + 'ms');
      });
      requestAnimationFrame(() => sheet.classList.add('inked'));
      if (!reduce) {
        let touched = false; const off = () => { touched = true; };
        addEventListener('touchstart', off, { once: true, passive: true }); addEventListener('wheel', off, { once: true, passive: true });
        const roll = sc().querySelector('.roll'), t0 = performance.now();
        const follow = () => {
          if (touched || st !== 'opening' || performance.now() - t0 > dur + 200) return;
          const b = roll.getBoundingClientRect().bottom, lim = innerHeight * .9;
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
    const sheet = sc().querySelector('.sheet'), content = sheet.firstElementChild;
    const h = content.scrollHeight;
    const dur = reduce ? 0 : Math.min(2400, 1000 + h * .8);
    sheet.style.height = h + 'px'; sheet.style.setProperty('--dur', dur + 'ms'); sc().style.setProperty('--dur', dur + 'ms');
    content.querySelectorAll('.line').forEach((el) => el.style.setProperty('--d', '0ms'));
    sheet.classList.remove('inked'); setState('closing');
    const top = sc().getBoundingClientRect().top + scrollY - 90;
    if (scrollY > top) window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.style.height = '0px'; }));
    later(() => { setState('resealing'); later(() => setState('sealed'), 700); }, dur + 60);
  }
  btn.addEventListener('click', () => (st === 'open' ? close() : open()));
  function load(l) { clear(); L = l; st = 'sealed'; build(); }
  return { load, open, close, get state() { return st; } };
})();

/* ---------- boot ---------- */
setReduce(reduce);
setTheme(state.theme, false);
renderPicker();
book.load(listing());
scroll.load(listing());
setView(state.view);
window.TD_LAB = { book, scroll, setView, setTheme };
})();
