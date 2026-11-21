/* Twisted Deeds · Live navigator · Driving mode (2026-11-21, Grymm t226u).
 * Navigator mode = a passenger holds the phone (the map as before). Driving mode = phone mounted: a big, glanceable
 * card, spoken alerts, and a hands-free voice back-and-forth using only the browser's own Web Speech API
 * (speechSynthesis out, SpeechRecognition in). Nothing is sent to us or to any paid service; the browser's own
 * speech service may process the audio (Chrome uses Google's, Safari uses Apple's).
 * Every reply is built only from what the app already shows: listing and Archive summaries / lore teasers (the free
 * preview), marker and cemetery names and types. Never a street address (area only), never a paid full file,
 * never MLS numbers or internal labels. */
(function () {
'use strict';
const A = window.__tdLiveDriveApi;
if (!A) return;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const FEED_URL = 'https://grymmdupp.github.io/twisted-deeds-feed/feed/listings.json';
const FEED_FALLBACK = '../data/listings.snapshot.json';
const ARCH_URL = 'https://grymmdupp.github.io/twisted-deeds-feed/feed/archive.json';

// ---------------------------------------------------------------- support
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const canTalk = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const iosPwa = isIOS && standalone;              // iPhone home-screen apps: speech recognition is missing or unreliable
let micBlocked = false;
const canHear = () => !!SR && !iosPwa && !micBlocked;
function supportText() {
  const out = (canTalk ? 'Spoken alerts and replies work in this browser.' : 'This browser cannot speak, so alerts show on screen only.') + ' ';
  if (micBlocked) return out + 'Voice commands are off because the microphone is blocked. Allow the microphone for this site in your browser or phone settings, then reopen Driving mode. Until then, use the big More, Skip and Next buttons.';
  if (iosPwa) return out + 'Voice commands are not available in the iPhone home-screen app. Open this page in Safari to talk to it, or use the big More, Skip and Next buttons.';
  if (!SR) return out + 'Voice commands are not available in this browser (for example Firefox). Driving mode still speaks alerts; use the big More, Skip and Next buttons. Chrome or Safari support voice commands.';
  return out + 'Voice commands work here. Your browser’s own speech service turns what you say into text.';
}

// ---------------------------------------------------------------- settings
const D = Object.assign({ mode: 'nav', follow: true, wake: false, rate: 1 }, ls.get('td-drive', {}));
const saveD = () => ls.set('td-drive', D);
let active = false;

// ---------------------------------------------------------------- data (free preview text only)
const INFO = new Map();     // listing id -> { summary, loreTeaser, place, kind, gp, arch }
const ARCH = [];            // Archive places (not otherwise alerted on the live map)
async function getJson(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 9000);
  try { const r = await fetch(url, { cache: 'no-cache', signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
function keep(l, arch) {
  return { summary: l.summary || '', loreTeaser: l.loreTeaser || '', place: l.place || '', kind: l.kind || '', gp: l.geo_precision || '', arch: !!arch,
    area: l.area || l.neighborhood || l.neighbourhood || l.privacy_area || '' };
}
let dataP = null;
function loadData() {
  if (dataP) return dataP;
  dataP = (async () => {
    let feed = null;
    try { feed = await getJson(FEED_URL); } catch (e) { try { feed = await getJson(FEED_FALLBACK); } catch (e2) { feed = null; } }
    for (const l of (feed && feed.listings) || []) if (l.id) INFO.set(l.id, keep(l, l.collection === 'archive'));
    try {
      const a = await getJson((feed && feed.archive && feed.archive.url) || ARCH_URL);
      for (const l of a.listings || []) {
        if (!l.id) continue;
        INFO.set(l.id, keep(l, true));
        const lat = Number(l.lat), lon = Number(l.lon);
        if (l.lat == null || l.lon == null || !isFinite(lat) || !isFinite(lon)) continue;
        const approx = !!(l.geo_precision && l.geo_precision !== 'address');
        ARCH.push({ id: l.id, arch: true, name: l.name, lat, lon, approx, addr: l.place || '', privateHome: l.privateHome === true || l.kind === 'house' || approx, area: l.area || l.areaLabel || '', radiusM: Number(l.radiusM) || 0 });
      }
    } catch (e) { /* Archive shelf offline */ }
  })();
  return dataP;
}

// ---------------------------------------------------------------- privacy-safe wording
const SUFFIX = '(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Pl|Place|Way|Hwy|Highway|Pkwy|Parkway|Ter|Terrace|Cir|Circle|Trl|Trail|Pike|Sq|Square)';
const STREET_RE = new RegExp('\\b\\d{1,6}[A-Za-z]?\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9][\\w\'.-]*\\s+){0,3}' + SUFFIX + '\\b\\.?(?:\\s*,\\s*[A-Z][\\w.\'-]*(?:\\s[A-Z][\\w.\'-]*){0,2}){0,2}(?:\\s*,?\\s*[A-Z]{2}\\b)?(?:\\s+\\d{5}(?:-\\d{4})?)?', 'g');
const ROUTE_RE = /\b\d{1,6}\s+(?:US|M|I|SR|CR|County Road|Route)[\s-]?\d+\b/gi;
function clean(t) {
  return String(t || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\bMLS\b\s*(?:#|no\.?|number|id)?\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]*/gi, '')
    .replace(/\bMLS\b/gi, '')
    .replace(/\btriple[\s-]*d\b/gi, '')
    .replace(STREET_RE, '').replace(ROUTE_RE, '')
    .replace(/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g, '').replace(/\b\d{5}(?:-\d{4})?\b(?=\s*$|\s*[,.)])/g, '')     // ZIP codes
    .replace(/\b\d{7,}\b/g, '')                                  // long ID-like numbers
    .replace(/\(\s*[,;]\s*/g, '(').replace(/\(\s*\)/g, '').replace(/\s+(at|per|on)\s*([.,;])/g, '$2').replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?=[.,;:])/g, '')
    .replace(/^[\s,;:-]+/, '').replace(/\s{2,}/g, ' ').trim();
}
function townOf(s) {
  const parts = String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return '';
  let t = parts[0];
  if (/^\s*\d+[A-Za-z]?\s+\S/.test(t) || new RegExp('\\b' + SUFFIX + '\\b').test(t)) t = parts[1] || '';
  if (/^[A-Z]{2}(\s+\d{5})?$/.test(t) || /\d/.test(t)) t = '';
  return t;
}
// Neighborhood / area only. Reuses the app's privacy helper when one is present.
function areaOf(p) {
  if (!p || p.lyr) return '';
  try { const h = window.TDPrivacy; if (h) { const f = h.areaLabel || h.areaOf || h.publicArea; if (typeof f === 'function') { const a = f(p); if (a) return clean(a); } } } catch (e) { /* ignore */ }
  const i = INFO.get(p.id) || {};
  const a = p.area || p.areaLabel || p.neighborhood || i.area;
  if (!a && priv(p)) return townOf(i.place || '') || 'an area of town';
  if (a) return clean(a);
  return townOf(i.place || p.addr || '');
}
function spokenName(p) {
  if (!p) return '';
  let n = String(p.name || '').replace(/\s*\([^)]*\d[^)]*\)/g, '');
  n = clean(n);
  if (!n || /^\d/.test(n)) n = p.lyr ? (A.LSAY[p.t] || 'a marker') : 'a house';
  return n;
}
// "in Jackson", "on the west side of Jackson", "near downtown Albion"
function inArea(a) {
  if (!a) return '';
  if (/^(near|around|outside|by|along|off|in|on|at)\b/i.test(a)) return a;
  if (/^(the\s+)?(north|south|east|west|northeast|northwest|southeast|southwest)(\s+|-)(side|end|edge)\b/i.test(a) || /^(the\s+)?[\w-]+\s+side\b/i.test(a)) return 'on the ' + a.replace(/^the\s+/i, '');
  return 'in ' + a;
}
const KIND = { deed: 'a Twisted Deed', story: 'a Strong Story', lead: 'a stigmatized lead', unverified: 'an unverified lead', context: 'a context spot' };
const TITLE = { deed: 'Twisted Deed', story: 'Strong Story', lead: 'Stigmatized lead', unverified: 'Unverified lead', context: 'Context spot' };
function kindPhrase(p) {
  if (p.arch) return 'an Archive place';
  if (p.lyr) { const s = (A.LSAY[p.t] || 'Historical marker'); return (/^[AEIOU]/.test(s) ? 'an ' : 'a ') + (s.startsWith('Michigan') ? s : s.toLowerCase()); }
  return KIND[p.cat] || 'a place';
}
function kindTitle(p) { return p.arch ? 'Archive place' : p.lyr ? (A.LSAY[p.t] || 'Historical marker') : (TITLE[p.cat] || 'Place'); }
function screenLabel(p) { return p.arch ? 'The Archive' : p.lyr ? (A.LTYPE[p.t] || 'Marker') : (A.CATS[p.cat] || ''); }

// ---------------------------------------------------------------- places, distance, direction
const isArch = (p) => !!(p && p.arch);
// Private homes (js/privacy.js rule, t225u): area only, a ~¼-mile circle, no directions, never a street.
const priv = (p) => !!(p && (p.privateHome === true || p.private_home === true || p.townOnly === true || p.privacy === 'neighborhood'));
const privR = (p) => (Number(p.radiusM) || (p.approx && p.arch ? 3200 : 201.17)) / 1609.344;
function findPlace(id) { return A.findAny(id) || ARCH.find((x) => x.id === id) || null; }
function dist(p) {
  const o = A.me; if (!o || !p) return null;
  if (p.lyr) return A.lyrDist(o, p);
  const d = A.hav(o[0], o[1], p.lat, p.lon);
  return priv(p) ? Math.max(0, d - privR(p)) : d;      // to the edge of a private home's area circle
}
function brg(p) { const o = A.me; return o ? A.bearing(o[0], o[1], p.lat, p.lon) : null; }
function where(p) {
  const d = dist(p); if (d == null) return '';
  if (priv(p) && d === 0) return 'in this area';
  if (d < 0.03) return 'right here';
  const dir = A.sayDir(brg(p));
  return A.sayDist(d) + (dir ? ' ' + dir : ' away');
}
function pool() {
  const out = [];
  for (const p of A.pins) if (A.show[p.cat] && !A.inactive(p)) out.push(p);
  for (const p of ARCH) out.push(p);
  for (const x of A.lyr.values()) if (A.show[x.kind] && x.r >= 1) out.push(x);
  return out;
}
const rank = (p) => (p.lyr ? 1 : 0);
function nearest(maxListing, maxLayer, filt) {
  const o = A.me; if (!o) return [];
  const out = [];
  for (const p of pool()) {
    if (Math.abs(p.lat - o[0]) > 0.2 || Math.abs(p.lon - o[1]) > 0.28) continue;
    const d = dist(p); if (d > (p.lyr ? maxLayer : maxListing)) continue;
    if (filt && !filt(p, d)) continue;
    out.push({ p, d });
  }
  return out.sort((a, b) => rank(a.p) - rank(b.p) || a.d - b.d);
}
// The place being talked about: the latest alert or answer (for 3 minutes, within 5 miles), then the on-screen alert,
// then whatever is right beside you.
let lastTarget = null, lastTs = 0;
function setTarget(p) { lastTarget = p || null; lastTs = Date.now(); return p; }
function current() {
  if (lastTarget && Date.now() - lastTs < 180000 && dist(lastTarget) != null && dist(lastTarget) < 5) return lastTarget;
  const sh = A.showing && findPlace(A.showing);
  if (sh) return sh;
  const n = nearest(0.4, 0.2);
  return n.length ? n[0].p : null;
}
function ahead(exclude) {
  const h = A.meHead;
  return nearest(10, 2, (p, d) => {
    if (exclude && p.id === exclude) return false;
    if (A.alerted.has(p.id) && d < A.radius) return false;
    if (h == null || d < 0.1) return true;
    const r = (brg(p) - h + 360) % 360; return r <= 70 || r >= 290;
  });
}

// ---------------------------------------------------------------- speed (for "take me there")
const fixes = [];
function speedMph() {
  if (fixes.length < 2) return 0;
  const a = fixes[0], b = fixes[fixes.length - 1], hrs = (b.ts - a.ts) / 3600000;
  return hrs > 0 ? A.hav(a.lat, a.lon, b.lat, b.lon) / hrs : 0;
}
function sampleFix() {
  const o = A.me; if (!o) return;
  const now = Date.now(), last = fixes[fixes.length - 1];
  if (!last || last.lat !== o[0] || last.lon !== o[1] || now - last.ts > 4000) fixes.push({ lat: o[0], lon: o[1], ts: now });
  while (fixes.length > 2 && now - fixes[0].ts > 12000) fixes.shift();
}
const moving = () => speedMph() > 4;

// ---------------------------------------------------------------- speech output: one queue, never over itself
const Q = []; let cur = null, lastSaid = '', watchdog = null, muteUntil = 0, voice = null;
const said = [];             // debug log
const muted = () => Date.now() < muteUntil;
function pickVoice() {
  if (!canTalk || voice) return;
  try { const vs = speechSynthesis.getVoices().filter((v) => /^en(-|_)US/i.test(v.lang)); voice = vs.find((v) => v.localService && /Samantha|Google US English|Aaron|Nicky/i.test(v.name)) || vs.find((v) => v.localService) || vs[0] || null; } catch (e) { /* ignore */ }
}
if (canTalk) { try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) { /* ignore */ } }
// prio: 0 = Twisted Deeds listing / Archive alert, 1 = a reply to you, 2 = marker / cemetery alert
function speak(text, opt) {
  opt = opt || {};
  text = String(text || '').trim(); if (!text) return;
  const it = { text, prio: opt.prio == null ? 1 : opt.prio, listen: !!opt.listen, kind: opt.kind || 'reply', id: opt.id || null };
  if (it.kind === 'reply') lastSaid = text; else if (it.kind === 'alert') lastSaid = text;
  // a listing alert or a reply cuts a marker alert short rather than waiting behind it
  if (cur && cur.prio === 2 && it.prio < 2) { cur.listen = false; cut(); }
  if (it.prio === 2) { for (let i = Q.length - 1; i >= 0; i--) if (Q[i].prio === 2) Q.splice(i, 1); }   // only the newest marker waits
  const i = Q.findIndex((q) => q.prio > it.prio);
  if (i < 0) Q.push(it); else Q.splice(i, 0, it);
  pump();
}
function cut() { try { if (canTalk) speechSynthesis.cancel(); } catch (e) { /* ignore */ } finish(cur); }
function finish(it) {
  if (!it || cur !== it) return;
  clearTimeout(watchdog); cur = null;
  if (it.listen && !Q.length && active && D.follow) setTimeout(() => { if (!cur && !Q.length) listen(6000, 'follow'); }, 250);
  else if (!Q.length) idle();
  setTimeout(pump, 120);
}
function pump() {
  if (cur || !Q.length || !active) return;
  const it = Q.shift();
  if (it.kind === 'alert' && muted()) { pump(); return; }
  cur = it; stopRec(true);
  said.push({ t: Date.now(), text: it.text, prio: it.prio, kind: it.kind });
  if (said.length > 60) said.shift();
  paintState('speaking', it.text);
  if (!canTalk) { watchdog = setTimeout(() => finish(it), 1800 + it.text.length * 45); return; }
  try {
    pickVoice();
    const u = new SpeechSynthesisUtterance(it.text); u.lang = 'en-US'; u.rate = D.rate; u.pitch = 1; u.volume = 1; if (voice) u.voice = voice;
    u.onend = () => finish(it); u.onerror = () => finish(it);
    speechSynthesis.speak(u);
    watchdog = setTimeout(() => finish(it), 3000 + it.text.length * 110 / D.rate);   // some browsers never fire onend
  } catch (e) { finish(it); }
}
function hush() { Q.length = 0; if (cur) { cur.listen = false; cut(); } }

// ---------------------------------------------------------------- earcon (so a driver knows the mic is open)
let actx = null;
function earcon(up) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    (up ? [620, 880] : [700, 520]).forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.12); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.14); });
  } catch (e) { /* no audio */ }
}

