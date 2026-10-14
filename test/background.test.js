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
        gFood: ['approve_reject_jr', 'remove_member', 'assign_unassign_role', 'edit_join_setting', 'edit_privacy', 'crud_post_article', 'role_OWNER', 'role_COMMUNITY_ADMIN'],
        gCL: ['approve_reject_jr', 'remove_member', 'assign_unassign_role', 'edit_join_setting', 'edit_privacy', 'role_GROUP_ADMIN'],
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
      // Food Research: admin khác xoá user(34), cấm user(35) trên web
      gFood: [
        { id: 'eF1', eventTime: '2026-09-01T08:00:00Z', eventType: 'DELETE', useCase: 'remove.member', data: { actor: user(33), user: user(34), group: { name: 'Food Research' } } },
        { id: 'eF2', eventTime: '2026-09-01T07:00:00Z', eventType: 'UPDATE', useCase: 'ban.member', data: { actor: user(33), user: user(35), group: { name: 'Food Research' } } },
      ],
      gCLsub: [
        { id: 'e1', eventTime: '2026-10-07T10:00:00Z', eventType: 'CREATE', useCase: 'join.group.as_member', data: { actor: user(42), group: { name: 'Crypto Life - General' } } },
        { id: 'e2', eventTime: '2026-10-07T09:00:00Z', eventType: 'UPDATE', useCase: 'assign.group_admin', data: { actor: user(41), user: user(43), changes: { old: 'MEMBER', new: 'GROUP_ADMIN' } } },
        { id: 'e3', eventTime: '2026-10-01T09:00:00Z', eventType: 'DELETE', useCase: 'leave.group', data: { actor: user(44) } },
      ],
    },
    postSeq: 0,
    // Bài đang ghim: Crypto Life đã đủ 5
    pinned: { gCL: ['k1', 'k2', 'k3', 'k4', 'k5'].map((id) => post(id, 'Ghim ' + id)), gFood: [], gCLsub: [] },
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

function makeEnv({ data = fixture(), settings = {}, rules = {}, postRules = {}, groupRules = null, loggedIn = true, now = null, initial = null } = {}) {
  const calls = [];
  const bodies = [];
  const headers = {};
  const tg = [];
  const fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    // Chat Beincom (Mattermost giả lập): data.chat; ghi lệnh dạng "GET chat:v4/…"
    if (url.startsWith('https://chat.beincom.com/api/')) {
      const p = url.slice('https://chat.beincom.com/api/'.length);
      calls.push(`${method} chat:${p}`);
      // Thân lệnh: JSON, hoặc FormData (tải tệp lên: ghi tên trường, tệp thì tên / loại / cỡ)
      if (opts.body) bodies.push([`${method} chat:${p}`, typeof opts.body === 'string' ? JSON.parse(opts.body) : Object.fromEntries([...opts.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : { name: v.name, type: v.type, size: v.size }]))]);
      headers[`${method} chat:${p}`] = opts.headers;
      const res = (status, body) => ({ status, json: async () => body });
      const c = data.chat;
      if (!c || !loggedIn) return res(401, { id: 'api.context.session_expired.app_error', message: 'Invalid or expired session, please login again.', status_code: 401 });
      const [path, query = ''] = p.split('?');
      const q = Object.fromEntries(new URLSearchParams(query));
      let m;
      if (path === 'v4/users/me') return res(200, c.me);
      if (path === 'v4/users/me/teams') return res(200, c.teams);
      if (path === 'v4/users/me/teams/members') return res(200, c.teamMembers);
      if ((m = path.match(/^v4\/users\/me\/teams\/(\w+)\/channels$/))) return res(200, c.channels[m[1]] || []);
      if ((m = path.match(/^v4\/users\/me\/teams\/(\w+)\/channels\/members$/))) return res(200, c.channelMembers[m[1]] || []);
      if ((m = path.match(/^v4\/roles\/name\/(\w+)$/))) return res(200, { name: m[1], permissions: c.roles[m[1]] || [] });
      if ((m = path.match(/^v5\/channels\/(\w+)\/posts$/))) {
        const all = (c.posts[m[1]] || []).slice().sort((a, b) => b.create_at - a.create_at);
        const per = Number(q.per_page || 60);
        const list = q.since ? all.filter((x) => Math.max(x.create_at, x.update_at || 0) >= Number(q.since)) : all.slice(Number(q.page || 0) * per, Number(q.page || 0) * per + per);
        return res(200, { order: list.map((x) => x.id), posts: Object.fromEntries(list.map((x) => [x.id, x])) });
      }
      // Thread: tin gốc + bình luận; theo dõi / đã đọc thread
      if ((m = path.match(/^v5\/posts\/(\w+)\/thread$/))) {
        const all = Object.values(c.posts).flat().filter((x) => x.id === m[1] || x.root_id === m[1]);
        if (!all.length) return res(404, { id: 'app.post.get.app_error', message: 'Unable to get the post.', status_code: 404 });
        return res(200, { order: all.map((x) => x.id), posts: Object.fromEntries(all.map((x) => [x.id, x])), has_next: !!c.threadMore });
      }
      if ((m = path.match(/^v4\/users\/me\/teams\/(\w+)\/threads\/(\w+)\/(following|read\/\d+)$/)) && (method === 'PUT' || method === 'DELETE')) return res(200, { status: 'OK' });
      // Biểu cảm: thả / bỏ / ai đã thả; tìm tin (theo team, mọi nơi — c.noGlobalSearch: máy chủ không có)
      if (path === 'v4/reactions' && method === 'POST') return res(201, { ...JSON.parse(opts.body), create_at: 1 });
      if ((m = path.match(/^v5\/users\/(\w+)\/posts\/(\w+)\/reactions\/([\w+%-]+)$/)) && method === 'DELETE') return res(200, { status: 'OK' });
      if ((m = path.match(/^v4\/posts\/(\w+)\/reactions$/))) return res(200, (c.reactions || {})[m[1]] || []);
      const searchIn = (teamIds, terms) => {
        const chans = new Set(Object.entries(c.channels).filter(([t]) => !teamIds || teamIds.includes(t)).flatMap(([, l]) => l.map((x) => x.id)));
        const list = Object.values(c.posts).flat().filter((x) => chans.has(x.channel_id) && x.message.toLowerCase().includes(terms.toLowerCase()));
        return res(200, { order: list.map((x) => x.id), posts: Object.fromEntries(list.map((x) => [x.id, x])) });
      };
      if ((m = path.match(/^v4\/teams\/(\w+)\/posts\/search$/)) && method === 'POST') return searchIn([m[1]], JSON.parse(opts.body).terms);
      if (path === 'v4/posts/search' && method === 'POST') return c.noGlobalSearch ? res(404, { id: 'api.context.404.app_error', message: 'Sorry, we could not find the page.', status_code: 404 }) : searchIn(null, JSON.parse(opts.body).terms);
      // Sửa tin, ghim / bỏ ghim, tin đã ghim, gợi ý tên
      if ((m = path.match(/^v4\/posts\/(\w+)\/patch$/)) && method === 'PUT') {
        const x = Object.values(c.posts).flat().find((y) => y.id === m[1]);
        return x ? res(200, { ...x, ...JSON.parse(opts.body), edit_at: 123 }) : res(404, { id: 'app.post.get.app_error', message: 'Unable to get the post.', status_code: 404 });
      }
      if ((m = path.match(/^v4\/posts\/(\w+)\/(pin|unpin)$/)) && method === 'POST') return res(200, { status: 'OK' });
      if ((m = path.match(/^v4\/channels\/(\w+)\/pinned$/))) {
        const list = (c.posts[m[1]] || []).filter((x) => x.is_pinned);
        return res(200, { order: list.map((x) => x.id), posts: Object.fromEntries(list.map((x) => [x.id, x])) });
      }
      if (path === 'v4/users/autocomplete') {
        const term = String(q.name || '').toLowerCase();
        return res(200, { users: Object.values(c.users).filter((u) => u.username.startsWith(term) || u.first_name.toLowerCase().startsWith(term)), out_of_channel: [] });
      }
      // Thread đang theo dõi theo team (c.threads[team]); unread=true chỉ thread có bình luận chưa đọc
      if ((m = path.match(/^v4\/users\/me\/teams\/(\w+)\/threads$/))) {
        if ((c.threadsDenied || []).includes(m[1])) return res(403, { id: 'api.context.permissions.app_error', message: 'You do not have the appropriate permissions.', status_code: 403 });
        const all = (c.threads || {})[m[1]] || [];
        const list = q.unread === 'true' ? all.filter((x) => x.unread_replies > 0) : all;
        return res(200, { threads: list.slice(0, Number(q.per_page || 25)), total: all.length, total_unread_threads: all.filter((x) => x.unread_replies > 0).length, total_unread_mentions: all.reduce((n, x) => n + (x.unread_mentions || 0), 0) });
      }
      if (path === 'v5/users/me/teams/unread') return res(200, c.unread || []);
      // Mọi kênh / mọi thành viên kênh của mình (trang Chat); c.noAllChannels: máy chủ cũ không có
      if (path === 'v4/users/me/channels') return c.noAllChannels ? res(404, { id: 'api.context.404.app_error', message: 'Not found', status_code: 404 }) : res(200, Object.entries(c.channels).flatMap(([tid, l]) => l.map((x) => ({ team_id: tid, ...x }))));
      if (path === 'v4/users/me/channel_members') {
        if (c.noAllChannels) return res(404, { id: 'api.context.404.app_error', message: 'Not found', status_code: 404 });
        const all = Object.entries(c.channelMembers).flatMap(([tid, l]) => l.map((x) => ({ team_id: tid, ...x })));
        const per = Number(q.per_page || 60);
        return res(200, all.slice(Number(q.page || 0) * per, Number(q.page || 0) * per + per));
      }
      if ((m = path.match(/^v4\/channels\/(\w+)\/members\/me$/))) {
        const x = Object.values(c.channelMembers).flat().find((y) => y.channel_id === m[1]);
        return x ? res(200, x) : res(404, { id: 'app.channel.get_member.missing.app_error', message: 'No channel member found', status_code: 404 });
      }
      if ((m = path.match(/^v4\/channels\/(\w+)$/)) && method === 'GET') {
        const [tid, x] = Object.entries(c.channels).flatMap(([t, l]) => l.map((y) => [t, y])).find(([, y]) => y.id === m[1]) || [];
        return x ? res(200, { ...x, team_id: tid }) : res(404, { id: 'app.channel.get.existing.app_error', message: 'Unable to find the existing channel', status_code: 404 });
      }
      if ((m = path.match(/^v4\/teams\/(\w+)\/members\/me$/))) return res(200, c.teamMembers.find((x) => x.team_id === m[1]) || {});
      if (path === 'v4/channels/members/me/view' && method === 'POST') return res(200, { status: 'OK' });
      if ((m = path.match(/^v4\/contacts\/(\w+)\/(accept|ignore)$/)) && method === 'POST') return (c.contacts || {})[m[1]] ? res(200, { status: 'OK' }) : res(404, { id: 'app.contact.not_found', message: 'Contact not found', status_code: 404 });
      if ((m = path.match(/^v4\/users\/(\w+)$/))) return c.users[m[1]] ? res(200, c.users[m[1]]) : res(404, { id: 'app.user.missing.app_error', message: 'Unable to find the user.', status_code: 404 });
      if ((m = path.match(/^v4\/posts\/(\w+)$/)) && method === 'DELETE') {
        if (c.denyDelete) return res(403, { id: 'api.context.permissions.app_error', message: 'You do not have the appropriate permissions.', status_code: 403 });
        return Object.values(c.posts).some((l) => l.some((x) => x.id === m[1])) ? res(200, { status: 'OK' }) : res(404, { id: 'app.post.get.app_error', message: 'Unable to get the post.', status_code: 404 });
      }
      if (path === 'v4/posts' && method === 'POST') return res(201, { id: 'np' + calls.length, ...JSON.parse(opts.body) });
      if (path === 'v4/files' && method === 'POST') {
        const f = opts.body.get('files');
        if (c.uploadDenied) return res(413, { id: 'api.file.upload_file.too_large_detailed.app_error', message: 'Unable to upload file. File is too large.', status_code: 413 });
        return res(201, { file_infos: [{ id: 'fi' + calls.length, name: f.name, mime_type: f.type, size: f.size, width: 0, height: 0 }], client_ids: [opts.body.get('client_ids')] });
      }
      return res(404, { id: 'api.context.404.app_error', message: 'Sorry, we could not find the page.', status_code: 404 });
    }
    // Telegram Bot API (giả lập): ghi lại tin gửi đi, không gọi mạng
    if (url.startsWith('https://api.telegram.org/bot')) {
      const [, token, apiMethod] = url.match(/^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/) || [];
      tg.push({ token, method: apiMethod, body: opts.body ? JSON.parse(opts.body) : null });
      const res = (status, body) => ({ status, json: async () => body });
      if (data.tgBadToken) return res(401, { ok: false, error_code: 401, description: 'Unauthorized' });
      if (apiMethod === 'getUpdates') {
        const offset = opts.body ? JSON.parse(opts.body).offset || 0 : 0;
        return res(200, { ok: true, result: (data.tgUpdates || []).filter((u) => u.update_id >= offset) });
      }
      if (data.tgNoChat) return res(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' });
      return res(200, { ok: true, result: { message_id: tg.length } });
    }
    // Nơi nhận báo cáo sử dụng (Google Apps Script giả lập)
    if (url.startsWith('https://script.google.com/')) {
      (data.usagePosts ||= []).push({ url, method, headers: opts.headers, body: JSON.parse(opts.body) });
      return { status: data.usageDown ? 500 : 200, ok: !data.usageDown, json: async () => (data.usageDown ? { ok: false, error: 'down' } : { ok: true }) };
    }
    const p = url.replace(API, '');
    calls.push(`${method} ${p}`);
    if (opts.body) bodies.push([`${method} ${p}`, JSON.parse(opts.body)]);
    headers[`${method} ${p}`] = opts.headers;
    const reply = (status, body) => ({ status, json: async () => body });
    if (!loggedIn) return reply(401, { code: 'unauthorized', meta: { message: 'Unauthorized' } });
    let m;
    if (p === 'group/me/permissions') return reply(200, ok(data.perms));
    if (p === 'group/me/communities/pins') return reply(200, ok(data.pins || []));
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
      // Giả lập máy chủ quá tải: trả 504 (trang HTML) vài lần đầu
      if (data.timeline504?.[m[1]] > 0) {
        data.timeline504[m[1]]--;
        return { status: 504, json: async () => { throw new Error('not json'); } };
      }
      const all = data.timeline[m[1]] || [];
      const start = Number(q.after || 0);
      const list = all.slice(start, start + Number(q.limit));
      const more = start + list.length < all.length;
      return reply(200, ok({ list, meta: { hasNextPage: more, endCursor: more ? String(start + list.length) : null } }));
    }
    // Bình luận của một bài (trang đầu = mới nhất), ẩn bình luận
    if (path === 'content/comments' && method === 'GET') {
      const src = q.parentId ? data.replies?.[q.parentId] : data.comments?.[q.postId];
      return reply(200, ok({ list: (src || []).slice(0, Number(q.limit) || 10), meta: { hasNextPage: false } }));
    }
    // Viết bình luận / trả lời: trả về bình luận vừa tạo
    if (path === 'content/comments' && method === 'POST') {
      if (data.commentFail) return reply(400, { code: 'comment.invalid', meta: { message: 'Comment is invalid' } });
      return reply(201, ok({ id: 'nc' + ++data.postSeq, postId: JSON.parse(opts.body).postId, parentId: '00000000-0000-0000-0000-000000000000', content: JSON.parse(opts.body).content, actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto' }, createdAt: new Date().toISOString(), totalReply: 0 }));
    }
    if ((m = path.match(/^content\/comments\/([\w-]+)\/reply$/)) && method === 'POST') {
      return reply(201, ok({ id: 'nr' + ++data.postSeq, postId: JSON.parse(opts.body).postId, parentId: m[1], content: JSON.parse(opts.body).content, actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto' }, createdAt: new Date().toISOString(), totalReply: 0 }));
    }
    if ((m = path.match(/^content\/comments\/([\w-]+)\/hide$/)) && method === 'POST') {
      if ((data.goneComments || []).includes(m[1])) return reply(404, { code: 'comment.not_found', meta: { message: 'Comment not found' } });
      return reply(200, ok(true));
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
    // Việc của đội admin: useCase nhiều loại cách nhau dấu phẩy, from / to theo ms (data.teamEvents[groupId]); data.teamDenied: 403
    if ((m = path.match(/^group\/groups\/(\w+)\/activity-logs$/)) && String(q.useCase || '').includes(',')) {
      if ((data.teamDenied || []).includes(m[1])) return reply(403, { code: 'forbidden', meta: { message: "You don't have permission" } });
      const cases = q.useCase.split(',');
      const t = (e) => Date.parse(e.eventTime);
      const all = (data.teamEvents?.[m[1]] || []).filter((e) => cases.includes(e.useCase) && (!q.from || t(e) >= Number(q.from)) && (!q.to || t(e) <= Number(q.to))).sort((a, b) => t(b) - t(a));
      const [limit, page] = [Number(q.limit), Number(q.page || 1)];
      return reply(200, ok(all.slice((page - 1) * limit, page * limit), { total: all.length }));
    }
    // Nhật ký thành viên (objectType=MEMBER, from / to theo ms, trang tối đa 100): data.memberEvents[groupId] dạng API
    if ((m = path.match(/^group\/groups\/(\w+)\/activity-logs$/)) && q.objectType === 'MEMBER') {
      if (Number(q.limit) > 100) return reply(400, { code: 'api.validation_error', meta: { message: 'Bad Request Exception' } });
      const t = (e) => Date.parse(e.eventTime);
      const all = (data.memberEvents?.[m[1]] || []).filter((e) => (!q.from || t(e) >= Number(q.from)) && (!q.to || t(e) <= Number(q.to))).sort((a, b) => t(b) - t(a));
      const [limit, page] = [Number(q.limit), Number(q.page || 1)];
      return reply(200, ok(all.slice((page - 1) * limit, page * limit), { total: all.length, hasNextPage: page * limit < all.length }));
    }
    // Tìm bài như trang Tìm kiếm của web: groupId, startTime / endTime (ISO), actors[], keyword — data.search, mới nhất trước, không có bài đã ẩn
    if (path === 'content/contents' && method === 'GET') {
      const actors = new URLSearchParams(query).getAll('actors[]');
      data.searchActorsMax = Math.max(data.searchActorsMax || 0, actors.length);
      if (actors.length > 20) return reply(400, { code: 'api.validation_error', meta: { message: 'URL quá dài' } });
      const kw = String(q.keyword || '').toLowerCase();
      const all = (data.search || [])
        .filter((x) => !x.isHidden && (!kw || String(x.content || '').toLowerCase().includes(kw)))
        .filter((x) => (!q.startTime || x.publishedAt >= q.startTime) && (!q.endTime || x.publishedAt < q.endTime) && (!actors.length || actors.includes(x.actor.id)))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      const start = Number(q.after || 0);
      const list = all.slice(start, start + Number(q.limit));
      const more = start + list.length < all.length;
      return reply(200, ok({ list, meta: { total: all.length, hasNextPage: more, endCursor: more ? String(start + list.length) : null } }));
    }
    if ((m = path.match(/^group\/groups\/(\w+)\/activity-logs$/))) {
      const all = (data.activity[m[1]] || []).filter((e) => !q.useCase || e.useCase === q.useCase);
      return reply(200, ok(all, { total: all.length, hasNextPage: false }));
    }
    // Báo cáo vi phạm
    if ((m = path.match(/^content\/manage\/communities\/(\w+)\/content-reports\/count$/))) {
      return reply(200, ok({ total: (data.reports[m[1]] || []).filter((r) => r.status === 'CREATED').length }));
    }
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
    // Thành viên bị cấm
    if ((m = path.match(/^group\/communities\/(\w+)\/banned-members$/))) {
      if (!data.perms.communities[m[1]]?.includes('manage')) return reply(403, { code: 'forbidden', meta: { message: "You don't have permission" } });
      const all = data.banned?.[m[1]] || [];
      const [limit, offset] = [Number(q.limit), Number(q.offset)];
      return reply(200, ok(all.slice(offset, offset + limit), { total: all.length, limit, offset, hasNextPage: offset + limit < all.length }));
    }
    if (path.match(/^group\/communities\/\w+\/users\/\w+\/unban$/) && method === 'POST') return reply(201, ok(true));
    // Cài đặt group
    if (path.match(/^group\/groups\/\w+\/settings$/) && method === 'GET' && data.forbidSettings) return reply(403, { code: 'forbidden', meta: { message: 'Forbidden' } });
    if ((m = path.match(/^group\/groups\/(\w+)\/settings$/)) && method === 'GET') {
      const v = data.groupSettings?.[m[1]] || {};
      return reply(200, ok({ settings: { isJoinApproval: !!v.isJoinApproval, isActiveMembershipQuestions: false, isInvitedOnly: false, isHiddenMembers: true, contentApproval: { value: !!v.contentApproval } }, changeableSettings: { isJoinApproval: '' } }));
    }
    if (path.match(/^group\/groups\/\w+\/settings$/) && method === 'PUT') return reply(200, ok(true));
    if (path.match(/^group\/communities\/\w+\/content-settings$/) && method === 'PUT') return reply(200, ok(true));
    // Ghim, chi tiết bài, sửa bài, cài đặt
    if ((m = path.match(/^content\/contents\/pinned-content\/groups\/(\w+)$/))) return reply(200, ok(data.pinned[m[1]] || []));
    if (path.match(/^content\/contents\/pinned-content\/\w+$/) && method === 'PUT') return reply(200, ok(true));
    if ((m = path.match(/^content\/contents\/(\w+)$/)) && method === 'GET') {
      if (m[1].startsWith('gone')) return reply(404, { code: 'content.not_found', meta: { message: 'Content not found' } });
      const found = [...Object.values(data.timeline).flat(), ...Object.values(data.scheduled || {}).flat()].find((x) => x.id === m[1]);
      return found ? reply(200, ok({ status: 'PUBLISHED', mentions: {}, tags: [], series: [], setting: { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null }, ...found })) : reply(404, { code: 'api.not_found' });
    }
    if (path.match(/^content\/contents\/\w+\/setting$/) && method === 'PUT') return reply(200, ok(true));
    if (path.match(/^content\/posts\/\w+$/) && method === 'PUT') return reply(200, ok({ status: 'PUBLISHED' }));
    // Tag và series
    const all = new URLSearchParams(query);
    if ((path === 'content/tags' || path === 'content/series') && method === 'GET') {
      const kind = path.split('/')[1];
      const list = all.getAll('groupIds[]').flatMap((id) => data[kind][id] || []);
      const offset = Number(q.offset || 0);
      return reply(200, ok({ list: list.slice(offset, offset + 25), meta: { limit: 25, offset, total: list.length } }));
    }
    // Quản lý tag
    if ((m = path.match(/^group\/me\/permissions\/can-cud-tags\/community\/(\w+)$/))) return reply(200, ok(data.tagPerm?.[m[1]] ?? true));
    if (path === 'content/tags' && method === 'POST') return reply(201, ok({ id: 'tNew', name: JSON.parse(opts.body).name }));
    if (path.match(/^content\/tags\/\w+$/) && (method === 'PUT' || method === 'DELETE')) return reply(200, ok(true));
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
    // Article, Series, chuyên mục
    if (path === 'content/category') return reply(200, ok({ list: [{ id: 'cat1', name: 'Business & Finance', slug: 'business-finance', level: 1 }, { id: 'cat2', name: 'Technology', slug: 'technology', level: 1 }], meta: { total: 2 } }));
    if (path === 'content/articles' && method === 'POST') return reply(201, ok({ id: `art${++data.postSeq}`, status: 'DRAFT', type: 'ARTICLE' }));
    if (path.match(/^content\/manage\/groups\/\w+\/articles$/) && method === 'POST') return reply(201, ok({ id: `gart${++data.postSeq}`, status: 'DRAFT', type: 'ARTICLE' }));
    if ((m = path.match(/^content\/articles\/(\w+)\/(publish|schedule)$/)) && method === 'PUT') {
      if (data.failArticle) return reply(400, { code: 'api.validation_error', meta: { message: 'coverMedia is invalid' } });
      return reply(200, ok({ id: m[1], type: 'ARTICLE', status: m[2] === 'publish' ? 'PUBLISHED' : 'WAITING_SCHEDULE' }));
    }
    if (path.match(/^content\/articles\/\w+$/) && method === 'DELETE') return reply(200, ok(true));
    if ((path === 'content/series' || path.match(/^content\/manage\/groups\/\w+\/series$/)) && method === 'POST') return reply(201, ok({ id: `ser${++data.postSeq}`, type: 'SERIES', status: 'PUBLISHED' }));
    // Đăng bài
    if (path === 'content/posts' && method === 'POST') return reply(201, ok({ id: `new${++data.postSeq}`, status: 'DRAFT' }));
    if (path.match(/^content\/manage\/groups\/\w+\/posts$/) && method === 'POST') {
      if (data.groupPostOff) return reply(403, { code: 'feature.not_enabled', meta: { message: 'Feature is not enabled' } });
      return reply(201, ok({ id: `grp${++data.postSeq}`, status: 'DRAFT' }));
    }
    if ((m = path.match(/^content\/posts\/(\w+)\/(publish|schedule)$/)) && method === 'PUT') {
      if (data.failPublish) return reply(400, { code: 'api.validation_error', meta: { message: 'Content is invalid' } });
      return reply(200, ok({ id: m[1], status: m[2] === 'publish' ? 'PUBLISHED' : 'WAITING_SCHEDULE' }));
    }
    const goneReply = () => reply(400, { code: 'content.not_found', meta: { message: 'Content not found' } });
    if ((m = path.match(/^content\/posts\/(\w+)$/)) && method === 'DELETE') return m[1].startsWith('gone') ? goneReply() : reply(200, ok(true));
    if ((m = path.match(/^content\/contents\/(gone\w*)\/(hide|reschedule)$/))) return goneReply();
    if ((m = path.match(/^content\/manage\/groups\/(\w+)\/contents\/scheduled$/))) {
      const all = (data.scheduled[m[1]] || []).filter((x) => (x.type || 'POST') === (q.type || 'POST'));
      const start = Number(q.after || 0);
      const list = all.slice(start, start + Number(q.limit));
      const more = start + list.length < all.length;
      return reply(200, ok({ list, meta: { hasNextPage: more, endCursor: more ? String(start + list.length) : null } }));
    }
    if (path.match(/^content\/contents\/\w+\/reschedule$/) && method === 'PUT') return reply(200, ok(true));
    if (path.match(/^group\/groups\/\w+\/(users\/remove|assign-admin|revoke-admin)$/) && method === 'PUT') return reply(200, ok(true));
    if (path.match(/^group\/communities\/\w+\/users\/\w+\/ban$/) && method === 'POST') return reply(201, ok(true));
    if ((m = p.match(/^content\/contents\/(\w+)\/hide$/)) && method === 'POST') {
      (data.hideCalls ||= []).push(m[1]);
      if (data.hideGate?.[m[1]]) await data.hideGate[m[1]]; // giả lệnh ẩn chậm / treo
      return reply(201, ok(true));
    }
    if ((m = p.match(/^group\/groups\/(\w+)\/joining-requests\/(\w+)\/(approve|decline)$/)) && method === 'PUT') {
      const list = data.requests[m[1]] || [];
      const i = list.findIndex((r) => r.id === m[2]);
      if (i < 0) return reply(400, { code: 'api.validation_error', meta: { message: 'Join request not found' } });
      list.splice(i, 1);
      return reply(200, ok(true));
    }
    return reply(404, { code: 'not_found', meta: { message: 'No route ' + p } });
  };

  // Nhắc bài chưa ai trả lời tắt sẵn (bài mẫu chưa có bình luận); test riêng bật lại
  const storage = { settings: { ...BG.DEFAULT_SETTINGS, remindUnanswered: false, remindPending: false, selfCheckDaily: false, ...settings }, rules: { ...BG.DEFAULT_RULES, ...rules }, postRules: { ...BG.DEFAULT_POST_RULES, ...postRules }, ...(initial ? structuredClone(initial) : {}) };
  if (groupRules) storage.groupRules = groupRules;
  const syncStore = {};
  const syncWrites = [];
  const listeners = {};
  const ev = (name) => ({ addListener: (fn) => (listeners[name] = fn), removeListener: () => {} });
  const notifications = [];
  const tabsCreated = [];
  const badge = {};
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return structuredClone(storage);
          return Object.fromEntries([].concat(keys).filter((k) => k in storage).map((k) => [k, structuredClone(storage[k])]));
        },
        async set(o) {
          Object.assign(storage, structuredClone(o));
        },
        async getBytesInUse() {
          return data.bytesInUse ?? JSON.stringify(storage).length;
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete storage[k];
        },
      },
      // Bản đồng bộ của tài khoản trình duyệt (chrome.storage.sync)
      sync: {
        async get(keys) {
          return Object.fromEntries([].concat(keys).filter((k) => k in syncStore).map((k) => [k, structuredClone(syncStore[k])]));
        },
        async set(o) {
          syncWrites.push(Object.keys(o));
          Object.assign(syncStore, structuredClone(o));
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
    runtime: { onMessage: ev('message'), onStartup: ev('startup'), onInstalled: ev('installed'), getURL: (p) => 'chrome-extension://x/' + p, getPlatformInfo: async () => ((data.pings = (data.pings || 0) + 1), { os: 'win' }), getManifest: () => ({ version: '0.0.0-test', permissions: data.unlimited ? ['storage', 'unlimitedStorage'] : ['storage'] }) },
    permissions: { contains: async ({ origins }) => (origins.some((o) => o.includes('script.google')) ? data.usagePerm !== false : origins.some((o) => o.includes('chat.beincom')) ? data.chatPerm !== false : true) },
  };
  const ctx = vm.createContext({
    chrome,
    BG,
    fetch,
    // Nạp thật các tệp bg/*.js như service worker (common.js và lib/*.js đã có sẵn dưới tên BG)
    importScripts: (...files) => {
      for (const f of files) if (f !== 'common.js' && !f.startsWith('lib/')) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
    },
    setTimeout: (fn) => setImmediate(fn),
    clearTimeout: () => {},
    console,
    structuredClone,
    TextEncoder,
    URL,
    AbortController,
    FormData,
    Blob,
    atob,
  });
  // Giả giờ của service worker (vd. ngày đầu tháng) — chỉ Date.now()
  if (now) vm.runInContext(`Date.now = () => ${Number(now)};`, ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), ctx);

  // structuredClone: đưa kết quả về realm của test để deepEqual so được
  const send = (msg) => new Promise((resolve) => listeners.message(msg, {}, (r) => resolve(structuredClone(r))));
  return { send, storage, calls, bodies, headers, notifications, tabsCreated, badge, data, listeners, syncStore, syncWrites, tg };
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

test('quy tắc riêng từng group: tự xử lý và đếm bài vi phạm theo quy tắc của group', async () => {
  // Quy tắc chung không có từ khoá cấm; Food Research có quy tắc riêng cấm "kiếm tiền"
  const env = makeEnv({
    settings: { dryRun: false, autoApprove: true, autoDecline: true },
    groupRules: { gFood: { name: 'Food Research', rules: { ...BG.DEFAULT_RULES, bannedKeywords: ['kiếm tiền'] }, postRules: { ...BG.DEFAULT_POST_RULES } } },
  });
  await scan(env);
  assert.deepEqual(
    env.calls.filter((c) => c.startsWith('PUT')),
    ['PUT group/groups/gFood/joining-requests/jr1/approve', 'PUT group/groups/gFood/joining-requests/jr3/decline'],
  );
  // Quy tắc bài riêng của community Crypto Life áp dụng cho cả group con: t2 (bit.ly) vi phạm
  const env2 = makeEnv({ groupRules: { gCL: { name: 'Crypto Life', rules: { ...BG.DEFAULT_RULES }, postRules: { ...BG.DEFAULT_POST_RULES, ...RULES_LINK } } } });
  await scan(env2);
  assert.equal(env2.badge.text, '9');
  // Bỏ quy tắc riêng -> không còn bài vi phạm, huy hiệu tự đếm lại
  env2.storage.groupRules = {};
  env2.listeners.storage({ groupRules: { newValue: {} } }, 'local');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(env2.badge.text, '8');
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

test('bài định kỳ: mỗi bài một lần hẹn giờ (nhật ký ghi thứ tự), huỷ cả chuỗi một lần', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const times = BG.recurTimes(new Date(Date.now() + 3 * 3600e3).toISOString(), 'week', 3);
  for (const [i, at] of times.entries()) {
    const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Lịch họp tuần', scheduledAt: at, recur: `${i + 1}/3` });
    assert.equal(r.ok, 1);
  }
  assert.deepEqual(env.bodies.filter(([c]) => c.endsWith('/schedule')).map(([, b]) => b.scheduledAt), times);
  assert.deepEqual(env.storage.log.map((e) => e.snippet).reverse(), ['[🔁 1/3] Lịch họp tuần', '[🔁 2/3] Lịch họp tuần', '[🔁 3/3] Lịch họp tuần']);
  const r = await env.send({ type: 'scheduleAct', action: 'cancel', contentIds: ['new1', 'new2', 'new3', 'new2'], snippet: '🔁 Lịch họp tuần' });
  assert.deepEqual([r.ok, r.failed], [3, 0]);
  assert.deepEqual(writes(env).filter((c) => c.startsWith('DELETE')), ['DELETE content/posts/new1', 'DELETE content/posts/new2', 'DELETE content/posts/new3']);
  // Đổi giờ vẫn chỉ một bài
  const bad = await env.send({ type: 'scheduleAct', action: 'reschedule', contentIds: ['new1', 'new2'] });
  assert.match(bad.message, /Thiếu bài/);
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
  assert.deepEqual(env.calls.filter((c) => c.includes('content-reports')), ['GET content/manage/communities/gFood/content-reports/count', 'GET content/manage/communities/gFood/content-reports?limit=25']);
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
  assert.deepEqual([...env.calls].sort(), [
    'GET content/series?groupIds[]=gFood&groupIds[]=gCLsub&offset=0',
    'GET content/tags?groupIds[]=gFood&groupIds[]=gCL&offset=0',
    'GET content/tags?groupIds[]=gFood&groupIds[]=gCL&offset=25',
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

// ---------- Hồ sơ vi phạm ----------

const profileTypes = (env, id) => (env.storage.profiles?.users?.[id]?.events || []).map((e) => e.type).sort();

test('hồ sơ vi phạm: lần quét ghi người bị xoá / cấm (nhật ký Beincom), bị báo cáo, bài bị gắn cờ, bài vi phạm quy tắc', async () => {
  const env = makeEnv({ postRules: { blockedDomains: ['bit.ly'] } });
  await scan(env);
  assert.ok(env.calls.includes('GET group/groups/gFood/activity-logs?limit=50&page=1&sort=desc'));
  assert.deepEqual(profileTypes(env, 'u34'), ['removed']);
  assert.deepEqual(profileTypes(env, 'u35'), ['banned']);
  assert.equal(env.storage.profiles.users.u34.events[0].by, 'Người 33');
  assert.deepEqual(profileTypes(env, 'u61'), ['reported']); // báo cáo rp1 ở Food Research
  assert.deepEqual(profileTypes(env, 'af1'), ['flagged']);
  assert.deepEqual(profileTypes(env, 'at2'), ['rule']); // t2 có link bit.ly
  // Quét lại: không ghi trùng
  await scan(env);
  assert.deepEqual(profileTypes(env, 'u34'), ['removed']);
});

test('hồ sơ vi phạm: thao tác qua addon (từ chối bài, ẩn, xoá thành viên) được ghi; trùng với nhật ký Beincom thì gộp; bỏ qua báo cáo thì bỏ', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  await env.send({ type: 'approvalAct', action: 'reject', groupId: 'gCL', contentIds: ['p2'], reason: 'Lạc đề' });
  await env.send({ type: 'postAct', action: 'hide', contentIds: ['t1'], reasonType: 'SPAM' });
  await env.send({ type: 'memberAct', action: 'remove', groupId: 'gFood', users: [user(34)] });
  assert.deepEqual(profileTypes(env, 'ap2'), ['rejected']);
  assert.deepEqual(profileTypes(env, 'at1'), ['hidden']);
  assert.equal(env.storage.profiles.users.ap2.events[0].reason, 'Lạc đề');
  // Xoá u34 lúc này cách lần xoá trong nhật ký Beincom (01/09) xa hơn 15 phút: tính là lần khác
  assert.deepEqual(profileTypes(env, 'u34'), ['removed', 'removed']);
  // Bỏ qua báo cáo rp1: không còn tính "bị báo cáo"
  await env.send({ type: 'reportAct', action: 'ignore', groupId: 'gFood', items: [{ reportId: 'rp1', targetId: 'c1', targetType: 'COMMENT', actor: user(61) }] });
  assert.equal(env.storage.profiles.users.u61, undefined);
});

test('hồ sơ vi phạm: không tự duyệt người có hồ sơ; tắt ghi hồ sơ thì không đọc nhật ký, không ghi', async () => {
  const data = fixture();
  data.requests.gFood = [jr(35, { membershipAnswers: [{ questionId: 'q1', answer: 'Bạn bè giới thiệu' }] })]; // u35 từng bị cấm
  const env = makeEnv({ data, settings: { dryRun: false, autoApprove: true } });
  await scan(env); // nhật ký Beincom cho biết u35 từng bị cấm: ghi hồ sơ trước bước tự duyệt
  assert.ok(!env.calls.some((c) => c.includes('joining-requests/jr35/approve')));
  assert.equal(BG.evaluateRequest(env.storage.state.snapshot.groups[0].requests[0], BG.DEFAULT_RULES, [], env.storage.profiles.users.u35).verdict, 'review');

  const off = makeEnv({ settings: { trackViolations: false } });
  await scan(off);
  assert.ok(!off.calls.some((c) => c.includes('activity-logs') && !c.includes('useCase=join.community'))); // chỉ đọc người vào (Bảo vệ community), không ghi hồ sơ
  assert.equal(off.storage.profiles, undefined);
});

test('hồ sơ vi phạm: lần đầu dựng từ nhật ký thao tác cũ; đọc nhật ký vào/rời cũng ghi; xoá hồ sơ một người', async () => {
  const env = makeEnv({ settings: { trackViolations: false } });
  env.storage.log = [{ time: Date.parse('2026-10-01T00:00:00Z'), kind: 'manage', action: 'ban', status: 'ok', groupId: 'gFood', groupName: 'Food Research', userId: 'u90', username: 'cu', fullname: 'Cũ', source: 'manual' }];
  env.storage.settings.trackViolations = true;
  await env.send({ type: 'activity', groupId: 'gFood' }).catch(() => {}); // chưa quét: không có group
  await scan(env);
  assert.deepEqual(profileTypes(env, 'u90'), ['banned']); // từ nhật ký cũ
  const r = await env.send({ type: 'profileAct', action: 'forget', userId: 'u90' });
  assert.equal(r.ok, 1);
  assert.equal(env.storage.profiles.users.u90, undefined);
  assert.ok(env.storage.profiles.users.u34); // người khác giữ nguyên
});

test('máy chủ Beincom lỗi tạm thời (504): lệnh đọc tự thử lại; lỗi mãi thì báo dễ hiểu', async () => {
  const data = fixture();
  data.timeline504 = { gCL: 2, gCLsub: 9 };
  const env = makeEnv({ data });
  const state = await scan(env);
  const gs = Object.fromEntries(state.snapshot.groups.map((g) => [g.id, g]));
  assert.equal(gs.gCL.timelineError, undefined); // lỗi 2 lần, lần 3 được
  assert.equal(env.calls.filter((c) => c === 'GET content/timeline/gCL?limit=20').length, 3);
  assert.equal(gs.gCLsub.timelineError, 'Đọc bài mới lỗi: Máy chủ Beincom không phản hồi kịp (HTTP 504), thường tự hết — lần quét sau sẽ thử lại');
  assert.equal(env.calls.filter((c) => c === 'GET content/timeline/gCLsub?limit=20').length, 3); // tối đa 2 lần thử lại
  assert.ok(state.recentPosts.some((p) => p.id === 't1')); // bài của gCL vẫn được đọc
});

test('báo cáo: Beincom đếm 0 thì không gọi API danh sách (vốn treo khi không có báo cáo) cả lúc quét lẫn ở tab Báo cáo', async () => {
  const data = fixture();
  data.reports.gFood = [];
  data.reportsHang = true; // nếu lỡ gọi danh sách thì sẽ treo tới hết thời hạn
  const env = makeEnv({ data });
  await scan(env);
  assert.deepEqual(env.storage.state.snapshot.groups.find((g) => g.id === 'gFood').reportIds, []);
  assert.ok(!env.calls.includes('GET content/manage/communities/gFood/content-reports?limit=25'));
  const r = await env.send({ type: 'reports', groupId: 'gFood', kind: 'reported' });
  assert.deepEqual([r.status, r.items, r.none, r.timedOut], ['ok', [], true, false]);
  assert.ok(!env.calls.some((c) => c.startsWith('GET content/manage/communities/gFood/content-reports?')));
});

test('đọc song song: kết quả quét giống đọc lần lượt (thứ tự group, gộp bài nhiều group, chi tiết bài chờ duyệt)', async () => {
  const env = makeEnv();
  const state = await scan(env);
  assert.deepEqual(state.snapshot.groups.map((g) => g.id), ['gFood', 'gCL', 'gCLsub']);
  assert.deepEqual(state.recentPosts.find((p) => p.id === 't2').seenIn, ['gCL', 'gCLsub']);
  assert.deepEqual(state.snapshot.groups.find((g) => g.id === 'gCL').approvals.map((p) => [p.id, p.full]), [['p1', true], ['p2', true]]);
});

// ---------- Gỡ cấm ----------

test('bị cấm: chủ community xem được danh sách (phân trang), gỡ cấm đúng API; admin group thì không', async () => {
  const data = fixture();
  data.banned = { cFood: Array.from({ length: 60 }, (_, i) => ({ user: user(200 + i), reason: i % 2 ? 'SPAM' : 'VIOLATE_RULE', createdAt: '2026-10-01T00:00:00Z' })) };
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const p1 = await env.send({ type: 'banned', groupId: 'gFood' });
  assert.deepEqual([p1.items.length, p1.total, p1.hasNext, p1.nextOffset], [50, 60, true, 50]);
  assert.deepEqual([p1.items[0].username, p1.items[0].reason, p1.items[1].reason], ['user200', 'Vi phạm nội quy community', 'Spam']);
  const p2 = await env.send({ type: 'banned', groupId: 'gFood', offset: 50 });
  assert.deepEqual([p2.items.length, p2.hasNext], [10, false]);
  assert.match((await env.send({ type: 'banned', groupId: 'gCL' })).message, /chủ \/ admin community/);
  const r = await env.send({ type: 'memberAct', action: 'unban', groupId: 'gFood', users: [user(200), user(201)] });
  assert.deepEqual([r.ok, r.done], [2, ['u200', 'u201']]);
  assert.deepEqual(env.bodies.filter(([c]) => c.endsWith('/unban')), [
    ['POST group/communities/cFood/users/u200/unban', { community_id: 'cFood', user_id: 'u200' }],
    ['POST group/communities/cFood/users/u201/unban', { community_id: 'cFood', user_id: 'u201' }],
  ]);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action], ['manage', 'unban']);
  assert.match((await env.send({ type: 'memberAct', action: 'unban', groupId: 'gCL', users: [user(1)] })).message, /gỡ cấm/);
});

// ---------- Cài đặt group ----------

test('cài đặt group: quét ghi quyền; đọc cài đặt nhiều group; bật / tắt hàng loạt đúng API và body; không đủ quyền thì từ chối', async () => {
  const data = fixture();
  data.groupSettings = { gFood: { isJoinApproval: true }, gCL: { contentApproval: true } };
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const gs = Object.fromEntries(env.storage.state.snapshot.groups.map((g) => [g.id, g]));
  assert.deepEqual([gs.gFood.canEditJoin, gs.gCLsub.canEditJoin, gs.gCLsub.canEditPrivacy], [true, false, false]);
  const r = await env.send({ type: 'groupSettings', groupIds: ['gFood', 'gCL'] });
  assert.deepEqual([r.settings.gFood.values.isJoinApproval, r.settings.gCL.values.contentApproval, r.settings.gCL.values.isHiddenMembers], [true, true, true]);
  // Bật câu hỏi gia nhập cho 2 group
  const a = await env.send({ type: 'groupSettingAct', key: 'isActiveMembershipQuestions', value: true, groupIds: ['gFood', 'gCL'] });
  assert.deepEqual([a.ok, a.done], [2, ['gFood', 'gCL']]);
  assert.deepEqual(env.bodies.filter(([c]) => c.endsWith('/settings')), [
    ['PUT group/groups/gFood/settings', { id: 'gFood', is_active_membership_questions: true }],
    ['PUT group/groups/gCL/settings', { id: 'gCL', is_active_membership_questions: true }],
  ]);
  // Duyệt bài: qua API community, chỉ chủ / admin community
  await env.send({ type: 'groupSettingAct', key: 'contentApproval', value: true, groupIds: ['gFood'] });
  assert.deepEqual(env.bodies.at(-1), ['PUT group/communities/cFood/content-settings', { group_id: 'gFood', content_approval: { value: true }, is_update_all: false }]);
  assert.match((await env.send({ type: 'groupSettingAct', key: 'contentApproval', value: true, groupIds: ['gCL'] })).message, /Crypto Life: Cần quyền chủ \/ admin community/);
  assert.match((await env.send({ type: 'groupSettingAct', key: 'isJoinApproval', value: false, groupIds: ['gCLsub'] })).message, /Không có quyền/);
  // Tắt duyệt thành viên: cột ở Tổng quan cập nhật ngay; nhật ký ghi
  await env.send({ type: 'groupSettingAct', key: 'isJoinApproval', value: false, groupIds: ['gFood'] });
  assert.equal(env.storage.state.snapshot.groups.find((g) => g.id === 'gFood').settings.isJoinApproval, false);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action, env.storage.log[0].setting], ['groupSetting', 'off', 'isJoinApproval']);
  // Chạy thử: không gửi
  const dry = makeEnv({ data });
  await scan(dry);
  const d = await dry.send({ type: 'groupSettingAct', key: 'isHiddenMembers', value: false, groupIds: ['gFood'] });
  assert.deepEqual([d.dry, dry.calls.some((c) => c.startsWith('PUT'))], [1, false]);
});

// ---------- Ghim, cài đặt, sửa bài đã đăng ----------

const KAI = { id: 'me1', username: 'kai', fullname: 'Kai Crypto' };

test('sửa bài: chỉ bài của mình đã đăng; mở lại đủ dữ liệu; lưu bằng PUT content/posts/{id}, cài đặt đổi thì PUT riêng', async () => {
  const data = fixture();
  data.timeline.gFood = [post('m1', 'Bài của Kai @kai', { actor: KAI, audience: { groups: [{ id: 'gFood', name: 'Food Research' }] }, tags: [{ id: 'tF1', name: 'AMA' }] })];
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const other = await env.send({ type: 'postDetail', id: 't1' });
  assert.match(other.message, /Chỉ sửa được bài của chính bạn/);
  assert.equal((await env.send({ type: 'postDetail', id: 't1', any: true })).status, 'ok'); // chỉ xem cài đặt
  const d = await env.send({ type: 'postDetail', id: 'm1' });
  assert.deepEqual([d.post.groups, d.post.tags, d.post.content], [[{ id: 'gFood', name: 'Food Research' }], [{ id: 'tF1', name: 'AMA' }], 'Bài của Kai @kai']);
  env.bodies.length = 0;
  const r = await env.send({ type: 'editPost', id: 'm1', groupIds: ['gFood'], content: 'Đã sửa', media: d.post.media, tags: d.post.tags, series: [], setting: { canComment: false, canReact: true, isImportant: false }, settingChanged: true });
  assert.equal(r.ok, 1);
  const put = env.bodies.find(([c]) => c === 'PUT content/posts/m1')[1];
  assert.deepEqual([put.content, put.tags, put.setting, put.linkPreview, put.audience.groupIds], ['Đã sửa', ['tF1'], undefined, { domain: '', url: '' }, ['gFood']]);
  assert.deepEqual(env.bodies.find(([c]) => c === 'PUT content/contents/m1/setting')[1], { canComment: false, canReact: true, isImportant: false, importantExpiredAt: null });
  assert.ok(env.calls.includes('POST content/contents/validate-series-tags'));
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 'm1').text, 'Đã sửa');
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action], ['post', 'edit']);
  // Không đổi cài đặt: không gọi …/setting; sửa bài người khác: từ chối
  env.calls.length = 0;
  await env.send({ type: 'editPost', id: 'm1', groupIds: ['gFood'], content: 'Lần 2', media: null, settingChanged: false });
  assert.ok(!env.calls.some((c) => c.endsWith('/setting')));
  assert.match((await env.send({ type: 'editPost', id: 't1', groupIds: ['gCL'], content: 'x' })).message, /chính bạn/);
  // Chạy thử: không gửi
  const dry = makeEnv({ data: { ...fixture(), timeline: data.timeline } });
  await scan(dry);
  const dr = await dry.send({ type: 'editPost', id: 'm1', groupIds: ['gFood'], content: 'x' });
  assert.deepEqual([dr.dry, dry.calls.some((c) => c.startsWith('PUT'))], [1, false]);
});

