// Dashboard — tab Đăng bài: soạn Article (tiêu đề, tóm tắt, ảnh bìa, chuyên mục, nội dung Markdown, series / tag,
// đăng ngay hoặc hẹn giờ) và tạo Series. Nội dung được chuyển sang định dạng trình soạn thảo của Beincom ở common.js.
// Dùng uploader (dash/attach.js), toLocalInput / nextQuarter (dash/compose.js).

const art = {
  mode: 'article',
  view: 'write',
  groupIds: new Set(),
  categoryIds: new Set(),
  seriesIds: new Set(),
  tagIds: new Set(),
  cover: null, // { file, preview, item } — item: ảnh đã tải lên (giữ lại nếu đăng lỗi để không tải lại)
  cats: { items: [], loading: false, loaded: false, error: '' },
  picks: { key: '', tags: [], series: [], loading: false, error: '' },
  draftLoaded: false,
  running: false,
  mentions: {}, // username -> dữ liệu nhắc tên (BG.articleMentionEntry)
  images: {}, // N -> { file, preview, item } ảnh trong thân bài, nội dung ghi ![tên](local:N) cho tới khi tải lên
  imgSeq: 0,
};
let artDraftTimer = 0;
let artPickTimer = 0;

const artGroups = () => groups().filter((g) => !g.error && art.groupIds.has(g.id));

function artAsGroupTarget() {
  const picked = artGroups();
  return picked.length === 1 && picked[0].canPostAsGroup !== false ? picked[0] : null;
}

function readArticle() {
  const isArticle = art.mode === 'article';
  const later = isArticle && document.querySelector('input[name="art-when"]:checked')?.value === 'later';
  return {
    groupIds: artGroups().map((g) => g.id),
    title: $('art-title').value,
    summary: $('art-summary').value,
    content: $('art-content').value,
    categoryIds: [...art.categoryIds],
    // Kèm tên để báo lỗi dễ hiểu (tag_series_invalid); chỉ những mục dùng được với các group đang chọn
    series: art.picks.series.filter((x) => art.seriesIds.has(x.id)).map((x) => ({ id: x.id, title: x.title })),
    tags: art.picks.tags.filter((x) => art.tagIds.has(x.id)).map((x) => ({ id: x.id, name: x.name })),
    scheduledAt: later ? ($('art-at').value ? new Date($('art-at').value).toISOString() : 'invalid') : null,
    asGroup: $('art-as-group').checked && !!artAsGroupTarget(),
    isImportant: $('art-important').checked,
    hasCover: !!art.cover,
    mentions: BG.usedMentions($('art-content').value, art.mentions),
  };
}

// ---------- Ảnh trong thân bài ----------
// Chọn ảnh -> chèn ![tên](local:N) vào chỗ con trỏ; bấm Đăng mới tải lên (resource 'article:content') và thay bằng link thật.
const localRefs = (md) => [...new Set([...String(md || '').matchAll(BG.LOCAL_IMAGE)].map((m) => m[1]))];
const missingImages = (md) => localRefs(md).filter((n) => !art.images[n]);
// Nội dung để kiểm tra / xem trước: ảnh chưa tải thay bằng link tạm (kiểm tra) hoặc ảnh trong máy (xem trước)
const withImages = (md, preview = false) => String(md || '').replace(BG.LOCAL_IMAGE, (m, n) => (art.images[n] ? '](' + (preview ? art.images[n].preview : 'https://media.beincom.com/local-' + n) + ')' : m));

