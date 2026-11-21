import { web, nyx } from '../reveals.js';
import { onThisDayLine } from '../world.js';
import { html, raw, plural, ago, fmtDate, safeUrl } from '../util.js';
import { listingCard, shelfTabs, gradeBadge, unlockPrice, standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice, membershipsOn, trialNote, soonChip, isTrial } from '../components.js';
import { LAYERS, PRICE_BANDS, STATES, layerInfo } from '../taxonomy.js';
import { newThisWeek, displayableImages } from '../feed.js';
import { CONFIG } from '../config.js';

const PER = 10;

export function sidebar(ctx) {
  const L = ctx.feed.catalog;
  const states = [...new Set(L.map((l) => l.state).filter(Boolean))].sort();
  const layers = [...new Set([...Object.keys(LAYERS), ...L.map((l) => l.layer)])];
  const count = (f) => L.filter(f).length;
  return html`<aside class="sidebar">
  <section class="box"><h4>Search the archive</h4>
    <form class="search" data-search><input name="q" type="search" placeholder="Name, town, ZIP, story…" aria-label="Search"><button>Search</button></form></section>
  <section class="box"><h4>Browse by state</h4>
    <select data-goto-state aria-label="Browse by state"><option value="">Choose a state…</option>
    ${states.map((s) => html`<option value="${s}">${STATES[s] || s} (${count((l) => l.state === s)})</option>`)}</select>
    <a class="small" href="#/map">or explore the map →</a>
    ${ctx.feed.meta.scouting ? html`<p class="small muted scouting-mini">Currently scouting: <a href="#/browse?state=${ctx.feed.meta.scouting.focus.join(',')}">${ctx.feed.meta.scouting.label}</a></p>` : ''}</section>
  <section class="box how"><h4>How files work</h4><ul class="small"><li><b>Free preview</b> on every listing: facts, a short summary, a lore teaser, sample photos and the original listing link.</li><li><b>Full file</b>: ${standardPrice()}${trialNote()} one time per listing, yours permanently on every device. Use “Unlock full file” on any listing.</li><li><b>Patronage</b>: membership and research files. <a href="#/patronage">See the prices</a>.</li></ul><a class="small" href="#/about">More about the archive →</a></section>
  <section class="box"><h4>Categories</h4><ul class="cats">
    <li class="cat-tier"><a href="#/browse?tier=1">Twisted Deeds <span>${count((l) => l.tier === 1)}</span></a></li>
    ${layers.map((k) => { const n = count((l) => l.layer === k); const i = layerInfo(k); return html`<li class="${n ? '' : 'empty'}"><a href="#/browse?layer=${k}" style="--c:${i.color}"><span class="dot"></span>${i.label} <span>${n || 'soon'}</span></a></li>`; })}
    <li class="cat-tier"><a href="#/browse?tier=2">Strong Story <span>${count((l) => l.tier === 2) || 'new tier'}</span></a></li></ul>
    ${CONFIG.show?.heritage || (ctx.feed.heritage || []).length ? html`<p class="small heritage-side"><a href="#/heritage">❦ Heritage Homes</a> <span class="muted">· a separate collection: one family, 100+ years${(ctx.feed.heritage || []).length ? ` (${ctx.feed.heritage.length})` : ''}</span></p>` : ''}</section>
  <section class="box"><h4>By price</h4><ul class="cats">${PRICE_BANDS.map((b) => html`<li><a href="#/browse?price=${b.key}">${b.label}</a></li>`)}</ul></section>
  <section class="box"><h4>Community</h4><p class="small">Comment on any listing, or talk research on the one general board.</p><a class="small" href="#/board">Community board →</a></section>
  <section class="box cta"><h4>Know a listing with a past?</h4><p>Found a house for sale with a documented dark history or a strong story? Send the link.</p><a class="btn sm" href="#/suggest">Suggest a property</a></section>
  <section class="box rules-mini"><h4>House rules</h4><ul><li>Public records and first-hand stories only</li><li>No doxxing of living private people</li><li>Never trespass or bother occupants</li></ul><a class="small" href="#/rules">Community rules →</a></section>
  ${sponsorSlots('side')}
</aside>`;
}

