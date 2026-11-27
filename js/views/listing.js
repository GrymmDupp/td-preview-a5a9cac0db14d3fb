import { html, raw, esc, fmtDate, ago, plural, safeUrl, host } from '../util.js';
import { heritageCrossLink, forSaleSeal, archivePlate, mediaCredit, mediaLine, crewLine } from '../components.js';
import { newTag, updatedTag, gradeBadge, layerChip, statusPill, plate, photoCredit, imageType, imgAlt, authorName, pendingTag, reportBtn, sourceLinks, listingCard, kindLabel, unlockPrice, readerLabel, membersLine, viewerTier, TIER_LABEL, trialNote, isTrial, unlockBar, publicUrl, findListingUrl } from '../components.js';
import { STATES, ratingLabel, leatherFor, layerInfo } from '../taxonomy.js';
import { displayableImages, updateLine, isArchived, isArchiveShelf } from '../feed.js';
import { isPrivateHome, publicAreaLabel } from '../privacy.js';
import { isSaved } from '../reveals.js';
import { isUnwritten, unwrittenCard } from '../unwritten.js';
import { loadDossierIndex, dossierEntry } from '../dossiers.js';
import { bookShell, bookCover, pageHead, folio, rule, wordmark, statusSeal, scrollShell } from '../tome.js';
import { fieldReportsHtml } from '../field-covers.js';

const SIG = { landmark: 'National Historic Landmark', register: 'National Register of Historic Places', district: 'Historic district', local: 'Local record' };
const LANE = { institution: 'Closed institution', inn: 'Inn or theater', death: 'Ordinary death', attraction: 'Failed attraction', disaster: 'Disaster', bundle: 'Business included' };
const REL = { 'grew-up-near': 'Grew up nearby', family: 'Family connection', 'lived-there': 'Lived there', visited: 'Visited (public areas)', 'worked-there': 'Worked there', researcher: 'Researcher', other: 'Other' };
const STORY_FIELDS = { architecturalNotes: 'Architectural notes', vacancyYears: 'Vacancy', failureReason: 'Why it failed', significanceNote: 'Significance' };
export const para = (t) => String(t || '').split(/\n{2,}|\n/).filter(Boolean).map((p) => html`<p>${p}</p>`);

// One threaded list (top level + one level of replies). Used for listing comments
// (type 'comment') and for the general board (type 'board_post').
export function threadItem(row, replies, { type, replyAttr, signedIn }) {
  return html`<article class="post" id="${type}-${row.id}"><div class="post-main">
    <div class="post-meta">${authorName(row.author)} <time datetime="${row.created_at}">${ago(row.created_at)}</time> ${pendingTag(row)}</div>
    ${row.title ? html`<h4>${row.title}</h4>` : ''}
    <div class="post-body">${para(row.body)}</div>
    <div class="post-actions">${signedIn ? html`<button class="link" data-toggle-reply="${row.id}">Reply</button>` : ''}${reportBtn(type, row.id)}</div>
    <div class="replies">${replies.map((r) => html`<div class="reply" id="${type}-${r.id}"><div>
      <div class="post-meta">${authorName(r.author)} <time>${ago(r.created_at)}</time> ${pendingTag(r)} ${reportBtn(type, r.id)}</div>
      <div class="post-body">${para(r.body)}</div></div></div>`)}
      ${signedIn ? html`<form class="reply-form" ${replyAttr}="${row.id}" hidden><textarea name="body" rows="2" placeholder="Reply. Public records and first-hand only." required maxlength="3000"></textarea>
      <div class="row"><span class="muted small">Replies are reviewed before they appear.</span><button class="btn sm">Send reply</button></div></form>` : ''}
    </div></div></article>`;
}

function previewFacts(l) {
  return [
    ['Rating', ratingLabel(l)], ['Category', l.layerI.label],
    ['Type', kindLabel(l.kind)], l.facts && ['Facts', l.facts], [isPrivateHome(l) ? 'Area' : 'Address', isPrivateHome(l) ? `${publicAreaLabel(l) || l.place} (a private home: the address is withheld)` : l.address],
    isArchiveShelf(l) ? ['Market', l.status === 'Sold' ? 'Sold. No longer on the market' : 'Not for sale. In the Archive'] : ['Asking', l.price], ['Status', isArchiveShelf(l) ? 'In the Archive' : l.status],
    ...(l.media || []).map((m) => ['As seen on', mediaLine(m)]), l.crewFeatured && ['Also', 'As seen with the Twisted History crew'], l.roadOnly && ['Visiting', 'View from the public road only'],
    l.significance && ['Significance', SIG[l.significance] || l.significance], l.lane && ['Lane', LANE[l.lane] || l.lane],
    l.extra.verification && ['Verification', l.extra.verification],
    ['Added to archive', fmtDate(l.addedAt || l.logged)], ['Last checked', fmtDate(l.lastChecked)], l.soldOn && ['Sold on', fmtDate(l.soldOn)],
    l.geo_precision && ['Map point', l.geo_precision === 'town' ? 'Town centre only (approximate)' : l.geo_precision === 'neighborhood' ? 'Approximate area circle (not the house)' : l.geo_precision === 'township' ? `Whole township (exact site unknown)` : 'Street address'],
  ].filter(Boolean);
}