test('cài đặt bài: admin đổi được cả bài người khác (bình luận, cảm xúc, Quan trọng); ghi nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'postSetting', id: 't1', setting: { canComment: false, canReact: false, isImportant: true, importantExpiredAt: null }, snippet: 'Tin tức', actor: { id: 'at1', username: 'tacgiat1' } });
  assert.equal(r.ok, 1);
  assert.deepEqual(env.bodies.at(-1), ['PUT content/contents/t1/setting', { canComment: false, canReact: false, isImportant: true, importantExpiredAt: null }]);
  assert.deepEqual([env.storage.log[0].action, env.storage.log[0].reason], ['setting', 'tắt bình luận, tắt cảm xúc, Quan trọng']);
  assert.match((await env.send({ type: 'postSetting', id: 't1', setting: { isImportant: true, importantExpiredAt: '2020-01-01T00:00:00Z' } })).message, /tương lai/);
});

test('ghim: đọc bài đang ghim từng group; ghim / bỏ ghim đúng body; group đã đủ 5 bài thì báo; chỉ group mình quản trị', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const list = await env.send({ type: 'pinned', groupIds: ['gCL', 'gFood'] });
  assert.deepEqual([list.pinned.gCL.length, list.pinned.gFood.length], [5, 0]);
  const full = await env.send({ type: 'pinAct', contentId: 't2', pin: ['gCL', 'gCLsub'] });
  assert.match(full.message, /Crypto Life đã ghim đủ 5 bài/);
  assert.ok(!env.calls.some((c) => c.startsWith('PUT content/contents/pinned-content')));
  const ok1 = await env.send({ type: 'pinAct', contentId: 't2', pin: ['gCLsub'], unpin: [], snippet: 'airdrop' });
  assert.equal(ok1.ok, 1);
  assert.deepEqual(env.bodies.at(-1), ['PUT content/contents/pinned-content/t2', { pinGroupIds: ['gCLsub'], unpinGroupIds: [] }]);
  await env.send({ type: 'pinAct', contentId: 'k1', unpin: ['gCL'] }); // bỏ ghim không cần kiểm tra giới hạn
  assert.deepEqual(env.bodies.at(-1), ['PUT content/contents/pinned-content/k1', { pinGroupIds: [], unpinGroupIds: ['gCL'] }]);
  assert.deepEqual(env.storage.log.slice(0, 2).map((e) => [e.action, e.reason]), [['unpin', 'Bỏ ghim ở Crypto Life'], ['pin', 'Ghim ở Crypto Life - General']]);
  assert.match((await env.send({ type: 'pinAct', contentId: 't2', pin: ['gOther'] })).message, /group bạn quản trị/);
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

// ---------- Sao lưu & khôi phục ----------

test('khôi phục sao lưu: ghi cài đặt / quy tắc / mẫu bài, giữ Chạy thử khi chọn, gộp hồ sơ, ghi nhật ký', async () => {
  const env = makeEnv();
  const u = { id: 'u9', username: 'chi', fullname: 'Chi' };
  const data = {
    settings: { dryRun: false, autoApprove: true, intervalMin: 60 },
    rules: { bannedKeywords: ['casino'] },
    groupRules: { gFood: { name: 'Food Research', rules: { requireAvatar: false }, postRules: {} } },
    templates: [{ id: 't1', name: 'Chào mừng', text: 'Chào bạn' }],
    profiles: { users: { u9: { user: u, events: [{ type: 'banned', key: 'ban:u9', time: '2026-10-01T00:00:00Z', group: 'Food Research' }] } } },
  };
  const r = await env.send({ type: 'restoreBackup', data, keepDry: true });
  assert.equal(r.status, 'ok');
  assert.deepEqual([env.storage.settings.dryRun, env.storage.settings.autoApprove, env.storage.settings.intervalMin, env.storage.settings.notify], [true, true, 60, true]);
  assert.deepEqual(env.storage.rules.bannedKeywords, ['casino']);
  assert.equal(env.storage.groupRules.gFood.rules.requireAvatar, false);
  assert.equal(env.storage.templates[0].name, 'Chào mừng');
  assert.equal(env.storage.profiles.users.u9.events.length, 1);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action], ['backup', 'restore']);
  assert.match(env.storage.log[0].message, /Chạy thử: bật/);
  // Không giữ Chạy thử: lấy đúng theo bản sao lưu; khôi phục lần nữa không nhân đôi hồ sơ
  await env.send({ type: 'restoreBackup', data });
  assert.equal(env.storage.settings.dryRun, false);
  assert.equal(env.storage.profiles.users.u9.events.length, 1);
  assert.equal(env.calls.length, 0); // không gọi Beincom
  const bad = await env.send({ type: 'restoreBackup', data: { foo: 1 } });
  assert.match(bad.message, /không có dữ liệu/);
});

// ---------- Bình luận ----------

const cmt = (id, text, extra = {}) => ({ id, postId: 't1', parentId: '00000000-0000-0000-0000-000000000000', content: text, actor: { id: 'u' + id, username: 'nguoi' + id, fullname: 'Người ' + id, avatar: '' }, createdAt: '2026-10-07T11:00:00Z', totalReply: 0, media: { images: [] }, ...extra });

test('quét bình luận: chỉ đọc bài có bình luận mới, chấm theo quy tắc, lần sau báo bình luận mới vi phạm', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 2; // t1
  // Danh sách bình luận không kèm trả lời; trả lời đọc riêng (parentId)
  data.comments = { t1: [cmt('c1', 'Bài hay quá'), cmt('c2', 'Vào nhóm t.me/kiemtien nhận quà', { totalReply: 1 })] };
  data.replies = { c2: [cmt('c3', 'Cảm ơn', { parentId: 'c2', createdAt: '2026-10-07T11:05:00Z' })] };
  const env = makeEnv({ data, postRules: { blockedDomains: ['t.me'] } });
  const commentCalls = () => env.calls.filter((c) => c.startsWith('GET content/comments'));
  await scan(env);
  // t2, t3 không có bình luận; c1 không có trả lời
  assert.deepEqual(commentCalls(), ['GET content/comments?postId=t1&limit=25', 'GET content/comments?postId=t1&parentId=c2&limit=25']);
  const list = env.storage.state.recentComments;
  assert.deepEqual(list.map((c) => [c.id, c.parentId, c.postId]), [['c3', 'c2', 't1'], ['c1', '', 't1'], ['c2', '', 't1']]);
  assert.deepEqual(list.find((c) => c.id === 'c2').seenIn, ['gCL']);
  assert.equal(env.storage.state.commentSeen.t1, 2);
  const withComments = Number(env.badge.text); // đã gồm 1 bình luận vi phạm (c2)
  assert.equal(env.notifications.length, 0); // lần đầu chỉ ghi nhận
  // Lần sau: số bình luận không đổi -> không đọc lại
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(commentCalls().length, 2);
  // Có bình luận mới vi phạm -> đọc lại bài đó (trả lời của c2 không tăng -> không đọc lại) và thông báo
  env.data.timeline.gCL[0].commentsCount = 3;
  env.data.comments.t1.unshift(cmt('c4', 'Kèo x100 tại t.me/keo', { createdAt: '2026-10-07T12:00:00Z' }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(commentCalls().length, 3);
  assert.deepEqual(env.notifications.map((n) => n.id), ['bg-comments']);
  assert.match(env.notifications[0].title, /1 bình luận mới vi phạm/);
  assert.equal(Number(env.badge.text), withComments + 1);
  // Hồ sơ vi phạm ghi người viết bình luận vi phạm
  assert.ok(env.storage.profiles.users.uc4.events.some((e) => e.key === 'rule:c:c4'));
  // Tắt quét bình luận: không đọc, không đếm
  env.storage.settings.scanComments = false;
  env.data.timeline.gCL[0].commentsCount = 9;
  await scan(env);
  assert.equal(commentCalls().length, 3);
  assert.equal(Number(env.badge.text), withComments - 1);
});

test('bình luận: ẩn đúng API và body, chạy thử không gửi, bỏ qua chỉ trong addon, bình luận đã xoá tính là xong', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 3;
  data.comments = { t1: [cmt('c1', 'Spam t.me/x'), cmt('c2', 'Spam 2'), cmt('c9', 'Đã bị xoá trên web')] };
  data.goneComments = ['c9'];
  const dry = makeEnv({ data });
  await scan(dry);
  const d = await dry.send({ type: 'commentAct', action: 'hide', commentIds: ['c1'], reasonType: 'SPAM' });
  assert.deepEqual([d.dryRun, d.dry, dry.calls.some((c) => c.includes('/hide'))], [true, 1, false]);

  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'commentAct', action: 'hide', commentIds: ['c1', 'c9'], reasonType: 'SPAM' });
  assert.deepEqual([r.ok, r.failed, r.gone], [2, 0, 1]);
  assert.deepEqual(env.bodies.filter(([c]) => c.endsWith('/hide')), [['POST content/comments/c1/hide', { reasonType: 'SPAM' }], ['POST content/comments/c9/hide', { reasonType: 'SPAM' }]]);
  const st = env.storage.state.recentComments;
  assert.equal(st.find((c) => c.id === 'c1').isHidden, true);
  assert.ok(!st.some((c) => c.id === 'c9'));
  const e = env.storage.log.find((x) => x.contentId === 'c1');
  assert.deepEqual([e.kind, e.action, e.reason, e.postId, e.groupName], ['comment', 'hide', 'Spam / quảng cáo', 't1', 'Crypto Life']);
  assert.ok(env.storage.profiles.users.uc1.events.some((x) => x.key === 'hidden:c:c1'));
  // Bỏ qua / hiện lại: không gọi API
  const before = env.calls.length;
  await env.send({ type: 'commentAct', action: 'dismiss', commentIds: ['c2'] });
  assert.equal(env.storage.state.recentComments.find((c) => c.id === 'c2').dismissed, true);
  await env.send({ type: 'commentAct', action: 'undismiss', commentIds: ['c2'] });
  assert.equal(env.storage.state.recentComments.find((c) => c.id === 'c2').dismissed, false);
  assert.equal(env.calls.length, before);
  assert.match((await env.send({ type: 'commentAct', action: 'xoa', commentIds: ['c2'] })).message, /không hợp lệ/);
});

// ---------- Đăng dưới tên group ----------

