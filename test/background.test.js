// Chạy background.js thật trong Node với chrome.* và API Beincom giả lập.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const BG = require('../common.js');

const API = BG.API;
const ok = (data, meta = {}) => ({ code: 'api.ok', data, meta: { message: 'OK', ...meta } });

const user = (n, extra = {}) => ({
  id: `u${n}`,
  username: `user${n}`,
  fullname: `Người ${n}`,
  avatar: `https://media.beincom.com/avatar/${n}`,
  isVerified: true,
  isDeactivated: false,
  subscriptions: [],
  userNFT: { isLinkedPoNFT: false, isLinkedUoNFT: false },
  ...extra,
});
const jr = (n, extra = {}, userExtra = {}) => ({
  id: `jr${n}`,
  groupId: 'gFood',
  userId: `u${n}`,
  status: 'waiting',
  createdAt: '2026-10-07T10:00:00Z',
  membershipAnswers: [],
  ...extra,
  user: user(n, userExtra),
});

// Bài viết như API trả về (timeline / chi tiết bài chờ duyệt)
const CL = { id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true };
const CLsub = { id: 'gCLsub', name: 'Crypto Life - General', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: false };
const post = (id, text, extra = {}) => ({
  id,
  type: 'POST',
  content: text,
  title: text.slice(0, 500),
  publishedAt: '2026-10-07T09:00:00Z',
  isHidden: false,
  actor: { id: 'a' + id, username: 'tacgia' + id, fullname: 'Tác giả ' + id, avatar: '' },
  audience: { groups: [CL] },
  media: { images: [{}], videos: [], files: [] },
  commentsCount: 0,
  ...extra,
});

// Dữ liệu mẫu: community Food Research (chủ sở hữu) và một group con của Crypto Life (admin group)
function fixture() {
  return {
    perms: {
      communities: { cFood: ['manage', 'role_OWNER', 'ban_member'], cCL: ['send_message'] },
      groups: {
        gFood: ['approve_reject_jr', 'remove_member', 'assign_unassign_role', 'role_OWNER', 'role_COMMUNITY_ADMIN'],
        gCL: ['approve_reject_jr', 'remove_member', 'assign_unassign_role', 'role_GROUP_ADMIN'],
        gCLsub: ['approve_reject_jr', 'role_GROUP_ADMIN'],
        gOther: ['send_message', 'comment_on_thread'],
      },
    },
    groups: {
      gFood: { id: 'gFood', name: 'Food Research', communityId: 'cFood', isCommunity: true, level: 0, privacy: 'OPEN', userCount: 3, community: { name: 'Food Research' }, settings: { isJoinApproval: true, isActiveMembershipQuestions: true, contentApproval: { value: false } } },
      gCL: { id: 'gCL', name: 'Crypto Life', communityId: 'cCL', isCommunity: true, level: 0, privacy: 'OPEN', userCount: 12000, community: { name: 'Crypto Life' }, settings: { isJoinApproval: false, isActiveMembershipQuestions: true, contentApproval: { value: true } } },
      gCLsub: { id: 'gCLsub', name: 'Crypto Life - General', communityId: 'cCL', isCommunity: false, level: 1, privacy: 'OPEN', userCount: 500, community: { name: 'Crypto Life' }, settings: { isJoinApproval: true, isActiveMembershipQuestions: false, contentApproval: { value: false } } },
    },
    requests: {
      gFood: [
        jr(1, { membershipAnswers: [{ questionId: 'q1', answer: 'Qua bạn bè giới thiệu' }] }),
        jr(2, {}, { avatar: '' }), // thiếu ảnh và chưa trả lời -> cần xem
        jr(3, { membershipAnswers: [{ questionId: 'q1', answer: 'Kiếm tiền nhanh tại t.me/x' }] }), // từ khoá cấm
      ],
      gCL: [],
      gCLsub: [],
    },
    questions: { gFood: [{ id: 'q1', question: 'Bạn biết nhóm qua đâu?', isRequired: true }] },
    // Bài chờ duyệt của Crypto Life: p1 có link t.me ở sau ký tự thứ 500 (chỉ thấy khi tải chi tiết)
    approvals: {
      gCL: [post('p1', 'Chia sẻ kiến thức DeFi ' + 'x'.repeat(600) + ' liên hệ t.me/lua', { publishedAt: null, submittedAt: '2026-10-07T08:00:00Z' }), post('p2', 'Bài phân tích BTC tuần này', { publishedAt: null })],
    },
    // Thành viên community (API manage, có ngày vào) và thành viên group (API users, admin tách riêng)
    members: {
      cFood: [
        { ...user(31), joinedAt: '2026-09-30T00:00:00Z', isCommunityAdmin: false, totalJoinedGroup: 1 },
        { ...user(32), fullname: 'Trần Nguyên', joinedAt: '2026-10-07T00:00:00Z', isCommunityAdmin: false, totalJoinedGroup: 2 },
        { ...user(33), joinedAt: '2026-10-05T00:00:00Z', isCommunityAdmin: true, totalJoinedGroup: 3 },
      ],
    },
    users: {
      gFood: [{ ...user(33), isAdmin: true }, { ...user(31) }, { ...user(32) }],
      gCLsub: [{ ...user(41), isAdmin: true }, { ...user(42) }, { ...user(43), subscriptions: [{ type: 'premium' }] }],
    },
    activity: {
      gCLsub: [
        { id: 'e1', eventTime: '2026-10-07T10:00:00Z', eventType: 'CREATE', useCase: 'join.group.as_member', data: { actor: user(42), group: { name: 'Crypto Life - General' } } },
        { id: 'e2', eventTime: '2026-10-07T09:00:00Z', eventType: 'UPDATE', useCase: 'assign.group_admin', data: { actor: user(41), user: user(43), changes: { old: 'MEMBER', new: 'GROUP_ADMIN' } } },
        { id: 'e3', eventTime: '2026-10-01T09:00:00Z', eventType: 'DELETE', useCase: 'leave.group', data: { actor: user(44) } },
      ],
    },
    postSeq: 0,
    // Thống kê chính thức: chỉ Food Research (chủ community) có
    officialMembers: {
      cFood: [
        { communityId: 'cFood', date: '2026-10-06T00:00:00.000Z', joinedCount: 1, leftCount: 0, memberCount: 2 },
        { communityId: 'cFood', date: '2026-10-07T00:00:00.000Z', joinedCount: 2, leftCount: 1, memberCount: 3 },
      ],
    },
    officialPosts: { gFood: [{ date: '2026-10-07T00:00:00.000Z', postCount: 4, articleCount: 1, seriesCount: 0, totalCount: 5 }] },
    scheduled: {
      gCL: [post('s2', 'Bài hẹn giờ sau', { status: 'WAITING_SCHEDULE', scheduledAt: '2026-10-10T02:00:00Z' }), post('s1', 'Bài hẹn giờ trước', { status: 'WAITING_SCHEDULE', scheduledAt: '2026-10-09T02:00:00Z' })],
    },
    // Bài mới đăng: t2 đăng vào cả group gốc và group con
    timeline: {
      gCL: [post('t1', 'Tin tức thị trường hôm nay', { publishedAt: '2026-10-07T10:00:00Z' }), post('t2', 'Nhận airdrop miễn phí tại bit.ly/abc', { audience: { groups: [CL, CLsub] } })],
      gCLsub: [post('t2', 'Nhận airdrop miễn phí tại bit.ly/abc', { audience: { groups: [CL, CLsub] } }), post('t3', 'Hỏi đáp về ví', { publishedAt: '2026-10-06T09:00:00Z', audience: { groups: [CLsub] } })],
    },
  };
}

