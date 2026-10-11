// Kiểm thử giao diện (test/ui): giả lập chrome.* và API Beincom bằng dữ liệu mẫu để chạy Dashboard / popup
// như trang thường (file://), không cần addon thật hay đăng nhập. Nạp trước common.js (run.mjs tự chèn).
// Các hàm giả ghi lại lệnh nhận được vào window.__… để kịch bản kiểm tra.
(function () {
  const now = Date.now();
  const iso = (h) => new Date(now - h * 3600e3).toISOString();
  const u = (n, name, extra = {}) => ({ id: 'u' + n, username: name.toLowerCase().replace(/[^a-z]/g, '') + n, fullname: name, avatar: extra.avatar ?? '', isVerified: !!extra.v, isDeactivated: !!extra.off, premium: !!extra.p, nft: !!extra.nft });
  const r = (n, name, mins, answers, extra) => ({ id: 'jr' + n, userId: 'u' + n, createdAt: new Date(now - mins * 60e3).toISOString(), answers, user: u(n, name, extra) });
  const img = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" fill="#f0a640"/><circle cx="18" cy="14" r="7" fill="#fff"/><rect x="7" y="24" width="22" height="14" rx="7" fill="#fff"/></svg>');
  const P = (id, name, text, hours, extra = {}) => ({ id, type: 'POST', title: '', text, actor: { id: 'a' + id, username: name.toLowerCase().replace(/[^a-z]/g, ''), fullname: name, avatar: '' }, groups: [{ id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true, approval: extra.approval || null }], media: { images: extra.img || 0, videos: 0, files: 0 }, link: extra.link || '', publishedAt: iso(hours), submittedAt: iso(hours), commentsCount: extra.cmt ?? null, isHidden: !!extra.hidden, dismissed: false, full: extra.full ?? true, seenIn: ['gCL'] });
  const groups = [
    { id: 'gFood', name: 'Food Research', communityId: 'cFood', communityName: 'Food Research', isCommunity: true, level: 0, privacy: 'OPEN', userCount: 3, roles: ['role_OWNER', 'role_COMMUNITY_ADMIN'], canApprove: true, canRemove: true, canAssign: true, canBan: true, isCommunityAdmin: true, settings: { isJoinApproval: true, contentApproval: false, isActiveMembershipQuestions: true }, pendingTotal: 1, approvalCount: null, reportIds: ['rp1', 'rp2'], flaggedIds: [],
      questions: [{ id: 'q1', question: 'Bạn biết đến nhóm qua đâu?', isRequired: true }],
      requests: [r(1, 'Trần Minh Anh', 12, [{ questionId: 'q1', answer: 'Bạn bè giới thiệu' }], { avatar: img, v: 1, p: 1 })] },
    { id: 'gCL', name: 'Crypto Life', communityId: 'cCL', communityName: 'Crypto Life', isCommunity: true, level: 0, privacy: 'OPEN', userCount: 12361, flaggedIds: ['f1'], roles: ['role_GROUP_ADMIN'], canApprove: true, canRemove: true, canAssign: true, canBan: false, settings: { isJoinApproval: false, contentApproval: true, isActiveMembershipQuestions: true }, pendingTotal: 0, approvalCount: 1, questions: [], requests: [],
      approvals: [P('p2', 'Kèo Thơm 247', 'Vào nhóm VIP nhận kèo x100, cam kết lợi nhuận!!! t.me/keothom247', 3, { approval: 'WAITING_APPROVAL' })] },
    { id: 'gGen', name: 'Crypto Life - General', communityId: 'cCL', communityName: 'Crypto Life', isCommunity: false, level: 1, privacy: 'OPEN', userCount: 6745, flaggedIds: ['f1'], canEditPrivacy: false, roles: ['role_GROUP_ADMIN'], canApprove: true, canRemove: true, canAssign: false, canBan: false, settings: { isJoinApproval: false, contentApproval: false, isActiveMembershipQuestions: false }, pendingTotal: 0, approvalCount: null, questions: [], requests: [] },
  ];
  const recent = [
    P('t1', 'Airdrop Free', 'Nhận airdrop 500 USDT miễn phí tại bit.ly/nhanquaa', 2, { link: 'https://bit.ly/nhanquaa', cmt: 4 }),
    { ...P('t2', 'Kai Crypto', 'Bài của mình, link t.me/kai để test xoá', 1), actor: { id: 'me1', username: 'kaicrypto', fullname: 'Kai Crypto', avatar: '' } },
    { ...P('t3', 'Lan Anh', 'Cho mình hỏi ví nào an toàn cho người mới bắt đầu ạ?', 5, { cmt: 0 }), actor: { id: 'aLan', username: 'lananh', fullname: 'Lan Anh', avatar: '' } },
  ];

  // 120 thành viên mẫu cho Crypto Life
  const names = ['Nguyễn Hải', 'Trần Quang', 'Lê Thu', 'Phạm Minh', 'Hoàng Yến', 'Vũ Nam', 'Đỗ Hạnh', 'Bùi Long'];
  const members = Array.from({ length: 120 }, (_, i) => ({ ...u(100 + i, names[i % names.length], { v: i % 3 === 0, p: i % 7 === 0, avatar: i % 4 ? img : '' }), joinedAt: iso(i * 5 + 1), isCommunityAdmin: i === 3, totalJoinedGroup: (i % 4) + 1, isAdmin: false }));
  const adminIds = ['u102', 'u105'];
  const activity = [
    { id: 'e1', time: iso(1), useCase: 'join.community.as_member', label: 'Vào community', kind: 'in', user: u(201, 'Mai Anh'), actor: null, change: '' },
    { id: 'e2', time: iso(3), useCase: 'leave.group', label: 'Rời group', kind: 'out', user: u(202, 'Tô Lâm'), actor: null, change: '' },
    { id: 'e3', time: iso(20), useCase: 'assign.group_admin', label: 'Được gán admin group', kind: 'role', user: u(203, 'Kai Crypto'), actor: u(204, 'Phùng Thiên'), change: 'MEMBER → GROUP_ADMIN' },
    { id: 'e4', time: iso(30), useCase: 'remove.member', label: 'Bị xoá khỏi group', kind: 'out', user: u(205, 'Spam Bot'), actor: u(204, 'Phùng Thiên'), change: '' },
    { id: 'e5', time: iso(80), useCase: 'join.community.as_member', label: 'Vào community', kind: 'in', user: u(206, 'Hà Vy'), actor: null, change: '' },
  ];

  const SX = (extra = {}) => ({ createdAt: iso(3), setting: { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null }, thumbs: [], linkPreview: null, tags: [], series: [], mentions: [], ...extra });
  const scheduled = [
    { ...P('s1', 'Phùng Thiên', ['### Thông báo AMA', 'Tối **thứ 6** với đội ngũ dự án, mọi người chuẩn bị câu hỏi nhé!', '', '- Thời gian: 20:00', '- Địa điểm: group Crypto Life', '', 'Đăng ký tại https://example.com/ama'].join(String.fromCharCode(10)), 0, { img: 6 }), status: 'WAITING_SCHEDULE', scheduledAt: new Date(now + 26 * 3600e3 + 15 * 60e3).toISOString(),
      ...SX({ thumbs: [img, img, img, img], linkPreview: { url: 'https://example.com/ama', title: 'AMA Crypto Life tháng 10 — đăng ký đặt câu hỏi', domain: 'example.com', image: img }, tags: ['AMA', 'SỰ KIỆN'], series: ['Lịch sự kiện'], mentions: ['kaicrypto'], setting: { canComment: false, canReact: true, isImportant: true, importantExpiredAt: new Date(now + 8 * 86400e3).toISOString() } }) },
    { ...P('s3', 'Kai Crypto', 'Nhắc lịch họp admin hằng tuần', 0), actor: { id: 'me1', username: 'kaicrypto', fullname: 'Kai Crypto', avatar: '' }, status: 'WAITING_SCHEDULE', scheduledAt: new Date(now + 40 * 60e3).toISOString(), ...SX({ setting: { canComment: true, canReact: true, isImportant: true, importantExpiredAt: null } }) },
    { ...P('s4', 'Kai Crypto', 'Bài hẹn giờ bị lỗi', 0), status: 'SCHEDULE_FAILED', scheduledAt: new Date(now - 2 * 3600e3).toISOString(), ...SX() },
    ...[3, 5, 5, 5, 5, 9, 16].map((d, i) => ({ ...P('x' + i, 'Kai Crypto', ['Điểm tin thị trường sáng', 'Kèo phân tích **BTC** tuần này', 'Hỏi đáp ví lạnh', 'Giveaway cuối tuần', 'Recap AMA', 'Bản tin tuần', 'Bản tin tuần'][i], 0), status: 'WAITING_SCHEDULE', scheduledAt: new Date(Math.floor((now + 7 * 3600e3) / 864e5) * 864e5 - 7 * 3600e3 + d * 86400e3 + (9 * 60 + i * 30) * 60e3).toISOString(), ...SX() })),
  ];
  const vnAt = (d, h) => new Date(Math.floor((now + 7 * 3600e3) / 864e5) * 864e5 - 7 * 3600e3 - d * 864e5 + h * 3600e3).toISOString();
  const M = (views, reactions, comments, ageH) => ({ views, reactions, comments, at: now - 3600e3, ageH });
  const store = {
    diagLog: [
      { where: 'sw', kind: 'api', method: 'GET', path: 'content/manage/communities/cCL/content-reports?limit=25', status: 504, code: '', message: 'Máy chủ Beincom không phản hồi kịp (HTTP 504)', time: now - 20 * 60e3, first: now - 50 * 60e3, count: 3, key: 'k1' },
      { where: 'dashboard', kind: 'js', message: "TypeError: Cannot read properties of undefined (reading 'name')", stack: 'at renderX (dash/content.js:120:7)', time: now - 5 * 60e3, first: now - 5 * 60e3, count: 1, key: 'k2' },
    ],
    postStats: {
      ps1: { id: 'ps1', type: 'POST', snippet: 'Bản tin thị trường sáng thứ Ba', groupName: 'Crypto Life', publishAt: vnAt(9, 20), publishedAt: vnAt(9, 20), at: now - 9 * 864e5, d1: M(420, 38, 12, 24), d7: M(910, 61, 19, 168), cur: M(950, 63, 19, 216) },
      ps2: { id: 'ps2', type: 'POST', snippet: 'Hỏi đáp ví lạnh cho người mới', groupName: 'Crypto Life', publishAt: vnAt(5, 9), publishedAt: vnAt(5, 9), at: now - 5 * 864e5, d1: M(150, 9, 3, 25), cur: M(210, 12, 4, 120) },
      ps3: { id: 'ps3', type: 'ARTICLE', snippet: '[Article] Bản tin tuần 41 — Tổng hợp tin nổi bật', groupName: 'Crypto Life', publishAt: vnAt(15, 20), publishedAt: vnAt(15, 20), at: now - 15 * 864e5, d1: M(300, 25, 6, 24), d7: M(780, 44, 11, 170) },
      ps4: { id: 'ps4', type: 'POST', snippet: 'Giveaway cuối tuần', groupName: 'Food Research', publishAt: vnAt(1, 10), publishedAt: vnAt(1, 10), at: now - 864e5 },
      ps5: { id: 'ps5', type: 'POST', snippet: 'Bài hẹn giờ ngày mai', groupName: 'Crypto Life', publishAt: new Date(now + 20 * 3600e3).toISOString(), at: now - 3600e3 },
    },
    recurring: [{ id: 'r1', every: 'week', count: 2, snippet: 'Bản tin tuần', items: [{ contentId: 'x5', scheduledAt: new Date(now + 9 * 86400e3 + 5 * 1800e3).toISOString() }, { contentId: 'x6', scheduledAt: new Date(now + 16 * 86400e3 + 6 * 1800e3).toISOString() }] },],
    templates: [{ id: 'tpl1', name: 'Chào thành viên mới', text: 'Chào mừng các thành viên mới tuần này! 👋\nHãy đọc nội quy ở bài ghim nhé.', groupIds: ['gCL'], canComment: true, canReact: true }],
    settings: { active: true, intervalMin: 30, notify: true, dryRun: false, actionDelaySec: 2, autoApprove: false, autoDecline: false, scanPosts: true, scanComments: true, spamWaves: true, autoHideSpam: false, watchKeywords: ['lừa đảo', 'rút tiền'], remindUnanswered: true, unansweredHours: 6, syncSettings: false },
    postRules: { bannedKeywords: ['cam kết lợi nhuận'], blockedDomains: ['t.me', 'bit.ly'], reviewExternalLinks: false, allowedDomains: ['beincom.com'] },
    rules: { requireAvatar: true, requireAnswers: true, minAnswerLength: 3, requireVerified: false, declineDeactivated: true, bannedKeywords: [], allowUsernames: [], blockUsernames: [] },
    activitySeen: { gCL: iso(10) },
    __hist: true,
    state: { lastScan: now - 4 * 60e3, lastResult: { status: 'ok', message: '', mode: 'direct' }, snapshot: { at: now - 4 * 60e3, groups }, recentPosts: recent, me: { id: 'me1', username: 'kaicrypto', fullname: 'Kai Crypto' },
      memberHistory: {
        gCL: [{ day: new Date(now - 9 * 864e5 + 7 * 3600e3).toISOString().slice(0, 10), count: 12301 }, { day: new Date(now - 6 * 864e5 + 7 * 3600e3).toISOString().slice(0, 10), count: 12320 }],
        gFood: [{ day: new Date(now - 8 * 864e5 + 7 * 3600e3).toISOString().slice(0, 10), count: 2 }],
      },
      recentComments: [
        { id: 'cw1', postId: 't1', postType: 'POST', postSnippet: 'Nhận airdrop 500 USDT miễn phí tại bit.ly/nhanquaa', parentId: '', title: '', text: 'Sàn này không rút tiền được, có ai bị giống mình không?', link: '', actor: { id: 'uw9', username: 'thanhha', fullname: 'Thanh Hà', avatar: '' }, createdAt: iso(1.5), images: 0, giphy: false, totalReply: 0, groups: [{ id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true }], seenIn: ['gCL'], isHidden: false, dismissed: false },
        ...[['w1', 'Hoa Mai', 'hoamai88'], ['w2', 'Tuấn Anh', 'tuananh_vip'], ['w3', 'Lộc Phát', 'locphat'], ['w4', 'Bảo Ngọc', 'baongoc']].map(([id, name, un], i) => ({ id, postId: 't2', postType: 'POST', postSnippet: 'Bài của mình, link t.me/kai để test xoá', parentId: '', title: '', text: ['Nhận airdrop tại claim-bic.xyz/go nhanh tay', 'claim-bic.xyz/go uy tín nha', 'https://claim-bic.xyz/go/?ref=' + i, 'Ai chưa nhận thì vào claim-bic.xyz/go'][i], link: '', actor: { id: 'uw' + i, username: un, fullname: name, avatar: '' }, createdAt: iso(0.2 + i * 0.3), images: 0, giphy: false, totalReply: 0, groups: [{ id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true }], seenIn: ['gCL'], isHidden: false, dismissed: false })),
        { id: 'cm1', postId: 't1', postType: 'POST', postSnippet: 'Nhận airdrop 500 USDT miễn phí tại bit.ly/nhanquaa', parentId: '', title: '', text: 'Ai cần kèo x100 inbox mình, nhóm VIP tại t.me/keovip nhé!!!', link: '', actor: { id: 'uc1', username: 'keovip', fullname: 'Kèo VIP', avatar: '' }, createdAt: iso(0.5), images: 0, giphy: false, totalReply: 2, groups: [{ id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true }], seenIn: ['gCL'], isHidden: false, dismissed: false },
        { id: 'cm2', postId: 't1', postType: 'POST', postSnippet: 'Nhận airdrop 500 USDT miễn phí tại bit.ly/nhanquaa', parentId: 'cm1', title: '', text: 'Cảm ơn bạn, để mình xem', link: '', actor: { id: 'uc2', username: 'lananh', fullname: 'Lan Anh', avatar: '' }, createdAt: iso(0.4), images: 1, giphy: false, totalReply: 0, groups: [{ id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true }], seenIn: ['gCL'], isHidden: false, dismissed: false },
        { id: 'cm3', postId: 't2', postType: 'POST', postSnippet: 'Bài của mình, link t.me/kai để test xoá', parentId: '', title: '', text: 'Bài viết rất hữu ích, cảm ơn admin', link: '', actor: { id: 'uc3', username: 'minhquan', fullname: 'Minh Quân', avatar: '' }, createdAt: iso(3), images: 0, giphy: true, totalReply: 0, groups: [{ id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true }], seenIn: ['gCL'], isHidden: false, dismissed: false },
      ] },
    log: [
      { time: now - 3600e3, kind: 'member', source: 'manual', action: 'approve', status: 'ok', groupName: 'Food Research', userId: 'u1', username: 'a', fullname: 'A' },
      { time: now - 7200e3, kind: 'member', source: 'auto', action: 'approve', status: 'ok', groupName: 'Food Research', userId: 'u2', username: 'b', fullname: 'B' },
      { time: now - 86400e3, kind: 'manage', source: 'manual', action: 'ban', status: 'ok', groupName: 'Crypto Life', userId: 'u3', username: 'keovip', fullname: 'Kèo VIP' },
      { time: now - 2 * 86400e3, kind: 'post', source: 'manual', action: 'hide', status: 'ok', groupName: 'Crypto Life', contentId: 'px', snippet: 'Spam', userId: 'u3', username: 'keovip', fullname: 'Kèo VIP' },
      { time: now - 2 * 86400e3, kind: 'comment', source: 'manual', action: 'hide', status: 'ok', groupName: 'Crypto Life', contentId: 'cx', snippet: 'Spam bình luận', userId: 'u3', username: 'keovip', fullname: 'Kèo VIP' },
      { time: now - 3 * 86400e3, kind: 'report', source: 'manual', action: 'ignore', status: 'ok', groupName: 'Food Research', contentId: 'r1' },
      { time: now - 3 * 86400e3, kind: 'compose', source: 'manual', action: 'schedule', status: 'ok', groupName: 'gCL', snippet: 'Lịch họp' },
      { time: now - 4 * 86400e3, kind: 'post', source: 'manual', action: 'delete', status: 'error', groupName: 'Crypto Life', message: 'Lỗi thử' },
    ],
    // Hồ sơ vi phạm mẫu: người đang xin vào (u1), thành viên (u103), tác giả bài (at1)
    profiles: { users: {
      u1: { user: { id: 'u1', username: 'trnminhanh1', fullname: 'Trần Minh Anh', avatar: img }, events: [
        { type: 'banned', key: 'act:b1', time: iso(24 * 20), group: 'Crypto Life', snippet: '', reason: '', by: 'Phùng Thiên' },
        { type: 'hidden', key: 'hidden:x1', time: iso(24 * 25), group: 'Crypto Life - General', snippet: 'Kèo x100 vào nhóm VIP, cam kết lợi nhuận', reason: 'Spam / quảng cáo', by: 'Bạn (qua addon)' },
        { type: 'reported', key: 'report:r9', time: iso(24 * 26), group: 'Crypto Life', snippet: 'Kèo x100', reason: 'Spam / quảng cáo ×4', by: '' },
      ] },
      at1: { user: { id: 'at1', username: 'airdropfree', fullname: 'Airdrop Free', avatar: '' }, events: [
        { type: 'rule', key: 'rule:t1', time: iso(2), group: 'Crypto Life', snippet: 'Nhận airdrop 500 USDT miễn phí tại bit.ly/nhanquaa', reason: 'Có link tới tên miền cấm: bit.ly', by: '' },
      ] },
      u103: { user: { id: 'u103', username: 'x103', fullname: 'Thành viên 103', avatar: '' }, events: [
        { type: 'reported', key: 'report:r7', time: iso(30), group: 'Crypto Life', snippet: 'Bình luận gây gổ', reason: 'Bắt nạt, đe doạ, quấy rối ×2', by: '' },
        { type: 'flagged', key: 'flag:f9', time: iso(50), group: 'Crypto Life', snippet: 'Ảnh nhạy cảm', reason: 'Violence', by: '' },
      ] },
    } },
  };
  // Có gì mới: bản đã xem = bản hiện tại (không hiện hộp), trừ khi mở trang với #…&seen=0.22.0
  store.seenVersion = new URLSearchParams(location.hash.slice(1)).get('seen') || '__VERSION__';
  // Nhắc người mới: bản soạn sẵn sáng thứ Hai (3 người) và hai lần nhắc đã đăng (An Nhiên — nm0 — được nhắc 9 ngày trước)
  store.nudgeDraft = { id: 'nd1', groupId: 'gCL', groupName: 'Crypto Life', at: now - 2 * 3600e3, joined: 8, users: [0, 1, 2].map((i) => ({ id: 'nd' + i, username: 'thanhvienmoi' + i, fullname: 'Thành viên mới ' + i, avatar: '' })) };
  store.nudges = [
    { id: 'pn2', groupId: 'gCL', groupName: 'Crypto Life', at: new Date(now - 2 * 864e5).toISOString(), userIds: ['nx1', 'nx2'] },
    { id: 'pn1', groupId: 'gCL', groupName: 'Crypto Life', at: new Date(now - 9 * 864e5).toISOString(), userIds: ['nm0', 'nx3', 'nx4', 'nx5'] },
  ];
  // fetch không đọc được file://: CHANGELOG.md đọc bằng XHR (Chrome chạy với --allow-file-access-from-files)
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, o) =>
    String(u).endsWith('CHANGELOG.md')
      ? new Promise((res) => {
          const x = new XMLHttpRequest();
          x.open('GET', u);
          x.onload = () => res(new Response(x.responseText, { status: 200 }));
          x.onerror = () => res(new Response('', { status: 404 }));
          x.send();
        })
      : realFetch(u, o);
  const listeners = [];
  const fire = () => listeners.forEach((fn) => fn({ state: {} }, 'local'));
  window.__msgs = [];
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, structuredClone(store[k])])),
        set: async (o) => {
          Object.assign(store, structuredClone(o));
          listeners.forEach((fn) => fn(Object.fromEntries(Object.keys(o).map((k) => [k, {}])), 'local'));
        },
        remove: async (keys) => {
          for (const k of [].concat(keys)) delete store[k];
          listeners.forEach((fn) => fn(Object.fromEntries([].concat(keys).map((k) => [k, {}])), 'local'));
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    alarms: { get: async () => ({ scheduledTime: now + 26 * 60e3 }) },
    permissions: {
      contains: async () => !!window.__tgGranted,
      request: async (p) => {
        window.__permRequests = (window.__permRequests || 0) + 1;
        window.__tgGranted = true;
        return true;
      },
    },
    runtime: {
      getManifest: () => ({ version: '__VERSION__' }), // harness.mjs điền phiên bản trong manifest.json
      getURL: (p) => p,
      openOptionsPage() {},
      sendMessage: async (m) => {
        window.__msgs.push(m);
        await new Promise((res) => setTimeout(res, 150));
        if (m.type === 'members') {
          const key = (m.key || '').toLowerCase();
          let all = members.filter((x) => !key || `${x.fullname} ${x.username}`.toLowerCase().includes(key));
          if (m.groupId === 'gGen') all = all.slice(0, 7).map((x, i) => ({ ...x, joinedAt: null, totalJoinedGroup: null, isAdmin: i === 0 }));
          const page = all.slice(m.offset, m.offset + m.limit);
          return { status: 'ok', items: page, adminIds: m.offset === 0 && m.groupId !== 'gGen' ? adminIds : null, total: all.length, hasNext: m.offset + m.limit < all.length, nextOffset: m.offset + page.length };
        }
        if (m.type === 'activity') return { status: 'ok', items: activity, total: activity.length, hasNext: false };
        if (m.type === 'reports') {
          await new Promise((res) => setTimeout(res, 200));
          if (m.kind === 'reported') return { status: 'ok', timedOut: false, items: [
            { id: 'rp1', targetId: 'c1', targetType: 'COMMENT', commentPostId: 'p77', content: 'Vào link t.me/xyz nhận quà miễn phí!!!', actor: { id: 'a1', username: 'spammer', fullname: 'Spam Bot', avatar: '' }, reasons: [{ type: 'SPAM', label: 'Spam / quảng cáo', total: 3, description: '' }], total: 3, status: 'CREATED', createdAt: new Date(now - 2 * 3600e3).toISOString() },
            { id: 'rp2', targetId: 'p88', targetType: 'POST', content: 'Đầu tư lãi 30%/tháng, cam kết hoàn vốn', actor: { id: 'a2', username: 'laodao', fullname: 'Lão Đảo', avatar: '' }, reasons: [{ type: 'ILLEGAL', label: 'Vi phạm pháp luật', total: 1, description: '' }, { type: 'OTHERS', label: 'Lý do khác', total: 1, description: 'lừa đảo đa cấp' }], total: 2, status: 'CREATED', createdAt: new Date(now - 26 * 3600e3).toISOString() },
            { id: 'rp3', targetId: 'p89', targetType: 'POST', content: 'Bài đã xử lý', actor: { id: 'a3', username: 'x', fullname: 'X', avatar: '' }, reasons: [{ type: 'SPAM', label: 'Spam / quảng cáo', total: 1, description: '' }], total: 1, status: 'IGNORED', createdAt: new Date(now - 72 * 3600e3).toISOString() },
          ] };
          if (m.kind === 'flagged') return { status: 'ok', items: [{ ...P('f1', 'Tài Khoản Lạ', 'Nội dung có hình ảnh bạo lực', 5), violations: ['Violence', 'Graphic content'] }] };
          return { status: 'ok', items: [{ ...P('h1', 'Ai Đó', 'Bài đã bị ẩn trước đó', 50) }] };
        }
        if (m.type === 'reportDetail') { await new Promise((res) => setTimeout(res, 150)); return { status: 'ok', reasons: [{ label: 'Spam / quảng cáo', total: 3, reporters: [{ username: 'minhanh' }, { username: 'quang' }, { username: 'thu' }] }] }; }
        if (m.type === 'reportAct') { window.__lastReportAct = m; return { status: 'ok', dryRun: false, ok: m.items.length, dry: 0, failed: 0, errors: [], done: m.items.map((x) => x.targetId) }; }
        if (m.type === 'scheduled') return { status: 'ok', items: scheduled, errors: [] };
        if (m.type === 'refresh') {
          await new Promise((res) => setTimeout(res, 300));
          if (m.part === 'groups') groups[0].pendingTotal = 2;
          fire();
          return { status: 'ok', part: m.part, at: Date.now() };
        }
        if (m.type === 'stats') {
          const days = m.days;
          // Số liệu mẫu: Crypto Life (admin group) tự tính; Food Research có số liệu chính thức
          const dayIso = (i) => new Date(now - i * 864e5).toISOString();
          const posts = Array.from({ length: 26 }, (_, i) => ({ ...P('st' + i, names[i % names.length], 'Bài số ' + i + ' về thị trường crypto hôm nay', i * 20 + 3), reactions: (i * 7) % 23, commentsCount: (i * 3) % 9 }));
          const activity = Array.from({ length: 40 }, (_, i) => ({ id: 'ac' + i, time: dayIso(i * 0.6), kind: i % 4 === 0 ? 'out' : 'in', label: '', user: u(300 + i, 'X') }));
          const history = Array.from({ length: 12 }, (_, i) => ({ day: new Date(now - (11 - i) * 864e5 + 7 * 3600e3).toISOString().slice(0, 10), count: 12300 + i * 6 }));
          if (m.groupId === 'gFood') {
            const officialMembers = Array.from({ length: days }, (_, i) => ({ date: new Date(now - (days - 1 - i) * 864e5 + 7 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00.000Z', memberCount: 2 + Math.floor(i / 5), joinedCount: i % 5 === 0 ? 1 : 0, leftCount: 0 }));
            return { status: 'ok', days, officialMembers, officialPosts: null, posts: posts.slice(0, 3), activity: [], history: [], userCount: 3, errors: [] };
          }
          return { status: 'ok', days, officialMembers: null, officialPosts: null, posts, activity, history, userCount: 12361, errors: [] };
        }
        if (m.type === 'postAct' && m.action === 'delete') {
          store.state.recentPosts = store.state.recentPosts.filter((p) => !m.contentIds.includes(p.id));
          fire();
          return { status: 'ok', dryRun: false, ok: m.contentIds.length, dry: 0, failed: 0, errors: [] };
        }
        if (m.type === 'tagsSeries') {
          await new Promise((res) => setTimeout(res, 150));
          // Food Research có tag riêng; Crypto Life có nhiều tag và series
          const food = m.groupIds.includes('gFood');
          const cl = m.groupIds.some((id) => id === 'gCL' || id === 'gGen');
          const tags = [...(food ? [{ id: 'tF1', name: 'ẨM THỰC', totalUsed: 12 }, { id: 'tF2', name: 'CÔNG THỨC', totalUsed: 5 }] : []), ...(cl ? ['MULTICHAIN JOURNEY', 'BIC ARMY', 'RETROACTIVE', 'GUARB UPDATE', 'AIRDROP', 'DEFI', 'NFT'].map((n, i) => ({ id: 'tC' + i, name: n, totalUsed: 49 - i * 5 })) : [])];
          const series = [...(food ? [{ id: 'sF1', title: 'Món ngon mỗi tuần', cover: img, summary: 'Chia sẻ công thức' }] : []), ...(cl ? [{ id: 'sC1', title: 'Kỷ Nguyên Vươn Mình - Con đường Beincom hóa Rồng', cover: img, summary: '' }, { id: 'sC2', title: 'Tiêu Điểm Tài Chính', cover: '', summary: 'Định hình dòng tiền' }] : [])];
          return { status: 'ok', tags, series, note: '' };
        }
        if (m.type === 'mentionable') {
          await new Promise((res) => setTimeout(res, 120));
          const people = [u(201, 'Kai Crypto', { v: 1, avatar: img }), u(202, 'Lan Anh'), u(203, 'Khánh Linh', { avatar: img }), u(204, 'Kiều Trang', { v: 1 })].map((x) => ({ ...x, isVerified: x.isVerified }));
          window.__mentionCalls = (window.__mentionCalls || 0) + 1;
          return { status: 'ok', users: people.filter((x) => !m.key || (x.username + ' ' + x.fullname).toLowerCase().includes(m.key.toLowerCase())) };
        }
        if (m.type === 'linkPreview') {
          await new Promise((res) => setTimeout(res, 150));
          if (m.url.includes('loi')) return { status: 'error', message: 'Không lấy được thông tin link: Cannot fetch url' };
          return { status: 'ok', preview: { url: m.url, domain: 'CoinMarketCap', title: 'Bitcoin price today, BTC to USD live price, marketcap and chart', image: img, description: 'The live Bitcoin price today is $82,297.98 USD with a 24-hour trading volume of $32,947,568,623.28 USD.' } };
        }
        // Tải file lên (giả lập): ảnh/video có link kho lưu trữ, tệp chỉ có mã
        if (m.type === 'uploadInit') {
          (window.__uploadResources = window.__uploadResources || []).push(m.resource || '');
          window.__uploads = (window.__uploads || 0) + 1;
          return m.kind === 'file' ? { status: 'ok', id: 'f' + window.__uploads } : { status: 'ok', id: 'up' + window.__uploads, url: 'https://bucket.s3.example.com/', fields: { key: 'k' + window.__uploads, Policy: 'p' } };
        }
        if (m.type === 'uploadWait') { await new Promise((res) => setTimeout(res, 100)); return { status: 'ok', item: { url: img, id: m.id } }; }
        if (m.type === 'diag') {
          store.diagLog = BG.pushDiag(store.diagLog || [], m.entry);
          return { status: 'ok' };
        }
        if (m.type === 'cleanupUser') {
          window.__cleanup = m;
          let n = 0;
          for (const k of ['recentPosts', 'recentComments']) for (const x of store.state[k] || []) if (x.actor?.id === m.user.id && !x.isHidden) { x.isHidden = true; n++; }
          fire();
          return { status: 'ok', dryRun: false, ok: n, dry: 0, failed: 0, errors: [], hidden: n, banned: m.ban ? 1 : 0 };
        }
        if (m.type === 'postStatsRefresh') {
          await new Promise((res) => setTimeout(res, 100));
          store.postStats.ps4.cur = { views: 33, reactions: 4, comments: 1, at: Date.now(), ageH: 20 };
          fire();
          return { status: 'ok', measured: 4 };
        }
        if (m.type === 'tags') {
          await new Promise((res) => setTimeout(res, 120));
          window.__tagLists = window.__tagLists || {
            gCL: [['MULTICHAIN JOURNEY', 42], ['BIC ARMY', 17], ['AIRDROP', 9], ['DEFI', 3], ['NFT', 0], ['TIN NHANH', 0]].map(([name, n], i) => ({ id: 'tc' + i, name, totalUsed: n })),
            gFood: [{ id: 'tf1', name: 'ẨM THỰC', totalUsed: 12 }, { id: 'tf2', name: 'CÔNG THỨC', totalUsed: 0 }],
          };
          return { status: 'ok', tags: window.__tagLists[m.groupId] || [], canManage: m.groupId === 'gCL' };
        }
        if (m.type === 'tagAct') {
          (window.__tagActs = window.__tagActs || []).push(m);
          const list = window.__tagLists[m.groupId];
          if (m.action === 'create') list.push({ id: 'tn' + window.__tagActs.length, name: m.name, totalUsed: 0 });
          if (m.action === 'rename') list.find((t) => t.id === m.tagId).name = m.name;
          if (m.action === 'delete') list.splice(list.findIndex((t) => t.id === m.tagId), 1);
          store.log = [{ time: Date.now(), kind: 'tag', source: 'manual', action: m.action, status: 'ok', groupName: m.groupId, snippet: m.action === 'rename' ? m.oldName + ' → ' + m.name : m.name || m.oldName, tagId: m.tagId || '' }, ...store.log];
          fire();
          return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [] };
        }
        if (m.type === 'categories') {
          await new Promise((res) => setTimeout(res, 120));
          return { status: 'ok', items: ['Business & Finance', 'Technology', 'Science', 'Entertainment', 'Gaming', 'Food', 'Travel', 'Others'].map((name, i) => ({ id: 'cat' + i, name, slug: name.toLowerCase() })) };
        }
        if (m.type === 'composeArticle' || m.type === 'composeSeries') {
          (window.__articles = window.__articles || []).push(m);
          const dry = store.settings.dryRun;
          const cid = (m.type === 'composeArticle' ? 'art' : 'ser') + window.__articles.length;
          store.log = [{ time: Date.now(), kind: 'compose', source: 'manual', action: m.scheduledAt ? 'schedule' : 'publish', status: dry ? 'dry' : 'ok', contentType: m.type === 'composeArticle' ? 'ARTICLE' : 'SERIES', groupName: m.groupIds.join(', '), snippet: (m.type === 'composeArticle' ? '[Article] ' : '[Series] ') + m.title, contentId: cid, scheduledAt: m.scheduledAt || null, message: dry ? 'Chạy thử' : 'Đã đăng' }, ...store.log];
          if (!dry && m.scheduledAt) scheduled.push({ ...P(cid, 'Kai Crypto', '### ' + m.title + String.fromCharCode(10, 10) + m.summary, 0), type: 'ARTICLE', title: m.title, status: 'WAITING_SCHEDULE', scheduledAt: m.scheduledAt, ...SX({ thumbs: [img] }) });
          scheduled.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          fire();
          return { status: 'ok', dryRun: dry, ok: dry ? 0 : 1, dry: dry ? 1 : 0, failed: 0, errors: [], contentId: cid, postStatus: m.scheduledAt ? 'WAITING_SCHEDULE' : 'PUBLISHED' };
        }
        if (m.type === 'compose') {
          window.__lastCompose = m;
          (window.__composes = window.__composes || []).push(m);
          const cid = 'n' + window.__composes.length;
          const dry = store.settings.dryRun;
          store.log = [{ time: Date.now(), kind: 'compose', source: 'manual', action: m.scheduledAt ? 'schedule' : 'publish', status: dry ? 'dry' : 'ok', groupName: m.groupIds.join(', '), snippet: (m.recur ? '[🔁 ' + m.recur + '] ' : '') + m.content.slice(0, 80), contentId: cid, scheduledAt: m.scheduledAt, message: dry ? 'Chạy thử' : 'Đã đăng' }, ...store.log];
          if (!dry && m.scheduledAt) scheduled.push({ ...P(cid, 'Kai Crypto', m.content, 0), status: 'WAITING_SCHEDULE', scheduledAt: m.scheduledAt, ...SX({ setting: m.setting }) });
          scheduled.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          fire();
          return { status: 'ok', dryRun: dry, ok: dry ? 0 : 1, dry: dry ? 1 : 0, failed: 0, errors: [], contentId: cid, postStatus: m.scheduledAt ? 'WAITING_SCHEDULE' : 'PUBLISHED' };
        }
        if (m.type === 'scheduleAct') {
          window.__lastSchedAct = m;
          if (m.contentIds) {
            for (const id of m.contentIds) scheduled.splice(scheduled.findIndex((x) => x.id === id), 1);
            fire();
            return { status: 'ok', dryRun: false, ok: m.contentIds.length, dry: 0, failed: 0, errors: [] };
          }
          const i = scheduled.findIndex((x) => x.id === m.contentId);
          if (m.action === 'cancel') scheduled.splice(i, 1);
          else scheduled[i] = { ...scheduled[i], scheduledAt: m.scheduledAt };
          store.log = [{ time: Date.now(), kind: 'compose', source: 'manual', action: m.action, status: 'ok', groupName: m.groupName, snippet: m.snippet, contentId: m.contentId, scheduledAt: m.scheduledAt, message: '' }, ...store.log];
          fire();
          return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [] };
        }
        if (m.type === 'groupSettings') {
          await new Promise((res) => setTimeout(res, 150));
          window.__gs = window.__gs || {
            gFood: { isJoinApproval: true, isActiveMembershipQuestions: true, isInvitedOnly: false, isHiddenMembers: true, contentApproval: false },
            gCL: { isJoinApproval: false, isActiveMembershipQuestions: true, isInvitedOnly: false, isHiddenMembers: true, contentApproval: true },
            gGen: { isJoinApproval: true, isActiveMembershipQuestions: false, isInvitedOnly: false, isHiddenMembers: true, contentApproval: false },
          };
          return { status: 'ok', settings: Object.fromEntries(m.groupIds.map((id) => [id, { values: { ...window.__gs[id] }, locked: id === 'gGen' ? { isInvitedOnly: 'Đang theo cài đặt của community' } : {} }])), errors: [] };
        }
        if (m.type === 'groupSettingAct') {
          window.__lastGs = m;
          for (const id of m.groupIds) window.__gs[id][m.key] = m.value;
          return { status: 'ok', dryRun: false, ok: m.groupIds.length, dry: 0, failed: 0, errors: [], done: m.groupIds };
        }
        if (m.type === 'pinned') {
          await new Promise((res) => setTimeout(res, 120));
          const pins = { gCL: ['k1', 'k2', 'k3', 'k4', 'k5'].map((id, i) => P(id, ['Phùng Thiên', 'Kai Crypto', 'Lan Anh', 'Minh Quân', 'Thu Hà'][i], ['Nội quy Crypto Life — đọc trước khi đăng', 'Lịch AMA tháng 10', 'Hướng dẫn nhận BIC', 'Tổng hợp tài liệu DeFi', 'Danh sách dự án lừa đảo cần tránh'][i], 24 * (i + 2))), gGen: [P('k9', 'Kai Crypto', 'Chào mừng thành viên mới', 30)], gFood: [] };
          window.__pins = window.__pins || pins;
          return { status: 'ok', pinned: Object.fromEntries(m.groupIds.map((id) => [id, window.__pins[id] || []])), errors: [] };
        }
        if (m.type === 'pinAct') {
          window.__lastPinAct = m;
          for (const id of m.unpin || []) window.__pins[id] = (window.__pins[id] || []).filter((x) => x.id !== m.contentId);
          for (const id of m.pin || []) (window.__pins[id] = window.__pins[id] || []).unshift(P(m.contentId, 'Ai đó', m.snippet, 0));
          return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, gone: 0, errors: [] };
        }
        if (m.type === 'postDetail' && m.scheduled) {
          await new Promise((res) => setTimeout(res, 80));
          const sp = scheduled.find((x) => x.id === m.id);
          if (!sp || sp.actor.id !== 'me1') return { status: 'error', message: 'Chỉ sửa được bài của chính bạn (Beincom không cho admin sửa bài người khác)' };
          return { status: 'ok', post: { id: sp.id, status: 'WAITING_SCHEDULE', actorId: 'me1', groups: [{ id: 'gCL', name: 'Crypto Life' }], content: sp.text, media: { images: [], videos: [], files: [] }, mentions: {}, linkPreview: null, tags: [], series: [], setting: sp.setting, scheduledAt: sp.scheduledAt } };
        }
        if (m.type === 'editScheduled') {
          window.__lastEditSched = m;
          const sp = scheduled.find((x) => x.id === m.id);
          if (sp) Object.assign(sp, { text: m.content, scheduledAt: m.scheduledAt });
          scheduled.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [] };
        }
        if (m.type === 'postDetail') {
          await new Promise((res) => setTimeout(res, 100));
          const own = m.id === 't2';
          if (!own && !m.any) return { status: 'error', message: 'Chỉ sửa được bài của chính bạn (Beincom không cho admin sửa bài người khác)' };
          return { status: 'ok', post: { id: m.id, status: 'PUBLISHED', actorId: own ? 'me1' : 'at1', groups: [{ id: 'gCL', name: 'Crypto Life' }, { id: 'gGen', name: 'Crypto Life - General' }],
            content: own ? 'Bài của mình, link t.me/kai để **test** sửa bài' : 'x',
            media: { images: own ? [{ id: 'i1', url: img, width: 36 }, { id: 'i2', url: img, width: 36 }] : [], videos: [], files: [] },
            mentions: {}, linkPreview: null, tags: own ? [{ id: 'tC4', name: 'AIRDROP' }] : [], series: [],
            setting: own ? { canComment: true, canReact: true, isImportant: true, importantExpiredAt: null } : { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null } } };
        }
        if (m.type === 'postSetting') { window.__lastSetting = m; return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [] }; }
        if (m.type === 'editPost') { window.__lastEdit = m; await new Promise((res) => setTimeout(res, 100)); return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [] }; }
        if (m.type === 'profileAct') {
          const users = { ...store.profiles.users };
          delete users[m.userId];
          store.profiles = { users };
          window.__forgot = m.userId;
          fire();
          return { status: 'ok', ok: 1, failed: 0, dry: 0, errors: [] };
        }
        if (m.type === 'banned') {
          await new Promise((res) => setTimeout(res, 150));
          if (m.groupId !== 'gFood') return { status: 'error', code: 'not_admin', message: 'Chỉ chủ / admin community mới xem và gỡ được người bị cấm.' };
          window.__banned = window.__banned || [u(301, 'Spam Bot', {}), u(302, 'Lừa Đảo', { avatar: img }), u(303, 'Kèo Thơm 247', {})].map((x, i) => ({ ...x, reason: ['Spam', 'Vi phạm nội quy community', 'Spam'][i], bannedAt: iso(24 * (i + 3)) }));
          return { status: 'ok', items: window.__banned, total: window.__banned.length, hasNext: false, nextOffset: window.__banned.length };
        }
        if (m.type === 'memberAct') {
          if (m.action === 'unban') { window.__lastUnban = m; window.__banned = window.__banned.filter((x) => !m.users.some((y) => y.id === x.id)); }
          const dry = store.settings.dryRun;
          store.log = [...m.users.map((x) => ({ time: Date.now(), kind: 'manage', source: 'manual', action: m.action, status: dry ? 'dry' : 'ok', groupId: m.groupId, groupName: 'Crypto Life', communityName: 'Crypto Life', userId: x.id, username: x.username, fullname: x.fullname, reason: m.reason ? 'Spam' : undefined, message: dry ? 'Chạy thử — chưa gửi lên Beincom' : '' })), ...store.log];
          if (!dry && (m.action === 'remove' || m.action === 'ban')) for (const x of m.users) { const i = members.findIndex((y) => y.id === x.id); if (i >= 0) members.splice(i, 1); }
          fire();
          return { status: 'ok', dryRun: dry, ok: dry ? 0 : m.users.length, dry: dry ? m.users.length : 0, failed: 0, errors: [], done: dry ? [] : m.users.map((x) => x.id) };
        }
        // Thành viên mới có ở lại không: 8 người mới (1 tự rời, 1 bị xoá); Minh Quân (uc3) có bình luận trong dữ liệu đã quét
        if (m.type === 'retention') {
          window.__retention = m;
          const ago = (d) => new Date(now - d * 864e5).toISOString();
          const names = ['An Nhiên', 'Bảo Long', 'Cẩm Tú', 'Duy Khang', 'Minh Quân', 'Hải Đăng', 'Khánh Linh', 'Minh Thư'];
          const cohort = names.map((n, i) => ({
            user: i === 4 ? { id: 'uc3', username: 'minhquan', fullname: n, avatar: '' } : { id: 'nm' + i, username: 'newbie' + i, fullname: n, avatar: '' },
            joinedAt: ago(1 + i * 3.5),
            status: i === 2 ? 'left' : i === 5 ? 'removed' : 'stay',
            outAt: i === 2 ? ago(7.8) : i === 5 ? ago(10) : null,
            rejoined: false,
          }));
          return { status: 'ok', groupId: m.groupId, days: m.days, from: now - m.days * 864e5, now, cohort, actorPosts: { nm0: [ago(0.5)], nm3: [ago(2), ago(1)] }, actorChecked: cohort.length, truncated: false, errors: [] };
        }
        // Báo cáo tháng: nhật ký vào / rời hai tháng, 6 bài tháng báo cáo, 4 bài tháng trước
        if (m.type === 'monthly') {
          window.__monthly = m;
          const cur = BG.monthRange(m.month, now);
          const prev = BG.monthRange(BG.shiftMonth(m.month, -1), now);
          const at = (rg, d, h = 3) => new Date(rg.from + d * 864e5 + h * 3600e3).toISOString();
          const evt = (id, kind, time, useCase) => ({ id: 'ev' + id + time, time, useCase: useCase || (kind === 'in' ? 'join.community.as_member' : 'leave.group'), kind, label: '', user: { id, username: 'user_' + id, fullname: 'Người ' + id, avatar: '' }, actor: null });
          const events = [
            ...['p1', 'p2', 'p3', 'p4'].map((id, i) => evt(id, 'in', at(prev, 2 + i))),
            evt('p2', 'out', at(prev, 10)),
            ...['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) => evt(id, 'in', at(cur, 1 + i * 2))),
            evt('m2', 'out', at(cur, 3, 9)),
            evt('old', 'out', new Date(now - 3600e3).toISOString(), 'remove.member'), // sau tháng báo cáo
          ];
          const mk = (rg, i, extra = {}) => ({ ...P((rg === cur ? 'mc' : 'mp') + i, ['Kai Crypto', 'Lan Anh', 'Minh Quân'][i % 3], ['Bản tin thị trường tuần ' + (i + 1), 'Hỏi đáp ví lạnh', 'Phân tích BTC'][i % 3], 0), actor: { id: 'au' + (i % 3), username: ['kaicrypto', 'lananh', 'minhquan'][i % 3], fullname: ['Kai Crypto', 'Lan Anh', 'Minh Quân'][i % 3], avatar: '' }, publishedAt: at(rg, i + 1), reactions: 4 + i * 3, commentsCount: i, views: 120 + i * 30, ...extra });
          const curPosts = [...Array.from({ length: 5 }, (_, i) => mk(cur, i)), mk(cur, 9, { actor: { id: 'm1', username: 'user_m1', fullname: 'Người m1', avatar: '' }, text: 'Chào cả nhà, mình mới vào' })];
          return {
            status: 'ok',
            key: m.month,
            prevKey: prev.key,
            now,
            group: { id: m.groupId, name: (groups.find((g) => g.id === m.groupId) || {}).name || '', isCommunity: true, communityId: 'cCL', userCount: 12361 },
            events,
            eventsTruncated: false,
            months: { [cur.key]: { total: curPosts.length, posts: curPosts, truncated: false }, [prev.key]: { total: 4, posts: Array.from({ length: 4 }, (_, i) => mk(prev, i)), truncated: false } },
            actorPosts: { m1: [at(cur, 10)] },
            actorChecked: 5,
            errors: [],
          };
        }
        // Tự kiểm tra: phần lớn dùng được, vài mục bỏ qua vì quyền, một mục lỗi
        if (m.type === 'selfCheck') {
          window.__selfCheck = m;
          const it = (id, label, uses, status, detail, extra = {}) => ({ id, label, uses, status, detail, ms: 120, ...extra });
          const items = [
            it('login', 'Đăng nhập Beincom', 'mọi tính năng', 'ok', '@kaicrypto'),
            it('group', 'Thông tin group', 'Tổng quan, số thành viên', 'ok', '12.361 thành viên'),
            it('memberLog', 'Nhật ký thành viên theo ngày', 'báo cáo tháng, thành viên mới', 'ok', '61 sự kiện trong 30 ngày'),
            it('search', 'Tìm bài theo thời gian', 'báo cáo tháng, thành viên mới', 'ok', '1 bài trong 30 ngày'),
            it('reports', 'Báo cáo của người dùng', 'tab Báo cáo', 'skip', 'chỉ chủ / admin community xem được'),
            it('pinned', 'Bài ghim', 'ghim bài', 'fail', 'Không thấy API (404) — Beincom có thể đã đổi đường dẫn', { httpStatus: 404, path: 'content/contents/pinned-content/groups/' + m.groupId }),
          ];
          const r = { status: 'ok', at: Date.now(), group: { id: m.groupId, name: (groups.find((g) => g.id === m.groupId) || {}).name || '' }, mode: 'direct', items, summary: { ok: 4, skip: 1, fail: 1 } };
          store.selfCheck = r;
          return r;
        }
        if (m.type === 'nudgeEffect') {
          window.__nudgeEffect = (window.__nudgeEffect || 0) + 1;
          const items = [
            { id: 'pn2', groupId: 'gCL', groupName: 'Crypto Life', at: store.nudges[0].at, total: 2, posted: 0, commented: 1, active: 1, left: 0, pending: false, days: 2 },
            { id: 'pn1', groupId: 'gCL', groupName: 'Crypto Life', at: store.nudges[1].at, total: 4, posted: 1, commented: 1, active: 2, left: 1, pending: false, days: 9 },
          ];
          store.nudgeEffect = { at: Date.now(), items };
          return { status: 'ok', at: store.nudgeEffect.at, items };
        }
        if (m.type === 'telegramReport') {
          window.__tgReport = m;
          return { status: 'ok' };
        }
        if (m.type === 'telegramChatId') {
          window.__lastTg = m;
          return m.token.includes(':') ? { status: 'ok', chatId: '777001', name: 'Kai Crypto' } : { status: 'error', message: 'Token bot chưa đúng dạng (vd 123456789:AA…)' };
        }
        if (m.type === 'telegramTest') {
          window.__lastTg = m;
          store.telegramStatus = { at: Date.now(), ok: true };
          fire();
          return { status: 'ok' };
        }
        if (m.type === 'syncStatus') return { status: 'ok', deviceId: 'dA', keys: ['settings', 'rules'], at: now - 3600e3, fromOther: true, last: null };
        if (m.type === 'syncNow') {
          window.__lastSyncNow = m;
          if (m.enable) store.settings = { ...store.settings, syncSettings: true };
          store.syncStatus = { at: Date.now(), dir: m.mode, keys: ['settings', 'rules', 'postRules'], skipped: m.mode === 'push' ? ['groupRules'] : [] };
          fire();
          return { status: 'ok', mode: m.mode, keys: ['settings', 'rules', 'postRules'], skipped: [] };
        }
        if (m.type === 'commentWrite') {
          window.__lastCommentWrite = m;
          return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [], commentId: 'nc1' };
        }
        if (m.type === 'newMembers') {
          await new Promise((res) => setTimeout(res, 150));
          window.__lastNewMembers = m;
          return { status: 'ok', source: m.groupId === 'gFood' ? 'members' : 'activity', truncated: false, items: [
            { ...u(501, 'Ngọc Hân'), joinedAt: iso(20) },
            { ...u(502, 'Minh Khoa', { avatar: img }), joinedAt: iso(30) },
            { ...u(503, 'Thu Trang'), joinedAt: iso(60) },
            { id: 'u1', username: 'trnminhanh1', fullname: 'Trần Minh Anh', avatar: img, joinedAt: iso(70) },
          ] };
        }
        if (m.type === 'spamAct') {
          window.__lastSpamAct = m;
          if (m.action === 'dismiss' || m.action === 'undismiss') store.state.dismissedWaves = m.action === 'dismiss' ? [m.key] : [];
          else {
            const ids = new Set([...(m.postIds || []), ...(m.commentIds || [])]);
            store.state.recentComments = store.state.recentComments.map((c) => (ids.has(c.id) ? { ...c, isHidden: true } : c));
            store.state.recentPosts = store.state.recentPosts.map((p) => (ids.has(p.id) ? { ...p, isHidden: true } : p));
          }
          fire();
          return { status: 'ok', dryRun: false, ok: (m.postIds || []).length + (m.commentIds || []).length, dry: 0, failed: 0, errors: [] };
        }
        if (m.type === 'banEverywhere') {
          window.__lastBanAll = m;
          return { status: 'ok', dryRun: false, ok: 1, dry: 0, failed: 0, errors: [], done: ['gFood'] };
        }
        if (m.type === 'commentAct') {
          window.__lastCommentAct = m;
          const ids = new Set(m.commentIds);
          store.state.recentComments = store.state.recentComments.map((c) => (ids.has(c.id) ? (m.action === 'hide' ? { ...c, isHidden: true } : { ...c, dismissed: m.action === 'dismiss' }) : c));
          fire();
          return { status: 'ok', dryRun: false, ok: ids.size, dry: 0, failed: 0, errors: [] };
        }
        if (m.type === 'restoreBackup') {
          window.__restore = m;
          const d = m.data;
          if (d.settings) store.settings = { ...d.settings, ...(m.keepDry ? { dryRun: true } : {}) };
          for (const k of ['rules', 'postRules', 'groupRules', 'templates']) if (d[k]) store[k] = d[k];
          fire();
          return { status: 'ok', restored: ['Cài đặt chung', 'Quy tắc'] };
        }
        return { status: 'ok', ok: 0, dry: 0, failed: 0, errors: [] };
      },
    },
  };
})();
