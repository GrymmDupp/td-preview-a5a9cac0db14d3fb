/* Twisted Deeds service worker: offline app shell, fresh pages, never touches accounts or payments.
 * Scope is the folder this file is served from ('./'), so it works on a GitHub Pages subpath.
 * Bump VERSION on every deploy (the preview deploy script stamps it automatically); the old
 * caches are deleted when the new worker activates. See _build/PWA_NOTES.md. */
const VERSION = 'td-pwa-20261101-110221';
const SHELL = `${VERSION}-shell`;      // precached app shell
const RUNTIME = `${VERSION}-runtime`;  // static assets + data seen while browsing
const OFFLINE = 'offline.html';

const PRECACHE = [
  './', 'index.html', OFFLINE, 'manifest.webmanifest',
  'assets/css/site.css', 'assets/fonts/fonts.css',
  'assets/fonts/Cinzel-500.woff2', 'assets/fonts/Cinzel-700.woff2', 'assets/fonts/CormorantGaramond-500.woff2',
  'assets/fonts/CormorantGaramond-500i.woff2', 'assets/fonts/CormorantGaramond-600.woff2',
  'assets/fonts/Inter-400.woff2', 'assets/fonts/Inter-600.woff2',
  'js/app.js', 'js/config.js', 'js/feed.js', 'js/util.js', 'js/components.js', 'js/taxonomy.js', 'js/notify.js', 'js/install.js',
  'js/backend/adapter.js', 'js/backend/local.js', 'js/backend/supabase.js',
  'js/views/home.js', 'js/views/browse.js', 'js/views/listing.js', 'js/views/map.js', 'js/views/board.js', 'js/views/unlock.js',
  'js/views/membership.js', 'js/views/account.js', 'js/views/contribute.js', 'js/views/moderation.js', 'js/views/pages.js',
  'js/views/packs.js', 'js/views/archive.js', 'js/views/heritage.js', 'js/views/research.js',
  'data/listings.snapshot.json', 'data/packs.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
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
    const keep = new Set([SHELL, RUNTIME]);
    for (const key of await caches.keys()) if (key.startsWith('td-') && !keep.has(key)) await caches.delete(key);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

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
    const hit = await runtime.match(event.request, { ignoreSearch: true });
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

  if (url.origin !== self.location.origin) {
    if (LIB_CDN.test(url.hostname)) event.respondWith(staleWhileRevalidate(event));
    return;                                                           // everything else: network only
  }
  const inScope = url.href.startsWith(scopeUrl.href);
  if (req.mode === 'navigate') { if (inScope) event.respondWith(navigate(event)); return; }
  if (/\/feed\/listings\.json$/.test(url.pathname)) { event.respondWith(networkFirst(event)); return; }
  if (!inScope) return;
  if (url.pathname.endsWith('/sw.js') || /listings_full/.test(url.pathname)) return;
  if (url.search && !/\.(css|js|json|woff2|png|jpe?g|webp|svg|webmanifest)$/.test(url.pathname)) return;
  if (/\.(css|js|json|woff2?|png|jpe?g|webp|svg|ico|webmanifest)$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(event));
});