function makeEnv({ data = fixture(), settings = {}, rules = {}, postRules = {}, loggedIn = true } = {}) {
  const calls = [];
  const bodies = [];
  const fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const p = url.replace(API, '');
    calls.push(`${method} ${p}`);
    if (opts.body) bodies.push([`${method} ${p}`, JSON.parse(opts.body)]);
    const reply = (status, body) => ({ status, json: async () => body });
    if (!loggedIn) return reply(401, { code: 'unauthorized', meta: { message: 'Unauthorized' } });
    let m;
    if (p === 'group/me/permissions') return reply(200, ok(data.perms));
    if ((m = p.match(/^group\/groups\/(\w+)$/))) return data.groups[m[1]] ? reply(200, ok(data.groups[m[1]])) : reply(404, { code: 'not_found' });
    if ((m = p.match(/^group\/groups\/(\w+)\/join-requests\?limit=(\d+)&offset=(\d+)$/))) {
      const all = data.requests[m[1]] || [];
      const [limit, offset] = [Number(m[2]), Number(m[3])];
      const page = all.slice(offset, offset + limit);
      return reply(200, ok(page, { total: all.length, limit, offset, hasNextPage: offset + limit < all.length }));
    }
    if ((m = p.match(/^group\/groups\/(\w+)\/membership-questions$/))) return reply(200, ok(data.questions[m[1]] || []));
    if ((m = p.match(/^content\/manage\/communities\/(\w+)\/approval-contents\/count\?approvalStatus=WAITING_APPROVAL$/))) return reply(200, ok((data.approvals[m[1]] || []).length));
    if ((m = p.match(/^content\/manage\/communities\/(\w+)\/approval-contents\?limit=(\d+)&approvalStatus=WAITING_APPROVAL(?:&after=(\d+))?$/))) {
      const all = data.approvals[m[1]] || [];
      const [limit, start] = [Number(m[2]), Number(m[3] || 0)];
      // Danh sách không có nội dung đầy đủ, chỉ có title (500 ký tự đầu)
      const list = all.slice(start, start + limit).map(({ content, ...rest }) => rest);
      const more = start + limit < all.length;
      return reply(200, ok({ list, meta: { hasNextPage: more, endCursor: more ? String(start + limit) : null } }));
    }
    if ((m = p.match(/^content\/manage\/communities\/(\w+)\/approval-contents\/(\w+)$/))) {
      const it = (data.approvals[m[1]] || []).find((x) => x.id === m[2]);
      return it ? reply(200, ok(it)) : reply(404, { code: 'not_found' });
    }
    if ((m = p.match(/^content\/contents\/approval-contents\/(\w+)$/)) && method === 'PUT') {
      for (const list of Object.values(data.approvals)) {
        const i = list.findIndex((x) => x.id === m[1]);
        if (i >= 0) list.splice(i, 1);
      }
      return reply(200, ok(true));
    }
    // Thành viên: đọc query thật để kiểm tra tham số addon gửi
    const [path, query = ''] = p.split('?');
    const q = Object.fromEntries(new URLSearchParams(query));
    if ((m = path.match(/^content\/timeline\/(\w+)$/))) {
      const all = data.timeline[m[1]] || [];
      const start = Number(q.after || 0);
      const list = all.slice(start, start + Number(q.limit));
      const more = start + list.length < all.length;
      return reply(200, ok({ list, meta: { hasNextPage: more, endCursor: more ? String(start + list.length) : null } }));
    }
    if (path === 'user/me/profile') {
      data.meHeaders = opts.headers;
      return reply(200, ok({ id: 'me1', username: 'kai', fullname: 'Kai Crypto' }));
    }
    if ((m = path.match(/^group\/manage\/communities\/(\w+)\/stats\/member-count$/))) {
      return data.officialMembers[m[1]] ? reply(200, ok(data.officialMembers[m[1]])) : reply(403, { code: 'forbidden', meta: { message: "You don't have permission" } });
    }
    if ((m = path.match(/^content\/stats\/communities\/(\w+)\/contents\/daily-counts$/))) {
      return data.officialPosts[m[1]] ? reply(200, ok(data.officialPosts[m[1]])) : reply(400, { code: 'community.not_admin', meta: { message: 'You are not community owner or admin' } });
    }
    const match = (u) => !q.key || `${u.fullname} ${u.username}`.toLowerCase().includes(q.key.toLowerCase());
    if ((m = path.match(/^group\/manage\/communities\/(\w+)\/members$/))) {
      let all = (data.members[m[1]] || []).filter(match);
      if (q.sort === 'joined_at:desc') all = [...all].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
      const [limit, offset] = [Number(q.limit), Number(q.offset)];
      return reply(200, ok(all.slice(offset, offset + limit), { total: all.length, limit, offset, hasNextPage: offset + limit < all.length }));
    }
    if ((m = path.match(/^group\/groups\/(\w+)\/users$/)) && method === 'GET') {
      const all = (data.users[m[1]] || []).filter(match);
      const [limit, offset] = [Number(q.limit), Number(q.offset)];
      const page = all.slice(offset, offset + limit);
      const pick = (admin) => ({ data: page.filter((u) => !!u.isAdmin === admin), userCount: all.filter((u) => !!u.isAdmin === admin).length });
      return reply(200, ok({ groupAdmin: pick(true), groupMember: pick(false) }, { total: all.length, limit, offset, hasNextPage: offset + limit < all.length }));
    }
    if ((m = path.match(/^group\/groups\/(\w+)\/activity-logs$/))) {
      const all = (data.activity[m[1]] || []).filter((e) => !q.useCase || e.useCase === q.useCase);
      return reply(200, ok(all, { total: all.length, hasNextPage: false }));
    }
    // Đăng bài
    if (path === 'content/posts' && method === 'POST') return reply(201, ok({ id: `new${++data.postSeq}`, status: 'DRAFT' }));
    if ((m = path.match(/^content\/posts\/(\w+)\/(publish|schedule)$/)) && method === 'PUT') {
      if (data.failPublish) return reply(400, { code: 'api.validation_error', meta: { message: 'Content is invalid' } });
      return reply(200, ok({ id: m[1], status: m[2] === 'publish' ? 'PUBLISHED' : 'WAITING_SCHEDULE' }));
    }
    if (path.match(/^content\/posts\/\w+$/) && method === 'DELETE') return reply(200, ok(true));
    if ((m = path.match(/^content\/manage\/groups\/(\w+)\/contents\/scheduled$/))) return reply(200, ok({ list: data.scheduled[m[1]] || [], meta: { hasNextPage: false } }));
    if (path.match(/^content\/contents\/\w+\/reschedule$/) && method === 'PUT') return reply(200, ok(true));
    if (path.match(/^group\/groups\/\w+\/(users\/remove|assign-admin|revoke-admin)$/) && method === 'PUT') return reply(200, ok(true));
    if (path.match(/^group\/communities\/\w+\/users\/\w+\/ban$/) && method === 'POST') return reply(201, ok(true));
    if ((m = p.match(/^content\/contents\/(\w+)\/hide$/)) && method === 'POST') return reply(201, ok(true));
    if ((m = p.match(/^group\/groups\/(\w+)\/joining-requests\/(\w+)\/(approve|decline)$/)) && method === 'PUT') {
      const list = data.requests[m[1]] || [];
      const i = list.findIndex((r) => r.id === m[2]);
      if (i < 0) return reply(400, { code: 'api.validation_error', meta: { message: 'Join request not found' } });
      list.splice(i, 1);
      return reply(200, ok(true));
    }
    return reply(404, { code: 'not_found', meta: { message: 'No route ' + p } });
  };

  const storage = { settings: { ...BG.DEFAULT_SETTINGS, ...settings }, rules: { ...BG.DEFAULT_RULES, ...rules }, postRules: { ...BG.DEFAULT_POST_RULES, ...postRules } };
  const listeners = {};
  const ev = (name) => ({ addListener: (fn) => (listeners[name] = fn), removeListener: () => {} });
  const notifications = [];
  const badge = {};
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries([].concat(keys).filter((k) => k in storage).map((k) => [k, structuredClone(storage[k])]));
        },
        async set(o) {
          Object.assign(storage, structuredClone(o));
        },
      },
      onChanged: ev('storage'),
    },
    action: { setBadgeText: async ({ text }) => (badge.text = text), setBadgeBackgroundColor: async ({ color }) => (badge.color = color) },
    alarms: { get: async () => null, clear: async () => {}, create: () => {}, onAlarm: ev('alarm') },
    notifications: { create: (id, o) => notifications.push({ id, ...o }), clear: () => {}, onClicked: ev('notif') },
    tabs: {
      // Chưa đăng nhập: tab Beincom đang ở trang /login
      query: async () => [{ id: 5 }],
      get: async (id) => ({ id, status: 'complete', url: 'https://group.beincom.com/login' }),
      create: async () => ({ id: 6 }),
      remove: async () => {},
      onUpdated: ev('updated'),
    },
    scripting: { executeScript: async () => [{ result: { status: 401 } }] },
    runtime: { onMessage: ev('message'), onStartup: ev('startup'), onInstalled: ev('installed'), getURL: (p) => 'chrome-extension://x/' + p },
  };
  const ctx = vm.createContext({
    chrome,
    BG,
    fetch,
    importScripts() {},
    setTimeout: (fn) => setImmediate(fn),
    clearTimeout: () => {},
    console,
    structuredClone,
    URL,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), ctx);

  // structuredClone: đưa kết quả về realm của test để deepEqual so được
  const send = (msg) => new Promise((resolve) => listeners.message(msg, {}, (r) => resolve(structuredClone(r))));
  return { send, storage, calls, bodies, notifications, badge, data, listeners };
}

