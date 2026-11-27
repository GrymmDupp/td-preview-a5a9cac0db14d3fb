// Ancestors Trail core (2026-11-27, Grymm t275u-t277u). Turns a GEDCOM family tree file into the private trail data.
// Runs on the phone (in-app upload: the file never leaves the device, only the processed result is saved to the
// reader's own account) and in Node for a one-time import. No DOM, no network of its own: loaders are passed in.
// Rules: only places in the United States are kept; obvious duplicate people (same name + birth year + parents) are
// merged and repeated events dropped; living relatives are kept but their places are never exact (a wide circle around
// an offset center, never a house or a grave pin); everything else is only as precise as the record (town, township,
// county), a cemetery pin only when the record names a cemetery that matches one on the map.
export const CORE_VERSION = 'at-1';
const YEAR_NOW = new Date().getFullYear();
export const LIVING_YEARS = 100;

/* ------------------------------------------------------------------ GEDCOM lines -> records */
export function parseGedcom(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const recs = new Map(); const order = [];
  const stack = [];
  let cur = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const m = raw.match(/^\s*(\d+)\s+(@[^@]+@\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!m) continue;
    const lvl = +m[1], ptr = m[2] ? m[2].trim() : null, tag = m[3].toUpperCase(), val = m[4] == null ? '' : m[4];
    if (tag === 'CONC' || tag === 'CONT') { const p = stack[lvl - 1]; if (p) p.v += (tag === 'CONT' ? '\n' : '') + val; continue; }
    const node = { t: tag, v: val, k: [] };
    if (lvl === 0) { cur = node; node.id = ptr; if (ptr) { recs.set(ptr, node); order.push(ptr); } stack.length = 0; stack[0] = node; continue; }
    const parent = stack[lvl - 1]; if (!parent) continue;
    parent.k.push(node); stack[lvl] = node; stack.length = lvl + 1;
  }
  return { recs, order };
}
const kid = (n, t) => n.k.find((x) => x.t === t);
const kids = (n, t) => n.k.filter((x) => x.t === t);
const val = (n, t) => { const x = n && kid(n, t); return x ? x.v.trim() : ''; };

/* ------------------------------------------------------------------ dates */
export function yearOf(d) { const m = String(d || '').match(/\b(\d{3,4})\b/); return m ? +m[1] : null; }

/* ------------------------------------------------------------------ places */
const ST = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR',
  virgina: 'VA', 'w va': 'WV', 'w v': 'WV', wva: 'WV', ark: 'AR', tenn: 'TN', 'n c': 'NC', 's c': 'SC', 'washington dc': 'DC', 'washington d.c.': 'DC', 'd.c.': 'DC', penn: 'PA', penna: 'PA', mass: 'MA', 'rhode island and providence plantations': 'RI', 'plymouth': null };
