// The community backend contract. Views call ONLY these methods, so swapping the
// local preview store for Supabase touches no view code.
//
// Access model: every listing has a FREE PREVIEW (from the public feed) and a FULL
// FILE that an account unlocks once, permanently, on every device it signs in on.
// Price: TRIAL = one flat trial price for everyone, memberships "Coming soon" (app_settings).
// Planned model (js/config.js): standard price per file, lower with Monthly or Lifetime. Memberships only change the price of FUTURE unlocks; unlocked files
// stay unlocked forever. The price is resolved server-side from the caller's active
// membership, never sent by the page. The only badge ("Lifetime") is on the member's own
// account page.
//
// Two separate things:
//   DATA  = submissions (info, photo, lore, link) to a listing. Moderated; approved
//           ones become part of that listing's full file (unlock required to read).
//   SOCIAL = (a) comments on a listing page, (b) ONE general community board.
//           Public, pre-moderated, Report button on everything. No likes, votes,
//           reactions, shares, follows, badges, profiles or counts.
//
// interface CommunityBackend {
//   mode: 'local' | 'supabase';  isPreview: boolean;
//   init(): Promise<void>
//   // account (a handle + sign-in; role is a permission, never displayed)
//   getSession(): Promise<Account|null>
//   signIn(opts): Promise<Account|{sent:true}>      local: {handle}; supabase: {email, password, create?}
//   getNotifyPref(): Promise<{opted_in, tier1_only}|null>   setNotifyPref(optedIn): Promise<...>  (notification_prefs)
//   mockCheckout?: boolean                           supabase: true while checkout_mode = 'mock' (no Stripe yet)
//   signOut(): Promise<void>
//   // unlocks (one row per account + listing; permanent)
//   listUnlocks(): Promise<Unlock[]>                  caller's own
//   hasUnlock(listingId): Promise<boolean>
//   getMembership(): Promise<Membership|null>      caller's EFFECTIVE membership (lifetime, or monthly before period end)
//   startMembershipCheckout(plan: 'monthly'|'lifetime', returnListingId?): Promise<{redirect?, active?}>
//   cancelMembership(): Promise<void|{redirect}>    monthly: stop renewing (live: Stripe billing portal)
//   startCheckout(listingId): Promise<{redirect?:string, unlocked?:boolean}>   trial price, or by membership (planned)
//        local: records a MOCK unlock (no payment); supabase: Stripe Checkout via Edge Function,
//        or a server-recorded example unlock (rpc preview_mock_unlock) while mockCheckout
//   getFullFile(listingId): Promise<FullFile|null>    null unless unlocked (or moderator)
//   fileCounts(listingId): Promise<{photo, lore, info, link}>   approved counts only, no content
//   samplePhotos(listingId): Promise<Submission[]>   approved photos a moderator marked as preview samples
//   // DATA: submissions (kind = 'info' | 'photo' | 'lore' | 'link')
//   createSubmission({kind, listing_id?, payload, rights_confirmed, file?}): Promise<Submission>
//   listMySubmissions(): Promise<Submission[]>
//   // SOCIAL (a): listing comments, threaded one level via parent_id
//   listComments(listingId): Promise<Comment[]>        approved + caller's own pending, oldest first
//   createComment({listing_id, body, parent_id?}): Promise<Comment>
//   // SOCIAL (b): the one general board, posts + replies in one table via parent_id
//   listBoard(): Promise<BoardPost[]>                  top-level posts newest first, each with .replies
//   createBoardPost({title?, body, parent_id?}): Promise<BoardPost>
//   // safety
//   report({target_type: 'comment'|'board_post'|'submission'|'listing', target_id, reason, details}): Promise<Report>
//   // moderation (moderators only; RLS enforces it in Supabase)
//   listQueue(): Promise<{submissions, comments, board, reports}>
//   moderate(table: 'submissions'|'comments'|'board_posts', id, decision: 'approved'|'rejected'|'removed', note?, opts?: {is_sample?}): Promise<void>
//   resolveReport(id, action: 'dismissed'|'removed'): Promise<void>
//   commentCounts(): Promise<{[listingId]: number}>     approved comments per listing (cards)
//   recentUpdates(days?): Promise<[{listing_id, kinds: string[], last_approved_at}]>
//        listings with submissions APPROVED in the last N days (approved_at). Facts only, no
//        content, so preview viewers can see "New community photos added". Supabase: rpc recent_listing_updates.
// }

import { CONFIG } from '../config.js';

let backend;
// Live mode uses Supabase. If the project can't be reached (offline, outage, blocked), the
// site falls back to the in-browser preview store and shows a notice saying so
// (backend.fallback = true), so nobody mistakes test data for the live community.
export async function getBackend() {
  if (backend) return backend;
  if (CONFIG.backend === 'supabase' && CONFIG.supabase.url && CONFIG.supabase.anonKey) {
    try {
      const { SupabaseBackend } = await import('./supabase.js');
      const sb = new SupabaseBackend(CONFIG.supabase);
      await sb.init();
      return (backend = sb);
    } catch (e) {
      console.warn('Supabase unreachable, using the in-browser preview store:', e?.message || e);
    }
    const { LocalBackend } = await import('./local.js');
    backend = new LocalBackend(); backend.fallback = true;
  } else {
    const { LocalBackend } = await import('./local.js');
    backend = new LocalBackend();
  }
  await backend.init();
  return backend;
}
