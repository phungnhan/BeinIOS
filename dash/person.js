// Dashboard — cửa sổ Hồ sơ một người (cùng kiểu Hồ sơ cá nhân): đầu thẻ (ảnh bìa, avatar, tên, @tên chép được, nhãn tài
// khoản, cảnh báo), ô số liệu, bốn thẻ — Tổng quan (tài khoản, có trong cộng đồng nào của bạn, ngày vào, đang xin vào, giống
// admin), Vi phạm (hồ sơ addon đã ghi), Bài viết (bài / bình luận / tin chat addon đã thấy, Tìm bài còn hiện), Thao tác (của
// admin với người này, theo Nhật ký); Dọn tài khoản, Cấm ở mọi community. Mở khi bấm tên người ở các bảng, huy hiệu ⚠, hoặc
// từ trang Chat (#profile=<mã>). Dữ liệu trong máy, cộng lệnh memberInfo (danh sách thành viên, chỉ đọc) và nút Tìm bài.

// infoLoading: mã người đang đọc memberInfo (mở người khác giữa chừng thì đọc người mới, bỏ kết quả người cũ)
const PC = { user: null, found: null, finding: false, tab: 'overview', info: null, infoFor: '', infoLoading: '', infoError: '' };
const PC_TABS = [
  ['overview', 'Tổng quan'],
  ['violations', 'Vi phạm'],
  ['content', 'Bài viết'],
  ['actions', 'Thao tác'],
];

function openProfile(u) {
  if (!u?.id) return;
  // Thông tin đầy đủ nhất đang có về người này (hồ sơ vi phạm, bài, bình luận)
  const known = data.profiles?.users?.[u.id]?.user || (data.state.recentPosts || []).find((p) => p.actor?.id === u.id)?.actor || (data.state.recentComments || []).find((c) => c.actor?.id === u.id)?.actor || {};
  PC.user = { ...known, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v)), id: u.id };
  PC.found = null;
  PC.finding = false;
  PC.tab = 'overview';
  if (PC.infoFor !== u.id) Object.assign(PC, { info: null, infoFor: u.id, infoError: '' });
  renderPersonCard();
  if (!$('person-card').open) $('person-card').showModal();
  loadMemberInfo();
}

// Có trong cộng đồng nào của bạn, ngày vào, số group trên Beincom… (nền tìm trong danh sách thành viên, chỉ đọc)
async function loadMemberInfo(force = false) {
  const u = PC.user;
  if (!u || PC.infoLoading === u.id || (!force && PC.info && PC.infoFor === u.id) || !(u.username || u.fullname)) return;
  Object.assign(PC, { infoLoading: u.id, infoError: '' });
  renderPersonCard();
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: 'memberInfo', userId: u.id, username: u.username || '', fullname: u.fullname || '' });
  } catch (e) {
    r = { status: 'error', message: String(e?.message || e) };
  }
  if (PC.infoLoading === u.id) PC.infoLoading = '';
  if (PC.user?.id !== u.id) return;
  if (r?.status === 'ok') Object.assign(PC, { info: r, infoFor: u.id });
  else PC.infoError = r?.status === 'need_login' ? 'phiên đăng nhập Beincom đã hết hạn' : r?.message || 'có lỗi';
  renderPersonCard();
}

// Danh sách Hồ sơ vi phạm (Thành viên), lọc theo người này
function profileInList(u) {
  $('person-card').close();
  prof.key = u.username || u.fullname || '';
  prof.filter = 'all';
  prof.open = u.id;
  mem.tab = 'profiles';
  $('profiles-key').value = prof.key;
  showTab('members');
  renderMembers();
  renderProfiles();
  document.querySelector(`#profiles-body tr[data-user="${CSS.escape(u.id)}"]`)?.scrollIntoView({ block: 'center' });
}

