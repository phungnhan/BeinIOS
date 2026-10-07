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

test('newRequestIds và totals (bài chờ duyệt chỉ cộng một lần mỗi community)', () => {
  const groups = [
    { id: 'g1', communityId: 'c1', pendingTotal: 2, approvalCount: 3, requests: [{ id: 'a' }, { id: 'b' }] },
    { id: 'g2', communityId: 'c1', pendingTotal: 1, approvalCount: null, requests: [{ id: 'c' }] },
    { id: 'g3', communityId: 'c2', pendingTotal: 0, approvalCount: 4, requests: [] },
  ];
  assert.deepEqual(BG.newRequestIds(groups, ['a']), ['b', 'c']);
  assert.deepEqual(BG.totals(groups), { requests: 3, posts: 7 });
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
