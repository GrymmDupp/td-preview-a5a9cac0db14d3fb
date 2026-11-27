import { CONFIG } from '../config.js';
import { html, raw, fmtDate, ago, safeUrl, host } from '../util.js';
import { savedList, nyxFriend, nyxFound, friendSeal, NYX_GOAL, nyx, openedList, nightOwl, fieldLeads, soundOn, visitorView } from '../reveals.js';
import { hapticsOn } from '../world.js';
import { fxOn } from '../effects.js';
import { state as radioState, playlist } from '../radio.js';
import { leatherFor, layerInfo } from '../taxonomy.js';
import { researchScrolls } from './research.js';
import { analyticsOn, analyticsBlocked } from '../analytics.js';
import { syncState } from '../sync.js';
import { unlockPrice, standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice, money, TIER_LABEL, membershipsOn, isTrial, soonChip, soonButton, trialNote, readerLabel } from '../components.js';

// Plan shown as a plain fact. The "Lifetime" badge appears HERE ONLY (the member's own
// account page), never next to comments, board posts or listings.
function planBlock(ctx) {
  if (ctx.adminBypass) return html`<p><b>Full access.</b> Every scroll, book and dossier opens on this account, with no checkout.</p>`;
  const m = ctx.membership, mock = m?.mock ? ' (example checkout, no real payment)' : '';
  if (m?.plan === 'lifetime') return html`<p><span class="plan-badge">Lifetime</span> since ${fmtDate(m.purchased_at)}</p>
    <p class="small muted">Paid ${money(m.amount)} one time${mock} · ${m.payment_ref}. It never expires.</p>`;
  if (m?.plan === 'annual') return html`<p><b>Annual membership</b>, active until ${fmtDate(m.current_period_end)}</p><p class="small muted">Every full file is included while it lasts. Files you unlocked on their own stay yours.</p>`;
  if (m?.plan === 'monthly') return html`${m.status === 'active'
      ? html`<p><b>Monthly membership: active, renews ${fmtDate(m.current_period_end)}</b></p>`
      : html`<p><b>Monthly membership: canceled, active until ${fmtDate(m.current_period_end)}</b></p>`}
    <p class="small muted">${money(m.amount)}/month${mock} · ${m.payment_ref}. Files you unlock stay unlocked forever, even after it ends.</p>
    <div class="row-btns">${m.status === 'active' ? html`<button class="btn sm ghost" data-cancel-membership>Cancel membership</button>` : (membershipsOn() ? html`<button class="btn sm ghost" data-membership-checkout="monthly">Resume renewal</button>` : '')}
      ${membershipsOn() ? html`<a class="btn sm ghost" href="#/membership?plan=lifetime">Switch to Lifetime (${lifetimePrice()})</a>` : soonButton('Lifetime')}
      ${ctx.be.isPreview || ctx.be.mockCheckout ? html`<button class="link small" data-preview-lapse>Preview: end the period now</button>` : ''}</div>`;
  return html`<p>No membership. A single unlock is ${standardPrice()}${trialNote()}.</p>
    <p class="small muted">${membershipsOn() ? '' : 'Memberships are not on sale yet. '}<a href="#/patronage">See Patronage: membership and research files</a>.</p>`;
}

const syncLine = () => ({ synced: 'Last synced just now.', syncing: 'Syncing…', unavailable: 'Sync is not available right now; everything is kept on this device meanwhile.', local: '' })[syncState.status] || '';

