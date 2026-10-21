// Kiểm tra lớp webapp BeinIOS: kho lưu trữ chung (pwa-shim.js), cookie, gọi Beincom qua proxy, và Cloudflare proxy
const test = require('node:test');
const assert = require('node:assert/strict');
require('../pwa-shim.js');
const PWA = globalThis.BeinPWA;

const tick = () => new Promise((r) => setTimeout(r, 5));

// Cặp kênh giả thay BroadcastChannel: tin của một bên tới các bên còn lại
function channels(n) {
  const list = Array.from({ length: n }, () => ({ onmessage: null }));
  for (const c of list) c.postMessage = (data) => list.filter((x) => x !== c).forEach((x) => setTimeout(() => x.onmessage?.({ data }), 0));
  return list;
}

// ---------- Kho lưu trữ ----------

test('kho: get theo chuỗi / mảng / mặc định / tất cả, như chrome.storage', async () => {
  const s = PWA.createStore({ backend: PWA.memBackend() });
  const local = s.area('local');
  await local.set({ a: 1, b: { x: [1, 2] }, c: 'chữ', u: undefined });
  assert.deepEqual(await local.get('a'), { a: 1 });
  assert.deepEqual(await local.get(['a', 'b', 'khong']), { a: 1, b: { x: [1, 2] } });
  assert.deepEqual(await local.get({ a: 0, z: 9 }), { a: 1, z: 9 });
  assert.deepEqual(await local.get(null), { a: 1, b: { x: [1, 2] }, c: 'chữ' });
  assert.deepEqual(await local.get(), { a: 1, b: { x: [1, 2] }, c: 'chữ' });
  // Bản đọc ra là bản sao
  const one = await local.get('b');
  one.b.x.push(3);
  assert.deepEqual((await local.get('b')).b, { x: [1, 2] });
  // Vùng sync tách riêng
  assert.deepEqual(await s.area('sync').get(null), {});
  await local.remove(['a', 'c']);
  assert.deepEqual(Object.keys(await local.get(null)), ['b']);
  await local.clear();
  assert.deepEqual(await local.get(null), {});
});

test('kho: callback kiểu cũ và getBytesInUse', async () => {
  const s = PWA.createStore({ backend: PWA.memBackend() });
  const local = s.area('local');
  await new Promise((r) => local.set({ k: 'abc' }, r));
  const got = await new Promise((r) => local.get('k', r));
  assert.deepEqual(got, { k: 'abc' });
  assert.equal(await local.getBytesInUse(null), 'k'.length + '"abc"'.length);
  assert.equal(await local.getBytesInUse(['k']), 6);
  assert.equal(await local.getBytesInUse(['khac']), 0);
});

test('kho: onChanged có giá trị cũ / mới, không báo khi không đổi, vùng pwa không lọt vào chrome.storage', async () => {
  const s = PWA.createStore({ backend: PWA.memBackend() });
  const chromeStorage = s.chromeStorage();
  const seen = [];
  chromeStorage.onChanged.addListener((changes, area) => seen.push({ area, changes }));
  await chromeStorage.local.set({ settings: { intervalMin: 5 } });
  await tick();
  await chromeStorage.local.set({ settings: { intervalMin: 10 } });
  await tick();
  await chromeStorage.local.set({ settings: { intervalMin: 10 } }); // không đổi
  await s.set('pwa', { config: { proxyUrl: 'x' } });
  await chromeStorage.local.remove('settings');
  await tick();
  assert.equal(seen.length, 3);
  assert.equal(seen[0].changes.settings.oldValue, undefined);
  assert.deepEqual(seen[0].changes.settings.newValue, { intervalMin: 5 });
  const { oldValue = {}, newValue = {} } = seen[1].changes.settings;
  assert.equal(oldValue.intervalMin, 5);
  assert.equal(newValue.intervalMin, 10);
  assert.ok(!('newValue' in seen[2].changes.settings));
  assert.equal(seen[2].changes.settings.oldValue.intervalMin, 10);
  assert.ok(seen.every((x) => x.area === 'local'));
});

test('kho: hai nơi dùng chung một kho báo thay đổi cho nhau qua kênh', async () => {
  const backend = PWA.memBackend();
  const [c1, c2] = channels(2);
  const page = PWA.createStore({ backend, channel: c1 });
  const worker = PWA.createStore({ backend, channel: c2 });
  const got = [];
  worker.chromeStorage().onChanged.addListener((changes, area) => got.push([area, Object.keys(changes), changes.chatLook?.newValue]));
  await page.chromeStorage().local.set({ chatLook: { ui: 'silk' } });
  await tick();
  assert.deepEqual(got, [['local', ['chatLook'], { ui: 'silk' }]]);
  assert.deepEqual(await worker.area('local').get('chatLook'), { chatLook: { ui: 'silk' } });
});

