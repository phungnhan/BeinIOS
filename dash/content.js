// Dashboard — tab Bài viết: duyệt bài, bài mới đăng, bài đang ghim, cài đặt một bài.

// ---------- Duyệt bài ----------

function approvalGroups() {
  return groups().filter((g) => g.approvalCount != null);
}

function currentCommunity() {
  const gs = approvalGroups();
  return gs.find((g) => g.id === selectedCommunityId) || gs.find((g) => g.approvals?.length) || gs[0] || null;
}

function renderApproval() {
  const gs = approvalGroups();
  const g = currentCommunity();
  const sel = $('community-select');
  sel.replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: `${x.communityName || x.name} (${x.approvalCount || 0})` })));
  sel.disabled = !gs.length;
  const open = $('approval-open');
  open.hidden = !g;
  if (g) open.href = BG.contentApprovalUrl(g.communityId);

  const rows = (g?.approvals || []).map((p) => ({ p, ev: evalPost(p, g) }));
  const counts = { all: rows.length, ok: 0, review: 0, bad: 0 };
  for (const r of rows) counts[r.ev.verdict]++;
  setCounts('acnt', counts);
  setSegActive('approval-filter', approvalFilter);

  const note = $('approval-note');
  note.textContent = '';
  if (!gs.length) note.textContent = data.state.snapshot ? 'Không community nào bạn quản trị group gốc đang bật duyệt bài.' : '';
  else if (g?.approvalError) note.textContent = g.approvalError;
  else if (g && g.approvalCount > rows.length) note.textContent = `Đang hiện ${rows.length}/${g.approvalCount} bài — duyệt bớt rồi quét lại để tải tiếp.`;

  pruneSelection(selectedPosts, new Set(rows.map((r) => r.p.id)));
  const shown = rows.filter((r) => approvalFilter === 'all' || r.ev.verdict === approvalFilter);
  const bulk = () => renderBulk({ set: selectedPosts, shown, idOf: (r) => r.p.id, checkAll: 'approval-check-all', countEl: 'approval-selected', buttons: ['btn-approve-posts', 'btn-reject-posts'] });
  const body = $('approval-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !g ? 'Chưa có dữ liệu' : rows.length ? 'Không có bài nào trong mục này' : 'Không có bài nào đang chờ duyệt 🎉';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p, ev } of shown) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selectedPosts, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p)),
        el('td', { title: fmtTime(p.submittedAt), text: ago(p.submittedAt) }),
        verdictCell(BG.POST_VERDICT_LABELS.approval[ev.verdict], ev.verdict, ev.reasons),
        el(
          'td',
          { class: 'act' },
          el('button', { class: 'ok-btn sm', disabled: busy, text: 'Duyệt', onclick: () => actApproval('approve', g, [p]) }),
          el('button', { class: 'danger sm', disabled: busy, text: 'Từ chối', onclick: () => actApproval('reject', g, [p]) }),
        ),
      ),
    );
  }
  bulk();
}

function snippet(p) {
  const t = (p.title || p.text || '').replace(/\s+/g, ' ').trim();
  return `${p.actor.fullname || p.actor.username || '?'}: ${t.length > 70 ? t.slice(0, 70) + '…' : t || '(không có chữ)'}`;
}

async function actApproval(action, g, posts) {
  if (busy || !posts.length) return;
  const reject = action === 'reject';
  let reasonBox = null;
  if (reject) {
    reasonBox = el('textarea', { rows: 3, placeholder: 'Vd: Bài có link quảng cáo, vi phạm nội quy nhóm' });
    // Gợi ý lý do từ quy tắc khi chỉ từ chối một bài
    if (posts.length === 1) {
      const bad = evalPost(posts[0], g).reasons.filter((x) => x.level !== 'ok');
      if (bad.length) reasonBox.value = bad.map((x) => x.text).join('; ');
    }
  }
  const extra = reject ? el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do từ chối' }), el('br'), el('span', { class: 'muted small', text: 'Gửi cho người đăng. Có thể để trống.' })), reasonBox) : null;
  const ok = await confirmDialog({
    title: `${reject ? 'Từ chối' : 'Duyệt'} ${posts.length} bài?`,
    text: 'Community: ' + (g.communityName || g.name),
    names: posts.map(snippet),
    okText: reject ? 'Từ chối' : 'Duyệt',
    danger: reject,
    extra,
  });
  if (!ok) return;
  const r = await send({ type: 'approvalAct', action, groupId: g.id, contentIds: posts.map((p) => p.id), reason: reasonBox?.value || '' }, (n) => `${reject ? 'Đã từ chối' : 'Đã duyệt'} ${n} bài.`);
  if (!r?.dryRun) for (const p of posts) selectedPosts.delete(p.id);
  renderApproval();
}

