// Service worker — chat Beincom (chat.beincom.com, Mattermost). Gọi bằng phiên đăng nhập Beincom như web (cookie,
// x-application, X-Requested-With); qua cùng client với api.beincom.com (trực tiếp, hoặc qua tab Beincom khi bị chặn cookie).
//  - Bản đồ kênh: team (community) / kênh (group) mình quản trị, quyền xoá tin / gửi tin — đọc lại 6 giờ một lần.
//  - Sau mỗi lần quét: tin mới trong kênh chat group (chấm bằng quy tắc bài viết, tài khoản giống admin, đợt spam),
//    tin nhắn riêng chưa đọc, số lần được nhắc tên. Thông báo khi notifyAllowed.
//  - Xoá tin (mất hẳn), gửi tin kèm bài vừa đăng, số liệu chat cho báo cáo tháng.
// Cần quyền tới chat.beincom.com (xin khi bật ở Cài đặt); đọc chỉ dùng GET.

const CHAT_MAP_TTL = 6 * 3600e3;
const CHAT_FIRST_MS = 6 * 3600e3; // lần đầu: đọc tin trong 6 giờ qua
const CHAT_USERS_PER_SCAN = 10;
const CHAT_MONTH_PAGES = 10; // tối đa 2000 tin mỗi kênh cho báo cáo tháng

const chatGet = (client, path, timeoutMs = 20000) => client.call('GET', BG.CHAT_API + path, null, '', timeoutMs);

// Bản đồ kênh: tài khoản chat của mình, team của các community mình quản trị, kênh của group mình quản trị hoặc có quyền xoá tin
async function readChatMap(client, groups) {
  const me = await chatGet(client, 'v4/users/me');
  if (me.status === 401) return { ...NEED_LOGIN };
  if (!BG.chatOk(me)) return { status: 'error', message: 'Đọc chat lỗi: ' + BG.errMsg(me) };
  const [teams, teamMembers] = await Promise.all([chatGet(client, 'v4/users/me/teams'), chatGet(client, 'v4/users/me/teams/members')]);
  if (!BG.chatOk(teams)) return { status: 'error', message: 'Đọc danh sách chat lỗi: ' + BG.errMsg(teams) };
  const communities = new Set(groups.map((g) => g.communityId).filter(Boolean));
  const managed = new Set(groups.map((g) => g.id));
  const teamRoles = new Map((BG.chatOk(teamMembers) ? teamMembers.body : []).map((m) => [m.team_id, m.roles || '']));
  let dmTeam = null;
  const work = [];
  for (const t of teams.body || []) {
    if (t.props?.bic_group_team_id === 'unknown') dmTeam = { id: t.id, name: t.name || '' };
    else if (communities.has(t.props?.bic_group_team_id)) work.push(t);
  }
  const raw = [];
  await mapLimit(work, PARALLEL, async (t) => {
    const [chs, mem] = await Promise.all([chatGet(client, `v4/users/me/teams/${t.id}/channels`), chatGet(client, `v4/users/me/teams/${t.id}/channels/members`)]);
    if (!BG.chatOk(chs)) return;
    const roles = new Map((BG.chatOk(mem) ? mem.body : []).map((m) => [m.channel_id, m.roles || '']));
    for (const c of chs.body || []) if (c.type === 'O' || c.type === 'P') raw.push({ c, t, channelRoles: roles.get(c.id) || '', teamRoles: teamRoles.get(t.id) || '' });
  });
  // Quyền của từng vai trò (vai trò riêng của Beincom là mã ngẫu nhiên): GET v4/roles/name/{tên}
  const names = [...new Set(raw.flatMap((x) => `${x.channelRoles} ${x.teamRoles}`.split(/\s+/)).filter(Boolean))];
  const perms = {};
  await mapLimit(names, PARALLEL, async (n) => {
    const r = await chatGet(client, `v4/roles/name/${encodeURIComponent(n)}`);
    perms[n] = BG.chatOk(r) ? r.body.permissions || [] : [];
  });
  const channels = raw.map((x) => BG.chatChannel(x.c, x.t, { channelRoles: x.channelRoles, teamRoles: x.teamRoles, perms })).filter((ch) => managed.has(ch.groupId) || ch.canDelete);
  return {
    status: 'ok',
    map: {
      at: Date.now(),
      me: { chatId: me.body.id, id: me.body.props?.bic_user_id || '', username: me.body.username || '' },
      dmTeam,
      teams: work.map((t) => ({ id: t.id, name: t.name || '', communityId: t.props?.bic_group_team_id || '', title: t.display_name || '' })),
      channels,
    },
  };
}

