// ---------- Bộ quy tắc mẫu, xuất / nhập quy tắc ----------
// Bộ mẫu gộp vào quy tắc bài viết đang sửa (chung hoặc riêng một group): xem trước từng phần, sửa được danh sách,
// thấy ngay bao nhiêu bài / bình luận gần đây sẽ đổi đánh giá. Xuất quy tắc = tệp sao lưu chỉ có quy tắc, nhập bằng Khôi phục.

const PRESET_KEY_LABELS = { bannedKeywords: 'từ khoá vi phạm', reviewKeywords: 'từ khoá cần xem', blockedDomains: 'tên miền cấm', reviewContacts: 'cần xem khi có liên hệ riêng' };

// Bao nhiêu bài / bình luận gần đây (còn hiện) đổi đánh giá nếu thêm patch vào quy tắc đang sửa
function presetImpact(patch) {
  const ctx = rulesCtx();
  const own = rulesScope ? ctx.groupRules[rulesScope] : null;
  const next = own ? { ...ctx, groupRules: { ...ctx.groupRules, [rulesScope]: { ...own, postRules: { ...own.postRules, ...patch } } } } : { ...ctx, postRules: { ...BG.DEFAULT_POST_RULES, ...ctx.postRules, ...patch } };
  const items = [...(data.state.recentPosts || []), ...(data.settings.scanComments ? data.state.recentComments || [] : [])].filter((x) => !x.isHidden);
  const out = { total: items.length, review: 0, bad: 0 };
  for (const x of items) {
    const before = BG.evaluatePostIn(x, ctx).verdict;
    const after = BG.evaluatePostIn(x, next).verdict;
    if (before !== after && after !== 'ok') out[after]++;
  }
  return out;
}

async function openPreset(id = 'scam') {
  const preset = BG.RULE_PRESETS[id];
  if (!preset || busy) return;
  const sr = scopedRules();
  if (!sr.own) return toast('Group này đang theo quy tắc khác — bấm "Dùng quy tắc riêng cho group này" trước, hoặc chọn Quy tắc chung.', 'warn');
  const where = rulesScope ? `quy tắc riêng của ${scopeName(rulesScope)}` : 'quy tắc chung';
  const impact = el('p', { class: 'small preset-impact' });
  const parts = preset.parts.map((p) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = p.on;
    const box = p.items ? el('textarea', { rows: 3, 'aria-label': p.label, text: p.items.join(', ') }) : null;
    return { p, cb, box, row: el('div', { class: 'preset-part' }, el('label', { class: 'check' }, cb, el('b', { text: ` ${p.label}` }), p.items ? el('span', { class: 'muted small', text: ` (${p.items.length})` }) : null), el('div', { class: 'muted small', text: p.note }), box) };
  });
  const picks = () => parts.filter((x) => x.cb.checked).map((x) => ({ key: x.p.key, items: x.box ? BG.parseList(x.box.value) : undefined, value: x.p.value }));
  const update = () => {
    const { patch, added } = BG.presetPatch(sr.postRules, picks());
    for (const x of parts) {
      x.row.classList.toggle('is-off', !x.cb.checked);
      if (x.box) x.box.disabled = !x.cb.checked;
    }
    if (!added.length) return (impact.textContent = 'Quy tắc đang sửa đã có đủ các mục đã chọn — không có gì mới để thêm.');
    const n = presetImpact(patch);
    const what = added.map((a) => (a.items.length ? `${a.items.length} ${PRESET_KEY_LABELS[a.key]}` : PRESET_KEY_LABELS[a.key])).join(', ');
    impact.textContent = `Sẽ thêm: ${what}.` + (n.total ? ` Với ${n.total} bài / bình luận gần đây: ${n.bad} thành Vi phạm, ${n.review} thành Cần xem.` : '');
  };
  for (const x of parts) {
    x.cb.addEventListener('change', update);
    x.box?.addEventListener('input', update);
  }
  update();
  const ok = await confirmDialog({
    title: `Bộ quy tắc mẫu: ${preset.name}`,
    text: `Gộp vào ${where} (giữ nguyên những gì đang có). Bỏ chọn phần không muốn, sửa / xoá từ trong ô — cách nhau dấu phẩy.`,
    okText: 'Thêm vào quy tắc',
    extra: el('div', {}, el('div', { class: 'preset-box' }, ...parts.map((x) => x.row)), impact),
    local: true,
    sendNote: 'Chỉ đổi quy tắc trong addon, không gửi gì lên Beincom. Sửa / xoá lại được ở thẻ Quy tắc bài viết.',
  });
  if (!ok) return;
  const { patch, added } = BG.presetPatch(scopedRules().postRules, picks());
  if (!added.length) return toast('Không có gì mới để thêm.', 'warn');
  await savePostRules(patch);
  toast(`Đã thêm vào ${where}: ` + added.map((a) => (a.items.length ? `${a.items.length} ${PRESET_KEY_LABELS[a.key]}` : PRESET_KEY_LABELS[a.key])).join(', ') + '.');
}

// Tệp chỉ có quy tắc (chung + riêng từng group), cùng định dạng sao lưu: admin khác nhập bằng "Nhập quy tắc…"
async function exportRules() {
  const store = await chrome.storage.local.get(['rules', 'postRules', 'groupRules']);
  const file = BG.makeBackup(store, { version: chrome.runtime.getManifest().version });
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: `beinfusion-quy-tac-${fileStamp()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Đã xuất quy tắc: ' + BG.backupSummary(file.data).join(' · ') + '. Gửi tệp cho admin khác, họ bấm Nhập quy tắc… để dùng.');
}

$('btn-preset-scam').addEventListener('click', () => openPreset('scam'));
$('btn-rules-export').addEventListener('click', exportRules);
$('btn-rules-import').addEventListener('click', () => $('restore-file').click());
