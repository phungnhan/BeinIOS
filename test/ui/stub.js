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

  // Bài Article (#…&art=1): nội dung còn ở dạng JSON như bản lưu cũ, có ảnh bìa, tóm tắt, số phút đọc, tag
  if (new URLSearchParams(location.hash.slice(1)).get('art'))
    recent.push({
      ...P('ar1', 'Lê Thái Thịnh', JSON.stringify([{ type: 'p', children: [{ text: 'Một năm trước, ngân hàng truyền thống bắt đầu nhập cuộc crypto.' }] }, { type: 'p', children: [{ text: 'Việt Nam từng bước xây dựng khung pháp lý.' }] }]), 7, { cmt: 9 }),
      type: 'ARTICLE',
      title: '⏳ 1 Năm Nhìn Lại: Crypto Việt Nam',
      summary: 'Sau một năm, câu hỏi không còn là crypto có được chấp nhận.',
      cover: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="514"><rect width="1200" height="514" fill="#1971c2"/></svg>'),
      readMin: 7,
      reactions: 1956,
      tags: ['MULTICHAIN JOURNEY', 'CRYPTO'],
      links: [],
    });

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
  // Cài mới (#…&fresh=1): chưa có bản đã xem, chưa có nhật ký -> hiện Bắt đầu nhanh
  if (new URLSearchParams(location.hash.slice(1)).get('fresh')) {
    delete store.seenVersion;
    store.log = [];
    store.settings = { ...store.settings, dryRun: true }; // cài mới: Chạy thử bật sẵn
  }
  // Nhắc người mới: bản soạn sẵn sáng thứ Hai (3 người) và hai lần nhắc đã đăng (An Nhiên — nm0 — được nhắc 9 ngày trước)
  store.nudgeDraft = { id: 'nd1', groupId: 'gCL', groupName: 'Crypto Life', at: now - 2 * 3600e3, joined: 8, users: [0, 1, 2].map((i) => ({ id: 'nd' + i, username: 'thanhvienmoi' + i, fullname: 'Thành viên mới ' + i, avatar: '' })) };
  // Bài thảo luận: hai câu đã dùng (bài ps2, ps1 có số liệu) và bản soạn sẵn tuần này
  store.promptBank = {
    items: [
      { id: 'd1', text: 'Tuần này bạn đang theo dõi đồng coin / dự án nào? Chia sẻ lý do nhé 👇', uses: [{ postId: 'ps2', groupId: 'gCL', at: new Date(now - 5 * 864e5).toISOString() }] },
      { id: 'd2', text: 'Nếu chỉ được giữ một đồng coin trong 5 năm tới, bạn chọn đồng nào? Vì sao?', uses: [{ postId: 'ps1', groupId: 'gCL', at: new Date(now - 9 * 864e5).toISOString() }] },
      { id: 'd3', text: 'Sai lầm lớn nhất bạn từng mắc khi đầu tư crypto là gì?', uses: [] },
      { id: 'd4', text: 'Người mới vào crypto nên học điều gì đầu tiên? Góp ý cho các thành viên mới của {group} nhé!', uses: [] },
    ],
  };
  store.promptDraft = { id: 'pr1', promptId: 'd3', groupId: 'gCL', groupName: 'Crypto Life', text: 'Sai lầm lớn nhất bạn từng mắc khi đầu tư crypto là gì?', suggestAt: new Date(now + 2 * 864e5).toISOString(), basis: 'own', at: now - 3600e3 };
  // Popup (#…&pinfo=1): nền đã ghi sẵn gói số đếm (số khác hẳn kết quả quét mẫu để thấy popup đọc gói này)
  if (new URLSearchParams(location.hash.slice(1)).get('pinfo')) {
    store.popupInfo = { hasSnapshot: true, hasRecent: true, lastScan: now - 5 * 60e3, lastResult: { status: 'ok', message: '' }, totals: { requests: 17, posts: 4, reports: 1, autoFlagged: 0 }, flaggedPosts: 3, flaggedComments: 0, todo: [{ id: 'gCL', name: 'Crypto Life', isCommunity: true, communityName: '', pendingTotal: 17, approvalCount: 4 }] };
  }
  // Trang Chat (#…&chat=1): đã bật chat Beincom
  if (new URLSearchParams(location.hash.slice(1)).get('chat')) store.settings = { ...store.settings, chatEnabled: true };
  // Nơi nhận báo cáo sử dụng (#…&usage=1): addon hỏi ý gửi
  if (new URLSearchParams(location.hash.slice(1)).get('usage')) store.usageEndpoint = 'https://script.google.com/macros/s/AKfycbx_mau_thu_nghiem_123456/exec';
  // Báo cáo sử dụng: số đếm 2 ngày
  store.usage = { since: '2026-09-20', days: { [new Date(now + 7 * 3600e3 - 864e5).toISOString().slice(0, 10)]: { compose: 3, stats: 2 }, [new Date(now + 7 * 3600e3).toISOString().slice(0, 10)]: { act: 5, compose: 1 } } };
  // Việc đầu tuần sáng nay: 4 việc gộp một thông báo
  store.periodicDigest = { at: now - 3 * 3600e3, done: {}, dismissed: false, items: [
    { kind: 'welcome', line: 'Chào thành viên mới và vinh danh thành viên tích cực' },
    { kind: 'weekly', line: 'Tóm tắt tuần: 2 thành viên được duyệt · 1 báo cáo đã xử lý' },
    { kind: 'nudge', line: 'Bài nhắc 3 người mới chưa hoạt động (Crypto Life)' },
    { kind: 'prompt', line: 'Bài thảo luận cho Crypto Life (gợi ý Thứ Tư 20:00)' },
  ] };
  // Tự kiểm tra mỗi ngày: lần tự chạy sáng nay thấy một mục ngừng chạy
  store.selfCheckAuto = { at: now - 5 * 3600e3, groups: { gFood: { name: 'Food Research' }, gCL: { name: 'Crypto Life' } }, regressions: [{ groupId: 'gFood', group: 'Food Research', items: ['Bài ghim'] }] };
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
          listeners.forEach((fn) => fn(Object.fromEntries(Object.keys(o).map((k) => [k, { newValue: structuredClone(o[k]) }])), 'local'));
        },
        getBytesInUse: async () => JSON.stringify(store).length,
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
      getManifest: () => ({ version: '__VERSION__', permissions: ['storage', 'unlimitedStorage'] }), // harness.mjs điền phiên bản trong manifest.json
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
        // Tin nhắn chat bị báo cáo: đọc lại theo state, Ẩn / Bỏ qua bỏ khỏi danh sách
        if (m.type === 'chatReports') {
          await new Promise((res) => setTimeout(res, 100));
          window.__chatReportReads = (window.__chatReportReads || 0) + 1;
          return { status: 'ok', items: store.state.chatReports?.[m.communityId]?.items || [], more: false };
        }
        if (m.type === 'chatReportAct') {
          (window.__chatReportActs = window.__chatReportActs || []).push(m);
          const ids = new Set(m.items.map((x) => x.id));
          const c = store.state.chatReports?.[m.communityId];
          if (c) store.state.chatReports = { ...store.state.chatReports, [m.communityId]: { ...c, items: c.items.filter((x) => !ids.has(x.id)) } };
          fire();
          return { status: 'ok', dryRun: false, ok: m.items.length, dry: 0, failed: 0, errors: [], done: [...ids] };
        }
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
        // Tìm mọi bài của một người: bài gần đây + 2 bài cũ
        if (m.type === 'userPosts') {
          await new Promise((res) => setTimeout(res, 120));
          const own = store.state.recentPosts.filter((p) => p.actor.id === m.userId && !p.isHidden);
          const actor = own[0]?.actor || { id: m.userId, username: 'x', fullname: 'X', avatar: '' };
          return { status: 'ok', posts: [...own, { ...P('old1', 'X', 'Bài cũ: kèo x100 inbox mình', 24 * 20), actor }, { ...P('old2', 'X', 'Bài cũ: claim airdrop tại t.me/free', 24 * 40), actor }], truncated: false, errors: [] };
        }
        // Tìm & dọn: bài khớp từ khoá, gồm bài của spam bot, của mình và của admin
        if (m.type === 'sweepSearch') {
          await new Promise((res) => setTimeout(res, 120));
          window.__sweepSearch = m;
          const spam = { id: 'aspam', username: 'spambot', fullname: 'Spam Bot', avatar: '' };
          const pool = [
            { ...P('sw1', 'Spam Bot', 'Nhận airdrop miễn phí tại t.me/freeairdrop', 50), actor: spam },
            { ...P('sw2', 'Spam Bot', 'Claim airdrop x100 t.me/freeairdrop nhanh', 80), actor: spam },
            { ...P('sw3', 'Kai Crypto', 'Tổng hợp airdrop tuần này', 30), actor: { id: 'me1', username: 'kaicrypto', fullname: 'Kai Crypto', avatar: '' } },
            { ...P('sw4', 'Admin Hà', 'Cảnh báo: airdrop giả mạo đang lan truyền', 20), actor: { id: 'aAdmin', username: 'adminha', fullname: 'Admin Hà', avatar: '' } },
            { ...P('sw5', 'Người Mới', 'Hỏi về airdrop testnet', 10), actor: { id: 'anew', username: 'nguoimoi', fullname: 'Người Mới', avatar: '' } },
          ].filter((p) => !(window.__sweepHidden || []).includes(p.id));
          const k = m.keyword.toLowerCase();
          return { status: 'ok', posts: pool.filter((p) => p.text.toLowerCase().includes(k)), adminIds: ['aAdmin'], truncated: false, errors: [] };
        }
        if (m.type === 'cancelActions') return { status: 'ok' };
        // Trang Chat: 2 kênh Crypto Life (xoá được tin ở kênh chính), 2 tin nhắn riêng; tin của kênh chính qua 2 ngày
        if (m.type === 'chatOverview') {
          if (!store.settings.chatEnabled) return { status: 'off', message: 'Chưa bật' };
          const reqs = !!new URLSearchParams(location.hash.slice(1)).get('req');
          const cu = (n, name, un) => ({ id: 'u' + n, chatId: 'cu' + n, username: un, fullname: name, pictureAt: 0 });
          const ch = (id, title, type, extra = {}) => ({ id, teamId: 'tCL', teamName: 'crypto-life', communityId: 'cCL', groupId: 'g' + id, name: title, title, type, purpose: '', canDelete: false, canPost: true, lastPostAt: now - 60e3, total: 10, other: null, unread: 0, mentions: 0, ...extra });
          // Nhiều cuộc trò chuyện (#…&many=1): 12 tin nhắn riêng, 7 cộng đồng (2 đã ghim). Lần đọc nhanh chậm hơn chút (để thấy
          // khung chờ), chưa có tên 4 tin nhắn riêng cũ nhất, chưa rõ quyền gửi tin
          if (new URLSearchParams(location.hash.slice(1)).get('many')) {
            window.__chatQuick = (window.__chatQuick || 0) + (m.quick ? 1 : 0);
            window.__chatFull = (window.__chatFull || 0) + (m.quick ? 0 : 1);
            if (m.quick) await new Promise((res) => setTimeout(res, 600));
            const names = ['Lan Anh', 'Minh Quân', 'Hoa Mai', 'Tuấn', 'Bảo Ngọc', 'Thu Trang', 'Đức Huy', 'Ngọc Hân', 'Quốc Bảo', 'Thanh Tâm', 'Gia Hưng', 'Khánh Linh'];
            const dms = names.map((name, i) => {
              const unnamed = m.quick && i >= 8;
              return { ...ch('dm' + i, unnamed ? '' : name, 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: unnamed ? { id: '', chatId: 'cu' + (80 + i), username: '', fullname: '', pictureAt: 0 } : cu(80 + i, name, 'user' + i), unread: i === 0 ? 2 : 0, lastPostAt: now - (i + 1) * 600e3 };
            });
            const teams = Array.from({ length: 7 }, (_, i) => ({ id: 'tc' + i, name: 'cong-dong-' + i, title: 'Cộng đồng ' + (i + 1), communityId: 'cc' + i, pinned: i < 2, pinRank: i < 2 ? i : null, channels: [ch('chc' + i, 'Cộng đồng ' + (i + 1), 'O', { canPost: m.quick ? null : i !== 1, lastPostAt: now - i * 3600e3 })] }));
            return { status: 'ok', quick: !!m.quick, me: cu(1, 'Kai Crypto', 'kaicrypto'), dmTeam: { id: 'tDM', name: 'direct' }, teams, dms };
          }
          // Cộng đồng con (#…&tree=1): Hỏi đáp, Sự kiện là group con của kênh chính (Hỏi đáp có ảnh), Kiến thức là group cháu (tin mới nhất)
          const TREE = new URLSearchParams(location.hash.slice(1)).get('tree');
          return {
            status: 'ok',
            me: cu(1, 'Kai Crypto', 'kaicrypto'),
            dmTeam: { id: 'tDM', name: 'direct' },
            threads: { unread: Math.max(0, 2 - (window.__threadSeen || []).length), mentions: (window.__threadSeen || []).includes('n2') ? 0 : 1 },
            teams: [{ id: 'tCL', name: 'crypto-life', title: 'Crypto Life', communityId: 'cCL', icon: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#6c3cf0"/></svg>'), channels: [ch('chMain', 'Crypto Life', 'O', { canDelete: true, unread: window.__chatRead ? 0 : 2, lastPostAt: now - 30e3, main: true }), ch('chSub', 'Hỏi đáp', 'P', { canPost: false, purpose: 'Kênh hỏi đáp', lastPostAt: now - 3600e3, ...(TREE ? { level: 1, parentGroupId: 'gchMain', icon: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#1f9d55"/></svg>') } : {}) }), ...(TREE ? [ch('chDeep', 'Kiến thức', 'O', { level: 2, parentGroupId: 'gchSub', lastPostAt: now - 10e3 }), ch('chEvt', 'Sự kiện', 'O', { level: 1, parentGroupId: 'gchMain', lastPostAt: now - 7200e3 })] : [])] }],
            dms: [
              // Nhắn cho chính mình (#…&self=1): Nhật ký cá nhân
              ...(new URLSearchParams(location.hash.slice(1)).get('self') ? [{ ...ch('dmSelf', 'Nhật ký cá nhân', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', self: true, other: { ...cu(1, 'Kai Crypto', 'kaicrypto'), id: 'me1', verified: true }, lastPostAt: now - 30 * 864e5 }] : []),
              { ...ch('dm1', 'Lan Anh', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: { ...cu(50, 'Lan Anh', 'lananh'), verified: true, premium: 'lifetime' }, unread: 1, lastPostAt: now - 120e3 },
              // Lời mời mình gửi đi, chờ người nhận chấp nhận (#…&req=1)
              ...(reqs ? [{ ...ch('sent1', 'Hải Yến', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: cu(55, 'Hải Yến', 'haiyen'), lastPostAt: now - 5 * 3600e3, contact: { id: 'ct9', status: 'pending', incoming: false, sent: true, ignoredByOther: false } }] : []),
              { ...ch('dm2', 'Minh Quân', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: cu(51, 'Minh Quân', 'minhquan'), lastPostAt: now - 3 * 864e5 },
            ],
            // Lời mời trò chuyện: người chưa kết nối nhắn cho mình (#…&req=1)
            requests: reqs
              ? [
                  { ...ch('rq1', 'Người Lạ', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: cu(52, 'Người Lạ', 'nguoila'), unread: 1, lastPostAt: now - 600e3, contact: { id: 'ct1', status: 'pending', incoming: true, sent: false, ignoredByOther: false } },
                  { ...ch('rq2', 'Tặng Quà', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: cu(53, 'Tặng Quà', 'tangqua'), lastPostAt: now - 3600e3, contact: { id: 'ct2', status: 'spammed', incoming: true, sent: false, ignoredByOther: false } },
                  { ...ch('rq3', 'Bạn Mới', 'D'), teamId: 'tDM', teamName: 'direct', groupId: '', other: cu(54, 'Bạn Mới', 'banmoi'), lastPostAt: now - 7200e3, contact: { id: 'ct3', status: 'pending', incoming: true, sent: false, ignoredByOther: false } },
                ].filter((x) => !(window.__accepted || []).includes(x.contact.id))
              : [],
          };
        }
        // Thread của tin (#…: tin n2 có 1 bình luận n3 của Kai)
        if (m.type === 'chatThread') {
          window.__chatThreads = (window.__chatThreads || 0) + 1;
          const tp = (id, n, name, un, text, min, extra = {}) => ({ id, channelId: 'chMain', user: { id: 'u' + n, chatId: 'cu' + n, username: un, fullname: name, pictureAt: 0, ...(n === 62 ? { verified: true, premium: 'lifetime' } : {}) }, createAt: now - min * 60e3, updateAt: now - min * 60e3, editAt: 0, deleted: false, system: false, message: text, rootId: '', replyCount: 0, pinned: false, files: [], participants: [], following: false, ...extra });
          if (m.rootId !== 'n2') return { status: 'ok', posts: [], hasNext: false };
          // #…&imgs=…: bình luận n3 có 2 ảnh (xem ảnh trong khung bình luận)
          const tpic = (id, n) => ({ id, name: `binh-luan-${n}.png`, mime: 'image/png', size: 1000, url: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#2b8a3e"/></svg>`), width: 400, height: 300 });
          const timgs = new URLSearchParams(location.hash.slice(1)).get('imgs') ? { files: [tpic('tf1', 1), tpic('tf2', 2)] } : {};
          // #…&me=1: thêm bình luận dài của Lan Anh và bình luận của mình trả lời nó (khung trích dài không được tràn khung)
          const tme = new URLSearchParams(location.hash.slice(1)).get('me')
            ? [
                tp('n5', 62, 'Lan Anh', 'lananh', '@kaicrypto này dùng metamask trên iphone mua được đúng không anh, em thấy nhiều người bảo phải dùng ví khác mới được', 4, { rootId: 'n2' }),
                tp('n6', 1, 'Kai Crypto', 'kaicrypto', '@lananh Không phải swap gì đâu em. Chỉ là gửi tài sản đến ví rồi điền form thôi', 3, { rootId: 'n2', quote: { id: 'n5', url: 'https://chat.beincom.com/crypto-life/pl/n5' } }),
                tp('n7', 1, 'Kai Crypto', 'kaicrypto', 'Có bạn mua 100k lun', 2, { rootId: 'n2' }),
              ]
            : [];
          return { status: 'ok', posts: [tp('n2', 62, 'Lan Anh', 'lananh', '@kaicrypto ơi cho em hỏi **ví lạnh** nào tốt?', 29, { replyCount: 1 + tme.length }), tp('n3', 1, 'Kai Crypto', 'kaicrypto', 'Ledger hoặc Trezor đều ổn', 5, { rootId: 'n2', ...timgs }), ...tme], hasNext: false };
        }
        // Thread đang theo dõi: tin n2 (Crypto Life, 1 bình luận chưa đọc, có nhắc tên), tin nhắn riêng với Lan Anh (chưa đọc),
        // kênh Hỏi đáp (đã đọc)
        if (m.type === 'chatThreads') {
          window.__chatThreadsCalls = [...(window.__chatThreadsCalls || []), { unread: !!m.unread }];
          const u = (n, name, un, extra = {}) => ({ id: 'u' + n, chatId: 'cu' + n, username: un, fullname: name, pictureAt: 0, ...extra });
          const root = (id, ch, user, text, min) => ({ id, channelId: ch, user, createAt: now - min * 60e3, updateAt: now - min * 60e3, editAt: 0, deleted: false, system: false, message: text, rootId: '', replyCount: 1, pinned: false, files: [], participants: [], following: true });
          const all = [
            { id: 'n2', teamId: 'tCL', channelId: 'chMain', replyCount: 1, lastReplyAt: now - 5 * 60e3, unreadReplies: 1, unreadMentions: 1, participants: [u(1, 'Kai Crypto', 'kaicrypto')], root: root('n2', 'chMain', u(62, 'Lan Anh', 'lananh', { verified: true, premium: 'lifetime' }), '@kaicrypto ơi cho em hỏi **ví lạnh** nào tốt?', 29) },
            { id: 'd1', teamId: 'tDM', channelId: 'dm1', replyCount: 2, lastReplyAt: now - 20 * 60e3, unreadReplies: 2, unreadMentions: 0, participants: [u(50, 'Lan Anh', 'lananh')], root: root('d1', 'dm1', u(50, 'Lan Anh', 'lananh'), 'Chào anh!', 3) },
            { id: 'q1', teamId: 'tCL', channelId: 'chSub', replyCount: 4, lastReplyAt: now - 3 * 3600e3, unreadReplies: 0, unreadMentions: 0, participants: [], root: root('q1', 'chSub', u(64, 'Bảo Ngọc', 'baongoc'), 'Hỏi về ví lạnh', 300) },
          ];
          const list = m.unread ? all.filter((t) => t.unreadReplies && !(window.__threadSeen || []).includes(t.id)) : all.map((t) => ((window.__threadSeen || []).includes(t.id) ? { ...t, unreadReplies: 0, unreadMentions: 0 } : t));
          return { status: 'ok', threads: list, total: 3, unreadThreads: list.filter((t) => t.unreadReplies).length, failed: 0 };
        }
        // Tin đã ghim (o1 của Hoa Mai, trừ khi đã bỏ ghim), ghim / bỏ ghim, sửa tin, gợi ý tên
        // Biểu cảm: thả / bỏ, ai đã thả; tìm tin (n1 ở Crypto Life, bình luận n3, tin nhắn riêng d1)
        if (m.type === 'chatReact') {
          (window.__chatReacts = window.__chatReacts || []).push({ postId: m.postId, emoji: m.emoji, add: m.add });
          return { status: 'ok', added: m.add };
        }
        if (m.type === 'chatReactions') return { status: 'ok', reactions: { '+1': [{ chatId: 'cu60', fullname: 'Hoa Mai' }, { chatId: 'cu63', fullname: 'Minh' }], heart: [{ chatId: 'cu1', fullname: 'Kai Crypto' }], bic_star: [{ chatId: 'cu60', fullname: 'Hoa Mai' }] } };
        if (m.type === 'chatSearch') {
          window.__chatSearches = [...(window.__chatSearches || []), { terms: m.terms, channelId: m.channelId || '' }];
          const sp = (id, ch, n, name, un, text, min, extra = {}) => ({ id, channelId: ch, user: { id: 'u' + n, chatId: 'cu' + n, username: un, fullname: name, pictureAt: 0 }, createAt: now - min * 60e3, updateAt: now - min * 60e3, editAt: 0, deleted: false, system: false, message: text, rootId: '', replyCount: 0, pinned: false, files: [], participants: [], following: false, reactions: [], ...extra });
          const all = [sp('n1', 'chMain', 62, 'Lan Anh', 'lananh', 'Mọi người xem bài này https://group.beincom.com/posts/abc nhé', 30), sp('n3', 'chMain', 1, 'Kai Crypto', 'kaicrypto', 'Ledger hoặc Trezor đều ổn', 5, { rootId: 'n2' }), sp('d1', 'dm1', 50, 'Lan Anh', 'lananh', 'Chào anh!', 3)];
          const t = String(m.terms || '').toLowerCase();
          return { status: 'ok', posts: all.filter((p) => p.message.toLowerCase().includes(t) && (!m.channelId || p.channelId === m.channelId)) };
        }
        if (m.type === 'chatPinned') {
          const pins = (window.__unpinned || []).includes('o1') || m.channelId !== 'chMain' ? [] : [{ id: 'o1', channelId: 'chMain', user: { id: 'u60', chatId: 'cu60', username: 'hoamai', fullname: 'Hoa Mai', pictureAt: 0 }, createAt: now - 26 * 3600e3, updateAt: now - 26 * 3600e3, editAt: 0, deleted: false, system: false, message: 'Tin hôm qua', rootId: '', replyCount: 0, pinned: true, files: [], participants: [], following: false }];
          return { status: 'ok', posts: [...(window.__pinnedNew || []), ...pins] };
        }
        if (m.type === 'chatPin') {
          (window.__chatPins = window.__chatPins || []).push({ postId: m.postId, pin: m.pin });
          if (!m.pin) window.__unpinned = [...(window.__unpinned || []), m.postId];
          return { status: 'ok', ok: 1, dry: 0, failed: 0, errors: [], dryRun: false, pinned: m.pin };
        }
        if (m.type === 'chatEdit') {
          (window.__chatEdits = window.__chatEdits || []).push({ postId: m.postId, message: m.message });
          return { status: 'ok', post: { id: m.postId, message: m.message, editAt: Date.now() } };
        }
        if (m.type === 'chatMentions') {
          window.__mentionCalls = (window.__mentionCalls || 0) + 1;
          const people = [['cu62', 'u62', 'lananh', 'Lan Anh', { verified: true, premium: 'lifetime' }], ['cu60', 'u60', 'hoamai', 'Hoa Mai', {}], ['cu63', 'u63', 'minh', 'Minh', {}], ['cu1', 'u1', 'kaicrypto', 'Kai Crypto', {}]];
          const t = String(m.term || '').toLowerCase();
          return { status: 'ok', users: people.filter(([, , un, fn]) => un.startsWith(t) || fn.toLowerCase().startsWith(t)).map(([chatId, id, username, fullname, x]) => ({ id, chatId, username, fullname, pictureAt: 0, ...x })) };
        }
        if (m.type === 'chatFollow') {
          (window.__chatFollows = window.__chatFollows || []).push({ teamId: m.teamId, rootId: m.rootId, follow: m.follow });
          return { status: 'ok', following: m.follow };
        }
        if (m.type === 'chatThreadRead') {
          window.__threadSeen = [...(window.__threadSeen || []), m.rootId];
          return { status: 'ok' };
        }
        if (m.type === 'chatPosts') {
          // Ghi lại lệnh đọc tin (kiểm tra nhớ tin / tải trước); window.__postsDelay: máy chủ chậm (ms)
          (window.__postsCalls = window.__postsCalls || []).push({ channelId: m.channelId, since: m.since || 0, before: m.before || '' });
          if (window.__postsDelay) await new Promise((res) => setTimeout(res, window.__postsDelay));
          // Lan Anh (cu62): đã xác minh, Premium trọn đời
          const cp = (id, n, name, un, text, min, extra = {}) => ({ id, channelId: m.channelId, user: { id: 'u' + n, chatId: 'cu' + n, username: un, fullname: name, pictureAt: 0, ...(n === 62 ? { verified: true, premium: 'lifetime' } : {}) }, createAt: now - min * 60e3, updateAt: now - min * 60e3, editAt: 0, deleted: false, system: false, message: text, rootId: '', replyCount: 0, pinned: false, files: [], participants: [], following: false, ...extra });
          const base = [
            cp('o1', 60, 'Hoa Mai', 'hoamai', 'Tin hôm qua', 26 * 60, { pinned: !(window.__unpinned || []).includes('o1') }),
            cp('o2', 1, 'Kai Crypto', 'kaicrypto', 'Chào cả nhà, tối nay có AMA nhé', 25 * 60),
            cp('sys1', 61, 'Tuấn', 'tuan', 'tuan đã vào kênh', 40, { system: true }),
            cp('n1', 62, 'Lan Anh', 'lananh', 'Mọi người xem bài này https://group.beincom.com/posts/abc nhé', 30, { reactions: [{ name: '+1', count: 2, mine: false, top: ['cu60', 'cu63'] }, { name: 'heart', count: 1, mine: true, top: ['cu1'] }, { name: 'bic_purple_heart', count: 1, mine: false, top: ['cu60'] }] }),
            cp('n2', 62, 'Lan Anh', 'lananh', '@kaicrypto ơi cho em hỏi **ví lạnh** nào tốt?', 29),
            cp('n3', 1, 'Kai Crypto', 'kaicrypto', 'Ledger hoặc Trezor đều ổn', 5, { rootId: 'n2' }),
            cp('n4', 63, 'Minh', 'minh', '', 2, { files: [{ id: 'f1', name: 'bieu-do.png', mime: 'image/png', size: 120000, url: '', mini: '', width: 400, height: 300 }, { id: 'f2', name: 'bao-cao.pdf', mime: 'application/pdf', size: 2400000, url: '', mini: '' }] }),
          ];
          // Ảnh trong tin (#…&imgs=1): một tin 3 ảnh + một tin 1 ảnh (ảnh SVG 1600×1000, lớn hơn khung để bấm xem đúng cỡ)
          // và một ảnh chỉ có bản xem trước
          const imgs = new URLSearchParams(location.hash.slice(1)).get('imgs');
          if (imgs) {
            const pic = (id, n, color) => ({ id, name: `anh-${n}.png`, mime: 'image/png', size: 300000, url: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="${color}"/><text x="800" y="560" font-size="220" text-anchor="middle" fill="#fff" font-family="sans-serif">${n}</text></svg>`), mini: '', width: 1600, height: 1000 });
            // #…&imgs=6: thêm một tin 6 ảnh (lưới hiện 4, ô cuối "+2")
            if (imgs === '6') base.push(cp('im6', 65, 'Thu Trang', 'thutrang', 'Album sự kiện', 6, { files: Array.from({ length: 6 }, (_, k) => pic('f6' + k, 'A' + (k + 1), ['#5f3dc4', '#2b8a3e', '#e67700', '#1971c2', '#c2255c', '#495057'][k])) }));
            base.push(
              cp('im1', 63, 'Minh', 'minh', 'Ảnh buổi AMA tối qua', 4, { files: [pic('f11', 1, '#6c3cf0'), pic('f12', 2, '#0f9d76'), pic('f13', 3, '#d9480f')] }),
              cp('im2', 62, 'Lan Anh', 'lananh', 'Thêm một ảnh nữa', 3, { files: [pic('f21', 4, '#1c7ed6')] }),
              cp('im3', 64, 'Bảo Ngọc', 'baongoc', '', 1, { files: [{ id: 'f31', name: 'xem-truoc.jpg', mime: 'image/jpeg', size: 90000, url: '', mini: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==' }] }),
            );
          }
          // Tin trả lời, link Beincom, thẻ xem trước (#…&lk=1): lq1 trả lời n2 (đang hiện), lq2 trả lời tin cũ (đọc thêm),
          // lk1 có link Article trong <…>, og1 có thẻ xem trước
          if (new URLSearchParams(location.hash.slice(1)).get('lk'))
            base.push(
              cp('lq1', 63, 'Minh', 'minh', 'Mình cũng muốn hỏi câu này', 2, { quote: { id: 'n2', url: 'https://chat.beincom.com/crypto-life/pl/n2' }, quotePrefix: '[](bein.mm.reply)https://chat.beincom.com/crypto-life/pl/n2[](bein.mm.reply)\n' }),
              cp('lq2', 64, 'Bảo Ngọc', 'baongoc', 'Đồng ý với bạn', 2, { quote: { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', url: 'https://chat.beincom.com/crypto-life/pl/zzzzzzzzzzzzzzzzzzzzzzzzzz' } }),
              cp('lk1', 62, 'Lan Anh', 'lananh', 'Chi tiết ở bài viết bên dưới nhé <https://group.beincom.com/article/c8d60d10-c10b-4851-935a-1cff8a04ecf2>', 1),
              cp('og1', 60, 'Hoa Mai', 'hoamai', 'https://example.com/tin', 1, { og: { url: 'https://example.com/tin', title: 'Tin thị trường hôm nay', description: 'Bitcoin tăng mạnh', site: 'Example', image: '' } }),
            );
          // Tin của mình đủ kiểu (#…&me=1): biểu cảm Beincom trong chữ + ảnh + biểu cảm + thread, tin trả lời, định dạng, ngắn
          if (new URLSearchParams(location.hash.slice(1)).get('me')) {
            const mpic = { id: 'mf1', name: 'hidden-gem.png', mime: 'image/png', size: 300000, url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#b197fc"/><stop offset="1" stop-color="#f783ac"/></linearGradient></defs><rect width="1200" height="520" fill="url(#g)"/></svg>'), mini: '', width: 1200, height: 520 };
            base.push(
              cp('me1', 1, 'Kai Crypto', 'kaicrypto', ':bic_glowing_star: Hidden Gem #03: Beincom ($BIC) :bic_glowing_star:\nThảo luận về $BIC ở thread này.', 9, { files: [mpic], replyCount: 8, following: true, participants: [{ id: 'u62', chatId: 'cu62', username: 'lananh', fullname: 'Lan Anh', pictureAt: 0 }], reactions: [{ name: 'bic_hugging_face', count: 1, mine: false, top: ['cu60'] }, { name: '+1', count: 4, mine: true, top: ['cu1'] }] }),
              cp('me2', 1, 'Kai Crypto', 'kaicrypto', '5613', 8, { quote: { id: 'n2', url: 'https://chat.beincom.com/crypto-life/pl/n2' }, quotePrefix: '[](bein.mm.reply) https://chat.beincom.com/crypto-life/pl/n2 [](bein.mm.reply)\n' }),
              cp('me3', 1, 'Kai Crypto', 'kaicrypto', '> Ghi chú cho admin\n\n- Xem bài https://group.beincom.com/posts/abc\n- Chạy `npm i` rồi báo @lananh nhé', 7),
              cp('me4', 1, 'Kai Crypto', 'kaicrypto', 'xin chào', 6),
            );
          }
          // Tin có định dạng (#…&md=1): trích dẫn, danh sách, mã, gạch, nghiêng, link có chữ; độ ưu tiên Khẩn cấp
          if (new URLSearchParams(location.hash.slice(1)).get('md')) base.push(cp('mk1', 66, 'Quốc Bảo', 'quocbao', '> Lịch AMA tuần này\n\n- Thứ Hai: ~~20h~~ *21h*\n- Thứ Sáu: [đăng ký](https://group.beincom.com/ama)\n\n```\nnpm i\n```', 1, { priority: 'urgent' }));
          if (m.since) return { status: 'ok', posts: window.__chatIncoming || [], hasMore: false };
          if (m.before) return { status: 'ok', posts: [cp('x1', 64, 'Bảo Ngọc', 'baongoc', 'Tin cũ hơn nữa', 50 * 60), cp('x2', 64, 'Bảo Ngọc', 'baongoc', 'Tin cũ thứ hai', 49 * 60)], hasMore: false };
          if (m.channelId !== 'chMain') return { status: 'ok', posts: [cp('d1', 50, 'Lan Anh', 'lananh', 'Chào anh!', 3)], hasMore: false };
          // Như nền (gộp thread): chỉ tin gốc; tin n2 có 1 bình luận của Kai
          return { status: 'ok', posts: base.filter((p) => !p.rootId).map((p) => (p.id === 'n2' ? { ...p, replyCount: 1, participants: [{ id: 'u1', chatId: 'cu1', username: 'kaicrypto', fullname: 'Kai Crypto', pictureAt: 0 }] } : p)), hasMore: true };
        }
        // Tin được trích không có trong phần đang hiện; tên link Beincom
        if (m.type === 'chatQuotes') {
          window.__quoteCalls = [...(window.__quoteCalls || []), m.ids];
          await new Promise((res) => setTimeout(res, 60));
          return { status: 'ok', posts: Object.fromEntries(m.ids.map((id) => [id, id === 'zzzzzzzzzzzzzzzzzzzzzzzzzz' ? { id, user: { id: 'u70', chatId: 'cu70', username: 'nguoicu', fullname: 'Người Cũ' }, message: 'Tin cũ đã **trôi**', files: 0 } : { id, missing: true }])) };
        }
        if (m.type === 'beinLinkNames') {
          window.__linkCalls = [...(window.__linkCalls || []), m.links];
          await new Promise((res) => setTimeout(res, 60));
          return { status: 'ok', names: Object.fromEntries(m.links.filter((l) => l.kind === 'content').map((l) => [`content:${l.id}`, { name: '1 Năm Nhìn Lại: Crypto Việt Nam', type: 'ARTICLE' }])) };
        }
        if (m.type === 'chatContact') {
          (window.__chatContacts = window.__chatContacts || []).push(m);
          if (m.action === 'accept') (window.__accepted = window.__accepted || []).push(m.contactId);
          return { status: 'ok' };
        }
        if (m.type === 'chatSend') {
          (window.__chatSends = window.__chatSends || []).push(m);
          // window.__sendDelay: máy chủ chậm (ms); window.__sendFail: gửi lỗi
          if (window.__sendDelay) await new Promise((res) => setTimeout(res, window.__sendDelay));
          if (window.__sendFail) return { status: 'error', message: 'Gửi tin lỗi: mất kết nối' };
          if (m.acceptContactId) (window.__accepted = window.__accepted || []).push(m.acceptContactId);
          return { status: 'ok', accepted: !!m.acceptContactId, post: { id: 'new' + window.__chatSends.length, channelId: m.channelId, user: { id: 'me1', chatId: 'cu1', username: 'kaicrypto', fullname: 'Kai Crypto', pictureAt: 0 }, createAt: Date.now(), updateAt: Date.now(), editAt: 0, deleted: false, system: false, message: m.message, rootId: m.rootId || '', replyCount: 0, pinned: false, files: [] } };
        }
        if (m.type === 'chatView') {
          window.__chatRead = (window.__chatRead || 0) + 1;
          return { status: 'ok' };
        }
        // Tải tệp lên chat: ghi lại (không giữ nội dung tệp), trả mã tệp
        if (m.type === 'chatUpload') {
          (window.__chatUploads = window.__chatUploads || []).push({ channelId: m.channelId, name: m.name, mime: m.mime, bytes: Math.floor((m.data || '').length * 0.75) });
          return { status: 'ok', file: { id: 'fu' + window.__chatUploads.length, name: m.name, mime: m.mime, size: 3 } };
        }
        if (m.type === 'chatDeleteMsg') {
          (window.__chatDeletes = window.__chatDeletes || []).push(m);
          return { status: 'ok', ok: 1, dry: 0, failed: 0, errors: [], dryRun: false };
        }
        if (m.type === 'chatRefresh') {
          window.__chatRefresh = (window.__chatRefresh || 0) + 1;
          return { status: 'ok', channels: (store.state.chatMap?.channels || []).length };
        }
        if (m.type === 'chatAct') {
          (window.__chatActs = window.__chatActs || []).push(m);
          const ids = new Set(m.ids);
          store.state.chatMessages = (store.state.chatMessages || []).map((x) => (!ids.has(x.id) ? x : m.action === 'delete' ? { ...x, deleted: true } : { ...x, dismissed: m.action === 'dismiss' }));
          fire();
          return { status: 'ok', dryRun: false, ok: m.ids.length, dry: 0, failed: 0, errors: [], deleted: m.action === 'delete' ? m.ids : [] };
        }
        if (m.type === 'guardAct') {
          (window.__guardActs = window.__guardActs || []).push(m);
          if (m.action === 'notImpostor') store.state.impostors = store.state.impostors.filter((x) => !m.userIds.includes(x.user.id));
          if (m.action === 'dismissBurst') store.state.bursts[m.groupId].dismissed = true;
          fire();
          return { status: 'ok' };
        }
        if (m.type === 'guardSearch') {
          await new Promise((res) => setTimeout(res, 150));
          return { status: 'ok', checked: 42, found: 1, added: 0, admins: 2 };
        }
        if (m.type === 'hidePosts') {
          window.__hidePosts = m;
          (window.__hideCalls = window.__hideCalls || []).push(m.posts.map((p) => p.id));
          // Nhật ký dở dang như service worker ghi sau mỗi mục (Dashboard hiện tiến độ)
          for (let i = 1; i <= m.posts.length; i++) {
            await chrome.storage.local.set({ actionJournal: { run: 'x', at: Date.now(), total: m.posts.length, entries: m.posts.slice(0, i).map((p) => ({ contentId: p.id, status: 'ok' })) } });
            await new Promise((res) => setTimeout(res, 120));
          }
          await chrome.storage.local.remove('actionJournal');
          (window.__sweepHidden = window.__sweepHidden || []).push(...m.posts.map((p) => p.id));
          return { status: 'ok', dryRun: false, ok: m.posts.length, dry: 0, failed: 0, errors: [], hidden: m.posts.map((p) => p.id), skipped: 0 };
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
            team: [
              ...[1, 2, 3].map((i) => ({ id: 'tm' + i, time: at(cur, i), useCase: 'approve.join_request', col: 'approved', label: 'Duyệt vào', actor: { id: 'me1', username: 'kaicrypto', fullname: 'Kai Crypto', avatar: '' }, user: { id: 'm' + i, username: 'user_m' + i, fullname: 'Người m' + i, avatar: '' }, groupId: m.groupId, groupName: 'Crypto Life', change: '' })),
              { id: 'tm4', time: at(cur, 4), useCase: 'remove.member', col: 'removed', label: 'Xoá thành viên', actor: { id: 'aHa', username: 'adminha', fullname: 'Admin Hà', avatar: '' }, user: { id: 'sp', username: 'spam', fullname: 'Spam', avatar: '' }, groupId: m.groupId, groupName: 'Crypto Life', change: '' },
              { id: 'tm5', time: at(cur, 6), useCase: 'update.group.settings', col: 'settings', label: 'Đổi cài đặt', actor: { id: 'aHa', username: 'adminha', fullname: 'Admin Hà', avatar: '' }, user: null, groupId: m.groupId, groupName: 'Crypto Life', change: 'Duyệt thành viên: tắt → bật' },
            ],
            teamTruncated: false,
            teamSkipped: [],
            // Chat: 7 tin tháng này (3 người), 4 tin tháng trước
            chat: {
              channels: [{ id: 'chMain', name: 'Crypto Life' }],
              messages: [...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ t: Date.parse(at(cur, 1 + i)), ch: 'chMain', u: { id: 'u' + (i % 3), username: 'user' + (i % 3), fullname: 'Người ' + (i % 3) } })), ...[0, 1, 2, 3].map((i) => ({ t: Date.parse(at(prev, 2 + i)), ch: 'chMain', u: { id: 'u9', username: 'user9', fullname: 'Người 9' } }))],
              truncated: false,
            },
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
            // Nhóm Chat Beincom
            it('chat', 'Chat: đăng nhập', 'mọi phần Chat', 'ok', '@kaicrypto', { section: 'chat' }),
            it('chatReports', 'Chat: tin nhắn bị báo cáo', 'tab Báo cáo → Tin nhắn chat', 'skip', 'chỉ chủ / admin community (chọn group gốc)', { section: 'chat' }),
          ];
          const r = { status: 'ok', at: Date.now(), group: { id: m.groupId, name: (groups.find((g) => g.id === m.groupId) || {}).name || '' }, mode: 'direct', items, summary: { ok: 5, skip: 2, fail: 1 } };
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
        if (m.type === 'usageSend') {
          window.__usageSends = (window.__usageSends || 0) + 1;
          if (store.usageConsent?.choice !== 'yes') return { status: 'error', message: 'Chưa đồng ý gửi báo cáo sử dụng' };
          store.usageSent = { at: Date.now(), ok: true, error: '' };
          return { status: 'ok', sent: store.usageSent };
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
        // Bài đầy đủ (cửa sổ Bài viết & bình luận): Article ar1 có các khối nội dung
        if (m.type === 'postFull') {
          window.__postFull = [...(window.__postFull || []), m.id];
          await new Promise((res) => setTimeout(res, 60));
          if (m.id !== 'ar1') return { status: 'ok', nodes: null, text: (store.state.recentPosts.find((p) => p.id === m.id) || {}).text || '' };
          const nodes = [
            { type: 'h2', children: [{ text: 'Bước đi của ngân hàng lớn' }] },
            { type: 'p', children: [{ text: 'Đoạn mở đầu, xem ' }, { type: 'a', url: 'https://example.com/nguon', children: [{ text: 'nguồn', bold: true }] }, { text: '.' }] },
            { type: 'ul', children: [{ type: 'li', children: [{ type: 'lic', children: [{ text: 'Ý thứ nhất' }] }] }, { type: 'li', children: [{ type: 'lic', children: [{ text: 'Ý thứ hai' }] }] }] },
            { type: 'blockquote', children: [{ text: 'Kỷ yếu lớn' }] },
            { type: 'a', url: 'javascript:alert(1)', children: [{ text: 'link xấu' }] },
          ];
          return { status: 'ok', nodes, text: 'Bước đi của ngân hàng lớn\nĐoạn mở đầu, xem nguồn.', post: { title: '⏳ 1 Năm Nhìn Lại: Crypto Việt Nam', readMin: 7 } };
        }
        // Cửa sổ Bài viết & bình luận: bình luận gốc của bài (cm1 có 1 trả lời đọc riêng); bài t1 có thêm một trang cũ hơn
        if (m.type === 'postComments') {
          window.__postComments = [...(window.__postComments || []), { postId: m.postId, after: m.after || '', parentId: m.parentId || '' }];
          await new Promise((res) => setTimeout(res, 80));
          const all = store.state.recentComments.filter((c) => c.postId === m.postId);
          if (m.parentId) return { status: 'ok', items: all.filter((c) => c.parentId === m.parentId), hasNext: false, after: '' };
          if (m.after === 'p2') return { status: 'ok', items: [{ ...all[0], id: 'old1', text: 'Bình luận cũ nhất', createdAt: new Date(now - 30 * 3600e3).toISOString(), parentId: '', totalReply: 0 }], hasNext: false, after: '' };
          const roots = all.filter((c) => !c.parentId).map((c) => (c.id === 'cm1' ? { ...c, totalReply: 1 } : c));
          return { status: 'ok', items: roots, hasNext: m.postId === 't1', after: m.postId === 't1' ? 'p2' : '' };
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
