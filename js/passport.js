// Twisted Passport (2026-11-21, Grymm t219u-t221u): the old paper Twisted Passport from the tours, as drive-by stamps.
// Shared by the live map (live/passport-live.js) and the passport book (passport/). ES module, no build step.
//  - Stamps live on this device (localStorage 'td-passport'). Signed-in accounts also sync to Supabase (passport_stamps,
//    owner-only RLS) once _build/migrations/20261121_passport.sql has been run; until then everything stays local, quietly.
//  - Stamp art is drawn from the place's own data (procedural SVG). No hand-made per-place art, no sample stamps.
//  - Privacy: no street address is ever drawn on a stamp or a share card. A private home is shown by its town only on cards.
//    Visitor counts are aggregate, never who or when, and the server only counts stamps made before today.
import { CONFIG } from './config.js';
import { moonPhase } from './world.js';
import { LAYERS } from './taxonomy.js';
import { applyArchivePrivacy, isPrivateHome, radiusM, inArea, publicAreaLabel } from './privacy.js';

const KEY = 'td-passport', SHOWKEY = 'td-passport-show';
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------------- the book on this device */
export function book() { const b = ls.get(KEY, null); return b && b.v === 1 && Array.isArray(b.stamps) ? b : { v: 1, stamps: [] }; }
function saveBook(b) { ls.set(KEY, b); try { window.dispatchEvent(new CustomEvent('td-passport')); } catch { /* ignore */ } }
const curUid = () => ls.get('td-passport-uid', null);
// Stamps made while signed out belong to this device (u = null). Stamps pulled from or pushed to an account carry its id;
// another account signing in on the same phone does not see or inherit them.
export function stamps() { const u = curUid(); return book().stamps.filter((s) => !s.u || s.u === u); }
export const stampOf = (id) => stamps().find((s) => s.id === id) || null;
export const showOnMap = () => ls.get(SHOWKEY, true) !== false;
export const setShowOnMap = (v) => ls.set(SHOWKEY, !!v);
export function clearDevice() { saveBook({ v: 1, stamps: [] }); }

/* ---------------------------------------------------------------- rare conditions (real only) */
// Sun altitude (degrees) from a standard low-precision solar position: good to ~0.5°, plenty for "after dark".
export function sunAlt(date, lat, lon) {
  const r = Math.PI / 180, d = (date.getTime() / 864e5) + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * r, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * r, e = (23.439 - 0.00000036 * d) * r;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = (gmst * 15 + lon) * r - ra;
  return Math.asin(Math.sin(lat * r) * Math.sin(dec) + Math.cos(lat * r) * Math.cos(dec) * Math.cos(H)) / r;
}
export const RARE = { dark: 'After dark', moon: 'Full moon', october: 'October' };
export function rareNow(lat, lon, date = new Date()) {
  const out = [];
  if (isFinite(lat) && isFinite(lon) && sunAlt(date, lat, lon) < -6) out.push('dark');   // past civil dusk
  if (moonPhase(date).full) out.push('moon');
  if (date.getMonth() === 9) out.push('october');
  return out;
}

