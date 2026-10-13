// Dashboard — Bắt đầu nhanh: hướng dẫn 3 bước cho người mới cài (kết nối Beincom, tự kiểm tra, chọn tính năng).
// Tự hiện khi cài mới (chưa có `onboarded`, `seenVersion`, nhật ký); mở lại ở chân trang. Xong thì ghi `onboarded`.

const onb = { step: 1, check: null, checking: false };
// Tính năng chọn ở bước 3: khoá cài đặt, nhãn, mô tả; group = cần chọn group (bài nhắc / bài thảo luận)
const ONB_FEATURES = [
  { keys: ['weeklyReport', 'monthlyReport'], label: 'Tóm tắt tuần và báo cáo tháng', note: 'Thông báo sáng thứ Hai và đầu tháng; chỉ đọc.' },
  { keys: ['selfCheckDaily'], label: 'Tự kiểm tra mỗi ngày', note: 'Báo khi một tính năng đang chạy bị lỗi (thường do Beincom thay đổi); chỉ đọc.' },
  { keys: ['welcomeReminder'], label: 'Nhắc chào thành viên mới', note: 'Sáng thứ Hai nhắc soạn bài chào người mới vào.' },
  { keys: ['nudgeWeekly'], group: 'nudgeGroupId', label: 'Soạn sẵn bài nhắc người mới chưa hoạt động', note: 'Sáng thứ Hai soạn sẵn; bạn tự xem rồi đăng.' },
  { keys: ['promptWeekly'], group: 'promptGroupId', label: 'Soạn sẵn bài thảo luận hằng tuần', note: 'Câu hỏi mồi kèm giờ gợi ý; bạn tự xem rồi hẹn giờ.' },
  { keys: ['autoHideSpam'], label: 'Tự ẩn bài / bình luận có link tới tên miền cấm', note: 'Cần thêm tên miền cấm ở Quy tắc bài viết.' },
  { keys: ['autoApprove'], label: 'Tự duyệt yêu cầu tham gia đạt quy tắc', note: 'Chỉ yêu cầu được gợi ý "Duyệt".' },
];

async function checkOnboarding() {
  const { onboarded, seenVersion, log } = await chrome.storage.local.get(['onboarded', 'seenVersion', 'log']);
  if (onboarded || seenVersion || (log || []).length) return false;
  openOnboarding();
  return true;
}

function openOnboarding() {
  onb.step = 1;
  renderOnboarding();
  if (!$('onboard').open) $('onboard').showModal();
}

function renderOnboarding() {
  for (const s of document.querySelectorAll('#onboard [data-step]')) s.hidden = Number(s.dataset.step) !== onb.step;
  $('onb-progress').textContent = `Bước ${onb.step}/3`;
  $('onb-back').hidden = onb.step === 1;
  $('onb-next').textContent = onb.step === 3 ? 'Hoàn tất' : 'Tiếp →';

  // Bước 1: kết nối
  const gs = groups().filter((g) => !g.error);
  const needLogin = data.state.lastResult?.status === 'need_login';
  $('onb-login').textContent = needLogin || !gs.length ? 'Chưa thấy phiên đăng nhập Beincom (hoặc chưa quét lần nào). Mở beincom.com, đăng nhập bằng tài khoản admin trên chính trình duyệt này, rồi bấm Quét lại.' : `✓ Đã kết nối. Addon thấy ${gs.length} group bạn quản trị: ${gs.slice(0, 6).map((g) => g.name).join(', ')}${gs.length > 6 ? '…' : ''}.`;
  $('onb-login').classList.toggle('err-text', needLogin || !gs.length);

  // Bước 2: tự kiểm tra
  const cs = statsGroups();
  const cur = $('onb-check-group').value;
  $('onb-check-group').replaceChildren(...cs.map((g) => el('option', { value: g.id, selected: g.id === cur, text: BG.groupIndent(g) + g.name })));
  $('onb-check-run').disabled = !cs.length || onb.checking;
  $('onb-check-run').textContent = onb.checking ? 'Đang kiểm tra…' : '▶ Chạy kiểm tra';
  const r = onb.check;
  const fails = (r?.items || []).filter((x) => x.status === 'fail');
  $('onb-check-out').textContent = !r ? 'Addon gọi thử (chỉ đọc) các API mà từng tính năng dùng. Có thể bỏ qua bước này.' : r.status !== 'ok' ? r.message || 'Không kiểm tra được' : `${r.summary.ok} dùng được · ${r.summary.skip} bỏ qua (không có quyền) · ${r.summary.fail} lỗi${fails.length ? ': ' + fails.map((x) => x.label).join(', ') + ' — xem chi tiết ở Nhật ký → Tự kiểm tra và gửi cho người hỗ trợ.' : '.'}`;

  // Bước 3: tính năng
  const st = data.settings;
  $('onb-group').replaceChildren(...cs.map((g) => el('option', { value: g.id, selected: g.id === (st.nudgeGroupId || st.promptGroupId || cur), text: BG.groupIndent(g) + g.name })));
  $('onb-features').replaceChildren(
    ...ONB_FEATURES.map((f, i) => el('label', { class: 'check onb-feature' }, el('input', { type: 'checkbox', 'data-i': i, checked: f.keys.every((k) => !!st[k]) }), el('span', {}, el('b', { text: f.label }), el('br'), el('span', { class: 'muted small', text: f.note })))),
  );
  $('onb-dry').checked = st.dryRun !== false;
  usageEndpointUrl().then((url) => ($('onb-usage-row').hidden = !url));
}

