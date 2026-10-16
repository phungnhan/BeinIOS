// Kiểm thử webapp BeinIOS chạy thật trong Chrome headless (node test/pwa/pwa.e2e.mjs):
//   - máy chủ tĩnh phục vụ thư mục này ở /BeinIOS/ (như GitHub Pages)
//   - Cloudflare proxy thật (cloudflare-proxy/worker.js) chạy trong Node, Beincom giả phía sau
//   - mở index.html: cài proxy + cookie (có cookie cũ để thử làm mới phiên), quét, Dashboard hiện group, bật Chat,
//     link mở trang ở lại trong khung, rồi chạy lại khi trình duyệt không có SharedWorker (Worker thường)
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, ROOT, sleep } from '../ui/harness.mjs';

const KEY = 'k-e2e-' + Math.random().toString(36).slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };

// ---------- Máy chủ tĩnh ----------
let noShared = false; // giai đoạn 2: xoá SharedWorker trước mọi script của trang
const site = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/BeinIOS/')) return res.writeHead(404).end();
  const rel = decodeURIComponent(u.pathname.slice('/BeinIOS/'.length)) || 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT) || rel.includes('..')) return res.writeHead(403).end();
  try {
    if (!statSync(file).isFile()) throw 0;
  } catch {
    return res.writeHead(404).end();
  }
  let body = readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html' && noShared) body = Buffer.from(body.toString('utf8').replace('<head>', '<head><script>window.SharedWorker = undefined;</script>'));
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

