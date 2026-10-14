// Trang Chat — ghim / bỏ ghim tin, khung tin đã ghim.

// ---------- Ghim tin, tin đã ghim ----------

const canPin = (p) => !!S.sel && !p.deleted && !p.system && (S.sel.canDelete || S.sel.kind === 'dm');

async function togglePin(p) {
  const pin = !p.pinned;
  const r = await call('chatPin', { postId: p.id, pin, groupName: chatTitle(S.sel), snippet: BG.chatPlain(p.message).slice(0, 120), user: { id: p.user.id, username: p.user.username, fullname: p.user.fullname } });
  if (r.status !== 'ok' || r.failed) return toast(r.message || (r.errors || []).join('; ') || 'Không ghim được', 'err');
  if (r.dryRun) return toast('Chạy thử: đã ghi vào Nhật ký, chưa ' + (pin ? 'ghim' : 'bỏ ghim') + ' trên Beincom.');
  const upd = (m) => (m ? { ...m, pinned: pin } : m);
  if (S.posts.has(p.id)) S.posts.set(p.id, upd(S.posts.get(p.id)));
  if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, upd(S.thread.posts.get(p.id)));
  if (S.thread?.root.id === p.id) S.thread.root = S.posts.get(p.id) || upd(S.thread.root);
  S.pinned = pin ? [upd(p), ...(S.pinned || []).filter((x) => x.id !== p.id)] : (S.pinned || []).filter((x) => x.id !== p.id);
  renderPinnedCount();
  renderMsgs({ scroll: 'keep' });
  renderThread();
  if (!$('pins').hidden) renderPins();
  toast(pin ? 'Đã ghim tin nhắn.' : 'Đã bỏ ghim.');
}

async function loadPinned(c) {
  const r = await call('chatPinned', { channelId: c.id });
  if (S.sel?.id !== c.id) return;
  S.pinned = r.status === 'ok' ? r.posts : S.pinned;
  S.pinnedError = r.status === 'ok' ? '' : r.message || 'Không đọc được tin đã ghim';
  renderPinnedCount();
  if (!$('pins').hidden) renderPins();
}

function renderPinnedCount() {
  const n = (S.pinned || []).length;
  $('pinned-n').textContent = n ? String(n) : '';
  $('btn-pinned').classList.toggle('has', n > 0);
}

function openPins() {
  if (!S.sel) return;
  closeThread();
  closeSearch();
  $('pins').hidden = false;
  syncSide();
  $('p-sub').textContent = chatTitle(S.sel);
  renderPins();
  loadPinned(S.sel);
}

function closePins() {
  $('pins').hidden = true;
  syncSide();
}

function renderPins() {
  const list = S.pinned;
  const meId = S.me?.chatId;
  if (!list) return $('p-list').replaceChildren(el('div', { class: 't-sep' }, 'Đang tải…'));
  if (!list.length) return $('p-list').replaceChildren(el('div', { class: 'list-empty' }, S.pinnedError || 'Kênh này chưa có tin nào được ghim.' + (canPin({}) ? ' Rê chuột vào một tin → Ghim.' : '')));
  $('p-list').replaceChildren(...list.map((p) => messageEl(p, { first: true, last: true, mine: p.user.chatId === meId, mode: 'pins' })));
}
