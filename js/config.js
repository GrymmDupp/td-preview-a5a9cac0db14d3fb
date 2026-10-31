// Twisted Deeds public site: settings. This is the only file Grymm normally edits.
export const CONFIG = {
  siteName: 'Twisted Deeds',
  tagline: 'A community archive of buyable American houses with a past',
  owner: 'Twisted History Tours · Horton, Michigan',

  // Live listings feed (published by feed-repo/scripts/publish_feed.py). Read only.
  feedUrl: 'https://grymmdupp.github.io/twisted-deeds-feed/feed/listings.json',
  // Bundled copy used when the live feed can't be reached (offline, file://, outage).
  feedFallback: 'data/listings.snapshot.json',
  // Local preview mode only: private full files, fetched only on localhost.
  // Copy of _build/listings_full.json; git-ignored; never deploy it.
  fullLocalUrl: 'data/listings_full.local.json',

  // Community backend: 'local' (this browser only, preview data) or 'supabase'.
  backend: 'supabase',
  supabase: {
    url: 'https://lsifrtmxtmqbdnwxwpfp.supabase.co',
    anonKey: 'sb_publishable_d2ad3BrsdSrKnRwa6r0gEw_Dj0Kv0u9',  // PUBLISHABLE key (safe in the browser; RLS protects the data)
    mediaBucket: 'contributions',
  },

  // Images shown inline, by rights. 'hotlink' = listing / alt-listing photos, loaded
  // straight from the source site with a credit link back (never rehosted, owner
  // decision 2026-10-30). 'public-domain' / 'cc' = free images copied into the feed repo
  // with license and author. 'illustration' = drawn, labelled "Illustration, not a photo".
  // 'reference' (press / broker photo pages) stays link-only.
  displayableRights: ['permission', 'cleared', 'hotlink', 'public-domain', 'cc', 'illustration'],

  // Map: MapLibre + OpenFreeMap dark (no key). Falls back to Esri Dark Gray raster.
  map: {
    style: 'https://tiles.openfreemap.org/styles/dark',
    styleAttribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    fallbackTiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    fallbackAttribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors',
  },

  // Pricing, locked in by Grymm 2026-10-30. The preview checkout is still a mock
  // (no real payment); real payments go through Stripe, see README "Payments".
  //  - unlockPrice: one-time unlock of ONE listing's full file, permanent, every device.
  //  - Monthly membership: monthlyPrice per month; while active, unlocks cost
  //    monthlyUnlockPrice. Files unlocked stay unlocked forever after it lapses; lapsing
  //    only changes the price of future unlocks.
  //  - Lifetime membership: lifetimePrice one time, never expires; unlocks cost
  //    lifetimeUnlockPrice forever.
  //  Memberships only change the price. The one badge ("Lifetime") is shown ONLY on
  //  the member's own account page, never next to comments, posts or listings.
  pricing: {
    unlockPrice: 9,
    monthlyUnlockPrice: 7,
    lifetimeUnlockPrice: 5,
    monthlyPrice: 7,
    lifetimePrice: 49,
    currency: 'USD',
  },

  // "New this week": a listing counts as New for this many days after it first appeared
  // in the feed (its addedAt). Also the window for the quieter "Updated" marker
  // (community submissions approved in the last N days).
  newDays: 7,

  // Notifications about new Twisted Deed (Tier 1) listings. STRUCTURE ONLY: nothing sends.
  // js/notify.js computes the payload; see NOTIFICATIONS.md for wiring it up later
  // (Supabase scheduled function + an email provider; max one digest a day; Tier 1 only;
  // one-click unsubscribe). No push permission prompts, no nav badges or counters.
  notifications: {
    enabled: false,
    tier1Only: true,
    maxPerDay: 1,
    channels: {
      email: { provider: '', from: '' },       // e.g. 'resend' / 'postmark'; left empty on purpose
      webPush: { vapidPublicKey: '' },          // left empty on purpose; never prompt for permission
    },
  },
};
