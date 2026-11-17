// Commission a Research File (#/research): the Paid Research Pack intake. A SEPARATE service:
// requests live only in the research_requests table (no link to listings, packs or the feed) and the
// research itself is done offline in a private archive. Nothing here ever reaches the listings.
// Prices come from js/pricing.js. Until a pack's Payment Link exists, requests are saved as 'requested' and confirmed by email.
import { html, raw, ago, esc, fmtDate } from '../util.js';
import { scrollShell, wordmark, rule } from '../tome.js';
import { PRICING, money, isOpen, product } from '../pricing.js';

export const RESEARCH_STATUS = {
  requested: 'Requested', paid: 'Paid', in_progress: 'In progress', delivered: 'Delivered', declined: 'Declined',
};

const SECTIONS = [
  ['Ownership & title', 'The chain of conveyances in the deed books, with owner names exactly as they are recorded.'],
  ['The house itself', 'Build date, style, size and materials from the assessor, the register and the old maps.'],
  ['Tax & assessment', 'Assessment history and tax status from the public roll.'],
  ['Permits & violations', 'Building permits, code enforcement and condemnation records where they are public.'],
  ['History & news', 'What the newspapers, city directories and local histories said about the house and the land.'],
  ['Maps', 'Fire-insurance maps, plats, topographic sheets and flood maps, then and now.'],
  ['Imagery', 'Historic and current images, each one credited, and only where the licence allows it.'],
  ['Public safety records', 'Incidents tied to the address itself, as published by agencies and the press.'],
  ['Notes', 'Lore and loose ends, plainly labeled as such and kept apart from the record.'],
];

const LABELS = [
  ['confirmed', 'Confirmed', 'Backed by a primary record, or by two or more independent sources.'],
  ['reported', 'Reported', 'Found in a single secondary source and not yet corroborated.'],
  ['notfound', 'Not found', 'Searched for and not located. The file lists where we looked.'],
];

function requestForm(ctx) {
  if (!ctx.me) return html`<div class="rf-signin"><p>Sign in to commission a file. Your requests stay private to your account.</p>
    <button class="btn" data-signin>Sign in</button></div>`;
  return html`<form class="form rf-form" data-research>
    <label>Property address<input name="address" required minlength="5" maxlength="300" autocomplete="off"
      placeholder="Street, city, state and ZIP of the property"></label>
    <fieldset class="rf-tier"><legend>Choose a pack</legend>
      ${['pack_record', 'pack_dossier'].map((id, i) => html`<label class="check"><input type="radio" name="tier" value="${id}" ${i === 0 ? 'checked' : ''}> <span><b>${product(id).name.replace('Research pack: ', '')}</b> · ${money(product(id).price)} · ${product(id).days} business days</span></label>`)}
      <label class="check"><input type="checkbox" name="rush" value="1"> <span>Rush it: +${money(product('rush').price)}, 72 hours</span></label>
    </fieldset>
    <label>What would you like to know? <span class="muted">(optional)</span><textarea name="purpose" rows="4" maxlength="1000"
      placeholder="Your interest in the property and anything you would like the file to look at closely"></textarea></label>
    <label class="check"><input type="checkbox" name="ack" required> <span>I have read the terms below. This file is about a <b>property</b>, not a person; it is not a consumer report, and I will not use it for tenant, employment, credit or insurance screening.</span></label>
    <p class="small muted">${isOpen('pack_record') ? '' : html`Online payment <span class="soon">Opening soon</span>. `}No payment is taken now. We will email you to confirm the price and turnaround, and send the payment link, before any work begins.${ctx.be.isPreview ? ' Preview: requests are stored only in this browser.' : ''}</p>
    <button class="btn">Send the request</button></form>`;
}

