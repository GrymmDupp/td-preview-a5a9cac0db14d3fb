// LOCAL PREVIEW backend. Stores everything in this browser's localStorage so the
// prototype is fully clickable with no server. Nothing leaves the device and
// nobody else sees it. It starts empty: there is no seeded or example content.
//
// Unlocks here are MOCK: "Example checkout, no real payment". The full-file gate in
// this mode is client-side only: full files come from the private, localhost-only
// data/listings_full.local.json (README §8). Real gating is server-side: Supabase listing_full + RLS.
import { getNotifyPref, setNotifyPref } from '../notify.js';
import { uid, nowIso } from '../util.js';
import { feed } from '../feed.js';
import { CONFIG } from '../config.js';
import { priceTier, tierAmount } from '../components.js';

const KEY = 'td-community-preview-v3';
// Older keys: v1 = first prototype (votes, badges); v2 = seeded EXAMPLE accounts/submissions/comments/board.
// Dropped once on load so returning browsers lose the old example records.
const OLD_KEYS = ['td-community-preview-v1', 'td-community-preview-v2'];
const EMPTY = { accounts: [], unlocks: [], memberships: [], submissions: [], comments: [], board: [], reports: [], session: null };
const TABLE = { submissions: 'submissions', comments: 'comments', board_posts: 'board' };
const TARGET = { comment: 'comments', board_post: 'board', submission: 'submissions' };

