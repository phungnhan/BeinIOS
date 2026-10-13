// Dashboard — tab Thành viên: duyệt yêu cầu, danh sách, bị cấm, hồ sơ vi phạm, vào / rời.

// ---------- Duyệt thành viên ----------

function reviewGroups() {
  return groups().filter((g) => g.canApprove);
}

function currentGroup() {
  const gs = reviewGroups();
  return gs.find((g) => g.id === selectedGroupId) || gs.find((g) => g.requests?.length) || gs[0] || null;
}

function selectGroup(id) {
  if (id === selectedGroupId) return;
  selectedGroupId = id;
  selected.clear();
  writeHash();
  renderGroups();
  renderReview();
}

// ---------- Duyệt thành viên: bảng yêu cầu ----------

function renderReview() {
  const sel = $('group-select');
  const gs = reviewGroups();
  const g = currentGroup();
  sel.replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: `${BG.groupIndent(x)}${x.name} (${x.pendingTotal || 0})` })));
  sel.disabled = !gs.length;

  const rows = evaluated(g);
  const counts = { all: rows.length, approve: 0, review: 0, decline: 0 };
  for (const r of rows) counts[r.ev.verdict]++;
  setCounts('cnt', counts);
  setSegActive('verdict-filter', verdictFilter);

  const note = $('review-note');
  note.textContent = '';
  if (!g) note.textContent = data.state.snapshot ? 'Tài khoản không có quyền duyệt thành viên ở group nào.' : '';
  else if (g.settings && !g.settings.isJoinApproval && !rows.length) note.textContent = 'Group này đang tắt duyệt thành viên: người xin vào được vào luôn, nên thường không có yêu cầu nào.';
  else if (g.pendingTotal > rows.length) note.textContent = `Đang hiện ${rows.length}/${g.pendingTotal} yêu cầu — duyệt bớt rồi quét lại để tải tiếp.`;

  pruneSelection(selected, new Set(rows.map((r) => r.req.id)));
  const shown = rows.filter((r) => verdictFilter === 'all' || r.ev.verdict === verdictFilter);
  const bulk = () => renderBulk({ set: selected, shown, idOf: (r) => r.req.id, checkAll: 'check-all', countEl: 'selected-count', buttons: ['btn-approve-selected', 'btn-decline-selected'] });
  const body = $('requests-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !g ? 'Chưa có dữ liệu' : rows.length ? 'Không có yêu cầu nào trong mục này' : 'Không có yêu cầu tham gia nào đang chờ 🎉';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 6, text: msg })));
  }
  for (const { req, ev } of shown) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selected, req.id, req.user.fullname || req.user.username, bulk)),
        el('td', {}, userCell(req.user)),
        el('td', {}, answersCell(req, g)),
        el('td', { title: fmtTime(req.createdAt), text: ago(req.createdAt) }),
        verdictCell(BG.VERDICT_LABELS[ev.verdict], ev.verdict, ev.reasons),
        el(
          'td',
          { class: 'act' },
          el('button', { class: 'ok-btn sm', disabled: busy, text: 'Duyệt', onclick: () => actMembers('approve', g, [req]) }),
          el('button', { class: 'danger sm', disabled: busy, text: 'Từ chối', onclick: () => actMembers('decline', g, [req]) }),
        ),
      ),
    );
  }
  bulk();
}

