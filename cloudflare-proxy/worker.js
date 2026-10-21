/**
 * BeinIOS — Cloudflare Worker proxy.
 * Webapp BeinIOS (GitHub Pages) không gọi thẳng được Beincom vì trình duyệt chặn CORS (Beincom chỉ cho phép
 * group.beincom.com). Proxy này nhận yêu cầu của webapp và chuyển tới Beincom, kèm cookie đăng nhập webapp gửi.
 *
 * An toàn:
 * - PROXY_KEY (bắt buộc, đặt bằng Secret): mọi yêu cầu phải có header x-beinios-key đúng khoá — người khác biết địa
 *   chỉ proxy cũng không dùng được.
 * - ALLOWED_ORIGIN: chỉ trang của bạn (ví dụ https://phungnhan.github.io) đọc được kết quả.
 * - Chỉ chuyển tới máy chủ Beincom; máy chủ đăng nhập auth.beincom.com chỉ cho phép làm mới phiên.
 * - Chỉ chuyển các header cần thiết; không ghi nhật ký (tắt observability ở wrangler.toml), không lưu gì.
 * Cookie Beincom trả về (Set-Cookie) được gửi lại cho webapp trong header x-bein-set-cookie (JSON) để webapp cập nhật.
 *
 * Chuyển nhanh đăng nhập (/handoff): addon BeinFusion mã hoá đăng nhập ngay trên máy tính (AES-GCM, khoá nằm trong mã QR,
 * không gửi lên đây), gửi bản mã hoá lên (POST, cần PROXY_KEY); iPhone quét mã QR, trang nhap.html lấy về (GET theo mã số
 * ngẫu nhiên) rồi tự giải mã. Proxy chỉ giữ bản mã hoá trong Durable Object HANDOFF: lấy một lần là xoá, tự xoá sau 5 phút.
 *
 * Tác giả: Kai | Crypto Life
 */

const VERSION = '2.1.0';

// Chuyển nhanh: mã số 12–24 byte ngẫu nhiên (base64url), bản mã hoá = iv (12 byte) "." dữ liệu, giữ tối đa 5 phút
const HANDOFF_TTL = 300;
const HANDOFF_ID = /^[A-Za-z0-9_-]{16,32}$/;
const HANDOFF_PAYLOAD = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,40000}$/;

const ALLOWED_HOSTS = ['api.beincom.com', 'group.beincom.com', 'chat.beincom.com', 'upload.beincom.com', 'auth.beincom.com'];
// auth.beincom.com: chỉ làm mới phiên (không cho đăng nhập bằng mật khẩu qua proxy)
const AUTH_PATHS = /^\/v\d+\/auth\/public\/http\/(refresh-session|new-session)$/;

// Header của webapp được chuyển tới Beincom (còn lại bỏ hết)
const FORWARD_HEADERS = ['accept', 'accept-language', 'content-type', 'x-application', 'x-platform', 'x-version-id', 'x-requested-with', 'x-lang', 'x-csrf-token', 'user-agent'];
// Header của Beincom trả lại cho webapp
const RETURN_HEADERS = ['content-type', 'content-disposition', 'cache-control', 'etag', 'last-modified', 'x-request-id'];
// Header webapp được phép gửi (trả lời preflight)
const ALLOW_HEADERS = [...FORWARD_HEADERS.filter((h) => h !== 'user-agent'), 'x-beinios-key', 'x-bein-cookie'];

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS.join(', '),
    'Access-Control-Expose-Headers': 'x-bein-set-cookie, x-bein-proxy-error, content-disposition',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// So sánh khoá không lộ thời gian
function sameKey(a, b) {
  const x = new TextEncoder().encode(String(a || ''));
  const y = new TextEncoder().encode(String(b || ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0 && x.length > 0;
}

function json(data, origin, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origin ? cors(origin) : {}) } });
}

function fail(status, code, message, origin) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-bein-proxy-error': code, ...(origin ? cors(origin) : {}) },
  });
}

// Một lần chuyển nhanh = một Durable Object (theo mã số): cất bản mã hoá, đọc một lần là xoá, hết giờ thì tự xoá
export class Handoff {
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(request) {
    if (request.method === 'PUT') {
      await this.storage.put({ p: await request.text(), exp: Date.now() + HANDOFF_TTL * 1000 });
      await this.storage.setAlarm(Date.now() + HANDOFF_TTL * 1000);
      return new Response('ok');
    }
    if (request.method === 'GET') {
      const got = await this.storage.get(['p', 'exp']);
      const p = got.get('p');
      const exp = got.get('exp');
      await this.storage.deleteAll();
      if (p == null || !(exp > Date.now())) return new Response('', { status: 404 });
      return new Response(p);
    }
    return new Response('', { status: 405 });
  }
  async alarm() {
    await this.storage.deleteAll();
  }
}

