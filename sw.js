// sw.js - Service Worker Resiliente com Cache Offline Stale-While-Revalidate
const CACHE_NAME = 'anna-pwa-v4';
const CORE_ASSETS = [
  '/',
  '/agendar',
  '/noivas',
  '/links',
  '/images/logo.png',
  '/images/og-cover.jpg',
  '/images/hero-800.webp',
  '/images/icons/icon-192.png',
  '/favicon.ico',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Could not pre-cache: ${url}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || /^\/admin(?:[/.]|$)/.test(url.pathname)
      || url.origin !== self.location.origin) {
    return;
  }

  const fetchAndCache = async () => {
    const response = await fetch(req);
    if (response.ok && !url.search) {
      const copy = response.clone();
      await caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
    }
    return response;
  };

  // Load the latest consent and conversion code. Keep an offline copy of untagged pages.
  if (req.mode === 'navigate' || ['/scripts/analytics.js', '/scripts/attribution.js', '/scripts/lead-form.js'].includes(url.pathname)) {
    event.respondWith(fetchAndCache().catch(async () => {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return (await caches.match('/')) || Response.error();
      }
      return Response.error();
    }));
    return;
  }

  const refresh = fetchAndCache();
  event.waitUntil(refresh.catch(() => {}));
  event.respondWith(caches.match(req).then(cached => cached || refresh));
});