async function actMembers(action, g, reqs) {
  if (busy || !reqs.length) return;
  const verb = action === 'approve' ? 'Duyệt' : 'Từ chối';
  const ok = await confirmDialog({
    title: `${verb} ${reqs.length} yêu cầu tham gia?`,
    text: 'Group: ' + groupPath(g),
    names: reqs.map((r) => personName(r.user)),
    okText: verb,
    danger: action === 'decline',
    sendNote: `Sẽ gửi lên Beincom ngay và không hoàn tác được${reqs.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi người)` : ''}.`,
  });
  if (!ok) return;
  const r = await send({ type: 'act', action, groupId: g.id, requestIds: reqs.map((x) => x.id) }, (n) => `${action === 'approve' ? 'Đã duyệt' : 'Đã từ chối'} ${n} yêu cầu.`, { chunk: ['requestIds'] });
  if (!r?.dryRun) for (const x of reqs) selected.delete(x.id);
  renderReview();
}

// ---------- Thành viên ----------

const MEMBER_PAGE = 50;
const EXPORT_PAGE = 100;
// Danh sách tải theo yêu cầu, chỉ giữ trong trang (không lưu vào storage)
const mem = { groupId: null, key: '', sort: 'joined_at:desc', items: [], adminIds: null, total: null, hasNext: false, nextOffset: 0, loading: false, error: '', tab: 'list', exporting: null };
const act = { groupId: null, items: [], page: 0, hasNext: false, loading: false, error: '', filter: 'all', seenBefore: null };
const selectedMembers = new Set();

function memberGroups() {
  return groups().filter((g) => !g.error && g.communityId);
}

function memberGroup() {
  const gs = memberGroups();
  return gs.find((g) => g.id === mem.groupId) || gs[0] || null;
}

async function loadMembers(reset) {
  const g = memberGroup();
  if (!g || mem.loading) return;
  if (reset) {
    Object.assign(mem, { groupId: g.id, items: [], adminIds: null, total: null, hasNext: false, nextOffset: 0, error: '' });
    selectedMembers.clear();
  }
  mem.loading = true;
  renderMembers();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'members', groupId: g.id, key: mem.key, sort: g.isCommunity ? mem.sort : '', offset: mem.nextOffset, limit: MEMBER_PAGE });
    if (r?.status !== 'ok') mem.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else {
      if (r.adminIds) mem.adminIds = r.adminIds;
      const admins = new Set(mem.adminIds || []);
      mem.items.push(...r.items.map((u) => (g.isCommunity ? { ...u, isAdmin: admins.has(u.id) } : u)));
      Object.assign(mem, { total: r.total, hasNext: r.hasNext, nextOffset: r.nextOffset, error: '' });
    }
  } finally {
    mem.loading = false;
    renderMembers();
  }
}

function memberBadges(u) {
  return el(
    'div',
    { class: 'badges' },
    u.isAdmin ? el('span', { class: 'tag accent', text: 'Admin group' }) : null,
    u.isCommunityAdmin ? el('span', { class: 'tag accent', text: 'Admin community' }) : null,
    u.isVerified ? el('span', { class: 'tag ok', text: '✓ Xác minh' }) : null,
    u.premium ? el('span', { class: 'tag accent', text: 'Premium' }) : null,
    u.nft ? el('span', { class: 'tag accent', text: 'NFT' }) : null,
    u.isDeactivated ? el('span', { class: 'tag err', text: 'Bị vô hiệu' }) : null,
  );
}

function memberCell(u) {
  return el(
    'div',
    { class: 'user' },
    avatarOf(u),
    el('div', {}, el('div', { class: 'name' }, u.fullname || u.username || '(không tên)', violationBadge(u)), u.username ? el('a', { class: 'uname', href: BG.userUrl(u.username), target: '_blank', text: '@' + u.username }) : null, memberBadges(u)),
  );
}

function renderMembersHead() {
  const gs = memberGroups();
  const g = memberGroup();
  $('members-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.userCount != null ? ` (${x.userCount.toLocaleString('vi-VN')})` : '') })));
  $('members-group').disabled = !gs.length;
  setSegActive('members-tab', mem.tab);
  $('members-list-pane').hidden = mem.tab !== 'list';
  $('members-activity-pane').hidden = mem.tab !== 'activity';
  $('members-profiles-pane').hidden = mem.tab !== 'profiles';
  $('members-banned-pane').hidden = mem.tab !== 'banned';
  $('members-group').hidden = mem.tab === 'profiles'; // hồ sơ gom mọi group
  return g;
}

// ---------- Thành viên bị cấm (theo community của group đang chọn) ----------

const ban = { communityId: null, items: [], total: null, hasNext: false, nextOffset: 0, loading: false, error: '', notAdmin: false };
const selectedBanned = new Set();

async function loadBanned(reset = false) {
  const g = memberGroup();
  if (!g || ban.loading) return;
  if (reset || ban.communityId !== g.communityId) Object.assign(ban, { communityId: g.communityId, items: [], total: null, hasNext: false, nextOffset: 0, error: '', notAdmin: false });
  ban.loading = true;
  renderBanned();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'banned', groupId: g.id, offset: ban.nextOffset });
    if (r?.status === 'ok') {
      const seen = new Set(ban.items.map((u) => u.id));
      ban.items.push(...r.items.filter((u) => !seen.has(u.id)));
      Object.assign(ban, { total: r.total, hasNext: r.hasNext, nextOffset: r.nextOffset, error: '' });
    } else Object.assign(ban, { error: r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi', notAdmin: r?.code === 'not_admin' });
  } finally {
    ban.loading = false;
    renderBanned();
  }
}

function renderBanned() {
  const g = renderMembersHead();
  const note = $('banned-note');
  note.classList.toggle('err-text', !!ban.error && !ban.notAdmin);
  note.textContent = ban.error || (g ? `Community: ${g.communityName || g.name}. Gỡ cấm thì người đó xin vào lại được; hồ sơ vi phạm vẫn giữ.` : '');
  $('banned-count').textContent = ban.total != null ? `${ban.items.length}/${ban.total} người` : ban.loading ? 'Đang tải…' : '';
  pruneSelection(selectedBanned, new Set(ban.items.map((u) => u.id)));
  const bulk = () => renderBulk({ set: selectedBanned, shown: ban.items, idOf: (u) => u.id, checkAll: 'banned-check-all', countEl: 'banned-selected', buttons: ['btn-unban'] });
  const body = $('banned-body');
  body.replaceChildren();
  if (!ban.items.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: ban.loading ? 'Đang tải…' : ban.notAdmin ? 'Cần quyền chủ / admin community' : ban.error ? 'Không tải được danh sách' : ban.total === 0 ? 'Không có ai bị cấm 🎉' : 'Bấm "Tải lại" để xem' })));
  for (const u of ban.items) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selectedBanned, u.id, personName(u), bulk)),
        el('td', {}, memberCell(u)),
        el('td', { text: u.reason || '—' }),
        el('td', { title: u.bannedAt ? fmtTime(u.bannedAt) : '', text: u.bannedAt ? ago(u.bannedAt) : '—' }),
        el('td', { class: 'act' }, el('button', { class: 'ghost sm', disabled: busy, text: 'Gỡ cấm', onclick: () => actMembersManage('unban', g, [u]) })),
      ),
    );
  }
  $('btn-banned-more').hidden = !ban.hasNext;
  $('btn-banned-more').disabled = ban.loading;
  bulk();
}

// ---------- Hồ sơ vi phạm ----------

const prof = { key: '', filter: 'all', open: null };

function openProfile(u) {
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

function profileRows() {
  const q = BG.norm(prof.key);
  return Object.values(data.profiles?.users || {})
    .map((p) => ({ p, sum: BG.profileSummary(p) }))
    .filter(({ p, sum }) => sum.total && (prof.filter === 'all' || (prof.filter === 'repeat' ? sum.repeat : sum.severe)) && (!q || BG.norm(`${p.user.fullname} ${p.user.username}`).includes(q)))
    .sort((a, b) => b.sum.score - a.sum.score || b.sum.last.time.localeCompare(a.sum.last.time));
}

function renderProfiles() {
  setSegActive('profiles-filter', prof.filter);
  const rows = profileRows();
  const all = Object.keys(data.profiles?.users || {}).length;
  $('profiles-count').textContent = all ? `${rows.length}/${all} người` : '';
  $('btn-profiles-export').disabled = !rows.length;
  $('profiles-note').textContent = !data.settings.trackViolations
    ? 'Đang tắt "Ghi hồ sơ vi phạm" ở phần Cài đặt.'
    : 'Addon tự ghi khi: bạn ẩn bài / từ chối / xoá / cấm qua addon; nhật ký hoạt động Beincom có người bị xoá, cấm, từ chối (kể cả do admin khác làm); có báo cáo của người dùng; bài bị Beincom gắn cờ; bài vi phạm quy tắc. Báo cáo bị bỏ qua thì không tính. Chỉ lưu trong trình duyệt này.';
  const body = $('profiles-body');
  body.replaceChildren();
  if (!rows.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: all ? 'Không có ai khớp' : 'Chưa có ai trong hồ sơ vi phạm' })));
  for (const { p, sum } of rows) {
    const open = prof.open === p.user.id;
    const toggle = () => {
      prof.open = open ? null : p.user.id;
      renderProfiles();
    };
    body.append(
      el(
        'tr',
        { 'data-user': p.user.id, class: open ? 'vio-open' : null },
        el('td', {}, postAuthor({ ...p.user, id: null })),
        el(
          'td',
          {},
          el(
            'div',
            { class: 'vio-counts' },
            Object.keys(BG.VIOLATION_TYPES)
              .filter((k) => sum.counts[k])
              .map((k) => el('span', { class: 'tag ' + (BG.VIOLATION_TYPES[k].member && k !== 'declined' ? 'err' : k === 'hidden' ? 'warn' : 'info'), text: `${BG.VIOLATION_TYPES[k].label} ${sum.counts[k]}` })),
          ),
        ),
        el('td', { class: 'num' }, el('b', { text: String(sum.score) })),
        el('td', {}, el('div', { title: fmtTime(sum.last.time), text: ago(sum.last.time) }), el('div', { class: 'muted small', text: BG.VIOLATION_TYPES[sum.last.type]?.label + (sum.last.group ? ' · ' + sum.last.group : '') })),
        el(
          'td',
          { class: 'act' },
          el('button', { class: 'ghost sm', text: open ? 'Thu gọn' : 'Chi tiết', 'aria-expanded': open ? 'true' : 'false', onclick: toggle }),
          BG.banTargets(groups()).length ? el('button', { class: 'danger sm', disabled: busy, text: 'Cấm ở mọi community', title: 'Cấm người này ở mọi community bạn là chủ / admin', onclick: () => banEverywhere(p.user) }) : null,
          cleanupBtn(p.user, { always: true }),
          el('button', { class: 'ghost sm danger', disabled: busy, text: 'Xoá hồ sơ', onclick: () => forgetProfile(p) }),
        ),
      ),
    );
    if (open) {
      body.append(
        el(
          'tr',
          { class: 'vio-detail' },
          el(
            'td',
            { colspan: 5 },
            el(
              'table',
              { class: 'vio-events' },
              el(
                'tbody',
                {},
                p.events.map((e) =>
                  el(
                    'tr',
                    {},
                    el('td', { text: fmtTime(e.time) }),
                    el('td', {}, el('b', { text: BG.VIOLATION_TYPES[e.type]?.label || e.type })),
                    el('td', { text: e.group || '' }),
                    el('td', {}, e.snippet ? el('div', { text: '“' + e.snippet + '”' }) : null, e.reason ? el('div', { class: 'muted', text: 'Lý do: ' + e.reason }) : null),
                    el('td', { class: 'muted', text: e.by ? 'Bởi ' + e.by : '' }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }
  }
}

// Cấm ở mọi community mình là chủ / admin (mỗi community một lệnh cấm)
async function banEverywhere(u) {
  if (busy || !u?.id) return;
  const targets = BG.banTargets(groups());
  const select = el('select', {}, Object.entries(BG.BAN_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  select.value = 'SPAM';
  const ok = await confirmDialog({
    title: `Cấm ${personName(u)} ở ${targets.length} community?`,
    text: 'Người bị cấm bị xoá khỏi community và không xin vào lại được (gỡ được ở Thành viên → Bị cấm).',
    names: targets.map((g) => g.communityName || g.name),
    okText: 'Cấm',
    danger: true,
    extra: el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do cấm' })), select),
    sendNote: `Sẽ gửi lên Beincom ngay${targets.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi community)` : ''}.`,
  });
  if (!ok) return;
  return send({ type: 'banEverywhere', user: { id: u.id, username: u.username, fullname: u.fullname }, reason: select.value }, (n) => `Đã cấm ở ${n} community.`);
}

