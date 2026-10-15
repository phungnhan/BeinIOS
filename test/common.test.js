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

test('sửa bài: dữ liệu mở lại từ bài trên Beincom, body sửa (không có setting, link rỗng để xoá thẻ cũ), body cài đặt', () => {
  const st = BG.editState({
    id: 'p1',
    status: 'PUBLISHED',
    actor: { id: 'me1' },
    audience: { groups: [{ id: 'g1', name: 'Food Research', isCommunity: true }] },
    content: 'Chào @kai',
    media: { images: [{ id: 'i1', url: 'https://m/i1', width: 4 }] },
    mentions: { kai: { id: 'u1', username: 'kai', fullname: 'Kai', avatar: 'a', isVerified: true } },
    linkPreview: { url: 'https://a.com', title: 'A', domain: 'a.com', image: '', description: '', id: 'lp1' },
    tags: [{ id: 't1', name: 'AMA', slug: 'ama' }],
    series: [{ id: 's1', title: 'Nhập môn', coverMedia: {} }],
    setting: { canComment: false, canReact: true, isImportant: true, importantExpiredAt: null },
  });
  assert.deepEqual(st.groups, [{ id: 'g1', name: 'Food Research' }]);
  assert.deepEqual(st.mentions, { kai: { id: 'u1', avatar: 'a', name: 'kai', fullname: 'Kai', isVerified: true } });
  assert.deepEqual([st.media.images.length, st.media.videos, st.tags, st.series], [1, [], [{ id: 't1', name: 'AMA' }], [{ id: 's1', title: 'Nhập môn' }]]);
  assert.deepEqual(st.setting, { canComment: false, canReact: true, isImportant: true, importantExpiredAt: null });
  const body = BG.editBody({ groupIds: ['g1'], content: st.content, media: st.media, mentions: st.mentions, linkPreview: st.linkPreview, tags: st.tags, series: st.series, setting: st.setting, scheduledAt: '2026-12-01T00:00:00Z' });
  assert.deepEqual(Object.keys(body).sort(), ['audience', 'content', 'linkPreview', 'media', 'mentions', 'series', 'tags']);
  // Có ảnh: như web, không đính kèm xem trước link (gửi rỗng); không có ảnh thì giữ link
  assert.deepEqual([body.tags, body.series, body.linkPreview], [['t1'], ['s1'], { domain: '', url: '' }]);
  assert.equal(BG.editBody({ groupIds: ['g1'], content: 'x', linkPreview: st.linkPreview }).linkPreview.url, 'https://a.com');
  assert.deepEqual(BG.editBody({ groupIds: ['g1'], content: 'x' }).linkPreview, { domain: '', url: '' });
  assert.deepEqual(BG.settingBody({ canComment: false, isImportant: true, importantExpiredAt: '2026-12-01T00:00:00Z' }), { canComment: false, canReact: true, isImportant: true, importantExpiredAt: '2026-12-01T00:00:00.000Z' });
  assert.equal(BG.PIN_MAX, 5);
});

test('cài đặt group: đọc giá trị, ô bị khoá, quyền, body gửi lên (snake_case; duyệt bài qua API community)', () => {
  const st = BG.slimGroupSettings({
    settings: { isJoinApproval: true, isActiveMembershipQuestions: false, isInvitedOnly: false, isHiddenMembers: true, contentApproval: { value: true, updatedAt: 'x' }, isActiveReferralCode: true },
    changeableSettings: { isJoinApproval: '', contentApproval: 'Đang theo cài đặt của community' },
  });
  assert.deepEqual(st.values, { isJoinApproval: true, isActiveMembershipQuestions: false, isInvitedOnly: false, isHiddenMembers: true, contentApproval: true });
  assert.deepEqual(st.locked, { contentApproval: 'Đang theo cài đặt của community' });
  const g = { canEditJoin: true, canEditPrivacy: false, isCommunityAdmin: false };
  assert.deepEqual(Object.keys(BG.GROUP_SETTINGS).map((k) => BG.settingDenied(g, k)), ['', '', '', 'Không có quyền đổi quyền riêng tư', 'Cần quyền chủ / admin community']);
  assert.equal(BG.settingDenied({}, 'isJoinApproval'), ''); // bản quét cũ chưa có quyền: không chặn, để Beincom kiểm tra
  assert.deepEqual(BG.groupSettingBody('isJoinApproval', false, 'g1'), { id: 'g1', is_join_approval: false });
  assert.deepEqual(BG.groupSettingBody('isActiveMembershipQuestions', 1, 'g1'), { id: 'g1', is_active_membership_questions: true });
  assert.deepEqual(BG.groupSettingBody('contentApproval', true, 'g1'), { group_id: 'g1', content_approval: { value: true }, is_update_all: false });
  assert.equal(BG.hasGroupPerm({ groups: { g1: ['edit_join_setting'] } }, 'g1', 'edit_join_setting'), true);
  assert.equal(BG.hasGroupPerm(null, 'g1', 'edit_join_setting'), false);
});

test('slimBanned: người bị cấm, lý do dịch sang tiếng Việt', () => {
  assert.deepEqual(BG.slimBanned({ user: { id: 'u1', username: 'spam', fullname: 'Spam', avatar: 'a', isVerified: false }, reason: 'SPAM', createdAt: '2026-10-01T00:00:00Z' }), { id: 'u1', username: 'spam', fullname: 'Spam', avatar: 'a', isVerified: false, reason: 'Spam', bannedAt: '2026-10-01T00:00:00Z' });
  assert.equal(BG.slimBanned({ user: { id: 'u2' }, reason: 'KHAC' }).reason, 'KHAC');
});

test('quy tắc riêng từng group: group -> community -> chung; bài nhiều group lấy kết quả nặng nhất', () => {
  const gs = [
    { id: 'c1', isCommunity: true, communityId: 'k1' },
    { id: 'c1a', isCommunity: false, communityId: 'k1', rootGroupId: '' },
    { id: 'c2', isCommunity: true, communityId: 'k2' },
  ];
  const groupRules = { c1: { rules: { bannedKeywords: ['spam'] }, postRules: { blockedDomains: ['bit.ly'] } }, c2: { rules: {}, postRules: {} } };
  assert.equal(BG.ruleSource(gs[0], groupRules, gs), 'c1');
  assert.equal(BG.ruleSource(gs[1], groupRules, gs), 'c1'); // group con theo community
  assert.equal(BG.ruleSource({ id: 'x', rootGroupId: 'c1' }, groupRules), 'c1');
  assert.equal(BG.ruleSource({ id: 'x', communityId: 'k9' }, groupRules, gs), null);
  assert.equal(BG.ruleSource(gs[0], {}, gs), null);
  const ctx = { rules: { requireAvatar: false }, postRules: { reviewExternalLinks: true }, groupRules, groups: gs };
  const eff = BG.effectiveRules(gs[1], ctx);
  assert.deepEqual([eff.source, eff.rules.bannedKeywords, eff.rules.requireAvatar, eff.postRules.blockedDomains, eff.postRules.reviewExternalLinks], ['c1', ['spam'], false, ['bit.ly'], true]);
  assert.equal(BG.effectiveRules(null, ctx).source, null);
  const post = (extra) => ({ title: '', text: 'Nhận quà tại bit.ly/x', link: '', ...extra });
  // Chỉ ở c2: quy tắc chung (bật link ngoài -> cần xem)
  assert.equal(BG.evaluatePostIn(post({ seenIn: ['c2'] }), ctx).verdict, 'review');
  // Đăng cả c2 và c1a: c1 cấm bit.ly -> vi phạm
  assert.equal(BG.evaluatePostIn(post({ seenIn: ['c2'], groups: [{ id: 'c1a', communityId: 'k1' }] }), ctx).verdict, 'bad');
  // Không rõ group: dùng group dự phòng
  assert.equal(BG.evaluatePostIn(post({}), ctx, gs[0]).verdict, 'bad');
  assert.equal(BG.evaluatePostIn(post({}), ctx).verdict, 'review');
});

test('bài định kỳ: lịch đăng, hạn Quan trọng theo từng bài, nhãn chuỗi, dọn chuỗi cũ', () => {
  const at = (y, m, d, h = 8) => new Date(y, m - 1, d, h, 30).toISOString();
  const local = (iso) => { const d = new Date(iso); return [d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]; };
  assert.deepEqual(BG.recurTimes(at(2026, 10, 30), 'day', 3).map(local), [[10, 30, 8, 30], [10, 31, 8, 30], [11, 1, 8, 30]]);
  assert.deepEqual(BG.recurTimes(at(2026, 12, 24), 'week', 2).map(local), [[12, 24, 8, 30], [12, 31, 8, 30]]);
  assert.deepEqual(BG.recurTimes(at(2026, 10, 1), '2w', 3).map(local), [[10, 1, 8, 30], [10, 15, 8, 30], [10, 29, 8, 30]]);
  // 31/01 hằng tháng: 28/02 (2027 không nhuận), 31/03, 30/04
  assert.deepEqual(BG.recurTimes(at(2027, 1, 31), 'month', 4).map(local), [[1, 31, 8, 30], [2, 28, 8, 30], [3, 31, 8, 30], [4, 30, 8, 30]]);
  assert.equal(BG.recurTimes(at(2026, 10, 1), 'day', 99).length, BG.RECUR_MAX);
  assert.deepEqual(BG.recurTimes('x', 'day', 3), []);
  assert.deepEqual(BG.recurTimes(at(2026, 10, 1), 'year', 3), []);
  // Quan trọng 1 tuần: tính từ giờ đăng của từng bài; tự chọn ngày: dời theo khoảng cách
  const s = { canComment: true, isImportant: true, importantExpiredAt: BG.importantUntil('1w', at(2026, 10, 1)) };
  const t = BG.recurTimes(at(2026, 10, 1), 'week', 2);
  assert.equal(BG.recurSetting(s, '1w', t[0], t[1]).importantExpiredAt, BG.importantUntil('1w', t[1]));
  assert.equal(BG.recurSetting({ ...s, importantExpiredAt: at(2026, 10, 3) }, 'custom', t[0], t[1]).importantExpiredAt, at(2026, 10, 10));
  assert.deepEqual(BG.recurSetting({ isImportant: false, importantExpiredAt: null }, '1w', t[0], t[1]), { isImportant: false, importantExpiredAt: null });
  const recurring = [{ id: 'r1', every: 'week', count: 2, items: [{ contentId: 'a', scheduledAt: t[0] }, { contentId: 'b', scheduledAt: t[1] }] }];
  assert.deepEqual(BG.recurIndex(recurring).get('b'), { id: 'r1', k: 2, n: 2, every: 'week' });
  assert.equal(BG.pruneRecurring(recurring, new Date(t[1]).getTime() + 6 * 864e5).length, 1);
  assert.equal(BG.pruneRecurring(recurring, new Date(t[1]).getTime() + 8 * 864e5).length, 0);
});

test('sao lưu: tạo bản sao lưu, đọc lại có làm sạch, tóm tắt, gộp hồ sơ vi phạm', () => {
  const u = { id: 'u1', username: 'an', fullname: 'An', avatar: '' };
  const profiles = BG.addViolations(null, [{ user: u, type: 'banned', key: 'ban:1', time: '2026-10-01T00:00:00Z', group: 'G' }]).store;
  const store = { settings: { dryRun: false, intervalMin: 15 }, rules: { bannedKeywords: ['spam'] }, postRules: {}, groupRules: { g1: { name: 'G1', rules: {}, postRules: {} } }, templates: [{ id: 't1', name: 'Mẫu', text: 'Chào', groupIds: ['g1'] }], profiles, state: { x: 1 }, log: [1] };
  const b = BG.makeBackup(store, { version: '0.10.0', now: Date.parse('2026-10-09T01:00:00Z') });
  assert.deepEqual(Object.keys(b.data), ['settings', 'rules', 'postRules', 'groupRules', 'templates']); // không có state / nhật ký / hồ sơ
  assert.deepEqual([b.app, b.format, b.version, b.exportedAt], ['BeinFusion', 1, '0.10.0', '2026-10-09T01:00:00.000Z']);
  assert.ok(BG.makeBackup(store, { profiles: true }).data.profiles);
  // Đọc lại: bỏ khoá lạ / sai kiểu, giới hạn số
  const r = BG.readBackup(JSON.parse(JSON.stringify({
    ...b,
    data: {
      ...b.data,
      settings: { dryRun: false, intervalMin: 1, actionDelaySec: '3', autoApprove: 'yes', hack: true },
      rules: { bannedKeywords: ['spam', 5, ' '], minAnswerLength: 999, evil: 'x' },
      groupRules: { g1: { name: 'G1', rules: { requireAvatar: false } }, 'bad id!': {} },
      templates: [{ name: 'Mẫu', text: 'Chào', tags: [{ id: 't', name: 'AMA' }, { id: 1 }] }, { name: 1 }],
    },
  })));
  assert.deepEqual(r.data.settings, { dryRun: false, intervalMin: 5, actionDelaySec: 3 });
  assert.deepEqual(r.data.rules, { bannedKeywords: ['spam'], minAnswerLength: 200 });
  assert.deepEqual(Object.keys(r.data.groupRules), ['g1']);
  assert.equal(r.data.groupRules.g1.rules.requireAvatar, false);
  assert.equal(r.data.groupRules.g1.rules.declineDeactivated, true); // đủ khoá
  assert.deepEqual(r.data.templates.map((t) => [t.id, t.name, t.canComment, t.tags.length]), [['tpl0', 'Mẫu', true, 1]]);
  assert.deepEqual([r.version, r.exportedAt], ['0.10.0', '2026-10-09T01:00:00.000Z']);
  assert.deepEqual(BG.backupSummary(r.data), ['Cài đặt chung (Chạy thử: TẮT)', 'Quy tắc lọc thành viên', 'Quy tắc bài viết', 'Quy tắc riêng: 1 group', 'Mẫu bài: 1']);
  assert.throws(() => BG.readBackup({ app: 'Khác', data: {} }), /Không phải tệp sao lưu/);
  assert.throws(() => BG.readBackup({ ...b, format: 9 }), /phiên bản BeinFusion mới hơn/);
  assert.throws(() => BG.readBackup({ app: 'BeinFusion', data: { foo: 1 } }), /không có dữ liệu/);
  // Tệp sao lưu trước khi đổi tên (BeinGroup) vẫn đọc được; tệp của ứng dụng khác thì không
  assert.equal(BG.readBackup({ app: 'BeinGroup', format: 1, data: { settings: { unansweredHours: 24 } } }).data.settings.unansweredHours, 24);
  assert.throws(() => BG.readBackup({ app: 'Khac', data: { settings: {} } }), /Không phải tệp sao lưu của BeinFusion/);
  // Gộp hồ sơ: bỏ trùng, thêm người mới
  const incoming = BG.readBackup(BG.makeBackup({ profiles: BG.addViolations(profiles, [{ user: { id: 'u2', username: 'binh' }, type: 'hidden', key: 'hide:9', time: '2026-10-02T00:00:00Z' }]).store }, { profiles: true })).data.profiles;
  const merged = BG.mergeProfiles(profiles, incoming);
  assert.deepEqual(Object.keys(merged.users).sort(), ['u1', 'u2']);
  assert.equal(merged.users.u1.events.length, 1);
});

test('bình luận: thu gọn, trả lời đi kèm, chọn bài cần đọc, gộp, link, hồ sơ vi phạm', () => {
  const post = { id: 'p1', type: 'POST', text: 'Bài   về DeFi', groups: [{ id: 'g1', name: 'G1', communityId: 'k1', isCommunity: true, approval: null }], seenIn: ['g1'] };
  const raw = [
    { id: 'c1', parentId: BG.COMMENT_ROOT, content: 'Hay', actor: { id: 'u1', username: 'an' }, createdAt: '2026-10-07T10:00:00Z', media: { images: [{}, {}] }, totalReply: 1, child: { list: [{ id: 'c2', content: 'Đúng', actor: { id: 'u2' }, createdAt: '2026-10-07T10:05:00Z' }] } },
    { id: 'c3', postId: 'p1', content: 'GIF', giphyUrl: 'https://g', actor: {}, createdAt: '2026-10-07T09:00:00Z' },
    null,
  ];
  const list = BG.flattenComments(raw, post);
  assert.deepEqual(list.map((c) => [c.id, c.parentId, c.postId, c.images, c.giphy]), [['c1', '', 'p1', 2, false], ['c2', 'c1', 'p1', 0, false], ['c3', '', 'p1', 0, true]]);
  assert.deepEqual([list[0].postSnippet, list[0].seenIn, list[0].groups[0]], ['Bài về DeFi', ['g1'], { id: 'g1', name: 'G1', communityId: 'k1', rootGroupId: '', isCommunity: true }]);
  assert.equal(BG.commentUrl(list[1]), 'https://group.beincom.com/posts/p1?comment_id=c2&parent_id=c1');
  assert.equal(BG.commentUrl({ ...list[0], postType: 'ARTICLE' }), 'https://group.beincom.com/article/p1?comment_id=c1');
  // Chấm như bài viết (link trong chữ)
  assert.equal(BG.evaluatePostIn({ ...list[0], text: 'xem t.me/abc' }, { postRules: { blockedDomains: ['t.me'] }, groups: [] }).verdict, 'bad');
  // Bài cần đọc: số bình luận tăng; bài ẩn bỏ qua; mới đăng trước; giới hạn
  const posts = [
    { id: 'a', commentsCount: 3, publishedAt: '2026-10-07T08:00:00Z' },
    { id: 'b', commentsCount: 2, publishedAt: '2026-10-07T09:00:00Z' },
    { id: 'c', commentsCount: 0, publishedAt: '2026-10-07T10:00:00Z' },
    { id: 'd', commentsCount: 5, publishedAt: '2026-10-07T11:00:00Z', isHidden: true },
    { id: 'e', commentsCount: 4, publishedAt: '2026-10-07T07:00:00Z' },
  ];
  assert.deepEqual(BG.commentTargets({ a: 3, e: 1 }, posts, 5).map((p) => p.id), ['b', 'e']);
  assert.deepEqual(BG.commentTargets({}, posts, 2).map((p) => p.id), ['b', 'a']);
  // Gộp: giữ đánh dấu, mới nhất trước
  const prev = [{ ...list[0], dismissed: true, firstSeen: 1 }];
  const m = BG.mergeComments(prev, list, 99);
  assert.deepEqual(m.fresh, ['c2', 'c3']);
  assert.deepEqual(m.list.map((c) => [c.id, c.dismissed, c.firstSeen]), [['c2', false, 99], ['c1', true, 1], ['c3', false, 99]]);
  assert.deepEqual(BG.violationsFromComments([list[0], list[2]], () => 'link cấm').map((v) => [v.user.id, v.key, v.group, v.reason]), [['u1', 'rule:c:c1', 'G1', 'link cấm']]);
  assert.deepEqual(BG.violationsFromLog([{ kind: 'comment', action: 'hide', status: 'ok', contentId: 'c1', userId: 'u1', time: 1 }]).map((v) => [v.type, v.key]), [['hidden', 'hidden:c:c1']]);
  // Tin chat bị ẩn do báo cáo / bị xoá: vào hồ sơ vi phạm; Bỏ qua báo cáo thì không
  assert.deepEqual(
    BG.violationsFromLog([
      { kind: 'chat', action: 'reportHide', status: 'ok', contentId: 'r1', userId: 'u1', time: 1 },
      { kind: 'chat', action: 'reportIgnore', status: 'ok', contentId: 'r2', userId: 'u1', time: 2 },
      { kind: 'chat', action: 'reportHide', status: 'dry', contentId: 'r3', userId: 'u1', time: 3 },
    ]).map((v) => [v.type, v.key]),
    [['hidden', 'hidden:chat:r1']],
  );
  assert.equal(BG.isContentGone({ body: { code: 'comment.not_found' } }), true);
  // Đọc trả lời: bình luận gốc có số trả lời tăng
  const tops = [{ id: 'a', parentId: '', totalReply: 2, createdAt: '1' }, { id: 'b', parentId: '', totalReply: 1, createdAt: '3' }, { id: 'r', parentId: 'a', totalReply: 0 }, { id: 'c', parentId: '', totalReply: 4, createdAt: '2', isHidden: true }];
  assert.deepEqual(BG.replyTargets(tops, [{ id: 'a', totalReply: 2 }], 5).map((c) => c.id), ['b']);
  assert.deepEqual(BG.replyTargets(tops, [], 1).map((c) => c.id), ['b']);
});

