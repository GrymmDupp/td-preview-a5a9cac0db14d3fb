import { html, fmtDate, safeUrl, host } from '../util.js';
import { unlockPrice, standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice, money, TIER_LABEL } from '../components.js';

// Plan shown as a plain fact. The "Lifetime" badge appears HERE ONLY (the member's own
// account page), never next to comments, board posts or listings.
function planBlock(ctx) {
  const m = ctx.membership, mock = m?.mock ? ' (example checkout, no real payment)' : '';
  if (m?.plan === 'lifetime') return html`<p><span class="plan-badge">Lifetime</span> since ${fmtDate(m.purchased_at)}</p>
    <p class="small muted">Paid ${money(m.amount)} one time${mock} · ${m.payment_ref}. Every unlock is ${lifetimeUnlockPrice()}. It never expires.</p>`;
  if (m?.plan === 'monthly') return html`${m.status === 'active'
      ? html`<p><b>Monthly membership: active, renews ${fmtDate(m.current_period_end)}</b></p>`
      : html`<p><b>Monthly membership: canceled, active until ${fmtDate(m.current_period_end)}</b></p>`}
    <p class="small muted">${money(m.amount)}/month${mock} · ${m.payment_ref}. Unlocks are ${monthlyUnlockPrice()} while it’s active. Files you unlock stay unlocked forever, even after it ends.</p>
    <div class="row-btns">${m.status === 'active' ? html`<button class="btn sm ghost" data-cancel-membership>Cancel membership</button>` : html`<button class="btn sm ghost" data-membership-checkout="monthly">Resume renewal</button>`}
      <a class="btn sm ghost" href="#/membership?plan=lifetime">Switch to Lifetime (${lifetimePrice()})</a>
      ${ctx.be.isPreview ? html`<button class="link small" data-preview-lapse>Preview: end the period now</button>` : ''}</div>`;
  return html`<p>No membership. Unlocks are ${standardPrice()} each.</p>
    <p class="small muted">Optional: <a href="#/membership?plan=monthly">Monthly ${monthlyPrice()}/mo</a> (unlocks ${monthlyUnlockPrice()} while active) or <a href="#/membership?plan=lifetime">Lifetime ${lifetimePrice()} one-time</a> (unlocks ${lifetimeUnlockPrice()} forever).</p>`;
}

const KIND = { info: 'Info / correction', photo: 'Photo or document', lore: 'Lore or story', link: 'Link' };
const STATUS = { pending: ['Awaiting review', 'pending'], approved: ['Approved', 'ok'], rejected: ['Not approved', 'no'], removed: ['Removed', 'no'] };

// Plain account page: the user's own submissions with moderation status, and their
// unlocked files. Nothing here is public; there are no profiles.
export async function account(ctx) {
  if (!ctx.me) return html`<div class="empty-state"><h1>Account</h1><p>Sign in to see your unlocked files and your submissions.</p><button class="btn" data-signin>Sign in</button></div>`;
  const [unlocks, subs] = await Promise.all([ctx.be.listUnlocks(), ctx.be.listMySubmissions()]);
  const L = (id) => ctx.feed.byId.get(id);
  return html`<div class="page-head"><h1>Account</h1><p class="muted">Signed in as <b>@${ctx.me.handle}</b>. Only you see this page.</p>
    ${ctx.be.isPreview ? html`<p class="small muted">Preview: this is a test account in this browser. In live mode your account is your email sign-in, so unlocks follow you to every device.</p>` : ''}</div>
  <div class="with-side"><div>
    <section class="block"><h2>Plan</h2>${planBlock(ctx)}</section>
    <section class="block"><h2>Unlocked files <small class="muted">${unlocks.length}</small></h2>
      ${unlocks.length ? html`<table class="tbl"><thead><tr><th>Property</th><th>Unlocked</th><th>Price paid</th><th>Payment</th></tr></thead><tbody>
        ${unlocks.map((u) => html`<tr><td>${L(u.listing_id) ? html`<a href="#/l/${u.listing_id}">${L(u.listing_id).name}</a>` : u.listing_id}</td><td>${fmtDate(u.unlocked_at)}</td>
        <td>${money(u.amount_paid ?? u.amount_cents / 100)} <span class="muted small">${TIER_LABEL[u.price_tier] || 'standard'}</span></td>
        <td>${u.mock ? html`<span class="example">Example checkout</span> ` : ''}<span class="muted small">${u.payment_ref}</span></td></tr>`)}</tbody></table>`
      : html`<p class="muted">No unlocked files yet. Every listing has a free preview; the full file is ${unlockPrice(ctx)} one time.</p>`}</section>
    <section class="block"><h2>Your submissions <small class="muted">${subs.length}</small></h2>
      ${subs.length ? html`<table class="tbl"><thead><tr><th>Type</th><th>Listing</th><th>What</th><th>Sent</th><th>Status</th></tr></thead><tbody>
        ${subs.map((s) => { const st = STATUS[s.status] || [s.status, '']; const p = s.payload || {};
          return html`<tr><td>${KIND[s.kind] || s.kind}</td><td>${L(s.listing_id) ? html`<a href="#/l/${s.listing_id}">${L(s.listing_id).name}</a>` : html`<span class="muted">${p.new_property ? 'New property' : '—'}</span>`}</td>
          <td>${p.title || p.label || (p.text || '').slice(0, 60) || (safeUrl(p.url) ? host(p.url) : '')}</td><td>${fmtDate(s.created_at)}</td>
          <td><span class="st ${st[1]}">${st[0]}</span>${s.mod_note ? html`<div class="small muted">Moderator: ${s.mod_note}</div>` : ''}</td></tr>`; })}</tbody></table>`
      : html`<p class="muted">You haven’t submitted anything yet. <a href="#/contribute">Submit info, a photo, lore or a link</a>.</p>`}</section>
  </div><aside class="sidebar">
    <section class="box"><h4>Your account</h4><p class="small">Handle: <b>@${ctx.me.handle}</b></p><button class="btn sm ghost" data-signout>Sign out</button></section>
    <section class="box"><h4>How unlocks work</h4><p class="small">Each listing’s full file is a one-time unlock: ${standardPrice()}, ${monthlyUnlockPrice()} while a Monthly membership is active, or ${lifetimeUnlockPrice()} with Lifetime. Unlocked files never expire.</p></section>
    ${ctx.be.isPreview ? html`<section class="box"><h4>Preview tools</h4><p class="small">Try the moderation queue with this test account.</p>
      ${['moderator', 'admin'].includes(ctx.me.role) ? html`<button class="btn sm ghost" data-preview-mod="0">Stop acting as moderator</button>` : html`<button class="btn sm ghost" data-preview-mod="1">Act as moderator (preview)</button>`}</section>` : ''}
  </aside></div>`;
}
