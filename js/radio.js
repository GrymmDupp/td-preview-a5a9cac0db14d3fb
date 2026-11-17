// "An old radio playing in another room": optional, OFF by default, only ever started by a tap.
// Public-domain recordings only (see AUDIO_LICENSES.md), lazy-loaded from assets/audio/ (never
// precached). Web Audio makes them sound like they drift through a wall late at night: band-limited
// "telephone" EQ, heavy low-pass, a small room, very low volume, AM hiss + soft crackle, and a faint
// tuning sweep between tracks. Pauses when the tab is hidden. Never loaded on /live/.
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const A = (n) => `assets/audio/radio-${n}.mp3`;
export const TRACKS = {
  rose: 'Rose Room · Joseph C. Smith’s Orchestra, 1918', sandman: 'The Japanese Sandman · Paul Whiteman & His Ambassador Orchestra, 1920',
  homesick: 'Homesick · Ted Lewis & His Band, 1922', oneilove: 'The One I Love (Belongs to Somebody Else) · Harry Raderman’s Dance Orchestra, Edison 1924',
  three: 'Three O’Clock in the Morning · Bar Harbor Society Orchestra, Vocalion 1922', danse: 'Danse macabre · Philadelphia Orchestra, Stokowski, Victor 1925',
  godrest: 'God Rest You Merry, Gentlemen · The Carol Singers, Edison 1917', silent: 'Silent Night · Starlifter & Roots in Blue, US Air Force Band of Mid-America',
  holy: 'O Holy Night · Starlifter & Roots in Blue, US Air Force Band of Mid-America', jingle: 'Jingle Bells · Starlifter & Roots in Blue, US Air Force Band of Mid-America',
};
const GENERAL = ['rose', 'sandman', 'homesick', 'oneilove'];
// Seasonal playlists from the device date; a season with fewer than 3 verified tracks is topped up from GENERAL.
export function playlist(d = new Date()) {
  const m = d.getMonth();
  let name, list;
  if (m === 9) { name = 'Hallowe’en'; list = ['danse', 'sandman', 'rose']; }
  else if (m === 10) { name = 'Late autumn'; list = ['oneilove', 'three', 'sandman', 'homesick', 'rose']; }
  else if (m === 11) { name = 'Christmas'; list = ['silent', 'godrest', 'holy', 'jingle']; }
  else if (m <= 1) { name = 'Winter fireside'; list = ['three', 'oneilove', 'rose']; }
  else { name = 'Evening dance band'; list = GENERAL.slice(); }
  for (const t of GENERAL) if (list.length < 3 && !list.includes(t)) list.push(t);
  return { name, list };
}
export const radioWanted = () => ls.get('td-radio') === '1';
let ac, el, src, master, hissG, room, chain, playing = false, idx = 0, order = [], sweeping = false;
const VOL = 0.11;   // softer than the reference: a radio in the next room
function noiseBuf(a, sec, crackle) {
  const b = a.createBuffer(1, Math.floor(a.sampleRate * sec), a.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; if (crackle && Math.random() < 0.00035) d[i] += (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5); }
  return b;
}
function impulse(a, sec = 1.3) {
  const len = Math.floor(a.sampleRate * sec), b = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  return b;
}
function build() {
  ac = new (window.AudioContext || window.webkitAudioContext)();
  el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
  src = ac.createMediaElementSource(el);
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
  const tel = ac.createBiquadFilter(); tel.type = 'peaking'; tel.frequency.value = 900; tel.Q.value = 0.9; tel.gain.value = 4;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.5;
  const wall = ac.createBiquadFilter(); wall.type = 'lowshelf'; wall.frequency.value = 300; wall.gain.value = 3;   // warm, not thin
  room = ac.createConvolver(); room.buffer = impulse(ac);
  const dry = ac.createGain(); dry.gain.value = 0.78; const wet = ac.createGain(); wet.gain.value = 0.32;
  master = ac.createGain(); master.gain.value = 0.0001;
  src.connect(hp); hp.connect(tel); tel.connect(wall); wall.connect(lp); lp.connect(dry); lp.connect(room); room.connect(wet); dry.connect(master); wet.connect(master);
  // AM hiss + soft crackle, through the same wall
  const hiss = ac.createBufferSource(); hiss.buffer = noiseBuf(ac, 4, true); hiss.loop = true;
  const hb = ac.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 1400; hb.Q.value = 0.6;
  hissG = ac.createGain(); hissG.gain.value = 0.05;
  hiss.connect(hb); hb.connect(hissG); hissG.connect(lp);
  hiss.start();
  master.connect(ac.destination);
  chain = { lp };
  el.addEventListener('ended', () => next(true));
  el.addEventListener('error', () => { if (playing) setTimeout(() => next(false), 800); });
}
// faint tuning sweep between stations
function sweep() {
  if (!ac || sweeping) return; sweeping = true;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter();
  o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.7); o.frequency.exponentialRampToValueAtTime(780, t + 1.4);
  bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 1.5;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  o.connect(bp); bp.connect(g); g.connect(chain.lp); o.start(t); o.stop(t + 1.6);
  hissG.gain.setValueAtTime(0.05, t); hissG.gain.linearRampToValueAtTime(0.16, t + 0.5); hissG.gain.linearRampToValueAtTime(0.05, t + 1.6);
  setTimeout(() => { sweeping = false; }, 1600);
}
function fade(to, sec = 1.2) { if (!master) return; const t = ac.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t); master.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + sec); }
function load(i) { idx = (i + order.length) % order.length; el.src = A(order[idx]); el.load(); }
async function next(withSweep) {
  if (!playing) return;
  if (withSweep) sweep();
  load(idx + 1);
  setTimeout(() => { if (playing) el.play().catch(() => {}); }, withSweep ? 1200 : 0);
  emit();
}
let listeners = [];
export const onRadio = (fn) => { listeners.push(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(state()); } catch { /* ignore */ } });
export const state = () => ({ on: playing, wanted: radioWanted(), season: playlist().name, track: order.length ? TRACKS[order[idx]] : '' });
// Must be called from a user gesture.
export async function radioOn() {
  if (/\/live\//.test(location.pathname)) return false;
  if (!ac) build();
  if (ac.state === 'suspended') await ac.resume();
  if (!order.length) { const p = playlist(); order = p.list.slice().sort(() => Math.random() - 0.5); load(0); }
  playing = true; ls.set('td-radio', '1');
  sweep();
  try { await el.play(); } catch { /* blocked: stays off */ playing = false; emit(); return false; }
  fade(VOL, 2.5); emit(); return true;
}
export function radioOff(remember = true) {
  if (remember) ls.set('td-radio', '0');
  if (!playing) { emit(); return; }
  playing = false; fade(0.0001, 0.8); setTimeout(() => { if (!playing) { el?.pause(); ac?.suspend(); } }, 900); emit();
}
export const radioToggle = () => (playing ? (radioOff(), false) : radioOn());
// Remembered "on": resumes on the next tap anywhere (never autoplays on load). Pauses when hidden.
export function initRadio({ soundOn }) {
  if (/\/live\//.test(location.pathname)) return;
  const resume = () => { if (radioWanted() && soundOn() && !playing) radioOn(); };
  if (radioWanted()) addEventListener('pointerdown', resume, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) { if (playing) { el.pause(); ac.suspend(); } }
    else if (playing) { ac.resume(); el.play().catch(() => {}); }
  });
}
