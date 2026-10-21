// Dashboard → Cài đặt → BeinIOS: chép phiên đăng nhập Beincom sang BeinIOS (BeinFusion chạy như ứng dụng trên iPhone).
// Đọc cookie Beincom bằng chrome.cookies (quyền xin khi bấm lần đầu), đóng gói (lib/transfer.js) thành đoạn chép và mã QR
// (lib/qr.js) mở trang nhận của BeinIOS; mã tự ẩn sau 2 phút.
// Đăng nhập thật dài quá cho mã QR: khi đã điền proxy của BeinIOS, mã hoá đăng nhập ngay trên máy (AES-GCM), gửi bản mã hoá
// lên proxy (/handoff, giữ 5 phút, lấy một lần là xoá) — mã QR chỉ còn mã số + khoá giải mã + địa chỉ proxy, rất ngắn.

// beincom.com: Chrome chỉ cho đọc cookie chung của cả miền (.beincom.com — phiên đăng nhập) khi addon có quyền với chính
// beincom.com; quyền với api / chat / auth chỉ đủ cho cookie riêng của từng máy chủ
const BEINIOS_PERMS = { permissions: ['cookies'], origins: ['https://beincom.com/*', 'https://chat.beincom.com/*', 'https://auth.beincom.com/*'] };
// Cookie trình duyệt gửi tới từng máy chủ (ô api / chat / auth của BeinIOS)
const BEINIOS_URLS = { api: 'https://api.beincom.com/v1/', chat: 'https://chat.beincom.com/api/v4/', auth: 'https://auth.beincom.com/v1/auth/public/http/refresh-session' };
const BEINIOS_TTL = 120e3;
const bi = { text: '', timer: 0, storeId: '', where: '' };
// Proxy của BeinIOS { url, key } — chỉ lưu ở máy này (không có trong sao lưu / đồng bộ), dùng để tạo mã QR ngắn
const BEINIOS_PX = 'beiniosProxy';
let biPx = null;

// Chính BeinIOS (webapp, chrome.* giả lập) không đọc được cookie: ẩn nhóm này
if (chrome.runtime?.id === 'beinios') $('beinios-group').hidden = true;

function beiniosClear(note = '') {
  clearTimeout(bi.timer);
  bi.text = '';
  $('beinios-qr').replaceChildren();
  $('beinios-info').textContent = note;
  $('beinios-copy').disabled = true;
  $('beinios').classList.remove('wide');
}

async function beiniosRead(storeId) {
  const out = {};
  for (const [jar, url] of Object.entries(BEINIOS_URLS)) {
    try {
      out[jar] = await chrome.cookies.getAll({ url, storeId });
    } catch {
      out[jar] = [];
    }
  }
  return out;
}

function beiniosRenderPx() {
  const ok = !!(biPx?.url && biPx?.key);
  $('beinios-px-state').textContent = ok ? '· đã có' : '· chưa có';
  $('beinios-px-url').value = biPx?.url || '';
  $('beinios-px-key').value = biPx?.key || '';
  if (!ok) $('beinios-px').open = true;
}
async function beiniosLoadPx() {
  try {
    biPx = (await chrome.storage.local.get(BEINIOS_PX))[BEINIOS_PX] || null;
  } catch {
    biPx = null;
  }
  beiniosRenderPx();
}

// Gửi bản mã hoá lên proxy -> link mã QR ngắn; lỗi thì ném Error có .code (key, no_store, setup, network…)
async function beiniosHandoff(text) {
  const origin = BG.beiniosProxyOrigin(biPx.url);
  const sealed = await BG.beiniosSeal(text);
  let res;
  try {
    res = await fetch(origin + '/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-beinios-key': biPx.key }, body: JSON.stringify({ id: sealed.id, payload: sealed.payload }) });
  } catch {
    // Proxy cũ (trước 2.1.0) chưa có /handoff, chặn addon ngay ở bước kiểm tra CORS: trình duyệt cũng chỉ báo "không gọi được"
    throw Object.assign(new Error('không gọi được proxy — kiểm tra địa chỉ, hoặc proxy chưa lên bản 2.1.0 (mở <proxy>/health xem "version")'), { code: 'network' });
  }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(j?.error || 'proxy trả lỗi ' + res.status), { code: j?.code || 'http' });
  return BG.beiniosHandoffUrl(sealed, origin);
}

