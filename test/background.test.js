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
    // Tag theo group gốc (Crypto Life có 30 tag: 2 trang), series theo group
    tags: { gFood: [{ id: 'tF1', name: 'AMA', totalUsed: 3 }], gCL: Array.from({ length: 30 }, (_, i) => ({ id: 'tC' + i, name: 'TAG ' + i, totalUsed: i })) },
    series: { gFood: [{ id: 'sF1', title: 'Lịch sự kiện', coverMedia: { url: 'https://media.beincom.com/c1' }, summary: 'Các sự kiện' }], gCLsub: [{ id: 'sC1', title: 'Nhập môn crypto', coverMedia: null }] },
    reports: {
      gFood: [
        { id: 'rp1', targetId: 'c1', targetType: 'COMMENT', commentPostId: 'p77', content: 'Bình luận spam', targetActor: user(61), reasonsCount: [{ reasonType: 'SPAM', total: 3 }], status: 'CREATED', createdAt: '2026-10-08T01:00:00Z' },
        { id: 'rp2', targetId: 'p88', targetType: 'POST', content: 'Bài lừa đảo', targetActor: user(62), reasonsCount: [{ reasonType: 'ILLEGAL', total: 1 }, { reasonType: 'OTHERS', total: 1, description: 'lừa đảo' }], status: 'CREATED' },
      ],
    },
    flagged: { gCL: [post('f1', 'Nội dung bạo lực', { audience: { groups: [CL, CLsub] }, postScan: { dataViolation: { violatedCategories: [{ name: 'Violence' }, { name: 'Hate' }] } } })] },
    hidden: { gCL: [post('h1', 'Bài đã ẩn')] },
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
  const headers = {};
  const fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const p = url.replace(API, '');
    calls.push(`${method} ${p}`);
    if (opts.body) bodies.push([`${method} ${p}`, JSON.parse(opts.body)]);
    headers[`${method} ${p}`] = opts.headers;
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
      if (Number(m[2]) > 25) return reply(400, { code: 'api.validation_error', meta: { message: 'Bad Request Exception', errors: ['limit must not be greater than 25'] } });
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
    if (path.startsWith('content/') && Number(q.limit) > 25) return reply(400, { code: 'api.validation_error', meta: { message: 'Bad Request Exception', errors: ['limit must not be greater than 25'] } });
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
    // Báo cáo vi phạm
    if ((m = path.match(/^content\/manage\/communities\/(\w+)\/content-reports$/))) {
      // Giả lập API treo: chỉ trả lời khi bị huỷ vì quá thời gian chờ
      if (data.reportsHang) return new Promise((_, reject) => opts.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      return reply(200, ok({ list: data.reports[m[1]] || [], meta: { hasNextPage: false } }));
    }
    if ((m = path.match(/^content\/manage\/communities\/(\w+)\/content-reports\/(\w+)$/)) && method === 'GET') {
      return reply(200, ok({ reasonsCount: [{ reasonType: 'SPAM', total: 2, reporters: [user(51), user(52)] }] }));
    }
    if (path.match(/^content\/manage\/communities\/\w+\/content-reports\/\w+\/status$/) && method === 'PUT') return reply(200, ok(true));
    if ((m = path.match(/^content\/manage\/groups\/(\w+)\/contents\/(flagged|hidden)$/))) return reply(200, ok({ list: data[m[2]][m[1]] || [], meta: { hasNextPage: false } }));
    // Tag và series
    const all = new URLSearchParams(query);
    if (path === 'content/tags' || path === 'content/series') {
      const kind = path.split('/')[1];
      const list = all.getAll('groupIds[]').flatMap((id) => data[kind][id] || []);
      const offset = Number(q.offset || 0);
      return reply(200, ok({ list: list.slice(offset, offset + 25), meta: { limit: 25, offset, total: list.length } }));
    }
    if (path === 'content/contents/validate-series-tags' && method === 'POST') {
      const b = JSON.parse(opts.body);
      const tagIds = b.tags.filter((id) => id.startsWith('tBad'));
      const seriesIds = b.series.filter((id) => id.startsWith('sBad'));
      if (tagIds.length || seriesIds.length) return reply(400, { code: 'tag_series_invalid', meta: { message: 'Invalid', errors: { tagIds, seriesIds } } });
      return reply(201, ok(true));
    }
    // Nhắc tên và xem trước link
    if (path === 'user/users/mentionable') {
      const ids = (q.group_ids || '').split(',');
      const all = [{ id: 'u61', username: 'kai', fullname: 'Kai', avatar: '', is_verified: true }, { id: 'u62', username: 'lan', fullname: 'Lan', avatar: '', is_verified: false }];
      return reply(200, { code: 'api.ok', data: ids.includes('gFood') ? all.filter((u) => !q.key || u.username.includes(q.key)) : [], meta: { total: 2 } });
    }
    if (path === 'group/url-metadata') {
      if (q.url.includes('loi')) return reply(400, { code: 'api.validation_error', meta: { message: 'Cannot fetch url' } });
      return reply(200, ok({ url: q.url, domain: 'Ví dụ', title: 'Trang ví dụ', image: 'https://vd.vn/a.png', description: 'Mô tả', publisher: 'Ví dụ' }));
    }
    if ((m = path.match(/^content\/contents\/(\w+)\/link-preview$/))) return reply(200, ok({ url: 'https://group.beincom.com/posts/' + m[1], domain: 'Beincom', title: 'Bài trên Beincom', image: '', description: '' }));
    // Tải file lên
    if ((m = path.match(/^upload\/(images|videos)\/$/)) && method === 'POST') return reply(201, ok({ id: `up-${m[1]}`, presigned_post: { url: 'https://bucket.s3.amazonaws.com/', fields: { key: 'k', Policy: 'p' } } }));
    if (path === 'upload/files/' && method === 'POST') return reply(201, ok({ id: 'up-file' }));
    if ((m = path.match(/^upload\/(images|videos)\/([\w-]+)$/)) && method === 'GET') {
      if (data.uploadWaitHang) return new Promise((_, reject) => opts.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      return reply(200, ok(data.uploadResult || { url: 'https://media.beincom.com/' + m[2], status: 'DONE', properties: { width: 800, height: 600, mime_type: 'image/png' } }));
    }
    // Đăng bài
    if (path === 'content/posts' && method === 'POST') return reply(201, ok({ id: `new${++data.postSeq}`, status: 'DRAFT' }));
    if ((m = path.match(/^content\/posts\/(\w+)\/(publish|schedule)$/)) && method === 'PUT') {
      if (data.failPublish) return reply(400, { code: 'api.validation_error', meta: { message: 'Content is invalid' } });
      return reply(200, ok({ id: m[1], status: m[2] === 'publish' ? 'PUBLISHED' : 'WAITING_SCHEDULE' }));
    }
    const goneReply = () => reply(400, { code: 'content.not_found', meta: { message: 'Content not found' } });
    if ((m = path.match(/^content\/posts\/(\w+)$/)) && method === 'DELETE') return m[1].startsWith('gone') ? goneReply() : reply(200, ok(true));
    if ((m = path.match(/^content\/contents\/(gone\w*)\/(hide|reschedule)$/))) return goneReply();
    if ((m = path.match(/^content\/manage\/groups\/(\w+)\/contents\/scheduled$/))) {
      const all = data.scheduled[m[1]] || [];
      const start = Number(q.after || 0);
      const list = all.slice(start, start + Number(q.limit));
      const more = start + list.length < all.length;
      return reply(200, ok({ list, meta: { hasNextPage: more, endCursor: more ? String(start + list.length) : null } }));
    }
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
  const tabsCreated = [];
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
      create: async (o) => (tabsCreated.push(o?.url), { id: 6 }),
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
    AbortController,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), ctx);

  // structuredClone: đưa kết quả về realm của test để deepEqual so được
  const send = (msg) => new Promise((resolve) => listeners.message(msg, {}, (r) => resolve(structuredClone(r))));
  return { send, storage, calls, bodies, headers, notifications, tabsCreated, badge, data, listeners };
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
  // Huy hiệu = 3 yêu cầu + 2 bài + 2 báo cáo chờ xử lý (Food Research) + 1 bài Beincom gắn cờ (Crypto Life)
  assert.equal(env.badge.text, '8');
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
  assert.equal(env.badge.text, '5'); // còn 2 bài chờ duyệt + 2 báo cáo + 1 bài gắn cờ
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
  // 3 yêu cầu + 2 bài chờ duyệt + 1 bài vi phạm (t2 có bit.ly) + 2 báo cáo + 1 bài gắn cờ
  assert.equal(env.badge.text, '9');
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
  assert.equal(env.badge.text, '9'); // như trên: 6 + 2 báo cáo + 1 bài gắn cờ
  const r = await env.send({ type: 'postAct', action: 'hide', contentIds: ['t2'], reasonType: 'SPAM' });
  assert.deepEqual([r.status, r.ok], ['ok', 1]);
  assert.deepEqual(env.bodies, [['POST content/contents/t2/hide', { reasonType: 'SPAM', groupIds: ['gCL', 'gCLsub'] }]]);
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't2').isHidden, true);
  assert.equal(env.badge.text, '8');
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
  assert.equal(env.badge.text, '8');
  await scan(env);
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't2').dismissed, true);
  await env.send({ type: 'postAct', action: 'undismiss', contentIds: ['t2'] });
  assert.equal(env.badge.text, '9');
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
  assert.deepEqual(list.items[0].setting, { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null }); // có đủ dữ liệu để xem lại bài
  assert.ok(env.calls.includes('GET content/manage/groups/gFood/contents/scheduled?limit=25&type=POST'));
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
  assert.equal(env.badge.text, '10'); // 4 yêu cầu + 2 bài chờ duyệt + 1 bài vi phạm + 2 báo cáo + 1 bài gắn cờ (giữ từ lần quét trước)
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