function insertImages(files) {
  const ta = $('art-content');
  const imgs = [...files].filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
  if (imgs.length < files.length) toast('Chỉ chèn được ảnh JPG, PNG, WEBP, GIF', 'warn');
  const room = BG.ARTICLE_IMAGES_MAX - localRefs(ta.value).length - BG.mdToPlate(withImages(ta.value), { id: () => '' }).filter((x) => x.type === 'img' && !/local-/.test(x.url)).length;
  const take = imgs.filter((f) => f.size <= 25 * 1024 * 1024).slice(0, Math.max(0, room));
  if (take.length < imgs.length) toast(`Mỗi ảnh tối đa 25 MB, tối đa ${BG.ARTICLE_IMAGES_MAX} ảnh mỗi bài`, 'warn');
  if (!take.length) return;
  const lines = take.map((f) => {
    const n = String(++art.imgSeq);
    art.images[n] = { file: f, preview: URL.createObjectURL(f), item: null };
    return `![${f.name.replace(/[\[\]\n]/g, ' ')}](local:${n})`;
  });
  const pos = ta.selectionEnd;
  const before = ta.value.slice(0, pos);
  const text = (before && !before.endsWith('\n') ? '\n' : '') + lines.join('\n') + '\n';
  editReplace(ta, pos, pos, text, pos + text.length, pos + text.length);
  updateArticle();
  saveArticleDraft();
}

// Tải các ảnh còn local:N trong nội dung (theo thứ tự), trả về nội dung đã thay link; lỗi thì ném
async function uploadArticleImages(md) {
  let out = md;
  const refs = localRefs(md);
  for (const [i, n] of refs.entries()) {
    const im = art.images[n];
    if (!im) throw new Error('Ảnh trong bài cần chọn lại (ảnh không được lưu trong nháp)');
    if (!im.item) im.item = await uploader.upload('image', im.file, (p) => ($('btn-art-submit').textContent = `Đang tải ảnh ${i + 1}/${refs.length} · ${Math.round(p * 100)}%`), { resource: 'article:content' });
    out = out.split(`](local:${n})`).join(`](${im.item.url})`);
  }
  return out;
}

// ---------- Nháp ----------

function saveArticleDraft() {
  clearTimeout(artDraftTimer);
  artDraftTimer = setTimeout(() => {
    const a = readArticle();
    chrome.storage.local.set({
      articleDraft: {
        mode: art.mode,
        title: a.title,
        summary: a.summary,
        content: a.content,
        groupIds: [...art.groupIds],
        categoryIds: a.categoryIds,
        seriesIds: [...art.seriesIds],
        tagIds: [...art.tagIds],
        when: document.querySelector('input[name="art-when"]:checked')?.value || 'now',
        at: $('art-at').value,
        asGroup: $('art-as-group').checked,
        isImportant: a.isImportant,
        mentions: a.mentions,
      },
    });
  }, 600);
}

async function loadArticleDraftOnce() {
  if (art.draftLoaded) return;
  art.draftLoaded = true;
  const { articleDraft: d } = await chrome.storage.local.get('articleDraft');
  if (!d) return;
  art.mode = d.mode === 'series' ? 'series' : 'article';
  $('art-title').value = d.title || '';
  $('art-summary').value = d.summary || '';
  $('art-content').value = d.content || '';
  art.groupIds = new Set(d.groupIds || []);
  art.categoryIds = new Set(d.categoryIds || []);
  art.seriesIds = new Set(d.seriesIds || []);
  art.tagIds = new Set(d.tagIds || []);
  const when = document.querySelector(`input[name="art-when"][value="${d.when === 'later' ? 'later' : 'now'}"]`);
  if (when) when.checked = true;
  $('art-at').value = d.at || '';
  $('art-as-group').checked = !!d.asGroup;
  $('art-important').checked = !!d.isImportant;
  art.mentions = { ...d.mentions };
  renderArticle();
}

// ---------- Dữ liệu đọc từ Beincom ----------

async function loadCategories() {
  if (art.cats.loading || art.cats.loaded) return;
  art.cats.loading = true;
  renderArtCats();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'categories' });
    if (r?.status === 'ok') Object.assign(art.cats, { items: r.items, loaded: true, error: '' });
    else art.cats.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Không đọc được chuyên mục';
  } finally {
    art.cats.loading = false;
    renderArtCats();
  }
}