test('đăng dưới tên group: nháp qua API quản trị group rồi đăng như thường; chỉ một group, cần quyền; Beincom chưa bật thì báo rõ', async () => {
  const data = fixture();
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const gs = Object.fromEntries(env.storage.state.snapshot.groups.map((g) => [g.id, g]));
  assert.deepEqual([gs.gFood.canPostAsGroup, gs.gCL.canPostAsGroup], [true, false]);
  const r = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Thông báo từ ban quản trị', asGroup: true });
  assert.equal(r.ok, 1);
  assert.deepEqual(writes(env), ['POST content/manage/groups/gFood/posts', 'PUT content/posts/grp1/publish']);
  assert.deepEqual(env.bodies[0], ['POST content/manage/groups/gFood/posts', { audience: { groupIds: ['gFood'] }, isEnableDonation: false }]);
  assert.deepEqual([env.storage.log[0].asGroup, env.storage.log[0].snippet], [true, '[Tên group] Thông báo từ ban quản trị']);
  // Hai group / không có quyền: không gọi API
  const before = writes(env).length;
  assert.match((await env.send({ type: 'compose', groupIds: ['gFood', 'gCL'], content: 'x', asGroup: true })).message, /chỉ chọn một group/);
  assert.match((await env.send({ type: 'compose', groupIds: ['gCL'], content: 'x', asGroup: true })).message, /không có quyền đăng dưới tên group/);
  assert.equal(writes(env).length, before);
  // Bài thường vẫn tạo nháp như cũ
  await env.send({ type: 'compose', groupIds: ['gCL'], content: 'Bài thường' });
  assert.equal(writes(env).at(-2), 'POST content/posts');
  // Beincom chưa bật tính năng: báo lỗi, không có nháp thừa
  env.data.groupPostOff = true;
  const off = await env.send({ type: 'compose', groupIds: ['gFood'], content: 'y', asGroup: true });
  assert.match(off.errors[0], /có thể Beincom chưa bật tính năng này/);
});

// ---------- Spam: tự ẩn, đợt spam, cấm ở mọi community ----------

const nowIso = (minAgo = 0) => new Date(Date.now() - minAgo * 60e3).toISOString();

test('tự ẩn spam: chỉ bài / bình luận MỚI có link tới tên miền cấm, không ẩn bài của mình, ghi nhật ký và thông báo', async () => {
  const data = fixture();
  // Lần quét đầu: t2 có bit.ly (cấm) nhưng là bài cũ -> chỉ ghi nhận, không tự ẩn
  data.timeline.gCL[0].commentsCount = 1;
  data.comments = { t1: [cmt('c1', 'Bài hay', { createdAt: nowIso(30) })] };
  const env = makeEnv({ data, settings: { dryRun: false, autoHideSpam: true }, postRules: { blockedDomains: ['bit.ly', 't.me'], bannedKeywords: ['kèo'] } });
  await scan(env);
  assert.ok(!env.calls.some((c) => c.endsWith('/hide')));
  // Lần sau: bài mới có link cấm, bài của chính mình có link cấm, bài chỉ dính từ khoá, bình luận mới có link cấm
  env.data.timeline.gCL.unshift(
    post('t5', 'Nhận quà tại t.me/quamienphi', { publishedAt: nowIso(5) }),
    post('t6', 'Admin nhắc: đừng vào t.me/gia', { publishedAt: nowIso(4), actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto', avatar: '' } }),
    post('t7', 'Kèo thơm hôm nay', { publishedAt: nowIso(3) }),
  );
  env.data.timeline.gCL.find((p) => p.id === 't1').commentsCount = 2;
  env.data.comments.t1.unshift(cmt('c5', 'Vào t.me/abc nhận 100 USDT', { createdAt: nowIso(2) }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.deepEqual(env.bodies.filter(([c]) => c.endsWith('/hide')), [
    ['POST content/contents/t5/hide', { reasonType: 'SPAM', groupIds: ['gCL'] }],
    ['POST content/comments/c5/hide', { reasonType: 'SPAM' }],
  ]);
  const st = env.storage.state;
  assert.deepEqual([st.recentPosts.find((p) => p.id === 't5').isHidden, st.recentPosts.find((p) => p.id === 't6').isHidden, st.recentPosts.find((p) => p.id === 't7').isHidden, st.recentComments.find((c) => c.id === 'c5').isHidden], [true, false, false, true]);
  const auto = env.storage.log.filter((e) => e.source === 'auto');
  assert.deepEqual(auto.map((e) => [e.kind, e.action, e.contentId, e.autoReason]), [
    ['comment', 'hide', 'c5', 'Link tới tên miền cấm: t.me'],
    ['post', 'hide', 't5', 'Link tới tên miền cấm: t.me'],
  ]);
  assert.ok(env.notifications.some((n) => n.id === 'bg-autohide' && /đã tự ẩn 2/.test(n.title)));
  // Hồ sơ vi phạm: ẩn do addon
  assert.ok(env.storage.profiles.users.at5.events.some((e) => e.type === 'hidden' && e.by === 'Addon tự xử lý'));
});

test('tự ẩn spam: chạy thử chỉ ghi nhật ký; tắt thì không làm gì', async () => {
  for (const [settings, expectDry] of [[{ autoHideSpam: true }, 1], [{ dryRun: false, autoHideSpam: false }, 0]]) {
    const env = makeEnv({ settings, postRules: { blockedDomains: ['t.me'] } });
    await scan(env);
    env.data.timeline.gCL.unshift(post('t5', 'Nhận quà tại t.me/x', { publishedAt: nowIso(1) }));
    await scan(env);
    assert.ok(!env.calls.some((c) => c.endsWith('/hide')));
    assert.equal(env.storage.log.filter((e) => e.source === 'auto' && e.status === 'dry').length, expectDry);
    assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't5').isHidden, false);
  }
});

test('đợt spam: cùng link từ 3 tài khoản trong 6 giờ -> báo một lần; ẩn cả đợt; bỏ qua', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 3;
  data.comments = { t1: [cmt('w1', 'Xem ngay airdrop.vip/claim', { createdAt: nowIso(50) }), cmt('w2', 'Mọi người ơi airdrop.vip/claim?ref=2', { createdAt: nowIso(40) }), cmt('w3', 'https://airdrop.vip/claim/ chuẩn', { createdAt: nowIso(30) })] };
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env); // lần đầu: ghi nhận
  assert.equal(env.notifications.length, 0);
  assert.deepEqual(env.storage.state.knownWaves, ['link:airdrop.vip/claim']);
  // Thêm một bình luận nữa (vẫn đợt cũ) -> không báo lại
  env.data.timeline.gCL[0].commentsCount = 4;
  env.data.comments.t1.unshift(cmt('w4', 'airdrop.vip/claim', { createdAt: nowIso(10) }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.ok(!env.notifications.some((n) => n.id === 'bg-wave'));
  // Đợt mới -> báo
  env.data.timeline.gCL.unshift(post('t8', 'Free coin tại coinfree.xyz/go', { publishedAt: nowIso(9), actor: { id: 'x1', username: 'x1', fullname: 'X1', avatar: '' } }), post('t9', 'coinfree.xyz/go nhanh', { publishedAt: nowIso(8), actor: { id: 'x2', username: 'x2', fullname: 'X2', avatar: '' } }), post('t10', 'coinfree.xyz/go', { publishedAt: nowIso(7), actor: { id: 'x3', username: 'x3', fullname: 'X3', avatar: '' } }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const wave = env.notifications.filter((n) => n.id === 'bg-wave');
  assert.equal(wave.length, 1);
  assert.match(wave[0].message, /coinfree\.xyz\/go: 3 tài khoản, 3 bài/);
  // Ẩn cả đợt (bài + bình luận) một lần
  const r = await env.send({ type: 'spamAct', action: 'hide', key: 'link:airdrop.vip/claim', postIds: [], commentIds: ['w1', 'w2', 'w3', 'w4'], reasonType: 'SPAM' });
  assert.deepEqual([r.ok, r.failed], [4, 0]);
  assert.equal(env.storage.state.recentComments.filter((c) => c.isHidden).length, 4);
  await env.send({ type: 'spamAct', action: 'hide', postIds: ['t8', 't9'], commentIds: [], reasonType: 'SPAM' });
  assert.deepEqual(env.bodies.filter(([c]) => c.startsWith('POST content/contents/t')).map(([c]) => c).sort(), ['POST content/contents/t8/hide', 'POST content/contents/t9/hide']);
  // Bỏ qua / hiện lại đợt: chỉ trong addon
  await env.send({ type: 'spamAct', action: 'dismiss', key: 'link:coinfree.xyz/go' });
  assert.deepEqual(env.storage.state.dismissedWaves, ['link:coinfree.xyz/go']);
  await env.send({ type: 'spamAct', action: 'undismiss', key: 'link:coinfree.xyz/go' });
  assert.deepEqual(env.storage.state.dismissedWaves, []);
});

test('cấm ở mọi community: chỉ community mình là chủ / admin, đúng API và body, ghi nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'banEverywhere', user: { id: 'u99', username: 'spam', fullname: 'Spam Bot' }, reason: 'SPAM' });
  assert.deepEqual([r.ok, r.done], [1, ['gFood']]);
  assert.deepEqual(env.bodies.at(-1), ['POST group/communities/cFood/users/u99/ban', { reason: 'SPAM' }]);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action, env.storage.log[0].communityName], ['manage', 'ban', 'Food Research']);
  assert.match((await env.send({ type: 'banEverywhere', user: { id: 'u99' }, reason: 'XYZ' })).message, /Lý do cấm không hợp lệ/);
});

// ---------- Viết bình luận, chào thành viên mới ----------

test('viết bình luận vào bài và trả lời bình luận: đúng API và body, ghi nhật ký, thêm vào danh sách; chạy thử không gửi', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 1;
  data.comments = { t1: [cmt('c1', 'Ví nào tốt cho người mới?', { createdAt: nowIso(30) })] };
  const dry = makeEnv({ data });
  await scan(dry);
  const d = await dry.send({ type: 'commentWrite', postId: 't1', content: 'Thử' });
  assert.deepEqual([d.dryRun, d.dry, dry.calls.some((c) => c.startsWith('POST content/comments'))], [true, 1, false]);

  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const mentions = { nguoic1: { id: 'uc1', fullname: 'Người c1', username: 'nguoic1', avatar: '' } };
  const r = await env.send({ type: 'commentWrite', postId: 't1', commentId: 'c1', content: '@nguoic1 dùng ví Beincom nhé', mentions });
  assert.equal(r.ok, 1);
  assert.deepEqual(env.bodies.at(-1), ['POST content/comments/c1/reply', { postId: 't1', content: '@nguoic1 dùng ví Beincom nhé', media: { images: [] }, mentions }]);
  await env.send({ type: 'commentWrite', postId: 't3', content: '  Admin đã xem, sẽ trả lời sớm  ' });
  assert.deepEqual(env.bodies.at(-1), ['POST content/comments', { postId: 't3', content: 'Admin đã xem, sẽ trả lời sớm', media: { images: [] }, mentions: {} }]);
  const [e2, e1] = env.storage.log;
  assert.deepEqual([e1.kind, e1.action, e1.replyTo, e1.postId, e1.groupName], ['comment', 'reply', 'c1', 't1', 'Crypto Life']);
  assert.deepEqual([e2.action, e2.groupName], ['comment', 'Crypto Life - General']);
  const mine = env.storage.state.recentComments.filter((c) => c.actor.id === 'me1');
  assert.deepEqual(mine.map((c) => [c.postId, c.parentId]).sort(), [['t1', 'c1'], ['t3', '']]);
  // Không có nội dung / lỗi từ Beincom
  assert.match((await env.send({ type: 'commentWrite', postId: 't1', content: '   ' })).message, /chưa có nội dung/);
  env.data.commentFail = true;
  const bad = await env.send({ type: 'commentWrite', postId: 't1', content: 'x' });
  assert.deepEqual([bad.failed, bad.errors], [1, ['Comment is invalid']]);
});

test('tìm người mới: group gốc đọc danh sách thành viên mới vào trước (bỏ admin), group con đọc nhật ký (bỏ người đã rời)', async () => {
  const data = fixture();
  const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
  data.members.cFood = [
    { ...user(31), joinedAt: daysAgo(10), isCommunityAdmin: false },
    { ...user(32), fullname: 'Trần Nguyên', joinedAt: daysAgo(2), isCommunityAdmin: false },
    { ...user(33), joinedAt: daysAgo(4), isCommunityAdmin: true },
    { ...user(34), joinedAt: daysAgo(6), isCommunityAdmin: false },
  ];
  data.activity.gCLsub = [
    { id: 'a1', eventTime: daysAgo(1), eventType: 'CREATE', useCase: 'join.group.as_member', data: { actor: user(42) } },
    { id: 'a2', eventTime: daysAgo(2), eventType: 'DELETE', useCase: 'leave.group', data: { actor: user(45) } },
    { id: 'a3', eventTime: daysAgo(3), eventType: 'CREATE', useCase: 'join.group.as_member', data: { actor: user(45) } },
    { id: 'a4', eventTime: daysAgo(9), eventType: 'CREATE', useCase: 'join.group.as_member', data: { actor: user(46) } },
  ];
  const env = makeEnv({ data });
  await scan(env);
  const a = await env.send({ type: 'newMembers', groupId: 'gFood', days: 7 });
  assert.deepEqual([a.source, a.items.map((u) => u.id)], ['members', ['u32', 'u34']]);
  assert.ok(env.calls.includes('GET group/manage/communities/cFood/members?limit=50&offset=0&sort=joined_at%3Adesc'));
  const b = await env.send({ type: 'newMembers', groupId: 'gCLsub', days: 7 });
  assert.deepEqual([b.source, b.items.map((u) => u.id)], ['activity', ['u42']]);
  assert.ok(!env.calls.some((c) => c.startsWith('POST') || c.startsWith('PUT')));
});

// ---------- Theo dõi từ khoá, nhắc bài chưa ai trả lời ----------

test('theo dõi từ khoá: chỉ báo bài / bình luận MỚI nhắc tới (không phải của mình, lần đầu chỉ ghi nhận)', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 1;
  data.comments = { t1: [cmt('c1', 'Mình bị lừa đảo mất tiền rồi', { createdAt: nowIso(60) })] };
  const env = makeEnv({ data, settings: { watchKeywords: ['lừa đảo', 'rút tiền'] } });
  await scan(env); // lần đầu: c1 có từ khoá nhưng chỉ ghi nhận
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.ok(!env.notifications.some((n) => n.id === 'bg-watch'));
  env.data.timeline.gCL.unshift(
    post('t5', 'Sàn này không RÚT TIỀN được, ai biết không?', { publishedAt: nowIso(5) }),
    post('t6', 'Admin: cảnh giác lừa đảo nhé', { publishedAt: nowIso(4), actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto', avatar: '' } }),
  );
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const w = env.notifications.filter((n) => n.id === 'bg-watch');
  assert.equal(w.length, 1);
  assert.match(w[0].title, /1 bài \/ bình luận nhắc tới rút tiền/);
  assert.match(w[0].message, /^Tác giả t5: Sàn này không RÚT TIỀN/);
  // Không có từ khoá thì không đọc gì thêm
  const off = makeEnv();
  await scan(off);
  assert.ok(!off.notifications.some((n) => n.id === 'bg-watch'));
});

test('nhắc bài chưa ai trả lời: quá số giờ trong cài đặt, mỗi bài một lần, bỏ bài của mình', async () => {
  const data = fixture();
  data.timeline.gCL = [
    post('q1', 'Cho hỏi ví nào an toàn?', { publishedAt: nowIso(7 * 60), commentsCount: 0 }),
    post('q2', 'Câu hỏi mới đăng', { publishedAt: nowIso(60), commentsCount: 0 }),
    post('q3', 'Đã có người trả lời', { publishedAt: nowIso(8 * 60), commentsCount: 2 }),
    post('q4', 'Bài admin', { publishedAt: nowIso(9 * 60), commentsCount: 0, actor: { id: 'me1', username: 'kai', fullname: 'Kai', avatar: '' } }),
  ];
  data.timeline.gCLsub = [];
  const env = makeEnv({ data, settings: { remindUnanswered: true, unansweredHours: 6 } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  let r = env.notifications.filter((n) => n.id === 'bg-unanswered');
  assert.equal(r.length, 1);
  assert.match(r[0].title, /1 bài chưa ai trả lời quá 6 giờ/);
  assert.deepEqual(env.storage.state.remindedIds, ['q1']);
  // Lần sau không nhắc lại q1; q2 chưa đủ giờ
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  r = env.notifications.filter((n) => n.id === 'bg-unanswered');
  assert.equal(r.length, 1);
  // Quét bấm tay không thông báo
  const manual = makeEnv({ data, settings: { remindUnanswered: true, unansweredHours: 6 } });
  await scan(manual);
  assert.ok(!manual.notifications.some((n) => n.id === 'bg-unanswered'));
});

test('nhắc việc chờ lâu: yêu cầu tham gia / bài chờ duyệt quá số giờ, mỗi việc một lần; việc đã xong rơi khỏi danh sách; quét bấm tay không nhắc', async () => {
  const now = Date.parse('2026-10-08T12:00:00Z'); // yêu cầu gửi lúc 07/10 10:00 (26 giờ), bài p1 gửi lúc 07/10 08:00 (28 giờ)
  const data = fixture();
  const env = makeEnv({ data, now, settings: { remindPending: true, pendingHours: 24 } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  let r = env.notifications.filter((n) => n.id === 'bg-pending');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'BeinGroup: 4 việc chờ quá 24 giờ');
  assert.equal(r[0].message, '3 yêu cầu tham gia (Food Research), 1 bài chờ duyệt (Crypto Life). Lâu nhất đã chờ 28 giờ. Bấm để xử lý.');
  assert.deepEqual(env.storage.state.pendingReminded, ['appr:p1', 'req:jr1', 'req:jr2', 'req:jr3']);
  // Lần sau: không nhắc lại; một yêu cầu đã xử lý trên web thì rơi khỏi danh sách; yêu cầu cũ mới thấy thì nhắc riêng
  data.requests.gFood = data.requests.gFood.filter((x) => x.id !== 'jr2');
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.filter((n) => n.id === 'bg-pending').length, 1);
  assert.deepEqual(env.storage.state.pendingReminded, ['appr:p1', 'req:jr1', 'req:jr3']);
  data.requests.gFood.push(jr(9, { createdAt: '2026-10-05T12:00:00Z' }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  r = env.notifications.filter((n) => n.id === 'bg-pending');
  assert.equal(r.length, 2);
  assert.equal(r[1].title, 'BeinGroup: 1 việc chờ quá 24 giờ');
  assert.match(r[1].message, /^1 yêu cầu tham gia \(Food Research\)\. Lâu nhất đã chờ 3 ngày/);
  // Chưa đủ giờ: không nhắc; quét bấm tay: không nhắc; tắt: không nhắc
  const early = makeEnv({ data: fixture(), now, settings: { remindPending: true, pendingHours: 48 } });
  early.listeners.alarm({ name: 'beingroup-scan' });
  await scan(early, 'popup');
  assert.ok(!early.notifications.some((n) => n.id === 'bg-pending'));
  const manual = makeEnv({ data: fixture(), now, settings: { remindPending: true } });
  await scan(manual);
  assert.ok(!manual.notifications.some((n) => n.id === 'bg-pending'));
  assert.equal(manual.storage.state.pendingReminded, undefined);
});

// ---------- Đồng bộ cài đặt giữa các máy ----------

const tick = () => new Promise((r) => setTimeout(r, 10));

test('đồng bộ: tắt thì không gửi; bật thì gửi cài đặt (bỏ trường của máy), quy tắc; đổi quy tắc thì gửi lại', async () => {
  const env = makeEnv({ rules: { bannedKeywords: ['spam'] } });
  env.listeners.storage({ rules: { newValue: {} } }, 'local');
  await tick();
  assert.equal(env.syncWrites.length, 0);
  const st0 = await env.send({ type: 'syncStatus' });
  assert.deepEqual([st0.keys, st0.fromOther], [[], false]);
  const r = await env.send({ type: 'syncNow', mode: 'push', enable: true });
  assert.equal(r.status, 'ok');
  assert.equal(env.storage.settings.syncSettings, true);
  assert.deepEqual(r.keys.sort(), ['postRules', 'rules', 'settings']);
  const sv = env.syncStore.settings.v;
  assert.ok(!('active' in sv) && !('syncSettings' in sv) && sv.dryRun === true);
  assert.deepEqual(env.syncStore.rules.v.bannedKeywords, ['spam']);
  assert.equal(env.syncStore.rules.from, env.storage.deviceId);
  // Máy này đổi quy tắc -> gửi lên sau một nhịp
  env.storage.rules = { ...env.storage.rules, bannedKeywords: ['spam', 'casino'] };
  env.listeners.storage({ rules: { newValue: env.storage.rules } }, 'local');
  await tick();
  assert.deepEqual(env.syncStore.rules.v.bannedKeywords, ['spam', 'casino']);
  assert.match((await env.send({ type: 'syncStatus' })).last.dir, /push/);
});

test('đồng bộ: nhận từ máy khác (làm sạch, giữ công tắc của máy này), không gửi ngược lại; lấy về / mục quá 8 KB', async () => {
  const env = makeEnv({ settings: { syncSettings: true } });
  const at = Date.now();
  env.listeners.storage(
    {
      rules: { newValue: { v: { bannedKeywords: ['lừa đảo', 5], evil: 1 }, at, from: 'other' } },
      settings: { newValue: { v: { dryRun: false, intervalMin: 60, active: false, syncSettings: false }, at, from: 'other' } },
      log: { newValue: { v: [], at, from: 'other' } }, // không phải khoá đồng bộ
    },
    'sync',
  );
  await tick();
  assert.deepEqual(env.storage.rules.bannedKeywords, ['lừa đảo']);
  assert.ok(!('evil' in env.storage.rules));
  assert.deepEqual([env.storage.settings.intervalMin, env.storage.settings.dryRun, env.storage.settings.active, env.storage.settings.syncSettings], [60, false, true, true]);
  assert.equal(env.storage.log, undefined);
  // Ghi local do nhận về -> không gửi ngược lại
  env.listeners.storage({ rules: { newValue: env.storage.rules }, settings: { newValue: env.storage.settings } }, 'local');
  await tick();
  assert.equal(env.syncWrites.length, 0);
  // Tự ghi của chính máy này trên bản đồng bộ thì bỏ qua
  const myId = env.storage.deviceId;
  env.listeners.storage({ postRules: { newValue: { v: { blockedDomains: ['x.y'] }, at, from: myId } } }, 'sync');
  await tick();
  assert.equal(env.storage.postRules.blockedDomains.length, 0);
  // syncStatus thấy bản từ máy khác; lấy về toàn bộ
  env.syncStore.postRules = { v: { blockedDomains: ['t.me'] }, at: at + 1, from: 'other' };
  const st = await env.send({ type: 'syncStatus' });
  assert.equal(st.fromOther, true);
  const pull = await env.send({ type: 'syncNow', mode: 'pull' });
  assert.ok(pull.keys.includes('postRules'));
  assert.deepEqual(env.storage.postRules.blockedDomains, ['t.me']);
  // Quy tắc riêng quá 8 KB: bỏ qua và ghi rõ
  env.storage.groupRules = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['g' + i, { name: 'Group ' + i, rules: { bannedKeywords: Array.from({ length: 20 }, (_, j) => 'tu-khoa-' + j) }, postRules: {} }]));
  const push = await env.send({ type: 'syncNow', mode: 'push' });
  assert.deepEqual(push.skipped, ['groupRules']);
  assert.ok(!('groupRules' in env.syncStore));
  assert.deepEqual(env.storage.syncStatus.skipped, ['groupRules']);
});

test('khôi phục sao lưu giữ công tắc đồng bộ của máy này', async () => {
  const env = makeEnv({ settings: { syncSettings: true } });
  await env.send({ type: 'restoreBackup', data: { settings: { syncSettings: false, intervalMin: 120 } } });
  assert.deepEqual([env.storage.settings.syncSettings, env.storage.settings.intervalMin], [true, 120]);
});

// ---------- Gửi thông báo về Telegram ----------

const TG_TOKEN = '123456789:' + 'A'.repeat(35); // dạng token giả, không phải token thật

test('Telegram: quét tự động gửi tin đúng loại (kể cả khi tắt thông báo máy tính), có link; loại tắt thì không gửi', async () => {
  const data = fixture();
  const env = makeEnv({ data, settings: { notify: false }, postRules: { blockedDomains: ['t.me'] } });
  env.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { violations: true, queue: false } };
  await scan(env); // lần đầu: chỉ ghi nhận
  env.data.timeline.gCL.unshift(post('t5', 'Vào t.me/abc <nhận quà>', { publishedAt: nowIso(5) }));
  env.data.requests.gFood.push(jr(9)); // yêu cầu mới: loại "queue" đang tắt
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.length, 0); // tắt thông báo máy tính
  const sent = env.tg.filter((m) => m.method === 'sendMessage');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, TG_TOKEN);
  assert.deepEqual([sent[0].body.chat_id, sent[0].body.parse_mode, sent[0].body.disable_web_page_preview], ['42', 'HTML', true]);
  assert.match(sent[0].body.text, /^<b>BeinGroup: 1 bài mới vi phạm quy tắc<\/b>\nTác giả t5\n<a href="https:\/\/group\.beincom\.com\/posts\/t5">Mở trên Beincom<\/a>$/);
  assert.equal(env.storage.telegramStatus.ok, true);
  // Bấm Quét ngay trên Dashboard: không gửi
  env.data.timeline.gCL.unshift(post('t6', 'Lại t.me/xyz', { publishedAt: nowIso(1) }));
  await scan(env);
  assert.equal(env.tg.filter((m) => m.method === 'sendMessage').length, 1);
  // Tắt Telegram: không gửi gì
  const off = makeEnv({ data: fixture(), postRules: { blockedDomains: ['t.me'] } });
  off.storage.telegram = { enabled: false, token: TG_TOKEN, chatId: '42' };
  await scan(off);
  off.data.timeline.gCL.unshift(post('t5', 'Vào t.me/abc', { publishedAt: nowIso(5) }));
  off.listeners.alarm({ name: 'beingroup-scan' });
  await scan(off, 'popup');
  assert.equal(off.tg.length, 0);
  assert.ok(off.notifications.some((n) => n.id === 'bg-flagged'));
});

test('Telegram: gửi thử, lấy chat ID, báo lỗi dễ hiểu (token sai, chưa bấm Start, sai dạng)', async () => {
  const data = fixture();
  data.tgUpdates = [{ update_id: 1, message: { chat: { id: 111, first_name: 'Cũ' } } }, { update_id: 2, message: { chat: { id: 777, first_name: 'Kai', last_name: 'Crypto' } } }];
  const env = makeEnv({ data });
  assert.match((await env.send({ type: 'telegramTest', token: 'abc', chatId: '1' })).message, /chưa đúng dạng/);
  assert.match((await env.send({ type: 'telegramTest', token: TG_TOKEN, chatId: '' })).message, /Chưa có chat ID/);
  assert.equal(env.tg.length, 0);
  const ok = await env.send({ type: 'telegramTest', token: TG_TOKEN, chatId: '777' });
  assert.equal(ok.status, 'ok');
  assert.match(env.tg.at(-1).body.text, /tin thử/);
  assert.deepEqual(await env.send({ type: 'telegramChatId', token: TG_TOKEN }), { status: 'ok', chatId: '777', name: 'Kai Crypto' });
  env.data.tgUpdates = [];
  assert.match((await env.send({ type: 'telegramChatId', token: TG_TOKEN })).message, /bấm Start/);
  env.data.tgNoChat = true;
  assert.match((await env.send({ type: 'telegramTest', token: TG_TOKEN, chatId: '5' })).message, /Chat ID không đúng/);
  env.data.tgBadToken = true;
  assert.match((await env.send({ type: 'telegramTest', token: TG_TOKEN, chatId: '5' })).message, /Token bot không đúng/);
  assert.deepEqual([env.storage.telegramStatus.ok, env.storage.telegramStatus.error], [false, 'Token bot không đúng']);
  // Token không nằm trong sao lưu / đồng bộ
  env.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '5' };
  assert.ok(!('telegram' in BG.makeBackup(env.storage).data));
});

// ---------- Article và Series ----------

const ART = (extra = {}) => ({ type: 'composeArticle', groupIds: ['gCL'], title: '  Bản tin tuần  ', summary: 'Tóm tắt', content: '## Mở đầu\nĐoạn **đậm**', categoryIds: ['cat1'], coverId: 'cov1', ...extra });

test('Article: đọc chuyên mục; đăng = tạo nháp rồi publish với nội dung dạng trình soạn thảo, ghi nhật ký', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const cats = await env.send({ type: 'categories' });
  assert.deepEqual(cats.items, [{ id: 'cat1', name: 'Business & Finance', slug: 'business-finance' }, { id: 'cat2', name: 'Technology', slug: 'technology' }]);
  assert.ok(env.calls.includes('GET content/category?name='));
  const r = await env.send(ART());
  assert.deepEqual([r.status, r.ok, r.contentId, r.postStatus], ['ok', 1, 'art1', 'PUBLISHED']);
  assert.deepEqual(writes(env), ['POST content/articles', 'PUT content/articles/art1/publish']);
  assert.deepEqual(env.bodies[0][1], { audience: { groupIds: ['gCL'] }, isEnableDonation: false });
  const b = env.bodies[1][1];
  assert.deepEqual(Object.keys(b).sort(), ['audience', 'categories', 'content', 'coverMedia', 'mentions', 'series', 'summary', 'tags', 'title', 'wordCount']);
  assert.deepEqual([b.audience, b.categories, b.coverMedia, b.title, b.summary, b.wordCount, b.mentions], [{ groupIds: ['gCL'], userIds: [] }, ['cat1'], { id: 'cov1' }, 'Bản tin tuần', 'Tóm tắt', 4, {}]);
  const nodes = JSON.parse(b.content);
  assert.deepEqual(
    nodes.map((n) => [n.type, n.id.length, n.children]),
    [
      ['h2', 21, [{ text: 'Mở đầu' }]],
      ['p', 21, [{ text: 'Đoạn ' }, { text: 'đậm', bold: true }]],
    ],
  );
  const [e] = env.storage.log;
  assert.deepEqual([e.kind, e.action, e.status, e.contentType, e.contentId, e.snippet], ['compose', 'publish', 'ok', 'ARTICLE', 'art1', '[Article] Bản tin tuần — Tóm tắt']);
});

