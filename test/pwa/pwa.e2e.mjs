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
  if (p === 'user/me/profile') return J(200, { code: 'api.ok', data: { id: 'me-e2e', username: 'tester', fullname: 'Người Thử', avatar: '' } });
  if (p === 'group/me/permissions') return J(200, { code: 'api.ok', data: { communities: { c1: ['manage', 'ban_member'] }, groups: { g1: ['role_COMMUNITY_ADMIN', 'approve_reject_jr', 'remove_member'] } } });
  if (p === 'group/groups/g1') return J(200, { code: 'api.ok', data: { id: 'g1', name: 'Nhóm Thử BeinIOS', communityId: 'c1', isCommunity: true, level: 0, privacy: 'OPEN', userCount: 42, settings: { isJoinApproval: true } } });
  if (/join-requests/.test(p)) return J(200, { code: 'api.ok', data: withRequest ? [{ id: 'jr1', userId: 'u9', createdAt: new Date().toISOString(), answers: [], user: { id: 'u9', username: 'nguoimoi', fullname: 'Người Mới', avatar: '' } }] : [] });
  return J(200, { code: 'api.ok', data: { list: [], meta: {} } });
}
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (/^https:\/\/[a-z]+\.beincom\.com\//.test(String(url)) ? beincom(url, init) : realFetch(url, init));

// ---------- Cloudflare proxy thật, chạy trong Node ----------
const { default: proxyWorker, Handoff } = await import('../../cloudflare-proxy/worker.js');
// Durable Object giả cho chuyển nhanh (/handoff)
const hoObjects = new Map();
const HANDOFF = {
  idFromName: (n) => n,
  get(id) {
    if (!hoObjects.has(id)) {
      const data = new Map();
      hoObjects.set(id, new Handoff({ storage: { put: async (o) => Object.entries(o).forEach(([k, v]) => data.set(k, v)), get: async (ks) => new Map(ks.filter((k) => data.has(k)).map((k) => [k, data.get(k)])), deleteAll: async () => data.clear(), setAlarm: async () => {} } }));
    }
    const obj = hoObjects.get(id);
    return { fetch: (u, init) => obj.fetch(new Request(u, init)) };
  },
};
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

// Địa chỉ không phải proxy: notProxyCors -> 404 cho mọi trang đọc (như Cloudflare Pages); còn lại 404 trống không CORS
// (như Worker chạy cả repo dạng trang tĩnh)
let notProxyCors = false;
const notProxy = http.createServer((req, res) => (notProxyCors ? res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html' }).end('<h1>404</h1>') : res.writeHead(404).end()));

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const sitePort = await listen(site);
const proxyPort = await listen(proxy);
const notProxyPort = await listen(notProxy);
const APP = `http://127.0.0.1:${sitePort}`;
ENV = { PROXY_KEY: KEY, ALLOWED_ORIGIN: APP, HANDOFF };

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
  const fill = (key, api, chat, url = `http://127.0.0.1:${proxyPort}/`) =>
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
      url,
      key,
      api,
      chat,
    );
  await fill('sai-khoa', '', '', `http://127.0.0.1:${notProxyPort}/`);
  await page.until(() => /Worker đang phát cả repo/.test(document.getElementById('result').textContent), 8000);
  ok(true, 'Worker phát cả repo (404 trống): Cài đặt chỉ cách sửa');
  notProxyCors = true;
  await fill('sai-khoa', '', '', `http://127.0.0.1:${notProxyPort}/`);
  await page.until(() => /không phải proxy BeinIOS \(trả 404\)/.test(document.getElementById('result').textContent), 8000);
  ok(true, 'địa chỉ trả 404 đọc được (như Cloudflare Pages): báo "không phải proxy BeinIOS"');
  await fill('sai-khoa', '', '', `http://127.0.0.1:${proxyPort}/proxy?x=1`);
  await page.until(() => /khoá proxy không khớp/.test(document.getElementById('result').textContent), 8000);
  ok((await page.ev("document.getElementById('proxy-url').value")) === `http://127.0.0.1:${proxyPort}`, 'sai khoá proxy: báo "không khớp"; địa chỉ dán thừa đường dẫn được rút về gốc');

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
  await page.until(() => /\d/.test(document.getElementById('badge').textContent), 8000).catch(() => {}); // nền gộp các lần ghi, 1,5 giây sau mới tính huy hiệu
  const badge = await page.ev("document.getElementById('badge').textContent");
  ok(/\d/.test(badge), `huy hiệu tab Quản trị: "${badge}"`);

  ok(!(await page.ev("document.body.innerText.includes('Lỗi trong addon')")), 'không có lỗi "Lỗi trong addon" hiện ra');
  ok(page.problems.length === 0, 'không có lỗi JavaScript' + (page.problems.length ? ': ' + page.problems.slice(0, 3).join(' | ') : ''));

  const reg = await page.ev("navigator.serviceWorker.getRegistration().then((r) => !!r)");
  ok(reg, 'service worker đã đăng ký');

  // ---------- Giao diện điện thoại: Cài đặt chung, Tài khoản, nhóm Quản trị, Proxy & Login, nút Login ở Chat / Quản trị ----------
  const isOpen = (view) => `document.getElementById('setup').classList.contains('open') && !document.getElementById('view-${view}').hidden`;
  await page.ev(`document.querySelector('nav button[data-tab="setup"]').click(); true`);
  await page.until(new Function(`return ${isOpen('main')} && document.getElementById('view-login').hidden`), 5000);
  await page.until(() => document.getElementById('login-state').textContent === 'Đã kết nối' && /Người Thử/.test(document.getElementById('acct-name').textContent), 8000);
  const acct = await page.ev(`({ name: document.getElementById('acct-name').textContent, sub: document.getElementById('acct-sub').textContent, dot: document.getElementById('dot').className, admin: [...document.querySelectorAll('#admin-list .row span')].map((x) => x.textContent), scan: document.getElementById('st-scan').textContent })`);
  ok(acct.name === 'Người Thử' && /@tester · Đã đăng nhập/.test(acct.sub) && acct.dot === 'dot', 'Cài đặt chung: thẻ tài khoản (tên Beincom, đã đăng nhập), không chấm cảnh báo khi ổn');
  ok(JSON.stringify(acct.admin) === JSON.stringify(['Hoạt động & quét', 'Tự xử lý', 'Theo dõi & nhắc việc', 'Quy tắc thành viên', 'Quy tắc bài viết']) && acct.scan === 'Chạy thử', 'Cài đặt chung: nhóm Quản trị (5 mục) có trạng thái nhanh');
  const iosVer = readFileSync(path.join(ROOT, 'pwa-shim.js'), 'utf8').match(/const VERSION = '([\d.]+)'/)[1];
  await page.until(() => /bản mới nhất/.test(document.getElementById('ver-note').textContent), 6000);
  const vers = await page.ev(`({ addon: document.getElementById('ver-addon').textContent, ios: document.getElementById('ver-ios').textContent, upd: document.getElementById('upd').hidden })`);
  ok(vers.addon === 'v' + real && vers.ios === iosVer && vers.upd, `Cài đặt › Về: addon BeinFusion v${real}, BeinIOS ${iosVer}, đang là bản mới nhất`);
  await sleep(450);
  await page.ev("document.querySelectorAll('#bein-toasts [role=status]').forEach((t) => t.remove()), true");
  await shot('6-cai-dat-chung');
  // Tài khoản / Hồ sơ cá nhân
  await page.ev(`document.getElementById('acct').click(); true`);
  await page.until(new Function(`return ${isOpen('account')} && /Người Thử/.test(document.getElementById('pf-head').textContent) && document.querySelectorAll('#pf-sections .group-label').length === 2`), 5000);
  const pf = await page.ev(`({ head: document.getElementById('pf-head').innerText.split(String.fromCharCode(10)).join(' | '), info: [...document.querySelectorAll('#pf-info .row')].map((r) => r.querySelector('small').textContent + '=' + r.querySelector('.v').textContent), titles: [...document.querySelectorAll('#pf-sections .group-label')].map((x) => x.textContent), comm: document.querySelector('#pf-sections a.row .two')?.innerText.split(String.fromCharCode(10)).join(' | '), login: document.getElementById('pf-login-state').textContent, link: document.querySelector('#pf-links a.row.accent')?.href, avatar: Math.round(document.querySelector('#pf-head .bein-avatar').getBoundingClientRect().width) })`);
  const pfOk = /NT \| Người Thử \| @tester • Quản trị 1 cộng đồng/.test(pf.head) && pf.avatar === 104 && pf.info[0] === 'Tên đăng nhập=@tester' && pf.info[1] === 'Mã Beincom=me-e2e' && /^Chat Beincom=/.test(pf.info[2] || '') && pf.titles.join(',') === 'Quyền quản trị,Addon' && / \| /.test(pf.comm || '') && pf.login === 'Đã kết nối' && /\/users\/tester$/.test(pf.link || '');
  if (!pfOk) console.log('    (gỡ lỗi)', JSON.stringify(pf));
  ok(pfOk, 'Cài đặt › Tài khoản (kiểu Telegram): avatar lớn, tên, dòng thông tin, quyền quản trị, addon, Proxy & Login');
  await sleep(450);
  await shot('6c-tai-khoan');
  // Cuộn: tên lên giữa thanh trên, avatar mờ dần (thêm khoảng trống cho đủ dài để cuộn — tài khoản thử chỉ có 1 cộng đồng)
  await page.ev(`(() => { const v = document.getElementById('view-account'); v.querySelector(':scope > .wrap').append(Object.assign(document.createElement('div'), { id: 'e2e-pad', style: 'height:600px' })); v.scrollTop = 400; v.dispatchEvent(new Event('scroll')); return true; })()`);
  await page.until(() => document.getElementById('pf-top').classList.contains('scrolled') && document.getElementById('pf-title').textContent === 'Người Thử' && Number(document.querySelector('#pf-head .bein-avatar').style.opacity) < 0.5, 3000);
  ok(true, 'Tài khoản: cuộn xuống thì tên hiện ở thanh trên, avatar thu nhỏ mờ dần');
  await sleep(300);
  await shot('6c2-tai-khoan-cuon');
  await page.ev(`(() => { document.getElementById('e2e-pad').remove(); const v = document.getElementById('view-account'); v.scrollTop = 0; v.dispatchEvent(new Event('scroll')); return true; })()`);
  await page.ev(`document.getElementById('pf-login').click(); true`);
  await page.until(new Function(`return ${isOpen('login')}`), 3000);
  const stx = await page.ev(`({ proxy: document.getElementById('st-proxy').textContent, login: document.getElementById('st-login').textContent, url: document.getElementById('proxy-url').value })`);
  ok(stx.proxy === '127.0.0.1' && stx.login === 'Đã kết nối' && stx.url === 'http://127.0.0.1:' + proxyPort, 'Proxy & Login: trang con có trạng thái proxy / đăng nhập');
  await sleep(450);
  await page.ev("document.querySelectorAll('#bein-toasts [role=status]').forEach((t) => t.remove()), true");
  await shot('7-proxy-login');
  if (SHOTS) {
    // Chế độ tối (chỉ khi chụp màn hình để xem bằng mắt)
    await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await page.ev(`document.getElementById('back').click(); true`);
    await sleep(450);
    await shot('6b-cai-dat-toi');
    await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  }
  await page.ev(`document.getElementById('back').click(); true`);
  await page.until(new Function(`return ${isOpen('main')}`), 3000);
  // Một nhóm Quản trị: trang cài đặt thật của addon, chỉ hiện nhóm đang chọn
  const embedSees = (sel) => `(() => { const d = document.getElementById('f-set').contentDocument; const e = d && d.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0; })()`;
  await page.ev(`document.querySelector('[data-sec="rules"]').click(); true`);
  await page.until(new Function(`return ${isOpen('dset')} && document.getElementById('f-set').classList.contains('ready') && ${embedSees('#rules')}`), 15000);
  const rulesView = await page.ev(`({ title: document.getElementById('dset-title').textContent, scope: ${embedSees('#rules-scope')}, post: ${embedSees('#post-rules')}, settings: ${embedSees('#settings')}, top: ${embedSees('.topbar')}, tabs: ${embedSees('#tabs')}, dlg: !!document.getElementById('f-set').contentDocument.querySelector('dialog[open]') })`);
  ok(rulesView.title === 'Quy tắc thành viên' && rulesView.scope && !rulesView.post && !rulesView.settings && !rulesView.top && !rulesView.tabs && !rulesView.dlg, 'Cài đặt › Quy tắc thành viên: chỉ phạm vi + quy tắc thành viên (không thanh trên, không tab, không hộp tự mở)');
  await sleep(300);
  await shot('6d-quy-tac');
  await page.ev(`document.querySelector('#view-dset [data-back]').click(); document.querySelector('[data-sec="tg"]').click(); true`);
  await page.until(new Function(`return ${isOpen('dset')} && ${embedSees('#settings .tg-group')}`), 5000);
  const tgView = await page.ev(`({ title: document.getElementById('dset-title').textContent, grp: ${embedSees('#settings-group')}, chat: ${embedSees('#settings .chat-group')}, rules: ${embedSees('.rules-col')}, head: ${embedSees('#settings > .card-head h2')} })`);
  ok(tgView.title === 'Telegram' && !tgView.grp && !tgView.chat && !tgView.rules && !tgView.head, 'Cài đặt › Telegram: chỉ nhóm Telegram');
  await page.ev(`document.querySelector('#view-dset [data-back]').click(); document.querySelector('[data-sec="scan"]').click(); true`);
  await page.until(new Function(`return ${isOpen('dset')} && ${embedSees('#scanComments')} && !${embedSees('#autoApprove')}`), 5000);
  const scanBefore = await page.ev(`BeinPWA.page.store.get('local', ['settings']).then((r) => !!r.settings?.scanComments)`);
  await page.ev(`document.getElementById('f-set').contentDocument.getElementById('scanComments').click(); true`);
  await page.until(new Function('b', `return BeinPWA.page.store.get('local', ['settings']).then((r) => !!r.settings?.scanComments !== b)`), 5000, scanBefore);
  ok(true, 'Cài đặt › Hoạt động & quét: bật / tắt một mục là lưu cài đặt thật của addon');
  await page.ev(`document.querySelector('#view-dset [data-close]').click(); true`);
  await page.until(() => !document.getElementById('setup').classList.contains('open'), 3000);

  // Quản trị: không còn tab Quy tắc & cài đặt; chỗ nào mở tab đó thì mở Cài đặt; góc trên có Login + avatar Hồ sơ cá nhân
  await page.ev(`document.querySelector('nav button[data-tab="dash"]').click(); true`);
  await page.until(() => !!document.getElementById('f-dash').contentDocument?.querySelector('.topbar .bein-acct .me-btn:not([hidden]) .me-av'), 10000);
  const dashUi = await page.ev(frame('f-dash', "({ login: !!document.querySelector('.bein-acct .bein-login'), me: document.querySelector('.bein-acct .me-btn .me-av')?.textContent, chatBtn: getComputedStyle(document.getElementById('btn-chat-page')).display, setTab: getComputedStyle(document.querySelector('#tabs [data-tab=\"settings\"]')).display })"));
  ok(dashUi.login && dashUi.me === 'NT' && dashUi.chatBtn === 'none' && dashUi.setTab === 'none', 'Quản trị: góc trên có Login + avatar, ẩn nút Chat và tab Quy tắc & cài đặt');
  await page.ev(frame('f-dash', "showTab('settings'), true"));
  await page.until(new Function(`return ${isOpen('main')} && /tab=overview/.test(document.getElementById('f-dash').contentWindow.location.hash)`), 4000);
  ok(true, 'Quản trị: mở tab Quy tắc & cài đặt (từ chỗ khác) -> mở Cài đặt của ứng dụng');
  await page.ev(`document.getElementById('close').click(); true`);
  await page.ev(`document.getElementById('f-dash').contentWindow.location.hash = '#tab=overview'; true`);
  await sleep(400);
  await shot('8-quan-tri');
  await page.ev(frame('f-dash', "document.querySelector('.bein-acct .bein-login').click(), true"));
  await page.until(new Function(`return ${isOpen('login')}`), 3000);
  await page.ev(`document.getElementById('close-login').click(); true`);
  await page.ev(frame('f-dash', "document.querySelector('.bein-acct .me-btn').click(), true"));
  await page.until(new Function(`return ${isOpen('account')} && !document.getElementById('f-dash').contentDocument.getElementById('me-card')?.open`), 5000);
  ok(true, 'Quản trị: nút Login mở Proxy & Login, avatar mở Cài đặt › Tài khoản (không mở hộp của addon)');
  await page.ev(`document.querySelector('#view-account [data-close]').click(); true`);
  await page.ev(`document.querySelector('nav button[data-tab="chat"]').click(); true`);
  // Chat (BeinFusion theme): nút Dashboard đổi thành Login; bấm dòng tài khoản -> Hồ sơ cá nhân
  const chatUi = await page.ev(frame('f-chat', "({ dash: !!document.querySelector('.head-actions a[href=\"dashboard.html\"]'), login: !!document.querySelector('.head-actions .bein-login') })"));
  ok(!chatUi.dash && chatUi.login, 'Chat (BeinFusion theme): nút Dashboard đổi thành Login');
  await page.ev(frame('f-chat', "document.querySelector('.head-actions .bein-login').click(), true"));
  await page.until(new Function(`return ${isOpen('login')}`), 3000);
  await page.ev(`document.getElementById('close-login').click(); true`);
  ok(true, 'Chat: nút Login mở Proxy & Login');
  await page.ev(frame('f-chat', "document.getElementById('me').click(), true"));
  await page.until(new Function(`return ${isOpen('account')} && !document.getElementById('f-chat').contentDocument.getElementById('person')?.open`), 5000);
  ok(true, 'Chat: bấm dòng tài khoản mở Cài đặt › Tài khoản');
  await page.ev(`document.querySelector('#view-account [data-close]').click(); true`);
  await page.ev(frame('f-chat', "document.getElementById('cnt-unread').textContent = '3', true"));
  await page.until(() => document.getElementById('badge-chat').textContent === '3', 3000);
  await page.ev(frame('f-chat', "document.getElementById('cnt-unread').textContent = '', true"));
  await page.until(() => document.getElementById('badge-chat').textContent === '', 3000);
  ok(true, 'số tin chưa đọc của Chat hiện trên tab Chat ở thanh dưới');
  // Chat (Silk): nút Dashboard cạnh avatar đổi thành Login; avatar mở Hồ sơ cá nhân
  await page.ev(`BeinPWA.page.store.set('local', { chatLook: { ui: 'silk' } }).then(() => true)`);
  await page.until(() => !!document.getElementById('f-chat').contentDocument?.querySelector('.space-actions .bein-login'), 6000);
  const silk = await page.ev(frame('f-chat', "({ dash: !!document.querySelector('.space-actions a[href=\"dashboard.html\"]'), me: !!document.querySelector('.space-actions button.space-me') })"));
  ok(!silk.dash && silk.me, 'Chat (Silk): nút Dashboard cạnh avatar đổi thành Login, avatar là nút');
  await sleep(300);
  await shot('9-chat-silk');
  await page.ev(frame('f-chat', "document.querySelector('.space-actions .space-me').click(), true"));
  await page.until(new Function(`return ${isOpen('account')} && !document.getElementById('f-chat').contentDocument.getElementById('person')?.open`), 5000);
  await page.ev(`document.querySelector('#view-account [data-close]').click(); true`);
  ok(true, 'Chat (Silk): avatar mở Cài đặt › Tài khoản');
  await page.ev(`BeinPWA.page.store.set('local', { chatLook: { ui: 'theme' } }).then(() => true)`);
  // Cài đặt → Giao diện Chat
  await page.ev(`document.querySelector('nav button[data-tab="setup"]').click(); true`);
  await page.until(new Function(`return ${isOpen('main')}`), 3000);
  await page.ev(`document.getElementById('go-look').click(); true`);
  await page.until(() => !!document.getElementById('f-chat').contentDocument?.getElementById('look')?.open && !document.getElementById('setup').classList.contains('open'), 5000);
  ok(true, 'Cài đặt → Giao diện Chat: mở bảng Giao diện của trang Chat');
  await page.ev(frame('f-chat', "document.getElementById('look').close(), true"));
  // Cài đặt → Addon BeinFusion: bảng Có gì mới của addon ở Quản trị
  await page.ev(`document.querySelector('nav button[data-tab="setup"]').click(); true`);
  await page.until(new Function(`return ${isOpen('main')}`), 3000);
  await page.ev(`document.getElementById('go-whatsnew').click(); true`);
  await page.until(() => document.querySelector('nav button.on')?.dataset.tab === 'dash' && !!document.getElementById('f-dash').contentDocument?.getElementById('whatsnew')?.open, 8000);
  ok(true, 'Cài đặt → Addon BeinFusion: mở bảng Có gì mới của addon ở Quản trị');
  await page.ev(frame('f-dash', "document.getElementById('whatsnew').close(), true"));

  // ---------- Dán từ addon (addon BeinFusion → Chuyển đăng nhập sang BeinIOS) ----------
  // Đoạn như addon tạo: phiên cũ (sid=old2) + cookie máy chủ đăng nhập (rt=r1) -> BeinIOS phải tự làm mới bằng ô auth
  const transfer = 'BEINIOS1.' + Buffer.from(JSON.stringify({ v: 1, t: Date.now(), c: [['sid', 'old2', 5], ['Bic.Auth.deviceId', 'dev-addon', 5], ['rt', 'r1', 4], ['MMAUTHTOKEN', 'm1', 2]] })).toString('base64url');
  await page.ev(`document.querySelector('nav button[data-tab="setup"]').click(); true`);
  await page.until(() => document.getElementById('setup').classList.contains('open'), 5000);
  await page.ev(`document.getElementById('go-login').click(); true`);
  await page.until(() => !document.getElementById('view-login').hidden, 3000);
  await page.ev(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '' } }); document.getElementById('paste-addon').click(); true`);
  await page.until(() => !document.getElementById('addon-text').hidden, 5000);
  ok(true, 'Dán từ addon khi bộ nhớ tạm trống: hiện ô để dán tay');
  const n1 = upstream.length;
  await page.call((t) => (Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => t } }), document.getElementById('paste-addon').click(), true), transfer);
  await page.until(() => /Chat Beincom OK/.test(document.getElementById('result').textContent) && /Đang quét Beincom/.test(document.getElementById('result').textContent), 15000);
  const res2 = await page.ev(`document.getElementById('result').textContent`);
  ok(/Đã nhận đăng nhập từ addon/.test(res2) && /có quyền ở 1 cộng đồng/.test(res2), 'Dán từ addon: nhận đăng nhập, kiểm tra Beincom + Chat OK');
  const jars = await page.ev('BeinPWA.page.net.config.jars');
  ok(jars.api.sid === 'good' && jars.auth.rt === 'r1' && jars.auth.sid === 'good' && jars.chat.MMAUTHTOKEN === 'm1', 'phiên cũ từ addon được làm mới, cookie mới về đủ ba ô');
  const ref2 = upstream.slice(n1).filter((x) => x.host === 'auth.beincom.com');
  ok(ref2.length === 1 && COOKIE(ref2[0].headers).rt === 'r1' && JSON.parse(ref2[0].body).deviceId === 'dev-addon', 'làm mới phiên gửi cookie máy chủ đăng nhập (ô auth) và deviceId của addon');
  const saved = await page.ev(`document.getElementById('saved-all').textContent`);
  ok(/2 cookie Beincom · 2 cookie Chat · 3 cookie máy chủ đăng nhập/.test(saved), 'Cài đặt hiện số cookie đã lưu theo ô: ' + saved);
  await page.ev(`document.getElementById('close').click(); true`);

  // ---------- Trang nhận mã QR (nhap.html) ----------
  await page.ev(`location.href = ${JSON.stringify(APP + '/BeinIOS/nhap.html#')} + ${JSON.stringify(transfer)}; true`);
  await sleep(300);
  await page.until(() => document.readyState === 'complete' && !document.getElementById('actions')?.hidden, 8000);
  const nh = await page.ev(`({ hash: location.hash, href: location.href, info: document.getElementById('info').textContent, worker: !!window.BeinPWA.page })`);
  ok(nh.hash === '' && !nh.href.includes('BEINIOS1'), 'nhap.html xoá đăng nhập khỏi thanh địa chỉ ngay khi mở');
  ok(/2 cookie Beincom · 1 cookie Chat · 3 cookie máy chủ đăng nhập/.test(nh.info) && !nh.worker, 'nhap.html hiện số cookie, không chạy luồng nền');
  await page.ev(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => (window.__copied = t) } }); document.getElementById('copy').click(); true`);
  await page.until(() => !!window.__copied, 5000);
  ok((await page.ev('window.__copied')) === transfer, 'nút Chép chép đúng đoạn để dán vào ứng dụng');
  await page.ev(`location.href = ${JSON.stringify(APP + '/BeinIOS/nhap.html?lan=2#hong')}; true`); // ?: tải trang mới (đổi # thôi thì không tải lại)
  await sleep(300);
  await page.until(() => document.readyState === 'complete' && /không có đăng nhập hợp lệ/.test(document.getElementById('info')?.textContent || ''), 8000);
  ok(true, 'nhap.html với link hỏng: báo tạo mã mới');

  // ---------- Mã QR ngắn (chuyển nhanh qua proxy): addon mã hoá, gửi lên; iPhone mở nhap.html#h=…&p=… ----------
  const b64u = (b) => Buffer.from(b).toString('base64url');
  const hoKey = crypto.getRandomValues(new Uint8Array(32));
  const hoIv = crypto.getRandomValues(new Uint8Array(12));
  const hoId = b64u(crypto.getRandomValues(new Uint8Array(12)));
  const ck = await crypto.subtle.importKey('raw', hoKey, 'AES-GCM', false, ['encrypt']);
  const sealed = b64u(hoIv) + '.' + b64u(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: hoIv }, ck, new TextEncoder().encode(transfer))));
  const put = await fetch(`http://127.0.0.1:${proxyPort}/handoff`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-beinios-key': KEY, Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' }, body: JSON.stringify({ id: hoId, payload: sealed }) });
  ok(put.status === 200, 'addon gửi bản mã hoá lên proxy (mã proxy thật)');
  const hoLink = `${APP}/BeinIOS/nhap.html?lan=3#h=${hoId}.${b64u(hoKey)}&p=${encodeURIComponent('http://127.0.0.1:' + proxyPort)}`;
  const n2 = upstream.length;
  await page.ev(`location.href = ${JSON.stringify(hoLink)}; true`);
  await sleep(300);
  await page.until(() => document.readyState === 'complete' && /Đã nhận đăng nhập/.test(document.getElementById('info')?.textContent || ''), 10000);
  const nh2 = await page.ev(`({ hash: location.hash, info: document.getElementById('info').textContent })`);
  ok(nh2.hash === '' && /2 cookie Beincom · 1 cookie Chat · 3 cookie máy chủ đăng nhập/.test(nh2.info), 'nhap.html với mã ngắn: lấy về, giải mã đúng, xoá mã khỏi thanh địa chỉ');
  ok(upstream.length === n2, 'lấy mã không gọi Beincom');
  await page.ev(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => (window.__copied = t) } }); document.getElementById('copy').click(); true`);
  await page.until(() => !!window.__copied, 5000);
  ok((await page.ev('window.__copied')) === transfer, 'nút Chép chép đúng đoạn đăng nhập (để Dán từ addon trong ứng dụng)');
  await page.ev(`location.href = ${JSON.stringify(hoLink.replace('lan=3', 'lan=4'))}; true`);
  await sleep(300);
  await page.until(() => document.readyState === 'complete' && /Mã đã dùng/.test(document.getElementById('info')?.textContent || ''), 10000);
  ok(true, 'quét lại mã đã dùng: báo tạo mã mới');

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
    console.log('  Cài đặt đang báo: ' + (await page.ev("document.getElementById('result')?.textContent || ''").catch(() => '')));
    const file = path.join(SHOTS || tmpdir(), 'beinios-e2e-loi.png');
    await page.shot(file);
    console.log('  ảnh màn hình lúc lỗi: ' + file);
  } catch {}
} finally {
  await page.close();
  site.close();
  proxy.close();
  notProxy.close();
  globalThis.fetch = realFetch;
}
console.log(fails.length ? `\n${fails.length} lỗi` : '\nPWA e2e: tất cả đạt');
process.exit(fails.length ? 1 : 0);
