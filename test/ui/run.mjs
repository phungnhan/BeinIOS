// Kiểm thử giao diện Dashboard / popup với dữ liệu mẫu (không cần addon thật hay đăng nhập Beincom).
//
// Chạy:  node test/ui/run.mjs            (mọi kịch bản)
//        node test/ui/run.mjs tag        (chỉ kịch bản có chữ "tag" trong tên)
//        node test/ui/run.mjs --keep     (giữ test/preview để mở tay, kèm ảnh chụp kịch bản lỗi)
// Chrome khác chỗ mặc định: đặt biến CHROME_PATH.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PREVIEW, buildPreview, launch } from './harness.mjs';
import { scenarios } from './scenarios.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const filter = args.filter((a) => !a.startsWith('--')).join(' ').toLowerCase();
const list = scenarios.filter((s) => !filter || s.name.toLowerCase().includes(filter));
if (!list.length) {
  console.error('Không có kịch bản nào khớp: ' + filter);
  process.exit(2);
}

const url = buildPreview();
const page = await launch();
let failed = 0;
const started = Date.now();
for (const s of list) {
  const t0 = Date.now();
  try {
    await s.run({ page, url, assert });
    if (page.problems.length) throw new Error(page.problems.join('\n'));
    console.log(`✔ ${s.name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    console.log(`✖ ${s.name}\n    ${String(e.message || e).split('\n').join('\n    ')}`);
    if (keep) {
      mkdirSync(path.join(PREVIEW, 'shots'), { recursive: true });
      await page.shot(path.join(PREVIEW, 'shots', s.name.replace(/[^\p{L}\p{N}]+/gu, '-') + '.png')).catch(() => {});
    }
  }
}
await page.close();
if (!keep) rmSync(PREVIEW, { recursive: true, force: true });
console.log(`\n${list.length - failed}/${list.length} kịch bản qua · ${Math.round((Date.now() - started) / 1000)} giây`);
process.exit(failed ? 1 : 0);
