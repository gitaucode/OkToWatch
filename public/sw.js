/**
 * OkToWatch Service Worker
 * - Network-first for all HTML/JS (always fresh)
 * - Cache-first for TMDB images only (they never change)
 */

const CACHE_NAME = 'oktowatch-v3';
const TMDB_CACHE = 'oktowatch-tmdb-v2';

// ── Install: skip waiting immediately ───────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── Activate: delete ALL old caches, claim clients ──────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Never intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // TMDB images: cache-first (safe — images are immutable)
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.open(TMDB_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => new Response('', { status: 404 }))
    );
    return;
  }

  // Everything else (HTML, JS, fonts): network-first, no caching
  // Falls back to cache only when truly offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});
