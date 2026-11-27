// Twisted Deeds public site: shell, router and global event handling.
import { fxOn, setFx } from './effects.js';
import { initWorld, syncWorld, keepBook, pullRandom, readAloud, pauseReading, stopReading, setReadRate, hapticsOn, setHaptics, buzz } from './world.js';
import { initReveals, afterRender, candle, torn, toggleSave, sealBook, soundOn, setSound, visitorView, setVisitorView } from './reveals.js';
import { initRadio, radioToggle, radioOff, onRadio, state as radioState } from './radio.js';
import { CONFIG } from './config.js';
import { loadFeed, feed, updatesMap } from './feed.js';
import { getBackend } from './backend/adapter.js';
import { $, toast, esc } from './util.js';
import { home, resetHomeMix } from './views/home.js';
import { browse, filterPanel } from './views/browse.js';
import { listing } from './views/listing.js';
import { mapView, mountMap } from './views/map.js';
import { board } from './views/board.js';
import { unlock } from './views/unlock.js';
import { patronage } from './views/patronage.js';
import { terms, privacy, refunds, stories } from './views/legal.js';
import { initAnalytics, track, routeName, analyticsOn, analyticsBlocked, setAnalytics } from './analytics.js';
import { syncStart } from './sync.js';
import { account } from './views/account.js';
import { contribute } from './views/contribute.js';
import { moderation } from './views/moderation.js';
import { exportSuggestions } from './views/admin_panels.js';
import { rules, about, DISCLAIMER } from './views/pages.js';
import { packs } from './views/packs.js';
import { archive } from './views/archive.js';
import { heritage } from './views/heritage.js';
import { research } from './views/research.js';
import { dossier } from './views/dossier.js';
import { initPwa, showFirstRun } from './install.js';
import { standardPrice, readerLabel } from './components.js';
import { mountTomes, setReduceMotion } from './tome.js';
import { bootCapture, startCaptureForPlace, flushQueue } from './capture.js';
import { setFieldCovers } from './field-covers.js';
import { isPrivateHome } from './privacy.js';
import * as Passport from './passport.js';
import { bootPrefs, maybeOpenWelcome, bindPrefsForm, readPrefsForm, savePrefs, onPrefsChange } from './prefs.js';

const ctx = { feed, be: null, me: null, membership: null, unlocks: [], comments: {}, config: CONFIG };

const suggest = (c, q) => { q.set('type', 'link'); q.set('new', '1'); return contribute(c, q); };
const ROUTES = [
  [/^\/?$/, home, 'Listings'], [/^\/browse$/, browse, 'Browse'], [/^\/l\/(.+)$/, listing, null], [/^\/map$/, mapView, 'Map'],
  [/^\/board$/, board, 'Community board'], [/^\/unlock\/(.+)$/, unlock, 'Unlock the full file'], [/^\/patronage$/, patronage, 'Patronage'], [/^\/membership$/, patronage, 'Patronage'], [/^\/lifetime$/, patronage, 'Patronage'],
  [/^\/terms$/, terms, 'Terms of Service'], [/^\/privacy$/, privacy, 'Privacy Policy'], [/^\/refunds$/, refunds, 'Refund Policy'], [/^\/stories$/, stories, 'Stories & Corrections'], [/^\/account$/, account, 'Account'],
  [/^\/contribute$/, contribute, 'Submit'], [/^\/suggest$/, suggest, 'Suggest a property'], [/^\/moderate$/, moderation, 'Moderation'],
  [/^\/packs$/, packs, 'Dossier Packs'], [/^\/archive$/, archive, 'The Archive'],
  [/^\/heritage$/, heritage, 'Heritage Homes'],
  [/^\/research$/, research, 'Commission a Research File'],
  [/^\/dossier\/(.+)$/, dossier, null],
  [/^\/rules$/, rules, 'Community rules'], [/^\/about$/, about, 'About'],
];

