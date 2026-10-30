import { html } from '../util.js';
import { GRADES, LAYERS, layerInfo, CONTRIB_GRADE_LABELS } from '../taxonomy.js';

// DATA submissions: info, photo, lore, link. Moderated; approved ones become part
// of the listing's full file. (Comments and the board are separate: social.)
const listingSelect = (ctx, sel, required = true) => html`<label>Listing<select name="listing_id" ${required ? 'required' : ''}><option value="">${required ? 'Choose a listing…' : 'None: this is a new property'}</option>
  ${ctx.feed.listings.map((l) => html`<option value="${l.id}" ${sel === l.id ? 'selected' : ''}>${l.name} · ${l.place}</option>`)}</select></label>`;

const rulesCheck = html`<label class="check"><input type="checkbox" name="rules" required> <span>This follows the <a href="#/rules" target="_blank">community rules</a>: public records or my own first-hand experience, no names or details of living private people, nothing gathered by trespassing.</span></label>`;
const queueNote = html`<p class="queue-note">⚖ Every submission goes to the <b>moderation queue</b> and appears only after a moderator approves it. Approved submissions become part of the listing’s full file. You can track the status on your <a href="#/account">account page</a>.</p>`;
const send = (ctx) => html`<button class="btn" ${ctx.me ? '' : 'disabled'}>Send for review</button>`;

export async function contribute(ctx, q) {
  const type = q.get('type') || 'info', lid = q.get('listing') || '', isNew = q.get('new') === '1';
  const l = ctx.feed.byId.get(lid);
  const tabs = [['info', '✒ Info or correction'], ['photo', '🗄 Photo or document'], ['lore', '🕯 Lore or story'], ['link', '🔗 Link']];
  return html`<div class="page-head"><h1>Submit to the archive</h1><p class="muted">${l ? html`For <a href="#/l/${l.id}">${l.name}</a>, ${l.place}.` : 'Add info, photos, lore or links to a listing, or suggest a new property.'}</p></div>
  <div class="tabs">${tabs.map(([k, t]) => html`<a class="${type === k ? 'on' : ''}" href="#/contribute?type=${k}${lid ? '&listing=' + lid : ''}">${t}</a>`)}</div>
  ${!ctx.me ? html`<div class="signin-nudge"><p>Sign in to submit.</p><button class="btn" data-signin>Sign in</button></div>` : ''}
  <div class="with-side"><div>
  ${type === 'info' ? html`<form class="form" data-submit="info">
    ${listingSelect(ctx, lid)}
    <label>About<select name="field"><option value="history">History</option><option value="story">Story</option><option value="price">Price or status</option><option value="address">Address or map point</option><option value="facts">Facts</option><option value="other">Other</option></select></label>
    <label>What should be added or corrected?<textarea name="text" rows="5" required minlength="15" maxlength="3000"></textarea></label>
    <label>Sources<textarea name="sources" rows="2" required maxlength="2000" placeholder="Links or citations (newspaper, date, page, archive)"></textarea></label>
    ${rulesCheck}${queueNote}${send(ctx)}</form>` : ''}
  ${type === 'photo' ? html`<form class="form" data-submit="photo">
    ${listingSelect(ctx, lid)}
    <label>What is it?<select name="doc_type" required><option value="photo">Photo I took</option><option value="postcard">Postcard</option><option value="newspaper">Newspaper clipping</option><option value="map">Map (Sanborn, plat)</option><option value="record">Public record (deed, permit, directory)</option><option value="other">Other</option></select></label>
    <label>Era<select name="era"><option value="current">Current</option><option value="historic">Historic</option></select></label>
    <label>Title<input name="title" required maxlength="120"></label>
    <label>Caption and provenance<textarea name="caption" rows="3" required maxlength="1000" placeholder="What it shows, when, where it came from (archive, collection, your own camera)."></textarea></label>
    <label>Credit line<input name="credit" maxlength="120" placeholder="How you’d like to be credited"></label>
    <label>File (JPG, PNG, WEBP or PDF, up to 10 MB)<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label>
    <div class="rights"><b>Rights (required)</b>
      <label class="check"><input type="checkbox" name="rights_confirmed" required> <span>I took this photo myself, or the item is public domain, or I have written permission to share it. I grant Twisted Deeds a non-exclusive, revocable licence to display it with credit.</span></label>
      <label class="check"><input type="checkbox" name="public_ground" required> <span>If it’s a photo of the property, I took it from a public place. No trespassing, no shots into windows, no identifiable occupants, faces or licence plates.</span></label>
      <label class="check"><input type="checkbox" name="not_listing" required> <span>It is <b>not</b> copied from a real-estate listing or news site (those stay on the original page).</span></label></div>
    ${queueNote}${send(ctx)}</form>` : ''}
  ${type === 'lore' ? html`<form class="form" data-submit="lore">
    ${listingSelect(ctx, lid)}
    <label>Your connection<select name="relation" required><option value="">Choose…</option><option value="grew-up-near">I grew up near it</option><option value="family">Family connection</option><option value="lived-there">I lived there</option><option value="worked-there">I worked there</option><option value="visited">I visited (public areas or open house)</option><option value="researcher">I researched it (records, archives)</option><option value="other">Other</option></select></label>
    <label>Era it’s about (optional)<input name="era" maxlength="40" placeholder="e.g. 1970s, 1890–1910"></label>
    <label>Title<input name="title" required maxlength="140" placeholder="The story my grandmother told…"></label>
    <label>Lore or story<textarea name="text" rows="8" required minlength="40" maxlength="6000" placeholder="Tell it plainly. Say who told it and when. Label legend as legend. Leave out living private people."></textarea></label>
    <label>Sources (optional)<textarea name="sources" rows="2" maxlength="2000"></textarea></label>
    ${rulesCheck}${queueNote}${send(ctx)}</form>` : ''}
  ${type === 'link' ? html`<form class="form" data-submit="link">
    ${listingSelect(ctx, isNew ? '' : lid, false)}
    <p class="small muted">Leave the listing empty to suggest a <b>new property</b> that is for sale now and has a documented dark history or strong story.</p>
    <label>Link<input name="url" type="url" required placeholder="https://"></label>
    <label>Label<input name="label" maxlength="140" required placeholder="e.g. 1931 newspaper story about the fire"></label>
    <label>Town, county, state (new property only)<input name="place" maxlength="120" placeholder="Horton, Jackson County, MI"></label>
    <label>What kind of story? (new property only)<select name="grade"><option value="">Not sure</option>${Object.entries(CONTRIB_GRADE_LABELS).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
    <label>Why it matters<textarea name="why" rows="4" required minlength="15" maxlength="3000"></textarea></label>
    ${rulesCheck}${queueNote}${send(ctx)}</form>` : ''}
  </div><aside class="sidebar">
    <section class="box"><h4>What we’re looking for</h4><ul class="small"><li>Dated newspaper items, death notices, court records</li><li>Old postcards, Sanborn maps, directory pages</li><li>Your own photos taken from the street</li><li>Local lore, clearly labeled as lore</li></ul></section>
    <section class="box warn"><h4>Please don’t</h4><ul class="small"><li>Name or describe living private people (owners, occupants, neighbours)</li><li>Post rumours as facts</li><li>Copy listing photos or news photos</li><li>Trespass for a photo</li></ul></section>
    <section class="box"><h4>Submissions vs comments</h4><p class="small">Submissions add to a listing’s <b>file</b>. To just talk, use the comments on a listing or the <a href="#/board">community board</a>.</p></section></aside></div>`;
}
