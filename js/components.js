// Shared UI pieces: grade labels, listing cards, the archival "plate" image, price, lock.
import { html, raw, esc, fmtDate, truncate, plural, safeUrl, host } from './util.js';
import { CONFIG } from './config.js';
import { statusInfo, kindLabel, tierInfo } from './taxonomy.js';
import { isNew } from './feed.js';

export const gradeBadge = (l, big = false) => l.tier === 1
  ? html`<span class="badge ddd ${big ? 'big' : ''}" style="--c:${l.gradeI.color}" title="Triple-D: ${l.gradeI.label}"><b>Triple-D</b><i>${l.gradeI.icon} ${l.gradeI.label}</i></span>`
  : html`<span class="badge story ${big ? 'big' : ''}" title="Strong Story${l.storyCategory ? ': ' + l.storyCategory : ''}">❧ Story${l.storyCategory ? html`<i>${l.storyCategory}</i>` : ''}</span>`;
export const layerChip = (l) => html`<a class="layer" style="--c:${l.layerI.color}" href="#/browse?layer=${encodeURIComponent(l.layer || '')}"><span class="dot"></span>${l.layerI.label}</a>`;
export const statusPill = (l) => { const s = statusInfo(l.status); return html`<span class="status ${s.cls}">${s.label}</span>`; };
export const exampleTag = (row) => row?.is_example ? html`<span class="example" title="Example content for the preview. Not a real person or real recollection.">Example</span>` : '';
export const pendingTag = (row) => row?.status === 'pending' ? html`<span class="pending" title="Only you can see this until a moderator approves it">Awaiting review</span>` : '';

// The archival plate stands in for listing photos (which are the broker's and are
// not reproduced here). Deterministic per listing, tinted by its layer color.
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
<span class="plate-cap">${l.year ? `c. ${l.year} · ` : ''}${esc(l.city)}${l.state ? ', ' + l.state : ''}</span></div>`);
}

export const money = (n) => `$${Number(n).toFixed(Number.isInteger(Number(n)) ? 0 : 2)}`;
const P = CONFIG.pricing;
// Price tier for an (effective) membership: 'standard' | 'monthly' | 'lifetime'.
export const priceTier = (m) => (m?.plan === 'lifetime' ? 'lifetime' : m?.plan === 'monthly' ? 'monthly' : 'standard');
export const tierAmount = (tier) => ({ standard: P.unlockPrice, monthly: P.monthlyUnlockPrice, lifetime: P.lifetimeUnlockPrice })[tier];
// The unlock price for the current viewer: $9 / $7 (Monthly) / $5 (Lifetime).
export const unlockPrice = (ctx) => money(tierAmount(priceTier(ctx?.membership)));
export const standardPrice = () => money(P.unlockPrice);
export const monthlyUnlockPrice = () => money(P.monthlyUnlockPrice);
export const lifetimeUnlockPrice = () => money(P.lifetimeUnlockPrice);
export const monthlyPrice = () => money(P.monthlyPrice);
export const lifetimePrice = () => money(P.lifetimePrice);
export const TIER_LABEL = { standard: 'standard', monthly: 'Monthly member price', lifetime: 'Lifetime member price' };
// Quiet line under unlock buttons for non-members.
export const membersLine = (from = '') => {
  const q = from ? `&from=${encodeURIComponent(from)}` : '';
  return raw(`Members unlock for less: <a href="#/membership?plan=monthly${q}">Monthly ${monthlyPrice()}/mo</a> (unlocks ${monthlyUnlockPrice()}) or <a href="#/membership?plan=lifetime${q}">Lifetime ${lifetimePrice()} one-time</a> (unlocks ${lifetimeUnlockPrice()})`);
};

export function listingCard(l, { comments = {}, unlocks = [], compact = false } = {}) {
  const n = comments[l.id] || 0, open = unlocks.includes(l.id);
  return html`<article class="card ${l.tier === 1 ? 't1' : 't2'} ${compact ? 'compact' : ''}" style="--c:${l.layerI.color}">
  <a class="card-media" href="#/l/${encodeURIComponent(l.id)}" aria-label="${l.name}">${plate(l)}
    ${isNew(l) ? html`<span class="ribbon">New</span>` : ''}</a>
  <div class="card-body">
    <div class="card-badges">${gradeBadge(l)} ${layerChip(l)} ${statusPill(l)}</div>
    <h3><a href="#/l/${encodeURIComponent(l.id)}">${l.name}</a></h3>
    <div class="card-place">${l.place.replace(/,\s*[A-Z]{2}$/, '')}${l.state ? html`, <a href="#/browse?state=${l.state}">${l.state}</a>` : ''}</div>
    <div class="card-price">${l.price || 'Price not listed'}</div>
    ${compact ? '' : html`<p class="card-story">${truncate(l.blurb, 220)}</p>`}
    ${l.facts && !compact ? html`<div class="card-facts">${l.facts}</div>` : ''}
    <div class="card-foot">
      <span class="posted">Posted ${fmtDate(l.logged)}</span>
      <a class="cc" href="#/l/${encodeURIComponent(l.id)}?at=comments">💬 ${plural(n, 'comment')}</a>
      ${open ? html`<span class="file-state open">🔓 Full file</span>` : html`<a class="file-state" href="#/l/${encodeURIComponent(l.id)}">🔒 Preview</a>`}
    </div>
  </div></article>`;
}

// Plain handle, no link: there are no public profiles.
export const authorName = (p) => p ? html`<span class="author">@${p.handle}</span>` : html`<span class="author muted">deleted account</span>`;

export const reportBtn = (type, id) => html`<button class="link small report-btn" data-report="${type}:${id}">Report</button>`;

export const sourceLinks = (l, full) => {
  const urls = new Map();
  const add = (u, label) => { const s = safeUrl(u); if (s && !urls.has(s)) urls.set(s, label || host(s)); };
  add(l.url, 'Original listing');
  (full?.sources || []).forEach((u) => add(typeof u === 'string' ? u : u?.url, u?.label));
  (full?.references || []).forEach((i) => add(i.page, `${i.source}${i.caption ? ': ' + i.caption : ''} (reference photos, on the original page)`));
  return [...urls.entries()];
};
export { tierInfo, kindLabel };