const scan = (env, source = 'dashboard') => env.send({ type: 'scan', source });

test('quét: gom group đang quản trị, yêu cầu, câu hỏi và bài chờ duyệt', async () => {
  const env = makeEnv();
  const state = await scan(env);
  assert.equal(state.lastResult.status, 'ok');
  assert.equal(state.lastResult.mode, 'direct');
  const gs = state.snapshot.groups;
  // gOther không có quyền quản trị -> bỏ; group có việc lên trước
  assert.deepEqual(gs.map((g) => g.id), ['gFood', 'gCL', 'gCLsub']);
  const food = gs[0];
  assert.equal(food.pendingTotal, 3);
  assert.equal(food.requests.length, 3);
  assert.deepEqual(food.questions, [{ id: 'q1', question: 'Bạn biết nhóm qua đâu?', isRequired: true }]);
  assert.equal(food.approvalCount, null); // không bật duyệt bài
  assert.equal(gs[1].approvalCount, 2); // group gốc Crypto Life bật duyệt bài
  assert.equal(gs[2].communityName, 'Crypto Life');
  // Không tải câu hỏi khi không có yêu cầu
  assert.ok(!env.calls.includes('GET group/groups/gCL/membership-questions'));
  // Huy hiệu = 3 yêu cầu + 2 bài
  assert.equal(env.badge.text, '5');
  // Lần quét đầu không thông báo
  assert.equal(env.notifications.length, 0);
  // Chỉ gọi GET
  assert.ok(env.calls.every((c) => c.startsWith('GET ')));
});

