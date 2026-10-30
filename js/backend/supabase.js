// SUPABASE backend (stub, written against supabase/schema.sql; not yet run against a
// live project). Turn it on in js/config.js: backend: 'supabase' + url + anonKey.
// Row-level security in the schema is what actually protects data; this file only
// implements the adapter contract (see adapter.js). Payments go through the Stripe
// Edge Functions; the browser never writes unlocks or memberships.
import { fullFromRow, feed } from '../feed.js';
const SDK = 'https://esm.sh/@supabase/supabase-js@2';
const BUCKET = 'contributions';

export class SupabaseBackend {
  mode = 'supabase'; isPreview = false;
  constructor(cfg) { this.cfg = cfg; }
  async init() {
    const { createClient } = await import(SDK);
    this.sb = createClient(this.cfg.url, this.cfg.anonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const { data } = await this.sb.auth.getSession();
    this.uid = data.session?.user?.id || null;
    this.sb.auth.onAuthStateChange((_e, s) => { this.uid = s?.user?.id || null; this._me = undefined; });
  }
  ok({ data, error }) { if (error) throw new Error(error.message); return data; }
  need() { if (!this.uid) throw new Error('Sign in first'); }

  // ---- account
  async getSession() {
    if (!this.uid) return null;
    if (this._me === undefined) this._me = this.ok(await this.sb.from('profiles').select('id, handle, role').eq('id', this.uid).maybeSingle());
    return this._me;
  }
  // Passwordless magic link. Same email on any device = same account = same unlocks.
  async signIn({ email }) {
    this.ok(await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
    return { sent: true };
  }
  async signOut() { await this.sb.auth.signOut(); this.uid = null; this._me = null; }
  async setPreviewModerator() { throw new Error('Not available in live mode'); }

  // ---- unlocks + Lifetime (RLS: caller reads only their own rows; only the webhook writes)
  async listUnlocks() {
    if (!this.uid) return [];
    return this.ok(await this.sb.from('unlocks').select('*').order('unlocked_at', { ascending: false }));
  }
  async hasUnlock(listingId) {
    if (!this.uid) return false;
    return !!this.ok(await this.sb.from('unlocks').select('id').eq('listing_id', listingId).maybeSingle());
  }
  // Effective membership: lifetime, or monthly whose current period hasn't ended
  // (status active, or canceled = not renewing). Webhook keeps rows in sync with Stripe.
  async getMembership() {
    if (!this.uid) return null;
    const rows = this.ok(await this.sb.from('memberships').select('*').eq('user_id', this.uid));
    const now = new Date().toISOString();
    return rows.find((x) => x.plan === 'lifetime' && x.status === 'active')
      || rows.find((x) => x.plan === 'monthly' && ['active', 'canceled', 'past_due'].includes(x.status) && x.current_period_end > now) || null;
  }
  startMembershipCheckout(plan, returnListingId) { return this._checkout({ product: plan, return_listing_id: returnListingId || null }); }
  // Cancel/resume a monthly plan in Stripe's hosted billing portal (create-checkout {product:'portal'}).
  cancelMembership() { return this._checkout({ product: 'portal' }); }
  async previewLapse() { throw new Error('Not available in live mode'); }
  async _checkout(body) {
    this.need();
    const { data, error } = await this.sb.functions.invoke('create-checkout', { body });
    if (error) throw new Error(error.message);
    if (data?.already) return { unlocked: true, active: true };
    return { redirect: data.url };
  }
  // The function resolves $9 / $7 / $5 from public.memberships; the page sends only the listing.
  startCheckout(listingId) { return this._checkout({ product: 'unlock', listing_id: listingId }); }

  async getFullFile(listingId) {
    if (!this.uid) return null;
    const f = this.ok(await this.sb.from('listing_full').select('*').eq('listing_id', listingId).maybeSingle());
    if (!f) return null;   // RLS returns nothing without an unlock (or moderator role)
    const community = await this._withUrls(this.ok(await this.sb.from('submissions').select('*, author:profiles(handle)')
      .eq('listing_id', listingId).eq('status', 'approved').order('created_at', { ascending: false })));
    return { ...fullFromRow(f, feed.byId.get(listingId)), community };
  }
  async fileCounts(listingId) { return this.ok(await this.sb.rpc('file_counts', { lid: listingId })); }
  async samplePhotos(listingId) {
    return this._withUrls(this.ok(await this.sb.from('submissions').select('*, author:profiles(handle)')
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
      storage_path = `${this.uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      this.ok(await this.sb.storage.from(BUCKET).upload(storage_path, file, { contentType: file.type }));
    }
    return this.ok(await this.sb.from('submissions').insert({ kind, listing_id: listing_id || null, payload, rights_confirmed: !!rights_confirmed, storage_path }).select().single());
  }
  async listMySubmissions() {
    if (!this.uid) return [];
    return this.ok(await this.sb.from('submissions').select('*').eq('author_id', this.uid).order('created_at', { ascending: false }));
  }

  // ---- SOCIAL (a): comments. RLS: approved, or your own, or moderator.
  async listComments(listingId) {
    return this.ok(await this.sb.from('comments').select('*, author:profiles(handle)').eq('listing_id', listingId)
      .in('status', ['approved', 'pending']).order('created_at'));
  }
  async createComment({ listing_id, body, parent_id = null }) {
    this.need();
    return this.ok(await this.sb.from('comments').insert({ listing_id: listing_id || '', body, parent_id }).select().single());
  }
  // ---- SOCIAL (b): the one general board
  async listBoard() {
    const rows = this.ok(await this.sb.from('board_posts').select('*, author:profiles(handle)').in('status', ['approved', 'pending']).order('created_at'));
    return rows.filter((r) => !r.parent_id).reverse().map((p) => ({ ...p, replies: rows.filter((r) => r.parent_id === p.id) }));
  }
  async createBoardPost({ title = '', body, parent_id = null }) {
    this.need();
    return this.ok(await this.sb.from('board_posts').insert({ title, body, parent_id }).select().single());
  }

  // ---- safety + moderation
  async report({ target_type, target_id, reason, details }) {
    this.need();
    return this.ok(await this.sb.from('reports').insert({ target_type, target_id, reason, details: details || '' }).select().single());
  }
  async listQueue() {
    const pend = (t) => this.sb.from(t).select('*, author:profiles(handle)').eq('status', 'pending').order('created_at');
    const [s, c, b, r] = await Promise.all([pend('submissions'), pend('comments'), pend('board_posts'),
      this.sb.from('reports').select('*').eq('status', 'open').order('created_at')]);
    return { submissions: await this._withUrls(this.ok(s)), comments: this.ok(c), board: this.ok(b), reports: this.ok(r) };
  }
  async moderate(table, id, decision, note = '', opts = {}) {
    const patch = { status: decision, mod_note: note || null };
    if (table === 'submissions') patch.is_sample = decision === 'approved' && !!opts.is_sample;
    this.ok(await this.sb.from(table).update(patch).eq('id', id));
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