async function chatMapOf(client, state, groups, now, force = false) {
  const m = state.chatMap;
  if (!force && m?.at && now - m.at < CHAT_MAP_TTL && groups.every((g) => !g.communityId || m.teams?.some((t) => t.communityId === g.communityId) || m.checked?.includes(g.communityId))) return { status: 'ok', map: m };
  const r = await readChatMap(client, groups);
  if (r.status === 'ok') r.map.checked = [...new Set(groups.map((g) => g.communityId).filter(Boolean))];
  return r;
}

// Tin nhắn riêng chưa đọc + số lần được nhắc tên trong kênh (không đọc nội dung tin nhắn riêng)
async function readChatUnread(client, map, prevUsers = {}) {
  const users = { ...prevUsers };
  let dms = [];
  if (map.dmTeam) {
    const [chs, mem] = await Promise.all([chatGet(client, `v4/users/me/teams/${map.dmTeam.id}/channels`), chatGet(client, `v4/users/me/teams/${map.dmTeam.id}/channels/members`)]);
    if (BG.chatOk(chs)) dms = BG.dmUnread(chs.body, BG.chatOk(mem) ? mem.body : [], map.me.chatId);
    const need = [...new Set(dms.map((d) => d.otherId).filter((id) => id && !users[id]))].slice(0, CHAT_USERS_PER_SCAN);
    await mapLimit(need, PARALLEL, async (id) => {
      const r = await chatGet(client, `v4/users/${id}`);
      if (BG.chatOk(r)) users[id] = BG.chatPerson(r.body);
    });
  }
  const un = await chatGet(client, 'v5/users/me/teams/unread?include_collapsed_threads=true');
  const mentions = BG.chatOk(un) ? (un.body || []).filter((t) => t.team_id !== map.dmTeam?.id).reduce((s, t) => s + (t.total_unread_mentions || 0), 0) : 0;
  return {
    users,
    unread: {
      at: Date.now(),
      mentions,
      dms: dms.map((d) => ({ ...d, user: users[d.otherId] || null, url: BG.chatUrl(map.dmTeam?.name, d.channelId) })),
    },
  };
}

