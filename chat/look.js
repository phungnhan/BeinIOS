// Trang Chat — bảng Giao diện: chọn BeinFusion theme (mặc định) hoặc BeinFusion Silk (Lụa). Với Silk chọn thêm chế độ màu,
// màu nhấn, kiểu tin, mật độ, cỡ chữ, font, độ rộng tin, ảnh đại diện, giờ từng tin. Áp dụng ngay; lưu trong máy (khoá
// chatLook) và một bản tính sẵn ở localStorage để chat/look-early.js áp lúc mở trang, trước khi vẽ.

const LOOK_KEY = 'beingroup-chat-look';
let LOOK = BG.cleanChatLook(readLookSnap()?.look);

function readLookSnap() {
  try {
    return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null');
  } catch {
    return null;
  }
}

const lookDark = () => LOOK.mode === 'dark' || (LOOK.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

// Biến màu của Silk theo màu nhấn (nền sáng / tối)
function lookVars(dark) {
  const c = BG.chatLookColors(LOOK.accent, dark);
  return { '--s-accent': c.accent, '--s-accent-text': c.accentText, '--s-on-accent': c.onAccent, '--s-accent-soft': c.accentSoft, '--s-accent-line': c.accentLine, '--s-me': c.meBubble, '--s-me-line': c.meLine };
}

function lookData() {
  const L = LOOK;
  return { ui: L.ui, style: L.style, density: L.density, size: L.size, font: L.font, width: L.width, avatars: L.avatars ? 'on' : 'off', times: L.times ? 'on' : 'off' };
}

function applyLook() {
  const root = document.documentElement;
  const dark = lookDark();
  Object.assign(root.dataset, lookData(), { scheme: dark ? 'dark' : 'light' });
  for (const [k, v] of Object.entries(lookVars(dark))) root.style.setProperty(k, v);
}

function saveLook() {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ look: LOOK, mode: LOOK.mode, data: lookData(), light: lookVars(false), dark: lookVars(true) }));
  } catch {}
  chrome.storage.local.set({ chatLook: LOOK }).catch(() => {});
}

function setLook(patch) {
  const was = LOOK.ui;
  LOOK = BG.cleanChatLook({ ...LOOK, ...patch });
  applyLook();
  saveLook();
  // Mới chuyển sang Silk: ô soạn gọn (ẩn thanh định dạng, bấm Aa để hiện), bỏ lọc "Tin nhắn riêng" (Silk có mục riêng).
  // Quay về BeinFusion theme: thanh định dạng trở lại như trước khi sang Silk
  if (was !== 'silk' && LOOK.ui === 'silk') {
    try {
      localStorage.setItem(FMT_KEY + '-theme', S.fmt ? '1' : '0');
    } catch {}
    setFmt(false);
    if (S.filter === 'dm') S.filter = 'all';
  } else if (was === 'silk' && LOOK.ui !== 'silk') {
    let v = null;
    try {
      v = localStorage.getItem(FMT_KEY + '-theme');
    } catch {}
    if (v !== null) setFmt(v === '1');
  }
  if (was !== LOOK.ui) renderList();
  if ($('look').open) renderLook();
}

function resetLook() {
  setLook({ ...BG.CHAT_LOOK_DEFAULT, ui: LOOK.ui });
}

const ICON_PALETTE = 'M12 21a9 9 0 1 1 9-9c0 2-1.6 3.2-3.5 3.2H15a1.8 1.8 0 0 0-1.3 3.1A1.6 1.6 0 0 1 12 21ZM7.5 11h.01M10.5 7.5h.01M15 7.5h.01';
const strokeSvg = (d, size = 18) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'stroke');
  s.style.width = s.style.height = size + 'px';
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
};

function openLook() {
  renderLook();
  if (!$('look').open) $('look').showModal();
  $('look').querySelector('[aria-checked="true"]')?.focus();
}
const closeLook = () => $('look').close();