async function forgetProfile(p) {
  const ok = await confirmDialog({
    title: 'Xoá hồ sơ vi phạm của người này?',
    text: 'Chỉ xoá trong addon (trên máy này). Người này sẽ không còn bị cảnh báo khi xin vào group. Vi phạm mới vẫn được ghi lại.',
    names: [personName(p.user)],
    okText: 'Xoá hồ sơ',
    danger: true,
    local: true,
    sendNote: 'Không gửi gì lên Beincom.',
  });
  if (!ok) return;
  if (prof.open === p.user.id) prof.open = null;
  await send({ type: 'profileAct', action: 'forget', userId: p.user.id }, () => 'Đã xoá hồ sơ.');
}

function exportProfiles() {
  const rows = profileRows();
  const cols = [
    { label: 'Họ tên', get: (r) => r.p.user.fullname },
    { label: 'Username', get: (r) => r.p.user.username },
    { label: 'User ID', get: (r) => r.p.user.id },
    { label: 'Điểm', get: (r) => r.sum.score },
    ...Object.entries(BG.VIOLATION_TYPES).map(([k, t]) => ({ label: t.label, get: (r) => r.sum.counts[k] || '' })),
    { label: 'Vi phạm gần nhất', get: (r) => BG.VIOLATION_TYPES[r.sum.last.type]?.label || '' },
    { label: 'Lúc', get: (r) => r.sum.last.time },
    { label: 'Group', get: (r) => r.sum.last.group },
  ];
  download(`beingroup-ho-so-vi-pham-${BG.vnDay()}.csv`, BG.toCsv(rows, cols), 'text/csv;charset=utf-8');
}