/* ---------------------------------------------------------------- place metadata */
// layer: listing | archive | marker | cemetery | lead | scout
// priv: shown by town only on share cards (private homes, homes for sale, unverified leads, National Register sites)
// firstOk: may earn "first to find" (public places only: cemeteries, markers, museums, public Archive sites)
const STREET = /^\s*\d+[A-Za-z]?\s+\S/;
export function townOf(s) {
  const parts = String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { town: '', county: '', state: '' };
  const st = (String(s).match(/\b([A-Z]{2})(?:\s+\d{5})?\s*$/) || [])[1] || '';
  const county = parts.find((p) => /\b(County|Parish|Borough)\b/.test(p)) || '';
  let town = parts[0];
  if (STREET.test(town) && parts.length > 1) town = parts[1];
  if (/^[A-Z]{2}(\s+\d{5})?$/.test(town)) town = '';
  return { town, county, state: st };
}
const LTYPE = { M: 'Michigan historical marker', N: 'National Register site', U: 'Museum', K: 'Historical marker', P: 'Plaque', B: 'History board', C: 'Cemetery' };
const unw = (l) => [l.story_status, l.storyStatus].some((v) => String(v || '').toLowerCase() === 'unwritten');
export function metaFromListing(l, shelf) {
  const m = metaFromListing0(l, shelf); m.unwritten = unw(l); return m;
}
function metaFromListing0(l, shelf) {
  const t = townOf(l.place || l.address || l.addr || '');
  const archive = shelf === 'archive' || l.collection === 'archive' || l.shelf === 'archive';
  if (archive) {   // private homes on the Archive shelf (js/privacy.js): offset area circle, area label, never the house point
    const a = applyArchivePrivacy({ ...l, shelf: 'archive' });
    if (isPrivateHome(a)) return { id: a.id, name: String(a.name || ''), town: t.town, county: t.county, state: t.state, layer: 'archive', theme: a.layer || '', crew: a.crew_featured === true,
      priv: true, firstOk: false, lat: +a.lat, lon: +a.lon, exact: true, area: radiusM(a), areaLabel: publicAreaLabel(a), inArea: (la, lo) => inArea(la, lo, a) };
  }
  const townOnly = l.geo_precision === 'town' || l.townOnly;
  const house = l.kind === 'house' || (!l.kind && !archive);
  return {
    id: l.id, name: String(l.name || '').replace(/\s*\([^)]*\b(unconfirmed|unverified|match)\b[^)]*\)\s*$/i, ''), town: t.town, county: t.county, state: t.state,
    layer: archive ? 'archive' : 'listing', theme: l.layer || '', crew: l.crew_featured === true || l.crewFeatured === true,
    priv: house || townOnly, firstOk: archive && !house && !townOnly && l.roadOnly !== true,
    lat: Number(l.lat), lon: Number(l.lon), exact: !townOnly && (l.geo_precision ? l.geo_precision === 'address' : true),
  };
}
export function metaFromPin(p, base) {
  const t = townOf(p.addr || '');
  const m = Object.assign({ id: p.id, name: p.name, town: t.town, county: p.jackson ? 'Jackson County' : '', state: t.state, layer: p.cat === 'deed' || p.cat === 'story' ? 'listing' : 'lead',
    theme: '', crew: false, priv: true, firstOk: false, lat: p.lat, lon: p.lon, exact: !p.approx }, base || {});
  if (!m.town) m.town = t.town; if (!m.county && p.jackson) m.county = 'Jackson County'; if (!m.state) m.state = t.state || (p.jackson ? 'MI' : '');
  if (!m.town && p.jackson && /\bJackson\b/.test(p.area || p.areaLabel || '')) m.town = 'Jackson';   // area label names the town
  if (p.approx) m.exact = false;
  return m;
}
export function metaFromLayer(x) {
  return { id: x.id, name: x.name, town: '', county: '', state: '', layer: x.t === 'C' ? 'cemetery' : 'marker', sub: x.t, theme: LTYPE[x.t] || '',
    crew: false, priv: x.t === 'N', firstOk: x.t !== 'N', lat: x.lat, lon: x.lon, exact: true, rad: x.rad || 0 };
}

