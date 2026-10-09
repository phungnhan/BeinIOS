// Dashboard — tab Đăng bài: vinh danh thành viên tích cực. Đọc bài trong 7 / 30 ngày (như tab Thống kê) cùng bình luận addon đã đọc,
// xếp hạng theo điểm rồi soạn sẵn bài cảm ơn có @tên vào ô soạn bài. Nạp sau dash/welcome.js.

const shout = { groupId: null, days: 7, top: 5, rows: [], picked: new Set(), loading: false, loaded: false, error: '', template: null, scanned: 0 };
const SHOUT_CANDIDATES = 20;

function shoutGroup() {
  const gs = welcomeGroups();
  return gs.find((g) => g.id === shout.groupId) || gs[0] || null;
}

async function loadShoutTemplate() {
  if (shout.template !== null) return;
  const { shoutout } = await chrome.storage.local.get('shoutout');
  shout.template = shoutout?.template || BG.DEFAULT_SHOUTOUT;
  $('shout-template').value = shout.template;
}

// Chọn sẵn N người điểm cao nhất, bỏ người có hồ sơ vi phạm (vẫn tick tay được)
function pickTop() {
  shout.picked = new Set(shout.rows.filter((r) => !profileOf(r.user.id)?.events?.length).slice(0, shout.top).map((r) => r.user.id));
}

function renderShoutout() {
  const gs = welcomeGroups();
  const g = shoutGroup();
  $('shout-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.isCommunity ? ' (cả community)' : '') })));
  $('shout-group').disabled = !gs.length;
  setSegActive('shout-days', String(shout.days));
  setSegActive('shout-top', String(shout.top));
  $('btn-shout-load').disabled = busy || shout.loading || !g;
  $('btn-shout-load').textContent = shout.loading ? 'Đang đọc bài…' : 'Tìm người tích cực';

  const note = $('shout-note');
  if (shout.error) note.textContent = shout.error;
  else if (shout.loading) note.textContent = 'Đang đọc bài trong khoảng ngày đã chọn (có thể mất vài giây)…';
  else if (!shout.loaded) note.textContent = 'Chọn group, khoảng ngày rồi bấm Tìm người tích cực. Điểm = 5 × số bài + số bình luận đã viết + nửa số cảm xúc bài nhận được. Bình luận chỉ tính những bài addon đã đọc bình luận.';
  else note.textContent = `Từ ${shout.scanned} bài trong ${shout.days} ngày ở ${g?.name || ''}${g?.isCommunity ? ' và các group con bạn quản trị' : ''}. Tick chọn người cần vinh danh (mặc định ${shout.top} người điểm cao nhất, bỏ người có hồ sơ vi phạm).`;

  const n = (x) => Number(x || 0).toLocaleString('vi-VN');
  const body = $('shout-body');
  body.replaceChildren(
    ...shout.rows.map((r, i) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Chọn ' + (r.user.fullname || r.user.username) });
      cb.checked = shout.picked.has(r.user.id);
      cb.addEventListener('change', () => {
        cb.checked ? shout.picked.add(r.user.id) : shout.picked.delete(r.user.id);
        renderShoutout();
      });
      return el(
        'tr',
        { class: cb.checked ? null : 'muted-row' },
        el('td', { class: 'cb' }, cb),
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', {}, el('div', { class: 'gcell' }, postAuthor(r.user), violationBadge(r.user))),
        el('td', { class: 'num', text: n(r.posts) }),
        el('td', { class: 'num', text: n(r.comments) }),
        el('td', { class: 'num', text: n(r.reactions) }),
        el('td', { class: 'num', text: n(r.replies) }),
        el('td', { class: 'num' }, el('b', { text: n(r.score) })),
      );
    }),
  );
  if (!shout.rows.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 8, text: shout.loaded ? 'Không có ai đăng bài / bình luận trong khoảng này.' : 'Chưa tìm' })));
  const btn = $('btn-shout-compose');
  btn.disabled = busy || !shout.picked.size;
  btn.textContent = shout.picked.size ? `Soạn bài vinh danh (${shout.picked.size} người)` : 'Soạn bài vinh danh';
  $('shout-selected').textContent = shout.loaded ? `Đã chọn ${shout.picked.size}/${shout.rows.length}` : '';
}

async function loadShoutout() {
  const g = shoutGroup();
  if (!g || shout.loading) return;
  shout.groupId = g.id;
  shout.loading = true;
  shout.error = '';
  renderShoutout();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'stats', groupId: g.id, days: shout.days });
    if (r?.status === 'ok') {
      const since = Date.now() - shout.days * 864e5;
      const scope = new Set(g.isCommunity ? groups().filter((x) => x.communityId === g.communityId).map((x) => x.id) : [g.id]);
      const comments = (data.state.recentComments || []).filter((c) => (c.seenIn || []).some((id) => scope.has(id)));
      shout.rows = BG.topMembers({ posts: r.posts || [], comments, since, skipIds: [data.state.me?.id], limit: SHOUT_CANDIDATES });
      shout.scanned = (r.posts || []).length;
      pickTop();
      shout.loaded = true;
    } else shout.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.' : r?.message || 'Có lỗi khi đọc bài';
  } finally {
    shout.loading = false;
    renderShoutout();
  }
}

function composeShoutout() {
  const g = shoutGroup();
  const rows = shout.rows.filter((r) => shout.picked.has(r.user.id));
  if (!g || !rows.length) return toast('Chưa chọn ai để vinh danh', 'err');
  if (compose.edit) return toast('Đang sửa bài đã đăng — bấm Huỷ sửa trước', 'err');
  if ($('compose-text').value.trim() && !confirm('Thay nội dung đang soạn bằng bài vinh danh?')) return;
  const { text, mentions } = BG.shoutoutText($('shout-template').value, { rows, groupName: g.name });
  compose.groupIds = new Set([g.id]);
  compose.mentions = { ...compose.mentions, ...mentions };
  $('compose-text').value = text;
  renderComposeGroups();
  updateCompose();
  saveDraft();
  $('compose').scrollIntoView({ block: 'start' });
  $('compose-text').focus();
  toast(`Đã soạn bài vinh danh ${rows.length} người vào ô soạn bài — xem lại rồi bấm Đăng hoặc Hẹn giờ.`);
}

const resetShout = () => {
  shout.rows = [];
  shout.picked.clear();
  shout.loaded = false;
  shout.error = '';
  renderShoutout();
};
$('shout-group').addEventListener('change', (e) => {
  shout.groupId = e.target.value;
  resetShout();
});
onSeg('shout-days', (f) => {
  shout.days = Number(f);
  resetShout();
});
onSeg('shout-top', (f) => {
  shout.top = Number(f);
  pickTop();
  renderShoutout();
});
$('btn-shout-load').addEventListener('click', loadShoutout);
$('btn-shout-compose').addEventListener('click', composeShoutout);
$('btn-shout-save').addEventListener('click', async () => {
  shout.template = $('shout-template').value.trim() || BG.DEFAULT_SHOUTOUT;
  await chrome.storage.local.set({ shoutout: { template: shout.template } });
  toast('Đã lưu mẫu bài vinh danh.');
});
$('btn-shout-reset').addEventListener('click', () => {
  $('shout-template').value = BG.DEFAULT_SHOUTOUT;
});
loadShoutTemplate();
