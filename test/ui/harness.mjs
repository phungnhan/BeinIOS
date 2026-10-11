// Kiểm thử giao diện: dựng trang xem thử (test/preview, có stub.js) và điều khiển Chrome headless qua DevTools.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PREVIEW = path.join(ROOT, 'test', 'preview');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Trang xem thử: chèn <base> về thư mục addon và stub.js trước common.js
export function buildPreview() {
  mkdirSync(PREVIEW, { recursive: true });
  const { version } = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  writeFileSync(path.join(PREVIEW, 'stub.js'), readFileSync(path.join(ROOT, 'test', 'ui', 'stub.js'), 'utf8').replaceAll('__VERSION__', version));
  const base = pathToFileURL(ROOT + path.sep).href;
  for (const f of ['dashboard', 'popup']) {
    const html = readFileSync(path.join(ROOT, f + '.html'), 'utf8')
      .replace('<head>', `<head>\n  <base href="${base}" />`)
      .replace('<script src="common.js"></script>', '<script src="test/preview/stub.js"></script>\n  <script src="common.js"></script>');
    if (!html.includes('test/preview/stub.js')) throw new Error(`${f}.html: không chèn được stub (thiếu <script src="common.js">)`);
    writeFileSync(path.join(PREVIEW, f + '.html'), html);
  }
  return (f, hash = '') => pathToFileURL(path.join(PREVIEW, f + '.html')).href + (hash ? '#' + hash : '');
}

export function findChrome() {
  return [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => p && existsSync(p));
}

// Mở Chrome headless (hồ sơ tạm, cổng DevTools tự chọn), trả về đối tượng điều khiển một trang
export async function launch() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Không tìm thấy Chrome — đặt CHROME_PATH');
  const profile = mkdtempSync(path.join(tmpdir(), 'beingroup-ui-'));
  const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  // Cổng DevTools: Chrome ghi vào DevToolsActivePort trong hồ sơ
  let port = 0;
  for (let i = 0; i < 80 && !port; i++) {
    await sleep(150);
    try {
      port = Number(readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    } catch {}
  }
  if (!port) throw new Error('Chrome không mở cổng DevTools');
  let targets = [];
  for (let i = 0; i < 40 && !targets.some((t) => t.type === 'page'); i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(150);
    }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') problems.push('Lỗi JavaScript: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + method)), 20000);
      pending.set(id, (m) => {
        clearTimeout(timer);
        m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');

  const page = {
    problems,
    // Chạy biểu thức trong trang; lỗi thì ném
    async ev(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    // Chạy một hàm trong trang với tham số JSON
    call(fn, ...args) {
      return page.ev(`(${fn})(...${JSON.stringify(args)})`);
    },
    // Chờ tới khi biểu thức đúng
    async until(fn, timeout = 4000, ...args) {
      const end = Date.now() + timeout;
      for (;;) {
        if (await page.call(fn, ...args)) return;
        if (Date.now() > end) throw new Error('Hết giờ chờ: ' + String(fn).slice(0, 120));
        await sleep(60);
      }
    },
    async open(url, { width = 1440, height = 900, mobile = false } = {}) {
      problems.length = 0;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await send('Page.navigate', { url: 'about:blank' });
      await send('Page.navigate', { url });
      await page.until(() => document.readyState === 'complete' && !!window.BG, 8000);
      await page.until(() => typeof loadAll !== 'function' || loadAll.started, 8000); // Dashboard đã đọc xong dữ liệu lần đầu
      await page.ev('window.confirm = () => true; true'); // hộp confirm() của trình duyệt: luôn đồng ý
      await sleep(250);
    },
    async shot(file) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(s.data, 'base64'));
    },
    async close() {
      // Đóng Chrome gọn (cả tiến trình con) rồi mới xoá hồ sơ tạm — Windows khoá tệp trong hồ sơ tới lúc đó
      const exited = new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r)));
      await Promise.race([send('Browser.close').catch(() => {}), sleep(2000)]);
      try {
        ws.close();
      } catch {}
      if ((await Promise.race([exited.then(() => true), sleep(5000)])) !== true) {
        chrome.kill();
        await Promise.race([exited, sleep(3000)]);
      }
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {}
    },
  };
  return page;
}
