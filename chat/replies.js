// Trang Chat — câu trả lời mẫu: gõ / ở đầu ô chat (hoặc bấm nút 📋) để chèn câu soạn sẵn; sửa trong hộp Câu trả lời mẫu.
// Lưu ở khoá `chatReplies` (trong máy, có trong bản sao lưu); chưa có thì dùng bộ mặc định (BG.DEFAULT_CHAT_REPLIES).

const RP = { list: BG.chatRepliesOf(null), draft: [] };

async function loadReplies() {
  try {
    const { chatReplies } = await chrome.storage.local.get('chatReplies');
    RP.list = BG.chatRepliesOf(chatReplies);
  } catch {}
}

// Danh sách câu mẫu ở ô gõ t. q: đoạn "/chữ" đang gõ, hoặc { start: con trỏ, term: '', button: true } khi bấm nút 📋.
// Gõ mà không câu nào khớp thì đóng (Enter vẫn gửi tin như thường)
function slashSuggest(t, q) {
  const hits = BG.matchChatReplies(RP.list, q.term);
  if (!hits.length && !q.button) return closeMention();
  clearTimeout(M.timer);
  M.seq++;
  Object.assign(M, { t, q, mode: 'slash', i: 0, items: [...hits.map((r) => ({ reply: r })), { manage: true }] });
  renderMention();
}

// Chọn một câu: thay đoạn "/chữ" (bấm nút thì chèn tại con trỏ); mục cuối mở hộp sửa
function pickReply(u, t) {
  const q = (t && !M.q?.button && BG.chatSlashQuery(t.value, t.selectionStart)) || M.q;
  closeMention();
  if (!u || !t || !q) return;
  if (u.manage) return openReplies();
  const end = q.button ? q.start : t.selectionStart;
  const text = u.reply.text;
  applyEdit({ from: q.start, to: end, text, selStart: q.start + text.length, selEnd: q.start + text.length }, t);
}

// ---------- Hộp sửa câu trả lời mẫu ----------

function openReplies() {
  RP.draft = RP.list.map((x) => ({ ...x }));
  $('rp-note').textContent = '';
  renderReplies();
  $('replies').returnValue = '';
  $('replies').showModal();
}

function renderReplies() {
  $('rp-list').replaceChildren(
    ...(RP.draft.length
      ? RP.draft.map((r, i) =>
          el(
            'div',
            { class: 'rp-row' },
            el('input', { type: 'text', class: 'rp-name', value: r.name, maxlength: 40, placeholder: 'Tên ngắn, vd: Nội quy', 'aria-label': 'Tên câu mẫu', oninput: (e) => (r.name = e.target.value) }),
            el('button', { type: 'button', class: 'rp-del', title: 'Xoá câu này', 'aria-label': 'Xoá câu ' + (r.name || 'này'), onclick: () => (RP.draft.splice(i, 1), renderReplies()) }, '✕'),
            el('textarea', { class: 'rp-text', rows: 2, maxlength: 4000, placeholder: 'Nội dung câu trả lời', 'aria-label': 'Nội dung câu ' + (r.name || 'mẫu'), oninput: (e) => (r.text = e.target.value) }, r.text),
          ),
        )
      : [el('p', { class: 'rp-empty' }, 'Chưa có câu mẫu nào — bấm ＋ Thêm câu.')]),
  );
}

function addCannedReply(text = '') {
  RP.draft.push({ id: 'r' + Date.now().toString(36), name: '', text });
  renderReplies();
  const names = $('rp-list').querySelectorAll('.rp-name');
  names[names.length - 1]?.focus();
}

$('btn-replies').addEventListener('click', () => {
  const t = $('text');
  if (t.disabled) return;
  if (!$('mention-pop').hidden && M.mode === 'slash') return closeMention();
  t.focus();
  slashSuggest(t, { start: t.selectionStart, term: '', button: true });
});
$('t-btn-replies').addEventListener('click', () => {
  const t = $('t-text');
  if (t.disabled || !S.thread) return;
  if (!$('mention-pop').hidden && M.mode === 'slash') return closeMention();
  t.focus();
  slashSuggest(t, { start: t.selectionStart, term: '', button: true });
});
// Bấm ra ngoài: đóng danh sách câu mẫu
document.addEventListener('mousedown', (e) => {
  if (M.mode === 'slash' && !e.target.closest('#mention-pop, #btn-replies, #t-btn-replies')) closeMention();
});
$('rp-add').addEventListener('click', () => addCannedReply());
$('rp-from').addEventListener('click', () => {
  const text = $('text').value.trim();
  if (!text) return void ($('rp-note').textContent = 'Ô chat đang trống — gõ câu muốn lưu vào ô chat trước.');
  $('rp-note').textContent = '';
  addCannedReply(text);
});
$('rp-reset').addEventListener('click', () => {
  RP.draft = BG.DEFAULT_CHAT_REPLIES.map((x) => ({ ...x }));
  renderReplies();
});
$('replies').addEventListener('close', async () => {
  if ($('replies').returnValue !== 'ok') return;
  const list = BG.cleanChatReplies(RP.draft) || [];
  RP.list = list;
  try {
    await chrome.storage.local.set({ chatReplies: list });
    toast(`Đã lưu ${list.length} câu trả lời mẫu`);
  } catch {
    toast('Không lưu được câu trả lời mẫu', 'err');
  }
});
