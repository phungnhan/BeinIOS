// BeinFusion — Hồ sơ cá nhân: tài khoản đang đăng nhập, thông tin trang cá nhân Beincom, quyền quản trị theo cộng đồng,
// hoạt động 30 ngày theo Nhật ký của addon, trạng thái addon.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: trang Chat, Dashboard (và BeinIOS → Cài đặt → Tài khoản) đọc kho rồi gọi để dựng cùng một nội dung.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const ROLE_RANK = ['role_OWNER', 'role_COMMUNITY_ADMIN', 'role_GROUP_ADMIN'];
  const bestRole = (roles) => ROLE_RANK.find((r) => roles.includes(r)) || '';

  const timeText = (t) => {
    const d = new Date(t);
    return isNaN(d) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const dateText = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  };
  const everyText = (min) => (!min ? '' : min % 60 ? `${min} phút` : `${min / 60} giờ`);
  const num = (n) => Number(n || 0).toLocaleString('vi-VN');

  // ---------- Trang cá nhân Beincom ----------
  const GENDERS = { MALE: 'Nam', FEMALE: 'Nữ', OTHERS: 'Khác' };
  const RELATIONS = { SINGLE: 'Độc thân', IN_A_RELATIONSHIP: 'Đang hẹn hò', ENGAGED: 'Đã đính hôn', MARRIED: 'Đã kết hôn' };
  const LANGS = { vi: 'Tiếng Việt', en: 'English', zh: '中文', ja: '日本語', ko: '한국어', th: 'ไทย', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };

  // user/me/profile (khoá snake_case như web: fullname, gender, birthday, language, relationship_status, email, country_code,
  // phone, city, is_verified — gọi thật ở BeinIOS 1.7.5) -> phần để hiện, không lưu. Ảnh bìa, giới thiệu, ngày tham gia: tên
  // khoá chưa đối chiếu thật — Beincom trả thì hiện, không thì thôi.
  function slimSelfInfo(d) {
    if (!d || typeof d !== 'object') return null;
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const img = (v) => (typeof v === 'string' ? v.trim() : str(v?.url));
    return {
      id: str(d.id),
      username: str(d.username),
      fullname: str(d.fullname),
      avatar: img(d.avatar),
      cover: img(d.background_img_url ?? d.backgroundImgUrl ?? d.cover_photo ?? d.coverPhoto),
      bio: str(d.description ?? d.bio),
      gender: str(d.gender),
      birthday: str(d.birthday),
      language: Array.isArray(d.language) ? d.language.filter((x) => typeof x === 'string' && x) : [],
      relationship: str(d.relationship_status ?? d.relationshipStatus),
      email: str(d.email),
      phone: str(d.phone),
      countryCode: str(d.country_code ?? d.countryCode),
      city: str(d.city),
      createdAt: str(d.created_at ?? d.createdAt),
      verified: !!(d.is_verified ?? d.isVerified),
    };
  }

  // ---------- Hoạt động ----------
  // Thao tác thành công 30 ngày qua theo Nhật ký của addon (BG.countLogActions): [nhãn, số, ghi thêm]
  const ACTIVITY = [
    ['Duyệt thành viên', (a) => a.approved + a.autoApproved, (a) => (a.autoApproved ? `${num(a.autoApproved)} tự động` : '')],
    ['Từ chối thành viên', (a) => a.declined + a.autoDeclined, (a) => (a.autoDeclined ? `${num(a.autoDeclined)} tự động` : '')],
    ['Duyệt bài', (a) => a.postsApproved],
    ['Từ chối bài', (a) => a.postsRejected],
    ['Ẩn bài', (a) => a.postsHidden],
    ['Ẩn bình luận', (a) => a.commentsHidden],
    ['Xoá bài', (a) => a.postsDeleted],
    ['Xử lý báo cáo', (a) => a.reportsHandled],
    ['Cấm', (a) => a.banned],
    ['Gỡ cấm', (a) => a.unbanned],
    ['Xoá khỏi group', (a) => a.removed],
    ['Đăng bài', (a) => a.published],
    ['Hẹn giờ đăng', (a) => a.scheduled],
    ['Đổi cài đặt group', (a) => a.groupSettings],
  ];
  const ACTIVITY_DAYS = 30;

  // me: state.me (Beincom: id, username, fullname, avatar, verified) · chatMe: chatOverviewCache.me (chatId, username,
  // fullname, pictureAt) · groups: state.snapshot.groups · settings · lastScan, lastResult (state) · info: slimSelfInfo (đọc
  // khi mở hồ sơ, có thể chưa có) · log: Nhật ký thao tác (không truyền: không có mục Hoạt động) · version: phiên bản addon
  // -> { name, username, id, avatar, cover, bio, chatId, pictureAt, verified, summary, stats: [{ key, label, value, hint?, tone? }],
  //      sections: [{ key, title, note?, rows: [{ label, value, tone?, href?, copy? }] }], links }
  function selfProfile({ me = null, chatMe = null, groups = [], settings = {}, lastScan = 0, lastResult = null, info = null, log = null, version = '', now = Date.now() } = {}) {
    const name = info?.fullname || me?.fullname || chatMe?.fullname || me?.username || chatMe?.username || '';
    const username = me?.username || info?.username || chatMe?.username || '';
    const id = me?.id || info?.id || chatMe?.id || '';

    // Quyền quản trị: gộp theo cộng đồng — vai trò cao nhất, số group con, số thành viên (của community, không thì group lớn
    // nhất mình quản trị), việc đang chờ (yêu cầu tham gia, bài chờ duyệt, báo cáo)
    const byCommunity = new Map();
    for (const g of groups || []) {
      const key = g.communityId || g.id;
      const c = byCommunity.get(key) || { name: '', roles: new Set(), groups: 0, url: '', isCommunity: false, canBan: false, isCommunityAdmin: false, members: 0, rootMembers: null, list: [] };
      if (g.isCommunity) Object.assign(c, { name: g.name, url: BG.groupUrl(g), isCommunity: true, rootMembers: g.userCount ?? null });
      if (!c.name) c.name = g.communityName || g.name || key;
      if (!c.url) c.url = BG.groupUrl({ ...g, isCommunity: true, communityId: g.communityId || g.id });
      for (const r of g.roles || []) c.roles.add(r);
      if (!g.isCommunity) c.groups++;
      c.canBan ||= !!g.canBan;
      c.isCommunityAdmin ||= !!g.isCommunityAdmin;
      c.members = Math.max(c.members, Number(g.userCount) || 0);
      c.list.push(g);
      byCommunity.set(key, c);
    }
    const communities = [...byCommunity.values()]
      .map((c) => {
        const t = BG.totals(c.list);
        return { ...c, role: bestRole([...c.roles]), members: c.rootMembers ?? c.members, pending: t.requests + t.posts + t.reports };
      })
      .sort((a, b) => ROLE_RANK.indexOf(a.role || 'x') - ROLE_RANK.indexOf(b.role || 'x') || a.name.localeCompare(b.name, 'vi'));
    const nGroups = (groups || []).length;
    const owner = communities.filter((c) => c.role === 'role_OWNER').length;
    const all = BG.totals(groups || []);
    const pending = all.requests + all.posts + all.reports;

    const sections = [];
    sections.push({
      key: 'account',
      title: 'Tài khoản',
      rows: [
        username ? { label: 'Tên đăng nhập', value: '@' + username, copy: true } : null,
        id ? { label: 'Mã Beincom', value: id, copy: true } : null,
        { label: 'Chat Beincom', value: !settings?.chatEnabled ? 'Chưa bật' : chatMe ? 'Đã kết nối' + (chatMe.username && chatMe.username !== username ? ' · @' + chatMe.username : '') : 'Đang chờ kết nối', tone: settings?.chatEnabled && chatMe ? 'ok' : '' },
      ].filter(Boolean),
    });
    if (info) {
      const opt = (label, value) => (value ? [{ label, value }] : []);
      sections.push({
        key: 'info',
        title: 'Thông tin cá nhân',
        note: info.verified ? 'Đã xác minh danh tính trên Beincom — họ tên, giới tính, ngày sinh không đổi được.' : '',
        rows: [
          { label: 'Họ và tên', value: info.fullname },
          { label: 'Giới tính', value: GENDERS[info.gender] || '' },
          { label: 'Ngày sinh', value: dateText(info.birthday) },
          { label: 'Ngôn ngữ', value: info.language.map((c) => LANGS[c] || c).join(', ') },
          { label: 'Tình trạng quan hệ', value: RELATIONS[info.relationship] || '' },
          { label: 'Email', value: info.email, copy: !!info.email },
          { label: 'Điện thoại', value: info.phone ? `${info.countryCode} ${info.phone}`.trim() : '', copy: !!info.phone },
          { label: 'Thành phố', value: info.city },
          ...opt('Tham gia Beincom', dateText(info.createdAt)),
        ].map((r) => (r.value ? r : { ...r, value: 'Chưa có', tone: 'none' })),
      });
    }
    sections.push({
      key: 'admin',
      title: 'Quyền quản trị',
      note: communities.length ? `${communities.length} cộng đồng · ${nGroups} group đang quản trị${owner ? ` · chủ ${owner} cộng đồng` : ''}` : 'Chưa thấy cộng đồng nào — bấm Quét ngay sau khi đăng nhập.',
      rows: communities.map((c) => ({
        label: c.name,
        value: [c.role ? BG.roleLabel([c.role]) : 'Quản trị', c.groups ? `${c.groups} group con` : '', c.members ? `${num(c.members)} thành viên` : '', c.pending ? `${num(c.pending)} việc chờ` : ''].filter(Boolean).join(' · '),
        href: c.url,
      })),
    });
    let acted = null;
    if (log) {
      const a = BG.countLogActions(log, (t) => now - t <= ACTIVITY_DAYS * 864e5 && t <= now);
      const rows = ACTIVITY.map(([label, n, extra]) => [label, n(a), extra?.(a) || '']).filter(([, n]) => n > 0).map(([label, n, extra]) => ({ label, value: num(n) + (extra ? ` · ${extra}` : '') }));
      acted = ACTIVITY.reduce((s, [, n]) => s + n(a), 0);
      if (a.errors) rows.push({ label: 'Thao tác lỗi', value: num(a.errors), tone: 'bad' });
      sections.push({ key: 'activity', title: `Hoạt động ${ACTIVITY_DAYS} ngày`, note: rows.length ? 'Theo Nhật ký thao tác của addon trên máy này (cả việc addon tự làm).' : 'Chưa có thao tác nào trong 30 ngày qua.', rows });
    }
    const ok = !lastResult || lastResult.status === 'ok';
    sections.push({
      key: 'addon',
      title: 'Addon',
      rows: [
        version ? { label: 'Phiên bản', value: 'v' + version } : null,
        { label: 'Quét gần nhất', value: lastScan ? timeText(lastScan) + (ok ? '' : ' · ' + (lastResult.status === 'need_login' ? 'cần đăng nhập' : 'lỗi')) : 'Chưa quét', tone: lastScan && !ok ? 'bad' : '' },
        { label: 'Tự quét', value: settings?.active === false ? 'Đang tắt' : 'Mỗi ' + (everyText(settings?.intervalMin) || '30 phút'), tone: settings?.active === false ? 'warn' : '' },
        { label: 'Chạy thử', value: settings?.dryRun ? 'Đang bật — chưa gửi lên Beincom' : 'Tắt', tone: settings?.dryRun ? 'warn' : '' },
      ].filter(Boolean),
    });

    const members = communities.reduce((s, c) => s + (c.members || 0), 0);
    const stats = [
      { key: 'communities', label: 'Cộng đồng', value: num(communities.length), hint: owner ? `chủ ${owner}` : '' },
      { key: 'groups', label: 'Group quản trị', value: num(nGroups) },
      { key: 'members', label: 'Thành viên', value: num(members), hint: 'trong các cộng đồng' },
      { key: 'pending', label: 'Việc đang chờ', value: num(pending), tone: pending ? 'warn' : '', hint: [all.requests ? `${num(all.requests)} yêu cầu` : '', all.posts ? `${num(all.posts)} bài` : '', all.reports ? `${num(all.reports)} báo cáo` : ''].filter(Boolean).join(' · ') },
      ...(acted == null ? [] : [{ key: 'activity', label: `Thao tác ${ACTIVITY_DAYS} ngày`, value: num(acted) }]),
    ];

    return {
      name,
      username,
      id,
      avatar: info?.avatar || me?.avatar || '',
      cover: info?.cover || '',
      bio: info?.bio || '',
      chatId: chatMe?.chatId || '',
      pictureAt: chatMe?.pictureAt || 0,
      verified: !!(me?.verified || info?.verified),
      summary: communities.length ? `Quản trị ${communities.length} cộng đồng` : '',
      stats,
      sections,
      links: username ? [{ label: 'Trang cá nhân trên Beincom', href: BG.userUrl(username) }] : [],
    };
  }

  Object.assign(BG, { selfProfile, slimSelfInfo });
});