test('quét tự động lần sau: báo yêu cầu mới và bài chờ duyệt tăng', async () => {
  const env = makeEnv();
  await scan(env);
  env.data.requests.gCLsub.push(jr(9, { groupId: 'gCLsub' }));
  env.data.approvals.gCL.push(post('p3', 'Bài thứ ba'), post('p4', 'Bài thứ tư'));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup'); // nối sau lần quét tự động trong hàng đợi
  const ids = env.notifications.map((n) => n.id);
  assert.deepEqual(ids, ['bg-requests', 'bg-posts-cCL']);
  assert.match(env.notifications[0].title, /1 yêu cầu tham gia mới/);
  assert.equal(env.notifications[0].message, 'Crypto Life - General');
  assert.match(env.notifications[1].title, /4 bài chờ duyệt/);
});

test('chạy thử: duyệt chỉ ghi nhật ký, không gửi PUT', async () => {
  const env = makeEnv(); // dryRun mặc định bật
  await scan(env);
  const r = await env.send({ type: 'act', action: 'approve', groupId: 'gFood', requestIds: ['jr1', 'jr2'] });
  assert.equal(r.dryRun, true);
  assert.equal(r.dry, 2);
  assert.ok(!env.calls.some((c) => c.startsWith('PUT')));
  // Nhật ký: mới nhất trên cùng
  assert.deepEqual(env.storage.log.map((e) => [e.requestId, e.status, e.source, e.username]), [
    ['jr2', 'dry', 'manual', 'user2'],
    ['jr1', 'dry', 'manual', 'user1'],
  ]);
  assert.equal(env.storage.state.snapshot.groups[0].requests.length, 3);
});

test('duyệt và từ chối thật: gọi đúng API, cập nhật danh sách và huy hiệu', async () => {
  const env = makeEnv({ settings: { dryRun: false, actionDelaySec: 1 } });
  await scan(env);
  const a = await env.send({ type: 'act', action: 'approve', groupId: 'gFood', requestIds: ['jr1', 'jr2'] });
  assert.deepEqual([a.status, a.ok, a.failed], ['ok', 2, 0]);
  const d = await env.send({ type: 'act', action: 'decline', groupId: 'gFood', requestIds: ['jr3'] });
  assert.equal(d.ok, 1);
  assert.deepEqual(
    env.calls.filter((c) => c.startsWith('PUT')),
    ['PUT group/groups/gFood/joining-requests/jr1/approve', 'PUT group/groups/gFood/joining-requests/jr2/approve', 'PUT group/groups/gFood/joining-requests/jr3/decline'],
  );
  const food = env.storage.state.snapshot.groups.find((g) => g.id === 'gFood');
  assert.equal(food.requests.length, 0);
  assert.equal(food.pendingTotal, 0);
  assert.equal(env.badge.text, '2'); // còn 2 bài chờ duyệt
  assert.deepEqual(env.storage.log.map((e) => [e.requestId, e.action, e.status]), [
    ['jr3', 'decline', 'ok'],
    ['jr2', 'approve', 'ok'],
    ['jr1', 'approve', 'ok'],
  ]);
});

test('lỗi từ Beincom được ghi lại, yêu cầu vẫn còn trong danh sách', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  env.data.requests.gFood.splice(0, 1); // người khác đã duyệt jr1 trên web
  const r = await env.send({ type: 'act', action: 'approve', groupId: 'gFood', requestIds: ['jr1'] });
  assert.deepEqual([r.ok, r.failed, r.errors], [0, 1, ['Join request not found']]);
  assert.equal(env.storage.log[0].status, 'error');
  assert.equal(env.storage.state.snapshot.groups[0].requests.length, 3);
});

test('từ chối khi group không cho duyệt hoặc yêu cầu không còn', async () => {
  const env = makeEnv();
  await scan(env);
  const r1 = await env.send({ type: 'act', action: 'approve', groupId: 'gOther', requestIds: ['x'] });
  assert.equal(r1.status, 'error');
  const r2 = await env.send({ type: 'act', action: 'approve', groupId: 'gFood', requestIds: ['khong-co'] });
  assert.match(r2.message, /Không còn yêu cầu/);
  const r3 = await env.send({ type: 'act', action: 'xoa', groupId: 'gFood', requestIds: ['jr1'] });
  assert.match(r3.message, /không hợp lệ/);
});

test('tự xử lý sau khi quét: chỉ duyệt "Gợi ý duyệt", từ chối "Gợi ý từ chối", bỏ qua "Cần xem"', async () => {
  const env = makeEnv({ settings: { dryRun: false, autoApprove: true, autoDecline: true }, rules: { bannedKeywords: ['kiếm tiền'] } });
  // Lần quét do người dùng bấm vẫn tự xử lý (addon đang bật)
  await scan(env);
  assert.deepEqual(
    env.calls.filter((c) => c.startsWith('PUT')),
    ['PUT group/groups/gFood/joining-requests/jr1/approve', 'PUT group/groups/gFood/joining-requests/jr3/decline'],
  );
  const food = env.storage.state.snapshot.groups.find((g) => g.id === 'gFood');
  assert.deepEqual(food.requests.map((r) => r.id), ['jr2']);
  assert.ok(env.storage.log.every((e) => e.source === 'auto' && e.status === 'ok'));
});

test('tự xử lý khi chạy thử: mỗi yêu cầu chỉ ghi nhật ký một lần', async () => {
  // Không có từ khoá cấm: jr1 và jr3 đều đạt quy tắc, jr2 cần xem
  const env = makeEnv({ settings: { autoApprove: true } });
  await scan(env);
  await scan(env);
  assert.ok(!env.calls.some((c) => c.startsWith('PUT')));
  assert.deepEqual(env.storage.log.map((e) => [e.requestId, e.status]), [
    ['jr3', 'dry'],
    ['jr1', 'dry'],
  ]);
});

