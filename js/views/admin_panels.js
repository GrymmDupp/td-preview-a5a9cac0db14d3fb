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

// Twisted Passport: places travelers suggested from the live map ("Suggest a place"). Admins only (RLS).
// Approving does NOT publish anything: approved places go on a list for the Research Director (Download for research),
// who checks them like any Archive Scout find. The traveler who suggested it gets a Scout stamp in their passport.
const SUG = { new: 'Waiting', approved: 'Approved', rejected: 'Turned down' };
export async function suggestionsPanel(ctx) {
  const head = html`<h2>Suggested places</h2>`;
  if (ctx.be.mode !== 'supabase' || !ctx.be.passportReady) return html`<section>${head}<p class="muted small">Only on the live site.</p></section>`;
  let rows;
  try { if (!(await ctx.be.passportReady())) return html`<section>${head}<p class="muted small">Not switched on yet: it needs the Twisted Passport database file (20261121_passport.sql) run once in Supabase.</p></section>`; rows = await ctx.be.listPlaceSuggestions(); }
  catch (e) { return html`<section>${head}<p class="muted small">Not available yet (${esc(e.message)}).</p></section>`; }
  const waiting = rows.filter((r) => r.status === 'new'), done = rows.filter((r) => r.status !== 'new').slice(0, 30), ok = rows.filter((r) => r.status === 'approved').length;
  const osm = (r) => `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=18/${r.lat}/${r.lon}`;
  const card = (r) => html`<div class="mod-item sug-item"><div class="post-meta"><span class="kind ${r.status === 'new' ? '' : r.status === 'approved' ? 'ok' : 'warn'}">${SUG[r.status] || r.status}</span> · sent ${ago(r.created_at)}${r.public_road ? html` · seen from a public road` : ''}</div>
      <h4>${r.name}</h4>${r.place_id ? html`<p class="small">A tip about ${ctx.feed.byId.get(r.place_id) ? html`<a href="#/l/${encodeURIComponent(r.place_id)}">${ctx.feed.byId.get(r.place_id).name}</a>` : r.place_id}, already in the app</p>` : ''}<blockquote>${r.story}</blockquote>
      <p class="small">${r.source_url ? html`<a href="${r.source_url}" target="_blank" rel="noopener nofollow ugc">Their source link</a> · ` : html`<span class="muted">No source link</span> · `}<a href="${osm(r)}" target="_blank" rel="noopener">See the spot on a map</a></p>
      ${r.admin_note ? html`<p class="small muted">Your note: ${r.admin_note}</p>` : ''}
      <form class="mod-actions" data-place-suggestion="${r.id}"><input name="note" placeholder="Private note (optional)" maxlength="300">
        ${r.status !== 'approved' ? html`<button class="btn sm ok" name="d" value="approved">Approve for research</button>` : ''}${r.status !== 'rejected' ? html`<button class="btn sm ghost" name="d" value="rejected">Turn down</button>` : ''}${r.status !== 'new' ? html`<button class="btn sm ghost" name="d" value="new">Put back in the queue</button>` : ''}</form></div>`;
  return html`<section class="sug-queue"><h2>Suggested places <small>${waiting.length} waiting</small></h2>
    <p class="small muted">Places travelers sent from the live map. Nobody else can see these, and nothing here goes on the map or into the Archive by itself. <b>Approve for research</b> if it looks real and worth checking: it goes on the research list, and the traveler gets a Scout stamp. <b>Turn down</b> anything that looks made up, unkind, or asks people to go onto private property.</p>
    <p><button class="btn sm" data-export-suggestions>Download the research list (${ok})</button></p>
    ${waiting.length ? waiting.map(card) : html`<p class="muted">Nothing waiting right now.</p>`}
    ${done.length ? html`<details><summary class="small">Already reviewed (${done.length})</summary>${done.map(card)}</details>` : ''}</section>`;
}
export async function exportSuggestions(ctx) {
  const rows = (await ctx.be.listPlaceSuggestions()).filter((r) => r.status === 'approved')
    .map((r) => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, story: r.story, source_url: r.source_url || null, about_place_id: r.place_id || null, seen_from_public_road: !!r.public_road, approved_at: r.reviewed_at, note: r.admin_note || null }));
  const doc = { kind: 'twisted-passport-suggestions', note: 'Traveler suggestions approved for research. Not verified: check every one against public records before it goes anywhere.', exported_at: new Date().toISOString(), count: rows.length, places: rows };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  a.download = 'passport-suggestions-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
  return rows.length;
}
