// Dashboard — Ảnh từ Guar Studio (ứng dụng sản xuất nội dung của bạn, chạy trên chính máy này): chọn ảnh AI, ảnh phân cảnh của
// dự án, ảnh Thiết kế ảnh để đính kèm khi đăng bài, chèn vào Article, hoặc gửi kèm bình luận.
// Dùng CHUNG kết nối với Nhận bài đăng từ Guar Studio (Cài đặt › Tích hợp › Guar Studio, dash/guar-publish.js, khoá guarPublish
// { url, token, enabled }): mỗi lệnh POST kèm "Authorization: Bearer <mã ghép nối>", như cổng nhận bài của Guar Studio.
//   POST {địa chỉ}/api/integrations/beinfusion/images { limit } -> { app, version, groups: [{ id, name, kind, updated, images: [{ id,
//       name, url (/assets/… — ảnh thu nhỏ hiện bằng <img>), width, height, size, modified, mime }] }] }
//   POST {địa chỉ}/api/integrations/beinfusion/image { id } -> byte của ảnh
// Lưu kết nối / Kiểm tra thì thử cổng ảnh (guarImagesProbe), kết quả ở khoá guarStudio { images, version, message } (trong máy).
// Nút chọn ảnh (.guar-only) chỉ hiện khi đã nối và Guar Studio có cổng ảnh (BeinIOS / máy không có Guar Studio: ẩn).
// Nạp sau attach.js (attachDropped, compose), article.js (insertImages), postview.js (pvAddImages).

const GUAR_API = '/api/integrations/beinfusion';
const GS = { cfg: { url: '', token: '', images: false, version: '', message: '' }, groups: [], group: '', picked: new Map(), opts: null, loading: false };

