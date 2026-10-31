import { html, fmtDate } from '../util.js';
import { isArchived } from '../feed.js';
import { gradeBadge, plate, unlockPrice, membersLine, viewerTier, TIER_LABEL, trialNote, isTrial } from '../components.js';

// Checkout. Local preview: a MOCK that records a test unlock, no card, no payment.
// Supabase mode (Payment Link trial): opens the Stripe Payment Link; the unlock row is written
// only server-side, by verify-unlock once Stripe shows the payment as paid.
export async function unlock(ctx, q, id) {
  const l = ctx.feed.byId.get(id);
  if (!l) return html`<div class="empty-state"><h1>Not in the archive</h1><p><a href="#/browse">Browse the archive</a>.</p></div>`;
  const back = html`<a href="#/l/${l.id}">← Back to the preview</a>`;
  if (ctx.unlocks.includes(l.id)) return html`<div class="empty-state"><h1>Already unlocked</h1><p>The full file for <b>${l.name}</b> is on your account.</p><a class="btn" href="#/l/${l.id}">Open the full file</a></div>`;
  const plink = !!ctx.be.paymentLinkCheckout, req = ctx.unlockRequests?.get(l.id), pend = plink && req?.status === 'pending';
  const mock = !plink && (ctx.be.isPreview || ctx.be.mockCheckout), where = ctx.be.mode === 'local' ? 'in this browser only' : 'to your account';
  return html`<nav class="crumbs">${back}</nav>
  ${mock ? html`<div class="mock-banner" role="note"><b>Example checkout, no real payment.</b> This prototype records a test unlock ${where}. No card details are asked for or stored.</div>` : ''}
  <div class="checkout">
    <section class="co-summary">
      <h1>Unlock the full file</h1>
      <div class="co-item">${plate(l, 'thumb')}<div><div>${gradeBadge(l)}</div><h3>${l.name}</h3><p class="muted">${l.place}</p></div></div>
      <ul class="incl"><li>Full story, history and timeline</li><li>Citations and sources</li><li>Full lore</li><li>Ownership chain and Strong Story notes (where recorded)</li><li>All approved community photos, documents and stories</li><li>The dossier (where one exists)</li></ul>
      ${isArchived(l) ? html`<p class="no-longer small"><b>No longer for sale.</b> This property is marked ${l.status}. The file covers its history and story, not a purchase opportunity.</p>` : ''}
      <p class="small muted">One-time payment for this one file. It stays unlocked on your account permanently and on every device you sign in on. No subscription, no renewals.</p>
    </section>
    <section class="co-pay">
      <dl class="co-lines"><dt>Full file · ${l.name}</dt><dd>${unlockPrice(ctx)}${trialNote()}</dd>${ctx.membership && !isTrial() ? html`<dt class="small muted">${TIER_LABEL[viewerTier(ctx.membership)]}</dt><dd></dd>` : ''}<dt><b>Total</b></dt><dd><b>${unlockPrice(ctx)} ${ctx.config.pricing.currency}</b></dd></dl>
      ${ctx.membership && !isTrial() ? '' : html`<p class="small muted">${membersLine(l.id)}</p>`}
      ${!ctx.me ? html`<p>Sign in first so the unlock is saved to your account.</p><button class="btn big" data-signin>Sign in to continue</button>`
        : html`<p class="small">Account: <b>@${ctx.me.handle}</b></p>
        ${plink ? html`${pend ? html`<p class="pay-pending small"><b>Waiting for your payment to clear</b> (reference <code>${req.reference}</code>). The file unseals the instant Stripe shows it paid. <button class="link small" data-check-payment="${req.id}">Check payment</button> If you didn’t finish paying, continue below; it reuses the same reference.</p>` : ''}
          <button class="btn big" data-checkout="${l.id}">${pend ? 'Open the payment page again' : 'Continue to payment'} · ${unlockPrice(ctx)}</button>
          <p class="small muted">Opens Stripe’s secure payment page in a new tab. We never see or store your card. The file unseals on your account the instant your payment clears. Keep this tab open, or come back to it.</p>`
        : mock ? html`<div class="mock-card" aria-hidden="true"><span>Card details would be entered on Stripe’s secure page.</span><span class="muted">Not collected in this example.</span></div>
          <button class="btn big" data-checkout="${l.id}">Complete example checkout · ${unlockPrice(ctx)}</button>
          <p class="small muted">Example checkout, no real payment. Creates a test unlock with a mock payment reference.</p>`
        : html`<button class="btn big" data-checkout="${l.id}">Continue to secure checkout · ${unlockPrice(ctx)}</button><p class="small muted">Payment is handled by Stripe. We never see or store your card.</p>`}`}
      <a class="btn ghost" href="#/l/${l.id}">Cancel</a>
    </section>
  </div>`;
}