// ---------- Bài mới đăng ----------

function recentRows() {
  return (data.state.recentPosts || []).map((p) => ({ p, ev: evalPost(p) }));
}

function inFilter(r, f) {
  if (f === 'hidden') return r.p.isHidden;
  if (f === 'dismissed') return r.p.dismissed && !r.p.isHidden;
  if (f === 'all') return !r.p.isHidden;
  return !r.p.isHidden && !r.p.dismissed && r.ev.verdict !== 'ok'; // flagged
}

function renderRecent() {
  const rows = recentRows();
  setCounts('rcnt', Object.fromEntries(['flagged', 'all', 'dismissed', 'hidden'].map((f) => [f, rows.filter((r) => inFilter(r, f)).length])));
  setSegActive('recent-filter', recentFilter);
  const adminIds = new Set(groups().map((g) => g.id));

  const note = $('recent-note');
  if (!data.settings.scanPosts) note.textContent = 'Đang tắt "Quét bài mới đăng" ở phần Cài đặt.';
  else if (!data.state.recentPosts) note.textContent = data.state.snapshot ? 'Chưa quét bài mới — bấm Quét ngay.' : '';
  else note.textContent = 'Xoá bài: chỉ với bài của chính bạn (Beincom không cho admin xoá bài người khác). Ẩn bài: gỡ bài người khác khỏi các group bạn quản trị; addon chưa hiện lại được. Bỏ qua: chỉ ẩn khỏi danh sách này.';

  pruneSelection(selectedRecent, new Set(rows.map((r) => r.p.id)));
  const filtered = rows.filter((r) => inFilter(r, recentFilter));
  const shown = filtered.slice(0, recentLimit);
  const hideable = recentFilter !== 'hidden';
  const bulk = () => renderBulk({ set: selectedRecent, shown, idOf: (r) => r.p.id, checkAll: 'recent-check-all', countEl: 'recent-selected', buttons: hideable ? ['btn-dismiss-posts', 'btn-hide-posts'] : [] });
  $('btn-dismiss-posts').textContent = recentFilter === 'dismissed' ? 'Hiện lại đã chọn' : 'Bỏ qua đã chọn';
  $('btn-hide-posts').hidden = recentFilter === 'hidden';
  $('btn-dismiss-posts').hidden = recentFilter === 'hidden';

  const body = $('recent-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !data.state.recentPosts ? 'Chưa có dữ liệu' : recentFilter === 'flagged' ? 'Không có bài nào cần xử lý 🎉' : 'Không có bài nào trong mục này';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p, ev } of shown) {
    const actions = [el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' })];
    if (!p.isHidden) {
      actions.push(
        p.dismissed
          ? el('button', { class: 'ghost sm', disabled: busy, text: 'Hiện lại', onclick: () => dismissPosts([p], false) })
          : el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => dismissPosts([p], true) }),
        // Beincom chỉ cho xoá bài của chính mình; bài người khác thì admin ẩn khỏi group
        isMine(p)
          ? el('button', { class: 'danger sm', disabled: busy, text: 'Xoá bài', onclick: () => deletePosts([p]) })
          : el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn bài', title: 'Beincom không cho admin xoá bài của người khác; ẩn bài sẽ gỡ bài khỏi các group bạn quản trị', onclick: () => hidePosts([p]) }),
        el(
          'span',
          { class: 'act-break' },
          el('button', { class: 'ghost sm', disabled: busy, text: '📌 Ghim', title: 'Ghim / bỏ ghim bài ở các group bạn quản trị (tối đa 5 bài mỗi group)', onclick: () => pinPost(p) }),
          el('button', { class: 'ghost sm', disabled: busy, text: '⚙ Cài đặt', title: 'Bật / tắt bình luận, cảm xúc, đánh dấu Quan trọng', onclick: () => settingPost(p) }),
          isMine(p) ? el('button', { class: 'ghost sm', disabled: busy, text: '✎ Sửa', title: 'Sửa nội dung bài đã đăng', onclick: () => editPost(p) }) : null,
        ),
      );
    }
    body.append(
      el(
        'tr',
        { class: p.isHidden || p.dismissed ? 'muted-row' : null },
        el('td', { class: 'cb' }, p.isHidden ? null : rowCheckbox(selectedRecent, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p, adminIds)),
        el('td', { title: fmtTime(p.publishedAt), text: ago(p.publishedAt) }),
        p.isHidden ? el('td', {}, el('span', { class: 'tag info', text: 'Đã ẩn' })) : verdictCell(BG.POST_VERDICT_LABELS.published[ev.verdict], ev.verdict, ev.reasons),
        el('td', { class: 'act act-wrap' }, el('div', {}, actions)),
      ),
    );
  }
  $('btn-recent-more').hidden = filtered.length <= recentLimit;
  bulk();
}

