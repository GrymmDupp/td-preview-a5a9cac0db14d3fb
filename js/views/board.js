import { html, plural } from '../util.js';
import { threadItem } from './listing.js';

// SOCIAL (b): the ONE general community board for the whole site. Posts + replies
// (one table, parent_id), pre-moderated, newest first. No sub-boards, no votes.
export async function board(ctx) {
  const posts = await ctx.be.listBoard();
  const signedIn = !!ctx.me;
  return html`<div class="page-head"><h1>Community board</h1><p class="muted">One board for the whole site: research questions, finds, tips. To talk about one listing, use the comments on its page.</p></div>
  <div class="with-side"><div>
    ${signedIn ? html`<form class="composer" data-new-board><input name="title" maxlength="140" placeholder="Title" required>
      <textarea name="body" rows="3" placeholder="What’s on your mind? Public records and first-hand only; no living private people." required minlength="2" maxlength="6000"></textarea>
      <div class="row"><label class="check"><input type="checkbox" required> <span>I follow the <a href="#/rules">community rules</a></span></label><button class="btn sm">Post</button></div>
      <p class="muted small">Posts and replies are reviewed by a moderator before they’re public.</p></form>`
    : html`<div class="signin-nudge"><p>Sign in to post on the board.</p><button class="btn sm" data-signin>Sign in</button></div>`}
    ${posts.length ? posts.map((p) => threadItem(p, p.replies, { type: 'board_post', replyAttr: 'data-board-reply', signedIn })) : html`<p class="muted">No posts yet.</p>`}
  </div><aside class="sidebar">
    <section class="box"><h4>Board rules</h4><ul class="small"><li>Public records and first-hand only</li><li>No names or details of living private people</li><li>Never trespass or contact occupants</li><li>Everything is reviewed before it appears</li></ul><a class="small" href="#/rules">Community rules →</a></section>
    <section class="box"><h4>Adding to a file?</h4><p class="small">Facts, photos, lore and links for a listing go through <a href="#/contribute">Submit</a>, not the board. Approved submissions become part of that listing’s full file.</p></section>
  </aside></div>`;
}