test('tóm tắt tuần: đếm thao tác trong kỳ, thành viên tăng giảm, vi phạm phát hiện, người vi phạm nhiều nhất, bản chữ', () => {
  const now = Date.parse('2026-10-09T05:00:00Z'); // 12:00 giờ VN
  const day = 864e5;
  const L = (kind, action, ago, extra = {}) => ({ kind, action, status: 'ok', time: now - ago * day, ...extra });
  const log = [
    L('member', 'approve', 1), L('member', 'approve', 2, { source: 'auto' }), L('member', 'decline', 3), L('member', 'approve', 9), // ngoài kỳ
    L('manage', 'ban', 1), L('manage', 'remove', 2), L('manage', 'unban', 2),
    L('post', 'hide', 1), L('post', 'approve', 1), L('comment', 'hide', 1), L('report', 'ignore', 1), L('report', 'hide', 2),
    L('compose', 'publish', 1), L('compose', 'schedule', 1), L('groupSetting', 'on', 1),
    { kind: 'post', action: 'delete', status: 'error', time: now - day }, { kind: 'member', action: 'approve', status: 'dry', time: now - day },
  ];
  const groups = [{ id: 'g1', name: 'Crypto Life', userCount: 1250 }, { id: 'g2', name: 'Food', userCount: 3 }, { id: 'g3', name: 'Mới', userCount: 10 }];
  const memberHistory = {
    g1: [{ day: '2026-09-30', count: 1200 }, { day: '2026-10-02', count: 1210 }, { day: '2026-10-05', count: 1230 }],
    g2: [{ day: '2026-10-05', count: 4 }],
  };
  const ctx = { postRules: { blockedDomains: ['t.me'] }, groups: [] };
  const recentPosts = [{ id: 'p1', text: 't.me/x', firstSeen: now - day }, { id: 'p2', text: 'ok', firstSeen: now - day }, { id: 'p3', text: 't.me/y', firstSeen: now - 10 * day }];
  const recentComments = [{ id: 'c1', text: 'vào t.me/z', firstSeen: now - 2 * day }];
  const profiles = { users: {
    u1: { user: { id: 'u1', username: 'keo', fullname: 'Kèo VIP' }, events: [{ type: 'banned', time: new Date(now - day).toISOString() }, { type: 'rule', time: new Date(now - 2 * day).toISOString() }, { type: 'rule', time: new Date(now - 20 * day).toISOString() }] },
    u2: { user: { id: 'u2', username: 'an', fullname: 'An' }, events: [{ type: 'hidden', time: new Date(now - day).toISOString() }] },
    u3: { user: { id: 'u3', username: 'cu', fullname: 'Cũ' }, events: [{ type: 'hidden', time: new Date(now - 30 * day).toISOString() }] },
  } };
  const r = BG.weeklyReport({ log, profiles, recentPosts, recentComments, memberHistory, groups, ctx }, { days: 7, now });
  assert.deepEqual([r.fromDay, r.toDay], ['2026-10-02', '2026-10-09']);
  assert.deepEqual(r.members.map((m) => [m.id, m.start, m.end, m.change]), [['g1', 1210, 1250, 40], ['g2', 4, 3, -1]]);
  const a = r.actions;
  assert.deepEqual([a.approved, a.autoApproved, a.declined, a.banned, a.removed, a.unbanned], [1, 1, 1, 1, 1, 1]);
  assert.deepEqual([a.postsHidden, a.postsApproved, a.commentsHidden, a.reportsHandled, a.published, a.scheduled, a.groupSettings, a.errors], [1, 1, 1, 2, 1, 1, 1, 1]);
  assert.deepEqual(r.detected, { posts: 1, comments: 1 });
  assert.deepEqual(r.violators.map((v) => [v.user.id, v.count, v.types]), [['u1', 2, ['Bị cấm', 'Bài vi phạm quy tắc']], ['u2', 1, ['Nội dung bị ẩn']]]);
  const text = BG.reportText(r);
  assert.match(text, /^BeinFusion: tóm tắt 7 ngày \(02\/10 → 09\/10\/2026\)/);
  assert.match(text, /Thành viên: Crypto Life \+40 \(1\.250\) · Food −1 \(3\)/);
  const same = BG.reportText({ ...r, members: [...r.members, { id: 'g9', name: 'Yên', start: 5, end: 5, change: 0 }] });
  assert.match(same, /Food −1 \(3\) · 1 group không đổi/);
  assert.match(text, /Duyệt thành viên: 2 duyệt \(1 tự động\) · 1 từ chối/);
  assert.match(text, /Vi phạm nhiều nhất: Kèo VIP \(@keo\) 2 lần, An \(@an\) 1 lần/);
  assert.ok(!/Đăng bài qua addon: 0/.test(text));
  assert.match(BG.reportText(BG.weeklyReport({}, { now })), /Không có hoạt động nào/);
  // Thông báo sáng thứ Hai, mỗi tuần một lần
  const mon7 = Date.parse('2026-10-12T00:30:00Z'); // 07:30 thứ Hai giờ VN
  const mon9 = Date.parse('2026-10-12T02:00:00Z'); // 09:00 thứ Hai
  assert.equal(BG.weeklyDue(null, mon7), null);
  assert.equal(BG.weeklyDue(null, mon9), '2026-10-12');
  assert.equal(BG.weeklyDue('2026-10-12', mon9 + 3600e3), null);
  assert.equal(BG.weeklyDue('2026-10-12', now), null); // thứ Sáu
});

test('spam: mã lý do, tên miền cấm theo group, khoá link, đợt spam, community cấm được', () => {
  const ev = BG.evaluatePost({ title: '', text: 'Kèo tại t.me/abc và example.org', link: '' }, { bannedKeywords: ['kèo'], blockedDomains: ['t.me'], reviewExternalLinks: true });
  assert.deepEqual(ev.reasons.map((r) => [r.code, r.domains || null]), [['keyword', null], ['blocked', ['t.me']], ['external', null]]);
  // Tên miền cấm theo quy tắc riêng của group; từ khoá không tính
  const ctx = { postRules: {}, groupRules: { g1: { postRules: { blockedDomains: ['bit.ly'], bannedKeywords: ['kèo'] } } }, groups: [{ id: 'g1', isCommunity: true }] };
  assert.deepEqual(BG.blockedHits({ text: 'kèo bit.ly/x', seenIn: ['g1'] }, ctx), ['bit.ly']);
  assert.deepEqual(BG.blockedHits({ text: 'kèo bit.ly/x', seenIn: ['g2'] }, ctx), []);
  assert.deepEqual(BG.blockedHits({ text: 'chỉ có kèo', seenIn: ['g1'] }, ctx), []);
  assert.deepEqual(BG.linkKeys('A https://www.Bit.ly/Abc?x=1, B bit.ly/abc/ C t.me'), [{ key: 'bit.ly/abc', host: 'bit.ly' }, { key: 't.me', host: 't.me' }]);
  const now = Date.parse('2026-10-09T12:00:00Z');
  const t = (min) => new Date(now - min * 60e3).toISOString();
  const it = (id, uid, text, min, kind = 'comment') => ({ id, kind, actor: { id: uid, username: uid }, text, time: t(min) });
  const items = [
    it('a', 'u1', 'Vào scam.xyz/go nhận quà', 10), it('b', 'u2', 'scam.xyz/go', 20), it('c', 'u3', 'scam.xyz/go/', 30, 'post'),
    it('d', 'u4', 'scam.xyz/go cũ', 7 * 60), // ngoài 6 giờ
    it('e', 'u1', 'beincom.com/posts/1', 5), it('f', 'u2', 'beincom.com/posts/1', 5), it('g', 'u3', 'beincom.com/posts/1', 5), // tên miền cho phép
    it('h', 'u5', 'Nhận ngay 500 USDT miễn phí cho thành viên mới!!!', 5), it('i', 'u6', 'Nhận ngay 500 USDT miễn phí cho thành viên mới', 6), it('j', 'u7', 'nhận ngay 500 usdt mien phi cho thanh vien moi', 7),
    it('k', 'u8', 'ok', 1), it('l', 'u9', 'ok', 1), it('m', 'u10', 'ok', 1), // quá ngắn
    it('n', 'me', 'two.io/x', 1), it('o', 'u11', 'two.io/x', 1), it('p', 'u12', 'two.io/x', 1), // có bài của chính mình -> chưa đủ 3
  ];
  const waves = BG.spamWaves(items, { now, skipActorIds: ['me'] });
  // scam.xyz/go: 3 tài khoản trong 6 giờ (d quá cũ); beincom.com bỏ qua; "ok" quá ngắn; two.io chỉ 2 tài khoản khi bỏ bài của mình
  assert.deepEqual(waves.map((w) => [w.key, w.accounts.length, w.items.map((i) => i.id).join('')]), [['link:scam.xyz/go', 3, 'abc']]);
  // Dấu câu khác nhau vẫn khác khoá: h có "!!!" -> chỉ i, j giống nhau (2 tài khoản) nên không thành đợt
  const waves2 = BG.spamWaves([...items, it('q', 'u13', 'Nhận ngay 500 USDT miễn phí cho thành viên mới', 3)], { now, skipActorIds: ['me'] });
  assert.deepEqual(waves2.map((w) => w.key), ['link:scam.xyz/go', 'text:nhan ngay 500 usdt mien phi cho thanh vien moi']);
  // Đợt nội dung đã nằm trọn trong đợt link thì không báo lần hai
  const dup = BG.spamWaves([it('a', 'u1', 'Nhận quà miễn phí tại scam.xyz/go nhanh', 1), it('b', 'u2', 'Nhận quà miễn phí tại scam.xyz/go nhanh', 2), it('c', 'u3', 'Nhận quà miễn phí tại scam.xyz/go nhanh', 3)], { now });
  assert.deepEqual(dup.map((w) => w.key), ['link:scam.xyz/go']);
  assert.deepEqual(BG.waveItems([{ id: 'p', actor: { id: 'u' }, title: 'T', text: 'x', link: 'l', publishedAt: 'd', isHidden: true }], [{ id: 'c', actor: { id: 'v' }, text: 'y', createdAt: 'e' }]), [
    { id: 'p', kind: 'post', actor: { id: 'u' }, text: 'T\nx\nl', time: 'd', isHidden: true },
    { id: 'c', kind: 'comment', actor: { id: 'v' }, text: 'y', time: 'e', isHidden: undefined },
  ]);
  assert.deepEqual(BG.banTargets([{ id: 'a', isCommunity: true, canBan: true, communityId: 'k1' }, { id: 'b', isCommunity: false, canBan: true, communityId: 'k1' }, { id: 'c', isCommunity: true, canBan: false, communityId: 'k2' }, { id: 'd', isCommunity: true, canBan: true, communityId: 'k1' }]).map((g) => g.id), ['a']);
});

test('bình luận và chào thành viên mới: kiểm tra nội dung, nhắc tên, trả lời, bài chưa ai trả lời, người mới, bài chào', () => {
  assert.equal(BG.validateComment('  '), 'Bình luận chưa có nội dung');
  assert.match(BG.validateComment('a'.repeat(3001)), /tối đa 3000/);
  assert.equal(BG.validateComment('ok'), '');
  const people = [{ id: 'u1', username: 'an', fullname: 'An', avatar: 'x' }, { id: 'u2', username: 'binh' }, { id: 'u3' }];
  assert.deepEqual(BG.commentMentions('@an, cảm ơn nhé', people), { an: { id: 'u1', fullname: 'An', username: 'an', avatar: 'x' } });
  assert.deepEqual(BG.replyTarget({ id: 'c2', parentId: 'c1', actor: { username: 'binh' } }), { commentId: 'c1', prefill: '@binh ' });
  assert.deepEqual(BG.replyTarget({ id: 'c1', parentId: '', actor: {} }), { commentId: 'c1', prefill: '' });
  const now = Date.parse('2026-10-09T12:00:00Z');
  const h = (x) => new Date(now - x * 3600e3).toISOString();
  const P = (extra) => ({ publishedAt: h(5), commentsCount: 0, actor: { id: 'a' }, ...extra });
  assert.deepEqual([P({}), P({ publishedAt: h(1) }), P({ commentsCount: 2 }), P({ publishedAt: h(24 * 8) }), P({ isHidden: true }), P({ actor: { id: 'me' } })].map((p) => BG.isUnanswered(p, { now, meId: 'me' })), [true, false, false, false, false, false]);
  const ev = (id, kind, uid, hoursAgo) => ({ id, kind, user: { id: uid, username: uid }, time: h(hoursAgo) });
  const fresh = BG.newMembersFromActivity([ev(1, 'in', 'a', 5), ev(2, 'out', 'b', 2), ev(3, 'in', 'b', 10), ev(4, 'in', 'c', 24 * 9), ev(5, 'role', 'd', 1), ev(6, 'in', 'a', 20)], now - 7 * 864e5);
  assert.deepEqual(fresh.map((u) => [u.id, u.joinedAt]), [['a', h(5)]]);
  const users = Array.from({ length: 52 }, (_, i) => ({ id: 'u' + i, username: 'nguoi' + i, fullname: 'Người ' + i }));
  const w = BG.welcomeText('Chào {so_nguoi} bạn mới ở {group}: {danh_sach}', { users: [...users, { id: 'x', username: '' }], groupName: 'Crypto Life' });
  assert.match(w.text, /^Chào 52 bạn mới ở Crypto Life: @nguoi0, @nguoi1, /);
  assert.match(w.text, /@nguoi49 và 2 bạn khác$/);
  assert.equal(Object.keys(w.mentions).length, 50);
  assert.deepEqual(w.mentions.nguoi0, { id: 'u0', avatar: '', name: 'nguoi0', fullname: 'Người 0', isVerified: false });
  assert.match(BG.welcomeText('', { users: users.slice(0, 1), groupName: 'G' }).text, /^Chào mừng 1 thành viên mới của G 👋/);
});

test('vinh danh và theo dõi: xếp hạng thành viên, bài vinh danh, từ khoá theo dõi', () => {
  const since = Date.parse('2026-10-02T00:00:00Z');
  const A = { id: 'a', username: 'an', fullname: 'An' };
  const B = { id: 'b', username: 'binh', fullname: 'Bình' };
  const C = { id: 'c', username: 'chi', fullname: 'Chi' };
  const ME = { id: 'me', username: 'kai' };
  const posts = [
    { actor: A, publishedAt: '2026-10-05T00:00:00Z', reactions: 20, commentsCount: 4 },
    { actor: A, publishedAt: '2026-10-06T00:00:00Z', reactions: 3, commentsCount: 0 },
    { actor: B, publishedAt: '2026-10-07T00:00:00Z', reactions: 0, commentsCount: 1 },
    { actor: C, publishedAt: '2026-09-20T00:00:00Z', reactions: 99 }, // ngoài kỳ
    { actor: ME, publishedAt: '2026-10-07T00:00:00Z', reactions: 50 },
  ];
  const comments = [{ actor: B, createdAt: '2026-10-07T01:00:00Z' }, { actor: B, createdAt: '2026-10-07T02:00:00Z' }, { actor: C, createdAt: '2026-10-08T00:00:00Z' }, { actor: C, createdAt: '2026-09-01T00:00:00Z' }];
  const rows = BG.topMembers({ posts, comments, since, skipIds: ['me'] });
  // An: 2×5 + 0 + 23×0,5 = 21,5 -> 22; Bình: 5 + 2 = 7; Chi: 1
  assert.deepEqual(rows.map((r) => [r.user.id, r.posts, r.comments, r.reactions, r.replies, r.score]), [['a', 2, 0, 23, 4, 22], ['b', 1, 2, 0, 1, 7], ['c', 0, 1, 0, 0, 1]]);
  assert.equal(BG.topMembers({ posts, comments, since, skipIds: ['me'], limit: 1 }).length, 1);
  const t = BG.shoutoutText('Top {so_nguoi} của {group}:\n{danh_sach}', { rows: [...rows, { user: { id: 'd', username: 'du' }, posts: 0, comments: 1 }], groupName: 'Crypto Life' });
  assert.equal(t.text, 'Top 4 của Crypto Life:\n🥇 @an — 2 bài\n🥈 @binh — 1 bài, 2 bình luận\n🥉 @chi — 1 bình luận\n4. @du — 1 bình luận');
  assert.deepEqual(Object.keys(t.mentions), ['an', 'binh', 'chi', 'du']);
  assert.match(BG.shoutoutText('', { rows: rows.slice(0, 1), groupName: 'G' }).text, /^Cảm ơn những thành viên tích cực nhất của G tuần qua 🏆\n\n🥇 @an/);
  assert.deepEqual(BG.watchHits('Sàn này LUA DAO, không rút tiền được', ['lừa đảo', 'rút tiền', 'scam', '']), ['lừa đảo', 'rút tiền']);
  assert.deepEqual(BG.watchHits('bình thường', ['lừa đảo']), []);
  assert.equal(BG.readBackup({ app: 'BeinFusion', data: { settings: { unansweredHours: 500, watchKeywords: ['a', 1] } } }).data.settings.unansweredHours, 72);
});

test('Telegram: loại tin, nội dung HTML an toàn, giờ yên lặng, khi nào gửi', () => {
  assert.deepEqual(['bg-wave', 'bg-autohide', 'bg-reports', 'bg-autoflag', 'bg-flagged', 'bg-comments', 'bg-requests', 'bg-posts-c1', 'bg-auto', 'bg-watch', 'bg-unanswered', 'bg-weekly', 'bg-welcome', 'bg-login', 'khac'].map(BG.telegramKind),
    ['spam', 'spam', 'reports', 'reports', 'violations', 'violations', 'queue', 'queue', 'queue', 'watch', 'watch', 'weekly', 'weekly', 'login', '']);
  assert.equal(BG.telegramText('A <b>', 'x & y', 'javascript:alert(1)'), '<b>A &lt;b&gt;</b>\nx &amp; y');
  assert.equal(BG.telegramText('T', '', 'https://group.beincom.com/posts/1?a=1&b=2'), '<b>T</b>\n<a href="https://group.beincom.com/posts/1?a=1&amp;b=2">Mở trên Beincom</a>');
  const at = (h) => Date.parse(`2026-10-09T${String((h + 24 - 7) % 24).padStart(2, '0')}:30:00Z`); // h giờ VN
  assert.deepEqual([22, 23, 2, 6, 7, 12].map((h) => BG.isQuietHour(at(h))), [false, true, true, true, false, false]);
  const cfg = { ...BG.DEFAULT_TELEGRAM, enabled: true, token: 't', chatId: '1', quietNight: true };
  assert.deepEqual([BG.telegramShouldSend(cfg, 'bg-flagged', at(12)), BG.telegramShouldSend(cfg, 'bg-flagged', at(1)), BG.telegramShouldSend(cfg, 'bg-wave', at(1)), BG.telegramShouldSend(cfg, 'bg-login', at(1))], [true, false, true, true]);
  assert.equal(BG.telegramShouldSend(cfg, 'bg-requests', at(12)), false); // mặc định tắt loại hàng chờ
  assert.equal(BG.telegramShouldSend({ ...cfg, chatId: '' }, 'bg-wave', at(12)), false);
  assert.equal(BG.telegramShouldSend({ ...cfg, enabled: false }, 'bg-wave', at(12)), false);
  assert.equal(BG.validTelegramToken(' 123456789:' + 'a'.repeat(35) + ' '), true);
  assert.equal(BG.validTelegramToken('123:abc'), false);
});

