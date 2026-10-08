// Kiểm tra các hàm thuần trong common.js (chạy: node --test test/)
const test = require('node:test');
const assert = require('node:assert/strict');
const BG = require('../common.js');

const user = (extra) => ({
  id: 'u1',
  username: 'alice',
  fullname: 'Alice Nguyễn',
  avatar: 'https://media.beincom.com/image/variants/user/avatar/abc',
  isVerified: true,
  isDeactivated: false,
  premium: false,
  nft: false,
  ...extra,
});
const req = (extra = {}, userExtra = {}) => ({ id: 'r1', userId: 'u1', createdAt: '2026-10-07T10:00:00Z', answers: [], ...extra, user: user(userExtra) });
const Q = [
  { id: 'q1', question: 'Bạn biết nhóm qua đâu?', isRequired: true },
  { id: 'q2', question: 'Mã giới thiệu', isRequired: false },
];

test('norm: bỏ dấu, chữ thường', () => {
  assert.equal(BG.norm('  Nhận THƯỞNG Đặc Biệt '), 'nhan thuong dac biet');
});

test('parseList: dấu phẩy hoặc xuống dòng, bỏ trùng; username bỏ @ và chữ thường', () => {
  assert.deepEqual(BG.parseList('a, b\nc,, a'), ['a', 'b', 'c']);
  assert.deepEqual(BG.parseList('@Alice, bob\n@alice', { username: true }), ['alice', 'bob']);
});

test('adminGroups: chỉ lấy group có quyền quản trị', () => {
  const out = BG.adminGroups({
    communities: {},
    groups: {
      g1: ['send_message', 'comment_on_thread'],
      g2: ['approve_reject_jr', 'remove_member', 'role_GROUP_ADMIN'],
      g3: ['manage', 'role_OWNER'],
    },
  });
  assert.deepEqual(out.map((g) => g.id), ['g2', 'g3']);
  assert.equal(out[0].canApprove, true);
  assert.equal(out[1].canApprove, false);
  assert.equal(BG.roleLabel(out[0].roles), 'Admin group');
  assert.equal(BG.roleLabel(['role_GROUP_ADMIN', 'role_OWNER']), 'Chủ sở hữu');
});

test('slimRequest: giữ trường cần thiết, nhận ra Premium và NFT', () => {
  const r = BG.slimRequest({
    id: 'jr1',
    groupId: 'g',
    userId: 'u',
    status: 'waiting',
    createdAt: '2026-10-07T00:00:00Z',
    membershipAnswers: [],
    user: { id: 'u', username: 'x', fullname: 'X', avatar: '', isVerified: false, subscriptions: [{ type: 'premium' }], userNFT: { isLinkedPoNFT: false, isLinkedUoNFT: true } },
  });
  assert.equal(r.id, 'jr1');
  assert.equal(r.user.premium, true);
  assert.equal(r.user.nft, true);
  assert.equal(r.user.isDeactivated, false);
});

test('đạt mọi quy tắc -> gợi ý duyệt', () => {
  const ev = BG.evaluateRequest(req({ answers: [{ questionId: 'q1', answer: 'Qua bạn bè' }] }), BG.DEFAULT_RULES, Q);
  assert.equal(ev.verdict, 'approve');
});

test('thiếu ảnh đại diện hoặc ảnh mặc định -> cần xem', () => {
  assert.equal(BG.evaluateRequest(req({}, { avatar: '' })).verdict, 'review');
  const ev = BG.evaluateRequest(req({}, { avatar: 'https://group.beincom.com/images/user_avatar_default.webp' }));
  assert.equal(ev.verdict, 'review');
  assert.match(ev.reasons[0].text, /ảnh đại diện/);
  // Tắt quy tắc thì không bị bắt
  assert.equal(BG.evaluateRequest(req({}, { avatar: '' }), { requireAvatar: false }).verdict, 'approve');
});

test('chưa trả lời câu bắt buộc hoặc trả lời quá ngắn -> cần xem', () => {
  const missing = BG.evaluateRequest(req(), BG.DEFAULT_RULES, Q);
  assert.equal(missing.verdict, 'review');
  assert.match(missing.reasons.map((r) => r.text).join(), /Chưa trả lời 1 câu hỏi bắt buộc/);
  const short = BG.evaluateRequest(req({ answers: [{ questionId: 'q1', answer: 'ok' }] }), BG.DEFAULT_RULES, Q);
  assert.equal(short.verdict, 'review');
  assert.match(short.reasons[0].text, /quá ngắn/);
  // Câu không bắt buộc để trống thì không sao
  assert.equal(BG.evaluateRequest(req({ answers: [{ questionId: 'q1', answer: 'Facebook' }] }), BG.DEFAULT_RULES, Q).verdict, 'approve');
});

