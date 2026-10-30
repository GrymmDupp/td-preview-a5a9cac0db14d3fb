// The community backend contract. Views call ONLY these methods, so swapping the
// local preview store for Supabase touches no view code.
//
// Access model: every listing has a FREE PREVIEW (from the public feed) and a FULL
// FILE that an account unlocks once, permanently, on every device it signs in on.
// Price: $9 per file; $7 while a Monthly membership ($7/mo) is active; $5 with Lifetime
// ($49 one time). Memberships only change the price of FUTURE unlocks; unlocked files
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
//   signIn(opts): Promise<Account|{sent:true}>      local: {handle}; supabase: {email} (magic link)
//   signOut(): Promise<void>
//   // unlocks (one row per account + listing; permanent)
//   listUnlocks(): Promise<Unlock[]>                  caller's own
//   hasUnlock(listingId): Promise<boolean>
//   getMembership(): Promise<Membership|null>      caller's EFFECTIVE membership (lifetime, or monthly before period end)
//   startMembershipCheckout(plan: 'monthly'|'lifetime', returnListingId?): Promise<{redirect?, active?}>
//   cancelMembership(): Promise<void|{redirect}>    monthly: stop renewing (live: Stripe billing portal)
//   startCheckout(listingId): Promise<{redirect?:string, unlocked?:boolean}>   $9 / $7 / $5 by membership
//        local: records a MOCK unlock (no payment); supabase: Stripe Checkout via Edge Function
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
// }

import { CONFIG } from '../config.js';

let backend;
export async function getBackend() {
  if (backend) return backend;
  if (CONFIG.backend === 'supabase' && CONFIG.supabase.url && CONFIG.supabase.anonKey) {
    const { SupabaseBackend } = await import('./supabase.js');
    backend = new SupabaseBackend(CONFIG.supabase);
  } else {
    const { LocalBackend } = await import('./local.js');
    backend = new LocalBackend();
  }
  await backend.init();
  return backend;
}
