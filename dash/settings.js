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
  $('post-reviewContacts').checked = !!pr.reviewContacts;
  $('btn-preset-scam').disabled = locked;
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

// Các lần lưu chạy lần lượt: gõ ô danh sách rồi bấm ngay công tắc bên cạnh sinh hai lần lưu gần như cùng lúc,
// chạy song song thì lần sau đọc bản cũ và ghi đè mất lần trước.
let saveChain = Promise.resolve();
function queueSave(fn) {
  saveChain = saveChain.then(fn, fn);
  return saveChain;
}

function saveTo(key, defaults, patch, hintId) {
  return queueSave(async () => {
    const { [key]: cur } = await chrome.storage.local.get(key);
    await chrome.storage.local.set({ [key]: { ...defaults, ...cur, ...patch } });
    if (!hintId) return; // nơi lưu tự báo bằng toast
    $(hintId).textContent = 'Đã lưu ✓';
    setTimeout(() => ($(hintId).textContent = ''), 2000);
  });
}

// Lưu vào quy tắc riêng của group đang chọn (kind: 'rules' | 'postRules')
function saveScoped(kind, patch, hintId) {
  const id = rulesScope;
  return queueSave(async () => {
    const { groupRules = {} } = await chrome.storage.local.get('groupRules');
    if (!groupRules[id]) return toast('Group này chưa có quy tắc riêng', 'err');
    groupRules[id] = { ...groupRules[id], [kind]: { ...groupRules[id][kind], ...patch }, updatedAt: Date.now() };
    await chrome.storage.local.set({ groupRules });
    $(hintId).textContent = 'Đã lưu ✓';
    setTimeout(() => ($(hintId).textContent = ''), 2000);
  });
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
$('post-reviewContacts').addEventListener('change', () => savePostRules({ reviewContacts: $('post-reviewContacts').checked }));

// ---------- Sao lưu & khôi phục ----------

function renderBackup() {
  const n = Object.keys(data.profiles?.users || {}).length;
  $('backup-profiles-n').textContent = n ? `(${n} người)` : '(chưa có)';
  $('backup-profiles').disabled = !n;
  renderStorageUsage();
  renderImgCache();
}

// Ảnh trang Chat lưu trong máy (avatar, ảnh community, biểu cảm — chat/imgcache.js): Cache Storage của addon, không nằm
// trong chrome.storage / sao lưu. Xoá thì trang Chat tải lại ảnh khi cần
const IMG_CACHE_NAME = 'beingroup-img-v1';
async function renderImgCache() {
  const info = $('img-cache-info');
  try {
    const has = await caches.has(IMG_CACHE_NAME);
    const keys = has ? await (await caches.open(IMG_CACHE_NAME)).keys() : [];
    let bytes = 0;
    if (keys.length) {
      const cache = await caches.open(IMG_CACHE_NAME);
      for (const k of keys) bytes += (await (await cache.match(k))?.blob())?.size || 0;
    }
    info.textContent = keys.length ? `🖼 Ảnh trang Chat đã lưu trong máy: ${keys.length.toLocaleString('vi-VN')} ảnh · ${bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : BG.mbText(bytes)}` : '🖼 Ảnh trang Chat đã lưu trong máy: chưa có';
    $('btn-img-clear').disabled = !keys.length;
  } catch {
    info.textContent = '';
    $('btn-img-clear').disabled = true;
  }
}

$('btn-img-clear').addEventListener('click', async () => {
  await caches.delete(IMG_CACHE_NAME).catch(() => {});
  await renderImgCache();
  toast('Đã xoá ảnh đã lưu — trang Chat sẽ tải lại khi cần');
});

// Dung lượng addon đang dùng trong trình duyệt (chi tiết từng phần ở Nhật ký → Tự kiểm tra → Bộ nhớ của addon)
async function renderStorageUsage() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    const unlimited = (chrome.runtime.getManifest().permissions || []).includes('unlimitedStorage');
    const v = BG.storageVerdict({ bytes, unlimited });
    $('storage-usage').textContent = `💽 Bộ nhớ addon đang dùng: ${BG.mbText(bytes)}${unlimited ? ' (không giới hạn)' : ` / ${BG.mbText(BG.STORAGE_QUOTA)}`}.` + (v.status === 'fail' ? ' ' + v.detail : ' Chi tiết ở Nhật ký → Tự kiểm tra.');
    $('storage-usage').classList.toggle('err-text', v.status === 'fail');
  } catch {
    $('storage-usage').textContent = '';
  }
}

