// Admin-only panels for the moderation page (#/moderate): corrections / removal requests, and simple visit counts.
// Roles come from public.admin_emails -> profiles.role = 'admin'; RLS enforces it (this file only displays).
import { html, ago, esc } from '../util.js';

const LABEL = { view: 'Page views', listing_open: 'Listings opened', unlock_click: 'Unlock clicks', pricing_view: 'Pricing views', pricing_click: 'Pricing button clicks', share_click: 'Share clicks', radio_toggle: 'Radio toggles', effects_toggle: 'Effects toggles' };
const KIND = { correction: 'Correction', removal: 'Removal', other: 'Other' };
const STATUS = { new: 'New', reviewing: 'Reviewing', done: 'Done', declined: 'Declined' };

const sum = (rows, ev) => rows.filter((r) => r.event === ev).reduce((a, r) => a + Number(r.n), 0);
const top = (rows, ev, k = 8) => rows.filter((r) => r.event === ev && r.ref).sort((a, b) => b.n - a.n).slice(0, k);

export async function analyticsPanel(ctx) {
  let d7, d30;
  if (ctx.be.mode === 'supabase' && !ctx.be.features?.analytics) return html`<section><h2>Visits at a glance</h2><p class="muted small">Not switched on yet: it needs the launch-readiness database migration.</p></section>`;
  try { [d7, d30] = await Promise.all([ctx.be.analyticsSummary(7), ctx.be.analyticsSummary(30)]); }
  catch (e) { return html`<section><h2>Visits at a glance</h2><p class="muted small">Not available yet (${esc(e.message)}). It needs the launch-readiness database migration.</p></section>`; }
  const name = (id) => ctx.feed.byId.get(id)?.name || id;
  return html`<section class="an-panel"><h2>Visits at a glance</h2>
    <p class="small muted">Anonymous tallies: no cookies, no IP addresses, no accounts. Nobody who sends Do Not Track, or has switched counting off, is counted.</p>
    <table class="tbl an-tbl"><thead><tr><th></th><th>Last 7 days</th><th>Last 30 days</th></tr></thead><tbody>
      ${Object.entries(LABEL).map(([k, t]) => html`<tr><td>${t}</td><td>${sum(d7, k)}</td><td>${sum(d30, k)}</td></tr>`)}</tbody></table>
    <h4>Most opened listings, 30 days</h4>
    ${top(d30, 'listing_open').length ? html`<ol class="small">${top(d30, 'listing_open').map((r) => html`<li>${name(r.ref)} <span class="muted">· ${r.n}</span></li>`)}</ol>` : html`<p class="small muted">None yet.</p>`}
    <h4>Where people go, 30 days</h4>
    ${top(d30, 'view').length ? html`<p class="small">${top(d30, 'view').map((r) => html`<span class="an-chip">${r.ref} <b>${r.n}</b></span> `)}</p>` : html`<p class="small muted">None yet.</p>`}
  </section>`;
}

export async function correctionsPanel(ctx) {
  let rows;
  if (ctx.be.mode === 'supabase' && !ctx.be.features?.corrections) return html`<section><h2>Corrections &amp; removal requests</h2><p class="muted small">Not switched on yet: it needs the launch-readiness database migration.</p></section>`;
  try { rows = await ctx.be.listCorrections(); }
  catch (e) { return html`<section><h2>Corrections &amp; removal requests</h2><p class="muted small">Not available yet (${esc(e.message)}). It needs the launch-readiness database migration.</p></section>`; }
  const open = rows.filter((r) => r.status === 'new' || r.status === 'reviewing').length;
  const L = (id) => ctx.feed.byId.get(id);
  return html`<section class="corr-queue"><h2>Corrections &amp; removal requests <small>${open} open</small></h2>
    <p class="small muted">From the Stories &amp; Corrections form. Only administrators can read these. A removal means the place has to come out of the Master Sheet; nothing here edits listing data.</p>
    ${rows.length ? rows.map((r) => html`<div class="mod-item"><div class="post-meta"><span class="kind ${r.kind === 'removal' ? 'warn' : ''}">${KIND[r.kind] || r.kind}</span> <span class="kind">${STATUS[r.status] || r.status}</span> · ${ago(r.created_at)}${r.relation ? html` · ${r.relation}` : ''}</div>
      ${r.page || r.listing_id ? html`<p class="small">About: ${L(r.listing_id) ? html`<a href="#/l/${r.listing_id}">${L(r.listing_id).name}</a>` : r.page}</p>` : ''}
      <blockquote>${r.message}</blockquote>
      ${r.reply_to ? html`<p class="small muted">Reply to: ${r.reply_to}</p>` : html`<p class="small muted">No reply address given.</p>`}
      ${r.admin_note ? html`<p class="small muted">Your note: ${r.admin_note}</p>` : ''}
      <form class="mod-actions" data-correction-status="${r.id}"><select name="status">${Object.entries(STATUS).map(([k, t]) => html`<option value="${k}" ${k === r.status ? 'selected' : ''}>${t}</option>`)}</select>
        <input name="note" placeholder="Private note (optional)" maxlength="300"><button class="btn sm ok">Save</button></form></div>`)
    : html`<p class="muted">No requests yet.</p>`}</section>`;
}