test('giờ đăng tốt nhất: gom theo thứ × giờ (giờ VN), kéo ô ít bài về trung bình, mỗi ngày một gợi ý, lần tới', () => {
  const vn = (s) => new Date(s + '+07:00').toISOString();
  const P = (t, reactions, commentsCount = 0) => ({ publishedAt: vn(t), reactions, commentsCount });
  const posts = [
    P('2026-10-06T20:10:00', 30, 5), P('2026-10-06T20:50:00', 20, 3), P('2026-09-29T20:05:00', 25, 4), // T3 20h: 3 bài tốt
    P('2026-10-06T21:00:00', 2), // T3 21h
    P('2026-10-08T09:00:00', 100, 10), // T5 9h: 1 bài rất cao
    P('2026-10-04T23:30:00', 1), // CN 23h
    { publishedAt: 'x', reactions: 999 },
  ];
  const b = BG.bestTimes(posts);
  assert.equal(b.total, 6);
  const e = [40, 26, 33, 2, 120, 1];
  assert.equal(b.mean, e.reduce((s, x) => s + x, 0) / 6);
  assert.deepEqual([b.grid[2][20].posts, b.grid[2][20].avg], [3, 33]);
  // T5 9h: (120 + 2×37) / 3 ≈ 64.7; T3 20h: (99 + 2×37) / 5 ≈ 34.6 -> T5 9h lên đầu nhưng không tới 120
  assert.deepEqual(b.top.map((c) => [BG.WEEKDAYS[c.day], c.hour]), [['T5', 9], ['T3', 20], ['CN', 23]]);
  assert.ok(b.top[0].score < 120 && b.top[0].score > b.top[1].score);
  assert.equal(b.top.filter((c) => c.day === 2).length, 1); // mỗi ngày một khung
  assert.equal(b.byHour[20], 33);
  assert.deepEqual(BG.bestTimes([]).top, []);
  // Lần tới: thứ Ba 20:00 sau thứ Sáu 9/10 22:00 -> 13/10; cùng ngày nhưng sát giờ thì sang tuần sau
  assert.equal(BG.nextSlot(2, 20, Date.parse(vn('2026-10-09T22:00:00'))), vn('2026-10-13T20:00:00'));
  assert.equal(BG.nextSlot(5, 23, Date.parse(vn('2026-10-09T22:00:00'))), vn('2026-10-09T23:00:00'));
  assert.equal(BG.nextSlot(5, 22, Date.parse(vn('2026-10-09T21:55:00'))), vn('2026-10-16T22:00:00'));
});

test('lịch nội dung: lưới tháng bắt đầu Thứ Hai, giờ tốt nhất từng ngày', () => {
  const g = BG.monthGrid(2026, 9); // tháng 10/2026: ngày 1 là Thứ Năm
  assert.equal(g.length, 5);
  assert.deepEqual(g[0].map((c) => c.day), [28, 29, 30, 1, 2, 3, 4]);
  assert.deepEqual([g[0][0].key, g[0][0].inMonth, g[0][3].key, g[0][3].inMonth], ['2026-09-28', false, '2026-10-01', true]);
  assert.equal(g[4][6].key, '2026-11-01');
  assert.equal(BG.monthGrid(2027, 1).length, 4); // 02/2027: bắt đầu Thứ Hai, 28 ngày
  assert.equal(BG.monthGrid(2026, 7).length, 6); // 08/2026: bắt đầu Thứ Bảy, 31 ngày
  const vn = (s) => new Date(s + '+07:00').toISOString();
  const P = (t, reactions, commentsCount = 0) => ({ publishedAt: vn(t), reactions, commentsCount });
  const h = BG.dayBestHours(BG.bestTimes([P('2026-10-06T20:10:00', 30, 5), P('2026-10-06T21:00:00', 2), P('2026-10-08T09:00:00', 10)]));
  assert.deepEqual(h, [null, null, 20, null, 9, null, null]);
  assert.deepEqual(BG.dayBestHours(BG.bestTimes([])), [null, null, null, null, null, null, null]);
});

test('CSV: dấu phẩy / chấm phẩy, ngoặc kép, xuống dòng trong ô, BOM, dòng trống', () => {
  assert.deepEqual(BG.parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,"dòng 1\ndòng 2",\n'), [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', 'dòng 1\ndòng 2', ''],
  ]);
  assert.deepEqual(BG.parseCsv('noi_dung;group;gio\n"a; b";G;1/1/2027 7:00'), [
    ['noi_dung', 'group', 'gio'],
    ['a; b', 'G', '1/1/2027 7:00'],
  ]);
  assert.deepEqual(BG.parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]); // không có xuống dòng cuối
  assert.deepEqual(BG.parseCsv(''), []);
});

test('CSV: giờ đăng theo giờ Việt Nam, bỏ ngày không có thật', () => {
  const iso = (s) => new Date(BG.parseVnTime(s)).toISOString();
  assert.equal(iso('15/10/2026 20:00'), '2026-10-15T13:00:00.000Z');
  assert.equal(iso('5/1/2027 7:05:00'), '2027-01-05T00:05:00.000Z');
  assert.equal(iso('1.1.2027 7h05'), '2027-01-01T00:05:00.000Z');
  assert.equal(iso('2026-10-15 20:00'), '2026-10-15T13:00:00.000Z');
  assert.equal(iso('2026-10-15T20:00'), '2026-10-15T13:00:00.000Z');
  assert.equal(iso('2026-10-15T20:00:00Z'), '2026-10-15T20:00:00.000Z');
  assert.equal(iso('2026-10-15T20:00+07:00'), '2026-10-15T13:00:00.000Z');
  for (const bad of ['31/02/2026 10:00', '1/1/2027 24:00', '1/1/2027 10:60', '15/10/2026', 'mai 8h', '']) assert.ok(Number.isNaN(BG.parseVnTime(bad)), bad);
});

test('CSV: dòng -> bài hẹn giờ, tìm group theo tên / đường dẫn / id, lỗi từng dòng', () => {
  const now = Date.parse('2026-10-09T05:00:00Z'); // 12:00 giờ VN
  const groups = [
    { id: 'gCL', name: 'Crypto Life', path: 'Crypto Life' },
    { id: 'gG1', name: 'General', path: 'Crypto Life › General' },
    { id: 'gG2', name: 'General', path: 'Food › General' },
  ];
  const rows = BG.parseCsv(
    [
      'Nội dung;Group;Giờ đăng;Quan trọng;Tắt bình luận',
      '"Chào; cả nhà";crypto life;10/10/2026 20:00;x;',
      'hi;General;10/10/2026 20:00;;',
      'hi;Food > General | gCL;2026-10-10 21:30;không;có',
      ';nope;hôm qua;;',
      'hi;gCL;09/10/2026 12:05;;',
      `${'a'.repeat(BG.POST_MAX + 1)};gCL;10/10/2026 20:00;;`,
      'hi;;10/10/2026 20:00;;',
    ].join('\n'),
  );
  const r = BG.csvPosts(rows, { groups, now });
  assert.equal(r.error, '');
  const [a, b, c, d, e, f, g] = r.posts;
  assert.deepEqual(
    { line: a.line, groupIds: a.groupIds, scheduledAt: a.scheduledAt, content: a.content, important: a.setting.isImportant, canComment: a.setting.canComment, errors: a.errors },
    { line: 2, groupIds: ['gCL'], scheduledAt: '2026-10-10T13:00:00.000Z', content: 'Chào; cả nhà', important: true, canComment: true, errors: [] },
  );
  assert.match(b.errors[0], /trùng 2 group/);
  assert.deepEqual([c.groupIds, c.groupNames, c.setting.isImportant, c.setting.canComment, c.errors], [['gG2', 'gCL'], ['Food › General', 'Crypto Life'], false, false, []]);
  assert.deepEqual(d.errors.length, 3);
  assert.match(e.errors[0], /quá gần/);
  assert.match(f.errors[0], /tối đa/);
  assert.deepEqual(g.errors, ['Thiếu group']);
  assert.equal(r.truncated, 0);
  // Thiếu cột / tệp trống / quá 100 dòng
  assert.match(BG.csvPosts(BG.parseCsv('text,time\nx,y'), { groups }).error, /Thiếu cột/);
  assert.equal(BG.csvPosts([], { groups }).error, 'Tệp trống');
  const many = [['noi_dung', 'group', 'gio_dang'], ...Array.from({ length: BG.CSV_MAX_ROWS + 5 }, () => ['x', 'gCL', '10/10/2026 20:00'])];
  const m = BG.csvPosts(many, { groups, now });
  assert.deepEqual([m.posts.length, m.truncated], [BG.CSV_MAX_ROWS, 5]);
});

test('CSV: tệp mẫu đọc lại được và hợp lệ', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  const tpl = BG.csvTemplate(['Crypto Life', 'Crypto Life › General'], now);
  assert.ok(tpl.startsWith('﻿noi_dung,group,gio_dang'));
  const groups = [
    { id: 'gCL', name: 'Crypto Life', path: 'Crypto Life' },
    { id: 'gG1', name: 'General', path: 'Crypto Life › General' },
  ];
  const r = BG.csvPosts(BG.parseCsv(tpl), { groups, now });
  assert.deepEqual(
    r.posts.map((p) => [p.groupIds, p.scheduledAt, p.setting.isImportant, p.errors]),
    [
      [['gCL'], '2026-10-10T13:00:00.000Z', false, []],
      [['gCL', 'gG1'], '2026-10-11T02:00:00.000Z', true, []],
    ],
  );
  assert.match(r.posts[1].content, /\n/);
});

test('Article: Markdown -> khối của trình soạn thảo (tiêu đề, đoạn, danh sách, trích dẫn, kẻ ngang, video, link, định dạng chữ)', () => {
  let n = 0;
  const id = () => 'n' + ++n;
  const nodes = BG.mdToPlate(
    [
      '# Lớn',
      '#### Sâu quá -> h3',
      'Có **đậm**, *nghiêng*, ~~gạch~~, ++chân++, `mã`, [link](https://beincom.com/a) và https://vd.vn/b.',
      '',
      '- một',
      '* hai **đậm**',
      '1. bước',
      '2) bước hai',
      '> trích',
      '> dòng 2',
      '---',
      'https://www.youtube.com/watch?v=abc',
      '```',
      'x = 1',
      '```',
      'snake_case và _nghiêng_',
      '***đậm nghiêng***',
    ].join('\n'),
    { id },
  );
  assert.deepEqual(
    nodes.map((x) => x.type),
    ['h1', 'h3', 'p', 'ul', 'ol', 'blockquote', 'hr', 'media_embed', 'p', 'p', 'p'],
  );
  assert.deepEqual(nodes[2].children, [
    { text: 'Có ' },
    { text: 'đậm', bold: true },
    { text: ', ' },
    { text: 'nghiêng', italic: true },
    { text: ', ' },
    { text: 'gạch', strikethrough: true },
    { text: ', ' },
    { text: 'chân', underline: true },
    { text: ', ' },
    { text: 'mã', code: true },
    { text: ', ' },
    { type: 'a', url: 'https://beincom.com/a', children: [{ text: 'link' }], id: 'n20' },
    { text: ' và ' },
    { type: 'a', url: 'https://vd.vn/b', children: [{ text: 'https://vd.vn/b' }], id: 'n21' },
    { text: '.' },
  ]);
  assert.deepEqual(nodes[3], {
    type: 'ul',
    id: 'n4',
    children: [
      { type: 'li', id: 'n5', children: [{ type: 'lic', id: 'n6', indent: 0, listStyleType: '', children: [{ text: 'một' }] }] },
      { type: 'li', id: 'n7', children: [{ type: 'lic', id: 'n8', indent: 0, listStyleType: '', children: [{ text: 'hai ' }, { text: 'đậm', bold: true }] }] },
    ],
  });
  assert.equal(nodes[4].children.length, 2);
  assert.deepEqual(nodes[5].children, [{ text: 'trích\ndòng 2' }]);
  assert.deepEqual(nodes[6].children, [{ text: '' }]);
  assert.deepEqual([nodes[7].url, nodes[7].caption, nodes[7].children], ['https://www.youtube.com/watch?v=abc', [{ text: '' }], [{ text: '' }]]);
  assert.deepEqual(nodes[8].children, [{ text: 'x = 1', code: true }]);
  assert.deepEqual(nodes[9].children, [{ text: 'snake_case và ' }, { text: 'nghiêng', italic: true }]);
  assert.deepEqual(nodes[10].children, [{ text: 'đậm nghiêng', bold: true, italic: true }]);
  // Link đứng đầu / cuối dòng: có đoạn chữ rỗng hai bên (quy ước Slate)
  assert.deepEqual(BG.mdToPlate('[a](https://x.vn)', { id })[0].children, [{ text: '' }, { type: 'a', url: 'https://x.vn', children: [{ text: 'a' }], id: 'n23' }, { text: '' }]);
  // Trống: một đoạn rỗng; id mặc định 21 ký tự
  assert.deepEqual(BG.mdToPlate('').map((x) => [x.type, x.id.length, x.children]), [['p', 21, [{ text: '' }]]]);
  assert.match(BG.nodeId(), /^[\w-]{21}$/);
});

test('Article: đếm chữ / từ như web, xem trước an toàn', () => {
  const nodes = BG.mdToPlate('## Tiêu đề\nHai  từ\n- một mục', { id: () => '' });
  assert.equal(BG.plateText(nodes), 'Tiêu đề Hai  từ một mục');
  assert.equal(BG.plateWords(nodes), 6);
  const html = BG.plateHtml(BG.mdToPlate('<script>alert(1)</script> **b** [x](javascript:alert(1)) [y](https://ok.vn/"q)', { id: () => '' }));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/href="javascript/.test(html));
  assert.ok(html.includes('<strong>b</strong>'));
  assert.ok(html.includes('href="https://ok.vn/&quot;q"'));
});

test('Article / Series: kiểm tra dữ liệu và body gửi Beincom', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  const ok = { groupIds: ['g1'], title: 'Tiêu đề', summary: '', content: 'Nội dung', categoryIds: ['c1'], hasCover: true };
  assert.equal(BG.validateArticle(ok, now), '');
  assert.match(BG.validateArticle({ ...ok, content: 'x'.repeat(BG.ARTICLE_MAX + 1) }, now), /tối đa 100\.000/);
  assert.match(BG.validateArticle({ ...ok, tags: [1, 2, 3, 4, 5, 6] }, now), /Tối đa 5 tag/);
  assert.match(BG.validateArticle({ ...ok, scheduledAt: 'x' }, now), /không hợp lệ/);
  const b = BG.articleBody({ groupIds: ['g1'], title: ' T ', summary: ' S ', content: 'a b c', categoryIds: ['c1'], coverId: 'cv', tags: [{ id: 't1', name: 'x' }], series: ['s1'], scheduledAt: '2026-10-10T13:00:00.000Z' }, { id: () => 'i' });
  assert.deepEqual(b, {
    audience: { groupIds: ['g1'], userIds: [] },
    categories: ['c1'],
    series: ['s1'],
    content: '[{"type":"p","id":"i","children":[{"text":"a b c"}]}]',
    title: 'T',
    mentions: {},
    summary: 'S',
    coverMedia: { id: 'cv' },
    tags: ['t1'],
    wordCount: 3,
    scheduledAt: '2026-10-10T13:00:00.000Z',
  });
  assert.equal('scheduledAt' in BG.articleBody({ groupIds: ['g1'], title: 'T', content: 'a', categoryIds: [], coverId: 'c' }), false);
  assert.equal(BG.validateSeries({ groupIds: ['g1'], title: 'S', hasCover: true }), '');
  assert.match(BG.validateSeries({ groupIds: ['g1'], title: '', hasCover: true }), /cần tên/);
  assert.match(BG.validateSeries({ groupIds: ['g1'], title: 'S', summary: 'x'.repeat(256), hasCover: true }), /255/);
  assert.match(BG.validateSeries({ groupIds: [], title: 'S', hasCover: true }), /Chưa chọn group/);
});

test('Telegram có nút: bàn phím, mã nút, nội dung tin, kết quả, dọn việc cũ, nhãn nguồn', () => {
  assert.deepEqual(BG.tgKeyboard('request', 'abcdefghij', 'https://group.beincom.com/x'), {
    inline_keyboard: [
      [
        { text: '✅ Duyệt', callback_data: 'abcdefghij:a' },
        { text: '❌ Từ chối', callback_data: 'abcdefghij:d' },
      ],
      [{ text: 'Mở trên Beincom', url: 'https://group.beincom.com/x' }],
    ],
  });
  assert.deepEqual(BG.tgKeyboard('post', 'abcdefghij', 'javascript:x', []), { inline_keyboard: [] });
  for (const k of Object.keys(BG.TG_ACTIONS)) for (const b of BG.TG_ACTIONS[k]) assert.ok(Buffer.byteLength(`abcdefghij:${b.act}`) <= 64);
  assert.deepEqual(BG.parseTgCallback('abcdefghij:h'), { token: 'abcdefghij', act: 'h' });
  for (const bad of ['', 'abc:a', 'ABCDEFGHIJ:a', 'abcdefghij:', 'abcdefghij:ab']) assert.equal(BG.parseTgCallback(bad), null);
  assert.match(BG.tgToken(), /^[a-z0-9]{10}$/);
  assert.equal(BG.tgActAllowed('request', 'a'), true);
  assert.equal(BG.tgActAllowed('approval', 'd'), false);
  assert.equal(BG.tgActAllowed('request', 'a', []), false);
  assert.equal(BG.telegramItemText({ head: 'A <b>', who: 'x & y', text: 'z'.repeat(700), note: 'n' }), '<b>A &lt;b&gt;</b>\nx &amp; y\n' + 'z'.repeat(600) + '…\n<i>n</i>');
  assert.deepEqual(BG.tgResult('request', 'a', { status: 'ok', ok: 1, failed: 0 }), { done: true, line: '✅ Đã duyệt' });
  assert.equal(BG.tgResult('post', 'h', { status: 'ok', dryRun: true }).done, false);
  assert.equal(BG.tgResult('post', 'h', { status: 'need_login' }).done, false);
  assert.equal(BG.tgResult('request', 'a', { status: 'error', message: 'Không còn yêu cầu nào để xử lý — hãy quét lại' }).done, true);
  assert.deepEqual(BG.tgResult('post', 'h', { status: 'ok', ok: 0, failed: 1, errors: ['HTTP 500'] }), { done: false, line: '⚠️ HTTP 500' });
  const now = Date.parse('2026-10-10T00:00:00Z');
  const map = { old: { at: now - 8 * 864e5 }, ...Object.fromEntries(Array.from({ length: 305 }, (_, i) => ['k' + i, { at: now - i * 1000 }])) };
  const kept = BG.pruneTgActions(map, now);
  assert.equal(Object.keys(kept).length, 300);
  assert.ok(!('old' in kept) && 'k0' in kept && !('k304' in kept));
  assert.equal(BG.telegramItemNotify('bg-requests'), true);
  assert.equal(BG.telegramItemNotify('bg-posts-cCL'), true);
  assert.equal(BG.telegramItemNotify('bg-reports'), false);
  assert.equal(BG.telegramActionsOn({ enabled: true, token: 't', chatId: '1', actions: true }), true);
  assert.equal(BG.telegramActionsOn({ enabled: true, token: 't', chatId: '1' }), false);
  assert.equal(BG.tgHideReason([{ code: 'blocked' }]), 'SPAM');
  assert.equal(BG.tgHideReason([{ code: 'keyword' }]), 'OTHERS');
  assert.deepEqual(['auto', 'telegram', 'manual', undefined].map(BG.sourceLabel), ['Tự động', 'Telegram', 'Bấm tay', 'Bấm tay']);
});