const ABBR = new Set(Object.values(ST).filter(Boolean));
const OLD = { 'massachusetts bay': 'MA', 'plymouth colony': 'MA', 'new plymouth': 'MA', 'new netherland': 'NY', 'new amsterdam': 'NY', 'new haven colony': 'CT', 'carolina': null };
const US = /^(united states( of america)?|u\.?s\.?a?\.?|america|united states of america \(usa\)|british (colonial )?america|colonial america|american colonies|colonial era|british colonies|thirteen colonies|new england)$/i;
// countries and old realms outside the US (used only to count what was dropped as non-US vs. too vague to place)
const FOREIGN = /\b(germany|deutschland|prussia|preussen|bavaria|baden|wurttemberg|hesse|saxony|england|scotland|schotland|wales|ireland|united kingdom|great britain|britain|switzerland|schweiz|suisse|hungary|slovak|slovakia|slovkia|czech|czecho|czechoslovakia|czecholslovakia|czecho slovkia|chile|chili|bohemia|moravia|austria|france|spain|sweden|norway|denmark|netherlands|holland|belgium|italy|poland|russia|ukraine|canada|mexico|india|europe|luxembourg|alsace|lorraine|finland|portugal|greece|australia|new zealand|cuba|jamaica|barbados|bermuda|ontario|quebec|nova scotia|new brunswick|manitoba)\b/i;
export const isForeign = (s) => FOREIGN.test(String(s || ''));
const STATE_NAMES = {}; for (const [k, v] of Object.entries(ST)) if (v && !STATE_NAMES[v] && k.length > 4) STATE_NAMES[v] = k.replace(/\b\w/g, (c) => c.toUpperCase()).replace(' Of ', ' of ');
export const stateName = (a) => STATE_NAMES[a] || a;
const STREET = /^\s*\d+[A-Za-z]?(\s*[-½]\s*\d*)?\s+[A-Za-z0-9]/;
function stateOf(tok) {
  tok = String(tok).replace(/\s*\(.*?\)\s*/g, ' ').replace(/[?]/g, '').replace(/\s+(usa|u\.s\.a\.?|us|united states)$/i, '').trim();
  let t = tok.toLowerCase().replace(/\s+/g, ' ').replace(/^(the )?(colony|province|state|commonwealth|territory) of /, '').replace(/ (colony|territory|province|state|commonwealth)$/, '').replace(/\.$/, '').trim();
  if (t in OLD) return OLD[t] || null;
  if (ST[t]) return ST[t];
  t = t.replace(/\./g, ' ').replace(/\s+/g, ' ').trim(); if (ST[t]) return ST[t];
  const u = tok.trim().toUpperCase().replace(/\./g, '');
  if (u.length === 2 && ABBR.has(u)) return u;
  return null;
}
// "Town, County, State, United States" -> { us: true, st, parts: [town, county], street: '' }
export function splitPlace(s) {
  let parts = String(s || '').split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && !/^\(?\s*\)?$/.test(x));
  if (!parts.length) return { us: null };
  let us = null;
  while (parts.length && US.test(parts[parts.length - 1])) { parts.pop(); us = true; }
  if (!parts.length) return us ? { us: true, st: '', parts: [] } : { us: null };
  // the state is the last token that names one (some records add a stray zip or "USA" variant)
  let st = null;
  const last = parts[parts.length - 1].replace(/\s+\d{5}(-\d{4})?$/, '');
  st = stateOf(last);
  if (st) parts.pop();
  else {
    const m = last.match(/^(.*?)\s+([A-Z]{2})$/);               // "Town XX"
    if (m && ABBR.has(m[2])) { st = m[2]; parts[parts.length - 1] = m[1]; }
  }
  if (!st) {   // "Name Co State", "Name County State": the state glued to the last part
    const m = last.match(/^(.*?\b(?:county|co\.?))\s+(.+)$/i);
    const s2 = m && stateOf(m[2]);
    if (s2) { st = s2; parts[parts.length - 1] = m[1]; }
  }
  if (!st) return { us: us ? 'nostate' : (isForeign(last) ? false : 'vague'), parts };
  let street = '';
  if (parts.length && STREET.test(parts[0])) street = parts.shift();
  parts = parts.map((p) => p.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/^(prob\.?|probably|possibly|poss\.?|near|nr\.?|of|abt\.?|about)\s+/i, '').replace(/\s+ward\s+\d+$/i, '').replace(/[?]/g, '')
    .replace(/^([NSEW])\.?\s+/, (m, c) => ({ N: 'North ', S: 'South ', E: 'East ', W: 'West ' }[c])).trim())
    .filter((p) => p && !/^(rural|of|beat \d+|school district( no\.?)? ?\d+|precinct( no\.?)? ?\d+|township \d+|district \d+|ed \d+|ward \d+|\d+)$/i.test(p));
  return { us: true, st, parts, street };
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(the )/, '').replace(/\bsaint\b/g, 'st').replace(/\bst\.\s*/g, 'st ').replace(/\bmount\b/g, 'mt').replace(/\bmt\.\s*/g, 'mt ').replace(/\bfort\b/g, 'ft').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const CTY = /\s+(county|co\.?|parish|borough|census area)$/i;
const TWP = /\s+(township|twp\.?|town|precinct|district)$/i;
const CITY = /\s+(city|village|borough)$/i;

