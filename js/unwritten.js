// "Unwritten story" (2026-11-21, Grymm): an Archive record whose location is confirmed but whose history we have not found
// (story_status: "unwritten", e.g. an abandoned place). Never any invented text: the card says so plainly and asks people
// who know the place to tell us through Suggest a place (prefilled with the place id). An approved tip earns a Scout stamp.
// Private homes: area only, no photo, and a stay-on-the-road reminder.
import { html } from './util.js';
import { isPrivateHome, publicAreaLabel } from './privacy.js';

export const isUnwritten = (l) => !!l && [l.story_status, l.storyStatus, l.extra?.story_status, l.extra?.storyStatus].some((v) => String(v || '').toLowerCase() === 'unwritten');
// base: path to the app folder from the current page ('' in the app, '../' from live/ and passport/)
export const tellUsHref = (l, base = '') => `${base}live/#suggest=${encodeURIComponent(l.id)}`;

export function unwrittenCard(l, { base = '', compact = false } = {}) {
  const priv = isPrivateHome(l);
  const where = priv ? (publicAreaLabel(l) || l.place || '') : (l.place || '');
  return html`<article class="unwritten-card${compact ? ' compact' : ''}" aria-label="Unwritten story: ${l.name}">
    <div class="uw-kicker">Unwritten story</div>
    <h3 class="uw-name">${compact ? html`<a href="#/l/${encodeURIComponent(l.id)}">${l.name}</a>` : l.name}</h3>
    ${where ? html`<div class="uw-where">${where}${priv ? ' · area only' : ''}</div>` : ''}
    <p class="uw-line">We haven’t found this place’s story yet.</p>
    ${priv ? html`<p class="uw-road"><b>This is a private home.</b> Only its area is shown. Stay on the public road: please don’t stop, park, knock or go onto the property.</p>` : ''}
    <p><a class="btn uw-tell" href="${tellUsHref(l, base)}">Know this place? Tell us</a></p>
    <p class="uw-note small muted">Tips are checked against public records before anything is written here. If yours is approved, you get a Scout stamp in your Twisted Passport.</p>
  </article>`;
}
