// Service worker — đồng bộ cài đặt giữa các máy qua chrome.storage.sync (tài khoản Chrome / Edge). Bật ở Cài đặt, mặc định tắt.
// Mỗi khoá một mục: { v: giá trị, at: lúc ghi, from: mã máy }. Không đồng bộ công tắc bật / tắt addon và công tắc đồng bộ (thuộc từng máy),
// mẫu bài đăng (thường lớn) và hồ sơ vi phạm (dùng Sao lưu).

const SYNC_KEYS = ['settings', 'rules', 'postRules', 'groupRules', 'welcome', 'shoutout'];
const SYNC_LOCAL_ONLY = ['active', 'syncSettings'];
const SYNC_ITEM_MAX = 8000; // chrome.storage.sync giới hạn 8 KB mỗi mục (tính cả tên khoá)
const SYNC_DELAY_MS = 1500;
const syncApplied = {}; // khoá -> JSON vừa nhận từ máy khác (để không gửi ngược lại)
const syncPending = new Set();
let syncTimer = 0;

async function deviceId() {
  const { deviceId: id } = await chrome.storage.local.get('deviceId');
  if (id) return id;
  const fresh = 'd' + Math.random().toString(36).slice(2, 10);
  await chrome.storage.local.set({ deviceId: fresh });
  return fresh;
}

// Giá trị đem đồng bộ: cài đặt bỏ các trường chỉ thuộc máy này
function syncValue(key, value) {
  if (key !== 'settings' || !value) return value;
  const v = { ...value };
  for (const k of SYNC_LOCAL_ONLY) delete v[k];
  return v;
}

const syncBytes = (key, item) => new TextEncoder().encode(key + JSON.stringify(item)).length;

// Làm sạch dữ liệu nhận về như khi khôi phục sao lưu
function cleanSynced(key, v) {
  if (key === 'welcome' || key === 'shoutout') return typeof v?.template === 'string' ? { template: v.template.slice(0, 5000) } : undefined;
  try {
    return BG.readBackup({ app: 'BeinFusion', format: BG.BACKUP_FORMAT, data: { [key]: v } }).data[key];
  } catch {
    return undefined;
  }
}

// Gửi các khoá lên bản đồng bộ (bỏ khoá vừa nhận từ máy khác và khoá quá 8 KB)
async function pushSync(keys = SYNC_KEYS, { force = false } = {}) {
  const local = await chrome.storage.local.get([...new Set([...keys, 'settings'])]);
  if (!local.settings?.syncSettings) return { status: 'off', pushed: [], skipped: [] };
  const id = await deviceId();
  const out = {};
  const skipped = [];
  for (const k of keys) {
    if (!SYNC_KEYS.includes(k) || local[k] === undefined) continue;
    const v = syncValue(k, local[k]);
    const json = JSON.stringify(v);
    if (!force && syncApplied[k] === json) continue;
    const item = { v, at: Date.now(), from: id };
    if (syncBytes(k, item) > SYNC_ITEM_MAX) {
      skipped.push(k);
      continue;
    }
    out[k] = item;
  }
  if (Object.keys(out).length) await chrome.storage.sync.set(out);
  for (const k of Object.keys(out)) syncApplied[k] = JSON.stringify(out[k].v);
  if (Object.keys(out).length || skipped.length) await chrome.storage.local.set({ syncStatus: { at: Date.now(), dir: 'push', keys: Object.keys(out), skipped } });
  return { status: 'ok', pushed: Object.keys(out), skipped };
}

// Ghi các mục nhận từ bản đồng bộ vào máy này (giữ các trường chỉ thuộc máy này)
async function applySync(items) {
  const { settings: localSettings } = await chrome.storage.local.get('settings');
  const set = {};
  let from = '';
  for (const [k, it] of Object.entries(items || {})) {
    if (!SYNC_KEYS.includes(k) || !it || it.v === undefined) continue;
    let v = cleanSynced(k, it.v);
    if (v === undefined) continue;
    if (k === 'settings') {
      v = { ...BG.DEFAULT_SETTINGS, ...v };
      for (const f of SYNC_LOCAL_ONLY) v[f] = localSettings?.[f] ?? BG.DEFAULT_SETTINGS[f];
    } else if (k === 'rules') v = { ...BG.DEFAULT_RULES, ...v };
    else if (k === 'postRules') v = { ...BG.DEFAULT_POST_RULES, ...v };
    syncApplied[k] = JSON.stringify(syncValue(k, v));
    set[k] = v;
    from = it.from || from;
  }
  const keys = Object.keys(set);
  if (keys.length) await chrome.storage.local.set({ ...set, syncStatus: { at: Date.now(), dir: 'pull', keys, from } });
  return keys;
}

// Máy khác vừa ghi lên bản đồng bộ
async function onSyncChanged(changes) {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings?.syncSettings) return;
  const id = await deviceId();
  const items = {};
  for (const [k, c] of Object.entries(changes)) if (SYNC_KEYS.includes(k) && c.newValue && c.newValue.from !== id) items[k] = c.newValue;
  if (Object.keys(items).length) await applySync(items);
}

// Máy này đổi cài đặt: gom lại rồi gửi một lần
function queueSyncPush(changes) {
  for (const k of Object.keys(changes)) if (SYNC_KEYS.includes(k)) syncPending.add(k);
  if (!syncPending.size) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const keys = [...syncPending];
    syncPending.clear();
    pushSync(keys).catch(() => {});
  }, SYNC_DELAY_MS);
}

// Dashboard hỏi: bản đồng bộ đang có gì (để hỏi lấy bản nào khi bật)
async function doSyncStatus() {
  const id = await deviceId();
  const cloud = await chrome.storage.sync.get(SYNC_KEYS);
  const { syncStatus } = await chrome.storage.local.get('syncStatus');
  const entries = Object.entries(cloud).filter(([k, it]) => SYNC_KEYS.includes(k) && it?.at);
  const latest = entries.reduce((m, [, it]) => (it.at > (m?.at || 0) ? it : m), null);
  return { status: 'ok', deviceId: id, keys: entries.map(([k]) => k), at: latest?.at || null, fromOther: !!latest && latest.from !== id, last: syncStatus || null };
}

// Đồng bộ ngay: push = gửi cài đặt máy này lên (ghi đè), pull = lấy bản đồng bộ về máy này
async function doSyncNow({ mode = 'push', enable = false }) {
  if (enable) {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...BG.DEFAULT_SETTINGS, ...settings, syncSettings: true } });
  }
  if (mode === 'pull') {
    const cloud = await chrome.storage.sync.get(SYNC_KEYS);
    const keys = await applySync(cloud);
    return { status: 'ok', mode, keys };
  }
  const r = await pushSync(SYNC_KEYS, { force: true });
  if (r.status === 'off') return { status: 'error', message: 'Đồng bộ đang tắt' };
  return { status: 'ok', mode, keys: r.pushed, skipped: r.skipped };
}
