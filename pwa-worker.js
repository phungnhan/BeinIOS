// BeinIOS — luồng nền của webapp: chạy nguyên background.js của addon BeinFusion trong SharedWorker
// (hoặc Worker thường khi trình duyệt không có SharedWorker), thay các API chrome.* chỉ addon mới có.
// Phải nằm ở thư mục gốc: importScripts trong background.js tính đường dẫn theo vị trí tệp này.
//
// Trang nói chuyện với luồng nền qua MessagePort:
//   trang -> nền: { type: 'msg', id, msg } (chrome.runtime.sendMessage) · { type: 'alarm-get', id, name }
//                 { type: 'notification-click', nid } · { type: 'hello', id, top } · { type: 'bye' }
//   nền -> trang: { type: 'reply', id, res } · { type: 'event', ev: { type: 'notify' | 'notify-clear' | 'badge' | 'open', … } }
'use strict';

importScripts('pwa-shim.js');

const PWA = self.BeinPWA;
const { store, net } = PWA.shared();
const SITE = 'https://group.beincom.com';

// ---------- Cổng nối với các trang ----------
const ports = new Set();
const tops = new WeakSet(); // cổng của cửa sổ ngoài cùng (khung ứng dụng / trang mở riêng): nhận thông báo, huy hiệu
const state = { badge: '', notes: new Map() };

function broadcast(ev, onlyTop = true) {
  for (const p of ports) {
    if (onlyTop && !tops.has(p)) continue;
    try {
      p.postMessage({ type: 'event', ev });
    } catch {
      ports.delete(p);
    }
  }
}

function makeEvent() {
  const fns = new Set();
  return {
    addListener: (fn) => fns.add(fn),
    removeListener: (fn) => fns.delete(fn),
    hasListener: (fn) => fns.has(fn),
    hasListeners: () => fns.size > 0,
    fns,
  };
}
function emit(event, ...args) {
  for (const fn of [...event.fns]) {
    try {
      fn(...args);
    } catch (e) {
      console.error(e);
    }
  }
}

// ---------- chrome.runtime ----------
const onMessage = makeEvent();
const onInstalled = makeEvent();
const onStartup = makeEvent();