test('Article: hẹn giờ kèm series / tag (kiểm tra trước), dưới tên group; lỗi thì xoá nháp; thiếu dữ liệu thì không gọi API', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const at = new Date(Date.now() + 5 * 3600e3).toISOString();
  const r = await env.send(ART({ groupIds: ['gFood'], scheduledAt: at, series: [{ id: 'sF1', title: 'Series F' }], tags: [{ id: 'tF1', name: 'tag' }], asGroup: true }));
  assert.deepEqual([r.ok, r.postStatus], [1, 'WAITING_SCHEDULE']);
  assert.deepEqual(writes(env), ['POST content/contents/validate-series-tags', 'POST content/manage/groups/gFood/articles', 'PUT content/articles/gart1/schedule']);
  const b = env.bodies.find(([c]) => c === 'PUT content/articles/gart1/schedule')[1];
  assert.deepEqual([b.scheduledAt, b.series, b.tags], [at, ['sF1'], ['tF1']]);
  assert.match(env.storage.log[0].snippet, /^\[Article\] \[Tên group\] /);
  // Tag không dùng được: báo tên, không tạo nháp
  const bad = await env.send(ART({ groupIds: ['gFood'], tags: [{ id: 'tBad1', name: 'tag cũ' }] }));
  assert.match(bad.message, /tag cũ/);
  assert.equal(env.calls.filter((c) => c === 'POST content/articles').length, 0);
  // Publish lỗi: xoá nháp
  env.data.failArticle = true;
  const fail = await env.send(ART());
  assert.deepEqual([fail.status, fail.errors], ['error', ['Đăng Article lỗi: coverMedia is invalid']]);
  assert.deepEqual(writes(env).slice(-3), ['POST content/articles', 'PUT content/articles/art2/publish', 'DELETE content/articles/art2']);
  // Thiếu dữ liệu
  const before = writes(env).length;
  for (const [extra, re] of [
    [{ title: ' ' }, /tiêu đề/],
    [{ title: 'x'.repeat(65) }, /tối đa 64/],
    [{ summary: 'x'.repeat(256) }, /255/],
    [{ content: '   \n ' }, /chưa có nội dung/],
    [{ categoryIds: [] }, /chuyên mục/],
    [{ coverId: '' }, /ảnh bìa/],
    [{ groupIds: ['gCL', 'gFood'], asGroup: true }, /một group/],
    [{ scheduledAt: new Date(Date.now() + 60e3).toISOString() }, /ít nhất 5 phút/],
    [{ groupIds: ['gOther'] }, /quét lại/],
  ]) {
    const x = await env.send(ART(extra));
    assert.match(x.message, re, JSON.stringify(extra));
  }
  assert.equal(writes(env).length, before);
});

test('Article / Series: chạy thử chỉ ghi nhật ký', async () => {
  const env = makeEnv();
  await scan(env);
  const a = await env.send(ART());
  const s = await env.send({ type: 'composeSeries', groupIds: ['gCL'], title: 'Series mới', coverId: 'dry-run' });
  assert.deepEqual([a.dryRun, s.dryRun], [true, true]);
  assert.equal(writes(env).length, 0);
  assert.deepEqual(env.storage.log.map((e) => [e.status, e.contentType]), [['dry', 'SERIES'], ['dry', 'ARTICLE']]);
});

test('Series: tạo bằng content/series (hoặc dưới tên group) với body giống web', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'composeSeries', groupIds: ['gCL', 'gCLsub'], title: ' Kiến thức ví ', summary: 'Gom bài về ví', coverId: 'scov', isImportant: true });
  assert.deepEqual([r.status, r.contentId], ['ok', 'ser1'], r.message);
  assert.deepEqual(env.bodies[0], [
    'POST content/series',
    { title: 'Kiến thức ví', summary: 'Gom bài về ví', setting: { isImportant: true, importantExpiredAt: null, canComment: true, canReact: true, canShare: true }, coverMedia: { id: 'scov' }, audience: { groupIds: ['gCL', 'gCLsub'] } },
  ]);
  await env.send({ type: 'composeSeries', groupIds: ['gFood'], title: 'S2', coverId: 'c2', asGroup: true });
  assert.equal(writes(env).at(-1), 'POST content/manage/groups/gFood/series');
  assert.deepEqual(env.storage.log.map((e) => e.snippet), ['[Series] [Tên group] S2', '[Series] Kiến thức ví — Gom bài về ví']);
  const bad = await env.send({ type: 'composeSeries', groupIds: ['gCL'], title: 'S3', coverId: '' });
  assert.match(bad.message, /ảnh bìa/);
});

test('ảnh bìa: xin chỗ tải lên với resource article:cover / series:cover; loại khác bị từ chối', async () => {
  const env = makeEnv();
  await scan(env);
  await env.send({ type: 'uploadInit', kind: 'image', mimeType: 'image/jpeg', resource: 'article:cover' });
  await env.send({ type: 'uploadInit', kind: 'image', mimeType: 'image/png', resource: 'series:cover' });
  assert.deepEqual(env.bodies.map(([, b]) => b.resource), ['article:cover', 'series:cover']);
  const bad = await env.send({ type: 'uploadInit', kind: 'image', mimeType: 'image/png', resource: 'user:avatar' });
  assert.equal(bad.status, 'error');
  assert.equal(env.bodies.length, 2);
});

test('bài đã hẹn giờ gồm cả Article (tiêu đề, tóm tắt, ảnh bìa); huỷ Article xoá đúng chỗ', async () => {
  const data = fixture();
  data.scheduled.gCL.push({ id: 'a1', type: 'ARTICLE', title: 'Bản tin tuần', summary: 'Tóm tắt', content: '[{"type":"p"}]', coverMedia: { url: 'https://media.beincom.com/image/variants/article/cover/c1' }, actor: { id: 'me1', username: 'kai', fullname: 'Kai' }, audience: { groups: [{ id: 'gCL', name: 'Crypto Life' }] }, status: 'WAITING_SCHEDULE', scheduledAt: '2026-10-09T05:00:00Z' });
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const list = await env.send({ type: 'scheduled' });
  assert.ok(env.calls.includes('GET content/manage/groups/gCL/contents/scheduled?limit=25&type=ARTICLE'));
  const a = list.items.find((p) => p.id === 'a1');
  assert.deepEqual([a.type, a.title, a.text, a.thumbs], ['ARTICLE', 'Bản tin tuần', '### Bản tin tuần\n\nTóm tắt', ['https://media.beincom.com/image/variants/article/cover/c1']]);
  assert.equal(list.items.length, 3);
  const r = await env.send({ type: 'scheduleAct', action: 'cancel', contentId: 'a1', contentType: 'ARTICLE' });
  assert.equal(r.ok, 1);
  assert.deepEqual(writes(env), ['DELETE content/articles/a1']);
  assert.equal(env.storage.log[0].contentType, 'ARTICLE');
});

// ---------- Nút xử lý trong tin Telegram ----------

const tgSends = (env) => env.tg.filter((m) => m.method === 'sendMessage');
const tgPress = (env, id, token, act, chatId = 42) => {
  env.data.tgUpdates = [...(env.data.tgUpdates || []), { update_id: id, callback_query: { id: 'cq' + id, data: `${token}:${act}`, message: { chat: { id: chatId }, message_id: 7 } } }];
  return env.send({ type: 'telegramPoll' });
};

test('Telegram có nút: yêu cầu mới gửi tin riêng có nút (không gửi tin gộp); bấm Duyệt gọi đúng API, nhật ký ghi Telegram; bấm lại, sai chat, hết hạn thì không làm', async () => {
  const env = makeEnv({ settings: { notify: true, dryRun: false } });
  env.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { queue: true }, actions: true };
  await scan(env); // lần đầu: chỉ ghi nhận
  env.data.requests.gFood.push(jr(9, { membershipAnswers: [{ questionId: 'q1', answer: 'Bạn <rủ> vào' }] }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.ok(env.notifications.some((n) => n.id === 'bg-requests')); // máy tính vẫn báo như cũ
  const sent = tgSends(env);
  assert.equal(sent.length, 1); // không có tin gộp "1 yêu cầu tham gia mới"
  const m = sent[0].body;
  assert.match(m.text, /^<b>👤 Yêu cầu tham gia · Food Research<\/b>\n/);
  assert.match(m.text, /❓ Bạn biết nhóm qua đâu\?\n→ Bạn &lt;rủ&gt; vào/);
  assert.deepEqual(m.reply_markup.inline_keyboard[0].map((b) => b.text), ['✅ Duyệt', '❌ Từ chối']);
  assert.equal(m.reply_markup.inline_keyboard[1][0].text, 'Mở trên Beincom');
  const [token, a] = Object.entries(env.storage.tgActions)[0];
  assert.deepEqual([a.kind, a.data, a.messageId, m.reply_markup.inline_keyboard[0][0].callback_data], ['request', { groupId: 'gFood', requestId: 'jr9' }, 1, token + ':a']);

  const r = await tgPress(env, 10, token, 'a');
  assert.deepEqual(r, { status: 'ok', handled: 1 });
  assert.ok(env.calls.includes('PUT group/groups/gFood/joining-requests/jr9/approve'));
  assert.deepEqual([env.storage.log[0].action, env.storage.log[0].source, env.storage.log[0].status], ['approve', 'telegram', 'ok']);
  assert.equal(env.tg.find((x) => x.method === 'answerCallbackQuery').body.text, 'Đang xử lý…');
  const edited = env.tg.filter((x) => x.method === 'editMessageText').at(-1).body;
  assert.deepEqual([edited.chat_id, edited.message_id], ['42', 1]);
  assert.match(edited.text, /\n\n<b>✅ Đã duyệt<\/b> · \d\d:\d\d$/);
  assert.deepEqual(edited.reply_markup.inline_keyboard.map((row) => row.map((b) => b.text)), [['Mở trên Beincom']]);
  assert.match(env.storage.tgActions[token].done.line, /Đã duyệt/);
  assert.equal(env.storage.telegramPoll.offset, 11);
  // Bấm lại: không gọi API lần hai
  await tgPress(env, 11, token, 'd');
  assert.equal(env.calls.filter((c) => c.includes('joining-requests/jr9')).length, 1);
  assert.equal(env.tg.filter((x) => x.method === 'answerCallbackQuery').at(-1).body.text, 'Đã xử lý trước đó');
  // Chat khác, mã không có
  await tgPress(env, 12, token, 'a', 99);
  assert.equal(env.tg.filter((x) => x.method === 'answerCallbackQuery').at(-1).body.text, 'Chat này không được phép xử lý');
  await tgPress(env, 13, 'zzzzzzzzzz', 'a');
  assert.match(env.tg.filter((x) => x.method === 'answerCallbackQuery').at(-1).body.text, /hết hạn/);
  assert.equal(env.storage.telegramPoll.offset, 14);
});

test('Telegram có nút: bài vi phạm có nút Ẩn / Bỏ qua; đang Chạy thử thì giữ nút, tắt Chạy thử bấm lại thì ẩn đúng API với lý do Spam', async () => {
  const env = makeEnv({ settings: { notify: false, dryRun: true }, postRules: { blockedDomains: ['t.me'] } });
  env.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { violations: true }, actions: true };
  await scan(env);
  env.data.timeline.gCL.unshift(post('t5', 'Vào t.me/abc nhận quà', { publishedAt: nowIso(5) }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const sent = tgSends(env);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /^<b>⚠️ Bài vi phạm quy tắc · Crypto Life<\/b>\nTác giả t5 @tacgiat5\nVào t\.me\/abc nhận quà\n<i>Lý do: /);
  assert.deepEqual(sent[0].body.reply_markup.inline_keyboard[0].map((b) => b.text), ['🙈 Ẩn bài', 'Bỏ qua', '🧹 Dọn tài khoản']);
  const [token, a] = Object.entries(env.storage.tgActions)[0];
  assert.deepEqual(a.data, { id: 't5', reasonType: 'SPAM', actor: { id: 'at5', username: 'tacgiat5', fullname: 'Tác giả t5' } });
  await tgPress(env, 1, token, 'h');
  assert.ok(!env.calls.some((c) => c.endsWith('/hide')));
  let edited = env.tg.filter((x) => x.method === 'editMessageText').at(-1).body;
  assert.match(edited.text, /Chạy thử/);
  assert.deepEqual(edited.reply_markup.inline_keyboard[0].map((b) => b.text), ['🙈 Ẩn bài', 'Bỏ qua', '🧹 Dọn tài khoản']); // giữ nút
  assert.ok(!env.storage.tgActions[token].done);
  env.storage.settings = { ...env.storage.settings, dryRun: false };
  await tgPress(env, 2, token, 'h');
  assert.deepEqual(env.bodies.find(([c]) => c === 'POST content/contents/t5/hide')[1].reasonType, 'SPAM');
  edited = env.tg.filter((x) => x.method === 'editMessageText').at(-1).body;
  assert.match(edited.text, /✅ Đã ẩn bài/);
  assert.equal(env.storage.log[0].source, 'telegram');
  assert.equal(env.storage.state.recentPosts.find((p) => p.id === 't5').isHidden, true);
});

test('Telegram có nút: tối đa 10 tin mỗi lần quét kèm một tin "còn N việc"; loại tin tắt thì không gửi; tắt nút thì gửi tin gộp như cũ', async () => {
  const env = makeEnv({ settings: { notify: false } });
  env.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { queue: true }, actions: true };
  await scan(env);
  for (let i = 20; i < 32; i++) env.data.requests.gFood.push(jr(i));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const sent = tgSends(env);
  assert.equal(sent.length, 11);
  assert.equal(sent.filter((x) => x.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).length, 10);
  assert.match(sent.at(-1).body.text, /còn 2 việc mới khác/);
  assert.equal(Object.keys(env.storage.tgActions).length, 10);
  // Loại "queue" tắt: không gửi gì
  const off = makeEnv({ settings: { notify: false } });
  off.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { queue: false }, actions: true };
  await scan(off);
  off.data.requests.gFood.push(jr(9));
  off.listeners.alarm({ name: 'beingroup-scan' });
  await scan(off, 'popup');
  assert.equal(tgSends(off).length, 0);
  // Không bật nút: tin gộp như cũ, không đọc nút bấm
  const plain = makeEnv({ settings: { notify: false } });
  plain.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { queue: true } };
  await scan(plain);
  plain.data.requests.gFood.push(jr(9));
  plain.listeners.alarm({ name: 'beingroup-scan' });
  await scan(plain, 'popup');
  assert.match(tgSends(plain)[0].body.text, /1 yêu cầu tham gia mới/);
  assert.equal(tgSends(plain)[0].body.reply_markup, undefined);
  assert.deepEqual(await plain.send({ type: 'telegramPoll' }), { status: 'off' });
  assert.ok(!plain.tg.some((x) => x.method === 'getUpdates'));
});

test('Telegram có nút: đợt spam (Ẩn cả đợt) và bài chờ duyệt mới (Duyệt bài) chạy đúng API', async () => {
  const env = makeEnv({ settings: { notify: false, dryRun: false } });
  env.storage.telegram = { enabled: true, token: TG_TOKEN, chatId: '42', kinds: { spam: true, queue: true }, actions: true };
  await scan(env);
  const who = (n) => ({ actor: { id: 'x' + n, username: 'x' + n, fullname: 'X' + n, avatar: '' } });
  env.data.timeline.gCL.unshift(post('t8', 'Free coin tại coinfree.xyz/go', { publishedAt: nowIso(9), ...who(1) }), post('t9', 'coinfree.xyz/go nhanh', { publishedAt: nowIso(8), ...who(2) }), post('t10', 'coinfree.xyz/go', { publishedAt: nowIso(7), ...who(3) }));
  env.data.approvals.gCL.push(post('p3', 'Bài mới xin duyệt', { publishedAt: null }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const kinds = Object.values(env.storage.tgActions).map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['approval', 'wave']);
  const sent = tgSends(env);
  assert.ok(sent.some((m) => /^<b>🚨 Đợt spam: coinfree\.xyz\/go<\/b>\n3 tài khoản: X\d @x\d/.test(m.body.text)));
  assert.ok(sent.some((m) => /^<b>📝 Bài chờ duyệt · Crypto Life<\/b>/.test(m.body.text)));
  assert.ok(!sent.some((m) => /bài chờ duyệt<\/b>$|phát hiện đợt spam/.test(m.body.text))); // không có tin gộp
  const tok = (kind) => Object.entries(env.storage.tgActions).find(([, a]) => a.kind === kind)[0];
  await tgPress(env, 1, tok('wave'), 'h');
  assert.deepEqual(writes(env).filter((c) => c.endsWith('/hide')).sort(), ['POST content/contents/t10/hide', 'POST content/contents/t8/hide', 'POST content/contents/t9/hide']);
  assert.ok(env.bodies.filter(([c]) => c.endsWith('/hide')).every(([, b]) => b.reasonType === 'SPAM'));
  await tgPress(env, 2, tok('approval'), 'a');
  assert.deepEqual(env.bodies.find(([c]) => c === 'PUT content/contents/approval-contents/p3')[1], { status: 'APPROVED' });
  assert.ok(Object.values(env.storage.tgActions).every((a) => a.done));
});

// ---------- Tự duyệt bài của thành viên tin cậy ----------

test('tự duyệt bài: chỉ bài đạt quy tắc của người trong danh sách tin cậy; nhật ký ghi lý do; đếm bài được duyệt', async () => {
  const env = makeEnv({ settings: { dryRun: false, autoApprovePosts: true, trustedMembers: ['tacgiap2'] } });
  await scan(env);
  assert.deepEqual(writes(env), ['PUT content/contents/approval-contents/p2']);
  assert.deepEqual(env.bodies.find(([c]) => c === 'PUT content/contents/approval-contents/p2')[1], { status: 'APPROVED' });
  const e = env.storage.log[0];
  assert.deepEqual([e.kind, e.action, e.source, e.status, e.autoReason, e.userId], ['post', 'approve', 'auto', 'ok', 'Thành viên tin cậy', 'ap2']);
  const cl = env.storage.state.snapshot.groups.find((g) => g.id === 'gCL');
  assert.deepEqual([cl.approvals.map((p) => p.id), cl.approvalCount], [['p1'], 1]);
  assert.equal(env.storage.state.postTrust.ap2.approved, 1);
  // Tắt: không tự duyệt
  const off = makeEnv({ settings: { dryRun: false, trustedMembers: ['tacgiap2'] } });
  await scan(off);
  assert.equal(writes(off).length, 0);
});

test('tự duyệt bài: người đã được duyệt đủ N bài (chưa bị từ chối); bài vi phạm, người có hồ sơ vi phạm, đã bị từ chối thì không; chạy thử ghi một lần', async () => {
  const counted = makeEnv({ settings: { dryRun: false, autoApprovePosts: true, trustAfterApproved: 2 } });
  counted.storage.state = { postTrust: { ap1: { approved: 2, rejected: 0 }, ap2: { approved: 5, rejected: 1 } } };
  await scan(counted);
  assert.deepEqual(writes(counted), ['PUT content/contents/approval-contents/p1']);
  assert.equal(counted.storage.log[0].autoReason, 'Đã được duyệt 2 bài');
  assert.equal(counted.storage.state.postTrust.ap1.approved, 3);
  // Bài dính quy tắc (từ khoá cấm) -> không tự duyệt dù tin cậy
  const bad = makeEnv({ settings: { dryRun: false, autoApprovePosts: true, trustedMembers: ['tacgiap1'] }, postRules: { bannedKeywords: ['DeFi'] } });
  await scan(bad);
  assert.equal(writes(bad).length, 0);
  // Có hồ sơ vi phạm -> không tự duyệt
  const prof = makeEnv({ settings: { dryRun: false, autoApprovePosts: true, trustedMembers: ['tacgiap2'] } });
  prof.storage.profiles = { users: { ap2: { user: { id: 'ap2', username: 'tacgiap2', fullname: 'Tác giả p2' }, events: [{ type: 'hidden', source: 'beincom', time: Date.now() - 864e5 }] } } };
  await scan(prof);
  assert.equal(writes(prof).length, 0);
  // Chạy thử: ghi nhật ký một lần
  const dry = makeEnv({ settings: { autoApprovePosts: true, trustedMembers: ['tacgiap2'] } });
  await scan(dry);
  await scan(dry);
  assert.equal(writes(dry).length, 0);
  assert.deepEqual(dry.storage.log.filter((e) => e.kind === 'post').map((e) => [e.contentId, e.status]), [['p2', 'dry']]);
});

test('duyệt / từ chối bài trong Dashboard cũng đếm cho thành viên tin cậy', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  await env.send({ type: 'approvalAct', action: 'approve', groupId: 'gCL', contentIds: ['p1'] });
  await env.send({ type: 'approvalAct', action: 'reject', groupId: 'gCL', contentIds: ['p2'], reason: 'Lạc đề' });
  const t = env.storage.state.postTrust;
  assert.deepEqual([t.ap1.approved, t.ap1.rejected, t.ap2.approved, t.ap2.rejected, t.ap1.username], [1, 0, 0, 1, 'tacgiap1']);
});

// ---------- Sửa bài đang hẹn giờ ----------

test('sửa bài hẹn giờ của mình: mở được để sửa, lưu bằng PUT content/posts/{id}/schedule với đủ body và giờ mới; bài người khác thì không', async () => {
  const data = fixture();
  const at = new Date(Date.now() + 5 * 3600e3).toISOString();
  data.scheduled.gCL.push(post('s9', 'Bài hẹn của tôi', { status: 'WAITING_SCHEDULE', scheduledAt: at, actor: { id: 'me1', username: 'kai', fullname: 'Kai Crypto', avatar: '' } }));
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const d = await env.send({ type: 'postDetail', id: 's9', scheduled: true });
  assert.deepEqual([d.status, d.post.scheduledAt, d.post.content], ['ok', at, 'Bài hẹn của tôi']);
  assert.match((await env.send({ type: 'postDetail', id: 's1', scheduled: true })).message, /chính bạn/);
  assert.match((await env.send({ type: 'postDetail', id: 's9' })).message, /đã đăng/); // sửa kiểu bài đã đăng thì không được
  const newAt = new Date(Date.now() + 8 * 3600e3).toISOString();
  const r = await env.send({ type: 'editScheduled', id: 's9', groupIds: ['gCL'], content: '  Nội dung mới  ', setting: { canComment: false }, scheduledAt: newAt });
  assert.deepEqual([r.status, r.ok], ['ok', 1]);
  assert.deepEqual(writes(env), ['PUT content/posts/s9/schedule']);
  const b = env.bodies.find(([c]) => c === 'PUT content/posts/s9/schedule')[1];
  assert.deepEqual([b.scheduledAt, b.content, b.setting.canComment, b.audience.groupIds], [newAt, 'Nội dung mới', false, ['gCL']]);
  assert.deepEqual([env.storage.log[0].action, env.storage.log[0].scheduledAt, env.storage.log[0].status], ['edit', newAt, 'ok']);
  // Bài người khác, giờ quá gần, thiếu giờ: không gửi
  const before = writes(env).length;
  assert.match((await env.send({ type: 'editScheduled', id: 's1', groupIds: ['gCL'], content: 'x', scheduledAt: newAt })).message, /chính bạn/);
  assert.match((await env.send({ type: 'editScheduled', id: 's9', groupIds: ['gCL'], content: 'x', scheduledAt: new Date(Date.now() + 60e3).toISOString() })).message, /ít nhất 5 phút/);
  assert.match((await env.send({ type: 'editScheduled', id: 's9', groupIds: ['gCL'], content: 'x' })).message, /giờ đăng/);
  assert.equal(writes(env).length, before);
});

// ---------- Article: ảnh trong bài, nhắc tên ----------

test('Article có nhắc tên và ảnh trong bài: body gửi mentions và khối mention / img; ảnh trong bài tải với resource article:content', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const kai = { id: 'u61', avatar: '', name: 'kai', fullname: 'Kai', username: 'kai' };
  const r = await env.send({ type: 'composeArticle', groupIds: ['gCL'], title: 'Tin', content: 'Cảm ơn @kai và @lan\n![](https://media.beincom.com/image/variants/article/content/i1)', categoryIds: ['cat1'], coverId: 'cov', mentions: { kai } });
  assert.equal(r.ok, 1);
  const b = env.bodies.find(([c]) => c.endsWith('/publish'))[1];
  assert.deepEqual(b.mentions, { kai });
  const nodes = JSON.parse(b.content);
  assert.deepEqual(nodes[0].children.map((x) => x.type || x.text), ['Cảm ơn ', 'mention', ' và @lan']);
  assert.deepEqual([nodes[0].children[1].value, nodes[0].children[1].data], ['kai', kai]);
  assert.deepEqual([nodes[1].type, nodes[1].url], ['img', 'https://media.beincom.com/image/variants/article/content/i1']);
  // Ảnh chưa tải lên (local:) thì không gửi
  const local = await env.send({ type: 'composeArticle', groupIds: ['gCL'], title: 'Tin', content: 'Chữ\n![](local:1)', categoryIds: ['cat1'], coverId: 'cov' });
  assert.match(local.message, /chưa tải lên/);
  await env.send({ type: 'uploadInit', kind: 'image', mimeType: 'image/png', resource: 'article:content' });
  assert.equal(env.bodies.at(-1)[1].resource, 'article:content');
});

// ---------- Quản lý tag ----------

test('Quản lý tag: đọc đủ tag (nhiều trang) và quyền; tạo, đổi tên, xoá đúng API / body; tên sai không gọi API; chạy thử không gửi', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'tags', groupId: 'gCL' });
  assert.deepEqual([r.status, r.tags.length, r.canManage, r.tags[29]], ['ok', 30, true, { id: 'tC29', name: 'TAG 29', totalUsed: 29 }]);
  assert.ok(env.calls.includes('GET content/tags?groupIds[]=gCL&offset=25'));
  assert.ok(env.calls.includes('GET group/me/permissions/can-cud-tags/community/cCL'));
  env.data.tagPerm = { cFood: false };
  assert.equal((await env.send({ type: 'tags', groupId: 'gFood' })).canManage, false);
  assert.match((await env.send({ type: 'tags', groupId: 'gOther' })).message, /quét lại/);
  await env.send({ type: 'tagAct', action: 'create', groupId: 'gCL', name: ' bic  army ' });
  await env.send({ type: 'tagAct', action: 'rename', groupId: 'gCL', tagId: 'tC0', name: 'tin tức', oldName: 'TAG 0' });
  await env.send({ type: 'tagAct', action: 'delete', groupId: 'gCL', tagId: 'tC0', oldName: 'TIN TỨC' });
  assert.deepEqual(writes(env), ['POST content/tags', 'PUT content/tags/tC0', 'DELETE content/tags/tC0']);
  assert.deepEqual(env.bodies, [
    ['POST content/tags', { name: 'BIC ARMY', groupId: 'gCL' }],
    ['PUT content/tags/tC0', { name: 'TIN TỨC' }],
  ]);
  assert.deepEqual(
    env.storage.log.map((e) => [e.kind, e.action, e.snippet, e.status, e.tagId, e.contentId]).reverse(),
    [
      ['tag', 'create', 'BIC ARMY', 'ok', '', undefined],
      ['tag', 'rename', 'TAG 0 → TIN TỨC', 'ok', 'tC0', undefined],
      ['tag', 'delete', 'TIN TỨC', 'ok', 'tC0', undefined],
    ],
  );
  // Tên sai, thiếu tag, thao tác lạ: không gọi API
  const before = writes(env).length;
  assert.match((await env.send({ type: 'tagAct', action: 'create', groupId: 'gCL', name: 'ab' })).message, /ít nhất 3/);
  assert.match((await env.send({ type: 'tagAct', action: 'create', groupId: 'gCL', name: 'x'.repeat(33) })).message, /tối đa 32/);
  assert.match((await env.send({ type: 'tagAct', action: 'rename', groupId: 'gCL', name: 'ABC' })).message, /Thiếu tag/);
  assert.match((await env.send({ type: 'tagAct', action: 'merge', groupId: 'gCL', tagId: 'tC1' })).message, /không hợp lệ/);
  assert.equal(writes(env).length, before);
  // Chạy thử: chỉ ghi nhật ký
  env.storage.settings = { ...env.storage.settings, dryRun: true };
  const dry = await env.send({ type: 'tagAct', action: 'delete', groupId: 'gCL', tagId: 'tC1', oldName: 'TAG 1' });
  assert.deepEqual([dry.dryRun, writes(env).length, env.storage.log[0].status], [true, before, 'dry']);
});

// ---------- Dọn tài khoản ----------