test('từ khoá cấm (không phân biệt dấu) -> gợi ý từ chối, kể cả khi có lỗi nhẹ khác', () => {
  const rules = { ...BG.DEFAULT_RULES, bannedKeywords: ['kiếm tiền nhanh', 't.me/'] };
  const ev = BG.evaluateRequest(req({ answers: [{ questionId: 'q1', answer: 'Vào đây KIEM TIEN NHANH t.me/abc' }] }, { avatar: '' }), rules, Q);
  assert.equal(ev.verdict, 'decline');
  assert.match(ev.reasons.find((r) => r.level === 'bad').text, /kiếm tiền nhanh, t\.me\//);
  // Từ khoá trong tên cũng bị bắt
  assert.equal(BG.evaluateRequest(req({}, { fullname: 'Shop Kiếm Tiền Nhanh' }), rules).verdict, 'decline');
});

test('tài khoản bị vô hiệu -> từ chối; chưa xác minh chỉ bắt khi bật quy tắc', () => {
  assert.equal(BG.evaluateRequest(req({}, { isDeactivated: true })).verdict, 'decline');
  assert.equal(BG.evaluateRequest(req({}, { isVerified: false })).verdict, 'approve');
  assert.equal(BG.evaluateRequest(req({}, { isVerified: false }), { requireVerified: true }).verdict, 'review');
});

test('danh sách cho phép / chặn theo username thắng mọi quy tắc khác', () => {
  const rules = { ...BG.DEFAULT_RULES, allowUsernames: ['alice'], blockUsernames: ['bob'], bannedKeywords: ['alice'] };
  assert.equal(BG.evaluateRequest(req({}, { avatar: '' }), rules).verdict, 'approve');
  assert.equal(BG.evaluateRequest(req({}, { username: 'Bob' }), rules).verdict, 'decline');
});

test('answersOf: ghép câu hỏi, hiện câu chưa trả lời, chịu được nhiều dạng câu trả lời', () => {
  const out = BG.answersOf(req({ answers: [{ question_id: 'q2', value: 'ABC' }, 'trả lời tự do'] }), Q);
  assert.deepEqual(
    out.map((a) => [a.question, a.answer, a.isRequired]),
    [
      ['Mã giới thiệu', 'ABC', false],
      ['', 'trả lời tự do', false],
      ['Bạn biết nhóm qua đâu?', '', true],
    ],
  );
});

test('newRequestIds và totals (bài chờ duyệt chỉ cộng một lần mỗi community, bài gắn cờ ở nhiều group đếm một lần)', () => {
  const groups = [
    { id: 'g1', communityId: 'c1', pendingTotal: 2, approvalCount: 3, requests: [{ id: 'a' }, { id: 'b' }], reportIds: ['r1', 'r2'], flaggedIds: ['f1'] },
    { id: 'g2', communityId: 'c1', pendingTotal: 1, approvalCount: null, requests: [{ id: 'c' }], flaggedIds: ['f1', 'f2'] },
    { id: 'g3', communityId: 'c2', pendingTotal: 0, approvalCount: 4, requests: [] },
  ];
  assert.deepEqual(BG.newRequestIds(groups, ['a']), ['b', 'c']);
  assert.deepEqual(BG.totals(groups), { requests: 3, posts: 7, reports: 2, autoFlagged: 2 });
  assert.deepEqual(BG.autoFlaggedIds(groups), ['f1', 'f2']);
});

test('đường dẫn trang Beincom cho group gốc và group con', () => {
  const root = { id: 'g', communityId: 'c', isCommunity: true };
  const sub = { id: 'g2', communityId: 'c', isCommunity: false };
  assert.equal(BG.memberRequestsUrl(root), 'https://group.beincom.com/community-detail/c/members/member-requests');
  assert.equal(BG.memberRequestsUrl(sub), 'https://group.beincom.com/group-detail/c/groups/g2/members/member-requests');
  assert.equal(BG.contentApprovalUrl('c'), 'https://group.beincom.com/admin-panel/c/content-approval?approvalStatus=pending');
});

// ---------- Bài viết ----------

const P = (text, extra = {}) => ({ id: 'p', type: 'POST', title: '', text, link: '', ...extra });

test('linkDomains: nhận http(s), www, tên miền trần; bỏ chữ thường có dấu chấm', () => {
  assert.deepEqual(BG.linkDomains('Xem https://Example.com/a?b=1, www.abc.vn và t.me/kenh, bit.ly/x. Mr.Bean v.v.'), ['example.com', 'abc.vn', 't.me', 'bit.ly']);
  assert.deepEqual(BG.linkDomains('[link](https://sub.domain.io/path)'), ['sub.domain.io']);
});

test('evaluatePost: từ khoá cấm và tên miền cấm -> vi phạm; link ngoài -> cần xem khi bật', () => {
  const rules = { bannedKeywords: ['lừa đảo'], blockedDomains: ['t.me'], reviewExternalLinks: true, allowedDomains: ['beincom.com'] };
  assert.equal(BG.evaluatePost(P('Nhóm LUA DAO đây'), rules).verdict, 'bad');
  const ev = BG.evaluatePost(P('Kênh https://t.me/abc'), rules);
  assert.equal(ev.verdict, 'bad');
  assert.match(ev.reasons[0].text, /t\.me/);
  // Tên miền con của tên miền cho phép
  assert.equal(BG.evaluatePost(P('Xem group.beincom.com/posts/1'), rules).verdict, 'ok');
  assert.equal(BG.evaluatePost(P('Tin trên coindesk.com'), rules).verdict, 'review');
  assert.equal(BG.evaluatePost(P('Tin trên coindesk.com'), { ...rules, reviewExternalLinks: false }).verdict, 'ok');
  // Link xem trước của bài cũng được xét
  assert.equal(BG.evaluatePost(P('Xem link', { link: 'https://t.me/x' }), rules).verdict, 'bad');
});

test('slimPost: bài thường lấy content (hoặc title khi chưa có chi tiết); bài article giữ tiêu đề riêng', () => {
  const base = { id: 'x', actor: { id: 'u', username: 'a', fullname: 'A' }, audience: { groups: [{ id: 'g', name: 'G', approval: { status: 'WAITING_APPROVAL' } }] }, media: { images: [1, 2], videos: [1] } };
  assert.equal(BG.slimPost({ ...base, type: 'POST', title: 'đầu bài' }).text, 'đầu bài');
  assert.equal(BG.slimPost({ ...base, type: 'POST', title: 'đầu', content: 'đầu bài đầy đủ' }).text, 'đầu bài đầy đủ');
  const art = BG.slimPost({ ...base, type: 'ARTICLE', title: 'Tiêu đề', content: 'Thân bài' });
  assert.deepEqual([art.title, art.text, art.media.images, art.media.videos, art.groups[0].approval], ['Tiêu đề', 'Thân bài', 2, 1, 'WAITING_APPROVAL']);
  assert.equal(BG.postUrl(art), 'https://group.beincom.com/article/x');
  assert.equal(BG.postUrl({ id: 'y', type: 'POST' }), 'https://group.beincom.com/posts/y');
});

test('sortGroupTree: community nhiều việc trước, group gốc rồi group con theo cấp; groupIndent thụt lề', () => {
  const g = (id, communityId, isCommunity, level, extra = {}) => ({ id, name: id, communityId, communityName: communityId, isCommunity, level, ...extra });
  const sorted = BG.sortGroupTree([
    g('A-sub2', 'A', false, 2),
    g('B', 'B', true, 0),
    g('A-sub1', 'A', false, 1),
    g('B-sub', 'B', false, 1, { pendingTotal: 5 }),
    g('A', 'A', true, 0, { approvalCount: 1 }),
  ]);
  assert.deepEqual(sorted.map((x) => x.id), ['B', 'B-sub', 'A', 'A-sub1', 'A-sub2']);
  const NB = String.fromCharCode(160);
  assert.deepEqual([BG.groupIndent(sorted[0]), BG.groupIndent(sorted[1]), BG.groupIndent(sorted[4])], ['', NB.repeat(4) + '└ ', NB.repeat(8) + '└ ']);
});

// ---------- Đăng bài ----------

test('validateCompose và composeBody: kiểm tra trước khi đăng, setting "Quan trọng"', () => {
  const now = Date.parse('2026-10-08T00:00:00Z');
  const base = { groupIds: ['g'], content: 'Xin chào' };
  assert.equal(BG.validateCompose(base, now), '');
  assert.match(BG.validateCompose({ ...base, content: '   ' }, now), /chưa có nội dung/);
  assert.match(BG.validateCompose({ ...base, scheduledAt: 'abc' }, now), /không hợp lệ/);
  assert.equal(BG.validateCompose({ ...base, scheduledAt: '2026-10-08T00:10:00Z' }, now), '');
  assert.match(BG.validateCompose({ ...base, setting: { isImportant: true, importantExpiredAt: '2026-10-07T00:00:00Z' } }, now), /Quan trọng/);
  assert.equal(BG.validateCompose({ ...base, setting: { isImportant: true, importantExpiredAt: '2026-10-09T00:00:00Z' } }, now), '');
  const b = BG.composeBody({ ...base, setting: { isImportant: true, importantExpiredAt: '2026-10-09T00:00:00Z' }, scheduledAt: '2026-10-08T01:00:00Z' });
  assert.deepEqual([b.setting.isImportant, b.setting.importantExpiredAt, b.scheduledAt, b.setting.canComment], [true, '2026-10-09T00:00:00.000Z', '2026-10-08T01:00:00.000Z', true]);
  assert.equal(BG.composeBody(base).scheduledAt, undefined);
  // Quan trọng không hết hạn: importantExpiredAt = null
  const never = { ...base, setting: { isImportant: true, importantExpiredAt: null } };
  assert.equal(BG.validateCompose(never, now), '');
  assert.deepEqual(BG.composeBody(never).setting, { canComment: true, canReact: true, isImportant: true, importantExpiredAt: null });
});

// ---------- Xem trước markdown ----------

test('renderMarkdown: định dạng của Beincom, an toàn với HTML và link lạ', () => {
  const html = BG.renderMarkdown('**Đậm** _nghiêng_ ~~gạch~~ `<b>x</b>`\nDòng 2\n\n### Tiêu đề\n- một\n- [hai](https://x.com)\n1. a\n> trích\n<script>alert(1)</script> [x](javascript:alert(1))');
  assert.match(html, /<p><strong>Đậm<\/strong> <em>nghiêng<\/em> <del>gạch<\/del> <code>&lt;b&gt;x&lt;\/b&gt;<\/code><br>Dòng 2<\/p>/);
  assert.match(html, /<h4>Tiêu đề<\/h4><ul><li>một<\/li><li><a href="https:\/\/x.com" target="_blank" rel="noopener noreferrer">hai<\/a><\/li><\/ul><ol><li>a<\/li><\/ol><blockquote>trích<\/blockquote>/);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript'));
  // Link trần thành link, gạch dưới trong tên miền không thành chữ nghiêng
  assert.match(BG.renderMarkdown('xem https://a.com/my_page_x'), /<a href="https:\/\/a.com\/my_page_x"/);
});

// ---------- Thống kê ----------

test('buildStats: ưu tiên số liệu chính thức; bài nổi bật và người đăng tích cực', () => {
  const now = Date.parse('2026-10-08T05:00:00Z'); // 12:00 ngày 08/10 giờ VN
  const p = (id, actorId, iso, reactions, comments) => ({ id, actor: { id: actorId, username: actorId }, publishedAt: iso, reactions, commentsCount: comments });
  const posts = [p('a', 'u1', '2026-10-08T01:00:00Z', 5, 1), p('b', 'u2', '2026-10-07T01:00:00Z', 10, 4), p('c', 'u1', '2026-10-07T02:00:00Z', 0, 0), p('old', 'u3', '2026-09-01T00:00:00Z', 99, 9)];
  const official = BG.buildStats({
    days: 3,
    now,
    posts,
    officialMembers: [{ date: '2026-10-07T00:00:00.000Z', memberCount: 10, joinedCount: 2, leftCount: 1 }],
    officialPosts: [{ date: '2026-10-07T00:00:00.000Z', totalCount: 7 }],
    userCount: 11,
  });
  assert.deepEqual(official.days, ['2026-10-06', '2026-10-07', '2026-10-08']);
  assert.deepEqual(official.daily[1], { day: '2026-10-07', members: 10, joined: 2, left: 1, posts: 7 });
  assert.deepEqual(official.sources, { members: 'official', joinLeave: 'official', posts: 'official' });
  assert.deepEqual(official.topPosts.map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(official.topAuthors.map((x) => [x.actor.id, x.posts, x.reactions]), [['u1', 2, 5], ['u2', 1, 10]]);
  const computed = BG.buildStats({ days: 3, now, posts, history: [{ day: '2026-10-08', count: 11 }], activity: [{ kind: 'in', time: '2026-10-08T03:00:00Z' }, { kind: 'out', time: '2026-10-06T03:00:00Z' }] });
  assert.deepEqual(computed.daily.map((d) => [d.members, d.joined, d.left, d.posts]), [[null, 0, 1, 0], [null, 0, 0, 2], [11, 1, 0, 1]]);
  assert.deepEqual(computed.totals, { members: null, joined: 1, left: 1, posts: 3, reactions: 15, comments: 5, scannedPosts: 3 });
  assert.deepEqual(BG.recordMemberHistory({ g: [{ day: '2026-10-07', count: 9 }] }, [{ id: 'g', userCount: 11 }, { id: 'x', userCount: null }], now), { g: [{ day: '2026-10-07', count: 9 }, { day: '2026-10-08', count: 11 }] });
});

// ---------- Thành viên ----------

test('canBan: quyền cấm lấy từ quyền community', () => {
  const perms = { communities: { c1: ['ban_member'], c2: ['manage'] } };
  assert.deepEqual([BG.canBan(perms, 'c1'), BG.canBan(perms, 'c2'), BG.canBan(perms, 'c3'), BG.canBan(null, 'c1')], [true, false, false, false]);
});

test('slimActivity và activitySummary: đếm vào / rời trong khoảng thời gian', () => {
  const now = Date.parse('2026-10-08T00:00:00Z');
  const ev = (useCase, iso) => BG.slimActivity({ id: iso, eventTime: iso, useCase, data: { actor: { id: 'a', username: 'a' } } });
  const items = [
    ev('join.community.as_member', '2026-10-07T20:00:00Z'),
    ev('approve.join_request', '2026-10-07T10:00:00Z'),
    ev('leave.group', '2026-10-07T12:00:00Z'),
    ev('remove.member', '2026-10-03T12:00:00Z'),
    ev('assign.group_admin', '2026-10-07T12:00:00Z'),
    ev('su.kien.la', '2026-10-07T12:00:00Z'),
  ];
  assert.deepEqual(BG.activitySummary(items, 24, now), { joined: 2, left: 1 });
  assert.deepEqual(BG.activitySummary(items, 24 * 7, now), { joined: 2, left: 2 });
  assert.deepEqual([items[5].label, items[5].kind], ['su.kien.la', 'other']);
});

test('slimMember: thống nhất hai dạng API thành viên', () => {
  const a = BG.slimMember({ id: 'u', username: 'x', fullname: 'X', joinedAt: '2026-01-01', isCommunityAdmin: true, totalJoinedGroup: 3 }, { isAdmin: false });
  assert.deepEqual([a.joinedAt, a.isCommunityAdmin, a.isAdmin, a.totalJoinedGroup, a.premium], ['2026-01-01', true, false, 3, false]);
  const b = BG.slimMember({ id: 'v', subscriptions: [{ type: 'premium' }], userNFT: { isLinkedPoNFT: true } }, { isAdmin: true });
  assert.deepEqual([b.isAdmin, b.premium, b.nft, b.joinedAt], [true, true, true, null]);
});

test('toCsv: có BOM, bọc ô chứa dấu phẩy/ngoặc kép/xuống dòng', () => {
  const csv = BG.toCsv([{ a: 'x,y', b: 'say "hi"' }, { a: 'dòng\n2', b: null }], [{ label: 'A', key: 'a' }, { label: 'B', get: (r) => r.b }]);
  assert.equal(csv, String.fromCharCode(0xfeff) + 'A,B\r\n"x,y","say ""hi"""\r\n"dòng\n2",');
});

test('slimReport và reportUrl: gộp lý do, link bình luận về bài chứa nó', () => {
  const r = BG.slimReport({
    id: 'rp1',
    targetId: 'c1',
    targetType: 'COMMENT',
    content: 'spam',
    commentPostId: 'p9',
    targetActor: { id: 'a1', username: 'spammer', fullname: 'Spam Bot' },
    reasonsCount: [{ reasonType: 'SPAM', total: 3 }, { reasonType: 'OTHERS', total: 1, description: 'lừa đảo' }],
  });
  assert.deepEqual(r.reasons.map((x) => [x.type, x.label, x.total, x.description]), [
    ['SPAM', BG.HIDE_REASONS.SPAM, 3, ''],
    ['OTHERS', BG.HIDE_REASONS.OTHERS, 1, 'lừa đảo'],
  ]);
  assert.deepEqual([r.total, r.status, r.actor.username], [4, 'CREATED', 'spammer']);
  assert.equal(BG.reportUrl(r), 'https://group.beincom.com/posts/p9');
  assert.equal(BG.reportUrl({ ...r, commentPostId: null }), '');
  assert.equal(BG.reportUrl({ targetId: 'p1', targetType: 'POST' }), 'https://group.beincom.com/posts/p1');
});

test('isCommunityAdmin: chỉ đúng khi có quyền manage ở community', () => {
  const perm = { communities: { c1: ['manage', 'edit'], c2: ['view'] } };
  assert.equal(BG.isCommunityAdmin(perm, 'c1'), true);
  assert.equal(BG.isCommunityAdmin(perm, 'c2'), false);
  assert.equal(BG.isCommunityAdmin(perm, 'c3'), false);
  assert.equal(BG.isCommunityAdmin(null, 'c1'), false);
});

test('importantUntil: hạn Quan trọng tính từ lúc đăng, cộng tháng không nhảy quá cuối tháng', () => {
  const base = new Date(2026, 0, 31, 9, 0); // 31/01/2026 09:00 giờ máy
  const at = (preset) => {
    const v = BG.importantUntil(preset, base);
    return v && new Date(v).toLocaleDateString('en-CA');
  };
  assert.deepEqual(['1d', '3d', '1w', '2w'].map(at), ['2026-02-01', '2026-02-03', '2026-02-07', '2026-02-14']);
  assert.deepEqual(['1m', '3m', '6m', '1y'].map(at), ['2026-02-28', '2026-04-30', '2026-07-31', '2027-01-31']);
  assert.equal(BG.importantUntil('never', base), null);
  assert.equal(BG.importantUntil('custom', base), undefined);
  assert.equal(new Date(BG.importantUntil('1d', base)).getHours(), 9); // giữ giờ đăng
  assert.ok(Object.keys(BG.IMPORTANT_FOR).includes('never'));
});

test('slimScheduled: cài đặt, ảnh (chỉ https), link xem trước, tag, series, nhắc tên', () => {
  const p = BG.slimScheduled({
    id: 's1',
    type: 'POST',
    content: 'Nội dung **đậm**',
    createdAt: '2026-10-08T01:00:00Z',
    scheduledAt: '2026-10-09T02:00:00Z',
    status: 'WAITING_SCHEDULE',
    setting: { canComment: false, canReact: true, isImportant: true, importantExpiredAt: '2026-10-16T02:00:00Z' },
    media: { images: [{ url: 'https://media.beincom.com/a' }, { url: 'http://x/b' }, { url: 'javascript:alert(1)' }], videos: [], files: [{}] },
    linkPreview: { url: 'http://vd.vn/bai', title: 'Bài', domain: 'vd.vn', image: 'http://vd.vn/a.jpg' },
    tags: [{ name: 'DEFI' }],
    series: [{ title: 'Nhập môn' }],
    mentions: { kai: { username: 'kai' } },
  });
  assert.deepEqual(p.setting, { canComment: false, canReact: true, isImportant: true, importantExpiredAt: '2026-10-16T02:00:00Z' });
  assert.deepEqual([p.thumbs, p.media.images, p.media.files], [['https://media.beincom.com/a'], 3, 1]);
  assert.deepEqual(p.linkPreview, { url: 'http://vd.vn/bai', title: 'Bài', domain: 'vd.vn', image: '' });
  assert.deepEqual([p.tags, p.series, p.mentions, p.createdAt], [['DEFI'], ['Nhập môn'], ['kai'], '2026-10-08T01:00:00Z']);
  // Bài không có gì thêm
  const q = BG.slimScheduled({ id: 's2', content: 'x' });
  assert.deepEqual([q.thumbs, q.linkPreview, q.tags, q.setting.canComment], [[], null, [], true]);
});

test('pickMedia: đúng loại, không quá dung lượng / số lượng, mỗi bài một loại đính kèm', () => {
  const f = (name, type, size = 1000) => ({ name, type, size });
  const a = BG.pickMedia('image', [f('a.png', 'image/png'), f('b.gif', 'image/gif'), f('c.exe', 'application/x-msdownload'), f('d.jpg', 'image/jpeg', 26 * 1024 * 1024)], {});
  assert.deepEqual(a.accepted.map((x) => x.name), ['a.png', 'b.gif']);
  assert.equal(a.errors.length, 2);
  assert.match(a.errors[1], /26 MB, tối đa 25 MB/);
  // Đã có 9 ảnh: chỉ nhận thêm 1
  const b = BG.pickMedia('image', [f('1.png', 'image/png'), f('2.png', 'image/png')], { image: 9 });
  assert.deepEqual([b.accepted.length, b.errors], [1, ['Tối đa 10 ảnh mỗi bài']]);
  // Đang có ảnh thì không thêm video
  assert.match(BG.pickMedia('video', [f('v.mp4', 'video/mp4')], { image: 2 }).errors[0], /một loại/);
  // Tệp xét theo đuôi; video theo loại video/*
  assert.deepEqual(BG.pickMedia('file', [f('bao-cao.PDF', ''), f('x.exe', '')], {}).accepted.map((x) => x.name), ['bao-cao.PDF']);
  assert.equal(BG.pickMedia('video', [f('v.mov', 'video/quicktime')], {}).accepted.length, 1);
  assert.equal(BG.pickMedia('video', [f('v1.mp4', 'video/mp4')], { video: 1 }).accepted.length, 0);
});

test('mediaItem, mediaSummary và đăng bài kèm media', () => {
  assert.deepEqual(BG.mediaItem('image', 'i1', { url: 'https://m/1', status: 'DONE', properties: { width: 4, mime_type: 'image/png' } }), { url: 'https://m/1', id: 'i1', width: 4, mime_type: 'image/png' });
  assert.deepEqual(BG.mediaItem('video', 'v1', { url: 'https://m/v', properties: { size: 9 }, thumbnails: [] }), { id: 'v1', url: 'https://m/v', size: 9, status: 'waiting_process', thumbnails: [] });
  assert.deepEqual(BG.mediaItem('file', 'f1', { id: 'f1', origin_url: 'https://m/f', properties: { mime_type: 'application/pdf' } }), { id: 'f1', url: 'https://m/f', mimeType: 'application/pdf' });
  assert.equal(BG.mediaSummary({ images: [1, 2, 3], videos: [], files: [] }), '3 ảnh');
  assert.equal(BG.mediaSummary(null), '');
  const now = Date.parse('2026-10-08T00:00:00Z');
  const base = { groupIds: ['g1'], content: '' };
  // Chỉ có ảnh, không có chữ: vẫn đăng được
  assert.equal(BG.validateCompose({ ...base, media: { images: [{ id: 'i1' }] } }, now), '');
  assert.match(BG.validateCompose(base, now), /chưa có nội dung/);
  assert.match(BG.validateCompose({ ...base, media: { images: [{}], files: [{}] } }, now), /một loại/);
  assert.match(BG.validateCompose({ ...base, media: { videos: [{}, {}] } }, now), /Tối đa 1 video/);
  const body = BG.composeBody({ ...base, media: { images: [{ id: 'i1', url: 'u' }] } });
  assert.deepEqual(body.media, { images: [{ id: 'i1', url: 'u' }], videos: [], files: [] });
  assert.deepEqual(BG.composeBody(base).media, { images: [], videos: [], files: [] });
});

test('nhắc tên: nhận ra @đang gõ, chỉ giữ người còn được nhắc, tô màu ở xem trước', () => {
  assert.deepEqual(BG.mentionQuery('Chào @ka'), { start: 5, query: 'ka' });
  assert.deepEqual(BG.mentionQuery('@'), { start: 0, query: '' });
  assert.deepEqual(BG.mentionQuery('dòng 1\n@nguyễn'), { start: 7, query: 'nguyễn' });
  assert.equal(BG.mentionQuery('email a@b'), null); // @ dính chữ trước: không phải nhắc tên
  assert.equal(BG.mentionQuery('@kai xong'), null);
  const known = { kai: { id: 'u1', name: 'kai' }, 'phungnhan.eth': { id: 'u2', name: 'phungnhan.eth' }, lan: { id: 'u3', name: 'lan' } };
  // lan đã bị xoá khỏi bài; dấu câu sau tên bị bỏ; x@kai không tính
  assert.deepEqual(Object.keys(BG.usedMentions('Cảm ơn @kai, @phungnhan.eth. và x@kai', known)), ['kai', 'phungnhan.eth']);
  assert.deepEqual(BG.usedMentions('không nhắc ai', known), {});
  assert.equal(BG.renderMarkdown('Chào @kai và @lan2', { mentions: known }), '<p>Chào <span class="mention">@kai</span> và @lan2</p>');
  assert.equal(BG.renderMarkdown('Chào @kai'), '<p>Chào @kai</p>');
  assert.deepEqual(BG.slimMentionable({ id: 'u1', username: 'kai', fullname: 'Kai', avatar: 'a', is_verified: true }), { id: 'u1', username: 'kai', fullname: 'Kai', avatar: 'a', isVerified: true });
  assert.deepEqual(BG.mentionEntry({ id: 'u1', username: 'kai', fullname: 'Kai', avatar: 'a', isVerified: true }), { id: 'u1', avatar: 'a', name: 'kai', fullname: 'Kai', isVerified: true });
});

test('xem trước link: lấy link cuối, gửi kèm khi bài không có ảnh / video / tệp', () => {
  assert.equal(BG.lastLink('xem https://a.com/x và www.b.vn/y.'), 'https://www.b.vn/y');
  assert.equal(BG.lastLink('vào t.me/abc nhé'), 'https://t.me/abc');
  assert.equal(BG.lastLink('không có link'), '');
  const lp = BG.slimLinkPreview({ url: 'https://a.com', domain: 'A', title: 'Tiêu đề', image: 'http://a.com/x.png', description: 'Mô tả', publisher: 'A' });
  assert.deepEqual(lp, { url: 'https://a.com', domain: 'A', title: 'Tiêu đề', image: '', description: 'Mô tả' });
  assert.equal(BG.slimLinkPreview({ title: 'không có url' }), null);
  const base = { groupIds: ['g1'], content: 'Chào @kai xem https://a.com', mentions: { kai: { id: 'u1', name: 'kai' }, lan: { id: 'u3' } }, linkPreview: lp };
  const body = BG.composeBody(base);
  assert.deepEqual(body.mentions, { kai: { id: 'u1', name: 'kai' } });
  assert.deepEqual(body.linkPreview, lp);
  assert.equal(BG.composeBody({ ...base, media: { images: [{ id: 'i1' }] } }).linkPreview, undefined);
  assert.equal(BG.composeBody({ groupIds: ['g1'], content: 'x' }).linkPreview, undefined);
});

test('tag và series: giới hạn 5 / 3, body chỉ gửi id, câu báo lỗi có tên', () => {
  assert.deepEqual(BG.slimTag({ id: 't1', name: 'AMA', slug: 'ama', totalUsed: 4, groups: [{}] }), { id: 't1', name: 'AMA', totalUsed: 4 });
  assert.deepEqual(BG.slimSeries({ id: 's1', title: 'Nhập môn', coverMedia: { url: 'https://m/c' }, summary: 'x', audience: {} }), { id: 's1', title: 'Nhập môn', cover: 'https://m/c', summary: 'x' });
  const now = Date.parse('2026-10-08T00:00:00Z');
  const base = { groupIds: ['g1'], content: 'x' };
  const many = (n, p) => Array.from({ length: n }, (_, i) => ({ id: p + i }));
  assert.equal(BG.validateCompose({ ...base, tags: many(5, 't'), series: many(3, 's') }, now), '');
  assert.match(BG.validateCompose({ ...base, tags: many(6, 't') }, now), /Tối đa 5 tag/);
  assert.match(BG.validateCompose({ ...base, series: many(4, 's') }, now), /Tối đa 3 series/);
  const body = BG.composeBody({ ...base, tags: [{ id: 't1', name: 'AMA' }], series: ['s1'] });
  assert.deepEqual([body.tags, body.series], [['t1'], ['s1']]);
  assert.deepEqual([BG.composeBody(base).tags, BG.composeBody(base).series], [[], []]);
  const err = { code: 'tag_series_invalid', meta: { errors: { seriesIds: ['s1'], tagIds: ['t2', 'tX'] } } };
  assert.equal(BG.tagSeriesError(err, [{ id: 't2', name: 'DEFI' }], [{ id: 's1', title: 'Nhập môn' }]), 'series Nhập môn; tag DEFI, tX không dùng được với các group đã chọn — bỏ ra rồi đăng lại');
});

test('hồ sơ vi phạm: gộp sự kiện, chống trùng (cùng lần xoá từ hai nguồn), bỏ khi báo cáo được bỏ qua, giới hạn', () => {
  const u = { id: 'u1', username: 'lan', fullname: 'Lan' };
  const ev = (type, key, time, extra = {}) => ({ user: u, type, key, time, group: 'Crypto Life', ...extra });
  let r = BG.addViolations(null, [
    ev('removed', 'remove:g:u1:1', '2026-10-08T10:00:00Z'),
    ev('removed', 'act:e9', '2026-10-08T10:04:00Z'), // nhật ký Beincom của cùng lần xoá
    ev('removed', 'act:e10', '2026-10-09T10:00:00Z'), // lần xoá khác
    ev('hidden', 'hidden:p1', '2026-10-07T08:00:00Z', { snippet: 'Bài   spam', reason: 'Spam' }),
    ev('hidden', 'hidden:p1', '2026-10-07T09:00:00Z'), // cùng bài
    ev('reported', 'report:r1', '2026-10-06T08:00:00Z'),
    { user: { id: 'x' }, type: 'khác', key: 'k' },
  ]);
  assert.equal(r.added, 4);
  const p = r.store.users.u1;
  assert.deepEqual(p.events.map((e) => e.key), ['act:e10', 'remove:g:u1:1', 'hidden:p1', 'report:r1']); // mới nhất trước
  assert.equal(p.events[2].snippet, 'Bài spam');
  const sum = BG.profileSummary(p);
  assert.deepEqual([sum.counts, sum.score, sum.total, sum.repeat, sum.severe], [{ removed: 2, hidden: 1, reported: 1 }, 9, 4, true, true]);
  assert.equal(BG.profileText(sum), 'Bị xoá khỏi group 2 · Nội dung bị ẩn 1 · Bị báo cáo 1');
  // Báo cáo được bỏ qua: bỏ khỏi hồ sơ; hết sự kiện thì bỏ cả người
  r = BG.addViolations(r.store, [{ user: u, clear: 'report:r1' }, { user: u, clear: 'report:không-có' }]);
  assert.equal(r.added, 1);
  assert.equal(r.store.users.u1.events.length, 3);
  const one = BG.addViolations(null, [ev('reported', 'report:r2', '2026-10-06T08:00:00Z')]).store;
  assert.deepEqual(BG.addViolations(one, [{ user: u, clear: 'report:r2' }]).store.users, {});
  // Mỗi người tối đa 30 sự kiện
  const many = BG.addViolations(null, Array.from({ length: 40 }, (_, i) => ev('rule', 'rule:' + i, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString())));
  assert.equal(many.store.users.u1.events.length, 30);
});

test('hồ sơ vi phạm: dựng sự kiện từ nhật ký addon, nhật ký Beincom, báo cáo, bài', () => {
  const base = { time: Date.parse('2026-10-08T10:00:00Z'), status: 'ok', userId: 'u1', username: 'lan', fullname: 'Lan', groupId: 'g1', groupName: 'Food Research', source: 'manual' };
  const evs = BG.violationsFromLog([
    { ...base, kind: 'member', action: 'decline', requestId: 'jr1' },
    { ...base, kind: 'member', action: 'approve', requestId: 'jr2' },
    { ...base, kind: 'manage', action: 'ban', reason: 'Vi phạm nội quy' },
    { ...base, kind: 'post', action: 'hide', contentId: 'p1', reason: 'Spam', source: 'auto' },
    { ...base, kind: 'post', action: 'reject', contentId: 'p2' },
    { ...base, kind: 'post', action: 'delete', contentId: 'p3' },
    { ...base, kind: 'report', action: 'hidePost', contentId: 'p4' },
    { ...base, kind: 'report', action: 'ignore', contentId: 'c1', reportId: 'r1' },
    { ...base, kind: 'post', action: 'hide', contentId: 'p5', status: 'dry' },
    { ...base, kind: 'post', action: 'hide', contentId: 'p6', status: 'error' },
    { ...base, kind: 'post', action: 'hide', contentId: 'p7', gone: true },
  ]);
  assert.deepEqual(evs.map((e) => e.type || 'clear:' + e.clear), ['declined', 'banned', 'hidden', 'rejected', 'hidden', 'clear:report:r1']);
  assert.deepEqual([evs[1].reason, evs[1].group, evs[2].by, evs[3].by], ['Vi phạm nội quy', 'Food Research', 'Addon tự xử lý', 'Bạn (qua addon)']);
  const act = BG.violationsFromActivity([
    { id: 'e1', useCase: 'remove.member', time: '2026-10-08T10:00:00Z', user: { id: 'u2', username: 'b' }, actor: { id: 'a', fullname: 'Admin A' }, groupName: 'G' },
    { id: 'e2', useCase: 'leave.group', time: '2026-10-08T10:00:00Z', user: { id: 'u3' } },
    { id: 'e3', useCase: 'ban.member', time: '2026-10-08T11:00:00Z', user: { id: 'u2' }, actor: null, groupName: 'G' },
  ]);
  assert.deepEqual(act.map((e) => [e.type, e.key, e.by]), [['removed', 'act:e1', 'Admin A'], ['banned', 'act:e3', '']]);
  const rep = BG.violationsFromReports([
    { id: 'r1', actor: { id: 'u4' }, status: 'CREATED', content: 'x', createdAt: '2026-10-08T00:00:00Z', reasons: [{ label: 'Spam / quảng cáo', total: 3 }] },
    { id: 'r2', actor: { id: 'u5' }, status: 'IGNORED', reasons: [] },
  ], 'Food Research');
  assert.deepEqual(rep.map((e) => [e.user.id, e.key, e.reason, e.group]), [['u4', 'report:r1', 'Spam / quảng cáo ×3', 'Food Research']]);
  const posts = BG.violationsFromPosts([{ id: 'f1', actor: { id: 'u6' }, title: '', text: 'Bạo lực', publishedAt: '2026-10-08T00:00:00Z', groups: [{ name: 'CL' }], violations: ['Violence'] }], 'flagged', (p) => p.violations.join(', '));
  assert.deepEqual([posts[0].key, posts[0].reason, posts[0].group, posts[0].snippet], ['flag:f1', 'Violence', 'CL', 'Bạo lực']);
  assert.equal(BG.violationsFromPosts([{ id: 'h1', actor: { id: 'u6' }, groups: [] }], 'hidden')[0].key, 'hidden:h1');
});

test('evaluateRequest: người có hồ sơ vi phạm thành "Cần xem" (tắt quy tắc thì bỏ qua)', () => {
  const req = { user: { id: 'u1', username: 'lan', avatar: 'https://media.beincom.com/a', isVerified: true }, answers: [] };
  const profile = { user: { id: 'u1' }, events: [{ type: 'banned', key: 'k', time: '2026-10-08T00:00:00Z' }] };
  const r = BG.evaluateRequest(req, {}, [], profile);
  assert.deepEqual([r.verdict, r.reasons[0].text], ['review', 'Có hồ sơ vi phạm: Bị cấm 1']);
  assert.equal(BG.evaluateRequest(req, { reviewViolators: false }, [], profile).verdict, 'approve');
  assert.equal(BG.evaluateRequest(req, {}, [], null).verdict, 'approve');
});
