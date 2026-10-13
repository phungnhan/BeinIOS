// Kiểm tra mã Google Apps Script nhận báo cáo sử dụng (tools/usage-collector.gs) với SpreadsheetApp / CacheService giả lập.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const rows = [];
  const cache = new Map();
  const sheet = { appendRow: (r) => rows.push(r), getLastRow: () => rows.length, setFrozenRows: () => {} };
  const ctx = vm.createContext({
    ContentService: { createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (rows.length ? sheet : null), insertSheet: () => sheet }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'tools', 'usage-collector.gs'), 'utf8'), ctx);
  const post = (obj) => JSON.parse(ctx.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).body);
  return { ctx, rows, cache, post };
}

const report = (extra = {}) => ({
  app: 'BeinGroup',
  v: 1,
  installId: 'abc12345-def6',
  version: '0.29.0',
  browser: 'Chrome/141.0.1.2',
  since: '2026-09-20',
  activeDays: 12,
  communities: 2,
  groups: 5,
  flags: ['Chạy thử', 'Telegram'],
  features: { 'Đăng / hẹn giờ bài': 4, 'Quét tay': 2 },
  actions: { total: 30, auto: 10, telegram: 5, manual: 15, failed: 1 },
  errors: { count: 2, top: ['GET content/timeline/:id → 504 (×2)'] },
  selfCheck: { ok: 20, skip: 3, fail: 1, failing: ['Bài ghim'] },
  note: 'Lan',
  ...extra,
});

test('nơi nhận báo cáo sử dụng: ghi tiêu đề một lần rồi mỗi báo cáo một dòng; mỗi máy tối đa một lần mỗi 6 giờ', () => {
  const { rows, post } = load();
  assert.deepEqual(post(report()), { ok: true });
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'Nhận lúc');
  assert.deepEqual([...rows[1].slice(1)], ['abc12345-def6', '0.29.0', 'Chrome/141.0.1.2', '2026-09-20', 12, 2, 5, 'Chạy thử, Telegram', 'Đăng / hẹn giờ bài 4 · Quét tay 2', '30 / 10 / 5 / 15 / 1', '2 — GET content/timeline/:id → 504 (×2)', '20 / 3 / 1', 'Bài ghim', 'Lan']);
  assert.deepEqual(post(report()), { ok: true, skipped: true });
  assert.equal(rows.length, 2);
  assert.deepEqual(post(report({ installId: 'khac-may-9999' })), { ok: true });
  assert.equal(rows.length, 3);
});

test('nơi nhận báo cáo sử dụng: từ chối dữ liệu sai dạng; ô bắt đầu bằng = + - @ không thành công thức; cắt độ dài', () => {
  const { rows, post } = load();
  assert.deepEqual(post('không phải json'), { ok: false, error: 'json' });
  assert.deepEqual(post(report({ app: 'Khác' })), { ok: false, error: 'format' });
  assert.deepEqual(post(report({ installId: 'x' })), { ok: false, error: 'format' });
  assert.deepEqual(post(report({ v: 2 })), { ok: false, error: 'format' });
  assert.equal(rows.length, 0);
  post(report({ note: '=IMPORTXML("http://x")', version: '+1', activeDays: -5, browser: 'a'.repeat(100) }));
  const r = rows[1];
  assert.equal(r[14], `'=IMPORTXML("http://x")`);
  assert.equal(r[2], "'+1");
  assert.equal(r[5], 0);
  assert.equal(r[3].length, 40);
  assert.equal(load().ctx.doGet().body, 'BeinGroup: nơi nhận báo cáo sử dụng đang chạy.');
});
