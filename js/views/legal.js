// Legal and trust pages: Terms, Privacy, Refunds, and "Stories & Corrections" (disclaimer + corrections / removal form).
// Contact is the corrections form only: no email address is shown anywhere public. Each page is marked as an attorney-unreviewed draft.
import { html, raw, esc } from '../util.js';
import { rule } from '../tome.js';
import { CONFIG } from '../config.js';
import { PRICING, money, product } from '../pricing.js';
import { analyticsOn, analyticsBlocked } from '../analytics.js';

const UPDATED = 'November 16, 2026';
const draftLine = () => html`<p class="lg-draft">Draft, not yet reviewed by an attorney.</p>`;
const shell = (title, kicker, body) => html`<article class="legal prose">
  <p class="research-kicker">${kicker}</p><h1>${title}</h1>
  <p class="small muted">Twisted Deeds, a Twisted History Tours production · Horton, Michigan · Last updated ${UPDATED}</p>
  ${raw(rule('pt-rule'))}${body}${raw(rule('pt-rule'))}
  <p class="small lg-links"><a href="#/terms">Terms of Service</a> · <a href="#/privacy">Privacy Policy</a> · <a href="#/refunds">Refund Policy</a> · <a href="#/stories">Stories &amp; Corrections</a></p>
  ${draftLine()}</article>`;

export const terms = () => shell('Terms of Service', 'The fine print', html`
<p>These terms cover your use of Twisted Deeds (the “app”), run by Twisted Deeds, a Twisted History Tours production, in Horton, Michigan (“we”, “us”). By using the app or buying anything in it, you agree to them. If you do not agree, please do not use it.</p>
<h2>What this is</h2>
<p>Twisted Deeds is an information and community project about American houses with a documented past. It is not a real-estate broker, agent or listing service. We do not represent buyers or sellers, take referral fees, or collect leads. Nothing here is a property disclosure, an appraisal, an inspection, a title search, a consumer report or legal, financial or real-estate advice. Read <a href="#/stories">Stories &amp; Corrections</a> for how our stories are sourced.</p>
<h2>Accounts</h2>
<p>You need an account to unlock files, save to your account, comment and commission research. Keep your password private. You are responsible for what happens under your account. You must be old enough to form a binding contract where you live (and at least 13).</p>
<h2>What you may do</h2>
<ul><li>Read, browse and enjoy the app for your own personal use.</li><li>Share links to pages in the app.</li><li>Submit information, photos and comments under our <a href="#/rules">community rules</a>: public records or first-hand knowledge, no living private people, no trespass, and only photos you have the rights to.</li></ul>
<h2>What you may not do</h2>
<ul><li>Visit, photograph or disturb any property in a way that trespasses or bothers the people who live there. Many of these homes are occupied. View from public ground only.</li><li>Contact, follow or harass owners, residents, sellers or neighbours, or use anything here to find or approach them.</li><li>Use a Research File or any full file to screen tenants, employees, borrowers or insurance applicants, or as a consumer report of any kind.</li><li>Copy, scrape or resell the full files or Research Files, or share your paid access with others. Your purchase is for your own use.</li><li>Try to break, overload or get around the app’s security or paywalls.</li></ul>
<h2>Paid files, packs and memberships</h2>
<p>Prices are shown in US dollars on the <a href="#/patronage">Patronage</a> page and at checkout. Payments are handled by Stripe; we never see or store your card number. A single full-file unlock is for one listing and stays on your account permanently (as long as the app and your account exist). Research Files are made by hand from public sources; turnaround times are targets, not guarantees. We cannot promise a search will find anything: if nothing turns up, the file says so and is still delivered. Memberships renew until you cancel. See the <a href="#/refunds">Refund Policy</a>.</p>
<h2>Content you submit</h2>
<p>You keep ownership of what you submit. You give us a non-exclusive, free licence to show it in the app, including in a listing’s full file, and to edit or remove it. Everything is moderated, and we may remove anything for any reason. You promise you have the right to submit it.</p>
<h2>Our content</h2>
<p>The app’s design, text, research, maps and compilations belong to us or are used with permission. Listing photos are loaded from the original public listing with a credit; they belong to their owners. Radio recordings are public-domain excerpts, credited in the app.</p>
<h2>No warranty, limited liability</h2>
<p>The app is provided “as is” and “as available”. Stories come from public records and published sources and can contain errors; listings change or sell without notice. To the fullest extent the law allows, we are not liable for indirect or consequential damages, or for loss from relying on anything in the app, and our total liability for any claim is limited to what you paid us in the 12 months before it arose. Some places do not allow these limits, so they may not apply to you.</p>
<h2>Changes, ending access, governing law</h2>
<p>We may change the app or these terms; the date above shows the latest version, and continuing to use the app means you accept the change. We may suspend accounts that break these terms. These terms are governed by the laws of the State of Michigan, and any dispute will be brought in the state or federal courts located in Michigan, unless the law where you live requires otherwise.</p>
<h2>Contact</h2><p>Use the form on <a href="#/stories#correction">Stories &amp; Corrections</a> (choose “Other”).</p>`);

