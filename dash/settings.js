// Dashboard — tab Quy tắc & cài đặt: quy tắc (chung / riêng từng group), sao lưu, cài đặt addon.

// ---------- Quy tắc ----------

function fillList(id, list, prefix = '') {
  if (document.activeElement === $(id)) return;
  $(id).value = (list || []).map((x) => prefix + x).join(', ');
}

// ---------- Phạm vi quy tắc (chung / riêng từng group) ----------

let rulesScope = ''; // '' = quy tắc chung, còn lại = id group

function scopeGroup(id = rulesScope) {
  return groups().find((g) => g.id === id) || (data.groupRules[id] ? { id, name: data.groupRules[id].name || id, isCommunity: true, missing: true } : null);
}

function scopeName(id) {
  const g = scopeGroup(id);
  return g ? (g.missing ? g.name : groupPath(g)) : id;
}

// Quy tắc đang hiển thị: chung, hoặc quy tắc group đang dùng (riêng / theo community / chung)
function scopedRules() {
  if (!rulesScope) return { rules: data.rules, postRules: data.postRules, source: null, own: true };
  const eff = BG.effectiveRules(scopeGroup(), rulesCtx());
  return { ...eff, own: eff.source === rulesScope };
}

function renderScope() {
  const gs = groups();
  if (rulesScope && !scopeGroup()) rulesScope = '';
  const mark = (g) => {
    const src = BG.ruleSource(g, data.groupRules, gs);
    return src === g.id ? ' — riêng' : src ? ' — theo community' : '';
  };
  const missing = Object.keys(data.groupRules).filter((id) => !gs.some((g) => g.id === id));
  const sel = $('scope-group');
  sel.replaceChildren(
    el('option', { value: '', text: 'Quy tắc chung (mọi group chưa có quy tắc riêng)' }),
    ...gs.map((g) => el('option', { value: g.id, text: BG.groupIndent(g) + g.name + mark(g) })),
    ...missing.map((id) => el('option', { value: id, text: `${data.groupRules[id].name || id} — riêng (không còn trong lần quét)` })),
  );
  sel.value = rulesScope;
  const sr = scopedRules();
  const g = scopeGroup();
  $('scope-own').hidden = !rulesScope || sr.own;
  $('scope-drop').hidden = !rulesScope || !sr.own;
  const owners = Object.keys(data.groupRules);
  let note;
  if (!rulesScope) note = owners.length ? `Đang sửa quy tắc chung. ${owners.length} group dùng quy tắc riêng: ${owners.map(scopeName).join(', ')}.` : 'Đang sửa quy tắc chung, dùng cho mọi group. Chọn một group ở trên để đặt quy tắc riêng cho group đó.';
  else if (sr.own) note = 'Group này dùng quy tắc riêng — sửa bên dưới chỉ áp dụng cho group này' + (g?.isCommunity ? ' và các group con chưa có quy tắc riêng.' : '.');
  else if (sr.source) note = `Đang theo quy tắc riêng của community ${scopeName(sr.source)} (xem bên dưới, chỉ đọc). Bấm "Dùng quy tắc riêng cho group này" để tách riêng.`;
  else note = 'Đang theo quy tắc chung (xem bên dưới, chỉ đọc). Bấm "Dùng quy tắc riêng cho group này" để chép quy tắc chung thành bản riêng rồi sửa.';
  $('scope-note').textContent = note;
  const tag = rulesScope ? `· ${g?.name || ''}${sr.own ? ' (riêng)' : ''}` : '';
  $('rules-scope-tag').textContent = tag;
  $('post-rules-scope-tag').textContent = tag;
}

function renderRules() {
  renderScope();
  const sr = scopedRules();
  const locked = !sr.own;
  const r = sr.rules;
  for (const k of RULE_BOOLS) $(k).checked = !!r[k];
  if (document.activeElement !== $('minAnswerLength')) $('minAnswerLength').value = r.minAnswerLength;
  for (const [k, isUser] of Object.entries(RULE_LISTS)) fillList(k, r[k], isUser ? '@' : '');
  const pr = sr.postRules;
  for (const k of POST_RULE_LISTS) fillList('post-' + k, pr[k]);
  $('post-reviewExternalLinks').checked = !!pr.reviewExternalLinks;
  for (const [card, src] of [['#rules', r], ['#post-rules', pr]]) {
    for (const i of document.querySelectorAll(card + ' .rules-grid input, ' + card + ' .rules-grid textarea')) i.disabled = locked;
    document.querySelector(card).classList.toggle('rules-locked', locked);
    for (const row of document.querySelectorAll(card + ' [data-requires]')) {
      const on = !!src[row.dataset.requires];
      row.classList.toggle('is-disabled', !on);
      for (const i of row.querySelectorAll('input, textarea')) i.disabled = locked || !on;
    }
  }
}

