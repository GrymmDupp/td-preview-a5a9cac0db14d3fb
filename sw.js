/* Twisted Deeds service worker: offline app shell, fresh pages, never touches accounts or payments.
 * Scope is the folder this file is served from ('./'), so it works on a GitHub Pages subpath.
 * Bump VERSION on every deploy (the preview deploy script stamps it automatically); the old
 * caches are deleted when the new worker activates. See _build/PWA_NOTES.md. */
const VERSION = 'td-pwa-20261121-014339';
const SHELL = `${VERSION}-shell`;      // precached app shell
const RUNTIME = `${VERSION}-runtime`;  // static assets + data seen while browsing
const OFFLINE = 'offline.html';
// Books the reader opened: their preview images, kept across deploys so opened books stay readable
// offline (the listing text itself comes from the cached feed / precached snapshot). Capped below.
const BOOKS = 'td-books';
const BOOKS_CAP = 48;   // images; oldest dropped first

const PRECACHE = [
  './', 'index.html', OFFLINE, 'manifest.webmanifest',
  'assets/css/site.css', 'assets/fonts/fonts.css',
  'assets/css/tome.css', 'assets/css/shadow.css', 'assets/fonts/shadow-fonts.css',
  'assets/fonts/IMFellEnglish.woff2', 'assets/fonts/IMFellEnglish-i.woff2', 'assets/fonts/IMFellEnglishSC.woff2',
  'assets/fonts/IMFellDoublePicaSC.woff2', 'assets/fonts/Sacramento.woff2', 'assets/fonts/SpecialElite.woff2',
  'assets/th/fog.webp', 'assets/th/gentleman.webp', 'assets/th/gentleman-glow.webp', 'assets/th/nyx.svg', 'assets/th/grain.png', 'assets/th/ink-mask.png', 'assets/th/rose.webp',
  'assets/th/th-letters.png', 'assets/th/th-seal.png', 'assets/th/vine-corner.png', 'assets/th/vine-edge.png',
  'js/tome.js', 'js/atmo.js', 'js/effects.js', 'js/reveals.js', 'js/world.js', 'assets/css/effects.css', 'assets/css/reveals.css', 'assets/css/world.css', 'assets/css/archive.css',
  'assets/fonts/Cinzel-500.woff2', 'assets/fonts/Cinzel-700.woff2', 'assets/fonts/CormorantGaramond-500.woff2',
  'assets/fonts/CormorantGaramond-500i.woff2', 'assets/fonts/CormorantGaramond-600.woff2',
  'assets/fonts/Inter-400.woff2', 'assets/fonts/Inter-600.woff2',
  'js/app.js', 'js/config.js', 'js/feed.js', 'js/privacy.js', 'js/util.js', 'js/components.js', 'js/taxonomy.js', 'js/notify.js', 'js/install.js',
  'js/backend/adapter.js', 'js/backend/local.js', 'js/backend/supabase.js',
  'js/views/home.js', 'js/views/browse.js', 'js/views/listing.js', 'js/views/map.js', 'js/views/board.js', 'js/views/unlock.js',
  'js/views/membership.js', 'js/views/account.js', 'js/views/contribute.js', 'js/views/moderation.js', 'js/views/pages.js',
  'js/views/packs.js', 'js/views/archive.js', 'js/views/heritage.js', 'js/views/research.js',
  'js/pricing.js', 'js/analytics.js', 'js/sync.js', 'js/views/patronage.js', 'js/views/legal.js', 'js/views/admin_panels.js', 'assets/css/launch.css',
  'data/listings.snapshot.json', 'data/packs.json',
  'jackson/', 'jackson/index.html',
  'live/', 'live/index.html', 'live/live.js', 'live/live.css', 'live/drive.js', 'live/drive.css', 'live/jackson_pins.json', 'live/layers/index.json', 'live/vendor/leaflet.js', 'live/vendor/leaflet.css',
  'js/passport.js', 'js/unwritten.js', 'live/passport-live.js', 'live/passport.css', 'passport/', 'passport/index.html', 'passport/book.js', 'passport/passport.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon.ico',
  'assets/logo-shield-48.png', 'assets/logo-shield-96.png', 'assets/logo-shield-144.png',
];

// Never intercepted (always straight to the network): accounts, database, storage, Edge
// Functions, payments, map tiles.
const NEVER = [/(^|\.)supabase\.co$/, /(^|\.)supabase\.in$/, /(^|\.)stripe\.com$/, /(^|\.)stripe\.network$/, /(^|\.)stripecdn\.com$/,
  /(^|\.)openfreemap\.org$/, /(^|\.)arcgisonline\.com$/];
// Cross-origin library code (the Supabase JS SDK bundle from esm.sh): no user data, safe to keep.
const LIB_CDN = /(^|\.)esm\.sh$/;

