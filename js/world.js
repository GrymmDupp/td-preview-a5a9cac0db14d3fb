// Twisted Deeds "world": free, local-only ambience and small conveniences. No accounts, no keys,
// no libraries. Everything here is skipped or made static under Reduce motion / Effects off.
//  - onThisDay(): a home line drawn ONLY from full dates already written in the public feed text
//  - time-of-day mood, tonight's moon (computed locally), seasonal touches (radio seasons)
//  - rain on the window (Open-Meteo, only if location was ALREADY granted; never prompts)
//  - haptics (navigator.vibrate; iOS ignores it), offline plaque, keep opened books for offline
//  - read aloud (speechSynthesis, public preview text only), pulled-at-random
import { fxOn } from './effects.js';
import { leatherFor } from './taxonomy.js';

const root = document.documentElement;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const rmOn = () => root.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- On this day (real dates in the public text only) ---------------- */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const RX = [new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(1[5-9]\\d\\d|20\\d\\d)\\b`, 'g'), new RegExp(`\\b(\\d{1,2})\\s+${MON}\\s+(1[5-9]\\d\\d|20\\d\\d)\\b`, 'g')];
const monIdx = (s) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
const sentenceAround = (t, i, j) => {
  const a = Math.max(t.lastIndexOf('. ', i) + 1, t.lastIndexOf('; ', i) + 1, 0), b0 = t.slice(j).search(/[.;](\s|$)/);
  let s = t.slice(a, b0 < 0 ? t.length : j + b0 + 1).trim();
  if (s.length > 190) s = s.slice(0, 187).replace(/\s+\S*$/, '') + '…';
  return s;
};
// Every full (day + month + year) date in a listing's public preview text, earlier than this year.
export function datedLines(listings, now = new Date()) {
  const out = [];
  for (const l of listings || []) {
    for (const t of [l.preview?.summary, l.preview?.teaser, l.facts].map((x) => String(x || ''))) {
      RX.forEach((rx, k) => { for (const m of t.matchAll(rx)) {
        const mo = monIdx(k ? m[2] : m[1]), d = +(k ? m[1] : m[2]), y = +m[3];
        if (mo < 0 || d < 1 || d > 31 || y >= now.getFullYear()) continue;
        out.push({ id: l.id, name: l.name, mo, d, y, text: sentenceAround(t, m.index, m.index + m[0].length) });
      } });
    }
  }
  return out;
}
// Today's match ("On this day in 1903"), else the nearest within 3 days ("This week in 1911"), else null.
export function onThisDay(listings, now = new Date()) {
  const all = datedLines(listings, now); if (!all.length) return null;
  const dayOf = (y, mo, d) => Date.UTC(y, mo, d) / 864e5;
  const today = dayOf(2001, now.getMonth(), now.getDate());
  const dist = (x) => { const v = Math.abs(dayOf(2001, x.mo, x.d) - today); return Math.min(v, 365 - v); };
  const pick = (arr) => arr[(now.getFullYear() * 400 + now.getMonth() * 31 + now.getDate()) % arr.length];
  const exact = all.filter((x) => dist(x) === 0);
  if (exact.length) return { kind: 'day', ...pick(exact) };
  const near = all.filter((x) => dist(x) <= 3).sort((a, b) => dist(a) - dist(b));
  return near.length ? { kind: 'week', ...near[0] } : null;
}
export function onThisDayLine(listings, now = new Date()) {
  const x = onThisDay(listings, now); if (!x) return '';
  return `<aside class="otd" aria-label="${x.kind === 'day' ? 'On this day' : 'This week'} in ${x.y}"><span class="otd-k">${x.kind === 'day' ? 'On this day' : 'This week'} in <b>${x.y}</b>…</span>
    <span class="otd-t">${esc(x.text)}</span> <a class="otd-l" href="#/l/${encodeURIComponent(x.id)}">${esc(x.name)} →</a></aside>`;
}

/* ---------------- moon (no API: mean synodic month from a known new moon) ---------------- */
const SYN = 29.530588853, NEW0 = Date.UTC(2000, 0, 6, 18, 14);
export function moonPhase(now = new Date()) {
  const age = (((now - NEW0) / 864e5) % SYN + SYN) % SYN, p = age / SYN, lit = (1 - Math.cos(2 * Math.PI * p)) / 2;
  const N = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = N[Math.floor((p * 8 + 0.5)) % 8];
  return { age, p, lit, name, full: lit > 0.965, waxing: p < 0.5 };
}
export function moonSvg(m = moonPhase(), size = 22) {
  const r = 9, c = 11, rx = Math.abs(Math.cos(2 * Math.PI * m.p)) * r;
  const outer = m.waxing ? 1 : 0, term = m.waxing ? (m.lit < 0.5 ? 0 : 1) : (m.lit < 0.5 ? 1 : 0);
  const lit = m.lit < 0.02 ? '' : m.lit > 0.98 ? `<circle cx="${c}" cy="${c}" r="${r}" fill="url(#mh)"/>`
    : `<path d="M${c} ${c - r}A${r} ${r} 0 0 ${outer} ${c} ${c + r}A${rx.toFixed(2)} ${r} 0 0 ${term} ${c} ${c - r}Z" fill="url(#mh)"/>`;
  return `<svg class="moon-svg" viewBox="0 0 22 22" width="${size}" height="${size}" aria-hidden="true"><defs>
    <pattern id="mh" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="2.2" height="2.2" fill="#e4d8ba"/><path d="M0 .3H2.2" stroke="#9c8a63" stroke-width=".45"/></pattern></defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="#1b1916"/>${lit}
    <g fill="none" stroke="#6d5f45" stroke-width=".5" opacity=".7"><circle cx="8" cy="8.5" r="1.6"/><circle cx="13.5" cy="13" r="2.1"/><circle cx="12.6" cy="6.6" r=".9"/><circle cx="7.6" cy="14.2" r="1"/></g>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#b39a66" stroke-width=".9"/><circle cx="${c}" cy="${c}" r="10.4" fill="none" stroke="#5c4d33" stroke-width=".4" stroke-dasharray=".6 .9"/></svg>`;
}
function mountMoon() {
  const head = document.querySelector('.site-head .head-in'); if (!head) return;
  let el = head.querySelector('.moon'); const m = moonPhase();
  if (!el) { el = document.createElement('span'); el.className = 'moon'; head.querySelector('.tag')?.after(el); }
  el.innerHTML = moonSvg(m); el.title = `Tonight: ${m.name} · ${Math.round(m.lit * 100)}% lit`;
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', `Tonight's moon: ${m.name}, ${Math.round(m.lit * 100)} percent lit`);
  root.classList.toggle('full-moon', m.full && fxOn());
}

/* ---------------- time of day ---------------- */
export function timeOfDay(now = new Date()) { const h = now.getHours() + now.getMinutes() / 60; return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20.5 ? 'dusk' : 'night'; }
let forcedTod = null;
export function applyTod(t) {
  if (t !== undefined) forcedTod = t;
  const v = fxOn() ? (forcedTod || timeOfDay()) : '';
  ['dawn', 'day', 'dusk', 'night'].forEach((k) => root.classList.toggle('tod-' + k, v === k));
  if (!document.querySelector('.tod-veil')) { const d = document.createElement('div'); d.className = 'tod-veil'; d.setAttribute('aria-hidden', 'true'); (document.querySelector('.atmo-back') || document.body).appendChild(d); }
}

/* ---------------- seasonal touches (same seasons as the radio) ---------------- */
export function seasonFor(now = new Date()) { const m = now.getMonth(); return m === 9 ? 'oct' : m === 10 ? 'nov' : m === 11 ? 'dec' : m <= 1 ? 'frost' : ''; }
const LEAF = ['M10 1C5 5 3 10 6 15c1 2 3 3 4 4 1-1 3-2 4-4 3-5 1-10-4-14z', 'M10 2l2 4 4-1-2 4 4 2-4 1 1 4-4-2-1 4-1-4-4 2 1-4-4-1 4-2-2-4 4 1z'];
let forcedSeason = null;
export function applySeason(s) {
  if (s !== undefined) forcedSeason = s;
  document.querySelector('.season')?.remove();
  const want = forcedSeason ?? seasonFor(); root.dataset.season = want || '';
  if (!want || !fxOn()) return;
  const moving = !rmOn(), el = document.createElement('div');
  el.className = `season s-${want}`; el.setAttribute('aria-hidden', 'true');
  const r = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
  if (want === 'oct') el.innerHTML = '<i class="cglow l"></i><i class="cglow r"></i><span class="jack"><svg viewBox="0 0 40 34" width="30" height="26"><path d="M20 6c-3-4-1-6 2-6-1 2-1 4 0 6" fill="#3b2a15"/><ellipse cx="20" cy="20" rx="18" ry="13" fill="#2a1a0c" stroke="#5a3a18"/><path d="M11 17l4-3 2 4zM29 17l-4-3-2 4zM10 23c4 4 16 4 20 0l-3 2-2-2-2 2-3-2-3 2-2-2-2 2z" fill="#ffb347"/></svg></span>';
  else if (want === 'nov') { if (!moving) return; el.innerHTML = Array.from({ length: 7 }, (_, i) => `<i class="leaf" style="left:${r(2, 96)}%;--d:${r(15, 24)}s;--w:${r(-8, 0)}s;--x:${r(-60, 60)}px;--s:${r(.7, 1.15)};--c:${['#7a3b1a', '#8c5a1f', '#5e2a16', '#9a6b2a'][i % 4]}"><svg viewBox="0 0 20 20" width="16" height="16"><path d="${LEAF[i % 2]}" fill="currentColor"/></svg></i>`).join(''); }
  else if (want === 'dec') { if (!moving) return; el.innerHTML = Array.from({ length: 24 }, () => `<i class="flake" style="left:${r(0, 100)}%;--d:${r(11, 22)}s;--w:${r(-22, 0)}s;--x:${r(-30, 30)}px;--z:${r(1.5, 3.6)}px"></i>`).join(''); }
  else if (want === 'frost') el.innerHTML = '<i class="frost"></i>';
  document.body.appendChild(el);
}

/* ---------------- rain on the window (location already granted only) ---------------- */
const WX_KEY = 'td-wx', WX_TTL = 30 * 60e3;
const rainy = (c) => (c.rain || 0) > 0 || (c.showers || 0) > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c.weather_code);
export function setRain(on) {
  document.querySelector('.rainpane')?.remove(); root.classList.toggle('raining', !!on);
  if (!on || !fxOn() || rmOn()) return;
  const el = document.createElement('div'); el.className = 'rainpane'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i class="sheet a"></i><i class="sheet b"></i>' + Array.from({ length: 9 }, () => `<i class="bead" style="left:${(Math.random() * 100).toFixed(1)}%;--d:${(5 + Math.random() * 7).toFixed(1)}s;--w:-${(Math.random() * 8).toFixed(1)}s"></i>`).join('');
  document.body.appendChild(el);
}
export async function checkWeather() {
  try {
    const c = JSON.parse(ls.get(WX_KEY) || 'null');
    if (c && Date.now() - c.t < WX_TTL) { setRain(c.rain); return c; }
    if (!navigator.permissions?.query || !navigator.geolocation) return null;
    const st = await navigator.permissions.query({ name: 'geolocation' });
    if (st.state !== 'granted') return null;                     // never prompt just for weather
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { maximumAge: WX_TTL, timeout: 8000, enableHighAccuracy: false }));
    const lat = pos.coords.latitude.toFixed(2), lon = pos.coords.longitude.toFixed(2);   // ~1 km, not stored precisely
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=rain,showers,weather_code`);
    if (!r.ok) return null;
    const cur = (await r.json()).current || {}, out = { t: Date.now(), rain: rainy(cur) };
    ls.set(WX_KEY, JSON.stringify(out)); setRain(out.rain); return out;
  } catch { return null; }
}