// Gazetteer index per state: by normalized name
const gazIdx = new Map();
async function gazFor(st, load) {
  if (gazIdx.has(st)) return gazIdx.get(st);
  const p = (async () => {
    const g = await load(st).catch(() => null); if (!g) return null;
    const byName = new Map(); const cByName = new Map();
    g.c.forEach((c, i) => { const n = norm(c[0]); if (!cByName.has(n)) cByName.set(n, i); });
    g.p.forEach((p, i) => { const n = norm(p[0]); if (!byName.has(n)) byName.set(n, []); byName.get(n).push(i); });
    return { g, byName, cByName };
  })();
  gazIdx.set(st, p);
  return p;
}
const RANK = { p: 3, g: 2, t: 1 };
function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); }
function pickPlace(G, name, ci, kinds) {
  const ids = G.byName.get(norm(name)) || [];
  let best = null;
  for (const i of ids) {
    const p = G.g.p[i];
    if (kinds && !kinds.includes(p[5])) continue;
    if (ci != null && ci >= 0 && p[1] !== ci) continue;
    if (!best || RANK[p[5]] > RANK[best[5]] || (RANK[p[5]] === RANK[best[5]] && p[4] > best[4])) best = p;
  }
  return best;
}
function nearTown(G, name, c) {
  const n0 = name.replace(TWP, '').replace(CITY, '');
  let best = null, bd = 1e9;
  for (const i of G.byName.get(norm(n0)) || []) { const p = G.g.p[i]; const d = km(p[2], p[3], c[1], c[2]); if (d <= c[3] / 1000 + 40 && (d < bd - 5 || (Math.abs(d - bd) <= 5 && RANK[p[5]] > RANK[best[5]]))) { best = p; bd = d; } }
  return best;
}
function countyIdx(G, name) {
  const n = norm(String(name).replace(CTY, ''));
  return G.cByName.has(n) ? G.cByName.get(n) : (G.cByName.has(n + ' city') ? G.cByName.get(n + ' city') : -1);
}
// Resolve a split place to the most precise point the record honestly supports.
// q: town | township | county | state
export async function resolvePlace(sp, loadGaz) {
  if (!sp || sp.us !== true) return null;
  const st = sp.st; if (!st) return null;
  const G = await gazFor(st, loadGaz);
  const sLabel = stateName(st);
  const out = (p, q, label, extra) => Object.assign({ la: p[2], lo: p[3], r: p[4], q, lb: label }, extra || {});
  const cArr = (ci) => { const c = G.g.c[ci]; return [c[0], ci, c[1], c[2], c[3]]; };
  if (!G) return { q: 'state', st, lb: sLabel };
  const parts = sp.parts.slice();
  if (!parts.length) return { q: 'state', st, lb: sLabel };
  const cnt = (ci) => G.g.c[ci];
  const cLabel = (ci) => { const c = cnt(ci); return c[0].endsWith(' city') ? c[0] : c[0] + ' County'; };
  // explicit county token ("Name County") anywhere after the first part
  let ci = -1, ciPos = -1;
  for (let i = parts.length - 1; i >= 1; i--) { const x = countyIdx(G, parts[i]); if (x >= 0) { ci = x; ciPos = i; break; } }
  if (parts.length === 1 && CTY.test(parts[0])) { const x = countyIdx(G, parts[0]); if (x >= 0) return out(cArr(x), 'county', cLabel(x) + ', ' + sLabel, { st }); }
  const town = parts[0];
  const tryTown = (name, c) => {
    if (CTY.test(name)) return null;
    const n0 = name.replace(TWP, '').replace(CITY, '');
    const wantTwp = TWP.test(name);
    let p = wantTwp ? pickPlace(G, n0, c, ['t']) : pickPlace(G, n0, c, ['p', 'g']) || pickPlace(G, n0, c, ['t']);
    if (!p && wantTwp) p = pickPlace(G, n0, c, null);
    if (!p && n0 !== name) p = pickPlace(G, name, c, null);
    return p;
  };
  const NE = /^(MA|CT|RI|VT|NH|ME)$/.test(st);
  const townOut = (p) => out(p, p[5] === 't' ? 'township' : 'town', [p[0] + (p[5] === 't' && !NE && !/(township|town)$/i.test(p[0]) ? ' Township' : ''), p[1] >= 0 ? cLabel(p[1]) : '', sLabel].filter(Boolean).join(', '), { st, ci: p[1] });
  if (parts.length >= 2) {
    const cands = parts.slice(0, ciPos >= 0 ? ciPos : parts.length - 1);
    for (const town of cands) {
      let p = tryTown(town, ci >= 0 ? ci : null);
      // county lines moved and independent cities split off: the same name close to the named county still counts
      if (!p && ci >= 0) p = nearTown(G, town, cnt(ci));
      if (p) return townOut(p);
    }
    if (ci < 0) { // county not recognised: town anywhere in the state, only if the name is unique there
      const ids = (G.byName.get(norm(town.replace(TWP, '').replace(CITY, ''))) || []).map((i) => G.g.p[i]).filter((x) => x[5] !== 't');
      if (ids.length === 1) return townOut(ids[0]);
      if (st === 'VA' && !sp.wv) return resolvePlace(Object.assign({}, sp, { st: 'WV', wv: true }), loadGaz).then((r) => (r && r.q !== 'state' ? r : { q: 'state', st, lb: sLabel }));
    }
    if (ci >= 0) return out(cArr(ci), 'county', cLabel(ci) + ', ' + sLabel, { st, ci });
    return { q: 'state', st, lb: sLabel };
  }
  // one part before the state: "Name, State". Ancestry writes counties without the word County, so a standardized
  // ("..., United States") place that is both a county and a town means the county; a hand-typed one means the town.
  const c1 = countyIdx(G, town);
  const p1 = tryTown(town, null);
  const ids = (G.byName.get(norm(town.replace(TWP, '').replace(CITY, ''))) || []).map((i) => G.g.p[i]).filter((x) => x[5] !== 't');
  const uniqueTown = ids.length === 1 || (ids.length > 1 && ids.filter((x) => x[5] === 'p').length === 1);
  if (c1 >= 0 && (sp.std || !p1 || !uniqueTown)) return out(cArr(c1), 'county', cLabel(c1) + ', ' + sLabel, { st, ci: c1 });
  if (p1 && uniqueTown) { const x = ids.length === 1 ? ids[0] : ids.find((y) => y[5] === 'p'); return out(x, 'town', [x[0], cLabel(x[1]), sLabel].join(', '), { st, ci: x[1] }); }
  if (p1 && p1[5] === 't') return townOut(p1);
  if (st === 'VA' && !sp.wv) { const r = await resolvePlace(Object.assign({}, sp, { st: 'WV', wv: true }), loadGaz); if (r && r.q !== 'state') return r; }
  return { q: 'state', st, lb: sLabel };
}

