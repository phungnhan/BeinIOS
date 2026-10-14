// Trang Chat — bộ gõ: định dạng, độ ưu tiên, xem trước, đính kèm, emoji, gửi tin, gợi ý @tên, sửa tin, bản nháp.

// ---------- Bộ gõ tin nhắn (như web Beincom): định dạng, độ ưu tiên, xem trước, đính kèm, emoji ----------

const FMT_KEY = 'beingroup-chat-fmt';
const EMOJI_KEY = 'beingroup-chat-emoji';
const DMTAB_KEY = 'beingroup-chat-dmtab';
const FILE_MAX = 25 * 1024 * 1024; // máy chủ chat Beincom: MaxFileSize 25 MB
const FILES_MAX = 10;
const PRIO_LABEL = { important: 'Quan trọng', urgent: 'Khẩn cấp' };
const SHORTCUTS = [
  ['KeyB', false, false, 'bold'],
  ['KeyI', false, false, 'italic'],
  ['KeyX', true, false, 'strike'],
  ['KeyK', false, true, 'link'],
  ['KeyC', false, true, 'code'],
  ['Digit9', true, false, 'quote'],
  ['Digit8', true, false, 'ul'],
  ['Digit7', true, false, 'ol'],
];
const svgPrio = (p) => svg(p === 'urgent' ? 'M12 6 19.53 19H4.47L12 6Zm0-4L1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-6h-2v4h2v-4Z' : 'M11 15h2v2h-2v-2Zm0-8h2v6h-2V7Zm1-5C6.47 2 2 6.48 2 12s4.47 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8Z');

// Áp một lần thay (BG.mdEdit / BG.mdNewline) vào ô gõ; dùng insertText để Ctrl + Z vẫn hoàn tác được
function applyEdit(r, t = $('text')) {
  if (!r) return;
  if (S.preview && t === $('text')) setPreview(false);
  t.focus();
  t.setSelectionRange(r.from, r.to);
  const ok = r.text ? document.execCommand('insertText', false, r.text) : r.from === r.to || document.execCommand('delete');
  if (!ok) t.setRangeText(r.text, r.from, r.to, 'end');
  t.setSelectionRange(r.selStart, r.selEnd);
  t.dispatchEvent(new Event('input')); // cỡ ô gõ, nút gửi
}
// t: ô gõ chính (#text) hoặc ô bình luận (#t-text)
const format = (kind, t = $('text')) => {
  if (t.disabled) return;
  applyEdit(BG.mdEdit(t.value, t.selectionStart, t.selectionEnd, kind), t);
};
function insertText(text, t = $('text')) {
  if (t.disabled) return;
  const caret = t === $('text') ? S.caret : S.tCaret;
  const [s, e] = document.activeElement === t || caret == null ? [t.selectionStart, t.selectionEnd] : [caret, caret];
  applyEdit({ from: s, to: e, text, selStart: s + text.length, selEnd: s + text.length }, t);
}

// Xem trước: tin hiện như sau khi gửi
function setPreview(on) {
  S.preview = !!on;
  const text = $('text').value;
  $('preview').hidden = !S.preview;
  $('text').hidden = S.preview;
  $('btn-preview').setAttribute('aria-pressed', String(S.preview));
  $('btn-preview').classList.toggle('on', S.preview);
  if (S.preview) $('preview').replaceChildren(...(text.trim() ? mdNodes(BG.chatMarkdown(text)) : [el('span', { class: 'muted' }, 'Chưa có gì để xem trước.')]));
  else $('text').focus();
}

// Thanh định dạng: Aa ẩn / hiện (nhớ trong máy)
function setFmt(on) {
  S.fmt = !!on;
  $('fmt').hidden = !S.fmt;
  $('btn-fmt').setAttribute('aria-pressed', String(S.fmt));
  $('btn-fmt').classList.toggle('on', S.fmt);
  try {
    localStorage.setItem(FMT_KEY, S.fmt ? '1' : '0');
  } catch {}
}

