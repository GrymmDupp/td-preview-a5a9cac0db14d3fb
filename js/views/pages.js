import { html } from '../util.js';
import { standardPrice, monthlyUnlockPrice, lifetimeUnlockPrice, monthlyPrice, lifetimePrice } from '../components.js';

export const DISCLAIMER = 'Twisted Deeds is an information and community project, not a real-estate broker or agent. We don’t represent buyers or sellers, collect leads, or take referral fees. Listing links go to the original public listing. Many properties are occupied: respect occupants and private property, view from public ground only, and never trespass.';

export function rules() {
  return html`<div class="page-head"><h1>Community rules</h1><p class="muted">Short, and enforced. They keep the archive honest and keep real people safe.</p></div>
  <div class="prose">
  <ol class="rules">
    <li><b>Public record and first-hand only.</b> Share what the record shows (with a source) or what you saw yourself. Label legend as legend.</li>
    <li><b>No doxxing.</b> Don’t name, describe or locate living private people: owners, occupants, neighbours, sellers, relatives. Historic figures and public officials acting in public roles are fine.</li>
    <li><b>No harassment.</b> Don’t contact owners, occupants or agents about a property’s history, and don’t organise anyone else to. Buying questions go to the original listing.</li>
    <li><b>No trespassing.</b> Photos from public ground only. No drones over occupied homes, no shots into windows, no visits to closed sites.</li>
    <li><b>Respect the dead and their families.</b> No gore, no mocking victims, no speculation about named private people’s causes of death.</li>
    <li><b>Rights matter.</b> Only upload images you took, that are public domain, or that you have permission to share. Listing and news photos stay on their original pages.</li>
    <li><b>Everything is reviewed.</b> Submissions (info, photos, lore, links), listing comments, board posts and replies all go to a moderation queue and appear only after approval.</li>
    <li><b>Report problems.</b> Every comment, board post, reply and submission has a Report button. Reports go straight to moderators.</li>
  </ol>
  <h2>Disclaimer</h2><p>${DISCLAIMER}</p>
  <h2>Ghost stories</h2><p>Reported paranormal activity is recorded as a witness claim, never as fact. Death and crime history is drawn from public sources cited on each page.</p>
  <h2>Removal requests</h2><p>Owners, occupants or relatives who want something changed or removed can use the Report button on any page. We act on safety and privacy requests first.</p>
  </div>`;
}

export function about(ctx) {
  return html`<div class="page-head"><h1>About Twisted Deeds</h1></div><div class="prose">
  <p>Twisted Deeds is a project of <b>Twisted History Tours</b> in Horton, Michigan. We track American properties that are <b>actively for sale</b> and carry a documented dark history or a strong story, and we build the record with a community of local historians, former neighbours and archive-divers.</p>
  <h2>Two grades of story</h2>
  <p><span class="badge ddd" style="--c:#c41e32"><b>Twisted Deed</b></span> The darkest files: murder, crime, mayhem and documented tragedy, from public records. Twisted Deeds always rank first.</p>
  <p><span class="badge story">Strong Story<i>Heritage</i></span> A strong story without the dark record: Architecture &amp; Oddity, Folklore, Failed Attraction, Heritage and Long-Vacant places with lore.</p>
  <h2>Photos</h2>
  <p>When the listing has photos, the preview shows them straight from the original listing page, with a credit and a link back; we don’t copy them. Where the listing has none we can use, we look for photos on other listings or for public-domain and Creative Commons images, each labelled with its type, author and license. Drawn images are always labelled “Illustration, not a photo”.</p>
  <h2>Free preview and full file</h2>
  <p>Every listing has a free preview: name, place, price and status, the original listing link, basic facts, a short summary, a lore teaser and sample photos. A one-time ${standardPrice()} unlock opens that listing’s <b>full file</b> for your account, permanently and on every device: the full story, history and timeline, citations and sources, full lore, ownership chain and story notes, every approved community photo, document and story, and the dossier.</p>
  <p><b>Memberships</b> are optional and only change the price of unlocks. <b>Monthly</b> is ${monthlyPrice()} a month; while it’s active, unlocks cost ${monthlyUnlockPrice()}. Files unlocked during it stay unlocked forever after it lapses. <b>Lifetime</b> is ${lifetimePrice()} one time; unlocks cost ${lifetimeUnlockPrice()} forever. Lifetime members see a plain “Lifetime” badge on their own account page only; it is never shown next to comments, posts or listings.</p>
  <h2>Submissions and community</h2>
  <p><b>Submissions</b> add data to a file: info, photos, lore and links. <b>Community</b> is just two things: comments on each listing, and one general board. Both are moderated. There are no levels, badges, likes or public profiles.</p>
  <h2>Where the data comes from</h2><p>Listings come from a public feed (version ${ctx.feed.meta.version}, ${ctx.feed.meta.count} listings) that Twisted Deeds publishes after checking each listing and its sources. ${ctx.feed.source === 'snapshot' ? 'This page is showing the bundled snapshot because the live feed could not be reached.' : 'This page reads the live feed.'}</p>
  <h2>What we are not</h2><p>${DISCLAIMER}</p></div>`;
}

