// Dashboard — cửa sổ Bài viết & bình luận: nội dung bài, mọi bình luận (đọc thẳng từ Beincom, kèm trả lời), Trả lời / Ẩn /
// Dọn tài khoản từng bình luận, viết bình luận. Mở từ nút 💬 Bình luận của bài, Trả lời ở Bình luận mới, Việc cần làm.
// Nạp sau content.js (dùng hideComments, peopleOfPost, cleanupUser của tab Bài viết).

const PV = { post: null, items: [], after: '', hasNext: false, loading: false, error: '', replies: {}, replyLoading: {}, reply: null, full: null, expanded: false };

// Bài trong kết quả quét; không có (bình luận của bài cũ) thì dựng bài tối thiểu từ bình luận
function postOf(postId, c = null) {
  const p = (data.state.recentPosts || []).find((x) => x.id === postId);
  if (p) return p;
  return { id: postId, type: c?.postType || 'POST', title: '', text: c?.postSnippet || '', actor: null, groups: c?.groups || [], seenIn: c?.seenIn || [], media: { images: 0, videos: 0, files: 0 }, link: '', publishedAt: null, commentsCount: 0, stub: true };
}

async function openPost(p, { reply = null } = {}) {
  if (!p?.id) return;
  Object.assign(PV, { post: p, items: [], after: '', hasNext: false, loading: false, error: '', replies: {}, replyLoading: {}, reply: null, full: null, expanded: false });
  $('pv-text').value = '';
  setPvReply(reply);
  renderPostView();
  if (!$('postview').open) $('postview').showModal();
  $('pv-text').focus();
  await loadPostComments();
}

// Article / bài bị cắt chữ: cửa sổ hiện như thẻ xem trước, cuối có "Xem thêm" để đọc cả bài
const hasMore = (p) => !p.stub && (p.type === 'ARTICLE' || p.full === false || String(p.text || '').length >= 3900);
function togglePvMore() {
  PV.expanded = !PV.expanded;
  if (PV.expanded && (!PV.full || PV.full.error)) return loadFullPost(PV.post);
  renderPostView();
}