// Độ ưu tiên của tin: Tiêu chuẩn / Quan trọng / Khẩn cấp (gửi kèm metadata.priority như web)
function renderPrio() {
  const p = S.priority || '';
  $('prio-chip').hidden = !p;
  $('prio-chip').className = 'prio-chip ' + p;
  $('prio-chip').replaceChildren(...(p ? [svgPrio(p), el('span', {}, PRIO_LABEL[p].toUpperCase()), el('button', { type: 'button', 'aria-label': 'Bỏ độ ưu tiên', title: 'Bỏ độ ưu tiên', onclick: () => setPriority('') }, '✕')] : []));
  $('btn-prio').className = 'tb' + (p ? ' ' + p + ' on' : '');
  for (const b of document.querySelectorAll('#prio-menu [data-prio]')) b.setAttribute('aria-checked', String(b.dataset.prio === p));
}
function setPriority(p) {
  S.priority = BG.CHAT_PRIORITIES.includes(p) ? p : '';
  renderPrio();
  closePops();
  $('text').focus();
}

// Hộp nổi phía trên nút (độ ưu tiên, emoji)
function openPop(pop, btn, align) {
  closePops(pop);
  pop.hidden = false;
  const c = pop.parentElement.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  // Mở hẳn phía trên khung gõ (không đè chữ đang gõ, tệp đính kèm)
  const box = (pop.parentElement.querySelector('.box, .t-box') || btn).getBoundingClientRect();
  pop.style.bottom = `${Math.round(c.bottom - Math.min(box.top, b.top) + 6)}px`;
  if (align === 'right') {
    pop.style.right = `${Math.max(8, Math.round(c.right - b.right))}px`;
    pop.style.left = '';
  } else {
    pop.style.left = `${Math.max(8, Math.round(b.left - c.left))}px`;
    pop.style.right = '';
  }
  btn.setAttribute('aria-expanded', 'true');
}
function closePops(except) {
  for (const [pop, btn] of [['prio-menu', 'btn-prio'], ['emoji-pop', 'btn-emoji'], ['emoji-pop', 't-btn-emoji']]) {
    if ($(pop) === except || $(pop).hidden && $(btn).getAttribute('aria-expanded') !== 'true') continue;
    $(pop).hidden = true;
    $(btn).setAttribute('aria-expanded', 'false');
  }
}