function isMine(p) {
  return !!p.actor?.id && p.actor.id === data.state.me?.id;
}

async function deletePosts(posts) {
  if (busy || !posts.length) return;
  const ok = await confirmDialog({
    title: `Xoá ${posts.length} bài của bạn?`,
    text: 'Bài bị xoá vĩnh viễn trên Beincom, ở mọi group bài được đăng vào.',
    names: posts.map(snippet),
    okText: 'Xoá bài',
    danger: true,
    sendNote: 'Sẽ gửi lên Beincom ngay và không hoàn tác được.',
  });
  if (!ok) return;
  const r = await send({ type: 'postAct', action: 'delete', contentIds: posts.map((p) => p.id) }, (n) => `Đã xoá ${n} bài.`);
  if (!r?.dryRun) for (const p of posts) selectedRecent.delete(p.id);
  renderRecent();
}

async function dismissPosts(posts, dismiss) {
  if (busy || !posts.length) return;
  await chrome.runtime.sendMessage({ type: 'postAct', action: dismiss ? 'dismiss' : 'undismiss', contentIds: posts.map((p) => p.id) });
  for (const p of posts) selectedRecent.delete(p.id);
  await loadAll();
}

async function hidePosts(posts) {
  if (busy || !posts.length) return;
  const select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  // Chọn sẵn "Spam" khi bài có link bị cấm
  select.value = posts.some((p) => evalPost(p).reasons.some((x) => /link/.test(x.text))) ? 'SPAM' : 'OTHERS';
  const extra = el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select);
  const ok = await confirmDialog({
    title: `Ẩn ${posts.length} bài?`,
    text: 'Bài sẽ bị ẩn khỏi các group bạn quản trị mà bài được đăng vào.',
    names: posts.map(snippet),
    okText: 'Ẩn bài',
    danger: true,
    extra,
    sendNote: 'Sẽ gửi lên Beincom ngay. Addon chưa hiện lại được bài đã ẩn.',
  });
  if (!ok) return;
  const r = await send({ type: 'postAct', action: 'hide', contentIds: posts.map((p) => p.id), reasonType: select.value }, (n) => `Đã ẩn ${n} bài.`);
  if (!r?.dryRun) for (const p of posts) selectedRecent.delete(p.id);
  renderRecent();
}

// ---------- Bình luận mới ----------

const COMMENT_PAGE_UI = 30;
let commentFilter = 'flagged';
let commentLimit = COMMENT_PAGE_UI;
const selectedComments = new Set();

function commentRows() {
  return (data.state.recentComments || []).map((c) => ({ p: c, ev: evalPost(c) }));
}

