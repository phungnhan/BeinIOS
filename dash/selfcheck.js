// Dashboard — tab Nhật ký: Tự kiểm tra. Service worker gọi thử (chỉ GET) các API đọc mà từng tính năng dùng
// (bg/selfcheck.js), kết quả lần gần nhất lưu ở khoá `selfCheck`.

const check = { groupId: null, running: false, result: null, stored: false, error: '' };
const CHECK_TAG = { ok: ['ok', '✓ Dùng được'], skip: ['info', 'Bỏ qua'], fail: ['err', '✗ Lỗi'] };

function checkGroup() {
  const gs = statsGroups();
  return gs.find((g) => g.id === check.groupId) || gs[0] || null;
}

async function renderCheck() {
  if (!check.stored) {
    check.stored = true;
    try {
      check.result = (await chrome.storage.local.get('selfCheck')).selfCheck || null;
    } catch {}
    if (check.result && !check.groupId) check.groupId = check.result.group?.id || null;
  }
  const gs = statsGroups();
  const g = checkGroup();
  $('check-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.isCommunity ? ' (cả community)' : '') })));
  $('check-group').disabled = $('btn-check-run').disabled = !g || check.running;
  $('btn-check-run').textContent = check.running ? 'Đang kiểm tra…' : '▶ Chạy kiểm tra';
  const r = check.result;
  $('btn-check-copy').disabled = $('btn-check-tg').disabled = !r || check.running;

  const note = $('check-note');
  note.classList.toggle('err-text', !!check.error);
  if (check.running) note.textContent = 'Đang gọi thử các API của Beincom (chỉ đọc, khoảng 5–20 giây)…';
  else if (check.error) note.textContent = check.error;
  else if (!g) note.textContent = data.state.snapshot ? 'Không có group nào để kiểm tra.' : 'Chưa quét lần nào — bấm Quét ngay trước.';
  else if (!r) note.textContent = 'Bấm Chạy kiểm tra: addon gọi thử (chỉ đọc) các API mà từng tính năng dùng với group đã chọn, rồi báo mục nào dùng được. Nên chạy sau khi cài / cập nhật, hoặc khi có tính năng không chạy.';
  else {
    const s = r.summary;
    note.textContent = `${r.group.name} · lúc ${fmtTime(r.at)} · ${s.ok} dùng được · ${s.skip} bỏ qua · ${s.fail} lỗi.` + (s.fail ? ' Bấm Sao chép kết quả và gửi cho người hỗ trợ.' : s.skip ? ' "Bỏ qua" là mục tài khoản này không có quyền hoặc chưa bật — tính năng tương ứng sẽ ẩn.' : ' Mọi mục đều dùng được.');
  }

  const body = $('check-body');
  body.replaceChildren();
  if (!r) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: 'Chưa chạy lần nào' })));
  for (const x of r?.items || []) {
    const [cls, text] = CHECK_TAG[x.status] || ['info', x.status];
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'nowrap' }, el('b', { text: x.label })),
        el('td', { class: 'small', text: x.uses || '' }),
        el('td', {}, el('span', { class: 'tag ' + cls, text })),
        el('td', { class: 'small', title: x.path ? `${x.httpStatus || ''} ${x.path} · ${x.ms} ms` : '', text: x.detail || '' }),
      ),
    );
  }
}

async function runCheck() {
  const g = checkGroup();
  if (!g || check.running) return;
  Object.assign(check, { groupId: g.id, running: true, error: '' });
  renderCheck();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'selfCheck', groupId: g.id });
    if (r?.status === 'ok') check.result = r;
    else check.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn — đăng nhập lại rồi chạy kiểm tra.' : r?.message || 'Có lỗi';
  } finally {
    check.running = false;
    renderCheck();
  }
}

$('check-group').addEventListener('change', (e) => {
  check.groupId = e.target.value;
  renderCheck();
});
$('btn-check-run').addEventListener('click', runCheck);
$('btn-check-copy').addEventListener('click', async () => {
  if (!check.result) return;
  const ok = await copyText(BG.selfCheckText(check.result, { version: chrome.runtime.getManifest().version, ua: navigator.userAgent }));
  toast(ok ? 'Đã sao chép kết quả kiểm tra — dán vào tin nhắn cho người hỗ trợ.' : 'Không sao chép được — trình duyệt chặn bộ nhớ tạm', ok ? 'ok' : 'err');
});
// Gửi kết quả vào chat Telegram đã cài (dùng chung với báo cáo tháng: bg/telegram.js doTelegramReport)
$('btn-check-tg').addEventListener('click', async () => {
  const r = check.result;
  if (!r) return;
  const b = $('btn-check-tg');
  b.disabled = true;
  try {
    const s = r.summary;
    const text = BG.selfCheckText(r, { version: chrome.runtime.getManifest().version, ua: navigator.userAgent });
    const res = await chrome.runtime.sendMessage({ type: 'telegramReport', title: `BeinGroup: tự kiểm tra ${r.group.name} — ${s.fail ? s.fail + ' lỗi' : 'không có lỗi'}`, text });
    toast(res?.status === 'ok' ? 'Đã gửi kết quả kiểm tra về Telegram.' : res?.message || 'Không gửi được', res?.status === 'ok' ? 'ok' : 'err');
  } finally {
    b.disabled = false;
  }
});