test('thành viên tin cậy: danh sách / số bài được duyệt, bị từ chối hoặc có hồ sơ vi phạm thì không; đếm từ nhật ký', () => {
  const s = { trustedMembers: ['@Kai'], trustAfterApproved: 3 };
  assert.equal(BG.trustReason({ id: 'u1', username: 'kai' }, s, {}), 'Thành viên tin cậy');
  assert.equal(BG.trustReason({ id: 'u2', username: 'lan' }, s, { u2: { approved: 3, rejected: 0 } }), 'Đã được duyệt 3 bài');
  assert.equal(BG.trustReason({ id: 'u2', username: 'lan' }, s, { u2: { approved: 9, rejected: 1 } }), '');
  assert.equal(BG.trustReason({ id: 'u2', username: 'lan' }, { ...s, trustAfterApproved: 0 }, { u2: { approved: 9, rejected: 0 } }), '');
  assert.equal(BG.trustReason({ id: 'u1', username: 'kai' }, s, {}, { events: [{ type: 'hidden' }] }), '');
  assert.equal(BG.trustReason({}, s, {}), '');
  const t = BG.tallyPostTrust({ u1: { approved: 1, rejected: 0, username: 'kai', at: 1 } }, [
    { kind: 'post', action: 'approve', status: 'ok', userId: 'u1', username: 'kai' },
    { kind: 'post', action: 'reject', status: 'ok', userId: 'u2', username: 'lan' },
    { kind: 'post', action: 'approve', status: 'dry', userId: 'u2' },
    { kind: 'post', action: 'hide', status: 'ok', userId: 'u2' },
    { kind: 'member', action: 'approve', status: 'ok', userId: 'u3' },
  ], 100);
  assert.deepEqual(t, { u1: { approved: 2, rejected: 0, username: 'kai', at: 100 }, u2: { approved: 0, rejected: 1, username: 'lan', at: 100 } });
  assert.equal(BG.readBackup({ app: 'BeinFusion', format: 1, data: { settings: { trustAfterApproved: 500 } } }).data.settings.trustAfterApproved, 100);
});

test('Article: bảng, ảnh, nhắc tên (chỉ người đã chọn), xem trước an toàn; kiểm tra ảnh chưa tải', () => {
  let n = 0;
  const id = () => 'n' + ++n;
  const kai = { id: 'u1', username: 'kai' };
  const nodes = BG.mdToPlate(['@kai, @lan (@kai).', '| A | B |', '|---|:-:|', '| **1** | 2 |', '| 3 |', '![x](https://media.beincom.com/a)', '![x](javascript:alert(1))', 'text'].join('\n'), { id, mentions: { kai } });
  assert.deepEqual(nodes.map((x) => x.type), ['p', 'table', 'img', 'p', 'p']);
  assert.deepEqual(nodes[0].children.map((x) => (x.type === 'mention' ? '@' + x.value : x.text)), ['', '@kai', ', @lan (', '@kai', ').']);
  assert.ok(nodes[0].children.filter((x) => x.type === 'mention').every((x) => x.id && x.data.id === 'u1' && x.children[0].text === ''));
  const t = nodes[1];
  assert.deepEqual(t.children.map((tr) => tr.children.map((c) => c.type + ':' + c.children[0].children.map((x) => x.text).join(''))), [['th:A', 'th:B'], ['td:1', 'td:2'], ['td:3', 'td:']]);
  assert.equal(t.children[1].children[0].children[0].children[0].bold, true);
  assert.equal(nodes[3].children[0].text, '![x](javascript:alert(1))'); // ảnh không https: để nguyên chữ
  assert.deepEqual(BG.plateMentions(nodes), { kai });
  const html = BG.plateHtml(nodes);
  assert.ok(html.includes('<img src="https://media.beincom.com/a"'));
  assert.ok(html.includes('<span class="mention">@kai</span>'));
  assert.ok(html.includes('<th>A</th>') && html.includes('<td><strong>1</strong></td>'));
  assert.ok(!html.includes('javascript:alert(1)"'));
  // Không truyền mentions: @kai chỉ là chữ
  assert.deepEqual(BG.mdToPlate('@kai', { id })[0].children, [{ text: '@kai' }]);
  const ok = { groupIds: ['g'], title: 'T', categoryIds: ['c'], hasCover: true };
  assert.match(BG.validateArticle({ ...ok, content: 'Chữ\n![](local:1)' }), /chưa tải lên/);
  assert.equal(BG.validateArticle({ ...ok, content: '![](https://media.beincom.com/a)' }), ''); // chỉ có ảnh cũng được
  assert.match(BG.validateArticle({ ...ok, content: Array.from({ length: 31 }, () => '![](https://media.beincom.com/a)').join('\n') }), /Tối đa 30 ảnh/);
  assert.deepEqual(BG.articleMentionEntry({ id: 'u9', username: 'lan', fullname: 'Lan', avatar: 'x', isVerified: true }), { id: 'u9', avatar: 'x', name: 'lan', fullname: 'Lan', username: 'lan' });
  assert.equal(BG.editState({ id: 's', scheduledAt: '2026-10-11T02:00:00Z' }).scheduledAt, '2026-10-11T02:00:00Z');
});

test('Quản lý tag: tên viết hoa 3–32 ký tự, không trùng (trừ chính nó), đọc quyền, link tìm bài theo tag', () => {
  assert.equal(BG.tagName('  bic   army '), 'BIC ARMY');
  const list = [{ id: 't1', name: 'AMA' }, { id: 't2', name: 'Bản tin' }];
  assert.equal(BG.validateTagName('defi', list), '');
  assert.match(BG.validateTagName('ab', list), /ít nhất 3/);
  assert.match(BG.validateTagName('x'.repeat(33), list), /tối đa 32/);
  assert.match(BG.validateTagName('ama', list), /đã có tag AMA/);
  assert.equal(BG.validateTagName('bản tin', list, 't2'), ''); // đổi tên chính nó
  assert.deepEqual([true, false, { canCud: true }, { a: false, b: false }, null, 'x', {}].map(BG.tagPermission), [true, false, true, false, null, null, null]);
  const u = new URL(BG.tagSearchUrl('BIC ARMY', { id: 'g1', name: 'Crypto Life' }));
  assert.equal(u.origin + u.pathname, 'https://group.beincom.com/search');
  assert.deepEqual(JSON.parse(u.searchParams.get('tags')), ['BIC ARMY']);
  assert.deepEqual(JSON.parse(u.searchParams.get('group')), { id: 'g1', name: 'Crypto Life', avatar: '', isIncludeInnerGroups: true });
  assert.equal(new URL(BG.tagSearchUrl('AMA')).searchParams.get('group'), null);
});

test('lỗi tag đang dùng có câu tiếng Việt (gọi thật: DELETE tag đã gắn bài -> 400 tag.is_used)', () => {
  assert.match(BG.errMsg({ status: 400, body: { code: 'tag.is_used', meta: { message: 'The tag is used', errors: 'The tag is used' } } }), /Tag đang gắn vào bài/);
  assert.equal(BG.errMsg({ status: 400, body: { code: 'x', meta: { message: 'Khác' } } }), 'Khác');
});

test('dọn tài khoản / lọc: bài và bình luận còn hiện của một người; lọc theo @tên, #tag, chữ không dấu', () => {
  const a = { id: 'u1', username: 'kaicrypto', fullname: 'Kai Crypto' };
  const b = { id: 'u2', username: 'lan', fullname: 'Lan Anh' };
  const posts = [{ id: 'p1', actor: a, text: 'Kèo thơm', tags: ['AIRDROP'] }, { id: 'p2', actor: a, isHidden: true }, { id: 'p3', actor: b, text: 'Hỏi đáp', tags: [] }];
  const comments = [{ id: 'c1', actor: a, text: 'x' }, { id: 'c2', actor: b }];
  const fp = BG.userFootprint('u1', posts, comments);
  assert.deepEqual([fp.posts.map((x) => x.id), fp.comments.map((x) => x.id)], [['p1'], ['c1']]);
  assert.deepEqual(BG.userFootprint('', posts, comments), { posts: [], comments: [] });
  const m = (q) => posts.filter((p) => BG.itemMatches(p, q)).map((p) => p.id);
  assert.deepEqual(m(''), ['p1', 'p2', 'p3']);
  assert.deepEqual(m('@kai'), ['p1', 'p2']);
  assert.deepEqual(m('#air'), ['p1']);
  assert.deepEqual(m('keo thom'), ['p1']);
  assert.deepEqual(m('lan anh'), ['p3']);
  assert.deepEqual(BG.slimPost({ id: 'x', tags: [{ name: 'AMA' }, {}] }).tags, ['AMA']);
});

test('hiệu quả bài: số liệu, mốc cần đo, giữ 300 bài, tổng hợp và giờ đăng hiệu quả theo bài của mình', () => {
  assert.deepEqual(BG.statMetrics({ totalUsersSeen: 50, reactionsCount: { like: 2, love: '3' }, commentsCount: 4 }), { views: 50, reactions: 5, comments: 4 });
  assert.deepEqual(BG.statMetrics({}), { views: null, reactions: 0, comments: 0 });
  assert.equal(BG.statScore({ reactions: 5, comments: 4 }), 13);
  const now = Date.parse('2026-10-11T00:00:00Z');
  const h = (n) => new Date(now - n * 3600e3).toISOString();
  const map = {
    a: { id: 'a', publishAt: h(2) }, // chưa đủ 24 giờ
    b: { id: 'b', publishAt: h(30) }, // tới mốc 24 giờ
    c: { id: 'c', publishedAt: h(200), d1: {} }, // tới mốc 7 ngày
    d: { id: 'd', publishedAt: h(200), d1: {}, d7: {} }, // đủ cả hai
    e: { id: 'e', publishAt: h(300), gone: true },
    f: { id: 'f', publishAt: 'x' },
  };
  assert.deepEqual(BG.statsDue(map, now).map((x) => [x.id, x.slot]), [['c', 'd7'], ['b', 'd1']]);
  assert.equal(BG.statsDue(map, now, 1).length, 1);
  const big = Object.fromEntries(Array.from({ length: 305 }, (_, i) => ['k' + i, { id: 'k' + i, at: i }]));
  const kept = BG.pruneStats(big);
  assert.ok(Object.keys(kept).length === 300 && 'k304' in kept && !('k0' in kept));
  // Tổng hợp: 3 bài có số liệu (d7 ưu tiên), bài chưa đo không tính
  const vn = (s) => new Date(s + '+07:00').toISOString();
  const m = (views, reactions, comments) => ({ views, reactions, comments });
  const sum = BG.insightsSummary({
    p1: { id: 'p1', publishedAt: vn('2026-10-06T20:00:00'), d1: m(10, 1, 0), d7: m(100, 10, 5) },
    p2: { id: 'p2', publishedAt: vn('2026-09-29T20:30:00'), d1: m(50, 6, 2) },
    p3: { id: 'p3', publishedAt: vn('2026-10-08T09:00:00'), cur: m(null, 2, 1) },
    p4: { id: 'p4', publishAt: vn('2026-10-12T09:00:00') },
    p5: { id: 'p5', publishedAt: vn('2026-10-01T09:00:00'), d7: m(1, 1, 1), gone: true },
  });
  assert.deepEqual([sum.tracked, sum.measured, sum.avg.reactions, sum.avg.comments, sum.avg.views], [4, 3, 6, 8 / 3, 75]);
  assert.deepEqual(sum.times.top.map((c) => [BG.WEEKDAYS[c.day], c.hour]), [['T3', 20], ['T5', 9]]);
  assert.equal(BG.insightsSummary({ p1: { id: 'p1', publishedAt: vn('2026-10-06T20:00:00'), d1: m(1, 1, 1) } }).times, null);
});

test('Lỗi kỹ thuật: làm sạch (không lộ token), gộp lỗi giống nhau trong 30 phút, giữ 200, báo cáo để sao chép', () => {
  const tok = 'bot123456789:' + 'A'.repeat(30);
  const c = BG.cleanDiag({ where: 'sw', kind: 'api', method: 'post', path: `x/${tok}/sendMessage?token=abc&a=1`, status: '500', code: 'api.error', message: `lỗi ${tok}` });
  assert.ok(!JSON.stringify(c).includes('AAAAAAAAAA') && !c.path.includes('abc'));
  assert.deepEqual([c.method, c.status, c.path], ['POST', 500, 'x/bot***/sendMessage?token=***&a=1']);
  assert.equal(BG.cleanDiag({ where: 'nowhere', message: '' }).where, 'sw');
  assert.equal(BG.cleanDiag({ where: 'dashboard', message: 'm', stack: 'Error\n  at f (chrome-extension://abcdefghijklmnopabcdefghijklmnop/dash/a.js:1:2)' }).stack, 'Error\nat f (dash/a.js:1:2)');
  const t0 = Date.parse('2026-10-11T00:00:00Z');
  const e = (path) => ({ where: 'sw', kind: 'api', method: 'GET', path, status: 500, message: 'Lỗi' });
  let list = BG.pushDiag([], e('content/contents/8f1a2b3c-1111-2222-3333-444455556666'), t0);
  list = BG.pushDiag(list, e('content/contents/9e9e9e9e-1111-2222-3333-444455556666'), t0 + 60e3); // khác id: vẫn gộp
  list = BG.pushDiag(list, e('content/contents/9e9e9e9e-1111-2222-3333-444455556666'), t0 + 40 * 60e3); // quá 30 phút: dòng mới
  assert.deepEqual(list.map((x) => x.count), [1, 2]);
  let many = [];
  for (let i = 0; i < 205; i++) many = BG.pushDiag(many, { where: 'sw', kind: 'js', message: 'lỗi ' + i }, t0 + i);
  assert.equal(many.length, 200);
  const text = BG.diagText(list, { version: '0.22.0', ua: 'Mozilla/5.0 Chrome/141.0.1.2 Safari/537.36', now: t0 });
  assert.match(text, /^BeinFusion v0\.22\.0 · Chrome\/141\.0\.1\.2 · 07:00 11\/10 \(giờ VN\) · 2 lỗi\n/);
  assert.match(text, /\[sw · API\] GET content\/contents\/8f1a2b3c-1111-2222-3333-444455556666 → 500: Lỗi \(×2, lần đầu 07:00 11\/10\)/);
});

// ---------- Thành viên mới có ở lại không, báo cáo tháng ----------

test('tháng theo giờ Việt Nam: khoá, mốc đầu / cuối tháng, tháng đang chạy, danh sách tháng chọn được', () => {
  // 30/09 18:00 UTC = 01/10 01:00 giờ VN
  assert.equal(BG.monthKey(Date.parse('2026-09-30T18:00:00Z')), '2026-10');
  assert.equal(BG.monthKey(Date.parse('2026-09-30T16:59:59Z')), '2026-09');
  assert.deepEqual([BG.shiftMonth('2026-01', -1), BG.shiftMonth('2026-12', 1), BG.shiftMonth('2026-10', -2)], ['2025-12', '2027-01', '2026-08']);
  const now = Date.parse('2026-10-11T03:00:00Z');
  const sep = BG.monthRange('2026-09', now);
  assert.deepEqual([new Date(sep.from).toISOString(), new Date(sep.end).toISOString(), sep.to === sep.end, sep.partial, sep.days, sep.label], ['2026-08-31T17:00:00.000Z', '2026-09-30T17:00:00.000Z', true, false, 30, 'Tháng 9/2026']);
  const oct = BG.monthRange('2026-10', now);
  assert.deepEqual([oct.to, oct.partial], [now, true]);
  assert.deepEqual(BG.monthOptions(now, 2), [
    { key: '2026-10', label: 'Tháng 10/2026 (tới hôm nay)' },
    { key: '2026-09', label: 'Tháng 9/2026' },
    { key: '2026-08', label: 'Tháng 8/2026' },
  ]);
});

test('nhắc báo cáo tháng: 7 ngày đầu tháng (ngày 1 từ 8 giờ sáng giờ VN), mỗi tháng một lần', () => {
  const at = (s) => Date.parse(s);
  assert.equal(BG.monthlyDue(null, at('2026-10-01T00:30:00Z')), null); // 7:30 sáng ngày 1
  assert.equal(BG.monthlyDue(null, at('2026-10-01T01:00:00Z')), '2026-09'); // 8:00 sáng ngày 1
  assert.equal(BG.monthlyDue('2026-09', at('2026-10-02T01:00:00Z')), null); // đã nhắc
  assert.equal(BG.monthlyDue('2026-08', at('2026-10-07T16:00:00Z')), '2026-09'); // 23 giờ ngày 7
  assert.equal(BG.monthlyDue('2026-08', at('2026-10-07T17:00:00Z')), null); // 0 giờ ngày 8
  assert.equal(BG.monthlyDue('2025-11', at('2026-01-03T01:00:00Z')), '2025-12'); // qua năm
});

const ev = (uid, kind, time, useCase = kind === 'in' ? 'join.group.as_member' : 'leave.group') => ({ user: { id: uid, username: 'u' + uid }, kind, time, useCase });

test('người mới: gộp sự kiện trùng, tình trạng sau khi vào (tự rời / bị xoá / bị cấm / vào lại), chỉ người vào trong khoảng', () => {
  const from = Date.parse('2026-10-01T00:00:00Z');
  const to = Date.parse('2026-10-11T00:00:00Z');
  const events = [
    ev('a', 'in', '2026-10-02T01:00:00Z', 'approve.join_request'),
    ev('a', 'in', '2026-10-02T01:00:00Z'), // được duyệt + vào group cùng lúc: một lần vào
    ev('b', 'in', '2026-10-03T01:00:00Z'),
    ev('b', 'out', '2026-10-03T05:00:00Z'),
    ev('c', 'in', '2026-10-04T01:00:00Z'),
    ev('c', 'out', '2026-10-06T01:00:00Z', 'remove.member'),
    ev('d', 'in', '2026-10-05T01:00:00Z'),
    ev('d', 'out', '2026-10-05T02:00:00Z', 'ban.member'),
    ev('e', 'in', '2026-10-06T01:00:00Z'),
    ev('e', 'out', '2026-10-07T01:00:00Z'),
    ev('e', 'in', '2026-10-08T01:00:00Z'), // vào lại
    ev('f', 'in', '2026-09-20T01:00:00Z'), // vào trước khoảng xem
    ev('f', 'out', '2026-10-02T01:00:00Z'),
    ev('g', 'in', '2026-10-12T01:00:00Z'), // sau khoảng xem
    { user: null, kind: 'in', time: '2026-10-05T00:00:00Z' },
    ev('h', 'role', '2026-10-05T00:00:00Z'),
  ].reverse();
  assert.equal(BG.memberMoves(events).filter((x) => x.user.id === 'a').length, 1);
  const cohort = BG.memberCohort(events, { from, to });
  assert.deepEqual(
    cohort.map((m) => [m.user.id, m.status, m.rejoined]),
    [
      ['e', 'stay', true],
      ['d', 'banned', false],
      ['c', 'removed', false],
      ['b', 'left', false],
      ['a', 'stay', false],
    ],
  );
  assert.deepEqual(cohort.map(BG.cohortStatusText), ['Còn ở lại (đã rời rồi vào lại)', 'Bị cấm trong ngày đầu', 'Bị xoá sau 2 ngày', 'Tự rời trong ngày đầu', 'Còn ở lại']);
});

