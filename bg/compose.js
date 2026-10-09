// Service worker — đăng bài, hẹn giờ, tải file, tag / series, nhắc tên, xem trước link, ghim, cài đặt bài, sửa bài, bài đã hẹn giờ.

// ---------- Đăng bài / hẹn giờ ----------
// Giống web: POST content/posts (tạo nháp, nhận id) -> PUT content/posts/{id}/publish | schedule.
// Bước 2 lỗi thì xoá bản nháp vừa tạo (Beincom giới hạn số bản nháp).

async function doCompose({ groupIds, content, setting, scheduledAt = null, media = null, mentions = null, linkPreview = null, tags = [], series = [], recur = '', asGroup = false, source = 'manual' }) {
  const err = BG.validateCompose({ groupIds, content, setting, scheduledAt, media, tags, series, asGroup });
  if (err) return { status: 'error', message: err };
  const { settings, state, log } = await load();
  const known = new Map((state.snapshot?.groups || []).map((g) => [g.id, g]));
  const targets = groupIds.map((id) => known.get(id)).filter(Boolean);
  if (targets.length !== groupIds.length) return { status: 'error', message: 'Có group không còn trong danh sách — hãy quét lại' };
  if (asGroup && targets[0].canPostAsGroup === false) return { status: 'error', message: `${targets[0].name}: không có quyền đăng dưới tên group (cần quyền tạo bài của admin)` };

  const action = scheduledAt ? 'schedule' : 'publish';
  const body = BG.composeBody({ groupIds, content, setting, scheduledAt, media, mentions, linkPreview, tags, series });
  const attached = BG.mediaSummary(body.media);
  const base = {
    kind: 'compose',
    source,
    action,
    groupId: targets[0].id,
    groupName: targets.map((g) => g.name).join(', '),
    communityName: [...new Set(targets.map((g) => g.communityName))].join(', '),
    snippet: ((recur ? `[🔁 ${recur}] ` : '') + (asGroup ? `[Tên group] ` : '') + (attached ? `[${attached}] ` : '') + body.content.replace(/\s+/g, ' ')).slice(0, 120),
    scheduledAt: body.scheduledAt || null,
    ...(asGroup ? { asGroup: true } : {}),
  };

  let r;
  if (settings.dryRun) r = { status: 'ok', dry: true };
  else {
    r = await withClient(async (client) => {
      // Tag / series phải dùng được với các group đã chọn: kiểm tra trước khi tạo bản nháp (lỗi khác thì để bước đăng kiểm tra)
      if (body.tags.length || body.series.length) {
        const v = await client.call('POST', 'content/contents/validate-series-tags', { groups: body.audience.groupIds, series: body.series, tags: body.tags });
        if (v.status === 401) return { ...NEED_LOGIN };
        if (v.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(v.body, tags, series) };
      }
      // Đăng dưới tên group: bản nháp tạo qua API quản trị group (như web), các bước sau giống bài thường
      const d = asGroup
        ? await client.call('POST', `content/manage/groups/${targets[0].id}/posts`, { audience: { groupIds: body.audience.groupIds }, isEnableDonation: false })
        : await client.call('POST', 'content/posts', { audience: { groupIds: body.audience.groupIds }, isEnableDonation: false });
      if (d.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(d) || !d.body.data?.id) return { status: 'error', message: (asGroup ? 'Tạo bài nháp dưới tên group lỗi (có thể Beincom chưa bật tính năng này cho tài khoản): ' : 'Tạo bài nháp lỗi: ') + BG.errMsg(d) };
      const id = d.body.data.id;
      const p = await client.call('PUT', `content/posts/${id}/${action}`, body);
      if (!BG.isOk(p)) {
        await client.call('DELETE', `content/posts/${id}`);
        if (p.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(p.body, tags, series) };
        return { status: 'error', message: (action === 'schedule' ? 'Hẹn giờ lỗi: ' : 'Đăng bài lỗi: ') + BG.errMsg(p) };
      }
      return { status: 'ok', contentId: id, postStatus: p.body.data?.status || null };
    });
  }
  return finishCompose(r, { base, contentType: 'POST', state, log });
}

