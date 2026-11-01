// Heritage Homes (#/heritage): a SEPARATE collection of houses held by one family for a century or more.
// Never mixed into core counts, "New this week", the core browse default, the map or Dossier Packs.
// Listings come from ctx.feed.heritage (feed/heritage.json + core listings that also qualify, shown with
// an "Also a Twisted Deed / Strong Story" cross-link). Empty collection -> an honest empty state.
import { html, plural } from '../util.js';
import { listingCard, heritageBadge, coreCrossLink } from '../components.js';
import { HERITAGE_TIERS, STRUCTURE_TYPES, STATES } from '../taxonomy.js';

const TIER_ORDER = ['bicentennial', 'sesquicentennial', 'century'];

function tierLegend(counts) {
  return html`<ul class="heritage-tiers" aria-label="Heritage tiers">${TIER_ORDER.map((k) => { const t = HERITAGE_TIERS[k];
    return html`<li>${heritageBadge({ tier: k, years: t.min }, true)}<span class="ht-long">${t.long}${counts[k] ? html` · <b>${counts[k]}</b> on file` : ''}</span></li>`; })}</ul>`;
}

function heritageRow(l, ctx) {
  const h = l.heritage;
  return html`<div class="heritage-item">
    <div class="heritage-tenure">${heritageBadge(h, true)}
      <span class="small muted">${h.family ? html`The ${h.family} family · ` : ''}${h.since ? `since ${h.since}` : `${h.years} years`} · ${STRUCTURE_TYPES[h.structureType] || 'Residence'}${h.sourceCount ? ` · chain traced in ${plural(h.sourceCount, 'public source')}` : ''}</span>
      ${coreCrossLink(l)}</div>
    ${listingCard(l, ctx)}</div>`;
}

export async function heritage(ctx, q) {
  const all = ctx.feed.heritage || [];
  const tier = HERITAGE_TIERS[q.get('tier')] ? q.get('tier') : '';
  const L = tier ? all.filter((l) => l.heritage?.tier === tier) : all;
  const counts = {}; for (const l of all) counts[l.heritage.tier] = (counts[l.heritage.tier] || 0) + 1;
  const states = [...new Set(all.map((l) => l.state).filter(Boolean))].sort();
  return html`<section class="hero heritage-hero">
    <div><p class="heritage-kicker">A separate collection</p>
    <h1>Heritage <em>Homes</em></h1>
    <div class="hero-intro">
      <p>Some houses are haunted by what happened in them. These are haunted by who never left.</p>
      <p>Every house in this wing has passed from hand to hand inside one family, by blood, by marriage or by direct legal succession, for <b>a hundred years or more</b>. The same name in the deed books, generation after generation, until it reads less like a chain of title and more like a family tree written in ink and probate.</p>
      <p>The house must still stand much as it was built, in its original form and materials, and still be lived in (or ready to be). Every chain is traced through public records: county deeds, probate files, historical societies and old newspapers. Each one is backed by at least two public sources. And every house here is for sale today, which means a century-long story is about to close.</p>
    </div>
    <div class="hero-stats"><span><b>${all.length}</b> ${all.length === 1 ? 'Heritage Home' : 'Heritage Homes'} on file</span><span>Kept apart from the Twisted Deeds and Strong Stories lists</span></div></div>
  </section>
  <div class="page-head heritage-head"><h2>The three tiers of tenure</h2>${tierLegend(counts)}
    ${all.length ? html`<p class="small heritage-filter">Show: <a class="${tier ? '' : 'on'}" href="#/heritage">All</a>${TIER_ORDER.filter((k) => counts[k]).map((k) => html` · <a class="${tier === k ? 'on' : ''}" href="#/heritage?tier=${k}">${HERITAGE_TIERS[k].label}</a>`)}${states.length ? html` <span class="muted">· ${states.map((s) => STATES[s] || s).join(', ')}</span>` : ''}</p>` : ''}</div>
  ${L.length ? html`<div class="heritage-list">${L.map((l) => heritageRow(l, ctx))}</div>`
    : html`<div class="empty-state heritage-empty"><span class="orn" aria-hidden="true">❦</span>
      <h2>The first heritage files are being traced through the deed books</h2>
      <p>No Heritage Home is published yet. A house is added only after its ownership chain has been followed, page by page, through the county records and confirmed by at least two public sources, and only while it is actually for sale.</p>
      <p class="small">Until then, the <a href="#/">Twisted Deeds and Strong Stories</a> are open. Know a house that has stayed in one family for a century and is for sale now? <a href="#/suggest">Send the listing link</a>.</p></div>`}
  <p class="small muted heritage-foot">Heritage Homes are researched from public records only. We never contact owners or sellers, and we name a family only as it already appears in the public record.</p>`;
}