// Sau mỗi lần quét (cài đặt chatEnabled): tin mới trong kênh chat group, tin nhắn riêng chưa đọc. Ghi vào next (state).
async function syncChat(client, { settings, state, next, notifyAllowed, ctx, now = Date.now(), force = false }) {
  if (!settings.chatEnabled) return { status: 'ok', skipped: true };
  // Quyền tới chat.beincom.com xin khi bật ở Cài đặt; bị gỡ thì báo, không gọi
  if (client.mode === 'direct' && !(await chrome.permissions.contains({ origins: [BG.CHAT_ORIGIN] }).catch(() => false))) {
    next.chatError = { at: now, message: 'Chưa cho phép addon kết nối chat.beincom.com — tắt rồi bật lại "Chat Beincom" ở Cài đặt' };
    return { status: 'error', message: next.chatError.message };
  }
  const groups = next.snapshot?.groups || [];
  const m = await chatMapOf(client, state, groups, now, force);
  if (m.status !== 'ok') {
    next.chatError = { at: now, message: m.message || '' };
    return m;
  }
  const map = m.map;
  next.chatMap = map;
  next.chatError = null;
  const since = { ...(state.chatSince || {}) };
  const fresh = [];
  if (settings.chatScan) {
    // Kênh có tin sau lần đọc trước: đọc lại danh sách kênh (last_post_at) mỗi team một lần
    const last = new Map();
    await mapLimit(map.teams, PARALLEL, async (t) => {
      const r = await chatGet(client, `v4/users/me/teams/${t.id}/channels`);
      if (BG.chatOk(r)) for (const c of r.body || []) last.set(c.id, c.last_post_at || 0);
    });
    const todo = map.channels.filter((ch) => (last.get(ch.id) ?? ch.lastPostAt) > (since[ch.id] || now - CHAT_FIRST_MS));
    await mapLimit(todo, PARALLEL, async (ch) => {
      const from = since[ch.id] || now - CHAT_FIRST_MS;
      const r = await chatGet(client, `v5/channels/${ch.id}/posts?since=${Math.floor(from)}`);
      if (!BG.chatOk(r)) return;
      since[ch.id] = now;
      for (const p of Object.values(r.body.posts || {})) {
        if ((p.create_at || 0) < from) continue; // since trả cả tin cũ vừa sửa
        const msg = BG.slimChatPost(p, ch);
        if (msg && msg.user.chatId !== map.me.chatId) fresh.push(msg);
      }
    });
    for (const ch of map.channels) if (!since[ch.id]) since[ch.id] = now;
    const known = new Set((state.chatMessages || []).map((x) => x.id));
    const added = fresh.filter((x) => !known.has(x.id));
    next.chatMessages = BG.mergeChatMessages(state.chatMessages, fresh, { now });
    next.chatSince = since;

    // Tài khoản giống admin nhắn trong kênh chat: thêm vào danh sách Bảo vệ community
    const impostors = [...(next.impostors || state.impostors || [])];
    const seen = new Set(impostors.map((x) => x.key));
    const okIds = new Set(state.impostorOk || []);
    const freshImp = [];
    for (const x of added) {
      const g = groups.find((y) => y.id === x.groupId);
      if (!g || !x.user.id || okIds.has(x.user.id)) continue;
      const imp = BG.impersonation(x.user, BG.adminsOf(next.admins?.byGroup || state.admins?.byGroup, g, groups));
      if (!imp) continue;
      const item = impostorItem(x.user, g, imp, x.createdAt, 'chat');
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      impostors.unshift(item);
      freshImp.push(item);
    }
    if (freshImp.length) next.impostors = impostors.slice(0, IMPOSTOR_MAX);

    // Tin vi phạm quy tắc bài viết, đợt spam mới
    const bad = added.filter((x) => BG.evaluatePostIn(BG.chatAsPost(x), ctx).verdict === 'bad');
    const addedIds = new Set(added.map((x) => x.id));
    const waves = BG.spamWaves(BG.chatWaveItems(next.chatMessages.filter((x) => !x.deleted && !x.dismissed)), { now, allowed: ['beincom.com', ...(ctx.postRules?.allowedDomains || [])] }).filter((w) => w.items.some((i) => addedIds.has(i.id)) && !(state.chatWaves || []).includes(w.key));
    next.chatWaves = [...waves.map((w) => w.key), ...(state.chatWaves || [])].slice(0, 100);
    if (notifyAllowed && (bad.length || waves.length || freshImp.length)) {
      const parts = [bad.length && `${bad.length} tin vi phạm`, waves.length && `${waves.length} đợt spam`, freshImp.length && `${freshImp.length} tài khoản giống admin`].filter(Boolean);
      const first = bad[0] || added.find((x) => waves[0]?.items.some((i) => i.id === x.id));
      notify('bg-chat', `BeinGroup: ${parts.join(', ')} trong chat`, first ? `${first.groupName} — ${first.user.fullname || first.user.username}: ${first.text.replace(/\s+/g, ' ').slice(0, 100)}` : 'Bấm để xem.');
    }
  }
  if (settings.chatUnread) {
    const u = await readChatUnread(client, map, state.chatUsers);
    next.chatUsers = u.users;
    next.chatUnread = u.unread;
    // Báo tin nhắn riêng mới (mỗi cuộc trò chuyện khi có tin mới hơn lần báo trước) và lần nhắc tên tăng
    const notified = { ...(state.chatNotified || {}) };
    const newDm = u.unread.dms.filter((d) => d.unread > 0 && d.lastPostAt > (notified[d.channelId] || 0));
    for (const d of u.unread.dms) notified[d.channelId] = Math.max(notified[d.channelId] || 0, d.lastPostAt);
    next.chatNotified = notified;
    if (notifyAllowed && newDm.length && state.chatUnread) {
      notify('bg-chat-dm', `BeinGroup: ${newDm.length} tin nhắn riêng mới`, 'Từ: ' + newDm.map((d) => d.user?.fullname || d.user?.username || d.title || 'người dùng').slice(0, 5).join(', ') + '. Bấm để mở chat.', BG.SITE + '/chat-home');
    }
    if (notifyAllowed && state.chatUnread && u.unread.mentions > (state.chatUnread.mentions || 0)) {
      notify('bg-chat-mention', `BeinGroup: bạn được nhắc tên ${u.unread.mentions} lần trong chat`, 'Bấm để mở chat.', BG.SITE + '/chat-home');
    }
  }
  return { status: 'ok', fresh: fresh.length };
}

// Tải lại chat từ Dashboard (không thông báo)
async function doChatRefresh() {
  const loaded = await load();
  const { settings, state } = loaded;
  if (!settings.chatEnabled) return { status: 'error', message: 'Chưa bật chat Beincom ở Cài đặt' };
  const next = { ...state };
  const r = await withClient((client) => syncChat(client, { settings, state, next, notifyAllowed: false, ctx: rulesCtx(loaded, state.snapshot?.groups), force: true }));
  await chrome.storage.local.set({ state: next });
  return r.status === 'ok' ? { status: 'ok', channels: next.chatMap?.channels.length || 0 } : r;
}

