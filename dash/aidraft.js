// Dashboard — Nhờ AI viết một đoạn chữ: mẫu bài chào thành viên mới / vinh danh (tab Đăng bài) và tóm tắt bình luận (cửa sổ
// Bài viết & bình luận). Cùng hai cách như Trả lời bình luận bằng AI: chép – dán qua trang chat AI (người dùng tự dán, tự chép),
// hoặc khoá API Claude. Kết quả hiện trong ô sửa được; bấm nút để dùng. Không đăng gì lên Beincom.
// Nạp sau aireply.js (dùng aiConfig, aiCall, arCopy, aiReadClipboard, askAiPermission) và welcome.js / shoutout.js / postview.js.

// opts: { title, desc, notePlaceholder, prompt(note) -> đề bài, fix(text) -> text, useLabel, onUse(text) }
const AD = { opts: null, mode: 'web', cfg: null, busy: false };

async function openAiDraft(opts) {
  AD.opts = opts;
  AD.cfg = await aiConfig();
  AD.mode = AD.cfg.mode === 'api' || AD.cfg.mode === 'web' ? AD.cfg.mode : BG.validAiKey(AD.cfg.key) ? 'api' : 'web';
  AD.busy = false;
  $('ad-title').textContent = opts.title;
  $('ad-tip').dataset.tip = opts.desc || '';
  $('ad-tip').setAttribute('aria-label', 'Gợi ý: ' + (opts.desc || ''));
  $('ad-tip').hidden = !opts.desc;
  $('ad-note').value = '';
  $('ad-note').placeholder = opts.notePlaceholder || '';
  $('ad-site').replaceChildren(...Object.entries(BG.AI_WEB_SITES).map(([k, w]) => el('option', { value: k, text: w.label })));
  $('ad-site').value = BG.AI_WEB_SITES[AD.cfg.site] ? AD.cfg.site : 'claude';
  $('ad-result').value = '';
  $('ad-use').textContent = opts.useLabel;
  adStatus('');
  renderAd();
  if (!$('ai-draft').open) $('ai-draft').showModal();
}

function renderAd() {
  const web = AD.mode === 'web';
  const hasKey = BG.validAiKey(AD.cfg?.key);
  const has = !!$('ad-result').value.trim();
  for (const b of document.querySelectorAll('#ad-mode button')) {
    b.classList.toggle('active', b.dataset.m === AD.mode);
    b.setAttribute('aria-pressed', String(b.dataset.m === AD.mode));
    b.disabled = AD.busy;
  }
  $('ad-web').hidden = !web;
  $('ad-api').hidden = web;
  $('ad-setup').hidden = web || hasKey;
  $('ad-copy').textContent = `Chép đề bài & mở ${BG.AI_WEB_SITES[$('ad-site').value]?.label || 'trang chat AI'}`;
  $('ad-gen').disabled = AD.busy || !hasKey;
  $('ad-gen').textContent = AD.busy ? 'AI đang viết…' : has ? 'Viết lại' : 'Nhờ AI viết';
  $('ad-result').placeholder = web ? 'Câu trả lời của AI hiện ở đây (bấm 📋 Dán, hoặc dán tay)…' : 'Bấm Nhờ AI viết — kết quả hiện ở đây.';
  $('ad-use').disabled = AD.busy || !has;
}

const adStatus = (text, cls = '') => {
  $('ad-status').textContent = text;
  $('ad-status').className = 'small ' + (cls || 'muted');
};
const adSet = (text) => {
  $('ad-result').value = AD.opts.fix ? AD.opts.fix(text) : BG.aiCleanText(text);
  renderAd();
};
const adPrompt = () => AD.opts.prompt([AD.cfg?.note, $('ad-note').value.trim()].filter(Boolean).join('\n'));

// Chép đề bài và mở trang chat ngay trong lúc bấm (Safari chặn nếu làm sau khi chờ)
function adWebCopy() {
  const site = BG.AI_WEB_SITES[$('ad-site').value] ? $('ad-site').value : 'claude';
  const copying = arCopy(adPrompt());
  window.open(BG.AI_WEB_SITES[site].url, '_blank', 'noopener');
  AD.cfg = { ...AD.cfg, site, mode: 'web' };
  chrome.storage.local.set({ aiConfig: AD.cfg });
  copying.then((ok) => adStatus(ok ? `Đã chép đề bài và mở ${BG.AI_WEB_SITES[site].label}.` : 'Trình duyệt không cho chép tự động — thử lại, hoặc dùng khoá API.', ok ? '' : 'err-text'));
}

async function adWebPaste() {
  const text = await aiReadClipboard();
  if (!text.trim()) {
    $('ad-result').focus();
    return adStatus('Không đọc được bộ nhớ tạm — dán tay vào ô Kết quả (Ctrl + V).', 'warn-text');
  }
  adSet(text);
  adStatus('Đã dán câu trả lời của AI.');
}

