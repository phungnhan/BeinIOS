// Service worker — chat Beincom (chat.beincom.com, Mattermost). Gọi bằng phiên đăng nhập Beincom như web (cookie,
// x-application, X-Requested-With); qua cùng client với api.beincom.com (trực tiếp, hoặc qua tab Beincom khi bị chặn cookie).
//  - Bản đồ kênh: team (community) / kênh (group) mình quản trị, quyền xoá tin / gửi tin — đọc lại 6 giờ một lần.
//  - Sau mỗi lần quét: tin mới trong kênh chat group (chấm bằng quy tắc bài viết, tài khoản giống admin, đợt spam),
//    tin nhắn riêng chưa đọc, số lần được nhắc tên. Thông báo khi notifyAllowed.
//  - Xoá tin (mất hẳn), gửi tin kèm bài vừa đăng, số liệu chat cho báo cáo tháng.
// Cần quyền tới chat.beincom.com (xin khi bật ở Cài đặt); đọc chỉ dùng GET.

const CHAT_MAP_TTL = 6 * 3600e3;
const CHAT_FIRST_MS = 6 * 3600e3; // lần đầu: đọc tin trong 6 giờ qua
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

// Tin nhắn riêng chưa đọc + số lần được nhắc tên trong kênh (không đọc nội dung tin nhắn riêng). Số chưa đọc theo team đọc trước:
// team tin nhắn riêng báo không có tin chưa đọc (msg_count = 0, nếu máy chủ có trường này) thì khỏi đọc từng kênh. Tên người
// lấy từ bản ghi nhớ (chatUsersOf) nên lần kiểm tra nhanh mỗi phút không đọc lại.
async function readChatUnread(client, map, prevUsers = {}) {
  const un = await chatGet(client, 'v5/users/me/teams/unread?include_collapsed_threads=true');
  const teams = BG.chatOk(un) && Array.isArray(un.body) ? un.body : null;
  const mentions = teams ? teams.filter((t) => t.team_id !== map.dmTeam?.id).reduce((s, t) => s + (t.total_unread_mentions || 0), 0) : 0;
  const dmT = teams?.find((t) => t.team_id === map.dmTeam?.id);
  const noneUnread = !!dmT && typeof dmT.msg_count === 'number' && !dmT.msg_count && !dmT.mention_count && !dmT.total_unread_mentions;
  let dms = [];
  if (map.dmTeam && teams && !noneUnread) {
    const [chs, mem] = await Promise.all([chatGet(client, `v4/users/me/teams/${map.dmTeam.id}/channels`), chatGet(client, `v4/users/me/teams/${map.dmTeam.id}/channels/members`)]);
    if (BG.chatOk(chs)) dms = BG.dmUnread(chs.body, BG.chatOk(mem) ? mem.body : [], map.me.chatId);
  }
  const found = await chatUsersOf(client, dms.map((d) => d.otherId).filter((id) => id && !prevUsers[id]));
  const users = { ...prevUsers, ...Object.fromEntries(Object.entries(found).filter(([, u]) => u)) };
  return {
    ok: !!teams,
    users,
    teamsUnread: teams,
    unread: {
      at: Date.now(),
      mentions,
      dms: dms.map((d) => ({ ...d, user: users[d.otherId] || null, url: BG.chatUrl(map.dmTeam?.name, d.channelId) })),
    },
  };
}

// ---------- Tin được trích (trả lời), tên link Beincom (trang Chat) — chỉ đọc ----------
// Tin trả lời không kèm sẵn tin được trích: GET v4/posts/{mã} (như web), tên người đọc qua chatUsersOf (có ghi nhớ)
async function doChatQuotes({ ids = [] }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  const list = [...new Set((ids || []).map(String))].filter(chatIdOk).slice(0, 20);
  if (!list.length) return { status: 'ok', posts: {} };
  return withChatRead(async (client) => {
    const posts = {};
    let login = false;
    await mapLimit(list, PARALLEL, async (id) => {
      const r = await chatGet(client, `v4/posts/${id}`);
      if (r.status === 401) login = true;
      posts[id] = BG.chatOk(r) ? BG.quotedBrief(r.body) : r.status === 404 || r.status === 403 ? { id, missing: true } : null;
    });
    if (login) return { ...chatLoginErr };
    const users = await chatUsersOf(client, Object.values(posts).filter((p) => p?.user && !p.user.fullname && p.user.chatId).map((p) => p.user.chatId));
    for (const p of Object.values(posts)) if (p?.user && !p.user.fullname && users[p.user.chatId]) p.user = { ...users[p.user.chatId], chatId: p.user.chatId };
    return { status: 'ok', posts };
  });
}