// ---------- Báo cáo vi phạm ----------

test('báo cáo của người dùng: chủ community đọc được, có lý do và số lượt; admin group bị chặn', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'reports', groupId: 'gFood', kind: 'reported' });
  assert.deepEqual([r.status, r.timedOut], ['ok', false]);
  assert.deepEqual(r.items.map((x) => [x.id, x.targetType, x.total, x.reasons.map((y) => y.label).join('+'), x.actor.username]), [
    ['rp1', 'COMMENT', 3, 'Spam / quảng cáo', 'user61'],
    ['rp2', 'POST', 2, 'Vi phạm pháp luật+Lý do khác', 'user62'],
  ]);
  assert.equal(BG.reportUrl(r.items[0]), 'https://group.beincom.com/posts/p77');
  env.calls.length = 0;
  const cl = await env.send({ type: 'reports', groupId: 'gCL', kind: 'reported' });
  assert.deepEqual([cl.status, cl.code], ['error', 'not_admin']);
  assert.ok(!env.calls.some((c) => c.includes('content-reports'))); // không gọi API khi biết chắc không có quyền
});

test('API báo cáo treo: dừng theo giới hạn chờ và báo timedOut thay vì treo addon', async () => {
  const data = fixture();
  data.reportsHang = true;
  const env = makeEnv({ data });
  await scan(env);
  const r = await env.send({ type: 'reports', groupId: 'gFood', kind: 'reported' });
  assert.deepEqual([r.status, r.timedOut, r.items], ['ok', true, []]);
});

