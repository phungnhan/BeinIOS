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
 * Tác giả: Kai | Crypto Life
 */

const VERSION = '2.0.0';

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

function fail(status, code, message, origin) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-bein-proxy-error': code, ...(origin ? cors(origin) : {}) },
  });
}

export default {
  async fetch(request, env) {
    const origins = allowedOrigins(env);
    const reqOrigin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
    const origin = origins.includes(reqOrigin) ? reqOrigin : '';
    const url = new URL(request.url);

    if (!env.PROXY_KEY || !origins.length) return fail(500, 'setup', 'Proxy chưa cài PROXY_KEY và ALLOWED_ORIGIN (xem README).', origin);

    // Trang khác (không phải webapp của bạn): không trả lời CORS -> trình duyệt chặn đọc kết quả
    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (reqOrigin && !origin) return fail(403, 'origin', 'Trang này không được dùng proxy.', '');

    const keyOk = sameKey(request.headers.get('x-beinios-key'), env.PROXY_KEY);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'BeinIOS proxy', version: VERSION, key: keyOk }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origin ? cors(origin) : {}) },
      });
    }

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