// Xoá tin (mất hẳn, cần quyền xoá tin người khác trong kênh) / Bỏ qua / Hiện lại
async function doChatAct({ action, ids = [], source = 'manual' }) {
  const { settings, state, log } = await load();
  const want = new Set(ids || []);
  const list = (state.chatMessages || []).filter((x) => want.has(x.id));
  if (!list.length) return { status: 'error', message: 'Không còn tin nhắn này trong danh sách' };
  if (action === 'dismiss' || action === 'undismiss') {
    const next = { ...state, chatMessages: state.chatMessages.map((x) => (want.has(x.id) ? { ...x, dismissed: action === 'dismiss' } : x)) };
    await chrome.storage.local.set({ state: next });
    return { status: 'ok', ok: list.length, dry: 0, failed: 0, errors: [], dryRun: false };
  }
  if (action !== 'delete') return { status: 'error', message: 'Thao tác không hợp lệ' };
  const channels = new Map((state.chatMap?.channels || []).map((c) => [c.id, c]));
  const items = list
    .filter((x) => !x.deleted && channels.get(x.channelId)?.canDelete)
    .map((x) => ({
      log: { kind: 'chat', source, action: 'delete', groupId: x.groupId, groupName: x.groupName, contentId: x.id, snippet: x.text.replace(/\s+/g, ' ').slice(0, 120), userId: x.user.id, username: x.user.username, fullname: x.user.fullname },
      call: (c) => c.call('DELETE', BG.CHAT_API + 'v4/posts/' + x.id, null, ''),
      ok: BG.chatOk,
      gone: true,
      goneIf: (r) => r.status === 404,
    }));
  if (!items.length) return { status: 'error', message: 'Bạn không có quyền xoá tin trong kênh này (cần là admin của group)' };
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = { ...state, chatMessages: BG.markChatDeleted(state.chatMessages, r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId)) };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  return { ...summary(r, settings), deleted: r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId), skipped: list.length - items.length };
}

// Gửi tin kèm bài vừa đăng vào kênh chat của các group (đăng ngay, không hẹn giờ). Trả { entries, missing }
async function shareToChat({ settings, state, targets, content, contentId, custom = '' }) {
  const channels = state.chatMap?.channels || [];
  const url = contentId ? BG.postUrl({ id: contentId, type: 'POST' }) : '';
  const text = BG.chatShareText(content, url, custom);
  const items = [];
  const missing = [];
  for (const g of targets) {
    const ch = channels.find((c) => c.groupId === g.id && c.canPost);
    if (!ch) {
      missing.push(g.name);
      continue;
    }
    items.push({
      log: { kind: 'chat', source: 'manual', action: 'send', groupId: g.id, groupName: g.name, contentId: '', snippet: text.replace(/\s+/g, ' ').slice(0, 120) },
      call: (c) => c.call('POST', BG.CHAT_API + 'v4/posts', { channel_id: ch.id, message: text }, ''),
      ok: BG.chatOk,
    });
  }
  const r = items.length ? await performActions(items, settings) : { status: 'ok', entries: [] };
  return { entries: r.entries, missing };
}

// Báo cáo tháng: tin trong các kênh chat của phạm vi (mới nhất trước, dừng khi tới tin trước `from`)
async function readChatMonth(client, channels, from) {
  const msgs = [];
  let truncated = false;
  await mapLimit(channels, PARALLEL, async (ch) => {
    for (let page = 0; page < CHAT_MONTH_PAGES; page++) {
      const r = await chatGet(client, `v5/channels/${ch.id}/posts?page=${page}&per_page=200`);
      if (!BG.chatOk(r)) return;
      const posts = (r.body.order || []).map((id) => r.body.posts?.[id]).filter(Boolean);
      for (const p of posts) {
        if (p.delete_at || (p.type && p.type !== '') || p.create_at < from) continue;
        const u = BG.chatPerson(p.author) || { id: '', username: '', fullname: '' };
        msgs.push({ t: p.create_at, ch: ch.id, u: { id: u.id, username: u.username, fullname: u.fullname } });
      }
      if (posts.length < 200 || posts.some((p) => p.create_at < from)) return;
      if (page === CHAT_MONTH_PAGES - 1) truncated = true;
    }
  });
  return { messages: msgs, truncated };
}

// ---------- Trang Chat (chat.html) ----------
// Trang Chat của addon gọi các lệnh này khi người dùng đang xem: mọi kênh mình có mặt và tin nhắn riêng. Nội dung tin chỉ trả
// về trang (không lưu vào storage). Lệnh đọc và gửi tin không chờ hàng đợi của lần quét.
const CHAT_MSG_MAX = 4000;
// Ghi nhớ giữa các lần mở (service worker hay bị tắt): quyền vai trò 1 ngày, tên / ảnh người dùng 7 ngày (chỉ tên, không có tin)
const CHAT_ROLES_TTL = 24 * 3600e3;
const CHAT_PEOPLE_TTL = 7 * 864e5;
const CHAT_PEOPLE_MAX = 500;
const CHAT_FETCH_PARALLEL = 8;
const chatRoleCache = new Map(); // tên vai trò -> quyền
const chatUserCache = new Map(); // mã người dùng chat -> { người, at }
let chatCacheReady = null;