test('Dọn tài khoản: ẩn mọi bài và bình luận gần đây còn hiện của một người (đúng API, lý do), tuỳ chọn cấm ở mọi community; không dọn chính mình', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 2;
  const spam = { id: 'x9', username: 'spammer', fullname: 'Spam Bot', avatar: '' };
  data.timeline.gCL.unshift(post('t7', 'Kèo x100 tại abc.xyz', { publishedAt: nowIso(30), actor: spam }), post('t8', 'Lại kèo', { publishedAt: nowIso(20), actor: spam }));
  data.comments = { t1: [cmt('k1', 'Vào abc.xyz', { createdAt: nowIso(10), actor: spam }), cmt('k2', 'Bài hay', { createdAt: nowIso(9) })] };
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const r = await env.send({ type: 'cleanupUser', user: { id: 'x9', username: 'spammer', fullname: 'Spam Bot' }, reasonType: 'SPAM', ban: true, banReason: 'SPAM' });
  assert.deepEqual([r.status, r.hidden, r.banned], ['ok', 3, BG.banTargets(env.storage.state.snapshot.groups).length]);
  const w = writes(env);
  assert.deepEqual(w.filter((c) => c.endsWith('/hide')).sort(), ['POST content/comments/k1/hide', 'POST content/contents/t7/hide', 'POST content/contents/t8/hide']);
  assert.ok(env.bodies.filter(([c]) => c.endsWith('/hide')).every(([, b]) => b.reasonType === 'SPAM'));
  assert.ok(w.some((c) => /^POST group\/communities\/\w+\/users\/x9\/ban$/.test(c)));
  const st = env.storage.state;
  assert.ok(['t7', 't8'].every((id) => st.recentPosts.find((p) => p.id === id).isHidden));
  assert.equal(st.recentComments.find((c) => c.id === 'k1').isHidden, true);
  assert.equal(st.recentComments.find((c) => c.id === 'k2').isHidden, false); // bình luận người khác giữ nguyên
  assert.ok(env.storage.log.filter((e) => e.action === 'hide').every((e) => e.autoReason === 'Dọn tài khoản' && e.source === 'manual'));
  // Không còn gì để ẩn, chính mình, lý do sai: không gọi API
  const before = writes(env).length;
  assert.match((await env.send({ type: 'cleanupUser', user: { id: 'x9' } })).message, /Không còn bài/);
  assert.match((await env.send({ type: 'cleanupUser', user: { id: 'me1' } })).message, /chính bạn/);
  assert.match((await env.send({ type: 'cleanupUser', user: { id: 'x9' }, reasonType: 'XX' })).message, /không hợp lệ/);
  assert.equal(writes(env).length, before);
});

test('Dọn tài khoản: thêm bài cũ tìm được và chỉ ẩn những mục được chọn; bỏ bài cũ không phải của người này', async () => {
  const data = fixture();
  data.timeline.gCL[0].commentsCount = 1;
  const spam = { id: 'x9', username: 'spammer', fullname: 'Spam Bot', avatar: '' };
  data.timeline.gCL.unshift(post('t7', 'Kèo x100', { publishedAt: nowIso(30), actor: spam }), post('t8', 'Lại kèo', { publishedAt: nowIso(20), actor: spam }));
  data.comments = { t1: [cmt('k1', 'Vào abc.xyz', { createdAt: nowIso(10), actor: spam })] };
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const old = BG.slimPost(post('o1', 'Bài cũ của spam', { actor: spam }));
  const other = BG.slimPost(post('o2', 'Bài người khác')); // không phải của x9: bị bỏ
  const r = await env.send({ type: 'cleanupUser', user: { id: 'x9' }, reasonType: 'SPAM', posts: [old, other], postIds: ['t7', 'o1', 'o2'], commentIds: [] });
  assert.deepEqual([r.status, r.hidden], ['ok', 2]);
  assert.deepEqual(writes(env).sort(), ['POST content/contents/o1/hide', 'POST content/contents/t7/hide']);
  assert.deepEqual(env.bodies.find(([c]) => c.endsWith('o1/hide'))[1], { reasonType: 'SPAM', groupIds: ['gCL'] });
  // Không chọn gì và không cấm: báo lỗi, không gọi API
  assert.match((await env.send({ type: 'cleanupUser', user: { id: 'x9' }, postIds: [], commentIds: [] })).message, /Không còn bài/);
  assert.equal(writes(env).length, 2);
});

// ---------- Thao tác hàng loạt bền ----------

const until = async (fn, n = 500) => {
  for (let i = 0; i < n; i++) {
    if (fn()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error('Hết giờ chờ');
};

test('thao tác hàng loạt: ghi từng mục vào nhật ký dở dang; service worker bị tắt giữa chừng thì lần chạy sau ghi bù vào Nhật ký và đánh dấu đã ẩn', async () => {
  const data = fixture();
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const posts = ['h1', 'h2', 'h3'].map((id) => BG.slimPost(post(id, 'Spam ' + id)));
  env.storage.state = { ...env.storage.state, recentPosts: [...posts, ...env.storage.state.recentPosts] };
  data.hideGate = { h3: new Promise(() => {}) }; // lệnh ẩn h3 treo: giả trình duyệt tắt service worker lúc đó
  env.send({ type: 'hidePosts', posts, reasonType: 'SPAM' });
  await until(() => env.storage.actionJournal?.entries?.length === 2);
  const j = env.storage.actionJournal;
  assert.deepEqual([j.total, j.entries.map((e) => [e.contentId, e.status, e.action])], [3, [['h1', 'ok', 'hide'], ['h2', 'ok', 'hide']]]);
  assert.equal((env.storage.log || []).filter((e) => e.contentId === 'h1').length, 0); // Nhật ký chính chưa ghi
  assert.ok(data.pings >= 1); // gọi nhẹ API trình duyệt để không bị coi là rảnh
  // Service worker mới khởi động với dữ liệu còn lại: ghi bù
  const env2 = makeEnv({ data: fixture(), settings: { dryRun: false }, initial: env.storage });
  await until(() => env2.storage.actionJournal === undefined);
  await until(() => (env2.storage.diagLog || []).length > 0);
  assert.deepEqual(env2.storage.log.filter((e) => e.action === 'hide').map((e) => [e.contentId, e.status, e.autoReason]), [['h2', 'ok', 'Tìm & dọn'], ['h1', 'ok', 'Tìm & dọn']]);
  assert.deepEqual(env2.storage.state.recentPosts.filter((p) => p.id.startsWith('h')).map((p) => [p.id, p.isHidden]), [['h1', true], ['h2', true], ['h3', false]]);
  assert.match(env2.storage.diagLog[0].message, /bị dừng giữa chừng .*đã làm 2\/3 mục, đã ghi bù vào Nhật ký/);
  // Chạy xong bình thường: không còn nhật ký dở dang, không ghi bù trùng
  const env3 = makeEnv({ data: fixture(), settings: { dryRun: false } });
  await scan(env3);
  const r = await env3.send({ type: 'hidePosts', posts: posts.slice(0, 2), reasonType: 'SPAM' });
  assert.deepEqual([r.ok, env3.storage.actionJournal], [2, undefined]);
});

test('thao tác hàng loạt: nút Dừng dừng sau mục đang làm, chỉ dừng lần chạy đã bắt đầu; nhật ký ghi đủ mục đã làm', async () => {
  const data = fixture();
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const posts = ['c1', 'c2', 'c3', 'c4'].map((id) => BG.slimPost(post(id, 'Spam ' + id)));
  let release;
  data.hideGate = { c2: new Promise((r) => (release = r)) };
  const pending = env.send({ type: 'hidePosts', posts, reasonType: 'SPAM' });
  await until(() => data.hideCalls?.includes('c2'));
  assert.equal((await env.send({ type: 'cancelActions' })).status, 'ok'); // không phải chờ hàng đợi
  release();
  const r = await pending;
  assert.deepEqual([r.status, r.cancelled, r.ok, r.left, r.hidden], ['ok', true, 2, 2, ['c1', 'c2']]);
  assert.deepEqual(data.hideCalls, ['c1', 'c2']);
  assert.deepEqual(env.storage.log.filter((e) => e.action === 'hide').map((e) => e.contentId), ['c2', 'c1']);
  assert.equal(env.storage.actionJournal, undefined);
  // Bấm Dừng lúc không có gì chạy: lần sau vẫn chạy đủ
  await env.send({ type: 'cancelActions' });
  await new Promise((res) => setTimeout(res, 5));
  const again = await env.send({ type: 'hidePosts', posts: posts.slice(2), reasonType: 'SPAM' });
  assert.deepEqual([again.ok, again.cancelled], [2, undefined]);
});

// ---------- Chat Beincom ----------

const chatUser = (n, extra = {}) => ({ id: 'cu' + n, username: 'user' + n, first_name: 'Người', last_name: String(n), nickname: '', props: { bic_user_id: 'u' + n }, ...extra });
const chatPost = (id, ch, u, text, at, extra = {}) => ({ id, channel_id: ch, user_id: u.id, create_at: at, update_at: at, delete_at: 0, type: '', message: text, root_id: '', file_ids: [], metadata: {}, author: u, ...extra });
function chatFixture(now) {
  const me = chatUser(1, { username: 'kai', first_name: 'Kai', last_name: '', props: { bic_user_id: 'me1' } });
  return {
    me,
    teams: [
      { id: 'tCL', name: 'crypto-life', display_name: 'Crypto Life', props: { bic_group_team_id: 'cCL' } },
      { id: 'tDM', name: 'direct', display_name: 'Direct Messages', props: { bic_group_team_id: 'unknown' } },
      { id: 'tX', name: 'other', display_name: 'Khác', props: { bic_group_team_id: 'cOther' } },
    ],
    teamMembers: [{ team_id: 'tCL', roles: 'team_user' }, { team_id: 'tDM', roles: 'team_user' }, { team_id: 'tX', roles: 'team_user' }],
    channels: {
      tCL: [
        { id: 'chMain', type: 'O', name: 'town-square', display_name: 'Crypto Life', props: { bic_group_id: 'gCL' }, last_post_at: now - 60e3, total_msg_count: 20 },
        { id: 'chSub', type: 'P', name: 'general', display_name: 'Crypto Life - General', props: { bic_group_id: 'gCLsub' }, last_post_at: now - 30e3, total_msg_count: 5 },
      ],
      tDM: [
        { id: 'dm1', type: 'D', name: 'cu1__cu50', total_msg_count: 5, last_post_at: now - 120e3 },
        { id: 'dm2', type: 'D', name: 'cu51__cu1', total_msg_count: 2, last_post_at: now - 3 * 864e5 },
      ],
      tX: [{ id: 'chX', type: 'O', name: 'town-square', display_name: 'Khác', props: { bic_group_id: 'gX' }, last_post_at: now, total_msg_count: 1 }],
    },
    channelMembers: {
      tCL: [{ channel_id: 'chMain', roles: 'roleAdm' }, { channel_id: 'chSub', roles: 'roleUser' }],
      tDM: [{ channel_id: 'dm1', msg_count: 3, mention_count: 0 }, { channel_id: 'dm2', msg_count: 2, mention_count: 0 }],
    },
    roles: { roleAdm: ['create_post', 'delete_others_posts', 'read_channel'], roleUser: ['read_channel'], team_user: [] },
    posts: { chMain: [], chSub: [] },
    unread: [{ team_id: 'tCL', total_unread_mentions: 2 }, { team_id: 'tDM', total_unread_mentions: 1 }],
    users: { cu50: chatUser(50), cu51: chatUser(51) },
  };
}

test('chat Beincom: mỗi lần quét đọc tin mới trong kênh chat group (chỉ đọc), chấm theo quy tắc, tài khoản giống admin, đợt spam; tin nhắn riêng chưa đọc', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  data.users.gCL = [{ ...user(61), fullname: 'Kai Crypto', username: 'kaicrypto', isAdmin: true }];
  const c = (data.chat = chatFixture(now));
  const spam = [60, 62, 63].map((n) => chatUser(n));
  c.posts.chMain = [
    chatPost('p1', 'chMain', spam[0], 'Vào nhóm kèo VIP t.me/keovip nhé', now - 50 * 60e3),
    chatPost('p2', 'chMain', chatUser(64), 'Chào mọi người, hôm nay thị trường thế nào?', now - 40 * 60e3),
    chatPost('p3', 'chMain', chatUser(65), 'user65 joined the channel', now - 30 * 60e3, { type: 'system_join_channel' }),
    chatPost('p4', 'chMain', c.me, 'Tin của chính mình', now - 20 * 60e3),
    chatPost('p5', 'chMain', chatUser(66), 'Tin cũ trước 6 giờ', now - 7 * 3600e3),
    chatPost('p6', 'chMain', chatUser(70, { first_name: 'Kai', last_name: 'Crypt0', username: 'kai_crypto_vn' }), 'Inbox mình để được hỗ trợ', now - 10 * 60e3),
    ...spam.map((u, i) => chatPost('w' + i, 'chMain', u, 'Nhận quà miễn phí tại claim-bic.xyz/go nhanh tay', now - (5 - i) * 60e3)),
  ];
  c.posts.chSub = [chatPost('s1', 'chSub', chatUser(67), 'Hỏi về ví lạnh an toàn', now - 15 * 60e3)];
  const env = makeEnv({ data, now, settings: { chatEnabled: true, guardJoins: true }, postRules: { blockedDomains: ['t.me'] } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const st = env.storage.state;
  assert.deepEqual(st.chatMap.channels.map((x) => [x.id, x.groupId, x.canDelete, x.canPost]), [['chMain', 'gCL', true, true], ['chSub', 'gCLsub', false, false]]);
  assert.deepEqual([st.chatMap.me.chatId, st.chatMap.dmTeam.id, st.chatMap.teams.map((t) => t.id)], ['cu1', 'tDM', ['tCL']]); // community không quản trị: không đọc
  assert.deepEqual(st.chatMessages.map((x) => x.id), ['w2', 'w1', 'w0', 'p6', 's1', 'p2', 'p1']); // bỏ tin hệ thống, của mình, quá 6 giờ
  const p1 = st.chatMessages.find((x) => x.id === 'p1');
  assert.deepEqual([p1.groupName, p1.user.id, p1.user.fullname, p1.user.username], ['Crypto Life', 'u60', 'Người 60', 'user60']);
  // Tài khoản giống admin nhắn trong kênh chat -> Bảo vệ community
  assert.deepEqual(st.impostors.map((x) => [x.user.id, x.source]), [['u70', 'chat']]);
  const n = (id) => env.notifications.filter((x) => x.id === id);
  assert.equal(n('bg-chat').length, 1);
  assert.equal(n('bg-chat')[0].title, 'BeinGroup: 1 tin vi phạm, 1 đợt spam, 1 tài khoản giống admin trong chat');
  // Tin nhắn riêng: chỉ số tin chưa đọc và người gửi, không đọc nội dung
  assert.deepEqual(st.chatUnread.dms.map((d) => [d.channelId, d.unread, d.user?.fullname, d.url]), [['dm1', 2, 'Người 50', 'https://group.beincom.com/chat-home?teamName=direct&channel=dm1']]);
  assert.equal(st.chatUnread.mentions, 2);
  assert.ok(!env.calls.some((x) => x.includes('channels/dm1/posts') || x.includes('channels/chX')));
  assert.ok(env.calls.filter((x) => x.includes(' chat:')).every((x) => x.startsWith('GET ')));
  assert.equal(env.headers[`GET chat:v4/users/me`]['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(n('bg-chat-dm').length, 0); // lần đầu chỉ ghi nhận
  // Lần sau: chỉ đọc kênh có tin mới, từ lần trước; tin nhắn riêng mới và nhắc tên tăng thì báo
  c.channels.tCL[0].last_post_at = now + 1;
  c.posts.chMain.push(chatPost('p7', 'chMain', chatUser(68), 'Có ai biết sự kiện tuần này không?', now + 1));
  c.channels.tDM[0] = { ...c.channels.tDM[0], total_msg_count: 6, last_post_at: now + 2 };
  c.unread[0].total_unread_mentions = 3;
  const before = env.calls.length;
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const calls = env.calls.slice(before);
  assert.ok(calls.includes(`GET chat:v5/channels/chMain/posts?since=${now}`));
  assert.ok(!calls.some((x) => x.includes('channels/chSub/posts')));
  assert.equal(env.storage.state.chatMessages[0].id, 'p7');
  assert.equal(n('bg-chat').length, 1); // p7 không vi phạm
  assert.deepEqual([n('bg-chat-dm').length, n('bg-chat-dm')[0]?.title, n('bg-chat-dm')[0]?.message], [1, 'BeinGroup: 1 tin nhắn riêng mới', 'Từ: Người 50. Bấm để mở chat.']);
  assert.equal(n('bg-chat-mention')[0].title, 'BeinGroup: bạn được nhắc tên 3 lần trong chat');
  // Tắt: không gọi chat; chưa cho phép chat.beincom.com: báo lỗi, không gọi
  const off = makeEnv({ data: { ...fixture(), chat: chatFixture(now) }, now });
  await scan(off);
  assert.ok(!off.calls.some((x) => x.includes(' chat:')));
  const noPerm = makeEnv({ data: { ...fixture(), chat: chatFixture(now), chatPerm: false }, now, settings: { chatEnabled: true } });
  await scan(noPerm);
  assert.ok(!noPerm.calls.some((x) => x.includes(' chat:')));
  assert.match(noPerm.storage.state.chatError.message, /Chưa cho phép addon kết nối chat\.beincom\.com/);
});

test('chat Beincom: xoá tin (đúng API, nhật ký, cần quyền xoá tin trong kênh), bỏ qua; Chạy thử không xoá; tải lại từ Dashboard', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  c.posts.chMain = [chatPost('p1', 'chMain', chatUser(60), 'Spam t.me/keovip', now - 50 * 60e3), chatPost('p2', 'chMain', chatUser(61), 'Bình thường', now - 40 * 60e3)];
  c.posts.chSub = [chatPost('s1', 'chSub', chatUser(67), 'Ở kênh không có quyền xoá', now - 15 * 60e3)];
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: false } });
  await scan(env);
  // Tải lại từ Dashboard
  const rf = await env.send({ type: 'chatRefresh' });
  assert.deepEqual([rf.status, rf.channels], ['ok', 2]);
  const r = await env.send({ type: 'chatAct', action: 'delete', ids: ['p1', 's1'] });
  assert.deepEqual([r.status, r.ok, r.deleted, r.skipped], ['ok', 1, ['p1'], 1]);
  assert.deepEqual(writes(env), ['DELETE chat:v4/posts/p1']);
  assert.deepEqual([env.storage.log[0].kind, env.storage.log[0].action, env.storage.log[0].contentId, env.storage.log[0].username, env.storage.log[0].status], ['chat', 'delete', 'p1', 'user60', 'ok']);
  assert.equal(env.storage.state.chatMessages.find((x) => x.id === 'p1').deleted, true);
  assert.match((await env.send({ type: 'chatAct', action: 'delete', ids: ['s1'] })).message, /không có quyền xoá tin/);
  // Tin đã bị xoá từ trước (404): coi như xong
  c.posts.chMain = c.posts.chMain.filter((x) => x.id !== 'p2');
  const gone = await env.send({ type: 'chatAct', action: 'delete', ids: ['p2'] });
  assert.deepEqual([gone.ok, gone.gone, env.storage.log[0].message], [1, 1, 'Bài không còn trên Beincom (đã bị xoá) — đã bỏ khỏi danh sách']);
  // Bỏ qua / hiện lại
  await env.send({ type: 'chatAct', action: 'dismiss', ids: ['s1'] });
  assert.equal(env.storage.state.chatMessages.find((x) => x.id === 's1').dismissed, true);
  await env.send({ type: 'chatAct', action: 'undismiss', ids: ['s1'] });
  assert.equal(env.storage.state.chatMessages.find((x) => x.id === 's1').dismissed, false);
  // Chạy thử: chỉ ghi nhật ký
  env.storage.settings = { ...env.storage.settings, dryRun: true };
  c.posts.chMain.push(chatPost('p3', 'chMain', chatUser(62), 'Spam nữa t.me/x', now - 5 * 60e3));
  env.storage.state = { ...env.storage.state, chatMessages: [BG.slimChatPost(c.posts.chMain.at(-1), env.storage.state.chatMap.channels[0]), ...env.storage.state.chatMessages] };
  const dry = await env.send({ type: 'chatAct', action: 'delete', ids: ['p3'] });
  assert.deepEqual([dry.dryRun, dry.dry, writes(env).length, env.storage.log[0].status], [true, 1, 2, 'dry']);
  assert.match((await env.send({ type: 'chatAct', action: 'xx', ids: ['p3'] })).message, /không hợp lệ/);
});

test('chat Beincom: đăng ngay thì gửi kèm tin vào kênh chat của group (lời nhắn + link bài); không có kênh / hẹn giờ thì không gửi', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  data.chat = chatFixture(now);
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: false } });
  await scan(env);
  await env.send({ type: 'chatRefresh' });
  const setting = { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null };
  const r = await env.send({ type: 'compose', groupIds: ['gCL', 'gCLsub'], content: '## Bản tin **thị trường** tuần này\nNội dung chi tiết', setting, chat: { text: '' } });
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.chat.ok, r.chat.missing], [1, ['Crypto Life - General']]);
  const sent = env.bodies.filter(([k]) => k === 'POST chat:v4/posts');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0][1], { channel_id: 'chMain', message: `📢 Bản tin thị trường tuần này\nhttps://group.beincom.com/posts/${r.contentId}` });
  assert.ok(env.storage.log.some((e) => e.kind === 'chat' && e.action === 'send' && e.status === 'ok'));
  // Lời nhắn tự viết; hẹn giờ thì không gửi
  await env.send({ type: 'compose', groupIds: ['gCL'], content: 'Bài thứ hai', setting, chat: { text: 'Mời mọi người đọc' } });
  assert.match(env.bodies.filter(([k]) => k === 'POST chat:v4/posts').at(-1)[1].message, /^📢 Mời mọi người đọc\nhttps:/);
  const n = env.bodies.filter(([k]) => k === 'POST chat:v4/posts').length;
  await env.send({ type: 'compose', groupIds: ['gCL'], content: 'Bài hẹn giờ', setting, scheduledAt: new Date(now + 3 * 3600e3).toISOString(), chat: { text: '' } });
  assert.equal(env.bodies.filter(([k]) => k === 'POST chat:v4/posts').length, n);
});

test('chat Beincom: báo cáo tháng có số tin chat tháng này / tháng trước, người nhắn nhiều nhất', async () => {
  const data = fixture();
  const now = Date.now();
  const key = BG.shiftMonth(BG.monthKey(now), -1);
  const cur = BG.monthRange(key, now);
  const prev = BG.monthRange(BG.shiftMonth(key, -1), now);
  const c = (data.chat = chatFixture(now));
  const a = chatUser(60);
  const b = chatUser(61);
  c.posts.chMain = [
    ...Array.from({ length: 5 }, (_, i) => chatPost('m' + i, 'chMain', i < 3 ? a : b, 'Tin ' + i, cur.from + (i + 1) * 864e5)),
    chatPost('mp', 'chMain', a, 'Tháng trước', prev.from + 864e5),
    chatPost('ms', 'chMain', b, 'joined', cur.from + 2 * 864e5, { type: 'system_join_channel' }),
  ];
  c.posts.chSub = [chatPost('s1', 'chSub', b, 'Kênh con', cur.from + 3 * 864e5)];
  const env = makeEnv({ data, settings: { chatEnabled: true } });
  await scan(env);
  await env.send({ type: 'chatRefresh' });
  const raw = await env.send({ type: 'monthly', groupId: 'gCL', month: key });
  assert.equal(raw.status, 'ok');
  assert.deepEqual(raw.chat.channels.map((x) => x.id), ['chMain', 'chSub']);
  const r = BG.monthlyReport(raw, {});
  assert.deepEqual([r.chat.cur.messages, r.chat.cur.people, r.chat.prev.messages, r.chat.cur.top.map((x) => [x.user.username, x.count])], [6, 2, 1, [['user60', 3], ['user61', 3]]]);
  assert.match(BG.monthlyText(r), /• Chat: 6 tin nhắn \(tháng trước 1, \+500%\) · 2 người nhắn · nhiều nhất: Người 60 \(@user60\) 3, Người 61 \(@user61\) 3/);
  // Chưa bật chat: không có phần chat
  const off = makeEnv({ data: { ...fixture(), chat: chatFixture(now) } });
  await scan(off);
  assert.equal((await off.send({ type: 'monthly', groupId: 'gCL', month: key })).chat, null);
});

test('trang Chat: danh sách cuộc trò chuyện trong một lượt (mọi kênh, số đã đọc), ghi nhớ quyền / tên người; không phải dò Beincom trước', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  data.chat = chatFixture(now);
  const env = makeEnv({ data, now, settings: { chatEnabled: true } });
  const r = await env.send({ type: 'chatOverview' });
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.me.chatId, r.me.username, r.dmTeam], ['cu1', 'kai', { id: 'tDM', name: 'direct' }]);
  assert.deepEqual(r.teams.map((t) => [t.id, t.title, t.channels.map((c) => c.id)]), [['tX', 'Khác', ['chX']], ['tCL', 'Crypto Life', ['chSub', 'chMain']]]); // mọi community, mới nhất trước
  const main = r.teams[1].channels.find((c) => c.id === 'chMain');
  assert.deepEqual([main.canDelete, main.canPost, main.groupId, main.teamName], [true, true, 'gCL', 'crypto-life']);
  assert.deepEqual(r.dms.map((d) => [d.id, d.title, d.other.chatId, d.unread]), [['dm1', 'Người 50', 'cu50', 2], ['dm2', 'Người 51', 'cu51', 0]]);
  const chatCalls = () => env.calls.filter((x) => x.includes(' chat:'));
  assert.ok(!env.calls.includes('GET group/me/permissions')); // gọi thẳng chat, không dò api.beincom.com
  assert.ok(!chatCalls().some((x) => /teams\/\w+\/channels/.test(x))); // không đọc từng team
  assert.deepEqual(Object.keys(env.storage.chatRoles.perms).sort(), ['roleAdm', 'roleUser', 'team_user']);
  assert.deepEqual(Object.keys(env.storage.chatPeople).sort(), ['cu50', 'cu51']);
  assert.ok(!JSON.stringify(env.storage).includes('total_msg_count'));
  // Lần mở sau (service worker mới): quyền và tên người lấy từ bộ nhớ
  const env2 = makeEnv({ data, now, settings: { chatEnabled: true }, initial: { chatRoles: env.storage.chatRoles, chatPeople: env.storage.chatPeople } });
  assert.equal((await env2.send({ type: 'chatOverview' })).dms[0].title, 'Người 50');
  assert.ok(!env2.calls.some((x) => x.includes('chat:v4/roles/') || /chat:v4\/users\/cu\d+$/.test(x)));
  // Máy chủ không có lệnh gộp: đọc từng team
  data.chat.noAllChannels = true;
  const env3 = makeEnv({ data, now, settings: { chatEnabled: true } });
  const r3 = await env3.send({ type: 'chatOverview' });
  assert.deepEqual([r3.status, r3.teams.length, r3.dms.length], ['ok', 2, 2]);
  assert.ok(env3.calls.includes('GET chat:v4/users/me/teams/tCL/channels'));
  // Chưa bật
  assert.equal((await makeEnv({ data }).send({ type: 'chatOverview' })).status, 'off');
});

test('trang Chat: đọc nhanh — tên 8 tin nhắn riêng gần nhất, quyền chỉ lấy từ bộ nhớ; cộng đồng đã ghim lên đầu (thứ tự ghim lưu trong máy, đọc lại ngầm)', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  for (let i = 0; i < 10; i++) {
    // dmx9 cũ nhưng còn tin chưa đọc
    c.channels.tDM.push({ id: 'dmx' + i, type: 'D', name: `cu1__cu${70 + i}`, total_msg_count: i === 9 ? 3 : 1, last_post_at: now - (10 + i) * 60e3 });
    c.channelMembers.tDM.push({ channel_id: 'dmx' + i, msg_count: 1, mention_count: 0 });
    c.users['cu' + (70 + i)] = chatUser(70 + i);
  }
  data.pins = [{ id: 'cCL', groupId: 'gCL', name: 'Crypto Life', slug: 'crypto-life', teamName: 'crypto-life', rank: 1, isPinned: true }];
  const env = makeEnv({ data, now, settings: { chatEnabled: true } });
  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  };
  const q = await env.send({ type: 'chatOverview', quick: true });
  assert.deepEqual([q.status, q.quick, q.dms.length], ['ok', true, 12]);
  // Mới nhất trước; chỉ 8 tin nhắn riêng đầu và tin nhắn riêng còn chưa đọc có tên (đọc người song song)
  assert.deepEqual(q.dms.slice(0, 3).map((d) => d.id), ['dm1', 'dmx0', 'dmx1']);
  assert.ok(q.dms.slice(0, 8).every((d) => d.title));
  assert.deepEqual(q.dms.slice(8).map((d) => [d.id, d.title, d.other.chatId, d.unread]), [['dmx7', '', 'cu77', 0], ['dmx8', '', 'cu78', 0], ['dmx9', 'Người 79', 'cu79', 2], ['dm2', '', 'cu51', 0]]);
  assert.equal(env.calls.filter((x) => /chat:v4\/users\/cu\d+$/.test(x)).length, 9);
  // Quyền: chưa có trong bộ nhớ thì chưa rõ (không chờ đọc vai trò)
  assert.ok(!env.calls.some((x) => x.includes('chat:v4/roles/')));
  const main = (r) => r.teams.flatMap((t) => t.channels).find((x) => x.id === 'chMain');
  assert.deepEqual([main(q).canPost, main(q).canDelete], [null, false]);
  // Chưa có thứ tự ghim: cộng đồng có tin mới nhất trước; thứ tự ghim đọc ngầm (gọi thẳng, không dò quyền) và lưu lại
  assert.deepEqual(q.teams.map((t) => [t.id, t.pinned]), [['tX', false], ['tCL', false]]);
  await settle();
  assert.ok(env.calls.includes('GET group/me/communities/pins'));
  assert.ok(!env.calls.includes('GET group/me/permissions'));
  assert.deepEqual(env.storage.chatPins.list, [{ communityId: 'cCL', teamName: 'crypto-life', rank: 1 }]);
  // Lần đọc đủ: đủ tên, đủ quyền; cộng đồng đã ghim lên đầu
  const full = await env.send({ type: 'chatOverview' });
  assert.deepEqual([full.quick, full.dms.every((d) => d.title), main(full).canPost, main(full).canDelete], [false, true, true, true]);
  assert.deepEqual(full.teams.map((t) => [t.id, t.pinned]), [['tCL', true], ['tX', false]]);
  // Đọc nhanh lần sau: quyền đã nhớ thì dùng luôn; thứ tự ghim còn mới thì không gọi lại
  const q2 = await env.send({ type: 'chatOverview', quick: true });
  await settle();
  assert.deepEqual([main(q2).canPost, main(q2).canDelete, q2.teams[0].id], [true, true, 'tCL']);
  assert.equal(env.calls.filter((x) => x === 'GET group/me/communities/pins').length, 1);
  // Không lưu tin nhắn riêng / tên kênh vào thứ tự ghim
  assert.ok(!JSON.stringify(env.storage.chatPins).includes('Crypto Life'));
});