/* ---------------------------------------------------------------- catalog (for set totals) */
const FEED = CONFIG.feedUrl;
const ARCH = FEED.replace(/listings\.json$/, 'archive.json');
async function getJson(url, ms = 9000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-cache', signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
let catP = null;
// The records behind the catalog, for the passport book's cards. Archive private homes are stored after applyArchivePrivacy
// (no street, no listing link, no photos, offset point), and private pins lose their address and photo.
export const RAW = new Map();
const pinPublic = (p) => (p.privateHome ? { id: p.id, cat: p.cat, label: p.label, name: p.name, area: p.area || 'an area of town', privateHome: true, hook: p.hook, status: p.status, asof: p.asof, jackson: p.jackson } : p);
// base: URL prefix to the app folder ('../' from live/ and passport/).
export function loadCatalog(base = '../') {
  if (catP) return catP;
  catP = (async () => {
    const out = new Map();
    let feed = null;
    try { feed = await getJson(FEED); } catch { try { feed = await getJson(base + CONFIG.feedFallback); } catch { feed = null; } }
    for (const l of (feed?.listings || [])) {
      if (!l.id || l.collection === 'heritage' || l.grade === 'heritage' || l.lat == null || l.lon == null) continue;
      out.set(l.id, metaFromListing(l, l.collection === 'archive' ? 'archive' : 'sale'));
      RAW.set(l.id, { ...l, _shelf: l.collection === 'archive' ? 'archive' : 'sale' });
    }
    if (feed?.archive?.url || feed?.archive?.count) {
      try { for (const l of ((await getJson(feed.archive.url || ARCH)).listings || [])) if (l.id && l.lat != null) { out.set(l.id, metaFromListing(l, 'archive')); RAW.set(l.id, { ...applyArchivePrivacy({ ...l, shelf: 'archive' }), _shelf: 'archive' }); } } catch { /* shelf offline */ }
    }
    try {
      for (const p of await getJson(base + 'live/jackson_pins.json')) {
        if (p.cat === 'context' || !isFinite(p.lat)) continue;
        out.set(p.id, metaFromPin(p, out.get(p.id) ? { ...out.get(p.id), layer: out.get(p.id).layer } : null));
        if (!RAW.has(p.id)) RAW.set(p.id, { ...pinPublic(p), _pin: true }); else RAW.get(p.id)._pinInfo = pinPublic(p);
      }
    } catch { /* ignore */ }
    return out;
  })();
  return catP;
}

/* ---------------------------------------------------------------- stamping */
// Returns the new stamp, or null if this place is already in the book.
export function addStamp(meta, at = new Date(), rare = null) {
  const b = book(); const u = curUid();
  if (b.stamps.some((s) => s.id === meta.id && (!s.u || s.u === u))) return null;
  const s = { id: meta.id, name: meta.name || '', town: meta.town || '', county: meta.county || '', state: meta.state || '', layer: meta.layer || 'place', sub: meta.sub || '',
    theme: meta.theme || '', crew: !!meta.crew, priv: !!meta.priv, area: meta.area ? String(meta.areaLabel || '') : '', firstOk: !!meta.firstOk, at: at.toISOString(), rare: rare || rareNow(meta.lat, meta.lon, at), u: null, synced: false };
  // Markers and cemeteries keep their public spot (5 decimals) so the passport book can open their card. Homes never do.
  if ((s.layer === 'marker' || s.layer === 'cemetery') && !meta.area && isFinite(meta.lat) && isFinite(meta.lon)) { s.lat = Math.round(meta.lat * 1e5) / 1e5; s.lon = Math.round(meta.lon * 1e5) / 1e5; }
  b.stamps.push(s); saveBook(b);
  return s;
}
export function patchStamp(id, patch) { const b = book(); const s = b.stamps.find((x) => x.id === id); if (s) { Object.assign(s, patch); saveBook(b); } }

/* ---------------------------------------------------------------- stamp art (procedural SVG) */
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const INK = { listing: '#8e1b22', archive: '#27405f', marker: '#2f5233', cemetery: '#2e2e33', lead: '#5b3a80', scout: '#8a6214', place: '#6b2a1a' };
const RARE_INK = { moon: '#3d5f8f', dark: '#1d1a2e', october: '#b0501a' };
let uidN = 0;
const GLYPH = {
  listing: '<path d="M-11 3 0-7 11 3M-8 1v9h16V1M-2 10V5h4v5" fill="none" stroke-width="2" stroke-linejoin="round"/>',
  lead: '<path d="M-11 3 0-7 11 3M-8 1v9h16V1" fill="none" stroke-width="2" stroke-dasharray="3 2"/><path d="M0 2v3" stroke-width="2"/><circle cx="0" cy="8" r="1"/>',
  archive: '<path d="M-10-6h8a3 3 0 0 1 2 1 3 3 0 0 1 2-1h8v15h-8a3 3 0 0 0-2 1 3 3 0 0 0-2-1h-8z" fill="none" stroke-width="2" stroke-linejoin="round"/><path d="M0-5v15" stroke-width="1.5"/>',
  marker: '<rect x="-10" y="-8" width="20" height="12" rx="2" fill="none" stroke-width="2"/><path d="M-6-4h12M-6 0h8M-1 4v7M1 4v7" stroke-width="1.6"/>',
  cemetery: '<path d="M-7 10V-1a7 7 0 0 1 14 0v11z" fill="none" stroke-width="2"/><path d="M0-4v9M-3-1h6" stroke-width="1.8"/><path d="M-11 10h22" stroke-width="2"/>',
  museum: '<path d="M-11-3 0-10 11-3z" fill="none" stroke-width="1.8" stroke-linejoin="round"/><path d="M-8-1v9M-3-1v9M3-1v9M8-1v9" stroke-width="2"/><path d="M-11 10h22" stroke-width="2"/>',
  register: '<path d="M-10 10V-2h20v12M-12-2 0-9 12-2" fill="none" stroke-width="1.8" stroke-linejoin="round"/><path d="M-5 10V3h4v7M3 2h4v3h-4z" fill="none" stroke-width="1.4"/>',
  scout: '<circle r="9" fill="none" stroke-width="2"/><path d="M0-12v5M0 7v5M-12 0h5M7 0h5" stroke-width="1.6"/><path d="M-3 3 0-6 3 3 0 1z"/>',
};
const RGLYPH = {
  moon: (x, y) => `<circle cx="${x}" cy="${y}" r="5" /><circle cx="${x + 2.4}" cy="${y - 1.2}" r="4.4" fill="var(--paper,#efe4c8)" stroke="none"/>`,
  dark: (x, y) => `<path d="M${x} ${y - 5}l1.4 3.4 3.6.3-2.8 2.3.9 3.5-3.1-2-3.1 2 .9-3.5-2.8-2.3 3.6-.3z" stroke="none"/>`,
  october: (x, y) => `<ellipse cx="${x}" cy="${y + 1}" rx="5.4" ry="4.2" fill="none" stroke-width="1.4"/><path d="M${x} ${y - 3}v-2.6" stroke-width="1.4"/><path d="M${x - 2} ${y}l1 1M${x + 2} ${y}l-1 1" stroke-width="1"/>`,
};
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const fmtStampDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : MON[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear(); };
export const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const cut = (s, n) => { s = String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/[\s,.;:-]+$/, '') + '…' : s; };
// What a stamp says on its face. On a private home, a share card names the town only.
// Where a stamp is: a private home's public area label, otherwise the town.
export const placeLine = (s) => s.area || [s.town, s.state].filter(Boolean).join(', ');
export const noAddr = (n) => String(n || '').replace(/\s*\((?:[^)]*\d+\s+[A-Z0-9][^)]*|[^)]*\b(St|Ave|Rd|Dr|Blvd|Ln|Street|Avenue|Road)\b[^)]*)\)/g, '').trim();
export function faceText(s, forShare) {
  const town = [s.town, s.state].filter(Boolean).join(', ');
  if (s.area) return { top: s.area, bottom: town || 'PRIVATE HOME · AREA ONLY' };   // private home: its public area label, never an address
  if (forShare && s.priv) return { top: town || 'A private home', bottom: 'PRIVATE HOME · ROADSIDE' };
  if (s.layer === 'scout') return { top: 'SCOUT · ' + (s.name || 'A new place'), bottom: 'SUGGESTED & APPROVED' };
  return { top: noAddr(s.name) || 'Unnamed place', bottom: town || (s.layer === 'cemetery' ? 'CEMETERY' : s.layer === 'marker' ? 'HISTORICAL MARKER' : '') };
}
// opts: { size, mini (map pin: no lettering), forShare, ghost (an empty slot in the book) }
export function stampSvg(s, opts = {}) {
  const size = opts.size || 120, n = ++uidN, h = hash(s.id), mini = !!opts.mini;
  const rare = (s.rare || []).filter((r) => RARE[r]);
  const ink = opts.ghost ? '#8a7d66' : rare.length ? RARE_INK[rare[0]] : (INK[s.layer] || INK.place);
  const shape = s.layer === 'scout' ? 3 : s.layer === 'cemetery' ? [4, 1][h % 2] : s.layer === 'marker' ? [3, 2][h % 2] : (h % 5);
  const rot = opts.ghost ? 0 : ((h >> 3) % 25) - 12;
  const glyph = (s.sub === 'U' && GLYPH.museum) || (s.sub === 'N' && GLYPH.register) || GLYPH[s.layer] || GLYPH.listing;
  const f = { top: '', bottom: '' }; Object.assign(f, opts.ghost ? { top: noAddr(s.name), bottom: [s.town, s.state].filter(Boolean).join(', ') } : faceText(s, opts.forShare));
  // outline shapes in a 120x120 box centred at 60,60
  const outer = [
    `<circle cx="60" cy="60" r="54"/><circle cx="60" cy="60" r="47" stroke-width="1.4"/>`,
    `<ellipse cx="60" cy="60" rx="56" ry="44"/><ellipse cx="60" cy="60" rx="49" ry="37" stroke-width="1.4"/>`,
    `<path d="M38 6h44l32 32v44l-32 32H38L6 82V38z"/><path d="M41 13h38l28 28v38l-28 28H41L13 79V41z" stroke-width="1.4"/>`,
    `<path d="M14 18h92l-4 4v76l4 4H14l4-4V22z"/><rect x="22" y="26" width="76" height="68" stroke-width="1.4"/>`,
    `<path d="M60 6l50 14v34c0 30-22 52-50 60C32 106 10 84 10 54V20z"/><path d="M60 14l42 12v28c0 25-18 44-42 51C36 98 18 79 18 54V26z" stroke-width="1.4"/>`,
  ][shape];
  const arcR = [40, 40, 41, 0, 38][shape];
  let text = '';
  if (!mini) {
    const top = cut(f.top, shape === 3 ? 20 : 26), bot = cut(f.bottom, 26);
    const fs = (t, base) => Math.max(5.4, Math.min(base, base * 12 / Math.max(12, t.length)));
    if (shape === 3) {
      text = `<text x="60" y="40" font-size="${fs(top, 9.5)}" text-anchor="middle" letter-spacing=".6">${esc(top)}</text>`
        + `<text x="60" y="88" font-size="${fs(bot, 7.6)}" text-anchor="middle" letter-spacing=".8">${esc(bot)}</text>`;
    } else {
      const ry = shape === 1 ? arcR - 8 : arcR;
      text = `<defs><path id="pt${n}" d="M${60 - arcR} 60a${arcR} ${ry} 0 0 1 ${arcR * 2} 0"/><path id="pb${n}" d="M${60 - arcR - 6} 60a${arcR + 6} ${ry + 6} 0 0 0 ${(arcR + 6) * 2} 0"/></defs>`
        + `<text font-size="${fs(top, 9.5)}" letter-spacing=".8"><textPath href="#pt${n}" startOffset="50%" text-anchor="middle">${esc(top)}</textPath></text>`
        + `<text font-size="${fs(bot, 7.4)}" letter-spacing="1"><textPath href="#pb${n}" startOffset="50%" text-anchor="middle">${esc(bot)}</textPath></text>`;
    }
    if (!opts.ghost) text += `<text x="60" y="${shape === 3 ? 76 : 79}" font-size="8.2" text-anchor="middle" letter-spacing="1.2" font-family="'Special Elite','Courier New',monospace">${esc(fmtStampDate(s.at))}</text>`;
  }
  const rg = rare.slice(0, 3).map((r, i) => RGLYPH[r](60 + (i - (Math.min(3, rare.length) - 1) / 2) * 15, shape === 3 ? 100 : 92)).join('');
  const rareRing = rare.length && !opts.ghost ? `<circle cx="60" cy="60" r="58" stroke-width="1" stroke-dasharray="2 3"/>` : '';
  const first = s.first && !opts.ghost && !opts.noSeal ? `<g transform="translate(96 22) rotate(14)"><circle r="15" fill="#9c1b1b" stroke="#5e0d0d" stroke-width="1.5"/><circle r="11" fill="none" stroke="#e7b7a0" stroke-width=".8" stroke-dasharray="1.6 1.4"/><text y="-2" font-size="5.2" text-anchor="middle" fill="#f6e3cf" stroke="none" letter-spacing=".4">FIRST</text><text y="5" font-size="5.2" text-anchor="middle" fill="#f6e3cf" stroke="none" letter-spacing=".4">TO FIND</text></g>` : '';
  const filt = opts.ghost ? '' : `<filter id="ink${n}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="${mini ? 0.5 : 0.9}" numOctaves="2" seed="${h % 97}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55"/><feComposite in="SourceGraphic" operator="in"/></filter>`;
  const label = opts.ghost ? 'Not stamped yet: ' + (s.name || '') : 'Stamp: ' + (opts.forShare && s.priv ? 'a private home in ' + (s.town || 'town') : s.name) + (s.at ? ', ' + fmtDate(s.at) : '') + (rare.length ? ' (' + rare.map((r) => RARE[r]).join(', ') + ')' : '');
  return `<svg class="tdp-stamp${opts.ghost ? ' ghost' : ''}${mini ? ' mini' : ''}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`
    + `<defs>${filt}</defs><g ${opts.ghost ? 'opacity=".5" stroke-dasharray="4 3"' : `filter="url(#ink${n})"`} transform="rotate(${rot} 60 60)" fill="none" stroke="${ink}" stroke-width="${mini ? 5 : 3}" font-family="'IM Fell English SC','Cinzel',Georgia,serif">`
    + outer + rareRing + `<g fill="${ink}" stroke="none">${text}</g>`
    + `<g transform="translate(60 ${mini ? 60 : 58}) scale(${mini ? 2.3 : 1.15})" stroke="${ink}" fill="${ink}">${glyph}</g>`
    + (mini ? '' : `<g stroke="${ink}" fill="${ink}">${rg}</g>`) + `</g>${first}</svg>`;
}