test('addon tắt: quét tự động không chạy, huy hiệu OFF', async () => {
  const env = makeEnv({ settings: { active: false } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await new Promise((r) => setImmediate(r));
  assert.equal(env.calls.length, 0);
  // Bấm tay vẫn quét được
  await scan(env);
  assert.ok(env.calls.length > 0);
  assert.equal(env.badge.text, 'OFF');
});

test('hết phiên đăng nhập: báo cần đăng nhập, huy hiệu "!"', async () => {
  const env = makeEnv({ loggedIn: false });
  env.listeners.alarm({ name: 'beingroup-scan' });
  const state = await scan(env, 'popup');
  assert.equal(state.lastResult.status, 'need_login');
  assert.equal(state.lastResult.mode, 'tab');
  assert.equal(env.badge.text, '!');
  assert.deepEqual(env.notifications.map((n) => n.id), ['bg-login']); // chỉ một lần trong ngày
});

test('tải nhiều trang yêu cầu tham gia (50 mỗi trang)', async () => {
  const data = fixture();
  data.requests.gFood = Array.from({ length: 120 }, (_, i) => jr(100 + i));
  const env = makeEnv({ data });
  const state = await scan(env);
  assert.equal(state.snapshot.groups[0].requests.length, 120);
  assert.equal(env.calls.filter((c) => c.includes('gFood/join-requests')).length, 3);
});

// ---------- Bài viết ----------

const RULES_LINK = { blockedDomains: ['t.me', 'bit.ly'] };

test('quét bài chờ duyệt: tải chi tiết để có nội dung đầy đủ, lần sau dùng lại', async () => {
  const env = makeEnv({ postRules: RULES_LINK });
  const state = await scan(env);
  const cl = state.snapshot.groups.find((g) => g.id === 'gCL');
  assert.equal(cl.approvalCount, 2);
  assert.deepEqual(cl.approvals.map((p) => [p.id, p.full]), [['p1', true], ['p2', true]]);
  // Link t.me nằm sau ký tự thứ 500: chỉ thấy nhờ nội dung đầy đủ
  assert.ok(cl.approvals[0].text.includes('t.me/lua'));
  assert.equal(BG.evaluatePost(cl.approvals[0], RULES_LINK).verdict, 'bad');
  assert.equal(BG.evaluatePost(cl.approvals[1], RULES_LINK).verdict, 'ok');
  const details = () => env.calls.filter((c) => /approval-contents\/p\d$/.test(c)).length;
  assert.equal(details(), 2);
  await scan(env);
  assert.equal(details(), 2); // không tải lại
});

test('quét bài mới: gộp bài đăng nhiều group, mới nhất trước, huy hiệu đếm bài vi phạm', async () => {
  const env = makeEnv({ postRules: RULES_LINK });
  const state = await scan(env);
  assert.deepEqual(state.recentPosts.map((p) => p.id), ['t1', 't2', 't3']);
  const t2 = state.recentPosts.find((p) => p.id === 't2');
  assert.deepEqual(t2.seenIn, ['gCL', 'gCLsub']);
  assert.equal(t2.media.images, 1);
  // 3 yêu cầu + 2 bài chờ duyệt + 1 bài vi phạm (t2 có bit.ly)
  assert.equal(env.badge.text, '6');
  assert.equal(env.notifications.length, 0); // lần đầu chỉ ghi nhận
  // Bài mới vi phạm ở lần quét tự động sau -> thông báo
  env.data.timeline.gCL.unshift(post('t4', 'Vào nhóm t.me/xyz nhận quà', { publishedAt: '2026-10-07T11:00:00Z' }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.deepEqual(env.notifications.map((n) => n.id), ['bg-flagged']);
  assert.match(env.notifications[0].title, /1 bài mới vi phạm/);
});

test('tắt quét bài mới thì không gọi timeline', async () => {
  const env = makeEnv({ settings: { scanPosts: false } });
  const state = await scan(env);
  assert.ok(!env.calls.some((c) => c.includes('content/timeline')));
  assert.equal(state.recentPosts, undefined);
});

test('duyệt và từ chối bài thật: gửi đúng body, bỏ khỏi hàng chờ, ghi nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const a = await env.send({ type: 'approvalAct', action: 'approve', groupId: 'gCL', contentIds: ['p2'] });
  assert.deepEqual([a.status, a.ok], ['ok', 1]);
  const r = await env.send({ type: 'approvalAct', action: 'reject', groupId: 'gCL', contentIds: ['p1'], reason: '  Có link lừa đảo ' });
  assert.equal(r.ok, 1);
  assert.deepEqual(env.bodies, [
    ['PUT content/contents/approval-contents/p2', { status: 'APPROVED' }],
    ['PUT content/contents/approval-contents/p1', { status: 'REJECTED', rejectionReason: { reason: 'Có link lừa đảo' } }],
  ]);
  const cl = env.storage.state.snapshot.groups.find((g) => g.id === 'gCL');
  assert.deepEqual([cl.approvals.length, cl.approvalCount], [0, 0]);
  const [last] = env.storage.log;
  assert.deepEqual([last.kind, last.action, last.status, last.contentId, last.reason, last.username], ['post', 'reject', 'ok', 'p1', 'Có link lừa đảo', 'tacgiap1']);
  assert.match(last.snippet, /^Chia sẻ kiến thức DeFi/);
});

test('duyệt bài khi chạy thử: không gửi PUT, bài vẫn trong hàng chờ', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'approvalAct', action: 'reject', groupId: 'gCL', contentIds: ['p1', 'p2'] });
  assert.deepEqual([r.dryRun, r.dry], [true, 2]);
  assert.ok(!env.calls.some((c) => c.startsWith('PUT')));
  assert.equal(env.storage.state.snapshot.groups.find((g) => g.id === 'gCL').approvals.length, 2);
});

test('ẩn bài: chỉ ẩn ở group mình quản trị, đánh dấu đã ẩn, không ẩn lại lần hai', async () => {
  const env = makeEnv({ settings: { dryRun: false }, postRules: RULES_LINK });
  await scan(env);
  assert.equal(env.badge.text, '6');
  const r = await env.send({ type: 'postAct', action: 'hide', contentIds: ['t2'], reasonType: 'SPAM' });
  assert.deepEqual([r.status, r.ok], ['ok', 1]);
  assert.deepEqual(env.bodies, [['POST content/contents/t2/hide', { reasonType: 'SPAM', groupIds: ['gCL', 'gCLsub'] }]]);
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't2').isHidden, true);
  assert.equal(env.badge.text, '5');
  assert.equal(env.storage.log[0].reason, 'Spam / quảng cáo');
  const again = await env.send({ type: 'postAct', action: 'hide', contentIds: ['t2'], reasonType: 'SPAM' });
  assert.equal(again.status, 'error');
  const bad = await env.send({ type: 'postAct', action: 'hide', contentIds: ['t1'], reasonType: 'XYZ' });
  assert.match(bad.message, /Lý do ẩn không hợp lệ/);
  // Lần quét sau vẫn giữ đánh dấu đã ẩn
  await scan(env);
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't2').isHidden, true);
});