// Tên hiển thị cho link Beincom chưa có chữ: bài / Article (GET content/contents/{mã}: tiêu đề hoặc dòng đầu), tin chat
// (người gửi: đoạn đầu), community / group (theo kết quả quét). Ghi nhớ 1 giờ trong lúc service worker còn chạy
const linkNameCache = new Map();
async function doBeinLinkNames({ links = [] }) {
  const want = [];
  const seen = new Set();
  for (const l of links || []) {
    const key = `${l?.kind}:${l?.id}`;
    if (seen.has(key) || !['content', 'chat', 'community', 'group'].includes(l?.kind) || !/^[\w-]{1,64}$/.test(String(l.id || ''))) continue;
    seen.add(key);
    want.push({ kind: l.kind, id: String(l.id), key });
  }
  const names = {};
  const now = Date.now();
  const todo = [];
  for (const l of want.slice(0, 30)) {
    const c = linkNameCache.get(l.key);
    if (c && now - c.at < 3600e3) names[l.key] = c.v;
    else todo.push(l);
  }
  if (!todo.length) return { status: 'ok', names };
  const { state } = await chrome.storage.local.get('state');
  const groups = state?.snapshot?.groups || [];
  const put = (key, v) => {
    names[key] = v;
    linkNameCache.set(key, { at: now, v });
  };
  for (const l of todo.filter((x) => x.kind === 'community' || x.kind === 'group')) {
    const g = groups.find((x) => (l.kind === 'community' ? x.isCommunity && x.communityId === l.id : x.id === l.id));
    if (g) put(l.key, { name: g.name });
  }
  const remote = todo.filter((x) => x.kind === 'content' || x.kind === 'chat');
  if (!remote.length) return { status: 'ok', names };
  return withClient(async (client) => {
    await mapLimit(remote, PARALLEL, async (l) => {
      if (l.kind === 'content') {
        const r = await client.call('GET', `content/contents/${l.id}`, null, '2.0.0', 15000, { quiet: true });
        if (BG.isContentGone(r)) return put(l.key, { name: 'Bài đã bị xoá', gone: true });
        if (!BG.isOk(r) || !r.body.data) return;
        const p = BG.slimPost(r.body.data);
        put(l.key, { name: (p.title || p.text.split('\n')[0] || 'Bài viết').replace(/\s+/g, ' ').trim().slice(0, 90), type: p.type, author: p.actor.fullname || '' });
      } else {
        const r = await chatGet(client, `v4/posts/${l.id}`);
        if (r.status === 404 || r.status === 403) return put(l.key, { name: 'Tin nhắn không còn', gone: true });
        if (!BG.chatOk(r)) return;
        const q = BG.quotedBrief(r.body);
        const u = (await chatUsersOf(client, [q.user.chatId]))[q.user.chatId];
        put(l.key, { name: `${u?.fullname || u?.username || 'Tin nhắn'}: ${BG.chatPlain(q.message).slice(0, 70) || '📎 tệp'}` });
      }
    });
    return { status: 'ok', names };
  });
}

// ---------- Tin nhắn chat bị báo cáo (community bạn là chủ / admin) ----------
// Đọc GET chat v4/communities/{community}/reports?per_page=50; xử lý POST …/reports/{báo cáo} { action: hide | ignore } (như
// nút Ẩn / Bỏ qua ở trang quản trị của web — đọc từ mã web, chưa gọi thật). Ẩn / Bỏ qua theo Chạy thử, ghi Nhật ký.
const communityOk = (id) => /^[\w-]{1,64}$/.test(String(id || ''));
async function readChatReports(client, communityId) {
  const r = await chatGet(client, `v4/communities/${communityId}/reports?per_page=50`);
  if (!BG.chatOk(r)) return { ok: false, status: r.status, message: BG.errMsg(r) };
  const b = r.body || {};
  const list = Array.isArray(b.reports) ? b.reports : Array.isArray(b.data?.reports) ? b.data.reports : Array.isArray(b) ? b : [];
  return { ok: true, items: list.map(BG.chatReportItem).filter(Boolean), more: !!(b.has_next_page ?? b.hasNextPage) };
}

// Mỗi lần quét: mọi community bạn là chủ / admin (group gốc); báo cáo mới so với lần trước thì thông báo (lần đầu chỉ ghi nhận)
async function syncChatReports(client, { state, next, notifyAllowed, now = Date.now() }) {
  const prev = state.chatReports || {};
  const out = {};
  const fresh = [];
  const roots = (next.snapshot?.groups || []).filter((g) => g.isCommunity && g.isCommunityAdmin && communityOk(g.communityId));
  await mapLimit(roots, PARALLEL, async (g) => {
    const old = prev[g.communityId];
    // Không có quyền đọc (403): một ngày mới thử lại một lần
    if (old?.error === 'denied' && now - (old.errorAt || 0) < 864e5) return void (out[g.communityId] = { ...old, name: g.name });
    const r = await readChatReports(client, g.communityId);
    if (!r.ok) {
      // Lỗi đọc: giữ danh sách cũ, ghi lỗi
      out[g.communityId] = { ...(old || { items: [] }), name: g.name, error: r.status === 403 ? 'denied' : r.message || 'lỗi', errorAt: now };
      return;
    }
    if (old && !old.error) {
      const known = new Set((old.items || []).map((x) => x.id));
      fresh.push(...r.items.filter((x) => !known.has(x.id)).map((x) => ({ ...x, communityName: g.name })));
    }
    out[g.communityId] = { at: now, name: g.name, items: r.items, more: r.more };
  });
  next.chatReports = out;
  if (notifyAllowed && fresh.length) {
    const f = fresh[0];
    notify('bg-chat-reports', `BeinGroup: ${fresh.length} tin chat bị báo cáo mới`, `${f.communityName}${f.channel ? ' · ' + f.channel : ''} — ${f.member.fullname || f.member.username || 'người dùng'}: ${(f.message || (f.files ? '📎 tệp' : '')).replace(/\s+/g, ' ').slice(0, 100)}`);
  }
  return fresh.length;
}

// Tab Báo cáo (loại Tin nhắn chat): đọc lại một community, ghi vào kết quả quét
async function doChatReports({ communityId }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!communityOk(communityId)) return { status: 'error', message: 'Thiếu community' };
  return withChatRead(async (client) => {
    const r = await readChatReports(client, communityId);
    if (r.status === 401) return { ...chatLoginErr };
    if (!r.ok) return { status: 'error', code: r.status === 403 ? 'not_admin' : '', message: r.status === 403 ? 'Chỉ chủ / admin community đọc được tin nhắn chat bị báo cáo' : 'Đọc báo cáo chat lỗi: ' + r.message };
    const { state } = await chrome.storage.local.get('state');
    if (state) {
      const name = state.chatReports?.[communityId]?.name || (state.snapshot?.groups || []).find((g) => g.communityId === communityId && g.isCommunity)?.name || '';
      state.chatReports = { ...(state.chatReports || {}), [communityId]: { at: Date.now(), name, items: r.items, more: r.more } };
      await chrome.storage.local.set({ state });
      await updateBadge();
    }
    return { status: 'ok', items: r.items, more: r.more };
  });
}