test('chi tiết báo cáo: người báo cáo theo từng lý do', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'reportDetail', groupId: 'gFood', reportId: 'rp1' });
  assert.deepEqual(r.reasons.map((x) => [x.label, x.total, x.reporters.map((p) => p.username)]), [['Spam / quảng cáo', 2, ['user51', 'user52']]]);
});

test('xử lý báo cáo: bỏ qua / ẩn gửi đúng body, ghi nhật ký; chạy thử không gửi', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const it = (id, type = 'POST') => ({ targetId: id, targetType: type, snippet: 'x', actor: { id: 'u61', username: 'user61', fullname: 'N' } });
  const a = await env.send({ type: 'reportAct', action: 'ignore', groupId: 'gFood', items: [it('c1', 'COMMENT')] });
  const b = await env.send({ type: 'reportAct', action: 'hide', groupId: 'gFood', items: [it('p88')] });
  assert.deepEqual([a.ok, b.ok, b.done], [1, 1, ['p88']]);
  assert.deepEqual(env.bodies, [
    ['PUT content/manage/communities/gFood/content-reports/c1/status', { status: 'IGNORED' }],
    ['PUT content/manage/communities/gFood/content-reports/p88/status', { status: 'HID' }],
  ]);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action, env.storage.log[1].targetType], ['report', 'hide', 'COMMENT']);
  // Admin group không xử lý được báo cáo cấp community
  assert.match((await env.send({ type: 'reportAct', action: 'ignore', groupId: 'gCL', items: [it('x')] })).message, /chủ \/ admin community/);
  // Chạy thử
  const dry = makeEnv();
  await scan(dry);
  const d = await dry.send({ type: 'reportAct', action: 'hide', groupId: 'gFood', items: [it('p88')] });
  assert.deepEqual([d.dryRun, d.dry], [true, 1]);
  assert.ok(!dry.calls.some((c) => c.startsWith('PUT')));
});