/* ------------------------------------------------------------------ cemeteries */
const CEMW = /\b(cemetery|cemetary|cemetry|cem|memorial (park|gardens?)|mem gardens?|burying ground|burial ground|graveyard|churchyard|gardens? of memory|mausoleum)\b/i;
const STOP = new Set(['cemetery', 'cemetary', 'cemetry', 'cem', 'the', 'of', 'and', 'memorial', 'mem', 'park', 'gardens', 'garden', 'burying', 'burial', 'ground', 'grounds', 'graveyard', 'churchyard', 'old', 'new', 'church', 'cemeteries', 'at', 'in']);
const toks = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w));
export function cemeteryNames(texts) {
  const out = new Set();
  for (let t of texts) {
    t = String(t || '').replace(/<[^>]+>/g, ' ');
    for (const seg of t.split(/[,;\n]| - /)) {
      const s = seg.replace(/^.*?\b(buried|burial|interred|interment)\b( (at|in))?\s*/i, '').replace(/\.\s.*$/, '').replace(/\bcourtesy of.*$/i, '').trim();
      if (s.length >= 4 && s.length <= 80 && CEMW.test(s) && toks(s).length) out.add(s);
    }
  }
  return [...out];
}
async function cemeteriesNear(la, lo, rKm, loadTile) {
  const T = 0.25, dLa = rKm / 111, dLo = rKm / (111 * Math.cos(la * Math.PI / 180));
  const out = [];
  for (let a = Math.floor((la - dLa) / T) * T; a <= la + dLa; a += T) for (let o = Math.floor((lo - dLo) / T) * T; o <= lo + dLo; o += T) {
    const j = await loadTile(a.toFixed(2) + '_' + o.toFixed(2)).catch(() => null);
    for (const f of (j && j.f) || []) if (f[3] === 'C' && f[2] && km(la, lo, f[0], f[1]) <= rKm) out.push(f);
  }
  return out;
}
// -> { cm: name, la, lo, cf: 'high' | 'medium' } or null
export async function matchCemetery(names, area, loadTile) {
  if (!names.length || !area || !isFinite(area.la)) return null;
  const rKm = Math.min(60, (area.r || 5000) / 1000 + 12);
  const near = await cemeteriesNear(area.la, area.lo, rKm, loadTile);
  let best = null;
  for (const nm of names) {
    const a = toks(nm); if (!a.length) continue;
    for (const f of near) {
      const b = toks(f[2]); if (!b.length) continue;
      const same = a.join(' ') === b.join(' ');
      const inter = a.filter((w) => b.includes(w)).length, score = inter / Math.max(a.length, b.length);
      if (!same && score < 0.66) continue;
      const cand = { cm: f[2], la: f[0], lo: f[1], cf: same ? 'high' : 'medium', s: (same ? 2 : score) - km(area.la, area.lo, f[0], f[1]) / 1000 };
      if (!best || cand.s > best.s) best = cand;
    }
  }
  if (best) delete best.s;
  return best;
}
// A town-only burial: a cemetery named after the town close by is offered as a possibility, never pinned.
export async function townCemetery(townName, area, loadTile) {
  if (!townName || !area || !isFinite(area.la)) return null;
  const near = await cemeteriesNear(area.la, area.lo, Math.min(15, (area.r || 2000) / 1000 + 4), loadTile);
  const t = toks(townName).join(' ');
  const hits = near.filter((f) => toks(f[2]).join(' ') === t);
  return hits.length === 1 ? { cm: hits[0][2], la: hits[0][0], lo: hits[0][1], cf: 'low' } : null;
}