async function doChatReportAct({ communityId, action, items = [], communityName = '' }) {
  const { settings: raw, log = [] } = await chrome.storage.local.get(['settings', 'log']);
  const settings = { ...BG.DEFAULT_SETTINGS, ...raw };
  if (!settings.chatEnabled) return chatOff();
  if (!communityOk(communityId) || !['hide', 'ignore'].includes(action)) return { status: 'error', message: 'Thiếu community hoặc thao tác' };
  const list = (items || []).filter((x) => communityOk(x?.id)).slice(0, 100);
  if (!list.length) return { status: 'error', message: 'Chưa chọn tin nào' };
  return withClient(async (client) => {
    const acts = list.map((x) => ({
      log: { kind: 'chat', source: 'manual', action: action === 'hide' ? 'reportHide' : 'reportIgnore', groupName: communityName, contentId: x.id, snippet: String(x.snippet || '').slice(0, 120), userId: x.member?.id || '', username: x.member?.username || '', fullname: x.member?.fullname || '' },
      call: (c) => c.call('POST', BG.CHAT_API + `v4/communities/${communityId}/reports/${x.id}`, { action }, ''),
      ok: BG.chatOk,
      gone: true,
      goneIf: (r) => r.status === 404,
    }));
    const r = await performActions(acts, settings);
    pushLog(log, r.entries);
    // Báo cáo đã xử lý (hoặc tin đã bị xoá) rời khỏi danh sách đang chờ
    const done = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
    const { state } = await chrome.storage.local.get('state');
    if (state?.chatReports?.[communityId] && done.size) {
      const c = state.chatReports[communityId];
      state.chatReports = { ...state.chatReports, [communityId]: { ...c, items: (c.items || []).filter((x) => !done.has(x.id)) } };
      await chrome.storage.local.set({ state, log });
    } else await chrome.storage.local.set({ log });
    await updateBadge();
    return { ...summary(r, settings), done: [...done] };
  });
}

// ---------- Báo tin nhắn riêng, nhắc tên, bình luận thread (dùng chung: lần quét và kiểm tra nhanh mỗi phút) ----------
// Mốc đã báo lưu riêng ở khoá chatNotify { at, me, dmTeam, dm: { kênh: last_post_at đã báo }, mentions, threads: { thread:
// last_reply_at } } để lần kiểm tra nhanh không phải đọc cả kết quả quét. Phần nào chưa có mốc (lần đầu, vừa bật) chỉ ghi nhận.
// Lệnh đọc lỗi (hết phiên…) thì giữ mốc cũ, không báo nhầm. Không đọc nội dung tin nhắn riêng.
async function chatNotices(client, { settings, me, dmTeam, prevUsers = {}, notifyAllowed = true, legacy = null, quick = false }) {
  const stored = (await chrome.storage.local.get('chatNotify')).chatNotify;
  const prev = stored || (legacy && (legacy.dm || legacy.threads) ? legacy : null); // bản cũ ghi mốc trong state
  const cur = { at: Date.now(), me: me || prev?.me || null, dmTeam: dmTeam || prev?.dmTeam || null, dm: prev?.dm, mentions: prev?.mentions, threads: prev?.threads };
  let unread = null;
  let users = prevUsers;
  let teamsUnread = null;
  if (settings.chatUnread && cur.me?.chatId) {
    const u = await readChatUnread(client, { dmTeam: cur.dmTeam, me: cur.me }, prevUsers);
    teamsUnread = u.teamsUnread;
    if (u.ok) {
      users = u.users;
      unread = u.unread;
      const seen = { ...(cur.dm || {}) };
      const newDm = cur.dm ? u.unread.dms.filter((d) => d.unread > 0 && d.lastPostAt > (seen[d.channelId] || 0)) : [];
      for (const d of u.unread.dms) seen[d.channelId] = Math.max(seen[d.channelId] || 0, d.lastPostAt);
      cur.dm = seen;
      if (notifyAllowed && newDm.length) {
        // Lời mời trò chuyện (người chưa kết nối nhắn cho bạn) báo riêng với tin nhắn riêng
        const reqN = newDm.filter((d) => d.request).length;
        const head = [newDm.length - reqN ? `${newDm.length - reqN} tin nhắn riêng mới` : '', reqN ? `${reqN} lời mời trò chuyện mới` : ''].filter(Boolean).join(', ');
        notify('bg-chat-dm', `BeinGroup: ${head}`, 'Từ: ' + newDm.map((d) => (d.user?.fullname || d.user?.username || d.title || 'người dùng') + (d.request ? ' (lời mời)' : '')).slice(0, 5).join(', ') + '. Bấm để mở chat.', BG.SITE + '/chat-home');
      }
      if (notifyAllowed && typeof cur.mentions === 'number' && u.unread.mentions > cur.mentions) {
        notify('bg-chat-mention', `BeinGroup: bạn được nhắc tên ${u.unread.mentions} lần trong chat`, 'Bấm để mở chat.', BG.SITE + '/chat-home');
      }
      cur.mentions = u.unread.mentions;
    }
  }
  // Bình luận mới ở thread bạn theo dõi: chỉ số thread và tên người tham gia
  if (settings.chatThreads) {
    if (!teamsUnread) {
      const un = await chatGet(client, 'v5/users/me/teams/unread?include_collapsed_threads=true');
      teamsUnread = BG.chatOk(un) && Array.isArray(un.body) ? un.body : null;
    }
    // Kiểm tra nhanh: chỉ khi máy chủ cho số thread chưa đọc theo team (không thì phải đọc mọi team — để lần quét làm)
    if (teamsUnread && (!quick || teamsUnread.some((t) => typeof t.thread_count === 'number'))) {
      const tn = BG.threadNotice(await readThreadUpdates(client, teamsUnread), cur.threads, !cur.threads);
      cur.threads = tn.seen;
      if (notifyAllowed && tn.fresh.length) {
        const mentions = tn.fresh.reduce((s, t) => s + (t.unreadMentions || 0), 0);
        const people = [...new Set(tn.fresh.flatMap((t) => t.people))].slice(0, 5);
        notify('bg-chat-thread', `BeinGroup: ${tn.fresh.length} thread bạn theo dõi có bình luận mới${mentions ? ` (${mentions} lần nhắc bạn)` : ''}`, (people.length ? 'Người tham gia: ' + people.join(', ') + '. ' : '') + 'Bấm để xem.', BG.SITE + '/chat-home');
      }
    }
  }
  await chrome.storage.local.set({ chatNotify: cur });
  return { users, unread };
}