export const privacy = () => shell('Privacy Policy', 'What we keep, and what we don’t', html`
<p>Short version: we keep what we need to run your account and your purchases, we count visits without tracking you, and we do not sell your data to anyone.</p>
<h2>What we collect</h2>
<ul>
<li><b>Account.</b> If you create one: your email address and a password (stored by Supabase, our database and sign-in provider, as a hash we cannot read), and an automatic handle like <i>reader-1a2b3c4d</i>. Your email is never shown to other readers.</li>
<li><b>Purchases.</b> Payments are taken by Stripe on its own page; we never see your card number. We keep the record of what you bought: the listing or pack, the amount, the date and the Stripe payment reference.</li>
<li><b>What you write.</b> Comments, board posts, submissions and photos you send; Research File requests (the address, what you want looked at, your account email); and anything you put in the corrections form, including a reply email address if you choose to give one. Submissions may be shown publicly once a moderator approves them, under the name you choose.</li>
<li><b>Your saved things.</b> If you are signed in, your saved listings, reading log and the hidden spiders you have found are synced to your account so they follow you from phone to phone. Signed out, they stay on your device only.</li>
</ul>
<h2>What stays on your device</h2>
<p>The app keeps settings and small bits of progress in your browser’s own storage (not cookies): your saves, reading log, finds, sound, motion, effects and radio choices, field leads you save in the Live navigator (those never leave your phone and are not synced), and a copy of recently opened books so they work offline. A service worker keeps app files for offline use. Clearing your browser data removes all of it.</p>
<h2>Location</h2>
<p>The Live navigator uses your location only on your device, only while it is running and only after your browser asks you; we do not send your position to our servers. If you have already allowed location for this site, the “rain on the window” touch asks Open-Meteo (a free weather service) for the current weather using your location rounded to about one kilometre; nothing about you is sent with it, and the answer is kept on your device for about 30 minutes. We never ask for location just for the weather.</p>
<h2>Analytics</h2>
<p>We count how the app is used so we know what to improve: page views by section, which listings are opened, and clicks on unlock, pricing, share, radio and effects. Each count is one row with the date, the kind of event and a short label such as a section name or a listing id. We do <b>not</b> use cookies, store IP addresses or browser details in these counts, attach an account or a device id, or use any third-party analytics. The app does not record anything if your browser sends Do Not Track or Global Privacy Control, and you can switch it off on your <a href="#/account">Account</a> page. ${analyticsBlocked() ? html`<b>Your browser is sending a Do Not Track signal, so counting is off for you.</b>` : analyticsOn() ? 'Right now counting is on for you.' : 'Right now counting is off for you.'}</p>
<h2>Who else handles data</h2>
<ul><li><b>Supabase</b>: accounts, saved things, purchases, submissions and corrections.</li><li><b>Stripe</b>: payments.</li><li><b>GitHub Pages</b>: hosts the app files.</li><li><b>Open-Meteo</b>: weather for the rain touch, as described above.</li><li><b>Map tile providers</b> (OpenFreeMap, OpenStreetMap contributors, and Esri as a backup) and <b>the original listing sites</b> that photos are loaded from: when your device fetches a map tile or a photo, that provider sees your IP address, as with any website.</li></ul>
<p>These providers have their own privacy policies and may keep ordinary server logs. We do not sell or rent personal data and we do not share it for advertising.</p>
<h2>How long we keep it, and your choices</h2>
<p>We keep account data while your account exists and purchase records as long as needed for your access, taxes and disputes. Usage counts are kept without personal identifiers. You can switch counting off, clear your device’s storage, or ask us to delete your account and the data tied to it, or to correct it, through the form on <a href="#/stories#correction">Stories &amp; Corrections</a> (choose “Other”, and say which account). Some purchase records may have to be kept by law.</p>
<h2>Children</h2><p>The app is not meant for children under 13, and we do not knowingly collect their data.</p>
<h2>Changes</h2><p>If this policy changes we will update the date above. Governed by Michigan law.</p>`);