// ---------------------------------------------------------------- speech input
let rec = null, recMode = null, recTimer = null, wakeRestart = null;
function stopRec(forSpeech) {
  clearTimeout(recTimer); clearTimeout(wakeRestart); wakeRestart = null;
  if (rec) { const r = rec; rec = null; recMode = null; try { r.abort(); } catch (e) { /* ignore */ } }
  if (!forSpeech) idle();
}
const WAKE_RE = /\b(?:hey|hay|hi|a|okay|ok|yo)\s+(?:twisted|twister|twisty|twist it|twist)\b/i;
function listen(ms, mode) {
  if (!active || !canHear() || cur) return false;
  stopRec(true);
  let r;
  try { r = new SR(); } catch (e) { return false; }
  r.lang = 'en-US'; r.maxAlternatives = 4; r.interimResults = false; r.continuous = mode === 'wake';
  let got = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]; if (res.isFinal === false) continue;
      const alts = []; for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
      if (mode === 'wake') {
        const hit = alts.find((a) => WAKE_RE.test(a)); if (!hit) continue;
        got = true; const rest = hit.split(WAKE_RE).pop().trim();
        stopRec(true);
        if (rest.split(/\s+/).filter(Boolean).length >= 1) handle([rest], 'wake'); else { earcon(true); speak('Yes?', { listen: true }); }
        return;
      }
      got = true; stopRec(true); handle(alts, mode); return;
    }
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micBlocked = true; D.wake = false; saveD(); paintAll(); speak('I can’t use the microphone, so voice commands are off. You can still use the big buttons.'); }
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = null; recMode = null; clearTimeout(recTimer);
    if (!got && mode === 'tap') earcon(false);
    idle();
  };
  rec = r; recMode = mode;
  try { r.start(); } catch (e) { rec = null; recMode = null; return false; }
  if (mode !== 'wake') earcon(true);
  if (ms) recTimer = setTimeout(() => { if (rec === r) { try { r.stop(); } catch (e) { /* ignore */ } } }, ms);
  paintState(mode === 'wake' ? 'wake' : 'listening');
  return true;
}
function idle() {
  if (cur || rec) return;
  if (D.wake && active && canHear() && !wakeRestart) { wakeRestart = setTimeout(() => { wakeRestart = null; if (!cur && !rec && D.wake && active) listen(0, 'wake'); }, 600); }
  paintState('idle');
}

