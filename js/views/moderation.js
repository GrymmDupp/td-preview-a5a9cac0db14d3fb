import { html, ago, esc } from '../util.js';
import { authorName } from '../components.js';
import { researchModSection } from './research.js';
import { MASTER_SHEET_STAGING_URL } from '../config.js';
import { analyticsPanel, correctionsPanel, suggestionsPanel, prefsDemandPanel } from './admin_panels.js';

// One queue for everything user-written: DATA (submissions) and SOCIAL (comments,
// board posts and replies). Nothing is public until approved here.

const HIDE_KEYS = new Set(['data_url', 'lat', 'lon', 'acc', 'accuracy', 'capture_lat', 'capture_lon', 'gps', 'coords', 'position', 'capture']);
function captureFacts(s) {
  const p = s.payload || {};
  const lat = s.capture_lat ?? p.lat, lon = s.capture_lon ?? p.lon;
  const map = Number.isFinite(+lat) && Number.isFinite(+lon) ? html`<p class="small"><a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=18/${lat}/${lon}" target="_blank" rel="noopener">See the capture point on a map</a> (review only; this point is not shown publicly)</p>` : '';
  const rest = Object.entries(p).filter(([k, v]) => !HIDE_KEYS.has(k) && v !== '' && v != null);
  return html`${map}<dl class="facts small">
    ${p.place_name ? html`<dt>place</dt><dd>${p.place_name}${p.priv ? ' · private home (keep the photo off the public card)' : ''}</dd>` : ''}
    ${p.captured_at ? html`<dt>taken</dt><dd>${p.captured_at}</dd>` : ''}
    ${p.note || p.text ? html`<dt>note</dt><dd>${p.note || p.text}</dd>` : ''}
    ${p.credit ? html`<dt>credit</dt><dd>${p.credit}</dd>` : ''}
    ${rest.filter(([k]) => !['place_name','captured_at','note','text','credit','title','caption','priv','public_ground','public_road','not_from_listing','new_place','newPlace','place_kind','field','era','doc_type','file_name','capture_id'].includes(k)).map(([k, v]) => html`<dt>${k}</dt><dd>${String(v)}</dd>`)}
    ${s.kind === 'photo' ? html`<dt>rights</dt><dd>${s.rights_confirmed ? '✔ confirmed by submitter' : '✘ not confirmed'}</dd>` : ''}
  </dl>`;
}

// ---- The Keeper's Desk: one screen, tabs with counts, big Approve / Reject. Oldest first.
// Tabs: Photos & notes | Field reports | Board | Comments | Places | Reports | Payments | Desk notes | Stats.
const TABS = [
  ['photos', 'Photos & notes'], ['field', 'Field reports'], ['board', 'Board'], ['comments', 'Comments'],
  ['places', 'Places'], ['reports', 'Reports'], ['payments', 'Payments'], ['notes', 'Desk notes'], ['stats', 'Stats'],
];
const CLEAR = {
  photos: ['Every photo and note has been read.', 'No new submissions are waiting at the door.'],
  field: ['The field is quiet.', 'No quick captures or field reports are waiting.'],
  board: ['The board is settled.', 'No posts or replies are waiting for a keeper.'],
  comments: ['Nothing murmurs in the margins.', 'No listing comments are waiting.'],
  places: ['No new places whispered tonight.', 'Nothing suggested from the map or the property form.'],
  reports: ['No one has raised a hand.', 'No open reports.'],
  payments: ['No payments to match.', 'Every request is settled.'],
  notes: ['The desk is tidy.', 'No corrections or research requests are open.'],
};
const isNewProp = (s) => s.kind === 'link' && !s.listing_id;
const isField = (s) => !!(s.field_capture || s.payload?.capture);
// Badge total = things that need a keeper's decision. Unconfirmed payments and desk notes
// (corrections, research) have their own tab counts but stay out of the badge, so it can reach zero.
export const modBadgeTotal = (c) => c ? ['photos', 'field', 'places', 'board', 'comments', 'reports'].reduce((a, k) => a + (Number(c[k]) || 0), 0) : 0;
export const modTabCounts = (qd, c, extra = {}) => {
  const np = qd.submissions.filter((s) => !isField(s) && isNewProp(s)).length;
  return {
    photos: qd.submissions.filter((s) => !isField(s) && !isNewProp(s)).length,
    field: qd.submissions.filter(isField).length,
    board: qd.board.length, comments: qd.comments.length, reports: qd.reports.length,
    places: c ? Number(c.places) || 0 : np,
    payments: extra.payments ?? Number(c?.payments) ?? 0,
    notes: c ? (Number(c.corrections) || 0) + (Number(c.research) || 0) : 0,
  };
};