test('gắn cờ tự động: admin group xem được, có danh mục vi phạm; ẩn bài ở các group mình quản trị', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const f = await env.send({ type: 'reports', groupId: 'gCL', kind: 'flagged' });
  assert.deepEqual(f.items.map((p) => [p.id, p.violations]), [['f1', ['Violence', 'Hate']]]);
  const h = await env.send({ type: 'reports', groupId: 'gCL', kind: 'hidden' });
  assert.deepEqual(h.items.map((p) => p.id), ['h1']);
  const p = f.items[0];
  const r = await env.send({ type: 'reportAct', action: 'hidePost', groupId: 'gCL', reasonType: 'VIOLENT_OR_PORN', items: [{ targetId: p.id, targetType: p.type, snippet: p.text, actor: p.actor, groups: p.groups }] });
  assert.equal(r.ok, 1);
  assert.deepEqual(env.bodies.at(-1), ['POST content/contents/f1/hide', { reasonType: 'VIOLENT_OR_PORN', groupIds: ['gCL', 'gCLsub'] }]);
  assert.equal(env.storage.log[0].reason, 'Bạo lực, khiêu dâm');
});

// ---------- Quét báo cáo định kỳ ----------

const groupOf = (env, id) => env.storage.state.snapshot.groups.find((g) => g.id === id);
// Chờ các việc đang xếp hàng (đồng bộ số báo cáo) chạy xong: gửi một lệnh xếp hàng không làm gì
const flush = (env) => env.send({ type: 'refresh', part: 'none' });

test('quét báo cáo: đếm báo cáo chờ xử lý (chỉ community mình làm admin) và bài Beincom gắn cờ', async () => {
  const data = fixture();
  data.reports.gFood.push({ id: 'rp3', targetId: 'p5', targetType: 'POST', content: 'đã xử lý', targetActor: user(63), reasonsCount: [], status: 'IGNORED' });
  const env = makeEnv({ data });
  await scan(env);
  assert.deepEqual(groupOf(env, 'gFood').reportIds, ['rp1', 'rp2']); // bỏ báo cáo đã xử lý
  assert.deepEqual(['gFood', 'gCL', 'gCLsub'].map((id) => groupOf(env, id).flaggedIds), [[], ['f1'], []]);
  assert.equal(groupOf(env, 'gCL').reportIds, undefined); // admin group: không gọi API báo cáo
  assert.deepEqual(env.calls.filter((c) => c.includes('content-reports')), ['GET content/manage/communities/gFood/content-reports?limit=25']);
  assert.ok(env.calls.includes('GET content/manage/groups/gCLsub/contents/flagged?limit=20'));
  assert.ok(env.calls.every((c) => c.startsWith('GET ')));
  assert.equal(env.notifications.length, 0); // lần đầu chỉ ghi nhận
});

test('quét báo cáo lần sau: báo báo cáo mới và bài mới bị gắn cờ; bấm thông báo mở tab Báo cáo', async () => {
  const env = makeEnv();
  await scan(env);
  env.data.reports.gFood.unshift({ id: 'rp9', targetId: 'p9', targetType: 'POST', content: 'mới', targetActor: user(64), reasonsCount: [{ reasonType: 'SPAM', total: 1 }], status: 'CREATED' });
  env.data.flagged.gCLsub = [post('f2', 'Mới bị gắn cờ', { audience: { groups: [CLsub] } }), env.data.flagged.gCL[0]];
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.deepEqual(env.notifications.map((n) => [n.id, n.title, n.message]), [
    ['bg-reports', 'BeinGroup: 1 báo cáo vi phạm mới', 'Food Research'],
    ['bg-autoflag', 'BeinGroup: 1 bài bị Beincom gắn cờ vi phạm', 'Crypto Life - General'], // f1 đã biết
  ]);
  assert.equal(env.badge.text, '10'); // 3 yêu cầu + 2 bài chờ duyệt + 3 báo cáo + 2 bài gắn cờ (f1 ở 2 group đếm một lần)
  env.listeners.notif('bg-reports');
  env.listeners.notif('bg-requests');
  assert.deepEqual(env.tabsCreated, ['chrome-extension://x/dashboard.html#tab=reports', 'chrome-extension://x/dashboard.html#tab=members']);
});