// Nạp một lần (các lệnh chạy song song cùng chờ một lần nạp)
function loadChatCaches() {
  return (chatCacheReady ||= (async () => {
    const now = Date.now();
    const { chatRoles, chatPeople } = await chrome.storage.local.get(['chatRoles', 'chatPeople']);
    if (chatRoles?.at && now - chatRoles.at < CHAT_ROLES_TTL) for (const [k, v] of Object.entries(chatRoles.perms || {})) chatRoleCache.set(k, v);
    for (const [k, v] of Object.entries(chatPeople || {})) if (v?.at && now - v.at < CHAT_PEOPLE_TTL) chatUserCache.set(k, v);
  })());
}

async function chatPermsOf(client, names) {
  await loadChatCaches();
  const need = [...new Set(names)].filter((n) => n && !chatRoleCache.has(n));
  await mapLimit(need, CHAT_FETCH_PARALLEL, async (n) => {
    const r = await chatGet(client, `v4/roles/name/${encodeURIComponent(n)}`);
    chatRoleCache.set(n, BG.chatOk(r) ? r.body.permissions || [] : []);
  });
  if (need.length) await chrome.storage.local.set({ chatRoles: { at: Date.now(), perms: Object.fromEntries(chatRoleCache) } });
  return Object.fromEntries([...new Set(names)].map((n) => [n, chatRoleCache.get(n) || []]));
}

async function chatUsersOf(client, ids) {
  await loadChatCaches();
  const need = [...new Set(ids)].filter((id) => id && !chatUserCache.has(id)).slice(0, 60);
  await mapLimit(need, CHAT_FETCH_PARALLEL, async (id) => {
    const r = await chatGet(client, `v4/users/${id}`);
    if (BG.chatOk(r)) chatUserCache.set(id, { ...BG.chatPerson(r.body), pictureAt: r.body.last_picture_update || 0, at: Date.now() });
  });
  if (need.length) {
    const keep = [...chatUserCache.entries()].sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, CHAT_PEOPLE_MAX);
    await chrome.storage.local.set({ chatPeople: Object.fromEntries(keep) });
  }
  return Object.fromEntries(ids.map((id) => [id, chatUserCache.get(id) || null]));
}

// Lệnh đọc của trang Chat: gọi thẳng trước (không phải dò api.beincom.com mỗi lần service worker khởi động lại);
// không được (bị chặn cookie, chưa nhận phiên) thì chạy như các lệnh khác (dò, hoặc qua tab Beincom). Chỉ dùng cho lệnh
// đọc / đánh dấu đã đọc — gửi, xoá tin không gọi lại hai lần.
async function withChatRead(fn) {
  if (Date.now() < directUntil) return withClient(fn);
  let r;
  try {
    r = await fn(directClient());
  } catch (e) {
    r = { status: 'error', message: String(e?.message || e) };
  }
  if (r?.status === 'ok') {
    directUntil = Date.now() + 5 * 60e3;
    return { ...r, mode: 'direct' };
  }
  return withClient(fn);
}

const chatOff = () => ({ status: 'off', message: 'Chưa bật Chat Beincom (Quy tắc & cài đặt → 💬 Chat Beincom)' });
const chatLoginErr = { status: 'need_login', message: 'Chat chưa nhận phiên đăng nhập — mở chat trên web Beincom một lần rồi thử lại' };
const chatIdOk = (id) => /^\w+$/.test(String(id || ''));

// Mọi kênh mình có mặt + thành viên kênh của mình (số đã đọc, nhắc tên, vai trò): 2 lệnh cho cả tài khoản
// (GET v4/users/me/channels, v4/users/me/channel_members — gọi thật 14/10/2026). Máy chủ không có thì đọc từng team.
async function readAllChannels(client, getTeams) {
  const [chs, first] = await Promise.all([chatGet(client, 'v4/users/me/channels'), chatGet(client, 'v4/users/me/channel_members?page=0&per_page=200')]);
  if (BG.chatOk(chs) && Array.isArray(chs.body) && BG.chatOk(first) && Array.isArray(first.body)) {
    const mem = [...first.body];
    for (let page = 1; page < 10 && mem.length === page * 200; page++) {
      const r = await chatGet(client, `v4/users/me/channel_members?page=${page}&per_page=200`);
      if (!BG.chatOk(r) || !Array.isArray(r.body)) break;
      mem.push(...r.body);
    }
    return { chs: chs.body, mem };
  }
  const chsAll = [];
  const memAll = [];
  await mapLimit(await getTeams(), CHAT_FETCH_PARALLEL, async (t) => {
    const [a, b] = await Promise.all([chatGet(client, `v4/users/me/teams/${t.id}/channels`), chatGet(client, `v4/users/me/teams/${t.id}/channels/members`)]);
    if (BG.chatOk(a)) chsAll.push(...(a.body || []).map((c) => ({ ...c, team_id: c.team_id || t.id })));
    if (BG.chatOk(b)) memAll.push(...(b.body || []));
  });
  return { chs: chsAll, mem: memAll };
}