// Saved shelf: this browser's saved listings as leather spines (they link to the book).
const H = [100, 93, 97, 89, 95, 91, 99, 94];
function savedShelf(ctx) {
  const items = savedList().map((x) => ctx.feed.byId.get(x.id)).filter(Boolean);
  return html`<section class="block saved-block"><h2>Saved <small class="muted">${items.length}</small></h2>
    ${items.length ? html`<div class="shelf-wrap saved-wrap"><div class="shelf saved-shelf">${items.map((l, i) => { const t = l.name.replace(/\s*\(.*?\)\s*$/, ''); const short = t.length > 26 ? t.slice(0, 25) + '…' : t;
      return html`<a class="spine ${i % 4 === 2 ? 'paper' : ''} two" href="#/l/${encodeURIComponent(l.id)}" aria-label="${l.name} (saved)" style="--c:${layerInfo(l.layer).color};--leather:${leatherFor(l.layer)};--h:${H[i % H.length]}%">
        <span class="bk" aria-hidden="true"><span class="band"><i></i></span><span class="ttl">${short}</span><span class="cnt">❦</span></span></a>`; })}</div>
      <div class="shelf-plate" aria-hidden="true"><span>Saved</span><small>marked with a red ribbon · this browser</small></div></div>`
    : html`<p class="muted">Nothing saved yet. Open any listing and tap <b>Save</b>: a red ribbon slips into the book and it lands on this shelf.</p>`}
    <p class="small muted">Saved listings are kept in this browser.</p></section>`;
}
function nyxBlock() {
  const n = nyxFound().length;
  if (nyxFriend()) return html`<section class="box nyx-box"><h4>Friend of Nyx</h4>${raw(friendSeal())}<p class="small">You found Nyx in ${n} places. She remembers.</p></section>`;
  return n ? html`<section class="box nyx-box"><h4>A small spider</h4><p class="small muted">Found ${n} of ${NYX_GOAL}. She hides all over the archive.</p></section>` : '';
}
// Unlocked files as rolled scrolls in pigeonhole cubbies (receipts kept below).
function cubbies(ctx, unlocks) {
  const L = (id) => ctx.feed.byId.get(id);
  return html`<div class="cubbies">${unlocks.map((u) => { const l = L(u.listing_id);
    return html`<a class="cubby" href="#/l/${encodeURIComponent(u.listing_id)}?at=file" style="--leather:${leatherFor(l?.layer)}"><span class="rolled" aria-hidden="true"><i class="rk l"></i><i class="rk r"></i><i class="rs"></i></span>
      <span class="cb-tag">${l ? l.name : u.listing_id}</span><small>${fmtDate(u.unlocked_at)} · open the scroll</small></a>`; })}</div>`;
}

