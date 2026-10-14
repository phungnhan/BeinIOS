// Dashboard — tab Nhật ký: Báo cáo sử dụng. Bản ẩn danh (số đếm tính năng, cài đặt đang bật, lỗi, tự kiểm tra) để gửi tác giả:
// admin tự sao chép / gửi Telegram, hoặc — nếu bản addon có nơi nhận và admin đồng ý — addon tự gửi mỗi tuần
// (bg/insights.js doUsageSend). Hỏi ý một lần (hộp #usage-consent), tắt / bật lại ở thẻ này. Số đếm: khoá `usage`.

async function usageEndpointUrl() {
  const { usageEndpoint } = await chrome.storage.local.get('usageEndpoint');
  const url = usageEndpoint || BG.USAGE_ENDPOINT;
  return BG.isUsageEndpoint(url) ? url : '';
}

async function usageText() {
  const o = await chrome.storage.local.get(['usage', 'diagLog', 'selfCheck', 'telegram', 'usageNote']);
  return BG.usageReport({
    usage: o.usage,
    settings: data.settings,
    telegram: o.telegram,
    groups: groups().filter((g) => !g.error),
    log: data.log,
    diagLog: o.diagLog,
    selfCheck: o.selfCheck,
    version: chrome.runtime.getManifest().version,
    ua: navigator.userAgent,
    note: o.usageNote || '',
  });
}

async function renderUsage() {
  const o = await chrome.storage.local.get(['usageNote', 'usageConsent', 'usageSent']);
  if (document.activeElement !== $('usage-note')) $('usage-note').value = o.usageNote || '';
  $('usage-text').textContent = await usageText();
  const url = await usageEndpointUrl();
  $('usage-share').hidden = !url;
  if (!url) return;
  const on = o.usageConsent?.choice === 'yes';
  const s = o.usageSent;
  $('usage-auto').checked = on;
  $('btn-usage-send').disabled = !on;
  $('usage-auto-note').textContent = !on ? '(đang tắt)' : !s ? '(chưa gửi lần nào — lần quét tự động tới sẽ gửi)' : s.ok ? `(lần gửi gần nhất ${fmtTime(s.at)})` : `(lần gửi ${fmtTime(s.at)} lỗi: ${s.error} — sẽ thử lại sau 1 ngày)`;
}

// Đồng ý gửi: xin quyền gọi Google Script (phải trong lúc bấm), lưu đồng ý kèm mã cài đặt ngẫu nhiên, gửi lần đầu
async function acceptUsage() {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: BG.USAGE_ORIGINS });
  } catch {}
  const { usageConsent: prev } = await chrome.storage.local.get('usageConsent');
  if (!granted) {
    await chrome.storage.local.set({ usageConsent: { choice: 'no', at: Date.now(), installId: prev?.installId || '' } });
    toast('Chưa cấp quyền gửi tới Google Script nên addon không gửi báo cáo.', 'err');
    renderUsage();
    return false;
  }
  const installId = prev?.installId || crypto.randomUUID();
  await chrome.storage.local.set({ usageConsent: { choice: 'yes', at: Date.now(), installId } });
  const r = await chrome.runtime.sendMessage({ type: 'usageSend' });
  toast(r?.status === 'ok' ? 'Cảm ơn bạn! Đã gửi báo cáo sử dụng; addon sẽ tự gửi mỗi tuần.' : r?.message || 'Chưa gửi được — lần quét tự động tới sẽ thử lại', r?.status === 'ok' ? 'ok' : 'err');
  renderUsage();
  return true;
}

async function declineUsage() {
  const { usageConsent: prev } = await chrome.storage.local.get('usageConsent');
  await chrome.storage.local.set({ usageConsent: { choice: 'no', at: Date.now(), installId: prev?.installId || '' } });
  renderUsage();
}

// Hỏi ý một lần (gọi khi Dashboard mở, sau Bắt đầu nhanh / Có gì mới); trả true nếu đã hiện hộp
async function checkUsageConsent() {
  if (!(await usageEndpointUrl())) return false;
  const { usageConsent } = await chrome.storage.local.get('usageConsent');
  if (usageConsent) return false;
  $('usage-consent-text').textContent = await usageText();
  if (!$('usage-consent').open) $('usage-consent').showModal();
  return true;
}

$('usage-note').addEventListener('input', async () => {
  await chrome.storage.local.set({ usageNote: $('usage-note').value.slice(0, 80) });
  $('usage-text').textContent = await usageText();
});
$('btn-usage-copy').addEventListener('click', async () => {
  const ok = await copyText(await usageText());
  toast(ok ? 'Đã sao chép báo cáo sử dụng — dán vào tin nhắn gửi tác giả.' : 'Không sao chép được — trình duyệt chặn bộ nhớ tạm', ok ? 'ok' : 'err');
});
$('btn-usage-file').addEventListener('click', async () => download(`beinfusion-bao-cao-su-dung-${BG.vnDay()}.txt`, await usageText(), 'text/plain;charset=utf-8'));
$('btn-usage-tg').addEventListener('click', async () => {
  const b = $('btn-usage-tg');
  b.disabled = true;
  try {
    const [first, ...rest] = (await usageText()).split('\n');
    const r = await chrome.runtime.sendMessage({ type: 'telegramReport', title: first, text: rest.join('\n') });
    toast(r?.status === 'ok' ? 'Đã gửi về Telegram — chuyển tiếp tin đó cho tác giả.' : r?.message || 'Không gửi được', r?.status === 'ok' ? 'ok' : 'err');
  } finally {
    b.disabled = false;
  }
});
$('usage-auto').addEventListener('change', async (e) => {
  if (e.target.checked) await acceptUsage();
  else {
    await declineUsage();
    toast('Đã tắt tự gửi báo cáo sử dụng.');
  }
});
$('btn-usage-send').addEventListener('click', async () => {
  const b = $('btn-usage-send');
  b.disabled = true;
  try {
    const r = await chrome.runtime.sendMessage({ type: 'usageSend' });
    toast(r?.status === 'ok' ? 'Đã gửi báo cáo sử dụng cho tác giả.' : r?.message || 'Không gửi được', r?.status === 'ok' ? 'ok' : 'err');
  } finally {
    renderUsage();
  }
});
$('usage-yes').addEventListener('click', async () => {
  $('usage-consent').close();
  await acceptUsage();
});
$('usage-no').addEventListener('click', async () => {
  $('usage-consent').close();
  await declineUsage();
  toast('Addon sẽ không gửi báo cáo. Bật lại bất cứ lúc nào ở Nhật ký → Báo cáo sử dụng.');
});