// ---------- Cookie ----------

test('cookie: đọc dòng Cookie, cURL bash, cURL cmd của Windows', () => {
  assert.deepEqual(PWA.parseCookieInput('Cookie: a=1; b=x=y; c='), { jar: { a: '1', b: 'x=y', c: '' }, host: '' });
  assert.deepEqual(PWA.parseCookieInput('a=1;b=2').jar, { a: '1', b: '2' });
  const bash = `curl 'https://api.beincom.com/v1/group/me/permissions' \\\n  -H 'accept: application/json' \\\n  -b 'sid=abc; Bic.Auth.deviceId=dev%201' \\\n  -H 'x-application: BIC_GROUP'`;
  assert.deepEqual(PWA.parseCookieInput(bash), { jar: { sid: 'abc', 'Bic.Auth.deviceId': 'dev%201' }, host: 'api.beincom.com' });
  const header = `curl 'https://chat.beincom.com/api/v4/users/me' -H 'cookie: MMAUTHTOKEN=t1; MMUSERID=u1' -H 'x-requested-with: XMLHttpRequest'`;
  assert.deepEqual(PWA.parseCookieInput(header), { jar: { MMAUTHTOKEN: 't1', MMUSERID: 'u1' }, host: 'chat.beincom.com' });
  const cmd = `curl ^"https://api.beincom.com/v1/x^" ^\n  -b ^"sid=abc^; other=1^" ^\n  -H ^"accept: */*^"`;
  assert.deepEqual(PWA.parseCookieInput(cmd).jar, { sid: 'abc', other: '1' });
  assert.deepEqual(PWA.parseCookieInput('   ').jar, {});
});

test('cookie: Set-Cookie chung .beincom.com cập nhật cả hai ô; riêng chat chỉ ô Chat; hết hạn thì xoá', () => {
  const jars = { api: { sid: 'old', keep: '1' }, chat: { sid: 'old', MMAUTHTOKEN: 'c1' } };
  const now = Date.parse('2026-10-16T00:00:00Z');
  const next = PWA.applySetCookies(jars, 'auth.beincom.com', ['sid=new; Domain=.beincom.com; Path=/; HttpOnly; Secure', 'keep=; Max-Age=0; Domain=beincom.com'], now);
  assert.deepEqual(next, { api: { sid: 'new' }, chat: { sid: 'new', MMAUTHTOKEN: 'c1' }, auth: {} });
  assert.deepEqual(jars.api, { sid: 'old', keep: '1' }); // không sửa bản cũ
  const chat = PWA.applySetCookies(next, 'chat.beincom.com', ['MMAUTHTOKEN=c2; Path=/; HttpOnly', 'MMCSRF=z; Expires=Thu, 01 Jan 2026 00:00:00 GMT'], now);
  assert.deepEqual(chat.chat, { sid: 'new', MMAUTHTOKEN: 'c2' });
  assert.equal(PWA.applySetCookies(chat, 'api.beincom.com', ['sid=new; Domain=.beincom.com']), null); // không đổi gì
});

// Đoạn mẫu cố định: addon BeinFusion (test/transfer.test.js) tạo đúng đoạn này từ
// api: sid=S1 · chat: MMAUTHTOKEN=M1 · auth: sid=S1, rt=R1 (t = 1792000000000)
const ADDON_SAMPLE = 'BEINIOS1.eyJ2IjoxLCJ0IjoxNzkyMDAwMDAwMDAwLCJjIjpbWyJzaWQiLCJTMSIsNV0sWyJNTUFVVEhUT0tFTiIsIk0xIiwyXSxbInJ0IiwiUjEiLDRdXX0';

test('dán từ addon: đọc đúng đoạn của addon (cả link nhap.html#…, chữ thừa), đoạn hỏng / không có cookie -> null', () => {
  const want = { at: 1792000000000, api: { sid: 'S1' }, chat: { MMAUTHTOKEN: 'M1' }, auth: { sid: 'S1', rt: 'R1' } };
  assert.deepEqual(PWA.parseTransfer(ADDON_SAMPLE), want);
  assert.deepEqual(PWA.parseTransfer('https://phungnhan.github.io/BeinIOS/nhap.html#' + ADDON_SAMPLE), want);
  assert.deepEqual(PWA.parseTransfer('Đăng nhập:\n ' + ADDON_SAMPLE + ' \n'), want);
  // Chuyển qua Ghi chú / tin nhắn / email trên iPhone hay chèn xuống dòng, khoảng trắng, hoặc đổi '-' thành gạch dài
  const body = ADDON_SAMPLE.slice('BEINIOS1.'.length);
  assert.deepEqual(PWA.parseTransfer('BEINIOS1.' + body.slice(0, 10) + '\n' + body.slice(10, 20) + ' \r\n\t' + body.slice(20)), want, 'bỏ xuống dòng / khoảng trắng lẫn vào giữa');
  assert.deepEqual(PWA.parseTransfer('BEINIOS1.' + body + '\u00a0'), want, 'bỏ khoảng trắng không ngắt');
  assert.equal(PWA.parseTransfer('BEINIOS1.@@@'), null);
  assert.equal(PWA.parseTransfer('sid=abc'), null);
  assert.equal(PWA.parseTransfer('BEINIOS1.' + Buffer.from(JSON.stringify({ v: 1, t: 1, c: [['rt', 'x', 4]] })).toString('base64url')), null);
});