test('người mới: tóm tắt còn ở lại, ở lại qua 7 / 30 ngày đầu (chỉ người vào đủ lâu), hoạt động sau khi vào, theo tuần', () => {
  const now = Date.parse('2026-10-11T00:00:00Z');
  const dayAgo = (d) => new Date(now - d * 864e5).toISOString();
  const cohort = [
    { user: { id: 'a' }, joinedAt: dayAgo(2), status: 'stay', outAt: null },
    { user: { id: 'b' }, joinedAt: dayAgo(10), status: 'left', outAt: dayAgo(9) }, // rời sau 1 ngày
    { user: { id: 'c' }, joinedAt: dayAgo(20), status: 'left', outAt: dayAgo(5) }, // rời sau 15 ngày: vẫn ở lại qua 7 ngày đầu
    { user: { id: 'd' }, joinedAt: dayAgo(40), status: 'stay', outAt: null },
    { user: { id: 'e' }, joinedAt: dayAgo(35), status: 'removed', outAt: dayAgo(34.5) },
  ];
  const act = BG.cohortActivity(cohort, {
    posts: { a: [dayAgo(1)], d: [dayAgo(45)] }, // d đăng trước khi vào: không tính
    comments: [
      { actor: { id: 'd' }, createdAt: dayAgo(3) },
      { actor: { id: 'x' }, createdAt: dayAgo(3) },
    ],
  });
  assert.deepEqual(act, { a: { posts: 1, comments: 0 }, b: { posts: 0, comments: 0 }, c: { posts: 0, comments: 0 }, d: { posts: 0, comments: 1 }, e: { posts: 0, comments: 0 } });
  const s = BG.cohortSummary(cohort, act, now);
  assert.deepEqual(
    [s.joined, s.stayed, s.left, s.removed, s.banned, s.d7, s.d30, s.posted, s.commented, s.active, s.silent, s.quickLeave, s.medianLeaveDays],
    [5, 2, 2, 1, 0, { base: 4, kept: 2 }, { base: 2, kept: 1 }, 1, 1, 2, 0, 1, 1],
  );
  assert.equal(s.weeks[0].week, BG.vnWeekStart(Date.parse(dayAgo(2))));
  assert.equal(s.weeks.reduce((n, w) => n + w.joined, 0), 5);
  assert.equal(BG.vnWeekStart(Date.parse('2026-10-11T16:59:00Z')), '2026-10-05'); // 23:59 Chủ nhật giờ VN
  assert.equal(BG.vnWeekStart(Date.parse('2026-10-11T17:00:00Z')), '2026-10-12'); // 0:00 thứ Hai giờ VN
  assert.deepEqual(BG.cohortSummary([], {}, now).d7, { base: 0, kept: 0 });
});

test('số thành viên tại một thời điểm suy ra từ số hiện tại và lượt vào / rời sau đó; đếm thao tác theo group', () => {
  const moves = [ev('a', 'in', '2026-10-02T00:00:00Z'), ev('b', 'out', '2026-10-05T00:00:00Z'), ev('c', 'in', '2026-10-09T00:00:00Z')];
  assert.equal(BG.membersAt(100, moves, Date.parse('2026-10-01T00:00:00Z')), 99);
  assert.equal(BG.membersAt(100, moves, Date.parse('2026-10-06T00:00:00Z')), 99);
  assert.equal(BG.membersAt(100, moves, Date.parse('2026-10-10T00:00:00Z')), 100);
  assert.equal(BG.membersAt(null, moves, 0), null);
  const log = [
    { time: '2026-10-02T00:00:00Z', kind: 'member', action: 'approve', status: 'ok', groupId: 'g1' },
    { time: '2026-10-02T00:00:00Z', kind: 'member', action: 'approve', status: 'ok', groupId: 'g2', source: 'auto' },
    { time: '2026-10-02T00:00:00Z', kind: 'post', action: 'hide', status: 'dry', groupId: 'g1' },
  ];
  const all = () => true;
  assert.deepEqual([BG.countLogActions(log, all).approved, BG.countLogActions(log, all).autoApproved], [1, 1]);
  assert.deepEqual([BG.countLogActions(log, all, new Set(['g1'])).approved, BG.countLogActions(log, all, new Set(['g1'])).autoApproved], [1, 0]);
  // Tóm tắt một khoảng bất kỳ (vd. cả tháng)
  const r = BG.weeklyReport({ log }, { from: Date.parse('2026-10-01T00:00:00Z'), now: Date.parse('2026-10-31T00:00:00Z') });
  assert.equal(r.actions.approved + r.actions.autoApproved, 2);
  assert.equal(BG.weeklyReport({ log }, { from: Date.parse('2026-10-03T00:00:00Z'), now: Date.parse('2026-10-31T00:00:00Z') }).actions.approved, 0);
});

test('báo cáo tháng: tháng đang chạy, nhật ký thiếu thì không tính số đầu / cuối tháng, hồ sơ vi phạm và bài qua addon theo group', () => {
  const now = Date.parse('2026-10-11T03:00:00Z');
  const raw = {
    key: '2026-10',
    prevKey: '2026-09',
    now,
    group: { name: 'Crypto Life', userCount: 500 },
    events: [ev('a', 'in', '2026-10-02T00:00:00Z')],
    eventsTruncated: true,
    months: { '2026-10': { total: 0, posts: [] }, '2026-09': { total: 0, posts: [] } },
    actorPosts: {},
  };
  const r = BG.monthlyReport(raw, {
    profiles: { users: { x: { user: { id: 'x', username: 'spam1', fullname: 'Spam' }, events: [{ type: 'hidden', time: '2026-10-03T00:00:00Z', group: 'Crypto Life' }, { type: 'hidden', time: '2026-10-04T00:00:00Z', group: 'Food Research' }] } } },
    postStats: {
      p1: { id: 'p1', groupName: 'Crypto Life', publishedAt: '2026-10-05T00:00:00Z', d1: { views: 10, reactions: 2, comments: 1 } },
      p2: { id: 'p2', groupName: 'Food Research', publishedAt: '2026-10-05T00:00:00Z', d1: { views: 99, reactions: 9, comments: 9 } },
      p3: { id: 'p3', groupName: 'Crypto Life', publishedAt: '2026-09-05T00:00:00Z' },
    },
    scopeIds: ['gCL'],
    scopeNames: ['Crypto Life'],
  });
  assert.deepEqual([r.partial, r.members.start, r.members.end, r.members.joined], [true, null, null, 1]);
  assert.deepEqual(r.violators.map((v) => [v.user.username, v.count]), [['spam1', 1]]);
  assert.deepEqual([r.addon.posts, r.addon.measured, r.addon.avg.views], [1, 1, 10]);
  const text = BG.monthlyText(r);
  assert.match(text, /^BeinFusion: báo cáo Tháng 10\/2026 \(tới 11\/10\) — Crypto Life\n• Thành viên: 1 người vào, 0 người rời \(tháng trước: 0 vào, 0 rời\)\n/);
  assert.match(text, /• Bài viết: 0 bài · 👁 0 lượt xem/);
  assert.match(text, /• Vi phạm nhiều nhất: Spam \(@spam1\) 1 lần/);
  assert.match(text, /• Đăng qua addon: 1 bài · trung bình mỗi bài 👁 10 · ❤ 2 · 💬 1$/);
  assert.ok(!/Kiểm duyệt/.test(text));
});

test('Telegram: báo cáo tháng thuộc loại tin tóm tắt; tin báo cáo được dài hơn tin thường', () => {
  assert.equal(BG.telegramKind('bg-monthly'), 'weekly');
  assert.equal(BG.telegramText('T', 'x'.repeat(2000)).length, '<b>T</b>\n'.length + 900);
  assert.equal(BG.telegramText('T', 'x'.repeat(2000), '', 3500).length, '<b>T</b>\n'.length + 2000);
});

test('BG chia thành common.js + lib/*.js: mọi nơi nạp đúng thứ tự BG.PARTS, đủ các phần', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const expected = ['common.js', ...BG.PARTS.map((p) => `lib/${p}.js`)];
  const tags = (f) => [...fs.readFileSync(path.join(root, f), 'utf8').matchAll(/<script src="((?:common|lib\/[\w-]+)\.js)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(tags('dashboard.html'), expected);
  assert.deepEqual(tags('popup.html'), ['common.js']); // popup chỉ nạp lõi; lib/*.js nạp khi cần (popup.js loadLib theo BG.PARTS)
  assert.match(fs.readFileSync(path.join(root, 'popup.js'), 'utf8'), /for \(const p of BG\.PARTS\)/);
  assert.deepEqual(tags('chat.html'), expected);
  assert.match(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), /importScripts\('common\.js'\);\r?\nimportScripts\(\.\.\.BG\.PARTS\.map\(\(p\) => `lib\/\$\{p\}\.js`\)\);/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'lib')).sort(), BG.PARTS.map((p) => p + '.js').sort());
  for (const f of ['norm', 'slimPerson', 'evaluateRequest', 'evaluatePostIn', 'validateCompose', 'mdToPlate', 'readBackup', 'monthlyReport', 'tgKeyboard', 'pushDiag']) assert.equal(typeof BG[f], 'function', f);
});

test('Article: nội dung JSON (Plate) -> chữ thường, tóm tắt, ảnh bìa, số phút đọc, link trong bài vẫn bị quy tắc xét', () => {
  const content = JSON.stringify([
    { type: 'h2', children: [{ text: 'Tiêu đề mục' }] },
    { type: 'p', children: [{ text: 'Xem ' }, { type: 'a', url: 'https://t.me/abc', children: [{ text: 'nhóm' }] }, { text: ' nhé ' }, { type: 'mention', value: 'kai', children: [{ text: '' }] }] },
    { type: 'img', url: 'https://cdn.example/anh.png', children: [{ text: '' }] },
    { type: 'p', children: [{ text: '' }] },
  ]);
  const p = BG.slimPost({ id: 'a1', type: 'ARTICLE', title: '1 Năm Nhìn Lại', summary: 'Một năm trước…', coverMedia: { url: 'https://cdn.example/bia.jpg' }, wordCount: 1400, content, actor: { id: 'u1' }, audience: { groups: [] }, tags: [{ name: 'CRYPTO' }] });
  assert.deepEqual([p.title, p.text, p.summary, p.cover, p.readMin, p.links, p.tags], ['1 Năm Nhìn Lại', 'Tiêu đề mục\nXem nhóm nhé @kai', 'Một năm trước…', 'https://cdn.example/bia.jpg', 7, ['https://t.me/abc'], ['CRYPTO']]);
  assert.equal(BG.evaluatePost(p, { blockedDomains: ['t.me'] }).verdict, 'bad'); // link nằm trong chữ "nhóm" vẫn bị bắt
  // Ảnh bìa không phải https: bỏ; bài thường giữ nguyên chữ; chuỗi không phải JSON giữ nguyên
  assert.equal(BG.slimPost({ id: 'a2', type: 'ARTICLE', content: '[]', coverMedia: { url: 'http://x/y.jpg' }, audience: {} }).cover, '');
  assert.equal(BG.slimPost({ id: 'p1', type: 'POST', content: '[{"không phải bài viết"}]', audience: {} }).text, '[{"không phải bài viết"}]');
  assert.deepEqual([BG.articlePlain('bình thường'), BG.articlePlain('[{"lỗi'), BG.readMinutes(0), BG.readMinutes(50), BG.readMinutes(450)], ['bình thường', '[{"lỗi', 0, 1, 2]);
});

test('Chat: tin trả lời (bein.mm.reply), thẻ xem trước link, link <…>, nhận diện link Beincom', () => {
  const id = 'z4pr6ga5nbdjim19soeyowctmr';
  const raw = (extra = {}) => ({ id: 'p1', channel_id: 'c', user_id: 'u1', message: `[](bein.mm.reply)https://chat.beincom.com/dea5c152dbcd/pl/${id}[](bein.mm.reply)\n@anhphuc Đăng kí như thế nào vậy ạ`, props: { previewed_post: id }, ...extra });
  const author = { id: 'u2', username: 'anhphuc', first_name: 'Phùng', last_name: 'Anh Phúc', props: { bic_user_id: 'b2' } };
  // Có sẵn tin được trích (permalink): người gửi, nội dung; tin hiện không còn phần đánh dấu, giữ lại để sửa tin
  const a = BG.chatPagePost(raw({ metadata: { embeds: [{ type: 'permalink', data: { post_id: id, channel_display_name: 'Kênh', post: { id, user_id: 'u2', message: 'Mình đã đk', author } } }] } }));
  assert.deepEqual([a.message, a.quote.id, a.quote.post.user.fullname, a.quote.post.message, a.quote.post.channel], ['@anhphuc Đăng kí như thế nào vậy ạ', id, 'Phùng Anh Phúc', 'Mình đã đk', 'Kênh']);
  assert.ok(a.quotePrefix.startsWith('[](bein.mm.reply)') && a.quotePrefix.endsWith('\n'));
  // Không kèm tin được trích: chỉ có mã (trang đọc thêm)
  const b = BG.chatPagePost(raw());
  assert.deepEqual([b.quote.id, b.quote.post], [id, undefined]);
  assert.equal(BG.chatPagePost({ id: 'p2', message: 'Tin thường' }).quote, undefined);
  // Thẻ xem trước (opengraph): ảnh chỉ https
  const og = BG.chatPagePost({ id: 'p3', message: 'https://x.com/a', metadata: { embeds: [{ type: 'opengraph', url: 'https://x.com/a', data: { title: 'Tiêu đề', description: 'Mô tả', site_name: 'X', images: [{ url: 'http://x.com/i.png' }, { secure_url: 'https://x.com/i.png' }] } }] } }).og;
  assert.deepEqual(og, { url: 'https://x.com/a', title: 'Tiêu đề', description: 'Mô tả', site: 'X', image: 'https://x.com/i.png' });
  // Tin trả lời kiểu web mới (dấu cách quanh link, props.quoted_post_id) trong tin nhắn riêng: máy chủ đọc link thành trang chung
  // "BEINCOM | CHAT" — không hiện thẻ đó
  const dm = BG.chatPagePost({ id: 'p4', message: `[](bein.mm.reply) https://chat.beincom.com/direct-message/pl/${id} [](bein.mm.reply)\n46546465`, props: { quoted_post_id: id }, metadata: { embeds: [{ type: 'opengraph', url: `https://chat.beincom.com/direct-message/pl/${id}`, data: { title: 'BEINCOM | CHAT', description: 'To connect everyone' } }] } });
  assert.deepEqual([dm.message, dm.quote.id, dm.og], ['46546465', id, undefined]);
  // <https://…>: link không kèm dấu ngoặc
  assert.deepEqual(BG.chatMarkdown('Xem <https://group.beincom.com/article/c8d60d10-c10b-4851-935a-1cff8a04ecf2> nhé')[0].c[1], { t: 'a', href: 'https://group.beincom.com/article/c8d60d10-c10b-4851-935a-1cff8a04ecf2', c: [{ t: 'text', v: 'https://group.beincom.com/article/c8d60d10-c10b-4851-935a-1cff8a04ecf2' }] });
  // Link Beincom: loại và mã để đọc tên
  const L = (u) => (({ kind, id, type, name }) => ({ kind, id, type, name }))(BG.beinLink(u) || {});
  assert.deepEqual(L('https://group.beincom.com/article/C8D60D10-c10b-4851-935a-1cff8a04ecf2?x=1'), { kind: 'content', id: 'c8d60d10-c10b-4851-935a-1cff8a04ecf2', type: 'ARTICLE', name: undefined });
  assert.deepEqual(L('https://group.beincom.com/posts/c8d60d10-c10b-4851-935a-1cff8a04ecf2'), { kind: 'content', id: 'c8d60d10-c10b-4851-935a-1cff8a04ecf2', type: 'POST', name: undefined });
  assert.deepEqual(L(`https://chat.beincom.com/dea5c152dbcd/pl/${id}`), { kind: 'chat', id, type: undefined, name: undefined });
  assert.deepEqual(L('https://group.beincom.com/users/kai.crypto'), { kind: 'user', id: 'kai.crypto', type: undefined, name: '@kai.crypto' });
  for (const u of ['https://google.com/article/c8d60d10-c10b-4851-935a-1cff8a04ecf2', 'https://group.beincom.com/newsfeed', 'không phải link']) assert.equal(BG.beinLink(u), null, u);
});

test('Chat: biểu cảm riêng của Beincom (bic_*, Bamzo) là ảnh trên group.beincom.com; :tên: trong chữ của tin; hàng biểu cảm nhanh', () => {
  assert.equal(BG.chatCustomEmoji('bic_purple_heart'), 'https://group.beincom.com/images/emoji/animated/bic_purple_heart.gif');
  assert.equal(BG.chatCustomEmoji('bic_thumbs_up'), 'https://group.beincom.com/images/emoji/static/bic_thumbs_up.png');
  assert.equal(BG.chatCustomEmoji('bamzo_in_love'), 'https://group.beincom.com/images/emoji/mascot/bamzo_in_love.png');
  assert.deepEqual([BG.chatCustomEmoji('heart'), BG.chatCustomEmoji('bic_lạ')], ['', '']);
  assert.deepEqual([BG.chatEmojiLabel('bic_purple_heart'), BG.chatEmojiLabel('bamzo_in_love')], ['purple heart', 'Bamzo in love']);
  assert.deepEqual([BG.BIC_EMOJI.static.length, BG.BIC_EMOJI.animated.length, BG.BIC_EMOJI.mascot.length], [36, 12, 10]);
  // Tên hay gặp trong chat thật có hình
  for (const n of ['+1', 'heart', 'joy', 'laughing', 'rolling_on_the_floor_laughing', 'smiling_face_with_3_hearts', 'up', 'flag-vn', 'star-struck', 'four_leaf_clover']) assert.ok(BG.chatEmoji(n), n);
  // Chữ của tin: :bic_…: thành ảnh, :joy: thành emoji, tên lạ / giờ giữ nguyên, link không bị cắt
  assert.deepEqual(BG.chatMarkdown('Chào :bic_purple_heart: và :joy: lúc 10:30:45 :abc: https://x.com/a:b:c')[0].c, [
    { t: 'text', v: 'Chào ' },
    { t: 'emo', name: 'bic_purple_heart', src: 'https://group.beincom.com/images/emoji/animated/bic_purple_heart.gif' },
    { t: 'text', v: ' và 😂 lúc 10:30:45 :abc: ' },
    { t: 'a', href: 'https://x.com/a:b:c', c: [{ t: 'text', v: 'https://x.com/a:b:c' }] },
  ]);
  assert.deepEqual(BG.chatMarkdown('`:bic_heart:`')[0].c, [{ t: 'code', v: ':bic_heart:' }]); // trong mã: giữ chữ
  // Hàng nhanh: vừa dùng trước (bỏ tên lạ), rồi biểu cảm riêng dùng nhiều nhất; tối đa 8
  assert.deepEqual(BG.chatQuickReacts(['tada', 'bic_fire', 'lạ']), ['tada', 'bic_fire', 'bic_purple_heart', 'bic_thumbs_up', 'bic_heart', 'bic_hugging_face', 'bic_flying_rocket', 'heart']);
  assert.deepEqual(BG.chatQuickReacts(), BG.CHAT_QUICK_REACTS);
});