/* ---------------------------------------------------------------- sets */
const THEME = (k) => LAYERS[k]?.label || '';
// catalog: Map id -> meta. Returns sets with totals where the catalog knows every place in the set; marker / cemetery
// collections are open-ended (counted, no "of N").
export function computeSets(catalog, list = stamps()) {
  const sets = new Map();
  const add = (key, kind, label, meta, isStamp) => {
    if (!sets.has(key)) sets.set(key, { key, kind, label, places: new Map(), got: new Map(), open: false });
    const S = sets.get(key);
    if (isStamp) S.got.set(meta.id, meta); else S.places.set(meta.id, meta);
  };
  const keysFor = (m) => {
    const k = [];
    if (m.layer === 'scout') return [['c:scout', 'collection', 'Scout stamps']];
    if (m.layer === 'marker' || m.layer === 'cemetery') {
      // their own sets, open-ended (thousands of them), so they never dilute a town's "3 of 11"
      const cem = m.layer === 'cemetery', word = cem ? 'Cemeteries' : 'Markers';
      k.push([cem ? 'c:cemetery' : 'c:marker', 'layer', cem ? 'All cemeteries' : 'All historical markers']);
      if (m.county) k.push([(cem ? 'lc:' : 'lm:') + m.county + '|' + m.state, 'layer', word + ' of ' + m.county + (m.state ? ', ' + m.state : '')]);
      else if (m.town) k.push([(cem ? 'lct:' : 'lmt:') + m.town + '|' + m.state, 'layer', word + ' of ' + [m.town, m.state].filter(Boolean).join(', ')]);
      return k;
    }
    if (m.town) k.push(['t:' + m.town + '|' + m.state, 'town', [m.town, m.state].filter(Boolean).join(', ')]);
    if (m.county) k.push(['k:' + m.county + '|' + m.state, 'county', [m.county, m.state].filter(Boolean).join(', ')]);
    if (m.theme && THEME(m.theme)) k.push(['h:' + m.theme, 'theme', THEME(m.theme)]);
    if (m.layer === 'archive') k.push(['c:archive', 'collection', 'The Archive']);
    if (m.crew) k.push(['c:crew', 'collection', 'With the Twisted History crew']);
    return k;
  };
  for (const m of catalog.values()) { if (!m.exact) continue; for (const [key, kind, label] of keysFor(m)) add(key, kind, label, m, false); }
  for (const s of list) for (const [key, kind, label] of keysFor(s)) { add(key, kind, label, s, true); }
  const out = [];
  for (const S of sets.values()) {
    if (!S.got.size) continue;                       // only sets you have started
    S.open = S.kind === 'layer' || S.key.startsWith('c:scout');
    for (const id of S.got.keys()) if (!S.places.has(id)) S.places.set(id, S.got.get(id));
    S.total = S.open ? null : S.places.size;
    S.complete = !S.open && S.total >= 2 && S.got.size >= S.total;
    out.push(S);
  }
  const order = { town: 0, county: 1, layer: 2, theme: 3, collection: 4 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (a.key.startsWith('c:') - b.key.startsWith('c:')) || b.got.size - a.got.size || a.label.localeCompare(b.label));
}
// Fill in what the device copy lacks (county, theme, privacy) from the catalog. Display only.
export function enrich(list, catalog) {
  return list.map((s) => { const m = catalog.get(s.id); return m ? { ...s, name: s.name || m.name, town: s.town || m.town, county: s.county || m.county, state: s.state || m.state, theme: s.theme || m.theme, crew: s.crew || m.crew, priv: s.priv || m.priv } : s; });
}
export const progressText = (S) => S.open ? `${S.label}: ${S.got.size} stamped` : `${S.label}: ${S.got.size} of ${S.total}`;

