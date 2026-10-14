// BeinFusion — báo cáo và thống kê: tóm tắt tuần, thống kê, hiệu quả bài, thành viên mới có ở lại không, báo cáo tháng.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { vnDay, evaluatePostIn, VIOLATION_TYPES, bestTimes, slimPerson } = BG;

  // ---------- Báo cáo tuần ----------
  // Đếm thao tác trong nhật ký addon theo loại (trong khoảng inRange; scope = Set id group cần tính, null = mọi group)
  function countLogActions(log, inRange, scope = null) {
    const a = { approved: 0, autoApproved: 0, declined: 0, autoDeclined: 0, removed: 0, banned: 0, unbanned: 0, postsApproved: 0, postsRejected: 0, postsHidden: 0, postsDeleted: 0, commentsHidden: 0, reportsHandled: 0, published: 0, scheduled: 0, groupSettings: 0, errors: 0 };
    for (const e of log || []) {
      if (!inRange(e.time)) continue;
      if (scope && !scope.has(e.groupId)) continue;
      if (e.status === 'error') {
        a.errors++;
        continue;
      }
      if (e.status !== 'ok') continue;
      const auto = e.source === 'auto';
      const k = e.kind || 'member';
      if (k === 'member' && e.action === 'approve') auto ? a.autoApproved++ : a.approved++;
      else if (k === 'member' && e.action === 'decline') auto ? a.autoDeclined++ : a.declined++;
      else if (k === 'manage' && e.action === 'remove') a.removed++;
      else if (k === 'manage' && e.action === 'ban') a.banned++;
      else if (k === 'manage' && e.action === 'unban') a.unbanned++;
      else if (k === 'post' && e.action === 'approve') a.postsApproved++;
      else if (k === 'post' && e.action === 'reject') a.postsRejected++;
      else if (k === 'post' && e.action === 'hide') a.postsHidden++;
      else if (k === 'post' && e.action === 'delete') a.postsDeleted++;
      else if (k === 'comment' && e.action === 'hide') a.commentsHidden++;
      else if (k === 'report') a.reportsHandled++;
      else if (k === 'compose' && e.action === 'publish') a.published++;
      else if (k === 'compose' && e.action === 'schedule') a.scheduled++;
      else if (k === 'groupSetting') a.groupSettings++;
    }
    return a;
  }

  // Tổng hợp những gì đã xảy ra trong `days` ngày gần nhất từ dữ liệu addon đang giữ:
  // nhật ký thao tác (log), số thành viên mỗi ngày (memberHistory), hồ sơ vi phạm, bài / bình luận vi phạm đã phát hiện.
  // Mặc định `days` ngày tới `now`; truyền `from` để tính một khoảng khác (vd. cả tháng trước: from = đầu tháng, now = cuối tháng)
  function weeklyReport({ log = [], profiles = null, recentPosts = [], recentComments = [], memberHistory = {}, groups = [], ctx = {} } = {}, { days = 7, now = Date.now(), from = now - days * 864e5 } = {}) {
    const inRange = (t) => {
      const v = typeof t === 'number' ? t : Date.parse(t);
      return Number.isFinite(v) && v >= from && v <= now;
    };
    const fromDay = vnDay(from);
    const toDay = vnDay(now);

    // Thành viên: số đầu kỳ (ngày gần nhất trước hoặc bằng đầu kỳ, không có thì ngày đầu tiên trong kỳ) và số mới nhất
    const members = [];
    for (const g of groups) {
      const hist = (memberHistory[g.id] || []).filter((x) => x.day <= toDay).sort((a, b) => a.day.localeCompare(b.day));
      if (!hist.length) continue;
      const before = hist.filter((x) => x.day <= fromDay).at(-1) || hist.find((x) => x.day > fromDay);
      const last = hist.at(-1);
      const end = g.userCount ?? last.count;
      members.push({ id: g.id, name: g.name, start: before.count, end, change: end - before.count, since: before.day });
    }

    const a = countLogActions(log, inRange);

    const isBad = (x) => inRange(x.firstSeen ?? x.publishedAt ?? x.createdAt) && evaluatePostIn(x, ctx).verdict === 'bad';
    const detected = { posts: (recentPosts || []).filter(isBad).length, comments: (recentComments || []).filter(isBad).length };

    // Người có nhiều sự kiện vi phạm nhất trong kỳ
    const violators = Object.values(profiles?.users || {})
      .map((p) => {
        const evs = (p.events || []).filter((e) => inRange(e.time));
        return { user: p.user, count: evs.length, types: [...new Set(evs.map((e) => VIOLATION_TYPES[e.type]?.label || e.type))] };
      })
      .filter((x) => x.count)
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    return { from, to: now, days, fromDay, toDay, members, actions: a, detected, violators };
  }

  const viNum = (n) => Number(n || 0).toLocaleString('vi-VN');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + viNum(Math.abs(n));
  const dm = (day) => day.slice(8, 10) + '/' + day.slice(5, 7);

  // Bản chữ để sao chép / gửi cho các admin khác. Dòng nào toàn số 0 thì bỏ.
  function reportText(r) {
    const a = r.actions;
    const lines = [`BeinFusion: tóm tắt ${r.days} ngày (${dm(r.fromDay)} → ${dm(r.toDay)}/${r.toDay.slice(0, 4)})`];
    const add = (label, parts) => {
      const shown = parts.filter(([n]) => n);
      if (shown.length) lines.push(`• ${label}: ${shown.map(([n, t]) => `${viNum(n)} ${t}`).join(' · ')}`);
    };
    if (r.members.length) {
      const changed = r.members.filter((m) => m.change).sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
      const same = r.members.length - changed.length;
      const parts = changed.map((m) => `${m.name} ${signed(m.change)} (${viNum(m.end)})`);
      if (same) parts.push(changed.length ? `${same} group không đổi` : 'không group nào thay đổi');
      lines.push('• Thành viên: ' + parts.join(' · '));
    }
    add('Duyệt thành viên', [[a.approved + a.autoApproved, 'duyệt' + (a.autoApproved ? ` (${viNum(a.autoApproved)} tự động)` : '')], [a.declined + a.autoDeclined, 'từ chối' + (a.autoDeclined ? ` (${viNum(a.autoDeclined)} tự động)` : '')]]);
    add('Quản lý thành viên', [[a.removed, 'xoá'], [a.banned, 'cấm'], [a.unbanned, 'gỡ cấm']]);
    add('Kiểm duyệt bài', [[a.postsApproved, 'duyệt'], [a.postsRejected, 'từ chối'], [a.postsHidden, 'ẩn'], [a.postsDeleted, 'xoá']]);
    add('Bình luận', [[a.commentsHidden, 'ẩn']]);
    add('Báo cáo vi phạm', [[a.reportsHandled, 'đã xử lý']]);
    add('Phát hiện vi phạm quy tắc', [[r.detected.posts, 'bài'], [r.detected.comments, 'bình luận']]);
    add('Đăng bài qua addon', [[a.published, 'đăng'], [a.scheduled, 'hẹn giờ']]);
    add('Cài đặt group', [[a.groupSettings, 'lần đổi']]);
    if (r.violators.length) lines.push('• Vi phạm nhiều nhất: ' + r.violators.map((v) => `${v.user.fullname || v.user.username || '?'}${v.user.username ? ' (@' + v.user.username + ')' : ''} ${v.count} lần`).join(', '));
    add('Thao tác lỗi', [[a.errors, 'lần']]);
    if (lines.length === 1) lines.push('• Không có hoạt động nào được ghi lại.');
    return lines.join('\n');
  }

  // Có cần thông báo tóm tắt tuần không: sáng thứ Hai (giờ VN, từ 8 giờ), mỗi tuần một lần. lastKey = ngày thứ Hai đã báo
  function weeklyDue(lastKey, now = Date.now()) {
    const vn = new Date(now + 7 * 3600e3);
    if (vn.getUTCDay() !== 1 || vn.getUTCHours() < 8) return null;
    const key = vnDay(now);
    return key === lastKey ? null : key;
  }

  // ---------- Hiệu quả bài đã đăng qua addon ----------
  // Bài / Article đăng hoặc hẹn giờ qua addon được ghi vào khoá `postStats`; addon đọc lại số liệu sau 24 giờ và 7 ngày
  // (GET content/contents/{id}: totalUsersSeen, reactionsCount, commentsCount). Điểm = cảm xúc + 2 × bình luận (như Giờ tốt nhất).
  const STATS_KEEP = 300;
  const STATS_SLOTS = { d1: 24 * 3600e3, d7: 7 * 864e5 };

  function statMetrics(d) {
    return {
      views: Number.isFinite(Number(d?.totalUsersSeen)) ? Number(d.totalUsersSeen) : null,
      reactions: Object.values(d?.reactionsCount || {}).reduce((s, n) => s + (Number(n) || 0), 0),
      comments: Number(d?.commentsCount) || 0,
    };
  }
  const statScore = (m) => (m ? m.reactions + 2 * m.comments : null);

  // Mốc cần đo: bài đã tới giờ đăng (publishedAt, hoặc giờ hẹn), chưa có số liệu mốc đó. Mỗi bài một mốc mỗi lần.
  function statsDue(map, now = Date.now(), max = 8) {
    const out = [];
    for (const e of Object.values(map || {})) {
      if (e.gone) continue;
      const ref = Date.parse(e.publishedAt || e.publishAt);
      if (!Number.isFinite(ref)) continue;
      const slot = !e.d1 && now >= ref + STATS_SLOTS.d1 ? 'd1' : !e.d7 && now >= ref + STATS_SLOTS.d7 ? 'd7' : null;
      if (slot) out.push({ id: e.id, slot, ref });
    }
    return out.sort((a, b) => a.ref - b.ref).slice(0, max);
  }

  // Giữ 300 bài theo dõi mới nhất
  function pruneStats(map) {
    return Object.fromEntries(
      Object.entries(map || {})
        .sort(([, a], [, b]) => (b.at || 0) - (a.at || 0))
        .slice(0, STATS_KEEP),
    );
  }

  // Tổng hợp: trung bình sau 7 ngày (hoặc 24 giờ nếu chưa đủ 7 ngày), và khung giờ hiệu quả theo chính bài của mình
  function insightsSummary(map) {
    const list = Object.values(map || {}).filter((e) => !e.gone);
    const best = (e) => e.d7 || e.d1 || e.cur || null;
    const measured = list.filter((e) => best(e) && e.publishedAt);
    const avg = (k, arr) => (arr.length ? arr.reduce((s, e) => s + (best(e)[k] || 0), 0) / arr.length : 0);
    const withViews = measured.filter((e) => best(e).views != null);
    return {
      tracked: list.length,
      measured: measured.length,
      avg: { reactions: avg('reactions', measured), comments: avg('comments', measured), views: withViews.length ? avg('views', withViews) : null },
      times: measured.length >= 3 ? bestTimes(measured.map((e) => ({ publishedAt: e.publishedAt, reactions: best(e).reactions, commentsCount: best(e).comments }))) : null,
    };
  }

  // ---------- Thành viên mới có ở lại không ----------
  // Từ nhật ký thành viên của group (GET …/activity-logs?objectType=MEMBER&from&to): ai vào trong [from, to), sau đó còn ở lại,
  // tự rời, bị xoá hay bị cấm (vào lại sau khi rời = còn ở lại). Bài sau khi vào do service worker tìm theo người đăng;
  // bình luận lấy từ các bình luận addon đã đọc khi quét (không đầy đủ).
  const VN_OFFSET = 7 * 3600e3;
  const OUT_STATUS = { 'leave.group': 'left', 'remove.member': 'removed', 'ban.member': 'banned' };
  const COHORT_STATUS = { stay: 'Còn ở lại', left: 'Tự rời', removed: 'Bị xoá', banned: 'Bị cấm' };

  // Lượt vào / rời gọn theo thời gian: bỏ "vào" khi người đó đang ở trong (vd. được duyệt + vào group cùng lúc), bỏ "rời" khi đã ra
  function memberMoves(events) {
    const sorted = (events || [])
      .filter((a) => a?.user?.id && (a.kind === 'in' || a.kind === 'out') && Number.isFinite(Date.parse(a.time)))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const inside = new Map();
    const out = [];
    for (const a of sorted) {
      const was = inside.get(a.user.id);
      if (a.kind === 'in' ? was === true : was === false) continue;
      inside.set(a.user.id, a.kind === 'in');
      out.push(a);
    }
    return out;
  }

  // Người vào trong [from, to) (lần vào đầu tiên trong khoảng) và tình trạng hiện tại, mới vào trước
  function memberCohort(events, { from, to }) {
    const map = new Map();
    for (const a of memberMoves(events)) {
      const t = Date.parse(a.time);
      const cur = map.get(a.user.id);
      if (a.kind === 'in') {
        if (cur) Object.assign(cur, { status: 'stay', outAt: null, rejoined: true });
        else if (t >= from && t < to) map.set(a.user.id, { user: a.user, joinedAt: a.time, status: 'stay', outAt: null, rejoined: false });
      } else if (cur) Object.assign(cur, { status: OUT_STATUS[a.useCase] || 'left', outAt: a.time });
    }
    return [...map.values()].sort((x, y) => Date.parse(y.joinedAt) - Date.parse(x.joinedAt));
  }

  // Hoạt động của từng người mới sau khi vào: posts = { userId: [publishedAt…] } (service worker tìm), comments = bình luận addon đã đọc
  function cohortActivity(cohort, { posts = {}, comments = [] } = {}) {
    const byActor = new Map();
    for (const c of comments || []) if (c?.actor?.id) byActor.set(c.actor.id, [...(byActor.get(c.actor.id) || []), c.createdAt]);
    const out = {};
    for (const m of cohort || []) {
      const since = Date.parse(m.joinedAt);
      const after = (list) => (list || []).filter((t) => Date.parse(t) >= since).length;
      out[m.user.id] = { posts: after(posts?.[m.user.id]), comments: after(byActor.get(m.user.id)) };
    }
    return out;
  }

  // Thứ Hai đầu tuần (giờ VN) của thời điểm t, dạng YYYY-MM-DD
  function vnWeekStart(t) {
    const d = new Date(t + VN_OFFSET);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
  }

  const cohortActive = (x) => !!x && (x.posts > 0 || x.comments > 0);

  // Tóm tắt nhóm người mới: còn ở lại, ở lại qua 7 / 30 ngày đầu (chỉ tính người đã vào đủ lâu), có hoạt động, theo tuần vào
  function cohortSummary(cohort, activity = {}, now = Date.now()) {
    const list = cohort || [];
    const act = (m) => activity[m.user.id];
    const by = (st) => list.filter((m) => m.status === st).length;
    const keptFor = (days) => {
      const base = list.filter((m) => now - Date.parse(m.joinedAt) >= days * 864e5);
      const kept = base.filter((m) => !m.outAt || Date.parse(m.outAt) - Date.parse(m.joinedAt) >= days * 864e5);
      return { base: base.length, kept: kept.length };
    };
    const leaveDays = list
      .filter((m) => m.outAt)
      .map((m) => (Date.parse(m.outAt) - Date.parse(m.joinedAt)) / 864e5)
      .sort((a, b) => a - b);
    const weeks = new Map();
    for (const m of list) {
      const w = vnWeekStart(Date.parse(m.joinedAt));
      const x = weeks.get(w) || { week: w, joined: 0, stayed: 0, active: 0 };
      x.joined++;
      if (m.status === 'stay') x.stayed++;
      if (cohortActive(act(m))) x.active++;
      weeks.set(w, x);
    }
    return {
      joined: list.length,
      stayed: by('stay'),
      left: by('left'),
      removed: by('removed'),
      banned: by('banned'),
      d7: keptFor(7),
      d30: keptFor(30),
      posted: list.filter((m) => act(m)?.posts > 0).length,
      commented: list.filter((m) => act(m)?.comments > 0).length,
      active: list.filter((m) => cohortActive(act(m))).length,
      silent: list.filter((m) => m.status === 'stay' && !cohortActive(act(m))).length,
      quickLeave: leaveDays.filter((d) => d < 1).length,
      medianLeaveDays: leaveDays.length ? leaveDays[Math.floor((leaveDays.length - 1) / 2)] : null,
      weeks: [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)),
    };
  }

  const pct = (k, n) => (n ? Math.round((k / n) * 100) + '%' : '–');

  function cohortStatusText(m) {
    if (m.status === 'stay') return m.rejoined ? 'Còn ở lại (đã rời rồi vào lại)' : 'Còn ở lại';
    const d = (Date.parse(m.outAt) - Date.parse(m.joinedAt)) / 864e5;
    return `${COHORT_STATUS[m.status] || 'Đã rời'} ${d < 1 ? 'trong ngày đầu' : `sau ${Math.round(d)} ngày`}`;
  }

  // Bài nhắc những người mới chưa thấy hoạt động (thay {so_nguoi}, {group}, {danh_sach} như bài chào)
  const DEFAULT_NUDGE = 'Chào {danh_sach} 👋\n\nCác bạn vào {group} được một thời gian rồi — giới thiệu đôi chút về mình, hoặc hỏi bất cứ điều gì ở đây nhé. Cả nhà luôn sẵn lòng!';

  // ---------- Nhắc người mới chưa hoạt động ----------
  // Lần nhắc (khoá `nudges`, mới nhất trước): { id (id bài), groupId, groupName, at (giờ đăng / giờ hẹn), userIds }
  const NUDGE_KEEP = 50;
  const NUDGE_MAX_USERS = 50; // giới hạn nhắc tên của bài chào
  const NUDGE_COOLDOWN_DAYS = 30;
  const NUDGE_MIN_DAYS = 3; // vào ít nhất 3 ngày mới nhắc (bài soạn tự động hằng tuần)

  // Lần nhắc gần nhất của từng người: Map userId -> thời điểm (ms)
  function nudgeIndex(nudges) {
    const out = new Map();
    for (const n of nudges || []) {
      const t = Date.parse(n.at);
      for (const id of n.userIds || []) if (Number.isFinite(t) && !(out.get(id) >= t)) out.set(id, t);
    }
    return out;
  }

  // Người nên nhắc: còn ở lại, chưa thấy hoạt động, có username, đã vào ít nhất minDays ngày, chưa được nhắc trong cooldownDays ngày; mới vào trước
  function nudgeCandidates(cohort, activity = {}, nudges = [], { now = Date.now(), minDays = NUDGE_MIN_DAYS, cooldownDays = NUDGE_COOLDOWN_DAYS, max = NUDGE_MAX_USERS } = {}) {
    const last = nudgeIndex(nudges);
    return (cohort || [])
      .filter((m) => m.status === 'stay' && m.user?.username && !cohortActive(activity[m.user.id]))
      .filter((m) => now - Date.parse(m.joinedAt) >= minDays * 864e5)
      .filter((m) => !(now - (last.get(m.user.id) ?? -Infinity) < cooldownDays * 864e5))
      .slice(0, max)
      .map((m) => m.user);
  }

  // Thêm một lần nhắc (thay lần trùng id), giữ NUDGE_KEEP lần gần nhất
  function addNudge(list, n) {
    return [n, ...(list || []).filter((x) => x.id !== n.id)].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, NUDGE_KEEP);
  }

  // Hiệu quả một lần nhắc: trong những người được nhắc, ai đăng bài / bình luận sau lúc nhắc, ai đã rời
  // posts = { userId: [publishedAt…] } (tìm từ lúc nhắc), comments = bình luận addon đã đọc, leftIds = người rời sau lúc nhắc
  function nudgeEffect(n, { posts = {}, comments = [], leftIds = [], now = Date.now() } = {}) {
    const at = Date.parse(n.at);
    const after = (t) => Date.parse(t) >= at;
    const ids = n.userIds || [];
    const posted = ids.filter((id) => (posts[id] || []).some(after));
    const commented = ids.filter((id) => (comments || []).some((c) => c.actor?.id === id && after(c.createdAt)));
    const active = new Set([...posted, ...commented]);
    const left = new Set(leftIds);
    return { id: n.id, groupId: n.groupId, groupName: n.groupName || '', at: n.at, total: ids.length, posted: posted.length, commented: commented.length, active: active.size, left: ids.filter((id) => left.has(id) && !active.has(id)).length, pending: at > now, days: Math.max(0, Math.floor((now - at) / 864e5)) };
  }

  // ---------- Bài thảo luận: giờ gợi ý, hiệu quả từng câu ----------
  // Giờ gợi ý: khung hiệu quả nhất theo bài của mình (Hiệu quả bài đã đăng, từ 3 bài), chưa đủ số liệu thì 20 giờ thứ Tư
  function promptSlot(postStats, now = Date.now()) {
    const top = insightsSummary(postStats).times?.top?.[0];
    return { at: BG.nextSlot(top ? top.day : 3, top ? top.hour : 20, now), basis: top ? 'own' : 'default', day: top ? top.day : 3, hour: top ? top.hour : 20 };
  }

  // Mỗi lần dùng câu hỏi kèm số liệu bài (sau 7 ngày, chưa đủ thì mốc gần nhất), điểm cao trước
  function promptPerformance(bank, postStats = {}) {
    const best = (e) => e?.d7 || e?.d1 || e?.cur || null;
    const rows = [];
    for (const p of bank?.items || [])
      for (const u of p.uses || []) {
        const e = postStats[u.postId];
        const m = best(e);
        rows.push({ promptId: p.id, text: p.text, postId: u.postId, groupId: u.groupId, groupName: e?.groupName || '', at: u.at, metrics: m, score: statScore(m), gone: !!e?.gone });
      }
    return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || String(b.at).localeCompare(String(a.at)));
  }

  // ---------- Báo cáo tháng ----------
  // Tháng tính theo giờ Việt Nam, khoá 'YYYY-MM'
  function monthKey(t = Date.now()) {
    const d = new Date(t + VN_OFFSET);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function shiftMonth(key, n) {
    const [y, m] = String(key).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  const monthLabel = (key) => `Tháng ${Number(String(key).slice(5, 7))}/${String(key).slice(0, 4)}`;

  // Mốc của tháng: from = 0 giờ ngày 1 (giờ VN), end = 0 giờ ngày 1 tháng sau, to = min(end, now) (tháng đang chạy tính tới hiện tại)
  function monthRange(key, now = Date.now()) {
    const [y, m] = String(key).split('-').map(Number);
    const from = Date.UTC(y, m - 1, 1) - VN_OFFSET;
    const end = Date.UTC(y, m, 1) - VN_OFFSET;
    return { key, label: monthLabel(key), from, end, to: Math.min(end, now), partial: now < end, days: Math.round((end - from) / 864e5) };
  }

  // Các tháng chọn được: tháng này (tới hôm nay) và `back` tháng trước, mới nhất trước
  function monthOptions(now = Date.now(), back = 2) {
    const cur = monthKey(now);
    return Array.from({ length: back + 1 }, (_, i) => {
      const key = shiftMonth(cur, -i);
      return { key, label: monthLabel(key) + (i === 0 ? ' (tới hôm nay)' : '') };
    });
  }

  // Nhắc báo cáo tháng trước: 7 ngày đầu tháng (ngày 1 từ 8 giờ sáng, giờ VN), mỗi tháng một lần. Trả về tháng cần báo hoặc null
  function monthlyDue(lastKey, now = Date.now()) {
    const vn = new Date(now + VN_OFFSET);
    if (vn.getUTCDate() > 7 || (vn.getUTCDate() === 1 && vn.getUTCHours() < 8)) return null;
    const key = shiftMonth(monthKey(now), -1);
    return key === lastKey ? null : key;
  }

  // Số thành viên tại thời điểm t: số hiện tại trừ lượt vào, cộng lượt rời từ t tới nay (cần nhật ký đầy đủ từ t)
  function membersAt(current, moves, t) {
    if (current == null || !Number.isFinite(Number(current))) return null;
    let n = Number(current);
    for (const a of moves || []) if (Date.parse(a.time) >= t) n += a.kind === 'in' ? -1 : 1;
    return n;
  }

  // Báo cáo tháng. raw = kết quả doMonthly (service worker đọc từ Beincom); phần còn lại là dữ liệu addon:
  // nhật ký thao tác, hồ sơ vi phạm, bình luận đã đọc, hiệu quả bài đăng qua addon; scopeIds / scopeNames = các group thuộc phạm vi báo cáo.
  // ---------- Đội admin ----------
  // Việc của admin ghi trong nhật ký hoạt động của Beincom (cả việc làm thẳng trên web, không qua addon).
  // Đọc: GET group/groups/{id}/activity-logs?useCase=<các loại, cách nhau dấu phẩy>&from=<ms>&to=<ms> (gọi thật 13/10/2026:
  // dấu phẩy lọc được nhiều loại một lần; useCase[]= hay lặp lại useCase thì bị bỏ qua). Duyệt / ẩn bài không có trong nhật ký này.
  const TEAM_CASES = {
    'approve.join_request': ['approved', 'Duyệt vào'],
    'decline.join_request': ['declined', 'Từ chối vào'],
    'remove.member': ['removed', 'Xoá thành viên'],
    'ban.member': ['banned', 'Cấm'],
    'unban.member': ['unbanned', 'Gỡ cấm'],
    'assign.group_admin': ['roles', 'Gán admin group'],
    'revoke.group_admin': ['roles', 'Gỡ admin group'],
    'assign.community_admin': ['roles', 'Gán admin community'],
    'revoke.community_admin': ['roles', 'Gỡ admin community'],
    'update.group.settings': ['settings', 'Đổi cài đặt'],
    'update.group.profile': ['settings', 'Đổi thông tin group'],
    'create.group.membership_question': ['settings', 'Thêm câu hỏi tham gia'],
    'update.group.membership_question': ['settings', 'Sửa câu hỏi tham gia'],
    'delete.group.membership_question': ['settings', 'Xoá câu hỏi tham gia'],
    'create.group.terms': ['settings', 'Thêm nội quy'],
    'update.group.terms': ['settings', 'Sửa nội quy'],
    'delete.group.terms': ['settings', 'Xoá nội quy'],
  };
  const TEAM_COLS = { approved: 'Duyệt vào', declined: 'Từ chối', removed: 'Xoá', banned: 'Cấm', unbanned: 'Gỡ cấm', roles: 'Gán / gỡ admin', settings: 'Đổi cài đặt' };
  const TEAM_FIELDS = {
    isJoinApproval: 'Duyệt thành viên',
    isActiveMembershipQuestions: 'Câu hỏi tham gia',
    isInvitedOnly: 'Chỉ vào qua lời mời',
    isHiddenMembers: 'Ẩn danh sách thành viên',
    contentApproval: 'Duyệt bài',
    privacy: 'Quyền riêng tư',
    name: 'Tên',
    description: 'Mô tả',
    backgroundImgUrl: 'Ảnh bìa',
    icon: 'Ảnh đại diện',
    terms: 'Nội quy',
    question: 'Câu hỏi',
  };

  // { isJoinApproval: { old: true, new: false } } -> "Duyệt thành viên: bật → tắt" (ảnh, chữ dài: chỉ ghi đã đổi)
  function teamChange(changes) {
    if (!changes || typeof changes !== 'object') return '';
    const val = (x) => {
      if (x && typeof x === 'object' && 'value' in x) x = x.value;
      if (x === true) return 'bật';
      if (x === false) return 'tắt';
      if (typeof x === 'string' && x.length <= 40 && !/^https?:\/\//.test(x)) return `"${x}"`;
      return null;
    };
    return Object.entries(changes)
      .slice(0, 4)
      .map(([k, v]) => {
        const label = TEAM_FIELDS[k] || k;
        const [o, n] = [val(v?.old), val(v?.new)];
        return o != null && n != null ? `${label}: ${o} → ${n}` : n != null ? `${label}: ${n}` : label;
      })
      .join('; ');
  }

  // Một sự kiện nhật ký -> việc của admin (null nếu không phải loại cần đếm)
  function slimTeamEvent(e) {
    const t = TEAM_CASES[e?.useCase];
    if (!t) return null;
    const d = e.data || {};
    const actor = slimPerson(d.actor) || (e.actorId ? { id: e.actorId, username: '', fullname: '', avatar: '' } : null);
    if (!actor?.id) return null;
    return {
      id: e.id,
      time: e.eventTime || null,
      useCase: e.useCase,
      col: t[0],
      label: t[1],
      actor,
      user: slimPerson(d.user),
      groupId: e.groupId || d.group?.id || '',
      groupName: d.group?.name || '',
      change: t[0] === 'settings' ? teamChange(d.changes) : '',
    };
  }

  // Gom theo admin (nhiều việc nhất trước) + các lần đổi cài đặt / quyền admin (mới nhất trước)
  function teamSummary(events, { meId = '' } = {}) {
    const by = new Map();
    const seen = new Set();
    const changes = [];
    for (const e of events || []) {
      if (!e?.actor?.id || !e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      const a = by.get(e.actor.id) || { actor: e.actor, counts: Object.fromEntries(Object.keys(TEAM_COLS).map((k) => [k, 0])), total: 0, last: null, isMe: !!meId && e.actor.id === meId };
      a.counts[e.col]++;
      a.total++;
      if (!a.last || String(e.time) > String(a.last)) a.last = e.time;
      by.set(e.actor.id, a);
      if (e.col === 'settings' || e.col === 'roles') changes.push(e);
    }
    changes.sort((x, y) => String(y.time).localeCompare(String(x.time)));
    return { admins: [...by.values()].sort((x, y) => y.total - x.total), changes: changes.slice(0, 50), total: seen.size };
  }

  // "Đổi cài đặt: Duyệt thành viên: bật → tắt" / "Gán admin group: Lan Anh (@lan)"
  function teamChangeText(e) {
    if (e.col === 'roles') return `${e.label}: ${e.user ? (e.user.fullname || e.user.username || '?') + (e.user.username ? ` (@${e.user.username})` : '') : '?'}`;
    return e.change ? `${e.label} — ${e.change}` : e.label;
  }

  function monthlyReport(raw, { log = [], profiles = null, comments = [], postStats = {}, scopeIds = [], scopeNames = [], meId = '' } = {}) {
    const now = raw.now || Date.now();
    const cur = monthRange(raw.key, now);
    const prev = monthRange(raw.prevKey || shiftMonth(raw.key, -1), now);
    const moves = memberMoves(raw.events);
    const inMonth = (r) => (t) => {
      const v = typeof t === 'number' ? t : Date.parse(t);
      return Number.isFinite(v) && v >= r.from && v < r.to;
    };
    const flow = (r) => ({ joined: moves.filter((a) => a.kind === 'in' && inMonth(r)(a.time)).length, left: moves.filter((a) => a.kind === 'out' && inMonth(r)(a.time)).length });
    const complete = !raw.eventsTruncated;
    const members = { ...flow(cur), start: complete ? membersAt(raw.group?.userCount, moves, cur.from) : null, end: complete ? membersAt(raw.group?.userCount, moves, cur.to) : null, prev: flow(prev) };

    const cohort = memberCohort(raw.events, cur);
    const activity = cohortActivity(cohort, { posts: raw.actorPosts, comments });
    const newcomers = { ...cohortSummary(cohort, activity, now), checked: raw.actorChecked ?? cohort.length };

    const content = (r) => {
      const x = raw.months?.[r.key] || {};
      const posts = x.posts || [];
      const sum = (f) => posts.reduce((s, p) => s + (Number(f(p)) || 0), 0);
      return { posts: x.total ?? posts.length, read: posts.length, truncated: !!x.truncated, error: x.error || '', reactions: sum((p) => p.reactions), comments: sum((p) => p.commentsCount), views: sum((p) => p.views) };
    };
    const curPosts = raw.months?.[cur.key]?.posts || [];
    const score = (p) => (p.reactions || 0) + 2 * (p.commentsCount || 0);
    const topPosts = [...curPosts].sort((a, b) => score(b) - score(a) || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 5);
    const byAuthor = new Map();
    for (const p of curPosts) {
      const k = p.actor?.id || p.actor?.username || '?';
      const a = byAuthor.get(k) || { actor: p.actor, posts: 0, reactions: 0, comments: 0, isNew: !!activity[k] };
      a.posts++;
      a.reactions += p.reactions || 0;
      a.comments += p.commentsCount || 0;
      byAuthor.set(k, a);
    }
    const topAuthors = [...byAuthor.values()].sort((a, b) => b.posts - a.posts || b.reactions + b.comments - (a.reactions + a.comments)).slice(0, 5);

    const scope = scopeIds.length ? new Set(scopeIds) : null;
    const names = new Set(scopeNames);
    const inCur = inMonth(cur);
    const actions = countLogActions(log, inCur, scope);
    const violators = Object.values(profiles?.users || {})
      .map((p) => {
        const evs = (p.events || []).filter((e) => inCur(e.time) && (!names.size || !e.group || names.has(e.group)));
        return { user: p.user, count: evs.length };
      })
      .filter((x) => x.count)
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    const best = (e) => e.d7 || e.d1 || e.cur || null;
    const addonPosts = Object.values(postStats || {}).filter((e) => !e.gone && inCur(e.publishedAt) && (!names.size || String(e.groupName || '').split(/,\s*/).some((n) => names.has(n))));
    const measured = addonPosts.filter(best);
    const avg = (k) => (measured.length ? measured.reduce((s, e) => s + (best(e)[k] || 0), 0) / measured.length : null);

    return {
      key: cur.key,
      label: cur.label,
      partial: cur.partial,
      from: cur.from,
      to: cur.to,
      prevKey: prev.key,
      prevLabel: prev.label,
      group: raw.group || {},
      members,
      newcomers,
      cohort,
      activity,
      content: { cur: content(cur), prev: content(prev) },
      topPosts,
      topAuthors,
      actions,
      violators,
      addon: { posts: addonPosts.length, measured: measured.length, avg: { views: avg('views'), reactions: avg('reactions'), comments: avg('comments') } },
      // Chat Beincom: số tin, người nhắn trong kênh chat các group (null: chưa bật chat)
      chat: raw.chat ? { cur: BG.chatStats(raw.chat.messages, cur, raw.chat.channels), prev: BG.chatStats(raw.chat.messages, prev), truncated: !!raw.chat.truncated } : null,
      // Đội admin theo nhật ký Beincom (null: chưa đọc được, vd bản cũ)
      team: Array.isArray(raw.team) ? { ...teamSummary(raw.team, { meId }), truncated: !!raw.teamTruncated, skipped: raw.teamSkipped || [] } : null,
      eventsTruncated: !!raw.eventsTruncated,
      errors: raw.errors || [],
    };
  }

  // So với tháng trước: "(tháng trước 8, +50%)"
  function changeNote(a, b) {
    if (b == null) return '';
    if (!b) return a ? ' (tháng trước 0)' : '';
    if (a === b) return ' (bằng tháng trước)';
    return ` (tháng trước ${viNum(b)}, ${a > b ? '+' : '−'}${Math.round((Math.abs(a - b) / b) * 100)}%)`;
  }

  const personName = (u) => (u?.fullname || u?.username || '?') + (u?.username ? ` (@${u.username})` : '');

  // Bản chữ để sao chép / gửi Telegram cho các admin khác. Phần không có số liệu thì bỏ.
  function monthlyText(r) {
    const lines = [`BeinFusion: báo cáo ${r.label}${r.partial ? ` (tới ${dm(vnDay(r.to))})` : ''} — ${r.group.name || ''}`];
    const m = r.members;
    lines.push(`• Thành viên: ${m.start != null && m.end != null ? `${viNum(m.start)} → ${viNum(m.end)} (${signed(m.end - m.start)}) · ` : ''}${viNum(m.joined)} người vào, ${viNum(m.left)} người rời (tháng trước: ${viNum(m.prev.joined)} vào, ${viNum(m.prev.left)} rời)`);
    const n = r.newcomers;
    if (n.joined) {
      const out = [n.left && `${viNum(n.left)} tự rời`, n.removed && `${viNum(n.removed)} bị xoá`, n.banned && `${viNum(n.banned)} bị cấm`].filter(Boolean);
      lines.push(`• Người mới trong tháng: ${viNum(n.joined)} người · còn ở lại ${viNum(n.stayed)} (${pct(n.stayed, n.joined)})${out.length ? ' · ' + out.join(', ') : ''} · đã đăng bài ${viNum(n.posted)} · có bình luận ${viNum(n.commented)} · chưa thấy hoạt động ${viNum(n.silent)}`);
    }
    const c = r.content.cur;
    const p = r.content.prev;
    lines.push(`• Bài viết: ${viNum(c.posts)} bài${changeNote(c.posts, p.posts)} · 👁 ${viNum(c.views)} lượt xem · ❤ ${viNum(c.reactions)} · 💬 ${viNum(c.comments)}${c.truncated ? ` (tương tác tính trên ${viNum(c.read)} bài mới nhất)` : ''}`);
    const short = (x) => String(x.title || x.text || '(không có chữ)').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (r.topPosts.length) lines.push('• Bài nổi bật: ' + r.topPosts.slice(0, 3).map((x) => `"${short(x)}" (❤ ${viNum(x.reactions)} · 💬 ${viNum(x.commentsCount)})`).join('; '));
    if (r.topAuthors.length) lines.push('• Người đăng tích cực: ' + r.topAuthors.map((a) => `${personName(a.actor)} ${a.posts} bài`).join(', '));
    const a = r.actions;
    const mod = [
      [a.approved + a.autoApproved, 'duyệt thành viên'],
      [a.declined + a.autoDeclined, 'từ chối thành viên'],
      [a.removed, 'xoá thành viên'],
      [a.banned, 'cấm'],
      [a.postsApproved, 'duyệt bài'],
      [a.postsRejected, 'từ chối bài'],
      [a.postsHidden, 'ẩn bài'],
      [a.postsDeleted, 'xoá bài'],
      [a.commentsHidden, 'ẩn bình luận'],
      [a.reportsHandled, 'xử lý báo cáo'],
    ].filter(([k]) => k);
    if (mod.length) lines.push('• Kiểm duyệt qua addon: ' + mod.map(([k, t]) => `${viNum(k)} ${t}`).join(' · '));
    if (r.chat) {
      const ch = r.chat.cur;
      lines.push(`• Chat: ${viNum(ch.messages)} tin nhắn${changeNote(ch.messages, r.chat.prev.messages)} · ${viNum(ch.people)} người nhắn${ch.top.length ? ' · nhiều nhất: ' + ch.top.slice(0, 3).map((a) => `${personName(a.user)} ${viNum(a.count)}`).join(', ') : ''}`);
    }
    if (r.team?.admins.length) {
      const cols = Object.entries(TEAM_COLS);
      const one = (a) => `${personName(a.actor)}: ` + cols.filter(([k]) => a.counts[k]).map(([k, l]) => `${viNum(a.counts[k])} ${l.toLowerCase()}`).join(', ');
      lines.push('• Đội admin (nhật ký Beincom, cả việc làm trên web): ' + r.team.admins.slice(0, 8).map(one).join(' · '));
      if (r.team.changes.length) lines.push('• Đổi cài đặt / quyền admin: ' + r.team.changes.slice(0, 5).map((e) => `${Number.isFinite(Date.parse(e.time)) ? dm(vnDay(Date.parse(e.time))) + ' ' : ''}${e.actor.fullname || e.actor.username || '?'} — ${teamChangeText(e)}${e.groupName ? ` (${e.groupName})` : ''}`).join('; '));
    }
    if (r.violators.length) lines.push('• Vi phạm nhiều nhất: ' + r.violators.map((v) => `${personName(v.user)} ${v.count} lần`).join(', '));
    if (r.addon.posts) {
      const f1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toLocaleString('vi-VN'));
      lines.push(`• Đăng qua addon: ${viNum(r.addon.posts)} bài${r.addon.measured ? ` · trung bình mỗi bài 👁 ${f1(r.addon.avg.views)} · ❤ ${f1(r.addon.avg.reactions)} · 💬 ${f1(r.addon.avg.comments)}` : ''}`);
    }
    return lines.join('\n');
  }

  // ---------- Thống kê ----------

  // Các ngày (giờ VN) trong `days` ngày gần nhất, cũ -> mới
  function dayRange(days, now = Date.now()) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) out.push(vnDay(now - i * 864e5));
    return out;
  }

  // Ghi số thành viên hôm nay của từng group (giữ 120 ngày)
  function recordMemberHistory(prev, groups, now = Date.now()) {
    const day = vnDay(now);
    const out = { ...(prev || {}) };
    for (const g of groups || []) {
      if (g.userCount == null) continue;
      const list = (out[g.id] || []).filter((x) => x.day !== day);
      list.push({ day, count: g.userCount });
      out[g.id] = list.slice(-120);
    }
    return out;
  }

  // Ngày của số liệu chính thức: Beincom trả "2026-10-06T00:00:00.000Z" = ngày 06/10
  const officialDay = (iso) => String(iso || '').slice(0, 10);

  // Ghép số liệu theo ngày. Ưu tiên số liệu chính thức (chủ/admin community), không có thì tự tính:
  //  - thành viên: số addon ghi lại sau mỗi lần quét (history)
  //  - vào / rời: đếm nhật ký hoạt động (activity, đã chuẩn hoá bằng slimActivity)
  //  - bài mới: đếm bài trên timeline các group đang quản trị (posts, đã chuẩn hoá bằng slimPost)
  function buildStats({ days = 30, now = Date.now(), officialMembers = null, officialPosts = null, posts = [], activity = [], history = [], userCount = null }) {
    const range = dayRange(days, now);
    const inRange = new Set(range);
    const blank = () => Object.fromEntries(range.map((d) => [d, 0]));

    let memberSource = 'none';
    const members = Object.fromEntries(range.map((d) => [d, null]));
    if (officialMembers?.length) {
      memberSource = 'official';
      for (const r of officialMembers) if (inRange.has(officialDay(r.date))) members[officialDay(r.date)] = r.memberCount ?? null;
    } else if (history?.length) {
      memberSource = 'history';
      for (const r of history) if (inRange.has(r.day)) members[r.day] = r.count;
    }

    const joined = blank();
    const left = blank();
    let joinSource;
    if (officialMembers?.length) {
      joinSource = 'official';
      for (const r of officialMembers) {
        const d = officialDay(r.date);
        if (!inRange.has(d)) continue;
        joined[d] += r.joinedCount || 0;
        left[d] += r.leftCount || 0;
      }
    } else {
      joinSource = 'activity';
      for (const a of activity || []) {
        const d = a.time ? vnDay(new Date(a.time).getTime()) : null;
        if (!inRange.has(d)) continue;
        if (a.kind === 'in') joined[d]++;
        if (a.kind === 'out') left[d]++;
      }
    }

    const recent = (posts || []).filter((p) => p.publishedAt && inRange.has(vnDay(new Date(p.publishedAt).getTime())));
    const postsDaily = blank();
    let postSource;
    if (officialPosts?.length) {
      postSource = 'official';
      for (const r of officialPosts) if (inRange.has(officialDay(r.date))) postsDaily[officialDay(r.date)] += r.totalCount ?? r.postCount ?? 0;
    } else {
      postSource = 'timeline';
      for (const p of recent) postsDaily[vnDay(new Date(p.publishedAt).getTime())]++;
    }

    const engagement = (p) => (p.reactions || 0) + (p.commentsCount || 0);
    const topPosts = [...recent].sort((a, b) => engagement(b) - engagement(a) || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 10);
    const byAuthor = new Map();
    for (const p of recent) {
      const k = p.actor?.id || p.actor?.username || '?';
      const a = byAuthor.get(k) || { actor: p.actor, posts: 0, reactions: 0, comments: 0 };
      a.posts++;
      a.reactions += p.reactions || 0;
      a.comments += p.commentsCount || 0;
      byAuthor.set(k, a);
    }
    const topAuthors = [...byAuthor.values()].sort((a, b) => b.posts - a.posts || b.reactions + b.comments - (a.reactions + a.comments)).slice(0, 10);

    const sum = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    return {
      days: range,
      daily: range.map((d) => ({ day: d, members: members[d], joined: joined[d], left: left[d], posts: postsDaily[d] })),
      totals: {
        members: userCount,
        joined: sum(joined),
        left: sum(left),
        posts: sum(postsDaily),
        reactions: recent.reduce((s, p) => s + (p.reactions || 0), 0),
        comments: recent.reduce((s, p) => s + (p.commentsCount || 0), 0),
        scannedPosts: recent.length,
      },
      topPosts,
      topAuthors,
      sources: { members: memberSource, joinLeave: joinSource, posts: postSource },
    };
  }

  // Xuất CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt)
  const BOM = String.fromCharCode(0xfeff);
  function toCsv(rows, columns) {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
    return BOM + lines.join('\r\n');
  }

  // ---------- Việc tồn đọng ----------
  // Yêu cầu tham gia và bài chờ duyệt đã chờ quá `hours` giờ (theo lần quét gần nhất), chờ lâu nhất trước
  function pendingOverdue(groups, { hours = 24, now = Date.now() } = {}) {
    const limit = Math.max(1, Number(hours) || 24) * 3600e3;
    const out = [];
    for (const g of groups || []) {
      if (g.canApprove !== false) {
        for (const r of g.requests || []) {
          const at = Date.parse(r.createdAt);
          if (at && now - at >= limit) out.push({ key: 'req:' + r.id, kind: 'request', id: r.id, groupId: g.id, groupName: g.name, at });
        }
      }
      for (const p of g.approvals || []) {
        const at = Date.parse(p.submittedAt || p.publishedAt);
        if (at && now - at >= limit) out.push({ key: 'appr:' + p.id, kind: 'post', id: p.id, groupId: g.id, groupName: g.communityName || g.name, communityId: g.communityId, at });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  // "26 giờ", "3 ngày"
  function waitText(ms) {
    const h = Math.max(0, Math.floor(ms / 3600e3));
    return h < 48 ? `${h} giờ` : `${Math.floor(h / 24)} ngày`;
  }

  // Nhắc mỗi việc một lần: fresh = việc quá hạn chưa nhắc; reminded = khoá các việc còn tồn (việc đã xong tự rơi khỏi danh sách)
  function pendingReminder(overdue, reminded = []) {
    const seen = new Set(reminded || []);
    return { fresh: (overdue || []).filter((x) => !seen.has(x.key)), reminded: (overdue || []).map((x) => x.key).slice(0, 2000) };
  }

  // Nội dung thông báo cho các việc quá hạn mới
  function pendingText(fresh, { hours = 24, now = Date.now() } = {}) {
    const part = (kind, label) => {
      const list = fresh.filter((x) => x.kind === kind);
      if (!list.length) return '';
      const names = [...new Set(list.map((x) => x.groupName).filter(Boolean))];
      return `${list.length} ${label} (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''})`;
    };
    const parts = [part('request', 'yêu cầu tham gia'), part('post', 'bài chờ duyệt')].filter(Boolean);
    const oldest = Math.min(...fresh.map((x) => x.at));
    return {
      title: `BeinFusion: ${fresh.length} việc chờ quá ${hours} giờ`,
      message: `${parts.join(', ')}. Lâu nhất đã chờ ${waitText(now - oldest)}. Bấm để xử lý.`,
    };
  }

  Object.assign(BG, {
    TEAM_CASES,
    TEAM_COLS,
    teamChange,
    slimTeamEvent,
    teamSummary,
    teamChangeText,
    pendingOverdue,
    waitText,
    pendingReminder,
    pendingText,
    weeklyReport,
    STATS_SLOTS,
    statMetrics,
    statScore,
    statsDue,
    pruneStats,
    insightsSummary,
    countLogActions,
    COHORT_STATUS,
    memberMoves,
    memberCohort,
    cohortActivity,
    cohortSummary,
    cohortStatusText,
    vnWeekStart,
    DEFAULT_NUDGE,
    promptSlot,
    promptPerformance,
    NUDGE_COOLDOWN_DAYS,
    nudgeIndex,
    nudgeCandidates,
    addNudge,
    nudgeEffect,
    monthKey,
    shiftMonth,
    monthRange,
    monthOptions,
    monthlyDue,
    membersAt,
    monthlyReport,
    monthlyText,
    reportText,
    weeklyDue,
    dayRange,
    recordMemberHistory,
    buildStats,
    toCsv,
  });
});
