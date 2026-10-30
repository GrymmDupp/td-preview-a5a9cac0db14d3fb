import { html, fmtDate, ago, plural, safeUrl, host } from '../util.js';
import { gradeBadge, layerChip, statusPill, plate, authorName, exampleTag, pendingTag, reportBtn, sourceLinks, listingCard, kindLabel, unlockPrice, membersLine, priceTier, TIER_LABEL } from '../components.js';
import { STATES, tierInfo } from '../taxonomy.js';
import { displayableImages } from '../feed.js';

const SIG = { landmark: 'National Historic Landmark', register: 'National Register of Historic Places', district: 'Historic district', local: 'Local record' };
const LANE = { institution: 'Closed institution', inn: 'Inn or theater', death: 'Ordinary death', attraction: 'Failed attraction', disaster: 'Disaster', bundle: 'Business included' };
const REL = { 'grew-up-near': 'Grew up nearby', family: 'Family connection', 'lived-there': 'Lived there', visited: 'Visited (public areas)', 'worked-there': 'Worked there', researcher: 'Researcher', other: 'Other' };
const STORY_FIELDS = { architecturalNotes: 'Architectural notes', vacancyYears: 'Vacancy', failureReason: 'Why it failed', significanceNote: 'Significance' };
export const para = (t) => String(t || '').split(/\n{2,}|\n/).filter(Boolean).map((p) => html`<p>${p}</p>`);

// One threaded list (top level + one level of replies). Used for listing comments
// (type 'comment') and for the general board (type 'board_post').
export function threadItem(row, replies, { type, replyAttr, signedIn }) {
  return html`<article class="post" id="${type}-${row.id}"><div class="post-main">
    <div class="post-meta">${authorName(row.author)} <time datetime="${row.created_at}">${ago(row.created_at)}</time> ${exampleTag(row)} ${pendingTag(row)}</div>
    ${row.title ? html`<h4>${row.title}</h4>` : ''}
    <div class="post-body">${para(row.body)}</div>
    <div class="post-actions">${signedIn ? html`<button class="link" data-toggle-reply="${row.id}">Reply</button>` : ''}${reportBtn(type, row.id)}</div>
    <div class="replies">${replies.map((r) => html`<div class="reply" id="${type}-${r.id}"><div>
      <div class="post-meta">${authorName(r.author)} <time>${ago(r.created_at)}</time> ${exampleTag(r)} ${pendingTag(r)} ${reportBtn(type, r.id)}</div>
      <div class="post-body">${para(r.body)}</div></div></div>`)}
      ${signedIn ? html`<form class="reply-form" ${replyAttr}="${row.id}" hidden><textarea name="body" rows="2" placeholder="Reply. Public records and first-hand only." required maxlength="3000"></textarea>
      <div class="row"><span class="muted small">Replies are reviewed before they appear.</span><button class="btn sm">Send reply</button></div></form>` : ''}
    </div></div></article>`;
}

function previewFacts(l) {
  return [
    ['Tier', tierInfo(l.tier).label], ['Grade', l.gradeI.label], ['Category', l.layerI.label], l.storyCategory && ['Story category', l.storyCategory],
    ['Type', kindLabel(l.kind)], l.facts && ['Facts', l.facts], ['Address', l.address], ['Asking', l.price], ['Status', l.status],
    l.significance && ['Significance', SIG[l.significance] || l.significance], l.lane && ['Lane', LANE[l.lane] || l.lane],
    l.extra.verification && ['Verification', l.extra.verification],
    ['Logged', fmtDate(l.logged)], ['Last checked', fmtDate(l.lastChecked)], l.soldOn && ['Sold on', fmtDate(l.soldOn)],
    l.geo_precision && ['Map point', l.geo_precision === 'town' ? 'Town centre only (approximate)' : 'Street address'],
  ].filter(Boolean);
}

