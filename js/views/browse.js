import { html, raw, plural } from '../util.js';
import { web, nyx } from '../reveals.js';
import { listingCard, shelfTabs } from '../components.js';
import { LAYERS, PRICE_BANDS, STATES, STATUSES, layerInfo, statusInfo, kindLabel, ratingLabel, leatherFor } from '../taxonomy.js';
import { sortListings, isNew, isOpen, feed } from '../feed.js';
import { hasSoftFilter, prefsSummary, partitionList } from '../prefs.js';

// status param: '' (default) = Active + Pending catalog; 'archive' = Sold, Off market, Stale…;
// 'all' = everything; 'open' = same as default; any single status name = that status.
const statusOk = (l, st) => !st || st === 'open' ? isOpen(l) : st === 'archive' ? !isOpen(l) : st === 'all' ? true : l.status === st;

const stateList = (s) => String(s || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const stateName = (codes) => codes.map((c) => STATES[c] || c).join(' & ');

// q: URLSearchParams. state may be one code or a comma list (MI,OH: the scouting focus link).
// new=week -> first added in the last 7 days; new=updated -> approved community additions in the last 7 days.
export function applyFilters(L, q, updates) {
  const s = stateList(q.get('state')), added = q.get('new'), layer = q.get('layer'), tier = q.get('tier'), price = q.get('price'), status = q.get('status'), kind = q.get('kind');
  const text = (q.get('q') || '').trim().toLowerCase();
  const band = PRICE_BANDS.find((b) => b.key === price);
  return L.filter((l) => (!s.length || s.includes(l.state)) && (!added || (added === 'week' ? isNew(l) : added === 'updated' ? !!updates?.has?.(l.id) : true)) && (!layer || l.layer === layer) && (!tier || String(l.tier) === tier)
    && statusOk(l, status) && (!kind || l.kind === kind)
    && (!band || (band.min == null ? (l.priceNum == null || l.auction) : (l.priceNum != null && l.priceNum >= band.min && l.priceNum < band.max)))
    && (!text || [l.name, l.place, l.address, l.preview?.summary, l.preview?.teaser, l.facts, ratingLabel(l)].join(' ').toLowerCase().includes(text)));
}

// Mobile (<= 720px): the dropdowns fold behind a "Filters (n)" button. Open/closed survives the
// re-render that every filter change triggers; desktop ignores it (the panel is display:contents).
export const filterPanel = { open: false };
// Category shelf: each category is a book spine standing on a shelf at the bottom of the filters.
// Buttons (aria-pressed) toggle the Category filter; the dropdown stays in sync because both read ?layer.
const HEIGHTS = [100, 92, 97, 88, 100, 94, 90, 98, 93, 96, 89, 95];
function shelf(layers, L, cur) {
  return html`<div class="shelf-wrap"><p class="shelf-cap" id="shelf-cap">Categories <span class="muted small">· tap a spine to pull it, tap again to put it back</span></p>
    <div class="shelf" role="group" aria-labelledby="shelf-cap">${layers.map((k, i) => {
      const inf = layerInfo(k), n = L.filter((l) => l.layer === k).length, on = cur === k;
      const words = inf.label.split(' '), two = inf.label.length > 11;
      return html`<button type="button" class="spine ${on ? 'on' : ''} ${n ? '' : 'zero'} ${i % 4 === 2 ? 'paper' : ''} ${two ? 'two' : ''}" name="spine-${k}" data-spine="${k}" aria-pressed="${on ? 'true' : 'false'}"
        aria-label="${inf.label}, ${n ? n + (n === 1 ? ' listing' : ' listings') : 'none on the shelf yet'}" style="--c:${inf.color};--leather:${leatherFor(k)};--h:${HEIGHTS[i % HEIGHTS.length]}%">
        <span class="bk" aria-hidden="true"><span class="band"><i></i></span><span class="ttl">${two && words.length > 1 ? html`${words.slice(0, Math.ceil(words.length / 2)).join(' ')}<br>${words.slice(Math.ceil(words.length / 2)).join(' ')}` : inf.label}</span><span class="cnt">${n}</span></span></button>`;
    })}</div><div class="shelf-plate" aria-hidden="true"><span>The Stacks</span><small>Categories · Shelf I</small></div></div>`;
}
// Empty results: a bare shelf bay with a single cobweb; Nyx keeps it.
const emptyBay = () => raw(`<div class="empty-bay" aria-hidden="false"><span class="eb-board"></span>${web('full', 'eb-web')}<span class="eb-thread"></span>${nyx('shelf', 'eb-nyx')}</div>`);
const FILTER_KEYS = ['state', 'new', 'tier', 'layer', 'price', 'kind', 'status'];
export const activeFilterCount = (q) => FILTER_KEYS.filter((k) => q.get(k) && !(k === 'status' && q.get(k) === 'open')).length + (q.get('sort') && q.get('sort') !== 'featured' ? 1 : 0);

export async function browse(ctx, q) {
  const ALL = ctx.feed.listings, L = ctx.feed.catalog, nArch = ctx.feed.archive.length;
  const filtered = sortListings(applyFilters(ALL, q, ctx.updates), q.get('sort') || 'featured');
  const split = hasSoftFilter() ? partitionList(filtered) : { primary: filtered, more: [] };
  const list = split.primary, tucked = split.more;
  const nNew = L.filter((l) => isNew(l)).length, nUpd = ctx.updates?.size || 0;
  const sc = feed.meta.scouting, scN = sc ? L.filter((l) => sc.focus.includes(l.state)).length : 0;
  const curStates = stateList(q.get('state'));
  const scOn = sc && curStates.length === sc.focus.length && sc.focus.every((c) => curStates.includes(c));
  const sel = (name, opts, label) => html`<label class="f"><span>${label}</span><select name="${name}">
    <option value="">All</option>${opts.map(([v, t]) => html`<option value="${v}" ${q.get(name) === String(v) ? 'selected' : ''}>${t}</option>`)}</select></label>`;
  const states = [...new Set(L.map((l) => l.state).filter(Boolean))].sort();
  const layers = [...new Set([...Object.keys(LAYERS), ...L.map((l) => l.layer)])];
  const kinds = [...new Set(L.map((l) => l.kind))];
  const statuses = [...new Set([...Object.keys(STATUSES), ...ALL.map((l) => l.status)])].filter((x) => ALL.some((l) => l.status === x));
  const stQ = q.get('status') || '';
  const active = [...q.entries()].filter(([k, v]) => v && k !== 'sort');
  const stateCounts = states.map((s) => [s, L.filter((l) => l.state === s).length]);
  const nAct = activeFilterCount(q), fOpen = filterPanel.open;
  return html`<div class="page-head"><h1>Browse</h1><p class="muted">Filter by state, category and price. Twisted Deeds always rank first. Shows properties for sale (active or pending). Places that are <b>not for sale</b> are on the other shelf, <a href="#/archive">the Archive</a>${ctx.feed.theArchive?.length ? ` (${ctx.feed.theArchive.length})` : ''}; sold and off-market listings are in <a href="#/archive?at=sold">Once for sale</a>.</p>
    ${shelfTabs(ctx, 'sale')}
    ${sc ? html`<p class="scouting small">Currently scouting: <b>${sc.label}</b> · ${scOn ? html`<span class="muted">showing ${plural(scN, 'listing')}</span> · <a href="#/browse">all states</a>`
      : html`<a href="#/browse?state=${sc.focus.join(',')}">See ${sc.label} (${scN})</a>`}</p>` : ''}</div>
  <form class="filters ${fOpen ? 'f-open' : ''}" data-filters>
    <label class="f grow"><span>Search</span><input name="q" type="search" value="${q.get('q') || ''}" placeholder="Name, town, story…"></label>
    <button type="button" class="btn ghost f-toggle ${nAct ? 'has-active' : ''}" data-filters-toggle aria-expanded="${fOpen ? 'true' : 'false'}" aria-controls="f-panel"><span aria-hidden="true">⚙</span> Filters${nAct ? ` (${nAct})` : ''}</button>
    <div class="f-more" id="f-panel">
    ${sel('state', [...(curStates.length > 1 ? [[curStates.join(','), stateName(curStates)]] : []), ...states.map((s) => [s, STATES[s] || s])], 'State')}
    ${sel('new', [['week', `New this week${nNew ? ` (${nNew})` : ''}`], ...(nUpd ? [['updated', `Recently updated (${nUpd})`]] : [])], 'Added')}
    ${sel('tier', [['1', 'Twisted Deed'], ['2', 'Strong Story']], 'Tier')}
    ${sel('layer', layers.map((k) => [k, layerInfo(k).label]), 'Category')}
    ${sel('price', PRICE_BANDS.map((b) => [b.key, b.label]), 'Price')}
    ${sel('kind', kinds.map((k) => [k, kindLabel(k)]), 'Type')}
    <label class="f"><span>Status</span><select name="status">
      <option value="" ${!stQ || stQ === 'open' ? 'selected' : ''}>For sale: Active or pending (${L.length})</option>
      ${statuses.map((s) => html`<option value="${s}" ${stQ === s ? 'selected' : ''}>${statusInfo(s).label} (${ALL.filter((l) => l.status === s).length})</option>`)}
      <option value="archive" ${stQ === 'archive' ? 'selected' : ''}>Sold & Off market (${nArch})</option>
      <option value="all" ${stQ === 'all' ? 'selected' : ''}>Everything, archive included (${ALL.length})</option></select></label>
    <label class="f"><span>Sort</span><select name="sort">${[['featured', 'Most twisted first'], ['newest', 'Newest added'], ['priceAsc', 'Price: low to high'], ['priceDesc', 'Price: high to low'], ['name', 'Name']].map(([v, t]) => html`<option value="${v}" ${(q.get('sort') || 'featured') === v ? 'selected' : ''}>${t}</option>`)}</select></label>
    <div class="f-actions"><a class="btn ghost" href="#/browse${q.get('q') ? '?' + new URLSearchParams({ q: q.get('q') }) : ''}" data-filters-clear>Clear${nAct ? ` (${nAct})` : ''}</a><button type="button" class="btn" data-filters-done>Show ${plural(list.length, 'result')}</button></div>
    </div>
    ${shelf(layers, L, q.get('layer'))}
  </form>
  ${hasSoftFilter() ? html`<p class="prefs-banner">Leading with ${prefsSummary()}. <a href="#/account?at=prefs">Change this in Account</a>.</p>` : ''}
  <div class="result-bar" id="results"><strong>${plural(list.length, 'property', 'properties')}</strong>${tucked.length ? html`<span class="muted small"> · ${plural(tucked.length, 'more')} behind Show more</span>` : ''}
    ${active.length ? html`<a class="small" href="#/browse">Clear filters</a>` : ''}
    <a class="small" href="#/map?${q}">Show these on the map →</a>
    ${list.length ? html`<button type="button" class="btn sm ghost pull-random" data-random="shelf" title="Pull one of these books off the shelf at random"><span class="pr-ic" aria-hidden="true"></span>Pulled at random</button>` : ''}</div>
  ${list.length ? html`<div class="grid">${list.map((l) => listingCard(l, { ...ctx, compact: false }))}</div>`
    : q.get('layer') && !L.some((l) => l.layer === q.get('layer'))
      ? html`<div class="empty-state shelf-empty">${emptyBay()}<p class="se-h">None on the shelf yet</p><p>No ${layerInfo(q.get('layer')).label} listings have been filed so far. When one is, it will stand here.</p><p><a href="#/browse">See every category</a> or <a href="#/suggest">suggest one</a>.</p></div>`
      : html`<div class="empty-state shelf-empty">${emptyBay()}<p class="se-h">An empty shelf</p><p>No properties match. Try fewer filters, or <a href="#/suggest">suggest one</a>.</p></div>`}
  ${tucked.length ? html`<details class="prefs-more" ${!list.length ? 'open' : ''}><summary>Show more · ${plural(tucked.length, 'place')} outside your picks</summary>
    <p class="small muted">These stayed in the library. <a href="#/account?at=prefs">Change your interests or area</a>.</p>
    <div class="grid">${tucked.map((l) => listingCard(l, { ...ctx, compact: false }))}</div></details>` : ''}
  <details class="states-all"><summary>All states</summary><div class="state-grid">${stateCounts.map(([s, n]) => html`<a href="#/browse?state=${s}">${STATES[s] || s} <span>${n}</span></a>`)}</div></details>`;
}