// Emoji: hay dùng (nhớ trong máy) + vài nhóm thường gặp
const EMOJI = [
  ['🕘', 'Hay dùng', []],
  ['😀', 'Mặt cười', [...'😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😋😛😜🤪🤑🤗🤭🤫🤔🤐😐😑😶😏😒🙄😬😌😔😪😴😷🤒🤕🤢🥵🥶😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫😤😡😠🤬']],
  ['👍', 'Cử chỉ', ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '👏', '🙌', '👐', '🤲', '🙏', '🤝', '💪', '✍️', '👀', '🧠']],
  ['❤️', 'Trái tim', ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝']],
  ['🚀', 'Crypto', ['🚀', '🌕', '📈', '📉', '💰', '💵', '💸', '💎', '🪙', '🏦', '🔥', '⚡', '✅', '❌', '⚠️', '🎉', '🎁', '🏆', '⭐', '🌟', '💯', '🔔', '📢', '📌', '🔗', '🐂', '🐻', '🐳', '🦄', '⏳', '🎯', '🤖']],
  [':bic_purple_heart:', 'Beincom', [...BG.BIC_EMOJI.animated, ...BG.BIC_EMOJI.static].map((n) => `:${n}:`)],
  [':bamzo_happy:', 'Bamzo', BG.BIC_EMOJI.mascot.map((n) => `:${n}:`)],
];
// Mục emoji: biểu cảm riêng (":bic_…:") hiện bằng ảnh, còn lại là chữ emoji
const emojiFace = (e) => (/^:[\w-]+:$/.test(e) ? emojiImg(e.slice(1, -1)) : e);
const EMOJI_DEFAULT = ['👍', '❤️', '😂', '🙏', '🔥', '🎉', '🚀', '✅', '😍', '👏', '💯', '😅'];
function recentEmoji() {
  try {
    const l = JSON.parse(localStorage.getItem(EMOJI_KEY) || '[]');
    return Array.isArray(l) && l.length ? l.slice(0, 24) : EMOJI_DEFAULT;
  } catch {
    return EMOJI_DEFAULT;
  }
}
function renderEmoji(tab = S.emojiTab || 0) {
  S.emojiTab = tab;
  $('emoji-tabs').replaceChildren(...EMOJI.map(([ic, name], k) => el('button', { type: 'button', role: 'tab', class: 'etab' + (k === tab ? ' on' : ''), title: name, 'aria-label': name, 'aria-selected': String(k === tab), onclick: () => renderEmoji(k) }, emojiFace(ic))));
  const list = tab === 0 ? recentEmoji() : EMOJI[tab][2];
  const label = (e) => (/^:[\w-]+:$/.test(e) ? BG.chatEmojiLabel(e.slice(1, -1)) : e);
  $('emoji-grid').replaceChildren(...list.map((e) => el('button', { type: 'button', class: 'emo', title: label(e), 'aria-label': label(e), onclick: () => pickEmoji(e) }, emojiFace(e))));
}
// Hộp emoji dùng chung: mở ở ô nào thì chèn vào ô đó (hộp được chuyển vào khung của ô)
function openEmoji(forThread) {
  const pop = $('emoji-pop');
  const btn = $(forThread ? 't-btn-emoji' : 'btn-emoji');
  if (!pop.hidden && S.emojiFor === (forThread ? 't-text' : 'text')) return closePops();
  S.emojiFor = forThread ? 't-text' : 'text';
  $(forThread ? 't-composer' : 'composer').append(pop);
  renderEmoji(0);
  openPop(pop, btn, 'right');
}
function pickEmoji(e) {
  insertText(e, $(S.emojiFor || 'text'));
  try {
    localStorage.setItem(EMOJI_KEY, JSON.stringify([e, ...recentEmoji().filter((x) => x !== e)].slice(0, 24)));
  } catch {}
}

