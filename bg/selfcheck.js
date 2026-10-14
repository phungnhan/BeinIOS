// Service worker — Tự kiểm tra: gọi thử (chỉ GET) các API đọc mà từng tính năng dùng, với một community / group,
// rồi báo từng mục: dùng được, bỏ qua (tài khoản không có quyền / chưa bật) hay lỗi (Beincom đổi API, không kết nối…).
// Không ghi vào Lỗi kỹ thuật (gọi với quiet) — kết quả lưu ở khoá `selfCheck` để xem lại / sao chép.

const CHECK_TIMEOUT = 15000;
const isList = (d) => Array.isArray(d?.list);
const isArr = (d) => Array.isArray(d);

// Các mục kiểm tra cho group g. need = false: bỏ qua, ghi lý do (why). path có thể là hàm của kết quả mục trước (ctx).
function selfCheckProbes(g, { root, now, tg, settings = null }) {
  const iso = (t) => encodeURIComponent(new Date(t).toISOString());
  const from = now - 30 * 864e5;
  const rootId = root?.id || g.id;
  return [
    { id: 'login', label: 'Đăng nhập Beincom', uses: 'mọi tính năng', path: 'user/me/profile', version: '', shape: (d) => !!d?.id, detail: (d) => (d.username ? '@' + d.username : '') },
    { id: 'perms', label: 'Quyền quản trị', uses: 'quét, mọi thao tác', path: 'group/me/permissions', shape: (d) => !!d && typeof d === 'object' && ('groups' in d || 'communities' in d) },
    { id: 'group', label: 'Thông tin group', uses: 'Tổng quan, số thành viên', path: `group/groups/${g.id}`, shape: (d) => d?.id === g.id, detail: (d) => (d.userCount != null ? `${Number(d.userCount).toLocaleString('vi-VN')} thành viên` : '') },
    { id: 'requests', label: 'Yêu cầu tham gia', uses: 'duyệt thành viên', path: `group/groups/${g.id}/join-requests?limit=1&offset=0`, shape: isArr, need: g.canApprove !== false, why: 'không có quyền duyệt thành viên', detail: (d, b) => `${b.meta?.total ?? d.length} đang chờ` },
    g.isCommunity
      ? { id: 'members', label: 'Danh sách thành viên', uses: 'Thành viên, chào thành viên mới', path: `group/manage/communities/${g.communityId}/members?limit=1&offset=0&sort=joined_at:desc`, shape: isArr }
      : { id: 'members', label: 'Danh sách thành viên', uses: 'Thành viên', path: `group/groups/${g.id}/users?limit=1&offset=0`, shape: (d) => !!d && 'groupMember' in d },
    { id: 'activity', label: 'Nhật ký hoạt động', uses: 'vào / rời, hồ sơ vi phạm', path: `group/groups/${g.id}/activity-logs?limit=1&page=1&sort=desc`, shape: isArr },
    { id: 'memberLog', label: 'Nhật ký thành viên theo ngày', uses: 'báo cáo tháng, thành viên mới', path: `group/groups/${g.id}/activity-logs?limit=1&page=1&sort=desc&objectType=MEMBER&from=${Math.floor(from)}&to=${Math.ceil(now)}`, shape: isArr, detail: (d, b) => (b.meta?.total != null ? `${b.meta.total} sự kiện trong 30 ngày` : '') },
    { id: 'teamLog', label: 'Nhật ký việc của admin', uses: 'báo cáo tháng → đội admin', path: `group/groups/${g.id}/activity-logs?limit=1&page=1&sort=desc&useCase=${encodeURIComponent(Object.keys(BG.TEAM_CASES).join(','))}&from=${Math.floor(from)}&to=${Math.ceil(now)}`, shape: isArr, detail: (d, b) => (b.meta?.total != null ? `${b.meta.total} việc trong 30 ngày` : '') },
    { id: 'joinLog', label: 'Nhật ký người vào', uses: 'tài khoản giống admin, đợt vào ồ ạt', path: `group/groups/${g.id}/activity-logs?limit=1&page=1&sort=desc&useCase=${encodeURIComponent(JOIN_CASES)}&from=${Math.floor(now - 864e5)}&to=${Math.ceil(now)}`, shape: isArr, detail: (d, b) => (b.meta?.total != null ? `${b.meta.total} người vào trong 24 giờ` : '') },
    { id: 'timeline', label: 'Bài mới đăng', uses: 'quét bài, thống kê', path: `content/timeline/${g.id}?limit=1`, shape: isList },
    { id: 'search', label: 'Tìm bài theo thời gian', uses: 'báo cáo tháng, thành viên mới, Tìm & dọn bài, dọn tài khoản', path: `content/contents?groupId=${g.id}&isIncludedInnerGroups=true&startTime=${iso(from)}&endTime=${iso(now)}&limit=1`, shape: (d) => isList(d) && d.meta?.total != null, detail: (d) => `${d.meta.total} bài trong 30 ngày` },
    { id: 'comments', label: 'Bình luận', uses: 'quét bình luận', after: true, path: (ctx) => (ctx.timeline?.list?.[0]?.id ? `content/comments?postId=${ctx.timeline.list[0].id}&limit=1` : null), why: 'group chưa có bài nào để thử', shape: isList },
    { id: 'approvals', label: 'Bài chờ duyệt', uses: 'duyệt bài', path: `content/manage/communities/${rootId}/approval-contents/count?approvalStatus=WAITING_APPROVAL`, need: !!g.isCommunity, why: 'chỉ đọc ở group gốc của community', shape: (d) => typeof d === 'number', detail: (d) => `${d} bài đang chờ` },
    { id: 'reports', label: 'Báo cáo của người dùng', uses: 'tab Báo cáo', path: `content/manage/communities/${rootId}/content-reports/count`, timeout: CHECK_TIMEOUT, need: !!(g.isCommunity && g.isCommunityAdmin), why: 'chỉ chủ / admin community xem được', shape: (d) => d != null, detail: (d) => (d?.total != null ? `${d.total} chờ xử lý` : '') },
    { id: 'flagged', label: 'Bài Beincom gắn cờ', uses: 'tab Báo cáo', path: `content/manage/groups/${g.id}/contents/flagged?limit=1`, shape: isList },
    { id: 'scheduled', label: 'Bài hẹn giờ', uses: 'Đăng bài, lịch nội dung', path: `content/manage/groups/${g.id}/contents/scheduled?limit=1&type=POST`, shape: isList },
    { id: 'tags', label: 'Tag', uses: 'đăng bài, quản lý tag', path: `content/tags?groupIds[]=${encodeURIComponent(rootId)}&offset=0`, shape: isList, detail: (d) => (d.meta?.total != null ? `${d.meta.total} tag` : '') },
    { id: 'tagPerm', label: 'Quyền quản lý tag', uses: 'quản lý tag', path: `group/me/permissions/can-cud-tags/community/${g.communityId}`, shape: (d) => typeof BG.tagPermission(d) === 'boolean', detail: (d) => (BG.tagPermission(d) ? 'được tạo / sửa / xoá tag' : 'chỉ xem') },
    { id: 'series', label: 'Series', uses: 'đăng bài', path: `content/series?groupIds[]=${encodeURIComponent(g.id)}&offset=0`, shape: isList },
    { id: 'categories', label: 'Chuyên mục Article', uses: 'Article', path: 'content/category?name=', shape: (d) => isList(d) || isArr(d) },
    { id: 'mention', label: 'Tìm người để nhắc tên', uses: 'nhắc tên @ khi đăng bài', path: `user/users/mentionable?group_ids=${g.id}`, version: '', shape: (d) => d != null },
    { id: 'pinned', label: 'Bài ghim', uses: 'ghim bài', path: `content/contents/pinned-content/groups/${g.id}`, shape: (d) => d != null },
    { id: 'settings', label: 'Cài đặt group', uses: 'bật / tắt cài đặt nhiều group', path: `group/groups/${g.id}/settings`, shape: (d) => !!d && typeof d === 'object' },
    { id: 'banned', label: 'Danh sách bị cấm', uses: 'gỡ cấm, cấm ở mọi community', path: `group/communities/${g.communityId}/banned-members?limit=1&offset=0`, need: !!g.canBan, why: 'chỉ chủ / admin community', shape: (d) => d != null },
    { id: 'officialStats', label: 'Thống kê chính thức', uses: 'Thống kê', path: `group/manage/communities/${g.communityId}/stats/member-count?from=${iso(from)}&to=${iso(now)}`, need: !!(g.isCommunity && g.isCommunityAdmin), why: 'chỉ chủ / admin community — addon tự tính từ nhật ký', shape: isArr },
    { id: 'telegram', label: 'Bot Telegram', uses: 'gửi thông báo về Telegram', telegram: true, need: telegramOn(tg), why: 'chưa bật gửi về Telegram' },
    { id: 'storage', label: 'Bộ nhớ của addon', uses: 'lưu kết quả quét, nhật ký, số liệu', local: true },
    ...chatProbes(g, settings),
  ];
}