// ---------- Beincom giả (sau proxy) ----------
const upstream = [];
let withRequest = false; // có yêu cầu tham gia mới (thử thông báo)
const COOKIE = (h) => Object.fromEntries((h.get('cookie') || '').split(/;\s*/).filter(Boolean).map((p) => [p.split('=')[0], p.slice(p.indexOf('=') + 1)]));
const J = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
async function beincom(url, init = {}) {
  const u = new URL(url);
  const headers = new Headers(init.headers);
  const body = init.body ? await new Response(init.body).text() : '';
  upstream.push({ host: u.hostname, path: u.pathname + u.search, method: init.method || 'GET', headers, body });
  const ck = COOKIE(headers);
  if (u.hostname === 'auth.beincom.com') {
    if (u.pathname === '/v1/auth/public/http/refresh-session' && ck.rt === 'r1') return J(200, { code: 'ok' }, { 'set-cookie': 'sid=good; Domain=.beincom.com; Path=/; HttpOnly; Secure' });
    return J(401, { code: 'unauthorized' });
  }
  if (u.hostname === 'chat.beincom.com') {
    if (ck.MMAUTHTOKEN !== 'm1' || headers.get('x-application') !== 'BIC_GROUP') return J(401, { id: 'api.context.session_expired.app_error' });
    if (u.pathname === '/api/v4/users/me') return J(200, { id: 'mm1', username: 'tester', first_name: '', last_name: '' });
    return J(200, []);
  }
  if (u.hostname !== 'api.beincom.com') return J(404, {});
  if (ck.sid !== 'good') return J(401, { code: 'api.unauthorized' });
  const p = u.pathname.replace(/^\/v1\//, '');
  if (p === 'group/me/permissions') return J(200, { code: 'api.ok', data: { communities: { c1: ['manage', 'ban_member'] }, groups: { g1: ['role_COMMUNITY_ADMIN', 'approve_reject_jr', 'remove_member'] } } });
  if (p === 'group/groups/g1') return J(200, { code: 'api.ok', data: { id: 'g1', name: 'Nhóm Thử BeinIOS', communityId: 'c1', isCommunity: true, level: 0, privacy: 'OPEN', userCount: 42, settings: { isJoinApproval: true } } });
  if (/join-requests/.test(p)) return J(200, { code: 'api.ok', data: withRequest ? [{ id: 'jr1', userId: 'u9', createdAt: new Date().toISOString(), answers: [], user: { id: 'u9', username: 'nguoimoi', fullname: 'Người Mới', avatar: '' } }] : [] });
  return J(200, { code: 'api.ok', data: { list: [], meta: {} } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (/^https:\/\/[a-z]+\.beincom\.com\//.test(String(url)) ? beincom(url, init) : realFetch(url, init));

// ---------- Cloudflare proxy thật, chạy trong Node ----------
const { default: proxyWorker } = await import('../../cloudflare-proxy/worker.js');
let ENV;
const proxy = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
  const request = new Request('http://127.0.0.1' + req.url, { method: req.method, headers: Object.entries(req.headers).filter(([k]) => k !== 'host' && k !== 'connection'), body });
  const r = await proxyWorker.fetch(request, ENV);
  const out = {};
  r.headers.forEach((v, k) => (out[k] = v));
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
});

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const sitePort = await listen(site);
const proxyPort = await listen(proxy);
const APP = `http://127.0.0.1:${sitePort}`;
ENV = { PROXY_KEY: KEY, ALLOWED_ORIGIN: APP };

const fails = [];
const ok = (cond, msg) => {
  if (!cond) fails.push(msg);
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
};

const page = await launch();
// PWA_SHOTS=<thư mục>: chụp màn hình cỡ iPhone 13 ở vài bước để xem bằng mắt
const SHOTS = process.env.PWA_SHOTS || '';
const shot = async (name) => SHOTS && page.shot(path.join(SHOTS, name + '.png'));
if (SHOTS) await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const frame = (id, expr) => `(() => { const w = document.getElementById('${id}').contentWindow; return w.eval(${JSON.stringify(expr)}); })()`;
try {
  console.log('Giai đoạn 1: SharedWorker');
  await page.ev(`location.href = ${JSON.stringify(APP + '/BeinIOS/index.html')}; true`);
  await sleep(300);
  await page.until(() => document.readyState === 'complete' && document.getElementById('setup')?.classList.contains('open'), 10000);
  ok(true, 'lần đầu mở: tự hiện Cài đặt');
  await shot('1-cai-dat');

  // Sai khoá proxy -> báo rõ
  const fill = (key, api, chat) =>
    page.call(
      (url, key, api, chat) => {
        const set = (id, v) => {
          const el = document.getElementById(id);
          el.value = v;
          el.dispatchEvent(new Event('input'));
        };
        set('proxy-url', url);
        set('proxy-key', key);
        set('cookie-api', api);
        set('cookie-chat', chat);
        document.getElementById('result').textContent = '';
        document.getElementById('save').click();
        return true;
      },
      `http://127.0.0.1:${proxyPort}/`,
      key,
      api,
      chat,
    );
  await fill('sai-khoa', '', '');
  await page.until(() => /khoá proxy không đúng/.test(document.getElementById('result').textContent), 8000);
  ok(true, 'sai khoá proxy: Cài đặt báo "khoá proxy không đúng"');

  const curl = `curl 'https://api.beincom.com/v1/group/me/permissions' \\\n  -H 'accept: application/json' \\\n  -b 'sid=old; rt=r1; Bic.Auth.deviceId=dev-e2e' \\\n  -H 'x-application: BIC_GROUP'`;
  await fill(KEY, curl, 'Cookie: MMAUTHTOKEN=m1; MMUSERID=mm1');
  await page.until(() => /Đang quét Beincom lần đầu/.test(document.getElementById('result').textContent), 15000);
  const text = await page.ev(`document.getElementById('result').textContent`);
  ok(/Proxy OK/.test(text) && /có quyền ở 1 cộng đồng/.test(text) && /Chat Beincom OK/.test(text), 'kiểm tra kết nối: proxy, Beincom (1 cộng đồng), Chat đều OK');
  await page.ev("document.getElementById('result').scrollIntoView(), true");
  await shot('2-kiem-tra');
  const refresh = upstream.filter((x) => x.host === 'auth.beincom.com');
  ok(refresh.length === 1 && JSON.parse(refresh[0].body).deviceId === 'dev-e2e', 'cookie cũ (401) -> tự làm mới phiên đúng một lần, dùng deviceId trong cookie');
  ok((await page.ev('BeinPWA.page.net.config.jars.api.sid')) === 'good', 'cookie mới từ làm mới phiên được lưu');
  ok(upstream.every((x) => !x.headers.get('origin') && !x.headers.get('x-beinios-key') && !x.headers.get('x-bein-cookie')), 'Beincom không nhận Origin giả / khoá proxy / header nội bộ');
  ok((await page.ev(`$1 = document.getElementById('cookie-api').value`)) === '', 'ô cookie được xoá trắng sau khi lưu (không hiện lại cookie)');

  // Dashboard: quét xong hiện group
  await page.ev(`document.getElementById('close').click(); document.querySelector('nav button[data-tab="dash"]').click(); true`);
  await page.until((x) => /Nhóm Thử BeinIOS/.test(document.getElementById('f-dash').contentDocument?.body?.innerText || ''), 25000);
  ok(true, 'Dashboard hiện group sau lần quét qua luồng nền');
  await sleep(600);
  await shot('3-quan-tri');
  const ver = await page.ev(frame('f-dash', 'chrome.runtime.getManifest().version'));
  const real = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
  ok(ver === real, `chrome.runtime.getManifest() trong trang = ${real}`);
  const alarm = await page.ev(frame('f-dash', "chrome.alarms.get('beingroup-scan')"));
  ok(!!alarm?.scheduledTime && alarm.periodInMinutes > 0, 'hẹn giờ quét định kỳ đã đặt trong luồng nền');
  const shared = await page.ev(frame('f-dash', "chrome.storage.local.get('settings').then((r) => !!r.settings)"));
  ok(shared, 'trang đọc được cài đặt luồng nền đã ghi (kho chung)');

  // Link "Mở trang Chat" (target=_blank) ở Dashboard: ở lại trong khung, chuyển tab Chat
  const before = await page.ev('window.__opened = 0; window.open = () => (window.__opened++, null); true');
  await page.ev(frame('f-dash', "document.getElementById('btn-chat-page').click(), true"));
  await page.until(() => document.querySelector('nav button.on')?.dataset.tab === 'chat', 5000);
  ok(before && true, 'link Chat ở Dashboard chuyển sang tab Chat trong khung (không mở cửa sổ mới)');

  // Chat: bật chat -> luồng nền gọi chat.beincom.com qua proxy bằng cookie Chat
  await page.until(() => !!document.getElementById('f-chat').contentDocument?.getElementById('btn-enable'), 8000);
  const n0 = upstream.length;
  await page.ev(frame('f-chat', "document.getElementById('btn-enable').click(), true"));
  await page.until(() => true, 100);
  for (let i = 0; i < 100 && !upstream.slice(n0).some((x) => x.host === 'chat.beincom.com' && x.path === '/api/v4/users/me/teams'); i++) await sleep(100);
  // (ảnh đại diện /image do trang tải không cần X-Requested-With — Mattermost nhận cookie cho ảnh)
  const chatCalls = upstream.slice(n0).filter((x) => x.host === 'chat.beincom.com' && !/\/image(\?|$)/.test(x.path));
  if (!chatCalls.length || !chatCalls.every((x) => COOKIE(x.headers).MMAUTHTOKEN === 'm1' && x.headers.get('x-requested-with') === 'XMLHttpRequest')) console.log('    (gỡ lỗi)', JSON.stringify(upstream.slice(n0).map((x) => [x.host, x.path, Object.keys(COOKIE(x.headers)), x.headers.get('x-requested-with')])), await page.ev(frame('f-chat', "document.getElementById('btn-enable').dataset.mode + ' | ' + document.body.innerText.slice(0, 300)")));
  await sleep(800);
  await shot('4-chat');
  ok(chatCalls.length > 0 && chatCalls.every((x) => COOKIE(x.headers).MMAUTHTOKEN === 'm1' && x.headers.get('x-requested-with') === 'XMLHttpRequest'), 'bật Chat: gọi chat.beincom.com bằng cookie Chat, có X-Requested-With');

  // Thông báo của luồng nền -> báo trong ứng dụng; bấm vào -> mở đúng tab Dashboard
  withRequest = true;
  await page.ev(frame('f-dash', "chrome.runtime.sendMessage({ type: 'scan', source: 'alarm' }), true"));
  await page.until(() => [...document.querySelectorAll('[role=status] b')].some((b) => /yêu cầu tham gia mới/.test(b.textContent)), 20000);
  ok(true, 'yêu cầu tham gia mới: hiện báo trong ứng dụng');
  await shot('5-thong-bao');
  await page.ev("[...document.querySelectorAll('[role=status]')].find((x) => /yêu cầu tham gia mới/.test(x.textContent)).click(), true");
  await page.until(() => document.querySelector('nav button.on')?.dataset.tab === 'dash' && /tab=members/.test(document.getElementById('f-dash').contentWindow.location.hash), 8000);
  ok(true, 'bấm báo: chuyển sang Quản trị, tab Thành viên');
  const badge = await page.ev("document.getElementById('badge').textContent");
  ok(/\d/.test(badge), `huy hiệu tab Quản trị: "${badge}"`);

  ok(!(await page.ev("document.body.innerText.includes('Lỗi trong addon')")), 'không có lỗi "Lỗi trong addon" hiện ra');
  ok(page.problems.length === 0, 'không có lỗi JavaScript' + (page.problems.length ? ': ' + page.problems.slice(0, 3).join(' | ') : ''));

  const reg = await page.ev("navigator.serviceWorker.getRegistration().then((r) => !!r)");
  ok(reg, 'service worker đã đăng ký');

  console.log('Giai đoạn 2: không có SharedWorker (Worker thường do khung ứng dụng giữ)');
  noShared = true;
  page.problems.length = 0;
  await page.ev(`location.href = ${JSON.stringify(APP + '/BeinIOS/index.html?lan=2#dash')}; true`);
  await sleep(500);
  await page.until(() => document.readyState === 'complete' && typeof SharedWorker === 'undefined' && !!window.__beinHost, 10000);
  await page.until(() => /Nhóm Thử BeinIOS/.test(document.getElementById('f-dash').contentDocument?.body?.innerText || ''), 15000);
  const r = await page.ev(frame('f-dash', "chrome.runtime.sendMessage({ type: 'scan', source: 'dashboard' })"));
  ok(JSON.stringify(r?.snapshot?.groups || []).includes('Nhóm Thử BeinIOS'), 'lệnh quét gửi qua Worker thường trả kết quả quét có group');
  ok(page.problems.length === 0, 'không có lỗi JavaScript' + (page.problems.length ? ': ' + page.problems.slice(0, 3).join(' | ') : ''));
} catch (e) {
  fails.push(String(e?.message || e));
  console.log('  ✗ ' + (e?.message || e));
  try {
    const file = path.join(SHOTS || tmpdir(), 'beinios-e2e-loi.png');
    await page.shot(file);
    console.log('  ảnh màn hình lúc lỗi: ' + file);
  } catch {}
} finally {
  await page.close();
  site.close();
  proxy.close();
  globalThis.fetch = realFetch;
}
console.log(fails.length ? `\n${fails.length} lỗi` : '\nPWA e2e: tất cả đạt');
process.exit(fails.length ? 1 : 0);
