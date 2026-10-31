// SUPABASE backend: the live community store. Turn it on in js/config.js with
// backend: 'supabase' + url + anonKey (the PUBLISHABLE key only; it is safe in the browser).
// Row-level security in supabase/schema.sql is what protects data; this file only
// implements the adapter contract (see adapter.js). The browser never writes unlocks or
// memberships directly: real payments go through the Stripe Edge Functions, and until
// Stripe is set up (app_settings.checkout_mode = 'mock') the server-side functions
// preview_mock_unlock / preview_mock_membership record EXAMPLE purchases (no payment).
import { fullFromRow, feed } from '../feed.js';
import { CONFIG } from '../config.js';
const SDK = 'https://esm.sh/@supabase/supabase-js@2.118.0';
const BUCKET = 'contributions';
// Comment, board and submission rows reference profiles twice (author + moderator), so the
// author embed names its foreign key.
const A = {
  comments: 'author:profiles!comments_user_id_fkey(handle)',
  board_posts: 'author:profiles!board_posts_user_id_fkey(handle)',
  submissions: 'author:profiles!submissions_author_id_fkey(handle)',
};

export class SupabaseBackend {
  mode = 'supabase'; isPreview = false; mockCheckout = false; paymentLinkCheckout = false; checkoutMode = null;
  constructor(cfg) { this.cfg = cfg; }
  async init() {
    const { createClient } = await import(SDK);
    this.sb = createClient(this.cfg.url, this.cfg.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, storageKey: 'td-auth' } });
    // Health check: one tiny public read. Throws if the project is unreachable, so the
    // adapter can fall back to the in-browser preview store and say so.
    const mode = await Promise.race([
      this.sb.rpc('checkout_mode'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Supabase timed out')), 8000)),
    ]);
    if (mode.error) throw new Error(mode.error.message);
    this.checkoutMode = mode.data;
    this.mockCheckout = mode.data === 'mock';
    this.paymentLinkCheckout = mode.data === 'payment_link';   // Stripe Payment Link + instant unlock (verify-unlock)
    // Trial switches from app_settings (pricing_mode / trial_unlock_price / memberships_enabled).
    // Display only: the server decides the recorded price and refuses memberships while off.
    const ps = await this.sb.rpc('pricing_settings');
    if (!ps.error && ps.data) {
      const P = CONFIG.pricing;
      P.trial = { active: !!ps.data.trial, unlockPrice: Number(ps.data.trial_unlock_price) || P.trial.unlockPrice,
        unlockPaymentLink: ps.data.unlock_payment_link || P.trial.unlockPaymentLink };
      P.membershipsEnabled = ps.data.memberships_enabled !== false;
    } else console.warn('pricing_settings unavailable; using js/config.js defaults', ps.error?.message);
    const { data } = await this.sb.auth.getSession();
    this.uid = data.session?.user?.id || null;
    this.sb.auth.onAuthStateChange((_e, s) => { const id = s?.user?.id || null; if (id !== this.uid) { this.uid = id; this._me = undefined; } });
  }
  ok({ data, error }) { if (error) throw new Error(error.message); return data; }
  need() { if (!this.uid) throw new Error('Sign in first'); }

  // ---- account (email + password; role is a permission, read via my_profile(), never shown)
  async getSession() {
    if (!this.uid) return null;
    if (this._me === undefined) this._me = (this.ok(await this.sb.rpc('my_profile')) || [])[0] || null;
    return this._me;
  }
  async signIn({ email, password, create = false }) {
    email = String(email || '').trim(); password = String(password || '');
    if (!email || !password) throw new Error('Enter your email and a password');
    if (create) {
      if (password.length < 8) throw new Error('Use at least 8 characters for your password');
      const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw new Error(error.message);
      if (!data.session) return { sent: true };   // email confirmation required first
      this.uid = data.session.user.id;
    } else {
      const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(/confirm/i.test(error.message) ? 'Confirm your email first (check your inbox), then sign in.' : error.message);
      this.uid = data.session.user.id;
    }
    this._me = undefined;
    return this.getSession();
  }
  async signOut() { await this.sb.auth.signOut(); this.uid = null; this._me = null; }
  async setPreviewModerator() { throw new Error('Not available in live mode'); }

  // ---- notifications opt-in (structure only; nothing is sent yet)
  async getNotifyPref() {
    if (!this.uid) return null;
    return this.ok(await this.sb.from('notification_prefs').select('opted_in, tier1_only, created_at').eq('user_id', this.uid).maybeSingle());
  }
  async setNotifyPref(optedIn) {
    this.need();
    this.ok(await this.sb.from('notification_prefs').upsert({ user_id: this.uid, opted_in: !!optedIn, tier1_only: true }, { onConflict: 'user_id' }));
    return { opted_in: !!optedIn, tier1_only: true };
  }

  // ---- unlocks + memberships (RLS: caller reads only their own rows)
  async listUnlocks() {
    if (!this.uid) return [];
    return this.ok(await this.sb.from('unlocks').select('*').eq('user_id', this.uid).order('unlocked_at', { ascending: false }));
  }
  async hasUnlock(listingId) {
    if (!this.uid) return false;
    return !!this.ok(await this.sb.from('unlocks').select('id').eq('user_id', this.uid).eq('listing_id', listingId).maybeSingle());
  }
  // Effective membership: lifetime, or monthly whose current period hasn't ended.
  async getMembership() {
    if (!this.uid) return null;
    const rows = this.ok(await this.sb.from('memberships').select('*').eq('user_id', this.uid));
    const now = new Date().toISOString();
    return rows.find((x) => x.plan === 'lifetime' && x.status === 'active')
      || rows.find((x) => x.plan === 'monthly' && ['active', 'canceled', 'past_due'].includes(x.status) && x.current_period_end > now) || null;
  }
  async startMembershipCheckout(plan, returnListingId) {
    if (!CONFIG.pricing.membershipsEnabled) throw new Error('Memberships are coming soon.');   // the server refuses too
    if (this.mockCheckout) { this.need(); this.ok(await this.sb.rpc('preview_mock_membership', { p_plan: plan, p_action: 'start' })); return { active: true }; }
    return this._checkout({ product: plan, return_listing_id: returnListingId || null });
  }
  async cancelMembership() {
    if (this.mockCheckout) { this.need(); this.ok(await this.sb.rpc('preview_mock_membership', { p_plan: 'monthly', p_action: 'cancel' })); return; }
    return this._checkout({ product: 'portal' });   // Stripe billing portal
  }
  async previewLapse() {
    if (!this.mockCheckout) throw new Error('Not available in live mode');
    this.need(); this.ok(await this.sb.rpc('preview_mock_membership', { p_plan: 'monthly', p_action: 'lapse' }));
  }
  // The price is resolved server-side (trial: app_settings trial_unlock_price; planned: by membership).
  async startCheckout(listingId) {
    if (this.paymentLinkCheckout) {
      // Payment Link mode: no fake unlock. Record a PENDING request server-side (amount and
      // reference decided by the server), then hand back the Stripe Payment Link carrying the
      // reference. The Edge Function verify-unlock grants the unlock the moment Stripe shows the
      // payment as paid (moderators can still confirm by hand as a backup).
      this.need();
      const req = this.ok(await this.sb.rpc('request_unlock', { lid: listingId }));
      return { pending: true, request: req, paymentUrl: await this.paymentUrl(req) };
    }
    if (this.mockCheckout) { this.need(); this.ok(await this.sb.rpc('preview_mock_unlock', { lid: listingId })); return { unlocked: true }; }
    return this._checkout({ product: 'unlock', listing_id: listingId });
  }
  async paymentUrl(req) {
    const base = CONFIG.pricing.trial?.unlockPaymentLink;
    if (!base || !req) return null;
    const u = new URL(base);
    u.searchParams.set('client_reference_id', req.client_reference_id);   // letters, digits, - and _ only (server-built)
    const { data } = await this.sb.auth.getSession();
    const email = data.session?.user?.email;
    if (email) u.searchParams.set('prefilled_email', email);
    return u.toString();
  }
  // The caller's own unlock requests (RLS: own rows only; moderators use listUnlockRequests).
  async myUnlockRequests() {
    if (!this.uid || !this.paymentLinkCheckout) return [];
    return this.ok(await this.sb.from('unlock_requests').select('*').eq('user_id', this.uid).order('created_at', { ascending: false }));
  }
  // Instant unlock: ask the server (Edge Function verify-unlock, read-only Stripe check) whether the
  // caller's pending request(s) are paid; it grants the unlock itself. Returns [{ id, listing_id, status }].
  async verifyUnlocks(requestId) {
    if (!this.uid || !this.paymentLinkCheckout) return [];
    const { data, error } = await this.sb.functions.invoke('verify-unlock', { body: requestId ? { request_id: requestId } : {} });
    if (error) throw new Error('Couldn’t reach the payment check. Try again in a moment.');
    return data?.results || [];
  }
  async listUnlockRequests(status = 'pending') { return this.ok(await this.sb.rpc('list_unlock_requests', { p_status: status })) || []; }
  async confirmUnlockRequest(id) { return this.ok(await this.sb.rpc('confirm_unlock_request', { rid: id })); }
  async rejectUnlockRequest(id, note) { this.ok(await this.sb.rpc('reject_unlock_request', { rid: id, p_note: note || null })); }
  async _checkout(body) {
    this.need();
    const { data, error } = await this.sb.functions.invoke('create-checkout', { body });
    if (error) throw new Error(error.message);
    if (data?.already) return { unlocked: true, active: true };
    return { redirect: data.url };
  }

  async getFullFile(listingId) {
    if (!this.uid) return null;
    const f = this.ok(await this.sb.from('listing_full').select('*').eq('listing_id', listingId).maybeSingle());
    if (!f) return null;   // RLS returns nothing without an unlock (or moderator role)
    const community = await this._withUrls(this.ok(await this.sb.from('submissions').select(`*, ${A.submissions}`)
      .eq('listing_id', listingId).eq('status', 'approved').order('created_at', { ascending: false })));
    return { ...fullFromRow(f, feed.byId.get(listingId)), community };
  }
  async fileCounts(listingId) { return this.ok(await this.sb.rpc('file_counts', { lid: listingId })); }
  async samplePhotos(listingId) {
    return this._withUrls(this.ok(await this.sb.from('submissions').select(`*, ${A.submissions}`)
      .eq('listing_id', listingId).eq('status', 'approved').eq('is_sample', true)));
  }
  async _withUrls(rows) {
    for (const r of rows) if (r.storage_path) {
      const { data } = await this.sb.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600);
      if (data) r.payload = { ...r.payload, data_url: data.signedUrl };
    }
    return rows;
  }

  // ---- DATA: submissions (always inserted 'pending'; RLS rejects anything else)
  async createSubmission({ kind, listing_id, payload, rights_confirmed, file }) {
    this.need();
    let storage_path = null;
    if (file) {
      storage_path = `${this.uid}/${crypto.randomUUID()}-${String(file.name || 'file').replace(/[^\w.-]+/g, '_')}`;
      this.ok(await this.sb.storage.from(BUCKET).upload(storage_path, file, { contentType: file.type }));
      payload = { ...payload }; delete payload.data_url;
    }
    return this.ok(await this.sb.from('submissions').insert({ kind, listing_id: listing_id || null, author_id: this.uid, payload, rights_confirmed: !!rights_confirmed, storage_path }).select().single());
  }
  async listMySubmissions() {
    if (!this.uid) return [];
    return this.ok(await this.sb.from('submissions').select('*').eq('author_id', this.uid).order('created_at', { ascending: false }));
  }

  // ---- SOCIAL (a): comments. RLS: approved, or your own, or moderator.
  async listComments(listingId) {
    const rows = this.ok(await this.sb.from('comments').select(`*, ${A.comments}`).eq('listing_id', listingId)
      .in('status', ['approved', 'pending']).order('created_at'));
    return rows.filter((c) => c.status === 'approved' || c.user_id === this.uid);
  }
  async createComment({ listing_id, body, parent_id = null }) {
    this.need();
    return this.ok(await this.sb.from('comments').insert({ listing_id: listing_id || '', user_id: this.uid, body, parent_id }).select().single());
  }
  // ---- SOCIAL (b): the one general board
  async listBoard() {
    const rows = this.ok(await this.sb.from('board_posts').select(`*, ${A.board_posts}`).in('status', ['approved', 'pending']).order('created_at'))
      .filter((b) => b.status === 'approved' || b.user_id === this.uid);
    return rows.filter((r) => !r.parent_id).reverse().map((p) => ({ ...p, replies: rows.filter((r) => r.parent_id === p.id) }));
  }
  async createBoardPost({ title = '', body, parent_id = null }) {
    this.need();
    return this.ok(await this.sb.from('board_posts').insert({ title: parent_id ? '' : title, body, parent_id, user_id: this.uid }).select().single());
  }

  // ---- safety + moderation
  // No .select() after insert: reporters can't read reports back (moderators only).
  async report({ target_type, target_id, reason, details }) {
    this.need();
    this.ok(await this.sb.from('reports').insert({ target_type, target_id: String(target_id), reason, details: String(details || '').slice(0, 1000), reporter_id: this.uid }));
    return { ok: true };
  }
  async listQueue() {
    const pend = (t) => this.sb.from(t).select(`*, ${A[t]}`).eq('status', 'pending').order('created_at');
    const [s, c, b, r] = await Promise.all([pend('submissions'), pend('comments'), pend('board_posts'),
      this.sb.from('reports').select('*').eq('status', 'open').order('created_at')]);
    const board = this.ok(b), parents = board.filter((x) => x.parent_id).map((x) => x.parent_id);
    const pmap = new Map();
    if (parents.length) for (const p of this.ok(await this.sb.from('board_posts').select('id, title').in('id', [...new Set(parents)]))) pmap.set(p.id, p);
    const reports = this.ok(r);
    for (const rep of reports) {
      const t = { comment: 'comments', board_post: 'board_posts', submission: 'submissions' }[rep.target_type];
      if (t) rep.target = (this.ok(await this.sb.from(t).select(`*, ${A[t]}`).eq('id', rep.target_id).maybeSingle())) || null;
    }
    return { submissions: await this._withUrls(this.ok(s)), comments: this.ok(c),
      board: board.map((x) => ({ ...x, parent: x.parent_id ? pmap.get(x.parent_id) || null : null })), reports };
  }
  // Per-listing "Updated" signal: rpc returns listing_id, kinds, last_approved_at only (no content).
  async recentUpdates(days = 7) {
    const { data, error } = await this.sb.rpc('recent_listing_updates', { days });
    if (error) { console.warn('recent_listing_updates unavailable', error.message); return []; }
    return data || [];
  }
  // approved_at / moderated_by / moderated_at are set by the database trigger.
  async moderate(table, id, decision, note = '', opts = {}) {
    const patch = { status: decision, mod_note: note || null };
    if (table === 'submissions') patch.is_sample = decision === 'approved' && !!opts.is_sample;
    const rows = this.ok(await this.sb.from(table).update(patch).eq('id', id).select('id'));
    if (!rows?.length) throw new Error('Not allowed, or that item is gone');
  }
  async resolveReport(id, action) {
    const r = this.ok(await this.sb.from('reports').select('*').eq('id', id).single());
    const t = { comment: 'comments', board_post: 'board_posts', submission: 'submissions' }[r.target_type];
    if (action === 'removed' && t) await this.moderate(t, r.target_id, 'removed', 'Removed after report');
    this.ok(await this.sb.from('reports').update({ status: action, resolved_by: this.uid, resolved_at: new Date().toISOString() }).eq('id', id));
  }
  async commentCounts() {
    const rows = this.ok(await this.sb.rpc('comment_counts'));
    return Object.fromEntries(rows.map((r) => [r.listing_id, Number(r.n)]));
  }
}
