// Kiểm thử nút "Chuyển đăng nhập sang BeinIOS" trên addon thật (Chrome headless, cookie giả).
// Chạy: node test/e2e/beinios.e2e.mjs
//   1. Bản sao addon được cấp sẵn quyền cookies + beincom.com / chat / auth (headless không bấm được hộp xin quyền):
//      đặt cookie giả như sau khi đăng nhập Beincom (cookie chung .beincom.com, cookie riêng chat / auth) -> bấm nút ->
//      mã QR có đủ cookie của từng máy chủ, bỏ cookie thống kê.
//   2. Addon nguyên bản (quyền tuỳ chọn): bấm nút (như người dùng bấm) -> trình duyệt hiện hộp xin quyền, không báo lỗi
//      (không báo nhầm "chưa nạp bản mới" hay "phải bấm").
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error('Không tìm thấy Chrome — đặt CHROME_PATH');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const temps = [];
const tempDir = (prefix) => {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(d);
  return d;
};

async function run(granted) {
  let ext = ROOT;
  if (granted) {
    ext = tempDir('beinios-ext-');
    cpSync(ROOT, ext, { recursive: true, filter: (s) => !/^[\\/]?(\.git|dist|test|node_modules)([\\/]|$)/.test(path.relative(ROOT, s)) });
    const m = JSON.parse(readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
    m.permissions.push('cookies');
    m.host_permissions.push('https://beincom.com/*', 'https://chat.beincom.com/*', 'https://auth.beincom.com/*');
    writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m, null, 2));
  }
  const profile = tempDir('beinios-prof-');
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const exited = new Promise((r) => chrome.once('exit', r));
  let buf = '';
  let seq = 0;
  const pending = new Map();
  const problems = [];
  chrome.stdio[4].on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') problems.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + method)), 20000);
      pending.set(id, (m) => {
        clearTimeout(timer);
        m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
      });
      chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  const ev = async (sid, expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  try {
    await sleep(500);
    const { id } = await send('Extensions.loadUnpacked', { path: ext });
    await send('Storage.setCookies', {
      cookies: [
        { name: 'sid', value: 'GIA-phien', domain: '.beincom.com', path: '/', secure: true, httpOnly: true },
        { name: '_ga', value: 'GA1.1.2', domain: '.beincom.com', path: '/', secure: true },
        { name: 'rt', value: 'GIA-lammoi', domain: 'auth.beincom.com', path: '/v1/auth', secure: true, httpOnly: true },
        { name: 'MMAUTHTOKEN', value: 'GIA-chat', domain: 'chat.beincom.com', path: '/', secure: true, httpOnly: true },
      ],
    });
    const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${id}/dashboard.html#tab=settings` });
    const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, s);
    for (let i = 0; i < 40 && !(await ev(s, "!!document.getElementById('btn-beinios') && typeof BG?.beiniosPack === 'function'")); i++) await sleep(200);
    await sleep(800);
    // Bấm như người dùng (userGesture): Chrome chỉ cho xin quyền trong lúc người dùng bấm
    await send('Runtime.evaluate', { expression: "document.getElementById('btn-beinios').click(), true", userGesture: true }, s);
    let st = null;
    for (let i = 0; i < (granted ? 40 : 12); i++) {
      st = await ev(s, "({ qr: !!document.querySelector('#beinios-qr svg path'), info: document.getElementById('beinios-info').textContent, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).pop() || '' })");
      if (st.qr || st.toast || /Không thấy/.test(st.info)) break;
      await sleep(250);
    }
    const got = st.qr ? await ev(s, 'BG.beiniosUnpack(bi.text)') : null;
    return { st, got, problems };
  } finally {
    await Promise.race([send('Browser.close').catch(() => {}), sleep(2000)]);
    if ((await Promise.race([exited.then(() => true), sleep(4000)])) !== true) chrome.kill();
  }
}

let failed = false;
const check = (cond, msg) => {
  console.log((cond ? '✔ ' : '✖ ') + msg);
  if (!cond) failed = true;
};
try {
  const a = await run(true);
  check(a.st?.qr, 'đã có quyền: bấm nút hiện mã QR' + (a.st?.qr ? '' : ` (${a.st?.toast || a.st?.info})`));
  check(a.got?.api?.sid === 'GIA-phien', 'đọc được cookie chung .beincom.com (phiên đăng nhập) cho ô Beincom');
  check(a.got?.chat?.MMAUTHTOKEN === 'GIA-chat' && a.got?.chat?.sid === 'GIA-phien', 'ô Chat: cookie riêng chat.beincom.com + cookie chung');
  check(a.got?.auth?.rt === 'GIA-lammoi' && a.got?.auth?.sid === 'GIA-phien', 'ô máy chủ đăng nhập: cookie riêng auth.beincom.com (đường dẫn /v1/auth) + cookie chung');
  check(!Object.keys({ ...a.got?.api, ...a.got?.chat, ...a.got?.auth }).includes('_ga'), 'bỏ cookie thống kê');
  check(a.problems.length === 0, 'không có lỗi JavaScript' + (a.problems.length ? ': ' + a.problems.join(' | ') : ''));
  const b = await run(false);
  // Chưa có quyền: bấm -> trình duyệt hiện hộp xin quyền và chờ người dùng (headless không bấm được) — không báo lỗi
  check(!b.st?.toast && !b.st?.qr && !/Không thấy/.test(b.st?.info || ''), `chưa có quyền: bấm nút thì trình duyệt hỏi quyền, không báo lỗi${b.st?.toast ? ' (báo: ' + b.st.toast + ')' : ''}`);
  check(b.problems.length === 0, 'không có lỗi JavaScript' + (b.problems.length ? ': ' + b.problems.join(' | ') : ''));
} catch (e) {
  check(false, String(e?.message || e));
} finally {
  for (const d of temps) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }
}
console.log(failed ? '\nNút Chuyển đăng nhập sang BeinIOS: CÓ LỖI' : '\nNút Chuyển đăng nhập sang BeinIOS: chạy đúng trên addon thật');
process.exit(failed ? 1 : 0);
