// Dashboard — cửa sổ Hồ sơ một người: vi phạm addon đã ghi, bài / bình luận / tin chat addon đã thấy, thao tác của admin
// với người này (Nhật ký), yêu cầu tham gia đang chờ, cảnh báo giống admin; Dọn tài khoản, Cấm ở mọi community, Tìm bài.
// Mở khi bấm tên người ở các bảng, huy hiệu ⚠, hoặc từ trang Chat (#profile=<mã>). Dùng dữ liệu đã có trong máy; chỉ nút
// Tìm bài còn hiện mới đọc thêm từ Beincom.

const PC = { user: null, found: null, finding: false };

function openProfile(u) {
  if (!u?.id) return;
  // Thông tin đầy đủ nhất đang có về người này (hồ sơ vi phạm, bài, bình luận)
  const known = data.profiles?.users?.[u.id]?.user || (data.state.recentPosts || []).find((p) => p.actor?.id === u.id)?.actor || (data.state.recentComments || []).find((c) => c.actor?.id === u.id)?.actor || {};
  PC.user = { ...known, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v)), id: u.id };
  PC.found = null;
  PC.finding = false;
  renderPersonCard();
  if (!$('person-card').open) $('person-card').showModal();
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

function renderPersonCard() {
  const u = PC.user;
  if (!u) return;
  const p = data.profiles?.users?.[u.id] || null;
  const sum = p?.events?.length ? BG.profileSummary(p) : null;
  const meId = data.state.me?.id;
  const posts = (data.state.recentPosts || []).filter((x) => x.actor?.id === u.id).sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  const comments = (data.state.recentComments || []).filter((x) => x.actor?.id === u.id).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const chats = (data.state.chatMessages || []).filter((x) => x.user?.id === u.id).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const logs = (data.log || []).filter((e) => e.userId === u.id).slice(0, 15);
  const requests = groups().flatMap((g) => (g.requests || []).filter((r) => (r.userId || r.user?.id) === u.id).map((r) => ({ g, r })));
  const impostor = (data.state.impostors || []).find((x) => x.user?.id === u.id && !x.dismissed);

  $('pcd-head').replaceChildren(
    avatarOf(u),
    el('div', { class: 'pcd-who' }, el('b', { text: u.fullname || u.username || '(không tên)' }), el('div', { class: 'muted small' }, u.username ? el('a', { href: BG.userUrl(u.username), target: '_blank', rel: 'noreferrer', text: '@' + u.username + ' ↗' }) : null, u.id === meId ? ' · Bạn' : '')),
  );

  const warn = [
    sum ? el('div', { class: 'pcd-flag' + (sum.severe ? ' bad' : '') }, '⚠ ' + BG.profileText(sum)) : el('div', { class: 'pcd-flag ok' }, '✓ Chưa ghi nhận vi phạm nào'),
    impostor ? el('div', { class: 'pcd-flag bad' }, `🛡 Giống admin: ${impostor.reason || ''}${impostor.groupName ? ' · ' + impostor.groupName : ''}`) : null,
    ...requests.map(({ g, r }) => el('div', { class: 'pcd-flag info' }, `Đang xin vào ${g.name}${r.createdAt ? ' · ' + ago(r.createdAt) : ''}`)),
  ];

  const list = (items, row, empty) => (items.length ? el('ul', { class: 'pcd-list' }, items.slice(0, 8).map(row)) : el('p', { class: 'muted small', text: empty }));
  const more = (items) => (items.length > 8 ? el('p', { class: 'muted small', text: `… và ${items.length - 8} mục nữa` }) : null);

  const body = [
    el('div', { class: 'pcd-flags' }, warn.filter(Boolean)),
    sum
      ? pcSec(
          'Hồ sơ vi phạm',
          p.events.length,
          el('ul', { class: 'pcd-list' }, p.events.slice(0, 10).map((e) => el('li', {}, el('b', { text: BG.VIOLATION_TYPES[e.type]?.label || e.type }), el('span', { class: 'muted small', text: ` · ${e.group || ''} · ${fmtTime(e.time)}${e.by ? ' · bởi ' + e.by : ''}` }), e.snippet ? el('div', { class: 'small', text: '“' + pcText(e.snippet) + '”' }) : null))),
          el('button', { type: 'button', class: 'link-btn', text: 'Xem trong danh sách Hồ sơ vi phạm →', onclick: () => profileInList(u) }),
        )
      : null,
    pcSec(
      'Bài mới đăng addon đã thấy',
      posts.length,
      list(posts, (x) => el('li', {}, el('span', { class: 'muted small', text: `${ago(x.publishedAt)} · ${(x.groups || []).map((g) => g.name).join(', ')} · ` }), pcText(x.title || x.text) || '(không có chữ)', x.isHidden ? el('span', { class: 'tag info', text: 'Đã ẩn' }) : null, ' ', el('button', { type: 'button', class: 'link-btn', text: '💬 Xem', onclick: () => openPost(x) }), ' ', el('a', { href: BG.postUrl(x), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' })), 'Không có bài nào trong lần quét gần nhất.'),
      more(posts),
    ),
    pcSec(
      'Bình luận addon đã thấy',
      comments.length,
      list(comments, (c) => el('li', {}, el('span', { class: 'muted small', text: `${ago(c.createdAt)} · ` }), pcText(c.text) || '(ảnh)', c.isHidden ? el('span', { class: 'tag info', text: 'Đã ẩn' }) : null, ' ', el('a', { href: BG.commentUrl(c), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' })), data.settings.scanComments ? 'Không có bình luận nào trong lần quét gần nhất.' : 'Chưa bật Quét bình luận mới.'),
      more(comments),
    ),
    data.settings.chatEnabled ? pcSec('Tin chat addon đã thấy', chats.length, list(chats, (m) => el('li', {}, el('span', { class: 'muted small', text: `${ago(m.createdAt)} · ${m.groupName || ''} · ` }), pcText(m.text) || '(tệp)', m.deleted ? el('span', { class: 'tag info', text: 'Đã xoá' }) : null), 'Không có tin nào trong các kênh chat addon đọc.'), more(chats)) : null,
    pcSec(
      'Thao tác của admin với người này',
      logs.length,
      list(logs, (e) => el('li', {}, el('b', { text: actionLabel(e) }), el('span', { class: 'muted small', text: ` · ${e.groupName || e.communityName || ''} · ${fmtTime(e.time)}` }), ' ', el('span', { class: 'tag ' + (STATUS_TAGS[e.status]?.[0] || 'info'), text: STATUS_TAGS[e.status]?.[1] || e.status })), 'Chưa có thao tác nào qua addon.'),
    ),
    pcSec(
      'Bài còn hiện trong các community bạn quản trị',
      PC.found ? PC.found.posts.length : null,
      PC.found
        ? PC.found.error
          ? el('p', { class: 'err-text small', text: PC.found.error })
          : list(PC.found.posts, (x) => el('li', {}, el('span', { class: 'muted small', text: `${ago(x.publishedAt)} · ` }), pcText(x.title || x.text) || 'Bài viết', ' ', el('a', { href: BG.postUrl(x), target: '_blank', rel: 'noreferrer', text: 'Mở ↗' })), 'Không có bài nào còn hiện.')
        : el('button', { type: 'button', class: 'ghost sm', disabled: PC.finding, text: PC.finding ? 'Đang tìm…' : 'Tìm bài của người này (chỉ đọc)', onclick: findProfilePosts }),
      PC.found?.truncated ? el('p', { class: 'muted small', text: 'Mới xem 200 bài mới nhất mỗi community.' }) : null,
    ),
  ];
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

$('person-card').addEventListener('close', () => (PC.user = null));
