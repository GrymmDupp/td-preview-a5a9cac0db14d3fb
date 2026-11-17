// Shared UI pieces: grade labels, listing cards, the archival "plate" image, price, lock.
import { html, raw, esc, fmtDate, truncate, plural, safeUrl, host } from './util.js';
import { CONFIG } from './config.js';
import { statusInfo, kindLabel, tierInfo, storyLabel, PUBLIC_TIER1, PUBLIC_TIER2, PUBLIC_HERITAGE, heritageTierInfo } from './taxonomy.js';
import { displayableImages } from './feed.js';
import { isNew, isArchived, isArchiveShelf, isOpen, updateLine } from './feed.js';

// Public rating badge. Tier 1 = prominent "Twisted Deed"; tier 2 = muted "Strong Story"
// with its category. The internal grade (and its letters/emoji) is never shown.
// Heritage Homes tier badge (Century / Sesquicentennial / Bicentennial), gold, separate from the core ratings.
export const heritageBadge = (h, big = false) => { if (!h) return ''; const t = heritageTierInfo(h.tier);
  return html`<span class="badge heritage hb-${h.tier} ${big ? 'big' : ''}" title="${PUBLIC_HERITAGE}: ${t.long}" aria-label="${PUBLIC_HERITAGE}, ${t.label} tier"><span class="hb-orn" aria-hidden="true">❦</span>${t.label}<i>${h.years} yrs</i></span>`; };
// Cross-links between the separate collections (a listing may qualify for both).
export const heritageCrossLink = (l) => !l?.heritage ? '' : l.collection === 'heritage'
  ? '' : html`<a class="xlink heritage-x" href="#/heritage" title="This house also qualifies for the separate Heritage Homes collection">❦ Also a Heritage Home · ${heritageTierInfo(l.heritage.tier).label}</a>`;
export const coreCrossLink = (l) => !l?.heritage || l.collection === 'heritage' ? ''
  : html`<a class="xlink core-x" href="#/l/${encodeURIComponent(l.id)}">Also a ${l.tier === 1 ? PUBLIC_TIER1 : PUBLIC_TIER2}</a>`;
export const gradeBadge = (l, big = false) => l.collection === 'heritage' ? heritageBadge(l.heritage, big) : l.tier === 1
  ? html`<span class="badge ddd ${big ? 'big' : ''}" style="--c:#c41e32" title="${PUBLIC_TIER1}" aria-label="Rating: ${PUBLIC_TIER1}"><b>${PUBLIC_TIER1}</b></span>`
  : html`<span class="badge story ${big ? 'big' : ''}" title="${PUBLIC_TIER2}${storyLabel(l) ? ': ' + storyLabel(l) : ''}" aria-label="Rating: ${PUBLIC_TIER2}${storyLabel(l) ? ', ' + storyLabel(l) : ''}">${PUBLIC_TIER2}${storyLabel(l) ? html`<i>${storyLabel(l)}</i>` : ''}</span>`;
