// sw.js - Service Worker cho BeinIOS PWA
const CACHE_NAME = 'beinios-pwa-v1.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './chat.html',
  './dashboard.html',
  './pwa-shim.js',
  './manifest.webmanifest',
  './icons/icon16.png',
  './icons/icon48.png',
  './icons/icon128.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 [BeinIOS PWA] Đang lưu trữ bộ nhớ đệm App Shell...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Lỗi cache một số asset ban đầu:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 [BeinIOS PWA] Xóa bộ nhớ đệm cũ:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Không can thiệp các request không phải GET hoặc request API
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('beincom.com') || url.hostname.includes('workers.dev')) {
    return; // Đi thẳng ra mạng (Network Only)
  }

  // 2. Với tài nguyên giao diện tĩnh (HTML/CSS/JS/Font/Icon): Cache-First, fallback to Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