function fileStamp(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

$('btn-backup').addEventListener('click', async () => {
  const store = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'groupRules', 'templates', 'promptBank', 'chatReplies', 'profiles', 'postStats', 'nudges', 'log', 'state']);
  const backup = BG.makeBackup(store, { profiles: $('backup-profiles').checked, history: $('backup-history').checked, version: chrome.runtime.getManifest().version });
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: `beinfusion-sao-luu-${fileStamp()}.json` });
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
    text: `${f.name}${parsed.exportedAt ? ' — tạo lúc ' + fmtTime(parsed.exportedAt) : ''}${parsed.version ? ' (BeinFusion v' + parsed.version + ')' : ''}. Các mục dưới đây sẽ thay cho dữ liệu hiện tại; hồ sơ vi phạm thì gộp thêm.`,
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
  fillList('watchKeywords', s.watchKeywords);
  fillList('trustedMembers', s.trustedMembers, '@');
  for (const row of document.querySelectorAll('[data-requires="autoApprovePosts"]')) row.classList.toggle('is-disabled', !s.autoApprovePosts);
  renderSync();
  renderTelegramStatus();
  const watchHours = document.querySelector('[data-requires="remindUnanswered"]');
  watchHours.classList.toggle('is-disabled', !s.remindUnanswered);
  document.querySelector('[data-requires="remindPending"]').classList.toggle('is-disabled', !s.remindPending);
  document.querySelector('[data-requires="guardJoins"]').classList.toggle('is-disabled', !s.guardJoins);
  for (const row of document.querySelectorAll('[data-requires="chatEnabled"]')) {
    row.classList.toggle('is-disabled', !s.chatEnabled);
    row.querySelector('input').disabled = !s.chatEnabled;
  }
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
    if (on && k === 'autoApprovePosts' && !data.settings.dryRun) {
      const n = (data.settings.trustedMembers || []).length;
      if (!confirm(`Bật tự duyệt bài? Sau mỗi lần quét, bài chờ duyệt đạt mọi quy tắc của ${n ? n + ' thành viên tin cậy' : 'thành viên tin cậy'}${data.settings.trustAfterApproved ? ` và người đã được duyệt ít nhất ${data.settings.trustAfterApproved} bài` : ''} sẽ được duyệt thật trên Beincom.`)) {
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
    if (!on && k === 'dryRun' && (data.settings.autoApprove || data.settings.autoDecline || data.settings.autoHideSpam || data.settings.autoApprovePosts)) {
      if (!confirm('Tắt Chạy thử khi đang bật tự xử lý: lần quét tới addon sẽ tự duyệt / từ chối / ẩn thật. Tiếp tục?')) {
        $(k).checked = true;
        return;
      }
    }
    // Chat Beincom: xin quyền kết nối chat.beincom.com ngay lúc bấm, rồi đọc chat lần đầu
    if (on && k === 'chatEnabled') {
      let granted = false;
      try {
        granted = (await chrome.permissions.contains({ origins: [BG.CHAT_ORIGIN] })) || (await chrome.permissions.request({ origins: [BG.CHAT_ORIGIN] }));
      } catch {}
      if (!granted) {
        $(k).checked = false;
        return toast('Cần cho phép addon kết nối chat.beincom.com', 'err');
      }
      await saveSettings({ [k]: on });
      return chatRefresh();
    }
    saveSettings({ [k]: on });
  });
}
for (const k of SETTING_NUMS) $(k).addEventListener('change', () => saveSettings({ [k]: Number($(k).value) }));
$('watchKeywords').addEventListener('change', () => saveSettings({ watchKeywords: BG.parseList($('watchKeywords').value) }));
$('trustedMembers').addEventListener('change', () => saveSettings({ trustedMembers: BG.parseList($('trustedMembers').value, { username: true }) }));

