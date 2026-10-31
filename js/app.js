// Twisted Deeds public site: shell, router and global event handling.
import { CONFIG } from './config.js';
import { loadFeed, feed, updatesMap } from './feed.js';
import { getBackend } from './backend/adapter.js';
import { $, toast, esc } from './util.js';
import { home } from './views/home.js';
import { browse } from './views/browse.js';
import { listing } from './views/listing.js';
import { mapView, mountMap } from './views/map.js';
import { board } from './views/board.js';
import { unlock } from './views/unlock.js';
import { membership } from './views/membership.js';
import { account } from './views/account.js';
import { contribute } from './views/contribute.js';
import { moderation } from './views/moderation.js';
import { rules, about, DISCLAIMER } from './views/pages.js';

const ctx = { feed, be: null, me: null, membership: null, unlocks: [], comments: {}, config: CONFIG };

const suggest = (c, q) => { q.set('type', 'link'); q.set('new', '1'); return contribute(c, q); };
const ROUTES = [
  [/^\/?$/, home, 'Listings'], [/^\/browse$/, browse, 'Browse'], [/^\/l\/(.+)$/, listing, null], [/^\/map$/, mapView, 'Map'],
  [/^\/board$/, board, 'Community board'], [/^\/unlock\/(.+)$/, unlock, 'Unlock the full file'], [/^\/membership$/, membership, 'Membership'], [/^\/lifetime$/, (c, q) => { q.set('plan', 'lifetime'); return membership(c, q); }, 'Membership'], [/^\/account$/, account, 'Account'],
  [/^\/contribute$/, contribute, 'Submit'], [/^\/suggest$/, suggest, 'Suggest a property'], [/^\/moderate$/, moderation, 'Moderation'],
  [/^\/rules$/, rules, 'Community rules'], [/^\/about$/, about, 'About'],
];

async function refreshCtx() {
  ctx.me = await ctx.be.getSession();
  ctx.membership = await ctx.be.getMembership();
  ctx.unlocks = (await ctx.be.listUnlocks()).map((u) => u.listing_id);
  ctx.comments = await ctx.be.commentCounts();
  ctx.notifyPref = ctx.me && ctx.be.getNotifyPref ? await ctx.be.getNotifyPref().catch(() => null) : null;
  // listing_id -> { at, kinds } for approved submissions in the last CONFIG.newDays days (facts only)
  ctx.updates = updatesMap(ctx.be.recentUpdates ? await ctx.be.recentUpdates(CONFIG.newDays).catch(() => []) : []);
}

function renderChrome(path) {
  const nav = [['#/', 'Listings', /^\/?$/], ['#/browse', 'Browse', /^\/browse/], ['#/map', 'Map', /^\/map/], ['#/board', 'Board', /^\/board/]];
  $('#nav').innerHTML = nav.map(([h, t, re]) => `<a href="${h}" class="${re.test(path) ? 'on' : ''}">${t}</a>`).join('') + `<a href="#/contribute" class="nav-cta ${/contribute|suggest/.test(path) ? 'on' : ''}">Submit</a>`;
  $('#who').innerHTML = (ctx.me
    ? `${['moderator', 'admin'].includes(ctx.me.role) ? '<a class="modlink" href="#/moderate" title="Moderation queue">⚖</a>' : ''}
       <a class="me" href="#/account">@${esc(ctx.me.handle)}</a>
       <button class="link small" data-signout>Sign out</button>`
    : `<button class="btn sm" data-signin>Sign in</button>`);
  const tabs = [['#/', 'Feed', '⌂', /^\/?$/], ['#/browse', 'Browse', '☰', /^\/browse/], ['#/map', 'Map', '◎', /^\/map/], ['#/board', 'Board', '✉', /^\/board/], ['#/account', 'Account', '☺', /^\/account/]];
  $('#tabbar').innerHTML = tabs.map(([h, t, i, re]) => `<a href="${h}" class="${re.test(path) ? 'on' : ''}"><span>${i}</span>${t}</a>`).join('');
  document.body.classList.toggle('is-map', /^\/map/.test(path));
}

