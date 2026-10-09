// Dashboard — tab Đăng bài, phần đính kèm: ảnh / video / tệp, nhắc tên @, xem trước link, tag và series.

// ---------- Ảnh, video, tệp đính kèm ----------
// File chỉ giữ trong lúc mở trang (không lưu được vào nháp); tải lên Beincom lúc bấm Đăng.
// Mỗi mục: { key, kind, file, name, size, preview, status: 'local' | 'uploading' | 'done' | 'error', progress, item, error }
compose.media = [];
let mediaSeq = 0;
const uploader = Upload.createUploader({ send: (m) => chrome.runtime.sendMessage(m) });
const MEDIA_TITLES = {
  image: `Tối đa ${BG.MEDIA.image.max} ảnh, mỗi ảnh ≤ ${BG.sizeText(BG.MEDIA.image.size)}`,
  video: `${BG.MEDIA.video.max} video ≤ ${BG.sizeText(BG.MEDIA.video.size)}`,
  file: `Tối đa ${BG.MEDIA.file.max} tệp, mỗi tệp ≤ ${BG.sizeText(BG.MEDIA.file.size)}: ${BG.MEDIA.file.exts.join(', ')}`,
};

// { images: [...], videos: [...], files: [...] } từ danh sách mục (map: lấy gì từ mỗi mục)
function mediaByField(list, map = (m) => m) {
  const out = { images: [], videos: [], files: [] };
  for (const m of list) out[BG.MEDIA_FIELD[m.kind]].push(map(m));
  return out;
}

function mediaCounts() {
  const c = {};
  for (const m of compose.media) c[m.kind] = (c[m.kind] || 0) + 1;
  return c;
}

function addMedia(kind, files) {
  const { accepted, errors } = BG.pickMedia(kind, [...files], mediaCounts());
  for (const f of accepted) {
    compose.media.push({ key: ++mediaSeq, kind, file: f, name: f.name, size: f.size, preview: kind === 'image' ? URL.createObjectURL(f) : '', status: 'local', progress: 0, item: null, error: '' });
  }
  if (errors.length) toast(errors.slice(0, 3).join('; ') + (errors.length > 3 ? ` (và ${errors.length - 3} lỗi khác)` : ''), 'err');
  renderMedia();
  updateCompose();
}

function removeMedia(key) {
  const i = compose.media.findIndex((m) => m.key === key);
  if (i < 0) return;
  if (compose.media[i].preview) URL.revokeObjectURL(compose.media[i].preview);
  compose.media.splice(i, 1);
  renderMedia();
  updateCompose();
}

function clearMedia() {
  for (const m of compose.media) if (m.preview) URL.revokeObjectURL(m.preview);
  compose.media = [];
  renderMedia();
}

const MEDIA_STATUS = { local: 'Chưa tải lên', uploading: 'Đang tải lên', done: 'Đã tải lên', error: 'Lỗi' };