// Ghi nhật ký một lần đăng (bài / Article / Series) và trả kết quả cho Dashboard
async function finishCompose(r, { base, contentType, state, log }) {
  const status = r.dry ? 'dry' : r.status === 'ok' ? 'ok' : 'error';
  const message = r.dry ? 'Chạy thử — chưa gửi lên Beincom' : r.status === 'ok' ? BG.CONTENT_STATUS[r.postStatus] || r.postStatus || '' : r.message;
  pushLog(log, [{ time: Date.now(), ...base, contentId: r.contentId || '', contentType, status, message }]);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return {
    status: r.status,
    message: r.message || '',
    dryRun: !!r.dry,
    ok: status === 'ok' ? 1 : 0,
    dry: status === 'dry' ? 1 : 0,
    failed: status === 'error' ? 1 : 0,
    errors: status === 'error' ? [message] : [],
    contentId: r.contentId || null,
    postStatus: r.postStatus || null,
  };
}

// ---------- Tải ảnh / video / tệp lên (Dashboard gửi nội dung file, background lo phần gọi API có đăng nhập) ----------
// Giống web Beincom:
//  - ảnh:  POST upload/images/ { properties: { mime_type }, resource: 'post:content' } -> { id, presigned_post }
//  - video: POST upload/videos/ { properties: { mime_type } } (kèm x-version-id) -> { id, presigned_post }
//  - tệp:  POST upload/files/ -> { id }; Dashboard gửi file tới upload/files/{id}
// Ảnh / video: Dashboard gửi file lên presigned_post.url rồi gọi uploadWait để chờ Beincom xử lý.
const UPLOAD_PATH = { image: 'upload/images/', video: 'upload/videos/', file: 'upload/files/' };
const UPLOAD_WAIT_MS = { image: 120e3, video: 600e3 };

const IMAGE_RESOURCES = ['post:content', 'article:cover', 'article:content', 'series:cover'];

async function doUploadInit({ kind, mimeType = '', resource = 'post:content' }) {
  if (!UPLOAD_PATH[kind]) return { status: 'error', message: 'Loại file không hợp lệ' };
  if (kind === 'image' && !IMAGE_RESOURCES.includes(resource)) return { status: 'error', message: 'Loại ảnh không hợp lệ' };
  return withClient(async (client) => {
    const body = kind === 'file' ? null : { properties: { mime_type: mimeType }, ...(kind === 'image' ? { resource } : {}) };
    const r = await client.call('POST', UPLOAD_PATH[kind], body, kind === 'video' ? '2.0.0' : '');
    if (r.status === 401) return { ...NEED_LOGIN };
    const d = r.body?.data;
    if (!BG.isOk(r) || !d?.id) return { status: 'error', message: 'Không xin được chỗ tải lên: ' + BG.errMsg(r) };
    if (kind === 'file') return { status: 'ok', id: d.id };
    if (!d.presigned_post?.url) return { status: 'error', message: 'Beincom không trả link tải lên' };
    return { status: 'ok', id: d.id, url: d.presigned_post.url, fields: d.presigned_post.fields || {} };
  });
}

// unsure: Dashboard không đọc được phản hồi của kho lưu trữ (bị chặn CORS) nên chưa chắc file đã lên
async function doUploadWait({ kind, id, unsure = false }) {
  if (kind !== 'image' && kind !== 'video') return { status: 'error', message: 'Loại file không hợp lệ' };
  return withClient(async (client) => {
    const r = await client.call('GET', `${UPLOAD_PATH[kind]}${id}?wait=true`, null, kind === 'video' ? '2.0.0' : '', UPLOAD_WAIT_MS[kind]);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (r.timeout) return { status: 'error', message: kind === 'video' ? 'Beincom xử lý video quá lâu, thử lại sau' : 'Beincom xử lý ảnh quá lâu' };
    const d = r.body?.data;
    if (!BG.isOk(r) || !d) return { status: 'error', message: 'Beincom chưa nhận file: ' + BG.errMsg(r) };
    if (d.status === 'ERROR') return { status: 'error', message: 'Beincom báo lỗi file: ' + (d.error_message || 'không rõ') };
    if (!d.url && (kind === 'image' || unsure)) return { status: 'error', message: unsure ? 'File chưa lên được kho lưu trữ (trình duyệt có thể đã chặn)' : 'Beincom chưa xử lý xong ảnh' };
    return { status: 'ok', item: BG.mediaItem(kind, id, d) };
  });
}

