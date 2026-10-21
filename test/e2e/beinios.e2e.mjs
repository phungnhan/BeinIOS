// Kiểm thử nút "Chuyển đăng nhập sang BeinIOS" trên addon thật (Chrome headless, cookie giả).
// Chạy: node test/e2e/beinios.e2e.mjs
//   1. Bản sao addon được cấp sẵn quyền cookies + beincom.com / chat / auth (headless không bấm được hộp xin quyền):
//      đặt cookie giả như sau khi đăng nhập Beincom (cookie chung .beincom.com, cookie riêng chat / auth) -> bấm nút ->
//      mã QR có đủ cookie của từng máy chủ, bỏ cookie thống kê.
//   2. Addon nguyên bản (quyền tuỳ chọn): bấm nút (như người dùng bấm) -> trình duyệt hiện hộp xin quyền, không báo lỗi
//      (không báo nhầm "chưa nạp bản mới" hay "phải bấm").
//   3. Có thư mục BeinIOS bên cạnh (../BeinIOS): chạy proxy thật (cloudflare-proxy/worker.js, Durable Object giả) trên máy,
//      điền proxy trong hộp -> addon mã hoá, gửi lên proxy -> lấy về như iPhone, giải mã ra đúng cookie.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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

// Proxy thật của BeinIOS chạy trên máy (nếu có thư mục BeinIOS bên cạnh), Durable Object giả trong bộ nhớ
const BEINIOS_WORKER = path.resolve(ROOT, '..', 'BeinIOS', 'cloudflare-proxy', 'worker.js');
async function startProxy() {
  if (!existsSync(BEINIOS_WORKER)) return null;
  const mod = await import(pathToFileURL(BEINIOS_WORKER).href);
  const objects = new Map();
  const HANDOFF = {
    idFromName: (n) => n,
    get(id) {
      if (!objects.has(id)) {
        const data = new Map();
        objects.set(id, new mod.Handoff({ storage: { put: async (o) => Object.entries(o).forEach(([k, v]) => data.set(k, v)), get: async (ks) => new Map(ks.filter((k) => data.has(k)).map((k) => [k, data.get(k)])), deleteAll: async () => data.clear(), setAlarm: async () => {} } }));
      }
      const obj = objects.get(id);
      return { fetch: (u, init) => obj.fetch(new Request(u, init)) };
    },
  };
  const env = { PROXY_KEY: 'khoa-e2e', ALLOWED_ORIGIN: 'https://phungnhan.github.io', HANDOFF };
  const seen = [];
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    seen.push({ method: req.method, url: req.url, origin: req.headers.origin || '' });
    const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
    const r = await mod.default.fetch(new Request('http://127.0.0.1' + req.url, { method: req.method, headers: Object.entries(req.headers).filter(([k]) => k !== 'host' && k !== 'connection'), body }), env);
    const out = {};
    r.headers.forEach((v, k) => (out[k] = v));
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { origin: 'http://127.0.0.1:' + srv.address().port, seen, close: () => srv.close() };
}

