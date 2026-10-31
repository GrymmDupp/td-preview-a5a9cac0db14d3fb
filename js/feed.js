// Loads the public listings feed and normalizes each listing. Tolerant by design:
// missing fields get defaults, unknown grades/layers/statuses get neutral labels,
// unknown keys are kept on the object and otherwise ignored.
import { CONFIG } from './config.js';
import { gradeInfo, layerInfo, GRADES, LAYERS } from './taxonomy.js';

const SEEN_KEY = 'td-feed-seen-v1';     // last price/status this browser saw, per listing
const EVENTS_KEY = 'td-feed-events-v1'; // detected changes (price, status, new)

export const feed = { meta: null, listings: [], byId: new Map(), source: '', events: [], fullLocal: new Map() };

// ---- access split: FREE PREVIEW vs FULL FILE
// Feed schema v3 (2026-10-30) is preview-only: summary, loreTeaser, basic facts and
// cleared sample images. Full files never come from the public feed:
//  - Supabase mode: from the RLS-gated listing_full table (backend/supabase.js).
//  - Local preview mode: from data/listings_full.local.json, a private copy of
//    _build/listings_full.json that is git-ignored and only fetched when the site
//    runs on localhost (see loadFullLocal below). Never deploy that file.
// splitAccess() below is kept only for older v2 feeds/snapshots that still carry
// full text: it derives the preview and strips the full text off the listing.
export function sentences(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim(); if (!t) return [];
  return t.split(/(?<!\b(?:v|Sr|Jr|Dr|St|Mr|Mrs|Mt|Co|No|U\.S|[A-Z]))(?<=[.!?])\s+(?=[A-Z"“(])/);
}
const cut = (t, n) => { t = String(t || '').trim(); return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:–-]+$/, '') + '…'; };
const LORE_RE = /ghost|haunt|legend|lore|spirit|apparition|said to|reported|rumou?r|curse|myth|tale|claim/i;
const FULL_KEYS = ['hook', 'story', 'history', 'citation', 'citations', 'notes', 'photo', 'sources', 'links', 'timeline', 'ownershipChain', 'storyFields', 'dossier_md'];
const FULL_EXTRA = ['sources', 'links', 'architecturalNotes', 'vacancyYears', 'folkloreType', 'failureReason', 'ownershipChainSummary', 'significanceNote', 'masterSheet'];
const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname);

// One listing_full row (DB shape, also the shape of listings_full.json) -> the
// shape the full-file view renders. Shared by both backends.
export function fullFromRow(row, listing) {
  const sf = row.story_fields || {};
  return {
    story: row.story || '', history: row.history || '', citation: row.citations || '',
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    lore: String(row.lore || '').split('\n').map((x) => x.trim()).filter(Boolean),
    ownershipChain: row.ownership_chain || '',
    storyFields: { architecturalNotes: sf.architectural_notes, vacancyYears: sf.vacancy_years, failureReason: sf.failure_reason, significanceNote: sf.significance },
    sources: Array.isArray(row.sources) ? row.sources : [], references: [],
    dossier: row.dossier_md || !!listing?.dossier,
  };
}