/* ---------------------------------------------------------------- backend (Supabase), all optional */
const SDK = 'https://esm.sh/@supabase/supabase-js@2.118.0';
let sbP = null;
export const remote = { ready: false, uid: null, status: 'local' };   // status: local | signed-out | on | off
export function backend() {
  if (sbP) return sbP;
  sbP = (async () => {
    if (CONFIG.backend !== 'supabase' || !CONFIG.supabase?.url) { remote.status = 'off'; return null; }
    try {
      const { createClient } = await import(SDK);
      const sb = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey, { auth: { persistSession: true, detectSessionInUrl: false, storageKey: 'td-auth' } });
      // Switched on by _build/migrations/20261121_passport.sql (app_settings is publicly readable). Before that: stay local, quietly.
      const st = await Promise.race([sb.from('app_settings').select('value').eq('key', 'passport_enabled').maybeSingle(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      if (st.error || st.data?.value !== 'true') { remote.status = 'off'; return null; }
      remote.ready = true;
      const { data } = await sb.auth.getSession();
      remote.uid = data.session?.user?.id || null;
      remote.status = remote.uid ? 'on' : 'signed-out';
      return sb;
    } catch { remote.status = 'off'; return null; }
  })();
  return sbP;
}
// Push device stamps to the signed-in account and pull the account's stamps, first-to-find seals and Scout stamps.
let syncing = null;
export async function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    const sb = await backend(); if (!sb || !remote.uid) return { ok: false };
    const u = remote.uid; const prev = curUid();
    ls.set('td-passport-uid', u);
    const b = book(); const firsts = [];
    for (const s of b.stamps) {
      if (s.layer === 'scout' || (s.u && s.u !== u) || (s.synced && s.u === u)) continue;
      if (!s.u && prev && prev !== u) continue;     // device stamps made under another account's session: leave them
      const r = await sb.rpc('passport_stamp', { p_place_id: s.id, p_name: s.name, p_town: s.town, p_layer: s.layer, p_rare: s.rare || [], p_at: s.at, p_first_ok: !!s.firstOk });
      if (r.error) { if (/too many/i.test(r.error.message)) break; continue; }
      s.u = u; s.synced = true; if (r.data?.first) { s.first = true; firsts.push(s); }
    }
    const mine = await sb.from('passport_stamps').select('place_id,place_name,town,layer,rare,stamped_at').limit(5000);
    if (!mine.error) for (const r of mine.data || []) {
      const have = b.stamps.find((s) => s.id === r.place_id && (!s.u || s.u === u));
      if (have) { have.u = u; have.synced = true; continue; }
      b.stamps.push({ id: r.place_id, name: r.place_name || '', town: r.town || '', county: '', state: '', layer: r.layer, theme: '', crew: false, priv: r.layer === 'listing' || r.layer === 'lead' || r.layer === 'place',
        firstOk: false, at: r.stamped_at, rare: r.rare || [], u, synced: true });
    }
    const fs = await sb.from('passport_firsts').select('place_id');
    if (!fs.error) { const ids = new Set((fs.data || []).map((x) => x.place_id)); for (const s of b.stamps) if (s.u === u && ids.has(s.id)) s.first = true; }
    const sc = await sb.rpc('my_scout_stamps');
    if (!sc.error) for (const r of sc.data || []) {
      const id = 'scout:' + r.id;
      if (!b.stamps.some((s) => s.id === id)) b.stamps.push({ id, name: r.name, town: '', county: '', state: '', layer: 'scout', theme: '', crew: false, priv: false, firstOk: false, at: r.reviewed_at, rare: [], u, synced: true, fresh: true });
    }
    saveBook(b);
    return { ok: true, firsts };
  })();
  try { return await syncing; } finally { syncing = null; }
}
// Aggregate counts only. 0 / unavailable -> nothing (the caller shows nothing).
const cntCache = new Map();
export async function counts(ids) {
  const sb = await backend(); if (!sb) return new Map();
  const need = ids.filter((id) => !cntCache.has(id) || Date.now() - cntCache.get(id).t > 600000).slice(0, 400);
  if (need.length) {
    const r = await sb.rpc('passport_counts', { p_ids: need });
    if (!r.error) { for (const id of need) cntCache.set(id, { n: 0, t: Date.now() }); for (const x of r.data || []) cntCache.set(x.place_id, { n: Number(x.n) || 0, t: Date.now() }); }
  }
  return new Map(ids.filter((id) => cntCache.get(id)?.n > 0).map((id) => [id, cntCache.get(id).n]));
}
export const countLine = (n) => n > 0 ? `${n.toLocaleString()} ${n === 1 ? 'traveler has' : 'travelers have'} stamped this` : '';

