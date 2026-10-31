import { html, fmtDate } from '../util.js';
import { standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice, unlockPrice, membershipsOn, soonChip, soonButton, trialNote } from '../components.js';

// Membership checkout (planned model, prices in js/config.js): Monthly (per month, lower unlock
// price while active) or Lifetime (one time, lowest unlock price forever). Memberships ONLY change the unlock price. Files already unlocked
// stay unlocked whatever happens to the membership.
// Local preview: MOCK (no payment). Live: Stripe Checkout via create-checkout.
// TRIAL: while memberships are off (app_settings memberships_enabled = 'false') this page only
// describes them as "Coming soon": no prices as offers and no purchase buttons.
export async function membership(ctx, q) {
  const plan = q.get('plan') === 'monthly' ? 'monthly' : 'lifetime';
  const from = q.get('from'), l = from && ctx.feed.byId.get(from);
  const back = l ? html`<a href="#/l/${l.id}">← Back to ${l.name}</a>` : html`<a href="#/account">← Account</a>`;
  if (!membershipsOn()) return comingSoon(ctx, back, l);
  const cur = ctx.membership;
  if (cur?.plan === 'lifetime' || (cur?.plan === plan && cur.status === 'active'))
    return html`<nav class="crumbs">${back}</nav><div class="empty-state"><h1>Membership</h1><p>You already have this plan. Unlocks are ${unlockPrice(ctx)}.</p><a class="btn" href="#/account">Account</a></div>`;
  const mock = ctx.be.isPreview || ctx.be.mockCheckout, where = ctx.be.mode === 'local' ? 'in this browser only' : 'to your account', monthly = plan === 'monthly';
  const price = monthly ? `${monthlyPrice()} / month` : `${lifetimePrice()} one time`;
  const other = monthly ? html`<a href="#/membership?plan=lifetime${from ? '&from=' + from : ''}">Lifetime instead (${lifetimePrice()} one-time, unlocks ${lifetimeUnlockPrice()})</a>` : html`<a href="#/membership?plan=monthly${from ? '&from=' + from : ''}">Monthly instead (${monthlyPrice()}/mo, unlocks ${monthlyUnlockPrice()})</a>`;
  return html`<nav class="crumbs">${back}</nav>
  ${mock ? html`<div class="mock-banner" role="note"><b>Example checkout, no real payment.</b> This prototype records a test ${monthly ? 'Monthly' : 'Lifetime'} membership ${where}. No card details are asked for or stored.</div>` : ''}
  <div class="checkout">
    <section class="co-summary"><h1>${monthly ? 'Monthly membership' : 'Lifetime membership'}</h1>
      ${monthly ? html`<ul class="incl"><li>${monthlyPrice()} a month, cancel any time</li><li>While it’s active, every file unlock is <b>${monthlyUnlockPrice()}</b> instead of ${standardPrice()}</li><li>Files you unlock stay unlocked <b>forever</b>, even after the membership ends. Ending it only changes the price of future unlocks.</li></ul>`
        : html`<ul class="incl"><li>${lifetimePrice()} one time. Never expires, no renewals</li><li>Every file unlock is <b>${lifetimeUnlockPrice()}</b> instead of ${standardPrice()}, forever</li><li>Files you unlock stay unlocked forever</li></ul>
          ${cur?.plan === 'monthly' ? html`<p class="small">Your Monthly membership will be ended when Lifetime starts.</p>` : ''}`}
      <p class="small muted">That’s all a membership does. Free previews, submissions, comments and the board are the same for everyone. Files already unlocked aren’t refunded the difference.</p>
      <p class="small">${other}</p></section>
    <section class="co-pay">
      <dl class="co-lines"><dt>${monthly ? 'Monthly membership' : 'Lifetime membership (one-time)'}</dt><dd>${price}</dd><dt><b>Due today</b></dt><dd><b>${monthly ? monthlyPrice() : lifetimePrice()} ${ctx.config.pricing.currency}</b></dd></dl>
      ${monthly ? html`<p class="small muted">Renews monthly at ${monthlyPrice()} until you cancel.</p>` : ''}
      ${!ctx.me ? html`<p>Sign in first so the membership is saved to your account.</p><button class="btn big" data-signin>Sign in to continue</button>`
        : html`<p class="small">Account: <b>@${ctx.me.handle}</b></p>
        ${mock ? html`<div class="mock-card" aria-hidden="true"><span>Card details would be entered on Stripe’s secure page.</span><span class="muted">Not collected in this example.</span></div>
          <button class="btn big" data-membership-checkout="${plan}" data-from="${from || ''}">Complete example checkout · ${monthly ? monthlyPrice() + '/mo' : lifetimePrice()}</button>
          <p class="small muted">Example checkout, no real payment.</p>`
        : html`<button class="btn big" data-membership-checkout="${plan}" data-from="${from || ''}">Continue to secure checkout</button>`}`}
      <a class="btn ghost" href="${l ? '#/l/' + l.id : '#/account'}">Cancel</a></section>
  </div>`;
}

function comingSoon(ctx, back, l) {
  return html`<nav class="crumbs">${back}</nav>
  <div class="page-head"><h1>Memberships ${soonChip()}</h1><p class="muted">Monthly and Lifetime memberships aren’t available yet. Nothing to buy here for now.</p></div>
  <div class="soon-plans">
    <section class="box soon-plan"><h4>Monthly membership ${soonChip()}</h4><p class="small">Will lower the price of file unlocks while it’s active. Files you unlock stay unlocked forever.</p>${soonButton('Monthly')}</section>
    <section class="box soon-plan"><h4>Lifetime membership ${soonChip()}</h4><p class="small">Will lower the price of every file unlock, for good. One time, no renewals.</p>${soonButton('Lifetime')}</section>
  </div>
  <p>Right now every full file is <b>${standardPrice()}</b> one time${trialNote()}, for everyone. ${l ? html`<a class="btn sm" href="#/unlock/${encodeURIComponent(l.id)}">Unlock ${l.name} · ${unlockPrice(ctx)}</a>` : html`<a href="#/browse">Browse the archive</a>`}</p>
  <p class="small muted">Free previews, submissions, comments and the board are the same for everyone.</p>`;
}