// Trả lời một bình luận: dòng "Trả lời …" phía trên ô viết, điền sẵn @tên như web
function setPvReply(c) {
  const t = c ? BG.replyTarget(c) : null;
  PV.reply = c ? { c, commentId: t.commentId } : null;
  $('pv-to').hidden = !c;
  $('pv-to-text').textContent = c ? `Trả lời ${c.actor?.fullname || c.actor?.username || 'bình luận'}: ${String(c.text || '').replace(/\s+/g, ' ').slice(0, 80)}` : '';
  $('pv-send').textContent = c ? 'Gửi trả lời' : 'Gửi bình luận';
  if (c && t.prefill && !$('pv-text').value.startsWith(t.prefill)) $('pv-text').value = t.prefill + $('pv-text').value;
  if (c) {
    const box = $('pv-text');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

async function loadPostComments(older = false) {
  if (!PV.post || PV.loading) return;
  PV.loading = true;
  PV.error = '';
  renderPvComments();
  const id = PV.post.id;
  const r = await chrome.runtime.sendMessage({ type: 'postComments', postId: id, after: older ? PV.after : '' });
  if (PV.post?.id !== id) return;
  PV.loading = false;
  if (r?.status === 'ok') {
    const seen = new Set(older ? PV.items.map((x) => x.id) : []);
    PV.items = [...(older ? PV.items : []), ...r.items.filter((x) => !seen.has(x.id))];
    PV.after = r.after || '';
    PV.hasNext = !!r.hasNext && !!r.after;
  } else PV.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn — đăng nhập lại rồi bấm Tải lại.' : r?.message || 'Không đọc được bình luận';
  renderPvComments();
}

async function loadPvReplies(c) {
  if (PV.replyLoading[c.id]) return;
  PV.replyLoading[c.id] = true;
  renderPvComments();
  const r = await chrome.runtime.sendMessage({ type: 'postComments', postId: PV.post.id, parentId: c.id });
  PV.replyLoading[c.id] = false;
  if (r?.status === 'ok') PV.replies[c.id] = r.items;
  else toast(r?.message || 'Không đọc được trả lời', 'err');
  renderPvComments();
}

function renderPostView() {
  const p = PV.post;
  if (!p) return;
  $('pv-title').textContent = p.actor ? `Bài viết của ${p.actor.fullname || p.actor.username}` : 'Bài viết';
  $('pv-open').href = BG.postUrl(p);
  const content = postContent(p);
  const body = content.querySelector('.post-text');
  const more = hasMore(p);
  // Bài ngắn: hiện đủ chữ. Article / bài dài: như thẻ xem trước, "Xem thêm" mới đọc cả bài
  if (!more) body?.classList.remove('clamp');
  const f = PV.full;
  const before = content.querySelector('.post-meta');
  if (more && PV.expanded) {
    if (f?.loading) content.insertBefore(el('p', { class: 'muted small', text: 'Đang tải bài đầy đủ…' }), before);
    else if (f?.error) content.insertBefore(el('p', { class: 'err-text small', text: f.error }), before);
    else if (f?.nodes?.length) {
      // Article: dựng theo khối (tiêu đề mục, ảnh, link, danh sách…)
      const art = el('div', { class: 'pl-body' }, plateEls(f.nodes));
      if (body) body.replaceWith(art);
      else content.insertBefore(art, before);
    } else if (body) {
      body.classList.remove('clamp');
      if (f?.text) body.textContent = f.text;
    }
  }
  if (more) content.insertBefore(el('button', { type: 'button', class: 'link-btn pv-more', disabled: !!f?.loading, 'aria-expanded': String(PV.expanded), text: PV.expanded ? 'Thu gọn ▴' : 'Xem thêm ▾', onclick: togglePvMore }), before);
  $('pv-post').replaceChildren(
    el(
      'div',
      { class: 'pv-meta' },
      p.actor ? postAuthor(p.actor) : null,
      el('span', { class: 'muted small', title: p.publishedAt ? fmtTime(p.publishedAt) : '', text: [p.publishedAt ? ago(p.publishedAt) : '', (p.groups || []).map((g) => g.name).filter(Boolean).join(', ')].filter(Boolean).join(' · ') }),
    ),
    content,
  );
  renderPvComments();
}

// Một bình luận: người viết, lúc viết, nội dung, nhãn (đã ẩn / vi phạm), các nút
function pvComment(c, isReply = false) {
  const ev = evalPost(c);
  const meId = data.state.me?.id;
  const text = el('div', { class: 'pv-ctext', text: c.text || (c.images ? '(ảnh)' : c.giphy ? '(ảnh GIF)' : '(không có chữ)') });
  const tags = [
    c.isHidden ? el('span', { class: 'tag info', text: 'Đã ẩn' }) : null,
    !c.isHidden && ev.verdict === 'bad' ? el('span', { class: 'tag err', title: ev.reasons.map((x) => x.text).join('; '), text: 'Vi phạm' }) : null,
    c.images ? el('span', { class: 'tag info', text: `🖼 ${c.images} ảnh` }) : null,
  ].filter(Boolean);
  return el(
    'div',
    { class: 'pv-c' + (isReply ? ' reply' : '') + (c.isHidden ? ' hidden-c' : ''), id: 'pvc-' + c.id },
    el('div', { class: 'pv-chead' }, c.actor ? postAuthor(c.actor) : null, el('span', { class: 'muted small', title: fmtTime(c.createdAt), text: ago(c.createdAt) }), ...tags),
    text,
    el(
      'div',
      { class: 'pv-cact' },
      el('button', { type: 'button', class: 'link-btn', disabled: busy, text: 'Trả lời', onclick: () => setPvReply(c) }),
      !c.isHidden && c.actor?.id !== meId ? el('button', { type: 'button', class: 'link-btn danger-text', disabled: busy, text: 'Ẩn', onclick: () => pvHide(c) }) : null,
      c.actor?.id && c.actor.id !== meId ? el('button', { type: 'button', class: 'link-btn', disabled: busy, title: 'Ẩn bài / bình luận gần đây và tuỳ chọn cấm người này', text: '🧹 Dọn tài khoản', onclick: () => cleanupUser(c.actor) }) : null,
      el('a', { href: BG.commentUrl(c), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' }),
    ),
  );
}

async function pvHide(c) {
  await hideComments([c]);
  // Ẩn xong (không phải Chạy thử): đánh dấu ngay trong cửa sổ
  if (!data.settings.dryRun) {
    const mark = (x) => (x.id === c.id ? { ...x, isHidden: true } : x);
    PV.items = PV.items.map(mark);
    for (const k of Object.keys(PV.replies)) PV.replies[k] = PV.replies[k].map(mark);
    renderPvComments();
  }
}

function renderPvComments() {
  const p = PV.post;
  if (!p) return;
  const byTime = (a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0);
  // API trả mới nhất trước: hiện cũ -> mới như web, trả lời nằm dưới bình luận gốc
  const roots = PV.items.filter((c) => !c.parentId).sort(byTime);
  const repliesOf = (id) => [...new Map([...PV.items.filter((c) => c.parentId === id), ...(PV.replies[id] || [])].map((x) => [x.id, x])).values()].sort(byTime);
  const n = Math.max(p.commentsCount || 0, PV.items.length);
  $('pv-count').textContent = PV.loading && !PV.items.length ? 'Đang tải bình luận…' : n ? `${n} bình luận` : 'Chưa có bình luận';
  $('pv-older').hidden = !PV.hasNext;
  $('pv-older').disabled = PV.loading;
  $('pv-older').textContent = PV.loading ? 'Đang tải…' : 'Xem bình luận cũ hơn';
  $('pv-reload').disabled = PV.loading;
  const list = $('pv-list');
  if (PV.error) return list.replaceChildren(el('p', { class: 'err-text small', text: PV.error }));
  if (!roots.length) return list.replaceChildren(el('p', { class: 'muted small pv-empty', text: PV.loading ? 'Đang tải…' : 'Chưa có bình luận nào — hãy là người đầu tiên.' }));
  list.replaceChildren(
    ...roots.map((c) => {
      const reps = repliesOf(c.id);
      const more = (c.totalReply || 0) - reps.length;
      return el(
        'div',
        { class: 'pv-thread' },
        pvComment(c),
        reps.length || more > 0
          ? el(
              'div',
              { class: 'pv-replies' },
              reps.map((r) => pvComment(r, true)),
              more > 0 && !PV.replies[c.id] ? el('button', { type: 'button', class: 'link-btn', disabled: !!PV.replyLoading[c.id], text: PV.replyLoading[c.id] ? 'Đang tải…' : `Xem ${more} trả lời`, onclick: () => loadPvReplies(c) }) : null,
            )
          : null,
      );
    }),
  );
}

// ---------- Bài đầy đủ: thẻ Article / chữ bị cắt ở danh sách chỉ là phần xem trước — mở cửa sổ thì đọc cả bài ----------

// Nội dung Article (khối Plate) -> phần tử trang (không dùng innerHTML; link chỉ http(s), ảnh chỉ https)
const httpLink = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
const httpsImg = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');
function plateEls(nodes, depth = 0) {
  if (depth > 12) return [];
  return (nodes || []).map((n) => plateEl(n, depth)).filter(Boolean);
}
function plateEl(n, depth) {
  if (!n || typeof n !== 'object') return null;
  if (typeof n.text === 'string') {
    if (!n.text) return null;
    let node = document.createTextNode(n.text);
    if (n.code) node = el('code', {}, node);
    if (n.bold) node = el('b', {}, node);
    if (n.italic) node = el('i', {}, node);
    if (n.underline) node = el('u', {}, node);
    if (n.strikethrough) node = el('s', {}, node);
    return node;
  }
  const kids = () => plateEls(n.children, depth + 1);
  switch (n.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return el(n.type === 'h1' ? 'h3' : 'h4', { class: 'pl-h ' + n.type }, kids());
    case 'blockquote':
      return el('blockquote', {}, kids());
    case 'ul':
    case 'ol':
      return el(n.type, {}, kids());
    case 'li':
      return el('li', {}, kids());
    case 'lic':
      return el('span', {}, kids());
    case 'hr':
      return el('hr');
    case 'a': {
      const href = httpLink(n.url);
      return href ? el('a', { href, target: '_blank', rel: 'noreferrer' }, kids()) : el('span', {}, kids());
    }
    case 'mention':
      return el('span', { class: 'pl-mention' }, '@' + (n.value || n.data?.username || ''));
    case 'img':
    case 'image': {
      const src = httpsImg(n.url);
      const cap = (n.caption || []).map((c) => c?.text || '').join('');
      return src ? el('figure', { class: 'pl-img' }, el('img', { src, alt: cap, loading: 'lazy', referrerpolicy: 'no-referrer' }), cap ? el('figcaption', {}, cap) : null) : null;
    }
    case 'media_embed':
    case 'video': {
      const href = httpLink(n.url);
      return href ? el('p', {}, el('a', { href, target: '_blank', rel: 'noreferrer' }, '🎬 ' + href)) : null;
    }
    case 'table':
      return el('table', { class: 'pl-table' }, el('tbody', {}, kids()));
    case 'tr':
      return el('tr', {}, kids());
    case 'td':
    case 'th':
      return el(n.type, {}, kids());
    case 'code_block':
      return el('pre', {}, el('code', {}, (n.children || []).map((l) => (l.children || []).map((c) => c.text || '').join('')).join('\n')));
    default: {
      // Đoạn (kể cả danh sách kiểu thụt lề của Plate: listStyleType + indent)
      const p = el('p', { class: n.listStyleType ? 'pl-li' : null, style: n.indent ? `margin-left: ${Math.min(6, n.indent) * 18}px` : null }, n.listStyleType ? (n.listStyleType === 'decimal' ? `${n.listStart || 1}. ` : '• ') : null, kids());
      return p;
    }
  }
}

async function loadFullPost(p) {
  PV.full = { loading: true };
  renderPostView();
  const r = await chrome.runtime.sendMessage({ type: 'postFull', id: p.id });
  if (PV.post?.id !== p.id) return;
  PV.full = r?.status === 'ok' ? { nodes: r.nodes, text: r.text, post: r.post } : { error: r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn — chưa đọc được bài đầy đủ.' : r?.message || 'Không đọc được bài đầy đủ' };
  // Bài đầy đủ có thêm ảnh bìa / tóm tắt / số phút đọc (bài lưu từ bản cũ chưa có)
  if (r?.post) PV.post = { ...PV.post, ...Object.fromEntries(['title', 'summary', 'cover', 'readMin', 'tags', 'commentsCount', 'reactions'].filter((k) => r.post[k] != null && r.post[k] !== '').map((k) => [k, r.post[k]])) };
  renderPostView();
}

async function pvSubmit(e) {
  e.preventDefault();
  const p = PV.post;
  const content = $('pv-text').value;
  const err = BG.validateComment(content);
  if (!p || err) return toast(err || 'Thiếu bài', 'err');
  // Nhắc tên: người đăng, người đã bình luận trong bài (cả trong cửa sổ)
  const people = [...new Map([...peopleOfPost(p.id), ...PV.items.map((c) => c.actor), ...Object.values(PV.replies).flat().map((c) => c.actor)].filter((u) => u?.id && u.username).map((u) => [u.id, u])).values()];
  const commentId = PV.reply?.commentId || '';
  const r = await send({ type: 'commentWrite', postId: p.id, commentId, content, mentions: BG.commentMentions(content, people) }, () => (commentId ? 'Đã gửi trả lời.' : 'Đã gửi bình luận.'));
  if (r?.status !== 'ok' || r.failed) return;
  $('pv-text').value = '';
  const parent = PV.reply?.commentId;
  setPvReply(null);
  if (r.dryRun) return;
  // Bình luận mới hiện ngay: đọc lại trang đầu (và trả lời của bình luận vừa trả lời)
  if (parent) delete PV.replies[parent];
  await loadPostComments();
  if (parent) {
    const root = PV.items.find((x) => x.id === parent);
    if (root) await loadPvReplies(root);
  }
}

$('pv-close').addEventListener('click', () => $('postview').close());
$('pv-reload').addEventListener('click', () => {
  PV.replies = {};
  loadPostComments();
});
$('pv-older').addEventListener('click', () => loadPostComments(true));
$('pv-to-x').addEventListener('click', () => {
  const t = PV.reply && BG.replyTarget(PV.reply.c).prefill;
  if (t && $('pv-text').value.startsWith(t)) $('pv-text').value = $('pv-text').value.slice(t.length);
  setPvReply(null);
});
$('pv-form').addEventListener('submit', pvSubmit);
// Ctrl + Enter gửi
$('pv-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('pv-form').requestSubmit();
});
$('postview').addEventListener('close', () => (PV.post = null));