// Kiểm tra nhanh mỗi phút (cài đặt chatFast): chỉ tin nhắn riêng / nhắc tên / thread, vài lệnh đọc nhẹ. Chỉ gọi thẳng chat
// (không mở tab Beincom); đang quét thì bỏ lượt; chưa có mốc từ lần quét đầu (biết mình là ai, team tin nhắn riêng) thì chờ.
const CHAT_ALARM = 'beingroup-chat';
let chatQuickBusy = false;
async function chatQuickCheck() {
  if (chatQuickBusy || exclusiveBusy()) return { status: 'ok', skipped: 'busy' };
  const { settings: raw, chatNotify } = await chrome.storage.local.get(['settings', 'chatNotify']);
  const settings = { ...BG.DEFAULT_SETTINGS, ...raw };
  if (!settings.active || !settings.chatEnabled || !settings.chatFast || !(settings.chatUnread || settings.chatThreads)) return { status: 'ok', skipped: 'off' };
  if (!chatNotify?.me?.chatId) return { status: 'ok', skipped: 'no-map' };
  if (!(await chrome.permissions.contains({ origins: [BG.CHAT_ORIGIN] }).catch(() => false))) return { status: 'ok', skipped: 'no-permission' };
  chatQuickBusy = true;
  try {
    const r = await chatNotices(directClient(), { settings, notifyAllowed: true, quick: true });
    return { status: 'ok', checked: true, dms: r.unread?.dms.length ?? null };
  } catch (e) {
    return { status: 'error', message: String(e?.message || e) };
  } finally {
    chatQuickBusy = false;
  }
}