test('ô cookie theo máy chủ: chat / auth trống thì dùng ô Beincom; Set-Cookie chung cập nhật mọi ô đang dùng', () => {
  const jars = { api: { sid: 'a' }, chat: {}, auth: { sid: 'a', rt: 'r' } };
  assert.equal(PWA.jarFor(jars, 'api.beincom.com'), 'api');
  assert.equal(PWA.jarFor(jars, 'group.beincom.com'), 'api');
  assert.equal(PWA.jarFor(jars, 'chat.beincom.com'), 'api');
  assert.equal(PWA.jarFor(jars, 'auth.beincom.com'), 'auth');
  assert.equal(PWA.jarFor({ api: { sid: 'a' } }, 'auth.beincom.com'), 'api');
  const next = PWA.applySetCookies(jars, 'auth.beincom.com', ['sid=b; Domain=.beincom.com', 'rt=r2; Path=/v1/auth']);
  assert.deepEqual(next, { api: { sid: 'b' }, chat: {}, auth: { sid: 'b', rt: 'r2' } });
});

// ---------- Gọi Beincom qua proxy ----------

function fakeNet({ config, reply }) {
  const store = PWA.createStore({ backend: PWA.memBackend() });
  const calls = [];
  const rawFetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: new Headers(init.headers || {}), body: init.body, credentials: init.credentials };
    calls.push(call);
    return reply(call, calls);
  };
  const net = PWA.createNet({ store, rawFetch });
  return { store, net, calls, ready: config ? store.set('pwa', { config }) : Promise.resolve() };
}
const target = (call) => new URL(call.url).searchParams.get('url');
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const CFG = { proxyUrl: 'https://px.example.workers.dev/', proxyKey: 'k1', jars: { api: { sid: 'a1', 'Bic.Auth.deviceId': 'dev%2042' }, chat: {} } };

test('proxy: địa chỉ khác Beincom đi thẳng; chưa cài proxy thì báo lỗi', async () => {
  const f = fakeNet({ reply: () => json(200, {}) });
  await f.ready;
  await f.net.fetch('https://api.telegram.org/botX/getMe');
  assert.equal(f.calls[0].url, 'https://api.telegram.org/botX/getMe');
  await assert.rejects(() => f.net.fetch('https://api.beincom.com/v1/group/me/permissions'), /chưa cài proxy/);
  assert.equal(f.calls.length, 1);
});

test('proxy: kèm khoá + cookie đúng ô, không gửi cookie trình duyệt; Chat chưa có cookie riêng thì dùng ô Beincom', async () => {
  const f = fakeNet({ config: { ...CFG, jars: { api: { sid: 'a1' }, chat: {} } }, reply: () => json(200, { code: 'api.ok', data: {} }) });
  await f.ready;
  const r = await f.net.fetch('https://api.beincom.com/v1/group/me/permissions', { credentials: 'include', headers: { 'x-application': 'BIC_GROUP' } });
  assert.equal(r.status, 200);
  const c = f.calls[0];
  assert.equal(c.url, 'https://px.example.workers.dev/proxy?url=' + encodeURIComponent('https://api.beincom.com/v1/group/me/permissions'));
  assert.equal(c.credentials, 'omit');
  assert.equal(c.headers.get('x-beinios-key'), 'k1');
  assert.equal(c.headers.get('x-bein-cookie'), 'sid=a1');
  assert.equal(c.headers.get('x-application'), 'BIC_GROUP');
  await f.net.fetch('https://chat.beincom.com/api/v4/users/me');
  assert.equal(f.calls[1].headers.get('x-bein-cookie'), 'sid=a1');
  await f.net.saveConfig({ jars: { api: { sid: 'a1' }, chat: { MMAUTHTOKEN: 'm1' } } });
  await f.net.fetch('https://chat.beincom.com/api/v4/users/me');
  assert.equal(f.calls[2].headers.get('x-bein-cookie'), 'MMAUTHTOKEN=m1');
});