async function saveTo(key, defaults, patch, hintId) {
  const { [key]: cur } = await chrome.storage.local.get(key);
  await chrome.storage.local.set({ [key]: { ...defaults, ...cur, ...patch } });
  $(hintId).textContent = 'Đã lưu ✓';
  setTimeout(() => ($(hintId).textContent = ''), 2000);
}

// Lưu vào quy tắc riêng của group đang chọn (kind: 'rules' | 'postRules')
async function saveScoped(kind, patch, hintId) {
  const id = rulesScope;
  const { groupRules = {} } = await chrome.storage.local.get('groupRules');
  if (!groupRules[id]) return toast('Group này chưa có quy tắc riêng', 'err');
  groupRules[id] = { ...groupRules[id], [kind]: { ...groupRules[id][kind], ...patch }, updatedAt: Date.now() };
  await chrome.storage.local.set({ groupRules });
  $(hintId).textContent = 'Đã lưu ✓';
  setTimeout(() => ($(hintId).textContent = ''), 2000);
}

const saveRules = (patch) => (rulesScope ? saveScoped('rules', patch, 'rules-saved') : saveTo('rules', BG.DEFAULT_RULES, patch, 'rules-saved'));
const savePostRules = (patch) => (rulesScope ? saveScoped('postRules', patch, 'post-rules-saved') : saveTo('postRules', BG.DEFAULT_POST_RULES, patch, 'post-rules-saved'));

$('scope-group').addEventListener('change', () => {
  rulesScope = $('scope-group').value;
  // Đổi phạm vi: bỏ ô đang gõ dở để điền giá trị của phạm vi mới
  document.activeElement?.blur?.();
  renderRules();
});

$('scope-own').addEventListener('click', async () => {
  const g = scopeGroup();
  if (!g) return;
  const eff = BG.effectiveRules(g, rulesCtx());
  const { groupRules = {} } = await chrome.storage.local.get('groupRules');
  groupRules[g.id] = { name: g.name, rules: { ...eff.rules }, postRules: { ...eff.postRules }, createdAt: Date.now() };
  await chrome.storage.local.set({ groupRules });
  toast(`${g.name}: đã tạo quy tắc riêng (chép từ quy tắc đang dùng). Sửa ở các thẻ bên dưới.`);
});

$('scope-drop').addEventListener('click', async () => {
  const g = scopeGroup();
  if (!g) return;
  const { groupRules = {} } = await chrome.storage.local.get('groupRules');
  const rest = { ...groupRules };
  delete rest[g.id];
  const after = BG.ruleSource(g, rest, groups());
  const ok = await confirmDialog({
    title: 'Bỏ quy tắc riêng?',
    text: `${scopeName(g.id)} sẽ quay về dùng ${after ? 'quy tắc riêng của community ' + scopeName(after) : 'quy tắc chung'}.`,
    okText: 'Bỏ quy tắc riêng',
    danger: true,
    local: true,
    sendNote: 'Chỉ đổi trong addon, không gửi gì lên Beincom. Quy tắc riêng này sẽ mất.',
  });
  if (!ok) return;
  await chrome.storage.local.set({ groupRules: rest });
  toast(`${g.name}: đã bỏ quy tắc riêng.`);
});

for (const k of RULE_BOOLS) $(k).addEventListener('change', () => saveRules({ [k]: $(k).checked }));
$('minAnswerLength').addEventListener('change', () => saveRules({ minAnswerLength: Math.max(0, Math.min(200, Number($('minAnswerLength').value) || 0)) }));
for (const [k, isUser] of Object.entries(RULE_LISTS)) $(k).addEventListener('change', () => saveRules({ [k]: BG.parseList($(k).value, { username: isUser }) }));
for (const k of POST_RULE_LISTS) $('post-' + k).addEventListener('change', () => savePostRules({ [k]: BG.parseList($('post-' + k).value) }));
$('post-reviewExternalLinks').addEventListener('change', () => savePostRules({ reviewExternalLinks: $('post-reviewExternalLinks').checked }));

// ---------- Sao lưu & khôi phục ----------

function renderBackup() {
  const n = Object.keys(data.profiles?.users || {}).length;
  $('backup-profiles-n').textContent = n ? `(${n} người)` : '(chưa có)';
  $('backup-profiles').disabled = !n;
}

