// Dashboard — Ảnh từ Guar Studio (ứng dụng sản xuất nội dung của bạn, chạy trên chính máy này): chọn ảnh AI, ảnh phân cảnh của
// dự án, ảnh Thiết kế ảnh để đính kèm khi đăng bài, chèn vào Article, hoặc gửi kèm bình luận.
// Guar Studio mở cổng chỉ-đọc cho BeinFusion (tắt sẵn; bật ở Guar Studio › Cài đặt › Kết nối › BeinFusion và dán mã
// chrome-extension://… của addon):
//   GET {địa chỉ}/api/integrations/beinfusion/ping   -> { app, version, ok }
//   GET {địa chỉ}/api/integrations/beinfusion/images -> { app, version, groups: [{ id, name, kind, updated, images: [{ id, name,
//       url (/assets/…), width, height, size, modified, mime }] }] }
// Addon xin quyền truy cập http://127.0.0.1/* (hoặc localhost) lúc bấm. Khoá guarStudio (chỉ trong máy này): { url, ok, version }.
// Nút chọn ảnh (.guar-only) chỉ hiện sau khi Kiểm tra kết nối thành công một lần (máy khác / BeinIOS không có Guar Studio: ẩn).
// Nạp sau attach.js (attachDropped, compose), article.js (insertImages), postview.js (pvAddImages).

const GUAR_DEFAULT = 'http://127.0.0.1:9191';
const GUAR_API = '/api/integrations/beinfusion';
const GS = { cfg: { url: GUAR_DEFAULT, ok: false, version: '' }, groups: [], group: '', picked: new Map(), opts: null, loading: false };