/* ------------------------------------------------------------------ people + events */
const EV = { BIRT: 'Born', CHR: 'Christened', BAPM: 'Baptized', DEAT: 'Died', BURI: 'Buried', CREM: 'Cremated', MARR: 'Married', DIV: 'Divorced', RESI: 'Lived', CENS: 'Census', EMIG: 'Emigrated', IMMI: 'Arrived', NATU: 'Naturalized', OCCU: 'Worked', EDUC: 'School', GRAD: 'Graduated', RETI: 'Retired', PROB: 'Probate', WILL: 'Will', _MILT: 'Military', MILI: 'Military', PROP: 'Property', EVEN: 'Event', ENGA: 'Engaged', ADOP: 'Adopted', CONF: 'Confirmed', ORDN: 'Ordained', DSCR: '', _DEG: 'Degree', ARRI: 'Arrived', DEPA: 'Departed' };
export const EVENT_LABEL = EV;
const nameOf = (n) => { const x = kid(n, 'NAME'); if (!x) return ''; return x.v.replace(/\//g, ' ').replace(/\s+/g, ' ').trim(); };
const nKey = (s) => norm(s).replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();

// Build the trail. opts: { loadGaz(st), loadTile(key), geocodeStreet(text, area) -> {la,lo}|null, rand() }
export async function buildTrail(text, opts = {}) {
  const rand = opts.rand || Math.random;
  const { recs, order } = parseGedcom(text);
  const S = { people_in_file: 0, families_in_file: 0, events_in_file: 0, events_with_place: 0, us_events: 0, non_us_events: 0, unplaceable_events: 0, people_kept: 0, people_us: 0, people_no_place: 0, people_non_us_only: 0, duplicates_people: 0, duplicates_events: 0, living: 0, precision: {}, cemetery_high: 0, cemetery_medium: 0, cemetery_possible: 0, street_exact: 0, street_living_coarsened: 0, home_person: null };
  // people
  const P = new Map(); const famRecs = [];
  for (const id of order) {
    const r = recs.get(id);
    if (r.t === 'INDI') {
      S.people_in_file++;
      const p = { id, n: nameOf(r) || 'Unknown', sx: val(r, 'SEX'), famc: kids(r, 'FAMC').map((x) => x.v.trim()), fams: kids(r, 'FAMS').map((x) => x.v.trim()), ev: [], liv: false, dead: false, objs: kids(r, 'OBJE').map((x) => x.v.trim()).filter((v) => /^@/.test(v)), notes: [] };
      const flag = kid(r, '_LIVING') || kid(r, 'LIVING');
      if (flag && /^y/i.test(flag.v)) p.liv = true;
      for (const e of r.k) {
        if (!(e.t in EV) || e.t === 'DSCR') continue;
        S.events_in_file++;
        if (e.t === 'DEAT' || e.t === 'BURI' || e.t === 'CREM' || e.t === 'PROB' || e.t === 'WILL') p.dead = true;
        const ty = e.t === 'EVEN' ? (val(e, 'TYPE') || 'Event') : '';
        p.ev.push({ t: e.t, ty: /^(arrival|departure|civil|hospital visit)$/i.test(ty) ? ty : (e.t === 'EVEN' ? 'Event' : ''), d: val(e, 'DATE'), pl: val(e, 'PLAC'), notes: [val(e, 'NOTE'), ...kids(e, 'NOTE').map((x) => x.v)].filter(Boolean) });
      }
      P.set(id, p);
    } else if (r.t === 'FAM') { S.families_in_file++; famRecs.push(r); }
  }
  // families -> parents / spouses / children, family events go to both spouses
  const F = new Map();
  for (const r of famRecs) {
    const f = { h: val(r, 'HUSB'), w: val(r, 'WIFE'), c: kids(r, 'CHIL').map((x) => x.v.trim()) };
    F.set(r.id, f);
    for (const e of r.k) if (e.t === 'MARR' || e.t === 'DIV' || e.t === 'ENGA') {
      S.events_in_file++;
      const ev = { t: e.t, ty: '', d: val(e, 'DATE'), pl: val(e, 'PLAC'), notes: [], with: null };
      for (const [me, other] of [[f.h, f.w], [f.w, f.h]]) if (P.has(me)) P.get(me).ev.push(Object.assign({}, ev, { with: other || null }));
    }
  }
  const parentsOf = (p) => { const out = []; for (const fid of p.famc) { const f = F.get(fid); if (f) { if (f.h) out.push(f.h); if (f.w) out.push(f.w); } } return [...new Set(out)]; };
  const spousesOf = (p) => { const out = []; for (const fid of p.fams) { const f = F.get(fid); if (f) for (const x of [f.h, f.w]) if (x && x !== p.id) out.push(x); } return [...new Set(out)]; };
  const childrenOf = (p) => { const out = []; for (const fid of p.fams) { const f = F.get(fid); if (f) out.push(...f.c); } return [...new Set(out)]; };
  for (const p of P.values()) { p.par = parentsOf(p); p.sp = spousesOf(p); p.ch = childrenOf(p); p.by = yearOf((p.ev.find((e) => e.t === 'BIRT' || e.t === 'CHR' || e.t === 'BAPM') || {}).d); }
  // duplicates: same name + birth year + same parents (by name + birth year), twice so duplicated parents collapse first
  const alias = new Map(); const real = (id) => { while (alias.has(id)) id = alias.get(id); return id; };
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Map();
    for (const p of P.values()) {
      if (alias.has(p.id) || !p.by) continue;
      const pk = [...new Set(p.par.map(real))].map((x) => P.get(x)).filter(Boolean).map((q) => nKey(q.n) + ':' + (q.by || '')).sort().join('|');
      const k = nKey(p.n) + '#' + p.by + '#' + pk;
      if (!nKey(p.n) || /^unknown$/.test(nKey(p.n))) continue;
      if (seen.has(k)) {
        const keep = P.get(seen.get(k));
        alias.set(p.id, keep.id); S.duplicates_people++;
        keep.ev.push(...p.ev); keep.objs.push(...p.objs); keep.par.push(...p.par); keep.sp.push(...p.sp); keep.ch.push(...p.ch);
        keep.liv = keep.liv || p.liv; keep.dead = keep.dead || p.dead;
      } else seen.set(k, p.id);
    }
  }
  for (const id of alias.keys()) P.delete(id);
  for (const p of P.values()) {
    p.par = [...new Set(p.par.map(real))].filter((x) => x !== p.id && P.has(x));
    p.sp = [...new Set(p.sp.map(real))].filter((x) => x !== p.id && P.has(x));
    p.ch = [...new Set(p.ch.map(real))].filter((x) => x !== p.id && P.has(x));
    for (const e of p.ev) if (e.with) e.with = real(e.with);
  }
  // living: no death record and born within the last 100 years (estimated from parents, spouses or children when the
  // record has no birth date), or no dates anywhere at all; or marked living in the file
  const est = (p) => {
    if (p.by) return p.by;
    const ys = [];
    for (const c of p.ch) { const y = P.get(c)?.by; if (y) ys.push(y - 25); }
    for (const s of p.sp) { const y = P.get(s)?.by; if (y) ys.push(y); }
    for (const q of p.par) { const y = P.get(q)?.by; if (y) ys.push(y + 25); }
    for (const e of p.ev) { const y = yearOf(e.d); if (y) ys.push(e.t === 'MARR' ? y - 22 : y - 20); }
    return ys.length ? Math.min(...ys) : null;
  };
  for (const p of P.values()) {
    if (p.dead) { p.liv = false; continue; }
    const y = est(p);
    if (p.liv || y == null || y > YEAR_NOW - LIVING_YEARS) p.liv = true;
  }
  // events: US only, drop repeats
  const places = []; const pIdx = new Map();
  const addPlace = (obj) => { const k = JSON.stringify([obj.la, obj.lo, obj.r, obj.q, obj.lb, obj.cm || '', obj.lv || 0]); if (pIdx.has(k)) return pIdx.get(k); pIdx.set(k, places.length); places.push(obj); return places.length - 1; };
  const resolved = new Map();
  const livingArea = new Map();
  const resolveStr = async (pl) => {
    if (resolved.has(pl)) return resolved.get(pl);
    const sp = splitPlace(pl);
    sp.std = /,\s*united states\s*$/i.test(pl);
    let r = null;
    if (sp.us === true) r = await resolvePlace(sp, opts.loadGaz);
    const res = { sp, r };
    resolved.set(pl, res);
    return res;
  };
  const objMeta = (id) => { const o = recs.get(id); if (!o) return []; const out = []; for (const k of o.k) if (k.t === '_META' || k.t === '_DSCR' || k.t === 'TITL') out.push(k.v); const f = kid(o, 'FILE'); if (f) for (const k of f.k) if (k.t === 'TITL' || k.t === '_DSCR') out.push(k.v); return out; };
  const people = [];
  const keepIds = new Set();
  for (const p of P.values()) {
    const seen = new Set(); const evs = [];
    let anyPlace = false, anyUS = false;
    // dated first, and the family copy of a marriage or divorce (it names the spouse) before a bare personal copy
    const sorted = p.ev.slice().sort((a, b) => (b.d ? 1 : 0) - (a.d ? 1 : 0) || (b.with ? 1 : 0) - (a.with ? 1 : 0));
    for (const e of sorted) {
      let placeIdx = -1;
      if (e.pl) {
        anyPlace = true; S.events_with_place++;
        const { sp, r } = await resolveStr(e.pl);
        if (sp.us === false) { S.non_us_events++; continue; }
        if (sp.us === "vague" && opts.dropVague !== false) { S.unplaceable_events++; continue; }
        if (sp.us !== true || !r) { S.unplaceable_events++; continue; }
        anyUS = true; S.us_events++;
        let area = r;
        // precise spots for the dead only: a street address the geocoder can find, or a named cemetery that matches the map
        if (r.q !== 'state') {
          if (sp.street && !p.liv && opts.geocodeStreet) {
            const g = await opts.geocodeStreet(sp.street + ', ' + r.lb, r).catch(() => null);
            if (g && km(g.la, g.lo, r.la, r.lo) * 1000 <= Math.max(3000, r.r * 2)) { area = { la: g.la, lo: g.lo, r: 30, q: 'exact', lb: sp.street + ', ' + r.lb, st: r.st }; S.street_exact++; }
          }
          if (sp.street && p.liv) S.street_living_coarsened++;
          if (e.t === 'BURI' && !p.liv && opts.loadTile) {
            const names = cemeteryNames([e.pl, ...e.notes, ...p.objs.flatMap(objMeta)]);
            const m = await matchCemetery(names, r, opts.loadTile);
            if (m) { area = { la: m.la, lo: m.lo, r: 60, q: 'cemetery', lb: m.cm + ', ' + r.lb, cm: m.cm, cf: m.cf, st: r.st }; S['cemetery_' + m.cf]++; }
            else if (r.q === 'town') {
              const t = await townCemetery(r.lb.split(',')[0], r, opts.loadTile);
              if (t) { area = Object.assign({}, r, { alt: { cm: t.cm, la: t.la, lo: t.lo } }); S.cemetery_possible++; }
            }
          }
        }
        if (area.q === 'state') placeIdx = addPlace({ q: 'state', lb: area.lb, st: area.st });
        else if (p.liv) {
          // living: never exact. A wide circle (at least half a mile, the town's own size if bigger) around a center
          // moved 40-70% of the radius in a random direction, so the middle of the circle is not their home.
          const baseKey = area.lb;
          if (!livingArea.has(baseKey)) {
            const R = Math.max(805, Math.min(area.r || 805, 12000));
            const ang = rand() * 2 * Math.PI, f = 0.4 + rand() * 0.3, dm = R * f;
            const la = area.la + (dm * Math.cos(ang)) / 110540, lo = area.lo + (dm * Math.sin(ang)) / (111320 * Math.cos(area.la * Math.PI / 180));
            livingArea.set(baseKey, addPlace({ la: +la.toFixed(5), lo: +lo.toFixed(5), r: Math.round(R), q: area.q === 'exact' || area.q === 'cemetery' ? 'town' : area.q, lb: area.lb, lv: 1, st: area.st }));
          }
          placeIdx = livingArea.get(baseKey);
        } else placeIdx = addPlace({ la: +(+area.la).toFixed(5), lo: +(+area.lo).toFixed(5), r: Math.round(area.r), q: area.q, lb: area.lb, st: area.st, ...(area.cm ? { cm: area.cm, cf: area.cf } : {}), ...(area.alt ? { alt: area.alt } : {}) });
      }
      const k0 = e.t + '|' + (e.ty || '') + '|' + (placeIdx >= 0 ? places[placeIdx].lb : '');
      const key = k0 + '|' + (yearOf(e.d) || '');
      if (seen.has(key) || (!e.d && seen.has(k0))) { S.duplicates_events++; continue; }
      seen.add(key); seen.add(k0);
      evs.push({ t: e.t, ty: e.ty, d: e.d, p: placeIdx, w: e.with });
    }
    if (anyPlace && !anyUS) { S.people_non_us_only++; continue; }
    if (anyUS) S.people_us++; else S.people_no_place++;
    keepIds.add(p.id);
    people.push({ p, evs });
  }
  // stored people: kept people with names and events; others only as anonymous links (parents) for relationships
  const ids = new Map(); let n = 0;
  const idOf = (x) => { if (!ids.has(x)) ids.set(x, 'p' + (n++).toString(36)); return ids.get(x); };
  const outPeople = [];
  const ord = (e) => ({ BIRT: 0, CHR: 1, BAPM: 1 }[e.t] ?? (e.t === 'DEAT' ? 8 : e.t === 'BURI' ? 9 : 5));
  for (const { p, evs } of people) {
    evs.sort((a, b) => (yearOf(a.d) || 9999) - (yearOf(b.d) || 9999) || ord(a) - ord(b));
    // life dates come from every record (a birth abroad still gives the year); only the places are US-only
    const all = p.ev.filter((e) => e.d);
    const b = all.find((e) => e.t === 'BIRT') || all.find((e) => e.t === 'CHR' || e.t === 'BAPM');
    const d = all.find((e) => e.t === 'DEAT') || all.find((e) => e.t === 'BURI');
    if (p.liv) S.living++;
    outPeople.push({ i: idOf(p.id), n: p.n, sx: p.sx === 'M' || p.sx === 'F' ? p.sx : '', b: b ? b.d : '', d: d ? d.d : '', liv: p.liv ? 1 : 0, dead: p.dead ? 1 : 0, f: p.par.map(idOf), s: p.sp.map(idOf),
      e: evs.map((e) => [e.t === 'EVEN' ? (e.ty || 'Event') : e.t, e.d || '', e.p, e.w ? idOf(e.w) : ''].filter((x, k) => k < 3 || x)) });
  }
  const links = [];
  for (const p of P.values()) if (!keepIds.has(p.id) && ids.has(p.id)) links.push({ i: idOf(p.id), f: p.par.map(idOf) });
  // links may reference more parents of dropped people; keep going up so cousin links through them still work
  const rev = new Map([...ids.entries()].map(([k, v]) => [v, k]));
  const linked = new Set(links.map((l) => l.i));
  for (let k = 0; k < links.length; k++) for (const pid of P.get(rev.get(links[k].i))?.par || []) {
    if (keepIds.has(pid)) continue;
    const li = idOf(pid); rev.set(li, pid); if (linked.has(li)) continue;
    linked.add(li); links.push({ i: li, f: P.get(pid).par.map((x) => { const y = idOf(x); rev.set(y, x); return y; }) });
  }
  // usage counts per precision
  const used = new Set(); for (const q of outPeople) for (const e of q.e) if (e[2] >= 0) used.add(e[2]);
  for (const i of used) { const q = places[i].q + (places[i].lv ? ' (living, wide circle)' : ''); S.precision[q] = (S.precision[q] || 0) + 1; }
  S.people_kept = outPeople.length; S.places = used.size;
  // home person: the file's first person (Ancestry writes the tree's home person first), if kept
  const first = order.find((id) => recs.get(id).t === 'INDI');
  const home = first && ids.has(real(first)) && keepIds.has(real(first)) ? ids.get(real(first)) : (outPeople[0] && outPeople[0].i);
  S.home_person = home ? 'first person in the file' : null;
  return { v: 1, core: CORE_VERSION, made: new Date().toISOString(), home, people: outPeople, links, places, stats: S };
}

/* ------------------------------------------------------------------ relationships */
const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
function upMap(byId, id) { const d = new Map([[id, 0]]); let q = [id]; while (q.length) { const nx = []; for (const x of q) for (const f of (byId.get(x)?.f || [])) if (!d.has(f)) { d.set(f, d.get(x) + 1); nx.push(f); } q = nx; } return d; }
function blood(byId, home, other) {
  if (home === other) return { a: 0, b: 0 };
  const A = upMap(byId, home), B = upMap(byId, other);
  let best = null;
  for (const [x, a] of A) if (B.has(x)) { const b = B.get(x); if (!best || a + b < best.a + best.b) best = { a, b }; }
  return best;
}
function words(rel, sx) {
  const { a, b } = rel; const g = (m, f, n) => (sx === 'M' ? m : sx === 'F' ? f : n);
  const greats = (k) => (k <= 0 ? '' : k === 1 ? 'great-' : ORD(k) + ' great-');
  if (a === 0 && b === 0) return 'you';
  if (b === 0) return a === 1 ? g('father', 'mother', 'parent') : a === 2 ? g('grandfather', 'grandmother', 'grandparent') : greats(a - 2) + g('grandfather', 'grandmother', 'grandparent');
  if (a === 0) return b === 1 ? g('son', 'daughter', 'child') : b === 2 ? g('grandson', 'granddaughter', 'grandchild') : greats(b - 2) + g('grandson', 'granddaughter', 'grandchild');
  if (a === 1 && b === 1) return g('brother', 'sister', 'sibling');
  if (a === 1) return b === 2 ? g('nephew', 'niece', 'nephew or niece') : greats(b - 2) + g('grandnephew', 'grandniece', 'grandnephew or grandniece');
  if (b === 1) return a === 2 ? g('uncle', 'aunt', 'aunt or uncle') : greats(a - 2) + g('granduncle', 'grandaunt', 'grandaunt or granduncle');
  const deg = Math.min(a, b) - 1, rem = Math.abs(a - b);
  return ORD(deg) + ' cousin' + (rem ? ' ' + (rem === 1 ? 'once' : rem === 2 ? 'twice' : rem + ' times') + ' removed' : '');
}
export function indexTree(tree) {
  const byId = new Map();
  for (const p of tree.people) byId.set(p.i, p);
  for (const l of tree.links || []) if (!byId.has(l.i)) byId.set(l.i, { i: l.i, f: l.f, link: true });
  return byId;
}
// "your 3rd great-grandfather", "the husband of your great-aunt", or '' when no path is in the file
export function relationship(byId, home, id) {
  if (!home || !id) return '';
  const p = byId.get(id); if (!p) return '';
  const r = blood(byId, home, id);
  if (r) return r.a === 0 && r.b === 0 ? 'you' : 'your ' + words(r, p.sx);
  const h = byId.get(home);
  if (h && (h.s || []).includes(id)) return 'your ' + (p.sx === 'M' ? 'husband' : p.sx === 'F' ? 'wife' : 'spouse');
  for (const s of p.s || []) { const q = byId.get(s); const r2 = q && blood(byId, home, s); if (r2 && !(r2.a === 0 && r2.b === 0)) return 'the ' + (p.sx === 'M' ? 'husband' : p.sx === 'F' ? 'wife' : 'spouse') + ' of your ' + words(r2, q.sx); }
  for (const s of (h && h.s) || []) { const r3 = blood(byId, s, id); if (r3) return r3.a === 0 && r3.b === 0 ? '' : 'your spouse’s ' + words(r3, p.sx); }
  return '';
}
