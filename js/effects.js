// Category opening effects (2026-11-16, Grymm t130u): a short (≤2.5 s), tasteful flourish played over a
// listing's book the moment it opens, keyed off the listing's category. CSS + a tiny canvas particle helper,
// no libraries. Everything sits in one pointer-events:none layer that removes itself; reading is never blocked.
// Skipped entirely under reduced motion or when the reader turns Effects off (localStorage 'td-fx' = '0').
export const FX_LIST = {
  spectral: 'Ghost wisps drift up out of the pages and fade',
  mayhem: 'Blood seeps into the page edges and drips down the cover',
  abandoned: 'A puff of dust is blown off the cover',
  mortuary: 'A candle is snuffed; a curl of smoke and a corner of funeral crepe',
  vice: 'A whiskey ring stains the cover and an ace of spades slides out',
  blight: 'Cracks split the leather and mold creeps across it',
  media: 'A flashbulb pops; scraps of old newsprint flutter down',
  record: 'A wax seal is pressed and a quill flourish inks in',
  oddity: 'Blueprint lines sketch the house across the cover',
  folklore: 'Moths flutter up out of the book',
  attraction: 'A faded ticket stub slides out under a flickering bulb',
  heritage: 'Warm light catches the gilt crest',
};
const DUR = 2500;
export const fxOn = () => { try { return localStorage.getItem('td-fx') !== '0'; } catch { return true; } };
export function setFx(on) {
  try { localStorage.setItem('td-fx', on ? '1' : '0'); } catch { /* ignore */ }
  document.documentElement.classList.toggle('nofx', !on);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const motionOff = () => document.documentElement.classList.contains('rm');

// Small canvas particle runner (dust, newsprint). Stops itself at the end of the effect or when the page is hidden.
function particles(layer, { n, init, step, draw, dur = 2200 }) {
  const c = document.createElement('canvas'); c.className = 'fx-cv';
  const r = layer.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const pad = 0.35, W = r.width * (1 + 2 * pad), H = r.height * (1 + 2 * pad);
  c.width = W * dpr; c.height = H * dpr; c.style.cssText = `left:${-pad * 100}%;top:${-pad * 100}%;width:${(1 + 2 * pad) * 100}%;height:${(1 + 2 * pad) * 100}%`;
  layer.appendChild(c);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const ox = r.width * pad, oy = r.height * pad;
  const P = Array.from({ length: n }, (_, i) => init(i, r.width, r.height));
  const t0 = performance.now(); let last = t0;
  const f = (now) => {
    if (!c.isConnected || document.hidden) return;
    const t = (now - t0) / dur, dt = Math.min(50, now - last) / 1000; last = now;
    g.clearRect(0, 0, W, H);
    for (const p of P) { step(p, dt, t); draw(g, p, ox, oy, t); }
    if (t < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

const svg = (body, vb = '0 0 100 140') => `<svg class="fx-svg" viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
const BUILD = {
  spectral: (L) => { L.innerHTML = [0, 1, 2].map((i) => `<i class="wisp" style="--dx:${[-18, 14, -4][i]}%;--r:${[-12, 10, 3][i]}deg;--d:${i * 260}ms;left:${[30, 52, 41][i]}%"></i>`).join(''); },
  mayhem: (L) => {
    L.innerHTML = [[2, 22, 34], [94, 58, 40], [6, 84, 30], [90, 14, 24], [48, 98, 26]].map(([x, y, s], i) => `<i class="stain" style="left:${x}%;top:${y}%;--s:${s}%;--d:${i * 180}ms;--br:${['58% 42% 63% 37%/45% 58% 42% 55%', '42% 58% 37% 63%/60% 40% 60% 40%', '50% 50% 40% 60%/55% 45% 55% 45%'][i % 3]}"></i>`).join('')
      + [[22, 22], [37, 34], [61, 18], [76, 28]].map(([x, h], i) => `<i class="drip" style="left:${x}%;--h:${h}%;--d:${300 + i * 220}ms"></i>`).join('');
  },
  abandoned: (L) => {
    L.innerHTML = '<i class="film"></i>';
    particles(L, { n: 190, dur: 2300,
      init: (i, w, h) => ({ x: rnd(.05, .95) * w, y: rnd(.05, .95) * h, vx: rnd(40, 160), vy: rnd(-120, -20), r: rnd(.8, 2.8), a: rnd(.45, .9), d: rnd(0, .3), tone: Math.random() < .55 }),
      step: (p, dt, t) => { if (t < p.d) return; p.vx *= .985; p.vy = p.vy * .985 + 8 * dt; p.x += (p.vx + Math.sin(p.y * .05) * 30) * dt; p.y += p.vy * dt; },
      draw: (g, p, ox, oy, t) => { const k = t < p.d ? 0 : Math.max(0, 1 - (t - p.d) / (1 - p.d)); if (!k) return; g.fillStyle = p.tone ? `rgba(122,110,92,${p.a * k})` : `rgba(214,204,184,${p.a * k})`; g.beginPath(); g.arc(p.x + ox, p.y + oy, p.r, 0, 6.283); g.fill(); } });
  },
  mortuary: (L) => {
    L.innerHTML = '<i class="crepe"></i><div class="candle"><i class="flame"></i><b></b></div>'
      + svg('<path class="smoke" d="M14 112 C 8 98, 22 92, 14 80 S 6 60, 18 50 S 26 30, 14 18"/>');
  },
  vice: (L) => {
    L.innerHTML = svg('<circle class="ring" cx="64" cy="44" r="17"/><circle class="ring r2" cx="64" cy="44" r="14"/>')
      + '<div class="pcard"><span>A</span><b>♠</b><span class="r">A</span></div>';
  },
  blight: (L) => {
    L.innerHTML = [[10, 12, 30], [78, 70, 34], [30, 86, 26], [86, 22, 22], [55, 48, 18]].map(([x, y, s], i) => `<i class="mold" style="left:${x}%;top:${y}%;--s:${s}%;--d:${400 + i * 160}ms"></i>`).join('')
      + svg('<path class="crack" d="M0 18 L12 24 L18 22 L27 31 L35 30 L44 40 L50 39"/><path class="crack c2" d="M100 96 L88 92 L83 98 L72 95 L64 104 L55 103 L49 112"/><path class="crack c3" d="M44 40 L47 52 L42 60 L46 71"/><path class="crack c4" d="M27 31 L22 41 L25 48"/>');
  },
  media: (L) => {
    L.innerHTML = '<i class="flash"></i>';
    setTimeout(() => L.isConnected && particles(L, { n: 11, dur: 2000,
      init: (i, w, h) => ({ x: rnd(.15, .85) * w, y: rnd(-.05, .25) * h, vx: rnd(-40, 40), vy: rnd(30, 90), a: rnd(0, 6.28), va: rnd(-2.4, 2.4), w: rnd(40, 64), h: rnd(24, 38), s: rnd(0, 6.28) }),
      step: (p, dt) => { p.s += dt * 5; p.x += (p.vx + Math.sin(p.s) * 30) * dt; p.y += p.vy * dt; p.a += p.va * dt; },
      draw: (g, p, ox, oy, t) => {
        const k = Math.min(1, t * 6) * Math.max(0, 1 - Math.max(0, t - .7) / .3);
        g.save(); g.translate(p.x + ox, p.y + oy); g.rotate(p.a); g.scale(1, Math.abs(Math.cos(p.s * .6)) * .6 + .4); g.globalAlpha = k;
        g.fillStyle = '#d9c9a2'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.fillStyle = 'rgba(60,45,30,.55)'; for (let y = -p.h / 2 + 4; y < p.h / 2 - 2; y += 3.2) g.fillRect(-p.w / 2 + 3, y, p.w - 6 - ((y * 7) % 9), 1.1);
        g.restore(); } }), 180);
  },
  record: (L) => {
    L.innerHTML = svg('<path class="quill" d="M18 112 C 30 100, 44 118, 54 106 S 76 92, 84 104 C 88 110, 80 116, 74 110"/>')
      + '<div class="wax"><span>TD</span></div>';
  },
  oddity: (L) => {
    L.innerHTML = '<i class="bp-grid"></i>' + svg('<path class="bp" d="M20 92 L20 52 L50 28 L80 52 L80 92 Z"/><path class="bp b2" d="M20 52 L80 52 M50 28 L50 18 L58 18 L58 34"/><path class="bp b3" d="M30 92 L30 66 L42 66 L42 92 M56 62 L70 62 L70 76 L56 76 Z"/><path class="bp b4" d="M12 100 L88 100 M12 97 L12 103 M88 97 L88 103 M8 92 L8 52 M5 92 L11 92 M5 52 L11 52"/>');
  },
  folklore: (L) => {
    const moth = '<svg viewBox="0 0 40 28" aria-hidden="true"><g class="w"><path d="M20 14 C 12 2, 2 2, 3 10 C 4 16, 12 17, 20 15Z M20 15 C 13 18, 7 24, 11 26 C 15 27, 18 21, 20 16Z"/><path d="M20 14 C 28 2, 38 2, 37 10 C 36 16, 28 17, 20 15Z M20 15 C 27 18, 33 24, 29 26 C 25 27, 22 21, 20 16Z"/></g><rect x="19.2" y="10" width="1.6" height="10" rx=".8"/></svg>';
    L.innerHTML = [[-38, -70, 0], [30, -82, 220], [-8, -96, 420], [44, -54, 640]].map(([x, y, d], i) => `<i class="moth" style="--x:${x}%;--y:${y}%;--d:${d}ms;--r:${[-24, 18, -6, 30][i]}deg">${moth}</i>`).join('');
  },
  attraction: (L) => { L.innerHTML = '<i class="bulb"></i><div class="ticket"><b>Admit One</b><small>No. 0413</small></div>'; },
  heritage: (L) => { L.innerHTML = '<i class="glow"></i><i class="sheen"></i>'; },
};
// Play one category's effect over `stage` (the book stage). Returns true if it ran.
export function playOpenFx(stage, key, { force = false } = {}) {
  const build = BUILD[key];
  if (!build || !stage?.isConnected || (!force && (!fxOn() || motionOff()))) return false;
  stage.querySelectorAll('.fx-layer').forEach((x) => x.remove());
  const book = stage.querySelector('.book'), sr = stage.getBoundingClientRect();
  const br = (book?.querySelector('.leaf') || book)?.getBoundingClientRect() || sr;
  const L = document.createElement('div');
  L.className = `fx-layer fx-${key}`; L.setAttribute('aria-hidden', 'true');
  L.style.cssText = `left:${br.left - sr.left}px;top:${br.top - sr.top}px;width:${br.width}px;height:${br.height}px`;
  stage.appendChild(L);
  build(L);
  setTimeout(() => L.remove(), DUR + 150);
  return true;
}