// ---------- Gửi thông báo về Telegram ----------
// Form chỉ nạp một lần (không ghi đè khi đang gõ); lưu khi bấm Lưu. Quyền gửi tới api.telegram.org xin ngay khi bấm (cần thao tác của người dùng).

const TG_ORIGIN = 'https://api.telegram.org/*';

async function loadTelegramForm() {
  const { telegram } = await chrome.storage.local.get('telegram');
  const cfg = { ...BG.DEFAULT_TELEGRAM, ...telegram, kinds: { ...BG.DEFAULT_TELEGRAM.kinds, ...telegram?.kinds } };
  $('tg-enabled').checked = !!cfg.enabled;
  $('tg-token').value = cfg.token || '';
  $('tg-chat').value = cfg.chatId || '';
  $('tg-quiet').checked = !!cfg.quietNight;
  $('tg-actions').checked = !!cfg.actions;
  $('tg-kinds').replaceChildren(...Object.entries(BG.TELEGRAM_KINDS).map(([k, label]) => el('label', { class: 'check small' }, el('input', { type: 'checkbox', 'data-kind': k, checked: !!cfg.kinds[k] }), ' ' + label)));
}

function renderTelegramStatus() {
  const st = data.telegramStatus;
  const poll = data.telegramPoll;
  const pollErr = poll?.ok === false ? `Đọc nút bấm lỗi lúc ${fmtTime(poll.at)}: ${poll.error}` : '';
  $('tg-status').textContent = [!st ? '' : st.ok ? `Gửi lần cuối ${fmtTime(st.at)} ✓` : `Lỗi lúc ${fmtTime(st.at)}: ${st.error}`, pollErr].filter(Boolean).join(' · ');
  $('tg-status').classList.toggle('err-text', (!!st && !st.ok) || !!pollErr);
}

// Xin quyền gửi tới Telegram (hỏi một lần; đã cho phép thì trả về luôn)
async function askTelegramPermission() {
  try {
    if (await chrome.permissions.contains({ origins: [TG_ORIGIN] })) return true;
    return await chrome.permissions.request({ origins: [TG_ORIGIN] });
  } catch {
    return false;
  }
}

$('btn-tg-show').addEventListener('click', () => {
  const t = $('tg-token');
  t.type = t.type === 'password' ? 'text' : 'password';
  $('btn-tg-show').textContent = t.type === 'password' ? 'Hiện' : 'Ẩn';
});

$('btn-tg-chat').addEventListener('click', async () => {
  if (!(await askTelegramPermission())) return toast('Cần cho phép addon kết nối api.telegram.org', 'err');
  const r = await chrome.runtime.sendMessage({ type: 'telegramChatId', token: $('tg-token').value.trim() });
  if (r?.status !== 'ok') return toast(r?.message || 'Không lấy được chat ID', 'err');
  $('tg-chat').value = r.chatId;
  $('tg-chat-name').textContent = r.name ? '· ' + r.name : '';
  toast(`Đã lấy chat ID${r.name ? ' của ' + r.name : ''}. Bấm Gửi thử rồi Lưu.`);
});

$('btn-tg-test').addEventListener('click', async () => {
  if (!(await askTelegramPermission())) return toast('Cần cho phép addon kết nối api.telegram.org', 'err');
  const r = await chrome.runtime.sendMessage({ type: 'telegramTest', token: $('tg-token').value.trim(), chatId: $('tg-chat').value.trim() });
  if (r?.status !== 'ok') return toast(r?.message || 'Gửi thử lỗi', 'err');
  toast('Đã gửi tin thử — xem trong Telegram.');
});

