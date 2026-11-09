// BeinFusion — phần dùng chung cho service worker, popup, dashboard và test (Node): lõi (hằng số, tiện ích, quyền, đường dẫn).
// Các phần còn lại ở lib/*.js, nạp sau tệp này theo thứ tự BG.PARTS (background.js, dashboard.html, popup.html; Node tự nạp).
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    for (const p of api.PARTS) require('./lib/' + p + '.js')(api);
    module.exports = api;
  } else root.BG = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const API = 'https://api.beincom.com/v1/';
  const SITE = 'https://group.beincom.com';

  const DEFAULT_SETTINGS = {
    active: true, // công tắc tổng: false = dừng quét, thông báo và tự xử lý
    intervalMin: 30,
    notify: true,
    dryRun: true, // chạy thử: chỉ ghi nhật ký, không gửi duyệt/từ chối lên Beincom
    actionDelaySec: 2, // chờ giữa hai thao tác khi xử lý hàng loạt
    autoApprove: false, // tự duyệt yêu cầu được gợi ý "Duyệt"
    autoDecline: false, // tự từ chối yêu cầu được gợi ý "Từ chối"
    scanPosts: true, // quét bài mới đăng trong các group đang quản trị
    scanReports: true, // quét báo cáo chờ xử lý và bài bị Beincom gắn cờ tự động
    scanComments: true, // đọc bình luận mới của các bài vừa quét (cần bật quét bài mới), chấm theo quy tắc bài viết
    trackViolations: true, // ghi hồ sơ vi phạm của thành viên (đọc thêm nhật ký hoạt động mỗi lần quét)
    weeklyReport: true, // sáng thứ Hai thông báo tóm tắt tuần trước
    monthlyReport: true, // đầu tháng nhắc xem báo cáo tháng trước
    nudgeWeekly: false, // sáng thứ Hai soạn sẵn bài nhắc người mới chưa hoạt động (người dùng tự xem rồi đăng)
    nudgeGroupId: '', // group soạn bài nhắc
    selfCheckDaily: true, // mỗi ngày tự kiểm tra (chỉ đọc) mọi community, báo khi tính năng đang chạy bị lỗi
    promptWeekly: false, // sáng thứ Hai soạn sẵn bài thảo luận (câu hỏi mồi) cho promptGroupId
    promptGroupId: '',
    autoHideSpam: false, // tự ẩn bài / bình luận MỚI có link tới tên miền cấm (sau mỗi lần quét)
    spamWaves: true, // báo khi cùng một link / nội dung đến từ nhiều tài khoản trong thời gian ngắn
    welcomeReminder: true, // sáng thứ Hai nhắc soạn bài chào thành viên mới
    watchKeywords: [], // bài / bình luận mới nhắc tới thì báo (không phải vi phạm)
    remindUnanswered: true, // nhắc bài chưa ai trả lời quá unansweredHours giờ
    unansweredHours: 6,
    remindPending: true, // nhắc yêu cầu tham gia / bài chờ duyệt đã chờ quá pendingHours giờ (mỗi việc một lần)
    pendingHours: 24,
    guardJoins: true, // theo dõi người mới vào: tài khoản giống admin, đợt vào ồ ạt (mỗi lần quét đọc nhật ký vào)
    burstJoins: 30, // từ bấy nhiêu người vào trong 60 phút thì báo đợt vào ồ ạt
    chatEnabled: false, // kết nối chat Beincom (cần cho phép addon kết nối chat.beincom.com)
    chatScan: true, // quét tin nhắn mới trong kênh chat của group sau mỗi lần quét
    chatUnread: true, // báo tin nhắn riêng chưa đọc / nhắc tên mình trong chat
    chatThreads: true, // báo bình luận mới ở thread mình theo dõi
    chatFast: true, // kiểm tra nhanh tin nhắn riêng / nhắc tên / thread mỗi phút (không chờ lần quét)
    syncSettings: false, // đồng bộ cài đặt, quy tắc qua tài khoản Chrome / Edge (chrome.storage.sync)
    autoApprovePosts: false, // tự duyệt bài chờ duyệt đạt mọi quy tắc của thành viên tin cậy
    trustedMembers: [], // username thành viên tin cậy
    trustAfterApproved: 0, // hoặc người đã được duyệt ít nhất N bài qua addon (0 = không dùng)
  };

  // Quy tắc cho bài viết (bài chờ duyệt và bài mới đăng)
  const DEFAULT_POST_RULES = {
    bannedKeywords: [], // có trong bài -> vi phạm
    reviewKeywords: [], // có trong bài -> cần xem
    reviewContacts: false, // có số điện thoại / link Zalo, Telegram, WhatsApp -> cần xem
    blockedDomains: [], // có link tới tên miền này -> vi phạm
    reviewExternalLinks: false, // có link ngoài danh sách cho phép -> cần xem
    allowedDomains: ['beincom.com'],
  };

  // Lý do cấm thành viên (GET group/member-ban-reasons)
  const BAN_REASONS = {
    SPAM: 'Spam',
    BULLYING: 'Bắt nạt, đe doạ, quấy rối',
    VIOLATE_RULE: 'Vi phạm nội quy community',
  };

  // Một dòng của GET group/communities/{communityId}/banned-members
  function slimBanned(b) {
    const u = b?.user || b || {};
    return {
      id: u.id,
      username: u.username || '',
      fullname: u.fullname || '',
      avatar: u.avatar || '',
      isVerified: !!(u.isVerified ?? u.is_verified),
      reason: BAN_REASONS[b?.reason] || b?.reason || '',
      bannedAt: b?.createdAt || b?.created_at || b?.updatedAt || null,
    };
  }

  // Loại sự kiện trong nhật ký hoạt động của group: [nhãn, nhóm]
  // nhóm: in = có người vào, out = có người rời / bị xoá / bị cấm, role = đổi vai trò
  const ACTIVITY_TYPES = {
    'join.community.as_member': ['Vào community', 'in'],
    'join.group.as_member': ['Vào group', 'in'],
    'join.group.as_admin': ['Vào group (admin)', 'in'],
    'approve.join_request': ['Được duyệt vào', 'in'],
    'accept.invitation': ['Nhận lời mời', 'in'],
    'leave.group': ['Rời group', 'out'],
    'remove.member': ['Bị xoá khỏi group', 'out'],
    'ban.member': ['Bị cấm', 'out'],
    'unban.member': ['Được bỏ cấm', 'other'],
    'decline.join_request': ['Bị từ chối vào', 'other'],
    'decline.invitation': ['Từ chối lời mời', 'other'],
    'cancel.invitation': ['Huỷ lời mời', 'other'],
    'assign.group_admin': ['Được gán admin group', 'role'],
    'revoke.group_admin': ['Bị gỡ admin group', 'role'],
    'assign.community_admin': ['Được gán admin community', 'role'],
    'revoke.community_admin': ['Bị gỡ admin community', 'role'],
  };

  // Lý do ẩn bài (CONTENT_REPORT_REASON_TYPE của Beincom)
  const HIDE_REASONS = {
    SPAM: 'Spam / quảng cáo',
    BULLYING_THREATENING_OR_HARASSING: 'Bắt nạt, đe doạ, quấy rối',
    VIOLENT_OR_PORN: 'Bạo lực, khiêu dâm',
    PRETENDING_SOMEONE: 'Mạo danh người khác',
    ILLEGAL: 'Vi phạm pháp luật',
    CHILD_ABUSE_EXPLOITATION: 'Xâm hại trẻ em',
    OTHERS: 'Lý do khác',
  };

  const DEFAULT_RULES = {
    requireAvatar: true, // không có ảnh đại diện -> cần xem
    requireAnswers: true, // chưa trả lời câu hỏi bắt buộc -> cần xem
    minAnswerLength: 3, // câu trả lời ngắn hơn -> cần xem
    requireVerified: false, // tài khoản chưa xác minh -> cần xem
    declineDeactivated: true, // tài khoản bị vô hiệu -> từ chối
    bannedKeywords: [], // có trong tên, username hoặc câu trả lời -> từ chối
    allowUsernames: [], // luôn gợi ý duyệt
    blockUsernames: [], // luôn gợi ý từ chối
    reviewViolators: true, // có hồ sơ vi phạm (bị cấm, xoá, ẩn bài…) -> cần xem
    reviewImpersonation: true, // tên giống admin / tự nhận "admin, hỗ trợ, cskh" -> từ chối hoặc cần xem
  };

  // Quyền cho biết tài khoản quản trị group (lấy từ GET group/me/permissions)
  const ADMIN_PERMS = ['approve_reject_jr', 'remove_member', 'manage'];
  const ROLE_LABELS = { role_OWNER: 'Chủ sở hữu', role_COMMUNITY_ADMIN: 'Admin community', role_GROUP_ADMIN: 'Admin group' };

  // Bỏ dấu, chữ thường: "Nhận Thưởng" khớp "nhan thuong"
  function norm(s) {
    return String(s ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '') // bỏ dấu sau khi tách NFD
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  // Ô nhập nhiều giá trị: cách nhau dấu phẩy hoặc xuống dòng; username bỏ "@"
  function parseList(text, { username = false } = {}) {
    const out = [];
    for (let s of String(text ?? '').split(/[,\n]/)) {
      s = s.trim();
      if (username) s = s.replace(/^@/, '').toLowerCase();
      if (s && !out.includes(s)) out.push(s);
    }
    return out;
  }

  function vnDay(t = Date.now()) {
    return new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
  }

  function isOk(r) {
    return !!r && r.status >= 200 && r.status < 300 && r.body?.code === 'api.ok';
  }

  // Chi tiết lỗi kiểm tra dữ liệu: ["limit must not be greater than 25"] hoặc [{ message: ["…"] }]
  function errDetails(errors) {
    if (!Array.isArray(errors)) return '';
    return errors
      .map((e) => (typeof e === 'string' ? e : [].concat(e?.message || []).join(', ')))
      .filter(Boolean)
      .join('; ');
  }

  // Beincom báo bài không còn (đã bị xoá trên web): code content.not_found / "Content not found"
  // Bài / bình luận đã bị xoá (Beincom), tin chat đã bị xoá (Mattermost: 404 app.post.get…): chuyện thường, không phải lỗi
  function isContentGone(r) {
    return /(content|comment)[._ ]?not[._ ]?found/i.test(`${r?.body?.code || ''} ${r?.body?.meta?.message || ''}`) || (r?.status === 404 && /^app\.post\.get/.test(r?.body?.id || ''));
  }

  // ---------- Gửi lệnh từ trang tới nền (service worker) ----------
  // Trình duyệt có thể tắt / khởi động lại nền giữa chừng (máy ngủ, cập nhật addon, một lần gọi mạng chờ quá lâu): lệnh đang chờ
  // báo "message channel closed". Lệnh chỉ đọc (SAFE_RESEND) thì gửi lại một lần; lệnh ghi không gửi lại (không biết nền đã làm
  // chưa) mà trả lỗi rõ ràng. Cả hai đều gọi onLost(câu báo kèm tên lệnh) để trang ghi Lỗi kỹ thuật.
  const SAFE_RESEND = new Set([
    'chatQuotes', 'beinLinkNames', 'postFull', 'postComments', 'members', 'activity', 'scheduled', 'stats', 'reports', 'reportDetail',
    'mentionable', 'postDetail', 'pinned', 'groupSettings', 'banned', 'tagsSeries', 'tags', 'newMembers', 'syncStatus', 'storageUsage',
    'chatOverview', 'chatPosts', 'chatThread', 'chatThreads', 'chatPinned', 'chatMentions', 'chatReactions', 'chatSearch', 'userPosts',
    'sweepSearch', 'monthly', 'linkPreview', 'retention', 'categories', 'refreshBadge', 'selfCheck', 'nudgeEffect', 'postStatsRefresh', 'selfInfo',
  ]);
  const LOST_RE = /message channel closed|message port closed|Receiving end does not exist|Could not establish connection/i;
  const STALE_RE = /Extension context invalidated/i;
  async function sendSafe(raw, msg, onLost) {
    for (let i = 0; ; i++) {
      try {
        return await raw(msg);
      } catch (e) {
        const text = String(e?.message || e);
        if (STALE_RE.test(text)) return { status: 'error', message: 'Addon vừa được cập nhật — tải lại trang này (F5).' };
        if (!LOST_RE.test(text)) throw e;
        const again = i === 0 && SAFE_RESEND.has(msg?.type);
        if (msg?.type !== 'diag') onLost?.(`Lệnh "${msg?.type}": nền của addon bị tắt khi đang chờ${again ? ' — đã gửi lại' : ''}`);
        if (!again) return { status: 'error', message: 'Nền của addon vừa khởi động lại giữa chừng — xem Nhật ký rồi bấm lại nếu việc chưa xong.' };
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  // Thay chrome.runtime.sendMessage của trang bằng bản an toàn (dash/core.js, chat/core.js, popup.js)
  function guardSendMessage(onLost) {
    const rt = typeof chrome === 'object' && chrome.runtime;
    if (!rt?.sendMessage || rt.sendMessage.beinSafe) return;
    const raw = rt.sendMessage.bind(rt);
    const safe = (msg) => sendSafe(raw, msg, onLost);
    safe.beinSafe = true;
    rt.sendMessage = safe;
  }

  // Mã lỗi Beincom có câu tiếng Việt dễ hiểu hơn câu gốc
  const ERR_CODES = {
    'tag.is_used': 'Tag đang gắn vào bài — Beincom chỉ cho đổi tên / xoá tag chưa dùng',
  };

  function errMsg(r) {
    if (!r) return 'Không có phản hồi';
    if (ERR_CODES[r.body?.code]) return ERR_CODES[r.body.code];
    if (r.body?.meta?.message || r.body?.code) {
      const base = r.body.meta?.message || r.body.code;
      const more = errDetails(r.body.meta?.errors);
      return more && !base.includes(more) ? `${base}: ${more}` : base;
    }
    // Lỗi của chat Beincom (Mattermost): { id, message, status_code }
    if (r.body?.status_code && typeof r.body.message === 'string') return r.body.message;
    if (r.status === 0) return 'Không kết nối được API Beincom' + (r.error ? ` — ${r.error}` : '');
    if ([502, 503, 504].includes(r.status)) return `Máy chủ Beincom không phản hồi kịp (HTTP ${r.status}), thường tự hết — lần quét sau sẽ thử lại`;
    if (r.status === 401) return 'Phiên đăng nhập hết hạn';
    if (r.status === 407) return 'Mạng của máy đòi đăng nhập proxy (HTTP 407) — kiểm tra VPN / proxy; không phải lỗi Beincom';
    if (r.status === 403) return 'Không có quyền hoặc bị Cloudflare chặn (403)';
    return r.error || `HTTP ${r.status}`;
  }

  function slimPerson(p) {
    return p ? { id: p.id, username: p.username || '', fullname: p.fullname || '', avatar: p.avatar || '' } : null;
  }

  // ---------- Quyền ----------

  // Các group tài khoản đang quản trị: [{ id, perms, roles, canApprove, canRemove, canAssign }]
  function adminGroups(permData) {
    const out = [];
    for (const [id, perms] of Object.entries(permData?.groups || {})) {
      if (!Array.isArray(perms) || !perms.some((p) => ADMIN_PERMS.includes(p) || p.startsWith('role_'))) continue;
      out.push({
        id,
        perms,
        roles: perms.filter((p) => p.startsWith('role_')),
        canApprove: perms.includes('approve_reject_jr'),
        canRemove: perms.includes('remove_member'),
        canAssign: perms.includes('assign_unassign_role'),
      });
    }
    return out;
  }

  // Quyền cấm thành viên nằm ở cấp community
  function canBan(permData, communityId) {
    return !!permData?.communities?.[communityId]?.includes('ban_member');
  }

  // Chủ / admin community (xem được báo cáo vi phạm, thống kê chính thức)
  function isCommunityAdmin(permData, communityId) {
    return !!permData?.communities?.[communityId]?.includes('manage');
  }

  // Xếp group theo cây: community có nhiều việc lên trước; trong community, group gốc trước rồi tới group con theo cấp.
  // (Admin group không đọc được cây group, nên dùng `level` để thụt lề.)
  function sortGroupTree(groups) {
    const work = (g) => (g.pendingTotal || 0) + (g.approvalCount || 0);
    const byCommunity = new Map();
    for (const g of groups) {
      const k = g.communityId || g.id;
      byCommunity.set(k, (byCommunity.get(k) || 0) + work(g));
    }
    const key = (g) => g.communityId || g.id;
    return [...groups].sort(
      (a, b) =>
        byCommunity.get(key(b)) - byCommunity.get(key(a)) ||
        String(a.communityName || a.name).localeCompare(String(b.communityName || b.name)) ||
        key(a).localeCompare(key(b)) ||
        Number(!!b.isCommunity) - Number(!!a.isCommunity) ||
        (a.level || 0) - (b.level || 0) ||
        String(a.name).localeCompare(String(b.name)),
    );
  }

  // Tiền tố thụt lề cho ô chọn group (option bỏ dấu cách thường nên dùng dấu cách không ngắt)
  function groupIndent(g) {
    const lvl = g.isCommunity ? 0 : Math.max(1, g.level || 0);
    return lvl ? String.fromCharCode(160).repeat(4 * lvl) + '└ ' : '';
  }

  function roleLabel(roles) {
    for (const r of ['role_OWNER', 'role_COMMUNITY_ADMIN', 'role_GROUP_ADMIN']) if (roles?.includes(r)) return ROLE_LABELS[r];
    return 'Quản trị';
  }

  // ---------- Đường dẫn trang web ----------

  function groupUrl(g) {
    return g.isCommunity ? `${SITE}/community-detail/${g.communityId}` : `${SITE}/group-detail/${g.communityId}/groups/${g.id}`;
  }

  function memberRequestsUrl(g) {
    return groupUrl(g) + '/members/member-requests';
  }

  function contentApprovalUrl(communityId) {
    return `${SITE}/admin-panel/${communityId}/content-approval?approvalStatus=pending`;
  }

  function userUrl(username) {
    return `${SITE}/users/${encodeURIComponent(username)}`;
  }

  function postUrl(p) {
    return p.type === 'ARTICLE' ? `${SITE}/article/${p.id}` : `${SITE}/posts/${p.id}`;
  }

  // Mở bài và cuộn tới bình luận (giống link trong thông báo của web)
  function commentUrl(c) {
    const base = postUrl({ id: c.postId, type: c.postType });
    return `${base}?comment_id=${c.id}` + (c.parentId ? `&parent_id=${c.parentId}` : '');
  }

  // ---------- Số liệu dùng chung (Tổng quan, báo cáo, Hồ sơ cá nhân — mọi trang đều có common.js) ----------
  // Bài bị Beincom gắn cờ tự động: một bài có thể nằm ở nhiều group, chỉ đếm một lần
  function autoFlaggedIds(groups) {
    return [...new Set((groups || []).flatMap((g) => g.flaggedIds || []))];
  }

  function totals(groups) {
    let requests = 0;
    let posts = 0;
    let reports = 0;
    const seenCommunity = new Set();
    for (const g of groups || []) {
      requests += g.pendingTotal || 0;
      // Bài chờ duyệt tính theo community: chỉ cộng một lần
      if (g.approvalCount != null && !seenCommunity.has(g.communityId)) {
        seenCommunity.add(g.communityId);
        posts += g.approvalCount;
      }
      // Báo cáo chờ xử lý chỉ đọc ở group gốc của community
      reports += (g.reportIds || []).length;
    }
    return { requests, posts, reports, autoFlagged: autoFlaggedIds(groups).length };
  }

  // Đếm thao tác trong nhật ký addon theo loại (trong khoảng inRange; scope = Set id group cần tính, null = mọi group)
  function countLogActions(log, inRange, scope = null) {
    const a = { approved: 0, autoApproved: 0, declined: 0, autoDeclined: 0, removed: 0, banned: 0, unbanned: 0, postsApproved: 0, postsRejected: 0, postsHidden: 0, postsDeleted: 0, commentsHidden: 0, reportsHandled: 0, published: 0, scheduled: 0, groupSettings: 0, errors: 0 };
    for (const e of log || []) {
      if (!inRange(e.time)) continue;
      if (scope && !scope.has(e.groupId)) continue;
      if (e.status === 'error') {
        a.errors++;
        continue;
      }
      if (e.status !== 'ok') continue;
      const auto = e.source === 'auto';
      const k = e.kind || 'member';
      if (k === 'member' && e.action === 'approve') auto ? a.autoApproved++ : a.approved++;
      else if (k === 'member' && e.action === 'decline') auto ? a.autoDeclined++ : a.declined++;
      else if (k === 'manage' && e.action === 'remove') a.removed++;
      else if (k === 'manage' && e.action === 'ban') a.banned++;
      else if (k === 'manage' && e.action === 'unban') a.unbanned++;
      else if (k === 'post' && e.action === 'approve') a.postsApproved++;
      else if (k === 'post' && e.action === 'reject') a.postsRejected++;
      else if (k === 'post' && e.action === 'hide') a.postsHidden++;
      else if (k === 'post' && e.action === 'delete') a.postsDeleted++;
      else if (k === 'comment' && e.action === 'hide') a.commentsHidden++;
      else if (k === 'report') a.reportsHandled++;
      else if (k === 'compose' && e.action === 'publish') a.published++;
      else if (k === 'compose' && e.action === 'schedule') a.scheduled++;
      else if (k === 'groupSetting') a.groupSettings++;
    }
    return a;
  }

  // ---------- Kết quả quét: nhiều khoá ----------
  // Khoá `state` từng chứa mọi thứ (~1 MB ở tài khoản thật): mỗi lần ghi (quét, mỗi thao tác) là cả khối, trang nào đang mở
  // cũng nhận cả khối cũ lẫn mới. Giờ phần lớn nằm ở khoá riêng — nền ghi đủ các khoá trong một lần, Chrome (và kho của
  // BeinIOS) chỉ ghi và báo khoá có nội dung đổi. Trường chat* vào stateChat; trường không liệt kê ở `state`.
  const STATE_PARTS = { stateGroups: ['snapshot', 'memberHistory'], statePosts: ['recentPosts'], stateComments: ['recentComments', 'commentSeen'] };
  const STATE_KEYS = ['state', ...Object.keys(STATE_PARTS), 'stateChat'];
  const statePartOf = (field) => (field.startsWith('chat') ? 'stateChat' : Object.keys(STATE_PARTS).find((k) => STATE_PARTS[k].includes(field)) || 'state');
  // Kho (kết quả get) -> state đầy đủ. Kho trước khi tách (mọi trường trong `state`) vẫn đọc được: khoá riêng có thì đè lên
  function joinState(store) {
    const out = { ...(store?.state || {}) };
    for (const k of STATE_KEYS.slice(1)) if (store?.[k]) Object.assign(out, store[k]);
    return out;
  }
  // state đầy đủ -> { state, stateGroups, … } — khoá nào cũng có (kể cả rỗng) để lần ghi đầu bỏ trường cũ khỏi `state`
  function splitState(state) {
    const out = Object.fromEntries(STATE_KEYS.map((k) => [k, {}]));
    for (const [f, v] of Object.entries(state || {})) if (v !== undefined) out[statePartOf(f)][f] = v;
    return out;
  }

  // Các phần của BG trong lib/, theo thứ tự nạp
  const PARTS = ['content', 'members', 'compose', 'article', 'manage', 'reports', 'telegram', 'diag', 'chat', 'qr', 'transfer', 'self', 'ai', 'help'];

  return {
    PARTS,
    API,
    SITE,
    DEFAULT_SETTINGS,
    DEFAULT_RULES,
    DEFAULT_POST_RULES,
    HIDE_REASONS,
    BAN_REASONS,
    slimBanned,
    ACTIVITY_TYPES,
    norm,
    parseList,
    vnDay,
    isOk,
    totals,
    autoFlaggedIds,
    countLogActions,
    STATE_KEYS,
    joinState,
    splitState,
    SAFE_RESEND,
    sendSafe,
    guardSendMessage,
    errMsg,
    isContentGone,
    adminGroups,
    canBan,
    isCommunityAdmin,
    sortGroupTree,
    groupIndent,
    roleLabel,
    groupUrl,
    memberRequestsUrl,
    contentApprovalUrl,
    userUrl,
    postUrl,
    commentUrl,
    // dùng chung giữa các phần của BG
    slimPerson,
  };
});