// The customer's commissioned files, each as a scroll. A delivered file's scroll breaks open to its
// delivery record (reference, address, dates, what the file holds); undelivered ones stay sealed.
// Nothing here is research data: the dossier itself is a standalone PDF made in the private archive.
const OPEN = ['requested', 'paid', 'in_progress'];
function deliveredContent(r) {
  return `<div class="sc-in">
    ${wordmark('line sc-brand')}
    <div class="line sc-kick">A Research File · delivered</div>
    <h2 class="line">${esc(r.address)}</h2>
    ${rule('line')}
    <dl class="sc-kv">
      <div class="line sc-kvrow"><dt>Reference</dt><dd>${esc(r.reference)}</dd></div>
      <div class="line sc-kvrow"><dt>Commissioned</dt><dd>${esc(fmtDate(r.created_at))}</dd></div>
      <div class="line sc-kvrow"><dt>Delivered</dt><dd>${esc(fmtDate(r.delivered_at))}</dd></div>
    </dl>
    <p class="line">Your Research File has been delivered as a standalone PDF. Questions about it? Quote the reference above.</p>
    <h3 class="line">What the file holds</h3>
    <ol class="sc-ol">${SECTIONS.map(([t, d]) => `<li class="line"><b>${esc(t)}</b>: ${esc(d)}</li>`).join('')}</ol>
    <h3 class="line">How each finding is marked</h3>
    <ul class="sc-src">${LABELS.map(([, t, d]) => `<li class="line"><b>${esc(t)}</b>: ${esc(d)}</li>`).join('')}</ul>
    <p class="line sc-note">About the property, not the people. Not a consumer report: never use it for tenant, employment, credit or insurance screening.</p>
    <div class="line sc-btns"><button class="bk-btn ghost" type="button" data-reroll>Roll it back up</button></div>
  </div>`;
}
export function researchScrolls(rows, { emptyShell = true } = {}) {
  const live = (rows || []).filter((r) => r.status !== 'declined');
  const declined = (rows || []).filter((r) => r.status === 'declined');
  if (!live.length && !emptyShell) return '';
  return html`<div class="rf-scrolls">
    ${live.length ? live.map((r) => html`<div><p class="rf-scroll-meta"><span class="kind rf-st rf-${r.status}">${RESEARCH_STATUS[r.status] || r.status}</span> <code>${r.reference}</code> · requested ${ago(r.created_at)}</p>
      ${raw(r.status === 'delivered'
        ? scrollShell({ id: r.id, kind: 'research', name: 'Research File', label: `Research File ${r.reference}: the scroll`, content: deliveredContent(r), hint: 'Tap the seal' })
        : scrollShell({ id: r.id, kind: 'research', name: 'Research File', label: `Research File ${r.reference}, still sealed`, locked: true,
            lockedNote: OPEN.includes(r.status) ? `Sealed until your file is delivered · ${RESEARCH_STATUS[r.status]}` : 'Sealed', hint: 'Sealed' }))}</div>`)
    : html`<div>${raw(scrollShell({ id: 'research-empty', kind: 'research', name: 'Your Research File', label: 'An empty, sealed research scroll', locked: true,
        lockedNote: 'Your commissioned file will arrive here, sealed', hint: 'Sealed' }))}</div>`}
    ${declined.map((r) => html`<div class="mod-item"><div class="post-meta"><span class="kind rf-st rf-declined">Declined</span> <code>${r.reference}</code> · ${ago(r.created_at)}</div><p>${r.address}</p></div>`)}
  </div>`;
}
function myRequests(rows, signedIn) {
  if (!signedIn) return '';
  return html`<section class="rf-mine"><h2>Your research files</h2>${researchScrolls(rows)}</section>`;
}

