// Dashboard — tab Đăng bài: chào thành viên mới. Tìm người vào group trong 7 / 14 / 30 ngày rồi soạn sẵn bài chào có @tên vào ô soạn bài.
// Nạp sau dash/compose.js và dash/attach.js (dùng compose, renderComposeGroups, updateCompose, saveDraft).

const welcome = { groupId: null, days: 7, items: [], picked: new Set(), loading: false, loaded: false, error: '', truncated: false, template: null };

function welcomeGroups() {
  return groups().filter((g) => !g.error);
}

function welcomeGroup() {
  const gs = welcomeGroups();
  return gs.find((g) => g.id === welcome.groupId) || gs[0] || null;
}

async function loadWelcomeTemplate() {
  if (welcome.template !== null) return;
  const { welcome: saved } = await chrome.storage.local.get('welcome');
  welcome.template = saved?.template || BG.DEFAULT_WELCOME;
  $('welcome-template').value = welcome.template;
}

function renderWelcome() {
  const gs = welcomeGroups();
  const g = welcomeGroup();
  $('welcome-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name })));
  $('welcome-group').disabled = !gs.length;
  setSegActive('welcome-days', String(welcome.days));
  $('btn-welcome-load').disabled = busy || welcome.loading || !g;
  $('btn-welcome-load').textContent = welcome.loading ? 'Đang tìm…' : 'Tìm người mới';

  const note = $('welcome-note');
  if (welcome.error) note.textContent = welcome.error;
  else if (welcome.loading) note.textContent = 'Đang tìm người mới…';
  else if (!welcome.loaded) note.textContent = 'Chọn group và khoảng ngày rồi bấm Tìm người mới. Addon soạn sẵn bài chào có @tên từng người vào ô soạn bài ở trên; bạn xem lại rồi Đăng hoặc Hẹn giờ.';
  else
    note.textContent =
      `${welcome.items.length} người vào ${g?.name || ''} trong ${welcome.days} ngày` +
      (welcome.truncated ? ' (đã đọc tối đa 500 người / sự kiện gần nhất)' : '') +
      '. Người có hồ sơ vi phạm được bỏ chọn sẵn.' +
      (welcome.picked.size > BG.WELCOME_MAX_MENTIONS ? ` Bài chỉ nhắc tên ${BG.WELCOME_MAX_MENTIONS} người đầu, còn lại ghi "và … bạn khác".` : '');

  const box = $('welcome-people');
  box.replaceChildren(
    ...welcome.items.map((u) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Chọn ' + (u.fullname || u.username) });
      cb.checked = welcome.picked.has(u.id);
      cb.addEventListener('change', () => {
        cb.checked ? welcome.picked.add(u.id) : welcome.picked.delete(u.id);
        renderWelcome();
      });
      return el(
        'label',
        { class: 'welcome-person' + (cb.checked ? '' : ' off') },
        cb,
        el('span', { class: 'wp-name' }, el('b', { text: u.fullname || u.username || '?' }), u.username ? el('span', { class: 'muted', text: ' @' + u.username }) : null, violationBadge(u)),
        el('span', { class: 'muted small', text: u.joinedAt ? 'vào ' + fmtTime(u.joinedAt) : '' }),
      );
    }),
  );
  if (welcome.loaded && !welcome.items.length) box.append(el('div', { class: 'muted small', text: 'Không có ai mới vào trong khoảng này.' }));
  $('welcome-selected').textContent = welcome.loaded ? `Đã chọn ${welcome.picked.size}/${welcome.items.length}` : '';
  $('welcome-check-all').checked = welcome.items.length > 0 && welcome.picked.size === welcome.items.length;
  $('welcome-check-all').disabled = !welcome.items.length;
  const btn = $('btn-welcome-compose');
  btn.disabled = busy || !welcome.picked.size;
  btn.textContent = welcome.picked.size ? `Soạn bài chào (${welcome.picked.size} người)` : 'Soạn bài chào';
}

async function loadWelcome() {
  const g = welcomeGroup();
  if (!g || welcome.loading) return;
  welcome.groupId = g.id;
  welcome.loading = true;
  welcome.error = '';
  renderWelcome();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'newMembers', groupId: g.id, days: welcome.days });
    if (r?.status === 'ok') {
      welcome.items = r.items || [];
      welcome.truncated = !!r.truncated;
      welcome.picked = new Set(welcome.items.filter((u) => !profileOf(u.id)?.events?.length).map((u) => u.id));
      welcome.loaded = true;
    } else welcome.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.' : r?.message || 'Có lỗi khi tìm người mới';
  } finally {
    welcome.loading = false;
    renderWelcome();
  }
}

function composeWelcome() {
  const g = welcomeGroup();
  const users = welcome.items.filter((u) => welcome.picked.has(u.id));
  if (!g || !users.length) return toast('Chưa chọn ai để chào', 'err');
  if (compose.edit) return toast('Đang sửa bài đã đăng — bấm Huỷ sửa trước', 'err');
  if ($('compose-text').value.trim() && !confirm('Thay nội dung đang soạn bằng bài chào thành viên mới?')) return;
  const { text, mentions } = BG.welcomeText($('welcome-template').value, { users, groupName: g.name });
  compose.groupIds = new Set([g.id]);
  compose.mentions = { ...compose.mentions, ...mentions };
  $('compose-text').value = text;
  renderComposeGroups();
  updateCompose();
  saveDraft();
  $('compose').scrollIntoView({ block: 'start' });
  $('compose-text').focus();
  toast(`Đã soạn bài chào ${users.length} người vào ô soạn bài — xem lại rồi bấm Đăng hoặc Hẹn giờ.`);
}

// Mở từ thông báo sáng thứ Hai (#tab=compose&welcome=1)
function openWelcome() {
  showTab('compose');
  $('welcome').scrollIntoView({ block: 'start' });
  if (!welcome.loaded && !welcome.loading) loadWelcome();
}

$('welcome-group').addEventListener('change', (e) => {
  welcome.groupId = e.target.value;
  welcome.items = [];
  welcome.picked.clear();
  welcome.loaded = false;
  welcome.error = '';
  renderWelcome();
});
onSeg('welcome-days', (f) => {
  welcome.days = Number(f);
  welcome.loaded = false;
  welcome.items = [];
  welcome.picked.clear();
  renderWelcome();
});
$('btn-welcome-load').addEventListener('click', loadWelcome);
$('welcome-check-all').addEventListener('change', (e) => {
  welcome.picked = new Set(e.target.checked ? welcome.items.map((u) => u.id) : []);
  renderWelcome();
});
$('btn-welcome-compose').addEventListener('click', composeWelcome);
$('btn-welcome-save').addEventListener('click', async () => {
  welcome.template = $('welcome-template').value.trim() || BG.DEFAULT_WELCOME;
  await chrome.storage.local.set({ welcome: { template: welcome.template } });
  toast('Đã lưu mẫu bài chào.');
});
$('btn-welcome-reset').addEventListener('click', () => {
  $('welcome-template').value = BG.DEFAULT_WELCOME;
});
loadWelcomeTemplate();