function fileStamp(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

$('btn-backup').addEventListener('click', async () => {
  const store = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'groupRules', 'templates', 'profiles']);
  const backup = BG.makeBackup(store, { profiles: $('backup-profiles').checked, version: chrome.runtime.getManifest().version });
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: `beingroup-sao-luu-${fileStamp()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  $('backup-hint').textContent = 'Đã tạo tệp sao lưu ✓ ' + BG.backupSummary(backup.data).join(' · ');
});

$('btn-restore').addEventListener('click', () => $('restore-file').click());

$('restore-file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f || busy) return;
  let parsed;
  try {
    if (f.size > 20e6) throw new Error('tệp quá lớn');
    parsed = BG.readBackup(JSON.parse(await f.text()));
  } catch (err) {
    return toast('Không đọc được tệp sao lưu: ' + (err instanceof SyntaxError ? 'tệp không phải JSON' : err.message), 'err');
  }
  const s = parsed.data.settings;
  // Bản sao lưu tắt Chạy thử: hỏi có giữ Chạy thử không (mặc định giữ)
  let keep = null;
  if (s?.dryRun === false) {
    keep = el('input', { type: 'checkbox' });
    keep.checked = true;
  }
  const auto = s && (s.autoApprove || s.autoDecline);
  const extra = keep
    ? el(
        'label',
        { class: 'switch-row dry' },
        keep,
        el('span', {}, el('b', { text: 'Giữ Chạy thử sau khi khôi phục' }), el('br'), el('span', { class: 'muted small', text: `Bản sao lưu đang TẮT Chạy thử${auto ? ' và bật tự xử lý — sẽ tự duyệt / từ chối thật' : ''}. Nên giữ Chạy thử, kiểm tra quy tắc rồi tự tắt.` })),
      )
    : null;
  const ok = await confirmDialog({
    title: 'Khôi phục từ bản sao lưu?',
    text: `${f.name}${parsed.exportedAt ? ' — tạo lúc ' + fmtTime(parsed.exportedAt) : ''}${parsed.version ? ' (BeinGroup v' + parsed.version + ')' : ''}. Các mục dưới đây sẽ thay cho dữ liệu hiện tại; hồ sơ vi phạm thì gộp thêm.`,
    names: BG.backupSummary(parsed.data),
    okText: 'Khôi phục',
    danger: true,
    extra,
    local: true,
    sendNote: 'Chỉ đổi trong addon, không gửi gì lên Beincom.',
  });
  if (!ok) return;
  const r = await chrome.runtime.sendMessage({ type: 'restoreBackup', data: parsed.data, keepDry: !!keep?.checked });
  if (r?.status !== 'ok') return toast('Khôi phục lỗi: ' + (r?.message || 'không rõ'), 'err');
  rulesScope = '';
  $('backup-hint').textContent = 'Đã khôi phục ✓ ' + r.restored.join(' · ');
  toast('Đã khôi phục cài đặt từ bản sao lưu.');
});

// ---------- Cài đặt ----------

function renderSettings() {
  const s = data.settings;
  for (const k of SETTING_BOOLS) $(k).checked = !!s[k];
  for (const k of SETTING_NUMS) $(k).value = String(s[k]);
  $('master-row').classList.toggle('off', !s.active);
  $('master-title').textContent = s.active ? 'Addon đang hoạt động' : 'Đã tắt tất cả chức năng';
  $('settings-group').classList.toggle('paused', !s.active);
}

const saveSettings = (patch) => saveTo('settings', BG.DEFAULT_SETTINGS, patch, 'saved-hint');

for (const k of SETTING_BOOLS) {
  $(k).addEventListener('change', async () => {
    const on = $(k).checked;
    // Tắt chạy thử khi đang bật tự xử lý: hỏi lại vì thao tác sẽ gửi thật
    if (on && (k === 'autoApprove' || k === 'autoDecline') && !data.settings.dryRun) {
      const what = k === 'autoApprove' ? 'duyệt' : 'từ chối';
      if (!confirm(`Bật tự ${what}? Sau mỗi lần quét, addon sẽ tự ${what} các yêu cầu tham gia theo quy tắc và gửi thật lên Beincom.`)) {
        $(k).checked = false;
        return;
      }
    }
    if (on && k === 'autoHideSpam' && !data.settings.dryRun) {
      const domains = data.postRules.blockedDomains || [];
      if (!confirm(`Bật tự ẩn spam? Sau mỗi lần quét, bài và bình luận mới có link tới tên miền cấm (${domains.length ? domains.join(', ') : 'chưa có tên miền nào'}${Object.keys(data.groupRules || {}).length ? ' và tên miền cấm trong quy tắc riêng của group' : ''}) sẽ bị ẩn thật trên Beincom.`)) {
        $(k).checked = false;
        return;
      }
    }
    if (!on && k === 'dryRun' && (data.settings.autoApprove || data.settings.autoDecline || data.settings.autoHideSpam)) {
      if (!confirm('Tắt Chạy thử khi đang bật tự xử lý: lần quét tới addon sẽ tự duyệt / từ chối / ẩn thật. Tiếp tục?')) {
        $(k).checked = true;
        return;
      }
    }
    saveSettings({ [k]: on });
  });
}
for (const k of SETTING_NUMS) $(k).addEventListener('change', () => saveSettings({ [k]: Number($(k).value) }));