function renderMedia() {
  const counts = mediaCounts();
  const uploading = compose.media.some((m) => m.status === 'uploading');
  for (const k of Object.keys(BG.MEDIA)) {
    const other = Object.keys(counts).some((x) => x !== k);
    const full = (counts[k] || 0) >= BG.MEDIA[k].max;
    const btn = $('media-btn-' + k);
    btn.disabled = busy || uploading || other || full;
    btn.title = other ? 'Mỗi bài chỉ đính kèm một loại: ảnh, video hoặc tệp' : full ? `Đã đủ ${BG.MEDIA[k].max} ${BG.MEDIA[k].label}` : MEDIA_TITLES[k];
  }
  const list = compose.media;
  const fresh = list.filter((m) => m.status !== 'done').length;
  $('media-note').textContent = !list.length
    ? ''
    : compose.edit
      ? `${BG.mediaSummary(mediaByField(list))}` + (fresh ? ` · ${fresh} file mới tải lên Beincom khi bấm Lưu` : ' đang có trên bài · bấm × để bỏ')
      : `${BG.mediaSummary(mediaByField(list))} · chưa lưu vào nháp, tải lên Beincom khi bấm Đăng`;
  const tray = $('compose-media');
  tray.hidden = !list.length;
  const bar = (m) => {
    const fill = el('span', { style: `width:${Math.round(m.progress * 100)}%` });
    m.bar = fill; // cập nhật tiến độ trực tiếp, khỏi vẽ lại cả khay
    return el('span', { class: 'media-progress' + (m.status === 'uploading' ? '' : ' idle') }, fill);
  };
  const remove = (m) => el('button', { type: 'button', class: 'media-remove', title: 'Bỏ ' + m.name, 'aria-label': 'Bỏ ' + m.name, disabled: busy || uploading, text: '×', onclick: () => removeMedia(m.key) });
  const state = (m) => (m.status === 'error' ? el('span', { class: 'err-text small', title: m.error, text: 'Lỗi: ' + m.error }) : m.status === 'local' ? null : el('span', { class: 'muted small', text: MEDIA_STATUS[m.status] }));
  const images = list.filter((m) => m.kind === 'image');
  const others = list.filter((m) => m.kind !== 'image');
  tray.replaceChildren(
    ...(images.length
      ? [
          el(
            'div',
            { class: 'media-grid' },
            images.map((m) =>
              el(
                'div',
                { class: 'media-thumb' + (m.status === 'error' ? ' failed' : ''), title: `${m.name}${m.size ? ' · ' + BG.sizeText(m.size) : ''}${m.error ? ' · ' + m.error : ''}` },
                el('img', { src: m.preview, alt: m.name }),
                remove(m),
                bar(m),
                m.status === 'done' ? el('span', { class: 'media-done', text: '✓' }) : null,
                m.status === 'error' ? el('span', { class: 'media-done media-err', title: m.error, text: '!' }) : null,
              ),
            ),
          ),
        ]
      : []),
    ...others.map((m) =>
      el(
        'div',
        { class: 'media-row' + (m.status === 'error' ? ' failed' : '') },
        el('span', { class: 'media-icon', text: m.kind === 'video' ? '🎬' : '📎' }),
        el('span', { class: 'media-name', title: m.name, text: m.name }),
        el('span', { class: 'muted small', text: m.size ? BG.sizeText(m.size) : '' }),
        bar(m),
        state(m),
        remove(m),
      ),
    ),
  );
  renderLink();
}

// Tải lần lượt từng file; mục đã tải ở lần trước (đăng lỗi) thì dùng lại. Lỗi thì dừng, trả về null.
async function uploadMedia() {
  busy = true;
  updateCompose(); // khoá nút Đăng trong lúc tải
  try {
    for (const [i, m] of compose.media.entries()) {
      if (m.status === 'done') continue;
      $('btn-compose').textContent = `Đang tải lên ${i + 1}/${compose.media.length}…`;
      m.status = 'uploading';
      m.progress = 0;
      m.error = '';
      renderMedia();
      try {
        m.item = await uploader.upload(m.kind, m.file, (p) => {
          m.progress = p;
          if (m.bar) m.bar.style.width = Math.round(p * 100) + '%';
        });
        m.status = 'done';
      } catch (e) {
        m.status = 'error';
        m.error = e.message || String(e);
        toast(`${m.name}: ${m.error}`, 'err');
        return null;
      } finally {
        renderMedia();
      }
    }
    return mediaByField(compose.media, (m) => m.item);
  } finally {
    busy = false;
    renderMedia();
    updateCompose();
  }
}

// ---------- Nhắc tên (@) ----------
// Gõ @ rồi vài chữ: tìm người trong các group đã chọn (giống web), chọn để chèn @username.
// compose.mentions: username -> dạng web lưu trong mentions của bài
compose.mentions = {};
const mention = { open: false, start: 0, query: '', items: [], active: 0, note: '', seq: 0, timer: 0, cache: new Map(), target: 'compose' };
const MENTION_SHOW = 8;