async function refreshCtx() {
  ctx.me = await ctx.be.getSession({ refresh: true });
  // View as visitor (staff only, this device): the app renders as a signed-in free user sees it. Client-side only.
  ctx.staff = !!ctx.me && (['moderator', 'admin'].includes(ctx.me.role) || ctx.me.is_admin);
  ctx.visitor = ctx.staff && visitorView();
  // Server RLS also grants admins every full file / dossier. Visitor view keeps this off.
  ctx.adminBypass = !!ctx.me && (ctx.me.role === 'admin' || ctx.me.is_admin) && !ctx.visitor;
  if (ctx.visitor) ctx.me = { ...ctx.me, role: 'user' };
  syncStart(ctx.be, ctx.me, () => { if (/^(#\/?|#\/(account|browse)(\?.*)?)?$/.test(location.hash)) route(); });
  ctx.membership = await ctx.be.getMembership();
  ctx.unlocks = (await ctx.be.listUnlocks()).map((u) => u.listing_id);
  // Own unlock requests (Payment Link mode): listing_id -> latest request
  ctx.unlockRequests = new Map();
  if (ctx.be.myUnlockRequests) for (const r of await ctx.be.myUnlockRequests().catch(() => [])) if (!ctx.unlockRequests.has(r.listing_id)) ctx.unlockRequests.set(r.listing_id, r);
  ctx.comments = await ctx.be.commentCounts();
  ctx.notifyPref = ctx.me && ctx.be.getNotifyPref ? await ctx.be.getNotifyPref().catch(() => null) : null;
  // listing_id -> { at, kinds } for approved submissions in the last CONFIG.newDays days (facts only)
  ctx.updates = updatesMap(ctx.be.recentUpdates ? await ctx.be.recentUpdates(CONFIG.newDays).catch(() => []) : []);
  if (ctx.be.fieldReportCovers) {
    ctx.fieldCovers = await ctx.be.fieldReportCovers().catch(() => []);
    setFieldCovers(ctx.fieldCovers);
  }
  await bootPrefs(ctx.be).catch(() => {});
}

// Instant unlock (Payment Link mode): ask the server whether pending payments have landed. It runs on
// load, on #/account, when the tab regains focus, on a 5 s poll for ~2 min after the payment page
// opens, and from the "Check payment" button. Unlocks are granted server-side; this only refreshes.
const hasPending = () => [...(ctx.unlockRequests?.values() || [])].some((r) => r.status === 'pending' && !ctx.unlocks.includes(r.listing_id));
let checking = null, pollTimer = null, pollUntil = 0;
async function checkPayments({ manual = false, requestId = null } = {}) {
  if (!ctx.be?.verifyUnlocks || !ctx.me || (!manual && !hasPending())) return false;
  if (checking) return checking;
  checking = (async () => {
    let res = [];
    try { res = await ctx.be.verifyUnlocks(requestId); } catch (e) { if (manual) toast(e.message); return false; }
    const got = res.filter((r) => r.status === 'unlocked' && !ctx.unlocks.includes(r.listing_id));
    if (got.length) {
      stopPoll(); await refreshCtx();
      const name = ctx.feed.byId.get(got[0].listing_id)?.name || 'the file';
      toast(got.length > 1 ? `Payment received. ${got.length} files are unsealed and yours for good.` : `Payment received. The full file for ${name} is unsealed and yours for good.`);
      if (got.length === 1) try { sessionStorage.setItem('td-paid', got[0].listing_id); } catch { /* ignore */ }
      if (got.length === 1 && !/^#\/account/.test(location.hash)) location.hash = `#/l/${encodeURIComponent(got[0].listing_id)}?at=file`; else route();
      return true;
    }
    if (manual) toast(res.some((r) => r.status === 'mismatch') ? 'Stripe shows a payment that doesn’t match this file’s price. We’ll check it by hand.' : 'No payment yet. If you just paid, give Stripe a few seconds and check again.');
    if (!hasPending()) stopPoll();
    return false;
  })();
  try { return await checking; } finally { checking = null; }
}
function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
function startPoll(ms = 120000) {
  pollUntil = Date.now() + ms;
  if (pollTimer) return;
  pollTimer = setInterval(() => { if (Date.now() > pollUntil || !hasPending()) return stopPoll(); checkPayments(); }, 5000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && hasPending()) { checkPayments(); startPoll(60000); } });

function renderChrome(path) {
  const nav = [['#/', 'Listings', /^\/?$/], ['#/browse', 'Browse', /^\/browse/], ['#/map', 'Map', /^\/map/], ['live/', 'Live', /^$/], ['passport/', 'Passport', /^$/], ['ancestors/', 'Ancestors', /^$/], ...(CONFIG.show?.packs ? [['#/packs', 'Dossier Packs', /^\/packs/]] : []), ...(CONFIG.show?.heritage || (feed.heritage || []).length ? [['#/heritage', 'Heritage Homes', /^\/heritage/]] : []), ['#/board', 'Board', /^\/board/]];
  $('#nav').innerHTML = nav.map(([h, t, re]) => `<a href="${h}" class="${re.test(path) ? 'on' : ''}">${t}</a>`).join('') + `<a href="#/contribute" class="nav-cta ${/contribute|suggest/.test(path) ? 'on' : ''}">Submit</a>`;
  $('#who').innerHTML = (ctx.me
    ? `${ctx.staff && !ctx.visitor ? '<a class="modlink" href="#/moderate" title="Moderation queue">⚖</a>' : ''}
       ${ctx.staff ? `<button class="vis-toggle" data-visitor aria-pressed="${ctx.visitor}" title="${ctx.visitor ? 'Visitor view is on. Tap for your admin view' : 'View the app as a visitor sees it'}" aria-label="${ctx.visitor ? 'Back to admin view' : 'View as visitor'}">◐</button>` : ''}
       <a class="me" href="#/account" title="Your account"><span class="avatar" aria-hidden="true">☺</span><span class="me-name">${esc(readerLabel(ctx.me))}</span></a>
       <button class="link small" data-signout>Sign out</button>`
    : `<button class="btn sm" data-signin>Sign in</button>`);
  const vb = $('#visitor-banner'); if (vb) vb.hidden = !ctx.visitor;
  const tabs = [['#/', 'Feed', '⌂', /^\/?$/], ['#/browse', 'Browse', '☰', /^\/browse/], ['#/map', 'Map', '◎', /^\/map/], ['live/', 'Live', '◉', /^$/], ['#/board', 'Board', '✉', /^\/board/], ['#/account', 'Account', '☺', /^\/account/]];
  $('#tabbar').innerHTML = tabs.map(([h, t, i, re]) => `<a href="${h}" class="${re.test(path) ? 'on' : ''}"><span>${i}</span>${t}</a>`).join('');
  document.body.classList.toggle('is-map', /^\/map/.test(path));
  // Footer "Moderation" link: moderators and admins only.
  const fm = $('#foot-mod'); if (fm) fm.hidden = !(ctx.me && ['moderator', 'admin'].includes(ctx.me.role));
}

// random pick: the listings shown on this page (browse results), else the whole catalog
const currentResults = () => { const ids = [...new Set([...document.querySelectorAll('#main .grid a[href^="#/l/"]')].map((a) => decodeURIComponent(a.getAttribute('href').slice(4).split(/[?#]/)[0])))]; const L = ids.map((i) => feed.byId.get(i)).filter(Boolean); return L.length ? L : feed.catalog; };
let shareIds = new Set();   // listings with a static share page (s/<id>/: og tags + cover), built by design_lab/build_share_cards.py
let refocusFilter = null;   // a filter dropdown that just changed: keep focus on it after the re-render
async function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  const main = $('#main');
  renderChrome(path);
  for (const [re, view, title] of ROUTES) {
    const m = path.match(re); if (!m) continue;
    // a slow view (network) shows a candle burning down instead of a spinner
    const slow = setTimeout(() => { main.innerHTML = candle('Fetching the record…'); }, 320);
    try {
      const out = await view(ctx, q, ...m.slice(1).map(decodeURIComponent));
      clearTimeout(slow);
      main.innerHTML = String(out);
      // Mobile sticky unlock bar (CSS shows it below 960px only): reserve room for it at the page foot.
      document.body.classList.toggle('has-ubar', !!main.querySelector('.ubar'));
      if (view !== browse) filterPanel.open = false;
      const l = path.startsWith('/l/') ? feed.byId.get(decodeURIComponent(m[1])) : null;
      document.title = (l ? l.name : title || 'Twisted Deeds') + ' · Twisted Deeds';
      if (view === mapView) await mountMap(ctx, q, main);
      let paid = false; try { paid = !!l && sessionStorage.getItem('td-paid') === l.id; if (paid) sessionStorage.removeItem('td-paid'); } catch { /* ignore */ }
      mountTomes(main, { openScroll: !!(q.get('unlocked') || q.get('at') === 'file'), paid });
      afterRender(main, { path }); syncRm(); syncFx(); syncSound(); syncRadio(); syncHaptics(); wirePrefs(main);
      if (l) keepBook(l);
      track('view', routeName(path)); if (l) track('listing_open', l.id); if (view === patronage) track('pricing_view', 'patronage'); if (view === unlock) track('pricing_view', 'unlock-page');
      window.TD_ATMO_SYNC?.();
      if (view === account && hasPending()) checkPayments();
      const at = q.get('at') || (q.get('tab') === 'talk' ? 'comments' : '') || (q.get('unlocked') ? 'file' : '');
      const refocus = (view === browse && refocusFilter && main.querySelector(`form[data-filters] [name="${refocusFilter}"]`)) || null; refocusFilter = null;
      if (at && document.getElementById(at)) document.getElementById(at).scrollIntoView({ block: 'start' }); else { window.scrollTo(0, 0); refocus?.focus({ preventScroll: true }); }
      if (q.get('unlocked') && l && ctx.unlocks.includes(l.id)) toast('Full file unlocked on your account.');
    } catch (e) { clearTimeout(slow); console.error(e); main.innerHTML = torn({ detail: `Something went wrong: ${esc(e.message)}` }); afterRender(main, { path }); }
    return;
  }
  main.innerHTML = torn({ detail: 'Page not found. The page you asked for isn’t in the archive.', backText: 'Back to listings' }); afterRender(main, { path });
}

// ---------- modals
function modal(inner, cls = '') {
  const d = document.createElement('dialog'); d.className = 'modal' + (cls ? ' ' + cls : ''); d.innerHTML = inner;
  document.body.appendChild(d); d.showModal();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  return d;
}
function wirePrefs(root) {
  root.querySelectorAll('form[data-user-prefs]').forEach((f) => {
    if (f.dataset.wired) return;
    f.dataset.wired = '1';
    bindPrefsForm(f, { toast });
  });
}

function signInModal() {
  const local = ctx.be.mode === 'local';
  const d = modal(`<form method="dialog" class="form" data-signin-form><div class="lc-head" aria-hidden="true"><span>Twisted Deeds Reading Room</span><small>Reader’s card · No. ${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}</small></div><h2>${local ? 'Sign in (preview)' : 'Sign in'}</h2>
    ${local ? `<p class="notice">Preview mode: this creates a <b>test account in this browser only</b>. No email, nothing is sent anywhere.</p>
      <label>Handle<input name="handle" required maxlength="24" pattern="[A-Za-z0-9 _\\-]+" placeholder="e.g. grymm"></label>`
    : `<p>Sign in with your email and password, or create an account. Your email is never shown or shared. Sign in with the same email on any device to see your unlocked files.</p>
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Password<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>
      <label class="check"><input type="checkbox" name="create" value="1"> <span>I’m new: create my account (we’ll email you a link to confirm it)</span></label>`}
    <label class="check"><input type="checkbox" required> <span>I’ve read the <a href="#/rules" target="_blank">community rules</a></span></label>
    <div class="row"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Sign in</button></div></form>`, 'libcard');
  d.querySelector('form').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)); f.create = !!f.create;
    try {
      const r = await ctx.be.signIn(f); d.close();
      if (r?.sent) toast('Check your email to confirm your account, then sign in.'); else { toast(`Signed in as ${readerLabel(r)}.`); await refreshCtx(); await route(); maybeOpenWelcome(ctx.me, { toast }); }
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
  if (ds.checkout) track('unlock_click', ds.checkout); else if (t.matches('a[href^="#/unlock/"]')) track('unlock_click', decodeURIComponent(t.getAttribute('href').slice(9))); else if (ds.pricingClick) track('pricing_click', ds.pricingClick); else if (ds.share) track('share_click', ds.share);
  try {
    if (ds.capturePlace) { e.preventDefault(); const place = feed.byId.get(ds.capturePlace) || { id: ds.capturePlace, name: ds.capturePlace }; startCaptureForPlace(place); return; }
    if ('spine' in ds) { const f = t.closest('form'); const p = new URLSearchParams([...new FormData(f)].filter(([, v]) => v)); const on = t.getAttribute('aria-pressed') === 'true';
      if (on) p.delete('layer'); else p.set('layer', ds.spine); refocusFilter = 'spine-' + ds.spine; location.hash = '#/browse?' + p; return; }
    if ('filtersToggle' in ds) { const f = t.closest('form'); const open = !f.classList.contains('f-open'); f.classList.toggle('f-open', open); filterPanel.open = open; t.setAttribute('aria-expanded', String(open)); if (open) f.querySelector('#f-panel select')?.focus({ preventScroll: true }); }
    else if ('filtersDone' in ds) { const f = t.closest('form'); f.classList.remove('f-open'); filterPanel.open = false; const b = f.querySelector('[data-filters-toggle]'); b?.setAttribute('aria-expanded', 'false'); document.getElementById('results')?.scrollIntoView({ block: 'start' }); b?.focus({ preventScroll: true }); }
    else if ('signin' in ds) { e.preventDefault(); signInModal(); }
    else if ('exportSuggestions' in ds) { const n = await exportSuggestions(ctx); toast(n ? `Downloaded ${n} approved place${n === 1 ? '' : 's'} for research.` : 'Nothing approved yet.'); }
    else if ('signout' in ds) { await ctx.be.signOut(); await refreshCtx(); route(); }
    else if (ds.checkout) { e.preventDefault(); if (!needMe()) return;
      if (ctx.adminBypass || (ctx.unlocks || []).includes(ds.checkout)) { location.hash = `#/l/${encodeURIComponent(ds.checkout)}?at=file`; return; }
      t.disabled = true;
      // Payment Link: open the tab synchronously (popup blockers), then point it at Stripe.
      const w = ctx.be.paymentLinkCheckout ? window.open('', '_blank') : null;
      let r; try { r = await ctx.be.startCheckout(ds.checkout); } catch (err) { w?.close(); t.disabled = false; throw err; }
      if (r?.pending) { if (w && r.paymentUrl) { w.opener = null; w.location.href = r.paymentUrl; } else if (!w && r.paymentUrl) toast('Your browser blocked the new tab. Use “Open the payment page” on the listing.');
        await refreshCtx(); location.hash = `#/l/${encodeURIComponent(ds.checkout)}?at=file`; startPoll(); return; }
      if (r?.redirect) { location.href = r.redirect; return; } await refreshCtx(); try { sessionStorage.setItem('td-paid', ds.checkout); } catch { /* ignore */ } location.hash = `#/l/${encodeURIComponent(ds.checkout)}?unlocked=1`; }
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
    else if ('checkPayment' in ds) { e.preventDefault(); t.disabled = true; try { await checkPayments({ manual: true, requestId: ds.checkPayment || null }); } finally { t.disabled = false; } }
    else if (ds.confirmPaid) { if (!confirm('Confirm this payment? Only do this after you found the matching payment in Stripe. It grants the permanent unlock.')) return;
      t.disabled = true; await ctx.be.confirmUnlockRequest(ds.confirmPaid); toast('Payment confirmed. The file is unlocked for that account.'); route(); }
    else if (ds.rejectPaid) { const note = prompt('Reject this unlock request? Optional note (not shown publicly):', ''); if (note === null) return;
      t.disabled = true; await ctx.be.rejectUnlockRequest(ds.rejectPaid, note); toast('Request rejected.'); route(); }
    else if (ds.resolve) { const [id, action] = ds.resolve.split(':'); await ctx.be.resolveReport(id, action); toast(action === 'removed' ? 'Content removed' : 'Report dismissed'); route(); }
    else if (ds.share) { e.preventDefault(); const l = feed.byId.get(ds.share); const base = location.href.split('#')[0].replace(/[?].*$/, ''), url = shareIds.has(ds.share) ? new URL('s/' + encodeURIComponent(ds.share) + '/', base).href : base + '#/l/' + encodeURIComponent(ds.share);
      const title = (l?.name || 'A listing') + ' · Twisted Deeds';
      await sealBook(document.querySelector(`[data-book="${CSS.escape(ds.share)}"]`));
      if (navigator.share) { try { await navigator.share({ title, url }); } catch { /* dismissed */ } }
      else { try { await navigator.clipboard.writeText(url); toast('Sealed and copied. The link opens this listing’s book.'); } catch { prompt('Copy this link:', url); } } }
    else if ('random' in ds) { e.preventDefault(); pullRandom(ds.random === 'shelf' ? currentResults() : feed.catalog, (l) => { location.hash = '#/l/' + encodeURIComponent(l.id); }); }
    else if ('read' in ds) { e.preventDefault(); const l = feed.byId.get(ds.read), box = t.closest('.reader'); if (!l || !box) return;
      if (box.classList.contains('on')) { stopReading(); return; }
      const rate = +(box.querySelector('[data-read-rate]')?.value || 1);
      if (!readAloud(box, [l.name + '.', l.place ? 'In ' + l.place + '.' : '', l.preview?.summary, l.preview?.teaser ? 'The lore: ' + l.preview.teaser : ''], rate)) toast('This device has no built-in voice to read aloud.'); }
    else if ('readPause' in ds) { e.preventDefault(); pauseReading(); }
    else if ('readStop' in ds) { e.preventDefault(); stopReading(); }
    else if ('haptics' in ds) { const on = !hapticsOn(); setHaptics(on); syncHaptics(); if (on) buzz('ribbon'); toast(on ? 'Haptics on: tiny pulses on seals, pages and ribbons (Android phones).' : 'Haptics off.'); }
    else if (ds.save) { e.preventDefault(); const on = toggleSave(ds.save); toast(on ? 'Saved. A red ribbon marks it; find it on the Saved shelf in Account.' : 'Ribbon removed. No longer saved.'); }
    else if ('visitor' in ds) { const on = !ctx.visitor; setVisitorView(on); await refreshCtx(); await route(); toast(on ? 'Visitor view: the app as a signed-in free user sees it (this device only; your role is unchanged).' : 'Back to your admin view.'); }
    else if ('radio' in ds) { if (!soundOn()) { setSound(true); syncSound(); } const on = await radioToggle(); track('radio_toggle', on ? 'on' : 'off'); syncRadio(); toast(on ? 'The radio in the next room is playing, softly.' : 'Radio off.'); }
    else if ('caselock' in ds) { e.preventDefault(); t.classList.remove('rattle'); void t.offsetWidth; t.classList.add('rattle'); buzz?.('ribbon'); toast('Locked. The curator is still cataloguing the Archive.'); }
    else if ('analytics' in ds) { const on = !analyticsOn(); if (analyticsBlocked()) { toast('Your browser sends Do Not Track, so counting is already off.'); return; } setAnalytics(on); document.querySelectorAll('[data-analytics]').forEach((b) => b.setAttribute('aria-pressed', String(on))); toast(on ? 'Anonymous counting on: no cookies, no tracking, just tallies.' : 'Counting off. Nothing about your visits is recorded.'); }
    else if ('candle' in ds) { const on = !document.documentElement.classList.contains('rm'); setReduceMotion(on); syncRm(); toast(on ? 'Candle snuffed: motion reduced.' : 'Candle lit: motion back on.'); }
    else if ('sound' in ds) { const on = !soundOn(); setSound(on); syncSound(); if (!on) { radioOff(false); syncRadio(); } toast(on ? 'Sound on: soft, rare, and only after you tap.' : 'Sound off.'); }
    else if ('effects' in ds) { const on = !fxOn(); setFx(on); track('effects_toggle', on ? 'on' : 'off'); syncFx(); toast(on ? 'Opening effects on.' : 'Opening effects off.'); }
    else if ('reduceMotion' in ds) { const on = !document.documentElement.classList.contains('rm'); setReduceMotion(on); syncRm(); toast(on ? 'Motion reduced: no smoke, grain or page animations.' : 'Motion back on.'); }
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
    else if ('research' in ds) { e.preventDefault(); if (!needMe()) return; const d = data();
      const tierTag = d.tier === 'pack_dossier' ? 'Dossier' : 'Record';
      const r = await ctx.be.requestResearch({ address: d.address, purpose: `[Pack: ${tierTag}${d.rush ? ' + Rush' : ''}] ${d.purpose || ''}`.trim().slice(0, 1000), ack: !!d.ack });
      toast(`Request ${r?.reference || ''} received. We’ll email you to confirm price and turnaround.`); route(); }
    else if ('correction' in ds) { e.preventDefault(); const d = data(); if (d.website) { toast('Thank you. Your note has been sent to the curator.'); f.reset(); return; }   // honeypot
      const hit = ctx.feed.catalog.find((x) => x.name === d.page);
      await ctx.be.submitCorrection({ kind: d.kind, page: d.page, listing_id: hit ? hit.id : null, message: d.message, reply_to: d.reply_to, relation: d.relation });
      f.reset(); toast('Thank you. Your note has been sent to the curator.'); }
    else if (ds.correctionStatus) { e.preventDefault(); const d = data(); await ctx.be.setCorrectionStatus(ds.correctionStatus, d.status, d.note || ''); toast('Updated.'); route(); }
    else if (ds.placeSuggestion) { e.preventDefault(); const d = e.submitter?.value; await ctx.be.reviewPlaceSuggestion(ds.placeSuggestion, d, data().note || ''); toast(d === 'approved' ? 'Approved. It’s on the research list, and the traveler gets a Scout stamp.' : d === 'rejected' ? 'Turned down. Nothing was published.' : 'Back in the queue.'); route(); }
    else if ('userPrefs' in ds) {
      e.preventDefault();
      await savePrefs(readPrefsForm(f));
      toast('Your interests and area are saved. The shelf and the live map will lead with them.');
      route();
    }
    else if ('displayName' in ds) {
      e.preventDefault(); if (!needMe()) return;
      if (!ctx.be.setDisplayName) throw new Error('Name changes are not available in this mode.');
      const name = String(data().display_name || '').trim();
      if (name.length > 40) throw new Error('Use at most 40 characters.');
      await ctx.be.setDisplayName(name);
      await refreshCtx(); toast(name ? 'Display name saved.' : 'Display name cleared. The default name is shown again.'); route();
    }
    else if (ds.researchStatus) { e.preventDefault(); const d = data(); await ctx.be.setResearchStatus(ds.researchStatus, d.status, d.note || ''); toast('Research request updated.'); route(); }
    else if (ds.moderate) { e.preventDefault(); const [table, id] = ds.moderate.split(':'); const decision = e.submitter?.value;
      const autoSample = table === 'submissions' && decision === 'approved' && !!data().field_capture && data().field_priv !== '1';
      await ctx.be.moderate(table, id, decision, data().note || '', { is_sample: !!data().is_sample || autoSample });
      toast(decision === 'approved' ? (table === 'submissions' ? 'Approved. It’s now part of the file and, if this place had no photo, its card.' : 'Approved. It’s public now.') : 'Rejected.'); await refreshCtx(); route(); }
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
  if (e.target.matches?.('[data-read-rate]')) { setReadRate(+e.target.value || 1); return; }
  const f = e.target.closest('form[data-filters]');
  if (f) { const p = new URLSearchParams([...new FormData(f)].filter(([, v]) => v)); if (e.target.name && e.target.name !== 'q') refocusFilter = e.target.name; location.hash = '#/browse?' + p; }
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
initPwa();
function syncRadio() { const s = radioState(); document.querySelectorAll('[data-radio]').forEach((b) => { b.setAttribute('aria-pressed', String(s.on)); const l = b.querySelector('.rd-l'); if (l) l.textContent = s.on ? 'Radio: on' : 'Radio: off'; b.title = s.on ? s.track : 'An old radio in the next room (public-domain records)'; }); }
function syncSound() { const on = soundOn(); document.querySelectorAll('[data-sound]').forEach((b) => { b.setAttribute('aria-pressed', String(on)); if (!b.classList.contains('brass')) b.textContent = on ? 'Sound: on' : 'Sound: off'; }); }
function syncHaptics() { const on = hapticsOn(); document.querySelectorAll('[data-haptics]').forEach((b) => b.setAttribute('aria-pressed', String(on))); }
function syncFx() { const on = fxOn(); syncWorld(); document.querySelectorAll('[data-effects]').forEach((b) => { b.setAttribute('aria-pressed', String(on)); if (!b.classList.contains('brass')) b.textContent = on ? 'Effects: on' : 'Effects: off'; }); }
function syncRm() { const on = document.documentElement.classList.contains('rm'); document.querySelectorAll('[data-reduce-motion]').forEach((b) => { b.setAttribute('aria-pressed', String(on)); if (!b.classList.contains('brass')) b.textContent = on ? 'Motion reduced' : 'Reduce motion'; }); document.querySelectorAll('[data-candle]').forEach((c) => { c.classList.toggle('out', on); c.setAttribute('aria-pressed', String(on)); const t = c.querySelector('small'); if (t) t.textContent = on ? 'Snuffed: motion reduced' : 'Snuff to reduce motion'; }); window.TD_ATMO_SYNC?.(); }
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { let saved = null; try { saved = localStorage.getItem('td-rm'); } catch { /* ignore */ } if (saved == null) { setReduceMotion(e.matches, false); syncRm(); } });
(async function boot() {
  syncRm(); syncFx(); syncSound(); syncRadio(); onRadio(syncRadio);
  initRadio({ soundOn }); initWorld();
  fetch('s/ids.json').then((r) => r.ok ? r.json() : []).then((a) => { shareIds = new Set(a); }).catch(() => {});
  initReveals({ toast, refresh: async () => { await refreshCtx(); await route(); } });
  $('#disclaimer').textContent = DISCLAIMER;
  try { await loadFeed(); } catch (e) { $('#main').innerHTML = torn({ detail: `Listings unavailable: ${esc(e.message)}`, back: '#/', backText: 'Try again' }); return; }
  ctx.be = await getBackend();
  bootCapture({
    assetBase: './',
    toast,
    signInHref: '#/account',
    getCatalog: () => [...(feed.catalog || []), ...(feed.theArchive || [])],
    getSession: async () => ctx.me,
    createSubmission: (opts) => ctx.be.createSubmission(opts),
    awardSeal: (place, opts) => Passport.awardSeal(place, opts),
    suggestPlace: null,
  });
  flushQueue().catch(() => {});
  // Banner: preview store (or Supabase unreachable) = test data in this browser; live with
  // mock checkout = purchases are examples, no real payment.
  const banner = $('#preview-banner');
  if (ctx.be.fallback) { banner.querySelector('b').textContent = 'Offline'; banner.querySelector('.short').innerHTML = 'Can’t reach the community server: <b>nothing posted now reaches the live site</b>.'; banner.querySelector('.long').innerHTML = 'Can’t reach the community server right now, so comments, posts, submissions, sign-in and unlocks won’t be saved to your account. Listings still work. Reload to try again.'; banner.querySelector('[data-reset-preview]')?.remove(); banner.hidden = false; }
  else if (ctx.be.isPreview) { banner.querySelector('b').textContent = 'Local mode'; banner.querySelector('.short').innerHTML = 'Community content is <b>stored in this browser only</b>.'; banner.querySelector('.long').innerHTML = 'Local developer mode: comments, posts, submissions, accounts and unlocks are stored only in this browser, and checkouts take no payment. Listings are real.'; banner.hidden = false; }
  // Live with Stripe (payment_link): no banner; accounts, comments, submissions and unlocks are real.
  else if (ctx.be.mockCheckout) { banner.querySelector('b').textContent = 'Note'; banner.querySelector('.short').innerHTML = 'Checkout isn’t live yet: <b>no payment is taken</b>.'; banner.querySelector('.long').innerHTML = 'Accounts, comments and submissions are saved and moderated. Checkout isn’t live yet: <b>no payment is taken</b>, and unlocks made now are saved to your account as examples.'; banner.querySelector('[data-reset-preview]')?.remove(); banner.hidden = false; }
  // Visitors only see this line when the app is showing its saved offline copy (feed version stays in the title for support).
  const fm = $('#feed-meta'); fm.title = `Feed v${feed.meta.version} · ${feed.meta.count} listings · ${feed.source}`; fm.textContent = feed.source === 'live' ? '' : 'Showing the saved offline copy of the listings.';
  initAnalytics(ctx.be);
  await refreshCtx();
  onPrefsChange(() => { resetHomeMix(); });
  window.addEventListener('hashchange', route);
  await route();
  showFirstRun(standardPrice());
  maybeOpenWelcome(ctx.me, { toast });
  // Back from Stripe (or any load with a pending payment): check now, then keep watching briefly.
  if (hasPending()) { checkPayments(); startPoll(60000); }
})();