const U = () => product('unlock');
export const refunds = () => shell('Refund Policy', 'If something is wrong', html`
<p>We would rather make it right than keep your money for something that did not work. Here is how it goes for each thing you can buy.</p>
<h2>Full-file unlocks</h2>
<p>Ask within <b>7 days</b> of buying and we will refund an unlock if the file was not useful to you or has an error we cannot fix. Tell us which listing and why through the form below. A refunded unlock is locked again on your account.</p>
<h2>Research Files (Record and Dossier)</h2>
<ul><li><b>Before work starts:</b> a full refund.</li><li><b>After work has started:</b> a partial refund for the part of the work we have not done. We will tell you the amount before we send it.</li><li><b>Delivered files:</b> if the file has an error, we will correct it; if we cannot, we will refund fairly. A search that honestly finds little is still delivered work: the file lists where we looked and what was not found.</li><li><b>Rush:</b> the rush fee is refunded if we miss the 72-hour target; otherwise it is not refundable once work has started.</li></ul>
<h2>Memberships</h2>
<ul><li><b>Cancel any time</b> from your Account page or Stripe’s billing page. You keep your membership until the end of the period you paid for.</li><li><b>No partial-month refunds</b> for time already started, and renewals are not refunded after the period begins, except where the law requires it.</li><li>Lifetime memberships and gift memberships: ask within 7 days of buying if you have not used them.</li><li>Files you unlocked on their own stay yours when a membership ends.</li></ul>
<h2>Drive packs</h2><p>Digital downloads: same as full-file unlocks, 7 days if the pack has an error or does not work.</p>
<h2>How to ask</h2>
<p>Use <a href="#/stories#correction">the form on Stories &amp; Corrections</a>, choose “Other”, and begin your message with “Refund:” plus your account email and what you bought. Refunds go back to the original payment method through Stripe and usually appear in 5 to 10 business days. If a charge looks wrong, please write to us first so we can fix it quickly.</p>
<p class="small muted">Current prices: unlock ${money(U().price)} (founder ${money(U().founder.price)}), annual ${money(product('member_year').price)}, monthly ${money(product('member_month').price)}${CONFIG.show?.lifetime ? `, lifetime ${money(product('lifetime').price)}` : ''}, Record ${money(product('pack_record').price)}, Dossier ${money(product('pack_dossier').price)}. See <a href="#/patronage">Patronage</a>.</p>`);

const OPTION = (v, t, sel) => html`<option value="${v}" ${sel === v ? 'selected' : ''}>${t}</option>`;
export async function stories(ctx, q) {
  const lid = q.get('l') || '', l = lid && ctx.feed.byId.get(lid);
  return html`<article class="legal prose">
  <p class="research-kicker">Where our stories come from</p><h1>Stories &amp; Corrections</h1>
  <p class="small muted">Twisted Deeds, a Twisted History Tours production · Horton, Michigan · Last updated ${UPDATED}</p>
  ${raw(rule('pt-rule'))}
  <h2>How to read a story here</h2>
  <p>Every story in Twisted Deeds is drawn from <b>public records and published sources</b>: deed and tax records, court and agency records, newspapers, books, archives and broadcast coverage. We cite what we use and mark what is confirmed and what is only reported. Stories about a place’s past are not claims about the people who live there or own it now.</p>
  <ul><li><b>No claims about current owners or residents.</b> We do not say that any present owner, seller or occupant did, believed or experienced anything. If a person is named, it is because a public source names them in connection with the property’s history.</li>
  <li><b>Not a property disclosure.</b> Nothing here is a disclosure, a statement about a home’s condition or value, or a reason to buy or not buy. “Stigmatized” and similar labels describe published history, not a legal finding. Talk to a licensed real-estate professional and an attorney about any purchase.</li>
  <li><b>Not real-estate advice</b>, and not an offer to sell. Listings link to the original public listing, which is the source of truth for price and availability.</li>
  <li><b>Please respect the people who live there.</b> View from public ground only, never trespass, and do not contact owners or occupants.</li></ul>
  <h2 id="correction">Ask for a correction or a removal</h2>
  <p>If something is wrong, out of date, or you would like a place or a detail taken down, tell us here. A person reviews every request. We aim to answer within a few days, and we remove a private home’s details promptly when the request is reasonable. If you want a reply, leave an email address; otherwise we will act on it without one.</p>
  ${ctx.be.mode === 'supabase' && !ctx.be.features?.corrections ? html`<p class="lg-form soon-block" role="status"><span class="soon">Opening soon</span><br>The corrections inbox is being set up. Please check back in a little while.</p>` : html`<form class="form lg-form" data-correction>
    <label>What is this about?<select name="kind">${OPTION('correction', 'A correction', 'correction')}${OPTION('removal', 'Remove a place or detail', '')}${OPTION('other', 'Something else (refunds, account help, data requests)', '')}</select></label>
    <label>Which listing or page? <span class="muted">(optional)</span><input name="page" list="lg-listings" maxlength="200" value="${l ? l.name : ''}" placeholder="Start typing a listing name"><datalist id="lg-listings">${[...ctx.feed.catalog].slice(0, 400).map((x) => html`<option value="${x.name}"></option>`)}</datalist></label>
    <label>I am… <span class="muted">(optional)</span><input name="relation" maxlength="80" placeholder="for example: the owner, a neighbour, a researcher, a reader"></label>
    <label>What should we know?<textarea name="message" rows="6" required minlength="10" maxlength="3000" placeholder="What is wrong or should be removed, and a link or source if you have one"></textarea></label>
    <label>Email for a reply <span class="muted">(optional)</span><input name="reply_to" type="email" maxlength="200" autocomplete="email"></label>
    <label class="lg-hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <button class="btn">Send to the curator</button>
    <p class="small muted">Your message is stored privately and read only by the site’s administrators. No account is needed.</p>
  </form>`}
  ${raw(rule('pt-rule'))}
  <p class="small lg-links"><a href="#/terms">Terms of Service</a> · <a href="#/privacy">Privacy Policy</a> · <a href="#/refunds">Refund Policy</a></p>
  ${draftLine()}</article>`;
}