// "New this week": listings first added to the archive in the last 7 days, plus a quiet line
// for listings whose files gained approved community additions. Nothing new -> one quiet line.
function newThisWeekBlock(ctx) {
  const N = newThisWeek(ctx.feed.catalog), upd = ctx.updates?.size || 0, SHOW = 6;
  if (!N.length && !upd) return html`<p class="new-week-none small muted">Nothing new added in the last ${CONFIG.newDays} days.</p>`;
  return html`<section class="new-week" aria-labelledby="nw-h">
    <div class="feed-head"><h2 id="nw-h">New this week</h2>
      <span class="muted">${N.length ? `${N.length} new this week` : 'No new listings this week'}${upd ? html` · <a href="#/browse?new=updated">Recently updated: ${plural(upd, 'file')} with new community additions</a>` : ''}</span>
      ${N.length ? html`<a class="small see-all" href="#/browse?new=week&sort=newest">See all ${N.length} →</a>` : ''}</div>
    ${N.length ? html`<div class="new-grid">${N.slice(0, SHOW).map((l) => listingCard(l, { ...ctx, compact: true }))}</div>` : ''}
  </section>`;
}

// Home door to the Archive shelf: places with a verified dark history that are not for sale. Honest when empty.
function archiveDoor(ctx) {
  const n = ctx.feed.theArchive?.length || 0;
  return html`<section class="archive-door" aria-labelledby="ad-h">
    <div class="ad-case" aria-hidden="true"><span class="ad-glass"></span><span class="ad-lock">${n ? '' : '🔒'}</span></div>
    <div><h2 id="ad-h">The Archive</h2>
      <p>${n ? `${plural(n, 'place')} with a verified dark history that ${n === 1 ? 'is' : 'are'} not for sale: television locations, houses that have sold, forgotten institutions.` : 'A second shelf for places with a verified dark history that are not for sale: television locations, houses that have sold, forgotten institutions. The case is locked while it is being catalogued.'}</p></div>
    <a class="btn ghost" href="#/archive">${n ? 'Enter the Archive →' : 'Peek at the case →'}</a></section>`;
}

// Home teaser for the themed dossier packs (#/packs). Coming soon: no purchase button.
function packsTeaser() {
  return html`<section class="packs-teaser"><div><h2>Dossier Packs ${soonChip()}</h2>
    <p>Themed bundles of full files in one printable PDF: closed institutions, houses with a documented dark past, and a Midwest circuit.</p></div>
    <a class="btn ghost" href="#/packs">See the packs →</a></section>`;
}

// Home feed mix: a fresh weighted pick each time the app is opened (stable for
// this page load so paging and back-to-home stay put). Lightly prefers photos,
// Twisted Deeds, and higher priority. Avoids IDs shown on the last two visits
// when it can. May slip in one Archive place on page 1. New this week / On this
// day stay in their own honest order.
const SHOWN_KEY = 'td-home-shown-v1';
const VISIT_CAP = 2;
let visitMix = null;   // this page-load's order; not reshuffled on hash changes

