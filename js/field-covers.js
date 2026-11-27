// Approved field-report photos used as card images when a place has no other picture.
// Private homes never get a public house photo this way. GPS is never stored here.
const covers = new Map();   // listing id -> { src, credit, title }

export function setFieldCovers(rows) {
  covers.clear();
  for (const r of rows || []) {
    if (!r?.listing_id || !r?.src) continue;
    if (covers.has(r.listing_id)) continue;
    covers.set(r.listing_id, { src: r.src, credit: r.credit || 'A traveler', title: r.title || '' });
  }
}

export function fieldCoverFor(l) {
  if (!l?.id) return null;
  if (l.privateHome || l.private_home || l.townOnly || l.privacy === 'neighborhood') return null;
  return covers.get(l.id) || null;
}

export function hasFeedPhoto(images) {
  return Array.isArray(images) && images.some((i) => i && /^https?:/.test(i.src || i.url || ''));
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function creditOf(r) {
  return String(r.credit || r.payload?.credit || r.author?.display_name || '').trim() || (r.author?.handle ? r.author.handle : 'A traveler');
}
function srcOf(r) { return r.data_url || r.payload?.data_url || r.src || ''; }
function capOf(r) { return String(r.caption || r.payload?.caption || r.payload?.text || r.payload?.note || '').trim(); }

// Approved field reports for a place card or file. Never include GPS.
export function fieldReportsHtml(rows, { heading = 'Field reports', id = 'field-reports' } = {}) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return '';
  const items = list.map((r) => {
    const src = srcOf(r), credit = creditOf(r), cap = capOf(r), title = String(r.title || r.payload?.title || '').trim();
    if (r.kind === 'photo' || src) {
      return '<figure class="td-fr-item">' + (src ? '<img src="' + esc(src) + '" alt="' + esc(title || cap || 'Field photo') + '" loading="lazy">' : '')
        + '<figcaption>' + (title ? '<b>' + esc(title) + '</b> ' : '') + (cap ? esc(cap) + ' ' : '')
        + '<span class="td-fr-cred">Photo: ' + esc(credit) + '</span></figcaption></figure>';
    }
    return '<div class="td-fr-note"><p>' + esc(cap || title) + '</p><p class="td-fr-cred">Note: ' + esc(credit) + '</p></div>';
  }).join('');
  return '<section class="td-fr" id="' + esc(id) + '"><h2>' + esc(heading) + '</h2>'
    + '<p class="muted small">Sent from the field and approved for this file. Photos were taken from a public road.</p>'
    + items + '</section>';
}