async function adGenerate() {
  if (AD.busy) return;
  await askAiPermission();
  AD.cfg = await aiConfig();
  if (!BG.validAiKey(AD.cfg.key)) return renderAd();
  AD.busy = true;
  adStatus('AI đang viết…');
  renderAd();
  try {
    const body = await aiCall(BG.aiTextRequest({ key: AD.cfg.key, model: AD.cfg.model, input: adPrompt() }));
    adSet(BG.aiParseText(body));
    const cost = BG.aiCost(body.usage, body.model || AD.cfg.model);
    adStatus(`AI đã viết xong · chi phí ước tính ${cost < 0.01 ? '< 0,01' : cost.toFixed(2).replace('.', ',')} USD.`);
  } catch (e) {
    adStatus(e.message || String(e), 'err-text');
  } finally {
    AD.busy = false;
    renderAd();
  }
}

function adUse() {
  const text = $('ad-result').value.trim();
  if (!text || AD.busy) return;
  $('ai-draft').close();
  AD.opts.onUse(text);
}

$('ad-copy').addEventListener('click', adWebCopy);
$('ad-paste').addEventListener('click', adWebPaste);
$('ad-gen').addEventListener('click', adGenerate);
$('ad-use').addEventListener('click', adUse);
$('ad-site').addEventListener('change', renderAd);
$('ad-result').addEventListener('input', renderAd);
// Dán tay vào ô Kết quả: bỏ khung ``` / bổ sung chỗ trống như khi bấm Dán
$('ad-result').addEventListener('paste', () => setTimeout(() => adSet($('ad-result').value), 0));
for (const id of ['ad-cancel', 'ad-close']) $(id).addEventListener('click', () => $('ai-draft').close());
$('ai-draft').addEventListener('cancel', (e) => AD.busy && e.preventDefault());
for (const b of document.querySelectorAll('#ad-mode button')) {
  b.addEventListener('click', async () => {
    if (AD.mode === b.dataset.m || AD.busy) return;
    AD.mode = b.dataset.m;
    AD.cfg = { ...(await aiConfig()), mode: AD.mode };
    chrome.storage.local.set({ aiConfig: AD.cfg });
    adStatus('');
    renderAd();
  });
}

// ---------- Tab Đăng bài: AI viết mẫu bài chào / vinh danh (addon vẫn tự điền @tên những người đã chọn) ----------
function aiTemplateDraft(kind) {
  const isWelcome = kind === 'welcome';
  const g = isWelcome ? welcomeGroup() : shoutGroup();
  const count = (isWelcome ? welcome : shout).picked.size;
  const tpl = $(isWelcome ? 'welcome-template' : 'shout-template');
  openAiDraft({
    title: isWelcome ? '✨ AI viết bài chào thành viên mới' : '✨ AI viết bài vinh danh',
    desc: `AI viết mẫu bài mới${g ? ' cho ' + g.name : ''} có chỗ trống {danh_sach}; addon tự điền @tên những người bạn đã chọn.`,
    notePlaceholder: isWelcome ? 'vd: nhắc buổi AMA tối thứ Sáu' : 'vd: người đứng đầu được tặng huy hiệu',
    prompt: (note) => BG.aiTemplatePrompt({ kind, groupName: g?.name || '', count, current: tpl.value, note }),
    fix: BG.aiTemplateFix,
    useLabel: count ? `Dùng mẫu & soạn bài (${count} người)` : 'Dùng làm mẫu',
    onUse: (text) => {
      tpl.value = text;
      const box = tpl.closest('details');
      if (box) box.open = true;
      if (count) (isWelcome ? composeWelcome : composeShoutout)();
      else toast('Đã thay mẫu bài (chưa lưu) — chọn người rồi bấm Soạn; muốn giữ mẫu này thì bấm Lưu mẫu.');
    },
  });
}
$('btn-welcome-ai').addEventListener('click', () => aiTemplateDraft('welcome'));
$('btn-shout-ai').addEventListener('click', () => aiTemplateDraft('shoutout'));

// ---------- Cửa sổ Bài viết & bình luận: AI tóm tắt các bình luận đã tải ----------
$('pv-sum').addEventListener('click', () => {
  const p = PV.post;
  if (!p) return;
  const all = [...new Map([...PV.items, ...Object.values(PV.replies).flat()].filter((c) => !c.isHidden).map((c) => [c.id, c])).values()].sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
  openAiDraft({
    title: `✨ Tóm tắt ${all.length} bình luận`,
    desc: 'AI đọc bài và các bình luận đang hiện trong cửa sổ — muốn tóm tắt nhiều hơn thì tải thêm bình luận trước.',
    notePlaceholder: 'vd: chú ý các câu hỏi về rút tiền',
    prompt: (note) => BG.aiSummaryPrompt({ post: [p.title, PV.full?.text || p.text].filter(Boolean).join('\n'), comments: all, note, community: (p.groups || []).map((g) => g.name).filter(Boolean).join(', ') }),
    useLabel: 'Chép tóm tắt',
    onUse: (text) => arCopy(text).then((ok) => toast(ok ? 'Đã chép tóm tắt.' : 'Không chép được — bôi đen trong ô rồi chép tay.', ok ? 'ok' : 'err')),
  });
});