// Như Chrome: trình nghe trả true thì chờ sendResponse; không ai trả lời thì trả undefined
function dispatchMessage(msg, sender) {
  return new Promise((resolve) => {
    let done = false;
    let waiting = false;
    const sendResponse = (res) => {
      if (done) return;
      done = true;
      resolve(res);
    };
    for (const fn of [...onMessage.fns]) {
      try {
        const r = fn(msg, sender, sendResponse);
        if (r === true) waiting = true;
        else if (r && typeof r.then === 'function') {
          waiting = true;
          r.then(sendResponse, () => sendResponse(undefined));
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (!waiting) sendResponse(undefined);
  });
}

// ---------- chrome.alarms (hẹn giờ trong bộ nhớ; mở lại ứng dụng thì background.js tự đặt lại) ----------
const onAlarm = makeEvent();
const alarms = new Map();
const alarmInfo = (a) => a && { name: a.name, scheduledTime: a.scheduledTime, ...(a.periodInMinutes ? { periodInMinutes: a.periodInMinutes } : {}) };
function armAlarm(a) {
  clearTimeout(a.timer);
  a.timer = setTimeout(() => {
    if (alarms.get(a.name) !== a) return;
    const info = alarmInfo(a);
    if (a.periodInMinutes) {
      a.scheduledTime = Math.max(Date.now(), a.scheduledTime) + a.periodInMinutes * 60e3;
      armAlarm(a);
    } else alarms.delete(a.name);
    emit(onAlarm, info);
  }, Math.max(0, a.scheduledTime - Date.now()));
}
const chromeAlarms = {
  create(name, info) {
    if (typeof name === 'object') [name, info] = ['', name];
    name = String(name || '');
    info ||= {};
    const old = alarms.get(name);
    if (old) clearTimeout(old.timer);
    const delay = info.when ? Math.max(0, info.when - Date.now()) : (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60e3;
    const a = { name, scheduledTime: Date.now() + delay, periodInMinutes: info.periodInMinutes || 0, timer: 0 };
    alarms.set(name, a);
    armAlarm(a);
    return Promise.resolve();
  },
  get: async (name) => alarmInfo(alarms.get(String(name || ''))),
  getAll: async () => [...alarms.values()].map(alarmInfo),
  async clear(name) {
    const a = alarms.get(String(name || ''));
    if (!a) return false;
    clearTimeout(a.timer);
    alarms.delete(a.name);
    return true;
  },
  async clearAll() {
    for (const a of alarms.values()) clearTimeout(a.timer);
    const had = alarms.size > 0;
    alarms.clear();
    return had;
  },
  onAlarm,
};

// ---------- chrome.notifications / chrome.action: chuyển cho trang hiện (báo trong ứng dụng, thông báo hệ thống) ----------
const onNotifClicked = makeEvent();
const chromeNotifications = {
  async create(id, opts) {
    if (typeof id === 'object') [id, opts] = ['', id];
    id = String(id || 'n' + Date.now());
    let message = String(opts?.message || '');
    if (id === 'bg-login') {
      // Chưa cài proxy / cookie thì Cài đặt đang hiện sẵn, không cần báo; đã cài thì chỉ đúng cách làm của webapp
      if (!net.configured() || !Object.keys(net.config?.jars?.api || {}).length) return id;
      message = 'Bấm để mở Cài đặt của BeinIOS và dán cookie Beincom mới.';
    }
    const note = { type: 'notify', id, title: String(opts?.title || ''), message };
    state.notes.set(id, note);
    if (state.notes.size > 20) state.notes.delete(state.notes.keys().next().value);
    broadcast(note);
    return id;
  },
  async clear(id) {
    state.notes.delete(String(id));
    broadcast({ type: 'notify-clear', id: String(id) });
    return true;
  },
  getAll: async () => Object.fromEntries([...state.notes.keys()].map((k) => [k, true])),
  onClicked: onNotifClicked,
  onClosed: makeEvent(),
  onButtonClicked: makeEvent(),
};
const chromeAction = {
  async setBadgeText({ text } = {}) {
    state.badge = String(text || '');
    broadcast({ type: 'badge', text: state.badge });
  },
  setBadgeBackgroundColor: async () => {},
  setTitle: async () => {},
};

// ---------- chrome.tabs / chrome.scripting ----------
// Webapp không mở được tab Beincom để chạy lệnh thay: tab "group.beincom.com" giả luôn ở trang đăng nhập, nên khi gọi
// thẳng (qua proxy) không được thì addon báo "Phiên đăng nhập hết hạn" như khi chưa đăng nhập Beincom.
let tabSeq = 1000;
const fakeTabs = new Map();
const onTabUpdated = makeEvent();
const chromeTabs = {
  query: async () => [],
  async create({ url = '', active = true } = {}) {
    const id = ++tabSeq;
    if (active === false && String(url).startsWith(SITE)) {
      const tab = { id, url: SITE + '/login', status: 'complete', active: false };
      fakeTabs.set(id, tab);
      return { ...tab };
    }
    broadcast({ type: 'open', url: String(url) });
    return { id, url: String(url), status: 'complete', active: true };
  },
  async get(id) {
    const tab = fakeTabs.get(id);
    if (!tab) throw new Error('No tab with id: ' + id);
    return { ...tab };
  },
  async remove(id) {
    for (const x of [].concat(id)) fakeTabs.delete(x);
  },
  update: async (id) => ({ id }),
  onUpdated: onTabUpdated,
  onRemoved: makeEvent(),
};
const chromeScripting = {
  async executeScript() {
    throw new Error('BeinIOS không chạy được lệnh trong tab Beincom — cần cookie đăng nhập hợp lệ ở Cài đặt');
  },
};

self.chrome = {
  runtime: {
    id: 'beinios',
    lastError: undefined,
    getURL: (p) => new URL(String(p || ''), PWA.base()).href,
    getManifest: () => PWA.manifest(),
    getPlatformInfo: async () => ({ os: 'mac', arch: 'arm', nacl_arch: 'arm' }),
    sendMessage: async () => undefined,
    onMessage,
    onInstalled,
    onStartup,
    onSuspend: makeEvent(),
  },
  storage: store.chromeStorage(),
  alarms: chromeAlarms,
  notifications: chromeNotifications,
  action: chromeAction,
  permissions: { contains: async () => true, request: async () => true, getAll: async () => ({ origins: [], permissions: [] }) },
  tabs: chromeTabs,
  scripting: chromeScripting,
};

// Mọi lệnh fetch của addon tới Beincom đi qua proxy (kèm cookie đã dán ở Cài đặt)
self.fetch = (resource, init) => net.fetch(resource, init);

// ---------- Nhận trang ----------
function attach(port) {
  ports.add(port);
  port.onmessage = async (e) => {
    const m = e.data || {};
    if (m.type === 'bye') return void ports.delete(port);
    if (m.type === 'hello') {
      if (m.top) tops.add(port);
      port.postMessage({ type: 'reply', id: m.id, res: { badge: state.badge, version: PWA.manifest().version, pwa: PWA.VERSION } });
      if (m.top && state.badge) port.postMessage({ type: 'event', ev: { type: 'badge', text: state.badge } });
      return;
    }
    if (m.type === 'ping') return void port.postMessage({ type: 'reply', id: m.id, res: { ok: true } });
    if (m.type === 'alarm-get') return void port.postMessage({ type: 'reply', id: m.id, res: await chromeAlarms.get(m.name) });
    if (m.type === 'notification-click') {
      emit(onNotifClicked, String(m.nid || ''));
      return;
    }
    if (m.type === 'msg') {
      let res;
      try {
        res = await dispatchMessage(m.msg, { id: 'beinios', origin: self.location.origin });
      } catch (err) {
        res = { status: 'error', message: String(err?.message || err) };
      }
      try {
        port.postMessage({ type: 'reply', id: m.id, res });
      } catch (err) {
        // Kết quả không gửi được qua cổng (kiểu dữ liệu lạ): gửi bản JSON
        port.postMessage({ type: 'reply', id: m.id, res: JSON.parse(JSON.stringify(res ?? null)) });
      }
    }
  };
  port.start?.();
}
if ('onconnect' in self) self.onconnect = (e) => attach(e.ports[0]);
else self.onmessage = (e) => e.data?.type === 'bein-port' && e.ports[0] && attach(e.ports[0]);

// ---------- Chạy addon ----------
importScripts('background.js');

// Câu báo hết phiên: webapp không đăng nhập bằng web Beincom mà bằng cookie dán ở Cài đặt
NEED_LOGIN.message = 'Phiên đăng nhập Beincom hết hạn — mở Cài đặt của BeinIOS và dán cookie mới.';

// Như Chrome: lần đầu / đổi phiên bản -> onInstalled; các lần mở sau -> onStartup
(async () => {
  const version = PWA.manifest().version;
  const { installed } = await store.get('pwa', ['installed']);
  if (!installed) emit(onInstalled, { reason: 'install' });
  else if (installed !== version) emit(onInstalled, { reason: 'update', previousVersion: installed });
  else emit(onStartup);
  if (installed !== version) await store.set('pwa', { installed: version });
})().catch((e) => console.error('BeinIOS: khởi động lỗi', e));
