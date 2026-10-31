// Sold & Off market archive: listings that are no longer for-sale leads (Sold, Off market,
// Stale/unverified, any non Active/Pending status). Previews and unlocks keep working, but
// nothing here is presented as for sale: each row shows its status tag and last-known price/date.
import { html, plural, fmtDate } from '../util.js';
import { statusPill, gradeBadge } from '../components.js';
import { sortListings } from '../feed.js';

export async function archive(ctx) {
  const A = sortListings(ctx.feed.archive, 'name');
  const by = {}; for (const l of A) (by[l.status] ||= []).push(l);
  return html`<div class="page-head"><h1>Sold & Off market archive</h1>
    <p class="muted">${plural(A.length, 'property', 'properties')} that are <b>no longer for sale</b>: sold, taken off the market, or not confirmed on a recent check. They stay here for their stories. Prices are the last known asking price, not offers.</p>
    <p class="small"><a href="#/browse">← Back to properties for sale</a> · <a href="#/browse?status=archive">Filter the archive</a></p></div>
  ${A.length ? html`<div class="archive-list">${A.map((l) => html`<article class="arch-row">
      <div class="arch-main"><div class="card-badges">${gradeBadge(l)} ${statusPill(l)}</div>
        <h3><a href="#/l/${encodeURIComponent(l.id)}">${l.name}</a></h3><div class="muted small">${l.place}</div></div>
      <div class="arch-price"><span class="small muted">Last known price</span><b>${l.price || 'not listed'}</b>
        <span class="small muted">${l.statusChangedAt ? html`${l.status} since ${fmtDate(l.statusChangedAt)} · ` : ''}checked ${fmtDate(l.lastChecked) || 'n/a'}</span>
        <span class="no-sale small">No longer for sale</span></div>
    </article>`)}</div>` : html`<div class="empty-state"><p>Nothing in the archive right now.</p></div>`}`;
}