// Chat Beincom (chỉ GET tới chat.beincom.com, JSON thường): mỗi phần của trang Chat / quét chat một mục. path tương đối
// với BG.CHAT_API; ctx.<id> là thân trả về của mục trước. Chưa bật chat: chỉ một dòng "bỏ qua".
function chatProbes(g, settings) {
  const login = { id: 'chat', label: 'Chat: đăng nhập', uses: 'mọi phần Chat', path: 'v4/users/me', shape: (d) => !!d?.id, detail: (d) => (d.username ? '@' + d.username : '') };
  const P = (x) => ({ chat: true, section: 'chat', ...x });
  if (!settings?.chatEnabled) return [P({ ...login, need: false, why: 'chưa bật Chat Beincom ở Cài đặt' })];
  const arr = Array.isArray;
  const mine = (t) => t?.props?.bic_group_team_id === g.communityId;
  const team = (ctx) => (arr(ctx.chatTeams) ? ctx.chatTeams.find(mine) || null : null);
  // Kênh để thử: kênh của chính group này, không có thì kênh có tin mới nhất của community
  const channel = (ctx) => {
    const t = team(ctx);
    const list = t && arr(ctx.chatChannels) ? ctx.chatChannels.filter((c) => c.team_id === t.id && !c.delete_at && (c.type === 'O' || c.type === 'P')) : [];
    return list.find((c) => c.props?.bic_group_id === g.id) || list.sort((a, b) => (b.last_post_at || 0) - (a.last_post_at || 0))[0] || null;
  };
  // Một vai trò của mình ở team của community (vd team_user / team_admin)
  const role = (ctx) => {
    const t = team(ctx);
    const m = t && arr(ctx.chatTeamRoles) ? ctx.chatTeamRoles.find((x) => x.team_id === t.id) : null;
    return String(m?.roles || '').split(/\s+/).filter(Boolean).pop() || '';
  };
  const post = (ctx) => (arr(ctx.chatPosts?.order) ? ctx.chatPosts.order[0] || '' : '');
  const noTeam = 'bạn không có trong chat của community này';
  const crt = 'skipFetchThreads=false&collapsedThreads=true&collapsedThreadsExtended=true';
  return [
    P(login),
    P({ id: 'chatTeams', label: 'Chat: cộng đồng', uses: 'trang Chat, quét kênh chat', path: 'v4/users/me/teams', shape: arr, detail: (d) => `${d.length} cộng đồng${d.some(mine) ? '' : ' — không có chat của community này'}` }),
    P({ id: 'chatChannels', label: 'Chat: danh sách kênh', uses: 'danh sách bên trái trang Chat', path: 'v4/users/me/channels', shape: arr, detail: (d) => `${d.filter((c) => !c.delete_at).length} kênh và tin nhắn riêng` }),
    P({ id: 'chatRead', label: 'Chat: số tin đã đọc', uses: 'số chưa đọc, tin nhắn riêng mới', path: 'v4/users/me/channel_members?page=0&per_page=1', shape: arr }),
    P({ id: 'chatUnread', label: 'Chat: nhắc tên, thread chưa đọc', uses: 'kiểm tra nhanh mỗi phút, số Thread', path: 'v5/users/me/teams/unread?include_collapsed_threads=true', shape: arr, detail: (d) => (d.some((t) => typeof t.thread_count === 'number') ? 'có đếm thread' : 'không đếm thread — số Thread để trống') }),
    P({ id: 'chatTeamRoles', label: 'Chat: vai trò của bạn', uses: 'quyền xoá tin, ghim, gửi tin', path: 'v4/users/me/teams/members', shape: arr }),
    P({ id: 'chatReports', label: 'Chat: tin nhắn bị báo cáo', uses: 'tab Báo cáo → Tin nhắn chat', path: `v4/communities/${g.communityId}/reports?per_page=1`, need: !!(g.isCommunity && g.isCommunityAdmin && g.communityId), why: 'chỉ chủ / admin community (chọn group gốc)', shape: (d) => arr(d?.reports) || arr(d?.data?.reports), detail: (d) => ((d.reports || d.data?.reports).length ? 'có tin đang chờ xử lý' : 'không có tin nào chờ') }),
    P({ id: 'chatPosts', label: 'Chat: tin trong kênh', uses: 'đọc tin, quét tin vi phạm', after: true, path: (ctx) => (channel(ctx) ? `v5/channels/${channel(ctx).id}/posts?page=0&per_page=1&${crt}` : null), why: noTeam, shape: (d) => arr(d?.order) && !!d.posts, detail: (d) => (d.order.length ? '' : 'kênh chưa có tin') }),
    P({ id: 'chatThread', label: 'Chat: bình luận (thread)', uses: 'khung bình luận', after: true, path: (ctx) => (post(ctx) ? `v5/posts/${post(ctx)}/thread?${crt}&direction=down&perPage=1` : null), why: 'kênh chưa có tin để thử', shape: (d) => arr(d?.order) }),
    P({ id: 'chatReactions', label: 'Chat: biểu cảm', uses: 'xem ai đã thả biểu cảm', after: true, path: (ctx) => (post(ctx) ? `v4/posts/${post(ctx)}/reactions` : null), why: 'kênh chưa có tin để thử', shape: arr }),
    P({ id: 'chatPinned', label: 'Chat: tin đã ghim', uses: 'khung Tin nhắn đã ghim', after: true, path: (ctx) => (channel(ctx) ? `v4/channels/${channel(ctx).id}/pinned` : null), why: noTeam, shape: (d) => arr(d?.order), detail: (d) => `${d.order.length} tin đã ghim` }),
    P({ id: 'chatMention', label: 'Chat: gợi ý @tên', uses: 'gõ @ trong ô chat', after: true, path: (ctx) => (channel(ctx) ? `v4/users/autocomplete?in_team=${channel(ctx).team_id}&in_channel=${channel(ctx).id}&name=a&limit=1` : null), why: noTeam, shape: (d) => arr(d?.users) }),
    P({ id: 'chatRoles', label: 'Chat: quyền theo vai trò', uses: 'nút Xoá tin, Ghim, gửi tin', after: true, path: (ctx) => (role(ctx) ? `v4/roles/name/${encodeURIComponent(role(ctx))}` : null), why: noTeam, shape: (d) => arr(d?.permissions), detail: (d) => (d.permissions.includes('delete_others_posts') ? 'vai trò này xoá được tin người khác' : '') }),
    P({ id: 'chatThreads', label: 'Chat: thread đang theo dõi', uses: 'trang Thread, báo bình luận mới', after: true, path: (ctx) => (team(ctx) ? `v4/users/me/teams/${team(ctx).id}/threads?per_page=1&extended=true` : null), why: noTeam, shape: (d) => arr(d?.threads), detail: (d) => (d.total != null ? `${d.total} thread` : '') }),
  ];
}