// Suggestions: insert-only, signed in, rate limited here and on the server.
const SUGKEY = 'td-passport-sug';
export async function suggest({ lat, lon, name, story, source_url, public_road, place_id }) {
  name = String(name || '').trim(); story = String(story || '').trim(); source_url = String(source_url || '').trim();
  if (!public_road) throw new Error('Please confirm you saw it from a public road.');
  if (name.length < 3 || name.length > 120) throw new Error('Give the place a name (3 to 120 characters).');
  if (story.length < 20 || story.length > 1500) throw new Error('Tell us the story in at least a sentence or two (20 to 1,500 characters).');
  if (source_url && !/^https?:\/\/\S+$/i.test(source_url)) throw new Error('The source link should start with http:// or https://');
  if (!isFinite(lat) || !isFinite(lon)) throw new Error('We need a spot on the map.');
  const hist = (ls.get(SUGKEY, []) || []).filter((t) => Date.now() - t < 864e5);
  if (hist.length && Date.now() - hist[hist.length - 1] < 120000) throw new Error('Please wait a couple of minutes before suggesting another place.');
  if (hist.length >= 5) throw new Error('That is the limit for today (5 suggestions). Thank you!');
  const sb = await backend(); if (!sb) throw new Error('Suggestions open soon.');
  if (!remote.uid) throw new Error('Sign in first.');
  const r = await sb.from('place_suggestions').insert({ lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, name, story, source_url: source_url || null, public_road: true, ...(place_id ? { place_id: String(place_id).slice(0, 160) } : {}) });
  if (r.error) throw new Error(r.error.message);
  hist.push(Date.now()); ls.set(SUGKEY, hist);
  return true;
}