function recentShown() {
  try {
    const raw = JSON.parse(localStorage.getItem(SHOWN_KEY) || 'null');
    const visits = Array.isArray(raw?.visits) ? raw.visits : [];
    return visits.slice(0, VISIT_CAP).flatMap((v) => Array.isArray(v?.ids) ? v.ids : []).map(String).filter(Boolean);
  } catch { return []; }
}
function rememberShown(ids) {
  try {
    let prev = null; try { prev = JSON.parse(localStorage.getItem(SHOWN_KEY) || 'null'); } catch {}
    const visits = (Array.isArray(prev?.visits) ? prev.visits : []).filter((v) => Array.isArray(v?.ids));
    visits.unshift({ at: Date.now(), ids: ids.map(String).slice(0, PER) });
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ visits: visits.slice(0, VISIT_CAP) }));
  } catch { /* private mode, quota */ }
}
function cardWeight(l) {
  const photos = displayableImages(l).length;
  let w = 1;
  if (l.tier === 1) w += 0.55;
  if (photos) w += 0.4 + Math.min(0.2, (photos - 1) * 0.05);
  const p = Number(l.priority);
  if (Number.isFinite(p)) w += Math.max(-0.15, Math.min(0.45, (p - 50) / 100));
  if (l.crewFeatured) w += 0.25;
  return Math.max(0.08, w);
}
// Efraimidis–Spirakis weighted shuffle: higher weight surfaces earlier, but every listing can still appear.
function weightedShuffle(list, wfn = cardWeight) {
  return list.map((l) => ({ l, k: Math.pow(Math.random(), 1 / wfn(l)) })).sort((a, b) => b.k - a.k).map((x) => x.l);
}
function homeMix(ctx) {
  const sale = ctx.feed.catalog || [];
  const shelf = ctx.feed.theArchive || [];
  const live = new Map([...sale, ...shelf].map((l) => [l.id, l]));
  if (visitMix) {
    const kept = visitMix.map((l) => live.get(l.id)).filter(Boolean);
    const have = new Set(kept.map((l) => l.id));
    return [...kept, ...sale.filter((l) => !have.has(l.id))];
  }
  const recent = new Set(recentShown());
  const fresh = sale.filter((l) => !recent.has(l.id));
  const seen = sale.filter((l) => recent.has(l.id));
  const need = Math.min(PER, sale.length);
  const page1Sale = [...weightedShuffle(fresh), ...weightedShuffle(seen)].slice(0, need);
  const used = new Set(page1Sale.map((l) => l.id));
  const rest = [...weightedShuffle(fresh.filter((l) => !used.has(l.id))), ...weightedShuffle(seen.filter((l) => !used.has(l.id)))];
  const page1 = page1Sale.slice();
  const archPool = shelf.filter((l) => l.id && !recent.has(l.id) && !used.has(l.id));
  if (page1.length && archPool.length && Math.random() < 0.35) {
    const pick = weightedShuffle(archPool, (l) => cardWeight(l) + (l.media?.length ? 0.3 : 0))[0];
    if (pick) {
      const i = page1.length < 3 ? Math.floor(Math.random() * page1.length) : 1 + Math.floor(Math.random() * (page1.length - 2));
      const displaced = page1[i];
      page1[i] = pick;
      if (displaced) rest.unshift(displaced);
    }
  }
  visitMix = [...page1, ...rest];
  rememberShown(page1.map((l) => l.id));
  return visitMix;
}