function splitAccess(l) {
  const hookS = sentences(l.hook), storyS = sentences(l.story);
  const summary = cut(hookS[0] || storyS[0] || '', 240);
  let teaser = '';
  if (l.extra.folkloreType) teaser = 'Lore: ' + cut(l.extra.folkloreType, 160);
  else teaser = cut(storyS.find((s) => LORE_RE.test(s)) || (l.tier === 2 ? hookS[1] : '') || storyS.find((s) => !summary.startsWith(s.slice(0, 30))) || '', 160);
  const full = {
    story: [l.hook, l.story].filter(Boolean).join('\n\n'), history: l.history || '', citation: l.citation || '',
    lore: [l.extra.folkloreType, ...[...hookS, ...storyS].filter((s) => LORE_RE.test(s))].filter(Boolean),
    storyFields: { architecturalNotes: l.extra.architecturalNotes, vacancyYears: l.extra.vacancyYears, failureReason: l.extra.failureReason, significanceNote: l.extra.significanceNote },
    ownershipChain: l.extra.ownershipChainSummary || '',
    sources: [...(l.extra.sources || []), ...(l.extra.links || [])], references: l.images.filter((i) => i.rights === 'reference'),
    dossier: !!l.dossier,
  };
  full.timeline = [...new Set([...hookS, ...storyS, ...sentences(l.history), ...sentences(full.ownershipChain)])]
    .map((s) => ({ year: +(s.match(/\b(1[6-9]\d\d|20[0-2]\d)\b/) || [])[1], text: s })).filter((x) => x.year).sort((a, b) => a.year - b.year).slice(0, 14);
  for (const k of FULL_KEYS) delete l[k];
  for (const k of FULL_EXTRA) delete l.extra[k];
  l.images = l.images.filter((i) => i.rights !== 'reference');   // broker/press photo pages are sources, not preview photos
  l.preview = { summary, teaser };
  return full;
}

export function parsePrice(text) {
  const t = String(text || '');
  const m = t.match(/\$\s*([\d,.]+)\s*(m|million|k)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(n)) return null;
  const u = (m[2] || '').toLowerCase();
  if (u === 'm' || u === 'million') n *= 1e6; else if (u === 'k') n *= 1e3;
  return Math.round(n);
}

function deriveTier(l) {
  const t = Number(l.tier);
  if (t === 1 || t === 2) return t;
  if (GRADES[l.grade]) return GRADES[l.grade].tier;
  if (l.grade == null && LAYERS[l.layer]) return LAYERS[l.layer].tier;
  return 2; // unknown grade: neutral, never outranks tier 1 (Twisted Deed)
}

export function normalize(raw) {
  const l = { ...raw };
  l.id = String(l.id || '').trim();
  l.name = l.name || 'Untitled property';
  l.place = l.place || '';
  const st = (l.place.match(/,\s*([A-Z]{2})\s*$/) || [])[1] || '';
  l.state = st;
  l.city = l.place.split(',')[0]?.trim() || '';
  l.tier = deriveTier(l);
  l.gradeI = l.tier === 2 && !GRADES[l.grade] ? { ...gradeInfo('story'), label: 'Story' } : gradeInfo(l.grade);
  l.layerI = layerInfo(l.layer || 'record');
  l.priceNum = parsePrice(l.price);
  l.auction = /bid|auction|opening/i.test(l.price || '');
  l.status = l.status || 'Active';
  l.images = Array.isArray(l.images) ? l.images.filter((i) => i && typeof i === 'object') : [];
  l.extra = l.extra && typeof l.extra === 'object' ? l.extra : {};
  l.priority = Number.isFinite(+l.priority) ? +l.priority : 50;
  l.lat = Number.isFinite(+l.lat) && l.lat !== null && l.lat !== '' ? +l.lat : null;
  l.lon = Number.isFinite(+l.lon) && l.lon !== null && l.lon !== '' ? +l.lon : null;
  const yr = String(l.facts || '').match(/built\s*(?:c\.\s*)?(\d{4})/i) || String(l.name).match(/\b(1[6-9]\d\d)\b/);
  l.year = yr ? +yr[1] : null;
  l.storyCategory = l.storyCategory || l.extra.storyCategory || '';
  // addedAt = first date this id appeared in the published feed (feed-repo/baseline/added_at.json).
  // Older feeds/snapshots without it fall back to 'logged' (Master Sheet date logged).
  l.addedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.addedAt || '')) ? raw.addedAt : (/^\d{4}-\d{2}-\d{2}$/.test(String(l.logged || '')) ? l.logged : '');
  l.hasStoryFields = !!(l.extra.architecturalNotes || l.extra.ownershipChainSummary || l.extra.folkloreType);
  if ('summary' in raw || 'loreTeaser' in raw) {            // schema v3: preview only
    l.preview = { summary: String(l.summary || ''), teaser: String(l.loreTeaser || '') };
    for (const k of FULL_KEYS) delete l[k];                  // defensive: never keep locked text on the listing
    for (const k of FULL_EXTRA) delete l.extra[k];
  } else {                                                   // legacy v2 feed/snapshot
    const full = splitAccess(l);
    if (CONFIG.backend !== 'supabase' && isLocalHost()) feed.fullLocal.set(l.id, full);
  }
  delete l.summary; delete l.loreTeaser;
  l.blurb = l.preview.summary;
  return l;
}