async function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  const main = $('#main');
  renderChrome(path);
  for (const [re, view, title] of ROUTES) {
    const m = path.match(re); if (!m) continue;
    try {
      const out = await view(ctx, q, ...m.slice(1).map(decodeURIComponent));
      main.innerHTML = String(out);
      const l = path.startsWith('/l/') ? feed.byId.get(decodeURIComponent(m[1])) : null;
      document.title = (l ? l.name : title || 'Twisted Deeds') + ' · Twisted Deeds';
      if (view === mapView) await mountMap(ctx, q, main);
      const at = q.get('at') || (q.get('tab') === 'talk' ? 'comments' : '') || (q.get('unlocked') ? 'file' : '');
      if (at && document.getElementById(at)) document.getElementById(at).scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      if (q.get('unlocked') && l && ctx.unlocks.includes(l.id)) toast('Full file unlocked on your account.');
    } catch (e) { console.error(e); main.innerHTML = `<div class="empty-state"><h1>Something went wrong</h1><p>${esc(e.message)}</p></div>`; }
    return;
  }
  main.innerHTML = '<div class="empty-state"><h1>Page not found</h1><a href="#/">Back to listings</a></div>';
}

// ---------- modals
function modal(inner) {
  const d = document.createElement('dialog'); d.className = 'modal'; d.innerHTML = inner;
  document.body.appendChild(d); d.showModal();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  return d;
}
function signInModal() {
  const local = ctx.be.mode === 'local';
  const d = modal(`<form method="dialog" class="form" data-signin-form><h2>${local ? 'Sign in (preview)' : 'Sign in'}</h2>
    ${local ? `<p class="notice">Preview mode: this creates a <b>test account in this browser only</b>. No email, nothing is sent anywhere.</p>
      <label>Handle<input name="handle" required maxlength="24" pattern="[A-Za-z0-9 _\\-]+" placeholder="e.g. grymm"></label>`
    : `<p>Sign in with your email and password, or create an account. Your email is never shown or shared. Sign in with the same email on any device to see your unlocked files.</p>
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Password<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>
      <label class="check"><input type="checkbox" name="create" value="1"> <span>I’m new: create my account (we’ll email you a link to confirm it)</span></label>`}
    <label class="check"><input type="checkbox" required> <span>I’ve read the <a href="#/rules" target="_blank">community rules</a></span></label>
    <div class="row"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Sign in</button></div></form>`);
  d.querySelector('form').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)); f.create = !!f.create;
    try {
      const r = await ctx.be.signIn(f); d.close();
      if (r?.sent) toast('Check your email to confirm your account, then sign in.'); else { toast(`Signed in as @${r.handle}.`); await refreshCtx(); route(); }
    } catch (err) { toast(err.message); }
  });
}
function reportModal(type, id) {
  const d = modal(`<form method="dialog" class="form"><h2>Report</h2><p class="muted">Reports go to moderators only.</p>
    <label>Reason<select name="reason" required><option value="doxxing">Names or exposes a living private person</option><option value="harassment">Harassment of owners, occupants or other users</option><option value="trespass">Encourages or shows trespassing</option><option value="false">False or unsourced claim</option><option value="copyright">Copyright / photo rights</option><option value="spam">Spam or advertising</option><option value="off-topic">Off-topic</option><option value="other">Other</option></select></label>
    <label>Details (optional)<textarea name="details" rows="3" maxlength="1000"></textarea></label>
    <div class="row"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn danger" value="ok">Send report</button></div></form>`);
  d.querySelector('form').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    try { await ctx.be.report({ target_type: type, target_id: id, ...Object.fromEntries(new FormData(e.target)) }); d.close(); toast('Thanks. A moderator will look at it.'); } catch (err) { toast(err.message); }
  });
}
const needMe = () => { if (!ctx.me) { signInModal(); return false; } return true; };