// Cộng đồng đã ghim trên Beincom (GET group/me/communities/pins — trả lời chậm, ~2,5 giây khi gọi thật): dùng bản đã lưu,
// đọc lại ngầm mỗi giờ (không bắt danh sách chat phải chờ)
const CHAT_PINS_TTL = 3600e3;
let chatPinsBusy = false;

async function chatPinsCached() {
  const { chatPins } = await chrome.storage.local.get('chatPins');
  if ((!chatPins?.at || Date.now() - chatPins.at > CHAT_PINS_TTL) && !chatPinsBusy) {
    chatPinsBusy = true;
    // Gọi thẳng (không dò quyền, không mở tab Beincom chỉ để lấy thứ tự ghim); lỗi thì để lần sau
    directClient()
      .call('GET', 'group/me/communities/pins', null, undefined, 0, { quiet: true })
      .then(async (r) => {
        if (!BG.isOk(r) || !Array.isArray(r.body.data)) return;
        const list = r.body.data.map((x) => ({ communityId: x.id || '', teamName: x.teamName || '', rank: x.rank ?? null }));
        await chrome.storage.local.set({ chatPins: { at: Date.now(), list } });
      })
      .catch(() => {})
      .finally(() => (chatPinsBusy = false));
  }
  return chatPins?.list || [];
}

// Chỉ đọc cài đặt (không đọc cả kết quả quét / nhật ký như load() — trang Chat gọi rất thường xuyên)
async function chatSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...BG.DEFAULT_SETTINGS, ...settings };
}

// Số tin nhắn riêng lấy tên ngay ở lần đọc nhanh (gần nhất trước, cộng tin còn chưa đọc); phần còn lại ở lần đọc đủ
const CHAT_QUICK_DMS = 8;
const CHAT_FULL_DMS = 60;

