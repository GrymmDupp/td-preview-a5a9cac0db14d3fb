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
  backend: 'local',
  supabase: {
    url: '',      // e.g. https://abcdxyz.supabase.co
    anonKey: '',  // the public "anon" key (safe in the browser; RLS protects the data)
    mediaBucket: 'contributions',
  },

  // Listing photos in the feed are "reference" rights (the broker's or press photos).
  // The public site does NOT reproduce them; it links to the original page instead.
  // Only images whose rights are in this list are shown inline.
  displayableRights: ['permission', 'cleared'],

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

  // Days a listing counts as "new" in the listing feed.
  newDays: 14,
};