test('proxy: cookie mới Beincom gửi về (x-bein-set-cookie) được lưu và dùng cho lần sau', async () => {
  let n = 0;
  const f = fakeNet({ config: CFG, reply: () => (n++ ? json(200, {}) : json(200, {}, { 'x-bein-set-cookie': JSON.stringify(['sid=a2; Domain=.beincom.com; Path=/']) })) });
  await f.ready;
  await f.net.fetch('https://api.beincom.com/v1/a');
  await f.net.fetch('https://api.beincom.com/v1/b');
  assert.match(f.calls[1].headers.get('x-bein-cookie'), /sid=a2/);
  const { config } = await f.store.get('pwa', ['config']);
  assert.equal(config.jars.api.sid, 'a2');
});

test('proxy: hết phiên (401) -> làm mới phiên một lần cho các lệnh cùng lúc, rồi gọi lại', async () => {
  const f = fakeNet({
    config: CFG,
    reply: (call) => {
      const t = target(call);
      if (t.startsWith('https://auth.beincom.com/')) return json(200, { code: 'ok' }, { 'x-bein-set-cookie': JSON.stringify(['sid=fresh; Domain=.beincom.com; Path=/; HttpOnly']) });
      return call.headers.get('x-bein-cookie').includes('sid=fresh') ? json(200, { code: 'api.ok', data: { ok: 1 } }) : json(401, { code: 'unauthorized' });
    },
  });
  await f.ready;
  const [a, b] = await Promise.all([f.net.fetch('https://api.beincom.com/v1/x'), f.net.fetch('https://api.beincom.com/v1/y')]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const refresh = f.calls.filter((c) => target(c) === PWA.AUTH_REFRESH);
  assert.equal(refresh.length, 1);
  assert.equal(refresh[0].method, 'POST');
  assert.equal(refresh[0].headers.get('x-application'), 'BIC_GROUP');
  assert.deepEqual(JSON.parse(refresh[0].body), { deviceId: 'dev 42', deviceName: 'BeinIOS', application: 'BIC_GROUP', platform: 'WEB' });
  assert.match(refresh[0].headers.get('x-bein-cookie'), /sid=a1/);
  assert.equal(f.net.config.jars.api.sid, 'fresh');
});

test('proxy: dán từ addon (có ô auth) -> làm mới phiên gửi cookie của máy chủ đăng nhập, cookie mới về đúng ô', async () => {
  const f = fakeNet({
    config: { ...CFG, jars: { api: { sid: 'a1' }, chat: { MMAUTHTOKEN: 'm1', sid: 'a1' }, auth: { sid: 'a1', rt: 'r1', 'Bic.Auth.deviceId': 'dev%20x' } } },
    reply: (call) => {
      const t = target(call);
      if (t === PWA.AUTH_REFRESH) return json(200, {}, { 'x-bein-set-cookie': JSON.stringify(['sid=a2; Domain=.beincom.com; Path=/; HttpOnly', 'rt=r2; Path=/v1/auth; HttpOnly']) });
      return /sid=a2/.test(call.headers.get('x-bein-cookie')) ? json(200, { ok: 1 }) : json(401, {});
    },
  });
  await f.ready;
  const r = await f.net.fetch('https://api.beincom.com/v1/x');
  assert.equal(r.status, 200);
  const refresh = f.calls.find((c) => target(c) === PWA.AUTH_REFRESH);
  assert.equal(refresh.headers.get('x-bein-cookie'), 'sid=a1; rt=r1; Bic.Auth.deviceId=dev%20x');
  assert.equal(JSON.parse(refresh.body).deviceId, 'dev x');
  assert.deepEqual(f.net.config.jars, { api: { sid: 'a2' }, chat: { MMAUTHTOKEN: 'm1', sid: 'a2' }, auth: { sid: 'a2', rt: 'r2', 'Bic.Auth.deviceId': 'dev%20x' } });
  await f.net.fetch('https://chat.beincom.com/api/v4/users/me');
  assert.equal(f.calls.at(-1).headers.get('x-bein-cookie'), 'MMAUTHTOKEN=m1; sid=a2');
});

test('proxy: làm mới không được -> trả 401 và ghi trạng thái hết phiên; tắt tự làm mới thì không gọi', async () => {
  const f = fakeNet({ config: CFG, reply: () => json(401, {}) });
  await f.ready;
  const r = await f.net.fetch('https://chat.beincom.com/api/v4/users/me');
  assert.equal(r.status, 401);
  assert.equal(f.calls.filter((c) => target(c) === PWA.AUTH_REFRESH).length, 1);
  assert.equal(f.net.config.status.code, 'session');
  assert.equal(f.net.config.status.host, 'chat');

  const g = fakeNet({ config: { ...CFG, refresh: false }, reply: () => json(401, {}) });
  await g.ready;
  await g.net.fetch('https://api.beincom.com/v1/x');
  assert.equal(g.calls.length, 1);
});

test('proxy: lỗi do proxy (sai khoá) không làm mới phiên, ghi lại để Cài đặt báo', async () => {
  const f = fakeNet({ config: CFG, reply: () => json(403, { code: 'key' }, { 'x-bein-proxy-error': 'key' }) });
  await f.ready;
  const r = await f.net.fetch('https://api.beincom.com/v1/x');
  assert.equal(r.status, 403);
  assert.equal(f.calls.length, 1);
  assert.equal(f.net.config.status.code, 'key');
});

// ---------- Cloudflare proxy (cloudflare-proxy/worker.js) ----------

const ENV = { PROXY_KEY: 'secret-123', ALLOWED_ORIGIN: 'https://phungnhan.github.io' };
const APP = 'https://phungnhan.github.io';
async function withUpstream(handler, fn) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method, headers: new Headers(init.headers), body: init.body ? await new Response(init.body).text() : undefined, redirect: init.redirect };
    seen.push(call);
    return handler(call);
  };
  try {
    return await fn(seen);
  } finally {
    globalThis.fetch = real;
  }
}
const proxyReq = (target, { method = 'GET', headers = {}, body, origin = APP } = {}) =>
  new Request('https://px.example.workers.dev/proxy?url=' + encodeURIComponent(target), { method, body, headers: { ...(origin ? { Origin: origin } : {}), ...headers } });

