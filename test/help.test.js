// Kiểm tra Hướng dẫn trong ứng dụng (lib/help.js) và các nút ❓ / ⓘ của Dashboard
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BG = require('../common.js');

const root = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('Hướng dẫn: mục lục có đủ mọi chủ đề, mỗi chủ đề có tiêu đề và nội dung, không dẫn link ra ngoài', () => {
  const keys = Object.keys(BG.HELP_TOPICS);
  const listed = BG.HELP_INDEX.flatMap((g) => g.topics);
  assert.deepEqual([...listed].sort(), [...keys].sort());
  assert.equal(new Set(listed).size, listed.length);
  for (const [k, t] of Object.entries(BG.HELP_TOPICS)) {
    assert.ok(t.title && t.sections.length, k);
    for (const s of t.sections) {
      assert.ok(s.h && s.items.length, `${k}: ${s.h}`);
      for (const it of s.items.flat()) {
        assert.equal(typeof it, 'string');
        assert.doesNotMatch(it, /https?:\/\/|github|\.md\b/i, `${k}: ${it}`);
      }
    }
  }
});

test('Dashboard: mọi nút [data-help] trỏ tới chủ đề có thật (hoặc mục lục), nút ⓘ có chữ gợi ý', () => {
  const helps = [...dash.matchAll(/data-help="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(helps.includes(''), 'có nút mở mục lục Hướng dẫn');
  for (const h of helps) if (h) assert.ok(BG.HELP_TOPICS[h], h);
  for (const m of dash.matchAll(/<button type="button" class="tip-i" data-tip="([^"]*)" aria-label="Gợi ý: ([^"]*)">i<\/button>/g)) {
    assert.ok(m[1].length > 3);
    assert.equal(m[1], m[2]);
  }
  // Mô tả dài không còn nằm sẵn dưới tên các dòng (trừ cảnh báo Chạy thử)
  const rows = [...dash.matchAll(/<b>([^<]*)<\/b><br \/>\s*<span class="muted small">/g)].map((m) => m[1]);
  assert.deepEqual(rows, ['Chạy thử']);
  assert.match(dash, /id="help-set-list"/);
});

test('AI trên web: iPhone mở ứng dụng Claude bằng liên kết claude://, các trang khác chỉ có link web', () => {
  assert.equal(BG.AI_WEB_SITES.claude.app, 'claude://');
  for (const w of Object.values(BG.AI_WEB_SITES)) assert.match(w.url, /^https:\/\//);
  assert.equal(BG.AI_WEB_SITES.chatgpt.app, undefined);
});
