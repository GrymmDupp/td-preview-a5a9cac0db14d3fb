import { html, plural, ago, fmtDate } from '../util.js';
import { listingCard, gradeBadge, unlockPrice, standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice } from '../components.js';
import { LAYERS, PRICE_BANDS, STATES, layerInfo } from '../taxonomy.js';

const PER = 10;

export function sidebar(ctx) {
  const L = ctx.feed.listings;
  const states = [...new Set(L.map((l) => l.state).filter(Boolean))].sort();
  const layers = [...new Set([...Object.keys(LAYERS), ...L.map((l) => l.layer)])];
  const count = (f) => L.filter(f).length;
  return html`<aside class="sidebar">
  <section class="box"><h4>Search the archive</h4>
    <form class="search" data-search><input name="q" type="search" placeholder="Name, town, ZIP, story…" aria-label="Search"><button>Search</button></form></section>
  <section class="box"><h4>Browse by state</h4>
    <select data-goto-state aria-label="Browse by state"><option value="">Choose a state…</option>
    ${states.map((s) => html`<option value="${s}">${STATES[s] || s} (${count((l) => l.state === s)})</option>`)}</select>
    <a class="small" href="#/map">or explore the map →</a></section>
  <section class="box how"><h4>How files work</h4><ul class="small"><li><b>Free preview</b> on every listing: facts, a short summary, a lore teaser, sample photos and the original listing link.</li><li><b>Full file</b>: ${standardPrice()} one time per listing, yours permanently on every device.</li><li><b>Members unlock for less</b> (optional): Monthly ${monthlyPrice()}/mo, unlocks ${monthlyUnlockPrice()}; Lifetime ${lifetimePrice()} one time, unlocks ${lifetimeUnlockPrice()}.</li></ul><a class="small" href="#/about">More about the archive →</a></section>
  <section class="box"><h4>Categories</h4><ul class="cats">
    <li class="cat-tier"><a href="#/browse?tier=1">Triple-D <span>${count((l) => l.tier === 1)}</span></a></li>
    ${layers.map((k) => { const n = count((l) => l.layer === k); const i = layerInfo(k); return html`<li class="${n ? '' : 'empty'}"><a href="#/browse?layer=${k}" style="--c:${i.color}"><span class="dot"></span>${i.label} <span>${n || 'soon'}</span></a></li>`; })}
    <li class="cat-tier"><a href="#/browse?tier=2">Strong Story <span>${count((l) => l.tier === 2) || 'new tier'}</span></a></li></ul></section>
  <section class="box"><h4>By price</h4><ul class="cats">${PRICE_BANDS.map((b) => html`<li><a href="#/browse?price=${b.key}">${b.label}</a></li>`)}</ul></section>
  <section class="box"><h4>Community</h4><p class="small">Comment on any listing, or talk research on the one general board.</p><a class="small" href="#/board">Community board →</a></section>
  <section class="box cta"><h4>Know a listing with a past?</h4><p>Found a house for sale with a documented dark history or a strong story? Send the link.</p><a class="btn sm" href="#/suggest">Suggest a property</a></section>
  <section class="box rules-mini"><h4>House rules</h4><ul><li>Public records and first-hand stories only</li><li>No doxxing of living private people</li><li>Never trespass or bother occupants</li></ul><a class="small" href="#/rules">Community rules →</a></section>
</aside>`;
}

export async function home(ctx, q) {
  const page = Math.max(1, +q.get('page') || 1);
  const L = ctx.feed.listings;
  const slice = L.slice((page - 1) * PER, page * PER);
  const pages = Math.ceil(L.length / PER);
  const t1 = L.filter((l) => l.tier === 1).length;
  return html`
  ${page === 1 ? html`<section class="hero">
    <div><h1>Houses for sale <em>with a past</em></h1>
    <p>${plural(L.length, 'buyable property', 'buyable properties')} across ${new Set(L.map((l) => l.state)).size} states, each with a sourced dark history or a strong story. Read the free preview, unlock the full file, add what you know.</p>
    <div class="hero-stats"><span><b>${t1}</b> Triple-D</span><span>${L.length - t1 ? html`<b>${L.length - t1}</b> Strong Story` : html`<b>Strong Story</b> tier opening soon`}</span><span>Full file <b>${unlockPrice(ctx)}</b> one time</span><span>Feed v${ctx.feed.meta.version} · ${fmtDate(ctx.feed.meta.generated_at)}</span></div></div>
  </section>` : ''}
  <div class="with-side"><div class="feed">
    <div class="feed-head"><h2>${page === 1 ? 'Latest listings' : `Listings · page ${page}`}</h2><span class="muted">Triple-D first, then strongest stories</span></div>
    ${slice.map((l) => listingCard(l, ctx))}
    <nav class="pager">${page > 1 ? html`<a class="btn ghost" href="#/?page=${page - 1}">← Newer</a>` : html`<span></span>`}
      <span class="muted">Page ${page} of ${pages}</span>
      ${page < pages ? html`<a class="btn ghost" href="#/?page=${page + 1}">Older listings →</a>` : html`<span></span>`}</nav>
  </div>${sidebar(ctx)}</div>`;
}
