// Dashboard — tab Nhật ký.

// ---------- Nhật ký ----------

const ACTION_LABELS = {
  member: { approve: 'Duyệt thành viên', decline: 'Từ chối thành viên' },
  manage: { remove: 'Xoá thành viên', assignAdmin: 'Gán admin group', revokeAdmin: 'Gỡ admin group', ban: 'Cấm thành viên', unban: 'Gỡ cấm' },
  compose: { publish: 'Đăng bài', schedule: 'Hẹn giờ đăng', reschedule: 'Đổi giờ đăng', cancel: 'Huỷ bài hẹn giờ' },
  post: { approve: 'Duyệt bài', reject: 'Từ chối bài', hide: 'Ẩn bài', delete: 'Xoá bài', pin: 'Ghim bài', unpin: 'Bỏ ghim bài', edit: 'Sửa bài', setting: 'Đổi cài đặt bài' },
  groupSetting: { on: 'Bật cài đặt group', off: 'Tắt cài đặt group' },
  backup: { restore: 'Khôi phục cài đặt' },
  comment: { hide: 'Ẩn bình luận', reply: 'Trả lời bình luận', comment: 'Bình luận vào bài' },
  report: { ignore: 'Bỏ qua báo cáo', hide: 'Ẩn nội dung bị báo cáo', hidePost: 'Ẩn bài gắn cờ' },
};
const STATUS_TAGS = { ok: ['ok', 'Thành công'], dry: ['warn', 'Chạy thử'], error: ['err', 'Lỗi'] };

const kindOf = (e) => e.kind || 'member'; // nhật ký cũ chưa có kind
const actionLabel = (e) => ACTION_LABELS[kindOf(e)]?.[e.action] || e.action;
const isPostKind = (e) => ['post', 'compose', 'report', 'comment'].includes(kindOf(e));
const targetText = (e) =>
  kindOf(e) === 'groupSetting'
    ? BG.GROUP_SETTINGS[e.setting]?.label || e.setting || ''
    : kindOf(e) === 'compose' || kindOf(e) === 'backup'
    ? e.snippet || ''
    : kindOf(e) === 'post' || kindOf(e) === 'report' || kindOf(e) === 'comment'
      ? `${e.fullname || e.username || '?'}: ${e.snippet || ''}`
      : `${e.fullname || ''}${e.username ? ' @' + e.username : ''}`;
const noteText = (e) => [e.asGroup ? 'Dưới tên group' : '', e.scheduledAt ? 'Giờ đăng: ' + fmtTime(e.scheduledAt) : '', e.reason ? 'Lý do: ' + e.reason : '', e.autoReason || '', e.message || ''].filter(Boolean).join(' · ');

function filteredLog() {
  // "Thành viên" gồm cả duyệt yêu cầu và xoá / gán admin / cấm; "Bài viết" gồm cả kiểm duyệt và đăng bài
  const kindMatch = (e) => kindOf(e) === logFilter || (logFilter === 'member' && kindOf(e) === 'manage') || (logFilter === 'post' && isPostKind(e));
  return data.log.filter((e) => logFilter === 'all' || kindMatch(e) || e.status === logFilter);
}

function renderLog() {
  setSegActive('log-filter', logFilter);
  const rows = filteredLog();
  const body = $('log-body');
  body.replaceChildren();
  if (!rows.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: 'Chưa có thao tác nào' })));
  for (const e of rows.slice(0, logLimit)) {
    const [cls, label] = STATUS_TAGS[e.status] || ['info', e.status];
    const target =
      isPostKind(e)
        ? el('td', { class: 'note' }, e.contentId ? el('a', { href: BG.postUrl({ id: e.contentId, type: e.contentType }), target: '_blank', text: targetText(e) }) : targetText(e))
        : el('td', {}, e.fullname || '', e.username ? el('span', { class: 'muted small', text: ' @' + e.username }) : null);
    body.append(
      el(
        'tr',
        {},
        el('td', { text: fmtTime(e.time) }),
        el('td', { text: e.source === 'auto' ? 'Tự động' : 'Bấm tay' }),
        el('td', { text: actionLabel(e) }),
        el('td', {}, el('span', { class: 'tag ' + cls, text: label })),
        el('td', { text: e.communityName && e.communityName !== e.groupName ? `${e.communityName} › ${e.groupName}` : e.groupName }),
        target,
        el('td', { class: 'note', text: noteText(e) }),
      ),
    );
  }
  $('btn-more').hidden = rows.length <= logLimit;
}

const LOG_COLUMNS = [
  { label: 'Thời gian', get: (e) => new Date(e.time).toISOString() },
  { label: 'Nguồn', get: (e) => (e.source === 'auto' ? 'Tự động' : 'Bấm tay') },
  { label: 'Thao tác', get: actionLabel },
  { label: 'Kết quả', get: (e) => STATUS_TAGS[e.status]?.[1] || e.status },
  { label: 'Community', key: 'communityName' },
  { label: 'Group', key: 'groupName' },
  { label: 'Họ tên', key: 'fullname' },
  { label: 'Username', key: 'username' },
  { label: 'User ID', key: 'userId' },
  { label: 'ID bài', key: 'contentId' },
  { label: 'Nội dung bài', key: 'snippet' },
  { label: 'Lý do', key: 'reason' },
  { label: 'Giờ đăng', key: 'scheduledAt' },
  { label: 'Ghi chú', key: 'message' },
];

$('log-filter').addEventListener('click', (e) => {
  const f = e.target.closest('button')?.dataset.f;
  if (!f) return;
  logFilter = f;
  logLimit = LOG_PAGE;
  renderLog();
});
$('btn-more').addEventListener('click', () => {
  logLimit += LOG_PAGE;
  renderLog();
});
$('btn-export-csv').addEventListener('click', () => download(`beingroup-nhat-ky-${BG.vnDay()}.csv`, BG.toCsv(filteredLog(), LOG_COLUMNS), 'text/csv;charset=utf-8'));
$('btn-export-json').addEventListener('click', () => download(`beingroup-nhat-ky-${BG.vnDay()}.json`, JSON.stringify(filteredLog(), null, 2), 'application/json'));
$('btn-clear').addEventListener('click', async () => {
  if (!confirm('Xoá toàn bộ nhật ký thao tác? Không khôi phục được.')) return;
  await chrome.storage.local.set({ log: [] });
});