$('btn-tg-save').addEventListener('click', async () => {
  const enabled = $('tg-enabled').checked;
  const token = $('tg-token').value.trim();
  const chatId = $('tg-chat').value.trim();
  if (enabled) {
    if (!(await askTelegramPermission())) return toast('Cần cho phép addon kết nối api.telegram.org để bật gửi Telegram', 'err');
    if (!BG.validTelegramToken(token)) return toast('Token bot chưa đúng dạng (vd 123456789:AA…)', 'err');
    if (!chatId) return toast('Chưa có chat ID — bấm Lấy chat ID', 'err');
  }
  const kinds = Object.fromEntries([...document.querySelectorAll('#tg-kinds input')].map((i) => [i.dataset.kind, i.checked]));
  const actions = $('tg-actions').checked;
  await chrome.storage.local.set({ telegram: { enabled, token, chatId, kinds, quietNight: $('tg-quiet').checked, actions } });
  toast(!enabled ? 'Đã lưu (đang tắt gửi Telegram).' : actions ? 'Đã lưu. Việc mới sẽ gửi về Telegram kèm nút xử lý ở các lần quét tự động.' : 'Đã lưu. Addon sẽ gửi thông báo về Telegram ở các lần quét tự động.');
});

loadTelegramForm();

// ---------- Đồng bộ giữa các máy ----------

const SYNC_KEY_LABELS = { settings: 'Cài đặt', rules: 'Quy tắc thành viên', postRules: 'Quy tắc bài viết', groupRules: 'Quy tắc riêng', welcome: 'Mẫu bài chào', shoutout: 'Mẫu bài vinh danh' };

function renderSync() {
  const on = !!data.settings.syncSettings;
  $('syncSettings').checked = on;
  $('btn-sync-now').hidden = !on;
  const st = data.syncStatus;
  const what = (keys) => (keys || []).map((k) => SYNC_KEY_LABELS[k] || k).join(', ');
  let text = on ? 'Đang bật.' : 'Đang tắt.';
  if (on && st?.at) text = `Lần cuối ${fmtTime(st.at)}: ${st.dir === 'pull' ? 'nhận từ máy khác' : 'gửi lên'}${st.keys?.length ? ' (' + what(st.keys) + ')' : ''}.`;
  if (on && st?.skipped?.length) text += ` Không đồng bộ được vì quá 8 KB: ${what(st.skipped)} — dùng Sao lưu.`;
  $('sync-status').textContent = text;
}

$('syncSettings').addEventListener('change', async () => {
  if (!$('syncSettings').checked) return saveSettings({ syncSettings: false });
  const st = await chrome.runtime.sendMessage({ type: 'syncStatus' });
  let mode = 'push';
  // Đã có bản đồng bộ từ máy khác: hỏi lấy bản nào
  if (st?.keys?.length && st.fromOther) {
    const pull = el('input', { type: 'radio', name: 'sync-mode', checked: true });
    const push = el('input', { type: 'radio', name: 'sync-mode' });
    const extra = el('div', { class: 'sync-choice' }, el('label', { class: 'check' }, pull, ` Dùng cài đặt đã đồng bộ từ máy khác (cập nhật ${fmtTime(st.at)})`), el('label', { class: 'check' }, push, ' Dùng cài đặt của máy này (ghi đè bản đồng bộ)'));
    const ok = await confirmDialog({ title: 'Bật đồng bộ cài đặt?', text: 'Tài khoản trình duyệt đã có bản đồng bộ từ một máy khác.', okText: 'Bật đồng bộ', extra, local: true, sendNote: 'Chỉ đổi trong addon và tài khoản trình duyệt, không gửi gì lên Beincom.' });
    if (!ok) {
      $('syncSettings').checked = false;
      return;
    }
    mode = pull.checked ? 'pull' : 'push';
  }
  const r = await chrome.runtime.sendMessage({ type: 'syncNow', mode, enable: true });
  if (r?.status !== 'ok') return toast('Bật đồng bộ lỗi: ' + (r?.message || 'không rõ'), 'err');
  toast(mode === 'pull' ? 'Đã bật đồng bộ và lấy cài đặt từ máy khác.' : 'Đã bật đồng bộ và gửi cài đặt của máy này lên.');
});

$('btn-sync-now').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'syncNow', mode: 'push' });
  if (r?.status !== 'ok') return toast('Đồng bộ lỗi: ' + (r?.message || 'không rõ'), 'err');
  toast(r.skipped?.length ? `Đã gửi lên; bỏ qua vì quá lớn: ${r.skipped.map((k) => SYNC_KEY_LABELS[k] || k).join(', ')}.` : 'Đã gửi cài đặt lên bản đồng bộ.');
});
