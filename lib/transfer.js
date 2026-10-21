// BeinFusion — chuyển đăng nhập Beincom sang BeinIOS (webapp cho iPhone, repo phungnhan/BeinIOS).
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: Dashboard đọc cookie (chrome.cookies) rồi gọi các hàm này để đóng gói.
//
// Định dạng (BeinIOS pwa-shim.js đọc cùng định dạng): "BEINIOS1." + base64url(JSON {
//   v: 1, t: thời điểm tạo (ms),
//   c: [[tên, giá trị, ô]] — ô là tổng các bit: 1 = gửi tới api.beincom.com, 2 = chat.beincom.com, 4 = auth.beincom.com
// }). Cookie giống nhau ở nhiều máy chủ chỉ ghi một lần (gộp bit) để đoạn chép / mã QR ngắn nhất.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const BEINIOS_URL = 'https://phungnhan.github.io/BeinIOS/';
  const PREFIX = 'BEINIOS1.';
  const JARS = [
    ['api', 1],
    ['chat', 2],
    ['auth', 4],
  ];
  // Cookie thống kê / quảng cáo / chống bot (gắn với IP máy tính) — không cần cho đăng nhập, bỏ cho gọn
  const SKIP = /^(_ga|_gid|_gat|_gcl|_fbp|_fbc|_hj|_clck|_clsk|_uet|mp_|ph_|__cf_bm|cf_clearance|_cfuvid|concord-)/i;

  const keepCookie = (name) => !!name && !SKIP.test(name);

  function b64urlEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  // jars: { api: [{ name, value }], chat: [...], auth: [...] } (như chrome.cookies.getAll trả về)
  // -> { text, count: { api, chat, auth }, total } ; text rỗng nếu không có cookie Beincom nào
  function beiniosPack(jars, now = Date.now()) {
    const entries = new Map(); // tên \u0000 giá trị -> [tên, giá trị, ô]
    const count = { api: 0, chat: 0, auth: 0 };
    for (const [jar, flag] of JARS) {
      for (const c of jars?.[jar] || []) {
        if (!keepCookie(c?.name)) continue;
        const value = String(c.value ?? '');
        const key = c.name + '\u0000' + value;
        const e = entries.get(key) || [c.name, value, 0];
        if (!(e[2] & flag)) count[jar]++;
        e[2] |= flag;
        entries.set(key, e);
      }
    }
    if (!count.api && !count.chat) return { text: '', count, total: 0 };
    const text = PREFIX + b64urlEncode(JSON.stringify({ v: 1, t: now, c: [...entries.values()] }));
    return { text, count, total: entries.size };
  }

  // Đọc lại (để kiểm thử; BeinIOS có bản riêng cùng định dạng). Nhận cả link nhap.html#BEINIOS1.…
  function beiniosUnpack(text) {
    const s = String(text || '').trim();
    const i = s.indexOf(PREFIX);
    if (i < 0) return null;
    try {
      const d = JSON.parse(b64urlDecode(s.slice(i + PREFIX.length).split(/[\s#&]/)[0]));
      if (d?.v !== 1 || !Array.isArray(d.c)) return null;
      const out = { at: Number(d.t) || 0, api: {}, chat: {}, auth: {} };
      for (const [name, value, mask] of d.c) for (const [jar, flag] of JARS) if (mask & flag) out[jar][String(name)] = String(value);
      return out;
    } catch {
      return null;
    }
  }

  // Link mở trang nhận của BeinIOS (mã QR): phần sau # không gửi lên máy chủ nào
  const beiniosImportUrl = (text) => BEINIOS_URL + 'nhap.html#' + text;

  // ---------- Chuyển nhanh qua proxy của BeinIOS (/handoff) ----------
  // Đăng nhập thật dài quá cho mã QR: mã hoá ngay trên máy (AES-GCM 256), gửi bản mã hoá lên proxy (cất 5 phút, lấy một
  // lần là xoá); mã QR chỉ chứa mã số + khoá giải mã + địa chỉ proxy, nằm sau dấu # nên không gửi lên máy chủ nào.
  const bytesB64u = (bytes) => {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

  // -> { id, key, payload }: payload = iv "." dữ liệu mã hoá (gửi lên proxy); id + key đi vào mã QR.
  // opts.key / iv / id (Uint8Array) chỉ để kiểm thử cho ra kết quả cố định
  async function beiniosSeal(text, opts = {}) {
    const keyBytes = opts.key || crypto.getRandomValues(new Uint8Array(32));
    const iv = opts.iv || crypto.getRandomValues(new Uint8Array(12));
    const idBytes = opts.id || crypto.getRandomValues(new Uint8Array(12));
    const k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(String(text))));
    return { id: bytesB64u(idBytes), key: bytesB64u(keyBytes), payload: bytesB64u(iv) + '.' + bytesB64u(data) };
  }
  // Giải ngược (BeinIOS có bản riêng cùng cách; ở đây để kiểm thử)
  async function beiniosUnseal(payload, key) {
    const [iv, data] = String(payload || '').split('.');
    const k = await crypto.subtle.importKey('raw', b64uBytes(key), 'AES-GCM', false, ['decrypt']);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uBytes(iv) }, k, b64uBytes(data)));
  }
  // Địa chỉ proxy -> gốc (https, hoặc http://localhost khi thử); sai thì ''
  function beiniosProxyOrigin(url) {
    try {
      const u = new URL(String(url || '').trim());
      return u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) ? u.origin : '';
    } catch {
      return '';
    }
  }
  // Link trang nhận của BeinIOS cho mã QR: nhap.html#h=<mã số>.<khoá>&p=<proxy>
  const beiniosHandoffUrl = ({ id, key }, proxy) => BEINIOS_URL + 'nhap.html#h=' + id + '.' + key + '&p=' + encodeURIComponent(beiniosProxyOrigin(proxy));

  Object.assign(BG, { BEINIOS_URL, beiniosPack, beiniosUnpack, beiniosImportUrl, beiniosKeepCookie: keepCookie, beiniosSeal, beiniosUnseal, beiniosProxyOrigin, beiniosHandoffUrl });
});