function renderMembers() {
  const g = renderMembersHead();
  $('members-sort').hidden = !g?.isCommunity;
  $('members-sort').value = mem.sort;
  if (document.activeElement !== $('members-key')) $('members-key').value = mem.key;
  const shownN = mem.items.length;
  $('members-count').textContent = mem.total != null ? `Đang hiện ${shownN.toLocaleString('vi-VN')}/${mem.total.toLocaleString('vi-VN')}` : mem.loading ? 'Đang tải…' : '';
  $('btn-members-export').disabled = !g || mem.loading || !!mem.exporting;
  if (!mem.exporting) $('btn-members-export').textContent = 'Xuất CSV' + (mem.key ? ' kết quả tìm' : ' toàn bộ');

  const note = $('members-note');
  note.textContent = mem.error || (g && !g.isCommunity ? 'Group con: Beincom không trả ngày vào và số group của thành viên.' : '');
  note.classList.toggle('err-text', !!mem.error);

  pruneSelection(selectedMembers, new Set(mem.items.map((u) => u.id)));
  const canPick = !!g?.canRemove;
  const bulk = () => renderBulk({ set: selectedMembers, shown: canPick ? mem.items : [], idOf: (u) => u.id, checkAll: 'members-check-all', countEl: 'members-selected', buttons: ['btn-members-remove'] });
  $('btn-members-remove').textContent = g?.isCommunity ? 'Xoá đã chọn khỏi community' : 'Xoá đã chọn khỏi group';
  $('btn-members-remove').hidden = !canPick;

  const body = $('members-body');
  body.replaceChildren();
  if (!mem.items.length) {
    const msg = !g ? 'Chưa có dữ liệu' : mem.loading ? 'Đang tải…' : mem.error ? 'Không tải được danh sách' : mem.key ? 'Không tìm thấy ai' : 'Bấm "Tải thêm" để xem danh sách';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: msg })));
  }
  for (const u of mem.items) {
    const actions = [];
    if (g.canAssign) actions.push(el('button', { class: 'ghost sm', disabled: busy, text: u.isAdmin ? 'Gỡ admin' : 'Gán admin', onclick: () => actMembersManage(u.isAdmin ? 'revokeAdmin' : 'assignAdmin', g, [u]) }));
    if (g.canRemove) actions.push(el('button', { class: 'danger sm', disabled: busy, text: 'Xoá', onclick: () => actMembersManage('remove', g, [u]) }));
    if (g.canBan) actions.push(el('button', { class: 'danger sm', disabled: busy, text: 'Cấm', onclick: () => actMembersManage('ban', g, [u]) }));
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, canPick ? rowCheckbox(selectedMembers, u.id, u.fullname || u.username, bulk) : null),
        el('td', {}, memberCell(u)),
        el('td', { title: u.joinedAt ? fmtTime(u.joinedAt) : '', text: u.joinedAt ? ago(u.joinedAt) : '—' }),
        el('td', { class: 'num', text: u.totalJoinedGroup ?? '—' }),
        el('td', { class: 'act' }, actions.length ? actions : el('span', { class: 'muted small', text: 'Không có quyền' })),
      ),
    );
  }
  $('btn-members-more').hidden = !(mem.hasNext || (!mem.items.length && !mem.loading && g && !mem.error && mem.total == null));
  $('btn-members-more').disabled = mem.loading;
  $('btn-members-more').textContent = mem.loading ? 'Đang tải…' : 'Tải thêm';
  bulk();
}

