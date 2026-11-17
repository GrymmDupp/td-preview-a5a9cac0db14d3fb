// The Archive (2026-11-16): a second shelf for places with a verified dark history that are NOT for sale
// (haunted-TV leads, sold listings that moved here). For-sale houses stay the headline ("For sale now" seal).
// Below the shelf: "Once for sale", the older Sold & Off market list (former listings that were never moved to the shelf).
// Nothing is ever invented: with no records the shelf shows its locked glass case.
import { html, raw, plural, fmtDate } from '../util.js';
import { statusPill, gradeBadge, listingCard, shelfTabs } from '../components.js';
import { sortListings, sortShelf } from '../feed.js';
import { STATES } from '../taxonomy.js';
import { web } from '../reveals.js';

// The locked glass museum case. Pure CSS + inline SVG; the padlock rattles when tapped (see app.js, data-caselock).
export const glassCase = () => html`<section class="glass-case" aria-labelledby="gc-h">
  <div class="gc-cabinet" aria-hidden="false">
    <div class="gc-cornice"><span>The Archive</span></div>
    <div class="gc-glass-wrap">
      <div class="gc-inside" aria-hidden="true">
        <i class="gc-lamp"></i>
        ${[0, 1, 2].map(() => html`<div class="gc-row"><span class="gc-vel"></span><span class="gc-brass"></span></div>`)}
        ${raw(web('tr', 'gc-web'))}
      </div>
      <div class="gc-sheen" aria-hidden="true"></div>
      <button type="button" class="gc-lock" data-caselock aria-label="The case is locked. Try the lock.">
        <svg viewBox="0 0 48 60" width="42" height="52" aria-hidden="true"><path d="M13 26V18a11 11 0 0 1 22 0v8" fill="none" stroke="#b7ab8e" stroke-width="4.5" stroke-linecap="round"/>
          <rect x="6" y="26" width="36" height="28" rx="4" fill="#6f5a2c"/><rect x="6" y="26" width="36" height="28" rx="4" fill="url(#gc-brass)" opacity=".9"/>
          <circle cx="24" cy="38" r="4.2" fill="#1b1306"/><rect x="22.4" y="39" width="3.2" height="9" rx="1.2" fill="#1b1306"/></svg></button>
    </div>
    <div class="gc-base" aria-hidden="true"></div>
  </div>
  <div class="gc-words">
    <h2 id="gc-h">The Archive is being catalogued</h2>
    <p>Behind this glass will stand the places with a verified dark history that are <b>not for sale</b>: locations from haunted television, houses that have sold, forgotten institutions. Each one is checked against written sources and public records before it is shelved, so the case stays empty until they are.</p>
    <p class="gc-links"><a class="btn" href="#/browse">See houses for sale now</a> <a class="btn ghost" href="#/suggest">Suggest a place</a></p>
  </div>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="gc-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c779"/><stop offset=".5" stop-color="#9c7d33"/><stop offset="1" stop-color="#5b4519"/></linearGradient></defs></svg>
</section>`;

// "Once for sale": former listings that sold or left the market and were not moved to the shelf.
function onceForSale(ctx) {
  const A = sortListings(ctx.feed.archive, 'name');
  return html`<section class="once-sale" id="sold" aria-labelledby="os-h"><h2 id="os-h">Once for sale</h2>
    <p class="muted">${A.length ? `${plural(A.length, 'property', 'properties')} that are` : 'Properties that are'} <b>no longer for sale</b>: sold, taken off the market, or not confirmed on a recent check. They are kept for their stories and have not been moved onto the shelf above. Prices are the last known asking price, not offers.</p>
    ${A.length ? html`<div class="archive-list">${A.map((l) => html`<article class="arch-row">
      <div class="arch-main"><div class="card-badges">${gradeBadge(l)} ${statusPill(l)}</div>
        <h3><a href="#/l/${encodeURIComponent(l.id)}">${l.name}</a></h3><div class="muted small">${l.place}</div></div>
      <div class="arch-price"><span class="small muted">Last known price</span><b>${l.price || 'not listed'}</b>
        <span class="small muted">${l.statusChangedAt ? html`${l.status} since ${fmtDate(l.statusChangedAt)} · ` : ''}checked ${fmtDate(l.lastChecked) || 'n/a'}</span>
        <span class="no-sale small">No longer for sale</span></div>
    </article>`)}</div>` : html`<div class="empty-state"><p>Nothing here right now.</p></div>`}
  </section>`;
}

export async function archive(ctx, q) {
  const S = ctx.feed.theArchive || [];
  const st = (q.get('state') || '').toUpperCase(), show = q.get('show') || '', crew = q.get('crew') === '1';
  const states = [...new Set(S.map((l) => l.state).filter(Boolean))].sort();
  const shows = [...new Set(S.flatMap((l) => (l.media || []).map((m) => m.show)))].sort();
  const list = sortShelf(S.filter((l) => (!st || l.state === st) && (!show || l.media.some((m) => m.show === show)) && (!crew || l.crewFeatured)));
  const href = (o) => '#/archive?' + new URLSearchParams(Object.entries({ state: st, show, crew: crew ? '1' : '', ...o }).filter(([, v]) => v));
  const chip = (label, on, to) => html`<a class="chip ${on ? 'on' : ''}" href="${to}" aria-pressed="${on ? 'true' : 'false'}">${label}</a>`;
  return html`<div class="page-head archive-head"><h1>The Archive</h1>
    <p class="muted">Places with a verified dark history that are <b>not for sale</b>. The houses on the market now stay on the main shelf, marked with a <b>For sale now</b> seal; this shelf holds the rest of the story.</p></div>
  ${shelfTabs(ctx, 'archive')}
  ${S.length ? html`<section class="arch-shelf" id="catalogued" aria-label="Places in the Archive">
      ${(states.length > 1 || shows.length || S.some((l) => l.crewFeatured)) ? html`<div class="chips-row arch-filters" role="group" aria-label="Filter the Archive">
        ${chip('All', !st && !show && !crew, '#/archive')}
        ${states.length > 1 ? states.map((s) => chip(STATES[s] || s, st === s, href({ state: st === s ? '' : s }))) : ''}
        ${shows.map((x) => chip(x, show === x, href({ show: show === x ? '' : x })))}
        ${S.some((l) => l.crewFeatured) ? chip('✦ With the Twisted History crew', crew, href({ crew: crew ? '' : '1' })) : ''}</div>` : ''}
      <p class="result-bar"><strong>${plural(list.length, 'place')}</strong> <span class="muted small">in the Archive${list.length !== S.length ? ` (of ${S.length})` : ''}</span> <a class="small" href="#/map?shelf=archive">Show them on the map →</a></p>
      <div class="arch-cabinet"><div class="grid">${list.map((l) => listingCard(l, { ...ctx, compact: false }))}</div></div>
      ${list.length ? '' : html`<div class="empty-state"><p>Nothing in the Archive matches. <a href="#/archive">See all of it</a>.</p></div>`}
    </section>` : glassCase()}
  ${onceForSale(ctx)}`;
}
