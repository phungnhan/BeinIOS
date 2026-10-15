// pwa-shim.js - Giả lập Chrome Extension API & Bộ định tuyến Cloudflare Proxy cho BeinIOS PWA
(() => {
  if (window.__BEIN_PWA_SHIM_LOADED__) return;
  window.__BEIN_PWA_SHIM_LOADED__ = true;

  console.log('🚀 Khởi tạo BeinIOS PWA Shim Layer...');

  const STORAGE_PREFIX = 'beinios_';
  const listeners = new Set();

  // 1. Giả lập chrome.storage (bọc trên localStorage với Promise / Callback)
  const storageArea = {
    get(keys, callback) {
      return new Promise((resolve) => {
        const result = {};
        if (typeof keys === 'string') {
          keys = [keys];
        }
        if (Array.isArray(keys)) {
          for (const k of keys) {
            const raw = localStorage.getItem(STORAGE_PREFIX + k);
            if (raw !== null) {
              try { result[k] = JSON.parse(raw); } catch { result[k] = raw; }
            }
          }
        } else if (typeof keys === 'object' && keys !== null) {
          for (const k of Object.keys(keys)) {
            const raw = localStorage.getItem(STORAGE_PREFIX + k);
            if (raw !== null) {
              try { result[k] = JSON.parse(raw); } catch { result[k] = raw; }
            } else {
              result[k] = keys[k];
            }
          }
        } else {
          // Lấy tất cả
          for (let i = 0; i < localStorage.length; i++) {
            const fullKey = localStorage.key(i);
            if (fullKey && fullKey.startsWith(STORAGE_PREFIX)) {
              const k = fullKey.slice(STORAGE_PREFIX.length);
              const raw = localStorage.getItem(fullKey);
              try { result[k] = JSON.parse(raw); } catch { result[k] = raw; }
            }
          }
        }
        if (typeof callback === 'function') callback(result);
        resolve(result);
      });
    },
    set(items, callback) {
      return new Promise((resolve) => {
        for (const [k, v] of Object.entries(items)) {
          localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v));
        }
        if (typeof callback === 'function') callback();
        resolve();
      });
    },
    remove(keys, callback) {
      return new Promise((resolve) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) {
          localStorage.removeItem(STORAGE_PREFIX + k);
        }
        if (typeof callback === 'function') callback();
        resolve();
      });
    },
    clear(callback) {
      return new Promise((resolve) => {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
        if (typeof callback === 'function') callback();
        resolve();
      });
    }
  };

  // 2. Giả lập chrome.runtime
  const runtime = {
    id: 'beinios-pwa',
    getURL(path) {
      if (path.startsWith('http://') || path.startsWith('https://')) return path;
      return new URL(path, window.location.href).href;
    },
    onMessage: {
      addListener(fn) {
        listeners.add(fn);
      },
      removeListener(fn) {
        listeners.delete(fn);
      }
    },
    sendMessage(message, callback) {
      return new Promise((resolve) => {
        let responded = false;
        const sendResponse = (resp) => {
          if (responded) return;
          responded = true;
          if (typeof callback === 'function') callback(resp);
          resolve(resp);
        };

        let asyncResponse = false;
        for (const listener of listeners) {
          try {
            const ret = listener(message, { id: runtime.id }, sendResponse);
            if (ret === true) asyncResponse = true;
          } catch (err) {
            console.error('Lỗi listener message trong PWA:', err);
          }
        }

        if (!asyncResponse && !responded) {
          sendResponse({ ok: true, note: 'pwa-handled-sync' });
        }
      });
    }
  };

  // 3. Giả lập chrome.action & chrome.notifications
  const action = {
    setBadgeText(details) {
      if (window.parent && window.parent.BeinIOS && window.parent.BeinIOS.setBadge) {
        window.parent.BeinIOS.setBadge(details?.text);
      }
    },
    setBadgeBackgroundColor() {}
  };

  const notifications = {
    create(id, options, callback) {
      console.log('🔔 [PWA Notification]', options?.title, options?.message);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(options?.title || 'BeinIOS', {
            body: options?.message,
            icon: options?.iconUrl || 'icons/icon128.png'
          });
        } catch {
          // ignore
        }
      }
      if (typeof callback === 'function') callback(id || 'note_' + Date.now());
    }
  };

  window.chrome = window.chrome || {};
  window.chrome.storage = {
    local: storageArea,
    sync: storageArea
  };
  window.chrome.runtime = runtime;
  window.chrome.action = action;
  window.chrome.notifications = notifications;

  // 4. BỘ ĐỊNH TUYẾN FETCH QUA CLOUDFLARE PROXY ĐỂ CHỐNG CHẶN CORS
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init = {}) {
    let url = typeof resource === 'string' ? resource : resource?.url || '';

    // Kiểm tra nếu request gọi tới hệ thống máy chủ Beincom
    const isBeincom = url.includes('beincom.com');
    if (isBeincom) {
      init.headers = init.headers || {};
      const headers = new Headers(init.headers);

      // Thêm header định danh ứng dụng của Beincom
      if (!headers.has('x-application')) headers.set('x-application', 'BIC_GROUP');
      if (!headers.has('x-platform')) headers.set('x-platform', 'WEB');

      // Đọc cấu hình proxy và auth token từ storage
      let proxyUrl = localStorage.getItem(STORAGE_PREFIX + 'proxy_url') || '';
      let authToken = localStorage.getItem(STORAGE_PREFIX + 'auth_token') || '';

      // Tự động bỏ dấu gạch chéo cuối của proxy url
      if (proxyUrl.endsWith('/')) {
        proxyUrl = proxyUrl.slice(0, -1);
      }

      // Đính kèm token xác thực
      if (authToken) {
        if (authToken.startsWith('Bearer ') || authToken.length > 50) {
          if (!headers.has('Authorization')) {
            headers.set('Authorization', authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`);
          }
        } else if (authToken.includes('=')) {
          // Token dạng cookie
          if (!headers.has('x-bein-cookie')) {
            headers.set('x-bein-cookie', authToken);
          }
        }
      }

      init.headers = headers;

      // Nếu có Cloudflare Proxy URL, chuyển hướng request qua Proxy
      if (proxyUrl) {
        const targetUrl = url;
        const proxiedUrl = `${proxyUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
        return originalFetch.call(this, proxiedUrl, init);
      }
    }

    return originalFetch.call(this, resource, init);
  };

  // 5. Đối tượng tiện ích hỗ trợ giao diện PWA
  window.BeinIOS = {
    version: '0.50.0-pwa',
    getConfig() {
      return {
        proxyUrl: localStorage.getItem(STORAGE_PREFIX + 'proxy_url') || '',
        authToken: localStorage.getItem(STORAGE_PREFIX + 'auth_token') || ''
      };
    },
    setConfig({ proxyUrl, authToken }) {
      if (proxyUrl !== undefined) localStorage.setItem(STORAGE_PREFIX + 'proxy_url', proxyUrl.trim());
      if (authToken !== undefined) localStorage.setItem(STORAGE_PREFIX + 'auth_token', authToken.trim());
    },
    async testConnection() {
      const config = this.getConfig();
      if (!config.proxyUrl) {
        return { ok: false, message: 'Chưa cấu hình Cloudflare Proxy URL!' };
      }
      try {
        const start = Date.now();
        const res = await fetch('https://api.beincom.com/group/me/permissions');
        const latency = Date.now() - start;
        return {
          ok: res.ok || res.status === 401,
          status: res.status,
          latency,
          message: res.ok
            ? `Kết nối thành công qua Cloudflare Proxy (${latency}ms)!`
            : res.status === 401
              ? `Proxy hoạt động tốt (${latency}ms)! Cần đăng nhập/cập nhật Token.`
              : `Proxy kết nối được (${latency}ms) nhưng API trả về lỗi ${res.status}. Kiểm tra lại Token.`
        };
      } catch (err) {
        return { ok: false, message: `Lỗi kết nối: ${err.message}` };
      }
    }
  };

  console.log('✅ Đã nạp thành công BeinIOS PWA Shim & Fetch Interceptor.');
})();