const MANAGE_TEXT = {
  remove: { verb: 'Xoá', title: (n, g) => `Xoá ${n} thành viên khỏi ${g.isCommunity ? 'community' : 'group'}?`, note: 'Họ có thể xin vào lại.', done: 'Đã xoá' },
  assignAdmin: { verb: 'Gán admin', title: (n) => `Gán quyền admin group cho ${n} người?`, note: 'Admin group duyệt được thành viên, bài viết và xoá thành viên.', done: 'Đã gán admin cho' },
  revokeAdmin: { verb: 'Gỡ admin', title: (n) => `Gỡ quyền admin group của ${n} người?`, note: '', done: 'Đã gỡ admin của' },
  ban: { verb: 'Cấm', title: (n) => `Cấm ${n} người khỏi community?`, note: 'Người bị cấm không vào lại được cho tới khi được gỡ cấm (tab Thành viên → Bị cấm).', done: 'Đã cấm' },
  unban: { verb: 'Gỡ cấm', title: (n) => `Gỡ cấm ${n} người?`, note: 'Họ có thể xin vào lại community. Hồ sơ vi phạm vẫn được giữ.', done: 'Đã gỡ cấm' },
};

async function actMembersManage(action, g, users) {
  if (busy || !users.length) return;
  const t = MANAGE_TEXT[action];
  let select = null;
  if (action === 'ban') select = el('select', {}, Object.entries(BG.BAN_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  const extra = select ? el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do cấm' })), select) : null;
  const ok = await confirmDialog({
    title: t.title(users.length, g),
    text: (action === 'ban' || action === 'unban' ? 'Community: ' + (g.communityName || g.name) : 'Group: ' + groupPath(g)) + (t.note ? ' — ' + t.note : ''),
    names: users.map(personName),
    okText: t.verb,
    danger: action === 'remove' || action === 'ban',
    extra,
    sendNote: `Sẽ gửi lên Beincom ngay${users.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi người)` : ''}.`,
  });
  if (!ok) return;
  const r = await send(
    { type: 'memberAct', action, groupId: g.id, users: users.map((u) => ({ id: u.id, username: u.username, fullname: u.fullname })), reason: select?.value },
    (n) => `${t.done} ${n} người.`,
    { chunk: ['users'] },
  );
  const done = new Set(r?.done || []);
  if (action === 'unban') {
    ban.items = ban.items.filter((u) => !done.has(u.id));
    if (ban.total != null) ban.total = Math.max(0, ban.total - done.size);
    for (const id of done) selectedBanned.delete(id);
    return renderBanned();
  }
  if (done.size && mem.groupId === g.id) {
    if (action === 'remove' || action === 'ban') {
      mem.items = mem.items.filter((u) => !done.has(u.id));
      if (mem.total != null) mem.total = Math.max(0, mem.total - done.size);
      for (const id of done) selectedMembers.delete(id);
    } else {
      mem.items = mem.items.map((u) => (done.has(u.id) ? { ...u, isAdmin: action === 'assignAdmin' } : u));
    }
  }
  renderMembers();
  return r;
}

// Xuất CSV: tải lần lượt từng trang 100 người, có thể dừng giữa chừng
async function exportMembers() {
  const g = memberGroup();
  if (!g) return;
  if (mem.exporting) {
    mem.exporting.cancel = true;
    return;
  }
  const est = mem.total ?? g.userCount;
  if (est > 2000 && !confirm(`Tải ${est.toLocaleString('vi-VN')} thành viên (khoảng ${Math.ceil(est / EXPORT_PAGE)} lần gọi, vài phút)? Bấm lại nút để dừng.`)) return;
  const job = { cancel: false };
  mem.exporting = job;
  const btn = $('btn-members-export');
  const rows = [];
  let offset = 0;
  let adminIds = null;
  let error = '';
  try {
    for (;;) {
      btn.textContent = `Đang tải ${rows.length.toLocaleString('vi-VN')}${est ? '/' + est.toLocaleString('vi-VN') : ''}… (bấm để dừng)`;
      const r = await chrome.runtime.sendMessage({ type: 'members', groupId: g.id, key: mem.key, sort: g.isCommunity ? 'joined_at:desc' : '', offset, limit: EXPORT_PAGE });
      if (r?.status !== 'ok') {
        error = r?.message || 'Có lỗi';
        break;
      }
      if (r.adminIds) adminIds = new Set(r.adminIds);
      rows.push(...r.items.map((u) => (g.isCommunity && adminIds ? { ...u, isAdmin: adminIds.has(u.id) } : u)));
      offset = r.nextOffset;
      if (!r.hasNext || !r.items.length || job.cancel) break;
      await new Promise((res) => setTimeout(res, 300));
    }
  } finally {
    mem.exporting = null;
    renderMembers();
  }
  if (rows.length) {
    const yn = (v) => (v ? 'Có' : '');
    const csv = BG.toCsv(rows, [
      { label: 'Họ tên', key: 'fullname' },
      { label: 'Username', key: 'username' },
      { label: 'User ID', key: 'id' },
      { label: 'Vào lúc', get: (u) => u.joinedAt || '' },
      { label: 'Admin group', get: (u) => yn(u.isAdmin) },
      { label: 'Admin community', get: (u) => yn(u.isCommunityAdmin) },
      { label: 'Xác minh', get: (u) => yn(u.isVerified) },
      { label: 'Premium', get: (u) => yn(u.premium) },
      { label: 'NFT', get: (u) => yn(u.nft) },
      { label: 'Số group đã vào', get: (u) => u.totalJoinedGroup ?? '' },
    ]);
    const slug = BG.norm(g.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
    download(`beingroup-thanh-vien-${slug}-${BG.vnDay()}.csv`, csv, 'text/csv;charset=utf-8');
  }
  if (error) toast(`Dừng ở ${rows.length} người vì lỗi: ${error}`, 'err');
  else if (job.cancel) toast(`Đã dừng, xuất ${rows.length} người đã tải.`, 'warn');
  else toast(`Đã xuất ${rows.length} thành viên.`);
}

// ---------- Vào / rời gần đây ----------

async function loadActivity(reset) {
  const g = memberGroup();
  if (!g || act.loading) return;
  if (reset || act.groupId !== g.id) {
    const { activitySeen = {} } = await chrome.storage.local.get('activitySeen');
    Object.assign(act, { groupId: g.id, items: [], page: 0, hasNext: false, error: '', seenBefore: activitySeen[g.id] || null });
  }
  act.loading = true;
  renderActivity();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'activity', groupId: g.id, page: act.page + 1 });
    if (r?.status !== 'ok') act.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else {
      act.items.push(...r.items);
      act.page++;
      act.hasNext = r.hasNext;
      // Ghi nhớ sự kiện mới nhất đã xem: lần mở sau sẽ đánh dấu "Mới" cho sự kiện đến sau
      if (act.page === 1 && r.items[0]?.time) {
        const { activitySeen = {} } = await chrome.storage.local.get('activitySeen');
        await chrome.storage.local.set({ activitySeen: { ...activitySeen, [g.id]: r.items[0].time } });
      }
    }
  } finally {
    act.loading = false;
    renderActivity();
  }
}

function renderActivity() {
  renderMembersHead();
  setSegActive('activity-filter', act.filter);
  const items = act.items.filter((a) => act.filter === 'all' || a.kind === act.filter);
  const d1 = BG.activitySummary(act.items, 24);
  const d7 = BG.activitySummary(act.items, 24 * 7);
  const oldest = act.items.at(-1)?.time;
  $('activity-summary').textContent = act.items.length
    ? `24 giờ qua: +${d1.joined} vào, −${d1.left} rời · 7 ngày: +${d7.joined} / −${d7.left}` + (act.hasNext && oldest && Date.now() - new Date(oldest) < 7 * 864e5 ? ` (mới tải tới ${ago(oldest)})` : '')
    : '';
  $('activity-note').textContent = act.error || (act.seenBefore ? `Viền tím: sự kiện mới từ lần xem trước (${fmtTime(act.seenBefore)}).` : '');
  const body = $('activity-body');
  body.replaceChildren();
  if (!items.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: act.loading ? 'Đang tải…' : act.error ? 'Không tải được nhật ký' : act.items.length ? 'Không có sự kiện nào trong mục này' : 'Chưa có sự kiện' })));
  const KIND_TAG = { in: 'ok', out: 'err', role: 'accent', other: 'info' };
  for (const a of items) {
    const isNew = act.seenBefore && a.time && a.time > act.seenBefore;
    const person = (p) => (p ? el('span', {}, p.fullname || p.username, p.username ? el('a', { class: 'muted small', href: BG.userUrl(p.username), target: '_blank', text: ' @' + p.username }) : null) : '—');
    body.append(
      el(
        'tr',
        { class: isNew ? 'new-row' : null },
        el('td', { title: fmtTime(a.time), text: ago(a.time) }),
        el('td', {}, el('span', { class: 'tag ' + KIND_TAG[a.kind], text: a.label })),
        el('td', {}, person(a.user)),
        el('td', {}, a.actor ? person(a.actor) : el('span', { class: 'muted', text: 'Tự làm' })),
        el('td', { class: 'note', text: a.change }),
      ),
    );
  }
  $('btn-activity-more').hidden = !act.hasNext;
  $('btn-activity-more').disabled = act.loading;
  $('btn-activity-more').textContent = act.loading ? 'Đang tải…' : 'Tải thêm';
}

// ---------- Sự kiện ----------

$('group-select').addEventListener('change', (e) => selectGroup(e.target.value));
onSeg('verdict-filter', (f) => {
  verdictFilter = f;
  renderReview();
});
$('check-all').addEventListener('change', (e) => {
  for (const r of evaluated(currentGroup()).filter((r) => verdictFilter === 'all' || r.ev.verdict === verdictFilter)) e.target.checked ? selected.add(r.req.id) : selected.delete(r.req.id);
  renderReview();
});
for (const [btn, action] of [['btn-approve-selected', 'approve'], ['btn-decline-selected', 'decline']]) {
  $(btn).addEventListener('click', () => {
    const g = currentGroup();
    if (g) actMembers(action, g, g.requests.filter((r) => selected.has(r.id)));
  });
}

$('members-group').addEventListener('change', (e) => {
  mem.groupId = e.target.value;
  mem.key = '';
  if (mem.tab === 'list') loadMembers(true);
  else if (mem.tab === 'activity') loadActivity(true);
  else if (mem.tab === 'banned') loadBanned(true);
});
onSeg('profiles-filter', (f) => {
  prof.filter = f;
  renderProfiles();
});
$('profiles-key').addEventListener('input', (e) => {
  prof.key = e.target.value;
  renderProfiles();
});
$('btn-profiles-export').addEventListener('click', exportProfiles);
$('banned-check-all').addEventListener('change', (e) => {
  for (const u of ban.items) e.target.checked ? selectedBanned.add(u.id) : selectedBanned.delete(u.id);
  renderBanned();
});
$('btn-unban').addEventListener('click', () => {
  const g = memberGroup();
  if (g) actMembersManage('unban', g, ban.items.filter((u) => selectedBanned.has(u.id)));
});
$('btn-banned-more').addEventListener('click', () => loadBanned());
onSeg('members-tab', (f) => {
  mem.tab = f;
  if (f === 'profiles') renderProfiles();
  if (f === 'banned') {
    if (ban.communityId !== memberGroup()?.communityId || ban.total == null) loadBanned(true);
    else renderBanned();
  }
  if (f === 'activity' && (act.groupId !== memberGroup()?.id || !act.items.length)) loadActivity(true);
  if (f === 'list' && (mem.groupId !== memberGroup()?.id || (!mem.items.length && mem.total == null))) loadMembers(true);
  renderMembers();
  renderActivity();
});
$('members-search').addEventListener('submit', (e) => {
  e.preventDefault();
  mem.key = $('members-key').value.trim();
  loadMembers(true);
});
$('members-sort').addEventListener('change', (e) => {
  mem.sort = e.target.value;
  loadMembers(true);
});
$('btn-members-more').addEventListener('click', () => loadMembers(mem.groupId !== memberGroup()?.id));
$('members-check-all').addEventListener('change', (e) => {
  for (const u of mem.items) e.target.checked ? selectedMembers.add(u.id) : selectedMembers.delete(u.id);
  renderMembers();
});
$('btn-members-remove').addEventListener('click', () => {
  const g = memberGroup();
  if (g) actMembersManage('remove', g, mem.items.filter((u) => selectedMembers.has(u.id)));
});
$('btn-members-export').addEventListener('click', exportMembers);
onSeg('activity-filter', (f) => {
  act.filter = f;
  renderActivity();
});
$('btn-activity-more').addEventListener('click', () => loadActivity(false));