// Lời mời trò chuyện (Beincom: "Yêu cầu nhắn tin"): kênh D có props.contact_status / contact_requester_id / contact_id
function addRequests(c, now) {
  const dm = (id, other, props, min, total = 2) => ({ id, type: 'D', name: `cu1__${other}`, creator_id: 'cu1', props, total_msg_count: total, last_post_at: now - min * 60e3 });
  c.channels.tDM.push(
    dm('rq1', 'cu90', { contact_id: 'ct1', contact_requester_id: 'cu90', contact_status: 'pending' }, 5), // người lạ nhắn (web tạo kênh nên creator có thể là mình)
    dm('rq2', 'cu91', { contact_id: 'ct2', contact_requester_id: 'cu91', contact_status: 'spammed' }, 9),
    dm('sent1', 'cu92', { contact_id: 'ct3', contact_requester_id: 'cu1', contact_status: 'pending' }, 7, 1), // mình gửi lời mời
    dm('acc1', 'cu93', { contact_id: 'ct4', contact_requester_id: 'cu93', contact_status: 'accepted' }, 8, 1),
  );
  c.channelMembers.tDM.push({ channel_id: 'rq1', msg_count: 0, mention_count: 0 }, { channel_id: 'rq2', msg_count: 2, mention_count: 0 }, { channel_id: 'sent1', msg_count: 1, mention_count: 0 }, { channel_id: 'acc1', msg_count: 1, mention_count: 0 });
  for (const n of [90, 91, 92, 93]) c.users['cu' + n] = chatUser(n);
  c.contacts = { ct1: 1, ct2: 1, ct3: 1, ct4: 1 };
}

test('trang Chat: lời mời trò chuyện (người chưa kết nối nhắn) tách khỏi tin nhắn riêng; chấp nhận / bỏ qua; trả lời là chấp nhận', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  addRequests(c, now);
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: true } });
  const q = await env.send({ type: 'chatOverview', quick: true });
  // Lời mời đến (đang chờ, spam) riêng, mới nhất trước; lời mình gửi đi và lời đã chấp nhận vẫn là tin nhắn riêng
  assert.deepEqual(q.requests.map((d) => [d.id, d.title, d.unread, d.contact.status, d.contact.id, d.contact.incoming]), [['rq1', 'Người 90', 2, 'pending', 'ct1', true], ['rq2', 'Người 91', 0, 'spammed', 'ct2', true]]);
  assert.deepEqual(q.dms.map((d) => d.id), ['dm1', 'sent1', 'acc1', 'dm2']);
  assert.deepEqual(q.dms.map((d) => d.contact?.sent ?? null), [null, true, false, null]);
  assert.ok(q.dms.slice(0, 4).every((d) => d.title)); // lời mời không chiếm chỗ lấy tên của tin nhắn riêng
  // Chấp nhận / Bỏ qua: việc của chính mình — làm thật kể cả khi Chạy thử
  assert.equal((await env.send({ type: 'chatContact', contactId: 'ct1', action: 'accept' })).status, 'ok');
  assert.equal((await env.send({ type: 'chatContact', contactId: 'ct2', action: 'ignore' })).status, 'ok');
  assert.ok(env.calls.includes('POST chat:v4/contacts/ct1/accept') && env.calls.includes('POST chat:v4/contacts/ct2/ignore'));
  assert.match((await env.send({ type: 'chatContact', contactId: 'ct1', action: 'block' })).message, /Thiếu/);
  assert.match((await env.send({ type: 'chatContact', contactId: 'x/y', action: 'accept' })).message, /Thiếu/);
  assert.match((await env.send({ type: 'chatContact', contactId: 'ct9', action: 'accept' })).message, /^Chấp nhận lời mời lỗi/);
  // Trả lời lời mời: chấp nhận trước rồi gửi (như web)
  const before = env.calls.length;
  const sent = await env.send({ type: 'chatSend', channelId: 'rq1', message: 'Chào bạn', acceptContactId: 'ct1' });
  assert.deepEqual([sent.status, sent.accepted], ['ok', true]);
  assert.deepEqual(env.calls.slice(before).filter((x) => x.startsWith('POST')), ['POST chat:v4/contacts/ct1/accept', 'POST chat:v4/posts']);
  // Gửi tin thường: không đụng lời mời
  const b2 = env.calls.length;
  await env.send({ type: 'chatSend', channelId: 'dm1', message: 'Hi' });
  assert.deepEqual(env.calls.slice(b2).filter((x) => x.startsWith('POST')), ['POST chat:v4/posts']);
  assert.match((await env.send({ type: 'chatSend', channelId: 'rq1', message: 'x', acceptContactId: '../a' })).message, /Thiếu/);
});

test('trang Chat: bộ gõ — gửi kèm độ ưu tiên và tệp; tải tệp lên (FormData như web, tối đa 25 MB)', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  data.chat = chatFixture(now);
  const env = makeEnv({ data, now, settings: { chatEnabled: true } });
  // Tải tệp lên: POST v4/files với files + channel_id + client_ids
  const b64 = Buffer.from('xin chào').toString('base64');
  const up = await env.send({ type: 'chatUpload', channelId: 'chMain', name: 'ghi chú.txt', mime: 'text/plain', data: b64 });
  assert.deepEqual([up.status, up.file.name, up.file.mime, up.file.size], ['ok', 'ghi chú.txt', 'text/plain', Buffer.byteLength('xin chào')]);
  const form = env.bodies.find(([k]) => k === 'POST chat:v4/files')[1];
  assert.deepEqual([form.channel_id, form.files, /^bg/.test(form.client_ids)], ['chMain', { name: 'ghi chú.txt', type: 'text/plain', size: Buffer.byteLength('xin chào') }, true]);
  assert.equal(env.headers['POST chat:v4/files']['X-Requested-With'], 'XMLHttpRequest');
  assert.match((await env.send({ type: 'chatUpload', channelId: 'chMain', name: 'x', data: 'không phải base64!' })).message, /không đọc được/);
  assert.match((await env.send({ type: 'chatUpload', channelId: 'chMain', name: 'x', data: 'A'.repeat(36 * 1024 * 1024) })).message, /25 MB/);
  assert.match((await env.send({ type: 'chatUpload', channelId: '../x', name: 'x', data: b64 })).message, /Thiếu kênh/);
  data.chat.uploadDenied = true;
  assert.match((await env.send({ type: 'chatUpload', channelId: 'chMain', name: 'x', data: b64 })).message, /^Tải tệp lên lỗi: Unable to upload file/);
  // Gửi tin: độ ưu tiên (metadata.priority như web), tệp (file_ids); chỉ có tệp thì không cần chữ
  assert.equal((await env.send({ type: 'chatSend', channelId: 'chMain', message: 'Họp gấp', priority: 'urgent' })).status, 'ok');
  assert.deepEqual(env.bodies.filter(([k]) => k === 'POST chat:v4/posts').pop()[1], { channel_id: 'chMain', message: 'Họp gấp', metadata: { priority: { priority: 'urgent', requested_ack: false, persistent_notifications: false } } });
  const sent = await env.send({ type: 'chatSend', channelId: 'chMain', message: '', fileIds: [up.file.id] });
  assert.equal(sent.status, 'ok');
  assert.deepEqual(env.bodies.filter(([k]) => k === 'POST chat:v4/posts').pop()[1], { channel_id: 'chMain', message: '', file_ids: [up.file.id] });
  assert.match((await env.send({ type: 'chatSend', channelId: 'chMain', message: 'x', priority: 'cao' })).message, /ưu tiên/);
  assert.match((await env.send({ type: 'chatSend', channelId: 'chMain', message: 'x', fileIds: Array.from({ length: 11 }, (_, i) => 'f' + i) })).message, /Tối đa 10 tệp/);
  assert.match((await env.send({ type: 'chatSend', channelId: 'chMain', message: '', fileIds: [] })).message, /trống/);
  // Tin có độ ưu tiên: trang nhận được nhãn
  data.chat.posts.chMain = [chatPost('pp', 'chMain', chatUser(60), 'Khẩn', now - 60e3, { metadata: { priority: { priority: 'urgent' } } })];
  assert.equal((await env.send({ type: 'chatPosts', channelId: 'chMain' })).posts[0].priority, 'urgent');
});

test('trang Chat: thread — bình luận của một tin, theo dõi / bỏ theo dõi, đã đọc; huy hiệu xác minh / Premium cạnh tên', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  const vip = chatUser(61, { extra_data: { is_primary: true, is_verified: true, subscriptions: [{ id: 's1', type: 'premium', term: 'lifetime' }] } });
  const basic = chatUser(62, { extra_data: { is_primary: false, is_verified: true, subscriptions: [{ id: 's2', type: 'basic', term: 'lifetime' }] } });
  c.posts.chMain = [
    chatPost('r1', 'chMain', vip, 'Hỏi về stake BIC', now - 60 * 60e3, { reply_count: 2, is_following: true, participants: [vip, basic] }),
    chatPost('c1', 'chMain', basic, 'Trả lời 1', now - 50 * 60e3, { root_id: 'r1' }),
    chatPost('c2', 'chMain', c.me, 'Trả lời 2', now - 40 * 60e3, { root_id: 'r1' }),
  ];
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: true } });
  // Trang tin: số bình luận, đang theo dõi, người tham gia (kèm huy hiệu)
  const page = await env.send({ type: 'chatPosts', channelId: 'chMain' });
  const r1 = page.posts.find((p) => p.id === 'r1');
  assert.deepEqual([r1.replyCount, r1.following, r1.participants.map((u) => [u.chatId, !!u.verified, u.premium || '', !!u.subProfile])], [2, true, [['cu61', true, 'lifetime', false], ['cu62', true, '', true]]]);
  assert.deepEqual([r1.user.verified, r1.user.premium], [true, 'lifetime']);
  // Thread: tin gốc + bình luận, cũ -> mới
  const th = await env.send({ type: 'chatThread', rootId: 'r1' });
  assert.deepEqual([th.status, th.posts.map((p) => [p.id, p.rootId]), th.hasNext], ['ok', [['r1', ''], ['c1', 'r1'], ['c2', 'r1']], false]);
  assert.ok(env.calls.includes('GET chat:v5/posts/r1/thread?skipFetchThreads=false&collapsedThreads=true&collapsedThreadsExtended=false&direction=down&perPage=100'));
  await env.send({ type: 'chatThread', rootId: 'r1', fromPost: 'c2', fromCreateAt: now - 40 * 60e3 });
  assert.ok(env.calls.includes(`GET chat:v5/posts/r1/thread?skipFetchThreads=false&collapsedThreads=true&collapsedThreadsExtended=false&direction=down&perPage=100&fromPost=c2&fromCreateAt=${now - 40 * 60e3}`));
  assert.match((await env.send({ type: 'chatThread', rootId: 'a/b' })).message, /Thiếu/);
  // Theo dõi / bỏ theo dõi (thật kể cả Chạy thử), đã đọc thread
  assert.deepEqual(await env.send({ type: 'chatFollow', teamId: 'tCL', rootId: 'r1', follow: false }), { status: 'ok', following: false, mode: 'direct' });
  assert.equal((await env.send({ type: 'chatFollow', teamId: 'tCL', rootId: 'r1', follow: true })).following, true);
  assert.ok(env.calls.includes('DELETE chat:v4/users/me/teams/tCL/threads/r1/following') && env.calls.includes('PUT chat:v4/users/me/teams/tCL/threads/r1/following'));
  assert.equal((await env.send({ type: 'chatThreadRead', teamId: 'tCL', rootId: 'r1' })).status, 'ok');
  assert.ok(env.calls.includes(`PUT chat:v4/users/me/teams/tCL/threads/r1/read/${now}`));
  assert.match((await env.send({ type: 'chatFollow', teamId: '', rootId: 'r1' })).message, /Thiếu/);
  // Bình luận: gửi kèm root_id
  await env.send({ type: 'chatSend', channelId: 'chMain', message: 'Bình luận mới', rootId: 'r1' });
  assert.deepEqual(env.bodies.filter(([k]) => k === 'POST chat:v4/posts').pop()[1], { channel_id: 'chMain', message: 'Bình luận mới', root_id: 'r1' });
  // Tên người trong danh sách: có huy hiệu; bản ghi nhớ cũ (chưa có huy hiệu) được đọc lại
  c.users.cu50 = chatUser(50, { extra_data: { is_primary: true, is_verified: true, subscriptions: [{ type: 'premium', term: 'annual' }] } });
  const env2 = makeEnv({ data, now, settings: { chatEnabled: true }, initial: { chatPeople: { cu50: { id: 'u50', chatId: 'cu50', username: 'user50', fullname: 'Người 50', pictureAt: 0, at: now - 3600e3 } } } });
  const ov = await env2.send({ type: 'chatOverview' });
  assert.deepEqual([ov.dms[0].other.verified, ov.dms[0].other.premium], [true, 'annual']);
  assert.ok(env2.calls.includes('GET chat:v4/users/cu50'));
});

test('trang Chat: thread đang theo dõi — gộp các team, bỏ trùng, mới nhất trước, chỉ chưa đọc; số thread chưa đọc trong danh sách', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  const th = (id, ch, u, at, extra = {}) => ({ id, reply_count: 3, last_reply_at: at, last_viewed_at: 0, unread_replies: 0, unread_mentions: 0, is_urgent: false, participants: [chatUser(70), chatUser(71)], post: { id, channel_id: ch, user_id: u.id, create_at: at - 3600e3, update_at: at, message: 'Tin gốc ' + id, root_id: '', type: '', metadata: {} }, ...extra });
  c.threads = {
    tCL: [th('t1', 'chMain', chatUser(50), now - 60e3, { unread_replies: 2, unread_mentions: 1 }), th('t2', 'chSub', chatUser(51), now - 3600e3)],
    tDM: [th('t3', 'dm1', chatUser(50), now - 120e3, { unread_replies: 1 }), th('t1', 'chMain', chatUser(50), now - 60e3)], // trùng t1
    tX: [th('t4', 'chX', chatUser(52), now - 7200e3, { delete_at: now })], // đã xoá
  };
  c.users.cu52 = chatUser(52);
  c.unread = [{ team_id: 'tCL', total_unread_mentions: 2, thread_count: 1, thread_mention_count: 1 }, { team_id: 'tDM', total_unread_mentions: 1, thread_count: 1, thread_mention_count: 0 }];
  const env = makeEnv({ data, now, settings: { chatEnabled: true } });
  const r = await env.send({ type: 'chatThreads' });
  assert.deepEqual([r.status, r.threads.map((t) => [t.id, t.channelId, t.teamId, t.unreadReplies, t.unreadMentions]), r.unreadThreads, r.failed], ['ok', [['t1', 'chMain', 'tCL', 2, 1], ['t3', 'dm1', 'tDM', 1, 0], ['t2', 'chSub', 'tCL', 0, 0]], 2, 0]);
  const t1 = r.threads[0];
  assert.deepEqual([t1.root.id, t1.root.message, t1.root.following, t1.root.replyCount, t1.root.user.fullname, t1.participants.length], ['t1', 'Tin gốc t1', true, 3, 'Người 50', 2]); // tên người gửi tin gốc đọc thêm
  assert.ok(env.calls.includes('GET chat:v4/users/me/teams/tCL/threads?per_page=25&extended=true'));
  // Chỉ chưa đọc; team không đọc được thì bỏ qua và đếm
  c.threadsDenied = ['tX'];
  const u = await env.send({ type: 'chatThreads', unread: true });
  assert.deepEqual([u.threads.map((t) => t.id), u.failed], [['t1', 't3'], 1]);
  assert.ok(env.calls.includes('GET chat:v4/users/me/teams/tDM/threads?per_page=25&extended=true&unread=true'));
  // Danh sách cuộc trò chuyện: số thread có bình luận chưa đọc (một lệnh cho cả tài khoản)
  const ov = await env.send({ type: 'chatOverview', quick: true });
  assert.deepEqual(ov.threads, { unread: 2, mentions: 1 });
  c.unread = [{ team_id: 'tCL', total_unread_mentions: 2 }]; // máy chủ không có số thread
  assert.equal((await env.send({ type: 'chatOverview', quick: true })).threads, null);
});

test('trang Chat: sửa tin của mình, ghim / bỏ ghim (theo Chạy thử, ghi Nhật ký), tin đã ghim, gợi ý @tên', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  c.posts.chMain = [chatPost('p1', 'chMain', c.me, 'Tin cũ', now - 60e3), chatPost('p2', 'chMain', chatUser(60), 'Nội quy nhóm', now - 3600e3, { is_pinned: true, author: undefined })];
  c.users.cu60 = chatUser(60);
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: true } });
  // Sửa tin của mình: thật kể cả Chạy thử
  const ed = await env.send({ type: 'chatEdit', postId: 'p1', message: '  Tin đã sửa  ' });
  assert.deepEqual([ed.status, ed.post.message, ed.post.editAt], ['ok', 'Tin đã sửa', 123]);
  assert.deepEqual(env.bodies.find(([k]) => k === 'PUT chat:v4/posts/p1/patch')[1], { id: 'p1', message: 'Tin đã sửa' });
  assert.match((await env.send({ type: 'chatEdit', postId: 'p1', message: '   ' })).message, /trống/);
  assert.match((await env.send({ type: 'chatEdit', postId: '../x', message: 'a' })).message, /Thiếu/);
  // Ghim: theo Chạy thử (không gọi), ghi Nhật ký; tắt Chạy thử thì gọi thật
  const dry = await env.send({ type: 'chatPin', postId: 'p1', pin: true, groupName: 'Crypto Life', snippet: 'Tin đã sửa', user: { id: 'me1', username: 'kai' } });
  assert.deepEqual([dry.dryRun, dry.pinned, env.calls.includes('POST chat:v4/posts/p1/pin'), env.storage.log[0].kind, env.storage.log[0].action, env.storage.log[0].status], [true, true, false, 'chat', 'pin', 'dry']);
  env.storage.settings = { ...env.storage.settings, dryRun: false };
  const real = await env.send({ type: 'chatPin', postId: 'p2', pin: false, groupName: 'Crypto Life' });
  assert.deepEqual([real.ok, env.calls.includes('POST chat:v4/posts/p2/unpin'), env.storage.log[0].action], [1, true, 'unpin']);
  // Tin đã ghim: mới nhất trước, tên người viết đọc thêm
  const pinned = await env.send({ type: 'chatPinned', channelId: 'chMain' });
  assert.deepEqual([pinned.status, pinned.posts.map((p) => [p.id, p.pinned, p.user.fullname])], ['ok', [['p2', true, 'Người 60']]]);
  // Gợi ý @tên: người trong kênh
  const men = await env.send({ type: 'chatMentions', channelId: 'chMain', teamId: 'tCL', term: 'user6' });
  assert.deepEqual([men.status, men.users.map((u) => u.username)], ['ok', ['user60']]);
  assert.ok(env.calls.includes('GET chat:v4/users/autocomplete?in_team=tCL&in_channel=chMain&name=user6&limit=8'));
  await env.send({ type: 'chatMentions', channelId: 'chMain', term: 'a b<c>' });
  assert.ok(env.calls.includes('GET chat:v4/users/autocomplete?in_channel=chMain&name=abc&limit=8')); // bỏ ký tự lạ
});

test('trang Chat: biểu cảm (thả / bỏ, ai đã thả), tìm tin trong kênh / mọi nơi', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  c.posts.chMain = [chatPost('p1', 'chMain', chatUser(60), 'Ví lạnh nào tốt?', now - 60e3, { metadata: { reaction_stats: [{ emoji_name: '+1', count: 2, top_reactors: ['cu60', 'cu61'], user_reacted: true }] } })];
  c.posts.chSub = [chatPost('s1', 'chSub', chatUser(61), 'Mình dùng ví lạnh Ledger', now - 120e3, { author: undefined })];
  c.posts.chX = [chatPost('x1', 'chX', chatUser(62), 'Ví lạnh ở kênh khác', now - 30e3)];
  c.users.cu61 = chatUser(61);
  c.reactions = { p1: [{ user_id: 'cu60', post_id: 'p1', emoji_name: '+1' }, { user_id: 'cu61', post_id: 'p1', emoji_name: '+1' }, { user_id: 'cu1', post_id: 'p1', emoji_name: 'heart' }] };
  c.users.cu60 = chatUser(60);
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: true } });
  // Biểu cảm của tin có sẵn trong trang tin
  const page = await env.send({ type: 'chatPosts', channelId: 'chMain' });
  assert.deepEqual(page.posts[0].reactions, [{ name: '+1', count: 2, mine: true, top: ['cu60', 'cu61'] }]);
  // Thả / bỏ: việc của mình, thật kể cả Chạy thử
  assert.deepEqual(await env.send({ type: 'chatReact', postId: 'p1', emoji: 'heart', add: true, meChatId: 'cu1' }), { status: 'ok', added: true, mode: 'direct' });
  assert.deepEqual(env.bodies.find(([k]) => k === 'POST chat:v4/reactions')[1], { user_id: 'cu1', post_id: 'p1', emoji_name: 'heart' });
  assert.equal((await env.send({ type: 'chatReact', postId: 'p1', emoji: '+1', add: false, meChatId: 'cu1' })).status, 'ok');
  assert.ok(env.calls.includes('DELETE chat:v5/users/cu1/posts/p1/reactions/%2B1'));
  assert.match((await env.send({ type: 'chatReact', postId: 'p1', emoji: 'a/b', meChatId: 'cu1' })).message, /Thiếu/);
  // Ai đã thả: theo emoji, có tên
  const who = await env.send({ type: 'chatReactions', postId: 'p1' });
  assert.deepEqual(who.reactions, { '+1': [{ chatId: 'cu60', fullname: 'Người 60' }, { chatId: 'cu61', fullname: 'Người 61' }], heart: [{ chatId: 'cu1', fullname: '' }] }); // chính mình: trang ghi "Bạn"
  // Tìm trong kênh: tìm trong team của kênh rồi lọc theo kênh
  const inCh = await env.send({ type: 'chatSearch', terms: 'ví lạnh', channelId: 'chSub', teamId: 'tCL' });
  assert.deepEqual([inCh.status, inCh.posts.map((p) => [p.id, p.user.fullname])], ['ok', [['s1', 'Người 61']]]);
  assert.deepEqual(env.bodies.find(([k]) => k === 'POST chat:v4/teams/tCL/posts/search')[1].terms, 'ví lạnh');
  // Mọi nơi: lệnh chung; máy chủ không có thì tìm từng team
  const all = await env.send({ type: 'chatSearch', terms: '  ví   lạnh ' });
  assert.deepEqual(all.posts.map((p) => p.id), ['x1', 'p1', 's1']);
  c.noGlobalSearch = true;
  const each = await env.send({ type: 'chatSearch', terms: 'ví lạnh' });
  assert.deepEqual(each.posts.map((p) => p.id), ['x1', 'p1', 's1']);
  assert.ok(env.calls.includes('POST chat:v4/teams/tX/posts/search'));
  assert.match((await env.send({ type: 'chatSearch', terms: 'v' })).message, /ít nhất 2/);
});