// Tier 1 (Twisted Deed) first, always. Then the chosen key.
export function sortListings(list, key = 'featured') {
  const cmp = {
    featured: (a, b) => b.priority - a.priority,
    newest: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || b.priority - a.priority,
    priceAsc: (a, b) => (a.priceNum ?? 9e12) - (b.priceNum ?? 9e12),
    priceDesc: (a, b) => (b.priceNum ?? -1) - (a.priceNum ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  }[key] || ((a, b) => b.priority - a.priority);
  const statusRank = (s) => (s === 'Active' ? 0 : s === 'Pending' ? 1 : 2);
  return [...list].sort((a, b) => a.tier - b.tier || statusRank(a.status) - statusRank(b.status) || cmp(a, b));
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function loadFeed() {
  let data, source = 'live';
  try { data = await fetchJson(CONFIG.feedUrl); }
  catch (e) {
    console.warn('Live feed unavailable, using bundled snapshot', e);
    data = await fetchJson(CONFIG.feedFallback); source = 'snapshot';
  }
  const listings = (Array.isArray(data?.listings) ? data.listings : [])
    .map(normalize).filter((l) => l.id);
  feed.meta = { version: data.version, schema_version: data.schema_version, generated_at: data.generated_at, count: listings.length, geo_attribution: data.geo_attribution, scouting: cleanScouting(data.scouting) };
  feed.listings = sortListings(listings);
  feed.byId = new Map(listings.map((l) => [l.id, l]));
  feed.source = source;
  if (CONFIG.backend !== 'supabase') await loadFullLocal();
  detectChanges();
  return feed;
}

// Local preview only: full files from the private, git-ignored local copy. Only
// fetched on localhost, so a stray deploy of the site folder cannot serve them
// through this code path (and the file must not be deployed at all).
async function loadFullLocal() {
  if (!isLocalHost() || !CONFIG.fullLocalUrl) return;
  try {
    const data = await fetchJson(CONFIG.fullLocalUrl);
    for (const row of data.files || []) {
      const l = feed.byId.get(row.listing_id); if (!l) continue;
      const f = fullFromRow(row, l);
      feed.fullLocal.set(l.id, f);
      l.hasStoryFields = !!(f.ownershipChain || Object.values(f.storyFields).some(Boolean));
    }
  } catch (e) { console.info('No local full files (data/listings_full.local.json); unlocked files will show as unavailable.', e.message); }
}

// Compare the feed against what this browser saw last time. Produces events for
// (no longer shown on the site; follows and the activity stream were removed). (In Supabase mode the same events should
// be produced server-side; not built.)
function detectChanges() {
  let seen = null, events = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch {}
  const now = new Date().toISOString();
  if (seen && seen.listings) {
    for (const l of feed.listings) {
      const s = seen.listings[l.id];
      if (!s) { events.push({ id: `new:${l.id}:${feed.meta.version}`, type: 'new', listing_id: l.id, at: now, detected: true }); continue; }
      if (s.price !== l.price) {
        const drop = l.priceNum != null && s.priceNum != null && l.priceNum < s.priceNum;
        events.push({ id: `price:${l.id}:${l.price}`, type: drop ? 'price-drop' : 'price', listing_id: l.id, from: s.price, to: l.price, at: now, detected: true });
      }
      if (s.status !== l.status) events.push({ id: `status:${l.id}:${l.status}`, type: 'status', listing_id: l.id, from: s.status, to: l.status, at: now, detected: true });
    }
  }
  const map = {};
  for (const l of feed.listings) map[l.id] = { price: l.price, priceNum: l.priceNum, status: l.status };
  const uniq = [...new Map(events.map((e) => [e.id, e])).values()].slice(-300);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ version: feed.meta.version, at: now, listings: map }));
    localStorage.setItem(EVENTS_KEY, JSON.stringify(uniq));
  } catch {}
  feed.events = uniq;
}

