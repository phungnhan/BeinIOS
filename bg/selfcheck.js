// Service worker — Tự kiểm tra: gọi thử (chỉ GET) các API đọc mà từng tính năng dùng, với một community / group,
// rồi báo từng mục: dùng được, bỏ qua (tài khoản không có quyền / chưa bật) hay lỗi (Beincom đổi API, không kết nối…).
// Không ghi vào Lỗi kỹ thuật (gọi với quiet) — kết quả lưu ở khoá `selfCheck` để xem lại / sao chép.

const CHECK_TIMEOUT = 15000;
const isList = (d) => Array.isArray(d?.list);
const isArr = (d) => Array.isArray(d);

// Các mục kiểm tra cho group g. need = false: bỏ qua, ghi lý do (why). path có thể là hàm của kết quả mục trước (ctx).
function selfCheckProbes(g, { root, now, tg }) {
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
    { id: 'timeline', label: 'Bài mới đăng', uses: 'quét bài, thống kê', path: `content/timeline/${g.id}?limit=1`, shape: isList },
    { id: 'search', label: 'Tìm bài theo thời gian', uses: 'báo cáo tháng, thành viên mới', path: `content/contents?groupId=${g.id}&isIncludedInnerGroups=true&startTime=${iso(from)}&endTime=${iso(now)}&limit=1`, shape: (d) => isList(d) && d.meta?.total != null, detail: (d) => `${d.meta.total} bài trong 30 ngày` },
    { id: 'comments', label: 'Bình luận', uses: 'quét bình luận', after: 'timeline', path: (ctx) => (ctx.timeline?.list?.[0]?.id ? `content/comments?postId=${ctx.timeline.list[0].id}&limit=1` : null), why: 'group chưa có bài nào để thử', shape: isList },
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
  ];
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

async function doSelfCheck({ groupId }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  const { state } = await load();
  const root = (state.snapshot?.groups || []).find((x) => x.communityId === g.communityId && x.isCommunity) || null;
  const tg = await loadTelegram();
  const now = Date.now();
  const probes = selfCheckProbes(g, { root, now, tg });
  const r = await withClient(async (client) => {
    const ctx = {};
    const run = async (p) => {
      const t0 = Date.now();
      if (p.need === false) return { id: p.id, label: p.label, uses: p.uses, status: 'skip', detail: p.why, ms: 0 };
      if (p.telegram) {
        const t = await tgApi(tg.token, 'getMe');
        return { id: p.id, label: p.label, uses: p.uses, ...(t.ok ? { status: 'ok', detail: t.body?.result?.username ? '@' + t.body.result.username : '' } : { status: 'fail', detail: tgError(t) }), ms: Date.now() - t0 };
      }
      const path = typeof p.path === 'function' ? p.path(ctx) : p.path;
      if (!path) return { id: p.id, label: p.label, uses: p.uses, status: 'skip', detail: p.why, ms: 0 };
      const res = await client.call('GET', path, null, p.version ?? '2.0.0', p.timeout || CHECK_TIMEOUT, { quiet: true });
      if (BG.isOk(res)) ctx[p.id] = res.body.data;
      return { id: p.id, label: p.label, uses: p.uses, path: path.split('?')[0], ...checkVerdict(res, p), httpStatus: res.status, ms: Date.now() - t0 };
    };
    const first = probes.filter((p) => !p.after);
    const items = await mapLimit(first, PARALLEL, run);
    for (const p of probes.filter((x) => x.after)) items.splice(probes.indexOf(p), 0, await run(p));
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
  await chrome.storage.local.set({ selfCheck: result });
  return result;
}