const scopeUrl = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // cache: 'reload' skips the browser HTTP cache so a deploy never precaches stale files.
    await cache.addAll(PRECACHE.map((p) => new Request(new URL(p, scopeUrl), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, RUNTIME, BOOKS]);
    for (const key of await caches.keys()) if (key.startsWith('td-') && !keep.has(key)) await caches.delete(key);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') { self.skipWaiting(); return; }
  if (event.data?.type === 'td-keep') event.waitUntil(keepBook(event.data.urls || []));
});

// Keep an opened book's preview images (at most 4 per book, BOOKS_CAP overall, oldest out first).
async function keepBook(urls) {
  const cache = await caches.open(BOOKS);
  for (const u of urls.slice(0, 4)) {
    let url; try { url = new URL(u); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || NEVER.some((re) => re.test(url.hostname))) continue;
    if (await cache.match(url.href)) { const r = await cache.match(url.href); await cache.delete(url.href); await cache.put(url.href, r); continue; }   // refresh its place in line
    try {
      const same = url.origin === self.location.origin;
      const res = await fetch(url.href, same ? {} : { mode: 'no-cors' });
      if (res && (res.ok || res.type === 'opaque')) await cache.put(url.href, res);
    } catch { /* offline or blocked: skip */ }
  }
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - BOOKS_CAP))) await cache.delete(k);
}
// Offline images: a kept copy from an opened book, else try the network anyway.
async function imageWithBookFallback(event) {
  const hit = await (await caches.open(BOOKS)).match(event.request.url);
  return hit || fetch(event.request);
}

function cacheable(res) { return res && res.ok && res.type !== 'opaque' && !res.headers.get('cache-control')?.includes('no-store'); }

// Pages: network first (fresh deploys, email-confirmation and Stripe return links), app shell
// from cache when offline (hash routes like #/account still work), then the offline page.
async function navigate(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch (err) {
    const cache = await caches.open(SHELL);
    const own = await cache.match(event.request, { ignoreSearch: true });   // e.g. /live/ works offline too
    if (own) return own;
    return (await cache.match(new URL('index.html', scopeUrl))) || (await cache.match(new URL(OFFLINE, scopeUrl)))
      || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Static files and data/*.json: answer from cache at once, refresh it in the background.
async function staleWhileRevalidate(event) {
  const req = event.request;
  const runtime = await caches.open(RUNTIME);
  const hit = (await caches.match(req, { cacheName: SHELL })) || (await runtime.match(req));
  const update = fetch(req).then(async (res) => {
    if (cacheable(res)) {
      const shell = await caches.open(SHELL);
      if (await shell.match(req)) await shell.put(req, res.clone()); else await runtime.put(req, res.clone());
    }
    return res;
  });
  if (hit) { event.waitUntil(update.catch(() => {})); return hit; }
  return update.catch(() => Response.error());
}

// The live listings feed: always try the network (it changes), last good copy when offline.
async function networkFirst(event) {
  const runtime = await caches.open(RUNTIME);
  try {
    const res = await fetch(event.request);
    if (cacheable(res)) event.waitUntil(runtime.put(event.request, res.clone()));
    return res;
  } catch (err) {
    const hit = (await runtime.match(event.request, { ignoreSearch: true })) || (await caches.match(event.request, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                                   // POST/PUT/etc: never cached
  if (req.headers.has('authorization') || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (NEVER.some((re) => re.test(url.hostname))) return;              // Supabase, Stripe, map tiles

  // Offline only (map tiles and every other image go straight to the network as before)
  if (!self.navigator.onLine && req.destination === 'image' && (url.origin !== self.location.origin || !url.href.startsWith(scopeUrl.href))) { event.respondWith(imageWithBookFallback(event)); return; }
  if (url.origin !== self.location.origin) {
    if (LIB_CDN.test(url.hostname)) event.respondWith(staleWhileRevalidate(event));
    return;                                                           // everything else: network only
  }
  const inScope = url.href.startsWith(scopeUrl.href);
  if (req.mode === 'navigate') { if (inScope) event.respondWith(navigate(event)); return; }
  if (/\/feed\/listings\.json$/.test(url.pathname)) { event.respondWith(networkFirst(event)); return; }
  if (!inScope) return;
  // Live map layers (historical markers + cemeteries): versioned static tiles (?v=build), so answer from cache
  // at once and refresh in the background; tiles seen once keep working offline on the road.
  if (/\/live\/layers\/t\/.+\.json$/.test(url.pathname)) { event.respondWith(staleWhileRevalidate(event)); return; }
  // The Live navigator, Jackson map and Design Lab files: network first so a deploy shows up at once (cache only when offline).
  if (/\/(live|jackson|design-lab)\/.+\.(js|json|css)$/.test(url.pathname)) { event.respondWith(networkFirst(event)); return; }
  if (url.pathname.endsWith('/sw.js') || /listings_full/.test(url.pathname)) return;
  if (url.search && !/\.(css|js|json|woff2|png|jpe?g|webp|svg|webmanifest)$/.test(url.pathname)) return;
  if (/\.(css|js|json|woff2?|png|jpe?g|webp|svg|ico|webmanifest)$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(event));
});