// Preview helper: pretend the next feed changed a listing, so Grymm can see what
// a follower notification looks like. Writes only this browser's preview events.
export function simulateFeedChange(listingId) {
  const l = feed.byId.get(listingId); if (!l) return;
  const to = l.priceNum ? '$' + Math.round(l.priceNum * 0.92).toLocaleString('en-US') : l.price;
  const ev = { id: `sim:${l.id}:${Date.now()}`, type: 'price-drop', listing_id: l.id, from: l.price, to, at: new Date().toISOString(), simulated: true };
  feed.events.push(ev);
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(feed.events)); } catch {}
  return ev;
}

// ---- "New this week": listings first added to the feed in the last CONFIG.newDays days
// (today counts as day 0, so 7 = today and the six days before it). Content, not users.
const localDay = (d = new Date()) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
export function daysSince(ymd, now = new Date()) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return Infinity;
  return Math.round((localDay(now) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 864e5);
}
export const isNew = (l, now = new Date()) => { const d = daysSince(l.addedAt, now); return d >= 0 && d < CONFIG.newDays; };
export const newThisWeek = (list, now = new Date()) => sortListings(list.filter((l) => isNew(l, now)), 'newest');

// Scouting focus from the feed envelope: { focus: ['MI','OH'], label, since }. Optional.
function cleanScouting(s) {
  if (!s || typeof s !== 'object') return null;
  const focus = (Array.isArray(s.focus) ? s.focus : []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
  if (!focus.length) return null;
  return { focus, label: String(s.label || focus.join(' & ')).slice(0, 80), since: /^\d{4}-\d{2}-\d{2}$/.test(String(s.since || '')) ? s.since : '' };
}

// ---- "Recently updated": listings with community submissions APPROVED in the last
// CONFIG.newDays days. Only the fact and the kinds are used (never submission content), so
// preview viewers see "New community photos added", not what's in the locked file.
// updates: [{ listing_id, kinds: ['photo', ...], last_approved_at }] from backend.recentUpdates().
export function updatesMap(updates = [], now = new Date()) {
  const m = new Map();
  for (const u of updates || []) {
    if (!u?.listing_id || !feed.byId.has(u.listing_id)) continue;
    const t = new Date(u.last_approved_at); if (isNaN(t)) continue;
    const d = Math.round((localDay(now) - localDay(t)) / 864e5);
    if (!(d >= 0 && d < CONFIG.newDays)) continue;
    m.set(u.listing_id, { at: u.last_approved_at, kinds: [...new Set(u.kinds || [])] });
  }
  return m;
}
const KIND_PHRASE = { photo: 'community photos', lore: 'community lore', info: 'community research', link: 'community links' };
export const updateLine = (u) => {
  if (!u) return '';
  const k = u.kinds.filter((x) => KIND_PHRASE[x]);
  if (!k.length) return 'New community additions';
  const parts = k.map((x) => KIND_PHRASE[x].replace('community ', ''));
  return 'New community ' + (parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1)) + ' added';
};
export const displayableImages = (l) => l.images.filter((i) => CONFIG.displayableRights.includes(i.rights) && /^https?:/.test(i.src || i.url || ''));