test('Chat: câu trả lời mẫu — "/chữ" ở đầu dòng, khớp không dấu, làm sạch, bộ mặc định, có trong bản sao lưu', () => {
  assert.deepEqual(BG.chatSlashQuery('/noi', 4), { start: 0, term: 'noi' });
  assert.deepEqual(BG.chatSlashQuery('Chào\n/', 6), { start: 5, term: '' });
  assert.equal(BG.chatSlashQuery('a /noi', 6), null); // giữa dòng: không
  assert.equal(BG.chatSlashQuery('/noi quy', 8), null); // đã gõ khoảng trắng
  assert.equal(BG.chatSlashQuery('http://x', 8), null);
  const list = BG.chatRepliesOf(null);
  assert.deepEqual(list.map((x) => x.name), ['Nội quy', 'Cảnh báo lừa đảo', 'Chào người mới', 'Đã xoá quảng cáo', 'Cảm ơn đã báo']);
  assert.notEqual(list[0], BG.DEFAULT_CHAT_REPLIES[0]); // bản sao, sửa không đụng bộ mặc định
  assert.deepEqual(BG.matchChatReplies(list, 'noiquy').map((x) => x.name), ['Nội quy']);
  assert.deepEqual(BG.matchChatReplies(list, 'NOI').map((x) => x.name), ['Nội quy', 'Đã xoá quảng cáo']); // tên trước, rồi câu có chữ đó trong nội dung
  assert.equal(BG.matchChatReplies(list, 'lua')[0].name, 'Cảnh báo lừa đảo');
  assert.deepEqual(BG.matchChatReplies(list, 'otp').map((x) => x.name), ['Cảnh báo lừa đảo']); // khớp nội dung
  assert.equal(BG.matchChatReplies(list, '').length, 5);
  assert.deepEqual(BG.matchChatReplies(list, 'xyz'), []);
  assert.deepEqual(BG.cleanChatReplies([{ name: ' A ', text: ' x ' }, { name: '', text: 'y' }, { id: 'r-noiquy', name: 'B', text: 'z' }, { id: 'r-noiquy', name: 'C', text: 'w' }, 'lạ', { id: '../x', name: 'D'.repeat(60), text: 'v' }]), [
    { id: 'r0', name: 'A', text: 'x' },
    { id: 'r-noiquy', name: 'B', text: 'z' },
    { id: 'r-noiquyx', name: 'C', text: 'w' },
    { id: 'r3', name: 'D'.repeat(40), text: 'v' },
  ]);
  assert.deepEqual(BG.chatRepliesOf([]), []); // xoá hết thì giữ trống, không tự thêm lại bộ mặc định
  assert.equal(BG.chatRepliesOf('lạ').length, 5);
  // Sao lưu / khôi phục
  const b = BG.makeBackup({ chatReplies: [{ id: 'r1', name: 'Nội quy', text: 'Đọc nội quy nhé' }] });
  const r = BG.readBackup(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(r.data.chatReplies, [{ id: 'r1', name: 'Nội quy', text: 'Đọc nội quy nhé' }]);
  assert.deepEqual(BG.backupSummary(r.data), ['Câu trả lời mẫu (Chat): 1']);
});

test('trang Chat chia thành chat/*.js: chat.html nạp đủ (sau lib, app.js cuối), không trùng tên khai báo giữa các tệp', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'chat.html'), 'utf8');
  const loaded = [...html.matchAll(/<script src="(chat\/[\w-]+\.js)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(loaded.slice().sort(), fs.readdirSync(path.join(root, 'chat')).filter((f) => f.endsWith('.js')).map((f) => 'chat/' + f).sort());
  // chat/look-early.js: trong <head>, chạy trước khi vẽ (áp giao diện đã chọn); không khai báo tên chung
  assert.ok(html.indexOf('chat/look-early.js') < html.indexOf('</head>'));
  assert.equal(loaded[0], 'chat/look-early.js');
  assert.equal(loaded[1], 'chat/core.js');
  assert.equal(loaded.at(-1), 'chat/app.js');
  assert.ok(html.indexOf('lib/chat.js') < html.indexOf('chat/core.js'));
  assert.ok(!fs.existsSync(path.join(root, 'chat-app.js')));
  // Script thường dùng chung phạm vi: trùng const / let / function giữa hai tệp là lỗi ngay khi nạp
  const seen = new Map();
  for (const f of loaded) {
    for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/^(?:const|let|var|function|async function|class) (\w+)/gm)) {
      assert.ok(!seen.has(m[1]), `${m[1]} khai báo ở cả ${seen.get(m[1])} và ${f}`);
      seen.set(m[1], f);
    }
  }
  assert.ok(seen.size > 150);
});

test('Có gì mới: so sánh phiên bản, tách mục CHANGELOG.md, chọn mục cần hiện; CHANGELOG có mục cho bản trong manifest', () => {
  assert.deepEqual([BG.cmpVersion('0.10.0', '0.9.2'), BG.cmpVersion('0.24.0', '0.24.0'), BG.cmpVersion('0.24', '0.24.1'), BG.cmpVersion('1.0.0', '0.99.9')], [1, 0, -1, 1]);
  const md = '# Tiêu đề\nGiới thiệu\n\n## v0.3.0 — 03/01\n- **Mới** C\n\n## v0.2.0 — 02/01\n- B1\n- B2\n\n## v0.1.0 – v0.1.5 — 01/01\n- A\n';
  const s = BG.changelogSections(md);
  assert.deepEqual(s.map((x) => [x.version, x.title, x.body]), [
    ['0.3.0', 'v0.3.0 — 03/01', '- **Mới** C'],
    ['0.2.0', 'v0.2.0 — 02/01', '- B1\n- B2'],
    ['0.1.0', 'v0.1.0 – v0.1.5 — 01/01', '- A'],
  ]);
  assert.deepEqual(BG.whatsNew(s, '0.1.0', '0.3.0').map((x) => x.version), ['0.3.0', '0.2.0']);
  assert.deepEqual(BG.whatsNew(s, '0.2.0', '0.2.0'), []); // chưa cập nhật
  assert.deepEqual(BG.whatsNew(s, null, '0.3.0'), []); // cài mới
  assert.deepEqual(BG.whatsNew(s, '0.1.0', '0.2.0').map((x) => x.version), ['0.2.0']); // không hiện bản mới hơn bản đang chạy
  const fs = require('node:fs');
  const path = require('node:path');
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const real = BG.changelogSections(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'));
  assert.equal(real[0].version, version, 'CHANGELOG.md cần mục cho bản ' + version + ' ở trên cùng');
  assert.ok(real.every((x, i) => i === 0 || BG.cmpVersion(real[i - 1].version, x.version) > 0), 'các mục xếp mới nhất trước');
});

test('nhắc người mới: chọn người (còn ở lại, chưa hoạt động, có username, vào đủ lâu, chưa nhắc trong 30 ngày), ghi lần nhắc, đo hiệu quả', () => {
  const now = Date.parse('2026-10-12T02:00:00Z');
  const ago = (d) => new Date(now - d * 864e5).toISOString();
  const m = (id, joined, extra = {}) => ({ user: { id, username: 'u' + id }, joinedAt: ago(joined), status: 'stay', outAt: null, ...extra });
  const cohort = [m('a', 1), m('b', 5), m('c', 6, { status: 'left', outAt: ago(5) }), m('d', 8), m('e', 9, { user: { id: 'e', username: '' } }), m('f', 10), m('g', 12)];
  const activity = { d: { posts: 1, comments: 0 }, f: { posts: 0, comments: 0 } };
  const nudges = [
    { id: 'n2', at: ago(10), userIds: ['g'] },
    { id: 'n1', at: ago(40), userIds: ['f', 'g'] },
  ];
  assert.deepEqual([...BG.nudgeIndex(nudges)].sort(), [['f', Date.parse(ago(40))], ['g', Date.parse(ago(10))]]);
  // a: mới vào 1 ngày; c: đã rời; d: có bài; e: không có username; g: nhắc 10 ngày trước; f: nhắc 40 ngày trước -> nhắc lại được
  assert.deepEqual(BG.nudgeCandidates(cohort, activity, nudges, { now }).map((u) => u.id), ['b', 'f']);
  assert.deepEqual(BG.nudgeCandidates(cohort, activity, nudges, { now, minDays: 0 }).map((u) => u.id), ['a', 'b', 'f']);
  assert.equal(BG.nudgeCandidates(cohort, activity, [], { now, max: 1 }).length, 1);
  // Ghi lần nhắc: mới nhất trước, thay lần trùng id
  let list = BG.addNudge(nudges, { id: 'n3', at: ago(1), userIds: ['b'] });
  list = BG.addNudge(list, { id: 'n3', at: ago(1), userIds: ['b', 'f'] });
  assert.deepEqual(list.map((x) => [x.id, x.userIds.length]), [['n3', 2], ['n2', 1], ['n1', 2]]);
  // Hiệu quả: chỉ tính hoạt động sau lúc nhắc; người có hoạt động thì không tính là đã rời
  const e = BG.nudgeEffect(
    { id: 'n1', groupId: 'g1', groupName: 'G', at: ago(10), userIds: ['p', 'q', 'r', 's'] },
    { posts: { p: [ago(5)], q: [ago(20)] }, comments: [{ actor: { id: 'r' }, createdAt: ago(2) }, { actor: { id: 's' }, createdAt: ago(11) }], leftIds: ['s', 'p'], now },
  );
  assert.deepEqual([e.total, e.posted, e.commented, e.active, e.left, e.pending, e.days], [4, 1, 1, 2, 1, false, 10]);
  assert.equal(BG.nudgeEffect({ id: 'x', at: new Date(now + 3600e3).toISOString(), userIds: ['p'] }, { now }).pending, true);
});

test("Tự kiểm tra mỗi ngày: chỉ tính mục lần trước dùng được mà nay lỗi", () => {
  const prev = [{ id: "a", status: "ok" }, { id: "b", status: "fail" }, { id: "c", status: "skip" }, { id: "d", status: "ok" }];
  const cur = [{ id: "a", status: "fail" }, { id: "b", status: "fail" }, { id: "c", status: "fail" }, { id: "d", status: "ok" }, { id: "e", status: "fail" }];
  assert.deepEqual(BG.selfCheckRegressions(prev, cur).map((x) => x.id), ["a"]);
  assert.deepEqual(BG.selfCheckRegressions(undefined, cur), []);
});

test('bài thảo luận: chọn câu xoay vòng theo group, sửa kho giữ lần dùng, giờ gợi ý, hiệu quả từng câu, sao lưu', () => {
  const now = Date.parse('2026-10-12T02:00:00Z');
  const ago = (d) => new Date(now - d * 864e5).toISOString();
  const bank = { items: [{ id: 'a', text: 'Câu A ở {group}', uses: [{ postId: 'p1', groupId: 'g1', at: ago(10) }] }, { id: 'b', text: 'Câu B', uses: [{ postId: 'p2', groupId: 'g1', at: ago(70) }] }, { id: 'c', text: 'Câu C', uses: [] }] };
  // g1: A dùng 10 ngày trước (bỏ), B dùng 70 ngày trước (được), C chưa dùng -> C (ít lần dùng nhất)
  assert.equal(BG.pickPrompt(bank, { groupId: 'g1', now }).id, 'c');
  assert.equal(BG.pickPrompt(bank, { groupId: 'g1', now, skipIds: ['c'] }).id, 'b');
  assert.equal(BG.pickPrompt(bank, { groupId: 'g2', now }).id, 'a'); // group khác: theo thứ tự kho
  // Dùng hết trong 8 tuần: quay vòng
  const all = { items: bank.items.map((x) => ({ ...x, uses: [{ postId: 'q' + x.id, groupId: 'g3', at: ago(3) }] })) };
  assert.ok(BG.pickPrompt(all, { groupId: 'g3', now }));
  assert.equal(BG.promptText(bank.items[0], { groupName: 'Crypto Life' }), 'Câu A ở Crypto Life');
  // Kho mặc định khi chưa lưu / trống
  assert.equal(BG.promptBankOf(null).items.length, BG.DEFAULT_PROMPTS.length);
  assert.equal(BG.promptBankOf({ items: [] }).items[0].id, 'd1');
  // Sửa kho: giữ id và lần dùng câu cũ, bỏ dòng trống / trùng
  const edited = BG.promptBankFromText('Câu B\n\n  Câu mới  \nCâu B\nCâu A ở {group}', bank);
  assert.deepEqual(edited.items.map((x) => [x.id === 'b' || x.id === 'a' ? x.id : 'mới', x.text, x.uses.length]), [['b', 'Câu B', 1], ['mới', 'Câu mới', 0], ['a', 'Câu A ở {group}', 1]]);
  assert.equal(BG.promptBankFromText('Câu mới', null).items[0].id, edited.items[1].id); // id theo nội dung
  // Ghi lần dùng (không trùng bài)
  let b2 = BG.addPromptUse(bank, 'c', { postId: 'p9', groupId: 'g1', at: ago(0) });
  b2 = BG.addPromptUse(b2, 'c', { postId: 'p9', groupId: 'g1', at: ago(0) });
  assert.equal(b2.items.find((x) => x.id === 'c').uses.length, 1);
  // Giờ gợi ý: chưa đủ số liệu -> 20 giờ thứ Tư; có >= 3 bài đo được -> khung hiệu quả nhất của mình
  const def = BG.promptSlot({}, now);
  assert.deepEqual([def.basis, def.at, BG.slotLabel(def.at)], ['default', '2026-10-14T13:00:00.000Z', 'Thứ Tư 20:00']);
  const ps = Object.fromEntries([1, 2, 3].map((i) => ['s' + i, { id: 's' + i, publishedAt: '2026-10-0' + (i + 1) + 'T14:00:00Z', d7: { views: 100, reactions: 10 * i, comments: i } }]));
  const own = BG.promptSlot(ps, now);
  assert.equal(own.basis, 'own');
  assert.equal(BG.slotLabel(own.at).endsWith('21:00'), true);
  // Hiệu quả: điểm = cảm xúc + 2 × bình luận, cao trước; chưa có số liệu ở cuối
  const perf = BG.promptPerformance(bank, { p1: { groupName: 'G1', d1: { views: 50, reactions: 4, comments: 3 } }, p2: { groupName: 'G1', d7: { views: 90, reactions: 9, comments: 5 } } });
  assert.deepEqual(perf.map((r) => [r.promptId, r.score]), [['b', 19], ['a', 10]]);
  // Sao lưu / khôi phục có kho câu hỏi
  const backup = BG.makeBackup({ promptBank: bank, settings: BG.DEFAULT_SETTINGS });
  const back = BG.readBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(back.data.promptBank.items.map((x) => [x.id, x.uses.length]), [['a', 1], ['b', 1], ['c', 0]]);
  assert.ok(BG.backupSummary(back.data).includes('Kho câu hỏi thảo luận: 3 câu'));
  assert.equal(BG.cleanPromptBank({ items: [{ text: '  ' }, { text: 'x', uses: [{ postId: 1 }] }] }).items[0].uses.length, 0);
});

test('sao lưu kèm lịch sử số liệu: chỉ khi chọn, làm sạch khi đọc, gộp với dữ liệu đang có (trong máy được ưu tiên)', () => {
  const store = {
    settings: BG.DEFAULT_SETTINGS,
    postStats: { p1: { id: 'p1', at: 2, snippet: 'A', d1: { views: 5, reactions: 1, comments: 0 } } },
    nudges: [{ id: 'n1', groupId: 'g1', groupName: 'G', at: '2026-10-01T00:00:00Z', userIds: ['u1'] }],
    state: { lastScan: 1, memberHistory: { g1: [{ day: '2026-10-01', count: 10 }] } },
    log: [{ time: 100, kind: 'member', action: 'approve', status: 'ok', groupId: 'g1', userId: 'u1' }],
  };
  assert.equal(BG.makeBackup(store).data.history, undefined);
  const file = JSON.parse(JSON.stringify(BG.makeBackup(store, { history: true })));
  assert.deepEqual(Object.keys(file.data.history), ['postStats', 'nudges', 'memberHistory', 'log']);
  // Dữ liệu lỗi trong tệp bị bỏ
  file.data.history.postStats.bad = { id: 'khác' };
  file.data.history.nudges.push({ id: 'n9' });
  file.data.history.memberHistory.g1.push({ day: 'hôm qua', count: 3 });
  file.data.history.log.push({ time: 'x' });
  const back = BG.readBackup(file);
  assert.deepEqual([Object.keys(back.data.history.postStats), back.data.history.nudges.length, back.data.history.memberHistory.g1.length, back.data.history.log.length], [['p1'], 1, 1, 1]);
  assert.ok(BG.backupSummary(back.data).some((x) => /^Lịch sử số liệu: 1 bài theo dõi hiệu quả, 1 lần nhắc người mới, số thành viên của 1 group, 1 dòng nhật ký/.test(x)));
  // Gộp vào máy khác: thêm cái chưa có, giữ cái đang có khi trùng
  const cur = {
    postStats: { p1: { id: 'p1', at: 5, snippet: 'A mới', d7: { views: 9, reactions: 2, comments: 1 } }, p2: { id: 'p2', at: 6 } },
    nudges: [{ id: 'n2', groupId: 'g1', at: '2026-10-05T00:00:00Z', userIds: ['u2'] }],
    memberHistory: { g1: [{ day: '2026-10-01', count: 11 }, { day: '2026-10-05', count: 12 }], g2: [{ day: '2026-10-05', count: 3 }] },
    log: [{ time: 200, kind: 'post', action: 'hide', status: 'ok', contentId: 'c1' }, { time: 100, kind: 'member', action: 'approve', status: 'ok', groupId: 'g1', userId: 'u1' }],
  };
  const m = BG.mergeHistory(cur, back.data.history);
  assert.deepEqual([m.postStats.p1.snippet, !!m.postStats.p1.d1, !!m.postStats.p1.d7, Object.keys(m.postStats).sort()], ['A mới', true, true, ['p1', 'p2']]);
  assert.deepEqual(m.nudges.map((n) => n.id), ['n2', 'n1']);
  assert.deepEqual(m.memberHistory.g1, [{ day: '2026-10-01', count: 11 }, { day: '2026-10-05', count: 12 }]);
  assert.deepEqual(Object.keys(m.memberHistory).sort(), ['g1', 'g2']);
  assert.deepEqual(m.log.map((e) => e.time), [200, 100]); // dòng trùng không nhân đôi
});

test('báo cáo sử dụng: đếm tính năng theo ngày (chỉ lệnh có tên), giữ 60 ngày; báo cáo ẩn danh — không tên group, tên người, nội dung, id', () => {
  const now = Date.parse('2026-10-12T02:00:00Z');
  let u = null;
  for (const t of ['compose', 'compose', 'scan', 'diag', 'telegramPoll', 'monthly']) u = BG.recordUsage(u, t, now);
  assert.deepEqual(u, { since: '2026-10-12', days: { '2026-10-12': { compose: 2, scan: 1, monthly: 1 } } });
  let long = null;
  for (let i = 0; i < 70; i++) long = BG.recordUsage(long, 'scan', now - i * 864e5);
  assert.equal(Object.keys(long.days).length, 60);
  assert.equal(long.since, '2026-10-12'); // lần ghi đầu tiên
  u.days['2026-08-01'] = { compose: 9 }; // ngoài 30 ngày: không tính
  const text = BG.usageReport({
    usage: u,
    settings: { dryRun: true, autoHideSpam: true },
    telegram: { enabled: true, actions: true, token: 'bí mật' },
    groups: [{ id: 'gCL', name: 'Crypto Life', isCommunity: true }, { id: 'gCLsub', name: 'Crypto Life - General', isCommunity: false }],
    log: [
      { time: now - 1000, kind: 'post', action: 'hide', source: 'auto', status: 'ok', groupName: 'Crypto Life', snippet: 'Kèo x100 tại abc.xyz', username: 'spammer' },
      { time: now - 2000, kind: 'member', action: 'approve', source: 'telegram', status: 'ok', fullname: 'Trần Minh Anh' },
      { time: now - 3000, kind: 'member', action: 'approve', source: 'manual', status: 'error' },
      { time: now - 40 * 864e5, kind: 'member', source: 'manual', status: 'ok' },
    ],
    diagLog: [{ time: now - 5000, kind: 'api', method: 'GET', path: 'content/timeline/ed9e146a-04c7-4d62-bca5-5bbc5bc987d1?limit=20', status: 504, count: 2 }, { time: now - 6000, kind: 'js', message: 'TypeError: x', count: 1 }],
    selfCheck: { summary: { ok: 20, skip: 3, fail: 1 }, items: [{ label: 'Bài ghim', status: 'fail' }] },
    version: '0.28.0',
    ua: 'Mozilla/5.0 Chrome/141.0.1.2 Safari/537.36',
    note: 'Lan — admin',
    now,
  });
  assert.equal(
    text,
    [
      'BeinFusion v0.28.0 · Chrome/141.0.1.2 · báo cáo sử dụng 30 ngày (tới 2026-10-12) · Lan — admin',
      '• Dùng từ 2026-10-12 · 1 ngày có dùng trong 30 ngày · quản trị 1 community, 2 group',
      '• Đang bật: Chạy thử, Tự ẩn spam, Telegram (có nút)',
      '• Tính năng dùng: Đăng / hẹn giờ bài 2 · Quét tay 1 · Báo cáo tháng 1',
      '• Nhật ký 30 ngày: 3 thao tác (1 tự động, 1 từ Telegram, 1 bấm tay) · 1 lỗi',
      '• Lỗi kỹ thuật 30 ngày: 2 — GET content/timeline/:id → 504 (×2); TypeError: x (×1)',
      '• Tự kiểm tra gần nhất: 20 dùng được · 3 bỏ qua · 1 lỗi (Bài ghim)',
    ].join('\n'),
  );
  for (const secret of ['Crypto Life', 'gCL', 'spammer', 'Trần Minh Anh', 'abc.xyz', 'bí mật', 'ed9e146a']) assert.ok(!text.includes(secret), secret);
});

test('Tìm & dọn: giữ bài của mình, admin, thành viên tin cậy; người đăng nhiều bài khớp nhất', () => {
  const p = (id, actor) => ({ id, actor });
  const me = { id: 'me1', username: 'kai' };
  const admin = { id: 'ad1', username: 'ha' };
  const trusted = { id: 't1', username: 'tin' };
  const spam = { id: 's1', username: 'spam' };
  const other = { id: 'o1', username: 'moi' };
  const posts = [p('a', me), p('b', admin), p('c', trusted), p('d', spam), p('e', spam), p('f', other), p('g', spam)];
  const trustOf = (a) => BG.trustReason(a, { trustedMembers: ['@TIN'] });
  const rows = BG.sweepRows(posts, { meId: 'me1', adminIds: ['ad1'], trustOf });
  assert.deepEqual(rows.map((r) => r.keep), ['Bài của bạn', 'Admin', 'Thành viên tin cậy', '', '', '', '']);
  assert.deepEqual(BG.sweepRows(posts).map((r) => r.keep).filter(Boolean), []);
  assert.deepEqual(BG.sweepAuthors(rows).map((a) => [a.actor.id, a.count]), [['s1', 3]]);
  assert.deepEqual(BG.sweepAuthors(rows, 1).map((a) => a.actor.id), ['s1', 'o1']);
  assert.deepEqual(BG.sweepAuthors([]), []);
});

test('liên hệ riêng: số điện thoại Việt Nam, link Zalo / Telegram / WhatsApp; không nhầm số tiền, mã dài, địa chỉ ví', () => {
  assert.deepEqual(BG.contactHits('Gọi 0912 345 678 hoặc zalo.me/0912345678, t.me/kai'), ['số điện thoại', 'Zalo', 'Telegram']);
  assert.deepEqual(BG.contactHits('+84 912.345.678'), ['số điện thoại']);
  assert.deepEqual(BG.contactHits('https://wa.me/84912'), ['WhatsApp']);
  assert.deepEqual(BG.contactHits('Giá 0.912345678 BTC, mã 10912345678, ví 0x0912345678abc, 0912 345 6789'), []);
  assert.deepEqual(BG.contactHits('t.me/abc', ['t.me']), []); // đã là tên miền cấm: không nhắc lại
});

test('quy tắc bài viết: từ khoá cần xem và liên hệ riêng -> Cần xem; vi phạm vẫn nặng hơn', () => {
  const ev = (text, r) => BG.evaluatePost({ text }, r);
  const a = ev('Inbox mình vào NHÓM VIP, liên hệ 0987654321', { reviewKeywords: ['inbox', 'nhóm vip'], reviewContacts: true });
  assert.deepEqual([a.verdict, a.reasons.map((x) => x.code)], ['review', ['review-keyword', 'contact']]);
  assert.match(a.reasons[0].text, /inbox, nhóm vip/);
  assert.equal(ev('Uỷ thác đầu tư', { reviewKeywords: ['ủy thác'] }).verdict, 'review'); // không phân biệt dấu
  assert.equal(ev('liên hệ 0987654321', {}).verdict, 'ok'); // tắt mặc định
  const b = ev('Cam kết lợi nhuận, inbox', { bannedKeywords: ['cam kết lợi nhuận'], reviewKeywords: ['inbox', 'cam kết lợi nhuận'] });
  assert.deepEqual([b.verdict, b.reasons.map((x) => x.code)], ['bad', ['keyword', 'review-keyword']]);
  assert.match(b.reasons[1].text, /: inbox$/); // từ đã tính vi phạm không nhắc lại
  assert.equal(BG.tgHideReason([{ code: 'contact' }]), 'SPAM');
});

test('bộ quy tắc mẫu chống lừa đảo: phần hợp lệ, chỉ thêm mục mới, không trùng hoa thường / dấu / www', () => {
  const preset = BG.RULE_PRESETS.scam;
  assert.ok(preset.parts.every((p) => p.key in BG.DEFAULT_POST_RULES && p.label && p.note));
  assert.deepEqual(preset.parts.map((p) => [p.key, p.on]), [['bannedKeywords', true], ['reviewKeywords', true], ['reviewContacts', true], ['blockedDomains', false]]);
  const banned = preset.parts[0].items.map(BG.norm);
  assert.ok(preset.parts[1].items.every((k) => !banned.includes(BG.norm(k)))); // một từ chỉ ở một mức
  // Bài cảnh báo hay dùng các từ này: không để ở mức vi phạm
  assert.ok(['seed phrase', 'private key', 'không rủi ro'].every((k) => !banned.includes(k)));
  const { patch, added } = BG.presetPatch({ reviewKeywords: ['Inbox'], blockedDomains: ['bit.ly'] }, [
    { key: 'reviewKeywords', items: ['inbox', 'kèo VIP', ' ', 'keo vip'] },
    { key: 'reviewContacts', value: true },
    { key: 'blockedDomains', items: ['https://www.bit.ly/x', 't.ly'] },
    { key: 'bogus', items: ['x'] },
  ]);
  assert.deepEqual(patch, { reviewKeywords: ['Inbox', 'kèo VIP'], reviewContacts: true, blockedDomains: ['bit.ly', 't.ly'] });
  assert.deepEqual(added.map((a) => [a.key, a.items]), [['reviewKeywords', ['kèo VIP']], ['reviewContacts', []], ['blockedDomains', ['t.ly']]]);
  assert.deepEqual(BG.presetPatch({ reviewContacts: true }, [{ key: 'reviewContacts', value: true }]), { patch: {}, added: [] });
  // Tệp quy tắc xuất ra đọc lại được, giữ các mục mới
  const file = BG.makeBackup({ postRules: { ...BG.DEFAULT_POST_RULES, ...patch }, rules: BG.DEFAULT_RULES }, { version: '9.9.9' });
  const back = BG.readBackup(JSON.parse(JSON.stringify(file)));
  assert.deepEqual([back.data.postRules.reviewKeywords, back.data.postRules.reviewContacts, Object.keys(back.data).sort()], [['Inbox', 'kèo VIP'], true, ['postRules', 'rules']]);
});

test('việc chờ lâu: quá số giờ, chờ lâu nhất trước, nhắc mỗi việc một lần, câu thông báo', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const h = (n) => new Date(now - n * 3600e3).toISOString();
  const groups = [
    { id: 'gF', name: 'Food', canApprove: true, requests: [{ id: 'r1', createdAt: h(30) }, { id: 'r2', createdAt: h(5) }, { id: 'r3', createdAt: null }] },
    { id: 'gX', name: 'Không duyệt được', canApprove: false, requests: [{ id: 'r4', createdAt: h(99) }] },
    { id: 'gC', name: 'Crypto Life', communityName: 'Crypto Life', communityId: 'cC', approvals: [{ id: 'p1', submittedAt: h(80) }, { id: 'p2', submittedAt: h(2) }, { id: 'p3', submittedAt: null, publishedAt: h(25) }] },
  ];
  const o = BG.pendingOverdue(groups, { hours: 24, now });
  assert.deepEqual(o.map((x) => x.key), ['appr:p1', 'req:r1', 'appr:p3']);
  assert.deepEqual([o[0].kind, o[0].groupName, o[0].communityId, o[1].kind, o[1].groupId], ['post', 'Crypto Life', 'cC', 'request', 'gF']);
  assert.deepEqual(BG.pendingOverdue(groups, { hours: 72, now }).map((x) => x.key), ['appr:p1']);
  const first = BG.pendingReminder(o, ['req:r1', 'req:gone']);
  assert.deepEqual([first.fresh.map((x) => x.key), first.reminded], [['appr:p1', 'appr:p3'], ['appr:p1', 'req:r1', 'appr:p3']]);
  assert.deepEqual(BG.pendingReminder(o, first.reminded).fresh, []);
  assert.deepEqual(BG.pendingText(o, { hours: 24, now }), { title: 'BeinFusion: 3 việc chờ quá 24 giờ', message: '1 yêu cầu tham gia (Food), 2 bài chờ duyệt (Crypto Life). Lâu nhất đã chờ 3 ngày. Bấm để xử lý.' });
  assert.deepEqual([BG.waitText(26 * 3600e3), BG.waitText(47.9 * 3600e3), BG.waitText(50 * 3600e3)], ['26 giờ', '47 giờ', '2 ngày']);
  assert.equal(BG.telegramKind('bg-pending'), 'queue');
  assert.equal(BG.readBackup({ app: 'BeinFusion', data: { settings: { pendingHours: 999, remindPending: false } } }).data.settings.pendingHours, 168);
});