const communityItem = (s) => html`<div class="file-item ${s.kind}">
  ${s.kind === 'photo' ? html`<figure class="media-card">${s.payload?.data_url ? html`<img src="${s.payload.data_url}" alt="${s.payload.title}">` : html`<div class="doc-ph">${s.payload?.doc_type || 'photo'}<small>placeholder</small></div>`}
    <figcaption><strong>${s.payload?.title}</strong><span>${s.payload?.caption}</span><span class="muted small">Credit ${s.payload?.credit || s.author?.handle} ${exampleTag(s)}</span></figcaption></figure>` : ''}
  ${s.kind === 'lore' ? html`<div><span class="kind">Lore${s.payload?.relation ? ' · ' + (REL[s.payload.relation] || s.payload.relation) : ''}${s.payload?.era ? ' · ' + s.payload.era : ''}</span> ${exampleTag(s)}<h4>${s.payload?.title}</h4>${para(s.payload?.text)}</div>` : ''}
  ${s.kind === 'info' ? html`<div><span class="kind">Added info · ${s.payload?.field}</span> ${exampleTag(s)}${para(s.payload?.text)}${s.payload?.sources ? html`<p class="small"><b>Sources:</b> ${s.payload.sources}</p>` : ''}</div>` : ''}
  ${s.kind === 'link' ? html`<div><span class="kind">Link</span> ${exampleTag(s)} <a href="${safeUrl(s.payload?.url) || '#'}" target="_blank" rel="noopener nofollow">${s.payload?.label || host(s.payload?.url)}</a>${s.payload?.why ? html`<p class="small muted">${s.payload.why}</p>` : ''}</div>` : ''}
  <div class="small muted">Submitted by ${authorName(s.author)} · approved ${fmtDate(s.moderated_at || s.created_at)} ${reportBtn('submission', s.id)}</div></div>`;

function fullFile(l, f) {
  const sf = Object.entries(f.storyFields || {}).filter(([, v]) => v);
  const src = sourceLinks(l, f);
  return html`<section class="full-file" id="file">
  <div class="file-head"><h2>🔓 Full file</h2><span class="muted small">Unlocked on your account. Yours permanently, on every device you sign in on.</span></div>
  <section class="block"><h3>Full story</h3>${f.story ? para(f.story) : html`<p class="muted">Story not written yet.</p>`}</section>
  <section class="block"><h3>History</h3>${f.history ? para(f.history) : html`<p class="muted">History not written yet.</p>`}</section>
  ${f.timeline?.length ? html`<section class="block"><h3>Timeline</h3><ol class="timeline">${f.timeline.map((t) => html`<li><b>${t.year}</b><span>${t.text}</span></li>`)}</ol><p class="muted small">Built from the dated lines in this file.</p></section>` : ''}
  <section class="block"><h3>Lore</h3>${f.lore?.length ? html`<ul class="lore">${f.lore.map((x) => html`<li>${x}</li>`)}</ul><p class="muted small">Lore and reported sightings are witness claims, not fact.</p>` : html`<p class="muted">No lore recorded beyond the story.</p>`}</section>
  ${f.ownershipChain || sf.length ? html`<section class="block"><h3>Ownership chain & story notes</h3>${f.ownershipChain ? html`<p><b>Ownership chain:</b> ${f.ownershipChain}</p>` : ''}
    ${sf.length ? html`<dl class="facts">${sf.map(([k, v]) => html`<dt>${STORY_FIELDS[k]}</dt><dd>${v}</dd>`)}</dl>` : ''}</section>` : ''}
  <section class="block"><h3>Citations & sources</h3>${f.citation ? html`<p>${f.citation}</p>` : html`<p class="muted">No citation yet.</p>`}
    <ul class="sources">${src.map(([u, label]) => html`<li><a href="${u}" target="_blank" rel="noopener nofollow">${label}</a> <span class="muted">${host(u)}</span></li>`)}</ul></section>
  <section class="block"><h3>Community archive <small class="muted">${plural(f.community.length, 'approved submission')}</small></h3>
    ${f.community.length ? html`<div class="file-items">${f.community.map(communityItem)}</div>` : html`<p class="muted">No approved submissions yet.</p>`}
    <a class="btn sm ghost" href="#/contribute?listing=${l.id}">＋ Add info, a photo, lore or a link</a></section>
  <section class="block"><h3>Dossier</h3>${typeof f.dossier === 'string' && f.dossier ? para(f.dossier) : f.dossier ? html`<p>A research dossier exists for this file.</p><p class="muted small">The dossier text is being prepared for members (listing_full.dossier_md). Internal scoring and listing numbers are never included.</p>` : html`<p class="muted">No dossier for this file yet.</p>`}</section>
  </section>`;
}