test('chat Beincom: báo bình luận mới ở thread đang theo dõi (lần đầu chỉ ghi nhận; không kèm nội dung)', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  const th = (id, at, extra = {}) => ({ id, reply_count: 2, last_reply_at: at, unread_replies: 1, unread_mentions: 0, participants: [chatUser(70), chatUser(71)], post: { id, channel_id: 'chMain', message: 'Nội dung bí mật', create_at: at - 1, metadata: {} }, ...extra });
  c.threads = { tCL: [th('t1', now - 60e3)] };
  c.unread = [{ team_id: 'tCL', total_unread_mentions: 0, thread_count: 1, thread_mention_count: 0 }, { team_id: 'tX', total_unread_mentions: 0, thread_count: 0, thread_mention_count: 0 }];
  const env = makeEnv({ data, now, settings: { chatEnabled: true } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const n = () => env.notifications.filter((x) => x.id === 'bg-chat-thread');
  assert.equal(n().length, 0); // lần đầu chỉ ghi nhận
  assert.deepEqual(env.storage.state.chatThreadSeen, { t1: now - 60e3 });
  assert.ok(env.calls.includes('GET chat:v4/users/me/teams/tCL/threads?per_page=10&extended=true&unread=true'));
  assert.ok(!env.calls.includes('GET chat:v4/users/me/teams/tX/threads?per_page=10&extended=true&unread=true')); // team không có thread chưa đọc
  // Bình luận mới: báo một lần, có số lần nhắc tên, tên người tham gia, không có nội dung tin
  c.threads.tCL = [th('t1', now + 5e3, { unread_replies: 2, unread_mentions: 1 }), th('t2', now + 6e3)];
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.deepEqual([n().length, n()[0].title, n()[0].message], [1, 'BeinGroup: 2 thread bạn theo dõi có bình luận mới (1 lần nhắc bạn)', 'Người tham gia: Người 70, Người 71. Bấm để xem.']);
  assert.ok(!JSON.stringify(env.notifications).includes('bí mật') && !JSON.stringify(env.storage.state).includes('bí mật'));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(n().length, 1); // không báo lại
  // Tắt: không đọc thread
  const off = makeEnv({ data, now, settings: { chatEnabled: true, chatThreads: false } });
  await scan(off);
  assert.ok(!off.calls.some((x) => x.includes('/threads?')));
});

test('chat Beincom: thông báo tách lời mời trò chuyện với tin nhắn riêng', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  const env = makeEnv({ data, now, settings: { chatEnabled: true } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  addRequests(c, now);
  c.channels.tDM[0] = { ...c.channels.tDM[0], total_msg_count: 6, last_post_at: now + 2 };
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const st = env.storage.state;
  assert.deepEqual(st.chatUnread.dms.map((d) => [d.channelId, !!d.request]), [['dm1', false], ['rq1', true]]);
  const n = env.notifications.filter((x) => x.id === 'bg-chat-dm');
  assert.deepEqual([n.length, n[0]?.title, n[0]?.message], [1, 'BeinGroup: 1 tin nhắn riêng mới, 1 lời mời trò chuyện mới', 'Từ: Người 50, Người 90 (lời mời). Bấm để mở chat.']);
});

test('trang Chat: tin của kênh (trang mới nhất, cũ hơn, mới từ lần trước), gửi tin, trả lời, đánh dấu đã đọc, xoá tin', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  const c = (data.chat = chatFixture(now));
  c.posts.chMain = Array.from({ length: 5 }, (_, i) => chatPost('p' + i, 'chMain', chatUser(60 + i), 'Tin ' + i, now - (10 - i) * 60e3));
  c.posts.chSub = [chatPost('s1', 'chSub', chatUser(67), 'Ở kênh không có quyền xoá', now - 60e3)];
  const env = makeEnv({ data, now, settings: { chatEnabled: true, dryRun: true } });
  const page = await env.send({ type: 'chatPosts', channelId: 'chMain', perPage: 3 });
  assert.deepEqual([page.status, page.posts.map((p) => p.id), page.hasMore], ['ok', ['p2', 'p3', 'p4'], true]); // cũ → mới
  assert.deepEqual([page.posts[0].user.fullname, page.posts[0].user.chatId, page.posts[0].updateAt], ['Người 62', 'cu62', now - 8 * 60e3]);
  const older = await env.send({ type: 'chatPosts', channelId: 'chMain', before: 'p2', perPage: 3 });
  assert.ok(env.calls.includes('GET chat:v5/channels/chMain/posts?before=p2&page=0&per_page=3&skipFetchThreads=false&collapsedThreads=true&collapsedThreadsExtended=true'));
  assert.equal(older.status, 'ok');
  const since = await env.send({ type: 'chatPosts', channelId: 'chMain', since: now - 7 * 60e3 });
  assert.deepEqual(since.posts.map((p) => p.id), ['p3', 'p4']);
  assert.match((await env.send({ type: 'chatPosts', channelId: 'bad/id' })).message, /Thiếu/);
  // Gửi tin của mình: gửi thật kể cả khi Chạy thử
  const sent = await env.send({ type: 'chatSend', channelId: 'chMain', message: '  Chào mọi người  ', rootId: 'p4' });
  assert.equal(sent.status, 'ok');
  assert.deepEqual(env.bodies.find(([k]) => k === 'POST chat:v4/posts')[1], { channel_id: 'chMain', message: 'Chào mọi người', root_id: 'p4' });
  assert.match((await env.send({ type: 'chatSend', channelId: 'chMain', message: '   ' })).message, /trống/);
  assert.match((await env.send({ type: 'chatSend', channelId: 'chMain', message: 'x'.repeat(4001) })).message, /dài quá/);
  // Đánh dấu đã đọc
  assert.equal((await env.send({ type: 'chatView', channelId: 'chMain' })).status, 'ok');
  assert.deepEqual(env.bodies.find(([k]) => k === 'POST chat:v4/channels/members/me/view')[1], { channel_id: 'chMain', prev_channel_id: '', collapsed_threads_supported: true });
  // Xoá tin của mình: xoá luôn
  assert.equal((await env.send({ type: 'chatDeleteMsg', postId: 'p4', channelId: 'chMain', own: true })).status, 'ok');
  assert.ok(env.calls.includes('DELETE chat:v4/posts/p4'));
  // Xoá tin người khác: cần quyền; theo Chạy thử, ghi Nhật ký
  const dry = await env.send({ type: 'chatDeleteMsg', postId: 'p3', channelId: 'chMain', groupName: 'Crypto Life', snippet: 'Tin 3', user: { id: 'u63', username: 'user63', fullname: 'Người 63' } });
  assert.deepEqual([dry.dryRun, dry.dry, env.calls.includes('DELETE chat:v4/posts/p3'), env.storage.log[0].status, env.storage.log[0].kind], [true, 1, false, 'dry', 'chat']);
  env.storage.settings = { ...env.storage.settings, dryRun: false };
  const real = await env.send({ type: 'chatDeleteMsg', postId: 'p3', channelId: 'chMain', groupName: 'Crypto Life', snippet: 'Tin 3', user: { id: 'u63', username: 'user63' } });
  assert.deepEqual([real.ok, env.calls.includes('DELETE chat:v4/posts/p3'), env.storage.log[0].username], [1, true, 'user63']);
  assert.match((await env.send({ type: 'chatDeleteMsg', postId: 's1', channelId: 'chSub' })).message, /không có quyền xoá/);
  assert.ok(!env.calls.includes('DELETE chat:v4/posts/s1'));
});

test('popup: nền ghi sẵn gói số đếm nhỏ (popupInfo) sau mỗi lần quét / xử lý; vẫn có khi tắt addon', async () => {
  const env = makeEnv();
  await scan(env);
  const p = env.storage.popupInfo;
  assert.deepEqual([p.hasSnapshot, p.hasRecent, p.lastScan > 0, p.lastResult.status], [true, true, true, 'ok']);
  assert.deepEqual([p.totals.requests, p.totals.posts], [3, 2]);
  assert.deepEqual(p.todo.map((g) => [g.id, g.pendingTotal, g.approvalCount]), [['gFood', 3, 0], ['gCL', 0, 2]]);
  assert.ok(JSON.stringify(p).length < 2000); // nhỏ: không chứa bài, yêu cầu, nhật ký
  assert.ok(!('requests' in p.todo[0]));
  // Duyệt hết yêu cầu -> gói cập nhật
  env.storage.settings = { ...env.storage.settings, dryRun: false, actionDelaySec: 1 };
  await env.send({ type: 'act', action: 'approve', groupId: 'gFood', requestIds: ['jr1', 'jr2', 'jr3'] });
  assert.deepEqual([env.storage.popupInfo.totals.requests, env.storage.popupInfo.todo.map((g) => g.id)], [0, ['gCL']]);
  // Kết quả quét đổi ở nơi khác (Dashboard, khôi phục bản sao lưu): nền tự tính lại gói
  env.storage.state.snapshot.groups.find((g) => g.id === 'gCL').approvalCount = 5;
  env.listeners.storage({ state: { newValue: {} } }, 'local');
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  assert.equal(env.storage.popupInfo.todo[0].approvalCount, 5);
  // Tắt addon: huy hiệu OFF nhưng popup vẫn có số lần quét trước
  env.storage.settings = { ...env.storage.settings, active: false };
  await env.send({ type: 'refreshBadge' });
  assert.deepEqual([env.badge.text, env.storage.popupInfo.totals.posts, env.storage.popupInfo.hasSnapshot], ['OFF', 5, true]);
});

// ---------- Bảo vệ community ----------

test('Bảo vệ community: mỗi lần quét đọc người vào (chỉ đọc), báo tài khoản giống admin và đợt vào ồ ạt một lần; Không phải thì không báo lại', async () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const data = fixture();
  data.users.gCL = [{ ...user(61), fullname: 'Kai Crypto', username: 'kaicrypto', isAdmin: true }, { ...user(62) }];
  const join = (id, u, min) => ({ id, useCase: 'join.community.as_member', eventTime: new Date(now - min * 60e3).toISOString(), groupId: 'gCL', data: { actor: u, group: { id: 'gCL', name: 'Crypto Life' } } });
  data.teamEvents = {
    gCL: [
      ...Array.from({ length: 33 }, (_, i) => join('j' + i, { ...user(700 + i), avatar: i % 3 ? '' : user(700 + i).avatar }, 5 + i)),
      join('ji1', { ...user(801), fullname: 'Kai Crypt0', username: 'kai_crypto_vn' }, 3),
      join('ji2', { ...user(802), fullname: 'Hỗ trợ Crypto Life', username: 'hotro_cl' }, 2),
      join('old', { ...user(803), fullname: 'Kai Crypto', username: 'kc' }, 600), // trước lần theo dõi đầu (2 giờ)
    ],
  };
  const env = makeEnv({ data, now, settings: { guardJoins: true, burstJoins: 30 } });
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const st = env.storage.state;
  assert.deepEqual(st.admins.byGroup.gCL.map((a) => a.id), ['u61']);
  assert.ok(env.calls.includes(`GET group/groups/gCL/activity-logs?limit=100&page=1&sort=desc&useCase=${encodeURIComponent('join.community.as_member,join.group.as_member,approve.join_request,accept.invitation')}&from=${now - 2 * 3600e3}&to=${now}`));
  assert.ok(!env.calls.some((c) => c.includes('groups/gCLsub/activity-logs') && c.includes('useCase=join.community'))); // một chỗ mỗi community (group gốc)
  assert.deepEqual(st.impostors.map((x) => [x.user.id, x.level, x.source, x.groupName]), [['u802', 'bad', 'join', 'Crypto Life'], ['u801', 'bad', 'join', 'Crypto Life']]);
  assert.match(st.impostors[1].reason, /Kai Crypto \(@kaicrypto\)/);
  const n = (id) => env.notifications.filter((x) => x.id === id);
  assert.equal(n('bg-impostor').length, 1);
  assert.equal(n('bg-impostor')[0].title, 'BeinGroup: 2 tài khoản giống admin vừa vào');
  assert.equal(n('bg-burst-gCL').length, 1);
  assert.equal(n('bg-burst-gCL')[0].title, 'BeinGroup: 35 người vào Crypto Life trong 60 phút');
  assert.match(n('bg-burst-gCL')[0].message, /^22 người không có ảnh đại diện/);
  assert.deepEqual([st.bursts.gCL.count, st.recentJoins.gCL.length, st.joinSince.gCL], [35, 35, now]);
  assert.equal(writes(env).length, 0);
  // Lần quét sau: đọc từ lần trước, không báo lại
  data.teamEvents.gCL.push(join('ji3', { ...user(804), fullname: 'Kai Crypto', username: 'kai.crypto.2' }, 0));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(n('bg-burst-gCL').length, 1);
  assert.equal(n('bg-impostor').length, 2);
  assert.equal(n('bg-impostor')[1].title, 'BeinGroup: 1 tài khoản giống admin vừa vào');
  // Không phải: bỏ khỏi danh sách, không báo lại; bỏ đợt vào ồ ạt
  assert.equal((await env.send({ type: 'guardAct', action: 'notImpostor', userIds: ['u801'] })).status, 'ok');
  assert.deepEqual([env.storage.state.impostors.some((x) => x.user.id === 'u801'), env.storage.state.impostorOk], [false, ['u801']]);
  assert.equal((await env.send({ type: 'guardAct', action: 'dismissBurst', groupId: 'gCL' })).status, 'ok');
  assert.equal(env.storage.state.bursts.gCL.dismissed, true);
  assert.match((await env.send({ type: 'guardAct', action: 'xx' })).message, /không hợp lệ/);
  // Tắt: không đọc người vào
  const off = makeEnv({ data: fixture(), now, settings: { guardJoins: false } });
  await scan(off);
  assert.ok(!off.calls.some((c) => c.includes('useCase=join.community')));
});

test('Bảo vệ community: tìm trong toàn bộ thành viên theo tên từng admin và chữ admin / hỗ trợ (chỉ đọc), bỏ người đã đánh dấu Không phải', async () => {
  const data = fixture();
  data.users.gCL = [
    { ...user(61), fullname: 'Kai Crypto', username: 'kaicrypto', isAdmin: true },
    { ...user(80), fullname: 'Kai Crypto', username: 'kai.crypto.vn' },
    { ...user(81), fullname: 'CSKH Beincom', username: 'cskh_bic' },
    { ...user(82), fullname: 'Kai Nguyễn', username: 'kainguyen' }, // tìm thấy theo "Kai" nhưng không giống
  ];
  const env = makeEnv({ data });
  await scan(env);
  env.storage.state = { ...env.storage.state, impostorOk: ['u81'] };
  const before = env.calls.length;
  const r = await env.send({ type: 'guardSearch', groupId: 'gCL' });
  assert.deepEqual([r.status, r.found, r.added], ['ok', 1, 1]);
  assert.ok(r.checked >= 2);
  const calls = env.calls.slice(before);
  assert.ok(calls.includes('GET group/groups/gCL/users?limit=100&offset=0&key=Kai%20Crypto'));
  assert.ok(calls.includes('GET group/groups/gCL/users?limit=100&offset=0&key=cskh'));
  assert.ok(calls.every((c) => c.startsWith('GET ')));
  assert.deepEqual(env.storage.state.impostors.map((x) => [x.user.id, x.level, x.source]), [['u80', 'bad', 'search']]);
});

// ---------- Tìm & dọn bài ----------

test('Tìm & dọn: tìm theo từ khoá ở mỗi community một lần (group gốc), kèm admin group; tìm mọi bài của một người; chỉ đọc', async () => {
  const data = fixture();
  const spam = { id: 'x9', username: 'spammer', fullname: 'Spam Bot', avatar: '' };
  data.search = [
    post('s1', 'Nhận AIRDROP tại t.me/free', { publishedAt: nowIso(60), actor: spam }),
    post('s2', 'Claim airdrop x100', { publishedAt: nowIso(30), actor: spam }),
    post('s3', 'Hỏi về airdrop testnet', { publishedAt: nowIso(10) }),
    post('s4', 'Airdrop đã ẩn', { publishedAt: nowIso(5), actor: spam, isHidden: true }),
    post('s5', 'Bitcoin hôm nay', { publishedAt: nowIso(3), actor: spam }),
    ...Array.from({ length: 230 }, (_, i) => post('b' + i, 'Spam số ' + i, { publishedAt: nowIso(1000 + i), actor: spam })),
  ];
  data.users.gCL = [{ ...user(61), isAdmin: true }, { ...user(62) }];
  const env = makeEnv({ data });
  await scan(env);
  const before = env.calls.length;
  const r = await env.send({ type: 'sweepSearch', keyword: '  airdrop ', days: 7 });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.posts.map((p) => p.id), ['s3', 's2', 's1']); // mới nhất trước, không có bài đã ẩn
  assert.deepEqual(r.posts[0].seenIn, ['gCL']);
  assert.deepEqual([r.adminIds.includes('u61'), r.adminIds.includes('u62'), r.truncated], [true, false, false]);
  const calls = env.calls.slice(before);
  const search = calls.filter((c) => c.startsWith('GET content/contents?'));
  assert.deepEqual(search.map((c) => c.match(/groupId=(\w+)/)[1]).sort(), ['gCL', 'gFood']); // mỗi community một lần, group gốc
  assert.ok(search.every((c) => /^GET content\/contents\?keyword=airdrop&groupId=\w+&isIncludedInnerGroups=true&startTime=\d{4}-[^&]+&limit=25$/.test(c)));
  assert.ok(calls.includes('GET group/groups/gCL/users?limit=100&offset=0'));
  // Chỉ trong một community
  const one = env.calls.length;
  await env.send({ type: 'sweepSearch', keyword: 'airdrop', groupId: 'gCLsub' });
  assert.deepEqual(env.calls.slice(one).filter((c) => c.startsWith('GET content/contents?')).map((c) => c.match(/groupId=(\w+)/)[1]), ['gCL']);
  // Từ khoá quá ngắn: không gọi API
  const n = env.calls.length;
  assert.match((await env.send({ type: 'sweepSearch', keyword: ' a ' })).message, /ít nhất 2/);
  assert.equal(env.calls.length, n);
  // Mọi bài của một người: lọc actors[], tối đa 8 trang mỗi community
  const u0 = env.calls.length;
  const up = await env.send({ type: 'userPosts', userId: 'x9' });
  assert.equal(up.status, 'ok');
  assert.ok(up.posts.every((p) => p.actor.id === 'x9' && !p.isHidden));
  assert.equal(up.truncated, true);
  const ucalls = env.calls.slice(u0);
  assert.ok(ucalls.every((c) => c.startsWith('GET content/contents?actors[]=x9&groupId=')));
  assert.equal(ucalls.length, 16); // 2 community × 8 trang
  assert.equal(writes(env).length, 0);
  assert.match((await env.send({ type: 'userPosts' })).message, /Thiếu/);
});

test('Tìm & dọn: ẩn các bài đã chọn ở group mình quản trị (lý do, nhật ký), bỏ bài của mình và bài ở group không quản trị; Chạy thử không gửi', async () => {
  const data = fixture();
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  const a = BG.slimPost(post('h1', 'Airdrop lừa đảo'));
  const mine = BG.slimPost(post('h2', 'Bài của mình', { actor: { id: 'me1', username: 'me', fullname: 'Tôi', avatar: '' } }));
  const outside = BG.slimPost(post('h3', 'Ở group khác', { audience: { groups: [{ id: 'gOther', name: 'Khác' }] } }));
  const r = await env.send({ type: 'hidePosts', posts: [a, mine, outside], reasonType: 'SPAM' });
  assert.deepEqual([r.status, r.ok, r.hidden, r.skipped], ['ok', 1, ['h1'], 2]);
  assert.deepEqual(writes(env), ['POST content/contents/h1/hide']);
  assert.deepEqual(env.bodies.at(-1)[1], { reasonType: 'SPAM', groupIds: ['gCL'] });
  assert.deepEqual([env.storage.log[0].action, env.storage.log[0].contentId, env.storage.log[0].autoReason, env.storage.log[0].source], ['hide', 'h1', 'Tìm & dọn', 'manual']);
  assert.match((await env.send({ type: 'hidePosts', posts: [mine, outside] })).message, /Không có bài nào ẩn được/);
  assert.match((await env.send({ type: 'hidePosts', posts: [a], reasonType: 'XX' })).message, /không hợp lệ/);
  // Chạy thử
  env.storage.settings = { ...env.storage.settings, dryRun: true };
  const dry = await env.send({ type: 'hidePosts', posts: [BG.slimPost(post('h4', 'Spam nữa'))] });
  assert.deepEqual([dry.dryRun, writes(env).length, env.storage.log[0].status, dry.hidden], [true, 1, 'dry', []]);
});

// ---------- Hiệu quả bài đã đăng ----------

test('hiệu quả bài: đăng thật qua addon thì ghi lại; quét tự động đọc số liệu khi tới mốc 24 giờ / 7 ngày; bài đã xoá đánh dấu; Cập nhật đọc số hiện tại; chạy thử không ghi', async () => {
  const env = makeEnv({ settings: { dryRun: false } });
  await scan(env);
  const at = new Date(Date.now() + 3 * 3600e3).toISOString();
  await env.send({ type: 'compose', groupIds: ['gCL'], content: 'Bản tin sáng', scheduledAt: at });
  const e = env.storage.postStats.new1;
  assert.deepEqual([e.type, e.publishAt, e.groupName, e.snippet], ['POST', at, 'Crypto Life', 'Bản tin sáng']);
  // Giả như bài đã đăng 25 giờ trước, có số liệu
  const pub = new Date(Date.now() - 25 * 3600e3).toISOString();
  env.storage.postStats.new1.publishAt = pub;
  env.storage.postStats.gone1 = { id: 'gone1', type: 'POST', publishAt: pub, at: Date.now() };
  env.data.timeline.gCL.push(post('new1', 'Bản tin sáng', { status: 'PUBLISHED', publishedAt: pub, reactionsCount: { like: 3, love: 2 }, commentsCount: 4, totalUsersSeen: 120 }));
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const s1 = env.storage.postStats.new1;
  assert.deepEqual([s1.d1.views, s1.d1.reactions, s1.d1.comments, s1.d1.ageH, s1.d7, s1.publishedAt], [120, 5, 4, 25, undefined, pub]);
  assert.equal(env.storage.postStats.gone1.gone, true);
  // Quét bấm tay không đo; Cập nhật đọc số hiện tại
  env.data.timeline.gCL.at(-1).commentsCount = 9;
  const r = await env.send({ type: 'postStatsRefresh' });
  assert.deepEqual([r.status, r.measured, env.storage.postStats.new1.cur.comments, env.storage.postStats.new1.d1.comments], ['ok', 1, 9, 4]);
  // Chạy thử: không ghi vào theo dõi
  env.storage.settings = { ...env.storage.settings, dryRun: true };
  await env.send({ type: 'compose', groupIds: ['gCL'], content: 'Thử' });
  assert.deepEqual(Object.keys(env.storage.postStats).sort(), ['gone1', 'new1']);
});

// ---------- Lỗi kỹ thuật ----------

const ticks = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

test('Lỗi kỹ thuật: ghi lỗi Beincom khi gọi API (gộp lần lặp), bỏ qua hết phiên / bài đã xoá; nhận lỗi trang gửi về; lệnh hỏng giữa chừng trả câu báo', async () => {
  const data = fixture();
  data.failPublish = true;
  const env = makeEnv({ data, settings: { dryRun: false } });
  await scan(env);
  await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Bài lỗi' });
  await env.send({ type: 'compose', groupIds: ['gFood'], content: 'Bài lỗi lần hai' });
  await ticks();
  const api = env.storage.diagLog.filter((e) => e.kind === 'api');
  assert.equal(api.length, 1);
  assert.deepEqual([api[0].method, api[0].status, api[0].code, api[0].count, api[0].where], ['PUT', 400, 'api.validation_error', 2, 'sw']);
  assert.match(api[0].path, /^content\/posts\/new\d\/publish$/);
  // Bài đã bị xoá trên web: không tính là lỗi
  await env.send({ type: 'scheduleAct', action: 'cancel', contentId: 'gone1' });
  await ticks();
  assert.ok(!env.storage.diagLog.some((e) => String(e.path).includes('gone1')));
  // Trang báo lỗi JavaScript; nơi lạ thì bỏ
  await env.send({ type: 'diag', entry: { where: 'dashboard', message: 'TypeError: x is undefined', stack: 'at render (chrome-extension://abcdefghijklmnopabcdefghijklmnop/dash/content.js:12:3)' } });
  await env.send({ type: 'diag', entry: { where: 'evil', message: 'x' } });
  await ticks();
  const js = env.storage.diagLog.filter((e) => e.kind === 'js');
  assert.deepEqual([js.length, js[0].where, js[0].stack], [1, 'dashboard', 'at render (dash/content.js:12:3)']);
  // Lệnh hỏng giữa chừng: trả câu báo, ghi lỗi
  const bad = await env.send({
    type: 'tags',
    get groupId() {
      throw new Error('boom');
    },
  });
  await ticks();
  assert.deepEqual([bad.status, /boom/.test(bad.message)], ['error', true]);
  assert.ok(env.storage.diagLog.some((e) => e.kind === 'js' && /Lệnh "tags" lỗi: boom/.test(e.message)));
  // Hết phiên đăng nhập: không ghi
  const out = makeEnv({ loggedIn: false });
  await scan(out);
  await ticks();
  assert.ok(!(out.storage.diagLog || []).some((e) => e.status === 401));
});

// ---------- Thành viên mới có ở lại không, báo cáo tháng ----------

const DAY_MIN = 1440;
// Sự kiện nhật ký thành viên như API trả: tự vào / rời thì chỉ có actor; bị xoá / cấm / được duyệt thì có user (người bị tác động)
const memberEvent = (n, useCase, at, extra = {}) => ({ id: `me-${useCase}-${n}-${at}`, eventTime: typeof at === 'number' ? new Date(at).toISOString() : at, useCase, data: { actor: user(n), ...extra } });

test('Thành viên mới có ở lại không: đọc nhật ký thành viên (objectType=MEMBER, from / to, trang 100) và bài của người mới theo lô ≤ 20 người; chỉ đọc', async () => {
  const data = fixture();
  const ago = (min) => Date.now() - min * 60e3;
  data.memberEvents = {
    gCL: [
      // 130 người vào trong 26 ngày qua (2 trang nhật ký)
      ...Array.from({ length: 130 }, (_, i) => memberEvent(100 + i, 'join.community.as_member', ago(((i % 26) + 1) * DAY_MIN))),
      memberEvent(101, 'leave.group', ago(2 * DAY_MIN - 60)), // vào 2 ngày trước, rời sau 1 giờ
      { ...memberEvent(9, 'remove.member', ago(DAY_MIN)), data: { actor: user(9), user: user(102) } }, // bị xoá
      memberEvent(103, 'leave.group', ago(3 * DAY_MIN)),
      memberEvent(103, 'join.community.as_member', ago(2 * DAY_MIN)), // rời rồi vào lại
      memberEvent(5, 'join.community.as_member', ago(40 * DAY_MIN)), // vào trước khoảng xem
      memberEvent(5, 'leave.group', ago(10 * DAY_MIN)),
    ],
  };
  data.search = [
    post('s1', 'Chào cả nhà, mình mới vào', { publishedAt: new Date(ago(60)).toISOString(), actor: user(104) }),
    post('s2', 'Bài từ trước khi vào', { publishedAt: new Date(ago(20 * DAY_MIN)).toISOString(), actor: user(105) }),
  ];
  const env = makeEnv({ data });
  await scan(env);
  const before = env.calls.length;
  const r = await env.send({ type: 'retention', groupId: 'gCL', days: 30 });
  assert.equal(r.status, 'ok');
  const calls = env.calls.slice(before);
  const logCalls = calls.filter((c) => c.includes('activity-logs'));
  assert.equal(logCalls.length, 2);
  assert.match(logCalls[0], /^GET group\/groups\/gCL\/activity-logs\?limit=100&page=1&sort=desc&objectType=MEMBER&from=\d+&to=\d+$/);
  assert.match(logCalls[1], /page=2/);
  const search = calls.filter((c) => c.startsWith('GET content/contents?'));
  assert.equal(search.length, 7); // 130 người / 20 mỗi lần
  assert.ok(search.every((c) => /groupId=gCL&isIncludedInnerGroups=true&startTime=\d{4}-\d\d-\d\dT[\d%A]+.*&limit=25/.test(c)));
  assert.equal(data.searchActorsMax, 20);
  assert.equal(writes(env).length, 0);

  assert.equal(r.cohort.length, 130); // người 5 vào trước khoảng xem: không tính
  const by = Object.fromEntries(r.cohort.map((m) => [m.user.id, m]));
  assert.deepEqual([by.u101.status, by.u102.status, by.u103.status, by.u103.rejoined, by.u100.status], ['left', 'removed', 'stay', true, 'stay']);
  assert.deepEqual(Object.keys(r.actorPosts).sort(), ['u104', 'u105']);
  // Ghép ở Dashboard: bài trước khi vào không tính; bình luận lấy từ bình luận addon đã đọc
  const act = BG.cohortActivity(r.cohort, { posts: r.actorPosts, comments: [{ id: 'c1', actor: { id: 'u106' }, createdAt: new Date(ago(30)).toISOString() }] });
  assert.deepEqual([act.u104, act.u105, act.u106], [{ posts: 1, comments: 0 }, { posts: 0, comments: 0 }, { posts: 0, comments: 1 }]);
  const s = BG.cohortSummary(r.cohort, act, Date.now());
  assert.deepEqual([s.joined, s.stayed, s.left, s.removed, s.posted, s.commented, s.silent, s.quickLeave], [130, 128, 1, 1, 1, 1, 126, 1]);

  assert.match((await env.send({ type: 'retention', groupId: 'gOther' })).message, /quét lại/);
});