// ---------- Tag và series (đọc khi soạn bài) ----------

// Group gốc của một group: lần quét mới có rootGroupId; bản cũ thì lấy group gốc cùng community nếu đang quản trị
function rootOf(g, groups) {
  if (!g) return '';
  if (g.rootGroupId) return g.rootGroupId;
  if (g.isCommunity) return g.id;
  return groups.find((x) => x.isCommunity && x.communityId === g.communityId)?.id || '';
}

const TAG_SERIES_PAGES = 8; // tối đa 8 trang × 25

// Tag lấy theo group gốc của các group sẽ đăng (giống web), series theo chính các group đó
async function doTagsSeries({ groupIds = [] }) {
  if (!groupIds.length) return { status: 'ok', tags: [], series: [] };
  const { state } = await load();
  const groups = state.snapshot?.groups || [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const roots = [...new Set(groupIds.map((id) => rootOf(byId.get(id), groups)).filter(Boolean))];
  const ids = (list) => list.map((id) => 'groupIds[]=' + encodeURIComponent(id)).join('&');
  return withClient(async (client) => {
    const readAll = async (path, slim) => {
      const out = [];
      for (let page = 0, offset = 0; page < TAG_SERIES_PAGES; page++) {
        const r = await client.call('GET', `${path}&offset=${offset}`);
        if (r.status === 401) return { error: NEED_LOGIN };
        if (!BG.isOk(r)) return { error: { status: 'error', message: 'Đọc tag / series lỗi: ' + BG.errMsg(r) } };
        const list = r.body.data?.list || [];
        out.push(...list.map(slim));
        offset += list.length;
        if (!list.length || offset >= (r.body.data?.meta?.total ?? 0)) break;
      }
      return { list: out };
    };
    const [t, s] = await Promise.all([roots.length ? readAll(`content/tags?${ids(roots)}`, BG.slimTag) : { list: [] }, readAll(`content/series?${ids(groupIds)}`, BG.slimSeries)]);
    if (t.error) return t.error;
    if (s.error) return s.error;
    const note = roots.length < new Set(groupIds.map((id) => byId.get(id)?.communityId)).size ? 'Bấm "Quét ngay" để tải tag của các group con' : '';
    return { status: 'ok', tags: t.list, series: s.list, note };
  });
}

// ---------- Nhắc tên và xem trước link (đọc khi soạn bài) ----------

// Người nhắc tên được trong các group sẽ đăng. API người dùng không nhận header phiên bản (bị 400).
async function doMentionable({ groupIds = [], key = '' }) {
  if (!groupIds.length) return { status: 'ok', users: [] };
  return withClient(async (client) => {
    // Dấu phẩy để nguyên như web gửi (axios không mã hoá dấu phẩy)
    const ids = groupIds.map(encodeURIComponent).join(',');
    const r = await client.call('GET', `user/users/mentionable?group_ids=${ids}${key.trim() ? '&' + qs({ key: key.trim() }) : ''}`, null, '');
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Tìm người lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', users: (r.body.data || []).map(BG.slimMentionable) };
  });
}

// Xem trước link: bài / article / series trên Beincom dùng API nội dung, link ngoài dùng url-metadata (giống web)
const BIC_CONTENT_URL = /^https?:\/\/(?:www\.)?group\.beincom\.com\/(?:posts|article|series)\/([^/?#]+)/i;

async function doLinkPreview({ url = '' }) {
  if (!/^https?:\/\//i.test(url)) return { status: 'error', message: 'Link không hợp lệ' };
  const own = BIC_CONTENT_URL.exec(url);
  return withClient(async (client) => {
    const r = await client.call('GET', own ? `content/contents/${own[1]}/link-preview` : `group/url-metadata?${qs({ url })}`, null, '2.0.0', 15000);
    if (r.status === 401) return { ...NEED_LOGIN };
    const preview = BG.isOk(r) ? BG.slimLinkPreview(r.body.data) : null;
    if (!preview) return { status: 'error', message: r.timeout ? 'Beincom không phản hồi' : 'Không lấy được thông tin link: ' + BG.errMsg(r) };
    return { status: 'ok', preview };
  });
}

// ---------- Ghim, cài đặt bài, sửa bài đã đăng ----------

function postActLog(source, action, { contentId, snippet = '', groupName = '', actor = null }) {
  return { kind: 'post', source, action, contentId, contentType: 'POST', snippet: String(snippet).replace(/\s+/g, ' ').slice(0, 120), groupName, communityName: '', userId: actor?.id || '', username: actor?.username || '', fullname: actor?.fullname || '' };
}

// Chi tiết bài: mở lại trong khung soạn (sửa bài của mình); any = chỉ xem (vd đọc cài đặt hiện tại);
// scheduled = bài đang hẹn giờ của mình (sửa trước giờ đăng)
async function doPostDetail({ id, any = false, scheduled = false }) {
  if (!id) return { status: 'error', message: 'Thiếu bài' };
  const { state } = await load();
  return withClient(async (client) => {
    const r = await client.call('GET', `content/contents/${id}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (BG.isContentGone(r)) return { status: 'error', message: 'Bài không còn trên Beincom (đã bị xoá)' };
    if (!BG.isOk(r) || !r.body.data) return { status: 'error', message: 'Đọc bài lỗi: ' + BG.errMsg(r) };
    const post = BG.editState(r.body.data);
    if (any) return { status: 'ok', post };
    if (!state.me?.id || post.actorId !== state.me.id) return { status: 'error', message: 'Chỉ sửa được bài của chính bạn (Beincom không cho admin sửa bài người khác)' };
    if (scheduled) {
      if (!SCHEDULED_EDITABLE.includes(post.status)) return { status: 'error', message: 'Bài này không còn ở trạng thái hẹn giờ (có thể đã đăng)' };
      return { status: 'ok', post };
    }
    if (post.status && post.status !== 'PUBLISHED') return { status: 'error', message: 'Chỉ sửa được bài đã đăng' };
    return { status: 'ok', post };
  });
}

// Lưu bài đã sửa: PUT content/posts/{id} (như web, không kèm cài đặt); cài đặt đổi thì PUT …/setting riêng
async function doEditPost({ id, groupIds = [], content, media = null, mentions = null, linkPreview = null, tags = [], series = [], setting = null, settingChanged = false, source = 'manual' }) {
  if (!id) return { status: 'error', message: 'Thiếu bài' };
  const err = BG.validateCompose({ groupIds, content, media, tags, series, setting: settingChanged ? setting : null });
  if (err) return { status: 'error', message: err };
  const { settings, state, log } = await load();
  const body = BG.editBody({ groupIds, content, media, mentions, linkPreview, tags, series });
  const attached = BG.mediaSummary(body.media);
  const logBase = postActLog(source, 'edit', { contentId: id, snippet: (attached ? `[${attached}] ` : '') + body.content, groupName: '', actor: state.me });

  let r;
  if (settings.dryRun) r = { status: 'ok', dry: true };
  else {
    r = await withClient(async (client) => {
      const cur = await client.call('GET', `content/contents/${id}`);
      if (cur.status === 401) return { ...NEED_LOGIN };
      if (BG.isContentGone(cur)) return { status: 'error', message: 'Bài không còn trên Beincom (đã bị xoá)' };
      if (BG.isOk(cur) && cur.body.data?.actor?.id !== state.me?.id) return { status: 'error', message: 'Chỉ sửa được bài của chính bạn' };
      if (body.tags.length || body.series.length) {
        const v = await client.call('POST', 'content/contents/validate-series-tags', { groups: body.audience.groupIds, series: body.series, tags: body.tags });
        if (v.status === 401) return { ...NEED_LOGIN };
        if (v.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(v.body, tags, series) };
      }
      const p = await client.call('PUT', `content/posts/${id}`, body);
      if (p.status === 401) return { ...NEED_LOGIN };
      if (p.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(p.body, tags, series) };
      if (!BG.isOk(p)) return { status: 'error', message: 'Lưu bài lỗi: ' + BG.errMsg(p) };
      if (settingChanged) {
        const s = await client.call('PUT', `content/contents/${id}/setting`, BG.settingBody(setting));
        if (!BG.isOk(s)) return { status: 'ok', warning: 'Đã lưu nội dung nhưng đổi cài đặt lỗi: ' + BG.errMsg(s) };
      }
      return { status: 'ok' };
    });
  }
  const status = r.dry ? 'dry' : r.status === 'ok' ? 'ok' : 'error';
  pushLog(log, [{ time: Date.now(), ...logBase, status, message: r.dry ? DRY_MSG : r.warning || r.message || '' }]);
  const next = { ...state };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  // Cập nhật bài trong danh sách bài mới để khỏi phải quét lại
  if (status === 'ok') {
    next.recentPosts = (state.recentPosts || []).map((p) =>
      p.id === id ? { ...p, text: body.content.slice(0, 4000), media: { images: body.media.images.length, videos: body.media.videos.length, files: body.media.files.length }, link: body.linkPreview?.url || '' } : p,
    );
  }
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return { status: r.status, message: r.message || r.warning || '', dryRun: !!r.dry, ok: status === 'ok' ? 1 : 0, dry: status === 'dry' ? 1 : 0, failed: status === 'error' ? 1 : 0, errors: status === 'error' ? [r.message] : [] };
}

// Sửa bài đang hẹn giờ của mình (nội dung, file, cài đặt, giờ đăng): gửi lại PUT content/posts/{id}/schedule với đủ body
// như web làm khi sửa bài hẹn giờ.
const SCHEDULED_EDITABLE = ['WAITING_SCHEDULE', 'SCHEDULE_FAILED'];

async function doEditScheduled({ id, groupIds = [], content, setting, scheduledAt = null, media = null, mentions = null, linkPreview = null, tags = [], series = [], source = 'manual' }) {
  if (!id) return { status: 'error', message: 'Thiếu bài' };
  if (!scheduledAt) return { status: 'error', message: 'Chưa chọn giờ đăng' };
  const err = BG.validateCompose({ groupIds, content, setting, scheduledAt, media, tags, series });
  if (err) return { status: 'error', message: err };
  const { settings, state, log } = await load();
  const body = BG.composeBody({ groupIds, content, setting, scheduledAt, media, mentions, linkPreview, tags, series });
  const attached = BG.mediaSummary(body.media);
  const logBase = { ...postActLog(source, 'edit', { contentId: id, snippet: (attached ? `[${attached}] ` : '') + body.content, groupName: '', actor: state.me }), scheduledAt: body.scheduledAt };
  let r;
  if (settings.dryRun) r = { status: 'ok', dry: true };
  else {
    r = await withClient(async (client) => {
      const cur = await client.call('GET', `content/contents/${id}`);
      if (cur.status === 401) return { ...NEED_LOGIN };
      if (BG.isContentGone(cur)) return { status: 'error', message: 'Bài không còn trên Beincom (đã bị xoá)' };
      if (!BG.isOk(cur)) return { status: 'error', message: 'Đọc bài lỗi: ' + BG.errMsg(cur) };
      if (cur.body.data?.actor?.id !== state.me?.id) return { status: 'error', message: 'Chỉ sửa được bài của chính bạn' };
      if (!SCHEDULED_EDITABLE.includes(cur.body.data?.status)) return { status: 'error', message: 'Bài đã đăng hoặc không còn hẹn giờ — sửa như bài đã đăng' };
      if (body.tags.length || body.series.length) {
        const v = await client.call('POST', 'content/contents/validate-series-tags', { groups: body.audience.groupIds, series: body.series, tags: body.tags });
        if (v.status === 401) return { ...NEED_LOGIN };
        if (v.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(v.body, tags, series) };
      }
      const p = await client.call('PUT', `content/posts/${id}/schedule`, body);
      if (p.status === 401) return { ...NEED_LOGIN };
      if (p.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(p.body, tags, series) };
      if (!BG.isOk(p)) return { status: 'error', message: 'Lưu bài hẹn giờ lỗi: ' + BG.errMsg(p) };
      return { status: 'ok' };
    });
  }
  const status = r.dry ? 'dry' : r.status === 'ok' ? 'ok' : 'error';
  pushLog(log, [{ time: Date.now(), ...logBase, status, message: r.dry ? DRY_MSG : r.message || '' }]);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return { status: r.status, message: r.message || '', dryRun: !!r.dry, ok: status === 'ok' ? 1 : 0, dry: status === 'dry' ? 1 : 0, failed: status === 'error' ? 1 : 0, errors: status === 'error' ? [r.message] : [] };
}

// Đổi cài đặt một bài (bình luận, cảm xúc, Quan trọng) — admin đổi được cả bài người khác
async function doPostSetting({ id, setting, snippet = '', groupName = '', actor = null, source = 'manual' }) {
  if (!id) return { status: 'error', message: 'Thiếu bài' };
  const s = BG.settingBody(setting);
  if (s.isImportant && s.importantExpiredAt && new Date(s.importantExpiredAt).getTime() <= Date.now()) return { status: 'error', message: 'Ngày hết "Quan trọng" phải ở tương lai' };
  const { settings, state, log } = await load();
  const item = { log: postActLog(source, 'setting', { contentId: id, snippet, groupName, actor }), call: (c) => c.call('PUT', `content/contents/${id}/setting`, s), gone: true };
  item.log.reason = [s.canComment ? '' : 'tắt bình luận', s.canReact ? '' : 'tắt cảm xúc', s.isImportant ? 'Quan trọng' : ''].filter(Boolean).join(', ') || 'mặc định';
  const r = await performActions([item], settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return summary(r, settings);
}

// Bài đang ghim của các group (đọc, không cần chờ hàng đợi)
async function doPinned({ groupIds = [] }) {
  if (!groupIds.length) return { status: 'ok', pinned: {} };
  return withClient(async (client) => {
    const pinned = {};
    const errors = [];
    let needLogin = false;
    await mapLimit(groupIds, PARALLEL, async (gid) => {
      const r = await client.call('GET', `content/contents/pinned-content/groups/${gid}`);
      if (r.status === 401) return (needLogin = true);
      if (!BG.isOk(r)) return errors.push(BG.errMsg(r));
      const list = Array.isArray(r.body.data) ? r.body.data : r.body.data?.list || [];
      pinned[gid] = list.map(BG.slimPost);
    });
    if (needLogin) return { ...NEED_LOGIN };
    return { status: 'ok', pinned, errors };
  });
}

// Ghim / bỏ ghim một bài ở các group: PUT content/contents/pinned-content/{id} { pinGroupIds, unpinGroupIds }
async function doPinAct({ contentId, pin = [], unpin = [], snippet = '', actor = null, source = 'manual' }) {
  if (!contentId || (!pin.length && !unpin.length)) return { status: 'error', message: 'Chưa chọn group để ghim / bỏ ghim' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const nameOf = (id) => groups.find((g) => g.id === id)?.name || id;
  const admin = new Set(groups.map((g) => g.id));
  if ([...pin, ...unpin].some((id) => !admin.has(id))) return { status: 'error', message: 'Chỉ ghim / bỏ ghim được ở group bạn quản trị' };
  // Mỗi group tối đa 5 bài ghim: kiểm tra trước để báo rõ group nào đã đủ
  if (pin.length && !settings.dryRun) {
    const cur = await doPinned({ groupIds: pin });
    if (cur.status === 'need_login') return cur;
    const full = pin.filter((gid) => (cur.pinned?.[gid] || []).length >= BG.PIN_MAX && !(cur.pinned[gid] || []).some((p) => p.id === contentId));
    if (full.length) return { status: 'error', message: `${full.map(nameOf).join(', ')} đã ghim đủ ${BG.PIN_MAX} bài — bỏ ghim bớt trước` };
  }
  const action = pin.length ? 'pin' : 'unpin';
  const item = {
    log: { ...postActLog(source, action, { contentId, snippet, groupName: [...pin, ...unpin].map(nameOf).join(', '), actor }), reason: [pin.length ? 'Ghim ở ' + pin.map(nameOf).join(', ') : '', unpin.length ? 'Bỏ ghim ở ' + unpin.map(nameOf).join(', ') : ''].filter(Boolean).join('; ') },
    call: (c) => c.call('PUT', `content/contents/pinned-content/${contentId}`, { pinGroupIds: pin, unpinGroupIds: unpin }),
    gone: true,
  };
  const r = await performActions([item], settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return summary(r, settings);
}

// Bài đang chờ tới giờ đăng trong các community mình quản trị group gốc
async function doScheduled() {
  const { state } = await load();
  const roots = (state.snapshot?.groups || []).filter((g) => g.isCommunity && !g.error);
  return withClient(async (client) => {
    const map = new Map();
    const errors = [];
    let needLogin = false;
    const jobs = roots.flatMap((g) => ['POST', 'ARTICLE'].map((type) => ({ g, type })));
    await mapLimit(jobs, PARALLEL, async ({ g, type }) => {
      let after = '';
      for (let page = 0; page < SCHEDULED_PAGES; page++) {
        const r = await client.call('GET', `content/manage/groups/${g.id}/contents/scheduled?${qs({ limit: CONTENT_PAGE, type, after })}`);
        if (r.status === 401) return (needLogin = true);
        if (!BG.isOk(r)) return errors.push(`${g.name}${type === 'ARTICLE' ? ' (Article)' : ''}: ${BG.errMsg(r)}`);
        const list = r.body.data?.list || [];
        for (const p of list) if (!map.has(p.id)) map.set(p.id, { ...BG.slimScheduled(p), communityName: g.communityName || g.name });
        after = r.body.data?.meta?.endCursor || '';
        if (!r.body.data?.meta?.hasNextPage || !after || !list.length) break;
      }
    });
    if (needLogin) return { ...NEED_LOGIN };
    const items = [...map.values()].sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')));
    return { status: 'ok', items, errors };
  });
}

async function doScheduleAct({ action, contentId, contentIds = null, contentType = 'POST', scheduledAt, snippet = '', groupName = '', source = 'manual' }) {
  if (action !== 'reschedule' && action !== 'cancel') return { status: 'error', message: 'Thao tác không hợp lệ' };
  // Huỷ cả chuỗi bài định kỳ: nhiều bài một lần
  const ids = action === 'cancel' && contentIds?.length ? [...new Set(contentIds)] : contentId ? [contentId] : [];
  if (!ids.length) return { status: 'error', message: 'Thiếu bài cần xử lý' };
  if (action === 'reschedule') {
    const t = new Date(scheduledAt).getTime();
    if (!Number.isFinite(t) || t < Date.now() + BG.MIN_SCHEDULE_MIN * 60e3) return { status: 'error', message: `Giờ hẹn phải sau bây giờ ít nhất ${BG.MIN_SCHEDULE_MIN} phút` };
  }
  const { settings, state, log } = await load();
  const iso = action === 'reschedule' ? new Date(scheduledAt).toISOString() : null;
  const article = contentType === 'ARTICLE';
  const items = ids.map((id) => ({
    log: { kind: 'compose', source, action, contentId: id, contentType: article ? 'ARTICLE' : 'POST', snippet, groupName, communityName: '', ...(iso ? { scheduledAt: iso } : {}) },
    call: (c) => (action === 'reschedule' ? c.call('PUT', `content/contents/${id}/reschedule`, { scheduledAt: iso }) : c.call('DELETE', `content/${article ? 'articles' : 'posts'}/${id}`)),
    gone: true,
  }));
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return summary(r, settings);
}