// Dung lượng addon đang dùng trong trình duyệt (không gọi Beincom)
async function storageUsage() {
  const all = await chrome.storage.local.get(null);
  const sizes = BG.storageSizes(all);
  const bytes = typeof chrome.storage.local.getBytesInUse === 'function' ? await chrome.storage.local.getBytesInUse(null) : sizes.reduce((s, x) => s + x.bytes, 0);
  const unlimited = (chrome.runtime.getManifest?.().permissions || []).includes('unlimitedStorage');
  return { bytes, unlimited, sizes };
}

// Kết luận một lần gọi
function checkVerdict(r, probe) {
  if (r.status === 401) return { status: 'login', detail: 'Hết phiên đăng nhập' };
  if (BG.isOk(r)) {
    const d = r.body.data;
    let shapeOk = false;
    try {
      shapeOk = probe.shape ? !!probe.shape(d) : true;
    } catch {}
    if (!shapeOk) return { status: 'fail', detail: 'Beincom trả dữ liệu khác trước — có thể đã đổi API' };
    let detail = '';
    try {
      detail = probe.detail ? probe.detail(d, r.body) || '' : '';
    } catch {}
    return { status: 'ok', detail };
  }
  // 403, hoặc mã "không phải admin" (vd. content-reports trả 400 community.not_admin với admin group — gọi thật 11/10)
  if (r.status === 403 || /forbidden|not_admin/.test(r.body?.code || '')) return { status: 'skip', detail: 'Tài khoản không có quyền với mục này' };
  if (r.status === 404 && !BG.isContentGone(r)) return { status: 'fail', detail: 'Không thấy API (404) — Beincom có thể đã đổi đường dẫn' };
  if (r.status === 0) return { status: 'fail', detail: r.timeout ? `Beincom không trả lời trong ${CHECK_TIMEOUT / 1000} giây` : 'Không kết nối được' };
  return { status: 'fail', detail: BG.errMsg(r) };
}