test('báo cáo tháng: đọc nhật ký từ đầu tháng trước tới nay, bài từng tháng (startTime / endTime), bài của người mới; Dashboard ghép thành báo cáo', async () => {
  const data = fixture();
  const now = Date.now();
  const key = BG.shiftMonth(BG.monthKey(now), -1);
  const cur = BG.monthRange(key, now);
  const prev = BG.monthRange(BG.shiftMonth(key, -1), now);
  const at = (r, day, h = 3) => r.from + day * 864e5 + h * 3600e3;
  data.memberEvents = {
    gCL: [
      memberEvent(201, 'join.community.as_member', at(prev, 5)),
      memberEvent(202, 'join.community.as_member', at(prev, 6)),
      memberEvent(202, 'leave.group', at(prev, 20)),
      memberEvent(211, 'join.community.as_member', at(cur, 2)),
      memberEvent(212, 'join.community.as_member', at(cur, 3)),
      memberEvent(213, 'join.community.as_member', at(cur, 4)),
      memberEvent(212, 'leave.group', at(cur, 3, 9)), // rời ngay trong ngày đầu
      memberEvent(214, 'join.community.as_member', now - 3600e3), // tháng này (sau tháng báo cáo)
      memberEvent(150, 'leave.group', now - 2 * 3600e3),
    ],
  };
  const sp = (id, r, day, extra) => post(id, 'Bài ' + id, { publishedAt: new Date(at(r, day)).toISOString(), reactionsCount: { like: 3 }, commentsCount: 2, totalUsersSeen: 40, ...extra });
  data.search = [
    ...Array.from({ length: 30 }, (_, i) => sp('m' + i, cur, 1 + (i % 25), { actor: user(300 + (i % 3)) })),
    sp('new1', cur, 10, { actor: user(213), reactionsCount: { like: 9 }, commentsCount: 6 }),
    ...Array.from({ length: 10 }, (_, i) => sp('p' + i, prev, 2 + i)),
  ];
  // Đội admin: việc trong tháng ở group gốc và group con (cả việc làm trên web); việc ngoài tháng, sự kiện tự vào không tính
  const teamEv = (id, useCase, actor, t, extra = {}) => ({ id, useCase, eventTime: new Date(t).toISOString(), groupId: 'gCL', data: { actor: user(actor), group: { id: 'gCL', name: 'Crypto Life' }, ...extra } });
  data.teamEvents = {
    gCL: [
      ...Array.from({ length: 105 }, (_, i) => teamEv('ta' + i, 'approve.join_request', 41, at(cur, 1 + (i % 20)), { user: user(500 + i) })),
      teamEv('tr1', 'remove.member', 42, at(cur, 7), { user: user(600) }),
      teamEv('ts1', 'update.group.settings', 42, at(cur, 8), { changes: { isJoinApproval: { old: false, new: true } } }),
      teamEv('tx1', 'remove.member', 42, at(prev, 7), { user: user(601) }), // tháng trước
    ],
    gCLsub: [teamEv('tg1', 'assign.group_admin', 9, at(cur, 9), { user: user(43), group: { id: 'gCLsub', name: 'Crypto Life - General' } })],
  };
  const env = makeEnv({ data });
  await scan(env);
  const before = env.calls.length;
  const raw = await env.send({ type: 'monthly', groupId: 'gCL', month: key });
  assert.equal(raw.status, 'ok');
  const calls = env.calls.slice(before);
  assert.ok(calls.some((c) => c === `GET group/groups/gCL/activity-logs?limit=100&page=1&sort=desc&objectType=MEMBER&from=${prev.from}&to=${raw.now}`));
  const iso = (t) => encodeURIComponent(new Date(t).toISOString());
  assert.ok(calls.includes(`GET content/contents?groupId=gCL&isIncludedInnerGroups=true&startTime=${iso(cur.from)}&endTime=${iso(cur.to)}&limit=25`));
  assert.ok(calls.includes(`GET content/contents?groupId=gCL&isIncludedInnerGroups=true&startTime=${iso(prev.from)}&endTime=${iso(prev.to)}&limit=25`));
  assert.equal(writes(env).length, 0);
  assert.deepEqual([raw.key, raw.prevKey, raw.group.userCount, raw.months[key].total, raw.months[key].posts.length, raw.months[prev.key].total], [key, prev.key, 12000, 31, 31, 10]);
  assert.deepEqual(Object.keys(raw.actorPosts), ['u213']);
  const teamCalls = calls.filter((c) => c.includes('useCase='));
  assert.ok(teamCalls.includes(`GET group/groups/gCL/activity-logs?limit=100&page=2&sort=desc&useCase=${encodeURIComponent(Object.keys(BG.TEAM_CASES).join(','))}&from=${cur.from}&to=${cur.to}`));
  assert.deepEqual([...new Set(teamCalls.map((c) => c.match(/groups\/(\w+)\//)[1]))].sort(), ['gCL', 'gCLsub']);
  assert.deepEqual([raw.team.length, raw.teamTruncated, raw.teamSkipped], [108, false, []]);

  const r = BG.monthlyReport(raw, {
    log: [
      { time: new Date(at(cur, 5)).toISOString(), kind: 'member', action: 'approve', status: 'ok', groupId: 'gCL' },
      { time: new Date(at(cur, 5)).toISOString(), kind: 'post', action: 'hide', status: 'ok', groupId: 'gFood' }, // group khác: không tính
    ],
    scopeIds: ['gCL', 'gCLsub'],
    scopeNames: ['Crypto Life', 'Crypto Life - General'],
  });
  // 12000 hiện tại; sau cuối tháng: +1 vào (214), −1 rời (150) => cuối tháng 12000; trong tháng +3 vào, −1 rời => đầu tháng 11998
  assert.deepEqual([r.members.start, r.members.end, r.members.joined, r.members.left, r.members.prev.joined, r.members.prev.left], [11998, 12000, 3, 1, 2, 1]);
  assert.deepEqual([r.newcomers.joined, r.newcomers.stayed, r.newcomers.left, r.newcomers.posted, r.newcomers.quickLeave], [3, 2, 1, 1, 1]);
  assert.deepEqual([r.content.cur.posts, r.content.cur.reactions, r.content.cur.comments, r.content.cur.views, r.content.prev.posts], [31, 30 * 3 + 9, 30 * 2 + 6, 31 * 40, 10]);
  assert.equal(r.topPosts[0].id, 'new1');
  assert.deepEqual(r.topAuthors.map((a) => [a.actor.id, a.posts, a.isNew]).slice(0, 1), [['u300', 10, false]]);
  assert.equal(r.topAuthors.find((a) => a.actor.id === 'u213').isNew, true);
  assert.deepEqual([r.actions.approved, r.actions.postsHidden], [1, 0]);
  const text = BG.monthlyText(r);
  assert.match(text, new RegExp(`^BeinGroup: báo cáo ${r.label} — Crypto Life\\n`));
  assert.match(text, /• Thành viên: 11\.998 → 12\.000 \(\+2\) · 3 người vào, 1 người rời \(tháng trước: 2 vào, 1 rời\)/);
  assert.match(text, /• Người mới trong tháng: 3 người · còn ở lại 2 \(67%\) · 1 tự rời · đã đăng bài 1/);
  assert.match(text, /• Bài viết: 31 bài \(tháng trước 10, \+210%\)/);
  assert.match(text, /• Kiểm duyệt qua addon: 1 duyệt thành viên$/m);
  assert.deepEqual(r.team.admins.map((a) => [a.actor.id, a.total, a.counts.approved, a.counts.removed, a.counts.settings, a.counts.roles]), [['u41', 105, 105, 0, 0, 0], ['u42', 2, 0, 1, 1, 0], ['u9', 1, 0, 0, 0, 1]]);
  assert.deepEqual(r.team.changes.map((e) => BG.teamChangeText(e)), ['Gán admin group: Người 43 (@user43)', 'Đổi cài đặt — Duyệt thành viên: tắt → bật']);
  assert.match(text, /• Đội admin \(nhật ký Beincom, cả việc làm trên web\): Người 41 \(@user41\): 105 duyệt vào · Người 42 \(@user42\): 1 xoá, 1 đổi cài đặt · Người 9 \(@user9\): 1 gán \/ gỡ admin/);
  // Group con không có quyền đọc nhật ký: bỏ qua, ghi tên
  data.teamDenied = ['gCLsub'];
  const denied = await env.send({ type: 'monthly', groupId: 'gCL', month: key });
  assert.deepEqual([denied.status, denied.team.length, denied.teamSkipped], ['ok', 107, ['Crypto Life - General']]);

  // Tháng chưa tới / group lạ
  assert.match((await env.send({ type: 'monthly', groupId: 'gCL', month: BG.shiftMonth(BG.monthKey(now), 2) })).message, /chưa bắt đầu/);
  assert.match((await env.send({ type: 'monthly', groupId: 'gOther', month: key })).message, /quét lại/);
});

test('báo cáo tháng: đầu tháng (7 ngày đầu) quét tự động thì nhắc một lần, mở thẳng Thống kê; tắt thì không; gửi báo cáo về Telegram', async () => {
  const now = Date.parse('2026-11-03T03:00:00Z'); // 10 giờ sáng thứ Ba 03/11 giờ VN
  const env = makeEnv({ now });
  env.storage.log = [
    { time: '2026-10-15T03:00:00Z', kind: 'member', action: 'approve', status: 'ok', groupId: 'gFood' },
    { time: '2026-10-16T03:00:00Z', kind: 'comment', action: 'hide', status: 'ok', groupId: 'gCL' },
    { time: '2026-09-16T03:00:00Z', kind: 'member', action: 'approve', status: 'ok', groupId: 'gFood' }, // tháng khác
  ];
  await scan(env);
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const monthly = env.notifications.filter((n) => n.id === 'bg-monthly');
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0].title, 'BeinGroup: báo cáo Tháng 10/2026');
  assert.match(monthly[0].message, /^1 thành viên được duyệt · 1 bài \/ bình luận đã ẩn\. Bấm để xem/);
  assert.equal(env.storage.state.monthlyKey, '2026-10');
  // Quét lại: không nhắc nữa
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.filter((n) => n.id === 'bg-monthly').length, 1);
  // Bấm thông báo: mở tab Thống kê
  env.listeners.notif('bg-monthly');
  assert.match(env.tabsCreated.at(-1), /dashboard\.html#tab=stats&monthly=1$/);

  // Tắt nhắc báo cáo tháng
  const off = makeEnv({ now, settings: { monthlyReport: false } });
  await scan(off);
  off.listeners.alarm({ name: 'beingroup-scan' });
  await scan(off, 'popup');
  assert.equal(off.notifications.filter((n) => n.id === 'bg-monthly').length, 0);
  // Ngày 10 của tháng: không nhắc (đã quá 7 ngày đầu)
  const late = makeEnv({ now: Date.parse('2026-11-10T03:00:00Z') });
  await scan(late);
  late.listeners.alarm({ name: 'beingroup-scan' });
  await scan(late, 'popup');
  assert.equal(late.notifications.filter((n) => n.id === 'bg-monthly').length, 0);

  // Gửi báo cáo về Telegram: cần bật Telegram; tin dài hơn tin thường (tới 3500 ký tự)
  assert.match((await env.send({ type: 'telegramReport', title: 'BeinGroup: báo cáo', text: 'x' })).message, /Chưa bật gửi về Telegram/);
  env.storage.telegram = { enabled: true, token: '123456789:' + 'A'.repeat(35), chatId: '42' };
  const long = '• dòng báo cáo\n'.repeat(150);
  const sent = await env.send({ type: 'telegramReport', title: 'BeinGroup: báo cáo Tháng 10/2026 — Crypto Life', text: long });
  assert.equal(sent.status, 'ok');
  const msg = env.tg.at(-1);
  assert.equal(msg.method, 'sendMessage');
  assert.ok(msg.body.text.startsWith('<b>BeinGroup: báo cáo Tháng 10/2026 — Crypto Life</b>\n'));
  assert.ok(msg.body.text.length > 2000 && msg.body.text.length < 3700);
});

// ---------- Tự kiểm tra ----------

test('Tự kiểm tra: gọi thử các API đọc (chỉ GET), báo dùng được / bỏ qua theo quyền / lỗi khi Beincom đổi dữ liệu; không ghi Lỗi kỹ thuật', async () => {
  const env = makeEnv();
  await scan(env);
  const before = env.calls.length;
  const diagBefore = (env.storage.diagLog || []).length;
  const r = await env.send({ type: 'selfCheck', groupId: 'gFood' });
  assert.equal(r.status, 'ok');
  const by = Object.fromEntries(r.items.map((x) => [x.id, x]));
  const fails = r.items.filter((x) => x.status === 'fail').map((x) => `${x.id}: ${x.detail} ${x.httpStatus} ${x.path}`);
  assert.deepEqual(fails, []);
  assert.deepEqual([by.login.status, by.login.detail, by.members.status, by.approvals.status, by.reports.status, by.memberLog.status, by.search.status], ['ok', '@kai', 'ok', 'ok', 'ok', 'ok', 'ok']);
  assert.deepEqual([by.telegram.status, by.telegram.detail], ['skip', 'chưa bật gửi về Telegram']);
  // Bộ nhớ (không gọi Beincom): dung lượng đang dùng, khoá lớn nhất
  assert.equal(by.storage.status, 'ok');
  assert.match(by.storage.detail, /^[\d,]+ MB \/ 10 MB · nhiều nhất: Kết quả quét/);
  assert.equal(by.teamLog.status, 'ok');
  assert.equal(r.summary.ok + r.summary.skip + r.summary.fail, r.items.length);
  assert.ok(env.calls.slice(before).every((c) => c.startsWith('GET ')));
  assert.deepEqual(env.storage.selfCheck.items.length, r.items.length);
  // Admin group (không phải admin community): mục chỉ dành cho chủ / admin community bị bỏ qua, không gọi API
  const sub = await env.send({ type: 'selfCheck', groupId: 'gCLsub' });
  const sb = Object.fromEntries(sub.items.map((x) => [x.id, x]));
  assert.deepEqual([sb.reports.status, sb.banned.status, sb.officialStats.status, sb.approvals.status], ['skip', 'skip', 'skip', 'skip']);
  assert.ok(!env.calls.some((c) => c.includes('communities/cCL/banned-members')));
  // Beincom trả dữ liệu khác trước: báo lỗi đúng mục; 403 thì là bỏ qua; không ghi vào Lỗi kỹ thuật
  env.data.tagPerm = { cFood: 'lạ' };
  env.data.forbidSettings = true;
  const odd = await env.send({ type: 'selfCheck', groupId: 'gFood' });
  const ob = Object.fromEntries(odd.items.map((x) => [x.id, x]));
  assert.deepEqual([ob.tagPerm.status, ob.settings.status], ['fail', 'skip']);
  assert.match(ob.tagPerm.detail, /đổi API/);
  assert.match(BG.selfCheckText(odd, { version: '0.26.0', ua: 'Chrome/141.0.0.0' }), /^BeinGroup v0\.26\.0 · Chrome\/141\.0\.0\.0 · tự kiểm tra Food Research lúc .*\n\d+ dùng được · \d+ bỏ qua · 1 lỗi\n[\s\S]*✗ Quyền quản lý tag: Beincom trả dữ liệu khác trước — có thể đã đổi API \[200 group\/me\/permissions\/can-cud-tags\/community\/cFood\]/);
  await new Promise((res) => setImmediate(res));
  assert.equal((env.storage.diagLog || []).length, diagBefore);
  // Telegram đã bật: hỏi getMe (không gửi tin)
  env.storage.telegram = { enabled: true, token: '123456789:' + 'A'.repeat(35), chatId: '42' };
  const tgr = await env.send({ type: 'selfCheck', groupId: 'gFood' });
  assert.equal(tgr.items.find((x) => x.id === 'telegram').status, 'ok');
  assert.equal(env.tg.at(-1).method, 'getMe');
  assert.ok(!env.tg.some((t) => t.method === 'sendMessage'));
  // Bộ nhớ sắp đầy (giới hạn 10 MB): lỗi; có quyền không giới hạn thì vẫn dùng được
  env.data.bytesInUse = 9 * 1048576;
  const full = await env.send({ type: 'selfCheck', groupId: 'gFood' });
  assert.deepEqual([full.items.find((x) => x.id === 'storage').status, full.items.find((x) => x.id === 'storage').detail.slice(0, 14)], ['fail', 'Bộ nhớ sắp đầy']);
  env.data.unlimited = true;
  const unl = await env.send({ type: 'selfCheck', groupId: 'gFood' });
  assert.match(unl.items.find((x) => x.id === 'storage').detail, /^9 MB \(không giới hạn\)/);
  assert.equal((await env.send({ type: 'storageUsage' })).bytes, 9 * 1048576);
  // Hết phiên đăng nhập
  const out = makeEnv({ loggedIn: false });
  out.storage.state = env.storage.state;
  assert.equal((await out.send({ type: 'selfCheck', groupId: 'gFood' })).status, 'need_login');
});

// ---------- Nhắc người mới chưa hoạt động ----------

test('nhắc người mới: soạn sẵn sáng thứ Hai (chỉ đọc, không tự đăng), ghi người được nhắc khi đăng thật, đo hiệu quả', async () => {
  const now = Date.parse('2026-10-12T02:00:00Z'); // 9 giờ sáng thứ Hai giờ VN
  const ago = (d) => now - d * 864e5;
  const data = fixture();
  data.memberEvents = {
    gCL: [
      memberEvent(501, 'join.community.as_member', ago(10)), // im lặng -> nhắc
      memberEvent(502, 'join.community.as_member', ago(12)), // đã đăng bài -> không nhắc
      memberEvent(503, 'join.community.as_member', ago(1)), // mới vào 1 ngày -> chưa nhắc
      memberEvent(504, 'join.community.as_member', ago(20)),
      memberEvent(504, 'leave.group', ago(19)), // đã rời -> không nhắc
      memberEvent(505, 'join.community.as_member', ago(25)), // im lặng -> nhắc
      memberEvent(506, 'join.community.as_member', ago(15)), // đã được nhắc 5 ngày trước -> không nhắc lại
    ],
  };
  data.search = [post('n1', 'Chào mọi người', { publishedAt: new Date(ago(5)).toISOString(), actor: user(502) })];
  const env = makeEnv({ data, now, settings: { nudgeWeekly: true, nudgeGroupId: 'gCL', dryRun: false, welcomeReminder: false, weeklyReport: false } });
  env.storage.nudges = [{ id: 'old1', groupId: 'gCL', groupName: 'Crypto Life', at: new Date(ago(5)).toISOString(), userIds: ['u506'] }];
  await scan(env);
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const d = env.storage.nudgeDraft;
  assert.deepEqual([d.groupId, d.groupName, d.users.map((u) => u.id)], ['gCL', 'Crypto Life', ['u501', 'u505']]);
  const n = env.notifications.filter((x) => x.id === 'bg-nudge');
  assert.equal(n.length, 1);
  assert.equal(n[0].title, 'BeinGroup: soạn sẵn bài nhắc 2 người mới');
  assert.ok(!writes(env).some((c) => c.startsWith('POST content/posts')), 'không tự đăng');
  // Cùng tuần: không soạn lại
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.filter((x) => x.id === 'bg-nudge').length, 1);
  env.listeners.notif('bg-nudge');
  assert.match(env.tabsCreated.at(-1), /#tab=stats&nudge=1$/);

  // Chạy thử: không ghi lần nhắc
  const { text, mentions } = BG.welcomeText(BG.DEFAULT_NUDGE, { users: d.users, groupName: 'Crypto Life' });
  env.storage.settings = { ...env.storage.settings, dryRun: true };
  await env.send({ type: 'compose', groupIds: ['gCL'], content: text, setting: BG.DEFAULT_POST_SETTING, mentions, nudge: { userIds: ['u501', 'u505'] } });
  assert.equal(env.storage.nudges.length, 1);
  // Đăng thật: ghi người còn được nhắc tên trong bài (u505 bị xoá khỏi bài), bỏ bản soạn sẵn
  env.storage.settings = { ...env.storage.settings, dryRun: false };
  const edited = text.replace(', @user505', '');
  const r = await env.send({ type: 'compose', groupIds: ['gCL'], content: edited, setting: BG.DEFAULT_POST_SETTING, mentions, nudge: { userIds: ['u501', 'u505'] } });
  assert.equal(r.status, 'ok', r.message);
  const rec = env.storage.nudges[0];
  assert.deepEqual([rec.id, rec.groupId, rec.userIds, env.storage.nudges.length], [r.contentId, 'gCL', ['u501'], 2]);
  assert.equal(env.storage.nudgeDraft, undefined);

  // Đo hiệu quả: u501 đăng bài sau khi được nhắc; u506 (lần nhắc cũ) rời sau đó
  data.search.push(post('n2', 'Mình là thành viên mới', { publishedAt: new Date(now + 3600e3).toISOString(), actor: user(501) }));
  data.memberEvents.gCL.push(memberEvent(506, 'leave.group', ago(2)));
  rec.at = new Date(ago(0.5)).toISOString();
  const eff = await env.send({ type: 'nudgeEffect' });
  assert.equal(eff.status, 'ok');
  const byId = Object.fromEntries(eff.items.map((x) => [x.id, x]));
  assert.deepEqual([byId[rec.id].total, byId[rec.id].posted, byId[rec.id].active, byId[rec.id].left], [1, 1, 1, 0]);
  assert.deepEqual([byId.old1.total, byId.old1.active, byId.old1.left], [1, 0, 1]);
  assert.deepEqual(env.storage.nudgeEffect.items.length, 2);

  // Tắt: không soạn
  const off = makeEnv({ data: fixture(), now, settings: { nudgeWeekly: false, nudgeGroupId: 'gCL' } });
  await scan(off);
  off.listeners.alarm({ name: 'beingroup-scan' });
  await scan(off, 'popup');
  assert.equal(off.storage.nudgeDraft, undefined);
  assert.ok(!off.calls.some((c) => c.includes('objectType=MEMBER')));
});

test('Tự kiểm tra mỗi ngày: lần quét tự động đầu ngày kiểm tra mọi community; chỉ báo khi mục đang dùng được chuyển sang lỗi', async () => {
  const day1 = Date.parse('2026-10-13T02:00:00Z'); // thứ Ba
  const env = makeEnv({ now: day1, settings: { selfCheckDaily: true } });
  await scan(env);
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const auto = env.storage.selfCheckAuto;
  assert.deepEqual(Object.keys(auto.groups).sort(), ['gCL', 'gFood']); // chỉ group gốc của community
  assert.equal(auto.groups.gFood.items.find((x) => x.id === 'tagPerm').status, 'ok');
  assert.equal(env.notifications.filter((n) => n.id === 'bg-selfcheck').length, 0); // lần đầu chỉ ghi mốc
  assert.equal(env.storage.state.selfCheckDay, '2026-10-13');
  // Cùng ngày: không kiểm tra lại
  const before = env.calls.filter((c) => c.includes('can-cud-tags')).length;
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.calls.filter((c) => c.includes('can-cud-tags')).length, before);

  // Hôm sau Beincom đổi dữ liệu quyền tag của Food Research: báo một lần, mở tab Nhật ký, thẻ Tự kiểm tra hiện kết quả đó
  const env2 = makeEnv({ now: day1 + 864e5, settings: { selfCheckDaily: true } });
  Object.assign(env2.storage, structuredClone(env.storage));
  env2.data.tagPerm = { cFood: 'lạ' };
  env2.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env2, 'popup');
  const n = env2.notifications.filter((x) => x.id === 'bg-selfcheck');
  assert.equal(n.length, 1);
  assert.equal(n[0].title, 'BeinGroup: 1 tính năng ngừng chạy');
  assert.match(n[0].message, /^Food Research: Quyền quản lý tag\. Có thể Beincom vừa thay đổi/);
  assert.deepEqual(env2.storage.selfCheckAuto.regressions, [{ groupId: 'gFood', group: 'Food Research', items: ['Quyền quản lý tag'] }]);
  assert.equal(env2.storage.selfCheck.group.id, 'gFood');
  env2.listeners.notif('bg-selfcheck');
  assert.match(env2.tabsCreated.at(-1), /#tab=log$/);
  assert.ok(!(env2.storage.diagLog || []).some((e) => /can-cud-tags/.test(e.path)), 'không ghi Lỗi kỹ thuật');
  assert.equal(BG.telegramKind('bg-selfcheck'), 'health');

  // Tắt: không kiểm tra
  const off = makeEnv({ now: day1, settings: { selfCheckDaily: false } });
  await scan(off);
  off.listeners.alarm({ name: 'beingroup-scan' });
  await scan(off, 'popup');
  assert.equal(off.storage.selfCheckAuto, undefined);
});

// ---------- Bài thảo luận hằng tuần ----------

test('bài thảo luận: sáng thứ Hai soạn sẵn câu hỏi + giờ gợi ý (không tự đăng); đăng thật ghi lần dùng câu, chạy thử thì không', async () => {
  const now = Date.parse('2026-10-12T02:00:00Z'); // 9 giờ sáng thứ Hai giờ VN
  const env = makeEnv({ now, settings: { promptWeekly: true, promptGroupId: 'gCL', dryRun: false, welcomeReminder: false, weeklyReport: false } });
  await scan(env);
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const d = env.storage.promptDraft;
  assert.deepEqual([d.promptId, d.groupId, d.groupName, d.basis, d.suggestAt], ['d1', 'gCL', 'Crypto Life', 'default', '2026-10-14T13:00:00.000Z']);
  assert.equal(d.text, BG.DEFAULT_PROMPTS[0]);
  const n = env.notifications.filter((x) => x.id === 'bg-prompt');
  assert.equal(n.length, 1);
  assert.equal(n[0].title, 'BeinGroup: bài thảo luận tuần này cho Crypto Life');
  assert.match(n[0].message, /\(gợi ý Thứ Tư 20:00\)\.$/);
  assert.ok(!writes(env).some((c) => c.startsWith('POST content/posts')), 'không tự đăng');
  env.listeners.notif('bg-prompt');
  assert.match(env.tabsCreated.at(-1), /#tab=compose&prompt=1$/);
  // Cùng tuần: không soạn lại
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.filter((x) => x.id === 'bg-prompt').length, 1);

  // Chạy thử: không ghi lần dùng
  env.storage.settings = { ...env.storage.settings, dryRun: true };
  await env.send({ type: 'compose', groupIds: ['gCL'], content: d.text, setting: BG.DEFAULT_POST_SETTING, scheduledAt: d.suggestAt, prompt: { id: d.promptId } });
  assert.equal(env.storage.promptBank, undefined);
  // Hẹn giờ thật: ghi lần dùng (bài, group, giờ đăng), bỏ bản soạn sẵn; tuần sau sẽ chọn câu khác
  env.storage.settings = { ...env.storage.settings, dryRun: false };
  const r = await env.send({ type: 'compose', groupIds: ['gCL'], content: d.text, setting: BG.DEFAULT_POST_SETTING, scheduledAt: d.suggestAt, prompt: { id: d.promptId } });
  assert.equal(r.status, 'ok', r.message);
  const used = env.storage.promptBank.items.find((x) => x.id === 'd1').uses;
  assert.deepEqual(used, [{ postId: r.contentId, groupId: 'gCL', at: d.suggestAt }]);
  assert.equal(env.storage.promptDraft, undefined);
  assert.equal(BG.pickPrompt(env.storage.promptBank, { groupId: 'gCL', now }).id, 'd2');
  assert.ok(env.storage.postStats[r.contentId], 'bài được theo dõi ở Hiệu quả bài đã đăng');

  // Tắt: không soạn
  const off = makeEnv({ now, settings: { promptWeekly: false, promptGroupId: 'gCL' } });
  await scan(off);
  off.listeners.alarm({ name: 'beingroup-scan' });
  await scan(off, 'popup');
  assert.equal(off.storage.promptDraft, undefined);
});

// ---------- Việc đầu tuần ----------

test('việc đầu tuần: nhiều việc định kỳ cùng lần quét thì gộp một thông báo / một tin Telegram, lưu ô Việc đầu tuần; một việc thì như cũ', async () => {
  const now = Date.parse('2026-10-12T02:00:00Z'); // thứ Hai
  const env = makeEnv({ now, settings: { promptWeekly: true, promptGroupId: 'gCL' } });
  env.storage.telegram = { enabled: true, token: '123456789:' + 'A'.repeat(35), chatId: '42', kinds: { weekly: true } };
  await scan(env);
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  const ids = env.notifications.map((n) => n.id);
  assert.ok(!ids.some((id) => ['bg-welcome', 'bg-weekly', 'bg-prompt'].includes(id)), 'không thông báo riêng từng việc');
  const dg = env.notifications.filter((n) => n.id === 'bg-digest');
  assert.equal(dg.length, 1);
  assert.equal(dg[0].title, 'BeinGroup: việc đầu tuần (3 việc)');
  assert.match(dg[0].message, /^• Chào thành viên mới và vinh danh thành viên tích cực\n• Tóm tắt tuần: .+\n• Bài thảo luận cho Crypto Life \(gợi ý Thứ Tư 20:00\)\nBấm để làm lần lượt\.$/);
  assert.deepEqual(env.storage.periodicDigest.items.map((x) => x.kind), ['welcome', 'weekly', 'prompt']);
  assert.equal(env.tg.filter((t) => t.method === 'sendMessage' && /việc đầu tuần/.test(t.body.text)).length, 1);
  env.listeners.notif('bg-digest');
  assert.match(env.tabsCreated.at(-1), /#tab=overview&digest=1$/);
  // Cùng tuần: không gộp lại
  env.listeners.alarm({ name: 'beingroup-scan' });
  await scan(env, 'popup');
  assert.equal(env.notifications.filter((n) => n.id === 'bg-digest').length, 1);
  // Chỉ một việc: thông báo riêng như cũ, không tạo ô Việc đầu tuần
  const one = makeEnv({ now, settings: { weeklyReport: false } });
  await scan(one);
  one.listeners.alarm({ name: 'beingroup-scan' });
  await scan(one, 'popup');
  assert.deepEqual(one.notifications.filter((n) => /^bg-(welcome|digest)$/.test(n.id)).map((n) => n.id), ['bg-welcome']);
  assert.equal(one.storage.periodicDigest, undefined);
});

test('khôi phục sao lưu kèm lịch sử số liệu: gộp hiệu quả bài, lần nhắc, số thành viên, nhật ký với dữ liệu trong máy; không gọi Beincom', async () => {
  const env = makeEnv();
  await scan(env);
  const before = env.calls.length;
  env.storage.postStats = { p2: { id: 'p2', at: 9 } };
  const old = { postStats: { p1: { id: 'p1', at: 1, snippet: 'Bài cũ' } }, nudges: [{ id: 'n1', groupId: 'gCL', groupName: 'Crypto Life', at: '2026-09-01T00:00:00Z', userIds: ['u1'] }], memberHistory: { gCL: [{ day: '2026-09-01', count: 11000 }] }, log: [{ time: 1000, kind: 'member', action: 'approve', status: 'ok', groupId: 'gCL', userId: 'u1' }] };
  const r = await env.send({ type: 'restoreBackup', data: { history: old } });
  assert.equal(r.status, 'ok');
  assert.ok(r.restored.some((x) => /^Lịch sử số liệu: 1 bài/.test(x)));
  assert.deepEqual(Object.keys(env.storage.postStats).sort(), ['p1', 'p2']);
  assert.deepEqual(env.storage.nudges.map((n) => n.id), ['n1']);
  assert.deepEqual(env.storage.state.memberHistory.gCL[0], { day: '2026-09-01', count: 11000 });
  assert.ok(env.storage.state.memberHistory.gCL.length >= 2, 'giữ số thành viên đã ghi khi quét');
  assert.equal(env.storage.log[0].kind, 'backup'); // dòng ghi việc khôi phục ở đầu
  assert.ok(env.storage.log.some((e) => e.time === 1000 && e.userId === 'u1'));
  assert.equal(env.calls.length, before);
});

test('báo cáo sử dụng: service worker đếm lệnh Dashboard gửi theo ngày (chỉ loại lệnh)', async () => {
  const env = makeEnv();
  await scan(env);
  await env.send({ type: 'monthly', groupId: 'gCL', month: '2026-09' });
  await env.send({ type: 'selfCheck', groupId: 'gFood' });
  await env.send({ type: 'diag', entry: { where: 'dashboard', message: 'x' } });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const day = Object.values(env.storage.usage.days)[0];
  assert.deepEqual(day, { scan: 1, monthly: 1, selfCheck: 1 });
});

// ---------- Tự gửi báo cáo sử dụng ----------

test('báo cáo sử dụng tự gửi: chỉ khi có nơi nhận, admin đồng ý, đã cấp quyền; 7 ngày một lần (lỗi thì thử lại sau 1 ngày); nội dung ẩn danh', async () => {
  const URL = 'https://script.google.com/macros/s/AKfycbx_thu_nghiem_1234567890/exec';
  const now = Date.parse('2026-10-13T02:00:00Z');
  const env = makeEnv({ now });
  const auto = async () => {
    env.listeners.alarm({ name: 'beingroup-scan' });
    await scan(env, 'popup');
  };
  await scan(env);
  await new Promise((r) => setImmediate(r)); // số đếm sử dụng ghi gộp ở lượt sau (setTimeout giả = setImmediate)
  // Chưa có nơi nhận / chưa đồng ý: không gửi
  await auto();
  env.storage.usageEndpoint = URL;
  await auto();
  assert.equal(env.data.usagePosts, undefined);
  assert.match((await env.send({ type: 'usageSend' })).message, /Chưa đồng ý/);
  // Đồng ý: lần quét tự động gửi một lần
  env.storage.usageConsent = { choice: 'yes', at: now, installId: 'id-ngau-nhien-01' };
  env.storage.usageNote = 'Lan';
  await auto();
  assert.equal(env.data.usagePosts.length, 1);
  const p = env.data.usagePosts[0];
  assert.deepEqual([p.url, p.method, p.headers['Content-Type']], [URL, 'POST', 'text/plain;charset=utf-8']);
  assert.deepEqual([p.body.app, p.body.v, p.body.installId, p.body.version, p.body.note, p.body.communities], ['BeinGroup', 1, 'id-ngau-nhien-01', '0.0.0-test', 'Lan', 2]);
  assert.ok(p.body.features['Quét tay'] >= 1);
  const raw = JSON.stringify(p.body);
  for (const secret of ['Crypto Life', 'Food Research', 'gCL', 'gFood', 'user1', 'Người 1']) assert.ok(!raw.includes(secret), 'lộ ' + secret);
  assert.deepEqual(env.storage.usageSent, { at: now, ok: true, error: '' });
  // Trong 7 ngày: không gửi lại; bấm Gửi ngay thì gửi
  await auto();
  assert.equal(env.data.usagePosts.length, 1);
  assert.equal((await env.send({ type: 'usageSend' })).status, 'ok');
  assert.equal(env.data.usagePosts.length, 2);
  // Nơi nhận lỗi: ghi lỗi, ngày sau thử lại
  env.data.usageDown = true;
  env.storage.usageSent = { at: now - 8 * 864e5, ok: true };
  await auto();
  assert.deepEqual([env.data.usagePosts.length, env.storage.usageSent.ok, env.storage.usageSent.error], [3, false, 'down']);
  assert.equal(BG.usageSendDue(env.storage.usageSent, now + 23 * 3600e3), false);
  assert.equal(BG.usageSendDue(env.storage.usageSent, now + 25 * 3600e3), true);
  // Chưa cấp quyền: không gọi mạng, báo rõ
  env.data.usageDown = false;
  env.data.usagePerm = false;
  const r = await env.send({ type: 'usageSend' });
  assert.match(r.message, /chưa cấp quyền/);
  assert.equal(env.data.usagePosts.length, 3);
  // Rút lại đồng ý: không gửi nữa
  env.data.usagePerm = true;
  env.storage.usageConsent = { choice: 'no', at: now, installId: 'id-ngau-nhien-01' };
  env.storage.usageSent = null;
  await auto();
  assert.equal(env.data.usagePosts.length, 3);
  // Link nơi nhận sai dạng: coi như không có
  assert.equal(BG.isUsageEndpoint('https://evil.example/exec'), false);
  assert.equal(BG.isUsageEndpoint(URL), true);
});
