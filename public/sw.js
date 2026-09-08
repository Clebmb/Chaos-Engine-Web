/**
 * Chaos Engine service worker — the tool you own.
 *
 * Local-first, offline-first: the grimoire already lives in localStorage,
 * so the shell just needs to keep working with no network at all.
 *
 * Strategy:
 *  - Navigations: network-first (so deploys land), falling back to the
 *    cached shell when offline.
 *  - Same-origin GETs (hashed bundles, fonts, audio, icons): cache-first
 *    with a background refresh — the first visit stocks the shrine.
 *  - Cross-origin (drand beacon): untouched — randomness must be live,
 *    and entropy.ts already falls back to CSPRNG when it can't reach out.
 */

const CACHE = 'chaos-engine-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/assets/logo.webp', '/assets/chaosengine.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // beacon, CDN, etc.

  // Navigations: network first, cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