// Chạy mọi mục kiểm tra cho group g; trả kết quả (không lưu)
async function runSelfCheck(g) {
  const { state } = await load();
  const root = (state.snapshot?.groups || []).find((x) => x.communityId === g.communityId && x.isCommunity) || null;
  const tg = await loadTelegram();
  const now = Date.now();
  const { settings } = await load();
  const probes = selfCheckProbes(g, { root, now, tg, settings });
  const r = await withClient(async (client) => {
    const ctx = {};
    const results = new Map();
    const run = async (p) => ({ ...(await run1(p)), ...(p.section ? { section: p.section } : {}) });
    const run1 = async (p) => {
      const t0 = Date.now();
      if (p.need === false) return { id: p.id, label: p.label, uses: p.uses, status: 'skip', detail: p.why, ms: 0 };
      // Chưa đọc được tài khoản chat: các mục chat khác bỏ qua, không gọi
      if (p.chat && p.id !== 'chat' && results.get('chat')?.status !== 'ok') return { id: p.id, label: p.label, uses: p.uses, status: 'skip', detail: 'chưa đọc được chat (xem mục Chat: đăng nhập)', ms: 0 };
      if (p.local) return { id: p.id, label: p.label, uses: p.uses, ...BG.storageVerdict(await storageUsage()), ms: Date.now() - t0 };
      if (p.telegram) {
        const t = await tgApi(tg.token, 'getMe');
        return { id: p.id, label: p.label, uses: p.uses, ...(t.ok ? { status: 'ok', detail: t.body?.result?.username ? '@' + t.body.result.username : '' } : { status: 'fail', detail: tgError(t) }), ms: Date.now() - t0 };
      }
      const path = typeof p.path === 'function' ? p.path(ctx) : p.path;
      if (!path) return { id: p.id, label: p.label, uses: p.uses, status: 'skip', detail: p.why, ms: 0 };
      // Chat Beincom: trả JSON thường (không có code api.ok)
      if (p.chat) {
        const res = await client.call('GET', BG.CHAT_API + path, null, '', CHECK_TIMEOUT, { quiet: true });
        let good = false;
        try {
          good = BG.chatOk(res) && !!p.shape(res.body);
        } catch {}
        if (good) ctx[p.id] = res.body;
        let detail = '';
        try {
          detail = good ? (p.detail ? p.detail(res.body) || '' : '') : res.status === 401 ? 'Chat chưa nhận phiên đăng nhập — mở chat trên web một lần rồi thử lại' : BG.chatOk(res) ? 'Chat trả dữ liệu khác trước — có thể đã đổi API' : res.status === 404 ? 'Không thấy API (404) — có thể đã đổi đường dẫn' : res.status === 403 ? 'Tài khoản không có quyền với mục này' : BG.errMsg(res);
        } catch {}
        return { id: p.id, label: p.label, uses: p.uses, path: 'chat:' + path.split('?')[0], status: good ? 'ok' : res.status === 403 ? 'skip' : 'fail', detail, httpStatus: res.status, ms: Date.now() - t0 };
      }
      const res = await client.call('GET', path, null, p.version ?? '2.0.0', p.timeout || CHECK_TIMEOUT, { quiet: true });
      if (BG.isOk(res)) ctx[p.id] = res.body.data;
      return { id: p.id, label: p.label, uses: p.uses, path: path.split('?')[0], ...checkVerdict(res, p), httpStatus: res.status, ms: Date.now() - t0 };
    };
    // Ba lượt: (0) Beincom + tài khoản chat, song song; (1) các mục chat khác, song song; (2) mục cần kết quả mục trước, lần lượt
    const stage = (p) => (p.after ? 2 : p.chat && p.id !== 'chat' ? 1 : 0);
    for (const s of [0, 1]) {
      const list = probes.filter((p) => stage(p) === s);
      (await mapLimit(list, PARALLEL, run)).forEach((x, i) => results.set(list[i].id, x));
    }
    for (const p of probes.filter((x) => stage(x) === 2)) results.set(p.id, await run(p));
    const items = probes.map((p) => results.get(p.id));
    if (items.some((x) => x.status === 'login')) return { ...NEED_LOGIN };
    return { status: 'ok', items };
  });
  if (r.status !== 'ok') return r;
  const result = {
    status: 'ok',
    at: now,
    group: { id: g.id, name: g.name, isCommunity: !!g.isCommunity },
    mode: r.mode || '',
    items: r.items,
    summary: { ok: r.items.filter((x) => x.status === 'ok').length, skip: r.items.filter((x) => x.status === 'skip').length, fail: r.items.filter((x) => x.status === 'fail').length },
  };
  return result;
}

