// Opt-in Guar Studio publishing worker. No Beincom credential ever leaves this addon.
// Keep a durable fence before every non-idempotent operation. Never delete or recreate
// a draft after an ambiguous response; reconciliation only reads its existing ID.
const GUAR_PUBLISH_ALARM = 'guar-publish-poll';
const GUAR_PUBLISH_CONFIG = 'guarPublish';
const GUAR_PUBLISH_JOURNAL = 'guarPublishJournal';
const GUAR_PUBLISH_API = '/api/integrations/beinfusion';
let guarPublishRunning = false;

function guarPublishBase(value) {
  try {
    const u = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(u.protocol) && ['127.0.0.1', 'localhost'].includes(u.hostname)
      && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' ? u.origin : '';
  } catch { return ''; }
}
const guarPublishId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

async function guarPublishConfig() {
  return (await chrome.storage.local.get(GUAR_PUBLISH_CONFIG))[GUAR_PUBLISH_CONFIG] || {};
}
async function guarPublishRequest(cfg, path, body) {
  const ctl = new AbortController();
  // Claim/write fences may wait for Guar to refresh Google auth and check video readiness.
  // A short timeout here can strand a creating fence before any Beincom request is sent.
  const timer = setTimeout(() => ctl.abort(), path === '/heartbeat' ? 10000 : 30000);
  try {
    const r = await fetch(cfg.url + GUAR_PUBLISH_API + path, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Kết nối Guar chưa được cấp quyền hoặc đã bị thu hồi.' : 'Guar chưa xác nhận thao tác (HTTP ' + r.status + ').');
    return await r.json();
  } catch (e) {
    if (e.message?.startsWith('Guar ') || e.message?.startsWith('Kết nối Guar ')) throw e;
    throw new Error('Không kết nối được Guar Studio; giữ nguyên hàng đợi.');
  } finally { clearTimeout(timer); }
}
async function guarPublishSchedule() {
  const cfg = await guarPublishConfig();
  if (!cfg.enabled) return chrome.alarms.clear(GUAR_PUBLISH_ALARM);
  await chrome.alarms.create(GUAR_PUBLISH_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
}
async function guarPublishSave(cfg) {
  const previous = await guarPublishConfig();
  const url = guarPublishBase(cfg.url);
  const token = cfg.token || (url === previous.url ? previous.token : '');
  if (!url) throw new Error('Chỉ nhận địa chỉ Guar Studio trên máy này, không có đường dẫn phía sau.');
  if (cfg.enabled && !/^[A-Za-z0-9_-]{32,512}$/.test(token || '')) throw new Error('Cần mã ghép nối do Guar Studio cấp.');
  // Có mã ghép nối là dùng mạng tới Guar (nhận bài và / hoặc lấy ảnh — dash/guar.js): cần quyền truy cập địa chỉ đó
  if ((cfg.enabled || token) && !(await chrome.permissions.contains({ origins: [new URL(url).protocol + '//' + new URL(url).hostname + '/*'] }))) throw new Error('Chưa cấp quyền truy cập địa chỉ Guar Studio.');
  await chrome.storage.local.set({ [GUAR_PUBLISH_CONFIG]: { url, token, enabled: cfg.enabled === true } });
  await guarPublishSchedule();
  return guarPublishStatus();
}
async function guarPublishStatus() {
  const cfg = await guarPublishConfig();
  const { guarPublishStatus: status } = await chrome.storage.local.get('guarPublishStatus');
  return { status: 'ok', config: { url: cfg.url || '', enabled: !!cfg.enabled, has_token: !!cfg.token }, worker: status || null };
}
async function guarPublishNote(message, extra = {}) {
  await chrome.storage.local.set({ guarPublishStatus: { at: new Date().toISOString(), message, ...extra } });
}
async function guarPublishKey(cfg, task) {
  const bytes = new TextEncoder().encode(cfg.url + '\n' + task.pair_id + '\n' + task.id);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) => v.toString(16).padStart(2, '0')).join('');
}
async function guarPublishLoadJournal(key) {
  const all = (await chrome.storage.local.get(GUAR_PUBLISH_JOURNAL))[GUAR_PUBLISH_JOURNAL] || {};
  return all[key] || null;
}
async function guarPublishWriteJournal(key, record) {
  const all = (await chrome.storage.local.get(GUAR_PUBLISH_JOURNAL))[GUAR_PUBLISH_JOURNAL] || {};
  all[key] = { ...record, updated_at: new Date().toISOString() };
  await chrome.storage.local.set({ [GUAR_PUBLISH_JOURNAL]: all });
}
// Nhật ký BeinFusion: một dòng cho mỗi bài Guar Studio gửi sang, lúc Beincom nhận lần đầu (đã đăng hoặc đang chờ duyệt)
async function guarPublishLog(task, contentId, phase) {
  const { state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const targets = task.group_ids.map((id) => groups.find((g) => g.id === id)).filter(Boolean);
  pushLog(log, [{
    time: Date.now(),
    kind: 'compose',
    source: 'guar',
    action: 'publish',
    status: 'ok',
    groupId: task.group_ids[0] || '',
    groupName: targets.map((g) => g.name).join(', ') || task.group_ids.join(', '),
    communityName: [...new Set(targets.map((g) => g.communityName).filter(Boolean))].join(', '),
    contentId,
    contentType: 'POST',
    snippet: String(task.content || '').replace(/\s+/g, ' ').slice(0, 120),
    message: phase === 'published' ? 'Đã đăng (bài từ Guar Studio)' : 'Beincom đã nhận, đang xử lý / chờ duyệt (bài từ Guar Studio)',
  }]);
  await saveState(state, { log });
}
const GUAR_DONE = ['submitted', 'published'];

async function guarPublishEvent(cfg, task, phase, remoteId, message = '') {
  return guarPublishRequest(cfg, '/tasks/' + task.id + '/event', { phase, ...(remoteId ? { remote_id: remoteId } : {}), message: String(message).slice(0, 400) });
}
async function guarPublishMayWrite(cfg, client, accountId) {
  const current = await guarPublishConfig();
  const { settings } = await load();
  if (!current.enabled || current.url !== cfg.url || current.token !== cfg.token || settings.dryRun) throw new Error('Kết nối đã tắt hoặc đổi; giữ bản nháp chưa đăng.');
  const me = await client.call('GET', 'user/me/profile', null, '');
  if (!BG.isOk(me) || me.body?.data?.id !== accountId) throw new Error('Tài khoản Beincom đã đổi; giữ bản nháp chưa đăng.');
}
function guarPublishValidate(task, accountId, groups) {
  if (!task || !guarPublishId(task.id) || !guarPublishId(task.pair_id) || !/^[a-f0-9]{64}$/i.test(task.payload_hash || '')) return 'Gói đăng không hợp lệ.';
  if (task.account_id !== accountId) return 'Tài khoản Beincom đã đổi; không gửi bài.';
  if (!['youtube', 'audio_link'].includes(task.source_kind)) return 'Loại nguồn chưa được hỗ trợ.';
  if (!Array.isArray(task.group_ids) || !task.group_ids.length || task.group_ids.some((id) => !guarPublishId(id) || !groups.has(id))) return 'Có nhóm không còn quyền truy cập; hãy cập nhật đích đăng.';
  if (typeof task.content !== 'string' || !task.content.trim() || task.content.length > 3000) return 'Nội dung bài vượt giới hạn hoặc trống.';
  if (task.not_before && (!Number.isFinite(Date.parse(task.not_before)) || Date.parse(task.not_before) > Date.now())) return 'Chưa tới lịch đăng.';
  try {
    const url = new URL(task.source_url);
    if (url.protocol !== 'https:' || url.username || url.password || !task.content.includes(task.source_url)) return 'Liên kết nguồn không hợp lệ.';
    if (task.source_kind === 'youtube' && !['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) return 'Nguồn video không phải YouTube.';
  } catch { return 'Liên kết nguồn không hợp lệ.'; }
  return BG.validateCompose({ groupIds: task.group_ids, content: task.content });
}
async function guarPublishRunTask(cfg, task, client, accountId, groups) {
  const invalid = guarPublishValidate(task, accountId, groups);
  if (invalid) {
    if (guarPublishId(task?.id)) await guarPublishEvent(cfg, task, 'attention', task.remote_id, invalid);
    return { status: 'error', message: invalid };
  }
  const key = await guarPublishKey(cfg, task);
  const previous = await guarPublishLoadJournal(key);
  if (previous && (previous.payload_hash !== task.payload_hash || previous.account_id !== accountId)) throw new Error('Biên nhận không khớp nội dung hoặc tài khoản; không đăng lại.');
  const knownId = previous?.remote_id || task.remote_id;
  if (knownId && !guarPublishId(knownId)) throw new Error('Mã bài từ biên nhận không hợp lệ.');
  if (previous?.remote_id && task.remote_id && previous.remote_id !== task.remote_id) throw new Error('Hai biên nhận có mã bài khác nhau; cần đối chiếu.');
  let record = previous || { task_id: task.id, payload_hash: task.payload_hash, account_id: accountId, phase: task.phase || 'dispatched', remote_id: knownId || null };
  const save = async (phase, remoteId = record.remote_id) => {
    record = { ...record, phase, remote_id: remoteId || null };
    await guarPublishWriteJournal(key, record);
  };
  const attention = async (message) => {
    await save('attention');
    await guarPublishEvent(cfg, task, 'attention', record.remote_id, message);
    return { status: 'error', message };
  };
  // Use either side's fence: a lost local storage write must never lower server phase.
  const phases = [record.phase, task.phase];
  if (!knownId && phases.some((phase) => phase !== 'dispatched' && phase !== undefined)) return attention('Lượt tạo nháp trước chưa rõ kết quả. Không tự tạo bài khác; đối chiếu trên Beincom.');
  if (knownId) {
    record.remote_id = knownId;
    const r = await client.call('GET', `content/contents/${knownId}`);
    if (!BG.isOk(r) || !r.body?.data) return attention('Chưa đọc được bài đã tạo; giữ mã bài và không tạo lại.');
    const data = r.body.data;
    if (data.id !== knownId || data.actor?.id !== accountId) return attention('Bài đã tạo không thuộc tài khoản đang kết nối hoặc mã bài không khớp.');
    const audience = (data.audience?.groups || []).map((group) => group.id).sort();
    const expectedGroups = [...task.group_ids].sort();
    if (JSON.stringify(audience) !== JSON.stringify(expectedGroups)) return attention('Nhóm nhận của bài không khớp lượt đã xếp; chưa nhận biên nhận này.');
    const status = data.status;
    const contentMatches = String(data.content || '').trim() === task.content.trim();
    if ((status !== 'DRAFT' && !contentMatches) || (status === 'DRAFT' && String(data.content || '').trim() && !contentMatches)) return attention('Nội dung bài khác bản đã xếp; chưa nhận biên nhận hoặc ghi đè bài này.');
    if (['images', 'videos', 'files'].some((kind) => (data.media?.[kind] || []).length)) return attention('Bài có tệp đính kèm ngoài bản đã xếp; cần đối chiếu.');
    if (status === 'PUBLISHED') {
      if (!GUAR_DONE.includes(record.phase)) await guarPublishLog(task, knownId, 'published');
      await save('published');
      await guarPublishEvent(cfg, task, 'published', knownId, 'Đã đăng trên Beincom.');
      return { status: 'ok', message: 'Đã đăng trên Beincom.', contentId: knownId };
    }
    if (['PROCESSING', 'WAITING_SCAN', 'WAITING_APPROVAL', 'WAITING_SCHEDULE'].includes(status)) {
      if (!GUAR_DONE.includes(record.phase)) await guarPublishLog(task, knownId, 'submitted');
      await save('submitted');
      await guarPublishEvent(cfg, task, 'submitted', knownId, 'Beincom đã nhận; đang xử lý hoặc chờ duyệt.');
      return { status: 'ok', message: 'Beincom đã nhận; đang chờ trạng thái cuối.', contentId: knownId };
    }
    // Only a fully persisted draft, known never sent, may issue its first publish.
    if (status !== 'DRAFT' || phases.some((phase) => ['publishing', 'submitted', 'published', 'attention'].includes(phase))) return attention('Kết quả gửi bài chưa chắc chắn hoặc bị từ chối; không tự gửi lại.');
    // A successful local draft receipt may outlive a failed server draft acknowledgement.
    // Reconcile that same ID before advancing the server's durable publish fence.
    if (task.phase === 'creating' || task.phase === 'dispatched') await guarPublishEvent(cfg, task, 'draft', knownId);
  } else {
    await guarPublishMayWrite(cfg, client, accountId);
    // Server fence first, local fence second; no remote operation if either write fails.
    await guarPublishEvent(cfg, task, 'creating');
    await save('creating');
    await guarPublishMayWrite(cfg, client, accountId);
    const created = await client.call('POST', 'content/posts', { audience: { groupIds: task.group_ids }, isEnableDonation: false });
    const id = created.body?.data?.id;
    if (!BG.isOk(created) || !guarPublishId(id)) return attention('Lần tạo nháp chưa được xác nhận. Không tự tạo lại; kiểm tra Beincom.');
    await save('draft', id);
    await guarPublishEvent(cfg, task, 'draft', id);
  }
  // Recheck opt-in immediately before the external write.
  await guarPublishMayWrite(cfg, client, accountId);
  // Plain link remains usable when Beincom's preview metadata endpoint is unavailable.
  const preview = await client.call('GET', 'group/url-metadata?url=' + encodeURIComponent(task.source_url));
  const body = BG.composeBody({ groupIds: task.group_ids, content: task.content, linkPreview: BG.isOk(preview) ? preview.body?.data : null });
  await guarPublishEvent(cfg, task, 'publishing', record.remote_id);
  await save('publishing');
  await guarPublishMayWrite(cfg, client, accountId);
  const result = await client.call('PUT', `content/posts/${record.remote_id}/publish`, body);
  if (!BG.isOk(result)) return attention('Chưa xác nhận được kết quả đăng. Giữ bản nháp và mã bài để đối chiếu; không đăng lại.');
  const phase = result.body?.data?.status === 'PUBLISHED' ? 'published' : 'submitted';
  await guarPublishLog(task, record.remote_id, phase);
  await save(phase);
  await guarPublishEvent(cfg, task, phase, record.remote_id, phase === 'published' ? 'Đã đăng trên Beincom.' : 'Beincom đã nhận; đang xử lý hoặc chờ duyệt.');
  return { status: 'ok', message: phase === 'published' ? 'Đã đăng trên Beincom.' : 'Beincom đã nhận; đang chờ trạng thái cuối.', contentId: record.remote_id };
}

async function guarPublishTick() {
  if (guarPublishRunning) return { status: 'busy', message: 'Đang xử lý hàng đợi.' };
  guarPublishRunning = true;
  try {
    const cfg = await guarPublishConfig();
    if (!cfg.enabled || !guarPublishBase(cfg.url) || !cfg.token) return { status: 'ok', message: 'Cổng đăng đang tắt.' };
    const { settings, state } = await load();
    const result = await withClient(async (client) => {
      const me = await client.call('GET', 'user/me/profile', null, '');
      if (!BG.isOk(me) || !guarPublishId(me.body?.data?.id)) return { status: 'need_login', message: 'Hãy đăng nhập Beincom để tiếp tục.' };
      const permissions = await client.call('GET', 'group/me/permissions');
      if (!BG.isOk(permissions)) return { status: 'error', message: 'Chưa đọc được quyền nhóm trên Beincom.' };
      const cached = new Map((state.snapshot?.groups || []).map((g) => [g.id, g.name]));
      const groups = BG.adminGroups(permissions.body.data).slice(0, 1000).map((g) => ({ id: g.id, name: cached.get(g.id) || g.id }));
      const account = { id: me.body.data.id, name: String(me.body.data.fullname || me.body.data.username || me.body.data.id).slice(0, 200) };
      await guarPublishRequest(cfg, '/heartbeat', { account, groups });
      if (settings.dryRun) return { status: 'ok', message: 'Đã đồng bộ tài khoản và nhóm. BeinFusion đang Chạy thử; chưa nhận hoặc gửi bài.' };
      const claimed = await guarPublishRequest(cfg, '/claim', { account_id: account.id });
      if (!claimed.task) return { status: 'ok', message: 'Đã kết nối. Chưa có bài tới lịch và đủ điều kiện.' };
      return guarPublishRunTask(cfg, claimed.task, client, account.id, new Set(groups.map((g) => g.id)));
    });
    await guarPublishNote(result.message || 'Đã kiểm tra hàng đợi.', { status: result.status, ...(result.contentId ? { content_id: result.contentId } : {}) });
    return result;
  } catch (e) {
    // Never include fetch bodies, tokens, raw API errors or task contents in diagnostics.
    const message = e.message?.startsWith('Guar ') || e.message?.startsWith('Kết nối Guar ') || e.message?.startsWith('Không kết nối được Guar ') ? e.message : 'Cổng đăng bị gián đoạn; giữ biên nhận và không tự tạo lại bài.';
    await guarPublishNote(message, { status: 'error' }).catch(() => {});
    return { status: 'error', message };
  } finally { guarPublishRunning = false; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!['guarPublishStatus', 'guarPublishSave', 'guarPublishPoll', 'guarPublishDisconnect'].includes(msg?.type)) return;
  // These commands cannot come from a web page or content script.
  if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('dashboard.html')) {
    sendResponse({ status: 'error', message: 'Chỉ nhận thao tác từ Cài đặt BeinFusion.' });
    return false;
  }
  const action = msg.type === 'guarPublishStatus' ? guarPublishStatus
    : msg.type === 'guarPublishPoll' ? guarPublishTick
      : msg.type === 'guarPublishDisconnect' ? async () => {
        await chrome.storage.local.remove(GUAR_PUBLISH_CONFIG);
        await guarPublishSchedule();
        return guarPublishStatus();
      } : () => guarPublishSave(msg.config || {});
  Promise.resolve().then(action).then(sendResponse, (e) => sendResponse({ status: 'error', message: e?.message || 'Không lưu được kết nối; kiểm tra địa chỉ, mã ghép nối và quyền truy cập.' }));
  return true;
});
