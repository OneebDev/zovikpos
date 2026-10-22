// Simple Service Worker for PWA installation support
const CACHE_NAME = 'zovikpos-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // API calls and other cross-origin requests should keep the browser's normal
  // network error behavior. In particular, do not turn a failed backend fetch
  // into an undefined service-worker response.
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(async () => {
      let cachedResponse = null;
      try {
        cachedResponse = await caches.match(request);
      } catch {
        // Cache lookup is optional; always return a valid Response below.
      }
      return cachedResponse || Response.error();
    })
  );
});