async function finishOnboarding() {
  // Gửi báo cáo sử dụng: xin quyền ngay trong lúc bấm (trước mọi việc khác)
  const share = !$('onb-usage-row').hidden && $('onb-usage').checked;
  const shareDone = share ? acceptUsage() : !$('onb-usage-row').hidden ? declineUsage() : null;
  const patch = { dryRun: $('onb-dry').checked };
  const gid = $('onb-group').value;
  for (const box of document.querySelectorAll('#onb-features input[data-i]')) {
    const f = ONB_FEATURES[Number(box.dataset.i)];
    for (const k of f.keys) patch[k] = box.checked;
    if (f.group && box.checked && gid) patch[f.group] = gid;
  }
  await saveTo('settings', BG.DEFAULT_SETTINGS, patch);
  Object.assign(data.settings, patch);
  await chrome.storage.local.set({ onboarded: true, seenVersion: chrome.runtime.getManifest().version });
  await shareDone;
  $('onboard').close();
  renderAll();
  toast(patch.dryRun ? 'Xong! Addon đang Chạy thử: mọi thao tác chỉ ghi Nhật ký. Tắt ở Quy tắc & cài đặt khi đã quen.' : 'Xong! Chạy thử đã tắt — thao tác sẽ gửi thật lên Beincom (luôn hỏi lại trước).');
}

$('onb-next').addEventListener('click', (e) => {
  e.preventDefault();
  if (onb.step < 3) {
    onb.step++;
    renderOnboarding();
  } else finishOnboarding();
});
$('onb-back').addEventListener('click', (e) => {
  e.preventDefault();
  onb.step = Math.max(1, onb.step - 1);
  renderOnboarding();
});
$('onb-skip').addEventListener('click', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ onboarded: true, seenVersion: chrome.runtime.getManifest().version });
  $('onboard').close();
});
$('onb-rescan').addEventListener('click', async () => {
  const b = $('onb-rescan');
  b.disabled = true;
  b.textContent = 'Đang quét…';
  try {
    await chrome.runtime.sendMessage({ type: 'scan', source: 'dashboard' });
    await loadAll();
  } finally {
    b.disabled = false;
    b.textContent = '↻ Quét lại';
    renderOnboarding();
  }
});
$('onb-check-run').addEventListener('click', async () => {
  const gid = $('onb-check-group').value;
  if (!gid) return;
  onb.checking = true;
  renderOnboarding();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'selfCheck', groupId: gid });
    onb.check = r?.status === 'ok' ? r : { status: 'error', message: r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn — đăng nhập lại rồi thử lại.' : r?.message || 'Có lỗi' };
    if (r?.status === 'ok') Object.assign(check, { result: r, groupId: gid });
  } finally {
    onb.checking = false;
    renderOnboarding();
  }
});
$('onb-open').addEventListener('click', () => window.open(BG.SITE + '/', '_blank', 'noopener'));
$('btn-onboard').addEventListener('click', (e) => {
  e.preventDefault();
  openOnboarding();
});
