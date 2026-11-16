/* Twisted History atmosphere: film scratches + dust on a low-res canvas (~11 fps).
   Fog, grain, vignette and flicker are pure CSS (transform/opacity only).
   Stops when: theme is Gilded, motion is reduced, or the tab is hidden. */
(() => {
'use strict';
const cv = document.getElementById('scratch');
if (!cv) return;
const ctx = cv.getContext('2d', { alpha: true });
const root = document.documentElement;
let timer = 0, W = 0, H = 0;
const SCALE = 0.5; // draw at half resolution; CSS stretches it (scratches are soft anyway)
const active = () => root.dataset.theme === 'th' && !root.classList.contains('rm') && !document.hidden;
function size() {
  W = Math.max(1, Math.round(innerWidth * SCALE)); H = Math.max(1, Math.round(innerHeight * SCALE));
  cv.width = W; cv.height = H;
}
let hair = null; // occasional long-lived scratch that wanders for a few frames
function frame() {
  ctx.clearRect(0, 0, W, H);
  const r = Math.random;
  // vertical scratches
  if (r() < 0.55) {
    const n = r() < 0.8 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const x = r() * W, y0 = r() * H * 0.4, len = H * (0.35 + r() * 0.65);
      ctx.strokeStyle = r() < 0.7 ? `rgba(235,230,220,${0.10 + r() * 0.14})` : `rgba(0,0,0,${0.18 + r() * 0.2})`;
      ctx.lineWidth = r() < 0.85 ? 0.6 : 1.1;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (r() - 0.5) * 3, y0 + len); ctx.stroke();
    }
  }
  if (!hair && r() < 0.03) hair = { x: r() * W, life: 6 + (r() * 8 | 0) };
  if (hair) {
    hair.x += (r() - 0.5) * 2; hair.life--;
    ctx.strokeStyle = 'rgba(240,236,228,.16)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(hair.x, 0); ctx.bezierCurveTo(hair.x + 4, H * .3, hair.x - 4, H * .7, hair.x + 2, H); ctx.stroke();
    if (hair.life <= 0) hair = null;
  }
  // dust specks
  const d = r() < 0.6 ? 1 + (r() * 4 | 0) : 0;
  for (let i = 0; i < d; i++) {
    const x = r() * W, y = r() * H, s = 0.4 + r() * 1.6;
    ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.25 + r() * 0.3})` : `rgba(240,236,228,${0.18 + r() * 0.25})`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.5 + r()), r() * 3, 0, 6.283); ctx.fill();
  }
}
function start() { if (timer || !active()) return; size(); timer = setInterval(frame, 90); }
function stop() { clearInterval(timer); timer = 0; ctx.clearRect(0, 0, W, H); }
const sync = () => (active() ? start() : stop());
addEventListener('td-theme', sync); addEventListener('td-rm', sync);
document.addEventListener('visibilitychange', sync);
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (timer) size(); }, 200); });
sync();
})();