test('bỏ qua bài: chỉ đánh dấu trong addon, không gọi API, giữ qua các lần quét', async () => {
  const env = makeEnv({ postRules: RULES_LINK });
  await scan(env);
  const before = env.calls.length;
  await env.send({ type: 'postAct', action: 'dismiss', contentIds: ['t2'] });
  assert.equal(env.calls.length, before);
  assert.equal(env.badge.text, '5');
  await scan(env);
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't2').dismissed, true);
  await env.send({ type: 'postAct', action: 'undismiss', contentIds: ['t2'] });
  assert.equal(env.badge.text, '6');
});

// ---------- Thành viên ----------

test('danh sách thành viên group gốc: có ngày vào, sắp xếp, tìm kiếm, đánh dấu admin group', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'members', groupId: 'gFood', offset: 0, limit: 2, sort: 'joined_at:desc' });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.items.map((u) => [u.username, u.joinedAt.slice(0, 10), u.isAdmin, u.isCommunityAdmin]), [
    ['user32', '2026-10-07', false, false],
    ['user33', '2026-10-05', true, true],
  ]);
  assert.deepEqual([r.total, r.hasNext, r.nextOffset], [3, true, 2]);
  assert.deepEqual(r.adminIds, ['u33']);
  assert.ok(env.calls.includes('GET group/manage/communities/cFood/members?limit=2&offset=0&sort=joined_at%3Adesc'));
  // Trang sau không tải lại danh sách admin
  const r2 = await env.send({ type: 'members', groupId: 'gFood', offset: 2, limit: 2, sort: 'joined_at:desc' });
  assert.deepEqual([r2.items.map((u) => u.username), r2.adminIds, r2.hasNext], [['user31'], null, false]);
  // Tìm kiếm theo tên
  const s = await env.send({ type: 'members', groupId: 'gFood', key: 'nguyên', offset: 0, limit: 50 });
  assert.deepEqual(s.items.map((u) => u.fullname), ['Trần Nguyên']);
});

test('danh sách thành viên group con: admin trước, có Premium', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'members', groupId: 'gCLsub', offset: 0, limit: 50 });
  assert.deepEqual(r.items.map((u) => [u.username, u.isAdmin, u.premium, u.joinedAt]), [
    ['user41', true, false, null],
    ['user42', false, false, null],
    ['user43', false, true, null],
  ]);
  const bad = await env.send({ type: 'members', groupId: 'khong-co' });
  assert.equal(bad.status, 'error');
});

test('nhật ký vào / rời: nhãn tiếng Việt, người liên quan và người thực hiện', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'activity', groupId: 'gCLsub', page: 1 });
  assert.deepEqual(r.items.map((a) => [a.label, a.kind, a.user.username, a.actor?.username ?? null, a.change]), [
    ['Vào group', 'in', 'user42', null, ''],
    ['Được gán admin group', 'role', 'user43', 'user41', 'MEMBER → GROUP_ADMIN'],
    ['Rời group', 'out', 'user44', null, ''],
  ]);
  const left = await env.send({ type: 'activity', groupId: 'gCLsub', page: 1, useCase: 'leave.group' });
  assert.deepEqual(left.items.map((a) => a.id), ['e3']);
  assert.ok(env.calls.includes('GET group/groups/gCLsub/activity-logs?limit=50&page=1&sort=desc&useCase=leave.group'));
});

test('xoá, gán admin, cấm thật: đúng API và body snake_case, ghi nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const u = { id: 'u31', username: 'user31', fullname: 'Người 31' };
  const rm = await env.send({ type: 'memberAct', action: 'remove', groupId: 'gFood', users: [u, { id: 'u32', username: 'user32' }] });
  assert.deepEqual([rm.status, rm.ok, rm.done], ['ok', 2, ['u31', 'u32']]);
  await env.send({ type: 'memberAct', action: 'assignAdmin', groupId: 'gFood', users: [u] });
  await env.send({ type: 'memberAct', action: 'revokeAdmin', groupId: 'gFood', users: [u] });
  await env.send({ type: 'memberAct', action: 'ban', groupId: 'gFood', users: [u], reason: 'SPAM' });
  assert.deepEqual(env.bodies, [
    ['PUT group/groups/gFood/users/remove', { user_ids: ['u31'] }],
    ['PUT group/groups/gFood/users/remove', { user_ids: ['u32'] }],
    ['PUT group/groups/gFood/assign-admin', { user_id: 'u31' }],
    ['PUT group/groups/gFood/revoke-admin', { user_id: 'u31' }],
    ['POST group/communities/cFood/users/u31/ban', { reason: 'SPAM' }],
  ]);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action, env.storage.log[0].reason], ['manage', 'ban', 'Spam']);
});

test('quyền và chạy thử khi quản lý thành viên', async () => {
  const env = makeEnv();
  await scan(env);
  const u = { id: 'u42', username: 'user42' };
  // gCLsub không có quyền gán admin, Crypto Life không có quyền cấm (chỉ admin group)
  assert.match((await env.send({ type: 'memberAct', action: 'assignAdmin', groupId: 'gCLsub', users: [u] })).message, /không có quyền gán admin/);
  assert.match((await env.send({ type: 'memberAct', action: 'ban', groupId: 'gCL', users: [u] })).message, /admin community/);
  assert.match((await env.send({ type: 'memberAct', action: 'ban', groupId: 'gFood', users: [u], reason: 'XYZ' })).message, /Lý do cấm/);
  assert.match((await env.send({ type: 'memberAct', action: 'xoa', groupId: 'gFood', users: [u] })).message, /không hợp lệ/);
  // Chạy thử: ghi nhật ký, không gọi API
  const r = await env.send({ type: 'memberAct', action: 'remove', groupId: 'gFood', users: [u] });
  assert.deepEqual([r.dryRun, r.dry, r.done], [true, 1, []]);
  assert.ok(!env.calls.some((c) => c.startsWith('PUT') || c.startsWith('POST')));
});

// ---------- Đăng bài / hẹn giờ ----------

const writes = (env) => env.calls.filter((c) => !c.startsWith('GET'));