// Danh sách cuộc trò chuyện. quick: một lượt gọi song song (tài khoản, team, mọi kênh, số đã đọc) + tên người của 8 tin nhắn
// riêng gần nhất; quyền vai trò chỉ lấy từ bộ nhớ (chưa có thì canPost = null: chưa rõ). Không quick: lấy đủ tên, quyền.
async function doChatOverview({ quick = false } = {}) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  const pinsP = chatPinsCached();
  return withChatRead(async (client) => {
    // Một lượt song song: tài khoản, team, vai trò trong team, mọi kênh + số đã đọc
    const teamsP = chatGet(client, 'v4/users/me/teams');
    const teamsOf = async () => {
      const t = await teamsP;
      return BG.chatOk(t) ? t.body || [] : [];
    };
    const [me, teams, tm, { chs, mem }] = await Promise.all([chatGet(client, 'v4/users/me'), teamsP, chatGet(client, 'v4/users/me/teams/members'), readAllChannels(client, teamsOf)]);
    if (me.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(me)) return { status: 'error', message: 'Đọc chat lỗi: ' + BG.errMsg(me) };
    if (!BG.chatOk(teams)) return { status: 'error', message: 'Đọc danh sách chat lỗi: ' + BG.errMsg(teams) };
    const teamList = teams.body || [];
    const teamRoles = new Map((BG.chatOk(tm) ? tm.body : []).map((m) => [m.team_id, m.roles || '']));
    const memOf = new Map(mem.map((m) => [m.channel_id, m]));
    const roleNames = [...[...teamRoles.values()].join(' ').split(/\s+/), ...mem.flatMap((m) => String(m.roles || '').split(/\s+/))].filter(Boolean);
    const otherOf = (c) => (c.type === 'D' ? String(c.name || '').split('__').find((id) => id && id !== me.body.id) || '' : '');
    const live = chs.filter((c) => !c.delete_at);
    const dmRaw = live.filter((c) => c.type === 'D' || c.type === 'G').sort((a, b) => (b.last_post_at || 0) - (a.last_post_at || 0));
    // Đọc nhanh: tên người của 8 tin nhắn riêng gần nhất + tin nhắn riêng còn tin chưa đọc (tối đa 16)
    const unreadOf = (c) => Math.max(0, (c.total_msg_count || 0) - (memOf.get(c.id)?.msg_count || 0)) || memOf.get(c.id)?.mention_count || 0;
    const wantIds = (quick ? dmRaw.filter((c, i) => i < CHAT_QUICK_DMS || unreadOf(c)).slice(0, 2 * CHAT_QUICK_DMS) : dmRaw.slice(0, CHAT_FULL_DMS))
      .map(otherOf)
      .filter(Boolean);
    await loadChatCaches();
    const [perms, users] = await Promise.all([quick ? Object.fromEntries(roleNames.map((n) => [n, chatRoleCache.get(n)])) : chatPermsOf(client, roleNames), chatUsersOf(client, wantIds)]);
    const known = (roles) => String(roles || '').split(/\s+/).filter(Boolean).every((n) => perms[n]);
    for (const c of dmRaw) {
      const id = otherOf(c);
      if (id && !users[id] && chatUserCache.has(id)) users[id] = chatUserCache.get(id);
    }
    const teamById = new Map(teamList.map((t) => [t.id, t]));
    const dmTeamRaw = teamList.find((t) => t.props?.bic_group_team_id === 'unknown');
    const item = (c) => {
      const t = teamById.get(c.team_id) || dmTeamRaw || { id: c.team_id || '', name: '', props: {} };
      const m = memOf.get(c.id);
      const ch = BG.chatChannel(c, t, { channelRoles: m?.roles || '', teamRoles: teamRoles.get(t.id) || '', perms: Object.fromEntries(Object.entries(perms).filter(([, v]) => v)) });
      // Quyền chưa rõ (lần đọc nhanh, vai trò chưa có trong bộ nhớ): để trang tự quyết khi đã đủ
      const sure = known(`${m?.roles || ''} ${teamRoles.get(t.id) || ''}`);
      const otherId = otherOf(c);
      const other = otherId ? users[otherId] : null;
      return {
        ...ch,
        canPost: sure ? ch.canPost : null,
        canDelete: sure ? ch.canDelete : false,
        title: c.type === 'D' ? other?.fullname || other?.username || '' : c.display_name || c.name || '',
        purpose: c.purpose || c.header || '',
        other: other ? { ...other, chatId: otherId } : otherId ? { chatId: otherId, id: '', username: '', fullname: '', pictureAt: 0 } : null,
        unread: Math.max(0, (c.total_msg_count || 0) - (m?.msg_count || 0)),
        mentions: m?.mention_count || 0,
      };
    };
    const pins = await pinsP;
    const pinRank = new Map(pins.map((p, i) => [p.teamName || p.communityId, i]));
    const rankOf = (t) => (pinRank.has(t.name) ? pinRank.get(t.name) : pinRank.has(t.communityId) ? pinRank.get(t.communityId) : null);
    const latest = (t) => Math.max(0, ...t.channels.map((c) => c.lastPostAt));
    const out = teamList
      .filter((t) => t !== dmTeamRaw)
      .map((t) => ({ id: t.id, name: t.name || '', title: t.display_name || t.name || '', communityId: t.props?.bic_group_team_id || '', channels: live.filter((c) => c.team_id === t.id && c.type !== 'D' && c.type !== 'G').map(item).sort((a, b) => b.lastPostAt - a.lastPostAt) }))
      .filter((t) => t.channels.length)
      .map((t) => ({ ...t, pinned: rankOf(t) !== null, pinRank: rankOf(t) }))
      // Ghim trước (theo thứ tự ghim), rồi cộng đồng có tin mới nhất
      .sort((a, b) => (a.pinned === b.pinned ? (a.pinned ? a.pinRank - b.pinRank : latest(b) - latest(a)) : a.pinned ? -1 : 1));
    return {
      status: 'ok',
      quick,
      me: { chatId: me.body.id, id: me.body.props?.bic_user_id || '', username: me.body.username || '', fullname: BG.chatPerson(me.body).fullname, pictureAt: me.body.last_picture_update || 0 },
      teams: out,
      dms: dmRaw.map(item),
      dmTeam: dmTeamRaw ? { id: dmTeamRaw.id, name: dmTeamRaw.name || '' } : null,
    };
  });
}