const allClear = (tab) => html`<div class="mod-clear"><span class="mod-clear-ic" aria-hidden="true">☾</span><h3>${CLEAR[tab][0]}</h3><p class="muted">${CLEAR[tab][1]} All caught up.</p></div>`;

export async function moderation(ctx, q) {
  const canMod = ctx.canMod || ['moderator', 'admin'].includes(ctx.me?.role);
  if (!ctx.me) return html`<div class="empty-state"><h1>The Keeper’s Desk</h1><p>Sign in with a moderator account.</p><button class="btn" data-signin>Sign in</button></div>`;
  if (!canMod) return html`<div class="empty-state"><h1>The Keeper’s Desk</h1><p>This page is for moderators.</p>
    ${ctx.be.isPreview ? html`<p class="muted">Preview: you can act as a moderator to try the workflow.</p><button class="btn" data-preview-mod="1">Act as moderator (preview)</button>` : ''}</div>`;
  const isAdmin = ctx.me.role === 'admin';
  const [qd, c] = await Promise.all([ctx.be.listQueue(), ctx.be.modCounts ? ctx.be.modCounts().catch(() => null) : null]);
  // Payment Link mode: unlock requests waiting for a moderator to match the payment in Stripe.
  const pays = ctx.be.paymentLinkCheckout && ctx.be.listUnlockRequests ? await ctx.be.listUnlockRequests('pending').catch((e) => { console.warn(e.message); return []; }) : null;
  const counts = modTabCounts(qd, c, { payments: pays?.length });
  const total = modBadgeTotal(counts);
  ctx.modCounts = { ...(c || {}), ...counts, total }; ctx.setModBadge?.(total);
  const visible = TABS.filter(([k]) => k !== 'payments' || pays);
  const pick = q?.get('tab');
  let tab = visible.some(([k]) => k === pick) ? pick : (visible.find(([k]) => k !== 'stats' && counts[k] > 0)?.[0] || 'photos');

  const L = (id) => ctx.feed.byId.get(id);
  const lk = (id) => L(id) ? html`<a href="#/l/${id}">${L(id).name}</a>` : html`<span class="muted">No listing</span>`;
  const actions = (table, row) => html`<form class="mod-actions" data-moderate="${table}:${row.id}"><input name="note" placeholder="Note to author (optional)" maxlength="300">
    ${table === 'submissions' && (row.field_capture || row.payload?.capture) ? html`<input type="hidden" name="field_capture" value="1">${row.payload?.priv ? html`<input type="hidden" name="field_priv" value="1">` : ''}` : ''}
    ${table === 'submissions' && row.kind === 'photo' ? html`<label class="check small"><input type="checkbox" name="is_sample" ${((row.field_capture || row.payload?.capture) && !row.payload?.priv) ? 'checked' : ''}> <span>Also show as a free-preview sample photo</span></label>` : ''}
    <button class="btn ok mod-big" name="d" value="approved">Approve</button><button class="btn ghost mod-big mod-no" name="d" value="rejected">Reject</button></form>`;
  const subCard = (s) => html`<div class="mod-item"><div class="post-meta"><span class="kind">${isField(s) ? 'field ' + s.kind : s.kind}</span> ${authorName(s.author)} · ${s.listing_id ? lk(s.listing_id) : (s.payload?.new_place || s.payload?.newPlace || s.payload?.place_name ? html`<span>New place: ${s.payload?.place_name || 'unnamed'}</span>` : html`<span class="muted">No listing</span>`)} · ${ago(s.created_at)}</div>
    ${s.payload?.data_url ? html`<a class="mod-img-link" href="${s.payload.data_url}" target="_blank" rel="noopener"><img class="mod-img" src="${s.payload.data_url}" alt="Submitted photo (tap to enlarge)"></a>` : ''}
    ${isField(s) ? captureFacts(s) : html`<dl class="facts small">${Object.entries(s.payload || {}).filter(([k, v]) => k !== 'data_url' && v !== '' && v != null).map(([k, v]) => html`<dt>${k}</dt><dd>${String(v)}</dd>`)}${s.kind === 'photo' ? html`<dt>rights</dt><dd>${s.rights_confirmed ? '✔ confirmed by submitter' : '✘ not confirmed'}</dd>` : ''}</dl>`}
    ${isNewProp(s) ? html`<p class="small muted">New-property suggestion. Approving marks it accepted; add it to the Master Sheet yourself. The site never edits the feed.</p>` : ''}
    ${actions('submissions', s)}</div>`;
  const list = (rows, render, tabKey) => rows.length ? rows.map(render) : allClear(tabKey);

  let body = '';
  if (tab === 'photos') body = html`<p class="small muted">Info, photos, lore and links. Approved items join the listing’s full file. Oldest first.</p>${list(qd.submissions.filter((s) => !isField(s) && !isNewProp(s)), subCard, 'photos')}`;
  else if (tab === 'field') body = html`<p class="small muted">Quick captures and field reports from the road. Approved photos of public places become free-preview samples; private homes stay in the unlocked file. GPS is for review only.</p>${list(qd.submissions.filter(isField), subCard, 'field')}`;
  else if (tab === 'board') body = html`<p class="small muted">Board posts and replies.</p>${list(qd.board, (b) => html`<div class="mod-item"><div class="post-meta"><span class="kind">${b.parent_id ? 'reply' : 'post'}</span> ${authorName(b.author)} ${b.parent ? html`on <em>${b.parent.title}</em>` : ''} · ${ago(b.created_at)}</div>${b.title ? html`<h4>${b.title}</h4>` : ''}<p>${b.body}</p>${actions('board_posts', b)}</div>`, 'board')}`;
  else if (tab === 'comments') body = html`<p class="small muted">Comments on listing pages.</p>${list(qd.comments, (c2) => html`<div class="mod-item"><div class="post-meta"><span class="kind">${c2.parent_id ? 'reply' : 'comment'}</span> ${authorName(c2.author)} · ${lk(c2.listing_id)} · ${ago(c2.created_at)}</div><p>${c2.body}</p>${actions('comments', c2)}</div>`, 'comments')}`;
  else if (tab === 'places') {
    const sugg = await suggestionsPanel(ctx);
    const np = qd.submissions.filter((s) => !isField(s) && isNewProp(s));
    body = html`${np.length ? html`<h3 class="mod-sub">New-property suggestions <small>${np.length}</small></h3>${np.map(subCard)}` : ''}${sugg}${!np.length && String(sugg).includes('Nothing waiting right now') ? allClear('places') : ''}`;
  }
  else if (tab === 'reports') body = html`<p class="small muted">Reports of comments, posts and submissions.</p>${list(qd.reports, (r) => html`<div class="mod-item report"><div class="post-meta"><span class="kind warn">${r.reason}</span> on ${r.target_type.replace('_', ' ')} · ${ago(r.created_at)}</div>
    <p>${r.details || html`<span class="muted">No details</span>`}</p>${r.target ? html`<blockquote>${r.target.title || r.target.body || r.target.payload?.title || ''}</blockquote>` : html`<p class="muted small">Target: ${r.target_type} ${r.target_id}</p>`}
    <div class="mod-actions"><button class="btn ghost mod-big" data-resolve="${r.id}:dismissed">Dismiss</button><button class="btn danger mod-big" data-resolve="${r.id}:removed">Remove content</button></div></div>`, 'reports')}`;
  else if (tab === 'payments') body = html`<p class="small muted">Backup only: paid requests normally unlock themselves instantly (the buyer’s page asks the verify-unlock function, which reads Stripe). Anything still here hasn’t shown up as paid in Stripe for this exact reference and $ amount. To confirm by hand, find the payment in the Stripe dashboard (Payments → search, or the payment’s <b>client_reference_id</b>, which starts with the reference below). Confirm only a payment you can see in Stripe; rejecting leaves the file locked.</p>
    ${list(pays || [], (p) => html`<div class="mod-item"><div class="post-meta"><span class="kind">$${Number(p.amount).toFixed(2)}</span> <code>${p.reference}</code> · @${p.handle || '?'} · ${lk(p.listing_id)} · ${ago(p.created_at)}</div>
      <p class="small muted">client_reference_id: <code>${p.client_reference_id}</code></p>
      <div class="mod-actions"><button class="btn ok mod-big" data-confirm-paid="${p.id}">Confirm paid</button><button class="btn ghost mod-big mod-no" data-reject-paid="${p.id}">Reject</button></div></div>`, 'payments')}`;
  else if (tab === 'notes') {
    if (!isAdmin) body = html`<p class="muted">Corrections and research requests are for the administrator.</p>`;
    else {
      const rreq = ctx.be.listResearchRequests ? await ctx.be.listResearchRequests().catch((e) => { console.warn(e.message); return null; }) : null;
      body = html`${await correctionsPanel(ctx)}${researchModSection(rreq)}`;
    }
  }
  else if (tab === 'stats') {
    if (!isAdmin) body = html`<p class="muted">Stats are for the administrator.</p>`;
    else { const [visits, demand] = await Promise.all([analyticsPanel(ctx), prefsDemandPanel(ctx)]); body = html`${visits}${demand}`; }
  }

  const oldest = c?.oldest ? ago(c.oldest) : '';
  return html`<div class="mod-desk">
  <div class="page-head mod-head"><h1>The Keeper’s Desk</h1>
    <p class="mod-total ${total ? '' : 'zero'}"><b>${total}</b> ${total === 1 ? 'thing waits' : 'things wait'} for a keeper${oldest && total ? html` · oldest ${oldest}` : ''}</p>
    ${counts.payments || counts.notes ? html`<p class="small muted">${[counts.payments ? `${counts.payments} payment ${counts.payments === 1 ? 'request' : 'requests'} to match` : '', counts.notes ? `${counts.notes} on the desk-notes tab` : ''].filter(Boolean).join(' · ')}</p>` : ''}
    <p class="muted small">Nothing is public until it’s approved here. Check each item against the <a href="#/rules">community rules</a>: public record or first-hand, no living private people, no trespass, rights confirmed for photos.</p>
    ${ctx.be.isPreview ? html`<button class="btn sm ghost" data-preview-mod="0">Stop acting as moderator</button>` : ''}
    <p class="small mod-links"><a href="#/account">Account</a>${MASTER_SHEET_STAGING_URL ? html` · <a href="${MASTER_SHEET_STAGING_URL}" target="_blank" rel="noopener">Scout Staging sheet ↗</a>` : ''}</p></div>
  <nav class="mod-tabs" aria-label="Moderation sections">${visible.map(([k, t]) => html`<a class="mod-tab ${k === tab ? 'on' : ''} ${counts[k] ? 'has' : ''}" href="#/moderate?tab=${k}" ${k === tab ? 'aria-current="page"' : ''}>${t}${k !== 'stats' ? html` <span class="mod-n">${counts[k] || 0}</span>` : ''}</a>`)}</nav>
  <section class="mod-pane" aria-live="polite"><h2 class="mod-h">${visible.find(([k]) => k === tab)[1]}${tab !== 'stats' ? html` <small>${counts[tab] || 0}</small>` : ''}</h2>${body}</section>
  </div>`;
}