// ---------------------------------------------------------------- intent matching (forgiving, no exact commands)
const NUM = { a: 1, an: 1, one: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fortyfive: 45, sixty: 60 };
function norm(t) {
  let s = ' ' + String(t || '').toLowerCase().replace(/[’`]/g, "'") + ' ';
  s = s.replace(/\bwhat's\b/g, 'what is').replace(/\bwhats\b/g, 'what is').replace(/\bwhere's\b/g, 'where is').replace(/\bthat's\b/g, 'that is')
    .replace(/\bit's\b/g, 'it is').replace(/\bi'm\b/g, 'i am').replace(/\bdon't\b/g, 'do not').replace(/\bdidn't\b/g, 'did not').replace(/\bhow's\b/g, 'how is')
    .replace(/\blet's\b/g, 'let us').replace(/\bgot\b/g, 'get').replace(/\bcemetary|semetery|symmetry\b/g, 'cemetery').replace(/\bgraveyards?\b/g, 'cemetery')
    .replace(/\bhalf an hour\b/g, '30 minutes').replace(/\ban hour\b/g, '60 minutes').replace(/\bone hour\b/g, '60 minutes');
  s = s.replace(/[^a-z0-9' -]+/g, ' ').replace(/'/g, '');
  s = s.replace(WAKE_RE, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const row = [i]; for (let j = 1; j <= n; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = row; }
  return prev[n];
}
const stem = (w) => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w;
function same(a, b) {
  if (a === b || stem(a) === stem(b)) return true;
  if (a.length >= 3 && b.length > a.length && b.startsWith(a) && !STOP.has(a)) return true;   // cut-off words ("nex")
  const L = Math.min(a.length, b.length); if (L < 4) return false;
  return lev(a, b) <= (L >= 7 ? 2 : 1);
}
const STOP = new Set(['the', 'a', 'an', 'me', 'is', 'i', 'am', 'to', 'it', 'are', 'we', 'for', 'of', 'on', 'about', 'please', 'can', 'you', 'ok', 'okay', 'so', 'just', 'now', 'do', 'that', 'this', 'there', 'one']);
const INTENTS = {
  what: ['what is this', 'what is that', 'what am i passing', 'what are we passing', 'what did we pass', 'what did i just pass', 'what was that', 'what is here', 'where am i', 'what is this place', 'what is on the left', 'what is on the right', 'what is that building', 'what are we looking at', 'whats this', 'identify', 'what house is this'],
  story: ['tell me the story', 'tell me more', 'more', 'the story', 'what is the story', 'what happened', 'what happened here', 'go on', 'keep going', 'continue', 'tell me about it', 'tell me about this', 'why is it twisted', 'yes', 'yeah', 'sure', 'yes please', 'details', 'more details', 'read it', 'what is the history', 'history'],
  next: ['what is next', 'what is ahead', 'what is up ahead', 'anything nearby', 'anything near', 'anything close', 'anything around', 'what is around', 'what is nearby', 'what is coming up', 'coming up', 'next stop', 'next place', 'what else', 'anything else', 'near me', 'whats next'],
  skip: ['skip', 'skip it', 'skip this', 'not now', 'never mind', 'nevermind', 'no thanks', 'no thank you', 'no', 'nope', 'pass', 'dismiss', 'later', 'next alert', 'not interested', 'move on', 'stop', 'enough', 'stop talking', 'stop it'],
  quiet: ['quiet', 'be quiet', 'hush', 'shush', 'mute', 'silence', 'shut up', 'pause alerts', 'quiet for a while', 'give me a break', 'leave me alone', 'no more alerts'],
  unmute: ['unmute', 'i am back', 'you can talk', 'talk again', 'resume', 'resume alerts', 'alerts on', 'start talking', 'turn alerts back on'],
  repeat: ['repeat', 'repeat that', 'say that again', 'say again', 'what did you say', 'come again', 'pardon', 'one more time', 'again', 'i missed that', 'what was that again', 'huh'],
  far: ['how far', 'how far is it', 'how far away', 'how much farther', 'how much further', 'how close', 'how close am i', 'distance', 'how long until', 'where is it', 'how far to', 'are we close', 'are we there'],
  directions: ['directions', 'take me there', 'navigate', 'navigate there', 'go there', 'how do i get there', 'route', 'drive there', 'lead me there', 'get me there', 'take me to it', 'open maps', 'show me the way'],
  stamp: ['stamp it', 'stamp', 'stamp this', 'did i get the stamp', 'do i have the stamp', 'did i get it', 'did i stamp it', 'passport', 'collect it', 'collect the stamp', 'add it to my passport', 'how many stamps', 'my stamps'],
  help: ['help', 'what can i say', 'what can you do', 'commands', 'options', 'how does this work', 'what do i say'],
  stopListen: ['stop listening', 'stop the mic', 'mic off', 'microphone off', 'turn off the mic', 'turn off the microphone', 'go to sleep', 'goodbye', 'that is all', 'that is it', 'stop the wake word', 'wake word off'],
};
const PH = {};
for (const k in INTENTS) PH[k] = INTENTS[k].map((p) => p.split(' '));
function scorePhrase(toks, ph) {
  let w = 0, got = 0;
  for (const p of ph) { const wt = STOP.has(p) ? 0.35 : 1; w += wt; if (toks.some((t) => same(t, p))) got += wt; }
  return { s: w ? got / w : 0, g: got };
}
function match(text) {
  const s = norm(text); const toks = s.split(' ').filter(Boolean);
  if (!toks.length) return { intent: null, score: 0, text: s };
  // slot rules first
  if (/\b(stop|quit|end|turn off|no more|cancel)\b.*\b(listen|listening|mic|microphone|wake word)\b/.test(s) || /\b(mic|microphone)\b.*\boff\b/.test(s)) return { intent: 'stopListen', score: 1, text: s };
  const lay = /\b(marker|markers|plaque|plaques|historical|historic|history signs?|cemetery|cemeteries|cemetarys?|graves?)\b/.test(s);
  const sw = s.match(/\b(off|hide|hiding|disable|stop|mute|no more|remove|without|on|show|enable|start|bring back|turn back on|add)\b/);
  if (lay && sw && !/\bhow far|what is|tell me|directions|take me\b/.test(s)) {
    const hm = /\b(marker|markers|plaque|plaques|historical|historic|history)\b/.test(s), cm = /\b(cemetery|cemeteries|cemetarys?|graves?)\b/.test(s);
    const off = /\b(off|hide|hiding|disable|stop|mute|no more|remove|without)\b/.test(s) && !/\b(turn back on|bring back)\b/.test(s);
    return { intent: 'layer', score: 1, text: s, kinds: (/\bboth|all\b/.test(s) || (hm && cm)) ? ['hmark', 'cem'] : hm ? ['hmark'] : ['cem'], on: !off };
  }
  const mins = s.match(/\b(\d{1,3}|a|an|one|two|couple|three|few|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fortyfive|sixty)\s*(?:more\s*)?(min|mins|minute|minutes|hour|hours|hr|hrs)\b/);
  if (mins && /\b(quiet|silence|silent|mute|hush|shush|pause|shut|stop|no alerts|do not talk|leave me|snooze|break|give me)\b/.test(s)) {
    let n = /^\d+$/.test(mins[1]) ? +mins[1] : (NUM[mins[1]] || 10); if (/^h/.test(mins[2])) n *= 60;
    return { intent: 'quiet', score: 1, text: s, minutes: Math.max(1, Math.min(240, n)) };
  }
  let best = { intent: null, score: 0, g: 0 };
  for (const k in PH) for (const ph of PH[k]) {
    const r = scorePhrase(toks, ph);
    // short phrases must not win on one stray word inside a long sentence
    const cover = ph.length / Math.max(ph.length, toks.length);
    const sc = r.s * (ph.length === 1 ? (0.55 + 0.45 * Math.sqrt(cover)) : 1);
    if (sc > best.score + 1e-9 || (Math.abs(sc - best.score) < 1e-9 && r.g > best.g)) best = { intent: k, score: sc, g: r.g, phrase: ph.join(' ') };
  }
  if (best.score < 0.72) return { intent: null, score: best.score, text: s, guess: best.intent };
  return { intent: best.intent, score: best.score, text: s, phrase: best.phrase };
}

// ---------------------------------------------------------------- replies (short, only from app data)
const storyAt = new Map();      // id -> how far into its free text we have read
const ABBR = /\b(Gen|Col|Capt|Cpt|Maj|Lt|Sgt|Cpl|Pvt|Adm|Gov|Sen|Rep|Rev|Fr|Dr|Mr|Mrs|Ms|Jr|Sr|St|Mt|Ft|No|Co|Inc|Bros|Twp|Ave|vs|ca|c|d|b|approx|est)\.(?=\s)/g;
function sentences(t) {
  const x = clean(t).replace(ABBR, '$1\u2024').replace(/\b([A-Z])\.(?=\s*[A-Z])/g, '$1\u2024').replace(/\b(U|S|A)\.(?=[A-Z]\.)/g, '$1\u2024');
  return (x.match(/[^.!?]+[.!?]+(?:["'”’)]+)?|[^.!?]+$/g) || []).map((y) => y.replace(/\u2024/g, '.').trim()).filter((y) => y.length > 2).map((y) => /[.!?]["'”’)]*$/.test(y) ? y : y + '.');
}
function storyParts(p) {
  if (p.lyr) return [];
  const i = INFO.get(p.id) || {};
  const parts = [];
  const sum = i.summary || (!i.loreTeaser ? p.hook : '') || '';
  const lore = i.loreTeaser && clean(i.loreTeaser) !== clean(sum) ? i.loreTeaser : '';
  sentences(sum).forEach((s) => parts.push(s));
  const ls2 = sentences(lore); if (ls2.length) { ls2[0] = 'The lore: ' + ls2[0]; ls2.forEach((s) => parts.push(s)); }
  if (!parts.length && p.hook) sentences(p.hook).forEach((s) => parts.push(s));
  return parts;
}
const paidNote = (p) => (isArch(p) || p.lyr || p.cat === 'context') ? '' : ' The full file is in the app; open or unlock it when you’re parked.';
const R = {
  what() {
    const near = nearest(0.12, 0.12)[0];          // something right beside you beats the last thing we talked about
    const t = near ? near.p : current();
    if (!t) {
      const n = ahead()[0];
      if (n) { setTarget(n.p); return { say: 'Nothing from the map right here. Next up is ' + spokenName(n.p) + ', ' + where(n.p) + '.', listen: true }; }
      return { say: A.me ? 'Nothing from the map right here, and nothing close ahead.' : 'I don’t have your location yet. Make sure GPS is on.' };
    }
    setTarget(t);
    const area = areaOf(t), w = where(t);
    let s = 'That’s ' + spokenName(t) + ', ' + kindPhrase(t) + (area ? ' ' + inArea(area) : '') + '.';
    if (w && w !== 'right here' && w !== 'in this area') s += ' It’s ' + w + '.';
    if (storyParts(t).length) s += ' Say “tell me more” for the story.';
    else if (t.lyr) s += ' That’s all I know about it.';
    return { say: s, listen: true };
  },
  story() {
    const t = current() || lastTarget;
    if (!t) return { say: 'I’m not sure which place you mean. Ask “what’s next” and I’ll find one.' };
    setTarget(t);
    if (t.lyr) return { say: 'All I have is the name: ' + spokenName(t) + ', ' + kindPhrase(t) + '. Its source link is under Details when you’re parked.' + (t.t === 'N' ? ' Many of these are private homes, so please view from the road.' : '') };
    const parts = storyParts(t), at = storyAt.get(t.id) || 0;
    if (!parts.length) return { say: 'I don’t have a story for ' + spokenName(t) + ' yet.' + paidNote(t) };
    if (at >= parts.length) return { say: 'That’s all of the free story for ' + spokenName(t) + '.' + paidNote(t) };
    const chunk = parts.slice(at, at + 2); storyAt.set(t.id, at + 2);
    const more = at + 2 < parts.length;
    return { say: chunk.join(' ') + (more ? ' Want more?' : paidNote(t)), listen: more };
  },
  next() {
    const list = ahead(current() && current().id);
    if (!A.me) return { say: 'I don’t have your location yet. Make sure GPS is on.' };
    if (!list.length) return { say: 'Nothing on the map ahead within ten miles.' };
    const a = list[0]; setTarget(a.p);
    let s = 'Next up: ' + spokenName(a.p) + ', ' + kindPhrase(a.p) + ', ' + where(a.p) + '.';
    const b = list[1]; if (b) s += ' After that, ' + spokenName(b.p) + '.';
    return { say: s, listen: true };
  },
  skip() {
    hush();
    if (A.showing) A.skip();
    return { say: 'Okay, skipped.' };
  },
  quiet(m) {
    const n = m.minutes || 15; hush(); muteUntil = Date.now() + n * 60000; paintAll();
    return { say: 'Okay, quiet for ' + n + ' minute' + (n === 1 ? '' : 's') + '. Tap the mic and say “I’m back” to hear alerts again.' };
  },
  unmute() { muteUntil = 0; paintAll(); return { say: 'Alerts are back on.' }; },
  repeat() { return { say: lastSaid || 'I haven’t said anything yet.', repeat: true }; },
  far() {
    const t = current() || lastTarget || (ahead()[0] || {}).p;
    if (!t) return { say: 'There’s nothing close on the map right now.' };
    if (!A.me) return { say: 'I don’t have your location yet.' };
    setTarget(t); const w = where(t);
    return { say: w === 'right here' ? 'You’re right at ' + spokenName(t) + '.' : w === 'in this area' ? 'You’re in the area of ' + spokenName(t) + ', ' + inArea(areaOf(t)) + '. It’s a private home, so I only know the area.' : spokenName(t) + ' is ' + w + '.' };
  },
  directions() {
    const t = current() || lastTarget || (ahead()[0] || {}).p;
    if (!t) return { say: 'Which place? Ask “what’s next” first, then say “take me there”.' };
    setTarget(t); paintAll();
    if (priv(t)) return { say: spokenName(t) + ' is a private home, so I only know the area: ' + areaOf(t) + '. No directions for it; please view from the road.' };
    if (moving()) return { say: 'You’re moving, so I won’t open maps now. ' + spokenName(t) + ' is ' + where(t) + '. Ask again when you’re stopped.' };
    let w = null; try { w = window.open(A.dirUrl(t), '_blank', 'noopener'); } catch (e) { w = null; }
    showGo(t);
    return { say: w ? 'Opening directions to ' + spokenName(t) + ' in your maps app.' : 'Tap the big Directions button to open your maps app for ' + spokenName(t) + '.' };
  },
  async stamp() {
    const tp = window.TDPassport;
    if (!tp) return { say: 'Passport stamps aren’t on this map yet.' };
    const t = current() || lastTarget;
    const api = await passportApi();
    if (!t) { const n = api && api.stamps ? api.stamps().length : null; return { say: n == null ? 'Stamps land on their own when you pass within about 300 feet of a place.' : 'You have ' + n + ' stamp' + (n === 1 ? '' : 's') + ' so far. Stamps land on their own when you pass within about 300 feet.' }; }
    const has = tp.stampOf ? tp.stampOf(t.id) : (api && api.stampOf ? api.stampOf(t.id) : null);
    if (has) return { say: 'Yes, ' + spokenName(t) + ' is stamped in your passport.' };
    if (typeof tp.stampNow === 'function') { const r = await tp.stampNow(t.id); if (r) return { say: 'Stamped! ' + spokenName(t) + ' is in your passport.' }; }
    return { say: 'Not yet for ' + spokenName(t) + '. The stamp lands on its own when you pass within about 300 feet.' };
  },
  layer(m) {
    const names = { hmark: 'Historical markers', cem: 'Cemeteries' };
    m.kinds.forEach((k) => A.setLayer(k, m.on));
    return { say: m.kinds.map((k) => names[k]).join(' and ') + (m.on ? ' on.' : ' off.') };
  },
  help() { return { say: 'Try: what’s this, tell me more, what’s next, how far, take me there, or stamp it. You can also say skip, repeat, quiet for ten minutes, cemeteries off, or stop listening.' }; },
  stopListen() { const w = D.wake; D.wake = false; saveD(); stopRec(); paintAll(); return { say: w ? 'Okay, wake phrase off. Tap the mic when you need me.' : 'Okay. Tap the mic when you need me.' }; },
};
let pp = null;
function passportApi() {
  if (!window.TDPassport) return Promise.resolve(null);
  if (!pp) pp = import('../js/passport.js').catch(() => null);
  return pp;
}
async function handle(alts, mode) {
  alts = (alts || []).filter(Boolean);
  let m = { intent: null, score: 0 };
  for (const a of alts) { const r = match(a); if (r.intent && r.score > m.score) m = r; if (m.score >= 1) break; }
  paintHeard(alts[0] || '');
  if (!m.intent) {
    const r = { say: mode === 'follow' ? 'Sorry, I missed that. Tap the mic and say “help” to hear what I can do.' : 'Sorry, I didn’t catch that. Say “help” to hear what I can do.' };
    speak(r.say); return { intent: null, say: r.say };
  }
  let r;
  try { r = await R[m.intent](m); } catch (e) { r = { say: 'Sorry, something went wrong with that.' }; }
  if (r && r.say) speak(r.say, { listen: !!r.listen });
  paintAll();
  return { intent: m.intent, say: r && r.say };
}

// ---------------------------------------------------------------- alerts from the map (live.js)
const recent = new Map();
function alert(ctx) {
  if (!active || !ctx || !ctx.id) return;
  const p = findPlace(ctx.id); if (!p) return;
  const now = Date.now(); if (recent.get(p.id) > now - 60000) return; recent.set(p.id, now);
  setTarget(p);
  if (muted()) { paintAll(); return; }
  const area = areaOf(p), w = where(p);
  let s = kindTitle(p) + ' ' + (w || 'nearby') + '. ' + spokenName(p) + (area ? ', ' + inArea(area) : '') + '.';
  const invite = canHear() && D.follow;
  if (invite && !p.lyr && storyParts(p).length) s += ' Want the story?';
  speak(s, { prio: ctx.prio == null ? (p.lyr ? 2 : 0) : ctx.prio, listen: invite, kind: 'alert', id: p.id });
  paintAll();
}

// ---------------------------------------------------------------- UI
let wakeLock = null;
async function lockScreen() {
  try { if ('wakeLock' in navigator && active && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => {
  if (!active) return;
  if (document.visibilityState === 'visible') { lockScreen(); idle(); } else stopRec(true);
});
const ARROW = '<svg viewBox="0 0 40 40" width="56" height="56" aria-hidden="true"><path d="M20 3 L34 35 L20 27 L6 35 Z" fill="currentColor"/></svg>';
function build() {
  const sw = document.createElement('div'); sw.id = 'modes'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Mode');
  sw.innerHTML = '<button data-m="nav" aria-pressed="true">Navigator <small>passenger</small></button><button data-m="drive" aria-pressed="false">Driving <small>phone mounted</small></button>';
  $('#top').insertAdjacentElement('afterend', sw);
  sw.querySelectorAll('button').forEach((b) => { b.onclick = () => (b.dataset.m === 'drive' ? enter(true) : exit()); });
  const el = document.createElement('section'); el.id = 'drive'; el.hidden = true; el.setAttribute('aria-label', 'Driving mode');
  el.innerHTML = '<div class="dv-card" id="dv-card"><div class="dv-lab" id="dv-lab"></div><div class="dv-name" id="dv-name">Starting…</div>'
    + '<div class="dv-dist"><span class="dv-arrow" id="dv-arrow">' + ARROW + '</span><span id="dv-d"></span></div><div class="dv-sub" id="dv-sub"></div></div>'
    + '<div class="dv-state" id="dv-state" role="status" aria-live="polite"></div>'
    + '<div class="dv-go" id="dv-gowrap" hidden><a class="dv-gobtn" id="dv-go" target="_blank" rel="noopener">Directions</a></div>'
    + '<button class="dv-mic" id="dv-mic" aria-label="Talk"><svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4.2a7.8 7.8 0 0 0 6.9 7.7V22h1.8v-2.8a7.8 7.8 0 0 0 6.9-7.7z" fill="currentColor"/></svg><span id="dv-miclab">Talk</span></button>'
    + '<div class="dv-btns"><button id="dv-more">More</button><button id="dv-skip">Skip</button><button id="dv-next">Next</button></div>'
    + '<div class="dv-foot"><button id="dv-set" aria-label="Driving settings">Settings</button><button id="dv-exit">Exit Driving</button></div>'
    + '<div class="dv-over" id="dv-safety" hidden><div class="dv-box"><h2>Eyes on the road</h2><p>Set up Driving mode <b>before</b> you start driving, with the phone in a mount. It speaks alerts out loud and listens briefly after each one, so you never need to read or tap while moving.</p><p>Let a passenger handle the screen. Obey traffic laws, and never stop on private property.</p><button class="dv-ok" id="dv-ok">I understand, start</button></div></div>'
    + '<div class="dv-over" id="dv-resume" hidden><div class="dv-box"><h2>Driving mode</h2><p>Tap once so the app can talk.</p><button class="dv-ok" id="dv-resume-ok">Start Driving mode</button></div></div>'
    + '<div class="dv-over" id="dv-settings" hidden><div class="dv-box dv-setbox"><h2>Driving settings</h2><p class="dv-support" id="dv-support"></p>'
    + '<label class="dv-tg"><input type="checkbox" id="dv-follow"> <span>Listen for a reply after each alert<small>About 6 seconds, then the mic closes.</small></span></label>'
    + '<label class="dv-tg"><input type="checkbox" id="dv-wake"> <span>Wake phrase “Hey Twisted”<small>Off by default. Keeps the mic open, which uses more battery, and is unreliable on iPhone.</small></span></label>'
    + '<div class="dv-rate" role="group" aria-label="Speaking speed"><span>Voice speed</span><button data-rate="0.85">Slower</button><button data-rate="1">Normal</button><button data-rate="1.15">Faster</button></div>'
    + '<p class="dv-help"><b>Things you can say:</b> “What’s this?” · “Tell me more” · “What’s next?” · “How far?” · “Take me there” · “Stamp it” · “Skip” · “Repeat” · “Quiet for 10 minutes” · “Cemeteries off” · “Help” · “Stop listening”</p>'
    + '<div class="dv-row"><button id="dv-test">Test voice</button><button class="dv-ok" id="dv-setclose">Done</button></div></div></div>';
  $('#stage').appendChild(el);
  $('#dv-mic').onclick = () => { unlockAudio(); if (rec && recMode !== 'wake') { stopRec(); return; } if (cur) hush(); if (!canHear()) { speak(micBlocked || iosPwa || !SR ? 'Voice commands aren’t available here. Use the More, Skip and Next buttons.' : 'Sorry, I can’t listen right now.'); return; } listen(8000, 'tap'); };
  $('#dv-more').onclick = () => { unlockAudio(); handle(['tell me more']); };
  $('#dv-skip').onclick = () => { unlockAudio(); handle(['skip']); };
  $('#dv-next').onclick = () => { unlockAudio(); handle(['what is next']); };
  $('#dv-exit').onclick = exit;
  // No fix (GPS off, blocked or failing): the big card is the GPS button, since the Start button is hidden while driving.
  $('#dv-card').onclick = () => { if (!A.me && (!A.running || A.gpsErr) && A.gpsTap) { A.gpsTap(); setTimeout(paintAll, 300); } };
  $('#dv-set').onclick = () => { paintSettings(); $('#dv-settings').hidden = false; };
  $('#dv-setclose').onclick = () => { $('#dv-settings').hidden = true; };
  $('#dv-follow').onchange = (e) => { D.follow = e.target.checked; saveD(); };
  $('#dv-wake').onchange = (e) => { D.wake = e.target.checked && canHear(); saveD(); paintSettings(); if (D.wake) idle(); else stopRec(); };
  el.querySelectorAll('[data-rate]').forEach((b) => { b.onclick = () => { D.rate = +b.dataset.rate; saveD(); paintSettings(); }; });
  $('#dv-test').onclick = () => { unlockAudio(); speak(canHear() ? 'This is how I sound. Tap the big mic and ask me what’s next.' : 'This is how I sound. Use the big buttons to hear more, skip, or hear what’s next.'); };
  $('#dv-ok').onclick = () => { ls.set('td-drive-safety', 1); $('#dv-safety').hidden = true; go(); };
  $('#dv-resume-ok').onclick = () => { $('#dv-resume').hidden = true; go(); };
}
function unlockAudio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* ignore */ }
}
function paintSettings() {
  $('#dv-support').textContent = supportText();
  $('#dv-follow').checked = !!D.follow; $('#dv-follow').disabled = !canHear();
  $('#dv-wake').checked = !!D.wake; $('#dv-wake').disabled = !canHear();
  document.querySelectorAll('#drive [data-rate]').forEach((b) => b.classList.toggle('on', +b.dataset.rate === D.rate));
}
let stateTxt = '';
function paintState(st) {
  const el = $('#dv-state'); if (!el) return;
  const mic = $('#dv-mic');
  mic.classList.toggle('on', st === 'listening'); mic.classList.toggle('wake', st === 'wake');
  $('#dv-miclab').textContent = st === 'listening' ? 'Listening…' : 'Talk';
  let t = st === 'speaking' ? 'Speaking…' : st === 'listening' ? 'Listening…' : st === 'wake' ? 'Say “Hey Twisted”' : (canHear() ? 'Tap the mic to talk' : 'Voice commands not available here: use the buttons');
  if (muted()) t = 'Quiet until ' + new Date(muteUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + (st === 'speaking' || st === 'listening' ? ' · ' + t : '');
  if (t !== stateTxt) { el.textContent = t; stateTxt = t; }
  document.getElementById('drive').dataset.st = st;
}
let heardT = null;
function paintHeard(t) { const el = $('#dv-sub'); if (!el || !t) return; el.textContent = '“' + t + '”'; el.classList.add('heard'); clearTimeout(heardT); heardT = setTimeout(() => { el.classList.remove('heard'); paintAll(); }, 4000); }
function showGo(t) { const a = $('#dv-go'); a.href = A.dirUrl(t); a.textContent = 'Directions to ' + spokenName(t); $('#dv-gowrap').dataset.id = t.id; $('#dv-gowrap').hidden = false; clearTimeout(showGo.t); showGo.t = setTimeout(() => { $('#dv-gowrap').hidden = true; }, 60000); }
function paintAll() {
  if (!active) return;
  const sh = A.showing && findPlace(A.showing);
  const recentT = lastTarget && Date.now() - lastTs < 180000 && dist(lastTarget) != null && dist(lastTarget) < 5 ? lastTarget : null;
  let t = recentT || sh, nextUp = false;
  if (!t) { const n = ahead()[0]; if (n) { t = n.p; nextUp = true; } }
  const card = $('#dv-card');
  if (!t) {
    $('#dv-lab').textContent = A.me ? 'Nothing close' : (A.running ? 'Finding you…' : 'GPS off');
    const gpsBad = !A.me && (!A.running || A.gpsErr);
    if (gpsBad) $('#dv-lab').textContent = A.gpsErr === 1 ? 'Location blocked' : A.gpsErr === 2 ? 'No location' : 'GPS off';
    $('#dv-name').textContent = A.me ? 'Keep driving' : gpsBad ? 'Tap here to turn on GPS' : 'Waiting for GPS'; $('#dv-d').textContent = ''; $('#dv-arrow').style.visibility = 'hidden';
    if (!$('#dv-sub').classList.contains('heard')) { $('#dv-sub').textContent = gpsBad && A.gpsMsg ? A.gpsMsg() : ''; $('#dv-sub').classList.toggle('gpsmsg', !!(gpsBad && A.gpsErr)); }
    card.className = 'dv-card';
  } else {
    $('#dv-sub').classList.remove('gpsmsg');
    $('#dv-lab').textContent = (nextUp ? 'Next up · ' : (sh && sh === t) || (dist(t) || 0) < A.radius ? 'Nearby · ' : '') + screenLabel(t);
    $('#dv-name').textContent = spokenName(t);
    const d = dist(t), b = brg(t);
    $('#dv-d').textContent = d == null ? '' : (priv(t) && d === 0) ? 'In this area' : d < 0.03 ? 'Here' : (d < 0.1 ? Math.max(50, Math.round(d * 5280 / 50) * 50) + ' ft' : (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi');
    const ar = $('#dv-arrow');
    if (b == null || d == null || d < 0.03 || priv(t)) ar.style.visibility = 'hidden';
    else { ar.style.visibility = ''; ar.style.transform = 'rotate(' + Math.round(A.meHead == null ? b : (b - A.meHead + 360) % 360) + 'deg)'; ar.title = A.meHead == null ? 'Compass direction (north is up)' : 'Relative to your heading'; }
    if (!$('#dv-sub').classList.contains('heard')) $('#dv-sub').textContent = areaOf(t);
    card.className = 'dv-card ' + (t.arch ? 'arch' : t.lyr ? 'lyr' : (t.cat || ''));
  }
  const gw = $('#dv-gowrap'); if (!gw.hidden && gw.dataset.id) { const gp = findPlace(gw.dataset.id); if (!gp || (dist(gp) || 0) > 15) gw.hidden = true; }
  paintState(cur ? 'speaking' : rec ? (recMode === 'wake' ? 'wake' : 'listening') : 'idle');
}
// The map's alert card is hidden in Driving mode, so move past an alert once you have driven away from it.
function autoAdvance() {
  const p = A.showing && findPlace(A.showing); if (!p || cur) return;
  const d = dist(p); if (d != null && d > Math.max(A.radius * 1.25, 0.3)) A.skip();
}
function setModeButtons() { document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'drive') === active))); }
let tick = null;
function enter(fromTap) {
  D.mode = 'drive'; saveD();
  active = true; document.getElementById('app').classList.add('driving'); $('#drive').hidden = false; setModeButtons(); setTimeout(() => A.invalidate && A.invalidate(), 60);
  loadData();
  if (!ls.get('td-drive-safety', 0)) { $('#dv-safety').hidden = false; paintAll(); return; }
  if (!fromTap) { $('#dv-resume').hidden = false; paintAll(); return; }
  go();
}
function go() {
  unlockAudio();
  if (!A.running) A.start();
  lockScreen();
  // Ask for the microphone now, while parked and tapping, not in the middle of the first alert.
  if (canHear() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((st) => st.getTracks().forEach((t) => t.stop()))
      .catch((e) => { if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { micBlocked = true; D.wake = false; saveD(); paintAll(); } });
  }
  clearInterval(tick); tick = setInterval(() => { sampleFix(); autoAdvance(); paintAll(); }, 1000);
  paintAll();
  speak(canHear() ? 'Driving mode on. I’ll call out places as we pass. Tap the mic any time, or answer after an alert.' : 'Driving mode on. I’ll call out places as we pass. Use the big buttons for more, skip, or what’s next.');
}
function exit() {
  D.mode = 'nav'; saveD();
  hush(); stopRec(); active = false; clearInterval(tick); tick = null;
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null;
  document.getElementById('app').classList.remove('driving'); $('#drive').hidden = true; setModeButtons(); setTimeout(() => A.invalidate && A.invalidate(), 60);
  ['dv-safety', 'dv-resume', 'dv-settings'].forEach((id) => { $('#' + id).hidden = true; });
}

build();
window.TDDrive = { on: () => active, alert, enter: () => enter(true), exit };
window.__tdDriveDebug = {
  match, norm, clean, spokenName, areaOf, handle: (t) => handle([t]), said, get queue() { return Q.map((q) => ({ text: q.text, prio: q.prio })); },
  get speaking() { return cur && cur.text; }, get listening() { return recMode; }, get muted() { return muted(); }, support: () => ({ sr: !!SR, canHear: canHear(), canTalk, iosPwa, micBlocked, text: supportText() }),
  speak, loadData, get lastTarget() { return lastTarget && lastTarget.id; }, setLast(id) { setTarget(findPlace(id)); },
};
if (D.mode === 'drive') enter(false);
})();