async function beiniosMake(storeId, where) {
  Object.assign(bi, { storeId, where });
  beiniosClear('Đang đọc phiên đăng nhập…');
  const pack = BG.beiniosPack(await beiniosRead(storeId));
  if (!pack.text) return beiniosClear(`Không thấy phiên đăng nhập Beincom ở ${where} — đăng nhập group.beincom.com ở đó rồi bấm lại.`);
  bi.text = pack.text;
  $('beinios-copy').disabled = false;
  const counts = `${pack.count.api} cookie Beincom · ${pack.count.chat} cookie Chat${pack.count.auth ? ' · ' + pack.count.auth + ' cookie máy chủ đăng nhập' : ''}`;
  let url = '';
  let note = '';
  if (biPx?.url && biPx?.key) {
    $('beinios-info').textContent = 'Đang tạo mã ngắn qua proxy…';
    try {
      url = await beiniosHandoff(pack.text);
      note = `${counts}. Mở Camera iPhone quét mã → mở trang → bấm Chép → mở BeinIOS → Cài đặt → Dán từ addon. Mã dùng một lần, hết hạn sau 5 phút.`;
    } catch (e) {
      const why = { key: 'sai khoá proxy', no_store: 'proxy chưa có kho chuyển nhanh — cần proxy 2.1.0 (đẩy repo BeinIOS mới nhất, Cloudflare tự dựng lại)', setup: 'proxy chưa cài PROXY_KEY / ALLOWED_ORIGIN' }[e.code];
      note = `Không tạo được mã ngắn: ${why || e.message}. `;
      $('beinios-px').open = true;
    }
  }
  if (!url) {
    const full = BG.beiniosImportUrl(pack.text);
    if (BG.qrEncode(full, { level: 'L' })) {
      url = full;
      note += `${counts}. Mở Camera iPhone quét mã → mở link → bấm Chép, rồi vào BeinIOS → Cài đặt → Dán từ addon.`;
    } else {
      note += `${counts}. Đăng nhập dài quá cho mã QR (${pack.text.length} ký tự): điền Proxy của BeinIOS bên dưới để có mã ngắn, hoặc bấm Chép rồi chuyển sang iPhone, dán ở BeinIOS → Cài đặt → Dán từ addon.`;
      if (!biPx) $('beinios-px').open = true;
    }
  }
  if (url) {
    const qr = BG.qrEncode(url, { level: 'L' });
    $('beinios-qr').innerHTML = BG.qrSvg(qr); // SVG chỉ dựng từ số (lib/qr.js), không chứa dữ liệu người dùng
    $('beinios').classList.toggle('wide', qr.version > 25);
    if (qr.version > 25) note += ' Mã dày: đưa điện thoại lại gần, giữ yên.';
  }
  $('beinios-info').textContent = note;
  bi.timer = setTimeout(() => beiniosClear('Mã đã ẩn — chọn lại nguồn ở trên hoặc bấm lại nút để tạo mã mới.'), BEINIOS_TTL);
}