function commentContent(c) {
  const extra = [c.images && `${c.images} ảnh`, c.giphy && 'ảnh GIF', c.totalReply && `${c.totalReply} trả lời`].filter(Boolean).join(' · ');
  return el(
    'div',
    {},
    c.parentId ? el('span', { class: 'tag info', text: '↳ trả lời' }) : null,
    el('div', { class: 'cmt-text', text: c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text || '(không có chữ)' }),
    extra ? el('div', { class: 'muted small', text: extra }) : null,
  );
}

function renderComments() {
  const rows = commentRows();
  setCounts('ccnt', Object.fromEntries(['flagged', 'all', 'dismissed', 'hidden'].map((f) => [f, rows.filter((r) => inFilter(r, f)).length])));
  setSegActive('comment-filter', commentFilter);

  const note = $('comments-note');
  if (!data.settings.scanPosts || !data.settings.scanComments) note.textContent = 'Đang tắt "Quét bình luận mới" (hoặc "Quét bài mới đăng") ở phần Cài đặt.';
  else if (!data.state.recentComments) note.textContent = data.state.snapshot ? 'Chưa đọc bình luận — bấm Quét ngay.' : '';
  else note.textContent = 'Mỗi lần quét đọc bình luận mới nhất của tối đa 8 bài có bình luận mới. Ẩn bình luận: như nút Ẩn trên web Beincom. Bỏ qua: chỉ ẩn khỏi danh sách này.';

  pruneSelection(selectedComments, new Set(rows.map((r) => r.p.id)));
  const filtered = rows.filter((r) => inFilter(r, commentFilter));
  const shown = filtered.slice(0, commentLimit);
  const hideable = commentFilter !== 'hidden';
  const bulk = () => renderBulk({ set: selectedComments, shown, idOf: (r) => r.p.id, checkAll: 'comments-check-all', countEl: 'comments-selected', buttons: hideable ? ['btn-dismiss-comments', 'btn-hide-comments'] : [] });
  $('btn-dismiss-comments').textContent = commentFilter === 'dismissed' ? 'Hiện lại đã chọn' : 'Bỏ qua đã chọn';
  $('btn-hide-comments').hidden = !hideable;
  $('btn-dismiss-comments').hidden = !hideable;

  const body = $('comments-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !data.state.recentComments ? 'Chưa có dữ liệu' : commentFilter === 'flagged' ? 'Không có bình luận nào cần xử lý 🎉' : 'Không có bình luận nào trong mục này';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p: c, ev } of shown) {
    const actions = [el('a', { href: BG.commentUrl(c), target: '_blank', text: 'Mở ↗' })];
    if (!c.isHidden) {
      actions.push(
        c.dismissed
          ? el('button', { class: 'ghost sm', disabled: busy, text: 'Hiện lại', onclick: () => dismissComments([c], false) })
          : el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => dismissComments([c], true) }),
        el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn', onclick: () => hideComments([c]) }),
      );
    }
    body.append(
      el(
        'tr',
        { class: c.isHidden || c.dismissed ? 'muted-row' : null },
        el('td', { class: 'cb' }, c.isHidden ? null : rowCheckbox(selectedComments, c.id, 'bình luận của ' + (c.actor.fullname || c.actor.username), bulk)),
        el('td', {}, postAuthor(c.actor)),
        el('td', {}, commentContent(c)),
        el('td', {}, el('div', { class: 'cmt-post' }, el('a', { href: BG.postUrl({ id: c.postId, type: c.postType }), target: '_blank', text: c.postSnippet || 'Mở bài' })), el('div', { class: 'muted small', text: (c.groups || []).map((g) => g.name).join(', ') })),
        el('td', { title: fmtTime(c.createdAt), text: ago(c.createdAt) }),
        c.isHidden ? el('td', {}, el('span', { class: 'tag info', text: 'Đã ẩn' })) : verdictCell(BG.POST_VERDICT_LABELS.published[ev.verdict], ev.verdict, ev.reasons),
        el('td', { class: 'act act-wrap' }, el('div', {}, actions)),
      ),
    );
  }
  $('btn-comments-more').hidden = filtered.length <= commentLimit;
  bulk();
}