test('đăng ngay: tạo nháp rồi publish với body giống web, ghi nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'compose', groupIds: ['gCL', 'gCLsub'], content: '  **Thông báo**\nHọp cộng đồng tối nay  ', setting: { canComment: false } });
  assert.deepEqual([r.status, r.ok, r.contentId, r.postStatus], ['ok', 1, 'new1', 'PUBLISHED']);
  assert.deepEqual(env.bodies, [
    ['POST content/posts', { audience: { groupIds: ['gCL', 'gCLsub'] }, isEnableDonation: false }],
    [
      'PUT content/posts/new1/publish',
      {
        audience: { groupIds: ['gCL', 'gCLsub'], userIds: [] },
        content: '**Thông báo**\nHọp cộng đồng tối nay',
        media: { images: [], videos: [], files: [] },
        setting: { canComment: false, canReact: true, isImportant: false, importantExpiredAt: null },
        mentions: {},
        tags: [],
        series: [],
      },
    ],
  ]);
  const [e] = env.storage.log;
  assert.deepEqual([e.kind, e.action, e.status, e.contentId, e.message, e.groupName], ['compose', 'publish', 'ok', 'new1', 'Đã đăng', 'Crypto Life, Crypto Life - General']);
});

test('hẹn giờ: gửi scheduledAt ISO; giờ trong quá khứ hoặc quá dài thì không gọi API', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const at = new Date(Date.now() + 3 * 3600e3);
  const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Hẹn giờ', scheduledAt: at.toISOString() });
  assert.deepEqual([r.ok, r.postStatus], [1, 'WAITING_SCHEDULE']);
  assert.equal(env.bodies[1][0], 'PUT content/posts/new1/schedule');
  assert.equal(env.bodies[1][1].scheduledAt, at.toISOString());
  assert.equal(env.storage.log[0].message, 'Chờ tới giờ đăng');
  const before = writes(env).length;
  const past = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'x', scheduledAt: new Date(Date.now() + 60e3).toISOString() });
  assert.match(past.message, /ít nhất 5 phút/);
  const long = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'a'.repeat(3001) });
  assert.match(long.message, /tối đa 3000/);
  const none = await env.send({ type: 'compose', groupIds: [], content: 'x' });
  assert.match(none.message, /Chưa chọn group/);
  const unknown = await env.send({ type: 'compose', groupIds: ['gOther'], content: 'x' });
  assert.match(unknown.message, /quét lại/);
  assert.equal(writes(env).length, before);
});

test('đăng lỗi: xoá bản nháp vừa tạo, ghi lỗi', async () => {
  const data = fixture();
  data.failPublish = true;
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Bài lỗi' });
  assert.deepEqual([r.status, r.failed, r.errors], ['error', 1, ['Đăng bài lỗi: Content is invalid']]);
  assert.deepEqual(writes(env), ['POST content/posts', 'PUT content/posts/new1/publish', 'DELETE content/posts/new1']);
  assert.equal(env.storage.log[0].status, 'error');
});

test('chạy thử khi đăng bài: không gọi API, ghi nhật ký', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Thử' });
  assert.deepEqual([r.dryRun, r.dry], [true, 1]);
  assert.equal(writes(env).length, 0);
  assert.deepEqual([env.storage.log[0].status, env.storage.log[0].snippet], ['dry', 'Thử']);
});

test('bài đã hẹn giờ: liệt kê theo giờ, đổi giờ và huỷ', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const list = await env.send({ type: 'scheduled' });
  assert.deepEqual(list.items.map((p) => [p.id, p.status, p.communityName]), [
    ['s1', 'WAITING_SCHEDULE', 'Crypto Life'],
    ['s2', 'WAITING_SCHEDULE', 'Crypto Life'],
  ]);
  assert.ok(env.calls.includes('GET content/manage/groups/gFood/contents/scheduled?limit=50&type=POST'));
  const at = new Date(Date.now() + 86400e3).toISOString();
  const r1 = await env.send({ type: 'scheduleAct', action: 'reschedule', contentId: 's1', scheduledAt: at, snippet: 'Bài hẹn giờ trước' });
  assert.equal(r1.ok, 1);
  const r2 = await env.send({ type: 'scheduleAct', action: 'cancel', contentId: 's2' });
  assert.equal(r2.ok, 1);
  assert.deepEqual(writes(env), ['PUT content/contents/s1/reschedule', 'DELETE content/posts/s2']);
  assert.deepEqual(env.bodies, [['PUT content/contents/s1/reschedule', { scheduledAt: at }]]);
  assert.deepEqual(env.storage.log.map((e) => [e.kind, e.action, e.status]), [['compose', 'cancel', 'ok'], ['compose', 'reschedule', 'ok']]);
  const bad = await env.send({ type: 'scheduleAct', action: 'reschedule', contentId: 's1', scheduledAt: new Date().toISOString() });
  assert.match(bad.message, /ít nhất 5 phút/);
});

// ---------- Tải lại từng phần ----------