// Series / tag dùng được với các group đã chọn (đọc lại khi đổi group)
function loadArtPicks() {
  clearTimeout(artPickTimer);
  artPickTimer = setTimeout(async () => {
    const ids = artGroups().map((g) => g.id);
    const key = ids.join(',');
    if (key === art.picks.key) return;
    art.picks.key = key;
    if (!ids.length) {
      Object.assign(art.picks, { tags: [], series: [], error: '', loading: false });
      return renderArtPicks();
    }
    art.picks.loading = true;
    renderArtPicks();
    const r = await chrome.runtime.sendMessage({ type: 'tagsSeries', groupIds: ids });
    if (art.picks.key !== key) return; // đã đổi group trong lúc chờ
    art.picks.loading = false;
    if (r?.status === 'ok') {
      Object.assign(art.picks, { tags: r.tags || [], series: r.series || [], error: '' });
      // Bỏ series / tag không còn dùng được với các group mới chọn
      const ok = (set, list) => new Set([...set].filter((id) => list.some((x) => x.id === id)));
      art.seriesIds = ok(art.seriesIds, art.picks.series);
      art.tagIds = ok(art.tagIds, art.picks.tags);
    } else art.picks.error = r?.message || 'Không đọc được series / tag';
    renderArtPicks();
  }, 300);
}

// ---------- Vẽ ----------

function renderArtGroups() {
  const box = $('art-groups');
  const gs = groups().filter((g) => !g.error);
  box.replaceChildren();
  if (!gs.length) box.append(el('div', { class: 'muted small', text: data.state.snapshot ? 'Không có group nào' : 'Chưa quét' }));
  for (const g of gs) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = art.groupIds.has(g.id);
    cb.addEventListener('change', () => {
      cb.checked ? art.groupIds.add(g.id) : art.groupIds.delete(g.id);
      updateArticle();
      loadArtPicks();
      saveArticleDraft();
    });
    box.append(el('label', { class: g.isCommunity ? null : 'sub' }, cb, el('span', { text: (g.isCommunity ? '' : '└ ') + g.name })));
  }
}

function toggleChip(set, id, max, label) {
  if (set.has(id)) set.delete(id);
  else if (set.size >= max) return toast(`Tối đa ${max} ${label}`, 'warn');
  else set.add(id);
  renderArticle();
  saveArticleDraft();
}