// Các ô soạn có nhắc tên: ô chữ, khung chứa (để đặt ô gợi ý), ô gợi ý, group để tìm người, ghi người được chọn.
// dash/article.js thêm ô nội dung Article.
const MENTION_TARGETS = {
  compose: {
    ta: () => $('compose-text'),
    box: () => $('editor-body'),
    pop: () => $('mention-pop'),
    groupIds: () => readCompose().groupIds,
    pick: (u) => {
      compose.mentions[u.username] = BG.mentionEntry(u);
      updateCompose();
      saveDraft();
    },
  },
};
const mentionTarget = () => MENTION_TARGETS[mention.target];

// Toạ độ con trỏ trong ô soạn (so với .editor-body), đo bằng một bản sao ẩn của ô chữ
function caretXY(ta, pos) {
  const cs = getComputedStyle(ta);
  const div = document.createElement('div');
  for (const p of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'wordSpacing']) div.style[p] = cs[p];
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px', borderStyle: 'solid' });
  div.textContent = ta.value.slice(0, pos);
  const mark = el('span', { text: ta.value.slice(pos) || '.' });
  div.append(mark);
  document.body.append(div);
  const x = mark.offsetLeft;
  const y = mark.offsetTop;
  div.remove();
  return { x: ta.offsetLeft + x - ta.scrollLeft, y: ta.offsetTop + y - ta.scrollTop, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 };
}

function closeMention() {
  mention.open = false;
  mention.seq++;
  clearTimeout(mention.timer);
  renderMention();
}

function showMention(items, note = '') {
  mention.open = true;
  mention.items = items;
  mention.note = note;
  mention.active = Math.min(mention.active, Math.max(0, Math.min(MENTION_SHOW, items.length) - 1));
  renderMention();
}