async function scheduleChatAlarm() {
  const { settings: raw } = await chrome.storage.local.get('settings');
  const s = { ...BG.DEFAULT_SETTINGS, ...raw };
  const on = s.active && s.chatEnabled && s.chatFast && (s.chatUnread || s.chatThreads);
  const alarm = await chrome.alarms.get(CHAT_ALARM);
  if (on && !alarm) chrome.alarms.create(CHAT_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  if (!on && alarm) await chrome.alarms.clear(CHAT_ALARM);
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
  // Tin nhắn chat bị báo cáo ở community bạn là chủ / admin (cùng công tắc quét báo cáo)
  if (settings.scanReports) await syncChatReports(client, { state, next, notifyAllowed, now });
  else delete next.chatReports;
  // Tin nhắn riêng, nhắc tên, bình luận thread: báo cái mới so với mốc đã báo (chatNotify, dùng chung với kiểm tra nhanh)
  if (settings.chatUnread || settings.chatThreads) {
    const r = await chatNotices(client, { settings, me: map.me, dmTeam: map.dmTeam, prevUsers: state.chatUsers || {}, notifyAllowed, legacy: state.chatNotified || state.chatThreadSeen ? { dm: state.chatNotified, mentions: state.chatUnread?.mentions, threads: state.chatThreadSeen } : null });
    if (r.unread) {
      next.chatUsers = r.users;
      next.chatUnread = r.unread;
    }
    delete next.chatNotified;
    delete next.chatThreadSeen;
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
  // Bản ghi nhớ từ bản cũ chưa có huy hiệu (b) thì đọc lại
  const need = [...new Set(ids)].filter((id) => id && !chatUserCache.get(id)?.b).slice(0, 60);
  await mapLimit(need, CHAT_FETCH_PARALLEL, async (id) => {
    const r = await chatGet(client, `v4/users/${id}`);
    if (BG.chatOk(r)) chatUserCache.set(id, { ...BG.chatPerson(r.body), pictureAt: r.body.last_picture_update || 0, at: Date.now(), b: 1 });
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
    const [me, teams, tm, { chs, mem }, unreadT] = await Promise.all([
      chatGet(client, 'v4/users/me'),
      teamsP,
      chatGet(client, 'v4/users/me/teams/members'),
      readAllChannels(client, teamsOf),
      // Số thread có bình luận chưa đọc (thread_count / thread_mention_count của từng team; máy chủ không có thì bỏ)
      chatGet(client, 'v5/users/me/teams/unread?include_collapsed_threads=true'),
    ]);
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
    // Lời mời trò chuyện (người chưa kết nối nhắn cho bạn): trả về riêng (requests), không lẫn vào tin nhắn riêng
    const isReq = (c) => !!BG.chatContact(c, me.body.id)?.incoming;
    const reqRaw = dmRaw.filter(isReq);
    const dmOnly = dmRaw.filter((c) => !isReq(c));
    // Đọc nhanh: tên người của 8 lời mời gần nhất, 8 tin nhắn riêng gần nhất + tin nhắn riêng còn tin chưa đọc (tối đa 16)
    const unreadOf = (c) => Math.max(0, (c.total_msg_count || 0) - (memOf.get(c.id)?.msg_count || 0)) || memOf.get(c.id)?.mention_count || 0;
    const wantIds = (quick ? [...reqRaw.slice(0, CHAT_QUICK_DMS), ...dmOnly.filter((c, i) => i < CHAT_QUICK_DMS || unreadOf(c)).slice(0, 2 * CHAT_QUICK_DMS)] : [...reqRaw.slice(0, 20), ...dmOnly.slice(0, CHAT_FULL_DMS)])
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
    const meP = { ...BG.chatPerson(me.body), chatId: me.body.id, pictureAt: me.body.last_picture_update || 0 };
    const item = (c) => {
      const t = teamById.get(c.team_id) || dmTeamRaw || { id: c.team_id || '', name: '', props: {} };
      const m = memOf.get(c.id);
      const ch = BG.chatChannel(c, t, { channelRoles: m?.roles || '', teamRoles: teamRoles.get(t.id) || '', perms: Object.fromEntries(Object.entries(perms).filter(([, v]) => v)) });
      // Quyền chưa rõ (lần đọc nhanh, vai trò chưa có trong bộ nhớ): để trang tự quyết khi đã đủ
      const sure = known(`${m?.roles || ''} ${teamRoles.get(t.id) || ''}`);
      const otherId = otherOf(c);
      const other = otherId ? users[otherId] : null;
      const contact = BG.chatContact(c, me.body.id);
      // Nhắn cho chính mình: "Nhật ký cá nhân" kèm ảnh đại diện của tài khoản
      if (BG.chatSelfDm(c, me.body.id)) return { ...ch, self: true, canPost: sure ? ch.canPost : null, canDelete: false, title: BG.SELF_DM_TITLE, purpose: '', other: meP, unread: Math.max(0, (c.total_msg_count || 0) - (m?.msg_count || 0)), mentions: m?.mention_count || 0 };
      return {
        ...ch,
        ...(contact ? { contact } : {}),
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
      .map((t) => ({ id: t.id, name: t.name || '', title: t.display_name || t.name || '', communityId: t.props?.bic_group_team_id || '', icon: BG.chatTeamIcon(t.id, t.last_team_icon_update), channels: live.filter((c) => c.team_id === t.id && c.type !== 'D' && c.type !== 'G').map(item).sort((a, b) => b.lastPostAt - a.lastPostAt) }))
      .filter((t) => t.channels.length)
      .map((t) => ({ ...t, pinned: rankOf(t) !== null, pinRank: rankOf(t) }))
      // Ghim trước (theo thứ tự ghim), rồi cộng đồng có tin mới nhất
      .sort((a, b) => (a.pinned === b.pinned ? (a.pinned ? a.pinRank - b.pinRank : latest(b) - latest(a)) : a.pinned ? -1 : 1));
    const tu = BG.chatOk(unreadT) && Array.isArray(unreadT.body) ? unreadT.body : [];
    const threads = tu.some((t) => typeof t.thread_count === 'number') ? { unread: tu.reduce((s, t) => s + (t.thread_count || 0), 0), mentions: tu.reduce((s, t) => s + (t.thread_mention_count || 0), 0) } : null;
    return {
      status: 'ok',
      quick,
      threads,
      me: { chatId: me.body.id, id: me.body.props?.bic_user_id || '', username: me.body.username || '', fullname: BG.chatPerson(me.body).fullname, pictureAt: me.body.last_picture_update || 0 },
      teams: out,
      dms: dmOnly.map(item),
      requests: reqRaw.map(item),
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
  // Trang tin: chỉ tin gốc, bình luận gộp vào thread (như web: collapsedThreads; Extended kèm người tham gia — gọi thật
  // 14/10/2026). Tin mới từ lần trước (since) đọc đủ cả bình luận để trang cập nhật số bình luận / thread đang mở.
  const crt = 'skipFetchThreads=false&collapsedThreads=true&collapsedThreadsExtended=true';
  const path = since > 0 ? `v5/channels/${channelId}/posts?since=${Math.floor(since)}` : `v5/channels/${channelId}/posts?${before ? `before=${before}&` : ''}page=0&per_page=${n}&${crt}`;
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

// Thread của một tin: tin gốc + bình luận (cũ -> mới), từng trang 100 (GET v5/posts/{id}/thread như web — gọi thật)
async function doChatThread({ rootId, fromPost = '', fromCreateAt = 0 }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(rootId) || (fromPost && !chatIdOk(fromPost))) return { status: 'error', message: 'Thiếu tin nhắn' };
  const page = fromPost ? `&fromPost=${fromPost}&fromCreateAt=${Math.floor(Number(fromCreateAt) || 0)}` : '';
  return withChatRead(async (client) => {
    const r = await chatGet(client, `v5/posts/${rootId}/thread?skipFetchThreads=false&collapsedThreads=true&collapsedThreadsExtended=false&direction=down&perPage=100${page}`);
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: 'Đọc bình luận lỗi: ' + BG.errMsg(r) };
    const posts = Object.values(r.body.posts || {})
      .map(BG.chatPagePost)
      .filter(Boolean)
      .sort((a, b) => a.createAt - b.createAt);
    return { status: 'ok', posts, hasNext: !!r.body.has_next };
  });
}

// Thread đang theo dõi (như nút "Thread" trên web): mỗi team một lệnh GET v4/users/me/teams/{team}/threads?per_page=25
// &extended=true[&unread=true] (gọi thật 14/10/2026; ~0,5–1,5 giây mỗi team, chạy song song). Gộp các team, bỏ trùng, mới
// nhất trước; tin gốc chưa có tên người thì lấy tên (có ghi nhớ).
async function doChatThreads({ unread = false } = {}) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  return withChatRead(async (client) => {
    const teams = await chatGet(client, 'v4/users/me/teams');
    if (teams.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(teams)) return { status: 'error', message: 'Đọc danh sách chat lỗi: ' + BG.errMsg(teams) };
    const byId = new Map();
    let total = 0;
    let unreadThreads = 0;
    let failed = 0;
    await mapLimit(teams.body || [], CHAT_FETCH_PARALLEL, async (t) => {
      const r = await chatGet(client, `v4/users/me/teams/${t.id}/threads?per_page=25&extended=true${unread ? '&unread=true' : ''}`);
      if (!BG.chatOk(r)) return void failed++;
      total += r.body.total || 0;
      unreadThreads += r.body.total_unread_threads || 0;
      for (const x of r.body.threads || []) {
        if (x.delete_at || byId.has(x.id)) continue;
        const it = BG.chatThreadItem(x, t);
        if (it) byId.set(x.id, it);
      }
    });
    const threads = [...byId.values()].sort((a, b) => (b.lastReplyAt || b.root.createAt) - (a.lastReplyAt || a.root.createAt)).slice(0, 100);
    const users = await chatUsersOf(client, threads.filter((t) => !t.root.user.fullname && t.root.user.chatId).map((t) => t.root.user.chatId));
    for (const t of threads) {
      const u = users[t.root.user.chatId];
      if (!t.root.user.fullname && u) t.root.user = { ...u, chatId: t.root.user.chatId };
    }
    return { status: 'ok', threads, total, unreadThreads, failed };
  });
}

// Theo dõi / bỏ theo dõi thread (PUT / DELETE v4/users/me/teams/{team}/threads/{tin}/following — như web, đọc từ mã web,
// chưa gọi thật) và đánh dấu đã đọc thread (PUT …/read/{thời điểm}). Việc của chính bạn: làm thật kể cả khi Chạy thử.
async function doChatFollow({ teamId, rootId, follow = true }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(teamId) || !chatIdOk(rootId)) return { status: 'error', message: 'Thiếu tin nhắn' };
  return withClient(async (client) => {
    const r = await client.call(follow ? 'PUT' : 'DELETE', BG.CHAT_API + `v4/users/me/teams/${teamId}/threads/${rootId}/following`, null, '');
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: (follow ? 'Theo dõi' : 'Bỏ theo dõi') + ' lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', following: !!follow };
  });
}
async function doChatThreadRead({ teamId, rootId }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(teamId) || !chatIdOk(rootId)) return { status: 'error', message: 'Thiếu tin nhắn' };
  return withChatRead(async (client) => {
    const r = await client.call('PUT', BG.CHAT_API + `v4/users/me/teams/${teamId}/threads/${rootId}/read/${Date.now()}`, null, '', 0, { quiet: true });
    return BG.chatOk(r) ? { status: 'ok' } : { status: 'error', message: BG.errMsg(r) };
  });
}

// Gửi tin của mình (bình luận trong thread: rootId). Gửi thật kể cả khi Chạy thử: đây là tin bạn tự gõ và bấm gửi.
async function doChatSend({ channelId, message, rootId = '', acceptContactId = '', priority = '', fileIds = [], quotedPostId = '' }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  const text = String(message || '').trim();
  const files = Array.isArray(fileIds) ? fileIds.map(String) : [];
  if (files.length > CHAT_FILES_MAX || files.some((id) => !chatIdOk(id))) return { status: 'error', message: `Tối đa ${CHAT_FILES_MAX} tệp mỗi tin` };
  if (priority && !BG.CHAT_PRIORITIES.includes(priority)) return { status: 'error', message: 'Độ ưu tiên không hợp lệ' };
  if (!text && !files.length) return { status: 'error', message: 'Tin nhắn trống' };
  if (text.length > CHAT_MSG_MAX) return { status: 'error', message: `Tin nhắn dài quá ${CHAT_MSG_MAX} ký tự` };
  if (!chatIdOk(channelId) || (rootId && !chatIdOk(rootId)) || (acceptContactId && !chatIdOk(acceptContactId)) || (quotedPostId && !chatIdOk(quotedPostId))) return { status: 'error', message: 'Thiếu kênh chat' };
  return withClient(async (client) => {
    // Trả lời một lời mời trò chuyện là chấp nhận lời mời (web Beincom chấp nhận rồi mới gửi)
    let accepted = false;
    if (acceptContactId) {
      const a = await client.call('POST', BG.CHAT_API + `v4/contacts/${acceptContactId}/accept`, null, '');
      if (a.status === 401) return { ...chatLoginErr };
      accepted = BG.chatOk(a);
    }
    // Độ ưu tiên (Quan trọng / Khẩn cấp) và tệp đã tải lên (POST v4/files) — như web
    // Tin trả lời: props.quoted_post_id như web (web đọc mã tin được trích ở đây trước, rồi mới tới link trong tin)
    const body = { channel_id: channelId, message: text, ...(rootId ? { root_id: rootId } : {}), ...(files.length ? { file_ids: files } : {}), ...(priority ? { metadata: { priority: { priority, requested_ack: false, persistent_notifications: false } } } : {}), ...(quotedPostId ? { props: { quoted_post_id: quotedPostId } } : {}) };
    const r = await client.call('POST', BG.CHAT_API + 'v4/posts', body, '');
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: 'Gửi tin lỗi: ' + BG.errMsg(r), accepted };
    return { status: 'ok', post: BG.chatPagePost(r.body), accepted };
  });
}

// Tải một tệp lên chat để gửi kèm tin (như web: POST v4/files, FormData files + channel_id + client_ids; máy chủ Beincom
// nhận tối đa 25 MB mỗi tệp — MaxFileSize, gọi thật 14/10/2026). Trang gửi tệp dạng base64 (tin nhắn giữa trang và nền chỉ
// nhận JSON). Chỉ gọi thẳng (không qua tab Beincom).
const CHAT_FILE_MAX = 25 * 1024 * 1024;
const CHAT_FILES_MAX = 10;
async function doChatUpload({ channelId, name = '', mime = '', data = '' }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(channelId)) return { status: 'error', message: 'Thiếu kênh chat' };
  const b64 = String(data || '');
  if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) return { status: 'error', message: 'Tệp trống hoặc không đọc được' };
  if (Math.floor((b64.length * 3) / 4) > CHAT_FILE_MAX + 2) return { status: 'error', message: 'Tệp lớn quá 25 MB' };
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const form = new FormData();
  form.append('files', new Blob([bytes], { type: String(mime || 'application/octet-stream').slice(0, 100) }), String(name || 'tep').replace(/[\\/\r\n]/g, '_').slice(0, 200));
  form.append('channel_id', channelId);
  form.append('client_ids', 'bg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  let res;
  try {
    res = await fetch(BG.CHAT_API + 'v4/files', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'x-application': 'BIC_GROUP', 'x-platform': 'WEB', 'X-Requested-With': 'XMLHttpRequest' }, body: form });
  } catch (e) {
    return { status: 'error', message: 'Không kết nối được chat: ' + String(e?.message || e) };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (res.status === 401) return { ...chatLoginErr };
  const f = body?.file_infos?.[0];
  if (res.status < 200 || res.status >= 300 || !f?.id) return { status: 'error', message: 'Tải tệp lên lỗi: ' + BG.errMsg({ status: res.status, body }) };
  return { status: 'ok', file: { id: f.id, name: f.name || name, mime: f.mime_type || mime, size: f.size || bytes.length, width: f.width || 0, height: f.height || 0, mini: f.mini_preview || '' } };
}