/* ---------------------------------------------------------------- share card (canvas, leather-book style) */
const svgImg = (svg) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
export async function shareCard(S) {
  try { await Promise.all(['500 40px Cinzel', '40px "IM Fell English SC"', 'italic 30px "IM Fell English"'].map((f) => document.fonts.load(f))); } catch { /* fallback fonts */ }
  const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createRadialGradient(W * 0.62, H * 0.3, 40, W * 0.6, H * 0.5, W * 0.8); bg.addColorStop(0, '#2a2420'); bg.addColorStop(1, '#0b0909'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // the book
  const bx = 70, by = 64, bw = 420, bh = 502;
  g.save(); g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 40; g.shadowOffsetY = 16; g.fillStyle = '#3a2418'; g.fillRect(bx, by, bw, bh); g.restore();
  const lg = g.createLinearGradient(bx, by, bx + bw, by + bh); lg.addColorStop(0, '#4a2c1c'); lg.addColorStop(0.5, '#3a2216'); lg.addColorStop(1, '#24150d'); g.fillStyle = lg; g.fillRect(bx, by, bw, bh);
  for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`; g.fillRect(bx + Math.random() * bw, by + Math.random() * bh, 1.5, 1.5); }
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(bx, by, 16, bh);
  g.strokeStyle = 'rgba(201,164,92,.6)'; g.lineWidth = 2; g.strokeRect(bx + 26, by + 16, bw - 42, bh - 32); g.strokeStyle = 'rgba(201,164,92,.3)'; g.lineWidth = 1; g.strokeRect(bx + 34, by + 24, bw - 58, bh - 48);
  const gilt = g.createLinearGradient(0, by + 40, 0, by + 100); gilt.addColorStop(0, '#e6c98a'); gilt.addColorStop(0.45, '#b88d45'); gilt.addColorStop(0.6, '#d7b36c'); gilt.addColorStop(1, '#8f6a33');
  g.fillStyle = gilt; g.textAlign = 'center'; g.font = '500 34px Cinzel, Georgia, serif'; g.fillText('TWISTED', bx + bw / 2 + 8, by + 70); g.fillText('PASSPORT', bx + bw / 2 + 8, by + 108);
  // stamps on a parchment page inset
  const px = bx + 52, py = by + 134, pw = bw - 88, ph = bh - 170;
  g.fillStyle = '#e9dcbc'; g.fillRect(px, py, pw, ph); g.strokeStyle = 'rgba(90,60,30,.5)'; g.strokeRect(px, py, pw, ph);
  const got = [...S.got.values()].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 9);
  const cols = got.length <= 1 ? 1 : got.length <= 4 ? 2 : 3, rows = Math.ceil(got.length / cols) || 1, cell = Math.min(pw / cols, ph / rows);
  for (let i = 0; i < got.length; i++) {
    const im = await svgImg(stampSvg(got[i], { size: 240, forShare: true }));
    const cx = px + (pw - cols * cell) / 2 + (i % cols) * cell, cy = py + (ph - rows * cell) / 2 + Math.floor(i / cols) * cell;
    if (im) g.drawImage(im, cx + cell * 0.06, cy + cell * 0.06, cell * 0.88, cell * 0.88);
  }
  if (S.complete) { const seal = await svgImg(sealSvg(140)); if (seal) g.drawImage(seal, bx + bw - 150, by + bh - 150, 140, 140); }
  // words
  g.textAlign = 'left'; const tx = 560;
  g.font = '44px "IM Fell English SC", Cinzel, Georgia, serif'; g.fillStyle = '#efe6d2'; g.fillText('Twisted', tx, 190); const tw = g.measureText('Twisted ').width; g.fillStyle = '#c3272f'; g.fillText('Deeds', tx + tw, 190);
  g.font = '22px Cinzel, Georgia, serif'; g.fillStyle = '#c9a45c'; g.fillText('TWISTED PASSPORT · ' + (S.kind === 'town' ? 'TOWN' : S.kind === 'county' ? 'COUNTY' : S.kind === 'theme' ? 'THEME' : S.kind === 'layer' ? (S.key.startsWith('c:cemetery') || S.key.startsWith('lc') ? 'CEMETERIES' : 'MARKERS') : 'COLLECTION'), tx, 250);
  g.font = '40px "IM Fell English SC", Cinzel, Georgia, serif'; g.fillStyle = '#f2e9d6'; wrap(g, S.label, tx, 305, 580, 46);
  g.font = 'italic 28px "IM Fell English", Georgia, serif'; g.fillStyle = '#cdb58a';
  g.fillText(S.complete ? 'Set complete · every place stamped' : S.open ? `${S.got.size} stamped` : `${S.got.size} of ${S.total} stamped`, tx, 410);
  g.fillStyle = 'rgba(201,164,92,.7)'; g.fillRect(tx, 438, 100, 2);
  g.font = '19px Cinzel, Georgia, serif'; g.fillStyle = '#a3967f'; g.fillText('DRIVE BY · NEVER TRESPASS · RESPECT RESIDENTS', tx, 484);
  return c;
}
function wrap(g, text, x, y, w, lh) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w && line) { g.fillText(line, x, y + n * lh); line = wd; n++; if (n > 1) break; } else line = t; }
  if (line && n < 2) g.fillText(line, x, y + n * lh);
}
export function sealSvg(size = 90) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Set complete seal"><defs><radialGradient id="wx" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#c2312c"/><stop offset=".6" stop-color="#8d1a17"/><stop offset="1" stop-color="#5a0d0b"/></radialGradient></defs>`
    + `<path d="M50 3c6 4 12 1 17 6s3 11 8 16 12 4 15 11-3 11-1 18 8 10 4 17-11 5-15 10-2 12-9 15-11-3-18-2-10 8-17 4-5-11-10-15-12-2-15-9 3-11 2-18-8-10-4-17 11-5 15-10 2-12 9-15 11 3 18 2z" fill="url(#wx)"/>`
    + `<circle cx="50" cy="50" r="30" fill="none" stroke="#e8b9a4" stroke-width="1.2" stroke-dasharray="2 2" opacity=".8"/><text x="50" y="45" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-size="11" fill="#f7e2cf" letter-spacing="1">SET</text><text x="50" y="60" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-size="11" fill="#f7e2cf" letter-spacing="1">COMPLETE</text></svg>`;
}
