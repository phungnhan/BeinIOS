// BeinIOS — service worker của webapp (khác luồng nền pwa-worker.js).
// - Tệp của ứng dụng: lấy bản mới trên mạng trước (cập nhật tới ngay khi mở lại), mất mạng thì dùng bản đã lưu.
// - Không đụng tới yêu cầu gửi Beincom / proxy (luôn đi thẳng ra mạng, không lưu).
// - Bấm thông báo hệ thống: mở / đưa ứng dụng lên trước và báo cho trang biết thông báo nào được bấm.
const CACHE = 'beinios-app';
const SHELL = ['./', './index.html', './chat.html', './dashboard.html', './pwa-shim.js', './pwa-worker.js', './pwa-ui.js', './pwa-ui.css', './manifest.webmanifest', './manifest.json', './icons/icon128.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Bản cũ (beinios-pwa-v1.0, lưu theo kiểu "có rồi thì không tải lại") gây kẹt phiên bản: xoá
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('beinios-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Beincom, proxy, font Google…: đi thẳng
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
        if (hit) return hit;
        throw e;
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data?.id || event.notification.tag || '';
  event.waitUntil(
    (async () => {
      const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter((w) => w.frameType !== 'nested');
      const shell = wins.find((w) => /\/(index\.html)?$/.test(new URL(w.url).pathname)) || wins[0];
      if (shell) {
        await shell.focus().catch(() => {});
        shell.postMessage({ type: 'bein-notification-click', id });
        return;
      }
      await self.clients.openWindow(new URL('./index.html#notif=' + encodeURIComponent(id), self.registration.scope).href);
    })(),
  );
});