async function doSelfCheck({ groupId }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  const result = await runSelfCheck(g);
  if (result.status === 'ok') await chrome.storage.local.set({ selfCheck: result });
  return result;
}

// ---------- Tự kiểm tra mỗi ngày ----------
// Lần quét tự động đầu tiên mỗi ngày (cài đặt selfCheckDaily, mặc định bật): kiểm tra mọi community mình quản trị (tối đa 5),
// so với lần trước ở khoá `selfCheckAuto`; chỉ báo khi một mục hôm trước dùng được nay lỗi (thường là Beincom vừa thay đổi).
const DAILY_CHECK_MAX = 5;

async function dailySelfCheck({ now = Date.now(), notifyAllowed = true } = {}) {
  const { state } = await load();
  const roots = (state.snapshot?.groups || []).filter((g) => g.isCommunity && !g.error).slice(0, DAILY_CHECK_MAX);
  if (!roots.length) return { status: 'ok', regressions: [] };
  const { selfCheckAuto: prev } = await chrome.storage.local.get('selfCheckAuto');
  const groups = {};
  const regressions = [];
  let shown = null;
  for (const g of roots) {
    const r = await runSelfCheck(g);
    if (r.status === 'need_login') return r;
    if (r.status !== 'ok') continue;
    groups[g.id] = { name: g.name, at: r.at, summary: r.summary, items: r.items.map(({ id, label, status, detail }) => ({ id, label, status, detail })) };
    const broke = BG.selfCheckRegressions(prev?.groups?.[g.id]?.items, r.items);
    if (broke.length) {
      regressions.push({ groupId: g.id, group: g.name, items: broke.map((x) => x.label) });
      shown ||= r;
    }
  }
  // Có mục ngừng chạy: hiện luôn kết quả đó ở thẻ Tự kiểm tra
  await chrome.storage.local.set({ selfCheckAuto: { at: now, groups, regressions }, ...(shown ? { selfCheck: shown } : {}) });
  if (regressions.length && notifyAllowed) {
    const n = regressions.reduce((s, x) => s + x.items.length, 0);
    notify('bg-selfcheck', `BeinGroup: ${n} tính năng ngừng chạy`, regressions.map((x) => `${x.group}: ${x.items.join(', ')}`).join(' · ') + '. Có thể Beincom vừa thay đổi — bấm để xem Tự kiểm tra.');
  }
  return { status: 'ok', regressions };
}