// ---------- delegated events
// A photo that fails to load (hotlink removed, blocked, offline) is hidden and the
// archival plate under it shows; a failed strip photo is removed. Capture phase,
// because image error events do not bubble.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-ph-img')) return;
  img.hidden = true;
  const box = img.closest('[data-ph]'); if (box) box.classList.add('ph-failed');
  const item = img.closest('[data-ph-item]'); if (item) item.remove();
  const mc = img.closest('.mc-photo'); if (mc) mc.remove();
}, true);

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a'); if (!t) return;
  const ds = t.dataset;
  try {
    if ('signin' in ds) { e.preventDefault(); signInModal(); }
    else if ('signout' in ds) { await ctx.be.signOut(); await refreshCtx(); route(); }
    else if (ds.checkout) { e.preventDefault(); if (!needMe()) return; t.disabled = true; const r = await ctx.be.startCheckout(ds.checkout);
      if (r?.redirect) { location.href = r.redirect; return; } await refreshCtx(); location.hash = `#/l/${encodeURIComponent(ds.checkout)}?unlocked=1`; }
    else if (ds.membershipCheckout) { e.preventDefault(); if (!CONFIG.pricing.membershipsEnabled) { toast('Memberships are coming soon.'); return; } if (!needMe()) return; t.disabled = true; const plan = ds.membershipCheckout, from = ds.from || '';
      const r = await ctx.be.startMembershipCheckout(plan, from); if (r?.redirect) { location.href = r.redirect; return; }
      await refreshCtx(); toast(`${plan === 'monthly' ? 'Monthly' : 'Lifetime'} membership active.`);
      if (from) location.hash = `#/l/${encodeURIComponent(from)}?at=file`; else if (location.hash === '#/account') route(); else location.hash = '#/account'; }
    else if ('cancelMembership' in ds) { if (!confirm('Cancel your Monthly membership? It stays active until the end of this period. Files you unlocked stay unlocked forever.')) return;
      const r = await ctx.be.cancelMembership(); if (r?.redirect) { location.href = r.redirect; return; } await refreshCtx(); toast('Membership canceled. It won’t renew.'); route(); }
    else if ('previewLapse' in ds) { await ctx.be.previewLapse(); await refreshCtx(); toast('Preview: membership period ended. Your unlocked files are still yours.'); route(); }
    else if (ds.report) { if (!needMe()) return; const [type, ...id] = ds.report.split(':'); reportModal(type, id.join(':')); }
    else if (ds.toggleReply) { if (!needMe()) return; const f = $(`form[data-comment-reply="${ds.toggleReply}"], form[data-board-reply="${ds.toggleReply}"]`); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('textarea').focus(); }
    else if (ds.previewMod) { await ctx.be.setPreviewModerator(ds.previewMod === '1'); await refreshCtx(); route(); }
    else if (ds.resolve) { const [id, action] = ds.resolve.split(':'); await ctx.be.resolveReport(id, action); toast(action === 'removed' ? 'Content removed' : 'Report dismissed'); route(); }
    else if ('resetPreview' in ds) { if (confirm('Clear all preview data (test accounts, comments, posts, submissions, unlocks) in this browser?')) { ctx.be.reset(); location.reload(); } }
  } catch (err) { toast(err.message); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target; const ds = f.dataset;
  const data = () => Object.fromEntries(new FormData(f));
  try {
    if ('search' in ds) { e.preventDefault(); location.hash = '#/browse?q=' + encodeURIComponent(data().q || ''); }
    else if ('filters' in ds) { e.preventDefault(); }
    else if (ds.newComment) { e.preventDefault(); if (!needMe()) return; await ctx.be.createComment({ listing_id: ds.newComment, body: data().body }); toast('Comment sent for review. Only you can see it until it’s approved.'); route(); }
    else if (ds.commentReply) { e.preventDefault(); if (!needMe()) return; await ctx.be.createComment({ parent_id: ds.commentReply, body: data().body }); toast('Reply sent for review.'); route(); }
    else if ('newBoard' in ds) { e.preventDefault(); if (!needMe()) return; const d = data(); await ctx.be.createBoardPost({ title: d.title, body: d.body }); toast('Post sent for review. Only you can see it until it’s approved.'); route(); }
    else if (ds.boardReply) { e.preventDefault(); if (!needMe()) return; await ctx.be.createBoardPost({ parent_id: ds.boardReply, body: data().body }); toast('Reply sent for review.'); route(); }
    else if (ds.moderate) { e.preventDefault(); const [table, id] = ds.moderate.split(':'); const decision = e.submitter?.value; await ctx.be.moderate(table, id, decision, data().note || '', { is_sample: !!data().is_sample }); toast(decision === 'approved' ? (table === 'submissions' ? 'Approved. It’s now part of the full file.' : 'Approved. It’s public now.') : 'Rejected.'); await refreshCtx(); route(); }
    else if (ds.submit) {
      e.preventDefault(); if (!needMe()) return;
      const d = data(); const kind = ds.submit;
      if (kind === 'photo') {
        const file = f.querySelector('input[type=file]').files[0];
        if (file && file.size > 10 * 1024 * 1024) throw new Error('File is over 10 MB');
        await ctx.be.createSubmission({ kind, listing_id: d.listing_id, rights_confirmed: !!d.rights_confirmed, file,
          payload: { title: d.title, caption: d.caption, era: d.era, doc_type: d.doc_type, credit: d.credit || ctx.me.handle, file_name: file?.name, public_ground: !!d.public_ground, not_from_listing: !!d.not_listing } });
      } else if (kind === 'info') await ctx.be.createSubmission({ kind, listing_id: d.listing_id, payload: { field: d.field, text: d.text, sources: d.sources } });
      else if (kind === 'lore') await ctx.be.createSubmission({ kind, listing_id: d.listing_id, payload: { title: d.title, text: d.text, relation: d.relation, era: d.era, sources: d.sources } });
      else if (kind === 'link') await ctx.be.createSubmission({ kind, listing_id: d.listing_id || null, payload: { url: d.url, label: d.label, why: d.why, place: d.place, grade: d.grade, new_property: !d.listing_id } });
      toast('Sent to the moderation queue. Track it on your account page.');
      location.hash = '#/account';
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener('change', (e) => {
  const f = e.target.closest('form[data-filters]');
  if (f) { const p = new URLSearchParams([...new FormData(f)].filter(([, v]) => v)); location.hash = '#/browse?' + p; }
  if (e.target.matches('[data-goto-state]') && e.target.value) location.hash = '#/browse?state=' + e.target.value;
  // "Get notified about new Twisted Deeds": coming soon, saved to your account (live) or this browser (preview); sends nothing.
  if (e.target.matches('[data-notify-pref]') && ctx.me) {
    const on = e.target.checked;
    ctx.be.setNotifyPref(on).then((p) => { ctx.notifyPref = p; toast(on ? 'Saved. Nothing is sent yet: notifications are coming soon.' : 'Saved. You won’t be notified.'); })
      .catch((err) => { e.target.checked = !on; toast(err.message); });
  }
});
let qTimer;
document.addEventListener('input', (e) => {
  const f = e.target.closest('form[data-filters]');
  if (f && e.target.name === 'q') { clearTimeout(qTimer); qTimer = setTimeout(() => { const p = new URLSearchParams([...new FormData(f)].filter(([, v]) => v)); history.replaceState(null, '', '#/browse?' + p); route().then(() => { const i = $('form[data-filters] input[name=q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350); }
});

// ---------- boot
(async function boot() {
  $('#disclaimer').textContent = DISCLAIMER;
  try { await loadFeed(); } catch (e) { $('#main').innerHTML = `<div class="empty-state"><h1>Listings unavailable</h1><p>${esc(e.message)}</p></div>`; return; }
  ctx.be = await getBackend();
  // Banner: preview store (or Supabase unreachable) = test data in this browser; live with
  // mock checkout = purchases are examples, no real payment.
  const banner = $('#preview-banner');
  if (ctx.be.fallback) { banner.querySelector('.short').innerHTML = 'Community server unreachable: <b>using this browser only</b>.'; banner.querySelector('.long').innerHTML = 'The community server couldn’t be reached, so comments, posts, submissions, accounts and unlocks here are <b>test data stored only in this browser</b> and won’t reach the live site. Checkouts are examples: <b>no real payment</b>. Reload to try again.'; banner.hidden = false; }
  else if (ctx.be.isPreview) banner.hidden = false;
  else if (ctx.be.mockCheckout) { banner.querySelector('.short').innerHTML = 'Checkouts are examples: <b>no real payment</b>.'; banner.querySelector('.long').innerHTML = 'Private preview. Accounts, comments and submissions are real and moderated. Checkouts are examples: <b>no real payment</b> yet; example unlocks are saved to your account.'; banner.querySelector('[data-reset-preview]')?.remove(); banner.hidden = false; }
  $('#feed-meta').textContent = `Feed v${feed.meta.version} · ${feed.meta.count} listings · ${feed.source === 'live' ? 'live' : 'offline snapshot'}`;
  await refreshCtx();
  window.addEventListener('hashchange', route);
  route();
})();
