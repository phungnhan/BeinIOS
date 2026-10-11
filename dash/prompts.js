// Dashboard — tab Đăng bài: Bài thảo luận hằng tuần. Câu hỏi mồi (kho `promptBank`) để thành viên — nhất là người mới —
// có chủ đề trả lời; soạn vào ô Đăng bài kèm giờ gợi ý (theo Hiệu quả bài đã đăng). Bản soạn sẵn sáng thứ Hai ở `promptDraft`.
// Bài đăng thật được ghi vào lần dùng của câu (bg/insights.js recordPromptUse) để đo tương tác từng câu.

const prm = { groupId: null };

function promptGroups() {
  return groups().filter((g) => !g.error && g.communityId);
}

function promptGroup() {
  const gs = promptGroups();
  return gs.find((g) => g.id === prm.groupId) || gs.find((g) => g.id === data.settings.promptGroupId) || gs[0] || null;
}

const slotNote = (basis) => (basis === 'own' ? 'giờ có tương tác tốt nhất theo bài của bạn' : 'chưa đủ số liệu bài của bạn — tạm chọn 20 giờ thứ Tư');

function renderPrompts() {
  const gs = promptGroups();
  const g = promptGroup();
  $('prompt-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name })));
  $('prompt-group').disabled = $('btn-prompt-now').disabled = !g;
  const bank = BG.promptBankOf(data.promptBank);

  const d = data.promptDraft;
  $('prompt-draft').hidden = !d;
  if (d) {
    $('prompt-draft-title').textContent = `📬 Bài thảo luận tuần này cho ${d.groupName}`;
    $('prompt-draft-text').textContent = d.text;
    $('prompt-draft-sub').textContent = d.suggestAt ? `Gợi ý đăng lúc ${BG.slotLabel(d.suggestAt)} ${fmtTime(d.suggestAt).split(' ')[1] || ''} (${slotNote(d.basis)})` : '';
  }

  const st = data.settings;
  const on = !!(st.promptWeekly && st.promptGroupId);
  const other = on && st.promptGroupId !== g?.id ? groups().find((x) => x.id === st.promptGroupId) : null;
  $('prompt-weekly').checked = on && st.promptGroupId === g?.id;
  $('prompt-weekly').disabled = !g;
  $('prompt-weekly-note').textContent = other ? `(đang bật cho ${other.name})` : on ? '(đang bật)' : '';

  $('prompt-count').textContent = String(bank.items.length);
  if (document.activeElement !== $('prompt-bank')) $('prompt-bank').value = bank.items.map((x) => x.text).join('\n');

  const rows = BG.promptPerformance(bank, data.postStats || {});
  const body = $('prompt-perf');
  body.replaceChildren();
  if (!rows.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: 'Chưa đăng bài thảo luận nào qua addon. Bài đăng thật được đo lượt xem, cảm xúc, bình luận sau 24 giờ và 7 ngày.' })));
  for (const r of rows.slice(0, 30)) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'wrap' }, el('a', { href: BG.postUrl({ id: r.postId, type: 'POST' }), target: '_blank', text: r.text.slice(0, 120) }), r.gone ? el('span', { class: 'tag err', text: 'Bài đã xoá' }) : null),
        el('td', { class: 'small', text: r.groupName || groups().find((x) => x.id === r.groupId)?.name || '' }),
        el('td', { class: 'nowrap', text: fmtTime(r.at) }),
        metricsCell(r.metrics, 'Số liệu mới nhất'),
        el('td', { class: 'num' }, r.score == null ? el('span', { class: 'muted', text: '–' }) : el('b', { text: r.score.toLocaleString('vi-VN') })),
      ),
    );
  }
}