function chip(text, on, onclick, title = '') {
  return el('button', { type: 'button', class: 'art-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title, text: (on ? '✓ ' : '') + text, onclick });
}

function renderArtCats() {
  const c = art.cats;
  $('art-cats-note').textContent = c.loading ? 'Đang tải…' : c.error || (c.loaded ? '' : '');
  $('art-cats').replaceChildren(...c.items.map((x) => chip(x.name, art.categoryIds.has(x.id), () => toggleChip(art.categoryIds, x.id, 3, 'chuyên mục'))));
  if (c.error) $('art-cats').append(el('button', { type: 'button', class: 'ghost sm', text: 'Thử lại', onclick: () => loadCategories() }));
}

function renderArtPicks() {
  const p = art.picks;
  const box = $('art-picks');
  if (!art.groupIds.size) return box.replaceChildren(el('span', { class: 'muted small', text: 'Chọn group để thêm Article vào series hoặc gắn tag.' }));
  if (p.loading) return box.replaceChildren(el('span', { class: 'muted small', text: 'Đang đọc series / tag…' }));
  if (p.error) return box.replaceChildren(el('span', { class: 'err-text small', text: p.error }));
  box.replaceChildren(
    el('div', { class: 'art-pick-row' }, el('span', { class: 'picker-label', text: 'Series' }), p.series.length ? p.series.map((x) => chip(x.title || x.name, art.seriesIds.has(x.id), () => toggleChip(art.seriesIds, x.id, BG.SERIES_MAX, 'series'))) : el('span', { class: 'muted small', text: 'Chưa có series nào ở các group này' })),
    el('div', { class: 'art-pick-row' }, el('span', { class: 'picker-label', text: 'Tag' }), p.tags.length ? p.tags.map((x) => chip('#' + x.name, art.tagIds.has(x.id), () => toggleChip(art.tagIds, x.id, BG.TAG_MAX, 'tag'))) : el('span', { class: 'muted small', text: 'Chưa có tag nào' })),
  );
}

function renderArtCover() {
  const box = $('art-cover');
  box.replaceChildren(art.cover ? el('img', { src: art.cover.preview, alt: 'Ảnh bìa' }) : el('span', { class: 'muted small', text: 'Chưa có ảnh bìa — nên dùng ảnh ngang khoảng 1200 × 514' }));
  $('btn-art-cover').textContent = art.cover ? 'Đổi ảnh…' : 'Chọn ảnh…';
  $('btn-art-cover-clear').hidden = !art.cover;
}

// Chế độ xem: write (chỉ soạn) | split (soạn + xem trước cạnh nhau) | preview (chỉ xem trước)
function renderArtPreview() {
  const v = art.view;
  $('art-editor').classList.toggle('split', v === 'split');
  $('art-content').hidden = v === 'preview';
  $('art-preview').hidden = v === 'write';
  for (const b of $('art-view').querySelectorAll('button')) b.classList.toggle('active', b.dataset.f === v);
  for (const b of $('art-toolbar').querySelectorAll(':scope > button')) b.disabled = v === 'preview';
  if (v === 'write') return;
  const title = $('art-title').value.trim();
  const summary = $('art-summary').value.trim();
  // plateHtml đã escape HTML; tiêu đề / tóm tắt gắn bằng textContent
  const body = el('div');
  body.innerHTML = BG.plateHtml(BG.mdToPlate(withImages($('art-content').value, true), { id: () => '', mentions: art.mentions }));
  // replaceChildren biến null thành chữ "null": chỉ đưa vào phần có thật
  $('art-preview').replaceChildren(
    ...[
      art.cover ? el('img', { class: 'art-preview-cover', src: art.cover.preview, alt: '' }) : null,
      el('h1', { class: 'art-preview-title', text: title || '(chưa có tiêu đề)' }),
      summary ? el('p', { class: 'muted', text: summary }) : null,
      body,
    ].filter(Boolean),
  );
}

// Cập nhật nút, bộ đếm, trạng thái theo nội dung đang soạn (gọi mỗi lần gõ)
function updateArticle() {
  const isArticle = art.mode === 'article';
  $('article').classList.toggle('mode-series', !isArticle);
  for (const b of $('article-mode').querySelectorAll('button')) b.classList.toggle('active', b.dataset.f === art.mode);
  // Hẹn giờ: điền sẵn giờ trước khi đọc form
  const later = isArticle && document.querySelector('input[name="art-when"]:checked')?.value === 'later';
  $('art-at').disabled = !later;
  if (later && !$('art-at').value) $('art-at').value = toLocalInput(nextQuarter());
  const a = readArticle();
  const titleMax = isArticle ? BG.ARTICLE_TITLE_MAX : BG.SERIES_TITLE_MAX;
  const sumMax = isArticle ? BG.ARTICLE_SUMMARY_MAX : BG.SERIES_SUMMARY_MAX;
  $('art-title').maxLength = titleMax;
  $('art-summary').maxLength = sumMax;
  $('art-title').placeholder = isArticle ? 'Tiêu đề Article' : 'Tên series';
  $('art-summary').placeholder = isArticle ? 'Tóm tắt ngắn hiện ở bảng tin (không bắt buộc)' : 'Mô tả series (không bắt buộc)';
  $('art-title-label').textContent = isArticle ? 'Tiêu đề' : 'Tên series';
  $('art-summary-label').textContent = isArticle ? 'Tóm tắt' : 'Mô tả';
  $('art-title-n').textContent = `${a.title.trim().length}/${titleMax}`;
  $('art-summary-n').textContent = `${a.summary.trim().length}/${sumMax}`;
  if (isArticle) {
    const nodes = BG.mdToPlate(withImages(a.content), { id: () => '' });
    const len = BG.plateText(nodes).length;
    $('art-count').textContent = `${BG.plateWords(nodes).toLocaleString('vi-VN')} từ · ${len.toLocaleString('vi-VN')}/${BG.ARTICLE_MAX.toLocaleString('vi-VN')} ký tự`;
    $('art-count').classList.toggle('over', len > BG.ARTICLE_MAX);
  }
  // Đăng dưới tên group
  const target = artAsGroupTarget();
  $('art-as-group').disabled = !target;
  $('art-as-group-label').textContent = isArticle ? 'Đăng dưới tên group' : 'Tạo dưới tên group';
  $('art-as-group-hint').textContent = target ? ($('art-as-group').checked ? `Hiện với tên và ảnh của ${target.name}.` : '') : art.groupIds.size > 1 ? 'Chỉ dùng được khi chọn một group.' : '';
  // Kiểm tra và nút
  const lost = isArticle ? missingImages(a.content) : [];
  const err = lost.length ? `${lost.length} ảnh trong bài cần chọn lại (ảnh không được lưu trong nháp) — xoá dòng ![…](local:…) rồi chèn lại` : isArticle ? BG.validateArticle({ ...a, content: withImages(a.content), scheduledAt: a.scheduledAt === 'invalid' ? null : a.scheduledAt }) : BG.validateSeries(a);
  $('art-hint').textContent = err ? 'Còn thiếu: ' + err : '';
  const btn = $('btn-art-submit');
  btn.disabled = !!err || art.running || busy || a.scheduledAt === 'invalid';
  btn.textContent = art.running ? 'Đang gửi…' : isArticle ? (later ? 'Hẹn giờ Article' : 'Đăng Article') : 'Tạo series';
  $('btn-art-clear').disabled = art.running;
  if (art.view !== 'write') renderArtPreview(); // xem trước cập nhật ngay khi gõ
}

function renderArticle() {
  loadArticleDraftOnce();
  renderArtGroups();
  renderArtCover();
  if (art.mode === 'article') {
    if (!art.cats.loaded && !art.cats.error && groups().length) loadCategories();
    renderArtCats();
    renderArtPicks();
    loadArtPicks();
  }
  renderArtPreview();
  updateArticle();
}

// ---------- Gửi ----------

async function uploadCover() {
  if (art.cover.item) return art.cover.item;
  const resource = art.mode === 'article' ? 'article:cover' : 'series:cover';
  art.cover.item = await uploader.upload('image', art.cover.file, (p) => ($('btn-art-submit').textContent = `Đang tải ảnh bìa ${Math.round(p * 100)}%…`), { resource });
  return art.cover.item;
}

async function submitArticle() {
  if (art.running || busy) return;
  const isArticle = art.mode === 'article';
  const a = readArticle();
  if (a.scheduledAt === 'invalid') return toast('Chưa chọn giờ hẹn', 'err');
  const lost = isArticle ? missingImages(a.content) : [];
  if (lost.length) return toast(`${lost.length} ảnh trong bài cần chọn lại`, 'err');
  const err = isArticle ? BG.validateArticle({ ...a, content: withImages(a.content) }) : BG.validateSeries(a);
  if (err) return toast(err, 'err');
  const bodyImages = isArticle ? localRefs(a.content).length : 0;
  const targets = artGroups();
  const dry = data.settings.dryRun;
  const asName = a.asGroup ? ` dưới tên ${targets[0].name}` : '';
  const catNames = art.cats.items.filter((c) => art.categoryIds.has(c.id)).map((c) => c.name);
  const seriesNames = art.picks.series.filter((x) => art.seriesIds.has(x.id)).map((x) => x.title || x.name);
  const ok = await confirmDialog({
    title: isArticle ? (a.scheduledAt ? `Hẹn giờ Article lúc ${fmtTime(a.scheduledAt)}${asName}?` : `Đăng Article vào ${targets.length} group${asName}?`) : `Tạo series "${a.title.trim()}"${asName}?`,
    text: [a.title.trim(), isArticle && catNames.length ? 'Chuyên mục: ' + catNames.join(', ') : '', seriesNames.length ? 'Series: ' + seriesNames.join(', ') : ''].filter(Boolean).join(' · '),
    names: targets.map((g) => groupPath(g)),
    okText: isArticle ? (a.scheduledAt ? 'Hẹn giờ' : 'Đăng') : 'Tạo series',
    sendNote: dry ? 'Đang bật Chạy thử: chỉ ghi nhật ký, không tải ảnh và không gửi lên Beincom.' : `Tải ảnh bìa${bodyImages ? ` và ${bodyImages} ảnh trong bài` : ''} lên Beincom trước, rồi ${isArticle ? (a.scheduledAt ? 'hẹn giờ (tới giờ Beincom tự đăng)' : 'đăng ngay') : 'tạo series'}.`,
  });
  if (!ok) return;
  art.running = true;
  updateArticle();
  let r;
  try {
    let coverId = 'dry-run';
    let content = a.content;
    if (!dry) {
      try {
        coverId = (await uploadCover()).id;
      } catch (e) {
        return toast('Ảnh bìa: ' + (e.message || e), 'err');
      }
      if (isArticle) {
        try {
          content = await uploadArticleImages(content);
        } catch (e) {
          return toast('Ảnh trong bài: ' + (e.message || e), 'err');
        }
      }
    } else content = withImages(content); // chạy thử: không tải, chỉ ghi nhật ký
    const msg = isArticle
      ? { type: 'composeArticle', groupIds: a.groupIds, title: a.title, summary: a.summary, content, categoryIds: a.categoryIds, coverId, tags: a.tags, series: a.series, scheduledAt: a.scheduledAt, asGroup: a.asGroup, mentions: a.mentions }
      : { type: 'composeSeries', groupIds: a.groupIds, title: a.title, summary: a.summary, coverId, isImportant: a.isImportant, asGroup: a.asGroup };
    r = await send(msg, () => (isArticle ? (a.scheduledAt ? `Đã hẹn giờ Article lúc ${fmtTime(a.scheduledAt)}.` : 'Đã đăng Article.') : 'Đã tạo series.'));
  } finally {
    art.running = false;
    updateArticle();
  }
  if (r?.status === 'ok' && !r.dryRun) {
    clearArticle(false);
    if (isArticle && a.scheduledAt) loadScheduled();
    if (!isArticle) art.picks.key = ''; // series mới: đọc lại danh sách series
  }
}

function clearArticle(ask = true) {
  if (ask && ($('art-title').value.trim() || $('art-content').value.trim() || art.cover) && !confirm('Xoá nội dung đang soạn?')) return;
  for (const id of ['art-title', 'art-summary', 'art-content']) $(id).value = '';
  if (art.cover?.preview) URL.revokeObjectURL(art.cover.preview);
  art.cover = null;
  for (const im of Object.values(art.images)) URL.revokeObjectURL(im.preview);
  art.images = {};
  art.mentions = {};
  art.categoryIds.clear();
  art.seriesIds.clear();
  art.tagIds.clear();
  $('art-important').checked = false;
  document.querySelector('input[name="art-when"][value="now"]').checked = true;
  $('art-at').value = '';
  renderArticle();
  saveArticleDraft();
}

// ---------- Sự kiện ----------

onSeg('article-mode', (m) => {
  art.mode = m;
  if (art.cover) art.cover.item = null; // ảnh bìa Article và Series tải với loại khác nhau
  renderArticle();
  saveArticleDraft();
});
onSeg('art-view', (v) => {
  art.view = v;
  renderArtPreview();
});
for (const id of ['art-title', 'art-summary', 'art-content', 'art-at', 'art-as-group', 'art-important']) {
  $(id).addEventListener('input', () => {
    updateArticle();
    saveArticleDraft();
  });
}
for (const r of document.querySelectorAll('input[name="art-when"]')) {
  r.addEventListener('change', () => {
    updateArticle();
    saveArticleDraft();
  });
}
$('btn-art-cover').addEventListener('click', () => $('art-cover-file').click());
$('art-cover-file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) return toast('Ảnh bìa phải là JPG, PNG, WEBP hoặc GIF', 'err');
  if (f.size > 25 * 1024 * 1024) return toast('Ảnh bìa tối đa 25 MB', 'err');
  if (art.cover?.preview) URL.revokeObjectURL(art.cover.preview);
  art.cover = { file: f, preview: URL.createObjectURL(f), item: null };
  renderArtCover();
  updateArticle();
});
$('btn-art-cover-clear').addEventListener('click', () => {
  if (art.cover?.preview) URL.revokeObjectURL(art.cover.preview);
  art.cover = null;
  renderArtCover();
  updateArticle();
});
$('btn-art-submit').addEventListener('click', submitArticle);
// Thanh công cụ Article: định dạng dùng chung với ô Đăng bài (dash/compose.js), thêm tiêu đề H1–H3, gạch chân, bảng, video, ảnh, nhắc tên
const artTa = () => $('art-content');
const ART_MD = {
  bold: () => mdWrap('**', '**', 'chữ đậm', artTa()),
  italic: () => mdWrap('*', '*', 'chữ nghiêng', artTa()),
  underline: () => mdWrap('++', '++', 'chữ gạch chân', artTa()),
  strike: () => mdWrap('~~', '~~', 'chữ gạch', artTa()),
  code: () => mdWrap('`', '`', 'mã', artTa()),
  h1: () => mdLines('h1', artTa()),
  h2: () => mdLines('h2', artTa()),
  h3: () => mdLines('h3', artTa()),
  ul: () => mdLines('ul', artTa()),
  ol: () => mdLines('ol', artTa()),
  quote: () => mdLines('quote', artTa()),
  hr: () => mdHr(artTa()),
  link: () => mdLink(artTa()),
  image: () => $('art-img-file').click(),
  video: () => {
    const url = prompt('Link video YouTube hoặc Vimeo:', 'https://youtu.be/');
    if (!url) return;
    if (!BG.mdToPlate(url.trim(), { id: () => '' }).some((n) => n.type === 'media_embed')) return toast('Chỉ nhúng được link YouTube hoặc Vimeo', 'err');
    mdBlock(url.trim(), artTa());
  },
  table: () => {
    const head = '| Cột 1 | Cột 2 | Cột 3 |\n|---|---|---|\n';
    mdBlock(head + '|  |  |  |\n|  |  |  |', artTa(), [2, 7]); // chọn sẵn "Cột 1" để gõ đè
  },
  mention: () => {
    const ta = artTa();
    const { selectionStart: s, value: v } = ta;
    const text = (s && !/\s/.test(v[s - 1]) ? ' ' : '') + '@';
    editReplace(ta, s, ta.selectionEnd, text, s + text.length, s + text.length);
    checkMention('article');
  },
};
$('art-toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-md]');
  if (b && !b.disabled && ART_MD[b.dataset.md]) ART_MD[b.dataset.md]();
});
$('art-content').addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = { b: 'bold', i: 'italic', u: 'underline', k: 'link' }[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  ART_MD[k]();
});
$('art-img-file').addEventListener('change', (e) => {
  insertImages(e.target.files);
  e.target.value = '';
});
// Nhắc tên trong nội dung Article: dùng chung ô gợi ý của khung soạn bài (dash/attach.js)
MENTION_TARGETS.article = {
  ta: () => $('art-content'),
  box: () => $('art-editor'),
  pop: () => $('art-mention-pop'),
  groupIds: () => artGroups().map((g) => g.id),
  pick: (u) => {
    art.mentions[u.username] = BG.articleMentionEntry(u);
    updateArticle();
    saveArticleDraft();
  },
};
$('art-content').addEventListener('keydown', mentionKeys);
$('art-content').addEventListener('input', () => checkMention('article'));
$('art-content').addEventListener('click', () => checkMention('article'));
$('art-content').addEventListener('keyup', (e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && checkMention('article'));
$('art-content').addEventListener('blur', () => mention.open && mention.target === 'article' && closeMention());
$('art-content').addEventListener('scroll', () => mention.open && mention.target === 'article' && renderMention());
$('btn-art-clear').addEventListener('click', () => clearArticle(true));