function lockedPanel(ctx, l, counts, signedIn) {
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  const inc = [['Full story, history and timeline'], ['Citations and sources'], ['Full lore'], l.hasStoryFields && ['Ownership chain and Strong Story notes'],
    [`Community archive: ${n ? [counts.photo && plural(counts.photo, 'photo'), counts.lore && plural(counts.lore, 'lore story', 'lore stories'), counts.info && plural(counts.info, 'added fact'), counts.link && plural(counts.link, 'link')].filter(Boolean).join(', ') : 'all approved photos, docs and stories'}`],
    l.dossier && ['The dossier']].filter(Boolean);
  return html`<section class="locked" id="file"><div class="lock-fade" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
  <div class="lock-card"><div class="lock-ic" aria-hidden="true">🔒</div><h2>Unlock the full file</h2>
    <p class="price-line">One time · yours permanently on this account, on every device</p>
    <ul class="incl">${inc.map(([t]) => html`<li>${t}</li>`)}</ul>
    <a class="btn big" href="#/unlock/${encodeURIComponent(l.id)}">${unlockPrice(ctx)} Unlock this file</a>
    ${ctx.membership ? html`<p class="small muted member-line">${TIER_LABEL[priceTier(ctx.membership)]}.</p>`
      : html`<p class="small muted member-line">${membersLine(l.id)}</p>`}
    ${signedIn ? '' : html`<p class="small muted">You’ll be asked to sign in first, so the unlock is saved to your account.</p>`}</div></section>`;
}

