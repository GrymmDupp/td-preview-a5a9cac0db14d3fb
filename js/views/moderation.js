import { html, ago } from '../util.js';
import { authorName, exampleTag } from '../components.js';

// One queue for everything user-written: DATA (submissions) and SOCIAL (comments,
// board posts and replies). Nothing is public until approved here.
export async function moderation(ctx) {
  if (!ctx.me) return html`<div class="empty-state"><h1>Moderation queue</h1><p>Sign in with a moderator account.</p><button class="btn" data-signin>Sign in</button></div>`;
  const isMod = ['moderator', 'admin'].includes(ctx.me.role);
  if (!isMod) return html`<div class="empty-state"><h1>Moderation queue</h1><p>This page is for moderators.</p>
    ${ctx.be.isPreview ? html`<p class="muted">Preview: you can act as a moderator to try the workflow.</p><button class="btn" data-preview-mod="1">Act as moderator (preview)</button>` : ''}</div>`;
  const qd = await ctx.be.listQueue();
  const L = (id) => ctx.feed.byId.get(id);
  const lk = (id) => L(id) ? html`<a href="#/l/${id}">${L(id).name}</a>` : html`<span class="muted">No listing</span>`;
  const actions = (table, row) => html`<form class="mod-actions" data-moderate="${table}:${row.id}"><input name="note" placeholder="Note to author (optional)" maxlength="300">
    ${table === 'submissions' && row.kind === 'photo' ? html`<label class="check small"><input type="checkbox" name="is_sample"> <span>Also show as a free-preview sample photo</span></label>` : ''}
    <button class="btn sm ok" name="d" value="approved">Approve</button><button class="btn sm ghost" name="d" value="rejected">Reject</button></form>`;
  const total = qd.submissions.length + qd.comments.length + qd.board.length + qd.reports.length;
  return html`<div class="page-head"><h1>Moderation queue <small class="muted">${total} waiting</small></h1>
    <p class="muted">Nothing is public until it’s approved here. Check each item against the <a href="#/rules">community rules</a>: public record or first-hand, no living private people, no trespass, rights confirmed for photos.</p>
    ${ctx.be.isPreview ? html`<button class="btn sm ghost" data-preview-mod="0">Stop acting as moderator</button>` : ''}</div>
  <div class="mod-grid">
  <section><h2>Reports <small>${qd.reports.length}</small></h2>${qd.reports.length ? qd.reports.map((r) => html`<div class="mod-item report"><div class="post-meta"><span class="kind warn">${r.reason}</span> on ${r.target_type.replace('_', ' ')} · ${ago(r.created_at)} ${exampleTag(r)}</div>
    <p>${r.details || html`<span class="muted">No details</span>`}</p>${r.target ? html`<blockquote>${r.target.title || r.target.body || r.target.payload?.title || ''}</blockquote>` : html`<p class="muted small">Target: ${r.target_type} ${r.target_id}</p>`}
    <div class="mod-actions"><button class="btn sm ghost" data-resolve="${r.id}:dismissed">Dismiss</button><button class="btn sm danger" data-resolve="${r.id}:removed">Remove content</button></div></div>`) : html`<p class="muted">No open reports.</p>`}</section>
  <section><h2>Submissions <small>${qd.submissions.length}</small></h2><p class="small muted">Data: info, photos, lore, links. Approved items join the listing’s full file.</p>
    ${qd.submissions.length ? qd.submissions.map((s) => html`<div class="mod-item"><div class="post-meta"><span class="kind">${s.kind}</span> ${authorName(s.author)} · ${lk(s.listing_id)} · ${ago(s.created_at)} ${exampleTag(s)}</div>
    ${s.payload?.data_url ? html`<img class="mod-img" src="${s.payload.data_url}" alt="">` : ''}
    <dl class="facts small">${Object.entries(s.payload || {}).filter(([k, v]) => k !== 'data_url' && v !== '' && v != null).map(([k, v]) => html`<dt>${k}</dt><dd>${String(v)}</dd>`)}${s.kind === 'photo' ? html`<dt>rights</dt><dd>${s.rights_confirmed ? '✔ confirmed by submitter' : '✘ not confirmed'}</dd>` : ''}</dl>
    ${s.kind === 'link' && !s.listing_id ? html`<p class="small muted">New-property suggestion. Approving marks it accepted; add it to the Master Sheet yourself. The site never edits the feed.</p>` : ''}
    ${actions('submissions', s)}</div>`) : html`<p class="muted">Queue is clear.</p>`}</section>
  <section><h2>Listing comments <small>${qd.comments.length}</small></h2>${qd.comments.length ? qd.comments.map((c) => html`<div class="mod-item"><div class="post-meta"><span class="kind">${c.parent_id ? 'reply' : 'comment'}</span> ${authorName(c.author)} · ${lk(c.listing_id)} · ${ago(c.created_at)} ${exampleTag(c)}</div><p>${c.body}</p>${actions('comments', c)}</div>`) : html`<p class="muted">Queue is clear.</p>`}</section>
  <section><h2>Board posts & replies <small>${qd.board.length}</small></h2>${qd.board.length ? qd.board.map((b) => html`<div class="mod-item"><div class="post-meta"><span class="kind">${b.parent_id ? 'reply' : 'post'}</span> ${authorName(b.author)} ${b.parent ? html`on <em>${b.parent.title}</em>` : ''} · ${ago(b.created_at)} ${exampleTag(b)}</div>${b.title ? html`<h4>${b.title}</h4>` : ''}<p>${b.body}</p>${actions('board_posts', b)}</div>`) : html`<p class="muted">Queue is clear.</p>`}</section>
  </div>`;
}