// ---------- the immersive account (library card, seals cabinet, journal, map, reading log, writing desk)
const cardNo = (id) => { let h = 2166136261; for (const c of String(id || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } h >>>= 0; return `TD-${String(h % 10000).padStart(4, '0')}-${String((h >>> 13) % 1000).padStart(3, '0')}`; };
function libraryCard(ctx) {
  const me = ctx.me, since = me.created_at ? fmtDate(me.created_at) : 'this year';
  return html`<section class="lib-card" aria-label="Your reader’s card">${raw(nyx('card', 'nyx-peek'))}
    <div class="lc-top"><span>Twisted Deeds Reading Room</span><span class="lc-no">No. ${cardNo(me.id)}</span></div>
    <div class="lc-row"><span class="lc-k">Reader</span><span class="lc-ink">${readerLabel(me)}</span></div>
    <div class="lc-row"><span class="lc-k">Privileges</span><span class="lc-v">${ctx.adminBypass ? 'Full access · no checkout' : ctx.membership?.plan === 'lifetime' ? 'Lifetime' : ctx.membership?.plan === 'monthly' ? 'Monthly' : 'Reading room · free previews'}</span></div>
    <div class="lc-stamp" aria-label="Member since ${since}"><small>Member since</small><b>${since}</b></div>
    <p class="lc-fine">Only you see this page. The card number is drawn from your account, nothing more.</p></section>`;
}
function invitation() {
  return html`<section class="lib-card invite" aria-label="An invitation">${raw(nyx('card', 'nyx-peek'))}
    <div class="lc-top"><span>Twisted Deeds Reading Room</span><span class="lc-no">By invitation</span></div>
    <p class="inv-h">You are cordially invited<br>to take a reader’s card.</p>
    <p class="inv-b">A card keeps the files you unlock on every device, lets you add to the record, and remembers you here. Free to hold.</p>
    <p><button class="btn" data-signin>Sign in or take a card</button></p></section>`;
}
// Seals: real criteria, tracked in this browser (plus your account’s own unlocks / requests).
function seals(ctx, { unlocks = [], rf = [], subs = [] } = {}) {
  const opened = openedList().length, saved = savedList().length, leads = fieldLeads().length;
  const S = [
    ['nyx', 'Friend of Nyx', nyxFriend(), `Find Nyx in ${NYX_GOAL} places (${nyxFound().length} so far)`],
    ['unlock', 'First Unlock', unlocks.length > 0, 'Unlock your first full file'],
    ['ten', 'Ten Books Opened', opened >= 10, `Open ten different books (${Math.min(opened, 10)}/10)`],
    ['owl', 'Night Owl', !!nightOwl(), 'Visit between midnight and 4 a.m.'],
    ['ribbon', 'Ribbon Keeper', saved >= 5, `Save five listings (${Math.min(saved, 5)}/5)`],
    ['field', 'Field Hand', leads > 0, 'Save a field lead in the Live navigator'],
    ['quill', 'Contributor', subs.some((x) => x.status === 'approved'), 'Have a submission approved'],
    ['commission', 'Commissioner', rf.length > 0, 'Commission a research file'],
  ];
  const got = S.filter((x) => x[2]).length;
  return html`<section class="block seals-cab"><h2>Cabinet of seals <small class="muted">${got} of ${S.length}</small></h2>
    <div class="cabinet">${S.map(([k, t, on, how]) => html`<div class="wseal ${on ? 'on' : 'off'} ws-${k}" title="${on ? t : how}"><span class="ws-wax" aria-hidden="true">${k === 'nyx' ? raw('<img src="assets/th/nyx.svg" alt="" width="26" height="29">') : raw(GLYPH[k] || '')}</span><b>${t}</b><small>${on ? 'Earned' : how}</small></div>`)}</div>
    <p class="small muted">Seals are earned for real things you did, remembered in this browser.</p></section>`;
}
const GLYPH = { unlock: '🗝', ten: '❦', owl: '☾', ribbon: '❧', field: '✦', quill: '✒', commission: '⚜' };
function journal() {
  const L = fieldLeads();
  return html`<section class="block journal"><h2>Field journal <small class="muted">${L.length}</small></h2>
    ${L.length ? html`<div class="jr-page">${L.slice(0, 20).map((l) => html`<article class="jr-entry"><time datetime="${l.ts}">${l.ts ? new Date(l.ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}</time>
      <h3>${l.name || l.addr || 'A place'}</h3>${l.name && l.addr ? html`<p class="jr-addr">${l.addr}</p>` : ''}${l.note ? html`<p>${l.note}</p>` : ''}<p class="jr-coord">${Number(l.lat).toFixed(4)}, ${Number(l.lon).toFixed(4)}</p></article>`)}</div>`
    : html`<div class="jr-page empty"><p>No entries yet. Field leads you save in the <a href="live/">Live navigator</a> on this phone are written up here, dated.</p></div>`}
    <p class="small muted">Kept on this device only.</p></section>`;
}
function placesMap() {
  const L = fieldLeads(), W = 320, H = 200;
  let pins = '';
  if (L.length) {
    let [a, b, c, d] = [Math.min(...L.map((l) => l.lat)), Math.max(...L.map((l) => l.lat)), Math.min(...L.map((l) => l.lon)), Math.max(...L.map((l) => l.lon))];
    const pad = Math.max(0.01, (b - a) * 0.25, (d - c) * 0.25); a -= pad; b += pad; c -= pad; d += pad;
    pins = L.map((l) => { const x = 20 + ((l.lon - c) / (d - c || 1)) * (W - 40), y = 20 + (1 - (l.lat - a) / (b - a || 1)) * (H - 40); return `<g class="mp-pin" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="5"/><circle r="2" class="mp-in"/><title>${String(l.name || l.addr || '').replace(/[<&>"]/g, '')}</title></g>`; }).join('');
  }
  const rose = `<g class="mp-rose" transform="translate(${W - 34},${H - 36})"><circle r="16"/><path d="M0-15L3 0 0 15-3 0Z M-15 0L0 3 15 0 0-3Z"/><text y="-19" text-anchor="middle">N</text></g>`;
  return html`<section class="block places"><h2>Places visited <small class="muted">${L.length}</small></h2>
    <figure class="antique-map">${raw(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L.length ? L.length + ' places from your field journal' : 'An empty chart'}"><rect class="mp-bg" x="0" y="0" width="${W}" height="${H}"/>
      ${Array.from({ length: 7 }, (_, i) => `<line class="mp-grid" x1="${(i + 1) * W / 8}" y1="0" x2="${(i + 1) * W / 8}" y2="${H}"/>`).join('')}${Array.from({ length: 4 }, (_, i) => `<line class="mp-grid" x1="0" y1="${(i + 1) * H / 5}" x2="${W}" y2="${(i + 1) * H / 5}"/>`).join('')}
      <path class="mp-coast" d="M0 ${H * 0.7} C${W * 0.2} ${H * 0.62} ${W * 0.3} ${H * 0.8} ${W * 0.5} ${H * 0.74} S${W * 0.8} ${H * 0.6} ${W} ${H * 0.68}"/>${pins}${rose}
      <text class="mp-title" x="14" y="20">${L.length ? 'Places of record' : 'Terra incognita'}</text></svg>`)}
      <figcaption class="small muted">${L.length ? 'Drawn from the field leads saved on this device.' : 'Save field leads in the Live navigator and they are charted here.'}</figcaption></figure></section>`;
}
function readingLog(ctx) {
  const L = openedList().map((x) => ({ ...x, l: ctx.feed.byId.get(x.id) })).filter((x) => x.l).slice(0, 8);
  return html`<section class="block reading"><h2>Reading log <small class="muted">${L.length}</small></h2>
    ${L.length ? html`<div class="desk"><div class="stack">${L.map((x, i) => html`<a class="sbook" href="#/l/${encodeURIComponent(x.id)}" style="--leather:${leatherFor(x.l.layer)};--c:${layerInfo(x.l.layer).color};--tilt:${[-1.5, 1, -0.5, 1.6, -1.2, 0.6, -1.8, 0.9][i % 8]}deg;--w:${[92, 86, 96, 82, 90, 88, 94, 84][i % 8]}%">
      <span class="sb-t">${x.l.name.replace(/\s*\(.*?\)\s*$/, '')}</span><small>${ago(x.at)}</small></a>`)}</div><span class="desk-top" aria-hidden="true"></span></div>`
    : html`<p class="muted">Books you open are stacked here, most recent on top.</p>`}</section>`;
}
function writingDesk(ctx) {
  const rm = document.documentElement.classList.contains('rm'), r = radioState();
  const sw = (attr, on, label, note) => html`<button type="button" class="brass" ${raw(attr)} aria-pressed="${on ? 'true' : 'false'}"><span class="lever" aria-hidden="true"><i></i></span><span class="bl">${label}</span><small>${note}</small></button>`;
  return html`<section class="block desk-set" aria-label="Settings"><h2>The writing desk</h2>
    <div class="wdesk">
      <button type="button" class="snuff ${rm ? 'out' : ''}" data-candle aria-pressed="${rm ? 'true' : 'false'}" aria-label="${rm ? 'Candle snuffed: motion reduced. Tap to light it' : 'Snuff the candle to reduce motion'}"><span class="candle" aria-hidden="true"><i class="flame"></i><i class="wick"></i><i class="wax"></i><i class="dish"></i></span><small>${rm ? 'Snuffed: motion reduced' : 'Snuff to reduce motion'}</small></button>
      <div class="switches">
        ${sw('data-sound', soundOn(), 'Sound', 'Off by default; only after a tap')}
        ${sw('data-effects', fxOn(), 'Effects', 'Opening effects and reveals')}
        ${sw('data-reduce-motion', rm, 'Reduce motion', 'Also the candle')}
        ${sw('data-haptics', hapticsOn(), 'Haptics', 'Tiny pulses: seals, pages, ribbons (Android)')}
        <button type="button" class="brass radio-dial" data-radio aria-pressed="${r.on ? 'true' : 'false'}"><span class="dial" aria-hidden="true"></span><span class="bl rd-l">${r.on ? 'Radio: on' : 'Radio: off'}</span><small>An old radio in the next room · ${playlist().name}</small></button>
        ${sw('data-analytics', analyticsOn(), 'Anonymous counting', analyticsBlocked() ? 'Off: your browser sends Do Not Track' : 'Tallies of visits. No cookies, no tracking')}
        ${ctx.staff ? sw('data-visitor', ctx.visitor, 'View as visitor', ctx.visitor ? 'On: staff tools hidden on this device' : 'Hide staff tools on this device') : ''}
      </div></div>
    <p class="small muted desk-fine">The fine print: <a href="#/terms">Terms of Service</a> · <a href="#/privacy">Privacy Policy</a> · <a href="#/refunds">Refund Policy</a> · <a href="#/stories">Stories &amp; Corrections</a></p></section>`;
}

const KIND = { info: 'Info / correction', photo: 'Photo or document', lore: 'Lore or story', link: 'Link' };
const STATUS = { pending: ['Awaiting review', 'pending'], approved: ['Approved', 'ok'], rejected: ['Not approved', 'no'], removed: ['Removed', 'no'] };

// Plain account page: the user's own submissions with moderation status, and their
// unlocked files. Nothing here is public; there are no profiles.
function accountManage(ctx) {
  const me = ctx.me, name = String(me.display_name || '');
  return html`<section class="block acct-manage" id="manage"><h2>Your account</h2>
    <form class="form" data-display-name>
      <label>Display name
        <input name="display_name" type="text" maxlength="40" value="${name}" placeholder="How your name appears" autocomplete="nickname" autocapitalize="words">
      </label>
      <p class="small muted">This is the name shown in the header and next to your comments. Leave it blank to use the default (@${me.handle || 'reader'}).</p>
      ${me.email ? html`<p class="acct-email"><span class="lc-k">Signed in as</span> <b>${me.email}</b></p>` : ''}
      <div class="row-btns"><button class="btn">Save name</button><button class="btn ghost" type="button" data-signout>Sign out</button></div>
    </form></section>`;
}

export async function account(ctx) {
  if (!ctx.me) return html`<div class="page-head"><h1>Account</h1></div><div class="acct-world acct-out">${invitation()}
    <p class="small muted install-inline" data-install-entry>Want it on your home screen? <a href="#" data-install-app>Install the app</a></p>
    ${savedShelf(ctx)}${readingLog(ctx)}${seals(ctx)}${writingDesk(ctx)}</div>`;
  const [unlocks, subs, rf] = await Promise.all([ctx.be.listUnlocks(), ctx.be.listMySubmissions(), ctx.be.myResearchRequests ? ctx.be.myResearchRequests().catch(() => []) : []]);
  const L = (id) => ctx.feed.byId.get(id);
  return html`<div class="page-head"><h1>Account</h1><p class="muted">Signed in as <b>${readerLabel(ctx.me)}</b>. Only you see this page.</p>
    ${ctx.be.isPreview ? html`<p class="small muted">Preview: this is a test account in this browser. In live mode your account is your email sign-in, so unlocks follow you to every device.</p>` : ''}</div>
  <div class="with-side acct-world"><div>
    ${accountManage(ctx)}
    ${libraryCard(ctx)}
    <section class="block"><h2>Plan</h2>${planBlock(ctx)}</section>
    <section class="block"><h2>Unlocked files <small class="muted">${unlocks.length}</small></h2>
      ${unlocks.length ? html`${cubbies(ctx, unlocks)}<details class="receipts"><summary>Receipts</summary><table class="tbl"><thead><tr><th>Property</th><th>Unlocked</th><th>Price paid</th><th>Payment</th></tr></thead><tbody>
        ${unlocks.map((u) => html`<tr><td>${L(u.listing_id) ? html`<a href="#/l/${u.listing_id}?at=file">${L(u.listing_id).name}</a> <span class="small muted">· open the scroll</span>` : u.listing_id}</td><td>${fmtDate(u.unlocked_at)}</td>
        <td>${money(u.amount_paid ?? u.amount_cents / 100)} <span class="muted small">${TIER_LABEL[u.price_tier] || 'standard'}</span></td>
        <td>${u.mock ? html`<span class="example">Example checkout</span> ` : ''}<span class="muted small">${u.payment_ref}</span></td></tr>`)}</tbody></table></details>`
      : html`<p class="muted">No unlocked files yet. Every listing has a free preview; the full file is ${unlockPrice(ctx)} one time.</p>`}</section>
    ${savedShelf(ctx)}
    ${seals(ctx, { unlocks, rf, subs })}
    ${readingLog(ctx)}
    ${journal()}
    ${placesMap()}
    <section class="block"><h2>Research files <small class="muted">${rf.length}</small></h2>
      <p class="small muted">Commissioned Research Files are a separate, private service. Each one arrives here as a sealed scroll. <a href="#/research">Commission a file</a>.</p>
      ${researchScrolls(rf)}</section>
    <section class="block"><h2>Your submissions <small class="muted">${subs.length}</small></h2>
      ${subs.length ? html`<table class="tbl"><thead><tr><th>Type</th><th>Listing</th><th>What</th><th>Sent</th><th>Status</th></tr></thead><tbody>
        ${subs.map((s) => { const st = STATUS[s.status] || [s.status, '']; const p = s.payload || {};
          return html`<tr><td>${KIND[s.kind] || s.kind}</td><td>${L(s.listing_id) ? html`<a href="#/l/${s.listing_id}">${L(s.listing_id).name}</a>` : html`<span class="muted">${p.new_property ? 'New property' : '—'}</span>`}</td>
          <td>${p.title || p.label || (p.text || '').slice(0, 60) || (safeUrl(p.url) ? host(p.url) : '')}</td><td>${fmtDate(s.created_at)}</td>
          <td><span class="st ${st[1]}">${st[0]}</span>${s.mod_note ? html`<div class="small muted">Moderator: ${s.mod_note}</div>` : ''}</td></tr>`; })}</tbody></table>`
      : html`<p class="muted">You haven’t submitted anything yet. <a href="#/contribute">Submit info, a photo, lore or a link</a>.</p>`}</section>
    ${writingDesk(ctx)}
  </div><aside class="sidebar">
    ${nyxBlock()}<section class="box"><h4>Your account</h4>
      <p class="small">Name: <b>${readerLabel(ctx.me)}</b></p>
      ${ctx.me.email ? html`<p class="small">Email: <b>${ctx.me.email}</b></p>` : ''}
      <p class="small muted">Change your display name at the top of this page.</p>
      <p><a class="btn sm" href="#/account?at=manage">Edit name</a> <button class="btn sm ghost" data-signout>Sign out</button></p></section>
    <section class="box install-box" data-install-entry><h4>The app</h4><p class="small">Install Twisted Deeds on your phone or computer. It opens full screen like an app, and you stay signed in.</p><button class="btn sm ghost" data-install-app>Install the app</button></section>
    ${CONFIG.show?.notifications ? html`<section class="box notify-box"><h4>Notifications <span class="soon">Coming soon</span></h4>
      <label class="check"><input type="checkbox" data-notify-pref ${ctx.notifyPref?.opted_in ? 'checked' : ''}> <span>Get notified about new Twisted Deeds</span></label>
      <p class="small muted">At most one short email a day, only when a new Twisted Deed is added, with a one-click unsubscribe. Nothing is sent yet; ${ctx.be.mode === 'local' ? 'this choice is saved in this browser only' : 'this choice is saved to your account'}.</p></section>` : ''}
    <section class="box sync-box"><h4>Saved with your account</h4><p class="small">${ctx.be.mode === 'supabase' ? html`Your saves, reading log and the spiders you have found follow you to every device you sign in on. ${syncLine()}` : 'Preview mode: kept in this browser only.'}</p></section>
    ${pendingBox(ctx)}<section class="box"><h4>How unlocks work</h4><p class="small">Each listing’s full file is a one-time unlock: ${standardPrice()}${trialNote()}. Unlocked files never expire and open on every device you sign in on. <a href="#/patronage">Membership and research packs</a>.</p></section>
    ${ctx.be.isPreview && !ctx.visitor ? html`<section class="box"><h4>Preview tools</h4><p class="small">Try the moderation queue with this test account.</p>
      ${['moderator', 'admin'].includes(ctx.me.role) ? html`<button class="btn sm ghost" data-preview-mod="0">Stop acting as moderator</button>` : html`<button class="btn sm ghost" data-preview-mod="1">Act as moderator (preview)</button>`}</section>` : ''}
  </aside></div>`;
}

// Payment Link mode: the account's own unlock requests whose payment hasn't landed yet (verify-unlock checks them instantly).
function pendingBox(ctx) {
  const rows = [...(ctx.unlockRequests?.values() || [])].filter((r) => r.status === 'pending' && !ctx.unlocks.includes(r.listing_id));
  if (!rows.length) return '';
  return html`<section class="box"><h4>Files waiting to be unsealed</h4><p class="small">The moment Stripe shows your payment, the file breaks its seal and is yours for good. We’re watching for it now. Paid already? Check below.</p>
    <ul class="small">${rows.map((r) => html`<li><a href="#/l/${encodeURIComponent(r.listing_id)}">${ctx.feed.byId.get(r.listing_id)?.name || r.listing_id}</a> · reference <code>${r.reference}</code> · ${fmtDate(r.created_at)}</li>`)}</ul>
    <button class="btn sm" data-check-payment>Check payment</button></section>`;
}
