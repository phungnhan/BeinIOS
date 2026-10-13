// Dashboard — tab Thành viên: thẻ Bảo vệ community. Tài khoản giống admin (người mới vào, hoặc tìm trong toàn bộ thành viên)
// và đợt vào ồ ạt do service worker phát hiện sau mỗi lần quét (bg/guard.js, chỉ đọc). Xoá / cấm dùng lại các hộp có sẵn
// (actMembersManage, banEverywhere — có xác nhận, theo Chạy thử); bật Duyệt thành viên dùng actGroupSetting.

const guard = { open: {}, picked: {}, searching: false, note: '' };
const BURST_SHOW_MS = 24 * 3600e3;

const activeBursts = () => Object.values(data.state.bursts || {}).filter((b) => !b.dismissed && Date.now() - b.at < BURST_SHOW_MS);
const impostorList = () => data.state.impostors || [];
const guardGroup = (id) => groups().find((g) => g.id === id) || null;

function adminsAll() {
  const out = new Map();
  for (const list of Object.values(data.state.admins?.byGroup || {})) for (const a of list) out.set(a.id, a);
  return [...out.values()];
}

// Người vào trong cửa sổ của đợt (mỗi người một lần)
function burstJoiners(b) {
  const from = b.at - b.minutes * 60e3;
  const seen = new Set();
  return (data.state.recentJoins?.[b.groupId] || []).filter((j) => {
    const t = Date.parse(j.time);
    if (t < from || t > b.at || !j.user?.id || seen.has(j.user.id)) return false;
    seen.add(j.user.id);
    return true;
  });
}

async function guardAct(msg) {
  if (busy) return;
  const r = await chrome.runtime.sendMessage({ type: 'guardAct', ...msg });
  if (r?.status !== 'ok') toast(r?.message || 'Có lỗi', 'err');
  await loadAll();
}

// Cấm / xoá xong thì bỏ người đó khỏi danh sách tài khoản giống admin
async function guardRemoveDone(r, users) {
  const done = r?.dryRun ? [] : r?.done || (r?.ok ? users.map((u) => u.id) : []);
  if (done.length) await chrome.runtime.sendMessage({ type: 'guardAct', action: 'clear', userIds: done });
  await loadAll();
}

function joinersTable(b, g, joiners) {
  const set = (guard.picked[b.groupId] ||= new Set());
  const imp = new Set(impostorList().map((x) => x.user?.id));
  const users = () => joiners.filter((j) => set.has(j.user.id)).map((j) => j.user);
  const count = el('span', { class: 'muted small', text: `Đã chọn ${set.size}` });
  const refresh = () => renderGuard();
  return el(
    'div',
    { class: 'guard-joiners' },
    el(
      'div',
      { class: 'bulk-bar' },
      el('button', { type: 'button', class: 'ghost sm', text: 'Chọn người không có ảnh', onclick: () => (joiners.filter((j) => !BG.hasAvatar(j.user)).forEach((j) => set.add(j.user.id)), refresh()) }),
      el('button', { type: 'button', class: 'ghost sm', text: 'Bỏ chọn', onclick: () => (set.clear(), refresh()) }),
      count,
      el('span', { class: 'spacer' }),
      g?.canRemove ? el('button', { class: 'danger sm', disabled: busy || !set.size, text: 'Xoá khỏi community', onclick: async () => guardRemoveDone(await actMembersManage('remove', g, users()), users()) }) : null,
      g?.canBan ? el('button', { class: 'danger sm', disabled: busy || !set.size, text: 'Cấm', onclick: async () => guardRemoveDone(await actMembersManage('ban', g, users()), users()) }) : null,
    ),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'requests' },
        el('tbody', {}, ...joiners.map((j) =>
          el(
            'tr',
            {},
            el('td', { class: 'cb' }, rowCheckbox(set, j.user.id, j.user.fullname || j.user.username, refresh)),
            el('td', {}, postAuthor(j.user), !BG.hasAvatar(j.user) ? el('span', { class: 'tag warn', text: 'Không có ảnh' }) : null, imp.has(j.user.id) ? el('span', { class: 'tag err', text: 'Giống admin' }) : null),
            el('td', { class: 'small', title: fmtTime(j.time), text: ago(j.time) }),
          ),
        )),
      ),
    ),
  );
}