const communityItem = (s) => html`<div class="file-item ${s.kind}">
  ${s.kind === 'photo' ? html`<figure class="media-card">${s.payload?.data_url ? html`<img src="${s.payload.data_url}" alt="${s.payload.title}">` : html`<div class="doc-ph">${s.payload?.doc_type || 'photo'}<small>no image preview</small></div>`}
    <figcaption><strong>${s.payload?.title}</strong><span>${s.payload?.caption}</span><span class="muted small">Credit ${s.payload?.credit || s.author?.handle}</span></figcaption></figure>` : ''}
  ${s.kind === 'lore' ? html`<div><span class="kind">Lore${s.payload?.relation ? ' · ' + (REL[s.payload.relation] || s.payload.relation) : ''}${s.payload?.era ? ' · ' + s.payload.era : ''}</span><h4>${s.payload?.title}</h4>${para(s.payload?.text)}</div>` : ''}
  ${s.kind === 'info' ? html`<div><span class="kind">Added info · ${s.payload?.field}</span>${para(s.payload?.text)}${s.payload?.sources ? html`<p class="small"><b>Sources:</b> ${s.payload.sources}</p>` : ''}</div>` : ''}
  ${s.kind === 'link' ? html`<div><span class="kind">Link</span> <a href="${safeUrl(s.payload?.url) || '#'}" target="_blank" rel="noopener nofollow">${s.payload?.label || host(s.payload?.url)}</a>${s.payload?.why ? html`<p class="small muted">${s.payload.why}</p>` : ''}</div>` : ''}
  <div class="small muted">Submitted by ${authorName(s.author)} · approved ${fmtDate(s.moderated_at || s.created_at)} ${reportBtn('submission', s.id)}</div></div>`;