// Sửa tin của mình (như web: PUT v4/posts/{id}/patch — đọc từ mã web, chưa gọi thật). Việc của chính bạn: thật kể cả Chạy thử.
async function doChatEdit({ postId, message }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  const text = String(message || '').trim();
  if (!chatIdOk(postId)) return { status: 'error', message: 'Thiếu tin nhắn' };
  if (!text) return { status: 'error', message: 'Tin nhắn trống' };
  if (text.length > CHAT_MSG_MAX) return { status: 'error', message: `Tin nhắn dài quá ${CHAT_MSG_MAX} ký tự` };
  return withClient(async (client) => {
    const r = await client.call('PUT', BG.CHAT_API + `v4/posts/${postId}/patch`, { id: postId, message: text }, '');
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: 'Sửa tin lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', post: BG.chatPagePost(r.body) };
  });
}

// Ghim / bỏ ghim tin (POST v4/posts/{id}/pin | unpin — đọc từ mã web, chưa gọi thật). Việc của admin với kênh: theo Chạy thử,
// ghi Nhật ký (như ghim bài).
async function doChatPin({ postId, pin = true, groupName = '', snippet = '', user = null }) {
  const { settings: raw, log = [] } = await chrome.storage.local.get(['settings', 'log']);
  const settings = { ...BG.DEFAULT_SETTINGS, ...raw };
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(postId)) return { status: 'error', message: 'Thiếu tin nhắn' };
  return withClient(async (client) => {
    const items = [{ log: { kind: 'chat', source: 'manual', action: pin ? 'pin' : 'unpin', groupName, contentId: postId, snippet: String(snippet || '').slice(0, 120), userId: user?.id || '', username: user?.username || '', fullname: user?.fullname || '' }, call: (c) => c.call('POST', BG.CHAT_API + `v4/posts/${postId}/${pin ? 'pin' : 'unpin'}`, null, ''), ok: BG.chatOk }];
    const r = await performActions(items, settings);
    pushLog(log, r.entries);
    await chrome.storage.local.set({ log });
    return { ...summary(r, settings), pinned: !!pin };
  });
}