export async function listing(ctx, q, id) {
  const l = ctx.feed.byId.get(id);
  if (!l) return html`<div class="empty-state"><h1>Not in the archive</h1><p>This listing isn’t in the current feed. It may have sold and been retired. <a href="#/browse">Browse the archive</a>.</p></div>`;
  const [comments, samples, full, counts] = await Promise.all([ctx.be.listComments(l.id), ctx.be.samplePhotos(l.id), ctx.be.getFullFile(l.id), ctx.be.fileCounts(l.id)]);
  const top = comments.filter((c) => !c.parent_id), kids = (c) => comments.filter((r) => r.parent_id === c.id);
  const imgs = displayableImages(l);
  const nearby = ctx.feed.listings.filter((x) => x.state === l.state && x.id !== l.id).slice(0, 3);
  const signedIn = !!ctx.me;
  const unlocked = !!full && ctx.unlocks.includes(l.id);

  return html`<nav class="crumbs"><a href="#/">Listings</a> › ${l.state ? html`<a href="#/browse?state=${l.state}">${STATES[l.state] || l.state}</a> › ` : ''}<span>${l.name}</span></nav>
  <header class="detail-head" style="--c:${l.layerI.color}">
    <div class="detail-badges">${gradeBadge(l, true)} ${layerChip(l)} ${statusPill(l)} ${unlocked ? html`<span class="file-state open">🔓 Full file unlocked</span>` : full ? html`<span class="file-state open">Moderator view</span>` : html`<span class="file-state">🔒 Free preview</span>`}</div>
    <h1>${l.name}</h1>
    <div class="detail-place">${l.place}</div>
    <div class="detail-price"><span>${l.price || 'Price not listed'}</span> <span class="muted">· ${l.status}</span>
      ${safeUrl(l.url) ? html`<a class="btn ghost" href="${safeUrl(l.url)}" target="_blank" rel="noopener nofollow">View original listing ↗</a>` : ''}</div>
  </header>

  <section class="gallery">
    <div class="g-main">${imgs[0] ? html`<img src="${imgs[0].src || imgs[0].url}" alt="${imgs[0].caption}">` : plate(l, 'big')}</div>
    <div class="g-strip">
      ${imgs.slice(1).map((i) => html`<figure class="g-item"><img src="${i.src || i.url}" alt="${i.caption}" loading="lazy"><figcaption>${i.caption}</figcaption></figure>`)}
      ${samples.map((m) => html`<figure class="g-item community">${m.payload?.data_url ? html`<img src="${m.payload.data_url}" alt="${m.payload.title}" loading="lazy">` : html`<div class="doc-ph">photo<small>placeholder</small></div>`}<figcaption>${m.payload?.title} · ${m.payload?.credit || '@' + m.author?.handle} ${exampleTag(m)}</figcaption></figure>`)}
      <div class="g-ref"><span class="era">Sample photos</span><strong>${samples.length ? 'Community sample photo' : 'Archival placeholder'}</strong><span class="src">Listing and broker photos stay on the <a href="${safeUrl(l.url) || '#'}" target="_blank" rel="noopener nofollow">original listing</a>.</span></div>
    </div>
  </section>

  <div class="with-side detail">
  <div class="detail-main">
    <section class="block preview"><h2>Preview</h2>
      <p class="summary">${l.preview.summary || 'Summary not written yet.'}</p>
      ${l.preview.teaser ? html`<p class="teaser"><span class="kicker">Lore teaser</span> ${l.preview.teaser}</p>` : ''}</section>
    <section class="block"><h2>Basic facts</h2><dl class="facts">${previewFacts(l).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl></section>
    ${full ? fullFile(l, full) : lockedPanel(ctx, l, counts, signedIn)}

    <section class="block comments" id="comments"><h2>Comments <small class="muted">${comments.length}</small></h2>
      <p class="muted small">Public discussion about this listing. Separate from submissions: to add facts, photos, lore or links to the file, use <a href="#/contribute?listing=${l.id}">Submit</a>.</p>
      ${signedIn ? html`<form class="composer" data-new-comment="${l.id}">
          <textarea name="body" rows="3" placeholder="Add a comment. Public records and first-hand only; no living private people." required minlength="2" maxlength="3000"></textarea>
          <div class="row"><label class="check"><input type="checkbox" required> <span>I follow the <a href="#/rules">community rules</a></span></label><button class="btn sm">Post comment</button></div>
          <p class="muted small">Comments are reviewed by a moderator before they’re public.</p></form>`
        : html`<div class="signin-nudge"><p>Sign in to comment.</p><button class="btn sm" data-signin>Sign in</button></div>`}
      ${top.length ? top.map((c) => threadItem(c, kids(c), { type: 'comment', replyAttr: 'data-comment-reply', signedIn })) : html`<p class="muted">No comments yet.</p>`}
    </section>
  </div>
  <aside class="sidebar">
    <section class="box warn"><h4>Before you visit</h4><p>This is a public-interest archive, not a real-estate broker. Many of these places are <b>occupied homes</b>. View from public ground only, never trespass, and don’t contact owners or occupants about the history. To ask about buying, use the <a href="${safeUrl(l.url) || '#'}" target="_blank" rel="noopener nofollow">original listing</a>.</p></section>
    <section class="box"><h4>Submit to this file</h4><ul class="contrib"><li><a href="#/contribute?type=info&listing=${l.id}">✒ Add info or a correction</a></li><li><a href="#/contribute?type=photo&listing=${l.id}">🗄 Add a photo or document</a></li><li><a href="#/contribute?type=lore&listing=${l.id}">🕯 Add lore or a story</a></li><li><a href="#/contribute?type=link&listing=${l.id}">🔗 Add a link</a></li></ul>
      <p class="small muted">Moderated. Approved submissions become part of the full file.</p>
      <button class="link small" data-report="listing:${l.id}">⚑ Report a problem with this page</button></section>
    ${nearby.length ? html`<section class="box"><h4>More in ${STATES[l.state] || l.state}</h4>${nearby.map((x) => listingCard(x, { ...ctx, compact: true }))}</section>` : ''}
  </aside></div>`;
}
