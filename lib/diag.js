// BeinGroup — lỗi kỹ thuật, tự kiểm tra, báo cáo sử dụng.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { vnDay } = BG;

  // ---------- Lỗi kỹ thuật ----------
  // Lỗi JavaScript (service worker, Dashboard, popup) và lỗi Beincom trả về khi gọi API, để người dùng sao chép gửi hỗ trợ.
  // Không ghi nội dung bài, body gửi đi, mật khẩu hay token; lỗi giống nhau trong 30 phút gộp thành một dòng (×N).
  const DIAG_MAX = 200;
  const DIAG_MERGE_MS = 30 * 60e3;
  const DIAG_WHERE = { sw: 'Nền (service worker)', dashboard: 'Dashboard', popup: 'Cửa sổ nhỏ' };
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const scrubSecret = (s) =>
    String(s ?? '')
      .replace(/bot\d{5,}:[\w-]{20,}/g, 'bot***')
      .replace(/\b(token|key|secret|password|pass)=[^&\s]*/gi, '$1=***');
  const shortStack = (s) =>
    scrubSecret(s)
      .replace(/chrome-extension:\/\/[a-p]{32}\//g, '')
      .replace(/file:\/\/\/[^\s)]*?\/BeinGroup\//g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join('\n')
      .slice(0, 800);

  // Làm sạch một lỗi (cả lỗi Dashboard gửi sang)
  function cleanDiag(e = {}) {
    const out = {
      where: DIAG_WHERE[e.where] ? e.where : 'sw',
      kind: e.kind === 'api' ? 'api' : 'js',
      message: scrubSecret(e.message).slice(0, 500) || '(không có mô tả)',
    };
    if (out.kind === 'api') {
      out.method = String(e.method || '').toUpperCase().slice(0, 8);
      out.path = scrubSecret(e.path).slice(0, 300);
      out.status = Number(e.status) || 0;
      out.code = String(e.code || '').slice(0, 80);
    } else if (e.stack) out.stack = shortStack(e.stack);
    return out;
  }

  // Khoá gộp: cùng nơi, loại, API (bỏ id), mã, nội dung
  function diagKey(e) {
    // Bỏ phần định danh (đoạn có chữ số, UUID) để cùng một API với bài khác nhau vẫn gộp
    const path = String(e.path || '')
      .split('?')[0]
      .replace(UUID_RE, ':id')
      .split('/')
      .map((seg) => (/\d/.test(seg) ? ':id' : seg))
      .join('/');
    return [e.where, e.kind, e.method || '', path, e.status ?? '', e.code || '', String(e.message).slice(0, 160)].join('|');
  }

  function pushDiag(list, entry, now = Date.now()) {
    const e = cleanDiag(entry);
    const key = diagKey(e);
    const cur = list || [];
    const i = cur.findIndex((x) => x.key === key && now - x.time < DIAG_MERGE_MS);
    if (i >= 0) return [{ ...cur[i], time: now, count: (cur[i].count || 1) + 1 }, ...cur.filter((_, k) => k !== i)].slice(0, DIAG_MAX);
    return [{ ...e, key, time: now, first: now, count: 1 }, ...cur].slice(0, DIAG_MAX);
  }

  const vnTime = (t) => {
    const d = new Date(t + 7 * 3600e3);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
  };

  function diagLine(e) {
    const what = e.kind === 'api' ? `${e.method} ${e.path} → ${e.status || 'không kết nối'}${e.code ? ' ' + e.code : ''}: ${e.message}` : e.message;
    return `${vnTime(e.time)} [${e.where} · ${e.kind === 'api' ? 'API' : 'JS'}] ${what}${e.count > 1 ? ` (×${e.count}, lần đầu ${vnTime(e.first)})` : ''}${e.stack ? '\n    ' + e.stack.replace(/\n/g, '\n    ') : ''}`;
  }

  // Báo cáo để dán cho người hỗ trợ
  function diagText(list, { version = '', ua = '', now = Date.now() } = {}) {
    const browser = (String(ua).match(/(Edg|Chrome)\/[\d.]+/) || [''])[0];
    return [`BeinGroup v${version} · ${browser || 'trình duyệt không rõ'} · ${vnTime(now)} (giờ VN) · ${list.length} lỗi`, ...list.map(diagLine)].join('\n');
  }

  // ---------- Báo cáo sử dụng (ẩn danh, admin tự gửi cho tác giả) ----------
  // Đếm trong máy: mỗi ngày dùng tính năng nào bao nhiêu lần (khoá `usage`). Không ghi tên group, tên người, nội dung.
  // Báo cáo chỉ gồm số đếm, cài đặt đang bật, lỗi kỹ thuật (đã bỏ id), kết quả tự kiểm tra. Addon không tự gửi đi đâu.
  const USAGE_DAYS = 60;
  const USAGE_LABELS = {
    scan: 'Quét tay',
    refresh: 'Tải lại tab',
    act: 'Duyệt / từ chối thành viên',
    approvalAct: 'Duyệt / từ chối bài',
    postAct: 'Ẩn / xoá bài',
    commentAct: 'Ẩn bình luận',
    spamAct: 'Xử lý đợt spam',
    banEverywhere: 'Cấm ở mọi community',
    cleanupUser: 'Dọn tài khoản',
    userPosts: 'Tìm mọi bài của một người',
    sweepSearch: 'Tìm & dọn bài: tìm',
    hidePosts: 'Tìm & dọn bài: ẩn',
    commentWrite: 'Viết bình luận / trả lời',
    memberAct: 'Quản lý thành viên',
    compose: 'Đăng / hẹn giờ bài',
    composeArticle: 'Đăng Article',
    composeSeries: 'Tạo Series',
    scheduleAct: 'Đổi giờ / huỷ bài hẹn giờ',
    editPost: 'Sửa bài',
    editScheduled: 'Sửa bài hẹn giờ',
    postSetting: 'Cài đặt bài',
    pinAct: 'Ghim bài',
    groupSettingAct: 'Cài đặt group',
    tagAct: 'Quản lý tag',
    reportAct: 'Xử lý báo cáo',
    profileAct: 'Hồ sơ vi phạm',
    restoreBackup: 'Khôi phục sao lưu',
    syncNow: 'Đồng bộ cài đặt',
    members: 'Xem thành viên',
    activity: 'Xem nhật ký vào / rời',
    stats: 'Xem thống kê',
    reports: 'Xem báo cáo',
    newMembers: 'Tìm người mới',
    retention: 'Thành viên mới có ở lại không',
    monthly: 'Báo cáo tháng',
    selfCheck: 'Tự kiểm tra',
    nudgeEffect: 'Đo hiệu quả nhắc',
    postStatsRefresh: 'Cập nhật hiệu quả bài',
    telegramReport: 'Gửi báo cáo về Telegram',
    tags: 'Xem tag',
    banned: 'Xem danh sách bị cấm',
    groupSettings: 'Xem cài đặt group',
  };

  // Ghi một lần dùng (type = loại lệnh); giữ USAGE_DAYS ngày gần nhất
  function recordUsage(usage, type, now = Date.now()) {
    if (!USAGE_LABELS[type]) return usage || null;
    const day = vnDay(now);
    const u = { since: usage?.since || day, days: { ...(usage?.days || {}) } };
    u.days[day] = { ...u.days[day], [type]: ((u.days[day] || {})[type] || 0) + 1 };
    const keep = Object.keys(u.days).sort().slice(-USAGE_DAYS);
    u.days = Object.fromEntries(keep.map((d) => [d, u.days[d]]));
    return u;
  }

  // Số liệu sử dụng 30 ngày (ẩn danh): dùng cho cả bản xem trước và bản tự gửi — admin thấy đúng thứ được gửi
  function usageData({ usage = null, settings = {}, telegram = null, groups = [], log = [], diagLog = [], selfCheck = null, version = '', ua = '', note = '', now = Date.now() } = {}) {
    const from = now - 30 * 864e5;
    const days = Object.entries(usage?.days || {}).filter(([d]) => Date.parse(d + 'T00:00:00+07:00') >= from);
    const totals = {};
    for (const [, x] of days) for (const [k, n] of Object.entries(x)) if (USAGE_LABELS[k]) totals[k] = (totals[k] || 0) + n;
    const flags = [
      ['dryRun', 'Chạy thử'],
      ['autoApprove', 'Tự duyệt thành viên'],
      ['autoDecline', 'Tự từ chối'],
      ['autoHideSpam', 'Tự ẩn spam'],
      ['autoApprovePosts', 'Tự duyệt bài tin cậy'],
      ['scanComments', 'Quét bình luận'],
      ['weeklyReport', 'Tóm tắt tuần'],
      ['monthlyReport', 'Báo cáo tháng'],
      ['welcomeReminder', 'Nhắc chào'],
      ['nudgeWeekly', 'Bài nhắc người mới'],
      ['promptWeekly', 'Bài thảo luận'],
      ['selfCheckDaily', 'Tự kiểm tra mỗi ngày'],
      ['remindPending', 'Nhắc việc chờ lâu'],
      ['syncSettings', 'Đồng bộ'],
    ]
      .filter(([k]) => settings[k])
      .map(([, l]) => l);
    if (telegram?.enabled) flags.push('Telegram' + (telegram.actions ? ' (có nút)' : ''));
    const inRange = (t) => {
      const v = typeof t === 'number' ? t : Date.parse(t);
      return Number.isFinite(v) && v >= from && v <= now;
    };
    const recent = (log || []).filter((e) => inRange(e.time));
    const auto = recent.filter((e) => e.source === 'auto').length;
    const tg = recent.filter((e) => e.source === 'telegram').length;
    const errs = (diagLog || []).filter((e) => inRange(e.time));
    const errLine = (e) => (e.kind === 'api' ? `${e.method} ${String(e.path || '').split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}|[\w-]*\d[\w-]*/gi, ':id')} → ${e.status || 'không kết nối'}${e.code ? ' ' + e.code : ''}` : String(e.message || '').slice(0, 120)) + ` (×${e.count || 1})`;
    const sc = selfCheck?.summary;
    return {
      version: String(version),
      browser: (String(ua).match(/(Edg|Chrome)\/[\d.]+/) || [''])[0],
      day: vnDay(now),
      since: usage?.since || '',
      activeDays: days.length,
      communities: (groups || []).filter((g) => g.isCommunity).length,
      groups: (groups || []).length,
      flags,
      features: Object.fromEntries(
        Object.entries(totals)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => [USAGE_LABELS[k], n]),
      ),
      actions: { total: recent.length, auto, telegram: tg, manual: recent.length - auto - tg, failed: recent.filter((e) => e.status === 'error').length },
      errors: { count: errs.length, top: errs.slice(0, 5).map(errLine) },
      selfCheck: sc ? { ok: sc.ok, skip: sc.skip, fail: sc.fail, failing: (selfCheck.items || []).filter((x) => x.status === 'fail').map((x) => x.label) } : null,
      note: String(note || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    };
  }

  // Bản chữ để xem trước / sao chép
  function usageReport(input = {}) {
    const d = usageData(input);
    const f = Object.entries(d.features);
    const a = d.actions;
    const sc = d.selfCheck;
    return [
      `BeinGroup v${d.version} · ${d.browser || 'trình duyệt không rõ'} · báo cáo sử dụng 30 ngày (tới ${d.day})${d.note ? ' · ' + d.note : ''}`,
      `• Dùng từ ${d.since || 'chưa rõ'} · ${d.activeDays} ngày có dùng trong 30 ngày · quản trị ${d.communities} community, ${d.groups} group`,
      `• Đang bật: ${d.flags.length ? d.flags.join(', ') : 'không có'}`,
      `• Tính năng dùng: ${f.length ? f.map(([k, n]) => `${k} ${n}`).join(' · ') : 'chưa có'}`,
      `• Nhật ký 30 ngày: ${a.total} thao tác (${a.auto} tự động, ${a.telegram} từ Telegram, ${a.manual} bấm tay) · ${a.failed} lỗi`,
      `• Lỗi kỹ thuật 30 ngày: ${d.errors.count ? d.errors.count + ' — ' + d.errors.top.join('; ') : 'không có'}`,
      `• Tự kiểm tra gần nhất: ${sc ? `${sc.ok} dùng được · ${sc.skip} bỏ qua · ${sc.fail} lỗi${sc.fail ? ' (' + sc.failing.join(', ') + ')' : ''}` : 'chưa chạy'}`,
    ].join('\n');
  }

  // ---------- Tự gửi báo cáo sử dụng cho tác giả (chỉ khi admin đồng ý) ----------
  // Nơi nhận: Google Apps Script của tác giả (tools/usage-collector.gs). Đặt khi đóng gói: node tools/pack.mjs --usage-url <link>
  // Rỗng = addon không hỏi, không gửi. Khoá `usageEndpoint` trong storage (nếu có) dùng thay — để thử khi phát triển.
  const USAGE_ENDPOINT = '';
  const USAGE_ORIGINS = ['https://script.google.com/*', 'https://script.googleusercontent.com/*'];
  const USAGE_SEND_DAYS = 7;
  const isUsageEndpoint = (url) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/.test(String(url || ''));

  // Báo cáo gửi đi = đúng số liệu của bản xem trước + mã cài đặt ngẫu nhiên
  const usagePayload = (installId, input) => ({ app: 'BeinGroup', v: 1, installId: String(installId), ...usageData(input) });

  // Tới lúc gửi chưa: lần trước thành công thì 7 ngày, lỗi thì thử lại sau 1 ngày
  function usageSendDue(sent, now = Date.now()) {
    if (!sent?.at) return true;
    return now - sent.at >= (sent.ok ? USAGE_SEND_DAYS : 1) * 864e5;
  }

  // ---------- Tự kiểm tra ----------
  // Bản chữ kết quả (bg/selfcheck.js) để gửi người hỗ trợ: mỗi mục một dòng; mục lỗi kèm mã HTTP và đường dẫn API (không kèm query)
  const CHECK_MARK = { ok: '✓', skip: '–', fail: '✗' };
  function selfCheckText(r, { version = '', ua = '' } = {}) {
    const browser = (String(ua).match(/(Edg|Chrome)\/[\d.]+/) || [''])[0];
    const s = r.summary || {};
    return [
      `BeinGroup v${version} · ${browser || 'trình duyệt không rõ'} · tự kiểm tra ${r.group?.name || ''} lúc ${vnTime(r.at)} (giờ VN)${r.mode === 'tab' ? ' · gọi qua tab Beincom' : ''}`,
      `${s.ok || 0} dùng được · ${s.skip || 0} bỏ qua · ${s.fail || 0} lỗi`,
      ...(r.items || []).map((x) => `${CHECK_MARK[x.status] || '?'} ${x.label}${x.detail ? ': ' + x.detail : ''}${x.status === 'fail' && x.path ? ` [${x.httpStatus || 0} ${x.path}]` : ''}`),
    ].join('\n');
  }

  // Mục lần trước dùng được mà lần này lỗi (prev: items lần trước, chỉ cần { id, status })
  // ---------- Bộ nhớ của addon ----------
  // chrome.storage.local mặc định tối đa 10 MB; từ v0.30.0 addon xin quyền unlimitedStorage (không giới hạn, không hỏi khi cài).
  // Đầy thì trình duyệt từ chối lưu: kết quả quét, nhật ký… mất mà không báo — Tự kiểm tra có mục Bộ nhớ để thấy trước.
  const STORAGE_QUOTA = 10 * 1024 * 1024;
  const STORAGE_BIG = 200 * 1024 * 1024; // quá mức này dù không giới hạn cũng nên dọn bớt (Dashboard chậm)
  const STORAGE_LABELS = {
    state: 'Kết quả quét',
    log: 'Nhật ký thao tác',
    profiles: 'Hồ sơ vi phạm',
    postStats: 'Hiệu quả bài',
    diagLog: 'Lỗi kỹ thuật',
    settings: 'Cài đặt',
    groupRules: 'Quy tắc riêng',
    templates: 'Mẫu bài',
    composeDraft: 'Bản nháp bài',
    articleDraft: 'Bản nháp Article',
    nudges: 'Các lần nhắc người mới',
    usage: 'Báo cáo sử dụng',
    selfCheck: 'Tự kiểm tra',
    promptBank: 'Kho câu hỏi thảo luận',
  };
  const mb = (n) => (n / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: n < 1048576 ? 2 : 1 }) + ' MB';

  // Dung lượng ước tính từng khoá (độ dài JSON UTF-8 + tên khoá), lớn nhất trước
  function storageSizes(all) {
    const enc = new TextEncoder();
    return Object.entries(all || {})
      .map(([key, v]) => ({ key, label: STORAGE_LABELS[key] || key, bytes: key.length + enc.encode(JSON.stringify(v) ?? '').length }))
      .sort((a, b) => b.bytes - a.bytes);
  }

  // Kết luận cho mục Bộ nhớ: không giới hạn thì chỉ báo khi quá lớn; giới hạn 10 MB thì báo khi dùng từ 80%
  function storageVerdict({ bytes = 0, unlimited = false, sizes = [] } = {}) {
    const top = sizes.slice(0, 3).map((x) => `${x.label} ${mb(x.bytes)}`).join(', ');
    const used = `${mb(bytes)}${unlimited ? ' (không giới hạn)' : ` / ${mb(STORAGE_QUOTA)}`}${top ? ' · nhiều nhất: ' + top : ''}`;
    if (unlimited ? bytes >= STORAGE_BIG : bytes >= 0.8 * STORAGE_QUOTA) return { status: 'fail', detail: `Bộ nhớ ${unlimited ? 'quá lớn' : 'sắp đầy'}: ${used} — xoá bớt Nhật ký / Hồ sơ vi phạm, hoặc sao lưu rồi cài lại addon` };
    return { status: 'ok', detail: used };
  }

  function selfCheckRegressions(prev, items) {
    const before = new Map((prev || []).map((x) => [x.id, x.status]));
    return (items || []).filter((x) => x.status === 'fail' && before.get(x.id) === 'ok');
  }

  Object.assign(BG, {
    STORAGE_QUOTA,
    storageSizes,
    storageVerdict,
    mbText: mb,
    USAGE_LABELS,
    recordUsage,
    usageData,
    usageReport,
    USAGE_ENDPOINT,
    USAGE_ORIGINS,
    isUsageEndpoint,
    usagePayload,
    usageSendDue,
    selfCheckText,
    selfCheckRegressions,
    DIAG_WHERE,
    cleanDiag,
    pushDiag,
    diagLine,
    diagText,
  });
});