// Tin đã ghim của kênh, mới nhất trước (GET v4/channels/{id}/pinned — như web)
async function doChatPinned({ channelId }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(channelId)) return { status: 'error', message: 'Thiếu kênh chat' };
  return withChatRead(async (client) => {
    const r = await chatGet(client, `v4/channels/${channelId}/pinned`);
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: 'Đọc tin đã ghim lỗi: ' + BG.errMsg(r) };
    const posts = Object.values(r.body.posts || {})
      .map(BG.chatPagePost)
      .filter((p) => p && !p.deleted)
      .sort((a, b) => b.createAt - a.createAt);
    // Tin ghim thường không kèm người viết: lấy tên (có ghi nhớ)
    const users = await chatUsersOf(client, posts.filter((p) => !p.user.fullname && p.user.chatId).map((p) => p.user.chatId));
    for (const p of posts) if (!p.user.fullname && users[p.user.chatId]) p.user = { ...users[p.user.chatId], chatId: p.user.chatId };
    return { status: 'ok', posts };
  });
}

// Gợi ý @tên khi gõ: người trong kênh (GET v4/users/autocomplete?in_team&in_channel&name&limit — như web)
async function doChatMentions({ channelId, teamId = '', term = '' }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(channelId) || (teamId && !chatIdOk(teamId))) return { status: 'error', message: 'Thiếu kênh chat' };
  const name = String(term || '').replace(/[^\w.\-]/g, '').slice(0, 30);
  return withChatRead(async (client) => {
    const r = await chatGet(client, `v4/users/autocomplete?${teamId ? `in_team=${teamId}&` : ''}in_channel=${channelId}&name=${encodeURIComponent(name)}&limit=8`);
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: BG.errMsg(r) };
    const users = (r.body.users || []).filter((u) => !u.delete_at).slice(0, 8).map((u) => ({ ...BG.chatPerson(u), pictureAt: u.last_picture_update || 0 }));
    return { status: 'ok', users };
  });
}

// Biểu cảm của mình (như web: thả POST v4/reactions { user_id, post_id, emoji_name }; bỏ DELETE v5/users/{mình}/posts/{tin}/
// reactions/{tên} — đọc từ mã web, chưa gọi thật). Việc của chính bạn: thật kể cả Chạy thử.
const emojiOk = (name) => /^[\w+\-]{1,64}$/.test(String(name || ''));
async function doChatReact({ postId, emoji, add = true, meChatId }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(postId) || !chatIdOk(meChatId) || !emojiOk(emoji)) return { status: 'error', message: 'Thiếu tin nhắn hoặc biểu cảm' };
  return withClient(async (client) => {
    const r = add
      ? await client.call('POST', BG.CHAT_API + 'v5/reactions', { user_id: meChatId, post_id: postId, emoji_name: emoji }, '')
      : await client.call('DELETE', BG.CHAT_API + `v5/users/${meChatId}/posts/${postId}/reactions/${encodeURIComponent(emoji)}`, null, '');
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r) && !(r.status === 404 && !add)) return { status: 'error', message: 'Biểu cảm lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', added: !!add };
  });
}

// Thả: POST v5/reactions { user_id, post_id, emoji_name } (web: getReactionsRoute dùng /api/v5 — trước dùng v4 nên lỗi);
// bỏ: DELETE v5/users/{mình}/posts/{tin}/reactions/{tên}
// Ai đã thả biểu cảm (GET v4/posts/{id}/reactions — như web): theo emoji, tên người (có ghi nhớ)
async function doChatReactions({ postId }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(postId)) return { status: 'error', message: 'Thiếu tin nhắn' };
  return withChatRead(async (client) => {
    const r = await chatGet(client, `v4/posts/${postId}/reactions`);
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: BG.errMsg(r) };
    const list = (Array.isArray(r.body) ? r.body : []).filter((x) => x?.emoji_name && x.user_id);
    const users = await chatUsersOf(client, list.map((x) => x.user_id));
    const by = {};
    for (const x of list) (by[x.emoji_name] ||= []).push({ chatId: x.user_id, fullname: users[x.user_id]?.fullname || users[x.user_id]?.username || '' });
    return { status: 'ok', reactions: by };
  });
}