test('proxy Cloudflare: thiếu cài đặt, preflight, trang lạ, kiểm tra khoá', async () => {
  const { default: worker } = await import('../cloudflare-proxy/worker.js');
  const none = await worker.fetch(proxyReq('https://api.beincom.com/v1/x'), {});
  assert.equal(none.status, 500);
  assert.equal(none.headers.get('x-bein-proxy-error'), 'setup');

  const pre = await worker.fetch(new Request('https://px.example.workers.dev/proxy', { method: 'OPTIONS', headers: { Origin: APP, 'Access-Control-Request-Method': 'POST' } }), ENV);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), APP);
  assert.match(pre.headers.get('access-control-allow-headers'), /x-beinios-key/);
  assert.equal(pre.headers.get('access-control-allow-credentials'), null);

  const evilPre = await worker.fetch(new Request('https://px.example.workers.dev/proxy', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), ENV);
  assert.equal(evilPre.status, 403);
  assert.equal(evilPre.headers.get('access-control-allow-origin'), null);
  const evil = await worker.fetch(proxyReq('https://api.beincom.com/v1/x', { origin: 'https://evil.example', headers: { 'x-beinios-key': ENV.PROXY_KEY } }), ENV);
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const h1 = await (await worker.fetch(new Request('https://px.example.workers.dev/health', { headers: { Origin: APP, 'x-beinios-key': ENV.PROXY_KEY } }), ENV)).json();
  assert.equal(h1.status, 'ok');
  assert.equal(h1.key, true);
  const h2 = await (await worker.fetch(new Request('https://px.example.workers.dev/health', { headers: { Origin: APP, 'x-beinios-key': 'sai' } }), ENV)).json();
  assert.equal(h2.key, false);

  const bad = await worker.fetch(proxyReq('https://api.beincom.com/v1/x', { headers: { 'x-beinios-key': 'secret-12' } }), ENV);
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('x-bein-proxy-error'), 'key');
  assert.equal(bad.headers.get('access-control-allow-origin'), APP);
});

test('proxy Cloudflare: chỉ máy chủ Beincom; auth.beincom.com chỉ làm mới phiên', async () => {
  const { default: worker } = await import('../cloudflare-proxy/worker.js');
  await withUpstream(
    () => json(200, { ok: 1 }),
    async (seen) => {
      const key = { 'x-beinios-key': ENV.PROXY_KEY };
      for (const t of ['https://evil.example/x', 'http://api.beincom.com/v1/x', 'https://api.beincom.com.evil.example/x', 'https://beincom.com/x', 'https://api.beincom.com:8443/x']) {
        const r = await worker.fetch(proxyReq(t, { headers: key }), ENV);
        assert.equal(r.status, 403, t);
      }
      assert.equal((await worker.fetch(proxyReq('https://auth.beincom.com/v1/auth/public/http/login', { method: 'POST', body: '{}', headers: key }), ENV)).status, 403);
      assert.equal((await worker.fetch(proxyReq('https://auth.beincom.com/v1/auth/public/http/refresh-session', { headers: key }), ENV)).status, 403);
      assert.equal(seen.length, 0);
      const ok = await worker.fetch(proxyReq('https://auth.beincom.com/v1/auth/public/http/refresh-session', { method: 'POST', body: '{"deviceId":"d"}', headers: { ...key, 'Content-Type': 'application/json' } }), ENV);
      assert.equal(ok.status, 200);
      assert.equal(seen[0].body, '{"deviceId":"d"}');
    },
  );
});