// Nguồn phiên: cửa sổ ẩn danh (phiên riêng cho BeinIOS — nên dùng) hoặc trình duyệt này (dùng chung phiên)
async function beiniosSources() {
  let stores = [];
  try {
    stores = await chrome.cookies.getAllCookieStores();
  } catch {}
  const incog = stores.find((s) => s.id !== '0');
  let allowed = false;
  try {
    allowed = await chrome.extension.isAllowedIncognitoAccess();
  } catch {}
  const box = $('beinios-src');
  const pick = (storeId, where) => () => beiniosMake(storeId, where);
  const opt = (value, label, hint, on, disabled = false) =>
    el(
      'div',
      {},
      el('label', {}, el('input', { type: 'radio', name: 'beinios-src', value, checked: on, disabled, onchange: pick(value, value === '0' ? 'trình duyệt này' : 'cửa sổ ẩn danh') }), el('span', {}, el('b', {}, label))),
      hint ? el('div', { class: 'muted hint' }, hint) : null,
    );
  box.replaceChildren(
    opt(incog?.id || 'incognito', 'Cửa sổ ẩn danh — phiên riêng cho BeinIOS (nên dùng)', incog ? 'BeinIOS có phiên riêng, không giành phiên với trình duyệt này. Sau khi chuyển xong cứ đóng cửa sổ ẩn danh, đừng bấm Đăng xuất.' : allowed ? 'Mở cửa sổ ẩn danh, đăng nhập group.beincom.com (muốn dùng Chat thì mở cả chat.beincom.com), rồi bấm lại nút.' : 'Bật "Cho phép ở chế độ ẩn danh" cho BeinFusion (trang Tiện ích → Chi tiết), mở cửa sổ ẩn danh, đăng nhập group.beincom.com, rồi bấm lại nút.', !!incog, !incog),
    opt('0', 'Trình duyệt này', 'Dùng chung phiên: nếu Beincom đổi phiên khi làm mới, máy này hoặc BeinIOS có thể phải đăng nhập lại.', !incog),
  );
  return incog ? [incog.id, 'cửa sổ ẩn danh'] : ['0', 'trình duyệt này'];
}

$('btn-beinios').addEventListener('click', async () => {
  let ok = false;
  let err = '';
  try {
    // Xin ngay trong lúc bấm (Chrome chỉ cho xin quyền khi người dùng vừa bấm); đã có quyền thì trả lời ngay, không hỏi lại
    ok = await chrome.permissions.request(BEINIOS_PERMS);
  } catch (e) {
    err = e?.message || String(e);
  }
  // Trình duyệt còn giữ manifest cũ (chưa bấm ↻ sau khi cập nhật): không xin được quyền mới
  const stale = !(chrome.runtime.getManifest().optional_permissions || []).includes('cookies') || /manifest/i.test(err);
  if (stale) return toast('Addon chưa nạp bản mới: mở trang Tiện ích (chrome://extensions), bấm ↻ ở BeinFusion rồi tải lại Dashboard.', 'err');
  if (!ok) return toast(err ? 'Không xin được quyền đọc cookie: ' + err : 'Chưa cho phép đọc cookie Beincom — bấm lại và chọn Cho phép.', 'err');
  if (!chrome.cookies) return toast('Đã cho phép — tải lại Dashboard (F5) rồi bấm lại nút.', 'err');
  beiniosClear();
  await beiniosLoadPx();
  const [storeId, where] = await beiniosSources();
  if (!$('beinios').open) $('beinios').showModal();
  await beiniosMake(storeId, where);
});

$('beinios-copy').addEventListener('click', async () => {
  if (!bi.text) return;
  try {
    await navigator.clipboard.writeText(bi.text);
    toast('Đã chép — dán ở BeinIOS → Cài đặt → Dán từ addon. Xoá bản trung chuyển sau khi dán.');
  } catch {
    toast('Không chép được — thử lại', 'err');
  }
});
$('beinios').addEventListener('close', () => beiniosClear());

$('beinios-px-save').addEventListener('click', async () => {
  const url = BG.beiniosProxyOrigin($('beinios-px-url').value);
  const key = $('beinios-px-key').value.trim();
  if (!url) return toast('Địa chỉ proxy phải bắt đầu bằng https://', 'err');
  if (!key) return toast('Thiếu khoá proxy', 'err');
  biPx = { url, key };
  await chrome.storage.local.set({ [BEINIOS_PX]: biPx });
  beiniosRenderPx();
  $('beinios-px').open = false;
  if (bi.storeId) beiniosMake(bi.storeId, bi.where);
});
$('beinios-px-clear').addEventListener('click', async () => {
  biPx = null;
  await chrome.storage.local.remove(BEINIOS_PX);
  beiniosRenderPx();
});
// Enter trong ô proxy: lưu (không đóng hộp)
for (const id of ['beinios-px-url', 'beinios-px-key']) {
  $(id).addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    $('beinios-px-save').click();
  });
}