async function run(granted, proxy = null) {
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
    let handoff = null;
    if (proxy && st.qr) {
      // Điền proxy trong hộp như người dùng -> addon tạo mã ngắn; ghi lại link mã QR để lấy về như iPhone
      await ev(s, `window.__qrUrl = ''; const real = BG.beiniosHandoffUrl; BG.beiniosHandoffUrl = (...a) => (window.__qrUrl = real(...a));
        document.getElementById('beinios-px-url').value = ${JSON.stringify(proxy.origin)};
        document.getElementById('beinios-px-key').value = 'khoa-e2e';
        document.getElementById('beinios-px-save').click(); true`);
      for (let i = 0; i < 40; i++) {
        handoff = await ev(s, "({ url: window.__qrUrl, info: document.getElementById('beinios-info').textContent, qr: !!document.querySelector('#beinios-qr svg path') })");
        if (/Mã dùng một lần|Không tạo được/.test(handoff.info)) break;
        await sleep(250);
      }
    }
    return { st, got, handoff, problems };
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
const require = createRequire(import.meta.url);
const BG = require(path.join(ROOT, 'common.js'));
let proxy = null;
try {
  proxy = await startProxy();
  const a = await run(true, proxy);
  check(a.st?.qr, 'đã có quyền: bấm nút hiện mã QR' + (a.st?.qr ? '' : ` (${a.st?.toast || a.st?.info})`));
  check(a.got?.api?.sid === 'GIA-phien', 'đọc được cookie chung .beincom.com (phiên đăng nhập) cho ô Beincom');
  check(a.got?.chat?.MMAUTHTOKEN === 'GIA-chat' && a.got?.chat?.sid === 'GIA-phien', 'ô Chat: cookie riêng chat.beincom.com + cookie chung');
  check(a.got?.auth?.rt === 'GIA-lammoi' && a.got?.auth?.sid === 'GIA-phien', 'ô máy chủ đăng nhập: cookie riêng auth.beincom.com (đường dẫn /v1/auth) + cookie chung');
  check(!Object.keys({ ...a.got?.api, ...a.got?.chat, ...a.got?.auth }).includes('_ga'), 'bỏ cookie thống kê');
  if (proxy) {
    const h = a.handoff || {};
    check(/Mã dùng một lần/.test(h.info || '') && h.qr, 'điền proxy: addon tạo mã QR ngắn qua proxy' + (/Mã dùng một lần/.test(h.info || '') ? '' : ` (${h.info})`));
    check(proxy.seen.some((x) => x.method === 'OPTIONS' && x.url === '/handoff' && x.origin.startsWith('chrome-extension://')) && proxy.seen.some((x) => x.method === 'POST' && x.url === '/handoff'), 'addon gửi lên proxy được (qua kiểm tra CORS của trình duyệt)');
    const m = /#h=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)&p=(.+)$/.exec(h.url || '');
    check(!!m && decodeURIComponent(m?.[3] || '') === proxy.origin, 'link mã QR: mã số + khoá + địa chỉ proxy');
    if (m) {
      const r = await fetch(proxy.origin + '/handoff?id=' + m[1]);
      const j = await r.json();
      const text = await BG.beiniosUnseal(j.payload, m[2]);
      const back = BG.beiniosUnpack(text);
      check(back?.api?.sid === 'GIA-phien' && back?.auth?.rt === 'GIA-lammoi' && back?.chat?.MMAUTHTOKEN === 'GIA-chat', 'lấy về như iPhone, giải mã ra đúng cookie');
      check(!JSON.stringify(j).includes('GIA-'), 'proxy chỉ giữ bản mã hoá (không thấy cookie dạng rõ)');
      check((await fetch(proxy.origin + '/handoff?id=' + m[1])).status === 404, 'mã dùng một lần');
    }
  } else console.log('… bỏ qua thử proxy: không thấy ' + BEINIOS_WORKER);
  check(a.problems.length === 0, 'không có lỗi JavaScript' + (a.problems.length ? ': ' + a.problems.join(' | ') : ''));
  const b = await run(false);
  // Chưa có quyền: bấm -> trình duyệt hiện hộp xin quyền và chờ người dùng (headless không bấm được) — không báo lỗi
  check(!b.st?.toast && !b.st?.qr && !/Không thấy/.test(b.st?.info || ''), `chưa có quyền: bấm nút thì trình duyệt hỏi quyền, không báo lỗi${b.st?.toast ? ' (báo: ' + b.st.toast + ')' : ''}`);
  check(b.problems.length === 0, 'không có lỗi JavaScript' + (b.problems.length ? ': ' + b.problems.join(' | ') : ''));
} catch (e) {
  check(false, String(e?.message || e));
} finally {
  proxy?.close();
  for (const d of temps) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }
}
console.log(failed ? '\nNút Chuyển đăng nhập sang BeinIOS: CÓ LỖI' : '\nNút Chuyển đăng nhập sang BeinIOS: chạy đúng trên addon thật');
process.exit(failed ? 1 : 0);