// ---------------------------------------------------------------------------------------------
// THE SCROLL: the full file, once it is paid for (or a moderator view). Lines marked .line ink in
// as the parchment unrolls. Content = listing_full only (never the public feed).
const lines = (t, cls = '') => String(t || '').split(/\n{2,}|\n/).filter(Boolean).map((x) => `<p class="line ${cls}">${esc(x)}</p>`).join('');
function scrollItem(s) {
  const P = s.payload || {};
  const by = `<span class="sc-by">Submitted by ${esc(s.author ? readerLabel(s.author) : 'deleted')} · approved ${esc(fmtDate(s.moderated_at || s.created_at))}</span>`;
  if (s.kind === 'photo') return `<figure class="line sc-fig">${P.data_url ? `<div class="sc-frame"><img src="${esc(P.data_url)}" alt="${esc(P.title || '')}"></div>` : ''}<figcaption><b>${esc(P.title)}</b> ${esc(P.caption || '')} · Credit ${esc(P.credit || s.author?.handle || '')}<br>${by}</figcaption></figure>`;
  if (s.kind === 'lore') return `<div class="line sc-item"><b>Lore${P.relation ? ' · ' + esc(REL[P.relation] || P.relation) : ''}${P.era ? ' · ' + esc(P.era) : ''}:</b> ${esc(P.title || '')}${lines(P.text)}${by}</div>`;
  if (s.kind === 'info') return `<div class="line sc-item"><b>Added info · ${esc(P.field || '')}:</b>${lines(P.text)}${P.sources ? `<p class="line"><i>Sources:</i> ${esc(P.sources)}</p>` : ''}${by}</div>`;
  if (s.kind === 'link') { const u = publicUrl(P.url); return `<div class="line sc-item"><b>Link:</b> ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(P.label || host(u))}</a>` : esc(P.label || 'link (listing portal page, not linked)')}${P.why ? ` · ${esc(P.why)}` : ''}<br>${by}</div>`; }
  return '';
}
function fullFileContent(l, f, unlocked) {
  const sf = Object.entries(f.storyFields || {}).filter(([, v]) => v);
  const src = sourceLinks(l, f);
  const story = String(f.story || '').split(/\n{2,}|\n/).filter(Boolean);
  const first = story.shift() || '';
  return `<div class="sc-in">
    ${wordmark('line sc-brand')}
    <div class="line sc-kick">The full file · ${esc(ratingLabel(l))}</div>
    <h2 class="line">${esc(l.name)}</h2>
    <div class="line sc-place">${esc(l.place)}</div>
    ${rule('line')}
    <p class="line sc-note">${unlocked ? 'Unlocked on your account. Yours permanently, on every device you sign in on.' : 'Moderator view: you can read every full file.'}</p>
    ${first ? `<h3 class="line">The Story</h3><p class="line sc-hook"><span class="drop">${esc(first[0])}</span>${esc(first.slice(1))}</p>${story.map((x) => `<p class="line">${esc(x)}</p>`).join('')}` : ''}
    ${f.history ? `<h3 class="line">History</h3>${lines(f.history)}` : ''}
    ${f.timeline?.length ? `<h3 class="line">Timeline</h3><ol class="sc-tl">${f.timeline.map((t) => `<li class="line"><b>${esc(t.year)}</b> ${esc(t.text)}</li>`).join('')}</ol><p class="line sc-small">Built from the dated lines in this file.</p>` : ''}
    <h3 class="line">Lore</h3>${f.lore?.length ? `<ul class="sc-lore">${f.lore.map((x) => `<li class="line">${esc(x)}</li>`).join('')}</ul><p class="line sc-small">Lore and reported sightings are witness claims, not fact.</p>` : '<p class="line sc-empty">No lore recorded beyond the story.</p>'}
    ${f.ownershipChain || sf.length ? `<h3 class="line">Ownership &amp; story notes</h3><dl class="sc-facts">${f.ownershipChain ? `<div class="line"><dt>Ownership chain</dt><dd>${esc(f.ownershipChain)}</dd></div>` : ''}${sf.map(([k, v]) => `<div class="line"><dt>${esc(STORY_FIELDS[k])}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    <h3 class="line">Citations &amp; sources</h3>${f.citation ? `<p class="line">${esc(f.citation)}</p>` : '<p class="line sc-empty">No citation yet.</p>'}
    <ul class="sc-src">${src.map(([u, label]) => `<li class="line"><a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(label)}</a> <span class="sc-host">${esc(host(u))}</span></li>`).join('')}<li class="line"><a href="${esc(findListingUrl(l))}" target="_blank" rel="noopener">Find the current listing</a> <span class="sc-host">address search</span></li></ul>
    <h3 class="line">Field reports</h3>${(f.community || []).filter((s) => s.field_capture || s.payload?.capture).length ? (f.community || []).filter((s) => s.field_capture || s.payload?.capture).map(scrollItem).join('') : '<p class="line sc-empty">No approved field reports yet.</p>'}
    <h3 class="line">Community archive</h3>${(f.community || []).filter((s) => !(s.field_capture || s.payload?.capture)).length ? (f.community || []).filter((s) => !(s.field_capture || s.payload?.capture)).map(scrollItem).join('') : '<p class="line sc-empty">No approved submissions yet.</p>'}
    <h3 class="line">Dossier</h3>${typeof f.dossier === 'string' && f.dossier ? lines(f.dossier) : f.dossier ? '<p class="line">A research dossier exists for this file.</p><p class="line sc-small">The dossier text is being prepared for members. Internal scoring and listing numbers are never included.</p>' : '<p class="line sc-empty">No dossier for this file yet.</p>'}
    <p class="line sc-note">View from public ground only. Many of these places are occupied homes; never trespass or contact the owners or occupants.</p>
    <div class="line sc-btns"><a class="bk-btn gold" href="#/contribute?listing=${encodeURIComponent(l.id)}">Add to this file</a><button class="bk-btn ghost" type="button" data-reroll>Roll it back up</button></div>
    <div class="line sc-sign">${sealFor(l, 96)}</div>
  </div>`;
}
function fullFile(l, f, unlocked) {
  return html`<section class="full-file full-file-wrap" id="file">
    <div class="scroll-intro"><h2>The full file</h2><p class="paid-note">${unlocked ? '🔓 Unlocked on your account · yours for good' : 'Moderator view'}</p><p class="small">It comes sealed. Break the seal to unroll it.</p></div>
    ${raw(scrollShell({ id: l.id, kind: 'file', name: l.name, content: fullFileContent(l, f, unlocked), hint: 'Tap the seal to open your file' }))}
  </section>`;
}

// Payment Link mode: honest state after the account opened the payment page. Nothing is unlocked
// until Stripe shows the payment as paid; verify-unlock then unlocks it instantly.
function pendingReq(ctx, l) {
  const r = ctx.unlockRequests?.get(l.id);
  if (!r || !ctx.be.paymentLinkCheckout) return null;
  if (r.status === 'pending') return html`<div class="pay-pending" role="status"><p><b>Waiting for your payment to clear.</b> The moment Stripe shows it, this file breaks its seal and opens right here. No waiting on us.</p>
    <p><button class="btn sm" data-check-payment="${r.id}">Check payment</button></p>
    <p class="small muted">Reference <code>${r.reference}</code> · started ${fmtDate(r.created_at)}. Didn’t finish paying? <a href="#/unlock/${encodeURIComponent(l.id)}">Open the payment page</a>.</p></div>`;
  if (r.status === 'rejected') return html`<div class="pay-pending" role="status"><p>We couldn’t match a payment for reference <code>${r.reference}</code>.</p>
    <div class="unlock-cta"><a class="btn big" href="#/unlock/${encodeURIComponent(l.id)}" data-unlock-link>Unlock this file · ${unlockPrice(ctx)}</a>${trialNote()}</div></div>`;
  return null;
}

function missingFilePanel(l) {
  return html`<section class="locked" id="file"><div class="lock-card"><h2>The full file couldn’t be opened</h2>
    <p>This file should be open on your account, but it didn’t load. Close and reopen the app so it picks up the latest version, then try again.</p>
    <p><a class="btn" href="#/l/${encodeURIComponent(l.id)}">Try again</a></p></div></section>`;
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
    ${pendingReq(ctx, l) || html`<div class="unlock-cta"><a class="btn big" href="#/unlock/${encodeURIComponent(l.id)}" data-unlock-link>Unlock this file · ${unlockPrice(ctx)}</a>${trialNote()}</div>`}
    ${ctx.membership && !isTrial() ? html`<p class="small muted member-line">${TIER_LABEL[viewerTier(ctx.membership)]}.</p>`
      : html`<p class="small muted member-line">${membersLine(l.id)}</p>`}
    ${signedIn ? '' : html`<p class="small muted">You’ll be asked to sign in first, so the unlock is saved to your account.</p>`}</div></section>
  ${ctx.unlockRequests?.get(l.id)?.status === 'pending' && ctx.be.paymentLinkCheckout ? '' : unlockBar(ctx, html`<a class="btn" href="#/unlock/${encodeURIComponent(l.id)}" data-unlock-link>Unlock this file</a>`)}`;
}


// ---------------------------------------------------------------------------------------------
// THE BOOK: how every listing opens for browsing. Free preview content only (public feed fields).
const YEAR_RE = /\b(1[6-9]\d\d|20[0-2]\d)s?\b/;
// Never split after an initial ("C.L. Pace", "James M. Cox") or a common abbreviation ("St.", "Dr.").
const sentencesOf = (t) => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<!\b(?:v|vs|Sr|Jr|Dr|St|Mr|Mrs|Ms|Mt|Co|No|Ft|Gen|Gov|Capt|Rev|Bros|Inc|[A-Z])\.)(?<=[.!?;])\s+(?=[A-Z0-9"“(])/).filter(Boolean);
const clip = (t, n) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…');
const stop = (t) => (/[.!?”’"')…]$/.test(t.trim()) ? t.trim() : t.trim() + '.');
function previewTimeline(l) {
  const hist = [];
  for (const s of [...sentencesOf(l.preview.summary), ...sentencesOf(l.preview.teaser)]) {
    const m = s.match(YEAR_RE); if (!m) continue;
    hist.push({ y: +m[1], d: m[0], t: clip(stop(s.replace(/^Lore:\s*/i, '')), 150) });
  }
  if (l.year && !hist.some((h) => h.y === l.year)) hist.push({ y: l.year, d: String(l.year), t: 'Built, per the listing facts.' });
  hist.sort((a, b) => a.y - b.y);
  const arch = [];
  if (l.addedAt || l.logged) arch.push({ d: fmtDate(l.addedAt || l.logged), t: 'Added to the Twisted Deeds archive.' });
  if (l.statusChangedAt) arch.push({ d: fmtDate(l.statusChangedAt), t: `Marked ${l.status}.` });
  if (l.soldOn) arch.push({ d: fmtDate(l.soldOn), t: 'Sold.' });
  if (l.lastChecked) arch.push({ d: fmtDate(l.lastChecked), t: `Listing last checked: ${l.status}.` });
  return { hist: hist.slice(0, 6), arch, era: hist.length ? (hist[0].y === hist[hist.length - 1].y ? hist[0].d : `${hist[0].d} – ${hist[hist.length - 1].d}`) : '' };
}
export const sealFor = (l, size) => statusSeal({ top: isArchiveShelf(l) ? 'From the Archive' : l.collection === 'heritage' ? 'Heritage Home' : l.tier === 1 ? 'Twisted Deed' : 'Strong Story',
  bottom: `${isArchiveShelf(l) ? 'Not for sale' : l.status} · checked ${fmtDate(l.lastChecked) || 'n/a'}`, mid: 'TD', era: previewTimeline(l).era, label: `${ratingLabel(l)}, ${l.status}${l.lastChecked ? ', last checked ' + fmtDate(l.lastChecked) : ''}` }, size);
const credText = (i) => String(photoCredit(i)).replace(/<[^>]+>/g, '');
function plateHTML(l, i) {
  if (!i) return `<figure class="tplate empty"><div class="tplate-frame"><div class="tplate-none"><svg viewBox="0 0 60 60" width="60"><use href="#fleuron"/></svg><span>No photo on file</span></div></div><figcaption>Plate I</figcaption></figure>`;
  const illus = imageType(i) === 'illustration';
  return `<figure class="tplate${illus ? ' illus' : ''}">
    <div class="tplate-no">Plate I</div>
    <div class="tplate-frame" data-ph><img src="${esc(i.src || i.url)}" alt="${esc(imgAlt(i, l.name))}" decoding="async" referrerpolicy="no-referrer" draggable="false" data-ph-img></div>
    <figcaption><span class="pc">${esc(illus ? 'Illustration, not a photo' : (i.caption || l.name))}</span><span class="pcr">${esc(illus ? (i.credit || '').replace(/\s*\(not a photo\)\s*$/i, '') : credText(i))}</span></figcaption>
  </figure>`;
}
function bookFor(ctx, l, imgs, finis) {
  const tl = previewTimeline(l), arch = isArchived(l), onShelf = isArchiveShelf(l);
  const hook = l.preview.summary || l.preview.teaser || '';
  const facts = String(l.facts || '').split('·').map((x) => x.trim()).filter(Boolean);
  const name = l.name.replace(/\s*\(.*?\)\s*$/, '') || l.name;
  const pages = [
    `<div class="pg pg-plate">${plateHTML(l, imgs[0])}${folio(0)}</div>`,
    `<div class="pg pg-title">
      ${wordmark('ink pg-brand')}
      <div class="ink tkicker">${esc(ratingLabel(l))}</div>
      <h2 class="ink">${esc(name)}</h2>
      <div class="ink place">${esc(l.place)}</div>
      ${rule('ink')}
      ${hook ? `<p class="ink thook"><span class="drop">${esc(hook[0])}</span>${esc(clip(hook, 260).slice(1))}</p>` : ''}
      ${tl.era ? `<div class="ink era"><span>Era</span> ${esc(tl.era)}</div>` : ''}
      <div class="ink seal-wrap">${sealFor(l, 104)}</div>
      ${folio(1)}</div>`,
    `<div class="pg pg-facts">${pageHead(name, 'Facts')}
      <h3 class="ink">Particulars</h3>
      <dl class="tfacts">
        <div class="ink"><dt>${isPrivateHome(l) ? 'Area' : 'Address'}</dt><dd>${esc(isPrivateHome(l) ? (publicAreaLabel(l) || l.place) : (l.address || l.place))}${isPrivateHome(l) ? ' <small>(a private home: shown as a neighborhood or area of town, not a street address)</small>' : l.geo_precision === 'town' ? ' <small>(map point: town only)</small>' : l.geo_precision === 'township' ? ' <small>(shown as the whole township on the map)</small>' : ''}</dd></div>
        ${onShelf ? `<div class="ink"><dt>Market</dt><dd>${l.status === 'Sold' ? `Sold${l.soldOn ? ` <small>(${esc(fmtDate(l.soldOn))})</small>` : ''}` : 'Not for sale'}</dd></div>`
          : `<div class="ink quill"><dt>${arch ? 'Last asking' : 'Asking'}</dt><dd><span class="qw">${esc(l.price || 'Price not listed')}</span></dd></div>`}
        <div class="ink"><dt>Status</dt><dd>${onShelf ? 'In the Archive' : esc(l.status)}${l.lastChecked ? ` <small>(checked ${esc(fmtDate(l.lastChecked))})</small>` : ''}</dd></div>
        <div class="ink"><dt>Rating</dt><dd>${esc(ratingLabel(l))}</dd></div>
        <div class="ink"><dt>Category</dt><dd>${esc(l.layerI.label)} · ${esc(kindLabel(l.kind))}</dd></div>
        ${facts.length ? `<div class="ink"><dt>On record</dt><dd>${facts.map(esc).join(' · ')}</dd></div>` : ''}
      </dl>
      ${l.preview.teaser ? `<p class="ink summ"><b>Lore teaser.</b> ${esc(clip(l.preview.teaser.replace(/^Lore:\s*/i, ''), 200))}</p>` : ''}
      ${l.media?.length ? `<p class="ink as-seen-pg"><b>As seen on</b> ${esc(mediaLine(l.media[0]))}${l.media.length > 1 ? ` <small>+${l.media.length - 1} more, on the Sources page</small>` : ''}</p>` : ''}
      ${l.roadOnly ? '<p class="ink road-note">View from the public road only.</p>' : ''}
      ${folio(2)}</div>`,
    `<div class="pg pg-time">${pageHead(name, 'Timeline')}
      <h3 class="ink">The Record</h3>
      <ol class="tl ledger">${tl.hist.map((h) => `<li class="ink"><b>${esc(h.d)}</b><span>${esc(h.t)}</span></li>`).join('')}
        ${tl.arch.map((h) => `<li class="ink arch"><b>${esc(h.d)}</b><span>${esc(h.t)}</span></li>`).join('')}</ol>
      ${tl.hist.length ? '' : '<p class="ink note">The dated history lives in the full file.</p>'}
      ${folio(3)}</div>`,
    `<div class="pg pg-src">${pageHead(name, 'Sources')}
      <h3 class="ink">Sources</h3>
      ${l.media?.length ? `<div class="ink media-src"><h4>As seen on</h4><ul>${l.media.map((m) => `<li>${esc(mediaLine(m))}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noopener nofollow">Where to watch</a>` : ''}</li>`).join('')}</ul>${l.crewFeatured ? '<p class="crew-line"><i aria-hidden="true">✦</i> As seen with the Twisted History crew</p>' : ''}</div>` : ''}
      <ul class="src">
        ${imgs.slice(0, 4).map((i) => { const u = publicUrl(i.source || i.page || ''); return `<li class="ink">${esc(imageType(i) === 'illustration' ? 'Illustration' : (i.caption || 'Photo'))}. ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(credText(i))}</a>` : esc(credText(i))}</li>`; }).join('')}
        ${onShelf ? '' : `<li class="ink">The listing: <a href="${esc(findListingUrl(l))}" target="_blank" rel="noopener">search the address</a>${publicUrl(l.url) ? ` · <a href="${esc(publicUrl(l.url))}" target="_blank" rel="noopener nofollow">original listing</a>` : ''}</li>`}
      </ul>
      <p class="ink note">${onShelf ? 'This is the free preview of an Archive record. Every place here is checked against written sources and public records before it is shelved.' : 'This is the free preview. The full file carries the full story, the dated history and every citation.'}</p>
      ${folio(4)}</div>`,
    `<div class="pg pg-fin">
      <div class="ink fin-rose"><img src="assets/th/rose.webp" alt="" width="84" height="84" draggable="false"></div>
      <div class="ink fin">Finis</div>
      ${finis}
      <p class="ink note">${l.roadOnly ? 'View from the public road only. Do not enter the property or disturb anyone who lives or works there.' : 'View from public ground only. Many of these places are occupied homes.'}</p>
      <button class="ink bk-btn ghost" data-act="close">Close the book</button>
      ${folio(5)}</div>`,
  ];
  const mark = onShelf ? String(archivePlate(l, 'on-cover')) : String(forSaleSeal(l, 'on-cover'));
  const cover = bookCover({ kicker: ratingLabel(l), name, place: [l.city, l.state].filter(Boolean).join(' · '), era: tl.era, mark });
  return bookShell({ id: l.id, name, pages, cover, leather: leatherFor(l.layer), band: layerInfo(l.layer).color, fx: l.layer, saved: isSaved(l.id), shelf: onShelf ? 'archive' : '' });
}

export async function listing(ctx, q, id) {
  const l = ctx.feed.byId.get(id);
  if (!l) return html`<div class="empty-state"><h1>Not in the archive</h1><p>This listing isn’t in the current feed. It may have sold and been retired. <a href="#/browse">Browse the listings</a> or <a href="#/archive">visit the Archive</a>.</p></div>`;
  const [comments, samples, fullRaw, counts, reports] = await Promise.all([
    ctx.be.listComments(l.id).catch(() => []),
    ctx.be.samplePhotos(l.id).catch(() => []),
    ctx.be.getFullFile(l.id).catch(() => null),
    ctx.be.fileCounts(l.id).catch(() => ({ photo: 0, lore: 0, info: 0, link: 0 })),
    ctx.be.listFieldReports ? ctx.be.listFieldReports(l.id).catch(() => []) : Promise.resolve([]),
  ]);
  const full = ctx.visitor && !ctx.unlocks.includes(l.id) ? null : fullRaw;   // View as visitor: no staff access to sealed files
  const top = comments.filter((c) => !c.parent_id), kids = (c) => comments.filter((r) => r.parent_id === c.id);
  const imgs = displayableImages(l);
  const nearby = (isArchiveShelf(l) ? ctx.feed.theArchive : ctx.feed.catalog).filter((x) => x.state === l.state && x.id !== l.id).slice(0, 3);
  const signedIn = !!ctx.me;
  const canOpen = !!(ctx.adminBypass || ctx.unlocks.includes(l.id));
  const unlocked = !!full && canOpen;
  const upd = ctx.updates?.get(l.id);   // fact + kinds only; the content stays in the full file
  const arch = isArchived(l);
  const enc = encodeURIComponent(l.id);
  const mapLink = l.lat != null ? `#/map?focus=${enc}` : '';
  const orig = publicUrl(l.url);
  const onShelf = isArchiveShelf(l);
  await loadDossierIndex();
  const dz = dossierEntry(l.id);
  const fileBtn = onShelf ? '' : full ? `<a class="ink bk-btn gold" href="#/l/${enc}?at=file">Open the sealed full file</a>`
    : canOpen ? `<a class="ink bk-btn gold" href="#/l/${enc}?at=file">Open the sealed full file</a>`
    : `<a class="ink bk-btn gold" href="#/unlock/${enc}" data-unlock-link>Unlock the full file · ${esc(unlockPrice(ctx))}</a>`;
  const finis = `${fileBtn}
    ${onShelf ? '<p class="ink fin-arch">Not for sale. Kept in the Archive for its story.</p>' : `<a class="ink bk-btn" href="${esc(findListingUrl(l))}" target="_blank" rel="noopener">Find listing</a>`}
    <div class="ink fin-row">${mapLink ? `<a class="bk-btn sm" href="${mapLink}">Map</a>` : ''}<button class="bk-btn sm" type="button" data-share="${esc(l.id)}">Share</button><button class="bk-btn sm" type="button" data-save="${esc(l.id)}" aria-pressed="${isSaved(l.id)}"><span class="sv-t">${isSaved(l.id) ? 'Saved' : 'Save'}</span></button><a class="bk-btn sm" href="#/l/${enc}?at=comments">Comments</a></div>`;
  const extra = [...imgs.slice(1), ...samples];
  return html`<nav class="crumbs">${isArchiveShelf(l) ? html`<a href="#/archive">The Archive</a> › ` : arch ? html`<a href="#/archive?at=sold">Sold & Off market archive</a> › ` : html`<a href="#/">Listings</a> › `}${l.state ? html`<a href="#/browse?state=${l.state}">${STATES[l.state] || l.state}</a> › ` : ''}<span>${l.name}</span></nav>
  <div class="detail-shell">
  <header class="detail-head book-head" style="--c:${l.layerI.color}">
    <h1 class="sr-only">${l.name}</h1>
    <div class="book-badges detail-badges">${gradeBadge(l, true)} ${isArchiveShelf(l) ? archivePlate(l, 'inline') : forSaleSeal(l, 'inline')} ${newTag(l)} ${updatedTag(upd)} ${layerChip(l)} ${statusPill(l)} ${unlocked ? html`<span class="file-state open">🔓 Full file unlocked</span>` : full ? html`<span class="file-state open">Moderator view</span>` : html`<span class="file-state">🔒 Free preview</span>`}</div>
    ${l.collection === 'heritage' ? html`<p class="small heritage-crumb"><a href="#/heritage">❦ Heritage Homes</a> · a separate collection: one family, ${l.heritage?.years || '100+'} years${l.heritage?.since ? html` (since ${l.heritage.since})` : ''}</p>` : heritageCrossLink(l) ? html`<p class="small book-badges">${heritageCrossLink(l)}</p>` : ''}
    ${mediaCredit(l)}${crewLine(l)}
  </header>
  ${isArchiveShelf(l) ? html`<div class="arch-note" role="note"><b>${l.status === 'Sold' ? 'Sold, and no longer on the market.' : 'Not for sale.'}</b> This place is kept in <a href="#/archive">the Archive</a> for its story.${isPrivateHome(l) ? ' It is a private home, so only the neighborhood or area of town is shown on the map, and the address is withheld.' : ''}${l.roadOnly ? ' View it from the public road only.' : ''}</div>` : ''}
  ${arch ? html`<div class="no-longer" role="note"><b>No longer for sale.</b> This property is marked <b>${l.status}</b>${l.statusChangedAt ? html` since ${fmtDate(l.statusChangedAt)}` : ''}${l.lastChecked ? html` (last checked ${fmtDate(l.lastChecked)})` : ''}. The price shown is the last known asking price, not an offer. It stays on the <a href="#/archive?at=sold">Once for sale</a> list for its story; the original listing may be gone.</div>` : ''}
  ${isUnwritten(l) ? unwrittenCard(l) : raw(bookFor(ctx, l, imgs, finis))}
  <div class="book-quick">
    <button class="btn" type="button" data-capture-place="${enc}">Add photo or info</button>
    ${dz ? html`<a class="btn" href="#/dossier/${enc}">Research dossier</a>` : ''}
    ${isArchiveShelf(l) ? '' : full ? html`<a class="btn" href="#/l/${enc}?at=file">${unlocked ? 'Your full file' : 'Full file (moderator)'} ↓</a>` : canOpen ? html`<a class="btn" href="#/l/${enc}?at=file">Your full file ↓</a>` : html`<a class="btn" href="#/unlock/${enc}" data-unlock-link>Unlock full file · ${unlockPrice(ctx)}</a>`}
    ${isArchiveShelf(l) ? '' : html`<a class="btn ghost" href="${findListingUrl(l)}" target="_blank" rel="noopener">Find listing</a>`}
    ${orig ? html`<a class="btn ghost" href="${orig}" target="_blank" rel="noopener nofollow">Original listing ↗</a>` : ''}
    ${mapLink ? html`<a class="btn ghost" href="${mapLink}">Map</a>` : ''}
    <button class="btn ghost" type="button" data-share="${l.id}">Share</button>
    <button class="btn ghost save-btn" type="button" data-save="${l.id}" aria-pressed="${isSaved(l.id) ? 'true' : 'false'}"><span class="rib" aria-hidden="true"></span><span class="sv-t">${isSaved(l.id) ? 'Saved' : 'Save'}</span></button>
  </div>
  <div class="reader" role="group" aria-label="Read this aloud"><button class="btn ghost sm" type="button" data-read="${l.id}" aria-pressed="false"><span class="rd-ic" aria-hidden="true">❧</span>Read this aloud</button>
    <button class="btn ghost sm" type="button" data-read-pause hidden>Pause</button><button class="btn ghost sm" type="button" data-read-stop hidden>Stop</button>
    <label>Speed <select data-read-rate aria-label="Reading speed"><option value="0.85">Slow</option><option value="1" selected>Normal</option><option value="1.2">Brisk</option></select></label></div>
  <details class="book-alt"><summary>Read the preview as plain text</summary><div class="alt-body">
    ${l.preview.summary ? html`<p class="summary">${l.preview.summary}</p>` : ''}
    ${l.preview.teaser ? html`<p class="teaser"><span class="kicker">Lore teaser</span> ${l.preview.teaser}</p>` : ''}
    <dl class="facts">${previewFacts(l).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
    ${imgs[0] ? html`<p class="ph-credit small">${photoCredit(imgs[0])}</p>` : ''}
  </div></details>
  ${upd ? html`<p class="upd-note small book-alt">${updateLine(upd)} · ${fmtDate(upd.at)}. ${full ? html`<a href="#/l/${enc}?at=file">See the community archive</a>.` : 'Approved additions are part of the full file.'}</p>` : ''}
  ${extra.length ? html`<section class="plates-strip gallery"><h2>More plates</h2><div class="g-strip">
      ${imgs.slice(1).map((i) => html`<figure class="g-item" data-ph-item><div class="ph" data-ph><img src="${i.src || i.url}" alt="${imgAlt(i, l.name)}" loading="lazy" referrerpolicy="no-referrer" data-ph-img></div><figcaption>${i.caption ? html`<span class="cap">${i.caption}</span>` : ''}<span class="ph-credit">${photoCredit(i)}</span></figcaption></figure>`)}
      ${samples.map((m) => html`<figure class="g-item community">${m.payload?.data_url ? html`<img src="${m.payload.data_url}" alt="${m.payload.title}" loading="lazy">` : html`<div class="doc-ph">photo<small>no image preview</small></div>`}<figcaption>${m.payload?.title} · ${m.payload?.credit || '@' + m.author?.handle}</figcaption></figure>`)}
    </div></section>` : ''}
  </div>

  <div class="with-side detail">
  <div class="detail-main">
    ${isArchiveShelf(l) ? '' : full ? fullFile(l, full, unlocked) : canOpen ? missingFilePanel(l) : lockedPanel(ctx, l, counts, signedIn)}

    ${reports?.length && !isPrivateHome(l) ? raw(fieldReportsHtml(reports)) : (reports?.length ? html`<section class="td-fr" id="field-reports"><h2>Field reports</h2><p class="muted small">Field notes for this private home are in the full file, so the house is not shown on the public card.</p></section>` : '')}

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
    <section class="box warn"><h4>Before you visit</h4>${isArchiveShelf(l) ? html`<p>This place is <b>not for sale</b>, and it may be someone’s home. ${l.roadOnly ? 'View it from the public road only. ' : 'View from public ground only. '}Never trespass, and don’t contact owners or occupants about the history. We are a public-interest archive, not a broker.</p>` : html`<p>This is a public-interest archive, not a real-estate broker. Many of these places are <b>occupied homes</b>. View from public ground only, never trespass, and don’t contact owners or occupants about the history. To ask about buying, <a href="${findListingUrl(l)}" target="_blank" rel="noopener">find the current listing</a>${orig ? html` or open the <a href="${orig}" target="_blank" rel="noopener nofollow">original listing</a>` : ''}.</p>`}</section>
    <section class="box"><h4>Submit to this file</h4>
      <p><button class="btn" type="button" data-capture-place="${l.id}">Add photo or info</button></p>
      <p class="small muted">One photo or a short note, sent for review. Or use the longer forms below.</p>
      <ul class="contrib"><li><a href="#/contribute?type=info&listing=${l.id}">✒ Add info or a correction</a></li><li><a href="#/contribute?type=photo&listing=${l.id}">🗄 Add a photo or document</a></li><li><a href="#/contribute?type=lore&listing=${l.id}">🕯 Add lore or a story</a></li><li><a href="#/contribute?type=link&listing=${l.id}">🔗 Add a link</a></li></ul>
      <p class="small muted">Moderated. Approved submissions become part of the full file.</p>
      <button class="link small" data-report="listing:${l.id}">⚑ Report a problem with this page</button></section>
    ${nearby.length ? html`<section class="box"><h4>${isArchiveShelf(l) ? 'More from the Archive in' : 'More in'} ${STATES[l.state] || l.state}</h4>${nearby.map((x) => listingCard(x, { ...ctx, compact: true }))}</section>` : ''}
  </aside></div>`;
}
