// Patronage (#/patronage): every paid thing in one Victorian price list. All numbers and Payment Link URLs come
// from js/pricing.js. A product with no Payment Link yet shows a quiet "Opening soon" plate, never a dead button.
import { html, raw } from '../util.js';
import { CONFIG } from '../config.js';
import { rule } from '../tome.js';
import { PRICING, product, money, founderOn, founderRemaining, linkNow, isOpen, withReference } from '../pricing.js';

const plate = (id, { lead = false, extra = '', cta = '' } = {}) => {
  const p = product(id), fOn = founderOn(id), now = fOn ? p.founder.price : p.price, rem = founderRemaining(id);
  const open = isOpen(id);
  return html`<article class="pt-card ${lead ? 'lead' : ''}" data-product="${id}">
    ${lead ? html`<p class="pt-ribbon">The better bargain</p>` : ''}
    <h3>${p.name.replace(/^Research pack: /, '').replace(/^Membership, /, '')}</h3>
    <p class="pt-price"><b>${money(now)}</b>${fOn ? html` <s>${money(p.price)}</s>` : ''} <span class="pt-per">${p.per || ''}</span></p>
    ${fOn ? html`<p class="pt-founder">Founder price: ${p.founder.note}${rem != null ? html` · <b>${rem}</b> left` : ''}</p>` : ''}
    ${extra}
    ${cta || (open ? buyLink(id) : html`<p class="pt-soon"><span class="soon">Opening soon</span></p>`)}
  </article>`;
};

// Opens the Stripe Payment Link in a new tab. Fulfilment for these is by hand until their checks are wired in (see _build/STRIPE_LINKS_TODO.md).
const buyLink = (id) => html`<a class="btn" data-pricing-click="${id}" href="${linkNow(id)}" target="_blank" rel="noopener">Buy · ${money(founderOn(id) ? product(id).founder.price : product(id).price)}</a>`;

export async function patronage(ctx) {
  const u = product('unlock');
  const unlockCta = html`<a class="btn" href="#/browse" data-pricing-click="unlock_browse">Choose a file to unlock</a>`;
  return html`<section class="pt-hero">
    <p class="research-kicker">The patron's ledger</p>
    <h1>Patronage</h1>
    <p class="pt-lede">Twisted Deeds is free to wander. Every listing has a free preview, and the shelf, the map, the Live navigator and the whole world around them cost nothing. Patrons pay for the full files and for hand-made research, and that is what keeps the archive going.</p>
    ${raw(rule('pt-rule'))}
  </section>

  <section class="pt-sec"><h2>The full file</h2>
    <p class="muted">The complete story, sources, and the confirmed-versus-reported notes for one listing. One payment, yours for good on every device.</p>
    <div class="pt-grid one">${plate('unlock', { cta: unlockCta, extra: founderOn('unlock') ? html`<p class="small muted">${money(u.price)} once the first ${u.founder.limit} unlocks have sold.</p>` : '' })}</div>
  </section>

  <section class="pt-sec"><h2>Membership</h2>
    <p class="muted">Every full file included, with nothing more to buy, for as long as you are a member. Files you unlocked on their own stay yours either way.</p>
    <div class="pt-grid">
      ${plate('member_year', { lead: true })}
      ${plate('member_month')}
      ${CONFIG.show?.lifetime || isOpen('lifetime') ? plate('lifetime') : ''}
    </div>
    <ul class="pt-perks">${PRICING.memberPerks.map((t) => html`<li>${t}</li>`)}</ul>
  </section>

  <section class="pt-sec"><h2>Research Files</h2>
    <p class="muted">Name an address and we go into the public record for you: deeds, tax roll, permits, newspapers, old maps. A cited PDF, every finding marked <i>Confirmed</i>, <i>Reported</i> or <i>Not found</i>. Public sources only, never contact with owners or residents. Members take ${Math.round(PRICING.packDiscount * 100)}% off.</p>
    <div class="pt-grid">
      ${plate('pack_record', { extra: html`<p class="small">Ownership chain, tax and assessment, permits and violations, a news search, maps and imagery, and a short cited summary.</p><p class="small muted">Members: ${money(product('pack_record_member').price)}</p>`, cta: html`<a class="btn" href="#/research" data-pricing-click="pack_record">Commission a Record</a>` })}
      ${plate('pack_dossier', { extra: html`<p class="small">Everything in Record, plus a full narrative history, an incident and public-safety search, historic maps, a people-of-the-house timeline and a long PDF.</p><p class="small muted">Members: ${money(product('pack_dossier_member').price)}</p>`, cta: html`<a class="btn" href="#/research" data-pricing-click="pack_dossier">Commission a Dossier</a>` })}
      ${plate('rush', { extra: html`<p class="small">Moves either pack to the front of the line: 72 hours.</p>`, cta: html`<p class="pt-soon small muted">Tick “Rush” on the request form.</p>` })}
    </div>
    <p class="small muted pt-foot">Requests are taken now. We email you to confirm the price and the turnaround, and send the payment link, before any work begins. ${isOpen('pack_record') ? '' : 'Online payment is not open yet; we send a secure Stripe link by email. '}A Research File is not a consumer report, a title search, an inspection or legal advice. <a href="#/refunds">Refunds</a> · <a href="#/terms">Terms</a>.</p>
  </section>

  ${CONFIG.show?.giftsAndDrives || isOpen('gift') || isOpen('drive_jackson') ? html`<section class="pt-sec"><h2>Gifts and drive packs</h2>
    <div class="pt-grid">
      ${plate('gift', { extra: html`<p class="small">A year of membership, sent as a printable library-card certificate. It does not renew by itself.</p>` })}
      ${plate('drive_jackson', { extra: html`<p class="small">A printable map, route and stop list for one city. Free for members.</p>` })}
    </div>
  </section>` : ''}

  <p class="small muted pt-foot">Prices in US dollars. Payments are taken by Stripe; we never see or store your card. Read the <a href="#/refunds">refund policy</a> and the <a href="#/terms">terms</a>. Twisted Deeds, a Twisted History Tours production · Horton, Michigan.</p>`;
}