async function dismissComments(list, dismiss) {
  if (busy || !list.length) return;
  await chrome.runtime.sendMessage({ type: 'commentAct', action: dismiss ? 'dismiss' : 'undismiss', commentIds: list.map((c) => c.id) });
  for (const c of list) selectedComments.delete(c.id);
  await loadAll();
}

async function hideComments(list) {
  if (busy || !list.length) return;
  const select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  select.value = list.some((c) => evalPost(c).reasons.some((x) => /link/.test(x.text))) ? 'SPAM' : 'OTHERS';
  const extra = el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select);
  const ok = await confirmDialog({
    title: `Ẩn ${list.length} bình luận?`,
    text: 'Bình luận bị ẩn khỏi bài trên Beincom (như nút Ẩn của admin trên web).',
    names: list.map(snippet),
    okText: 'Ẩn bình luận',
    danger: true,
    extra,
    sendNote: 'Sẽ gửi lên Beincom ngay. Addon chưa hiện lại được bình luận đã ẩn.',
  });
  if (!ok) return;
  const r = await send({ type: 'commentAct', action: 'hide', commentIds: list.map((c) => c.id), reasonType: select.value }, (n) => `Đã ẩn ${n} bình luận.`);
  if (!r?.dryRun) for (const c of list) selectedComments.delete(c.id);
  renderComments();
}

// ---------- Bài đang ghim ----------

const pins = { groupId: null, data: {}, loading: false, error: '' };

function pinGroups() {
  return groups().filter((g) => !g.error);
}

function pinGroup() {
  const gs = pinGroups();
  return gs.find((g) => g.id === pins.groupId) || gs[0] || null;
}

// Đọc bài đang ghim của các group; trả về { groupId: [bài] }
async function fetchPinned(ids) {
  const r = await chrome.runtime.sendMessage({ type: 'pinned', groupIds: ids });
  if (r?.status !== 'ok') throw new Error(r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Có lỗi');
  Object.assign(pins.data, r.pinned);
  return r.pinned;
}

async function loadPinned() {
  const g = pinGroup();
  if (!g || pins.loading) return;
  pins.groupId = g.id;
  pins.loading = true;
  pins.error = '';
  renderPinned();
  try {
    await fetchPinned([g.id]);
  } catch (e) {
    pins.error = e.message;
  } finally {
    pins.loading = false;
    renderPinned();
  }
}

function renderPinned() {
  const gs = pinGroups();
  const g = pinGroup();
  $('pinned-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name })));
  $('pinned-group').disabled = !gs.length || pins.loading;
  const list = g ? pins.data[g.id] : null;
  $('pinned-count').textContent = list ? `${list.length}/${BG.PIN_MAX} bài` : '';
  const note = $('pinned-note');
  note.classList.toggle('err-text', !!pins.error);
  note.textContent = pins.error || (pins.loading ? 'Đang tải…' : list && list.length >= BG.PIN_MAX ? `Đã ghim đủ ${BG.PIN_MAX} bài — muốn ghim bài khác thì bỏ ghim bớt.` : 'Ghim bài: bấm "📌 Ghim" ở bài trong danh sách Bài mới đăng.');
  const body = $('pinned-body');
  body.replaceChildren();
  if (!list?.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: pins.loading ? 'Đang tải…' : list ? 'Group chưa ghim bài nào' : 'Bấm "Tải lại" để xem' })));
  for (const p of list || []) {
    body.append(
      el(
        'tr',
        {},
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', { title: fmtTime(p.publishedAt), text: ago(p.publishedAt) }),
        el('td', { class: 'act' }, el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' }), el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ ghim', onclick: () => unpinPost(p, g) })),
      ),
    );
  }
}

async function unpinPost(p, g) {
  const ok = await confirmDialog({ title: 'Bỏ ghim bài này?', text: 'Group: ' + g.name, names: [snippet(p)], okText: 'Bỏ ghim' });
  if (!ok) return;
  const r = await send({ type: 'pinAct', contentId: p.id, unpin: [g.id], snippet: snippet(p), actor: p.actor }, () => 'Đã bỏ ghim.');
  if (r?.status === 'ok' && !r.dryRun) await fetchPinned([g.id]).catch(() => {});
  renderPinned();
}

