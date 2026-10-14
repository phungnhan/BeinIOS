// BeinFusion — Telegram: gửi thông báo, nút xử lý trong tin.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  // ---------- Gửi thông báo về Telegram ----------
  // Bot của chính người dùng (token từ @BotFather). Cấu hình lưu ở khoá `telegram`, không có trong sao lưu / đồng bộ.
  // Nguồn thao tác trong nhật ký: tự động, nút trong tin Telegram, còn lại là bấm tay trong addon
  const sourceLabel = (source) => (source === 'auto' ? 'Tự động' : source === 'telegram' ? 'Telegram' : 'Bấm tay');

  const TELEGRAM_KINDS = {
    spam: 'Đợt spam, tự ẩn spam',
    reports: 'Báo cáo mới, bài Beincom gắn cờ',
    violations: 'Bài / bình luận mới vi phạm',
    queue: 'Yêu cầu tham gia, bài chờ duyệt, việc chờ lâu, tự xử lý',
    watch: 'Từ khoá theo dõi, bài chưa ai trả lời',
    weekly: 'Tóm tắt tuần / báo cáo tháng, việc đầu tuần',
    health: 'Tự kiểm tra: tính năng ngừng chạy',
    security: 'Tài khoản giống admin, đợt vào ồ ạt',
    chat: 'Tin nhắn riêng, nhắc tên trong chat',
    login: 'Cần đăng nhập Beincom lại',
  };
  const DEFAULT_TELEGRAM = { enabled: false, token: '', chatId: '', kinds: { spam: true, reports: true, violations: true, queue: false, watch: true, weekly: true, health: true, security: true, chat: true, login: true }, quietNight: false, actions: false };

  // Loại tin theo mã thông báo của addon
  function telegramKind(id) {
    if (id === 'bg-wave' || id === 'bg-autohide') return 'spam';
    if (id === 'bg-reports' || id === 'bg-autoflag') return 'reports';
    if (id === 'bg-flagged' || id === 'bg-comments' || id === 'bg-chat') return 'violations';
    if (id === 'bg-requests' || id === 'bg-auto' || id === 'bg-pending' || String(id).startsWith('bg-posts-')) return 'queue';
    if (id === 'bg-watch' || id === 'bg-unanswered') return 'watch';
    if (id === 'bg-weekly' || id === 'bg-monthly' || id === 'bg-welcome' || id === 'bg-nudge' || id === 'bg-prompt' || id === 'bg-digest') return 'weekly';
    if (id === 'bg-selfcheck') return 'health';
    if (id === 'bg-impostor' || String(id).startsWith('bg-burst-')) return 'security';
    if (id === 'bg-chat-dm' || id === 'bg-chat-mention' || id === 'bg-chat-thread') return 'chat';
    if (id === 'bg-chat-reports') return 'reports';
    if (id === 'bg-login') return 'login';
    return '';
  }

  const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Nội dung tin (parse_mode HTML): tiêu đề đậm, mô tả, link mở trên Beincom
  function telegramText(title, message, url = '', max = 900) {
    const lines = [`<b>${escHtml(title)}</b>`];
    if (message) lines.push(escHtml(String(message).slice(0, max)));
    if (/^https:\/\//.test(url)) lines.push(`<a href="${escHtml(url)}">Mở trên Beincom</a>`);
    return lines.join('\n');
  }

  // 23:00 – 7:00 giờ Việt Nam
  function isQuietHour(now = Date.now()) {
    const h = new Date(now + 7 * 3600e3).getUTCHours();
    return h >= 23 || h < 7;
  }

  function validTelegramToken(t) {
    return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(String(t || '').trim());
  }

  // Có gửi tin này không (bật, đủ token / chat ID, đúng loại, ngoài giờ yên lặng — đợt spam và cần đăng nhập vẫn gửi)
  function telegramShouldSend(cfg, id, now = Date.now()) {
    if (!cfg?.enabled || !cfg.token || !cfg.chatId) return false;
    const kind = telegramKind(id);
    if (!kind || !cfg.kinds?.[kind]) return false;
    return !(cfg.quietNight && kind !== 'spam' && kind !== 'login' && isQuietHour(now));
  }

  // ---------- Nút xử lý trong tin Telegram ----------
  // Bật "Kèm nút xử lý": mỗi việc mới gửi thành một tin riêng có nút. Nút mang mã ngắn "token:act" (callback_data ≤ 64 byte);
  // việc tương ứng lưu ở khoá `tgActions`. Addon đọc nút bấm (getUpdates) mỗi 30 giây, chỉ nhận nút bấm trong đúng chat đã cài.
  const TG_ACTIONS = {
    request: [{ act: 'a', text: '✅ Duyệt' }, { act: 'd', text: '❌ Từ chối' }],
    approval: [{ act: 'a', text: '✅ Duyệt bài' }],
    post: [{ act: 'h', text: '🙈 Ẩn bài' }, { act: 's', text: 'Bỏ qua' }, { act: 'c', text: '🧹 Dọn tài khoản' }],
    comment: [{ act: 'h', text: '🙈 Ẩn bình luận' }, { act: 's', text: 'Bỏ qua' }, { act: 'c', text: '🧹 Dọn tài khoản' }],
    wave: [{ act: 'h', text: '🙈 Ẩn cả đợt' }, { act: 's', text: 'Bỏ qua đợt' }],
  };
  const TG_DONE = {
    request: { a: 'Đã duyệt', d: 'Đã từ chối' },
    approval: { a: 'Đã duyệt bài' },
    post: { h: 'Đã ẩn bài', s: 'Đã bỏ qua', c: 'Đã ẩn mọi bài / bình luận gần đây của người này' },
    comment: { h: 'Đã ẩn bình luận', s: 'Đã bỏ qua', c: 'Đã ẩn mọi bài / bình luận gần đây của người này' },
    wave: { h: 'Đã ẩn cả đợt', s: 'Đã bỏ qua đợt' },
  };
  // Mã thông báo gộp tương ứng (để theo loại tin đã chọn và giờ yên lặng)
  const TG_ITEM_NOTIFY = { request: 'bg-requests', approval: 'bg-posts-', post: 'bg-flagged', comment: 'bg-comments', wave: 'bg-wave' };
  const TG_ITEMS_MAX = 10; // tin có nút mỗi lần quét
  const TG_ACTIONS_KEEP = 300;
  const TG_ACTIONS_DAYS = 7;

  const telegramActionsOn = (cfg) => !!(cfg?.actions && cfg.enabled && cfg.token && cfg.chatId);
  // Thông báo gộp này đã có tin riêng từng việc (bật nút xử lý) thì không gửi bản gộp về Telegram nữa
  const telegramItemNotify = (id) => Object.values(TG_ITEM_NOTIFY).some((x) => (x.endsWith('-') ? String(id).startsWith(x) : id === x));

  function tgToken(rand = Math.random) {
    let s = '';
    for (let i = 0; i < 10; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand() * 36) % 36];
    return s;
  }

  function parseTgCallback(data) {
    const m = /^([a-z0-9]{10}):([a-z])$/.exec(String(data || ''));
    return m ? { token: m[1], act: m[2] } : null;
  }

  const tgActAllowed = (kind, act, acts = null) => (acts || (TG_ACTIONS[kind] || []).map((b) => b.act)).includes(act);

  // Bàn phím dưới tin: các nút xử lý (acts: chỉ một số nút, vd không có quyền duyệt thì []), thêm nút mở trang Beincom
  function tgKeyboard(kind, token, url = '', acts = null) {
    const row = (TG_ACTIONS[kind] || []).filter((b) => !acts || acts.includes(b.act)).map((b) => ({ text: b.text, callback_data: `${token}:${b.act}` }));
    const rows = [];
    if (row.length) rows.push(row);
    if (/^https:\/\//.test(url)) rows.push([{ text: 'Mở trên Beincom', url }]);
    return { inline_keyboard: rows };
  }

  // Nội dung tin một việc (HTML): tiêu đề đậm, người, nội dung, ghi chú nghiêng
  function telegramItemText({ head, who = '', text = '', note = '' }) {
    const lines = [`<b>${escHtml(head)}</b>`];
    if (who) lines.push(escHtml(who));
    if (text) lines.push(escHtml(String(text).replace(/\s+\n/g, '\n').slice(0, 600)) + (String(text).length > 600 ? '…' : ''));
    if (note) lines.push(`<i>${escHtml(String(note).slice(0, 300))}</i>`);
    return lines.join('\n');
  }

  // Kết quả sau khi bấm nút: done = xong (thay nút bằng dòng kết quả), không thì giữ nút để bấm lại
  function tgResult(kind, act, r) {
    if (r?.status === 'need_login') return { done: false, line: '⚠️ Phiên đăng nhập Beincom đã hết hạn — đăng nhập lại rồi bấm lại' };
    if (r?.dryRun) return { done: false, line: '🧪 Đang Chạy thử: đã ghi nhật ký, chưa gửi lên Beincom' };
    if (r?.status === 'ok' && !r.failed) return { done: true, line: '✅ ' + (TG_DONE[kind]?.[act] || 'Đã xử lý') };
    const msg = r?.errors?.[0] || r?.message || 'Có lỗi';
    // Việc không còn (đã xử lý trên web / Dashboard, bài đã xoá): coi như xong
    if (/không còn|không tìm thấy|not found|đã ẩn/i.test(msg)) return { done: true, line: '☑️ Đã xử lý trước đó hoặc không còn trên Beincom' };
    return { done: false, line: '⚠️ ' + msg };
  }

  // Giữ việc trong 7 ngày, tối đa 300 việc mới nhất
  function pruneTgActions(map, now = Date.now()) {
    return Object.fromEntries(
      Object.entries(map || {})
        .filter(([, a]) => a && now - (a.at || 0) < TG_ACTIONS_DAYS * 864e5)
        .sort(([, a], [, b]) => (b.at || 0) - (a.at || 0))
        .slice(0, TG_ACTIONS_KEEP),
    );
  }

  // Lý do ẩn qua Telegram: link cấm / link ngoài, đợt spam -> Spam; còn lại -> Lý do khác
  const tgHideReason = (reasons = []) => (reasons.some((x) => x.code === 'blocked' || x.code === 'external' || x.code === 'contact') ? 'SPAM' : 'OTHERS');

  Object.assign(BG, {
    sourceLabel,
    TELEGRAM_KINDS,
    DEFAULT_TELEGRAM,
    TG_ACTIONS,
    TG_DONE,
    TG_ITEM_NOTIFY,
    TG_ITEMS_MAX,
    telegramActionsOn,
    telegramItemNotify,
    tgToken,
    parseTgCallback,
    tgActAllowed,
    tgKeyboard,
    telegramItemText,
    tgResult,
    pruneTgActions,
    tgHideReason,
    telegramKind,
    telegramText,
    isQuietHour,
    validTelegramToken,
    telegramShouldSend,
  });
});