/* ---------------- haptics ---------------- */
export const hapticsOn = () => ls.get('td-hap') !== '0';
export const setHaptics = (on) => ls.set('td-hap', on ? '1' : '0');
const PULSE = { seal: [18, 40, 28], page: 9, ribbon: [12, 30, 12] };
export function buzz(kind) { try { if (hapticsOn() && navigator.vibrate && (navigator.userActivation ? navigator.userActivation.isActive : true)) navigator.vibrate(PULSE[kind] || 10); } catch { /* not supported */ } }

/* ---------------- offline: plaque + keep opened books ---------------- */
function offlinePlaque() {
  let el = document.querySelector('.offline-plaque');
  if (navigator.onLine) { el?.classList.remove('in'); return; }
  if (!el) { el = document.createElement('div'); el.className = 'offline-plaque'; el.setAttribute('role', 'status');
    el.innerHTML = '<span class="op-orn" aria-hidden="true">❦</span><b>The lamps are out</b><span>You are offline. The books you have opened are still on the shelf.</span>'; document.body.appendChild(el); }
  requestAnimationFrame(() => el.classList.add('in'));
}
export function keepBook(l) {
  try {
    const sw = navigator.serviceWorker?.controller; if (!sw || !l) return;
    const urls = (l.images || []).map((i) => i.url || i.src).filter((u) => /^https?:/.test(u || '')).slice(0, 4);
    sw.postMessage({ type: 'td-keep', id: l.id, urls });
  } catch { /* no SW */ }
}

