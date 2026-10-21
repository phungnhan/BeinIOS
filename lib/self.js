// BeinFusion — Hồ sơ cá nhân: tài khoản đang đăng nhập, quyền quản trị theo cộng đồng, trạng thái addon.
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
  const everyText = (min) => (!min ? '' : min % 60 ? `${min} phút` : `${min / 60} giờ`);

  // me: state.me (Beincom: id, username, fullname, avatar, verified) · chatMe: chatOverviewCache.me (chatId, username,
  // fullname, pictureAt) · groups: state.snapshot.groups · settings · lastScan, lastResult (state)
  // -> { name, username, id, avatar, chatId, pictureAt, verified, summary, sections: [{ title, note?, rows: [{ label, value, tone?, href?, copy? }] }], links }
  function selfProfile({ me = null, chatMe = null, groups = [], settings = {}, lastScan = 0, lastResult = null } = {}) {
    const name = me?.fullname || chatMe?.fullname || me?.username || chatMe?.username || '';
    const username = me?.username || chatMe?.username || '';
    const id = me?.id || chatMe?.id || '';

    // Quyền quản trị: gộp theo cộng đồng, vai trò cao nhất, số group con đang quản trị
    const byCommunity = new Map();
    for (const g of groups || []) {
      const key = g.communityId || g.id;
      const c = byCommunity.get(key) || { name: '', roles: new Set(), groups: 0, url: '', isCommunity: false, canBan: false, isCommunityAdmin: false };
      if (g.isCommunity) Object.assign(c, { name: g.name, url: BG.groupUrl(g), isCommunity: true });
      if (!c.name) c.name = g.communityName || g.name || key;
      if (!c.url) c.url = BG.groupUrl({ ...g, isCommunity: true, communityId: g.communityId || g.id });
      for (const r of g.roles || []) c.roles.add(r);
      if (!g.isCommunity) c.groups++;
      c.canBan ||= !!g.canBan;
      c.isCommunityAdmin ||= !!g.isCommunityAdmin;
      byCommunity.set(key, c);
    }
    const communities = [...byCommunity.values()].map((c) => ({ ...c, role: bestRole([...c.roles]) })).sort((a, b) => ROLE_RANK.indexOf(a.role || 'x') - ROLE_RANK.indexOf(b.role || 'x') || a.name.localeCompare(b.name, 'vi'));
    const nGroups = (groups || []).length;
    const owner = communities.filter((c) => c.role === 'role_OWNER').length;

    const sections = [];
    sections.push({
      title: 'Tài khoản',
      rows: [
        username ? { label: 'Tên đăng nhập', value: '@' + username } : null,
        id ? { label: 'Mã Beincom', value: id, copy: true } : null,
        { label: 'Chat Beincom', value: !settings?.chatEnabled ? 'Chưa bật' : chatMe ? 'Đã kết nối' + (chatMe.username && chatMe.username !== username ? ' · @' + chatMe.username : '') : 'Đang chờ kết nối', tone: settings?.chatEnabled && chatMe ? 'ok' : '' },
      ].filter(Boolean),
    });
    sections.push({
      title: 'Quyền quản trị',
      note: communities.length ? `${communities.length} cộng đồng · ${nGroups} group đang quản trị${owner ? ` · chủ ${owner} cộng đồng` : ''}` : 'Chưa thấy cộng đồng nào — bấm Quét ngay sau khi đăng nhập.',
      rows: communities.map((c) => ({
        label: c.name,
        value: [c.role ? BG.roleLabel([c.role]) : 'Quản trị', c.groups ? `${c.groups} group con` : ''].filter(Boolean).join(' · '),
        href: c.url,
      })),
    });
    const ok = !lastResult || lastResult.status === 'ok';
    sections.push({
      title: 'Addon',
      rows: [
        { label: 'Quét gần nhất', value: lastScan ? timeText(lastScan) + (ok ? '' : ' · ' + (lastResult.status === 'need_login' ? 'cần đăng nhập' : 'lỗi')) : 'Chưa quét', tone: lastScan && !ok ? 'bad' : '' },
        { label: 'Tự quét', value: settings?.active === false ? 'Đang tắt' : 'Mỗi ' + (everyText(settings?.intervalMin) || '30 phút'), tone: settings?.active === false ? 'warn' : '' },
        { label: 'Chạy thử', value: settings?.dryRun ? 'Đang bật — chưa gửi lên Beincom' : 'Tắt', tone: settings?.dryRun ? 'warn' : '' },
      ],
    });

    return {
      name,
      username,
      id,
      avatar: me?.avatar || '',
      chatId: chatMe?.chatId || '',
      pictureAt: chatMe?.pictureAt || 0,
      verified: !!me?.verified,
      summary: communities.length ? `Quản trị ${communities.length} cộng đồng` : '',
      sections,
      links: username ? [{ label: 'Trang cá nhân trên Beincom', href: BG.userUrl(username) }] : [],
    };
  }

  Object.assign(BG, { selfProfile });
});