// Chỉ địa chỉ trên chính máy này (Guar Studio chặn mọi Host khác); trả về gốc "http://127.0.0.1:9191" hoặc ''
function guarBase(value) {
  let u;
  try {
    u = new URL(String(value || '').trim() || GUAR_DEFAULT);
  } catch {
    return '';
  }
  return /^https?:$/.test(u.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ? u.origin : '';
}
const guarPattern = (base) => {
  const u = new URL(base);
  return `${u.protocol}//${u.hostname}/*`;
};
const guarAddonId = () => location.origin; // chrome-extension://<mã addon>

async function loadGuarConfig() {
  const { guarStudio } = await chrome.storage.local.get('guarStudio');
  GS.cfg = { url: GUAR_DEFAULT, ok: false, version: '', ...(guarStudio || {}) };
  renderGuar();
}

function renderGuar() {
  for (const b of document.querySelectorAll('.guar-only')) b.hidden = !GS.cfg.ok;
  if ($('guar-url') && document.activeElement !== $('guar-url')) $('guar-url').value = GS.cfg.url || GUAR_DEFAULT;
  if ($('guar-id')) $('guar-id').textContent = guarAddonId();
}

// Lỗi gọi Guar Studio -> câu dễ hiểu
function guarError(status, body) {
  if (!status) return `Không kết nối được Guar Studio — mở Guar Studio trên máy này (dashboard.bat) rồi thử lại.`;
  if (status === 403 && /host/i.test(String(body?.detail || body || ''))) return 'Guar Studio không nhận địa chỉ này — dùng đúng địa chỉ mở Guar Studio (vd http://127.0.0.1:9191).';
  if (status === 403) return `Guar Studio chưa cho phép BeinFusion — vào Guar Studio › Cài đặt › Kết nối › BeinFusion, bật "Cho phép BeinFusion đọc ảnh", dán mã ${guarAddonId()} rồi bấm Lưu kết nối.`;
  if (status === 404) return 'Bản Guar Studio này chưa có cổng cho BeinFusion — cập nhật Guar Studio.';
  return `Guar Studio báo lỗi ${status}`;
}

// Quyền truy cập địa chỉ Guar Studio: ask = đang trong lúc bấm nút (Chrome chỉ hỏi người dùng khi đó)
async function guarPermission(base, ask) {
  const origins = [guarPattern(base)];
  if (await chrome.permissions.contains({ origins })) return true;
  return ask ? chrome.permissions.request({ origins }).catch(() => false) : false;
}

async function guarFetch(base, path, as = 'json') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), as === 'json' ? 10000 : 60000);
  try {
    const r = await fetch(base + path, { credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    const body = as === 'json' || !r.ok ? await r.json().catch(() => null) : await r.blob();
    if (!r.ok) throw Object.assign(new Error(guarError(r.status, body)), { status: r.status });
    return body;
  } catch (e) {
    if (e.status) throw e;
    throw new Error(guarError(0));
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Cài đặt › Tích hợp › Guar Studio ----------
async function guarTest() {
  const base = guarBase($('guar-url').value);
  const st = $('guar-status');
  if (!base) {
    st.textContent = 'Địa chỉ phải là Guar Studio trên chính máy này, vd http://127.0.0.1:9191';
    st.className = 'small err-text';
    return;
  }
  const allowed = await guarPermission(base, true);
  if (!allowed) {
    st.textContent = 'Chưa cho phép BeinFusion truy cập Guar Studio trên máy này — bấm Kiểm tra lại và chọn Cho phép.';
    st.className = 'small warn-text';
    return;
  }
  st.textContent = 'Đang kiểm tra…';
  st.className = 'small muted';
  let ok = false;
  let version = '';
  try {
    const r = await guarFetch(base, GUAR_API + '/ping');
    ok = !!r?.ok;
    version = String(r?.version || '');
    st.textContent = ok ? `Đã kết nối ${r.app || 'Guar Studio'} ${version} ✓ — nút Guar Studio hiện ở ô đăng bài, Article và bình luận.` : 'Guar Studio trả lời lạ — cập nhật Guar Studio.';
    st.className = 'small ' + (ok ? 'ok-text' : 'err-text');
  } catch (e) {
    st.textContent = e.message;
    st.className = 'small err-text';
  }
  await chrome.storage.local.set({ guarStudio: { url: base, ok, version } });
  GS.cfg = { url: base, ok, version };
  renderGuar();
}

$('btn-guar-test').addEventListener('click', guarTest);
$('btn-guar-copy').addEventListener('click', () => arCopy(guarAddonId()).then((ok) => toast(ok ? 'Đã chép mã của BeinFusion — dán vào Guar Studio › Cài đặt › Kết nối.' : 'Không chép được — bôi đen mã rồi chép tay.', ok ? 'ok' : 'err')));

// ---------- Hộp chọn ảnh ----------
// opts: { title, max (số ảnh còn chọn được), onPick(files) }
async function openGuarPick(opts) {
  const base = guarBase(GS.cfg.url);
  // Xin quyền ngay trong lúc bấm (trước mọi lần chờ khác)
  const allowed = base && (await guarPermission(base, true));
  GS.opts = opts;
  GS.picked = new Map();
  $('gp-title').textContent = opts.title || 'Ảnh từ Guar Studio';
  if (!$('guar-pick').open) $('guar-pick').showModal();
  if (!allowed) return gpStatus('Chưa cho phép BeinFusion truy cập Guar Studio trên máy này — vào Cài đặt › Tích hợp › Guar Studio, bấm Kiểm tra kết nối.', 'warn-text');
  await gpLoad();
}

const gpStatus = (text, cls = 'muted') => {
  $('gp-status').textContent = text;
  $('gp-status').className = 'small ' + cls;
  $('gp-status').hidden = !text;
};

async function gpLoad() {
  const base = guarBase(GS.cfg.url);
  GS.loading = true;
  GS.groups = [];
  renderGuarPick();
  gpStatus('Đang đọc ảnh trong Guar Studio…');
  try {
    const r = await guarFetch(base, GUAR_API + '/images?limit=300');
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
  const base = guarBase(GS.cfg.url);
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
  const base = guarBase(GS.cfg.url);
  const list = [...GS.picked.values()];
  if (!list.length || !GS.opts) return;
  $('gp-use').disabled = true;
  const files = [];
  try {
    for (const [i, im] of list.entries()) {
      gpStatus(`Đang lấy ảnh ${i + 1}/${list.length} từ Guar Studio…`);
      const blob = await guarFetch(base, im.url, 'blob');
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
  if (area === 'local' && ch.guarStudio) loadGuarConfig();
});
loadGuarConfig();