export const layerChip = (l) => l.collection === 'heritage' ? html`<a class="layer" style="--c:#c9a227" href="#/heritage"><span class="dot"></span>Heritage Homes</a>` : html`<a class="layer" style="--c:${l.layerI.color}" href="#/browse?layer=${encodeURIComponent(l.layer || '')}"><span class="dot"></span>${l.layerI.label}</a>`;
export const statusPill = (l) => { if (isArchiveShelf(l)) return l.status === 'Sold' ? html`<span class="status off">Sold · in the Archive</span>` : html`<span class="status arch">Not for sale</span>`; const s = statusInfo(l.status); return html`<span class="status ${s.cls}">${s.label}</span>`; };
// ---- The Archive (2026-11-16) -------------------------------------------------------------------------------
// "For sale now": a red wax seal on every book that is on the market today (Active), "Sale pending" for Pending.
// Text lives on the seal's rim (SVG textPath), so it reads as pressed wax, not a badge.
export function forSaleSeal(l, cls = '') {
  if (!isOpen(l)) return '';
  const pend = l.status === 'Pending', top = pend ? 'SALE' : 'FOR SALE', mid = pend ? 'PENDING' : 'NOW', uid = 'fs' + Math.abs([...l.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  return raw(`<span class="fs-seal ${cls}" role="img" aria-label="${pend ? 'Sale pending' : 'For sale now'}" title="${pend ? 'Sale pending' : 'For sale now'}"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><path id="${uid}" d="M60 60m-35 0a35 35 0 1 1 70 0"/></defs>
    <g filter="url(#wax-edge)"><circle cx="60" cy="60" r="54" fill="url(#wax-th)"/></g>
    <circle cx="60" cy="60" r="43" fill="url(#wax-th-in)" stroke="#2a0603" stroke-width="2"/>
    <circle cx="60" cy="60" r="39.5" fill="none" stroke="#e9b7a8" stroke-opacity=".4" stroke-width="1.1"/>
    <text font-size="15" letter-spacing="2" fill="#f6dcd2" font-family="Cinzel,serif" font-weight="700" style="paint-order:stroke" stroke="#2a0603" stroke-width=".7"><textPath href="#${uid}" startOffset="50%" text-anchor="middle">${top}</textPath></text>
    <path d="M30 63h60" stroke="#e9b7a8" stroke-opacity=".5" stroke-width="1"/>
    <text x="60" y="${pend ? 86 : 90}" text-anchor="middle" font-size="${pend ? 13.5 : 27}" letter-spacing="${pend ? .5 : 1}" fill="#f6dcd2" font-family="Cinzel,serif" font-weight="700" stroke="#2a0603" stroke-width=".8" style="paint-order:stroke">${mid}</text>
    <ellipse cx="42" cy="34" rx="14" ry="5.5" fill="#fff" opacity=".13" transform="rotate(-30 42 34)"/></svg></span>`);
}
// Archive bookplate: a pasted paper label (ex libris style) that marks a place as not for sale.
export const archivePlate = (l, cls = '') => !isArchiveShelf(l) ? '' : html`<span class="bookplate ${cls}" role="note" aria-label="From the Archive. Not for sale."><i aria-hidden="true">❦</i><b>From the Archive</b><small>${l.status === 'Sold' ? 'Sold · no longer on the market' : 'Not for sale'}</small></span>`;

// "As seen on": credit lines for the shows a place appeared in. Names the episode and links to where to watch it. No footage.
export const mediaLine = (m) => {
  const head = m.show + (m.network ? ` (${m.network})` : '');
  const ep = [(m.season && m.episode) ? `S${m.season}·E${m.episode}` : m.season ? `Season ${m.season}` : '', m.title ? `“${m.title}”` : ''].filter(Boolean).join(' ');
  return [head, ep, m.year || ''].filter(Boolean).join(', ');
};
export const mediaCredit = (l) => !l.media?.length ? '' : html`<div class="as-seen" role="note"><span class="as-k">As seen on</span> ${l.media.slice(0, 3).map((m, i) => html`${i ? ' · ' : ''}<span class="as-s">${mediaLine(m)}</span>`)}${l.media.length > 3 ? ` · +${l.media.length - 3} more` : ''}</div>`;
export const crewLine = (l) => l.crewFeatured ? html`<div class="crew-line"><i aria-hidden="true">✦</i> As seen with the Twisted History crew</div>` : '';

// Two bookmarks that move between the shelves: for sale now / the Archive.
export function shelfTabs(ctx, on = 'sale') {
  const n = ctx.feed.theArchive?.length || 0, sale = ctx.feed.catalog.length;
  return html`<nav class="shelf-tabs" aria-label="Shelves">
    <a href="#/browse" class="st ${on === 'sale' ? 'on' : ''}" ${on === 'sale' ? 'aria-current="page"' : ''}><span class="st-r" aria-hidden="true"></span>For sale now <small>${sale}</small></a>
    <a href="#/archive" class="st arch ${on === 'archive' ? 'on' : ''}" ${on === 'archive' ? 'aria-current="page"' : ''}><span class="st-r" aria-hidden="true"></span>The Archive <small>${n ? n : 'being catalogued'}</small></a></nav>`;
}
export const pendingTag = (row) => row?.status === 'pending' ? html`<span class="pending" title="Only you can see this until a moderator approves it">Awaiting review</span>` : '';

// The archival plate is shown when a listing has no usable photo, and behind every
// photo as its fallback (if the hotlinked image fails, app.js hides it and the plate
// shows). Deterministic per listing, tinted by its layer color.
export function plate(l, cls = '') {
  const c = l.layerI.color;
  let h = 0; for (const ch of l.id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const roof = 30 + (h % 25), w = 120 + (h % 60), x = 200 - w / 2, win = 2 + (h % 3);
  const kind = l.kind === 'investment' ? 'land' : /church|chapel|cemetery/i.test(l.name) ? 'church' : l.kind;
  let body;
  if (kind === 'land') body = `<path d="M40 190 Q120 150 200 175 T360 165 L360 230 L40 230Z" fill="${c}" opacity=".18"/><path d="M70 190 l14-40 14 40M300 182 l12-34 12 34" stroke="${c}" fill="none" stroke-width="2"/>`;
  else if (kind === 'church') body = `<rect x="${x}" y="120" width="${w}" height="90" fill="none" stroke="${c}" stroke-width="2"/><path d="M${x - 8} 122 L200 ${120 - roof} L${x + w + 8} 122" fill="none" stroke="${c}" stroke-width="2"/><path d="M200 ${120 - roof} v-34 M190 ${108 - roof} h20" stroke="${c}" stroke-width="2"/><path d="M190 210 v-36 a10 10 0 0 1 20 0 v36" fill="none" stroke="${c}" stroke-width="2"/>`;
  else {
    const wins = Array.from({ length: win }, (_, i) => `<rect x="${x + 16 + i * ((w - 40) / Math.max(1, win - 1))}" y="140" width="10" height="16" fill="${c}" opacity="${0.25 + ((h >> i) % 5) / 8}"/>`).join('');
    body = `<rect x="${x}" y="125" width="${w}" height="85" fill="none" stroke="${c}" stroke-width="2"/><path d="M${x - 10} 127 L200 ${125 - roof} L${x + w + 10} 127" fill="none" stroke="${c}" stroke-width="2"/>${wins}<rect x="192" y="180" width="16" height="30" fill="none" stroke="${c}" stroke-width="2"/>${kind === 'commercial' ? `<rect x="${x + 10}" y="112" width="${w - 20}" height="10" fill="none" stroke="${c}" stroke-width="1.5"/>` : `<path d="M${x + w - 30} ${127 - roof / 2} v-22 h12 v${22 - roof / 3}" fill="none" stroke="${c}" stroke-width="2"/>`}`;
  }
  return raw(`<div class="plate ${cls}" style="--c:${c}" role="img" aria-label="Archival placeholder for ${esc(l.name)}">
<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="g${h}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="#0b0909" stop-opacity="0"/></radialGradient>
<pattern id="p${h}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#e8dcc4" stroke-opacity=".035"/></pattern></defs>
<rect width="400" height="250" fill="#120e0f"/><rect width="400" height="250" fill="url(#p${h})"/><rect width="400" height="250" fill="url(#g${h})"/>
<path d="M0 210 H400" stroke="${c}" stroke-opacity=".5"/>${body}
<rect x="10" y="10" width="380" height="230" fill="none" stroke="#e8dcc4" stroke-opacity=".14"/></svg>
<span class="plate-cap">No photo on file · ${l.year ? `c. ${l.year} · ` : ''}${esc(l.city)}${l.state ? ', ' + l.state : ''}</span></div>`);
}

// Listing-portal pages carry listing / MLS IDs: never link them from public pages (same rule as /jackson/ and /live/).
// Instead, "Find listing" searches the address. News, archives and Wikipedia are never treated as portals.
const PORTALS = ['zillow.com', 'redfin.com', 'trulia.com', 'realtor.com', 'coldwellbanker.com', 'coldwellbankerhomes.com', 'howardhanna.com', 'crexi.com', 'loopnet.com', 'landwatch.com', 'realmo.com', 'greenridge.com', 'arterrarealty.com', 'remax.com', 'bhhschicago.com', 'commercialcafe.com', 'commercialsearch.com', 'brevitas.com', 'michiganwhitetailproperties.com', 'homes.com', 'century21.com', 'compass.com', 'movoto.com'];
const NEWS = ['mlive.com', 'wkar.org', 'npgallery.nps.gov', 'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'loc.gov', 'nps.gov', 'archive.org', 'newspapers.com', 'findagrave.com'];
export function isPortalUrl(u) {
  const s = safeUrl(u); if (!s) return false;
  const h = host(s).toLowerCase(), on = (d) => h === d || h.endsWith('.' + d);
  if (NEWS.some(on)) return false;
  if (PORTALS.some(on)) return true;
  return /property-id|mls|\/\d{6,}|[-_/]\d{6,}|lid-|pid_|id_\d|zpid|\/home\/\d/i.test(s);
}
export const publicUrl = (u) => (isPortalUrl(u) ? '' : safeUrl(u));
export const findListingUrl = (l) => 'https://www.google.com/search?q=' + encodeURIComponent(`${l.address || l.name + ' ' + l.place} for sale`);

export const money = (n) => `$${Number(n).toFixed(Number.isInteger(Number(n)) ? 0 : 2)}`;
const P = CONFIG.pricing;   // live mode: trial switches overwritten from app_settings at startup
export const isTrial = () => !!P.trial?.active;
export const membershipsOn = () => !!P.membershipsEnabled;
// Price tier for an (effective) membership: 'standard' | 'monthly' | 'lifetime'.
export const priceTier = (m) => (m?.plan === 'lifetime' ? 'lifetime' : m?.plan === 'monthly' ? 'monthly' : 'standard');
// The tier that actually prices this viewer's unlocks: 'trial' while the trial runs.
export const viewerTier = (m) => (isTrial() ? 'trial' : priceTier(m));
export const tierAmount = (tier) => ({ trial: P.trial?.unlockPrice, standard: P.unlockPrice, monthly: P.monthlyUnlockPrice, lifetime: P.lifetimeUnlockPrice })[tier];
// The unlock price for the current viewer: trial price for everyone; planned standard / Monthly / Lifetime prices.
export const unlockPrice = (ctx) => money(tierAmount(viewerTier(ctx?.membership)));
// The price everyone without a membership pays right now (trial price during the trial).
export const standardPrice = () => money(isTrial() ? P.trial.unlockPrice : P.unlockPrice);
export const monthlyUnlockPrice = () => money(P.monthlyUnlockPrice);
export const lifetimeUnlockPrice = () => money(P.lifetimeUnlockPrice);
export const monthlyPrice = () => money(P.monthlyPrice);
export const lifetimePrice = () => money(P.lifetimePrice);
export const TIER_LABEL = { standard: 'standard', trial: 'Trial price', monthly: 'Monthly member price', lifetime: 'Lifetime member price' };
// Small, quiet note next to the $5 while the trial runs. No urgency.
// Mobile sticky unlock bar (shown below 960px, above the tab bar): price + the page's primary action.
// `action` is the same button/link markup the page's own call to action uses.
export const unlockBar = (ctx, action) => html`<div class="ubar" role="region" aria-label="Unlock the full file"><div class="ubar-price"><b>${unlockPrice(ctx)}</b><span>${isTrial() ? 'Trial price · one time' : 'One time · yours for good'}</span></div>${action}</div>`;
export const trialNote = () => (isTrial() ? html` <span class="trial-note">Trial price</span>` : '');
// "Coming soon" chip + a non-clickable button stand-in for memberships while they're off.
export const soonChip = () => html`<span class="soon">Coming soon</span>`;
export const soonButton = (label) => html`<button class="btn sm ghost soon-btn" type="button" disabled aria-disabled="true">${label} · Coming soon</button>`;
// Quiet line under unlock buttons for non-members.
export const membersLine = (from = '') => {
  if (!membershipsOn()) return raw(`Memberships (Monthly and Lifetime) are coming soon.`);
  const q = from ? `&from=${encodeURIComponent(from)}` : '';
  return raw(`Members unlock for less: <a href="#/membership?plan=monthly${q}">Monthly ${monthlyPrice()}/mo</a> (unlocks ${monthlyUnlockPrice()}) or <a href="#/membership?plan=lifetime${q}">Lifetime ${lifetimePrice()} one-time</a> (unlocks ${lifetimeUnlockPrice()})`);
};

// Photo label per image_type. Listing photos are hotlinked from the source page, never rehosted.
export const IMAGE_TYPE_LABEL = { listing: 'Listing photo', 'alt-listing': 'Photo from another listing', 'public-domain': 'Public domain', cc: 'Creative Commons', illustration: 'Illustration, not a photo' };
export const imageType = (i) => i.image_type || (i.rights === 'illustration' ? 'illustration' : '');
// Credit line + link back to the source page.
export function photoCredit(i) {
  const t = imageType(i), src = publicUrl(i.source || i.page || '');
  if (t === 'illustration') return html`<span class="ph-type illus">Illustration, not a photo</span>${i.credit ? html` · ${i.credit}` : ''}`;
  const lic = (t === 'cc' || (t === 'public-domain' && !/^public[\s-]*domain$/i.test(String(i.license || '').trim()))) ? html`${i.license ? html` · ${safeUrl(i.license_url) ? html`<a href="${safeUrl(i.license_url)}" target="_blank" rel="noopener nofollow license">${i.license}</a>` : i.license}` : ''}` : '';
  const free = t === 'cc' || t === 'public-domain';
  const via = t === 'listing' ? 'via listing' : t === 'alt-listing' ? 'via another listing' : free ? `via ${host(src) === 'commons.wikimedia.org' ? 'Wikimedia Commons' : host(src) || 'source'}` : 'via source';
  const who = String((free && i.author) || i.credit || host(src) || 'unknown').replace(/[\s,;]+$/, '');
  return html`<span class="ph-type">${IMAGE_TYPE_LABEL[t] || 'Photo'}</span> · ${src ? html`<a href="${src}" target="_blank" rel="noopener nofollow">Photo: ${who}, ${via}</a>` : html`Photo: ${who}`}${lic}`;
}
// First usable photo with the plate underneath as its fallback (see app.js img error handler).
export function photoOrPlate(l, cls = '') {
  const i = displayableImages(l)[0];
  if (!i) return plate(l, cls);
  const illus = imageType(i) === 'illustration';
  // The "Illustration, not a photo" label sits on a caption line BELOW the image, never on it.
  return html`<div class="ph ${cls}" data-ph>${plate(l, cls)}<img src="${i.src || i.url}" alt="${imgAlt(i, l.name)}" loading="lazy" referrerpolicy="no-referrer" data-ph-img></div>${illus ? illusNote() : ''}`;
}
// Alt text says when a picture is drawn, so screen readers get the label too.
export const imgAlt = (i, fallback = '') => (imageType(i) === 'illustration' ? 'Illustration, not a photo: ' : '') + (i.caption || fallback);
// Small muted caption line under an image (cards, map popups).
export function illusNote() {
  return html`<span class="ph-note"><span class="ph-type illus">Illustration, not a photo</span></span>`;
}

// "New" = first added to the archive in the last 7 days (addedAt). "Updated" = community
// submissions approved in the last 7 days; quieter, and says only that something was added.
export const newTag = (l) => isNew(l) ? html`<span class="tag-new" title="Added to the archive ${fmtDate(l.addedAt)}">New</span>` : '';
export const updatedTag = (u) => u ? html`<span class="tag-upd" title="${updateLine(u)}">Updated</span>` : '';

export function listingCard(l, { comments = {}, unlocks = [], compact = false, updates } = {}) {
  const n = comments[l.id] || 0, open = unlocks.includes(l.id), upd = updates?.get?.(l.id);
  const shelf = isArchiveShelf(l);
  return html`<article class="card ${l.tier === 1 ? 't1' : 't2'} ${compact ? 'compact' : ''} ${shelf ? 'in-archive' : ''}" style="--c:${l.layerI.color}">
  <a class="card-media" href="#/l/${encodeURIComponent(l.id)}" aria-label="${l.name}">${photoOrPlate(l)}
    ${isNew(l) ? html`<span class="ribbon">New</span>` : ''}${shelf ? archivePlate(l, 'on-card') : forSaleSeal(l, 'on-card')}</a>
  <div class="card-body">
    <div class="card-badges">${gradeBadge(l)} ${compact ? newTag(l) : ''} ${updatedTag(upd)} ${layerChip(l)} ${statusPill(l)} ${heritageCrossLink(l)}</div>
    <h3><a href="#/l/${encodeURIComponent(l.id)}">${l.name}</a></h3>
    <div class="card-place">${l.place.replace(/,\s*[A-Z]{2}$/, '')}${l.state ? html`, <a href="#/browse?state=${l.state}">${l.state}</a>` : ''}</div>
    ${shelf ? html`<div class="card-price archived">${l.status === 'Sold' ? html`Sold${l.soldOn ? html` <span class="muted">(${fmtDate(l.soldOn)})</span>` : ''}` : 'Not for sale'}</div>${mediaCredit(l)}${crewLine(l)}` : isArchived(l) ? html`<div class="card-price archived">Last known: ${l.price || 'price not listed'}${l.lastChecked ? html` <span class="muted">(${fmtDate(l.lastChecked)})</span>` : ''}</div><div class="no-sale small">No longer for sale</div>` : html`<div class="card-price">${l.price || 'Price not listed'}</div>`}
    ${shelf ? '' : mediaCredit(l)}
    ${compact ? '' : html`<p class="card-story">${truncate(l.blurb, 220)}</p>`}
    ${l.facts && !compact ? html`<div class="card-facts">${l.facts}</div>` : ''}
    <div class="card-foot">
      <span class="posted">Added ${fmtDate(l.addedAt || l.logged)}</span>
      <a class="cc" href="#/l/${encodeURIComponent(l.id)}?at=comments">💬 ${plural(n, 'comment')}</a>
      ${shelf ? html`<span class="file-state">${l.media.length ? 'From the Archive' : 'Preview'}</span>` : open ? html`<span class="file-state open">🔓 Full file</span>` : html`<a class="file-state unlock-link" href="#/unlock/${encodeURIComponent(l.id)}" title="Free preview on the listing page; unlock the full file for ${standardPrice()} one time">🔒 Unlock full file · ${standardPrice()}</a>`}
    </div>
  </div></article>`;
}

// Plain handle, no link: there are no public profiles.
export const authorName = (p) => p ? html`<span class="author">@${p.handle}</span>` : html`<span class="author muted">deleted account</span>`;

export const reportBtn = (type, id) => html`<button class="link small report-btn" data-report="${type}:${id}">Report</button>`;

export const sourceLinks = (l, full) => {
  const urls = new Map();
  const add = (u, label) => { const s = publicUrl(u); if (s && !urls.has(s)) urls.set(s, label || host(s)); };
  add(l.url, 'Original listing');
  (full?.sources || []).forEach((u) => add(typeof u === 'string' ? u : u?.url, u?.label));
  (full?.references || []).forEach((i) => add(i.page, `${i.source}${i.caption ? ': ' + i.caption : ''} (reference photos, on the original page)`));
  return [...urls.entries()];
};
export { tierInfo, kindLabel };