// Ghim / bỏ ghim một bài: chọn các group (bạn quản trị) bài được đăng vào
async function pinPost(p) {
  const admin = new Set(groups().map((g) => g.id));
  const ids = [...new Set([...p.groups.map((x) => x.id), ...(p.seenIn || [])])].filter((id) => admin.has(id));
  if (!ids.length) return toast('Bài không thuộc group nào bạn quản trị', 'err');
  let current;
  try {
    current = await fetchPinned(ids);
  } catch (e) {
    return toast(e.message, 'err');
  }
  const was = new Set(ids.filter((id) => (current[id] || []).some((x) => x.id === p.id)));
  const boxes = ids.map((id) => {
    const g = groups().find((x) => x.id === id);
    const n = (current[id] || []).length;
    const full = n >= BG.PIN_MAX && !was.has(id);
    const cb = el('input', { type: 'checkbox', checked: was.has(id), disabled: full });
    return { id, cb, row: el('label', { title: full ? `Đã ghim đủ ${BG.PIN_MAX} bài` : '' }, cb, el('span', { text: `${g?.name || id} — đang ghim ${n}/${BG.PIN_MAX}` + (full ? ' (đủ)' : '') })) };
  });
  const ok = await confirmDialog({
    title: 'Ghim / bỏ ghim bài',
    text: 'Chọn group muốn ghim bài này; bỏ chọn để bỏ ghim.',
    names: [snippet(p)],
    okText: 'Lưu',
    extra: el('div', { class: 'pin-choices' }, boxes.map((b) => b.row)),
  });
  if (!ok) return;
  const pin = boxes.filter((b) => b.cb.checked && !was.has(b.id)).map((b) => b.id);
  const unpin = boxes.filter((b) => !b.cb.checked && was.has(b.id)).map((b) => b.id);
  if (!pin.length && !unpin.length) return toast('Không có thay đổi');
  const r = await send({ type: 'pinAct', contentId: p.id, pin, unpin, snippet: snippet(p), actor: p.actor }, () => [pin.length ? `Đã ghim ở ${pin.length} group` : '', unpin.length ? `bỏ ghim ở ${unpin.length} group` : ''].filter(Boolean).join(', ') + '.');
  if (r?.status === 'ok' && !r.dryRun) await fetchPinned(ids).catch(() => {});
  renderPinned();
}

// ---------- Cài đặt một bài ----------

// Ô chọn cài đặt: dùng cho hộp Cài đặt bài; trả về { el, read() }
function settingForm(s) {
  const comment = el('input', { type: 'checkbox', checked: s.canComment !== false });
  const react = el('input', { type: 'checkbox', checked: s.canReact !== false });
  const important = el('input', { type: 'checkbox', checked: !!s.isImportant });
  const preset = el('select', { 'aria-label': 'Hết Quan trọng sau' }, Object.entries(BG.IMPORTANT_FOR).map(([v, label]) => el('option', { value: v, text: label })));
  const until = el('input', { type: 'datetime-local', 'aria-label': 'Quan trọng đến lúc' });
  preset.value = s.isImportant ? (s.importantExpiredAt ? 'custom' : 'never') : '1w';
  if (s.importantExpiredAt) until.value = toLocalInput(new Date(s.importantExpiredAt));
  const sync = () => {
    preset.disabled = !important.checked;
    until.hidden = !important.checked || preset.value !== 'custom';
  };
  important.addEventListener('change', sync);
  preset.addEventListener('change', sync);
  sync();
  return {
    el: el(
      'div',
      { class: 'setting-form' },
      el('label', { class: 'check' }, comment, ' Cho bình luận'),
      el('label', { class: 'check' }, react, ' Cho thả cảm xúc'),
      el('div', { class: 'row' }, el('label', { class: 'check' }, important, ' Đánh dấu Quan trọng'), preset, until),
    ),
    read: () => ({
      canComment: comment.checked,
      canReact: react.checked,
      isImportant: important.checked,
      importantExpiredAt: !important.checked ? null : preset.value === 'custom' ? (until.value ? new Date(until.value).toISOString() : null) : BG.importantUntil(preset.value, new Date()),
    }),
  };
}