async function handoff(request, env, url, origin, keyOk) {
  if (!env.HANDOFF) return fail(501, 'no_store', 'Proxy chưa có kho chuyển nhanh — cập nhật proxy bằng mã mới nhất (wrangler.toml có HANDOFF).', origin);
  if (request.method === 'POST') {
    // Gửi lên cần khoá proxy (người lạ không cất được gì); bản mã hoá chỉ addon và iPhone của bạn giải được
    if (!keyOk) return fail(403, 'key', 'Sai khoá proxy (x-beinios-key).', origin);
    let body = null;
    try {
      body = await request.json();
    } catch {}
    const id = String(body?.id || '');
    const payload = String(body?.payload || '');
    if (!HANDOFF_ID.test(id) || !HANDOFF_PAYLOAD.test(payload)) return fail(400, 'bad', 'Dữ liệu chuyển nhanh không hợp lệ.', origin);
    const r = await env.HANDOFF.get(env.HANDOFF.idFromName(id)).fetch('https://handoff/', { method: 'PUT', body: payload });
    if (!r.ok) return fail(502, 'store', 'Không cất được — thử lại.', origin);
    return json({ ok: true, ttl: HANDOFF_TTL }, origin);
  }
  if (request.method === 'GET') {
    // Lấy về không cần khoá proxy: mã số ngẫu nhiên khó đoán, và chỉ ai có khoá giải mã (trong mã QR) mới đọc được
    const id = url.searchParams.get('id') || '';
    if (!HANDOFF_ID.test(id)) return fail(400, 'bad', 'Mã không hợp lệ.', origin);
    const r = await env.HANDOFF.get(env.HANDOFF.idFromName(id)).fetch('https://handoff/', { method: 'GET' });
    if (r.status === 404) return fail(404, 'gone', 'Mã đã dùng hoặc đã hết hạn (5 phút) — tạo mã mới ở addon.', origin);
    if (!r.ok) return fail(502, 'store', 'Không đọc được — thử lại.', origin);
    return json({ payload: await r.text() }, origin);
  }
  return fail(405, 'method', 'Chỉ nhận POST / GET.', origin);
}

export default {
  async fetch(request, env) {
    const origins = allowedOrigins(env);
    const url = new URL(request.url);
    const reqOrigin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
    // /handoff: addon (chrome-extension://…) gửi lên, iPhone lấy về — có khoá / mã hoá bảo vệ nên nhận mọi trang gọi
    const isHandoff = url.pathname === '/handoff';
    const origin = origins.includes(reqOrigin) || (isHandoff && reqOrigin) ? reqOrigin : '';

    // Thiếu biến: trả lời đọc được cho mọi trang để webapp báo đúng chỗ cần sửa (không chuyển gì đi)
    if (!env.PROXY_KEY || !origins.length) return fail(500, 'setup', 'Proxy chưa cài PROXY_KEY và ALLOWED_ORIGIN (xem README).', reqOrigin);

    // Trang khác (không phải webapp của bạn): không trả lời CORS -> trình duyệt chặn đọc kết quả
    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (reqOrigin && !origin) return fail(403, 'origin', 'Trang này không được dùng proxy.', '');

    const keyOk = sameKey(request.headers.get('x-beinios-key'), env.PROXY_KEY);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'BeinIOS proxy', version: VERSION, key: keyOk, handoff: !!env.HANDOFF }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origin ? cors(origin) : {}) },
      });
    }

    if (isHandoff) return handoff(request, env, url, origin, keyOk);
    if (!keyOk) return fail(403, 'key', 'Sai khoá proxy (x-beinios-key).', origin);
    if (url.pathname !== '/proxy') return fail(404, 'path', 'Đường dẫn không đúng. Dùng /proxy?url=https://api.beincom.com/…', origin);

    let target;
    try {
      target = new URL(url.searchParams.get('url') || '');
    } catch {
      return fail(400, 'url', 'Thiếu hoặc sai tham số url.', origin);
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname) || target.port || target.username || target.password) {
      return fail(403, 'host', `Không chuyển tới ${target.hostname}.`, origin);
    }
    if (target.hostname === 'auth.beincom.com' && (request.method !== 'POST' || !AUTH_PATHS.test(target.pathname))) {
      return fail(403, 'auth', 'auth.beincom.com chỉ dùng để làm mới phiên.', origin);
    }

    const headers = new Headers();
    for (const h of FORWARD_HEADERS) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const cookie = request.headers.get('x-bein-cookie');
    if (cookie) headers.set('Cookie', cookie);
    // Beincom chỉ nhận lệnh có hai header này (như web)
    if (!headers.has('x-application')) headers.set('x-application', 'BIC_GROUP');
    if (!headers.has('x-platform')) headers.set('x-platform', 'WEB');

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });
    } catch (e) {
      return fail(502, 'upstream', 'Không kết nối được Beincom: ' + (e?.message || e), origin);
    }

    const out = new Headers(origin ? cors(origin) : {});
    for (const h of RETURN_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
    if (setCookies.length) out.set('x-bein-set-cookie', JSON.stringify(setCookies));
    // Chuyển hướng: trả về như lỗi để webapp biết (không tự đi theo sang trang ngoài Beincom)
    const status = upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status;
    if (status !== upstream.status) out.set('x-bein-proxy-error', 'redirect');
    return new Response(status === 204 || status === 304 ? null : upstream.body, { status, headers: out });
  },
};