test('quét báo cáo khi API treo: lần quét vẫn xong, coi như không có báo cáo, không bỏ chế độ gọi trực tiếp', async () => {
  const data = fixture();
  data.reportsHang = true;
  const env = makeEnv({ data });
  const state = await scan(env);
  assert.equal(state.lastResult.status, 'ok');
  assert.deepEqual(groupOf(env, 'gFood').reportIds, []);
  assert.deepEqual(groupOf(env, 'gCL').flaggedIds, ['f1']);
  const probes = env.calls.filter((c) => c === 'GET group/me/permissions').length;
  await env.send({ type: 'members', groupId: 'gFood' });
  assert.equal(env.calls.filter((c) => c === 'GET group/me/permissions').length, probes); // không gọi thử lại
});

test('tắt "Quét báo cáo": không gọi API báo cáo, không đếm', async () => {
  const env = makeEnv({ settings: { scanReports: false } });
  await scan(env);
  assert.ok(!env.calls.some((c) => c.includes('content-reports') || c.includes('/contents/flagged')));
  assert.equal(env.badge.text, '5');
  assert.equal(env.storage.state.knownReportIds, undefined);
});

test('xử lý báo cáo / ẩn bài gắn cờ: bỏ khỏi số đếm ngay, chạy thử thì giữ nguyên', async () => {
  const dry = makeEnv();
  await scan(dry);
  await dry.send({ type: 'reportAct', action: 'ignore', groupId: 'gFood', items: [{ reportId: 'rp1', targetId: 'c1', targetType: 'COMMENT' }] });
  assert.deepEqual(groupOf(dry, 'gFood').reportIds, ['rp1', 'rp2']);

  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  assert.equal(env.badge.text, '8');
  await env.send({ type: 'reportAct', action: 'ignore', groupId: 'gFood', items: [{ reportId: 'rp1', targetId: 'c1', targetType: 'COMMENT' }] });
  assert.deepEqual(groupOf(env, 'gFood').reportIds, ['rp2']);
  assert.equal(env.storage.log[0].reportId, 'rp1');
  await env.send({ type: 'reportAct', action: 'hidePost', groupId: 'gCL', reasonType: 'SPAM', items: [{ targetId: 'f1', targetType: 'POST', groups: [CL, CLsub] }] });
  assert.deepEqual(groupOf(env, 'gCL').flaggedIds, []);
  assert.equal(env.badge.text, '6');
});

test('mở tab Báo cáo: cập nhật số đếm theo danh sách mới đọc và đánh dấu đã thấy (lần quét sau không báo lại)', async () => {
  const env = makeEnv();
  await scan(env);
  // Trên web: rp2 đã được xử lý, có báo cáo mới rp9
  env.data.reports.gFood = [env.data.reports.gFood[0], { id: 'rp9', targetId: 'p9', targetType: 'POST', content: 'mới', targetActor: user(64), reasonsCount: [], status: 'CREATED' }];
  const r = await env.send({ type: 'reports', groupId: 'gFood', kind: 'reported' });
  assert.deepEqual(r.items.map((x) => x.id), ['rp1', 'rp9']);
  await flush(env);
  assert.deepEqual(groupOf(env, 'gFood').reportIds, ['rp1', 'rp9']);
  assert.ok(env.storage.state.knownReportIds.includes('rp9'));
  // Bài gắn cờ đã hết trên web
  env.data.flagged.gCL = [];
  await env.send({ type: 'reports', groupId: 'gCL', kind: 'flagged' });
  await flush(env);
  assert.deepEqual(groupOf(env, 'gCL').flaggedIds, []);
  assert.equal(env.badge.text, '7'); // 3 yêu cầu + 2 bài chờ duyệt + 2 báo cáo
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.length, 0);
});

// ---------- Ảnh, video, tệp ----------