/* ---------------- read aloud (public preview text) ---------------- */
let reading = null;
export const canRead = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
export function readAloud(btnBox, parts, rate = 1) {
  if (!canRead()) return false;
  stopReading();
  const chunks = parts.flatMap((p) => String(p || '').split(/(?<=[.!?])\s+/)).map((s) => s.trim()).filter(Boolean);
  reading = { box: btnBox, i: 0, chunks, rate, paused: false };
  const v = speechSynthesis.getVoices().find((x) => /^en(-|_)/i.test(x.lang) && /UK|GB|Daniel|Arthur/i.test(x.name + x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
  const next = () => {
    if (!reading || reading.i >= reading.chunks.length) { stopReading(); return; }
    const u = new SpeechSynthesisUtterance(reading.chunks[reading.i++]); u.rate = reading.rate; u.pitch = 0.95; if (v) u.voice = v;
    u.onend = () => reading && !reading.paused && next(); u.onerror = () => reading && next();
    speechSynthesis.speak(u);
  };
  reading.next = next; next(); paintReader(); return true;
}
export function pauseReading() {
  if (!reading) return;
  if (reading.paused) { reading.paused = false; speechSynthesis.resume(); if (!speechSynthesis.speaking) reading.next(); }
  else { reading.paused = true; speechSynthesis.pause(); }
  paintReader();
}
export function stopReading() { if (canRead()) speechSynthesis.cancel(); const r = reading; reading = null; if (r) paintReader(r.box); }
export function setReadRate(rate) { if (reading) reading.rate = rate; }
function paintReader(box = reading?.box) {
  if (!box) return; const on = !!reading && reading.box === box;
  box.classList.toggle('on', on); box.classList.toggle('paused', on && reading.paused);
  const p = box.querySelector('[data-read-pause]'); if (p) { p.hidden = !on; p.textContent = on && reading.paused ? 'Resume' : 'Pause'; }
  const s = box.querySelector('[data-read-stop]'); if (s) s.hidden = !on;
  const g = box.querySelector('[data-read]'); if (g) g.setAttribute('aria-pressed', String(on));
}
addEventListener('hashchange', () => stopReading());
addEventListener('pagehide', () => stopReading());

/* ---------------- pulled at random ---------------- */
export function pullRandom(list, go) {
  if (!list?.length) return;
  const l = list[Math.floor(Math.random() * list.length)];
  const spine = document.querySelector(`.shelf .spine[data-spine="${CSS.escape(l.layer || '')}"]`);
  const done = () => go(l);
  if (rmOn() || !fxOn()) { done(); return; }
  if (spine) { spine.classList.add('pulling'); setTimeout(done, 750); return; }
  const b = document.createElement('div'); b.className = 'pull-book'; b.setAttribute('aria-hidden', 'true');
  b.innerHTML = `<i class="pb-spine" style="--leather:${leatherFor(l.layer)}"><span>${esc(l.name)}</span></i>`;
  document.body.appendChild(b); setTimeout(() => { done(); b.remove(); }, 900);
}

/* ---------------- boot ---------------- */
export function syncWorld() { applyTod(); applySeason(); mountMoon(); if (!canRead()) document.querySelectorAll('.reader').forEach((r) => { r.hidden = true; }); }
export function initWorld() {
  syncWorld(); offlinePlaque();
  addEventListener('online', offlinePlaque); addEventListener('offline', offlinePlaque);
  setInterval(() => { applyTod(); mountMoon(); }, 10 * 60e3);
  const wx = () => { if (!document.hidden) checkWeather(); };
  setTimeout(wx, 1500); setInterval(wx, WX_TTL);
}
