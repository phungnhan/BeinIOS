// Dashboard — tab Bài viết: thẻ Quản lý tag. Mỗi community một danh sách tag (theo group gốc) kèm số bài đang dùng;
// tạo tag, đổi tên, xoá giống web Beincom (chỉ tag chưa gắn vào bài nào mới sửa / xoá được, cần quyền quản lý tag).

const tagAdmin = { groupId: null, data: {}, loading: false, error: '', search: '' };

const tagCommunities = () => groups().filter((g) => g.isCommunity && !g.error);

function tagGroup() {
  const gs = tagCommunities();
  return gs.find((g) => g.id === tagAdmin.groupId) || gs[0] || null;
}

async function loadTagAdmin() {
  const g = tagGroup();
  if (!g || tagAdmin.loading) return;
  tagAdmin.groupId = g.id;
  tagAdmin.loading = true;
  tagAdmin.error = '';
  renderTagAdmin();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'tags', groupId: g.id });
    if (r?.status !== 'ok') tagAdmin.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Có lỗi';
    else tagAdmin.data[g.id] = { tags: r.tags, canManage: r.canManage, at: Date.now() };
  } finally {
    tagAdmin.loading = false;
    renderTagAdmin();
  }
}

function renderTagAdmin() {
  const gs = tagCommunities();
  const g = tagGroup();
  $('tags-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: x.communityName || x.name })));
  $('tags-group').disabled = !gs.length || tagAdmin.loading;
  const d = g ? tagAdmin.data[g.id] : null;
  // Mở thẻ lần đầu (hoặc đổi community): tự đọc
  if (g && !d && !tagAdmin.loading && !tagAdmin.error) {
    loadTagAdmin();
    return;
  }
  const can = d?.canManage;
  const note = $('tags-note');
  note.classList.toggle('err-text', !!tagAdmin.error);
  note.textContent = !gs.length
    ? data.state.snapshot
      ? 'Bạn không quản trị group gốc của community nào.'
      : ''
    : tagAdmin.error ||
      (tagAdmin.loading
        ? 'Đang tải…'
        : can === false
          ? 'Bạn không có quyền quản lý tag ở community này (thường cần chủ hoặc admin community) — chỉ xem được.'
          : 'Giống web Beincom: chỉ đổi tên / xoá được tag chưa gắn vào bài nào. Tên tag 3–32 ký tự, tự viết hoa.' + (can == null ? ' Chưa đọc được quyền quản lý tag: cứ thử, Beincom sẽ báo nếu không được.' : ''));
  $('tags-new').disabled = $('btn-tag-create').disabled = !d || can === false || busy;
  const all = d?.tags || [];
  $('tags-count').textContent = d ? `${all.length} tag` : '';
  const q = BG.norm($('tags-search').value);
  const shown = all.filter((t) => !q || BG.norm(t.name).includes(q)).sort((a, b) => (b.totalUsed || 0) - (a.totalUsed || 0) || a.name.localeCompare(b.name));
  const body = $('tags-body');
  body.replaceChildren();
  if (!shown.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 3, text: tagAdmin.loading ? 'Đang tải…' : !d ? 'Chưa có dữ liệu' : all.length ? 'Không có tag nào khớp' : 'Community chưa có tag nào' })));
  for (const t of shown) {
    const used = Number(t.totalUsed) || 0;
    const lock = can === false ? 'Không có quyền quản lý tag' : used ? `Tag đang gắn vào ${used} bài — Beincom chỉ cho đổi tên / xoá tag chưa dùng` : '';
    body.append(
      el(
        'tr',
        {},
        el('td', {}, el('span', { class: 'tag accent', text: '#' + t.name })),
        el('td', { class: 'num', text: used.toLocaleString('vi-VN') }),
        el(
          'td',
          { class: 'act' },
          el('a', { href: BG.tagSearchUrl(t.name, g), target: '_blank', title: 'Mở trang tìm các bài gắn tag này trong community', text: 'Xem bài ↗' }),
          el('button', { class: 'ghost sm', disabled: busy || !!lock, title: lock || 'Đổi tên tag', text: 'Đổi tên', onclick: () => renameTag(g, t) }),
          el('button', { class: 'danger sm', disabled: busy || !!lock, title: lock || 'Xoá tag', text: 'Xoá', onclick: () => deleteTag(g, t) }),
        ),
      ),
    );
  }
}

async function tagActDone(r) {
  if (r?.status === 'ok' && !r.dryRun) {
    delete tagAdmin.data[tagAdmin.groupId];
    await loadTagAdmin();
  }
}

async function createTag() {
  const g = tagGroup();
  const list = tagAdmin.data[g?.id]?.tags || [];
  const name = BG.tagName($('tags-new').value);
  const err = BG.validateTagName(name, list);
  if (err) return toast(err, 'err');
  const ok = await confirmDialog({ title: `Tạo tag #${name}?`, text: `Ở ${g.communityName || g.name}. Thành viên chọn được tag này khi đăng bài.`, okText: 'Tạo tag' });
  if (!ok) return;
  const r = await send({ type: 'tagAct', action: 'create', groupId: g.id, name }, () => `Đã tạo tag #${name}.`);
  if (r?.status === 'ok' && !r.dryRun) $('tags-new').value = '';
  await tagActDone(r);
}

async function renameTag(g, t) {
  const input = el('input', { type: 'text', maxlength: String(BG.TAG_NAME_MAX), 'aria-label': 'Tên mới' });
  input.value = t.name;
  input.addEventListener('input', () => (input.value = input.value.toUpperCase()));
  const ok = await confirmDialog({
    title: `Đổi tên tag #${t.name}?`,
    text: `Ở ${g.communityName || g.name}. Tên tag 3–32 ký tự, tự viết hoa.`,
    okText: 'Đổi tên',
    extra: el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Tên mới' })), input),
  });
  if (!ok) return;
  const name = BG.tagName(input.value);
  if (name === BG.tagName(t.name)) return;
  const err = BG.validateTagName(name, tagAdmin.data[g.id]?.tags || [], t.id);
  if (err) return toast(err, 'err');
  const r = await send({ type: 'tagAct', action: 'rename', groupId: g.id, tagId: t.id, name, oldName: t.name }, () => `Đã đổi tên #${t.name} thành #${name}.`);
  await tagActDone(r);
}

async function deleteTag(g, t) {
  const ok = await confirmDialog({ title: `Xoá tag #${t.name}?`, text: `Ở ${g.communityName || g.name}. Tag chưa gắn vào bài nào nên không ảnh hưởng bài đã đăng.`, okText: 'Xoá tag', danger: true });
  if (!ok) return;
  const r = await send({ type: 'tagAct', action: 'delete', groupId: g.id, tagId: t.id, oldName: t.name }, () => `Đã xoá tag #${t.name}.`);
  await tagActDone(r);
}

$('tags-group').addEventListener('change', (e) => {
  tagAdmin.groupId = e.target.value;
  tagAdmin.error = '';
  renderTagAdmin();
});
$('tags-search').addEventListener('input', () => renderTagAdmin());
$('tags-new').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase()));
$('tags-new').addEventListener('keydown', (e) => e.key === 'Enter' && createTag());
$('btn-tag-create').addEventListener('click', createTag);
$('btn-tags-reload').addEventListener('click', () => {
  tagAdmin.error = '';
  delete tagAdmin.data[tagGroup()?.id];
  loadTagAdmin();
});