test('xin chỗ tải lên: ảnh / video / tệp gọi đúng API, đúng body, video mới kèm x-version-id', async () => {
  const env = makeEnv();
  await scan(env);
  const img = await env.send({ type: 'uploadInit', kind: 'image', mimeType: 'image/png' });
  assert.deepEqual(img, { status: 'ok', id: 'up-images', url: 'https://bucket.s3.amazonaws.com/', fields: { key: 'k', Policy: 'p' }, mode: 'direct' });
  const vid = await env.send({ type: 'uploadInit', kind: 'video', mimeType: 'video/mp4' });
  const file = await env.send({ type: 'uploadInit', kind: 'file' });
  assert.deepEqual([vid.id, file.id, file.url], ['up-videos', 'up-file', undefined]);
  assert.deepEqual(env.bodies.filter(([c]) => c.startsWith('POST upload')), [
    ['POST upload/images/', { properties: { mime_type: 'image/png' }, resource: 'post:content' }],
    ['POST upload/videos/', { properties: { mime_type: 'video/mp4' } }],
  ]);
  assert.ok(env.calls.includes('POST upload/files/'));
  assert.equal(env.headers['POST upload/images/']['x-version-id'], undefined);
  assert.equal(env.headers['POST upload/videos/']['x-version-id'], '2.0.0');
  assert.match((await env.send({ type: 'uploadInit', kind: 'exe' })).message, /không hợp lệ/);
});

test('chờ xử lý file: trả đối tượng media; báo lỗi khi Beincom báo ERROR, chưa có ảnh hoặc quá lâu', async () => {
  const env = makeEnv();
  await scan(env);
  const w = await env.send({ type: 'uploadWait', kind: 'image', id: 'up-images' });
  assert.deepEqual(w.item, { url: 'https://media.beincom.com/up-images', id: 'up-images', width: 800, height: 600, mime_type: 'image/png' });
  assert.ok(env.calls.includes('GET upload/images/up-images?wait=true'));
  env.data.uploadResult = { status: 'ERROR', error_message: 'Unsupported image' };
  assert.match((await env.send({ type: 'uploadWait', kind: 'image', id: 'x' })).message, /Unsupported image/);
  env.data.uploadResult = { status: 'PENDING' };
  assert.match((await env.send({ type: 'uploadWait', kind: 'image', id: 'x' })).message, /chưa xử lý xong/);
  assert.match((await env.send({ type: 'uploadWait', kind: 'video', id: 'x', unsure: true })).message, /chưa lên được kho/);
  env.data.uploadResult = { status: 'PROCESSING', properties: { size: 5 } };
  assert.deepEqual((await env.send({ type: 'uploadWait', kind: 'video', id: 'v1' })).item, { id: 'v1', url: undefined, size: 5, status: 'waiting_process', thumbnails: undefined });
  env.data.uploadWaitHang = true;
  assert.match((await env.send({ type: 'uploadWait', kind: 'image', id: 'x' })).message, /quá lâu/);
});

test('đăng bài kèm ảnh: gửi media trong body; chạy thử chỉ ghi số ảnh vào nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const images = [{ url: 'https://media.beincom.com/i1', id: 'i1', width: 800 }, { url: 'https://media.beincom.com/i2', id: 'i2' }];
  const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: '', media: { images, videos: [], files: [] } });
  assert.equal(r.ok, 1);
  const pub = env.bodies.find(([c]) => c.endsWith('/publish'))[1];
  assert.deepEqual(pub.media, { images, videos: [], files: [] });
  assert.equal(env.storage.log[0].snippet, '[2 ảnh] ');
  // Hai loại đính kèm: từ chối trước khi gọi API
  const bad = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'x', media: { images, files: [{ id: 'f' }] } });
  assert.match(bad.message, /một loại/);
  const dry = makeEnv();
  await scan(dry);
  const d = await dry.send({ type: 'compose', groupIds: ['gFood'], content: 'Bài thử', media: { images: [{ name: 'a.png' }], videos: [], files: [] } });
  assert.equal(d.dry, 1);
  assert.equal(dry.storage.log[0].snippet, '[1 ảnh] Bài thử');
  assert.ok(!dry.calls.some((c) => c.startsWith('POST content') || c.startsWith('POST upload')));
});

// ---------- Nhắc tên và xem trước link ----------

test('tìm người để nhắc tên: gọi API người dùng không kèm phiên bản, dấu phẩy giữa các group', async () => {
  const env = makeEnv();
  await scan(env);
  const r = await env.send({ type: 'mentionable', groupIds: ['gFood', 'gCL'], key: 'ka' });
  assert.deepEqual(r.users, [{ id: 'u61', username: 'kai', fullname: 'Kai', avatar: '', isVerified: true }]);
  assert.ok(env.calls.includes('GET user/users/mentionable?group_ids=gFood,gCL&key=ka'));
  assert.equal(env.headers['GET user/users/mentionable?group_ids=gFood,gCL&key=ka']['x-version-id'], undefined);
  assert.deepEqual((await env.send({ type: 'mentionable', groupIds: [] })).users, []); // chưa chọn group: không gọi API
});

