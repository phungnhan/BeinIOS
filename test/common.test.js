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
  assert.deepEqual([b.app, b.format, b.version, b.exportedAt], ['BeinGroup', 1, '0.10.0', '2026-10-09T01:00:00.000Z']);
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
  assert.throws(() => BG.readBackup({ ...b, format: 9 }), /phiên bản BeinGroup mới hơn/);
  assert.throws(() => BG.readBackup({ app: 'BeinGroup', data: { foo: 1 } }), /không có dữ liệu/);
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
  assert.match(text, /^BeinGroup: tóm tắt 7 ngày \(02\/10 → 09\/10\/2026\)/);
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
  assert.equal(BG.readBackup({ app: 'BeinGroup', data: { settings: { unansweredHours: 500, watchKeywords: ['a', 1] } } }).data.settings.unansweredHours, 72);
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
  assert.equal(BG.readBackup({ app: 'BeinGroup', format: 1, data: { settings: { trustAfterApproved: 500 } } }).data.settings.trustAfterApproved, 100);
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