// Tìm tin nhắn (như web: POST v4/teams/{team}/posts/search, hoặc v4/posts/search cho mọi nơi; body { terms, is_or_search,
// include_deleted_channels, time_zone_offset, page, per_page } — đọc từ mã web). Trong một kênh: tìm trong team của kênh rồi
// lọc theo kênh. Mọi nơi mà máy chủ không có lệnh chung thì tìm từng team. Chỉ đọc.
async function doChatSearch({ terms, channelId = '', teamId = '' }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  const q = String(terms || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (q.length < 2) return { status: 'error', message: 'Gõ ít nhất 2 ký tự để tìm' };
  if ((channelId && !chatIdOk(channelId)) || (teamId && !chatIdOk(teamId))) return { status: 'error', message: 'Thiếu kênh chat' };
  const body = (n) => ({ terms: q, is_or_search: false, include_deleted_channels: false, time_zone_offset: -new Date().getTimezoneOffset() * 60, page: 0, per_page: n });
  return withChatRead(async (client) => {
    const lists = [];
    if (channelId && teamId) {
      const r = await client.call('POST', BG.CHAT_API + `v4/teams/${teamId}/posts/search`, body(100), '', 0, { quiet: true });
      if (r.status === 401) return { ...chatLoginErr };
      if (!BG.chatOk(r)) return { status: 'error', message: 'Tìm lỗi: ' + BG.errMsg(r) };
      lists.push(r.body);
    } else {
      const r = await client.call('POST', BG.CHAT_API + 'v4/posts/search', body(60), '', 0, { quiet: true });
      if (r.status === 401) return { ...chatLoginErr };
      if (BG.chatOk(r)) lists.push(r.body);
      else {
        const teams = await chatGet(client, 'v4/users/me/teams');
        if (!BG.chatOk(teams)) return { status: 'error', message: 'Tìm lỗi: ' + BG.errMsg(r) };
        await mapLimit((teams.body || []).slice(0, 30), CHAT_FETCH_PARALLEL, async (t) => {
          const x = await client.call('POST', BG.CHAT_API + `v4/teams/${t.id}/posts/search`, body(20), '', 0, { quiet: true });
          if (BG.chatOk(x)) lists.push(x.body);
        });
      }
    }
    const seen = new Set();
    const posts = lists
      .flatMap((b) => Object.values(b?.posts || {}))
      .map(BG.chatPagePost)
      .filter((p) => p && !p.deleted && !p.system && (!channelId || p.channelId === channelId) && !seen.has(p.id) && seen.add(p.id))
      .sort((a, b) => b.createAt - a.createAt)
      .slice(0, 60);
    const users = await chatUsersOf(client, posts.filter((p) => !p.user.fullname && p.user.chatId).map((p) => p.user.chatId));
    for (const p of posts) if (!p.user.fullname && users[p.user.chatId]) p.user = { ...users[p.user.chatId], chatId: p.user.chatId };
    return { status: 'ok', posts };
  });
}

// Thread đang theo dõi có bình luận chưa đọc (mỗi lần quét): chỉ đọc team có thread_count (máy chủ không cho số thì đọc mọi team),
// mỗi team một lệnh GET v4/users/me/teams/{team}/threads?per_page=10&extended=true&unread=true. Không lấy nội dung tin.
async function readThreadUpdates(client, teamsUnread) {
  let teamIds;
  if (Array.isArray(teamsUnread) && teamsUnread.some((t) => typeof t.thread_count === 'number')) teamIds = teamsUnread.filter((t) => (t.thread_count || 0) + (t.thread_mention_count || 0) > 0).map((t) => t.team_id);
  else {
    const tr = await chatGet(client, 'v4/users/me/teams');
    teamIds = BG.chatOk(tr) ? (tr.body || []).map((t) => t.id) : [];
  }
  const out = new Map();
  await mapLimit(teamIds.slice(0, 30), PARALLEL, async (tid) => {
    const r = await chatGet(client, `v4/users/me/teams/${tid}/threads?per_page=10&extended=true&unread=true`);
    if (!BG.chatOk(r)) return;
    for (const x of r.body.threads || []) {
      if (x.delete_at || out.has(x.id)) continue;
      out.set(x.id, { id: x.id, lastReplyAt: x.last_reply_at || 0, unreadReplies: x.unread_replies || 0, unreadMentions: x.unread_mentions || 0, people: (x.participants || []).slice(-3).map((u) => BG.chatPerson(u)?.fullname).filter(Boolean) });
    }
  });
  return [...out.values()];
}

// Lời mời trò chuyện: Chấp nhận / Bỏ qua (POST v4/contacts/{contact_id}/accept | ignore — như nút trên web Beincom; đọc từ mã
// web, chưa gọi thật). Việc của chính bạn với tài khoản của bạn (như gửi tin): làm thật kể cả khi Chạy thử.
async function doChatContact({ contactId, action }) {
  const settings = await chatSettings();
  if (!settings.chatEnabled) return chatOff();
  if (!chatIdOk(contactId) || !['accept', 'ignore'].includes(action)) return { status: 'error', message: 'Thiếu lời mời trò chuyện' };
  return withClient(async (client) => {
    const r = await client.call('POST', BG.CHAT_API + `v4/contacts/${contactId}/${action}`, null, '');
    if (r.status === 401) return { ...chatLoginErr };
    if (!BG.chatOk(r)) return { status: 'error', message: (action === 'accept' ? 'Chấp nhận' : 'Bỏ qua') + ' lời mời lỗi: ' + BG.errMsg(r) };
    return { status: 'ok' };
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