test('xem trước link: link ngoài dùng url-metadata, bài Beincom dùng API nội dung, lỗi thì báo', async () => {
  const env = makeEnv();
  await scan(env);
  const a = await env.send({ type: 'linkPreview', url: 'https://vd.vn/bai viết' });
  assert.deepEqual(a.preview, { url: 'https://vd.vn/bai viết', domain: 'Ví dụ', title: 'Trang ví dụ', image: 'https://vd.vn/a.png', description: 'Mô tả' });
  assert.ok(env.calls.includes('GET group/url-metadata?url=https%3A%2F%2Fvd.vn%2Fbai%20vi%E1%BA%BFt'));
  const b = await env.send({ type: 'linkPreview', url: 'https://group.beincom.com/posts/p77?x=1' });
  assert.equal(b.preview.title, 'Bài trên Beincom');
  assert.ok(env.calls.includes('GET content/contents/p77/link-preview'));
  assert.match((await env.send({ type: 'linkPreview', url: 'https://loi.vn' })).message, /Cannot fetch url/);
  assert.match((await env.send({ type: 'linkPreview', url: 'javascript:alert(1)' })).message, /không hợp lệ/);
});

test('đăng bài có nhắc tên và link: mentions chỉ gồm người còn trong bài, kèm linkPreview', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const linkPreview = { url: 'https://vd.vn', domain: 'Ví dụ', title: 'Trang ví dụ', image: '', description: '' };
  const mentions = { kai: { id: 'u61', avatar: '', name: 'kai', fullname: 'Kai', isVerified: true }, lan: { id: 'u62', name: 'lan' } };
  await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Chào @kai, xem https://vd.vn', mentions, linkPreview });
  const pub = env.bodies.find(([c]) => c.endsWith('/publish'))[1];
  assert.deepEqual(pub.mentions, { kai: mentions.kai });
  assert.deepEqual(pub.linkPreview, linkPreview);
});

// ---------- Tag và series ----------

test('tải tag (theo group gốc, đủ các trang) và series (theo group) cho các group sẽ đăng', async () => {
  const env = makeEnv();
  await scan(env);
  assert.deepEqual(env.storage.state.snapshot.groups.map((g) => [g.id, g.rootGroupId]), [['gFood', 'gFood'], ['gCL', 'gCL'], ['gCLsub', '']]);
  env.calls.length = 0;
  // gCLsub chưa có rootGroupId: lấy group gốc cùng community (gCL) đang quản trị
  const r = await env.send({ type: 'tagsSeries', groupIds: ['gFood', 'gCLsub'] });
  assert.equal(r.tags.length, 31);
  assert.deepEqual(r.tags[0], { id: 'tF1', name: 'AMA', totalUsed: 3 });
  assert.deepEqual(r.series.map((x) => [x.id, x.title, x.cover]), [['sF1', 'Lịch sự kiện', 'https://media.beincom.com/c1'], ['sC1', 'Nhập môn crypto', '']]);
  assert.deepEqual(env.calls, [
    'GET content/tags?groupIds[]=gFood&groupIds[]=gCL&offset=0',
    'GET content/tags?groupIds[]=gFood&groupIds[]=gCL&offset=25',
    'GET content/series?groupIds[]=gFood&groupIds[]=gCLsub&offset=0',
  ]);
  assert.equal(r.note, '');
  assert.deepEqual(await env.send({ type: 'tagsSeries', groupIds: [] }), { status: 'ok', tags: [], series: [] });
});

test('chỉ quản trị group con, chưa quét lại: không có tag, nhắc quét lại', async () => {
  const data = fixture();
  delete data.perms.groups.gCL;
  const env = makeEnv({ data });
  await scan(env);
  // Bản cũ chưa lưu rootGroupId
  env.storage.state.snapshot.groups = env.storage.state.snapshot.groups.map(({ rootGroupId, ...g }) => g);
  const r = await env.send({ type: 'tagsSeries', groupIds: ['gCLsub'] });
  assert.deepEqual([r.tags, r.series.length], [[], 1]);
  assert.match(r.note, /Quét ngay/);
});