// Chỉ địa chỉ trên chính máy này (Guar Studio chặn mọi Host khác); trả về gốc "http://127.0.0.1:9191" hoặc ''
function guarBase(value) {
  let u;
  try {
    u = new URL(String(value || '').trim());
  } catch {
    return '';
  }
  return /^https?:$/.test(u.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ? u.origin : '';
}
const guarPattern = (base) => {
  const u = new URL(base);
  return `${u.protocol}//${u.hostname}/*`;
};

async function loadGuarConfig() {
  const { guarPublish, guarStudio } = await chrome.storage.local.get(['guarPublish', 'guarStudio']);
  const url = guarBase(guarPublish?.url);
  const token = url ? String(guarPublish?.token || '') : '';
  GS.cfg = { url, token, images: !!(token && guarStudio?.images && guarStudio?.url === url), version: guarStudio?.version || '', message: guarStudio?.message || '' };
  renderGuar();
}

function renderGuar() {
  for (const b of document.querySelectorAll('.guar-only')) b.hidden = !GS.cfg.images;
  const st = $('guar-img-status');
  if (!st) return;
  st.textContent = !GS.cfg.token ? 'Chưa nối — lưu kết nối ở trên' : GS.cfg.images ? `Dùng được — nút Guar Studio ở ô đăng bài, Article và bình luận` : GS.cfg.message || 'Chưa kiểm tra — bấm Kiểm tra';
  st.className = 'small ' + (GS.cfg.images ? 'ok-text' : GS.cfg.token && GS.cfg.message ? 'warn-text' : 'muted');
}

// Lỗi gọi Guar Studio -> câu dễ hiểu
function guarError(status) {
  if (!status) return 'Không kết nối được Guar Studio — mở Guar Studio trên máy này (dashboard.bat) rồi thử lại.';
  if (status === 401 || status === 403) return 'Mã ghép nối chưa đúng hoặc đã bị ngắt — tạo mã mới ở Guar Studio › Cài đặt › Beincom qua BeinFusion rồi Lưu kết nối.';
  if (status === 404 || status === 405) return 'Bản Guar Studio này chưa có cổng ảnh dùng chung mã ghép nối — cập nhật Guar Studio.';
  return `Guar Studio báo lỗi ${status}`;
}

// POST tới cổng BeinFusion của Guar Studio, kèm mã ghép nối. as: 'json' | 'blob'
async function guarCall(path, body, as = 'json') {
  const { url, token } = GS.cfg;
  if (!url || !token) throw new Error('Chưa nối Guar Studio — vào Cài đặt › Tích hợp › Guar Studio, dán mã ghép nối rồi Lưu kết nối.');
  if (!(await chrome.permissions.contains({ origins: [guarPattern(url)] }))) throw new Error('Chưa cho phép BeinFusion truy cập Guar Studio trên máy này — bấm Lưu kết nối và chọn Cho phép.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), as === 'json' ? 15000 : 60000);
  try {
    const r = await fetch(url + GUAR_API + path, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw Object.assign(new Error(guarError(r.status)), { status: r.status });
    return as === 'json' ? await r.json() : await r.blob();
  } catch (e) {
    if (e.status) throw e;
    throw new Error(guarError(0));
  } finally {
    clearTimeout(timer);
  }
}

// Thử cổng ảnh (sau Lưu kết nối / Kiểm tra ở dash/guar-publish.js): ghi khoá guarStudio, hiện / ẩn các nút
async function guarImagesProbe() {
  await loadGuarConfig();
  if (!GS.cfg.token) {
    await chrome.storage.local.remove('guarStudio');
    return loadGuarConfig();
  }
  let images = false;
  let version = '';
  let message = '';
  try {
    const r = await guarCall('/images', { limit: 1 });
    images = Array.isArray(r?.groups);
    version = String(r?.version || '');
    if (!images) message = 'Guar Studio trả lời lạ — cập nhật Guar Studio.';
  } catch (e) {
    message = e.message;
  }
  await chrome.storage.local.set({ guarStudio: { url: GS.cfg.url, images, version, message } });
  await loadGuarConfig();
}

// ---------- Hộp chọn ảnh ----------
// opts: { title, max (số ảnh còn chọn được), onPick(files) }
async function openGuarPick(opts) {
  GS.opts = opts;
  GS.picked = new Map();
  $('gp-title').textContent = opts.title || 'Ảnh từ Guar Studio';
  if (!$('guar-pick').open) $('guar-pick').showModal();
  await gpLoad();
}

const gpStatus = (text, cls = 'muted') => {
  $('gp-status').textContent = text;
  $('gp-status').className = 'small ' + cls;
  $('gp-status').hidden = !text;
};

async function gpLoad() {
  GS.loading = true;
  GS.groups = [];
  renderGuarPick();
  gpStatus('Đang đọc ảnh trong Guar Studio…');
  try {
    const r = await guarCall('/images', { limit: 300 });
    GS.groups = (Array.isArray(r?.groups) ? r.groups : []).filter((g) => g && Array.isArray(g.images) && g.images.length);
    if (!GS.groups.some((g) => g.id === GS.group)) GS.group = GS.groups[0]?.id || '';
    gpStatus(GS.groups.length ? '' : 'Guar Studio chưa có ảnh công khai nào (ảnh AI, ảnh phân cảnh, Thiết kế ảnh).');
  } catch (e) {
    gpStatus(e.message, 'err-text');
  } finally {
    GS.loading = false;
    renderGuarPick();
  }
}

const gpGroup = () => GS.groups.find((g) => g.id === GS.group) || GS.groups[0] || null;

function renderGuarPick() {
  const base = GS.cfg.url;
  const max = Math.max(0, GS.opts?.max ?? 10);
  $('gp-group').replaceChildren(...GS.groups.map((g) => el('option', { value: g.id, text: `${g.name} (${g.images.length})` })));
  $('gp-group').value = gpGroup()?.id || '';
  $('gp-group').hidden = !GS.groups.length;
  const g = gpGroup();
  $('gp-grid').replaceChildren(
    ...(g?.images || []).map((im) => {
      const on = GS.picked.has(im.id);
      const full = !on && GS.picked.size >= max;
      return el(
        'button',
        {
          type: 'button',
          class: 'gp-item' + (on ? ' on' : ''),
          'aria-pressed': String(on),
          disabled: full,
          title: [im.name, im.width && im.height ? `${im.width}×${im.height}` : '', im.size ? BG.sizeText(im.size) : ''].filter(Boolean).join(' · '),
          onclick: () => {
            if (on) GS.picked.delete(im.id);
            else if (GS.picked.size < max) GS.picked.set(im.id, im);
            renderGuarPick();
          },
        },
        el('img', { src: base + im.url, alt: im.name || '', loading: 'lazy', decoding: 'async' }),
        on ? el('span', { class: 'gp-check', 'aria-hidden': 'true', text: '✓' }) : null,
      );
    }),
  );
  const n = GS.picked.size;
  $('gp-count').textContent = n ? `Đã chọn ${n}${max > 1 ? '/' + max : ''} ảnh` : max ? `Chọn tối đa ${max} ảnh` : 'Đã đủ ảnh — bỏ bớt ảnh đang có trước';
  $('gp-use').disabled = !n || GS.loading;
  $('gp-reload').disabled = GS.loading;
}

// Tải các ảnh đã chọn từ Guar Studio thành File rồi giao cho nơi gọi (ô đăng bài / Article / bình luận)
async function gpUse() {
  const list = [...GS.picked.values()];
  if (!list.length || !GS.opts) return;
  $('gp-use').disabled = true;
  const files = [];
  try {
    for (const [i, im] of list.entries()) {
      gpStatus(`Đang lấy ảnh ${i + 1}/${list.length} từ Guar Studio…`);
      const blob = await guarCall('/image', { id: im.id }, 'blob');
      const type = im.mime || blob.type || 'image/png';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'png';
      const name = /\.\w{3,4}$/.test(im.name || '') ? im.name : `${String(im.name || 'guar-studio').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'guar-studio'}.${ext}`;
      files.push(new File([blob], name, { type, lastModified: Date.parse(im.modified) || Date.now() }));
    }
  } catch (e) {
    gpStatus(e.message, 'err-text');
    $('gp-use').disabled = false;
    return;
  }
  gpStatus('');
  $('guar-pick').close();
  GS.opts.onPick(files);
}

$('gp-group').addEventListener('change', () => {
  GS.group = $('gp-group').value;
  renderGuarPick();
});
$('gp-reload').addEventListener('click', gpLoad);
$('gp-use').addEventListener('click', gpUse);
for (const id of ['gp-close', 'gp-cancel']) $(id).addEventListener('click', () => $('guar-pick').close());

// ---------- Nút ở các ô soạn ----------
// Đăng bài: ảnh đính kèm (tối đa như web, trừ ảnh đang có)
$('media-btn-guar').addEventListener('click', () => {
  const have = compose.media.filter((m) => m.kind === 'image').length;
  if (compose.media.some((m) => m.kind !== 'image')) return toast('Bài đang có video / tệp: mỗi bài chỉ đính kèm một loại', 'warn');
  openGuarPick({ title: 'Ảnh Guar Studio cho bài đăng', max: BG.MEDIA.image.max - have, onPick: (files) => attachDropped(files) });
});
// Article: chèn vào chỗ con trỏ trong nội dung
$('art-btn-guar').addEventListener('click', () => openGuarPick({ title: 'Ảnh Guar Studio cho Article', max: 10, onPick: (files) => insertImages(files) }));
// Bình luận (cửa sổ Bài viết & bình luận)
$('pv-guar-btn').addEventListener('click', () => openGuarPick({ title: 'Ảnh Guar Studio cho bình luận', max: BG.COMMENT_IMAGES_MAX - (PV.image ? 1 : 0), onPick: (files) => pvAddImages(files) }));

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && (ch.guarPublish || ch.guarStudio)) loadGuarConfig();
});
loadGuarConfig();
