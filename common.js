// BeinGroup — phần dùng chung cho service worker, popup, dashboard và test (Node).
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BG = api;
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
    autoHideSpam: false, // tự ẩn bài / bình luận MỚI có link tới tên miền cấm (sau mỗi lần quét)
    spamWaves: true, // báo khi cùng một link / nội dung đến từ nhiều tài khoản trong thời gian ngắn
    welcomeReminder: true, // sáng thứ Hai nhắc soạn bài chào thành viên mới
    watchKeywords: [], // bài / bình luận mới nhắc tới thì báo (không phải vi phạm)
    remindUnanswered: true, // nhắc bài chưa ai trả lời quá unansweredHours giờ
    unansweredHours: 6,
    syncSettings: false, // đồng bộ cài đặt, quy tắc qua tài khoản Chrome / Edge (chrome.storage.sync)
  };

  // Quy tắc cho bài viết (bài chờ duyệt và bài mới đăng)
  const DEFAULT_POST_RULES = {
    bannedKeywords: [], // có trong bài -> vi phạm
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
  function isContentGone(r) {
    return /(content|comment)[._ ]?not[._ ]?found/i.test(`${r?.body?.code || ''} ${r?.body?.meta?.message || ''}`);
  }

  function errMsg(r) {
    if (!r) return 'Không có phản hồi';
    if (r.body?.meta?.message || r.body?.code) {
      const base = r.body.meta?.message || r.body.code;
      const more = errDetails(r.body.meta?.errors);
      return more && !base.includes(more) ? `${base}: ${more}` : base;
    }
    if (r.status === 0) return 'Không kết nối được API Beincom' + (r.error ? ` — ${r.error}` : '');
    if ([502, 503, 504].includes(r.status)) return `Máy chủ Beincom không phản hồi kịp (HTTP ${r.status}), thường tự hết — lần quét sau sẽ thử lại`;
    if (r.status === 401) return 'Phiên đăng nhập hết hạn';
    if (r.status === 403) return 'Không có quyền hoặc bị Cloudflare chặn (403)';
    return r.error || `HTTP ${r.status}`;
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

  // ---------- Yêu cầu tham gia ----------

  // Thu gọn dữ liệu API, chỉ giữ thứ cần để hiển thị và lọc
  function slimRequest(r) {
    const u = r.user || {};
    return {
      id: r.id,
      userId: r.userId || u.id,
      createdAt: r.createdAt || null,
      answers: Array.isArray(r.membershipAnswers) ? r.membershipAnswers : [],
      user: {
        id: u.id,
        username: u.username || '',
        fullname: u.fullname || '',
        avatar: u.avatar || '',
        isVerified: !!u.isVerified,
        isDeactivated: !!u.isDeactivated,
        premium: Array.isArray(u.subscriptions) && u.subscriptions.some((s) => s?.type === 'premium'),
        nft: !!(u.userNFT?.isLinkedPoNFT || u.userNFT?.isLinkedUoNFT),
      },
    };
  }

  function slimQuestion(q) {
    return { id: q.id, question: q.question || '', isRequired: !!q.isRequired };
  }

  function hasAvatar(user) {
    return !!user.avatar && !/default/i.test(user.avatar);
  }

  // Ghép câu trả lời với câu hỏi. API chưa cho thấy rõ dạng câu trả lời nên đọc nhiều tên trường.
  function answersOf(req, questions = []) {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const seen = new Set();
    const out = [];
    for (const a of req.answers || []) {
      if (a == null) continue;
      const qid = a.questionId ?? a.question_id ?? a.question?.id ?? null;
      const q = byId.get(qid);
      const text = typeof a === 'string' ? a : a.answer ?? a.value ?? a.content ?? '';
      if (qid) seen.add(qid);
      out.push({ questionId: qid, question: q?.question ?? a.question?.question ?? (typeof a.question === 'string' ? a.question : ''), answer: String(text ?? ''), isRequired: !!q?.isRequired });
    }
    for (const q of questions) {
      if (!seen.has(q.id)) out.push({ questionId: q.id, question: q.question, answer: '', isRequired: q.isRequired });
    }
    return out;
  }

  // Gợi ý cho một yêu cầu tham gia.
  // verdict: 'approve' (đạt mọi quy tắc) · 'decline' (vi phạm quy tắc từ chối) · 'review' (cần người xem)
  // profile: hồ sơ vi phạm của người xin vào (nếu có)
  function evaluateRequest(req, rules = DEFAULT_RULES, questions = [], profile = null) {
    const r = { ...DEFAULT_RULES, ...rules };
    const u = req.user || {};
    const username = String(u.username || '').toLowerCase();
    const reasons = [];
    const bad = (text) => reasons.push({ level: 'bad', text });
    const warn = (text) => reasons.push({ level: 'warn', text });

    if (username && r.blockUsernames.map((x) => x.toLowerCase()).includes(username)) {
      return { verdict: 'decline', reasons: [{ level: 'bad', text: 'Có trong danh sách chặn' }] };
    }
    if (username && r.allowUsernames.map((x) => x.toLowerCase()).includes(username)) {
      return { verdict: 'approve', reasons: [{ level: 'ok', text: 'Có trong danh sách cho phép' }] };
    }

    if (r.declineDeactivated && u.isDeactivated) bad('Tài khoản đã bị vô hiệu hoá');

    const answers = answersOf(req, questions);
    const haystack = norm([u.fullname, u.username, ...answers.map((a) => a.answer)].join(' \n '));
    const hits = r.bannedKeywords.filter((k) => norm(k) && haystack.includes(norm(k)));
    if (hits.length) bad('Chứa từ khoá cấm: ' + hits.join(', '));

    if (r.reviewViolators && profile?.events?.length) warn('Có hồ sơ vi phạm: ' + profileText(profileSummary(profile)));
    if (r.requireAvatar && !hasAvatar(u)) warn('Không có ảnh đại diện');
    if (r.requireVerified && !u.isVerified) warn('Tài khoản chưa xác minh');
    if (r.requireAnswers) {
      const missing = answers.filter((a) => a.isRequired && !a.answer.trim());
      const short = answers.filter((a) => a.answer.trim() && a.answer.trim().length < (Number(r.minAnswerLength) || 0));
      if (missing.length) warn(`Chưa trả lời ${missing.length} câu hỏi bắt buộc`);
      if (short.length) warn(`${short.length} câu trả lời quá ngắn`);
    }

    if (reasons.some((x) => x.level === 'bad')) return { verdict: 'decline', reasons };
    if (reasons.length) return { verdict: 'review', reasons };
    return { verdict: 'approve', reasons: [{ level: 'ok', text: 'Đạt mọi quy tắc' }] };
  }

  const VERDICT_LABELS = { approve: 'Gợi ý duyệt', decline: 'Gợi ý từ chối', review: 'Cần xem' };

  // ---------- Hồ sơ vi phạm của thành viên ----------
  // Addon tự ghi (lưu trong máy) từ: thao tác của bạn qua addon, nhật ký hoạt động Beincom (bị xoá / cấm / từ chối,
  // kể cả do admin khác làm trên web), báo cáo của người dùng, bài Beincom gắn cờ, bài đã ẩn, bài vi phạm quy tắc.
  // member: sự kiện về tư cách thành viên (một lần xoá / cấm có thể đến từ hai nguồn: gộp nếu gần nhau)
  const VIOLATION_TYPES = {
    banned: { label: 'Bị cấm', weight: 5, member: true },
    removed: { label: 'Bị xoá khỏi group', weight: 3, member: true },
    hidden: { label: 'Nội dung bị ẩn', weight: 2 },
    rejected: { label: 'Bài bị từ chối duyệt', weight: 1 },
    declined: { label: 'Bị từ chối vào group', weight: 1, member: true },
    reported: { label: 'Bị báo cáo', weight: 1 },
    flagged: { label: 'Bài bị Beincom gắn cờ', weight: 1 },
    rule: { label: 'Bài vi phạm quy tắc', weight: 1 },
  };
  const PROFILE_MAX_USERS = 500;
  const PROFILE_MAX_EVENTS = 30;
  const SAME_ACT_MS = 15 * 60e3;

  // events: [{ user: { id, username, fullname, avatar }, type, key, time, group, snippet, reason, by }]
  //   hoặc { user, clear: key } để bỏ một sự kiện (vd báo cáo đã được bỏ qua)
  // Trả về { store: { users: { [id]: { user, events } } }, added }: added = số sự kiện thêm / bỏ
  function addViolations(store, events, now = Date.now()) {
    const users = { ...(store?.users || {}) };
    let added = 0;
    for (const ev of events || []) {
      const u = ev?.user;
      if (!u?.id) continue;
      const prev = users[u.id];
      if (ev.clear) {
        if (!prev?.events.some((e) => e.key === ev.clear)) continue;
        const left = prev.events.filter((e) => e.key !== ev.clear);
        if (left.length) users[u.id] = { ...prev, events: left };
        else delete users[u.id];
        added++;
        continue;
      }
      const type = VIOLATION_TYPES[ev.type];
      if (!type || !ev.key) continue;
      const list = prev?.events || [];
      const t = Date.parse(ev.time) || now;
      const dup = list.some((e) => e.key === ev.key || (type.member && e.type === ev.type && e.group === (ev.group || '') && Math.abs(Date.parse(e.time) - t) < SAME_ACT_MS));
      if (dup) continue;
      const user = { id: u.id, username: u.username || prev?.user.username || '', fullname: u.fullname || prev?.user.fullname || '', avatar: u.avatar || prev?.user.avatar || '' };
      const item = {
        type: ev.type,
        key: ev.key,
        time: new Date(t).toISOString(),
        group: ev.group || '',
        snippet: String(ev.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        reason: String(ev.reason || '').slice(0, 160),
        by: ev.by || '',
      };
      users[u.id] = { user, events: [item, ...list].sort((a, b) => b.time.localeCompare(a.time)).slice(0, PROFILE_MAX_EVENTS) };
      added++;
    }
    const ids = Object.keys(users);
    if (ids.length > PROFILE_MAX_USERS) {
      ids.sort((a, b) => users[b].events[0].time.localeCompare(users[a].events[0].time));
      for (const id of ids.slice(PROFILE_MAX_USERS)) delete users[id];
    }
    return { store: { users }, added };
  }

  // { counts: { banned: 1, … }, score, total, last, repeat (≥ 2 lần), severe (bị cấm / xoá) }
  function profileSummary(p) {
    const counts = {};
    let score = 0;
    for (const e of p?.events || []) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      score += VIOLATION_TYPES[e.type]?.weight || 0;
    }
    const total = p?.events?.length || 0;
    return { counts, score, total, last: p?.events?.[0] || null, repeat: total >= 2, severe: !!(counts.banned || counts.removed) };
  }

  // "Bị cấm 1 · Nội dung bị ẩn 2" (theo thứ tự nặng → nhẹ)
  function profileText(sum) {
    return Object.keys(VIOLATION_TYPES)
      .filter((k) => sum.counts[k])
      .map((k) => `${VIOLATION_TYPES[k].label} ${sum.counts[k]}`)
      .join(' · ');
  }

  // Từ nhật ký thao tác của addon: chỉ thao tác đã gửi thành công (không tính chạy thử, bài đã bị xoá sẵn)
  function violationsFromLog(entries) {
    const out = [];
    for (const e of entries || []) {
      if (e.status !== 'ok' || e.gone || !e.userId) continue;
      const user = { id: e.userId, username: e.username || '', fullname: e.fullname || '', avatar: '' };
      const base = { user, time: new Date(e.time || Date.now()).toISOString(), group: e.groupName || e.communityName || '', snippet: e.snippet || '', reason: e.reason || '', by: e.source === 'auto' ? 'Addon tự xử lý' : 'Bạn (qua addon)' };
      const { kind, action } = e;
      if (kind === 'member' && action === 'decline') out.push({ ...base, type: 'declined', key: 'declined:' + e.requestId });
      else if (kind === 'manage' && (action === 'remove' || action === 'ban')) out.push({ ...base, type: action === 'ban' ? 'banned' : 'removed', key: `${action}:${e.groupId}:${e.userId}:${e.time}` });
      else if (kind === 'post' && action === 'hide') out.push({ ...base, type: 'hidden', key: 'hidden:' + e.contentId });
      else if (kind === 'comment' && action === 'hide') out.push({ ...base, type: 'hidden', key: 'hidden:c:' + e.contentId });
      else if (kind === 'post' && action === 'reject') out.push({ ...base, type: 'rejected', key: 'rejected:' + e.contentId });
      else if (kind === 'report' && (action === 'hide' || action === 'hidePost')) out.push({ ...base, type: 'hidden', key: 'hidden:' + e.contentId });
      else if (kind === 'report' && action === 'ignore' && e.reportId) out.push({ user, clear: 'report:' + e.reportId }); // báo cáo sai: bỏ khỏi hồ sơ
    }
    return out;
  }

  // Từ nhật ký hoạt động Beincom (slimActivity)
  const ACTIVITY_VIOLATION = { 'remove.member': 'removed', 'ban.member': 'banned', 'decline.join_request': 'declined' };
  function violationsFromActivity(items) {
    return (items || [])
      .filter((a) => ACTIVITY_VIOLATION[a.useCase] && a.user?.id)
      .map((a) => ({ user: a.user, type: ACTIVITY_VIOLATION[a.useCase], key: 'act:' + a.id, time: a.time, group: a.groupName || '', by: a.actor ? a.actor.fullname || a.actor.username : '' }));
  }

  // Từ báo cáo của người dùng (slimReport); báo cáo đã bỏ qua không tính
  function violationsFromReports(reports, group = '') {
    return (reports || [])
      .filter((r) => r.actor?.id && r.status !== 'IGNORED')
      .map((r) => ({ user: r.actor, type: 'reported', key: 'report:' + r.id, time: r.createdAt, group, snippet: r.content, reason: r.reasons.map((x) => `${x.label} ×${x.total}`).join(', ') }));
  }

  // Từ bài (slimPost): type 'flagged' | 'hidden' | 'rule'; reasonOf(p) -> lý do
  function violationsFromPosts(posts, type, reasonOf = () => '') {
    return (posts || [])
      .filter((p) => p.actor?.id)
      .map((p) => ({ user: p.actor, type, key: `${type === 'rule' ? 'rule' : type === 'flagged' ? 'flag' : 'hidden'}:${p.id}`, time: p.publishedAt || p.submittedAt, group: p.groups?.[0]?.name || '', snippet: p.title || p.text, reason: reasonOf(p) }));
  }

  // ---------- Thành viên ----------

  // Chuẩn hoá thành viên từ hai API:
  //  - group/manage/communities/{id}/members (group gốc): có joinedAt, isCommunityAdmin, totalJoinedGroup
  //  - group/groups/{id}/users (mọi group): tách sẵn groupAdmin / groupMember, có gói Premium, NFT
  function slimMember(u, { isAdmin } = {}) {
    return {
      id: u.id,
      username: u.username || '',
      fullname: u.fullname || '',
      avatar: u.avatar || '',
      isVerified: !!u.isVerified,
      isDeactivated: !!u.isDeactivated,
      isAdmin: isAdmin ?? !!u.isAdmin,
      isCommunityAdmin: !!u.isCommunityAdmin,
      joinedAt: u.joinedAt || null,
      totalJoinedGroup: u.totalJoinedGroup ?? null,
      premium: Array.isArray(u.subscriptions) && u.subscriptions.some((s) => s?.type === 'premium'),
      nft: !!(u.userNFT?.isLinkedPoNFT || u.userNFT?.isLinkedUoNFT),
    };
  }

  function slimPerson(p) {
    return p ? { id: p.id, username: p.username || '', fullname: p.fullname || '', avatar: p.avatar || '' } : null;
  }

  function slimActivity(e) {
    const [label, kind] = ACTIVITY_TYPES[e.useCase] || [e.useCase || e.eventType || '?', 'other'];
    const actor = slimPerson(e.data?.actor);
    // Sự kiện tự làm (vào, rời) không có `user`: người liên quan chính là actor
    const user = slimPerson(e.data?.user) || actor;
    return {
      id: e.id,
      time: e.eventTime || null,
      useCase: e.useCase || '',
      label,
      kind,
      user,
      actor: actor && user && actor.id !== user.id ? actor : null,
      groupName: e.data?.group?.name || '',
      change: e.data?.changes ? `${e.data.changes.old ?? ''} → ${e.data.changes.new ?? ''}` : '',
    };
  }

  // Đếm người vào / rời trong `hours` giờ gần nhất từ các sự kiện đã tải
  function activitySummary(items, hours, now = Date.now()) {
    const since = now - hours * 3600e3;
    let joined = 0;
    let left = 0;
    for (const a of items || []) {
      if (!a.time || new Date(a.time).getTime() < since) continue;
      if (a.kind === 'in') joined++;
      if (a.kind === 'out') left++;
    }
    return { joined, left };
  }

  // ---------- Bài viết ----------

  const TEXT_MAX = 4000;

  // Thu gọn bài từ API (timeline, danh sách hoặc chi tiết bài chờ duyệt).
  // Danh sách chờ duyệt chỉ có `title` = 500 ký tự đầu; chi tiết mới có `content` đầy đủ.
  function slimPost(p) {
    const a = p.actor || {};
    const m = p.media || {};
    const isArticle = p.type === 'ARTICLE';
    const body = String(p.content ?? (isArticle ? '' : p.title) ?? '');
    return {
      id: p.id,
      type: p.type || 'POST',
      title: isArticle ? p.title || '' : '',
      text: body.slice(0, TEXT_MAX),
      actor: { id: a.id || p.createdBy || '', username: a.username || '', fullname: a.fullname || '', avatar: a.avatar || '' },
      groups: (p.audience?.groups || []).map((g) => ({
        id: g.id,
        name: g.name || '',
        communityId: g.communityId || '',
        rootGroupId: g.rootGroupId || '',
        isCommunity: !!g.isCommunity,
        approval: g.approval?.status || null,
      })),
      media: { images: m.images?.length || 0, videos: m.videos?.length || 0, files: m.files?.length || 0 },
      link: p.linkPreview?.url || '',
      publishedAt: p.publishedAt || null,
      submittedAt: p.submittedAt || null,
      commentsCount: p.commentsCount ?? null,
      isHidden: !!p.isHidden,
      status: p.status || null,
      scheduledAt: p.scheduledAt || null,
      reactions: Object.values(p.reactionsCount || {}).reduce((s, n) => s + (Number(n) || 0), 0),
      // Bài bị hệ thống kiểm duyệt tự động gắn cờ: các danh mục vi phạm
      violations: (p.postScan?.dataViolation?.violatedCategories || []).map((c) => c?.name).filter(Boolean),
    };
  }

  // Chỉ nhận link web; ảnh phải https (trang Dashboard không tải ảnh http)
  const webUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const httpsUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

  // Bài hẹn giờ: thêm những gì cần để xem lại bài trước giờ đăng
  function slimScheduled(p) {
    const s = p.setting || {};
    const lp = p.linkPreview;
    return {
      ...slimPost(p),
      createdAt: p.createdAt || null,
      updatedAt: p.updatedAt || null,
      setting: { canComment: s.canComment !== false, canReact: s.canReact !== false, isImportant: !!s.isImportant, importantExpiredAt: s.importantExpiredAt || null },
      thumbs: (p.media?.images || []).map((x) => httpsUrl(x?.url)).filter(Boolean).slice(0, 4),
      linkPreview: lp?.url ? { url: webUrl(lp.url), title: lp.title || '', domain: lp.domain || '', image: httpsUrl(lp.image) } : null,
      tags: (p.tags || []).map((t) => t?.name).filter(Boolean),
      series: (p.series || []).map((x) => x?.title || x?.name).filter(Boolean),
      mentions: Object.values(p.mentions || {}).map((u) => u?.username).filter(Boolean),
    };
  }

  // ---------- Báo cáo vi phạm ----------

  const REPORT_STATUS = { CREATED: 'Chờ xử lý', IGNORED: 'Đã bỏ qua', HID: 'Đã ẩn' };
  const REPORT_TARGET = { POST: 'Bài viết', ARTICLE: 'Article', COMMENT: 'Bình luận' };

  // Một báo cáo nội dung (GET content/manage/communities/{groupId gốc}/content-reports)
  function slimReport(r) {
    const reasons = (r.reasonsCount || []).map((x) => ({
      type: x.reasonType || 'OTHERS',
      label: HIDE_REASONS[x.reasonType] || x.reasonType || 'Khác',
      total: x.total || 0,
      description: x.description || '',
    }));
    return {
      id: r.id,
      targetId: r.targetId,
      targetType: r.targetType || 'POST',
      content: String(r.content || '').slice(0, TEXT_MAX),
      actor: slimPerson(r.targetActor),
      reasons,
      total: reasons.reduce((s, x) => s + x.total, 0),
      status: r.status || 'CREATED',
      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || null,
      commentPostId: r.commentPostId || null,
    };
  }

  // Link tới nội dung bị báo cáo: bình luận thì mở bài chứa bình luận
  function reportUrl(r) {
    if (r.targetType === 'COMMENT') return r.commentPostId ? `${SITE}/posts/${r.commentPostId}` : '';
    return postUrl({ id: r.targetId, type: r.targetType });
  }

  // Link trong bài: http(s)://…, www.…, hoặc tên miền có đuôi phổ biến (t.me/…, bit.ly/…)
  const LINK_RE = /(?:https?:\/\/[^\s<>"'()\]]+|www\.[^\s<>"'()\]]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|vn|xyz|link|ly|gg|app|co|info|top|site|online|club|pro|biz|cc|to|tk|ml|ga|cf|live|bet|fun|win|vip|shop|store)\b(?:\/[^\s<>"'()\]]*)?)/gi;

  function cleanDomain(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split(/[/?#:]/)[0]
      .replace(/\.+$/, '');
  }

  function linkDomains(text) {
    const out = [];
    for (const m of String(text || '').matchAll(LINK_RE)) {
      const d = cleanDomain(m[0]);
      if (d && d.includes('.') && !out.includes(d)) out.push(d);
    }
    return out;
  }

  // ---------- Nhắc tên (@username) và xem trước link khi đăng bài ----------
  // Ký tự trong username giống trình soạn thảo web Beincom
  const MENTION_CHAR = '[\\w\\-.À-ÖØ-öø-ÿĀ-ňŊ-ſА-я々-〆぀-ゟ゠-ヿ㄰-㆏가-힣一-龥؀-ۿÀ-ỹ]';
  const MENTION_AT_END = new RegExp(`(^|\\s)@(${MENTION_CHAR}*)$`);
  const MENTION_ALL = new RegExp(`(^|\\s)@(${MENTION_CHAR}+)`, 'g');
  const MENTION_TAIL = /[.|?,!$%*)(#]+$/; // web bỏ dấu câu dính sau tên

  // Chữ trước con trỏ kết thúc bằng "@abc" (đầu dòng hoặc sau khoảng trắng) thì đang gõ nhắc tên
  function mentionQuery(before) {
    const m = MENTION_AT_END.exec(String(before || ''));
    return m ? { start: m.index + m[1].length, query: m[2] } : null;
  }

  // Người trong danh sách nhắc tên được (API trả snake_case)
  function slimMentionable(u) {
    return { id: u.id, username: u.username || '', fullname: u.fullname || '', avatar: u.avatar || '', isVerified: !!(u.is_verified ?? u.isVerified) };
  }

  // Dạng web lưu trong mentions của bài: { [username]: { id, avatar, name, fullname, isVerified } }
  function mentionEntry(u) {
    return { id: u.id, avatar: u.avatar || '', name: u.username, fullname: u.fullname || '', isVerified: !!u.isVerified };
  }

  // Chỉ giữ những người còn được nhắc trong nội dung (@username đứng đầu dòng hoặc sau khoảng trắng)
  function usedMentions(content, known) {
    const out = {};
    for (const m of String(content || '').matchAll(MENTION_ALL)) {
      const name = m[2].replace(MENTION_TAIL, '');
      if (known?.[name]) out[name] = known[name];
    }
    return out;
  }

  // Link cuối cùng trong bài (web xem trước link cuối); thêm https:// nếu thiếu
  function lastLink(text) {
    const all = [...String(text || '').matchAll(LINK_RE)].map((m) => m[0].replace(/[.,!?;:]+$/, ''));
    const url = all.at(-1);
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
  }

  // Thông tin xem trước link (GET group/url-metadata hoặc content/contents/{id}/link-preview)
  function slimLinkPreview(d) {
    if (!d?.url) return null;
    const str = (v) => (typeof v === 'string' ? v : '');
    return { url: d.url, domain: str(d.domain), title: str(d.title), image: httpsUrl(d.image), description: str(d.description).slice(0, 300) };
  }

  function domainIn(d, list) {
    return (list || []).some((x) => {
      const c = cleanDomain(x);
      return c && (d === c || d.endsWith('.' + c));
    });
  }

  // verdict: 'ok' (không vi phạm) · 'review' (cần xem) · 'bad' (vi phạm)
  function evaluatePost(post, rules = DEFAULT_POST_RULES) {
    const r = { ...DEFAULT_POST_RULES, ...rules };
    const reasons = [];
    const text = [post.title, post.text, post.link].filter(Boolean).join('\n');
    const hay = norm(text);
    const hits = r.bannedKeywords.filter((k) => norm(k) && hay.includes(norm(k)));
    if (hits.length) reasons.push({ level: 'bad', code: 'keyword', text: 'Chứa từ khoá cấm: ' + hits.join(', ') });

    const domains = linkDomains(text);
    const blocked = domains.filter((d) => domainIn(d, r.blockedDomains));
    if (blocked.length) reasons.push({ level: 'bad', code: 'blocked', domains: blocked, text: 'Có link bị cấm: ' + blocked.join(', ') });
    if (r.reviewExternalLinks) {
      const ext = domains.filter((d) => !blocked.includes(d) && !domainIn(d, r.allowedDomains));
      if (ext.length) reasons.push({ level: 'warn', code: 'external', text: 'Có link ngoài: ' + ext.join(', ') });
    }

    if (reasons.some((x) => x.level === 'bad')) return { verdict: 'bad', reasons };
    if (reasons.length) return { verdict: 'review', reasons };
    return { verdict: 'ok', reasons: [{ level: 'ok', text: 'Không vi phạm quy tắc' }] };
  }

  // ---------- Đăng bài ----------

  const POST_MAX = 3000; // Beincom giới hạn 3000 ký tự mỗi bài
  const MIN_SCHEDULE_MIN = 5; // hẹn giờ ít nhất 5 phút sau

  const DEFAULT_POST_SETTING = { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null };

  // ---------- Ảnh, video, tệp đính kèm (giới hạn giống web Beincom) ----------
  const MB = 1024 * 1024;
  const MEDIA = {
    image: {
      label: 'ảnh',
      max: 10,
      size: 25 * MB,
      types: ['image/bmp', 'image/x-ms-bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/heic', 'image/heif', 'image/heif-sequence', 'image/heic-sequence', 'image/avif', 'image/avif-sequence', 'image/webp'],
    },
    video: { label: 'video', max: 1, size: 300 * MB, prefix: 'video/' },
    file: { label: 'tệp', max: 25, size: 5 * MB, exts: ['pdf', 'doc', 'docx', 'htm', 'html', 'odt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'txt', 'zip', 'csv'] },
  };
  const MEDIA_FIELD = { image: 'images', video: 'videos', file: 'files' };

  function sizeText(n) {
    return n < MB ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  }

  // Lọc file vừa chọn: đúng loại, không quá dung lượng, không quá số lượng. current = { image: số đã có, ... }.
  // Một bài chỉ đính kèm một loại (ảnh, video hoặc tệp), giống web.
  function pickMedia(kind, files, current = {}) {
    const rule = MEDIA[kind];
    const other = Object.keys(MEDIA).find((k) => k !== kind && current[k] > 0);
    if (other) return { accepted: [], errors: [`Bài đang có ${MEDIA[other].label}: mỗi bài chỉ đính kèm một loại (ảnh, video hoặc tệp)`] };
    const accepted = [];
    const errors = [];
    let count = current[kind] || 0;
    for (const f of files) {
      const ext = String(f.name || '').split('.').pop().toLowerCase();
      const type = String(f.type || '');
      const okType = rule.types ? rule.types.includes(type) : rule.prefix ? type.startsWith(rule.prefix) : rule.exts.includes(ext);
      if (!okType) errors.push(`${f.name}: Beincom không nhận loại ${rule.label} này`);
      else if (f.size > rule.size) errors.push(`${f.name}: ${sizeText(f.size)}, tối đa ${sizeText(rule.size)}`);
      else if (count >= rule.max) {
        errors.push(`Tối đa ${rule.max} ${rule.label} mỗi bài`);
        break;
      } else {
        accepted.push(f);
        count += 1;
      }
    }
    return { accepted, errors };
  }

  // "3 ảnh" / "1 video" / "2 tệp" / ''
  function mediaSummary(media) {
    return Object.entries(MEDIA_FIELD)
      .map(([k, f]) => (media?.[f]?.length ? `${media[f].length} ${MEDIA[k].label}` : ''))
      .filter(Boolean)
      .join(', ');
  }

  const camelKey = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // Đối tượng đính kèm gửi trong media của bài, giống web dựng sau khi tải lên:
  //  - ảnh:  { url, id, ...properties }
  //  - video: { id, url, ...properties, status: 'waiting_process', thumbnails }
  //  - tệp:  { id, url, ...properties } (web đổi khoá sang camelCase)
  function mediaItem(kind, id, d = {}) {
    if (kind === 'image') return { url: d.url, id, ...(d.properties || {}) };
    if (kind === 'video') return { id, url: d.url, ...(d.properties || {}), status: 'waiting_process', thumbnails: d.thumbnails };
    const props = Object.fromEntries(Object.entries(d.properties || {}).map(([k, v]) => [camelKey(k), v]));
    return { id: d.id || id, url: d.origin_url || d.originUrl || d.url || '', ...props };
  }

  // ---------- Tag và series (giới hạn như web: 5 tag, 3 series mỗi bài) ----------
  const TAG_MAX = 5;
  const SERIES_MAX = 3;

  // GET content/tags?groupIds[]=… : tag của community (theo group gốc)
  function slimTag(t) {
    return { id: t.id, name: t.name || '', totalUsed: t.totalUsed ?? null };
  }

  // GET content/series?groupIds[]=… : series có các group đó trong phạm vi
  function slimSeries(x) {
    return { id: x.id, title: x.title || '', cover: httpsUrl(x.coverMedia?.url), summary: String(x.summary || '').slice(0, 160) };
  }

  // Câu báo khi Beincom trả tag_series_invalid: meta.errors = { seriesIds, tagIds }
  function tagSeriesError(body, tags = [], series = []) {
    const e = body?.meta?.errors || {};
    const names = (list, ids, f) => (ids || []).map((id) => list.find((x) => x.id === id)?.[f] || id);
    const parts = [];
    const s = names(series, e.seriesIds, 'title');
    const t = names(tags, e.tagIds || e.tagsIds, 'name');
    if (s.length) parts.push('series ' + s.join(', '));
    if (t.length) parts.push('tag ' + t.join(', '));
    return `${parts.length ? parts.join('; ') : 'Tag / series'} không dùng được với các group đã chọn — bỏ ra rồi đăng lại`;
  }

  // Hạn "Quan trọng" giống web Beincom, tính từ lúc bài được đăng
  const IMPORTANT_FOR = {
    never: 'Không hết hạn',
    '1d': '1 ngày',
    '3d': '3 ngày',
    '1w': '1 tuần',
    '2w': '2 tuần',
    '1m': '1 tháng',
    '3m': '3 tháng',
    '6m': '6 tháng',
    '1y': '1 năm',
    custom: 'Tự chọn ngày giờ',
  };

  // Ngày hết "Quan trọng" (ISO) theo hạn đã chọn; null = không hết hạn; tự chọn thì do người dùng nhập
  function importantUntil(preset, base) {
    if (preset === 'never') return null;
    const d = new Date(base);
    const days = { '1d': 1, '3d': 3, '1w': 7, '2w': 14 }[preset];
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[preset];
    if (days) d.setDate(d.getDate() + days);
    else if (months) {
      // 31/01 + 1 tháng = 28 hoặc 29/02, không nhảy sang tháng 3
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + months);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else return undefined;
    return d.toISOString();
  }

  // ---------- Bài đăng định kỳ ----------
  // Đặt trước nhiều bài hẹn giờ cách đều nhau (tới giờ Beincom tự đăng, không cần mở máy)
  const RECUR_EVERY = { day: 'Hằng ngày', week: 'Hằng tuần', '2w': '2 tuần một lần', month: 'Hằng tháng' };
  const RECUR_MIN = 2;
  const RECUR_MAX = 30;

  // Giờ đăng của từng bài trong chuỗi (giữ nguyên giờ trong ngày; 31/01 hằng tháng -> 28 hoặc 29/02, 31/03…)
  function recurTimes(start, every, count) {
    const t0 = new Date(start);
    if (!Number.isFinite(t0.getTime()) || !RECUR_EVERY[every]) return [];
    const n = Math.max(1, Math.min(RECUR_MAX, Math.floor(Number(count)) || 1));
    const out = [];
    for (let k = 0; k < n; k++) {
      const d = new Date(t0);
      if (every === 'month') {
        d.setDate(1);
        d.setMonth(t0.getMonth() + k);
        d.setDate(Math.min(t0.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      } else d.setDate(t0.getDate() + k * { day: 1, week: 7, '2w': 14 }[every]);
      out.push(d.toISOString());
    }
    return out;
  }

  // Cài đặt của từng bài: hạn "Quan trọng" tính lại theo giờ đăng của bài đó
  // (chọn sẵn "1 tuần"… thì tính từ giờ đăng; tự chọn ngày giờ thì dời theo khoảng cách tới bài đầu)
  function recurSetting(setting, preset, firstAt, at) {
    if (!setting?.isImportant || !setting.importantExpiredAt) return { ...setting };
    const expiredAt = preset && preset !== 'custom' ? importantUntil(preset, at) : new Date(new Date(setting.importantExpiredAt).getTime() + (new Date(at) - new Date(firstAt))).toISOString();
    return { ...setting, importantExpiredAt: expiredAt };
  }

  // Bài thuộc chuỗi nào: contentId -> { id, k (thứ tự, từ 1), n, every }
  function recurIndex(recurring) {
    const map = new Map();
    for (const r of recurring || []) (r.items || []).forEach((it, i) => map.set(it.contentId, { id: r.id, k: i + 1, n: r.count || r.items.length, every: r.every }));
    return map;
  }

  // Bỏ chuỗi đã đăng hết từ hơn 7 ngày trước; giữ tối đa 50 chuỗi
  function pruneRecurring(recurring, now = Date.now()) {
    return (recurring || [])
      .filter((r) => (r.items || []).some((it) => new Date(it.scheduledAt).getTime() > now - 7 * 864e5))
      .slice(0, 50);
  }

  // ---------- Sao lưu & khôi phục cài đặt ----------
  const BACKUP_FORMAT = 1;
  const BACKUP_KEYS = ['settings', 'rules', 'postRules', 'groupRules', 'templates'];

  function makeBackup(store, { profiles = false, version = '', now = Date.now() } = {}) {
    const data = {};
    for (const k of BACKUP_KEYS) if (store?.[k] !== undefined) data[k] = store[k];
    if (profiles && store?.profiles) data.profiles = store.profiles;
    return { app: 'BeinGroup', format: BACKUP_FORMAT, version, exportedAt: new Date(now).toISOString(), data };
  }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const strList = (v, max = 500) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, max) : []);
  const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Chỉ giữ khoá có trong bản mặc định, đúng kiểu
  function cleanLike(defaults, obj) {
    const out = {};
    if (!isObj(obj)) return out;
    for (const [k, def] of Object.entries(defaults)) {
      const v = obj[k];
      if (v === undefined) continue;
      if (Array.isArray(def)) {
        if (Array.isArray(v)) out[k] = strList(v);
      } else if (typeof def === 'number') {
        if (Number.isFinite(Number(v)) && v !== null && v !== '') out[k] = Number(v);
      } else if (typeof v === typeof def) out[k] = v;
    }
    return out;
  }

  function cleanRules(v) {
    const r = cleanLike(DEFAULT_RULES, v);
    if (r.minAnswerLength !== undefined) r.minAnswerLength = clampNum(Math.round(r.minAnswerLength), 0, 200);
    return r;
  }

  const cleanRefs = (v, label) => (Array.isArray(v) ? v.filter((x) => isObj(x) && typeof x.id === 'string' && typeof x[label] === 'string').map((x) => ({ ...x })).slice(0, 10) : []);

  // Đọc và làm sạch tệp sao lưu (ném lỗi có câu tiếng Việt khi tệp không dùng được)
  function readBackup(obj) {
    if (!isObj(obj) || obj.app !== 'BeinGroup' || !isObj(obj.data)) throw new Error('Không phải tệp sao lưu của BeinGroup');
    if (Number(obj.format) > BACKUP_FORMAT) throw new Error('Tệp sao lưu từ phiên bản BeinGroup mới hơn — hãy cập nhật addon trước');
    const d = obj.data;
    const data = {};
    if (isObj(d.settings)) {
      const s = cleanLike(DEFAULT_SETTINGS, d.settings);
      if (s.intervalMin !== undefined) s.intervalMin = clampNum(Math.round(s.intervalMin), 5, 1440);
      if (s.actionDelaySec !== undefined) s.actionDelaySec = clampNum(s.actionDelaySec, 0, 60);
      if (s.unansweredHours !== undefined) s.unansweredHours = clampNum(Math.round(s.unansweredHours), 1, 72);
      data.settings = s;
    }
    if (isObj(d.rules)) data.rules = cleanRules(d.rules);
    if (isObj(d.postRules)) data.postRules = cleanLike(DEFAULT_POST_RULES, d.postRules);
    if (isObj(d.groupRules)) {
      data.groupRules = Object.fromEntries(
        Object.entries(d.groupRules)
          .filter(([id, v]) => /^[\w-]{1,64}$/.test(id) && isObj(v))
          .slice(0, 500)
          .map(([id, v]) => [id, { name: String(v.name || '').slice(0, 200), rules: { ...DEFAULT_RULES, ...cleanRules(v.rules) }, postRules: { ...DEFAULT_POST_RULES, ...cleanLike(DEFAULT_POST_RULES, v.postRules) } }]),
      );
    }
    if (Array.isArray(d.templates)) {
      data.templates = d.templates
        .filter((t) => isObj(t) && typeof t.name === 'string' && typeof t.text === 'string')
        .slice(0, 200)
        .map((t, i) => ({
          id: typeof t.id === 'string' && t.id ? t.id.slice(0, 64) : 'tpl' + i,
          name: t.name.slice(0, 100),
          text: t.text.slice(0, 20000),
          groupIds: strList(t.groupIds, 200),
          canComment: t.canComment !== false,
          canReact: t.canReact !== false,
          mentions: isObj(t.mentions) ? Object.fromEntries(Object.entries(t.mentions).filter(([, m]) => isObj(m) && typeof m.id === 'string')) : {},
          tags: cleanRefs(t.tags, 'name'),
          series: cleanRefs(t.series, 'title'),
        }));
    }
    if (isObj(d.profiles) && isObj(d.profiles.users)) {
      const users = {};
      for (const [id, p] of Object.entries(d.profiles.users)) {
        if (!isObj(p) || !isObj(p.user) || typeof p.user.id !== 'string' || !Array.isArray(p.events)) continue;
        users[id] = { ...p, events: p.events.filter((e) => isObj(e) && typeof e.key === 'string' && VIOLATION_TYPES[e.type]) };
      }
      data.profiles = { users };
    }
    if (!Object.keys(data).length) throw new Error('Tệp sao lưu không có dữ liệu');
    return { data, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null, version: typeof obj.version === 'string' ? obj.version : '' };
  }

  // Các mục có trong bản sao lưu (để hỏi lại trước khi khôi phục)
  function backupSummary(d) {
    const out = [];
    if (d.settings) out.push('Cài đặt chung' + (d.settings.dryRun === false ? ' (Chạy thử: TẮT)' : d.settings.dryRun ? ' (Chạy thử: bật)' : ''));
    if (d.rules) out.push('Quy tắc lọc thành viên');
    if (d.postRules) out.push('Quy tắc bài viết');
    if (d.groupRules) out.push(`Quy tắc riêng: ${Object.keys(d.groupRules).length} group`);
    if (d.templates) out.push(`Mẫu bài: ${d.templates.length}`);
    if (d.profiles) out.push(`Hồ sơ vi phạm: ${Object.keys(d.profiles.users).length} người (gộp với hồ sơ đang có)`);
    return out;
  }

  // Gộp hồ sơ vi phạm từ bản sao lưu vào hồ sơ đang có (bỏ trùng như khi quét)
  function mergeProfiles(cur, incoming) {
    const events = [];
    for (const p of Object.values(incoming?.users || {})) for (const e of p.events || []) events.push({ ...e, user: p.user });
    return addViolations(cur, events).store;
  }

  // ---------- Bình luận ----------
  // GET content/comments?postId=…&limit=… -> { list, meta }: bình luận gốc (parentId = COMMENT_ROOT), mới nhất trước.
  // Danh sách không kèm trả lời (gọi thật 09/10/2026); trả lời đọc riêng bằng thêm parentId. `child.list` vẫn đọc nếu có.
  const COMMENT_ROOT = '00000000-0000-0000-0000-000000000000';
  const COMMENT_MAX = 300; // số bình luận giữ lại để xem / chấm

  // post: bài chứa bình luận (đã thu gọn, có seenIn) để biết bình luận thuộc group nào
  function slimComment(c, post = {}) {
    const a = c.actor || {};
    return {
      id: c.id,
      postId: c.postId || post.id || '',
      postType: post.type || 'POST',
      postSnippet: String(post.title || post.text || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      parentId: c.parentId && c.parentId !== COMMENT_ROOT ? c.parentId : '',
      title: '',
      text: String(c.content ?? '').slice(0, TEXT_MAX),
      link: '',
      actor: { id: a.id || '', username: a.username || '', fullname: a.fullname || '', avatar: a.avatar || '' },
      createdAt: c.createdAt || null,
      images: c.media?.images?.length || 0,
      giphy: !!(c.giphyUrl || c.giphyId),
      totalReply: c.totalReply || 0,
      groups: (post.groups || []).map((g) => ({ id: g.id, name: g.name || '', communityId: g.communityId || '', rootGroupId: g.rootGroupId || '', isCommunity: !!g.isCommunity })),
      seenIn: post.seenIn || [],
      isHidden: !!c.isHidden,
    };
  }

  // Bình luận gốc và các trả lời đi kèm trong một trang
  function flattenComments(list, post) {
    const out = [];
    for (const c of list || []) {
      if (!c?.id) continue;
      out.push(slimComment(c, post));
      for (const r of c.child?.list || []) if (r?.id) out.push(slimComment({ ...r, parentId: r.parentId && r.parentId !== COMMENT_ROOT ? r.parentId : c.id }, post));
    }
    return out;
  }

  // Bài cần đọc bình luận: số bình luận lớn hơn lúc đọc lần trước (seen: { postId: số đã đọc }), bài mới đăng trước
  function commentTargets(seen, posts, max) {
    return (posts || [])
      .filter((p) => !p.isHidden && (p.commentsCount || 0) > (seen?.[p.id] || 0))
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
      .slice(0, max);
  }

  // Bình luận gốc cần đọc trả lời: số trả lời lớn hơn lần trước (prev: danh sách bình luận đã lưu), mới nhất trước
  function replyTargets(comments, prev, max) {
    const old = new Map((prev || []).map((c) => [c.id, c.totalReply || 0]));
    return (comments || [])
      .filter((c) => !c.parentId && !c.isHidden && (c.totalReply || 0) > (old.get(c.id) || 0))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, max);
  }

  // Gộp bình luận vừa đọc: giữ đánh dấu bỏ qua / đã ẩn, mới nhất trước. fresh = id chưa từng thấy
  function mergeComments(prev, comments, now = Date.now()) {
    const map = new Map((prev || []).map((c) => [c.id, c]));
    const fresh = [];
    for (const c of comments || []) {
      const old = map.get(c.id);
      if (!old) fresh.push(c.id);
      map.set(c.id, { ...c, firstSeen: old?.firstSeen ?? now, dismissed: !!old?.dismissed, isHidden: c.isHidden || !!old?.isHidden });
    }
    const list = [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, COMMENT_MAX);
    return { list, fresh };
  }

  // Bình luận vi phạm quy tắc -> sự kiện cho hồ sơ vi phạm
  function violationsFromComments(comments, reasonOf = () => '') {
    return (comments || [])
      .filter((c) => c.actor?.id)
      .map((c) => ({ user: c.actor, type: 'rule', key: 'rule:c:' + c.id, time: c.createdAt, group: c.groups?.[0]?.name || '', snippet: c.text, reason: reasonOf(c) }));
  }

  // ---------- Báo cáo tuần ----------
  // Tổng hợp những gì đã xảy ra trong `days` ngày gần nhất từ dữ liệu addon đang giữ:
  // nhật ký thao tác (log), số thành viên mỗi ngày (memberHistory), hồ sơ vi phạm, bài / bình luận vi phạm đã phát hiện.
  function weeklyReport({ log = [], profiles = null, recentPosts = [], recentComments = [], memberHistory = {}, groups = [], ctx = {} } = {}, { days = 7, now = Date.now() } = {}) {
    const from = now - days * 864e5;
    const inRange = (t) => {
      const v = typeof t === 'number' ? t : Date.parse(t);
      return Number.isFinite(v) && v >= from && v <= now;
    };
    const fromDay = vnDay(from);
    const toDay = vnDay(now);

    // Thành viên: số đầu kỳ (ngày gần nhất trước hoặc bằng đầu kỳ, không có thì ngày đầu tiên trong kỳ) và số mới nhất
    const members = [];
    for (const g of groups) {
      const hist = (memberHistory[g.id] || []).filter((x) => x.day <= toDay).sort((a, b) => a.day.localeCompare(b.day));
      if (!hist.length) continue;
      const before = hist.filter((x) => x.day <= fromDay).at(-1) || hist.find((x) => x.day > fromDay);
      const last = hist.at(-1);
      const end = g.userCount ?? last.count;
      members.push({ id: g.id, name: g.name, start: before.count, end, change: end - before.count, since: before.day });
    }

    const a = { approved: 0, autoApproved: 0, declined: 0, autoDeclined: 0, removed: 0, banned: 0, unbanned: 0, postsApproved: 0, postsRejected: 0, postsHidden: 0, postsDeleted: 0, commentsHidden: 0, reportsHandled: 0, published: 0, scheduled: 0, groupSettings: 0, errors: 0 };
    for (const e of log || []) {
      if (!inRange(e.time)) continue;
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

    const isBad = (x) => inRange(x.firstSeen ?? x.publishedAt ?? x.createdAt) && evaluatePostIn(x, ctx).verdict === 'bad';
    const detected = { posts: (recentPosts || []).filter(isBad).length, comments: (recentComments || []).filter(isBad).length };

    // Người có nhiều sự kiện vi phạm nhất trong kỳ
    const violators = Object.values(profiles?.users || {})
      .map((p) => {
        const evs = (p.events || []).filter((e) => inRange(e.time));
        return { user: p.user, count: evs.length, types: [...new Set(evs.map((e) => VIOLATION_TYPES[e.type]?.label || e.type))] };
      })
      .filter((x) => x.count)
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    return { from, to: now, days, fromDay, toDay, members, actions: a, detected, violators };
  }

  const viNum = (n) => Number(n || 0).toLocaleString('vi-VN');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + viNum(Math.abs(n));
  const dm = (day) => day.slice(8, 10) + '/' + day.slice(5, 7);

  // Bản chữ để sao chép / gửi cho các admin khác. Dòng nào toàn số 0 thì bỏ.
  function reportText(r) {
    const a = r.actions;
    const lines = [`BeinGroup: tóm tắt ${r.days} ngày (${dm(r.fromDay)} → ${dm(r.toDay)}/${r.toDay.slice(0, 4)})`];
    const add = (label, parts) => {
      const shown = parts.filter(([n]) => n);
      if (shown.length) lines.push(`• ${label}: ${shown.map(([n, t]) => `${viNum(n)} ${t}`).join(' · ')}`);
    };
    if (r.members.length) {
      const changed = r.members.filter((m) => m.change).sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
      const same = r.members.length - changed.length;
      const parts = changed.map((m) => `${m.name} ${signed(m.change)} (${viNum(m.end)})`);
      if (same) parts.push(changed.length ? `${same} group không đổi` : 'không group nào thay đổi');
      lines.push('• Thành viên: ' + parts.join(' · '));
    }
    add('Duyệt thành viên', [[a.approved + a.autoApproved, 'duyệt' + (a.autoApproved ? ` (${viNum(a.autoApproved)} tự động)` : '')], [a.declined + a.autoDeclined, 'từ chối' + (a.autoDeclined ? ` (${viNum(a.autoDeclined)} tự động)` : '')]]);
    add('Quản lý thành viên', [[a.removed, 'xoá'], [a.banned, 'cấm'], [a.unbanned, 'gỡ cấm']]);
    add('Kiểm duyệt bài', [[a.postsApproved, 'duyệt'], [a.postsRejected, 'từ chối'], [a.postsHidden, 'ẩn'], [a.postsDeleted, 'xoá']]);
    add('Bình luận', [[a.commentsHidden, 'ẩn']]);
    add('Báo cáo vi phạm', [[a.reportsHandled, 'đã xử lý']]);
    add('Phát hiện vi phạm quy tắc', [[r.detected.posts, 'bài'], [r.detected.comments, 'bình luận']]);
    add('Đăng bài qua addon', [[a.published, 'đăng'], [a.scheduled, 'hẹn giờ']]);
    add('Cài đặt group', [[a.groupSettings, 'lần đổi']]);
    if (r.violators.length) lines.push('• Vi phạm nhiều nhất: ' + r.violators.map((v) => `${v.user.fullname || v.user.username || '?'}${v.user.username ? ' (@' + v.user.username + ')' : ''} ${v.count} lần`).join(', '));
    add('Thao tác lỗi', [[a.errors, 'lần']]);
    if (lines.length === 1) lines.push('• Không có hoạt động nào được ghi lại.');
    return lines.join('\n');
  }

  // Có cần thông báo tóm tắt tuần không: sáng thứ Hai (giờ VN, từ 8 giờ), mỗi tuần một lần. lastKey = ngày thứ Hai đã báo
  function weeklyDue(lastKey, now = Date.now()) {
    const vn = new Date(now + 7 * 3600e3);
    if (vn.getUTCDay() !== 1 || vn.getUTCHours() < 8) return null;
    const key = vnDay(now);
    return key === lastKey ? null : key;
  }

  // ---------- Spam: tự ẩn và phát hiện đợt spam ----------

  // Tên miền cấm có trong bài / bình luận (theo quy tắc của group). Rỗng = không tự ẩn.
  function blockedHits(x, ctx = {}) {
    const ev = evaluatePostIn(x, ctx);
    return [...new Set(ev.reasons.filter((r) => r.code === 'blocked').flatMap((r) => r.domains || []))];
  }

  // Khoá của một link để gom: tên miền (bỏ www) + đường dẫn, bỏ phần ?query và # và dấu / cuối
  function linkKeys(text) {
    const out = [];
    for (const m of String(text || '').matchAll(LINK_RE)) {
      const raw = m[0].trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
      const host = raw.split(/[/?#:]/)[0].replace(/\.+$/, '');
      if (!host.includes('.')) continue;
      const path = (raw.slice(host.length).split(/[?#]/)[0] || '').replace(/[.,!)]+$/, '').replace(/\/+$/, '');
      const key = host + path;
      if (!out.some((k) => k.key === key)) out.push({ key, host });
    }
    return out;
  }

  const WAVE_WINDOW_MS = 6 * 3600e3;
  const WAVE_MIN_ACCOUNTS = 3;
  const WAVE_TEXT_MIN = 25; // nội dung ngắn hơn (vd "cảm ơn admin") không tính là spam giống nhau

  // Đợt spam: cùng một link (hoặc cùng nội dung) từ ít nhất `minAccounts` tài khoản khác nhau trong `windowMs` gần nhất.
  // items: [{ id, kind: 'post' | 'comment', actor, text, time, isHidden }]; allowed: tên miền bỏ qua (vd beincom.com)
  function spamWaves(items, { now = Date.now(), windowMs = WAVE_WINDOW_MS, minAccounts = WAVE_MIN_ACCOUNTS, allowed = ['beincom.com'], skipActorIds = [] } = {}) {
    const skip = new Set(skipActorIds);
    const recent = (items || []).filter((x) => x?.actor?.id && !skip.has(x.actor.id) && Date.parse(x.time) >= now - windowMs && Date.parse(x.time) <= now + 60e3);
    const groups = new Map();
    const add = (key, type, label, host, x) => {
      if (!groups.has(key)) groups.set(key, { key, type, label, host, items: [] });
      groups.get(key).items.push(x);
    };
    for (const x of recent) {
      for (const l of linkKeys(x.text)) if (!domainIn(l.host, allowed)) add('link:' + l.key, 'link', l.key, l.host, x);
      const t = norm(x.text).replace(/\s+/g, ' ').trim();
      if (t.length >= WAVE_TEXT_MIN) add('text:' + t.slice(0, 200), 'text', String(x.text).replace(/\s+/g, ' ').trim().slice(0, 100), '', x);
    }
    const waves = [];
    for (const g of groups.values()) {
      const byId = new Map(g.items.map((x) => [x.kind + ':' + x.id, x]));
      const list = [...byId.values()];
      const accounts = [...new Map(list.map((x) => [x.actor.id, x.actor])).values()];
      if (accounts.length < minAccounts) continue;
      const times = list.map((x) => Date.parse(x.time)).sort((a, b) => a - b);
      waves.push({
        key: g.key,
        type: g.type,
        label: g.label,
        host: g.host,
        accounts,
        items: list.map((x) => ({ id: x.id, kind: x.kind, isHidden: !!x.isHidden })),
        first: new Date(times[0]).toISOString(),
        last: new Date(times.at(-1)).toISOString(),
      });
    }
    // Đợt theo nội dung mà mọi mục đã nằm trong một đợt theo link thì bỏ (tránh báo hai lần)
    const linkSets = waves.filter((w) => w.type === 'link').map((w) => new Set(w.items.map((i) => i.kind + ':' + i.id)));
    return waves
      .filter((w) => w.type === 'link' || !linkSets.some((s) => w.items.every((i) => s.has(i.kind + ':' + i.id))))
      .sort((a, b) => b.items.length - a.items.length || b.accounts.length - a.accounts.length);
  }

  // Bài + bình luận đang giữ -> dạng chung cho spamWaves
  function waveItems(recentPosts, recentComments) {
    return [
      ...(recentPosts || []).map((p) => ({ id: p.id, kind: 'post', actor: p.actor, text: [p.title, p.text, p.link].filter(Boolean).join('\n'), time: p.publishedAt || p.submittedAt, isHidden: p.isHidden })),
      ...(recentComments || []).map((c) => ({ id: c.id, kind: 'comment', actor: c.actor, text: c.text, time: c.createdAt, isHidden: c.isHidden })),
    ];
  }

  // Community có thể cấm thành viên (mình là chủ / admin community): mỗi community một group gốc
  function banTargets(groups) {
    const seen = new Set();
    return (groups || []).filter((g) => g.isCommunity && g.canBan && g.communityId && !seen.has(g.communityId) && seen.add(g.communityId));
  }

  // ---------- Viết bình luận / trả lời ----------
  // POST content/comments { postId, content, media, giphy, mentions } hoặc POST content/comments/{id}/reply (cùng body).
  // mentions trong bình luận (gọi thật 09/10/2026): { username: { id, fullname, username, avatar } }, nội dung ghi @username.
  const COMMENT_TEXT_MAX = 3000;

  function validateComment(content) {
    const t = String(content || '').trim();
    if (!t) return 'Bình luận chưa có nội dung';
    if (t.length > COMMENT_TEXT_MAX) return `Bình luận dài ${t.length} ký tự, tối đa ${COMMENT_TEXT_MAX}`;
    return '';
  }

  // people: [{ id, username, fullname, avatar }] -> mentions của những người còn được @ trong nội dung
  function commentMentions(content, people) {
    const known = {};
    for (const u of people || []) if (u?.id && u.username) known[u.username] = { id: u.id, fullname: u.fullname || '', username: u.username, avatar: u.avatar || '' };
    return usedMentions(content, known);
  }

  // Trả lời một bình luận: trả lời của trả lời thì gửi vào bình luận gốc (như web), nhắc tên người viết
  function replyTarget(c) {
    return { commentId: c.parentId || c.id, prefill: c.actor?.username ? `@${c.actor.username} ` : '' };
  }

  // Bài chưa ai trả lời: đăng đã hơn `minHours` giờ (và chưa quá `maxDays` ngày), chưa có bình luận, không phải bài của mình
  function isUnanswered(p, { now = Date.now(), minHours = 3, maxDays = 7, meId = '' } = {}) {
    const t = Date.parse(p.publishedAt);
    if (!Number.isFinite(t) || p.isHidden || (p.commentsCount || 0) > 0) return false;
    if (meId && p.actor?.id === meId) return false;
    return now - t >= minHours * 3600e3 && now - t <= maxDays * 864e5;
  }

  // ---------- Chào thành viên mới ----------
  const WELCOME_MAX_MENTIONS = 50;
  const DEFAULT_WELCOME = 'Chào mừng {so_nguoi} thành viên mới của {group} 👋\n\n{danh_sach}\n\nCả nhà đọc nội quy ở bài ghim và để lại vài dòng giới thiệu về mình nhé!';

  // Người mới từ nhật ký hoạt động (slimActivity): sự kiện "vào" từ `since`, bỏ người đã rời sau khi vào
  function newMembersFromActivity(items, since) {
    const out = new Map();
    const left = new Map();
    for (const a of items || []) {
      const t = Date.parse(a.time);
      if (!a.user?.id || !Number.isFinite(t) || t < since) continue;
      if (a.kind === 'out') left.set(a.user.id, Math.max(left.get(a.user.id) || 0, t));
      if (a.kind === 'in' && !out.has(a.user.id)) out.set(a.user.id, { ...a.user, joinedAt: a.time });
    }
    return [...out.values()].filter((u) => !(left.get(u.id) > Date.parse(u.joinedAt))).sort((x, y) => String(y.joinedAt).localeCompare(String(x.joinedAt)));
  }

  // Bài chào: thay {so_nguoi}, {group}, {danh_sach} (@username cách nhau dấu phẩy, tối đa 50 người được nhắc)
  function welcomeText(template, { users = [], groupName = '' } = {}) {
    const named = (users || []).filter((u) => u?.id && u.username);
    const shown = named.slice(0, WELCOME_MAX_MENTIONS);
    const more = named.length - shown.length;
    const list = shown.map((u) => '@' + u.username).join(', ') + (more > 0 ? ` và ${more} bạn khác` : '');
    const text = String(template || DEFAULT_WELCOME)
      .replace(/\{so_nguoi\}/g, String(named.length))
      .replace(/\{group\}/g, groupName)
      .replace(/\{danh_sach\}/g, list);
    const mentions = Object.fromEntries(shown.map((u) => [u.username, mentionEntry(u)]));
    return { text, mentions };
  }

  // ---------- Theo dõi từ khoá ----------
  // Từ khoá cần để ý có trong nội dung (không phân biệt hoa thường và dấu, như từ khoá cấm)
  function watchHits(text, keywords) {
    const hay = norm(text);
    return [...new Set((keywords || []).filter((k) => norm(k) && hay.includes(norm(k))))];
  }

  // ---------- Vinh danh thành viên tích cực ----------
  // Điểm = 5 × số bài + 1 × số bình luận đã viết + 0,5 × cảm xúc bài nhận được (làm tròn). Bỏ tài khoản của mình.
  const DEFAULT_SHOUTOUT = 'Cảm ơn những thành viên tích cực nhất của {group} tuần qua 🏆\n\n{danh_sach}\n\nCảm ơn mọi người đã chia sẻ và góp ý, tuần này tiếp tục nhé!';
  const SHOUTOUT_MEDALS = ['🥇', '🥈', '🥉'];

  // posts: bài trong khoảng (slimPost, có reactions / commentsCount); comments: bình luận addon đã đọc (slimComment)
  function topMembers({ posts = [], comments = [], since = 0, skipIds = [], limit = 10 } = {}) {
    const skip = new Set(skipIds.filter(Boolean));
    const by = new Map();
    const row = (u) => {
      if (!u?.id || skip.has(u.id)) return null;
      if (!by.has(u.id)) by.set(u.id, { user: { id: u.id, username: u.username || '', fullname: u.fullname || '', avatar: u.avatar || '' }, posts: 0, comments: 0, reactions: 0, replies: 0 });
      return by.get(u.id);
    };
    for (const p of posts) {
      if (Date.parse(p.publishedAt) < since) continue;
      const r = row(p.actor);
      if (!r) continue;
      r.posts++;
      r.reactions += p.reactions || 0;
      r.replies += p.commentsCount || 0;
    }
    for (const c of comments) {
      if (Date.parse(c.createdAt) < since) continue;
      const r = row(c.actor);
      if (r) r.comments++;
    }
    return [...by.values()]
      .map((r) => ({ ...r, score: Math.round(r.posts * 5 + r.comments + r.reactions * 0.5) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.posts - a.posts || b.comments - a.comments)
      .slice(0, limit);
  }

  // Bài vinh danh: {danh_sach} = mỗi người một dòng (huy chương cho 3 người đầu), {so_nguoi}, {group}
  function shoutoutText(template, { rows = [], groupName = '' } = {}) {
    const named = rows.filter((r) => r.user?.id && r.user.username);
    const lines = named.map((r, i) => {
      const parts = [r.posts && `${r.posts} bài`, r.comments && `${r.comments} bình luận`].filter(Boolean).join(', ');
      return `${SHOUTOUT_MEDALS[i] || i + 1 + '.'} @${r.user.username}${parts ? ' — ' + parts : ''}`;
    });
    const text = String(template || DEFAULT_SHOUTOUT)
      .replace(/\{so_nguoi\}/g, String(named.length))
      .replace(/\{group\}/g, groupName)
      .replace(/\{danh_sach\}/g, lines.join('\n'));
    return { text, mentions: Object.fromEntries(named.map((r) => [r.user.username, mentionEntry(r.user)])) };
  }

  const CONTENT_STATUS = {
    DRAFT: 'Bản nháp',
    PROCESSING: 'Đang xử lý',
    PUBLISHED: 'Đã đăng',
    WAITING_SCHEDULE: 'Chờ tới giờ đăng',
    SCHEDULE_FAILED: 'Hẹn giờ lỗi',
    WAITING_SCAN: 'Đang kiểm duyệt tự động',
    SCAN_REJECTED: 'Bị kiểm duyệt tự động chặn',
  };

  // Kiểm tra trước khi đăng; trả về câu báo lỗi hoặc '' nếu được
  function validateCompose({ groupIds, content, scheduledAt, setting, media, tags, series, asGroup = false }, now = Date.now()) {
    if (!groupIds?.length) return 'Chưa chọn group để đăng';
    if (asGroup && groupIds.length !== 1) return 'Đăng dưới tên group: chỉ chọn một group';
    const text = String(content || '').trim();
    const kinds = Object.keys(MEDIA).filter((k) => media?.[MEDIA_FIELD[k]]?.length);
    if (!text && !kinds.length) return 'Bài chưa có nội dung';
    if (kinds.length > 1) return 'Mỗi bài chỉ đính kèm một loại: ảnh, video hoặc tệp';
    for (const k of kinds) if (media[MEDIA_FIELD[k]].length > MEDIA[k].max) return `Tối đa ${MEDIA[k].max} ${MEDIA[k].label} mỗi bài`;
    if ((tags?.length || 0) > TAG_MAX) return `Tối đa ${TAG_MAX} tag mỗi bài`;
    if ((series?.length || 0) > SERIES_MAX) return `Tối đa ${SERIES_MAX} series mỗi bài`;
    if (text.length > POST_MAX) return `Bài dài ${text.length} ký tự, Beincom chỉ cho tối đa ${POST_MAX}`;
    if (scheduledAt) {
      const t = new Date(scheduledAt).getTime();
      if (!Number.isFinite(t)) return 'Giờ hẹn không hợp lệ';
      if (t < now + MIN_SCHEDULE_MIN * 60e3) return `Giờ hẹn phải sau bây giờ ít nhất ${MIN_SCHEDULE_MIN} phút`;
    }
    // importantExpiredAt = null: Quan trọng không hết hạn
    if (setting?.isImportant && setting.importantExpiredAt !== null) {
      const t = new Date(setting.importantExpiredAt).getTime();
      if (!Number.isFinite(t) || t <= (scheduledAt ? new Date(scheduledAt).getTime() : now)) return 'Ngày hết "Quan trọng" phải sau lúc bài được đăng';
    }
    return '';
  }

  // Body cho PUT content/posts/{id}/publish | schedule (giống web gửi)
  // mentions: { username: {...} } đã lọc theo nội dung; linkPreview: chỉ gửi khi bài không có ảnh / video / tệp (web chỉ hiện lúc đó)
  // tags / series: [{ id, … }] hoặc [id]; body chỉ gửi id (giống web)
  function composeBody({ groupIds, content, setting, scheduledAt, media, mentions, linkPreview, tags, series }) {
    const s = { ...DEFAULT_POST_SETTING, ...setting };
    const body = {
      audience: { groupIds: [...groupIds], userIds: [] },
      content: String(content || '').trim(),
      media: { images: [...(media?.images || [])], videos: [...(media?.videos || [])], files: [...(media?.files || [])] },
      setting: { canComment: !!s.canComment, canReact: !!s.canReact, isImportant: !!s.isImportant, importantExpiredAt: s.isImportant && s.importantExpiredAt ? new Date(s.importantExpiredAt).toISOString() : null },
      mentions: usedMentions(content, mentions),
      tags: (tags || []).map((x) => x?.id ?? x).filter(Boolean),
      series: (series || []).map((x) => x?.id ?? x).filter(Boolean),
    };
    const hasMedia = body.media.images.length + body.media.videos.length + body.media.files.length > 0;
    const lp = slimLinkPreview(linkPreview);
    if (lp && !hasMedia) body.linkPreview = lp;
    if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();
    return body;
  }

  // ---------- Cài đặt group (bật / tắt nhiều group một lần) ----------
  // perm: 'join' = quyền edit_join_setting, 'privacy' = edit_privacy, 'community' = admin community
  // snake: tên khoá gửi lên (API nhóm nhận snake_case; web viết camelCase rồi đổi khi gửi)
  const GROUP_SETTINGS = {
    isJoinApproval: { label: 'Duyệt thành viên', snake: 'is_join_approval', perm: 'join', hint: 'Người xin vào phải được admin duyệt' },
    isActiveMembershipQuestions: { label: 'Câu hỏi gia nhập', snake: 'is_active_membership_questions', perm: 'join', hint: 'Người xin vào phải trả lời câu hỏi (group cần có câu hỏi)' },
    isInvitedOnly: { label: 'Chỉ người được mời', snake: 'is_invited_only', perm: 'join', hint: 'Chỉ người nhận lời mời mới vào được' },
    isHiddenMembers: { label: 'Ẩn danh sách thành viên', snake: 'is_hidden_members', perm: 'privacy', hint: 'Người ngoài group không xem được danh sách thành viên' },
    contentApproval: { label: 'Duyệt bài', perm: 'community', hint: 'Bài phải được admin duyệt trước khi hiện' },
  };

  function hasGroupPerm(permData, groupId, name) {
    return !!permData?.groups?.[groupId]?.includes(name);
  }

  // GET group/groups/{id}/settings -> { values: { khoá: true/false }, locked: { khoá: lý do Beincom không cho đổi } }
  function slimGroupSettings(d) {
    const s = d?.settings || {};
    const values = {};
    const locked = {};
    for (const k of Object.keys(GROUP_SETTINGS)) {
      values[k] = k === 'contentApproval' ? !!s.contentApproval?.value : !!s[k];
      const why = d?.changeableSettings?.[k];
      if (typeof why === 'string' && why.trim()) locked[k] = why.trim();
    }
    return { values, locked };
  }

  // Lý do không đổi được cài đặt này ở group (theo quyền đã quét); '' = đổi được
  function settingDenied(g, key) {
    const perm = GROUP_SETTINGS[key]?.perm;
    if (!perm) return 'Cài đặt không hợp lệ';
    if (perm === 'community') return g.isCommunityAdmin ? '' : 'Cần quyền chủ / admin community';
    if (perm === 'join') return g.canEditJoin === false ? 'Không có quyền đổi cài đặt tham gia' : '';
    return g.canEditPrivacy === false ? 'Không có quyền đổi quyền riêng tư' : '';
  }

  // Body gửi lên: cài đặt thành viên -> PUT group/groups/{id}/settings; duyệt bài -> PUT group/communities/{communityId}/content-settings
  function groupSettingBody(key, value, groupId) {
    if (key === 'contentApproval') return { group_id: groupId, content_approval: { value: !!value }, is_update_all: false };
    return { id: groupId, [GROUP_SETTINGS[key].snake]: !!value };
  }

  // ---------- Ghim, cài đặt bài, sửa bài đã đăng ----------
  const PIN_MAX = 5; // Beincom: tối đa 5 bài ghim mỗi group

  // Body PUT content/contents/{id}/setting
  function settingBody(setting) {
    const s = { ...DEFAULT_POST_SETTING, ...setting };
    return { canComment: !!s.canComment, canReact: !!s.canReact, isImportant: !!s.isImportant, importantExpiredAt: s.isImportant && s.importantExpiredAt ? new Date(s.importantExpiredAt).toISOString() : null };
  }

  // Body PUT content/posts/{id} khi sửa bài đã đăng: như khi đăng nhưng không có setting / scheduledAt (web đổi cài đặt bằng API riêng)
  function editBody(input) {
    const { setting, scheduledAt, ...body } = composeBody({ ...input, scheduledAt: null });
    // Không còn xem trước link: web gửi giá trị rỗng này để xoá thẻ cũ của bài
    if (!body.linkPreview) body.linkPreview = { domain: '', url: '' };
    return body;
  }

  // mentions của bài (theo username) -> dạng web giữ khi soạn
  function mentionEntries(mentions) {
    const out = {};
    for (const [key, u] of Object.entries(mentions || {})) {
      if (!u?.id) continue;
      const name = u.username || u.name || key;
      out[name] = { id: u.id, avatar: u.avatar || '', name, fullname: u.fullname || '', isVerified: !!(u.isVerified ?? u.is_verified) };
    }
    return out;
  }

  // Bài từ GET content/contents/{id} -> dữ liệu để mở lại trong khung soạn
  function editState(d) {
    const s = d.setting || {};
    return {
      id: d.id,
      status: d.status || '',
      actorId: d.actor?.id || '',
      groups: (d.audience?.groups || []).map((g) => ({ id: g.id, name: g.name || '' })),
      content: String(d.content || ''),
      media: { images: d.media?.images || [], videos: d.media?.videos || [], files: d.media?.files || [] },
      mentions: mentionEntries(d.mentions),
      linkPreview: slimLinkPreview(d.linkPreview),
      tags: (d.tags || []).map((t) => ({ id: t.id, name: t.name || '' })),
      series: (d.series || []).map((x) => ({ id: x.id, title: x.title || '' })),
      setting: { canComment: s.canComment !== false, canReact: s.canReact !== false, isImportant: !!s.isImportant, importantExpiredAt: s.importantExpiredAt || null },
    };
  }

  // ---------- Quy tắc riêng cho từng group ----------
  // groupRules: { [groupId]: { rules: {...}, postRules: {...} } } (bản đầy đủ, chép từ quy tắc đang dùng lúc tạo)
  // Thứ tự: riêng của group -> riêng của group gốc (community) -> quy tắc chung
  function ruleSource(g, groupRules, groups = []) {
    if (!g?.id) return null;
    if (groupRules?.[g.id]) return g.id;
    const root = g.rootGroupId || (g.isCommunity ? g.id : (groups || []).find((x) => x.isCommunity && x.communityId === g.communityId)?.id);
    return root && groupRules?.[root] ? root : null;
  }

  // ctx: { rules, postRules, groupRules, groups } -> { source, rules, postRules }
  function effectiveRules(g, ctx = {}) {
    const source = ruleSource(g, ctx.groupRules, ctx.groups);
    const own = source ? ctx.groupRules[source] : null;
    return {
      source,
      rules: { ...DEFAULT_RULES, ...ctx.rules, ...(own?.rules || {}) },
      postRules: { ...DEFAULT_POST_RULES, ...ctx.postRules, ...(own?.postRules || {}) },
    };
  }

  const VERDICT_RANK = { ok: 0, review: 1, bad: 2 };

  // Chấm bài theo quy tắc của các group bài được đăng vào (bài đăng nhiều group: lấy kết quả nặng nhất)
  function evaluatePostIn(post, ctx = {}, fallback = null) {
    const known = new Map((ctx.groups || []).map((g) => [g.id, g]));
    const ids = [...new Set([...(post.seenIn || []), ...(post.groups || []).map((x) => x.id)])];
    const sources = new Map();
    for (const id of ids) {
      const g = known.get(id) || (post.groups || []).find((x) => x.id === id);
      const src = ruleSource(g, ctx.groupRules, ctx.groups) || '';
      if (!sources.has(src)) sources.set(src, g);
    }
    if (!sources.size) sources.set('', fallback);
    let worst = null;
    for (const g of sources.values()) {
      const ev = evaluatePost(post, effectiveRules(g, ctx).postRules);
      if (!worst || VERDICT_RANK[ev.verdict] > VERDICT_RANK[worst.verdict]) worst = ev;
    }
    return worst;
  }

  const POST_VERDICT_LABELS = {
    approval: { ok: 'Gợi ý duyệt', review: 'Cần xem', bad: 'Gợi ý từ chối' },
    published: { ok: 'Không vi phạm', review: 'Cần xem', bad: 'Vi phạm' },
  };

  // ID yêu cầu mới so với lần quét trước (để thông báo)
  function newRequestIds(groups, knownIds) {
    const known = new Set(knownIds || []);
    const out = [];
    for (const g of groups || []) for (const r of g.requests || []) if (!known.has(r.id)) out.push(r.id);
    return out;
  }

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

  // ---------- Xem trước markdown ----------
  // Chỉ những gì trình soạn thảo Beincom xuất ra: **đậm**, _nghiêng_ / *nghiêng*, ~~gạch~~, `code`,
  // [chữ](link), tiêu đề #, > trích dẫn, - danh sách, 1. danh sách, ``` khối code, ---.
  // An toàn: mã hoá HTML trước, chỉ sinh thẻ đã biết, link chỉ nhận http(s).

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const MARK = String.fromCharCode(1); // giữ chỗ cho `code` khi xử lý các định dạng khác

  function inlineMdBase(s, mentions) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => {
      codes.push(c);
      return MARK + (codes.length - 1) + MARK;
    });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|\s)(https?:\/\/[^\s<"]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    // @username đã chọn từ danh sách nhắc tên
    if (mentions) s = s.replace(MENTION_ALL, (all, pre, name) => (mentions[name.replace(MENTION_TAIL, '')] ? `${pre}<span class="mention">@${name}</span>` : all));
    return s.replace(new RegExp(MARK + '(\\d+)' + MARK, 'g'), (_, i) => `<code>${codes[Number(i)]}</code>`);
  }

  // opts.mentions: tô màu các @username có trong bảng nhắc tên
  function renderMarkdown(md, opts = {}) {
    const inlineMd = (x) => inlineMdBase(x, opts.mentions);
    const lines = escapeHtml(String(md ?? '').replace(/\r\n?/g, '\n')).split('\n');
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
      para = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^```/.test(line)) {
        flush();
        const code = [];
        while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
        out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      } else if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
        flush();
        out.push(`<h4>${inlineMd(m[1])}</h4>`);
      } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        flush();
        out.push('<hr>');
      } else if (/^&gt;\s?/.test(line)) {
        flush();
        const q = [];
        for (; i < lines.length && /^&gt;\s?/.test(lines[i]); i++) q.push(inlineMd(lines[i].replace(/^&gt;\s?/, '')));
        i--;
        out.push(`<blockquote>${q.join('<br>')}</blockquote>`);
      } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flush();
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        const items = [];
        for (; i < lines.length && re.test(lines[i]); i++) items.push(`<li>${inlineMd(lines[i].replace(re, ''))}</li>`);
        i--;
        out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      } else if (!line.trim()) {
        flush();
      } else {
        para.push(line);
      }
    }
    flush();
    return out.join('');
  }

  // ---------- Thống kê ----------

  // Các ngày (giờ VN) trong `days` ngày gần nhất, cũ -> mới
  function dayRange(days, now = Date.now()) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) out.push(vnDay(now - i * 864e5));
    return out;
  }

  // Ghi số thành viên hôm nay của từng group (giữ 120 ngày)
  function recordMemberHistory(prev, groups, now = Date.now()) {
    const day = vnDay(now);
    const out = { ...(prev || {}) };
    for (const g of groups || []) {
      if (g.userCount == null) continue;
      const list = (out[g.id] || []).filter((x) => x.day !== day);
      list.push({ day, count: g.userCount });
      out[g.id] = list.slice(-120);
    }
    return out;
  }

  // Ngày của số liệu chính thức: Beincom trả "2026-10-06T00:00:00.000Z" = ngày 06/10
  const officialDay = (iso) => String(iso || '').slice(0, 10);

  // Ghép số liệu theo ngày. Ưu tiên số liệu chính thức (chủ/admin community), không có thì tự tính:
  //  - thành viên: số addon ghi lại sau mỗi lần quét (history)
  //  - vào / rời: đếm nhật ký hoạt động (activity, đã chuẩn hoá bằng slimActivity)
  //  - bài mới: đếm bài trên timeline các group đang quản trị (posts, đã chuẩn hoá bằng slimPost)
  function buildStats({ days = 30, now = Date.now(), officialMembers = null, officialPosts = null, posts = [], activity = [], history = [], userCount = null }) {
    const range = dayRange(days, now);
    const inRange = new Set(range);
    const blank = () => Object.fromEntries(range.map((d) => [d, 0]));

    let memberSource = 'none';
    const members = Object.fromEntries(range.map((d) => [d, null]));
    if (officialMembers?.length) {
      memberSource = 'official';
      for (const r of officialMembers) if (inRange.has(officialDay(r.date))) members[officialDay(r.date)] = r.memberCount ?? null;
    } else if (history?.length) {
      memberSource = 'history';
      for (const r of history) if (inRange.has(r.day)) members[r.day] = r.count;
    }

    const joined = blank();
    const left = blank();
    let joinSource;
    if (officialMembers?.length) {
      joinSource = 'official';
      for (const r of officialMembers) {
        const d = officialDay(r.date);
        if (!inRange.has(d)) continue;
        joined[d] += r.joinedCount || 0;
        left[d] += r.leftCount || 0;
      }
    } else {
      joinSource = 'activity';
      for (const a of activity || []) {
        const d = a.time ? vnDay(new Date(a.time).getTime()) : null;
        if (!inRange.has(d)) continue;
        if (a.kind === 'in') joined[d]++;
        if (a.kind === 'out') left[d]++;
      }
    }

    const recent = (posts || []).filter((p) => p.publishedAt && inRange.has(vnDay(new Date(p.publishedAt).getTime())));
    const postsDaily = blank();
    let postSource;
    if (officialPosts?.length) {
      postSource = 'official';
      for (const r of officialPosts) if (inRange.has(officialDay(r.date))) postsDaily[officialDay(r.date)] += r.totalCount ?? r.postCount ?? 0;
    } else {
      postSource = 'timeline';
      for (const p of recent) postsDaily[vnDay(new Date(p.publishedAt).getTime())]++;
    }

    const engagement = (p) => (p.reactions || 0) + (p.commentsCount || 0);
    const topPosts = [...recent].sort((a, b) => engagement(b) - engagement(a) || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 10);
    const byAuthor = new Map();
    for (const p of recent) {
      const k = p.actor?.id || p.actor?.username || '?';
      const a = byAuthor.get(k) || { actor: p.actor, posts: 0, reactions: 0, comments: 0 };
      a.posts++;
      a.reactions += p.reactions || 0;
      a.comments += p.commentsCount || 0;
      byAuthor.set(k, a);
    }
    const topAuthors = [...byAuthor.values()].sort((a, b) => b.posts - a.posts || b.reactions + b.comments - (a.reactions + a.comments)).slice(0, 10);

    const sum = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    return {
      days: range,
      daily: range.map((d) => ({ day: d, members: members[d], joined: joined[d], left: left[d], posts: postsDaily[d] })),
      totals: {
        members: userCount,
        joined: sum(joined),
        left: sum(left),
        posts: sum(postsDaily),
        reactions: recent.reduce((s, p) => s + (p.reactions || 0), 0),
        comments: recent.reduce((s, p) => s + (p.commentsCount || 0), 0),
        scannedPosts: recent.length,
      },
      topPosts,
      topAuthors,
      sources: { members: memberSource, joinLeave: joinSource, posts: postSource },
    };
  }

  // Xuất CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt)
  const BOM = String.fromCharCode(0xfeff);
  function toCsv(rows, columns) {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
    return BOM + lines.join('\r\n');
  }

  return {
    API,
    SITE,
    DEFAULT_SETTINGS,
    DEFAULT_RULES,
    DEFAULT_POST_RULES,
    HIDE_REASONS,
    BAN_REASONS,
    slimBanned,
    ACTIVITY_TYPES,
    POST_MAX,
    MIN_SCHEDULE_MIN,
    DEFAULT_POST_SETTING,
    CONTENT_STATUS,
    validateCompose,
    ruleSource,
    effectiveRules,
    evaluatePostIn,
    GROUP_SETTINGS,
    hasGroupPerm,
    slimGroupSettings,
    settingDenied,
    groupSettingBody,
    PIN_MAX,
    settingBody,
    editBody,
    mentionEntries,
    editState,
    TAG_MAX,
    SERIES_MAX,
    slimTag,
    slimSeries,
    tagSeriesError,
    mentionQuery,
    slimMentionable,
    mentionEntry,
    usedMentions,
    lastLink,
    slimLinkPreview,
    MEDIA,
    MEDIA_FIELD,
    sizeText,
    pickMedia,
    mediaSummary,
    mediaItem,
    slimScheduled,
    IMPORTANT_FOR,
    importantUntil,
    BACKUP_FORMAT,
    makeBackup,
    readBackup,
    backupSummary,
    mergeProfiles,
    RECUR_EVERY,
    RECUR_MIN,
    RECUR_MAX,
    recurTimes,
    recurSetting,
    recurIndex,
    pruneRecurring,
    composeBody,
    VERDICT_LABELS,
    POST_VERDICT_LABELS,
    norm,
    parseList,
    vnDay,
    weeklyReport,
    blockedHits,
    COMMENT_TEXT_MAX,
    validateComment,
    commentMentions,
    replyTarget,
    isUnanswered,
    WELCOME_MAX_MENTIONS,
    DEFAULT_WELCOME,
    newMembersFromActivity,
    welcomeText,
    watchHits,
    DEFAULT_SHOUTOUT,
    topMembers,
    shoutoutText,
    domainIn,
    linkKeys,
    spamWaves,
    waveItems,
    banTargets,
    WAVE_WINDOW_MS,
    WAVE_MIN_ACCOUNTS,
    reportText,
    weeklyDue,
    isOk,
    errMsg,
    isContentGone,
    adminGroups,
    canBan,
    isCommunityAdmin,
    REPORT_STATUS,
    REPORT_TARGET,
    slimReport,
    reportUrl,
    sortGroupTree,
    groupIndent,
    roleLabel,
    slimMember,
    slimActivity,
    activitySummary,
    groupUrl,
    memberRequestsUrl,
    contentApprovalUrl,
    userUrl,
    postUrl,
    commentUrl,
    slimPost,
    COMMENT_ROOT,
    COMMENT_MAX,
    slimComment,
    flattenComments,
    commentTargets,
    replyTargets,
    mergeComments,
    violationsFromComments,
    linkDomains,
    evaluatePost,
    slimRequest,
    slimQuestion,
    hasAvatar,
    answersOf,
    evaluateRequest,
    VIOLATION_TYPES,
    addViolations,
    profileSummary,
    profileText,
    violationsFromLog,
    violationsFromActivity,
    violationsFromReports,
    violationsFromPosts,
    newRequestIds,
    totals,
    autoFlaggedIds,
    escapeHtml,
    renderMarkdown,
    dayRange,
    recordMemberHistory,
    buildStats,
    toCsv,
  };
});