// Tin của một kênh (cũ → mới): trang mới nhất, cũ hơn tin `before`, hoặc mới / sửa / xoá từ `since` (ms)
async function doChatPosts({ channelId, before = '', since = 0, perPage = 40 }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(channelId) || (before && !chatIdOk(before))) return { status: 'error', message: 'Thiếu kênh chat' };
  const n = Math.max(1, Math.min(100, Number(perPage) || 40));
  const path = since > 0 ? `v5/channels/${channelId}/posts?since=${Math.floor(since)}` : `v5/channels/${channelId}/posts?${before ? `before=${before}&` : ''}page=0&per_page=${n}`;
  return withChatRead(async (client) => {
    const r = await chatGet(client, path);
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: 'Đọc tin nhắn lỗi: ' + BG.errMsg(r) };
    const posts = Object.values(r.body.posts || {})
      .map(BG.chatPagePost)
      .filter(Boolean)
      .sort((a, b) => a.createAt - b.createAt);
    return { status: 'ok', posts, hasMore: since > 0 ? false : posts.length >= n || !!r.body.prev_post_id };
  });
}

// Gửi tin của mình (trả lời trong luồng: rootId). Gửi thật kể cả khi Chạy thử: đây là tin bạn tự gõ và bấm gửi.
async function doChatSend({ channelId, message, rootId = '' }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  const text = String(message || '').trim();
  if (!text) return { status: 'error', message: 'Tin nhắn trống' };
  if (text.length > CHAT_MSG_MAX) return { status: 'error', message: `Tin nhắn dài quá ${CHAT_MSG_MAX} ký tự` };
  if (!chatIdOk(channelId) || (rootId && !chatIdOk(rootId))) return { status: 'error', message: 'Thiếu kênh chat' };
  return withClient(async (client) => {
    const r = await client.call('POST', BG.CHAT_API + 'v4/posts', { channel_id: channelId, message: text, ...(rootId ? { root_id: rootId } : {}) }, '');
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: 'Gửi tin lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', post: BG.chatPagePost(r.body) };
  });
}

// Đánh dấu đã đọc kênh (như web khi mở kênh)
async function doChatView({ channelId }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(channelId)) return { status: 'error', message: 'Thiếu kênh chat' };
  return withChatRead(async (client) => {
    const r = await client.call('POST', BG.CHAT_API + 'v4/channels/members/me/view', { channel_id: channelId, prev_channel_id: '', collapsed_threads_supported: true }, '', 0, { quiet: true });
    return BG.chatOk(r) ? { status: 'ok' } : { status: 'error', message: BG.errMsg(r) };
  });
}

// Xoá tin: tin của mình thì xoá luôn; tin người khác là việc kiểm duyệt — kiểm tra quyền xoá trong kênh, theo Chạy thử, ghi Nhật ký
async function doChatDeleteMsg({ postId, channelId, own = false, groupName = '', snippet = '', user = null }) {
  const { settings: raw, log = [] } = await chrome.storage.local.get(['settings', 'log']);
  const settings = { ...BG.DEFAULT_SETTINGS, ...raw };
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(postId) || !chatIdOk(channelId)) return { status: 'error', message: 'Thiếu tin nhắn' };
  return withClient(async (client) => {
    if (!own) {
      const [mem, ch] = await Promise.all([chatGet(client, `v4/channels/${channelId}/members/me`), chatGet(client, `v4/channels/${channelId}`)]);
      if (mem.status === 401) return { ...chatLoginErr };
      const tm = BG.chatOk(ch) ? await chatGet(client, `v4/teams/${ch.body.team_id}/members/me`) : null;
      const roles = `${BG.chatOk(mem) ? mem.body.roles : ''} ${BG.chatOk(tm) ? tm.body.roles : ''}`;
      const perms = await chatPermsOf(client, roles.split(/\s+/).filter(Boolean));
      if (!BG.hasPerm(roles, perms, 'delete_others_posts')) return { status: 'error', message: 'Bạn không có quyền xoá tin của người khác trong kênh này' };
      const items = [{ log: { kind: 'chat', source: 'manual', action: 'delete', groupName, contentId: postId, snippet: String(snippet || '').slice(0, 120), userId: user?.id || '', username: user?.username || '', fullname: user?.fullname || '' }, call: (c) => c.call('DELETE', BG.CHAT_API + 'v4/posts/' + postId, null, ''), ok: BG.chatOk, gone: true, goneIf: (x) => x.status === 404 }];
      const r = await performActions(items, settings);
      pushLog(log, r.entries);
      await chrome.storage.local.set({ log });
      return summary(r, settings);
    }
    const r = await client.call('DELETE', BG.CHAT_API + 'v4/posts/' + postId, null, '');
    if (r.status === 401) return { ...chatLoginErr };
    return BG.chatOk(r) || r.status === 404 ? { status: 'ok', ok: 1, dry: 0, failed: 0, errors: [], dryRun: false } : { status: 'error', message: 'Xoá tin lỗi: ' + BG.errMsg(r) };
  });
}