test('proxy Cloudflare: chỉ chuyển header cần thiết, cookie từ x-bein-cookie, gửi lại Set-Cookie, không đi theo chuyển hướng', async () => {
  const { default: worker } = await import('../cloudflare-proxy/worker.js');
  await withUpstream(
    (call) =>
      call.url.endsWith('/redirect')
        ? new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } })
        : new Response('{"code":"api.ok"}', { status: 200, headers: new Headers([['content-type', 'application/json'], ['set-cookie', 'sid=n1; Domain=.beincom.com; Path=/; HttpOnly'], ['set-cookie', 'MMCSRF=c; Path=/'], ['x-internal', 'bi mat']]) }),
    async (seen) => {
      const r = await worker.fetch(
        proxyReq('https://chat.beincom.com/api/v4/users/me', {
          headers: { 'x-beinios-key': ENV.PROXY_KEY, 'x-bein-cookie': 'MMAUTHTOKEN=t; sid=s', 'X-Requested-With': 'XMLHttpRequest', Referer: APP + '/BeinIOS/', 'x-secret-thing': '1', Accept: 'application/json' },
        }),
        ENV,
      );
      assert.equal(r.status, 200);
      const up = seen[0];
      assert.equal(up.url, 'https://chat.beincom.com/api/v4/users/me');
      assert.equal(up.redirect, 'manual');
      assert.equal(up.headers.get('cookie'), 'MMAUTHTOKEN=t; sid=s');
      assert.equal(up.headers.get('x-requested-with'), 'XMLHttpRequest');
      assert.equal(up.headers.get('x-application'), 'BIC_GROUP');
      assert.equal(up.headers.get('x-platform'), 'WEB');
      for (const h of ['origin', 'referer', 'x-secret-thing', 'x-beinios-key', 'x-bein-cookie']) assert.equal(up.headers.get(h), null, h);
      assert.deepEqual(JSON.parse(r.headers.get('x-bein-set-cookie')), ['sid=n1; Domain=.beincom.com; Path=/; HttpOnly', 'MMCSRF=c; Path=/']);
      assert.equal(r.headers.get('set-cookie'), null);
      assert.equal(r.headers.get('x-internal'), null);
      assert.match(r.headers.get('access-control-expose-headers'), /x-bein-set-cookie/);
      assert.equal(await r.text(), '{"code":"api.ok"}');

      const red = await worker.fetch(proxyReq('https://api.beincom.com/v1/redirect', { headers: { 'x-beinios-key': ENV.PROXY_KEY } }), ENV);
      assert.equal(red.status, 502);
      assert.equal(red.headers.get('x-bein-proxy-error'), 'redirect');
    },
  );
});

test('wrangler.toml ở gốc repo (Worker nối repo GitHub) dựng đúng proxy, giống bản trong cloudflare-proxy/', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const val = (toml, key) => toml.match(new RegExp('^' + key + '\\s*=\\s*(.+)$', 'm'))?.[1].trim();
  const root = read('wrangler.toml');
  const sub = read('cloudflare-proxy/wrangler.toml');
  assert.equal(val(root, 'main'), '"cloudflare-proxy/worker.js"');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'cloudflare-proxy', 'worker.js')));
  assert.equal(val(sub, 'main'), '"worker.js"');
  for (const k of ['name', 'compatibility_date', 'workers_dev', 'ALLOWED_ORIGIN', 'enabled']) assert.equal(val(root, k), val(sub, k), k);
  assert.equal(val(root, 'name'), '"beinios-proxy"');
  assert.equal(val(root, 'enabled'), 'false'); // không ghi nhật ký
  assert.ok(!/^\s*\[assets\]/m.test(root), 'không đưa repo lên làm trang tĩnh');
  assert.ok(!/PROXY_KEY\s*=/.test(root + sub), 'khoá không nằm trong tệp');
});

// ---------- Chuyển nhanh qua proxy (/handoff, Durable Object) ----------