function renderBurst(b) {
  const g = guardGroup(b.groupId);
  const joiners = burstJoiners(b);
  const open = !!guard.open[b.groupId];
  const approvalOn = gset.data[b.groupId]?.values?.isJoinApproval;
  return el(
    'div',
    { class: 'guard-burst' },
    el('div', {}, el('span', { class: 'tag err', text: 'Đợt vào ồ ạt' }), el('b', { text: ` ${b.count} người vào ${b.groupName} trong ${b.minutes} phút` }), el('span', { class: 'muted small', text: ` · ${fmtTime(b.from)} – ${fmtTime(b.to)} · ${b.noAvatar} người không có ảnh đại diện` })),
    el(
      'div',
      { class: 'guard-actions' },
      g?.canEditJoin && !approvalOn ? el('button', { class: 'primary sm', disabled: busy, text: 'Bật Duyệt thành viên', title: 'Người mới phải được admin duyệt mới vào được', onclick: () => actGroupSetting('isJoinApproval', true, [g]) }) : null,
      el('button', { class: 'ghost sm', text: open ? 'Thu gọn' : `Xem ${joiners.length} người vừa vào`, onclick: () => ((guard.open[b.groupId] = !open), renderGuard()) }),
      el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => guardAct({ action: 'dismissBurst', groupId: b.groupId }) }),
    ),
    open ? joinersTable(b, g, joiners) : null,
  );
}

function renderGuard() {
  const admins = adminsAll();
  const bursts = activeBursts();
  const imps = impostorList();
  const notes = [];
  if (!data.settings.guardJoins) notes.push('Đang tắt "Bảo vệ: theo dõi người mới vào" (Quy tắc & cài đặt → Theo dõi) — vẫn tìm được trong toàn bộ thành viên bằng nút bên trên.');
  else if (!data.state.admins) notes.push('Chưa có danh sách admin — bấm Quét ngay.');
  else notes.push(`Sau mỗi lần quét, addon xem ai vừa vào và so tên với ${admins.length} admin${admins.length ? ` (${admins.slice(0, 6).map((a) => a.fullname || a.username).join(', ')}${admins.length > 6 ? '…' : ''})` : ''}, cả tên tự nhận "Admin / Hỗ trợ / CSKH". Báo đợt vào ồ ạt khi từ ${data.settings.burstJoins} người vào trong 60 phút.`);
  $('guard-note').textContent = notes.join(' ');
  $('guard').classList.toggle('has-urgent', bursts.length > 0 || imps.some((x) => x.level === 'bad'));
  $('guard-bursts').replaceChildren(...bursts.map(renderBurst));

  const canBanAny = BG.banTargets(groups()).length > 0;
  const body = $('guard-imps');
  body.replaceChildren();
  if (!imps.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: 'Chưa thấy tài khoản nào giống admin 👍' })));
  for (const x of imps) {
    const g = guardGroup(x.groupId);
    body.append(
      el(
        'tr',
        {},
        el('td', {}, postAuthor(x.user)),
        el('td', {}, el('span', { class: 'tag ' + (x.level === 'bad' ? 'err' : 'warn'), text: x.level === 'bad' ? 'Rất giống' : 'Cần xem' }), el('div', { class: 'small', text: x.reason })),
        el('td', { class: 'small' }, el('div', { text: x.groupName }), el('div', { class: 'muted', title: fmtTime(x.at), text: (x.source === 'search' ? 'tìm thấy ' : 'vào ') + ago(x.at) })),
        el(
          'td',
          { class: 'act' },
          canBanAny ? el('button', { class: 'danger sm', disabled: busy, text: 'Cấm ở mọi community', onclick: async () => guardRemoveDone(await banEverywhere(x.user), [x.user]) }) : null,
          g?.canRemove ? el('button', { class: 'danger sm', disabled: busy, text: 'Xoá khỏi group', onclick: async () => guardRemoveDone(await actMembersManage('remove', g, [x.user]), [x.user]) }) : null,
          el('button', { class: 'ghost sm', disabled: busy, text: 'Không phải', title: 'Bỏ khỏi danh sách và không báo lại người này', onclick: () => guardAct({ action: 'notImpostor', userIds: [x.user.id] }) }),
        ),
      ),
    );
  }
  const b = $('btn-guard-search');
  b.disabled = busy || guard.searching || !groups().length;
  b.textContent = guard.searching ? 'Đang tìm…' : '🔍 Tìm trong toàn bộ thành viên';
  $('guard-search-note').textContent = guard.note;
}

async function guardSearch() {
  if (guard.searching || busy) return;
  guard.searching = true;
  guard.note = 'Đang tìm theo tên từng admin và các chữ "admin, hỗ trợ, cskh…" (chỉ đọc)…';
  renderGuard();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'guardSearch' });
    if (r?.status === 'need_login') guard.note = 'Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.';
    else if (r?.status !== 'ok') guard.note = 'Không tìm được: ' + (r?.message || 'lỗi');
    else guard.note = `Đã xem ${r.checked} thành viên có tên giống ${r.admins} admin hoặc có chữ admin / hỗ trợ: ${r.found ? `${r.found} tài khoản đáng ngờ${r.added ? ` (${r.added} mới)` : ''}` : 'không thấy ai đáng ngờ'}.`;
  } finally {
    guard.searching = false;
    await loadAll();
  }
}

// Mở từ thông báo (#tab=members&guard=1)
function openGuard() {
  showTab('members');
  renderGuard();
  $('guard').scrollIntoView({ block: 'start' });
}

$('btn-guard-search').addEventListener('click', guardSearch);