test('đăng bài có tag / series: kiểm tra hợp lệ trước khi tạo nháp, body gửi id; không hợp lệ thì báo tên, không tạo nháp', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const tags = [{ id: 'tF1', name: 'AMA' }];
  const series = [{ id: 'sF1', title: 'Lịch sự kiện' }];
  const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Bài có tag', tags, series });
  assert.equal(r.ok, 1);
  assert.deepEqual(env.bodies.find(([c]) => c === 'POST content/contents/validate-series-tags')[1], { groups: ['gFood'], series: ['sF1'], tags: ['tF1'] });
  const pub = env.bodies.find(([c]) => c.endsWith('/publish'))[1];
  assert.deepEqual([pub.tags, pub.series], [['tF1'], ['sF1']]);
  const before = env.calls.filter((c) => c === 'POST content/posts').length;
  const bad = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'x', tags: [{ id: 'tBad1', name: 'SAI' }], series: [{ id: 'sBad', title: 'Series lạ' }] });
  assert.equal(bad.failed, 1);
  assert.match(bad.errors[0], /series Series lạ; tag SAI không dùng được/);
  assert.equal(env.calls.filter((c) => c === 'POST content/posts').length, before); // không tạo nháp
  // Không có tag / series: không gọi kiểm tra
  env.calls.length = 0;
  await env.send({ type: 'compose', groupIds: ['gFood'], content: 'y' });
  assert.ok(!env.calls.some((c) => c.includes('validate-series-tags')));
});

// ---------- Giới hạn của Beincom và bài đã bị xoá ----------

test('API nội dung chỉ nhận 25 mục mỗi trang: bài hẹn giờ đọc nhiều trang; lỗi hiện đủ chi tiết', async () => {
  const data = fixture();
  data.scheduled.gCL = Array.from({ length: 30 }, (_, i) => post('s' + i, 'Hẹn ' + i, { status: 'WAITING_SCHEDULE', scheduledAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString() }));
  const env = makeEnv({ data });
  await scan(env);
  const list = await env.send({ type: 'scheduled' });
  assert.deepEqual([list.items.length, list.errors], [30, []]);
  assert.ok(env.calls.includes('GET content/manage/groups/gCL/contents/scheduled?limit=25&type=POST&after=25'));
  assert.ok(env.calls.every((c) => !c.startsWith('GET content/') || !/limit=(2[6-9]|[3-9]\d|\d{3})/.test(c)));
  assert.equal(BG.errMsg({ status: 400, body: { code: 'api.validation_error', meta: { message: 'Bad Request Exception', errors: ['limit must not be greater than 25'] } } }), 'Bad Request Exception: limit must not be greater than 25');
  assert.equal(BG.errMsg({ status: 400, body: { meta: { message: 'Lỗi', errors: [{ message: ['content is too long'] }] } } }), 'Lỗi: content is too long');
});

test('bài đã bị xoá trên Beincom: xoá / ẩn / huỷ hẹn giờ tính là xong, bỏ khỏi danh sách, nhật ký ghi rõ', async () => {
  const data = fixture();
  data.timeline.gCL.push(post('goneMine', 'Bài của Kai đã xoá trên web', { actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto' } }), post('goneOther', 'Bài người khác đã bị xoá'));
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const del = await env.send({ type: 'postAct', action: 'delete', contentIds: ['goneMine'] });
  assert.deepEqual([del.ok, del.failed, del.gone], [1, 0, 1]);
  assert.equal(env.storage.log[0].message, 'Bài không còn trên Beincom (đã bị xoá) — đã bỏ khỏi danh sách');
  const hide = await env.send({ type: 'postAct', action: 'hide', contentIds: ['goneOther', 't1'], reasonType: 'SPAM' });
  assert.deepEqual([hide.ok, hide.gone], [2, 1]);
  const ids = env.storage.state.recentPosts.map((p) => p.id);
  assert.ok(!ids.includes('goneMine') && !ids.includes('goneOther'));
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't1').isHidden, true);
  const cancel = await env.send({ type: 'scheduleAct', action: 'cancel', contentId: 'goneSched' });
  assert.deepEqual([cancel.ok, cancel.gone], [1, 1]);
  // Lỗi khác vẫn là lỗi
  assert.equal(BG.isContentGone({ body: { code: 'api.validation_error', meta: { message: 'Bad Request' } } }), false);
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