test('bộ nhớ: dung lượng từng khoá (lớn nhất trước, có tên dễ đọc), báo khi sắp đầy 10 MB hoặc quá lớn dù không giới hạn; manifest xin unlimitedStorage', () => {
  const sizes = BG.storageSizes({ log: [{ a: 'x'.repeat(1000) }], settings: { dryRun: true }, lạ: 'é' });
  assert.deepEqual(sizes.map((x) => [x.key, x.label]), [['log', 'Nhật ký thao tác'], ['settings', 'Cài đặt'], ['lạ', 'lạ']]);
  assert.equal(sizes[2].bytes, 2 + 4); // tên khoá + "é" (2 byte UTF-8 + 2 dấu ngoặc)
  const MB = 1048576;
  assert.deepEqual(BG.storageVerdict({ bytes: 2.5 * MB, sizes: [{ label: 'Nhật ký thao tác', bytes: 1.5 * MB }] }), { status: 'ok', detail: '2,5 MB / 10 MB · nhiều nhất: Nhật ký thao tác 1,5 MB' });
  assert.equal(BG.storageVerdict({ bytes: 8.5 * MB }).status, 'fail');
  assert.deepEqual(BG.storageVerdict({ bytes: 30 * MB, unlimited: true }), { status: 'ok', detail: '30 MB (không giới hạn)' });
  assert.match(BG.storageVerdict({ bytes: 250 * MB, unlimited: true }).detail, /^Bộ nhớ quá lớn: 250 MB/);
  assert.equal(BG.mbText(300 * 1024), '0,29 MB');
  const manifest = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('unlimitedStorage'));
});

test('mạo danh admin: tên / username giống admin (viết lách, chữ Kirin), tự nhận admin / hỗ trợ; không nhầm tên thường', () => {
  const admins = [{ id: 'a1', username: 'kaicrypto', fullname: 'Kai Crypto' }, { id: 'a2', username: 'minhanh', fullname: 'Minh Anh' }];
  const lv = (fullname, username) => BG.impersonation({ id: 'x', fullname, username }, admins)?.level || null;
  assert.equal(lv('Kai Crypto', 'kai_vn'), 'bad'); // trùng tên hiển thị
  assert.equal(lv('Kaı Crypt0', 'zz'), 'bad'); // i không chấm, số 0
  assert.equal(lv('Каі Сrурtо', 'zz'), 'bad'); // chữ Kirin
  assert.equal(lv('Tuấn', 'kaicryptoo'), 'bad'); // username gần giống
  assert.equal(lv('Minh Anh', 'minhanh99'), 'review'); // tên ngắn, dễ trùng tên thật
  assert.equal(lv('Kai Cryptos Fan', 'abc'), null);
  assert.equal(lv('Admin Crypto Life', 'x'), 'bad');
  assert.equal(lv('4dm1n Bic', 'x'), 'bad');
  assert.equal(lv('Hỗ trợ khách hàng', 'x'), 'bad');
  assert.equal(lv('Quản trị viên', 'x'), 'bad');
  assert.equal(lv('Crypto', 'cryptolifeadmin'), 'review'); // dính liền
  assert.equal(lv('Lan Mod', 'lanmod'), 'review');
  for (const [f, u] of [['Badminton Club', 'badminton'], ['Modern Art', 'modernart'], ['Nguyễn Văn Bình', 'binh.nguyen'], ['Hoàng Lâm', 'hoanglam']]) assert.equal(lv(f, u), null, f);
  assert.equal(BG.impersonation({ id: 'a1', fullname: 'Kai Crypto', username: 'kaicrypto' }, admins), null); // chính admin
  assert.match(BG.impersonation({ id: 'x', fullname: 'Kai Crypto', username: 'k' }, admins).text, /^Tên giống hệt admin Kai Crypto \(@kaicrypto\)$/);
  assert.notEqual(BG.nameKey('Trader 99'), BG.nameKey('Trader 66'));
  // Admin của cả community; yêu cầu tham gia giống admin -> gợi ý từ chối (tắt quy tắc thì không)
  const groups = [{ id: 'g1', communityId: 'c1' }, { id: 'g2', communityId: 'c1' }, { id: 'g3', communityId: 'c2' }];
  const by = { g1: [admins[0]], g2: [admins[1], admins[0]], g3: [{ id: 'a9', fullname: 'Khác', username: 'khac' }] };
  assert.deepEqual(BG.adminsOf(by, groups[1], groups).map((a) => a.id).sort(), ['a1', 'a2']);
  assert.deepEqual(BG.adminsOf(null, groups[0], groups), []);
  const req = { id: 'r1', user: { id: 'u5', fullname: 'Kai Crypto', username: 'kai.crypto.support', avatar: 'https://x/a.jpg', isVerified: true } };
  const ev = BG.evaluateRequest(req, { ...BG.DEFAULT_RULES, requireAnswers: false }, [], null, admins);
  assert.deepEqual([ev.verdict, ev.reasons[0].text], ['decline', 'Tên giống hệt admin Kai Crypto (@kaicrypto)']);
  assert.equal(BG.evaluateRequest(req, { ...BG.DEFAULT_RULES, requireAnswers: false, reviewImpersonation: false }, [], null, admins).verdict, 'approve');
});

test('đợt vào ồ ạt: đếm người vào trong 60 phút, người không có ảnh; Telegram loại riêng', () => {
  const now = Date.parse('2026-10-14T10:00:00Z');
  const j = (min, avatar = '') => ({ time: new Date(now - min * 60e3).toISOString(), user: { id: 'u' + min, avatar } });
  const b = BG.joinBurst([j(5), j(20, 'https://x/a.jpg'), j(59), j(61), j(200)], { minutes: 60, now });
  assert.deepEqual([b.count, b.noAvatar, b.userIds], [3, 2, ['u5', 'u20', 'u59']]);
  assert.equal(b.from, now - 59 * 60e3);
  assert.deepEqual([BG.telegramKind('bg-impostor'), BG.telegramKind('bg-burst-g1'), BG.DEFAULT_TELEGRAM.kinds.security], ['security', 'security', true]);
});

test('chat Beincom: tin nhắn chat bị báo cáo — nhận cả snake_case / camelCase, mã Beincom hay mã chat, đếm', () => {
  const snake = BG.chatReportItem({ id: 'r1', message: 'x'.repeat(600), files: [{}, {}], reported_member: { id: 'abcdefghijklmnopqrstuvwxyz', username: 'a', first_name: 'An', last_name: 'B' }, create_at: '2026-10-14T03:00:00Z', reason_stats: [{ reason_type: 'SPAM', total: 2 }, { reason_type: 'OTHERS', total: 1 }, {}] });
  assert.deepEqual([snake.message.length, snake.files, snake.member.id, snake.member.chatId, snake.member.fullname, snake.reasons.length, snake.total, snake.firstAt, snake.channel], [500, 2, '', 'abcdefghijklmnopqrstuvwxyz', 'An B', 2, 3, Date.parse('2026-10-14T03:00:00Z'), '']);
  const camel = BG.chatReportItem({ id: 7, message: 'hi', reportedMember: { id: '0f1e2d3c-1111-4222-8333-944455556666', fullname: 'C', isVerified: true }, createAt: 5, targetCreateAt: 4, reasonStats: [{ reasonType: 'ILLEGAL', total: 1 }], total: 4, channelDisplayName: 'Kênh' });
  assert.deepEqual([camel.id, camel.member.id, camel.member.verified, camel.reasons, camel.total, camel.firstAt, camel.postAt, camel.channel], ['7', '0f1e2d3c-1111-4222-8333-944455556666', true, [{ type: 'ILLEGAL', total: 1 }], 4, 5, 4, 'Kênh']);
  assert.equal(BG.chatReportItem({ message: 'không mã' }), null);
  assert.equal(BG.chatReportItem({ id: 'r', reported_member: null }).total, 1);
  assert.equal(BG.chatReportsCount({ a: { items: [1, 2] }, b: { items: [] }, c: { error: 'denied' } }), 2);
  assert.equal(BG.chatReportsCount(undefined), 0);
  assert.equal(BG.telegramKind('bg-chat-reports'), 'reports');
});