// Durable Object giả: mỗi mã số một vật có kho riêng (như Cloudflare)
function fakeHandoffNs(Handoff) {
  const objects = new Map();
  const ns = {
    idFromName: (name) => 'do:' + name,
    get(id) {
      if (!objects.has(id)) {
        const data = new Map();
        const box = { data, alarm: 0 };
        const storage = {
          put: async (o) => Object.entries(o).forEach(([k, v]) => data.set(k, v)),
          get: async (keys) => new Map(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)])),
          deleteAll: async () => data.clear(),
          setAlarm: async (t) => (box.alarm = t),
        };
        box.obj = new Handoff({ storage });
        objects.set(id, box);
      }
      const box = objects.get(id);
      return { fetch: (url, init) => box.obj.fetch(new Request(url, init)) };
    },
  };
  return { ns, objects };
}
const HO_ID = 'AbCdEfGhIjKlMnOp';
const HO_PAYLOAD = 'IvIvIvIvIvIvIvIv.' + 'Q'.repeat(40);
const hoReq = (method, { key, origin = APP, body, id = HO_ID } = {}) =>
  new Request('https://px.example.workers.dev/handoff' + (method === 'GET' ? '?id=' + id : ''), {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(key ? { 'x-beinios-key': key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('chuyển nhanh: gửi lên cần khoá + đúng dạng; lấy về không cần khoá, chỉ một lần; hết giờ thì mất', async () => {
  const mod = await import('../cloudflare-proxy/worker.js');
  const { ns, objects } = fakeHandoffNs(mod.Handoff);
  const env = { ...ENV, HANDOFF: ns };
  const w = mod.default;
  assert.equal((await w.fetch(hoReq('POST', { body: { id: HO_ID, payload: HO_PAYLOAD } }), env)).status, 403, 'thiếu khoá');
  assert.equal((await w.fetch(hoReq('POST', { key: 'sai', body: { id: HO_ID, payload: HO_PAYLOAD } }), env)).status, 403, 'sai khoá');
  for (const bad of [{ id: 'ngan', payload: HO_PAYLOAD }, { id: HO_ID, payload: 'khong-co-cham' }, { id: HO_ID + '!', payload: HO_PAYLOAD }, {}]) {
    assert.equal((await w.fetch(hoReq('POST', { key: ENV.PROXY_KEY, body: bad }), env)).status, 400, JSON.stringify(bad));
  }
  const put = await w.fetch(hoReq('POST', { key: ENV.PROXY_KEY, body: { id: HO_ID, payload: HO_PAYLOAD } }), env);
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { ok: true, ttl: 300 });
  const box = objects.get('do:' + HO_ID);
  assert.ok(box.alarm > Date.now() + 290e3 && box.alarm <= Date.now() + 300e3, 'hẹn giờ tự xoá sau 5 phút');
  const got = await w.fetch(hoReq('GET'), env);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('access-control-allow-origin'), APP);
  assert.deepEqual(await got.json(), { payload: HO_PAYLOAD });
  const again = await w.fetch(hoReq('GET'), env);
  assert.equal(again.status, 404, 'lấy một lần là xoá');
  assert.equal(again.headers.get('x-bein-proxy-error'), 'gone');
  // Hết giờ (đồng hồ của vật đã quá hạn) -> không trả nữa; alarm xoá hết
  await w.fetch(hoReq('POST', { key: ENV.PROXY_KEY, body: { id: HO_ID, payload: HO_PAYLOAD } }), env);
  box.data.set('exp', Date.now() - 1);
  assert.equal((await w.fetch(hoReq('GET'), env)).status, 404);
  await w.fetch(hoReq('POST', { key: ENV.PROXY_KEY, body: { id: HO_ID, payload: HO_PAYLOAD } }), env);
  await box.obj.alarm();
  assert.equal(box.data.size, 0);
  assert.equal((await w.fetch(hoReq('GET', { id: 'x' }), env)).status, 400, 'mã sai dạng');
});

test('chuyển nhanh: addon (chrome-extension://) gọi được /handoff, nhưng vẫn không dùng được /proxy; proxy cũ không có kho thì báo rõ', async () => {
  const mod = await import('../cloudflare-proxy/worker.js');
  const { ns } = fakeHandoffNs(mod.Handoff);
  const env = { ...ENV, HANDOFF: ns };
  const w = mod.default;
  const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const pre = await w.fetch(new Request('https://px.example.workers.dev/handoff', { method: 'OPTIONS', headers: { Origin: EXT, 'Access-Control-Request-Method': 'POST' } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), EXT);
  assert.match(pre.headers.get('access-control-allow-headers'), /x-beinios-key/);
  const put = await w.fetch(hoReq('POST', { key: ENV.PROXY_KEY, origin: EXT, body: { id: HO_ID, payload: HO_PAYLOAD } }), env);
  assert.equal(put.status, 200);
  assert.equal(put.headers.get('access-control-allow-origin'), EXT);
  const prePx = await w.fetch(new Request('https://px.example.workers.dev/proxy', { method: 'OPTIONS', headers: { Origin: EXT } }), env);
  assert.equal(prePx.status, 403);
  assert.equal((await w.fetch(proxyReq('https://api.beincom.com/v1/x', { origin: EXT, headers: { 'x-beinios-key': ENV.PROXY_KEY } }), env)).status, 403);
  const h = await (await w.fetch(new Request('https://px.example.workers.dev/health', { headers: { Origin: APP } }), env)).json();
  assert.equal(h.handoff, true);
  assert.equal(h.version, '2.1.0');
  const old = await w.fetch(hoReq('POST', { key: ENV.PROXY_KEY, body: { id: HO_ID, payload: HO_PAYLOAD } }), ENV);
  assert.equal(old.status, 501);
  assert.equal(old.headers.get('x-bein-proxy-error'), 'no_store');
});

test('chuyển nhanh (iPhone): đọc link mã QR, giải đúng đoạn mẫu addon mã hoá, đi trọn vòng addon → proxy → iPhone', async () => {
  const link = 'https://phungnhan.github.io/BeinIOS/nhap.html#h=AAcOFRwjKjE4P0ZN.AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA&p=https%3A%2F%2Fbeinios-proxy.beinfusion.workers.dev';
  const h = PWA.parseHandoff(link);
  assert.deepEqual(h, { id: 'AAcOFRwjKjE4P0ZN', key: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA', proxy: 'https://beinios-proxy.beinfusion.workers.dev' });
  assert.deepEqual(PWA.parseHandoff(link.split('#')[1]), h, 'nhận cả phần sau #');
  assert.equal(PWA.parseHandoff('h=ngan.AQID&p=x'), null);
  assert.equal(PWA.parseHandoff('BEINIOS1.abc'), null);
  assert.equal(PWA.parseHandoff(link.replace('https%3A', 'http%3A')).proxy, '', 'proxy http (không phải máy này) bị bỏ');
  // Đoạn mẫu addon mã hoá với khoá cố định (BeinGroup test/transfer.test.js)
  const asked = [];
  const fake = async (url) => (asked.push(url), json(200, { payload: 'yMfGxcTDwsHAv769.tnI7__ThpemTqJNc7rs5AmOBw1huZE2pvOejvtIcR_EaFbE' }));
  assert.equal(await PWA.openHandoff(h, fake), 'BEINIOS1.thu-nghiem');
  assert.deepEqual(asked, ['https://beinios-proxy.beinfusion.workers.dev/handoff?id=AAcOFRwjKjE4P0ZN'], 'chỉ gửi mã số, không gửi khoá');
  await assert.rejects(() => PWA.openHandoff(h, async () => json(404, { code: 'gone', error: 'Mã đã dùng' })), (e) => e.code === 'gone');
  await assert.rejects(() => PWA.openHandoff({ ...h, key: 'B'.repeat(43) }, fake), (e) => e.code === 'decrypt');
  await assert.rejects(() => PWA.openHandoff({ ...h, proxy: '' }, fake), (e) => e.code === 'no_proxy');

  // Trọn vòng: mã hoá như addon (WebCrypto) -> proxy thật (worker.js + Durable Object giả) -> iPhone lấy, giải
  const mod = await import('../cloudflare-proxy/worker.js');
  const { ns } = fakeHandoffNs(mod.Handoff);
  const env = { ...ENV, HANDOFF: ns };
  const enc = (b) => Buffer.from(b).toString('base64url');
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const id = enc(crypto.getRandomValues(new Uint8Array(12)));
  const k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const plain = ADDON_SAMPLE;
  const payload = enc(iv) + '.' + enc(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plain))));
  const put = await mod.default.fetch(hoReq('POST', { key: ENV.PROXY_KEY, origin: 'chrome-extension://abcdefghijklmnop', body: { id, payload } }), env);
  assert.equal(put.status, 200);
  const viaProxy = async (url, init) => mod.default.fetch(new Request(url, { ...init, headers: { Origin: APP } }), env);
  const text = await PWA.openHandoff({ id, key: enc(keyBytes), proxy: 'https://px.example.workers.dev' }, viaProxy);
  assert.equal(text, plain);
  assert.deepEqual(PWA.parseTransfer(text).api, { sid: 'S1' });
  await assert.rejects(() => PWA.openHandoff({ id, key: enc(keyBytes), proxy: 'https://px.example.workers.dev' }, viaProxy), (e) => e.code === 'gone', 'dùng một lần');
});
