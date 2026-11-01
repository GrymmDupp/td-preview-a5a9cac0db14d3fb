import { html, plural, ago, fmtDate, safeUrl } from '../util.js';
import { listingCard, gradeBadge, unlockPrice, standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice, membershipsOn, trialNote, soonChip, isTrial } from '../components.js';
import { LAYERS, PRICE_BANDS, STATES, layerInfo } from '../taxonomy.js';
import { newThisWeek } from '../feed.js';
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
  <section class="box how"><h4>How files work</h4><ul class="small"><li><b>Free preview</b> on every listing: facts, a short summary, a lore teaser, sample photos and the original listing link.</li><li><b>Full file</b>: ${standardPrice()}${trialNote()} one time per listing, yours permanently on every device. Use “Unlock full file” on any listing.</li>${membershipsOn() ? html`<li><b>Members unlock for less</b> (optional): Monthly ${monthlyPrice()}/mo, unlocks ${monthlyUnlockPrice()}; Lifetime ${lifetimePrice()} one time, unlocks ${lifetimeUnlockPrice()}.</li>` : html`<li><b>Memberships</b> (Monthly and Lifetime): ${soonChip()}</li>`}</ul><a class="small" href="#/about">More about the archive →</a></section>
  <section class="box"><h4>Categories</h4><ul class="cats">
    <li class="cat-tier"><a href="#/browse?tier=1">Twisted Deeds <span>${count((l) => l.tier === 1)}</span></a></li>
    ${layers.map((k) => { const n = count((l) => l.layer === k); const i = layerInfo(k); return html`<li class="${n ? '' : 'empty'}"><a href="#/browse?layer=${k}" style="--c:${i.color}"><span class="dot"></span>${i.label} <span>${n || 'soon'}</span></a></li>`; })}
    <li class="cat-tier"><a href="#/browse?tier=2">Strong Story <span>${count((l) => l.tier === 2) || 'new tier'}</span></a></li></ul>
    <p class="small heritage-side"><a href="#/heritage">❦ Heritage Homes</a> <span class="muted">· a separate collection: one family, 100+ years${(ctx.feed.heritage || []).length ? ` (${ctx.feed.heritage.length})` : ''}</span></p></section>
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

// Home teaser for the themed dossier packs (#/packs). Coming soon: no purchase button.
function packsTeaser() {
  return html`<section class="packs-teaser"><div><h2>Dossier Packs ${soonChip()}</h2>
    <p>Themed bundles of full files in one printable PDF: closed institutions, houses with a documented dark past, and a Midwest circuit.</p></div>
    <a class="btn ghost" href="#/packs">See the packs →</a></section>`;
}

export async function home(ctx, q) {
  const page = Math.max(1, +q.get('page') || 1);
  const L = ctx.feed.catalog;   // for-sale catalog only: Active + Pending
  const slice = L.slice((page - 1) * PER, page * PER);
  const pages = Math.ceil(L.length / PER);
  const t1 = L.filter((l) => l.tier === 1).length;
  const act = L.filter((l) => l.status === 'Active');           // hero counts: Active only
  const actT1 = act.filter((l) => l.tier === 1).length, actT2 = act.length - actT1;
  return html`
  ${page === 1 ? html`<section class="hero">
    <div><h1>Some houses <em>remember</em></h1>
    <div class="hero-intro"><p>Come in, and mind the threshold.</p>
    <p>Every door here opens on a real house or building for sale today, its dark history researched and sourced from the public record.</p>
    <p>Read any file's preview free, then unlock the full file when one keeps hold of you.</p></div>
    <div class="hero-stats"><span><b>${actT1}</b> ${actT1 === 1 ? 'Twisted Deed' : 'Twisted Deeds'}</span><span><b>${actT2}</b> ${actT2 === 1 ? 'Strong Story' : 'Strong Stories'} on the market now</span><span>Full files <b>${standardPrice()}</b>${isTrial() ? ' during the trial' : ''}</span></div></div>
  </section>${newThisWeekBlock(ctx)}${sponsorSlots('inline')}${packsTeaser()}` : ''}
  <div class="with-side"><div class="feed">
    <div class="feed-head"><h2>${page === 1 ? 'Latest listings' : `Listings · page ${page}`}</h2><span class="muted">Most twisted first, then strong stories</span></div>
    ${slice.map((l) => listingCard(l, ctx))}
    <nav class="pager">${page > 1 ? html`<a class="btn ghost" href="#/?page=${page - 1}">← Newer</a>` : html`<span></span>`}
      <span class="muted">Page ${page} of ${pages}</span>
      ${page < pages ? html`<a class="btn ghost" href="#/?page=${page + 1}">Older listings →</a>` : html`<span></span>`}</nav>
    ${ctx.feed.archive.length ? html`<p class="small muted archive-line">${plural(ctx.feed.archive.length, 'property', 'properties')} no longer for sale ${ctx.feed.archive.length === 1 ? 'is' : 'are'} kept in the <a href="#/archive">Sold & Off market archive</a>.</p>` : ''}
  </div>${sidebar(ctx)}</div>`;
}

// Ad slots from CONFIG.sponsors (text only, no images). They grow to fill the sidebar's remaining
// height on desktop, so the column ends level with the listings. The home page renders the slots in two
// spots, the sidebar ('side', desktop) and right after New this week ('inline', one-column layouts < 960px);
// CSS shows exactly one (display:none also removes the other from the accessibility tree).
function sponsorSlots(where = 'side') {
  const list = (CONFIG.sponsors || []).filter((x) => x && x.name);
  if (!list.length) return '';
  return html`<div class="sponsors sponsors--${where}" aria-label="Sponsors">${list.map((x) => { const u = x.url ? safeUrl(x.url) : '';
    return html`<section class="box sponsor">${x.sample ? html`<span class="ad-tag">Sample ad</span>` : html`<span class="ad-tag">Sponsor</span>`}
      <div class="sponsor-in"><span class="orn" aria-hidden="true">✦</span>
      <h4>${u ? html`<a href="${u}" rel="sponsored noopener" target="_blank">${x.name}</a>` : x.name}</h4>
      ${x.place ? html`<p class="sp-place">${x.place}</p>` : ''}${x.line ? html`<p class="sp-line">${x.line}</p>` : ''}
      <span class="orn" aria-hidden="true">✦</span></div></section>`; })}</div>`;
}