export class LocalBackend {
  mode = 'local'; isPreview = true;
  async init() {
    for (const k of OLD_KEYS) { try { localStorage.removeItem(k); } catch {} }
    try { this.db = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || 'null') }; } catch { this.db = null; }
    if (!this.db) { this.db = { ...EMPTY }; this.save(); }
    // Belt and braces: never keep a row flagged as example content.
    for (const t of Object.keys(EMPTY)) if (Array.isArray(this.db[t])) this.db[t] = this.db[t].filter((r) => !r?.is_example);
    if (this.db.session && !this.db.accounts.some((a) => a.id === this.db.session)) this.db.session = null;
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.db)); }
    catch (e) { console.error(e); throw new Error('Browser storage is full. Try a smaller image, or reset preview data.'); }
  }
  reset() { localStorage.removeItem(KEY); }
  me() { return this.db.accounts.find((p) => p.id === this.db.session) || null; }
  isMod() { const m = this.me(); return !!m && (m.role === 'moderator' || m.role === 'admin'); }
  requireMe() { const m = this.me(); if (!m) throw new Error('Sign in first'); return m; }
  visible(row) { return row.status === 'approved' || (this.db.session && row.author_id === this.db.session && row.status === 'pending'); }
  withAuthor(row) { const a = this.db.accounts.find((p) => p.id === row.author_id); return { ...row, author: a ? { handle: a.handle, is_example: a.is_example } : null }; }
  text(s, min, max, what) { s = String(s || '').trim(); if (s.length < min) throw new Error(`${what} is too short (${min}+ characters)`); return s.slice(0, max); }

  // ---- account
  async getSession() { return this.me(); }
  async signIn({ handle }) {
    handle = String(handle || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    if (!handle) throw new Error('Pick a handle');
    let p = this.db.accounts.find((x) => x.handle === handle && !x.is_example);
    if (!p) {
      if (this.db.accounts.some((x) => x.handle === handle)) handle += '-' + Math.random().toString(36).slice(2, 5);
      p = { id: uid('u'), handle, role: 'user', created_at: nowIso(), is_example: false };
      this.db.accounts.push(p);
    }
    this.db.session = p.id; this.save(); return p;
  }
  async signOut() { this.db.session = null; this.save(); }
  // Preview-only: lets Grymm try the moderation queue without a second account.
  async setPreviewModerator(on) { const m = this.requireMe(); m.role = on ? 'moderator' : 'user'; this.save(); }

  // ---- unlocks (MOCK in this backend)
  async listUnlocks() { return this.db.unlocks.filter((u) => u.user_id === this.db.session).sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at)); }
  async hasUnlock(listingId) { return !!this.db.session && this.db.unlocks.some((u) => u.user_id === this.db.session && u.listing_id === listingId); }
  async startCheckout(listingId) {
    const m = this.requireMe();
    if (!feed.byId.has(listingId)) throw new Error('Unknown listing');
    if (!(await this.hasUnlock(listingId))) {
      // Price decided here (server-side in live mode), never by the page: $9 / $7 Monthly / $5 Lifetime.
      const tier = priceTier(await this.getMembership()), amount = tierAmount(tier);
      this.db.unlocks.push({ id: uid('unl'), user_id: m.id, listing_id: listingId, unlocked_at: nowIso(),
        payment_ref: 'mock_' + uid('pay'), price_tier: tier, amount_paid: amount,
        amount_cents: Math.round(amount * 100), currency: CONFIG.pricing.currency, mock: true });
      this.save();
    }
    return { unlocked: true };
  }
  // ---- memberships (MOCK here). Only change the unlock price; unlocks never expire.
  //   monthly: active while now < current_period_end; 'canceled' = no renewal, still active to period end.
  //   lifetime: never expires.
  myMemberships() { return (this.db.memberships || []).filter((x) => x.user_id === this.db.session); }
  async getMembership() {
    const now = nowIso(), mine = this.myMemberships();
    return mine.find((x) => x.plan === 'lifetime' && x.status === 'active')
      || mine.find((x) => x.plan === 'monthly' && ['active', 'canceled'].includes(x.status) && x.current_period_end > now) || null;
  }
  async startMembershipCheckout(plan) {
    const m = this.requireMe();
    if (!['monthly', 'lifetime'].includes(plan)) throw new Error('Unknown plan');
    const cur = await this.getMembership();
    if (cur?.plan === 'lifetime' || (cur?.plan === plan && cur.status === 'active')) return { active: true };
    if (plan === 'lifetime') for (const x of this.myMemberships()) if (x.plan === 'monthly' && x.status !== 'ended') { x.status = 'ended'; x.current_period_end = nowIso(); }
    if (plan === 'monthly' && cur?.plan === 'monthly') { cur.status = 'active'; this.save(); return { active: true }; }   // resume
    const end = new Date(); end.setMonth(end.getMonth() + 1);
    this.db.memberships.push({ id: uid('mem'), user_id: m.id, plan, status: 'active', purchased_at: nowIso(),
      current_period_end: plan === 'monthly' ? end.toISOString() : null, payment_ref: 'mock_' + uid(plan === 'monthly' ? 'sub' : 'life'),
      amount: plan === 'monthly' ? CONFIG.pricing.monthlyPrice : CONFIG.pricing.lifetimePrice, currency: CONFIG.pricing.currency, mock: true });
    this.save(); return { active: true };
  }
  // Cancel = stop renewing. Price stays $7 until the period ends; unlocks are kept forever.
  async cancelMembership() {
    const cur = await this.getMembership(); if (!cur || cur.plan !== 'monthly') throw new Error('No monthly membership to cancel');
    cur.status = 'canceled'; this.save();
  }
  // Preview only: jump to the end of the period to show what lapsing does.
  async previewLapse() {
    const cur = await this.getMembership(); if (!cur || cur.plan !== 'monthly') return;
    cur.status = 'ended'; cur.current_period_end = nowIso(); this.save();
  }
  approvedFor(listingId) { return this.db.submissions.filter((s) => s.listing_id === listingId && s.status === 'approved'); }
  async getFullFile(listingId) {
    if (!(await this.hasUnlock(listingId)) && !this.isMod()) return null;
    const f = feed.fullLocal.get(listingId); if (!f) return null;
    return { ...f, community: this.approvedFor(listingId).map((s) => this.withAuthor(s)).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  }
  async fileCounts(listingId) {
    const c = { photo: 0, lore: 0, info: 0, link: 0 }; for (const s of this.approvedFor(listingId)) c[s.kind] = (c[s.kind] || 0) + 1; return c;
  }
  async samplePhotos(listingId) { return this.approvedFor(listingId).filter((s) => s.kind === 'photo' && s.is_sample).map((s) => this.withAuthor(s)); }

  // ---- DATA: submissions
  async createSubmission({ kind, listing_id, payload, rights_confirmed, file }) {
    const m = this.requireMe();
    if (!['info', 'photo', 'lore', 'link'].includes(kind)) throw new Error('Unknown submission type');
    if (kind === 'photo' && !rights_confirmed) throw new Error('Please confirm you have the right to share this file');
    if (kind !== 'link' && !listing_id) throw new Error('Choose a listing');
    const p = { ...payload };
    if (file) p.data_url = await shrinkImage(file);
    const s = { id: uid('s'), kind, listing_id: listing_id || null, author_id: m.id, payload: p, rights_confirmed: !!rights_confirmed, is_sample: false, status: 'pending', created_at: nowIso(), is_example: false };
    this.db.submissions.push(s); this.save(); return s;
  }
  async listMySubmissions() { return this.db.submissions.filter((s) => s.author_id === this.db.session).sort((a, b) => b.created_at.localeCompare(a.created_at)); }

  // ---- SOCIAL (a): comments on a listing
  async listComments(listingId) {
    return this.db.comments.filter((c) => c.listing_id === listingId && this.visible(c)).map((c) => this.withAuthor(c)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async createComment({ listing_id, body, parent_id = null }) {
    const m = this.requireMe();
    if (parent_id) { const par = this.db.comments.find((c) => c.id === parent_id); if (!par || par.parent_id) throw new Error('Replies go one level deep'); listing_id = par.listing_id; }
    const c = { id: uid('c'), listing_id, parent_id, author_id: m.id, body: this.text(body, 2, 3000, 'Comment'), status: 'pending', created_at: nowIso(), is_example: false };
    this.db.comments.push(c); this.save(); return c;
  }
  // ---- SOCIAL (b): the general board (one table, parent_id = reply)
  async listBoard() {
    const rows = this.db.board.filter((b) => this.visible(b)).map((b) => this.withAuthor(b));
    return rows.filter((b) => !b.parent_id).sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({ ...p, replies: rows.filter((r) => r.parent_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
  }
  async createBoardPost({ title, body, parent_id = null }) {
    const m = this.requireMe();
    if (parent_id && !this.db.board.some((b) => b.id === parent_id && !b.parent_id)) throw new Error('Replies go one level deep');
    const b = { id: uid('b'), parent_id, author_id: m.id, title: parent_id ? '' : this.text(title, 3, 140, 'Title'), body: this.text(body, 2, 6000, 'Post'), status: 'pending', created_at: nowIso(), is_example: false };
    this.db.board.push(b); this.save(); return b;
  }

  // ---- safety + moderation
  async report({ target_type, target_id, reason, details }) {
    const r = { id: uid('rep'), target_type, target_id, reason, details: String(details || '').slice(0, 1000), reporter_id: this.db.session, status: 'open', created_at: nowIso(), is_example: false };
    this.db.reports.push(r); this.save(); return r;
  }
  async listQueue() {
    if (!this.isMod()) throw new Error('Moderators only');
    const pend = (rows) => rows.filter((r) => r.status === 'pending').map((r) => this.withAuthor(r)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const reports = this.db.reports.filter((r) => r.status === 'open').map((r) => ({ ...r, target: this.findTarget(r.target_type, r.target_id) }));
    return { submissions: pend(this.db.submissions), comments: pend(this.db.comments),
      board: pend(this.db.board).map((b) => ({ ...b, parent: b.parent_id ? this.db.board.find((x) => x.id === b.parent_id) : null })), reports };
  }
  findTarget(type, id) { const row = this.db[TARGET[type]]?.find((x) => x.id === id); return row ? this.withAuthor(row) : null; }
  async moderate(table, id, decision, note = '', opts = {}) {
    if (!this.isMod()) throw new Error('Moderators only');
    const row = this.db[TABLE[table]]?.find((x) => x.id === id); if (!row) return;
    const at = nowIso();
    Object.assign(row, { status: decision, moderated_at: at, moderated_by: this.db.session, mod_note: note });
    if (table === 'submissions') {
      row.is_sample = decision === 'approved' && row.kind === 'photo' && !!opts.is_sample;
      if (decision === 'approved') row.approved_at = at;   // drives the per-listing "Updated" signal
    }
    this.save();
  }
  // "Recently updated" signal: per listing, the kinds and latest approved_at of submissions
  // APPROVED in the last `days` days. Facts only, never content (safe for preview viewers).
  // Same shape as the Supabase rpc recent_listing_updates(days).
  async recentUpdates(days = CONFIG.newDays) {
    const cut = Date.now() - days * 864e5, m = new Map();
    for (const s of this.db.submissions) {
      if (s.status !== 'approved' || !s.listing_id || !s.approved_at || Date.parse(s.approved_at) < cut) continue;
      const u = m.get(s.listing_id) || { listing_id: s.listing_id, kinds: [], last_approved_at: '' };
      if (!u.kinds.includes(s.kind)) u.kinds.push(s.kind);
      if (s.approved_at > u.last_approved_at) u.last_approved_at = s.approved_at;
      m.set(s.listing_id, u);
    }
    return [...m.values()];
  }
  async resolveReport(id, action) {
    if (!this.isMod()) throw new Error('Moderators only');
    const r = this.db.reports.find((x) => x.id === id); if (!r) return;
    if (action === 'removed') { const t = { comment: 'comments', board_post: 'board_posts', submission: 'submissions' }[r.target_type]; if (t) await this.moderate(t, r.target_id, 'removed', 'Removed after report'); }
    r.status = action; r.resolved_at = nowIso(); this.save();
  }
  // Notification opt-in, saved in this browser only (same shape as notification_prefs).
  async getNotifyPref() { const m = await this.getSession(); return m ? getNotifyPref(m.id || m.handle) : null; }
  async setNotifyPref(optedIn) { const m = this.requireMe(); return setNotifyPref(m.id || m.handle, optedIn); }
  async commentCounts() {
    const c = {}; for (const x of this.db.comments) if (x.status === 'approved') c[x.listing_id] = (c[x.listing_id] || 0) + 1; return c;
  }
}

// Resize a picked image to a small JPEG data URL so it fits in localStorage.
function shrinkImage(file) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return res(null); // documents: keep metadata only in preview
    const img = new Image(), fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    fr.onerror = rej;
    img.onload = () => {
      const s = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => res(null);
    fr.readAsDataURL(file);
  });
}
