import { html, plural } from '../util.js';
import { listingCard } from '../components.js';
import { LAYERS, PRICE_BANDS, STATES, STATUSES, layerInfo, statusInfo, kindLabel, ratingLabel } from '../taxonomy.js';
import { sortListings, isNew, feed } from '../feed.js';

const stateList = (s) => String(s || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const stateName = (codes) => codes.map((c) => STATES[c] || c).join(' & ');

// q: URLSearchParams. state may be one code or a comma list (MI,OH: the scouting focus link).
// new=week -> first added in the last 7 days; new=updated -> approved community additions in the last 7 days.
export function applyFilters(L, q, updates) {
  const s = stateList(q.get('state')), added = q.get('new'), layer = q.get('layer'), tier = q.get('tier'), price = q.get('price'), status = q.get('status'), kind = q.get('kind');
  const text = (q.get('q') || '').trim().toLowerCase();
  const band = PRICE_BANDS.find((b) => b.key === price);
  return L.filter((l) => (!s.length || s.includes(l.state)) && (!added || (added === 'week' ? isNew(l) : added === 'updated' ? !!updates?.has?.(l.id) : true)) && (!layer || l.layer === layer) && (!tier || String(l.tier) === tier)
    && (!status || (status === 'open' ? ['Active', 'Pending'].includes(l.status) : l.status === status)) && (!kind || l.kind === kind)
    && (!band || (band.min == null ? (l.priceNum == null || l.auction) : (l.priceNum != null && l.priceNum >= band.min && l.priceNum < band.max)))
    && (!text || [l.name, l.place, l.address, l.preview?.summary, l.preview?.teaser, l.facts, ratingLabel(l)].join(' ').toLowerCase().includes(text)));
}

export async function browse(ctx, q) {
  const L = ctx.feed.listings;
  const list = sortListings(applyFilters(L, q, ctx.updates), q.get('sort') || 'featured');
  const nNew = L.filter((l) => isNew(l)).length, nUpd = ctx.updates?.size || 0;
  const sc = feed.meta.scouting, scN = sc ? L.filter((l) => sc.focus.includes(l.state)).length : 0;
  const curStates = stateList(q.get('state'));
  const scOn = sc && curStates.length === sc.focus.length && sc.focus.every((c) => curStates.includes(c));
  const sel = (name, opts, label) => html`<label class="f"><span>${label}</span><select name="${name}">
    <option value="">All</option>${opts.map(([v, t]) => html`<option value="${v}" ${q.get(name) === String(v) ? 'selected' : ''}>${t}</option>`)}</select></label>`;
  const states = [...new Set(L.map((l) => l.state).filter(Boolean))].sort();
  const layers = [...new Set([...Object.keys(LAYERS), ...L.map((l) => l.layer)])];
  const kinds = [...new Set(L.map((l) => l.kind))];
  const statuses = [...new Set([...Object.keys(STATUSES), ...L.map((l) => l.status)])];
  const active = [...q.entries()].filter(([k, v]) => v && k !== 'sort');
  const stateCounts = states.map((s) => [s, L.filter((l) => l.state === s).length]);
  return html`<div class="page-head"><h1>Browse the archive</h1><p class="muted">Filter by state, category and price. Twisted Deeds always rank first.</p>
    ${sc ? html`<p class="scouting small">Currently scouting: <b>${sc.label}</b> · ${scOn ? html`<span class="muted">showing ${plural(scN, 'listing')}</span> · <a href="#/browse">all states</a>`
      : html`<a href="#/browse?state=${sc.focus.join(',')}">See ${sc.label} (${scN})</a>`}</p>` : ''}</div>
  <form class="filters" data-filters>
    <label class="f grow"><span>Search</span><input name="q" type="search" value="${q.get('q') || ''}" placeholder="Name, town, story…"></label>
    ${sel('state', [...(curStates.length > 1 ? [[curStates.join(','), stateName(curStates)]] : []), ...states.map((s) => [s, STATES[s] || s])], 'State')}
    ${sel('new', [['week', `New this week${nNew ? ` (${nNew})` : ''}`], ...(nUpd ? [['updated', `Recently updated (${nUpd})`]] : [])], 'Added')}
    ${sel('tier', [['1', 'Twisted Deed'], ['2', 'Strong Story']], 'Tier')}
    ${sel('layer', layers.map((k) => [k, layerInfo(k).label]), 'Category')}
    ${sel('price', PRICE_BANDS.map((b) => [b.key, b.label]), 'Price')}
    ${sel('kind', kinds.map((k) => [k, kindLabel(k)]), 'Type')}
    ${sel('status', [['open', 'Active or pending'], ...statuses.map((s) => [s, statusInfo(s).label])], 'Status')}
    <label class="f"><span>Sort</span><select name="sort">${[['featured', 'Most twisted first'], ['newest', 'Newest added'], ['priceAsc', 'Price: low to high'], ['priceDesc', 'Price: high to low'], ['name', 'Name']].map(([v, t]) => html`<option value="${v}" ${(q.get('sort') || 'featured') === v ? 'selected' : ''}>${t}</option>`)}</select></label>
  </form>
  <div class="chips-row">${layers.map((k) => { const i = layerInfo(k); const on = q.get('layer') === k; const n = L.filter((l) => l.layer === k).length;
    return html`<a class="chip ${on ? 'on' : ''} ${n ? '' : 'dim'}" style="--c:${i.color}" href="#/browse?${new URLSearchParams({ ...Object.fromEntries(q), layer: on ? '' : k })}"><span class="dot"></span>${i.label}<small>${n}</small></a>`; })}</div>
  <div class="result-bar"><strong>${plural(list.length, 'property', 'properties')}</strong>
    ${active.length ? html`<a class="small" href="#/browse">Clear filters</a>` : ''}
    <a class="small" href="#/map?${q}">Show these on the map →</a></div>
  ${list.length ? html`<div class="grid">${list.map((l) => listingCard(l, { ...ctx, compact: false }))}</div>`
    : html`<div class="empty-state"><p>No properties match. Try fewer filters, or <a href="#/suggest">suggest one</a>.</p></div>`}
  <details class="states-all"><summary>All states</summary><div class="state-grid">${stateCounts.map(([s, n]) => html`<a href="#/browse?state=${s}">${STATES[s] || s} <span>${n}</span></a>`)}</div></details>`;
}