// Đính kèm: chọn tệp, dán ảnh, kéo thả; tải lên ngay (lần lượt từng tệp), gửi kèm mã tệp khi gửi tin
const readB64 = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
// Hai bộ tệp đính kèm: ô gõ chính ('main') và ô bình luận ('thread'); mỗi bộ tải lên lần lượt
const ATT = {
  main: { key: 'attach', busy: 'uploading', box: 'attach-list', input: 'text', update: () => updateSend() },
  thread: { key: 'tAttach', busy: 'tUploading', box: 't-attach-list', input: 't-text', update: () => tUpdateSend() },
};
function addFiles(list, where = 'main') {
  const c = S.sel;
  const A = ATT[where];
  if (!c || $(A.input).disabled || (where === 'thread' && !S.thread)) return;
  for (const f of [...(list || [])]) {
    if (S[A.key].length >= FILES_MAX) {
      toast(`Tối đa ${FILES_MAX} tệp mỗi tin`, 'err');
      break;
    }
    if (!f.size) toast(`${f.name || 'Tệp'}: tệp trống`, 'err');
    else if (f.size > FILE_MAX) toast(`${f.name || 'Tệp'}: lớn quá 25 MB`, 'err');
    else S[A.key].push({ key: Math.random().toString(36).slice(2), file: f, name: f.name || 'anh-dan.png', size: f.size, type: f.type || '', status: 'wait', channelId: c.id, thumb: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' });
  }
  renderAttach(where);
  pumpUploads(where);
}
async function pumpUploads(where = 'main') {
  const A = ATT[where];
  if (S[A.busy]) return;
  const a = S[A.key].find((x) => x.status === 'wait');
  if (!a) return;
  S[A.busy] = true;
  a.status = 'up';
  renderAttach(where);
  let r;
  try {
    const data = await readB64(a.file);
    r = await call('chatUpload', { channelId: a.channelId, name: a.name, mime: a.type, data }); // không đặt tên trường là type (trùng loại lệnh)
  } catch (e) {
    r = { status: 'error', message: 'Không đọc được tệp' };
  }
  S[A.busy] = false;
  if (S[A.key].includes(a)) Object.assign(a, r.status === 'ok' ? { status: 'ok', id: r.file.id } : { status: 'err', error: r.message || 'lỗi' });
  renderAttach(where);
  pumpUploads(where);
}
function removeAttach(key, where = 'main') {
  const A = ATT[where];
  const a = S[A.key].find((x) => x.key === key);
  if (a?.thumb) URL.revokeObjectURL(a.thumb);
  S[A.key] = S[A.key].filter((x) => x.key !== key);
  renderAttach(where);
}
function clearAttach(where = 'main') {
  const A = ATT[where];
  for (const a of S[A.key]) if (a.thumb) URL.revokeObjectURL(a.thumb);
  S[A.key] = [];
  renderAttach(where);
}
function renderAttach(where = 'main') {
  const A = ATT[where];
  const box = $(A.box);
  box.hidden = !S[A.key].length;
  box.replaceChildren(
    ...S[A.key].map((a) =>
      el(
        'div',
        { class: 'att ' + a.status, title: a.error ? `${a.name}: ${a.error}` : a.name },
        a.thumb ? el('img', { src: a.thumb, alt: '' }) : el('span', { class: 'att-ic' }, svgFile()),
        el('span', { class: 'att-main' }, el('span', { class: 'att-name' }, a.name), el('small', {}, a.status === 'up' ? 'Đang tải lên…' : a.status === 'wait' ? 'Chờ tải lên' : a.status === 'err' ? 'Lỗi: ' + a.error : sizeText(a.size))),
        el('button', { type: 'button', class: 'att-x', title: 'Bỏ tệp', 'aria-label': 'Bỏ tệp ' + a.name, onclick: () => removeAttach(a.key, where) }, '✕'),
      ),
    ),
  );
  A.update();
}

// Đổi cuộc trò chuyện: bỏ tệp đang chờ (tải lên theo kênh), độ ưu tiên, xem trước
function resetComposer() {
  clearAttach();
  S.priority = '';
  renderPrio();
  closePops();
  if (S.preview) {
    S.preview = false;
    $('preview').hidden = true;
    $('text').hidden = false;
    $('btn-preview').setAttribute('aria-pressed', 'false');
    $('btn-preview').classList.remove('on');
  }
}

// ---------- Gửi tin ----------

function autosize() {
  const t = $('text');
  t.style.height = 'auto';
  t.style.height = Math.min(160, t.scrollHeight) + 'px';
  updateSend();
}
function updateSend() {
  const busy = S.attach.some((a) => a.status === 'up' || a.status === 'wait');
  const files = S.attach.some((a) => a.status === 'ok');
  $('send').disabled = S.sending || busy || $('text').disabled || (!$('text').value.trim() && !files);
}

async function sendMsg(e) {
  e?.preventDefault();
  const c = S.sel;
  if (S.editing) return saveEdit();
  const text = $('text').value.trim();
  const fileIds = S.attach.filter((a) => a.status === 'ok').map((a) => a.id);
  if (!c || (!text && !fileIds.length) || S.sending || $('send').disabled) return;
  // Trả lời lời mời trò chuyện là chấp nhận lời mời (như web Beincom)
  const accept = c.contact?.incoming && c.contact.status !== 'ignored' && c.contact.id ? c.contact.id : '';
  const quoted = S.quote;
  const send = { channelId: c.id, message: (quoted && text ? quoteMarker(quoted) : '') + text, rootId: '', ...(quoted && text ? { quotedPostId: quoted.id } : {}), ...(accept ? { acceptContactId: accept } : {}), ...(S.priority ? { priority: S.priority } : {}), ...(fileIds.length ? { fileIds } : {}) };
  // Tin chỉ có chữ: hiện ngay (chat/cache.js), máy chủ trả lời thì thay bằng tin thật
  if (!fileIds.length) return sendNow(c, text, send, quoted);
  S.sending = true;
  updateSend();
  const r = await call('chatSend', send);
  if (r.accepted) acceptedLocally(c.id);
  S.sending = false;
  if (r.status !== 'ok') {
    updateSend();
    return toast(r.message || 'Gửi tin lỗi', 'err');
  }
  $('text').value = '';
  setDraft(c.id, '');
  if (quoted) cancelQuote();
  S.reply = null;
  renderReply();
  resetComposer();
  autosize();
  // Tin có tệp: đọc lại tin sau giây lát để có ảnh / link tệp do máy chủ điền
  if (fileIds.length && r.post) {
    setTimeout(async () => {
      const again = await call('chatPosts', { channelId: c.id, since: (r.post.createAt || Date.now()) - 1 });
      if (again.status === 'ok' && S.sel?.id === c.id) {
        addPosts(again.posts);
        renderMsgs();
      }
    }, 1500);
  }
  if (S.sel?.id === c.id) {
    addPosts([r.post]);
    renderMsgs({ scroll: 'bottom' });
  }
  const it = findChat(c.id);
  if (it) bumpChat(c.id, { lastPostAt: r.post?.createAt || Date.now() });
  renderList();
}

// Tin chỉ có chữ: hiện ngay ở cuối cuộc trò chuyện (mờ, "Đang gửi…"), ô gõ trống ngay để gõ tiếp. Gửi lỗi thì bỏ tin tạm
// và đưa chữ lại vào ô gõ (nếu ô đang trống)
function sendNow(c, text, send, quoted) {
  const temp = pendingPost(c, text, { quoted: quoted ? quoted : null, priority: send.priority || '' });
  const map = S.posts;
  map.set(temp.id, temp);
  $('text').value = '';
  setDraft(c.id, '');
  if (quoted) cancelQuote();
  S.reply = null;
  renderReply();
  resetComposer();
  autosize();
  renderMsgs({ scroll: 'bottom' });
  return queueSend(async () => {
    const r = await call('chatSend', send);
    map.delete(temp.id);
    if (r.accepted) acceptedLocally(c.id);
    const here = S.sel?.id === c.id && S.posts === map;
    if (r.status !== 'ok') {
      if (here) {
        renderMsgs({ scroll: 'keep' });
        if (!$('text').value.trim()) {
          $('text').value = text;
          autosize();
          updateSend();
        }
      }
      return toast((r.message || 'Gửi tin lỗi') + (here ? ' — chữ đã đưa lại vào ô gõ' : ''), 'err');
    }
    if (r.post) here ? addPosts([r.post]) : map.set(r.post.id, r.post);
    if (here) renderMsgs({ scroll: 'keep' });
    bumpChat(c.id, { lastPostAt: r.post?.createAt || Date.now() });
    renderList();
  });
}

// Cập nhật một mục trong danh sách (số chưa đọc, giờ tin cuối)
function bumpChat(id, patch) {
  const upd = (c) => (c.id === id ? Object.assign(c, patch) : c);
  S.dms.forEach(upd);
  S.requests.forEach(upd);
  for (const t of S.teams) t.channels.forEach(upd);
}

// Đánh dấu đã đọc (như web khi mở kênh); tối đa mỗi 3 giây
async function markRead(force = false) {
  const c = S.sel;
  if (!c || document.hidden || (!force && Date.now() - S.lastView < 3000)) return;
  S.lastView = Date.now();
  bumpChat(c.id, { unread: 0, mentions: 0 });
  renderList();
  await call('chatView', { channelId: c.id });
}

// ---------- Gợi ý @tên khi gõ (ô gõ và ô bình luận) ----------

// mode: 'mention' (@tên) hoặc 'slash' (câu trả lời mẫu, chat/replies.js)
const M = { t: null, items: [], i: 0, q: null, timer: 0, seq: 0, cache: new Map(), mode: '' };

function mentionInput(t) {
  const c = S.sel;
  const one = c && t.selectionStart === t.selectionEnd;
  const sq = one ? BG.chatSlashQuery(t.value, t.selectionStart) : null;
  if (sq) return slashSuggest(t, sq);
  const q = one ? BG.chatMentionQuery(t.value, t.selectionStart) : null;
  if (!q) return closeMention();
  M.t = t;
  M.q = q;
  M.mode = 'mention';
  clearTimeout(M.timer);
  M.timer = setTimeout(() => fetchMentions(c, q), 120);
}

async function fetchMentions(c, q) {
  const key = c.id + ':' + q.term.toLowerCase();
  const seq = ++M.seq;
  let users = M.cache.get(key);
  if (!users) {
    const r = await call('chatMentions', { channelId: c.id, teamId: c.teamId || '', term: q.term });
    if (seq !== M.seq) return;
    users = r.status === 'ok' ? r.users : [];
    if (r.status === 'ok') M.cache.set(key, users);
  }
  if (seq !== M.seq || !M.q) return;
  // @all / @channel / @here chỉ ở kênh (không ở tin nhắn riêng)
  const special = c.kind === 'dm' ? [] : [['all', 'Báo cho mọi người trong kênh'], ['channel', 'Báo cho mọi người trong kênh'], ['here', 'Báo cho người đang trực tuyến']].filter(([k]) => q.term && k.startsWith(q.term.toLowerCase())).map(([k, desc]) => ({ special: k, desc }));
  M.items = [...users.filter((u) => u.chatId !== S.me?.chatId && u.username), ...special].slice(0, 9);
  M.i = 0;
  renderMention();
}

// Một dòng gợi ý: người (@tên), @all…, câu trả lời mẫu, hoặc mục "Sửa câu trả lời mẫu…"
function mentionRow(u) {
  if (u.reply) return [el('span', { class: 'avatar xs mi-at' }, '/'), el('span', { class: 'mi-name' }, u.reply.name), el('span', { class: 'mi-sub' }, u.reply.text.replace(/\s+/g, ' ').slice(0, 90))];
  if (u.manage) return [el('span', { class: 'avatar xs mi-at mi-edit' }, '✎'), el('span', { class: 'mi-name' }, 'Sửa câu trả lời mẫu…'), el('span', { class: 'mi-sub' }, 'Thêm, sửa, xoá các câu soạn sẵn')];
  if (u.special) return [el('span', { class: 'avatar xs mi-at' }, '@'), el('span', { class: 'mi-name' }, '@' + u.special), el('span', { class: 'mi-sub' }, u.desc)];
  return [avatar({ name: u.fullname || u.username, chatId: u.chatId, pictureAt: u.pictureAt, size: 'xs' }), el('span', { class: 'mi-name' }, u.fullname || u.username, ...badges(u)), el('span', { class: 'mi-sub' }, '@' + u.username)];
}

function renderMention() {
  const pop = $('mention-pop');
  if (!M.items.length || !M.t) return closeMention();
  pop.setAttribute('aria-label', M.mode === 'slash' ? 'Câu trả lời mẫu' : 'Gợi ý tên');
  pop.classList.toggle('slash', M.mode === 'slash');
  pop.replaceChildren(...M.items.map((u, k) => el('div', { role: 'option', class: 'mi' + (k === M.i ? ' on' : ''), 'aria-selected': String(k === M.i), onmousedown: (e) => (e.preventDefault(), pickMention(k)) }, ...mentionRow(u))));
  const r = M.t.getBoundingClientRect();
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - 328)))}px`;
  pop.style.bottom = `${Math.round(innerHeight - r.top + 8)}px`;
  pop.hidden = false;
}

function closeMention() {
  $('mention-pop').hidden = true;
  M.items = [];
  M.q = null;
  M.mode = '';
  M.seq++;
}

function pickMention(k) {
  const u = M.items[k];
  const t = M.t;
  if (M.mode === 'slash') return pickReply(u, t);
  const q = t && (BG.chatMentionQuery(t.value, t.selectionStart) || M.q);
  if (!u || !t || !q) return closeMention();
  const name = u.special || u.username;
  const end = t.selectionStart;
  closeMention();
  applyEdit({ from: q.start, to: end, text: `@${name} `, selStart: q.start + name.length + 2, selEnd: q.start + name.length + 2 }, t);
}

// Phím trong danh sách gợi ý: lên / xuống, Enter / Tab chọn, Esc đóng
function mentionKey(e) {
  if ($('mention-pop').hidden || !M.items.length) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    M.i = (M.i + (e.key === 'ArrowDown' ? 1 : -1) + M.items.length) % M.items.length;
    renderMention();
  } else if (e.key === 'Enter' || e.key === 'Tab') pickMention(M.i);
  else if (e.key === 'Escape') closeMention();
  else return false;
  e.preventDefault();
  return true;
}

// ---------- Sửa tin của mình; bản nháp theo cuộc trò chuyện / thread (lưu trong máy, 7 ngày) ----------

const DRAFT_KEY = 'beingroup-chat-drafts';
let drafts = {};
try {
  drafts = BG.pruneDrafts(JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'));
} catch {}
let draftTimer = 0;
function setDraft(key, text) {
  if (!key) return;
  if (String(text || '').trim()) drafts[key] = { t: String(text).slice(0, 4000), at: Date.now() };
  else delete drafts[key];
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(BG.pruneDrafts(drafts)));
    } catch {}
  }, 300);
}
const draftOf = (key) => drafts[key]?.t || '';
const threadKey = () => (S.thread && S.sel ? `${S.sel.id}:${S.thread.root.id}` : '');

function startEdit(p, inThread = false) {
  if (inThread) {
    S.tEditing = p;
    $('t-text').value = p.message;
    $('t-edit').hidden = false;
    $('t-edit-text').textContent = 'Sửa bình luận: ' + BG.chatPlain(p.message).slice(0, 100);
    tAutosize();
    return $('t-text').focus();
  }
  if (S.preview) setPreview(false);
  S.editing = p;
  $('text').value = p.message;
  renderReply();
  autosize();
  $('text').focus();
}

function cancelEdit(inThread = false) {
  if (inThread) {
    if (!S.tEditing) return;
    S.tEditing = null;
    $('t-edit').hidden = true;
    $('t-text').value = draftOf(threadKey());
    return tAutosize();
  }
  if (!S.editing) return;
  S.editing = null;
  $('text').value = S.sel ? draftOf(S.sel.id) : '';
  renderReply();
  autosize();
}

async function saveEdit(inThread = false) {
  const p = inThread ? S.tEditing : S.editing;
  const t = $(inThread ? 't-text' : 'text');
  const text = t.value.trim();
  if (!p) return;
  if (!text) return toast('Tin nhắn trống', 'err');
  if (text === String(p.message || '').trim()) return cancelEdit(inThread);
  const r = await call('chatEdit', { postId: p.id, message: (p.quotePrefix || '') + text });
  if (r.status !== 'ok') return toast(r.message || 'Không sửa được', 'err');
  const upd = (m) => (m ? { ...m, message: r.post?.message ?? text, editAt: r.post?.editAt || Date.now() } : m);
  if (S.posts.has(p.id)) S.posts.set(p.id, upd(S.posts.get(p.id)));
  if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, upd(S.thread.posts.get(p.id)));
  if (S.thread?.root.id === p.id) S.thread.root = S.posts.get(p.id) || upd(S.thread.root);
  cancelEdit(inThread);
  renderMsgs({ scroll: 'keep' });
  renderThread();
  toast('Đã sửa tin nhắn.');
}
