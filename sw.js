// sw.js - Service Worker Resiliente com Cache Offline Stale-While-Revalidate
const CACHE_NAME = 'anna-pwa-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/agendar.html',
  '/links.html',
  '/links/index.html',
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
  // Não intercepta chamadas de API internas ou scripts de terceiros
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });

      return cached || fetchPromise;
    })
  );
});