// Gọi khi gõ / bấm chuột / di con trỏ trong ô soạn (target: 'compose' | 'article')
function checkMention(target = 'compose') {
  if (typeof target !== 'string') target = 'compose'; // gọi thẳng từ sự kiện
  if (mention.target !== target) {
    if (mention.open) closeMention();
    mention.target = target;
  }
  const ta = mentionTarget().ta();
  const q = ta.selectionStart === ta.selectionEnd ? BG.mentionQuery(ta.value.slice(0, ta.selectionStart)) : null;
  if (!q) return mention.open && closeMention();
  if (q.start !== mention.start || q.query !== mention.query) mention.active = 0;
  mention.start = q.start;
  mention.query = q.query;
  const ids = mentionTarget().groupIds();
  if (!ids.length) return showMention([], 'Chọn group để đăng trước, rồi mới tìm được người để nhắc tên');
  const key = ids.join(',') + '|' + q.query.toLowerCase();
  const seq = ++mention.seq;
  clearTimeout(mention.timer);
  if (mention.cache.has(key)) return showMention(mention.cache.get(key));
  showMention(mention.items, 'Đang tìm…');
  mention.timer = setTimeout(async () => {
    const r = await chrome.runtime.sendMessage({ type: 'mentionable', groupIds: ids, key: q.query });
    if (seq !== mention.seq) return; // đã gõ tiếp
    if (r?.status !== 'ok') return showMention([], r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Có lỗi');
    mention.cache.set(key, r.users);
    showMention(r.users);
  }, 250);
}

function renderMention() {
  const pop = mentionTarget().pop();
  pop.hidden = !mention.open;
  if (!mention.open) return;
  const list = mention.note === 'Đang tìm…' ? [] : mention.items.slice(0, MENTION_SHOW);
  pop.replaceChildren(
    ...(list.length
      ? list.map((u, i) =>
          el(
            'div',
            { class: 'mention-item' + (i === mention.active ? ' active' : ''), role: 'option', 'aria-selected': i === mention.active ? 'true' : 'false', onmousedown: (e) => (e.preventDefault(), pickMention(u)) },
            avatarOf(u),
            el('span', { class: 'name', text: u.fullname || u.username }),
            u.isVerified ? el('span', { class: 'tick', title: 'Đã xác minh', text: '✓' }) : null,
            el('span', { class: 'muted small', text: '@' + u.username }),
          ),
        )
      : [el('div', { class: 'mention-note muted small', text: mention.note || (mention.query ? `Không có ai tên "${mention.query}" trong các group đã chọn` : 'Gõ tên để tìm người') })]),
  );
  const ta = mentionTarget().ta();
  const c = caretXY(ta, mention.start);
  const box = mentionTarget().box();
  pop.style.left = Math.max(4, Math.min(c.x, box.clientWidth - pop.offsetWidth - 4)) + 'px';
  pop.style.top = c.y + c.line + 4 + 'px';
}

function pickMention(u) {
  if (!u) return;
  const t = mentionTarget();
  const ta = t.ta();
  const text = '@' + u.username + ' ';
  const end = ta.selectionStart;
  closeMention();
  editReplace(ta, mention.start, end, text, mention.start + text.length, mention.start + text.length);
  t.pick(u);
}

// ---------- Xem trước link ----------
// Giống web: lấy link cuối trong bài; chỉ hiện (và gửi) khi bài không có ảnh / video / tệp; bấm × để bỏ.
compose.link = null; // { url, preview } | { url, loading } | { url, error }
compose.linkRemoved = new Set();
let linkTimer = 0;
let linkSeq = 0;

function checkLink() {
  clearTimeout(linkTimer);
  linkTimer = setTimeout(async () => {
    const url = BG.lastLink($('compose-text').value);
    if (!url || compose.linkRemoved.has(url)) {
      if (compose.link) {
        compose.link = null;
        renderLink();
        saveDraft();
      }
      return;
    }
    if (compose.link?.url === url) return;
    const seq = ++linkSeq;
    compose.link = { url, loading: true };
    renderLink();
    const r = await chrome.runtime.sendMessage({ type: 'linkPreview', url });
    if (seq !== linkSeq || compose.link?.url !== url) return;
    compose.link = r?.status === 'ok' ? { url, preview: r.preview } : { url, error: r?.message || 'không lấy được thông tin' };
    renderLink();
    saveDraft();
  }, 700);
}

function renderLink() {
  const box = $('compose-link');
  const l = compose.link;
  box.hidden = !l || compose.media.length > 0; // có ảnh / video / tệp thì Beincom không hiện xem trước link
  if (box.hidden) return box.replaceChildren();
  const remove = el('button', {
    type: 'button',
    class: 'media-remove',
    title: 'Bỏ xem trước link này',
    'aria-label': 'Bỏ xem trước link này',
    text: '×',
    onclick: () => {
      compose.linkRemoved.add(l.url);
      compose.link = null;
      renderLink();
      saveDraft();
    },
  });
  if (l.loading) return box.replaceChildren(el('span', { class: 'muted small', text: `Đang lấy thông tin ${l.url}…` }), remove);
  if (l.error) return box.replaceChildren(el('span', { class: 'muted small', text: `Không có xem trước cho ${l.url} (${l.error})` }), remove);
  const p = l.preview;
  box.replaceChildren(
    p.image ? el('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    el('div', { class: 'compose-link-text' }, el('b', { text: p.title || p.url }), p.description ? el('span', { class: 'desc', text: p.description }) : null, el('span', { class: 'muted small', text: p.domain || BG.linkDomains(p.url)[0] || '' })),
    remove,
  );
}

// ---------- Tag và series ----------
// Danh sách tải theo các group đã chọn (tag theo community, series theo group), lọc ngay trên máy khi gõ.
compose.tags = []; // [{ id, name }]
compose.series = []; // [{ id, title }]
const ts = { key: '', loading: false, loaded: false, tags: [], series: [], note: '', seq: 0, timer: 0 };
const PICKERS = {
  tag: { max: BG.TAG_MAX, unit: 'tag', chosen: () => compose.tags, options: () => ts.tags, label: (x) => x.name, sub: (x) => (x.totalUsed ? `${x.totalUsed} bài` : ''), keep: (x) => ({ id: x.id, name: x.name }) },
  series: { max: BG.SERIES_MAX, unit: 'series', chosen: () => compose.series, options: () => ts.series, label: (x) => x.title, sub: (x) => x.summary || '', keep: (x) => ({ id: x.id, title: x.title }) },
};
const pickState = { tag: { open: false, active: 0 }, series: { open: false, active: 0 } };

// Gọi mỗi lần vẽ lại khung soạn: chỉ tải khi danh sách group đã chọn đổi
function loadTagsSeries() {
  const ids = readCompose().groupIds;
  const key = ids.join(',');
  if (key === ts.key) return;
  ts.key = key;
  clearTimeout(ts.timer);
  const seq = ++ts.seq;
  if (!ids.length) {
    Object.assign(ts, { loading: false, loaded: false, tags: [], series: [], note: '' });
    return renderTagsSeries();
  }
  ts.loading = true;
  renderTagsSeries();
  ts.timer = setTimeout(async () => {
    const r = await chrome.runtime.sendMessage({ type: 'tagsSeries', groupIds: ids });
    if (seq !== ts.seq) return;
    const ok = r?.status === 'ok';
    Object.assign(ts, { loading: false, loaded: ok, tags: ok ? r.tags : [], series: ok ? r.series : [], note: ok ? r.note || '' : r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Có lỗi' });
    renderTagsSeries();
  }, 300);
}

// Tag / series đã chọn nhưng không có trong danh sách của các group đang chọn
function invalidPicks(kind) {
  if (!ts.loaded) return [];
  const p = PICKERS[kind];
  return p.chosen().filter((x) => !p.options().some((o) => o.id === x.id));
}

function pickMatches(kind) {
  const p = PICKERS[kind];
  const q = BG.norm($(kind + '-input').value.trim());
  return p
    .options()
    .filter((o) => !p.chosen().some((x) => x.id === o.id) && (!q || BG.norm(p.label(o)).includes(q)))
    .slice(0, 8);
}

function renderPicker(kind) {
  const p = PICKERS[kind];
  const st = pickState[kind];
  const chosen = p.chosen();
  const bad = new Set(invalidPicks(kind).map((x) => x.id));
  $(kind + '-chips').replaceChildren(
    ...chosen.map((x) =>
      el(
        'span',
        { class: 'chip' + (bad.has(x.id) ? ' invalid' : ''), title: bad.has(x.id) ? 'Không dùng được với các group đã chọn' : '' },
        (kind === 'tag' ? '#' : '📚 ') + p.label(x),
        el('button', { type: 'button', title: 'Bỏ ' + p.label(x), 'aria-label': 'Bỏ ' + p.label(x), text: '×', onclick: () => removePick(kind, x.id) }),
      ),
    ),
  );
  const input = $(kind + '-input');
  const groupsPicked = !!ts.key;
  const full = chosen.length >= p.max;
  input.disabled = busy || !groupsPicked || full;
  input.placeholder = !groupsPicked ? 'Chọn group để đăng trước' : full ? `Đã đủ ${p.max} ${p.unit}` : ts.loading ? 'Đang tải…' : kind === 'tag' ? `Thêm tag (tối đa ${p.max})…` : `Thêm vào series (tối đa ${p.max})…`;
  const pop = $(kind + '-pop');
  pop.hidden = !st.open || input.disabled;
  if (pop.hidden) return;
  const items = pickMatches(kind);
  st.active = Math.min(st.active, Math.max(0, items.length - 1));
  pop.replaceChildren(
    ...(items.length
      ? items.map((o, i) =>
          el(
            'div',
            { class: 'picker-item' + (i === st.active ? ' active' : ''), role: 'option', 'aria-selected': i === st.active ? 'true' : 'false', onmousedown: (e) => (e.preventDefault(), addPick(kind, o)) },
            kind === 'series' && o.cover ? el('img', { src: o.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
            el('span', { class: 'name', text: (kind === 'tag' ? '#' : '') + p.label(o) }),
            p.sub(o) ? el('span', { class: 'muted small', text: p.sub(o).slice(0, 60) }) : null,
          ),
        )
      : [el('div', { class: 'mention-note muted small', text: ts.loading ? 'Đang tải…' : p.options().length ? 'Không có kết quả' : kind === 'tag' ? 'Community chưa có tag nào' : 'Các group đã chọn chưa có series nào' })]),
  );
}

function renderTagsSeries() {
  renderPicker('tag');
  renderPicker('series');
  const bad = [...invalidPicks('tag'), ...invalidPicks('series')];
  $('tags-note').classList.toggle('err-text', bad.length > 0);
  $('tags-note').textContent = bad.length ? 'Mục màu đỏ không dùng được với các group đã chọn — bỏ ra trước khi đăng' : ts.note;
}

function addPick(kind, o) {
  const p = PICKERS[kind];
  if (!o || p.chosen().length >= p.max) return;
  p.chosen().push(p.keep(o));
  $(kind + '-input').value = '';
  pickState[kind].active = 0;
  renderTagsSeries();
  saveDraft();
}

function removePick(kind, id) {
  const p = PICKERS[kind];
  const list = p.chosen();
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
  renderTagsSeries();
  saveDraft();
}

function linkToSend() {
  return !compose.media.length && compose.link?.preview ? compose.link.preview : null;
}

// ---------- Sự kiện ----------

// Nhắc tên: ↑ ↓ chọn, Enter / Tab chèn, Esc đóng (dùng cho mọi ô soạn có nhắc tên)
function mentionKeys(e) {
  if (!mention.open) return;
  const n = Math.min(MENTION_SHOW, mention.items.length);
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n && mention.note !== 'Đang tìm…') {
    e.preventDefault();
    mention.active = (mention.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    renderMention();
  } else if ((e.key === 'Enter' || e.key === 'Tab') && n && mention.note !== 'Đang tìm…') {
    e.preventDefault();
    pickMention(mention.items[mention.active]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeMention();
  }
}
$('compose-text').addEventListener('keydown', mentionKeys);
$('compose-text').addEventListener('input', () => {
  checkMention();
  checkLink();
});
$('compose-text').addEventListener('click', () => checkMention());
$('compose-text').addEventListener('keyup', (e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && checkMention());
$('compose-text').addEventListener('blur', () => mention.open && closeMention());
$('compose-text').addEventListener('scroll', () => mention.open && renderMention());

for (const k of Object.keys(BG.MEDIA)) {
  const input = $('media-input-' + k);
  if (k === 'image') input.accept = BG.MEDIA.image.types.join(',');
  if (k === 'file') input.accept = BG.MEDIA.file.exts.map((x) => '.' + x).join(',');
  $('media-btn-' + k).addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    addMedia(k, input.files);
    input.value = '';
  });
}

// Ô chọn tag / series: gõ để lọc, ↑ ↓ chọn, Enter thêm, Esc đóng, Backspace khi ô trống thì bỏ mục cuối
for (const kind of Object.keys(PICKERS)) {
  const input = $(kind + '-input');
  const st = pickState[kind];
  const open = () => {
    st.open = true;
    renderPicker(kind);
  };
  input.addEventListener('focus', open);
  input.addEventListener('input', () => {
    st.active = 0;
    open();
  });
  input.addEventListener('blur', () => {
    st.open = false;
    renderPicker(kind);
  });
  input.addEventListener('keydown', (e) => {
    const items = pickMatches(kind);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) st.active = (st.active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      open();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addPick(kind, items[st.active]);
    } else if (e.key === 'Escape') {
      st.open = false;
      renderPicker(kind);
    } else if (e.key === 'Backspace' && !input.value && PICKERS[kind].chosen().length) {
      removePick(kind, PICKERS[kind].chosen().at(-1).id);
    }
  });
}
