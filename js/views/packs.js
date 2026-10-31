// Dossier Packs: themed bundles of full files (PDF + CSV index). COMING SOON: no purchase
// button and no checkout. Reads data/packs.json, a preview-safe index written by
// _build/build_packs.py (titles, descriptions, listing ids/names, counts, suggested prices).
// The PDFs and full-file content are never shipped with the site.
import { html, plural, fmtDate } from '../util.js';
import { soonChip, standardPrice } from '../components.js';

let cache = null;
async function loadPacks() {
  if (cache) return cache;
  const r = await fetch('data/packs.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Pack list unavailable');
  return (cache = await r.json());
}

export async function packs(ctx) {
  let data;
  try { data = await loadPacks(); } catch (e) { return html`<div class="empty-state"><h1>Dossier Packs</h1><p>The pack list couldn’t be loaded. ${e.message}</p></div>`; }
  const list = (data.packs || []).filter((p) => p.status === 'coming_soon');
  return html`<div class="page-head"><h1>Dossier Packs ${soonChip()}</h1>
    <p class="muted">Themed bundles of full files: one printable PDF with a dossier per property (story, citations, address, price and status, listing link, map point, credited photo or labeled illustration) plus a spreadsheet index. Packs aren’t on sale yet. Single files stay ${standardPrice()} each on any listing.</p></div>
  <div class="packs">${list.map((p) => { const per = p.count ? (p.suggestedPrice / p.count).toFixed(2) : '';
    return html`<article class="pack">
      <div class="pack-head"><h2>${p.title}</h2>${soonChip()}</div>
      <p class="pack-desc">${p.description}</p>
      <div class="pack-meta"><span><b>${plural(p.count, 'full file')}</b></span><span>Trial price <b>$${p.suggestedPrice}</b> (about $${per} a file vs. $${(data.singleUnlockPrice || 5) * p.count} one by one)</span><span class="muted">Prices and statuses as of ${fmtDate(p.asOf)}</span></div>
      <ol class="pack-list">${(p.listings || []).map((l) => html`<li><a href="#/l/${encodeURIComponent(l.id)}">${l.name}</a> <span class="muted">· ${l.place}</span></li>`)}</ol>
      <p class="pack-cta small muted">Coming soon. Open any name above for its free preview.</p>
    </article>`; })}</div>
  <p class="small muted">Packs include only properties currently for sale with two or more public sources. Public-record research; these are private properties: never trespass. Not real estate advice.</p>`;
}