export async function research(ctx) {
  const mine = ctx.me && ctx.be.myResearchRequests ? await ctx.be.myResearchRequests().catch(() => []) : [];
  return html`<section class="hero research-hero">
    <div><p class="research-kicker">A private commission</p>
    <h1>Commission a <em>Research File</em></h1>
    <div class="hero-intro">
      <p>Every house keeps its own ledger. Most of it is already written down, just scattered.</p>
      <p>Name any address and we will go into the public record for you: the deed books and the assessor's roll, the permit counters, the newspaper morgue, the old fire-insurance maps. What we find is bound into a single <b>Research File</b>, a standalone PDF where every finding carries its source and an honest label.</p>
      <p>Quiet work, done from the archive. We never knock on the door, never call the owner or the neighbors, and never go looking for the people who live there.</p>
    </div>
    <div class="hero-stats"><span><b>Record</b> ${money(product('pack_record').price)} · ${product('pack_record').days} business days</span><span><b>Dossier</b> ${money(product('pack_dossier').price)} · ${product('pack_dossier').days} business days</span><span><b>Rush</b> +${money(product('rush').price)} · 72 hours</span><span><b>Delivered as</b> a standalone PDF</span></div></div>
  </section>
  <div class="rf-grid">
    <section class="rf-col"><h2>What the file holds</h2>
      <ol class="rf-sections">${SECTIONS.map(([t, d]) => html`<li><b>${t}</b><span>${d}</span></li>`)}</ol>
      <h2>How every finding is marked</h2>
      <ul class="rf-labels">${LABELS.map(([k, t, d]) => html`<li><span class="rf-tag rf-${k}">${t}</span><span>${d}</span></li>`)}</ul>
      <p class="small muted">Each item cites the record or publication it came from, with a link or archive reference, so you can walk the trail yourself.</p>
    </section>
    <section class="rf-col"><h2>Request a file</h2>
      <p class="small muted">Members take ${Math.round(PRICING.packDiscount * 100)}% off: Record ${money(product('pack_record_member').price)}, Dossier ${money(product('pack_dossier_member').price)}. <a href="#/patronage">See Patronage</a>.</p>
      ${requestForm(ctx)}
      ${myRequests(mine, !!ctx.me)}
    </section>
  </div>
  <section class="prose rf-terms" id="research-terms"><h2>Terms of the research</h2>
    <ul>
      <li><b>Public sources only.</b> Public records and published material: government records, libraries, archives and the press. No private databases, no pretexting, no contact with owners, occupants, sellers or neighbors.</li>
      <li><b>About the property, not the people.</b> Owner names appear only as they are written in deed and ownership records. The file does not contain phone numbers, email addresses, relatives, workplaces or the movements of anyone who lives there.</li>
      <li><b>Not a consumer report.</b> We are not a consumer reporting agency and this file is not a consumer report under the Fair Credit Reporting Act. It may not be used, in whole or in part, to decide anyone's eligibility for housing or tenancy, employment, credit or insurance, or for any other purpose covered by the FCRA.</li>
      <li><b>Requests we decline.</b> We decline any request that appears aimed at locating, tracking, contacting or harassing a person, and any request we cannot complete within these terms.</li>
      <li><b>Informational only.</b> The file is historical and informational research. It is not a title opinion or title insurance, not a survey and not an inspection, and it is not legal advice. Records can be incomplete or wrong; confirm anything that matters with the issuing office or a licensed professional.</li>
      <li><b>Images.</b> Every image is credited, and is used only where its licence or public-domain status allows.</li>
      <li><b>Private to you.</b> Your request and your file are kept private. They are not published on this site and never become part of the listings.</li>
    </ul>
  </section>`;
}

// Moderator section for #/moderate: every request, newest first, with status updates.
export function researchModSection(rows) {
  if (!rows) return '';
  const open = rows.filter((r) => ['requested', 'paid', 'in_progress'].includes(r.status)).length;
  return html`<section class="rf-queue"><h2>Research requests <small>${open} open</small></h2>
    <p class="small muted">Paid Research Pack intake (separate service). Screen each request against the research terms: property-focused and public sources only; decline anything aimed at locating or harassing a person. Work happens offline in the private archive under the same reference; nothing here ever touches the listings.</p>
    ${rows.length ? rows.map((r) => html`<div class="mod-item"><div class="post-meta"><span class="kind rf-st rf-${r.status}">${RESEARCH_STATUS[r.status] || r.status}</span> <code>${r.reference}</code> · ${r.email || 'no email'} · ${ago(r.created_at)}</div>
      <p><b>${r.address}</b></p>${r.purpose ? html`<blockquote>${r.purpose}</blockquote>` : ''}
      ${r.notes ? html`<p class="small muted rf-notes">${r.notes}</p>` : ''}
      <form class="mod-actions" data-research-status="${r.id}"><select name="status">${Object.entries(RESEARCH_STATUS).map(([k, t]) => html`<option value="${k}" ${k === r.status ? 'selected' : ''}>${t}</option>`)}</select>
        <input name="note" placeholder="Internal note (optional)" maxlength="300"><button class="btn sm">Update</button></form></div>`)
    : html`<p class="muted">No research requests yet.</p>`}</section>`;
}