test('chat Beincom: người dùng chat -> người Beincom, quyền kênh, thu gọn tin, gộp tin, tin nhắn riêng chưa đọc, lời nhắn kèm bài, số liệu', () => {
  const u = { id: 'c1', username: 'kai', first_name: 'Kai', last_name: 'Crypto', props: { bic_user_id: 'b1' } };
  assert.deepEqual(BG.chatPerson(u), { id: 'b1', chatId: 'c1', username: 'kai', fullname: 'Kai Crypto', avatar: '' });
  const perms = { rA: ['create_post', 'delete_others_posts'], rU: ['read_channel'], team_admin: ['delete_others_posts', 'create_post'] };
  const team = { id: 't1', name: 'cl', props: { bic_group_team_id: 'cCL' } };
  const ch = BG.chatChannel({ id: 'k1', display_name: 'Crypto Life', props: { bic_group_id: 'g1' }, type: 'O', last_post_at: 5 }, team, { channelRoles: 'channel_user rU', teamRoles: 'team_user', perms });
  assert.deepEqual([ch.groupId, ch.communityId, ch.canDelete, ch.canPost, ch.teamName], ['g1', 'cCL', false, false, 'cl']);
  assert.equal(BG.chatChannel({ id: 'k1', props: {} }, team, { channelRoles: 'rU', teamRoles: 'team_admin', perms }).canDelete, true); // quyền từ vai trò team
  const p = { id: 'p1', channel_id: 'k1', create_at: Date.parse('2026-10-14T01:00:00Z'), delete_at: 0, type: '', message: 'Xem t.me/abc', file_ids: ['f'], metadata: { embeds: [{ type: 'opengraph', url: 'https://t.me/abc' }] }, author: u };
  const m = BG.slimChatPost(p, ch);
  assert.deepEqual([m.groupId, m.groupName, m.link, m.files, m.user.id, m.createdAt], ['g1', 'Crypto Life', 'https://t.me/abc', 1, 'b1', '2026-10-14T01:00:00.000Z']);
  assert.equal(BG.slimChatPost({ ...p, type: 'system_join_channel' }, ch), null);
  assert.equal(BG.slimChatPost({ ...p, delete_at: 1 }, ch), null);
  assert.deepEqual(BG.evaluatePost(BG.chatAsPost(m), { blockedDomains: ['t.me'] }).verdict, 'bad');
  // Gộp: giữ Bỏ qua / Đã xoá, mới nhất trước, bỏ tin quá 7 ngày
  const now = Date.parse('2026-10-14T02:00:00Z');
  const old = [{ ...m, dismissed: true }, { id: 'p0', createdAt: '2026-10-01T00:00:00Z' }];
  const merged = BG.mergeChatMessages(old, [m, { ...m, id: 'p2', createdAt: '2026-10-14T01:30:00Z' }], { now });
  assert.deepEqual(merged.map((x) => [x.id, !!x.dismissed]), [['p2', false], ['p1', true]]);
  assert.equal(BG.markChatDeleted(merged, ['p1'])[1].deleted, true);
  // Tin nhắn riêng chưa đọc (D: người kia lấy từ tên kênh)
  const dms = BG.dmUnread([{ id: 'd1', type: 'D', name: 'me__c9', total_msg_count: 4, last_post_at: 9 }, { id: 'd2', type: 'D', name: 'c8__me', total_msg_count: 2 }, { id: 'd3', type: 'G', display_name: 'Nhóm', total_msg_count: 3, last_post_at: 10 }], [{ channel_id: 'd1', msg_count: 1 }, { channel_id: 'd2', msg_count: 2 }, { channel_id: 'd3', msg_count: 0, mention_count: 1 }], 'me');
  assert.deepEqual(dms.map((d) => [d.channelId, d.otherId, d.unread, d.mentions]), [['d3', '', 3, 1], ['d1', 'c9', 3, 0]]);
  assert.equal(BG.chatUrl('direct', 'd1'), 'https://group.beincom.com/chat-home?teamName=direct&channel=d1');
  // Markdown của chat: khối và chữ trong dòng; link chỉ http(s) / mailto
  const md = BG.chatMarkdown('> trích\n\n- **a** ~~b~~ *c* _d_\n- [x](https://a.b) `m`\n\n2. một\n3. hai\n\n```js\nlet x = 1;\n```\n# Đề\n---\nhết @kai www.x.vn.');
  assert.deepEqual(md.map((b) => b.t), ['quote', 'ul', 'ol', 'pre', 'h', 'hr', 'p']);
  assert.deepEqual(md[1].items[0].map((n) => n.t), ['b', 'text', 's', 'text', 'i', 'text', 'i']);
  assert.deepEqual([md[1].items[1][0], md[2].start, md[3].v, md[3].lang], [{ t: 'a', href: 'https://a.b', c: [{ t: 'text', v: 'x' }] }, 2, 'let x = 1;', 'js']);
  assert.deepEqual(md[6].c.filter((n) => n.t !== 'text'), [{ t: 'at', v: '@kai' }, { t: 'a', href: 'https://www.x.vn', c: [{ t: 'text', v: 'www.x.vn' }] }]);
  assert.deepEqual(BG.chatMarkdown('[bấm](javascript:alert(1)) a@b.com')[0].c, [{ t: 'text', v: '[bấm](javascript:alert(1)) a@b.com' }]); // không nhận link lạ, email không là @tên
  assert.deepEqual(BG.chatMarkdown('***đậm nghiêng*** 2*3*4')[0].c.slice(0, 1), [{ t: 'b', c: [{ t: 'i', c: [{ t: 'text', v: 'đậm nghiêng' }] }] }]);
  assert.equal(BG.chatMarkdown('2*3*4 snake_case_name')[0].c.length, 1); // dấu * / _ giữa chữ không phải định dạng
  assert.deepEqual(BG.chatMarkdown('a\nb')[0].c.map((n) => n.t), ['text', 'br', 'text']);
  assert.deepEqual(BG.chatMarkdown('```url```')[0].c, [{ t: 'code', v: 'url' }]);
  assert.equal(BG.chatPlain('**Đậm** và [link](https://x.y) `m`\n- a\n- b'), 'Đậm và link m a b');
  // Bộ gõ: định dạng chữ đang chọn, bấm lại thì bỏ; danh sách; link
  const ed = (v, s, e, k) => {
    const r = BG.mdEdit(v, s, e, k);
    const out = v.slice(0, r.from) + r.text + v.slice(r.to);
    return [out, out.slice(r.selStart, r.selEnd)];
  };
  assert.deepEqual(ed('xin chào', 4, 8, 'bold'), ['xin **chào**', 'chào']);
  assert.deepEqual(ed('xin **chào**', 6, 10, 'bold'), ['xin chào', 'chào']);
  assert.deepEqual(ed('xin **chào**', 4, 12, 'bold'), ['xin chào', 'chào']);
  assert.deepEqual(ed('xin chào ', 4, 9, 'italic'), ['xin *chào* ', 'chào']); // khoảng trắng để ngoài
  assert.deepEqual(ed('**chào**', 2, 6, 'italic'), ['***chào***', 'chào']); // không nhầm ** là *
  assert.deepEqual(ed('ab', 2, 2, 'strike'), ['ab~~chữ gạch~~', 'chữ gạch']);
  assert.deepEqual(ed('a\nb', 0, 3, 'code'), ['```\na\nb\n```', 'a\nb']);
  assert.deepEqual(ed('xem', 0, 3, 'link'), ['[xem](url)', 'url']);
  assert.deepEqual(ed('https://a.b', 0, 11, 'link'), ['[](https://a.b)', '']);
  assert.deepEqual(ed('mua\nbán', 0, 7, 'ol'), ['1. mua\n2. bán', '1. mua\n2. bán']);
  assert.deepEqual(ed('1. mua\n2. bán', 0, 13, 'ol'), ['mua\nbán', 'mua\nbán']);
  assert.deepEqual(ed('1. mua\n2. bán', 0, 13, 'ul'), ['- mua\n- bán', '- mua\n- bán']); // đổi kiểu danh sách
  assert.deepEqual(ed('dòng một\ndòng hai', 3, 3, 'quote'), ['> dòng một\ndòng hai', '']);
  assert.equal(BG.mdEdit('a', 0, 1, 'lạ'), null);
  // Shift + Enter trong danh sách
  const nl = (v, pos) => {
    const r = BG.mdNewline(v, pos);
    return r && v.slice(0, r.from) + r.text + v.slice(r.to);
  };
  assert.deepEqual([nl('- a', 3), nl('9. a', 4), nl('x\n- ', 4), nl('chữ', 3)], ['- a\n- ', '9. a\n10. ', 'x\n', null]);
  // Huy hiệu cạnh tên: xác minh (hồ sơ phụ), Premium theo năm / trọn đời; không có thì không thêm khoá
  const per = (x) => BG.chatPerson({ id: 'c1', username: 'u', first_name: 'A', last_name: 'B', props: { bic_user_id: 'b1' }, extra_data: x });
  assert.deepEqual(per({ is_verified: true, is_primary: true, subscriptions: [{ type: 'premium', term: 'lifetime' }] }), { id: 'b1', chatId: 'c1', username: 'u', fullname: 'A B', avatar: '', verified: true, premium: 'lifetime' });
  assert.deepEqual([per({ is_verified: true, is_primary: false }).subProfile, per({ subscriptions: [{ type: 'premium', term: 'annual' }] }).premium, Object.keys(per({ subscriptions: [{ type: 'basic' }] })).length], [true, 'annual', 5]);
  // Thread của tin: số bình luận, đang theo dõi, người tham gia
  const tp = BG.chatPagePost({ id: 'p1', channel_id: 'k', user_id: 'c1', message: 'x', reply_count: 3, last_reply_at: 9, is_following: true, participants: [{ id: 'c2', username: 'v', last_picture_update: 5 }] });
  assert.deepEqual([tp.replyCount, tp.lastReplyAt, tp.following, tp.participants.map((u) => [u.chatId, u.pictureAt])], [3, 9, true, [['c2', 5]]]);
  // Biểu cảm: tên emoji -> hình; Beincom reaction_stats hoặc reactions gốc
  assert.deepEqual([BG.chatEmoji('+1'), BG.chatEmoji('heart'), BG.chatEmoji('bic_custom'), BG.chatEmojiName('🔥')], ['👍', '❤️', '', 'fire']);
  assert.deepEqual(BG.chatReactions({ reaction_stats: [{ emoji_name: 'joy', count: 3, top_reactors: ['a'], user_reacted: false }, { emoji_name: 'x', count: 0 }] }), [{ name: 'joy', count: 3, mine: false, top: ['a'] }]);
  assert.deepEqual(BG.chatReactions({ reactions: [{ user_id: 'me', emoji_name: '+1' }, { user_id: 'b', emoji_name: '+1' }, { user_id: 'b', emoji_name: 'fire' }] }, 'me'), [{ name: '+1', count: 2, mine: true, top: ['me', 'b'] }, { name: 'fire', count: 1, mine: false, top: ['b'] }]);
  assert.deepEqual(BG.chatReactions(undefined), []);
  // Báo thread có bình luận mới: lần đầu chỉ ghi nhận, sau đó chỉ cái mới hơn lần báo trước
  const tA = { id: 'a', lastReplyAt: 10, unreadReplies: 1 };
  const n1 = BG.threadNotice([tA], null, true);
  assert.deepEqual([n1.fresh, n1.seen], [[], { a: 10 }]);
  const n2 = BG.threadNotice([tA, { id: 'b', lastReplyAt: 20, unreadReplies: 2 }, { id: 'c', lastReplyAt: 30, unreadReplies: 0 }], n1.seen);
  assert.deepEqual([n2.fresh.map((t) => t.id), n2.seen], [['b'], { a: 10, b: 20, c: 30 }]);
  // Gợi ý @tên: đoạn @chữ ngay trước con trỏ
  assert.deepEqual([BG.chatMentionQuery('chào @ka', 8), BG.chatMentionQuery('@', 1), BG.chatMentionQuery('(@lan.anh', 9)], [{ start: 5, term: 'ka' }, { start: 0, term: '' }, { start: 1, term: 'lan.anh' }]);
  assert.deepEqual([BG.chatMentionQuery('mail a@b', 8), BG.chatMentionQuery('@ka xong', 8), BG.chatMentionQuery('chào @ka', 6)], [null, null, { start: 5, term: '' }]);
  // Bản nháp: bỏ trống, quá 7 ngày, giữ 50 bản mới nhất
  const nowD = 10 * 864e5;
  const dr = BG.pruneDrafts({ a: { t: 'x', at: nowD - 1000 }, b: { t: '  ', at: nowD }, c: { t: 'cũ', at: nowD - 8 * 864e5 }, ...Object.fromEntries(Array.from({ length: 55 }, (_, i) => ['k' + i, { t: 'n', at: nowD - i * 10 }])) }, nowD);
  assert.deepEqual([Object.keys(dr).length, 'a' in dr, 'b' in dr, 'c' in dr, 'k54' in dr], [50, false, false, false, false]);
  // Độ ưu tiên của tin
  assert.deepEqual([BG.chatPriority({ metadata: { priority: { priority: 'urgent' } } }), BG.chatPriority({ metadata: { priority: { priority: 'lạ' } } }), BG.chatPriority({})], ['urgent', '', '']);
  // Lời mời trò chuyện: người kia gửi (contact_requester_id, không có thì creator_id) và chưa chấp nhận
  const ct = (props, extra = {}) => BG.chatContact({ type: 'D', name: 'me__c9', creator_id: 'me', props, ...extra }, 'me');
  assert.deepEqual(ct({ contact_id: 'k1', contact_requester_id: 'c9', contact_status: 'pending' }), { id: 'k1', status: 'pending', incoming: true, sent: false, ignoredByOther: false });
  assert.equal(ct({ contact_requester_id: 'c9', contact_status: 'spammed' }).incoming, true);
  assert.equal(ct({ contact_requester_id: 'c9', contact_status: 'ignored' }).incoming, true); // mình đã bỏ qua: vẫn là lời mời, không lẫn vào tin nhắn riêng
  assert.equal(ct({ contact_requester_id: 'c9', contact_status: 'accepted' }).incoming, false);
  assert.deepEqual([ct({ contact_requester_id: 'me', contact_status: 'pending' }).sent, ct({ contact_requester_id: 'me', contact_status: 'ignored' }).ignoredByOther], [true, true]);
  assert.equal(ct({ contact_status: 'pending' }, { creator_id: 'c9' }).incoming, true); // không có người gửi: lấy người tạo kênh
  assert.equal(ct({}), null); // tin nhắn riêng cũ (không có trạng thái)
  assert.equal(BG.chatContact({ type: 'G', props: { contact_status: 'pending' } }, 'me'), null);
  assert.deepEqual(BG.dmUnread([{ id: 'r1', type: 'D', name: 'me__c9', total_msg_count: 1, props: { contact_requester_id: 'c9', contact_status: 'pending' } }], [], 'me').map((d) => [d.channelId, d.request]), [['r1', true]]);
  // Nhật ký cá nhân (nhắn cho chính mình): không phải tin nhắn riêng chưa đọc
  assert.deepEqual(BG.dmUnread([{ id: 's1', type: 'D', name: 'me__me', total_msg_count: 5 }], [], 'me'), []);
  assert.deepEqual([BG.chatSelfDm({ type: 'D', name: 'me__me' }, 'me'), BG.chatSelfDm({ type: 'D', name: 'me__c9' }, 'me'), BG.chatSelfDm({ type: 'G', name: 'me__me' }, 'me'), BG.chatSelfDm({ type: 'D', name: '__' }, '')], [true, false, false, false]);
  assert.equal(BG.chatShareText('## Tiêu đề **đậm**\nThân bài', 'https://x/p/1'), '📢 Tiêu đề đậm\nhttps://x/p/1');
  assert.equal(BG.chatShareText('a', 'https://x/p/1', ' Lời nhắn '), '📢 Lời nhắn\nhttps://x/p/1');
  const st = BG.chatStats([{ t: 5, ch: 'k1', u: { id: 'a' } }, { t: 6, ch: 'k1', u: { id: 'a' } }, { t: 7, ch: 'k2', u: { id: 'b' } }, { t: 50, ch: 'k1', u: { id: 'a' } }], { from: 0, to: 10 }, [{ id: 'k1', name: 'A' }, { id: 'k2', name: 'B' }]);
  assert.deepEqual([st.messages, st.people, st.top.map((x) => [x.user.id, x.count]), st.channels.map((x) => [x.id, x.count])], [3, 2, [['a', 2], ['b', 1]], [['k1', 2], ['k2', 1]]]);
  // Lỗi của chat (Mattermost) có câu báo
  assert.equal(BG.errMsg({ status: 403, body: { id: 'api.context.permissions.app_error', message: 'You do not have the appropriate permissions.', status_code: 403 } }), 'You do not have the appropriate permissions.');
  assert.deepEqual([BG.telegramKind('bg-chat'), BG.telegramKind('bg-chat-dm'), BG.telegramKind('bg-chat-mention'), BG.DEFAULT_TELEGRAM.kinds.chat], ['violations', 'chat', 'chat', true]);
});

test('chatTreeOrder: kênh chính trước, group con ngay dưới group cha, thụt theo cấp', () => {
  const ch = (id, groupId, x = {}) => ({ id, groupId, name: id.toUpperCase(), ...x });
  const list = [
    ch('c3', 'g3', { level: 2, parentGroupId: 'g2' }), // tin mới nhất trước (thứ tự sẵn có)
    ch('c4', 'g4', { level: 1, parentGroupId: 'root' }),
    ch('c2', 'g2', { level: 1, parentGroupId: 'root' }),
    ch('main', 'root', { main: true, level: 0 }),
    ch('c5', 'g5', { level: 2, parentGroupId: 'gMissing' }), // cha chưa tham gia: thụt một cấp
    ch('c6', 'g6'), // chưa biết cấp
  ];
  const out = BG.chatTreeOrder(list);
  assert.deepEqual(out.map((c) => [c.id, c.depth, c.parentName]), [
    ['main', 0, ''],
    ['c4', 1, ''],
    ['c2', 1, ''],
    ['c3', 2, 'C2'],
    ['c5', 1, ''],
    ['c6', 0, ''],
  ]);
  // Đường nối: └ cho con cuối, │ ở cột tổ tiên còn em phía dưới (c2 còn em c5), ┬ cho mục có con
  assert.deepEqual(out.map((c) => [c.id, c.last, c.rails, c.kids]), [
    ['main', true, [], true],
    ['c4', false, [], false],
    ['c2', false, [], true],
    ['c3', true, [true], false],
    ['c5', true, [], false],
    ['c6', true, [], false],
  ]);
  // Kênh chính mang group khác group gốc: con trực tiếp của group gốc (rootId) vẫn treo dưới kênh chính
  const l2 = [ch('a', 'gA', { level: 1, parentGroupId: 'cRoot' }), ch('m', 'gM', { main: true })];
  assert.deepEqual(BG.chatTreeOrder(l2).map((c) => [c.id, c.depth]), [['m', 0], ['a', 1]]);
  assert.deepEqual(BG.chatTreeOrder(l2, 'cRoot').map((c) => [c.id, c.depth]), [['m', 0], ['a', 1]]);
  // Dữ liệu vòng không làm mất kênh; không sửa danh sách gốc
  const loop = [ch('x', 'gx', { parentGroupId: 'gy' }), ch('y', 'gy', { parentGroupId: 'gx' })];
  assert.deepEqual(BG.chatTreeOrder(loop).map((c) => c.id).sort(), ['x', 'y']);
  assert.equal(list[0].depth, undefined);
  assert.deepEqual(BG.chatTreeOrder(null), []);
});

test('Giao diện trang Chat: lựa chọn đọc từ máy được làm sạch; màu Silk luôn đủ rõ', () => {
  assert.deepEqual(BG.cleanChatLook(null), BG.CHAT_LOOK_DEFAULT);
  assert.equal(BG.CHAT_LOOK_DEFAULT.ui, 'theme'); // mặc định: BeinFusion theme
  const x = BG.cleanChatLook({ ui: 'silk', mode: 'tím', accent: '#2f6feb', style: 'flat', size: 'xl', avatars: false, times: 'có', extra: 1 });
  assert.deepEqual(x, { ...BG.CHAT_LOOK_DEFAULT, ui: 'silk', accent: '#2F6FEB', style: 'flat', avatars: false });
  assert.equal(BG.cleanChatLook({ accent: 'red' }).accent, '#6B3FE7');
  assert.equal(BG.mixHex('#000000', '#FFFFFF', 0.5), '#808080');
  assert.ok(Math.abs(BG.contrastRatio('#000000', '#FFFFFF') - 21) < 0.01);
  // Mọi màu có sẵn, sáng và tối: chữ màu nhấn ≥ 4,5:1 trên bề mặt; chữ trên nút màu nhấn ≥ 4,5:1 (trừ màu rất sáng thì ≥ 3)
  for (const [hex] of BG.CHAT_ACCENTS)
    for (const dark of [false, true]) {
      const c = BG.chatLookColors(hex, dark);
      assert.ok(BG.contrastRatio(c.accentText, dark ? '#18171F' : '#FFFFFF') >= 4.5, `${hex} ${dark}`);
      assert.ok(BG.contrastRatio(c.onAccent, c.accent) >= 3, `${hex} ${dark} nút`);
    }
  // Màu tự chọn quá nhạt (vàng chanh): chữ màu nhấn được làm đậm, chữ trên nút là màu tối
  const pale = BG.chatLookColors('#E8F06A', false);
  assert.equal(pale.fixed, true);
  assert.ok(BG.contrastRatio(pale.accentText, '#FFFFFF') >= 4.5);
  assert.equal(pale.onAccent, '#14111F');
  assert.equal(BG.chatLookColors('#6B3FE7', false).fixed, false);
});