// Điền câu hỏi vào ô Đăng bài, hẹn giờ lúc `at` (đã qua thì chọn lại theo giờ gợi ý)
function fillPrompt(g, { promptId, text, at }) {
  if (compose.edit) return toast('Đang sửa bài đã đăng — bấm Huỷ sửa trước', 'err');
  if ($('compose-text').value.trim() && !confirm('Thay nội dung đang soạn bằng bài thảo luận?')) return;
  const slot = at && Date.parse(at) > Date.now() + (BG.MIN_SCHEDULE_MIN + 5) * 60e3 ? { at, basis: null } : BG.promptSlot(data.postStats || {});
  compose.groupIds = new Set([g.id]);
  compose.prompt = { id: promptId };
  $('compose-text').value = text;
  if (slot.at) {
    document.querySelector('input[name="compose-when"][value="later"]').checked = true;
    $('compose-at').value = toLocalInput(new Date(slot.at));
  }
  renderComposeGroups();
  updateCompose();
  saveDraft();
  $('compose').scrollIntoView({ block: 'start' });
  $('compose-text').focus();
  toast(`Đã soạn bài thảo luận vào ô soạn bài${slot.at ? `, hẹn ${fmtTime(slot.at)}` : ''} — xem lại rồi bấm Hẹn giờ.`);
}

// Mở từ thông báo sáng thứ Hai (#tab=compose&prompt=1)
function openPrompts() {
  showTab('compose');
  if (data.promptDraft) prm.groupId = data.promptDraft.groupId;
  renderPrompts();
  $('prompts').scrollIntoView({ block: 'start' });
}

$('prompt-group').addEventListener('change', (e) => {
  prm.groupId = e.target.value;
  renderPrompts();
});
$('btn-prompt-now').addEventListener('click', () => {
  const g = promptGroup();
  if (!g) return;
  const p = BG.pickPrompt(data.promptBank, { groupId: g.id });
  if (!p) return toast('Kho câu hỏi trống', 'err');
  fillPrompt(g, { promptId: p.id, text: BG.promptText(p, { groupName: g.name }) });
});
$('btn-prompt-open').addEventListener('click', () => {
  const d = data.promptDraft;
  const g = d && groups().find((x) => x.id === d.groupId);
  if (!g) return toast('Group của bài soạn sẵn không còn — hãy quét lại', 'err');
  fillPrompt(g, { promptId: d.promptId, text: d.text, at: d.suggestAt });
});
$('btn-prompt-other').addEventListener('click', async () => {
  const d = data.promptDraft;
  if (!d) return;
  const p = BG.pickPrompt(data.promptBank, { groupId: d.groupId, skipIds: [d.promptId, ...(d.skipped || [])] });
  if (!p) return toast('Không còn câu nào khác trong kho', 'err');
  const next = { ...d, promptId: p.id, text: BG.promptText(p, { groupName: d.groupName }), skipped: [...(d.skipped || []), d.promptId] };
  await chrome.storage.local.set({ promptDraft: next });
  data.promptDraft = next;
  renderPrompts();
});
$('btn-prompt-skip').addEventListener('click', async () => {
  await chrome.storage.local.remove('promptDraft');
  data.promptDraft = null;
  renderPrompts();
});
$('prompt-weekly').addEventListener('change', async (e) => {
  const g = promptGroup();
  if (!g) return;
  const patch = e.target.checked ? { promptWeekly: true, promptGroupId: g.id } : { promptWeekly: false };
  await saveTo('settings', BG.DEFAULT_SETTINGS, patch);
  Object.assign(data.settings, patch);
  renderPrompts();
  toast(e.target.checked ? `Sáng thứ Hai addon sẽ soạn sẵn bài thảo luận cho ${g.name} và báo cho bạn.` : 'Đã tắt soạn sẵn bài thảo luận hằng tuần.');
});
$('btn-prompt-save').addEventListener('click', async () => {
  const bank = BG.promptBankFromText($('prompt-bank').value, data.promptBank);
  if (!bank.items.length) return toast('Kho cần ít nhất một câu', 'err');
  await chrome.storage.local.set({ promptBank: bank });
  data.promptBank = bank;
  renderPrompts();
  toast(`Đã lưu kho ${bank.items.length} câu hỏi.`);
});
$('btn-prompt-reset').addEventListener('click', async () => {
  if (!confirm('Thay kho câu hỏi bằng 20 câu mặc định? Câu bạn tự thêm sẽ mất (lần dùng của câu mặc định được giữ).')) return;
  const bank = BG.promptBankFromText(BG.DEFAULT_PROMPTS.join('\n'), data.promptBank);
  await chrome.storage.local.set({ promptBank: bank });
  data.promptBank = bank;
  $('prompt-bank').value = '';
  renderPrompts();
  toast('Đã khôi phục kho câu hỏi mặc định.');
});