const pcText = (s, n = 110) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const pcSec = (title, count, ...kids) => el('section', { class: 'pc-sec' }, el('h4', {}, title, count != null ? el('span', { class: 'muted small', text: ` (${count})` }) : null), ...kids);
const pcDate = (t) => (t ? new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

function renderPersonCard() {
  const u = PC.user;
  if (!u) return;
  const p = data.profiles?.users?.[u.id] || null;
  const sum = p?.events?.length ? BG.profileSummary(p) : null;
  const meId = data.state.me?.id;
  const posts = (data.state.recentPosts || []).filter((x) => x.actor?.id === u.id).sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const comments = (data.state.recentComments || []).filter((x) => x.actor?.id === u.id).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const chats = (data.state.chatMessages || []).filter((x) => x.user?.id === u.id).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const logs = (data.log || []).filter((e) => e.userId === u.id);
  const requests = groups().flatMap((g) => (g.requests || []).filter((r) => (r.userId || r.user?.id) === u.id).map((r) => ({ g, r })));
  const impostor = (data.state.impostors || []).find((x) => x.user?.id === u.id && !x.dismissed);
  const info = PC.infoFor === u.id ? PC.info : null;
  const person = info?.person || null;
  const name = u.fullname || u.username || '(không tên)';
  const av = { id: u.id, name, avatar: u.avatar || '' };

  // Đầu thẻ: ảnh bìa (dải màu theo tài khoản), avatar, tên, @tên, nhãn tài khoản; cảnh báo ngay dưới
  const tags = [u.id === meId ? ['Bạn', 'info'] : null, person?.isDeactivated ? ['Đã khoá', 'err'] : null, person?.premium ? ['Cao cấp', 'ok'] : null, person?.nft ? ['NFT', 'info'] : null].filter(Boolean);
  const flags = [
    sum ? el('div', { class: 'pcd-flag' + (sum.severe ? ' bad' : '') }, '⚠ ' + BG.profileText(sum)) : el('div', { class: 'pcd-flag ok' }, '✓ Chưa ghi nhận vi phạm nào'),
    impostor ? el('div', { class: 'pcd-flag bad' }, `🛡 Giống admin: ${impostor.reason || ''}${impostor.groupName ? ' · ' + impostor.groupName : ''}`) : null,
    ...requests.map(({ g, r }) => el('div', { class: 'pcd-flag info' }, `Đang xin vào ${g.name}${r.createdAt ? ' · ' + ago(r.createdAt) : ''}`)),
  ].filter(Boolean);
  $('pcd-head').replaceChildren(
    el('div', { class: 'me-cover', style: `--h: ${selfHue(av)}` }),
    el(
      'div',
      { class: 'me-id' },
      selfAvatar(av, 76),
      el(
        'div',
        { class: 'me-who' },
        el('span', {}, el('b', { id: 'pcd-name' }, name), person?.isVerified || u.isVerified ? el('span', { class: 'me-vb', title: 'Đã xác minh' }, '✓') : null),
        el('span', { class: 'me-sub' }, ...[u.username ? el('span', {}, '@' + u.username) : null, u.username ? meCopy('Tên đăng nhập', '@' + u.username) : null, ...tags.map(([t, c]) => el('span', { class: 'tag ' + c }, t))].filter(Boolean)),
      ),
      el('div', { class: 'me-acts' }, ...[u.username ? el('a', { class: 'me-link', href: BG.userUrl(u.username), target: '_blank', rel: 'noopener noreferrer' }, 'Trang Beincom ↗') : null].filter(Boolean)),
    ),
    el('div', { class: 'pcd-flags' }, flags),
  );

  // Ô số liệu
  const stats = [
    ['Vi phạm', p?.events?.length || 0, p?.events?.length ? (sum?.severe ? 'bad' : 'warn') : ''],
    ['Bài đã thấy', posts.length],
    ['Bình luận', comments.length],
    ...(data.settings.chatEnabled ? [['Tin chat', chats.length]] : []),
    ['Thao tác của admin', logs.length],
    ...(person?.totalJoinedGroup != null ? [['Group trên Beincom', person.totalJoinedGroup]] : []),
  ];
  $('pcd-stats').replaceChildren(...stats.map(([label, n, tone]) => el('div', { class: 'me-stat' + (tone ? ' ' + tone : '') }, el('b', {}, Number(n).toLocaleString('vi-VN')), el('small', {}, label))));

  // Thẻ
  $('pcd-tabs').replaceChildren(
    ...PC_TABS.map(([id, label]) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'me-tab' + (id === PC.tab ? ' on' : ''),
          'aria-selected': id === PC.tab ? 'true' : 'false',
          onclick: () => {
            PC.tab = id;
            renderPersonCard();
          },
        },
        label,
      ),
    ),
  );

  const list = (items, row, empty, max = 8) => (items.length ? [el('ul', { class: 'pcd-list' }, items.slice(0, max).map(row)), items.length > max ? el('p', { class: 'muted small', text: `… và ${items.length - max} mục nữa` }) : null] : [el('p', { class: 'muted small', text: empty })]);
  let body = [];
  if (PC.tab === 'overview') {
    const account = { key: 'account', title: 'Tài khoản', rows: [u.username ? { label: 'Tên đăng nhập', value: '@' + u.username, copy: true } : null, person?.totalJoinedGroup != null ? { label: 'Tham gia trên Beincom', value: `${person.totalJoinedGroup} group` } : null].filter(Boolean) };
    const where = info
      ? {
          key: 'where',
          title: 'Trong cộng đồng của bạn',
          note: info.memberships.length ? `Tìm trong danh sách thành viên của ${info.checked} cộng đồng bạn quản trị.` : `Không thấy trong danh sách thành viên của ${info.checked} cộng đồng bạn quản trị${info.errors ? ` (${info.errors} cộng đồng chưa đọc được)` : ''}.`,
          rows: info.memberships.map((m) => ({ label: m.name, href: m.url, value: [m.joinedAt ? 'Vào ' + pcDate(m.joinedAt) : 'Thành viên', m.admin ? 'Admin' : ''].filter(Boolean).join(' · ') })),
        }
      : { key: 'where', title: 'Trong cộng đồng của bạn', note: PC.infoError ? `Chưa đọc được danh sách thành viên: ${PC.infoError}.` : u.username || u.fullname ? 'Đang tìm trong danh sách thành viên các cộng đồng bạn quản trị…' : 'Không có tên để tìm.', rows: [] };
    body = [meSection(account), meSection(where)];
    if (requests.length) body.push(meSection({ key: 'requests', title: 'Đang xin vào', rows: requests.map(({ g, r }) => ({ label: g.name, value: r.createdAt ? ago(r.createdAt) : 'đang chờ duyệt' })) }));
    if (PC.infoError) body.push(el('div', {}, el('button', { type: 'button', class: 'ghost sm', disabled: PC.infoLoading === u.id, text: PC.infoLoading === u.id ? 'Đang tìm…' : 'Tìm lại', onclick: () => loadMemberInfo(true) })));
  } else if (PC.tab === 'violations') {
    body = [
      pcSec(
        'Hồ sơ vi phạm',
        p?.events?.length || 0,
        ...list(p?.events || [], (e) => el('li', {}, el('b', { text: BG.VIOLATION_TYPES[e.type]?.label || e.type }), el('span', { class: 'muted small', text: ` · ${e.group || ''} · ${fmtTime(e.time)}${e.by ? ' · bởi ' + e.by : ''}` }), e.snippet ? el('div', { class: 'small', text: '“' + pcText(e.snippet) + '”' }) : null), 'Chưa ghi nhận vi phạm nào.', 10),
        p?.events?.length ? el('button', { type: 'button', class: 'link-btn', text: 'Xem trong danh sách Hồ sơ vi phạm →', onclick: () => profileInList(u) }) : null,
      ),
    ];
  } else if (PC.tab === 'content') {
    body = [
      pcSec(
        'Bài mới đăng addon đã thấy',
        posts.length,
        ...list(posts, (x) => el('li', {}, pcText(x.title || x.text) || '(không có chữ)', x.isHidden ? el('span', { class: 'tag info', text: 'Đã ẩn' }) : null, el('div', { class: 'muted small' }, `${ago(x.publishedAt)} · ${(x.groups || []).map((g) => g.name).join(', ')} · `, el('button', { type: 'button', class: 'link-btn', text: '💬 Xem', onclick: () => openPost(x) }), ' · ', el('a', { href: BG.postUrl(x), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' }))), 'Không có bài nào trong lần quét gần nhất.'),
      ),
      pcSec(
        'Bình luận addon đã thấy',
        comments.length,
        ...list(comments, (c) => el('li', {}, pcText(c.text) || '(ảnh)', c.isHidden ? el('span', { class: 'tag info', text: 'Đã ẩn' }) : null, el('div', { class: 'muted small' }, `${ago(c.createdAt)} · `, el('a', { href: BG.commentUrl(c), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' }))), data.settings.scanComments ? 'Không có bình luận nào trong lần quét gần nhất.' : 'Chưa bật Quét bình luận mới.'),
      ),
      data.settings.chatEnabled ? pcSec('Tin chat addon đã thấy', chats.length, ...list(chats, (m) => el('li', {}, pcText(m.text) || '(tệp)', m.deleted ? el('span', { class: 'tag info', text: 'Đã xoá' }) : null, el('div', { class: 'muted small', text: `${ago(m.createdAt)} · ${m.groupName || ''}` })), 'Không có tin nào trong các kênh chat addon đọc.')) : null,
      pcSec(
        'Bài còn hiện trong các community bạn quản trị',
        PC.found ? PC.found.posts.length : null,
        ...(PC.found
          ? PC.found.error
            ? [el('p', { class: 'err-text small', text: PC.found.error })]
            : list(PC.found.posts, (x) => el('li', {}, pcText(x.title || x.text) || 'Bài viết', el('div', { class: 'muted small' }, `${ago(x.publishedAt)} · `, el('a', { href: BG.postUrl(x), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' }))), 'Không có bài nào còn hiện.')
          : [el('button', { type: 'button', class: 'ghost sm', disabled: PC.finding, text: PC.finding ? 'Đang tìm…' : 'Tìm bài của người này (chỉ đọc)', onclick: findProfilePosts })]),
        PC.found?.truncated ? el('p', { class: 'muted small', text: 'Mới xem 200 bài mới nhất mỗi community.' }) : null,
      ),
    ];
  } else {
    body = [
      pcSec('Thao tác của admin với người này', logs.length, ...list(logs, (e) => el('li', {}, el('b', { text: actionLabel(e) }), ' ', el('span', { class: 'tag ' + (STATUS_TAGS[e.status]?.[0] || 'info'), text: STATUS_TAGS[e.status]?.[1] || e.status }), el('div', { class: 'muted small', text: `${e.groupName || e.communityName || ''} · ${fmtTime(e.time)}${e.source === 'auto' ? ' · tự động' : ''}` })), 'Chưa có thao tác nào qua addon.', 15)),
    ];
  }
  $('pcd-body').replaceChildren(...body.filter(Boolean));

  const canAct = u.id !== meId;
  $('pcd-actions').replaceChildren(
    ...[
      canAct ? el('button', { type: 'button', class: 'danger', disabled: busy, text: '🧹 Dọn tài khoản…', title: 'Ẩn bài / bình luận gần đây và tuỳ chọn cấm', onclick: () => cleanupUser(u) }) : null,
      canAct && BG.banTargets(groups()).length ? el('button', { type: 'button', class: 'ghost', disabled: busy, text: 'Cấm ở mọi community', onclick: () => banEverywhere(u) }) : null,
      p ? el('button', { type: 'button', class: 'ghost', disabled: busy, text: 'Xoá hồ sơ vi phạm', onclick: () => forgetProfile(p) }) : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'ghost', text: 'Đóng', onclick: () => $('person-card').close() }),
    ].filter(Boolean),
  );
}

async function findProfilePosts() {
  const u = PC.user;
  if (!u || PC.finding) return;
  PC.finding = true;
  renderPersonCard();
  const r = await chrome.runtime.sendMessage({ type: 'userPosts', userId: u.id });
  if (PC.user?.id !== u.id) return;
  PC.finding = false;
  PC.found =
    r?.status === 'ok'
      ? { posts: (r.posts || []).slice().sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)), truncated: !!r.truncated }
      : { posts: [], error: r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : 'Không tìm được: ' + (r?.message || 'lỗi') };
  renderPersonCard();
}

// Sự kiện close tới trễ (sau một nhịp): đã mở lại cho người khác thì giữ — không thì kết quả đang tải của người mới bị bỏ
$('person-card').addEventListener('close', () => {
  if (!$('person-card').open) PC.user = null;
});
