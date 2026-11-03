// Dashboard — biểu tượng nét một màu (kiểu Lucide, viewBox 24, nét 2) thay cho emoji ở nút, tiêu đề, nhãn: emoji mỗi máy vẽ
// một kiểu, nhiều màu, to nhỏ không đều. Chữ gốc vẫn giữ (ẩn, aria-hidden) nên textContent không đổi — mã và test đọc chữ
// như cũ, chép ra vẫn có emoji. Chỉ đổi emoji ĐẦU chữ của các phần tử addon tự vẽ (IC_SEL), không đụng nội dung người dùng
// (bài, bình luận, tên người) và ô nhập. Tự áp cho phần tử vẽ sau (MutationObserver).
// Danh sách dài tự tải thêm khi cuộn tới dòng cuối (nút Tải thêm / Xem thêm vẫn còn để bấm tay).
const IC_PATHS = {
  sparkles: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z', 'M20 3v4', 'M22 5h-4'],
  clipboard: ['M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'],
  message: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
  pin: ['M12 17v5', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 7a2 2 0 1 0 0 4 2 2 0 1 0 0-4', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'],
  video: ['m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5', 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
  clip: ['m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  phone: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16', 'm21 21-4.3-4.3'],
  timer: ['M10 2h4', 'm12 14 3-3', 'M12 6a8 8 0 1 0 0 16 8 8 0 1 0 0-16'],
  hourglass: ['M5 22h14', 'M5 2h14', 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22', 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2'],
  bot: ['M12 8V4H8', 'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z', 'M2 14h2', 'M20 14h2', 'M15 13v2', 'M9 13v2'],
  bell: ['M10.268 21a2 2 0 0 0 3.464 0', 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  save: ['M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7', 'M7 3v4a1 1 0 0 0 1 1h7'],
  help: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  eraser: ['m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21', 'M22 21H7', 'm5 11 9 9'],
  repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  eye: ['M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0', 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  ban: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'm4.9 4.9 14.2 14.2'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6'],
  book: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
  drive: ['M22 12H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', 'M6 16h.01', 'M10 16h.01'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  rocket: ['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z', 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z', 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0', 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  news: ['M15 18h-5', 'M18 14h-8', 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2', 'M10 6h8v4h-8z'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
  notepen: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z'],
  chart: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  send: ['M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z', 'm21.854 2.147-10.94 10.939'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
};
const IC_EMOJI = {
  '✨': 'sparkles', '📋': 'clipboard', '💬': 'message', '🔗': 'link', '🛡': 'shield', '📌': 'pin', '🖼': 'image', '🎬': 'video',
  '📎': 'clip', '✎': 'pencil', '✍': 'pencil', '✏': 'pencil', '✉': 'mail', '⭐': 'star', '📱': 'phone', '🔍': 'search', '⏱': 'timer',
  '⏳': 'hourglass', '🤖': 'bot', '🔔': 'bell', '☁': 'cloud', '💾': 'save', '❓': 'help', '🧹': 'eraser', '🔁': 'repeat', '👁': 'eye',
  '❤': 'heart', '🚫': 'ban', '📬': 'inbox', '🔒': 'lock', '⚙': 'settings', '📚': 'book', '💽': 'drive', '⚠': 'alert', '🚀': 'rocket',
  '👥': 'users', '📰': 'news', '🚩': 'flag', '📄': 'file', '📝': 'notepen', '📊': 'chart', '✈': 'send', '🛠': 'wrench',
};
// Phần tử addon tự vẽ có thể bắt đầu bằng emoji; vùng nội dung người dùng (xem trước bài / Article, cửa sổ bài) thì bỏ qua
const IC_SEL = 'button, a.chat-link, a.tag, h2, h3, h4, summary, .group-title, .tag, label.check, .media-icon, .pcd-flag, .ins-m > span, #chat-unread > span, #img-cache-info, #storage-usage, #prompt-draft-title, #nudge-draft-title, .check-sec > td, .sched-setting > div, .locked-groups > div, .edit-banner > span';
// .ic: chính biểu tượng và chữ ẩn bên trong — không xét lại (chữ ẩn bắt đầu bằng emoji, xét lại thì lồng mãi không dừng)
const IC_SKIP = '.ic, .md-preview, .art-preview, .pv-post';
const IC_RE = new RegExp('^(\\s*)(' + Object.keys(IC_EMOJI).join('|') + ')\\uFE0F?');
const SVGNS = 'http://www.w3.org/2000/svg';

function icSvg(name) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  for (const d of IC_PATHS[name]) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}

function iconizeEl(e) {
  if (e.closest(IC_SKIP)) return;
  // Chữ đầu tiên của phần tử (bỏ qua ô tick đứng trước, như <label class="check"><input> 💬 Gửi kèm…</label>)
  let t = e.firstChild;
  while (t && ((t.nodeType === 3 && !t.data.trim()) || t.nodeName === 'INPUT')) t = t.nextSibling;
  if (!t || t.nodeType !== 3) return;
  const m = IC_RE.exec(t.data);
  if (!m) return;
  const keep = el('span', { class: 'ic-t', text: m[0].slice(m[1].length) });
  const ic = el('span', { class: 'ic', 'aria-hidden': 'true' }, icSvg(IC_EMOJI[m[2]]), keep);
  t.data = t.data.slice(m[0].length);
  t.before(ic);
}
function iconizeIn(node) {
  if (node.nodeType !== 1) return;
  if (node.matches(IC_SEL)) iconizeEl(node);
  for (const e of node.querySelectorAll(IC_SEL)) iconizeEl(e);
}
new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.target.nodeType === 1 && m.target.matches(IC_SEL)) iconizeEl(m.target);
    for (const n of m.addedNodes) iconizeIn(n);
  }
}).observe(document.body, { childList: true, subtree: true });
iconizeIn(document.body);

// ---------- Danh sách dài: cuộn tới dòng cuối thì tự bấm Tải thêm / Xem thêm ----------
// Chỉ khi người dùng vừa cuộn (không tự tải lúc mới mở trang); danh sách cuộn trong khung (bảng cao hơn màn hình) cũng tính,
// vì dòng cuối bị khung che thì không "thấy". Mỗi lần tải thêm có dòng cuối mới, phải cuộn tới đó mới tải tiếp.
const MORE_LISTS = {
  'todo-list': 'btn-todo-more', 'members-body': 'btn-members-more', 'banned-body': 'btn-banned-more', 'activity-body': 'btn-activity-more',
  'recent-body': 'btn-recent-more', 'comments-body': 'btn-comments-more', 'chat-body': 'btn-chat-more', 'sweep-body': 'btn-sweep-more', 'log-body': 'btn-more',
};
let scrolledAt = 0;
addEventListener('scroll', () => (scrolledAt = Date.now()), { capture: true, passive: true });
const moreIO = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting || Date.now() - scrolledAt > 1500) continue;
    const b = $(MORE_LISTS[en.target.parentElement?.id]);
    if (b && !b.hidden && !b.disabled && b.offsetParent) b.click();
  }
});
for (const [list, btn] of Object.entries(MORE_LISTS)) {
  const box = $(list);
  if (!box || !$(btn)) continue;
  let last = null;
  const watchLast = () => {
    if (last) moreIO.unobserve(last);
    last = box.lastElementChild;
    if (last) moreIO.observe(last);
  };
  new MutationObserver(watchLast).observe(box, { childList: true });
  watchLast();
}