test('tải lại phần group: chỉ đọc group, yêu cầu tham gia, số bài chờ duyệt; giữ bài viết và hàng chờ duyệt', async () => {
  const env = makeEnv({ postRules: { blockedDomains: ['bit.ly'] } });
  await scan(env);
  const before = env.storage.state;
  env.data.requests.gCLsub.push(jr(9, { groupId: 'gCLsub' }));
  env.data.groups.gCL.userCount = 12010;
  env.calls.length = 0;
  const r = await env.send({ type: 'refresh', part: 'groups' });
  assert.deepEqual([r.status, r.part], ['ok', 'groups']);
  // Không đọc timeline, danh sách / chi tiết bài chờ duyệt, tài khoản
  assert.ok(env.calls.some((c) => c.includes('gCLsub/join-requests')));
  assert.ok(env.calls.some((c) => c.includes('approval-contents/count')));
  assert.ok(!env.calls.some((c) => c.includes('content/timeline') || /approval-contents(\?|\/p)/.test(c) || c.includes('user/me/profile')));
  const s = env.storage.state;
  assert.equal(s.snapshot.groups.find((g) => g.id === 'gCLsub').pendingTotal, 1);
  assert.equal(s.snapshot.groups.find((g) => g.id === 'gCL').userCount, 12010);
  assert.deepEqual(s.snapshot.groups.find((g) => g.id === 'gCL').approvals.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(s.recentPosts, before.recentPosts);
  assert.equal(s.lastScan, before.lastScan); // giờ quét toàn bộ giữ nguyên
  assert.ok(s.knownRequestIds.includes('jr9'));
  assert.equal(env.notifications.length, 0); // tải lại không báo
  assert.equal(env.badge.text, '7'); // 4 yêu cầu + 2 bài chờ duyệt + 1 bài vi phạm
});

test('tải lại phần nội dung: chỉ đọc bài chờ duyệt và bài mới, giữ đánh dấu bỏ qua', async () => {
  const env = makeEnv();
  await scan(env);
  await env.send({ type: 'postAct', action: 'dismiss', contentIds: ['t1'] });
  env.data.approvals.gCL.push(post('p3', 'Bài chờ mới'));
  env.data.timeline.gCL.unshift(post('t7', 'Bài vừa đăng', { publishedAt: '2026-10-07T12:00:00Z' }));
  env.calls.length = 0;
  const r = await env.send({ type: 'refresh', part: 'content' });
  assert.equal(r.status, 'ok');
  assert.ok(!env.calls.some((c) => c.includes('join-requests') || c.includes('group/groups/gCL ') || c.endsWith('group/groups/gCL')));
  assert.ok(env.calls.some((c) => c.includes('content/timeline/gCL')));
  const s = env.storage.state;
  const cl = s.snapshot.groups.find((g) => g.id === 'gCL');
  assert.deepEqual([cl.approvalCount, cl.approvals.map((p) => p.id)], [3, ['p1', 'p2', 'p3']]);
  assert.equal(s.recentPosts[0].id, 't7');
  assert.equal(s.recentPosts.find((p) => p.id === 't1').dismissed, true);
});

test('tải lại khi chưa quét lần nào thì quét toàn bộ; phần lạ bị từ chối', async () => {
  const env = makeEnv();
  const state = await env.send({ type: 'refresh', part: 'content' });
  assert.equal(state.snapshot.groups.length, 3);
  assert.ok(env.calls.includes('GET user/me/profile'));
  const bad = await env.send({ type: 'refresh', part: 'xyz' });
  assert.match(bad.message, /không hợp lệ/);
});

// ---------- Xoá bài của mình ----------

test('nhận ra tài khoản đang đăng nhập (gọi không kèm header phiên bản) và chỉ xoá bài của mình', async () => {
  const data = fixture();
  data.timeline.gCL.push(post('t9', 'Bài của Kai', { actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto' } }));
  const env = makeEnv({ data, settings: { dryRun: false } });
  const state = await scan(env);
  assert.deepEqual(state.me, { id: 'me1', username: 'kai', fullname: 'Kai Crypto' });
  assert.equal(data.meHeaders['x-version-id'], undefined);
  // Bài người khác: không xoá được
  const other = await env.send({ type: 'postAct', action: 'delete', contentIds: ['t1'] });
  assert.match(other.message, /Chỉ xoá được bài của chính bạn/);
  const r = await env.send({ type: 'postAct', action: 'delete', contentIds: ['t9'] });
  assert.deepEqual([r.status, r.ok], ['ok', 1]);
  assert.deepEqual(writes(env), ['DELETE content/posts/t9']);
  assert.ok(!env.storage.state.recentPosts.some((p) => p.id === 't9'));
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action], ['post', 'delete']);
});

// ---------- Thống kê ----------

test('quét ghi lại số thành viên mỗi ngày của từng group', async () => {
  const env = makeEnv();
  const state = await scan(env);
  const today = BG.vnDay();
  assert.deepEqual(state.memberHistory.gCL, [{ day: today, count: 12000 }]);
  env.data.groups.gCL.userCount = 12005;
  const s2 = await scan(env);
  assert.deepEqual(s2.memberHistory.gCL, [{ day: today, count: 12005 }]); // cùng ngày: ghi đè
});

test('thống kê chủ community: dùng số liệu chính thức, vẫn đọc timeline', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'stats', groupId: 'gFood', days: 7 });
  assert.equal(r.status, 'ok');
  assert.equal(r.officialMembers.length, 2);
  assert.equal(r.officialPosts.length, 1);
  assert.equal(r.activity.length, 0); // có số liệu chính thức thì không đọc nhật ký
  assert.ok(env.calls.some((c) => c.startsWith('GET group/manage/communities/cFood/stats/member-count?from=')));
  assert.ok(env.calls.some((c) => c.startsWith('GET content/stats/communities/gFood/contents/daily-counts?from=')));
});

test('thống kê admin group: tự tính từ nhật ký và timeline (gộp group con), có lịch sử thành viên', async () => {
  const data = fixture();
  const recentIso = new Date(Date.now() - 3600e3).toISOString();
  data.timeline.gCL = [post('t1', 'Mới', { publishedAt: recentIso, reactionsCount: { like: 3 }, commentsCount: 2 }), post('t0', 'Cũ', { publishedAt: '2020-01-01T00:00:00Z' })];
  data.timeline.gCLsub = [post('t1', 'Mới', { publishedAt: recentIso, audience: { groups: [CL, CLsub] } }), post('t5', 'Group con', { publishedAt: recentIso, audience: { groups: [CLsub] } })];
  data.activity.gCL = [
    { id: 'a1', eventTime: recentIso, useCase: 'join.community.as_member', data: { actor: user(1) } },
    { id: 'a2', eventTime: recentIso, useCase: 'leave.group', data: { actor: user(2) } },
    { id: 'a3', eventTime: '2020-01-01T00:00:00Z', useCase: 'join.community.as_member', data: { actor: user(3) } },
  ];
  const env = makeEnv({ data });
  await scan(env);
  const r = await env.send({ type: 'stats', groupId: 'gCL', days: 30 });
  assert.deepEqual([r.officialMembers, r.officialPosts], [null, null]);
  assert.deepEqual(r.posts.map((p) => p.id).sort(), ['t1', 't5']); // bỏ bài cũ, gộp bài trùng
  assert.equal(r.posts.find((p) => p.id === 't1').reactions, 3);
  assert.deepEqual(r.activity.map((a) => a.id), ['a1', 'a2']);
  assert.equal(r.history.length, 1);
  assert.equal(r.userCount, 12000);
  const s = BG.buildStats({ days: 30, ...r });
  assert.deepEqual([s.totals.posts, s.totals.joined, s.totals.left, s.totals.reactions, s.totals.comments], [2, 1, 1, 3, 2]);
  assert.deepEqual(s.sources, { members: 'history', joinLeave: 'activity', posts: 'timeline' });
  assert.equal(s.topPosts[0].id, 't1');
});