// Bảng Giao diện. Mỗi nút có data-k để giữ chỗ đang chọn bằng phím khi vẽ lại
function renderLook() {
  const L = LOOK;
  const silk = L.ui === 'silk';
  const focusKey = document.activeElement?.dataset?.k;
  const radio = (key, v, kids, extra = {}) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(L[key] === v), class: (extra.class || '') + (L[key] === v ? ' on' : ''), 'data-k': key + ':' + v, onclick: () => setLook({ [key]: v }), ...(extra.attrs || {}) }, ...kids);
  const seg = (key, label, opts) => el('div', { class: 'lk-seg', role: 'radiogroup', 'aria-label': label }, opts.map(([v, text, icon]) => radio(key, v, [icon ? strokeSvg(icon, 16) : null, text])));
  const group = (label, ...kids) => el('div', { class: 'lk-group' }, el('div', { class: 'lk-label' }, label), ...kids);
  const card = (key, v, title, hint, thumb) => radio(key, v, [el('span', { class: 'lk-thumb ' + thumb, 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), el('span', { class: 'lk-card-text' }, el('b', {}, title), el('span', {}, hint))], { class: 'lk-card' });
  const colors = BG.chatLookColors(L.accent, lookDark());
  const preset = BG.CHAT_ACCENTS.some(([hex]) => hex === L.accent);
  const swatches = el(
    'div',
    { class: 'lk-swatches', role: 'radiogroup', 'aria-label': 'Màu nhấn' },
    BG.CHAT_ACCENTS.map(([hex, name]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(L.accent === hex), 'aria-label': name, title: name, 'data-k': 'accent:' + hex, class: 'lk-sw' + (L.accent === hex ? ' on' : ''), style: `--sw: ${hex}`, onclick: () => setLook({ accent: hex }) })),
    el(
      'label',
      { class: 'lk-sw custom' + (preset ? '' : ' on'), style: preset ? '' : `--sw: ${L.accent}`, title: 'Tự chọn màu' },
      el('span', { class: 'sr' }, 'Tự chọn màu nhấn'),
      el('input', { type: 'color', value: L.accent.toLowerCase(), 'data-k': 'accent:custom', onchange: (e) => setLook({ accent: e.target.value }) }),
      strokeSvg('M12 5v14M5 12h14', 16),
    ),
  );
  const toggle = (key, title, hint) => el('button', { type: 'button', role: 'switch', 'aria-checked': String(!!L[key]), class: 'lk-switch', 'data-k': key, onclick: () => setLook({ [key]: !L[key] }) }, el('span', { class: 'lk-card-text' }, el('b', {}, title), el('span', {}, hint)), el('span', { class: 'lk-track', 'aria-hidden': 'true' }, el('i')));
  const options = silk
    ? [
        group('Chế độ màu', seg('mode', 'Chế độ màu', [['system', 'Theo hệ thống', 'M4 5h16v11H4ZM9 20h6M12 16v4'], ['light', 'Sáng', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4'], ['dark', 'Tối', 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z']])),
        group('Màu nhấn', swatches, el('p', { class: 'lk-hint' }, colors.fixed ? 'Màu này nhạt trên nền — chữ màu nhấn được tự làm đậm để vẫn đọc rõ.' : 'Màu đủ rõ trên nền sáng và tối.')),
        group('Kiểu tin', el('div', { class: 'lk-cards', role: 'radiogroup', 'aria-label': 'Kiểu tin' }, card('style', 'bubble', 'Bong bóng', 'Tin của bạn bên phải', 'bubble'), card('style', 'flat', 'Phẳng', 'Tên + chữ, như Slack', 'flat'))),
        el('div', { class: 'lk-row' }, group('Mật độ', seg('density', 'Mật độ', [['airy', 'Thoáng'], ['compact', 'Gọn']])), group('Cỡ chữ', el('div', { class: 'lk-seg', role: 'radiogroup', 'aria-label': 'Cỡ chữ' }, [['s', 'Chữ nhỏ', 12], ['m', 'Chữ vừa', 15], ['l', 'Chữ lớn', 18]].map(([v, name, px]) => radio('size', v, [el('span', { style: `font-size: ${px}px; font-weight: 700` }, 'A')], { attrs: { 'aria-label': name, title: name } }))))),
        group(
          'Font',
          el(
            'div',
            { class: 'lk-fonts', role: 'radiogroup', 'aria-label': 'Font' },
            radio('font', 'bvp', [el('span', { class: 'lk-aa bvp', 'aria-hidden': 'true' }, 'Aa'), el('span', { class: 'lk-card-text' }, el('b', {}, 'Be Vietnam Pro'), el('span', {}, 'Làm riêng cho tiếng Việt · gói sẵn trong addon'))], { class: 'lk-font' }),
            radio('font', 'system', [el('span', { class: 'lk-aa sys', 'aria-hidden': 'true' }, 'Aa'), el('span', { class: 'lk-card-text' }, el('b', {}, 'Font của hệ thống'), el('span', {}, 'Segoe UI trên Windows, San Francisco trên Mac'))], { class: 'lk-font' }),
          ),
        ),
        group('Độ rộng tin', seg('width', 'Độ rộng tin', [['read', 'Vừa — dễ đọc'], ['full', 'Toàn màn hình']])),
        el('div', { class: 'lk-switches' }, toggle('avatars', 'Hiện ảnh đại diện', 'Ảnh tròn cạnh tin của người khác'), toggle('times', 'Hiện giờ từng tin', 'Tắt: giờ chỉ hiện ở tên hoặc khi rê chuột')),
      ]
    : [el('p', { class: 'lk-note' }, 'Chọn BeinFusion Silk (Lụa) để tuỳ chỉnh chế độ màu, màu nhấn, kiểu tin, mật độ, cỡ chữ, font và độ rộng tin.')];
  const isDefault = JSON.stringify({ ...L, ui: 'x' }) === JSON.stringify({ ...BG.CHAT_LOOK_DEFAULT, ui: 'x' });
  $('look').replaceChildren(
    el(
      'header',
      { class: 'lk-head' },
      el('span', { class: 'lk-ic' }, strokeSvg(ICON_PALETTE, 20)),
      el('div', { class: 'lk-title' }, el('b', { id: 'look-title' }, 'Giao diện'), el('span', {}, 'Áp dụng ngay · lưu trong máy')),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Đóng bảng Giao diện', title: 'Đóng (Esc)', onclick: closeLook }, strokeSvg('M6 6l12 12M18 6 6 18', 18)),
    ),
    el(
      'div',
      { class: 'lk-body' },
      group('Kiểu giao diện', el('div', { class: 'lk-cards', role: 'radiogroup', 'aria-label': 'Kiểu giao diện' }, card('ui', 'theme', 'BeinFusion theme', 'Mặc định · giao diện hiện tại', 'theme'), card('ui', 'silk', 'BeinFusion Silk (Lụa)', 'Thanh cộng đồng, nền nhạt, tuỳ chỉnh', 'silk'))),
      ...options,
    ),
    el('footer', { class: 'lk-foot' }, el('button', { type: 'button', class: 'lk-reset', disabled: !silk || isDefault, onclick: resetLook }, 'Khôi phục mặc định')),
  );
  if (focusKey) $('look').querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus();
}

function initLook() {
  applyLook();
  $('btn-look').addEventListener('click', openLook);
  $('look').addEventListener('click', (e) => e.target === $('look') && closeLook());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => LOOK.mode === 'system' && (applyLook(), $('look').open && renderLook()));
  // Lựa chọn lưu trong máy là bản chính (trang Chat khác vừa đổi, hoặc localStorage bị xoá)
  chrome.storage.local
    .get('chatLook')
    .then(({ chatLook }) => {
      if (!chatLook) return saveLook();
      const next = BG.cleanChatLook(chatLook);
      if (JSON.stringify(next) === JSON.stringify(LOOK)) return;
      const was = LOOK.ui;
      LOOK = next;
      applyLook();
      saveLook();
      if (was !== LOOK.ui) renderList();
    })
    .catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.chatLook) return;
    const next = BG.cleanChatLook(changes.chatLook.newValue);
    if (JSON.stringify(next) === JSON.stringify(LOOK)) return;
    const was = LOOK.ui;
    LOOK = next;
    applyLook();
    saveLook();
    if (was !== LOOK.ui) renderList();
    if ($('look').open) renderLook();
  });
}
