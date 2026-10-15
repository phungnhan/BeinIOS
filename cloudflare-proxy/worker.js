/**
 * BeinIOS Cloudflare Worker Proxy
 * Giúp vượt rào cản CORS & Security của trình duyệt khi chạy BeinIOS dưới dạng PWA trên iOS/Android/Web.
 * Tác giả: Kai | Crypto Life
 */

const ALLOWED_DOMAINS = [
  'api.beincom.com',
  'group.beincom.com',
  'chat.beincom.com',
  'upload.beincom.com'
];

function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '*';

    // 1. Xử lý preflight CORS (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    const url = new URL(request.url);

    // 2. Trang kiểm tra trạng thái hoạt động (Health check)
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'BeinIOS Cloudflare Proxy',
          version: '1.0.0',
          allowedDomains: ALLOWED_DOMAINS,
          timestamp: new Date().toISOString()
        }, null, 2),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders(origin)
          }
        }
      );
    }

    // 3. Phân giải target URL
    let targetUrlStr = '';

    if (url.pathname === '/proxy') {
      // Dạng 1: /proxy?url=https://api.beincom.com/...
      targetUrlStr = url.searchParams.get('url');
    } else {
      // Dạng 2: Đường dẫn phân giải tự động:
      // /api/...  -> https://api.beincom.com/...
      // /group/... -> https://group.beincom.com/...
      // /chat/...  -> https://chat.beincom.com/...
      const parts = url.pathname.slice(1).split('/');
      const prefix = parts[0];
      const rest = parts.slice(1).join('/');

      if (prefix === 'api') {
        targetUrlStr = `https://api.beincom.com/${rest}${url.search}`;
      } else if (prefix === 'group') {
        targetUrlStr = `https://group.beincom.com/${rest}${url.search}`;
      } else if (prefix === 'chat') {
        targetUrlStr = `https://chat.beincom.com/${rest}${url.search}`;
      }
    }

    if (!targetUrlStr) {
      return new Response(
        JSON.stringify({ error: 'Thiếu tham số url mục tiêu hoặc đường dẫn không hợp lệ. Ví dụ: /proxy?url=https://api.beincom.com/...' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return new Response(
        JSON.stringify({ error: 'URL mục tiêu không đúng định dạng.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    // 4. Kiểm tra bảo mật: Chỉ cho phép proxy tới hệ thống Beincom (chống SSRF)
    const isAllowed = ALLOWED_DOMAINS.some(d => targetUrl.hostname === d || targetUrl.hostname.endsWith('.' + d));
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: `Tên miền ${targetUrl.hostname} không được phép chuyển tiếp qua Proxy này.` }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    // 5. Chuẩn bị headers chuyển tiếp
    const newHeaders = new Headers();
    for (const [key, val] of request.headers.entries()) {
      const lower = key.toLowerCase();
      // Bỏ qua các header hop-by-hop hoặc do Cloudflare thêm vào
      if (lower.startsWith('cf-') || lower === 'host' || lower === 'x-forwarded-proto' || lower === 'x-real-ip') {
        continue;
      }
      newHeaders.set(key, val);
    }

    // Thiết lập Host và Origin giả lập như web Beincom chính thức
    newHeaders.set('Host', targetUrl.hostname);
    newHeaders.set('Origin', `https://${targetUrl.hostname}`);
    newHeaders.set('Referer', `https://${targetUrl.hostname}/`);
    if (!newHeaders.has('x-application')) newHeaders.set('x-application', 'BIC_GROUP');
    if (!newHeaders.has('x-platform')) newHeaders.set('x-platform', 'WEB');

    // Hỗ trợ truyền cookie tùy biến qua header x-bein-cookie
    const customCookie = request.headers.get('x-bein-cookie');
    if (customCookie) {
      const existing = newHeaders.get('Cookie') || '';
      newHeaders.set('Cookie', existing ? `${existing}; ${customCookie}` : customCookie);
    }

    // 6. Chuyển tiếp request tới Beincom
    try {
      const fetchOptions = {
        method: request.method,
        headers: newHeaders,
        redirect: 'follow'
      };

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        // Chuyển tiếp body nguyên bản (hỗ trợ cả JSON, form-data, upload file)
        fetchOptions.body = request.body;
      }

      const response = await fetch(targetUrl.toString(), fetchOptions);

      // 7. Tạo response trả về kèm CORS đầy đủ
      const responseHeaders = new Headers(response.headers);
      const cors = corsHeaders(origin);
      for (const [ck, cv] of Object.entries(cors)) {
        responseHeaders.set(ck, cv);
      }
      responseHeaders.set('Access-Control-Expose-Headers', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Lỗi kết nối tới máy chủ Beincom: ${err.message}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }
  }
};
