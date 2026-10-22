// BeinIOS — chạy addon BeinFusion như một webapp (PWA).
//
// Tệp này nạp ở mọi trang (index.html, chat.html, dashboard.html) và trong luồng nền pwa-worker.js:
//   1. Kho lưu trữ chung (IndexedDB) thay chrome.storage: mọi trang và luồng nền đọc / ghi cùng một chỗ,
//      báo thay đổi cho nhau qua BroadcastChannel (chrome.storage.onChanged).
//   2. Gọi Beincom qua Cloudflare proxy của bạn (trình duyệt chặn gọi thẳng vì CORS): kèm khoá proxy và cookie
//      đăng nhập đã dán ở Cài đặt; cookie Beincom gửi lại (Set-Cookie) được cập nhật vào kho; hết phiên (401) thì
//      tự làm mới phiên một lần rồi gọi lại.
//   3. Ở trang: chrome.runtime.sendMessage gửi tới luồng nền (SharedWorker pwa-worker.js — nơi chạy background.js
//      của addon), chrome.storage, chrome.permissions…; link mở Chat / Dashboard ở lại trong khung ứng dụng.
// Chạy như addon (chrome-extension://) hoặc trang xem thử (file://) thì chỉ khai báo, không đổi gì.
(function (G) {
  'use strict';
  if (G.BeinPWA) return;
  const PWA = (G.BeinPWA = {});
  const VERSION = '1.6.0';
  PWA.VERSION = VERSION;

  // ---------- 1. Kho lưu trữ ----------
  // Mỗi mục lưu dạng chuỗi JSON (như chrome.storage) dưới khoá "<vùng>:<tên>". Vùng: local, sync (của addon),
  // pwa (cấu hình webapp: proxy, cookie — không nằm trong chrome.storage nên không lọt vào bản sao lưu).
  const AREAS = ['local', 'sync', 'pwa'];
  const DB_NAME = 'beinios';
  const DB_STORE = 'kv';

  function idbBackend(idb = G.indexedDB) {
    let dbp = null;
    const open = () =>
      (dbp ||= new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            dbp = null;
          };
          resolve(db);
        };
        req.onerror = () => {
          dbp = null;
          reject(req.error);
        };
      }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode);
        const out = fn(tx.objectStore(DB_STORE));
        tx.oncomplete = () => resolve(out);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB lỗi'));
      });
    };
    return {
      // khoá đầy đủ -> chuỗi JSON (khoá chưa có: không trả)
      getMany: (keys) =>
        run('readonly', (s) => {
          const out = new Map();
          for (const k of keys) s.get(k).onsuccess = (e) => e.target.result !== undefined && out.set(k, e.target.result);
          return out;
        }),
      getPrefix: (prefix) =>
        run('readonly', (s) => {
          const out = new Map();
          const range = IDBKeyRange.bound(prefix, prefix + '￿');
          s.openCursor(range).onsuccess = (e) => {
            const c = e.target.result;
            if (!c) return;
            out.set(c.key, c.value);
            c.continue();
          };
          return out;
        }),
      // puts: khoá -> chuỗi JSON | null (xoá). Đọc giá trị cũ và ghi trong cùng một giao dịch; trả về giá trị cũ
      write: (puts) =>
        run('readwrite', (s) => {
          const old = new Map();
          for (const [k, v] of puts) {
            s.get(k).onsuccess = (e) => {
              if (e.target.result !== undefined) old.set(k, e.target.result);
              if (v === null) s.delete(k);
              else s.put(v, k);
            };
          }
          return old;
        }),
    };
  }

  // Bộ nhớ tạm thay IndexedDB (kiểm thử bằng Node, hoặc trình duyệt chặn IndexedDB)
  function memBackend(map = new Map()) {
    return {
      map,
      getMany: async (keys) => new Map(keys.filter((k) => map.has(k)).map((k) => [k, map.get(k)])),
      getPrefix: async (prefix) => new Map([...map].filter(([k]) => k.startsWith(prefix))),
      write: async (puts) => {
        const old = new Map();
        for (const [k, v] of puts) {
          if (map.has(k)) old.set(k, map.get(k));
          if (v === null) map.delete(k);
          else map.set(k, v);
        }
        return old;
      },
    };
  }

  // Giá trị cũ / mới trong sự kiện thay đổi: chỉ đọc JSON khi có nơi dùng tới (state, nhật ký có thể vài MB)
  function lazyJson(obj, prop, str) {
    let done = false;
    let val;
    Object.defineProperty(obj, prop, {
      enumerable: true,
      configurable: true,
      get() {
        if (!done) {
          val = JSON.parse(str);
          done = true;
        }
        return val;
      },
    });
  }
  function makeChanges(raw) {
    const out = {};
    for (const [k, { o, n }] of Object.entries(raw)) {
      const c = {};
      if (o !== undefined) lazyJson(c, 'oldValue', o);
      if (n !== undefined) lazyJson(c, 'newValue', n);
      out[k] = c;
    }
    return out;
  }

  // channel: BroadcastChannel (hoặc đối tượng giả có postMessage / onmessage) để báo các trang khác
  function createStore({ backend, channel = null } = {}) {
    const listeners = new Set();
    const emit = (area, raw) => {
      if (!Object.keys(raw).length) return;
      const changes = makeChanges(raw);
      for (const fn of [...listeners]) {
        try {
          fn(changes, area);
        } catch (e) {
          console.error(e);
        }
      }
    };
    if (channel) channel.onmessage = (e) => e.data?.bein === 'storage' && emit(e.data.area, e.data.raw);

    const full = (area, k) => area + ':' + k;
    const parse = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        return undefined;
      }
    };

    async function get(area, keys) {
      const out = {};
      if (keys === null || keys === undefined) {
        const all = await backend.getPrefix(area + ':');
        for (const [k, v] of all) out[k.slice(area.length + 1)] = parse(v);
        return out;
      }
      const defaults = typeof keys === 'object' && !Array.isArray(keys) ? keys : null;
      const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const got = await backend.getMany(names.map((k) => full(area, k)));
      for (const k of names) {
        const v = got.get(full(area, k));
        if (v !== undefined) out[k] = parse(v);
        else if (defaults && defaults[k] !== undefined) out[k] = defaults[k];
      }
      return out;
    }

    async function write(area, puts) {
      if (!puts.size) return;
      const old = await backend.write(puts);
      const raw = {};
      for (const [k, v] of puts) {
        const o = old.get(k);
        const n = v === null ? undefined : v;
        if (o === n) continue; // như Chrome: không đổi thì không báo
        raw[k.slice(area.length + 1)] = { o, n };
      }
      if (!Object.keys(raw).length) return;
      try {
        channel?.postMessage({ bein: 'storage', area, raw });
      } catch {}
      setTimeout(() => emit(area, raw), 0);
    }

    async function set(area, items) {
      const puts = new Map();
      for (const [k, v] of Object.entries(items || {})) {
        if (v === undefined) continue;
        const s = JSON.stringify(v);
        if (s !== undefined) puts.set(full(area, k), s);
      }
      await write(area, puts);
    }

    async function remove(area, keys) {
      const list = typeof keys === 'string' ? [keys] : keys || [];
      await write(area, new Map(list.map((k) => [full(area, k), null])));
    }

    async function clear(area) {
      const all = await backend.getPrefix(area + ':');
      await write(area, new Map([...all.keys()].map((k) => [k, null])));
    }

    // Như Chrome: độ dài tên khoá + độ dài JSON
    async function bytesInUse(area, keys) {
      let map;
      if (keys === null || keys === undefined) map = await backend.getPrefix(area + ':');
      else map = await backend.getMany((typeof keys === 'string' ? [keys] : keys).map((k) => full(area, k)));
      let n = 0;
      for (const [k, v] of map) n += k.length - area.length - 1 + v.length;
      return n;
    }

    // Có callback thì gọi callback (kiểu cũ của chrome.*), luôn trả Promise
    const cbify = (p, cb) => {
      if (typeof cb === 'function') p.then((v) => cb(v), () => cb(undefined));
      return p;
    };
    function area(name) {
      return {
        get: (keys, cb) => cbify(get(name, typeof keys === 'function' ? null : keys), typeof keys === 'function' ? keys : cb),
        set: (items, cb) => cbify(set(name, items), cb),
        remove: (keys, cb) => cbify(remove(name, keys), cb),
        clear: (cb) => cbify(clear(name), cb),
        getBytesInUse: (keys, cb) => cbify(bytesInUse(name, typeof keys === 'function' ? null : keys), typeof keys === 'function' ? keys : cb),
        QUOTA_BYTES: name === 'sync' ? 102400 : 10485760,
        ...(name === 'sync' ? { QUOTA_BYTES_PER_ITEM: 8192, MAX_ITEMS: 512 } : {}),
      };
    }

    const onChanged = {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      hasListener: (fn) => listeners.has(fn),
    };
    // chrome.storage cho addon: chỉ hai vùng local / sync; trình nghe chrome.storage.onChanged không thấy vùng pwa
    function chromeStorage() {
      const wrap = new Map();
      return {
        local: area('local'),
        sync: area('sync'),
        onChanged: {
          addListener(fn) {
            const w = (changes, a) => a !== 'pwa' && fn(changes, a);
            wrap.set(fn, w);
            listeners.add(w);
          },
          removeListener(fn) {
            listeners.delete(wrap.get(fn));
            wrap.delete(fn);
          },
          hasListener: (fn) => wrap.has(fn),
        },
      };
    }
    return { area, onChanged, chromeStorage, get, set, remove };
  }

  // ---------- 2. Gọi Beincom qua proxy ----------
  // Máy chủ Beincom đi qua proxy (khớp danh sách của cloudflare-proxy/worker.js); ảnh trên media.beincom.com… tải thẳng
  const PROXY_HOSTS = new Set(['api.beincom.com', 'group.beincom.com', 'chat.beincom.com', 'upload.beincom.com', 'auth.beincom.com']);
  const CHAT_HOST = 'chat.beincom.com';
  const AUTH_REFRESH = 'https://auth.beincom.com/v1/auth/public/http/refresh-session';
  const DEVICE_COOKIE = 'Bic.Auth.deviceId';

  const isBeincom = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && PROXY_HOSTS.has(u.hostname) && !u.port;
    } catch {
      return false;
    }
  };
  // Ba ô cookie như trình duyệt gửi tới từng máy chủ: api (api / group / upload .beincom.com), chat (chat.beincom.com),
  // auth (auth.beincom.com — máy chủ đăng nhập, dùng khi làm mới phiên). Ô chat / auth trống thì dùng ô api
  // (dán cURL chỉ có ô api; "Dán từ addon" có đủ ba ô).
  const AUTH_HOST = 'auth.beincom.com';
  const JAR_NAMES = ['api', 'chat', 'auth'];
  const jarOf = (host) => (host === CHAT_HOST ? 'chat' : host === AUTH_HOST ? 'auth' : 'api');
  const hasJar = (jars, j) => Object.keys(jars?.[j] || {}).length > 0;
  const jarFor = (jars, host) => {
    const j = jarOf(host);
    return j !== 'api' && hasJar(jars, j) ? j : 'api';
  };
  // Phiên Beincom (group) hay phiên Chat: mỗi phiên làm mới riêng, báo hết hạn riêng
  const sessionOf = (host) => (host === CHAT_HOST ? 'chat' : 'api');

  // Dán Cookie từ DevTools: chấp nhận "Cookie: a=b; c=d", "a=b; c=d", hoặc nguyên lệnh cURL (Copy as cURL)
  function parseCookieInput(text) {
    let s = String(text || '').trim();
    if (!s) return { jar: {}, host: '' };
    let host = '';
    const urlM = s.match(/curl\s+(?:\^?["'])?(https?:\/\/[^\s"'^]+)/i);
    if (urlM) {
      try {
        host = new URL(urlM[1]).hostname;
      } catch {}
    }
    const fromCurl = s.match(/(?:-b|--cookie)\s+\^?(["'])([\s\S]*?)\^?\1/) || s.match(/-H\s+\^?(["'])cookie:\s*([\s\S]*?)\^?\1/i);
    if (fromCurl) s = fromCurl[2];
    s = s.replace(/^cookie:\s*/i, '').replace(/\^(.)/g, '$1'); // cURL của Windows (cmd) thêm ^ trước ký tự đặc biệt
    const jar = {};
    for (const part of s.split(/;\s*|\r?\n/)) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (name && !/\s/.test(name)) jar[name] = value;
    }
    return { jar, host };
  }
  // Đoạn "Dán từ addon" (addon BeinFusion → Cài đặt → Chuyển đăng nhập sang BeinIOS, lib/transfer.js cùng định dạng):
  // "BEINIOS1." + base64url(JSON { v: 1, t, c: [[tên, giá trị, ô]] }), ô: 1 = api, 2 = chat, 4 = auth. Nhận cả link nhap.html#…
  const TRANSFER_PREFIX = 'BEINIOS1.';
  function parseTransfer(text) {
    const s = String(text || '').trim();
    const i = s.indexOf(TRANSFER_PREFIX);
    if (i < 0) return null;
    try {
      // Chuyển đoạn sang iPhone (Ghi chú / tin nhắn / email) hay chèn xuống dòng vào giữa, hoặc đổi gạch nối thành gạch dài:
      // bỏ mọi khoảng trắng, đưa gạch lạ về '-', rồi lấy phần base64url liền mạch (dừng ở ký tự đầu không hợp lệ)
      const b64 = (s.slice(i + TRANSFER_PREFIX.length).match(/^[\sA-Za-z0-9\-_‐-―−]+/)?.[0] || '').replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
      const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
      const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
      if (d?.v !== 1 || !Array.isArray(d.c)) return null;
      const out = { at: Number(d.t) || 0, api: {}, chat: {}, auth: {} };
      for (const [name, value, mask] of d.c) JAR_NAMES.forEach((j, k) => mask & (1 << k) && (out[j][String(name)] = String(value)));
      return Object.keys(out.api).length || Object.keys(out.chat).length ? out : null;
    } catch {
      return null;
    }
  }

  // Chuyển nhanh qua proxy (addon → Cài đặt → Chuyển đăng nhập sang BeinIOS, mã QR ngắn): link nhap.html#h=<mã số>.<khoá>&p=<proxy>.
  // Lấy bản mã hoá trên proxy theo mã số (proxy không có khoá), giải mã AES-GCM ngay trên máy -> đoạn BEINIOS1.…
  function parseHandoff(text) {
    const s = String(text || '').trim();
    const frag = s.includes('#') ? s.slice(s.indexOf('#') + 1) : s;
    if (!/(^|&)h=/.test(frag)) return null;
    const q = new URLSearchParams(frag);
    const [id = '', key = ''] = String(q.get('h') || '').split('.');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(key)) return null;
    let proxy = '';
    try {
      const u = new URL(q.get('p') || '');
      if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) proxy = u.origin;
    } catch {}
    return { id, key, proxy };
  }
  const b64uBytes = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4)), (ch) => ch.charCodeAt(0));
  async function unsealHandoff(payload, key) {
    const [iv, data] = String(payload || '').split('.');
    const k = await G.crypto.subtle.importKey('raw', b64uBytes(key), 'AES-GCM', false, ['decrypt']);
    return new TextDecoder().decode(await G.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uBytes(iv) }, k, b64uBytes(data)));
  }
  // -> đoạn BEINIOS1.… ; lỗi thì ném Error có .code: gone (đã dùng / hết 5 phút), no_proxy, http, decrypt
  async function openHandoff({ id, key, proxy }, fetchFn = (u, o) => G.fetch(u, o)) {
    const err = (code, message) => Object.assign(new Error(message), { code });
    if (!proxy) throw err('no_proxy', 'Mã không có địa chỉ proxy.');
    let res;
    try {
      res = await fetchFn(proxy + '/handoff?id=' + encodeURIComponent(id), { cache: 'no-store', credentials: 'omit' });
    } catch {
      throw err('network', 'Không gọi được proxy.');
    }
    const j = await res.json().catch(() => null);
    if (!res.ok) throw err(j?.code || 'http', j?.error || 'Proxy trả lỗi ' + res.status + '.');
    try {
      return await unsealHandoff(j?.payload, key);
    } catch {
      throw err('decrypt', 'Không giải mã được — tạo mã mới ở addon.');
    }
  }

  const cookieString = (jar) =>
    Object.entries(jar || {})
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

  // Một dòng Set-Cookie -> { name, value, domain, remove }
  function parseSetCookie(line, now = Date.now()) {
    const parts = String(line).split(';');
    const first = parts.shift() || '';
    const i = first.indexOf('=');
    if (i <= 0) return null;
    const out = { name: first.slice(0, i).trim(), value: first.slice(i + 1).trim(), domain: '', remove: false };
    for (const p of parts) {
      const j = p.indexOf('=');
      const key = (j < 0 ? p : p.slice(0, j)).trim().toLowerCase();
      const val = j < 0 ? '' : p.slice(j + 1).trim();
      if (key === 'domain') out.domain = val.replace(/^\./, '').toLowerCase();
      if (key === 'max-age' && Number(val) <= 0) out.remove = true;
      if (key === 'expires') {
        const t = Date.parse(val);
        if (t && t <= now) out.remove = true;
      }
    }
    if (out.value === '' || out.value === '""') out.remove = true;
    return out;
  }

  // Cập nhật các ô cookie theo Set-Cookie của một máy chủ (trả về ô mới, không sửa ô cũ)
  function applySetCookies(jars, host, lines, now = Date.now()) {
    const next = Object.fromEntries(JAR_NAMES.map((j) => [j, { ...(jars?.[j] || {}) }]));
    let changed = false;
    for (const line of lines || []) {
      const c = parseSetCookie(line, now);
      if (!c) continue;
      const shared = c.domain === 'beincom.com';
      // Cookie chung .beincom.com: trình duyệt gửi cho mọi máy chủ Beincom -> cập nhật ô Beincom và các ô đang dùng;
      // cookie riêng một máy chủ -> ô dùng cho máy chủ đó
      const targets = shared ? JAR_NAMES.filter((j) => j === 'api' || hasJar(jars, j)) : [jarFor(jars, host)];
      for (const t of targets) {
        if (c.remove) {
          if (c.name in next[t]) {
            delete next[t][c.name];
            changed = true;
          }
        } else if (next[t][c.name] !== c.value) {
          next[t][c.name] = c.value;
          changed = true;
        }
      }
    }
    return changed ? next : null;
  }

  const newDeviceId = () => {
    try {
      return G.crypto.randomUUID();
    } catch {
      return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
    }
  };

  // store: kho (createStore); rawFetch: fetch gốc của trình duyệt
  function createNet({ store, rawFetch }) {
    let cfg = null; // { proxyUrl, proxyKey, jars: { api, chat }, deviceId, refresh, savedAt, status }
    let cfgP = null;
    const load = () =>
      (cfgP ||= store
        .get('pwa', ['config'])
        .then(({ config }) => (cfg = normConfig(config)))
        .catch((e) => {
          cfgP = null;
          throw e;
        }));
    store.onChanged.addListener((changes, area) => {
      if (area === 'pwa' && changes.config) cfg = normConfig(changes.config.newValue);
    });

    async function saveConfig(patch) {
      await load();
      cfg = normConfig({ ...cfg, ...patch });
      await store.set('pwa', { config: cfg });
      return cfg;
    }

    const proxyBase = () => {
      const raw = String(cfg?.proxyUrl || '').trim();
      try {
        return raw ? new URL(raw).origin : '';
      } catch {
        return raw.replace(/\/+$/, '');
      }
    };
    const configured = () => !!(proxyBase() && cfg?.proxyKey);
    const proxied = (url) => `${proxyBase()}/proxy?url=${encodeURIComponent(url)}`;

    // Lỗi do proxy (sai khoá, sai địa chỉ…) ghi vào cấu hình để Cài đặt báo
    async function noteStatus(status) {
      if (cfg && JSON.stringify(cfg.status || null) !== JSON.stringify(status)) await saveConfig({ status }).catch(() => {});
    }

    async function absorbCookies(host, res) {
      const raw = res.headers.get('x-bein-set-cookie');
      if (!raw) return;
      let lines;
      try {
        lines = JSON.parse(raw);
      } catch {
        return;
      }
      const next = applySetCookies(cfg.jars, host, Array.isArray(lines) ? lines : []);
      if (next) await saveConfig({ jars: next });
    }

    // Gửi một yêu cầu tới Beincom qua proxy (url gốc của Beincom)
    async function viaProxy(url, init = {}) {
      const host = new URL(url).hostname;
      const headers = new Headers(init.headers || {});
      const jar = cfg.jars[jarFor(cfg.jars, host)];
      headers.set('x-beinios-key', cfg.proxyKey);
      const cookie = cookieString(jar);
      if (cookie) headers.set('x-bein-cookie', cookie);
      const res = await rawFetch(proxied(url), { method: init.method || 'GET', headers, body: init.body, signal: init.signal, credentials: 'omit', mode: 'cors', cache: 'no-store' });
      const perr = res.headers.get('x-bein-proxy-error');
      if (perr) await noteStatus({ ok: false, code: perr, at: Date.now() });
      await absorbCookies(host, res);
      return res;
    }

    // Làm mới phiên (như web Beincom khi gặp 401): mỗi phiên chỉ một lần cùng lúc. Cookie gửi máy chủ đăng nhập: ô auth
    // (có khi dán từ addon), không có thì ô của phiên
    const refreshing = new Map();
    function refreshSession(jarName) {
      if (refreshing.has(jarName)) return refreshing.get(jarName);
      const p = (async () => {
        const via = hasJar(cfg.jars, 'auth') ? AUTH_HOST : jarName === 'chat' ? CHAT_HOST : 'api.beincom.com';
        const jar = cfg.jars[jarFor(cfg.jars, via)];
        if (!Object.keys(jar).length) return false;
        let deviceId = jar[DEVICE_COOKIE] ? decodeURIComponent(jar[DEVICE_COOKIE]) : cfg.deviceId;
        if (!deviceId) deviceId = (await saveConfig({ deviceId: newDeviceId() })).deviceId;
        const application = jarName === 'chat' ? 'BIC_CHAT' : 'BIC_GROUP';
        const headers = { 'x-beinios-key': cfg.proxyKey, 'x-bein-cookie': cookieString(jar), 'Content-Type': 'application/json', Accept: 'application/json', 'x-application': application, 'x-platform': 'WEB' };
        const body = JSON.stringify({ deviceId, deviceName: 'BeinIOS', application, platform: 'WEB' });
        try {
          const res = await rawFetch(proxied(AUTH_REFRESH), { method: 'POST', headers, body, credentials: 'omit', mode: 'cors', cache: 'no-store' });
          const raw = res.headers.get('x-bein-set-cookie');
          let lines = [];
          try {
            lines = JSON.parse(raw || '[]');
          } catch {}
          // Cookie mới của phiên: chung .beincom.com -> mọi ô đang dùng; riêng máy chủ đăng nhập -> ô vừa gửi đi
          const next = applySetCookies(cfg.jars, via, lines);
          if (next) await saveConfig({ jars: next });
          return res.ok;
        } catch {
          return false;
        }
      })().finally(() => setTimeout(() => refreshing.delete(jarName), 0));
      refreshing.set(jarName, p);
      return p;
    }

    // fetch thay thế: Beincom -> proxy (401 -> làm mới phiên rồi gọi lại một lần); địa chỉ khác -> fetch gốc
    async function pwaFetch(resource, init) {
      const isReq = typeof Request !== 'undefined' && resource instanceof Request;
      const url = isReq ? resource.url : String(resource);
      if (!isBeincom(url)) return rawFetch(resource, init);
      await load();
      if (!configured()) throw new TypeError('BeinIOS: chưa cài proxy (Cài đặt → Proxy & đăng nhập)');
      const opts = isReq ? { method: resource.method, headers: resource.headers, body: init?.body, signal: resource.signal, ...init } : { ...(init || {}) };
      const host = new URL(url).hostname;
      let res = await viaProxy(url, opts);
      if (res.status === 401 && cfg.refresh !== false && !res.headers.get('x-bein-proxy-error') && host !== 'auth.beincom.com') {
        const ok = await refreshSession(sessionOf(host));
        if (ok) res = await viaProxy(url, opts);
        if (res.status === 401) await noteStatus({ ok: false, code: 'session', host: sessionOf(host), at: Date.now() });
      } else if (res.ok && cfg.status && !cfg.status.ok && (cfg.status.code !== 'session' || cfg.status.host === sessionOf(host))) await noteStatus({ ok: true, at: Date.now() });
      return res;
    }

    return {
      load,
      saveConfig,
      configured,
      fetch: pwaFetch,
      proxied,
      refreshSession,
      get config() {
        return cfg;
      },
    };
  }

  function normConfig(c) {
    const x = c && typeof c === 'object' ? c : {};
    return {
      proxyUrl: String(x.proxyUrl || ''),
      proxyKey: String(x.proxyKey || ''),
      jars: { api: { ...(x.jars?.api || {}) }, chat: { ...(x.jars?.chat || {}) }, auth: { ...(x.jars?.auth || {}) } },
      deviceId: String(x.deviceId || ''),
      refresh: x.refresh !== false,
      savedAt: Number(x.savedAt) || 0,
      status: x.status && typeof x.status === 'object' ? x.status : null,
    };
  }

  Object.assign(PWA, { idbBackend, memBackend, createStore, createNet, parseCookieInput, parseTransfer, parseHandoff, openHandoff, parseSetCookie, applySetCookies, jarFor, cookieString, isBeincom, normConfig, AUTH_REFRESH, AREAS });

  // Bản dùng chung của trang / luồng nền này (tạo khi cần)
  let shared = null;
  PWA.shared = () => {
    if (shared) return shared;
    const backend = G.indexedDB ? idbBackend() : memBackend();
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('beinios-storage') : null;
    const store = createStore({ backend, channel });
    const net = createNet({ store, rawFetch: G.fetch.bind(G) });
    return (shared = { store, net });
  };

  // Phiên bản addon (manifest.json) — đọc đồng bộ một lần như chrome.runtime.getManifest()
  let manifest = null;
  PWA.manifest = () => {
    if (manifest) return manifest;
    try {
      const x = new XMLHttpRequest();
      x.open('GET', new URL('manifest.json', PWA.base()).href, false);
      x.send();
      manifest = JSON.parse(x.responseText);
    } catch {
      manifest = { name: 'BeinFusion', version: '0.0.0', manifest_version: 3 };
    }
    return manifest;
  };
  // Thư mục gốc của webapp (nơi có pwa-shim.js), ví dụ https://phungnhan.github.io/BeinIOS/
  PWA.base = () => {
    const here = G.location?.href || 'http://localhost/';
    const script = G.document?.currentScript?.src || PWA._scriptSrc;
    return script ? new URL('./', script).href : new URL('./', here).href;
  };
  if (G.document?.currentScript?.src) PWA._scriptSrc = G.document.currentScript.src;

  // ---------- 3. Trang (index.html, chat.html, dashboard.html) ----------
  if (typeof window === 'undefined' || G !== window) return;
  if (!/^https?:$/.test(location.protocol)) return; // addon thật / trang xem thử: giữ nguyên chrome.*
  if (G.chrome?.runtime?.id && !G.chrome.runtime.__bein) return;
  if (G.__BEIN_IMPORT__) return; // trang nhận đăng nhập (nhap.html): chỉ cần kho, không chạy luồng nền

  const { store, net } = PWA.shared();
  const rawFetch = G.fetch.bind(G);
  const inShell = (() => {
    try {
      return G.top !== G && !!G.top.__BEIN_SHELL__;
    } catch {
      return false;
    }
  })();

  // Kết nối luồng nền: SharedWorker (iPhone / máy tính); không có thì Worker thường do cửa sổ ngoài cùng giữ
  function connectWorker() {
    const url = new URL('pwa-worker.js', PWA.base()).href;
    if (typeof SharedWorker === 'function') {
      try {
        const w = new SharedWorker(url, { name: 'beinios-bg' });
        w.onerror = (e) => console.error('BeinIOS: luồng nền lỗi', e?.message || e);
        return w.port;
      } catch (e) {
        console.warn('BeinIOS: không mở được SharedWorker, dùng Worker', e);
      }
    }
    let host = null;
    try {
      host = G.top.__beinHost || null;
    } catch {}
    if (!host) {
      const worker = new Worker(url, { name: 'beinios-bg' });
      host = G.__beinHost = {
        connect() {
          const ch = new MessageChannel();
          worker.postMessage({ type: 'bein-port' }, [ch.port2]);
          return ch.port1;
        },
      };
    }
    return host.connect();
  }

  let port = null;
  let seq = 0;
  const pending = new Map();
  const eventFns = new Set();
  function onPortMessage(e) {
    const m = e.data || {};
    if (m.type === 'reply' && pending.has(m.id)) {
      pending.get(m.id)(m.res);
      pending.delete(m.id);
    } else if (m.type === 'event') {
      for (const fn of eventFns) {
        try {
          fn(m.ev);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }
  const ask = (payload) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      port.postMessage({ ...payload, id });
    });
  function connect() {
    port = connectWorker();
    port.onmessage = onPortMessage;
    port.start?.();
    ask({ type: 'hello', top: !inShell });
  }
  connect();
  addEventListener('pagehide', () => {
    try {
      port.postMessage({ type: 'bye' });
    } catch {}
  });
  // iPhone có thể tắt luồng nền khi ứng dụng chạy ngầm lâu: mở lại mà luồng nền không trả lời thì nối lại (luồng nền mới
  // tự chạy lại addon); lệnh đang chờ báo lỗi để bấm lại, không tự gửi lại (tránh làm một thao tác hai lần)
  let checking = false;
  async function ensureWorker() {
    if (checking || document.visibilityState !== 'visible') return;
    checking = true;
    try {
      const alive = await Promise.race([ask({ type: 'ping' }).then(() => true), new Promise((r) => setTimeout(() => r(false), 4000))]);
      if (alive) return;
      console.warn('BeinIOS: luồng nền không trả lời — nối lại');
      for (const fn of pending.values()) fn({ status: 'error', message: 'Luồng nền vừa khởi động lại — hãy thử lại.' });
      pending.clear();
      try {
        port.close?.();
      } catch {}
      connect();
    } finally {
      checking = false;
    }
  }
  document.addEventListener('visibilitychange', ensureWorker);
  addEventListener('pageshow', (e) => e.persisted && ensureWorker());

  const msgListeners = new Set();
  const runtime = {
    __bein: true,
    id: 'beinios',
    lastError: undefined,
    getURL: (p) => new URL(String(p || ''), PWA.base()).href,
    getManifest: () => PWA.manifest(),
    sendMessage(msg, cb) {
      const p = ask({ type: 'msg', msg });
      if (typeof cb === 'function') p.then(cb);
      return p;
    },
    onMessage: { addListener: (fn) => msgListeners.add(fn), removeListener: (fn) => msgListeners.delete(fn), hasListener: (fn) => msgListeners.has(fn) },
    openOptionsPage: () => openPage(runtime.getURL('dashboard.html')),
    getPlatformInfo: async () => ({ os: /iPhone|iPad|Mac/.test(navigator.userAgent) ? 'mac' : 'win', arch: 'x86-64', nacl_arch: 'x86-64' }),
  };
  const chromeApi = {
    runtime,
    storage: store.chromeStorage(),
    permissions: { contains: async () => true, request: async () => true, getAll: async () => ({ origins: [], permissions: [] }) },
    alarms: {
      get: (name, cb) => {
        const p = ask({ type: 'alarm-get', name });
        if (typeof cb === 'function') p.then(cb);
        return p;
      },
    },
    tabs: { create: async ({ url } = {}) => (openPage(url), { id: 0, url }) },
  };
  try {
    G.chrome = Object.assign(G.chrome || {}, chromeApi);
  } catch {
    Object.defineProperty(G, 'chrome', { value: chromeApi, configurable: true, writable: true });
  }

  // fetch / XMLHttpRequest tới Beincom (ảnh đại diện, tải tệp lên) đi qua proxy
  G.fetch = (resource, init) => net.fetch(resource, init);
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const abs = new URL(String(url), location.href).href;
    this.__beinTarget = isBeincom(abs) ? abs : '';
    return xhrOpen.call(this, method, this.__beinTarget && net.configured() ? net.proxied(abs) : url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__beinTarget && net.configured()) {
      const cfg = net.config;
      const jar = cfg.jars[jarFor(cfg.jars, new URL(this.__beinTarget).hostname)];
      this.withCredentials = false;
      this.setRequestHeader('x-beinios-key', cfg.proxyKey);
      const cookie = cookieString(jar);
      if (cookie) this.setRequestHeader('x-bein-cookie', cookie);
    }
    return xhrSend.call(this, body);
  };
  net.load().catch(() => {});

  // Mở trang của webapp: trong khung ứng dụng thì nhờ index.html chuyển tab, không mở cửa sổ mới (trên iPhone cửa
  // sổ mới là Safari — không có dữ liệu của ứng dụng)
  const OWN_PAGES = /\/(chat|dashboard|popup)\.html$/;
  function ownPage(url) {
    try {
      const u = new URL(String(url), location.href);
      return u.origin === location.origin && OWN_PAGES.test(u.pathname) ? u : null;
    } catch {
      return null;
    }
  }
  // Link "đăng nhập Beincom": webapp không dùng phiên của Safari -> mở Cài đặt để dán cookie
  const loginPage = (url) => /^https:\/\/group\.beincom\.com\/?(login\/?)?(\?.*)?$/.test(String(url || ''));
  function openPage(url) {
    const shell = inShell ? G.top.BeinShell : G.BeinShell;
    if (shell && loginPage(url)) return void shell.setup();
    const u = ownPage(url);
    if (u && inShell) return void G.top.BeinShell.open(u.href);
    if (u && G.BeinShell) return void G.BeinShell.open(u.href);
    if (u) return void (location.href = u.href);
    if (url) rawOpen(url, '_blank', 'noopener');
  }
  const rawOpen = G.open.bind(G);
  if (inShell) {
    G.open = (url, target, features) => (ownPage(url) || loginPage(url) ? (openPage(url), null) : rawOpen(url, target, features));
    addEventListener(
      'click',
      (e) => {
        if (e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const a = e.target.closest?.('a[href]');
        if (!a || !(ownPage(a.href) || loginPage(a.href))) return;
        e.preventDefault();
        openPage(a.href);
      },
      false,
    );
  }

  // Câu chữ của addon nói "đăng nhập Beincom trên trình duyệt này": đổi sang cách làm của webapp (dán cookie ở Cài đặt).
  // Chỉ theo dõi đúng vài phần tử của bảng Bắt đầu (Dashboard), không đụng phần còn lại của trang.
  const WORDING = [
    ['#onb-login', /^Chưa thấy phiên đăng nhập Beincom/, 'Chưa thấy phiên đăng nhập Beincom (hoặc chưa quét lần nào). Bấm "Mở Cài đặt", dán cookie Beincom, rồi bấm Quét lại.'],
    ['#onb-open', /^Mở Beincom$/, 'Mở Cài đặt'],
    ['#onb-login', null, 'BeinIOS dùng cookie đăng nhập bạn dán ở Cài đặt — không hỏi mật khẩu.', (el) => el.previousElementSibling],
  ];
  function applyWording() {
    for (const [sel, re, text, pick] of WORDING) {
      const base = document.querySelector(sel);
      const el = base && pick ? pick(base) : base;
      if (!el) continue;
      const fix = () => {
        if (re ? re.test(el.textContent) : !el.dataset.beinWording) {
          el.dataset.beinWording = '1';
          if (el.textContent !== text) el.textContent = text;
        }
      };
      fix();
      if (re && !el.__beinObs) (el.__beinObs = new MutationObserver(fix)).observe(el, { childList: true, characterData: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyWording);
  else applyWording();

  // Báo nhỏ trên cùng màn hình (thông báo của addon khi đang mở ứng dụng): xếp thành cột, tối đa 3, cùng mã thì thay
  PWA.toast = (title, message, onClick, id = '') => {
    let wrap = document.getElementById('bein-toasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'bein-toasts';
      wrap.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:8px;width:min(92vw,440px);pointer-events:none';
      document.body.append(wrap);
    }
    if (id) for (const old of wrap.querySelectorAll('[data-id]')) if (old.dataset.id === id) old.remove();
    while (wrap.children.length >= 3) wrap.firstElementChild.remove();
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    if (id) box.dataset.id = id;
    box.style.cssText = 'pointer-events:auto;padding:10px 14px;border-radius:14px;background:rgba(20,24,38,.95);color:#fff;font:13px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:pointer';
    const b = document.createElement('b');
    b.textContent = title || 'BeinFusion';
    const t = document.createElement('div');
    t.textContent = message || '';
    box.append(b, t);
    box.onclick = () => {
      box.remove();
      onClick?.();
    };
    wrap.append(box);
    setTimeout(() => box.remove(), 8000);
  };

  // Sự kiện của luồng nền (thông báo, huy hiệu, mở trang): chỉ cửa sổ ngoài cùng xử lý (khung ứng dụng tự xử lý;
  // trang mở riêng ngoài khung thì trang tự xử lý)
  PWA.page = {
    ask,
    get port() {
      return port;
    },
    onEvent: (fn) => eventFns.add(fn),
    inShell,
    store,
    net,
    openPage,
    ensureWorker,
  };

  // Tài khoản đang đăng nhập: tài khoản Beincom lần quét lưu (state.me — tên, ảnh) và tài khoản Chat trang Chat lưu
  // (chatOverviewCache.me). Không có ảnh Beincom thì lấy ảnh Chat qua proxy (bản trang Chat đã lưu trong Cache Storage
  // thì dùng luôn). Link ảnh Chat giống lib/chat.js chatAvatarUrl.
  let meP = null;
  PWA.me = () =>
    (meP ||= (async () => {
      const { chatOverviewCache: c, state } = await store.get('local', ['chatOverviewCache', 'state']);
      const bm = state?.me;
      const cm = c?.me;
      if (!bm && !cm) return null;
      const out = { name: bm?.fullname || cm?.fullname || bm?.username || cm?.username || '', username: bm?.username || cm?.username || '', chatId: cm?.chatId || '', avatar: bm?.avatar || '' };
      const url = !out.avatar && cm?.chatId ? `https://chat.beincom.com/api/v4/users/${cm.chatId}/image${cm.pictureAt ? '?_=' + cm.pictureAt : ''}` : '';
      if (url) {
        try {
          let res = (await G.caches?.open('beingroup-img-v1').then((ch) => ch.match(url)).catch(() => null)) || null;
          if (!res) {
            res = await G.fetch(url, { credentials: 'omit' });
            if (!res.ok || !/^image\//.test(res.headers.get('content-type') || '')) res = null;
          }
          if (res) out.avatar = URL.createObjectURL(await res.blob());
        } catch {}
      }
      return out;
    })());
  store.onChanged.addListener((ch, area) => {
    if (area === 'local' && (ch.chatOverviewCache || ch.state)) meP = null;
  });
  // Ô ảnh đại diện tròn: ảnh, hoặc chữ cái đầu trên nền chuyển sắc, hoặc hình người khi chưa biết tài khoản.
  // Màu và chữ giống avatar của trang Chat (chat/core.js GRADIENTS, hash, initials) để cùng một người cùng một màu.
  const AV_GRADIENTS = [
    ['#8f63ff', '#5b2fe0'],
    ['#ff7a59', '#e0436b'],
    ['#2bb8a3', '#16807a'],
    ['#4f8cff', '#2a5bd7'],
    ['#f5a524', '#d9711c'],
    ['#e05ab8', '#9b3dd1'],
    ['#3fbf6f', '#1f8a4c'],
    ['#5c6bc0', '#3949ab'],
  ];
  const avHash = (str) => [...String(str || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const avInitials = (name) => {
    const w = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  };
  PWA.avatarEl = (me, size = 32) => {
    const box = document.createElement('span');
    box.className = 'bein-avatar';
    box.style.cssText = `display:inline-grid;place-items:center;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex:none;font:600 ${Math.round(size * 0.4)}px/1 -apple-system,system-ui,sans-serif;color:#fff;`;
    if (me?.avatar) {
      const img = document.createElement('img');
      img.src = me.avatar;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      box.append(img);
      return box;
    }
    const name = String(me?.name || '').trim();
    if (!name) {
      box.style.background = '#9aa1b5';
      box.innerHTML = '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="currentColor" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"/></svg>';
      return box;
    }
    const [a, b] = AV_GRADIENTS[avHash(me.chatId || name) % AV_GRADIENTS.length];
    box.style.background = `linear-gradient(135deg, ${a}, ${b})`;
    box.textContent = avInitials(name);
    return box;
  };

  // Trang Chat / Quản trị trong khung ứng dụng: lớp chỉnh giao diện điện thoại (pwa-ui.css / pwa-ui.js)
  if (inShell) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('pwa-ui.css', PWA.base()).href;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = new URL('pwa-ui.js', PWA.base()).href;
    document.head.append(js);
  }

  if (!inShell && !G.__BEIN_SHELL__) {
    eventFns.add((ev) => {
      if (ev.type === 'open') openPage(ev.url);
      if (ev.type === 'notify') PWA.toast(ev.title, ev.message, () => port.postMessage({ type: 'notification-click', nid: ev.id }), ev.id);
      if (ev.type === 'notify-clear') document.querySelector(`#bein-toasts [data-id="${CSS.escape(ev.id)}"]`)?.remove();
    });
  }
})(typeof self !== 'undefined' ? self : globalThis);