async function settingPost(p) {
  const d = await chrome.runtime.sendMessage({ type: 'postDetail', id: p.id, any: true });
  if (d?.status !== 'ok') return toast(d?.message || 'Không đọc được bài', 'err');
  const form = settingForm(d.post.setting);
  const ok = await confirmDialog({ title: 'Cài đặt bài', text: 'Áp dụng cho bài ở mọi group bài được đăng.', names: [snippet(p)], okText: 'Lưu cài đặt', extra: form.el });
  if (!ok) return;
  await send({ type: 'postSetting', id: p.id, setting: form.read(), snippet: snippet(p), groupName: p.groups.map((g) => g.name).join(', '), actor: p.actor }, () => 'Đã lưu cài đặt bài.');
}

// ---------- Sự kiện ----------

$('community-select').addEventListener('change', (e) => {
  selectedCommunityId = e.target.value;
  selectedPosts.clear();
  renderApproval();
});
onSeg('approval-filter', (f) => {
  approvalFilter = f;
  renderApproval();
});
$('approval-check-all').addEventListener('change', (e) => {
  const g = currentCommunity();
  for (const p of g?.approvals || []) {
    if (approvalFilter !== 'all' && evalPost(p, g).verdict !== approvalFilter) continue;
    e.target.checked ? selectedPosts.add(p.id) : selectedPosts.delete(p.id);
  }
  renderApproval();
});
for (const [btn, action] of [['btn-approve-posts', 'approve'], ['btn-reject-posts', 'reject']]) {
  $(btn).addEventListener('click', () => {
    const g = currentCommunity();
    if (g) actApproval(action, g, g.approvals.filter((p) => selectedPosts.has(p.id)));
  });
}

$('pinned-group').addEventListener('change', (e) => {
  pins.groupId = e.target.value;
  pins.error = '';
  if (!pins.data[pins.groupId]) loadPinned();
  else renderPinned();
});
onSeg('recent-filter', (f) => {
  recentFilter = f;
  recentLimit = RECENT_PAGE;
  selectedRecent.clear();
  renderRecent();
});
$('recent-check-all').addEventListener('change', (e) => {
  for (const r of recentRows().filter((r) => inFilter(r, recentFilter)).slice(0, recentLimit)) e.target.checked ? selectedRecent.add(r.p.id) : selectedRecent.delete(r.p.id);
  renderRecent();
});
const pickedRecent = () => (data.state.recentPosts || []).filter((p) => selectedRecent.has(p.id));
$('btn-dismiss-posts').addEventListener('click', () => dismissPosts(pickedRecent(), recentFilter !== 'dismissed'));
$('btn-hide-posts').addEventListener('click', () => hidePosts(pickedRecent()));
onSeg('comment-filter', (f) => {
  commentFilter = f;
  commentLimit = COMMENT_PAGE_UI;
  selectedComments.clear();
  renderComments();
});
$('comments-check-all').addEventListener('change', (e) => {
  for (const r of commentRows().filter((r) => inFilter(r, commentFilter)).slice(0, commentLimit)) e.target.checked ? selectedComments.add(r.p.id) : selectedComments.delete(r.p.id);
  renderComments();
});
const pickedComments = () => (data.state.recentComments || []).filter((c) => selectedComments.has(c.id));
$('btn-dismiss-comments').addEventListener('click', () => dismissComments(pickedComments(), commentFilter !== 'dismissed'));
$('btn-hide-comments').addEventListener('click', () => hideComments(pickedComments()));
$('btn-comments-more').addEventListener('click', () => {
  commentLimit += COMMENT_PAGE_UI;
  renderComments();
});
$('btn-recent-more').addEventListener('click', () => {
  recentLimit += RECENT_PAGE;
  renderRecent();
});