export async function home(ctx, q) {
  const page = Math.max(1, +q.get('page') || 1);
  const catalog = ctx.feed.catalog;   // for-sale catalog only: Active + Pending (hero counts, sidebar)
  const L = homeMix(ctx);             // visit-stable mix; Browse keeps featured order
  const slice = L.slice((page - 1) * PER, page * PER);
  const pages = Math.ceil(L.length / PER);
  const t1 = catalog.filter((l) => l.tier === 1).length;
  const act = catalog.filter((l) => l.status === 'Active');     // hero counts: Active only
  const actT1 = act.filter((l) => l.tier === 1).length, actT2 = act.length - actT1;
  return html`
  ${page === 1 ? html`<section class="th-card" aria-label="Twisted Deeds">
    <img class="thc-vine l" src="assets/th/vine-corner.png" alt="" aria-hidden="true"><img class="thc-vine r" src="assets/th/vine-corner.png" alt="" aria-hidden="true">
    <div class="thc-gent" aria-hidden="true"><img src="assets/th/gentleman.webp" alt="" width="372" height="410"></div>
    <div class="thc-nyx">${raw(web('tr', 'thc-web'))}<span class="nyx-home"><i class="silk"></i>${raw(nyx('home', 'nyx-h'))}</span></div>
    <div class="thc-text">
      <div class="thc-td"><img src="assets/logo-shield-96.png" alt="" width="40" height="41"></div>
      <p class="thc-title" role="heading" aria-level="1">Twisted <span class="thc-deeds">Deeds</span></p>
      <div class="thc-tag">where the past has a presence</div>
      <div class="thc-credit">a Twisted History Tours production</div>
    </div>
    <img class="thc-seal" src="assets/th/th-seal.png" alt="Twisted History Tours seal" width="64" height="64">
  </section>${raw(onThisDayLine([...ctx.feed.catalog, ...(ctx.feed.archive || []), ...(ctx.feed.theArchive || [])]))}
  <p class="home-random"><button type="button" class="btn ghost pull-random" data-random title="Pull a book off the shelf at random"><span class="pr-ic" aria-hidden="true"></span>Pulled at random</button></p>` : ''}
  ${page === 1 ? html`<section class="hero">
    <div><h2 class="hero-h">Some houses <em>remember</em></h2>
    <div class="hero-intro"><p>Come in, and mind the threshold.</p>
    <p>Every door here opens on a real house or building for sale today, its dark history researched and sourced from the public record.</p>
    <p>Read any file's preview free, then unlock the full file when one keeps hold of you.</p></div>
    <div class="hero-stats"><span><b>${actT1}</b> ${actT1 === 1 ? 'Twisted Deed' : 'Twisted Deeds'}</span><span><b>${actT2}</b> ${actT2 === 1 ? 'Strong Story' : 'Strong Stories'} on the market now</span><span>Full files <b>${standardPrice()}</b>${isTrial() ? ' at the founder price' : ''}</span></div></div>
  </section>${shelfTabs(ctx, 'sale')}${newThisWeekBlock(ctx)}${archiveDoor(ctx)}${sponsorSlots('inline')}${CONFIG.show?.packs ? packsTeaser() : ''}` : ''}
  <div class="with-side"><div class="feed">
    <div class="feed-head"><h2>${page === 1 ? 'From the collection' : `Listings · page ${page}`}</h2><span class="muted">${page === 1 ? 'A fresh mix each visit' : 'More from the collection'}</span></div>
    ${slice.map((l) => listingCard(l, ctx))}
    <nav class="pager">${page > 1 ? html`<a class="btn ghost" href="#/?page=${page - 1}">← Previous</a>` : html`<span></span>`}
      <span class="muted">Page ${page} of ${pages}</span>
      ${page < pages ? html`<a class="btn ghost" href="#/?page=${page + 1}">More listings →</a>` : html`<span></span>`}</nav>
    ${ctx.feed.archive.length ? html`<p class="small muted archive-line">${plural(ctx.feed.archive.length, 'property', 'properties')} no longer for sale ${ctx.feed.archive.length === 1 ? 'is' : 'are'} kept in the <a href="#/archive?at=sold">Sold & Off market list</a>.</p>` : ''}
  </div>${sidebar(ctx)}</div>`;
}

// Ad slots from CONFIG.sponsors (text only, no images). They grow to fill the sidebar's remaining
// height on desktop, so the column ends level with the listings. The home page renders the slots in two
// spots, the sidebar ('side', desktop) and right after New this week ('inline', one-column layouts < 960px);
// CSS shows exactly one (display:none also removes the other from the accessibility tree).
function sponsorSlots(where = 'side') {
  const list = (CONFIG.sponsors || []).filter((x) => x && x.name && (!x.sample || CONFIG.show?.sampleAds));
  if (!list.length) return '';
  return html`<div class="sponsors sponsors--${where}" aria-label="Sponsors">${list.map((x) => { const u = x.url ? safeUrl(x.url) : '';
    return html`<section class="box sponsor">${x.sample ? html`<span class="ad-tag">Sample ad</span>` : html`<span class="ad-tag">Sponsor</span>`}
      <div class="sponsor-in"><span class="orn" aria-hidden="true">✦</span>
      <h4>${u ? html`<a href="${u}" rel="sponsored noopener" target="_blank">${x.name}</a>` : x.name}</h4>
      ${x.place ? html`<p class="sp-place">${x.place}</p>` : ''}${x.line ? html`<p class="sp-line">${x.line}</p>` : ''}
      <span class="orn" aria-hidden="true">✦</span></div></section>`; })}</div>`;
}
