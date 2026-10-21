// Simple Service Worker for PWA installation support
const CACHE_NAME = 'zovikpos-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let browser handle network requests normally
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
