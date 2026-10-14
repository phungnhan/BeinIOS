// Chụp thanh nút của tin (phóng to 3 lần) để xem biểu tượng có cân đối không: node test/ui/shot-tools.mjs <tệp.png>
import { buildPreview, launch } from './harness.mjs';

const out = process.argv[2] || 'tools.png';
const sel = process.argv[3] || '#m-n1';
const url = buildPreview();
const page = await launch();
try {
  await page.open(url('chat', 'chat=1&c=chMain'), { width: 900, height: 400 });
  await page.ev(`window.SEL = ${JSON.stringify(sel)}; true`);
  await page.until(() => !!document.querySelector(window.SEL + ' .tools'));
  await page.ev(`(() => {
    const t = document.querySelector(window.SEL + ' .tools').cloneNode(true);
    document.body.replaceChildren(t);
    document.body.style.cssText = 'margin:0;padding:40px;background:#fff';
    t.style.cssText = 'position:static;display:flex;transform:scale(3);transform-origin:0 0;width:max-content';
    return true;
  })()`);
  await page.shot(out);
} finally {
  await page.close();
}
