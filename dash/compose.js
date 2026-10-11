// Dashboard — tab Đăng bài: soạn, đăng / hẹn giờ / định kỳ, sửa bài đã đăng, trình soạn thảo, mẫu bài, bài đã hẹn giờ.
// Ảnh / video / tệp, nhắc tên, xem trước link, tag / series ở dash/attach.js (nạp sau tệp này).

// ---------- Đăng bài ----------

const compose = { groupIds: new Set(), draftLoaded: false };
const sched = { items: [], errors: [], loading: false, loaded: false, error: '' };
let draftTimer = 0;

const pad = (n) => String(n).padStart(2, '0');
// Giá trị cho <input type="datetime-local"> theo giờ máy
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nextQuarter(hours = 1) {
  const d = new Date(Date.now() + hours * 3600e3);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

function composeWhen() {
  return document.querySelector('input[name="compose-when"]:checked')?.value || 'now';
}

// Ngày hết "Quan trọng": hạn chọn sẵn tính từ lúc bài được đăng (giờ hẹn hoặc bây giờ)
function importantExpiry(later) {
  if (!$('compose-important').checked) return null;
  const preset = $('compose-important-for').value;
  if (preset === 'custom') return $('compose-important-until').value ? new Date($('compose-important-until').value).toISOString() : 'invalid';
  const base = later && $('compose-at').value ? new Date($('compose-at').value) : new Date();
  return BG.importantUntil(preset, base);
}

function readCompose() {
  // Đang sửa bài đã đăng: nơi đăng giữ nguyên, không hẹn giờ. Sửa bài hẹn giờ: giữ nơi đăng, luôn có giờ đăng (đổi được)
  const later = !!compose.edit?.scheduled || (!compose.edit && composeWhen() === 'later');
  const important = $('compose-important').checked;
  return {
    groupIds: compose.edit ? compose.edit.groups.map((g) => g.id) : groups().map((g) => g.id).filter((id) => compose.groupIds.has(id)),
    content: $('compose-text').value,
    setting: {
      canComment: $('compose-canComment').checked,
      canReact: $('compose-canReact').checked,
      isImportant: important,
      importantExpiredAt: importantExpiry(later),
    },
    scheduledAt: later && $('compose-at').value ? new Date($('compose-at').value).toISOString() : later ? 'invalid' : null,
    repeat: !compose.edit && later && $('compose-repeat').value ? { every: $('compose-repeat').value, count: repeatCount() } : null,
    asGroup: !compose.edit && $('compose-as-group').checked && asGroupTarget() !== null,
  };
}

// Đăng dưới tên group: đúng một group được chọn và có quyền tạo bài của admin (bản quét cũ chưa có quyền: cho thử)
function asGroupTarget() {
  const picked = groups().filter((g) => compose.groupIds.has(g.id));
  if (picked.length !== 1 || picked[0].canPostAsGroup === false) return null;
  return picked[0];
}

// ---------- Giờ tốt nhất khi hẹn giờ ----------
// Dùng bài 30 ngày của community đầu tiên được chọn (như tab Thống kê); có số liệu ở tab Thống kê cùng group thì dùng luôn.
const bestTime = { key: '', cache: {}, loading: false };

function bestTimeGroup() {
  const g = groups().find((x) => compose.groupIds.has(x.id));
  if (!g) return null;
  return g.isCommunity ? g : groups().find((x) => x.isCommunity && x.communityId === g.communityId) || g;
}

// Bài 30 ngày của community (lưu tạm trong trang); có số liệu ở tab Thống kê cùng group thì dùng luôn
async function bestPostsFor(g) {
  if (bestTime.cache[g.id]) return { posts: bestTime.cache[g.id] };
  if (stats.raw?.posts && stats.groupId === g.id) return { posts: stats.raw.posts };
  const r = await chrome.runtime.sendMessage({ type: 'stats', groupId: g.id, days: 30 });
  if (r?.status !== 'ok') return { error: r?.message || 'Không đọc được bài' };
  return { posts: (bestTime.cache[g.id] = r.posts || []) };
}

async function suggestBestTime() {
  const g = bestTimeGroup();
  if (!g) return toast('Chọn group trước', 'err');
  const box = $('best-times');
  box.hidden = false;
  bestTime.key = g.id;
  if (bestTime.loading) return;
  bestTime.loading = true;
  if (!bestTime.cache[g.id]) box.replaceChildren(el('span', { class: 'muted', text: `Đang đọc bài 30 ngày ở ${g.name}…` }));
  let r;
  try {
    r = await bestPostsFor(g);
  } finally {
    bestTime.loading = false;
  }
  if (r.error) return box.replaceChildren(el('span', { class: 'err-text', text: r.error }));
  const posts = r.posts;
  if (cal.view !== 'list') renderCalendar(); // lịch hiện luôn giờ gợi ý
  const b = BG.bestTimes(posts);
  if (!b.top.length) return box.replaceChildren(el('span', { class: 'muted', text: `Chưa có bài nào ở ${g.name} để gợi ý.` }));
  box.replaceChildren(
    el('b', { text: 'Gợi ý:' }),
    ...b.top.map((c) => {
      const iso = BG.nextSlot(c.day, c.hour);
      const when = new Date(iso);
      return el('button', {
        type: 'button',
        class: 'best-chip',
        title: `${c.posts} bài, trung bình ${Math.round(c.avg)} tương tác`,
        text: `${BG.WEEKDAYS[c.day]} ${c.hour}:00 · ${pad(when.getDate())}/${pad(when.getMonth() + 1)}`,
        onclick: () => {
          $('compose-at').value = toLocalInput(when);
          updateCompose();
          saveDraft();
        },
      });
    }),
    el('span', { class: 'muted', text: `theo ${b.total} bài 30 ngày ở ${g.name}${b.total < 20 ? ' (ít bài, chỉ để tham khảo)' : ''}` }),
  );
}

function repeatCount() {
  return Math.max(BG.RECUR_MIN, Math.min(BG.RECUR_MAX, Math.floor(Number($('compose-repeat-n').value)) || BG.RECUR_MIN));
}

function renderComposeGroups() {
  const box = $('compose-groups');
  const gs = groups().filter((g) => !g.error);
  box.replaceChildren();
  if (compose.edit) {
    box.append(el('div', { class: 'locked-groups' }, compose.edit.groups.map((g) => el('div', { text: '🔒 ' + (g.name || g.id) })), el('div', { class: 'muted small', text: 'Sửa bài không đổi được nơi đăng.' })));
    return;
  }
  if (!gs.length) box.append(el('div', { class: 'muted small', text: data.state.snapshot ? 'Không có group nào' : 'Chưa quét' }));
  for (const g of gs) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = compose.groupIds.has(g.id);
    cb.addEventListener('change', () => {
      cb.checked ? compose.groupIds.add(g.id) : compose.groupIds.delete(g.id);
      updateCompose();
      saveDraft();
    });
    box.append(el('label', { class: g.isCommunity ? null : 'sub' }, cb, el('span', { text: (g.isCommunity ? '' : '└ ') + g.name }), g.settings?.contentApproval ? el('span', { class: 'tag info', title: 'Group bật duyệt bài', text: 'duyệt bài' }) : null));
  }
}

function updateCompose() {
  const c = readCompose();
  const len = c.content.trim().length;
  $('compose-count').textContent = `${len}/${BG.POST_MAX}`;
  $('compose-count').classList.toggle('over', len > BG.POST_MAX);
  // Tự chấm bài theo quy tắc bài viết của chính mình trước khi đăng
  const chk = $('compose-check');
  chk.className = 'small';
  chk.textContent = '';
  if (len) {
    const ev = evalPost({ title: '', text: c.content, link: '', seenIn: [...compose.groupIds] });
    if (ev.verdict !== 'ok') {
      chk.classList.add(ev.verdict === 'bad' ? 'bad' : 'warn');
      chk.textContent = '⚠ ' + ev.reasons.map((r) => r.text).join('; ');
    }
  }
  // Đăng dưới tên group
  const asTarget = asGroupTarget();
  $('compose-as-group-row').hidden = !!compose.edit;
  $('compose-as-group').disabled = !asTarget;
  const picked = compose.groupIds.size;
  $('compose-as-group-hint').textContent = asTarget
    ? $('compose-as-group').checked
      ? `Bài hiện với tên và ảnh của ${asTarget.name}, không phải tài khoản của bạn.`
      : ''
    : picked > 1
      ? 'Chỉ dùng được khi chọn một group.'
      : picked === 1
        ? 'Bạn không có quyền tạo bài của admin ở group này.'
        : '';
  const schedEdit = !!compose.edit?.scheduled;
  const later = schedEdit || composeWhen() === 'later';
  $('compose-at').disabled = !later;
  if (later && !$('compose-at').value) $('compose-at').value = toLocalInput(nextQuarter());
  // Giờ tốt nhất: chỉ khi hẹn giờ; đổi group thì bỏ gợi ý cũ
  $('btn-best-time').hidden = !later || !!compose.edit;
  if (!later || compose.edit || (bestTime.key && bestTime.key !== bestTimeGroup()?.id)) $('best-times').hidden = true;
  // Lịch (dash/calendar.js): giờ gợi ý theo community đang chọn — vẽ lại khi community đổi
  const hintKey = bestTimeGroup()?.id || '';
  if (cal.hintKey !== hintKey) {
    cal.hintKey = hintKey;
    if (cal.view !== 'list') renderCalendar();
  }
  // Lặp lại: chỉ khi hẹn giờ
  $('compose-repeat').disabled = !later;
  const rep = c.repeat;
  $('compose-repeat-n-wrap').hidden = !rep;
  const times = rep && c.scheduledAt !== 'invalid' ? BG.recurTimes(c.scheduledAt, rep.every, rep.count) : [];
  $('compose-repeat-hint').hidden = !times.length || !!compose.edit;
  $('compose-repeat-hint').textContent = times.length ? `🔁 ${times.length} bài, ${BG.RECUR_EVERY[rep.every].toLowerCase()}: ${fmtTime(times[0])} → ${fmtTime(times.at(-1))}` : '';
  const important = $('compose-important').checked;
  const custom = $('compose-important-for').value === 'custom';
  $('compose-important-for').disabled = !important;
  $('compose-important-until').hidden = !important || !custom;
  if (important && custom && !$('compose-important-until').value) $('compose-important-until').value = toLocalInput(nextQuarter(24 * 3));
  const until = c.setting.importantExpiredAt;
  $('compose-important-hint').textContent = !important || custom ? '' : until ? '→ đến ' + fmtTime(until) : '→ không hết hạn';
  const btn = $('btn-compose');
  btn.textContent = schedEdit ? 'Lưu bài hẹn giờ' : compose.edit ? 'Lưu thay đổi' : rep && later ? `Hẹn ${rep.count} bài định kỳ` : later ? 'Hẹn giờ đăng' : 'Đăng ngay';
  document.querySelector('.compose-when').classList.toggle('editing', !!compose.edit);
  document.querySelector('.compose-when').classList.toggle('sched', schedEdit); // sửa bài hẹn giờ: hiện ô giờ đăng
  btn.disabled = busy || !c.groupIds.length || (!len && !compose.media.length);
  loadTagsSeries();
  renderPreview();
}

function draftValue() {
  return {
    text: $('compose-text').value,
    groupIds: [...compose.groupIds],
    canComment: $('compose-canComment').checked,
    canReact: $('compose-canReact').checked,
    important: $('compose-important').checked,
    importantFor: $('compose-important-for').value,
    importantUntil: $('compose-important-until').value,
    when: composeWhen(),
    at: $('compose-at').value,
    asGroup: $('compose-as-group').checked,
    repeat: $('compose-repeat').value,
    repeatN: $('compose-repeat-n').value,
    mentions: BG.usedMentions($('compose-text').value, compose.mentions),
    link: compose.link?.preview ? { url: compose.link.url, preview: compose.link.preview } : null,
    linkRemoved: [...compose.linkRemoved],
    tags: compose.tags,
    series: compose.series,
  };
}

function applyDraft(d) {
  $('compose-text').value = d.text || '';
  compose.groupIds = new Set(d.groupIds || []);
  $('compose-canComment').checked = d.canComment !== false;
  $('compose-canReact').checked = d.canReact !== false;
  $('compose-important').checked = !!d.important;
  // Nháp cũ chỉ có ngày giờ tự chọn
  $('compose-important-for').value = d.importantFor || (d.importantUntil ? 'custom' : '1w');
  $('compose-important-until').value = d.importantUntil || '';
  for (const r of document.querySelectorAll('input[name="compose-when"]')) r.checked = r.value === (d.when || 'now');
  $('compose-at').value = d.at || '';
  $('compose-as-group').checked = !!d.asGroup;
  $('compose-repeat').value = BG.RECUR_EVERY[d.repeat] ? d.repeat : '';
  $('compose-repeat-n').value = d.repeatN || 4;
  compose.mentions = { ...(d.mentions || {}) };
  compose.link = d.link?.preview ? d.link : null;
  compose.linkRemoved = new Set(d.linkRemoved || []);
  compose.tags = [...(d.tags || [])];
  compose.series = [...(d.series || [])];
  renderLink();
  renderTagsSeries();
  renderComposeGroups();
  updateCompose();
}

// Lưu nháp trong trình duyệt để đóng Dashboard không mất bài đang viết
function saveDraft() {
  if (compose.edit) return; // đang sửa bài đã đăng: không ghi đè nháp đang viết
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    await chrome.storage.local.set({ composeDraft: draftValue() });
    $('compose-saved').textContent = 'Đã lưu nháp ✓';
  }, 600);
}

async function loadDraftOnce() {
  if (compose.draftLoaded) return;
  compose.draftLoaded = true;
  const { composeDraft } = await chrome.storage.local.get('composeDraft');
  if (composeDraft) applyDraft(composeDraft);
}

// ---------- Sửa bài đã đăng ----------
// Mở bài (của mình) trong khung soạn; nháp đang viết được cất lại và trả về khi xong / huỷ.

// scheduled: bài đang hẹn giờ (sửa trước giờ đăng, đổi được cả giờ)
async function editPost(p, { scheduled = false } = {}) {
  if (busy) return;
  if (compose.edit?.id === p.id) return showTab('compose');
  const d = await chrome.runtime.sendMessage({ type: 'postDetail', id: p.id, scheduled });
  if (d?.status !== 'ok') return toast(d?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : d?.message || 'Không đọc được bài', 'err');
  if (compose.edit) exitEdit(false);
  enterEdit(d.post, { scheduled });
}

function enterEdit(post, { scheduled = false } = {}) {
  compose.edit = { id: post.id, groups: post.groups, setting: post.setting, before: draftValue(), scheduled, scheduledAt: post.scheduledAt || null };
  if (scheduled) {
    const at = post.scheduledAt ? new Date(post.scheduledAt) : null;
    $('compose-at').value = toLocalInput(at && at > new Date(Date.now() + 10 * 60e3) ? at : nextQuarter());
  }
  clearMedia();
  $('compose-text').value = post.content;
  compose.mentions = { ...post.mentions };
  compose.link = post.linkPreview?.url ? { url: post.linkPreview.url, preview: post.linkPreview } : null;
  compose.linkRemoved = new Set();
  compose.tags = post.tags.map((t) => ({ ...t }));
  compose.series = post.series.map((x) => ({ ...x }));
  // Ảnh / video / tệp đang có: coi như đã tải lên (gửi lại nguyên đối tượng); bấm × để bỏ, thêm mới thì tải lên khi lưu
  for (const [kind, field] of Object.entries(BG.MEDIA_FIELD)) {
    post.media[field].forEach((item, i) => {
      compose.media.push({ key: ++mediaSeq, kind, file: null, name: item.name || item.originName || item.origin_name || `${BG.MEDIA[kind].label} ${i + 1}`, size: item.size || 0, preview: kind === 'image' ? item.url : '', status: 'done', progress: 1, item, error: '' });
    });
  }
  const s = post.setting;
  $('compose-canComment').checked = s.canComment;
  $('compose-canReact').checked = s.canReact;
  $('compose-important').checked = s.isImportant;
  $('compose-important-for').value = s.isImportant ? (s.importantExpiredAt ? 'custom' : 'never') : '1w';
  $('compose-important-until').value = s.importantExpiredAt ? toLocalInput(new Date(s.importantExpiredAt)) : '';
  showTab('compose');
  renderComposeGroups();
  renderMedia();
  renderLink();
  renderTagsSeries();
  updateCompose();
  renderEditBanner();
  $('compose').scrollIntoView({ block: 'start' });
}

function exitEdit(restore = true) {
  const before = compose.edit?.before;
  compose.edit = null;
  clearMedia();
  if (restore && before) applyDraft(before);
  else {
    renderComposeGroups();
    updateCompose();
  }
  renderEditBanner();
}

function renderEditBanner() {
  const b = $('compose-edit-banner');
  b.hidden = !compose.edit;
  if (!compose.edit) return b.replaceChildren();
  b.replaceChildren(
    compose.edit.scheduled
      ? el('span', {}, '✎ Đang sửa bài hẹn giờ ở ', el('b', { text: compose.edit.groups.map((g) => g.name || g.id).join(', ') }), ` — giờ đăng hiện tại ${fmtTime(compose.edit.scheduledAt)}; đổi giờ ở ô dưới nếu cần`)
      : el('span', {}, '✎ Đang sửa bài đã đăng ở ', el('b', { text: compose.edit.groups.map((g) => g.name || g.id).join(', ') })),
    el('span', { class: 'spacer' }),
    el('a', { href: BG.postUrl({ id: compose.edit.id, type: 'POST' }), target: '_blank', text: 'Mở bài ↗' }),
    el('button', { type: 'button', class: 'ghost sm', text: 'Huỷ sửa', onclick: () => exitEdit() }),
  );
}

// Hai cài đặt giống nhau (ngày hết Quan trọng so tới phút)
function sameSetting(a, b) {
  const min = (x) => (x ? Math.floor(new Date(x).getTime() / 60e3) : null);
  return a.canComment === b.canComment && a.canReact === b.canReact && a.isImportant === b.isImportant && (!a.isImportant || min(a.importantExpiredAt) === min(b.importantExpiredAt));
}

async function submitEdit() {
  const ed = compose.edit;
  const c = readCompose();
  const current = mediaByField(compose.media);
  const err = BG.validateCompose({ ...c, media: current, tags: compose.tags, series: compose.series });
  if (err) return toast(err, 'err');
  const badPicks = [...invalidPicks('tag').map((x) => '#' + x.name), ...invalidPicks('series').map((x) => x.title)];
  if (badPicks.length) return toast(`${badPicks.join(', ')} không dùng được với các group của bài — bỏ ra rồi lưu lại`, 'err');
  const mentions = BG.usedMentions(c.content, compose.mentions);
  const lp = linkToSend();
  if (ed.scheduled && (!c.scheduledAt || c.scheduledAt === 'invalid')) return toast('Chưa chọn giờ đăng', 'err');
  const settingChanged = !sameSetting(BG.settingBody(ed.setting), BG.settingBody(c.setting));
  const attached = BG.mediaSummary(current);
  const fresh = compose.media.filter((m) => m.status !== 'done').length;
  const text = c.content.trim();
  const extras = [attached && 'Kèm ' + attached, Object.keys(mentions).length && 'Nhắc ' + Object.keys(mentions).map((u) => '@' + u).join(', '), lp && 'Xem trước link ' + (lp.domain || lp.url), compose.tags.length && 'Tag ' + compose.tags.map((x) => '#' + x.name).join(' '), compose.series.length && 'Series ' + compose.series.map((x) => x.title).join(', '), settingChanged && 'Đổi cài đặt'].filter(Boolean);
  const moved = ed.scheduled && new Date(c.scheduledAt).getTime() !== new Date(ed.scheduledAt).getTime();
  const ok = await confirmDialog({
    title: ed.scheduled ? `Lưu bài hẹn giờ${moved ? `, đổi giờ đăng sang ${fmtTime(c.scheduledAt)}` : ''}?` : 'Lưu thay đổi bài đã đăng?',
    text: (extras.length ? `[${extras.join(' · ')}] ` : '') + (text.length > 200 ? text.slice(0, 200) + '…' : text),
    names: ed.groups.map((g) => g.name || g.id),
    okText: ed.scheduled ? 'Lưu bài hẹn giờ' : 'Lưu thay đổi',
    sendNote: (fresh && !data.settings.dryRun ? `Tải ${fresh} file mới lên Beincom trước, rồi ` : '') + (ed.scheduled ? `Bài hẹn giờ trên Beincom sẽ được cập nhật ngay; tới ${fmtTime(c.scheduledAt)} Beincom tự đăng.` : 'Bài trên Beincom sẽ được cập nhật ngay.'),
  });
  if (!ok) return;
  let media = { images: [], videos: [], files: [] };
  if (compose.media.length) {
    media = data.settings.dryRun ? mediaByField(compose.media, (m) => m.item || { name: m.name }) : await uploadMedia();
    if (!media) return;
  }
  if (ed.scheduled) {
    const r = await send({ type: 'editScheduled', id: ed.id, groupIds: c.groupIds, content: c.content, media, mentions, linkPreview: lp, tags: compose.tags, series: compose.series, setting: c.setting, scheduledAt: c.scheduledAt }, () => `Đã lưu bài hẹn giờ (đăng lúc ${fmtTime(c.scheduledAt)}).`);
    if (r?.status === 'ok' && !r.dryRun) {
      exitEdit();
      loadScheduled();
    }
    return;
  }
  const r = await send({ type: 'editPost', id: ed.id, groupIds: c.groupIds, content: c.content, media, mentions, linkPreview: lp, tags: compose.tags, series: compose.series, setting: c.setting, settingChanged }, () => 'Đã lưu bài.');
  if (r?.status === 'ok' && r.message) toast(r.message, 'warn');
  if (r?.status === 'ok' && !r.dryRun) exitEdit();
}

async function submitCompose() {
  if (busy) return;
  if (compose.edit) return submitEdit();
  const c = readCompose();
  if (c.scheduledAt === 'invalid') return toast('Chưa chọn giờ hẹn', 'err');
  const attached = BG.mediaSummary(mediaByField(compose.media));
  const err = BG.validateCompose({ ...c, media: mediaByField(compose.media), tags: compose.tags, series: compose.series });
  if (err) return toast(err, 'err');
  const badPicks = [...invalidPicks('tag').map((x) => '#' + x.name), ...invalidPicks('series').map((x) => x.title)];
  if (badPicks.length) return toast(`${badPicks.join(', ')} không dùng được với các group đã chọn — bỏ ra rồi đăng lại`, 'err');
  const targets = groups().filter((g) => compose.groupIds.has(g.id));
  const later = !!c.scheduledAt;
  const times = c.repeat ? BG.recurTimes(c.scheduledAt, c.repeat.every, c.repeat.count) : [];
  const text = c.content.trim();
  const ev = evalPost({ title: '', text, link: '', seenIn: targets.map((g) => g.id) });
  const warn = ev.verdict === 'ok' ? '' : '⚠ Bài dính quy tắc bài viết của bạn: ' + ev.reasons.map((r) => r.text).join('; ') + '. ';
  const mentions = BG.usedMentions(c.content, compose.mentions);
  const lp = linkToSend();
  const extras = [
    attached && 'Kèm ' + attached,
    Object.keys(mentions).length && 'Nhắc ' + Object.keys(mentions).map((u) => '@' + u).join(', '),
    lp && 'Xem trước link ' + (lp.domain || lp.url),
    compose.tags.length && 'Tag ' + compose.tags.map((x) => '#' + x.name).join(' '),
    compose.series.length && 'Series ' + compose.series.map((x) => x.title).join(', '),
  ].filter(Boolean);
  const recurring = times.length > 1;
  const asName = c.asGroup ? ` dưới tên ${targets[0]?.name}` : '';
  const ok = await confirmDialog({
    title: (recurring ? `Hẹn ${times.length} bài định kỳ (${BG.RECUR_EVERY[c.repeat.every].toLowerCase()})` : later ? `Hẹn giờ đăng lúc ${fmtTime(c.scheduledAt)}` : `Đăng bài vào ${targets.length} group`) + asName + '?',
    text: (extras.length ? `[${extras.join(' · ')}] ` : '') + (text.length > 200 ? text.slice(0, 200) + '…' : text),
    names: targets.map((g) => groupPath(g) + (g.settings?.contentApproval ? ' (group bật duyệt bài)' : '')),
    okText: recurring ? `Hẹn ${times.length} bài` : later ? 'Hẹn giờ' : 'Đăng',
    extra: recurring ? el('div', { class: 'recur-list' }, el('b', { text: 'Lịch đăng' }), el('ol', {}, times.map((t) => el('li', { text: fmtTime(t) })))) : null,
    sendNote:
      warn +
      (recurring
        ? `Tạo ngay ${times.length} bài hẹn giờ trên Beincom${attached && !data.settings.dryRun ? `, mỗi bài tải ${attached} một lần` : ''}; tới giờ Beincom tự đăng. Huỷ được cả chuỗi ở "Bài đã hẹn giờ".`
        : (attached && !data.settings.dryRun ? `Tải ${attached} lên Beincom trước, rồi đăng. ` : '') + (later ? 'Sẽ gửi lên Beincom ngay; tới giờ Beincom tự đăng.' : 'Sẽ đăng ngay lên Beincom.')),
  });
  if (!ok) return;
  if (recurring) return submitRecurring(c, times, { mentions, linkPreview: lp });
  // Chạy thử: không tải file lên, chỉ báo số lượng để ghi nhật ký
  let media = null;
  if (compose.media.length) {
    media = data.settings.dryRun ? mediaByField(compose.media, (m) => ({ name: m.name })) : await uploadMedia();
    if (!media) return;
  }
  const r = await send({ type: 'compose', ...c, media, mentions, linkPreview: lp, tags: compose.tags, series: compose.series, nudge: compose.nudge || null, prompt: compose.prompt || null }, () => (later ? `Đã hẹn giờ đăng lúc ${fmtTime(c.scheduledAt)}.` : 'Đã đăng bài.'));
  if (r?.status === 'ok' && !r.dryRun) await resetCompose(later);
  updateCompose();
}

// Bài định kỳ: tạo lần lượt từng bài hẹn giờ (mỗi bài tải file đính kèm riêng), dừng ở lỗi đầu tiên
async function submitRecurring(c, times, { mentions, linkPreview }) {
  const dry = data.settings.dryRun;
  const preset = $('compose-important-for').value;
  const created = [];
  let fail = null;
  let needLogin = false;
  busy = true;
  renderAll();
  try {
    for (const [i, at] of times.entries()) {
      $('compose-saved').textContent = `Đang hẹn bài ${i + 1}/${times.length}…`;
      let media = null;
      if (compose.media.length) {
        if (dry) media = mediaByField(compose.media, (m) => ({ name: m.name }));
        else {
          // Bài sau tải lại file (mỗi bài một bộ file riêng trên Beincom)
          if (i) for (const m of compose.media) if (m.file) Object.assign(m, { status: 'local', item: null, progress: 0 });
          media = await uploadMedia();
          busy = true;
          if (!media) {
            fail = `bài ${i + 1}: tải file lỗi`;
            break;
          }
        }
      }
      const r = await chrome.runtime.sendMessage({
        type: 'compose',
        ...c,
        repeat: undefined,
        scheduledAt: at,
        setting: BG.recurSetting(c.setting, preset, times[0], at),
        media,
        mentions,
        linkPreview,
        tags: compose.tags,
        series: compose.series,
        recur: `${i + 1}/${times.length}`,
      });
      if (r?.status !== 'ok') {
        needLogin = r?.status === 'need_login';
        fail = `bài ${i + 1} (${fmtTime(at)}): ${r?.message || 'lỗi'}`;
        break;
      }
      if (!r.dryRun) created.push({ contentId: r.contentId, scheduledAt: at });
    }
  } finally {
    busy = false;
    $('compose-saved').textContent = '';
  }
  if (created.length) {
    const { recurring = [] } = await chrome.storage.local.get('recurring');
    const snip = c.content.trim().replace(/\s+/g, ' ').slice(0, 80);
    recurring.unshift({ id: 'r' + Date.now(), every: c.repeat.every, count: times.length, snippet: snip, groupIds: c.groupIds, createdAt: Date.now(), items: created });
    await chrome.storage.local.set({ recurring: BG.pruneRecurring(recurring) });
  }
  if (needLogin) toast('Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.', 'err');
  else if (dry && !fail) toast(`Chạy thử: đã ghi ${times.length} bài định kỳ vào nhật ký, chưa gửi lên Beincom.`, 'warn');
  else if (fail) toast(`Đã hẹn ${created.length}/${times.length} bài. Dừng ở ${fail}`, 'err');
  else toast(`Đã hẹn ${times.length} bài định kỳ: ${fmtTime(times[0])} → ${fmtTime(times.at(-1))}.`);
  if (created.length === times.length && !dry) await resetCompose(true);
  else if (created.length) loadScheduled();
  await loadAll();
}

// Xoá nội dung đã đăng / hẹn giờ xong (giữ group và cài đặt)
async function resetCompose(later) {
  clearMedia();
  compose.mentions = {};
  compose.nudge = null;
  compose.prompt = null;
  compose.link = null;
  compose.linkRemoved.clear();
  compose.tags = [];
  compose.series = [];
  renderLink();
  renderTagsSeries();
  $('compose-text').value = '';
  await chrome.storage.local.set({ composeDraft: draftValue() });
  $('compose-saved').textContent = '';
  if (later) loadScheduled();
}

// ---------- Trình soạn thảo ----------
// Thanh công cụ chèn đúng ký hiệu markdown mà trình soạn thảo Beincom dùng:
// **đậm**, _nghiêng_, ~~gạch~~, `code`, ### tiêu đề, - danh sách, 1. danh sách, > trích dẫn, ---, [chữ](link)

let editorMode = 'write';

// Thay đoạn [from, to) bằng `text` qua execCommand để Ctrl+Z hoàn tác được; chọn lại [selFrom, selTo)
function editReplace(ta, from, to, text, selFrom, selTo) {
  ta.focus();
  ta.setSelectionRange(from, to);
  const ok = document.execCommand && document.execCommand('insertText', false, text);
  if (!ok) {
    ta.setRangeText(text, from, to, 'end');
    ta.dispatchEvent(new Event('input'));
  }
  ta.setSelectionRange(selFrom, selTo);
}

// Bọc vùng chọn; bấm lại khi đã bọc thì bỏ bọc. ta: ô chữ (mặc định ô Đăng bài; Article truyền ô của nó)
function mdWrap(before, after, placeholder, ta = $('compose-text')) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  if (v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after && e > s) {
    editReplace(ta, s - before.length, e + after.length, v.slice(s, e), s - before.length, e - before.length);
    return;
  }
  const sel = v.slice(s, e) || placeholder;
  editReplace(ta, s, e, before + sel + after, s + before.length, s + before.length + sel.length);
}

// Thêm / bỏ tiền tố cho các dòng đang chọn (danh sách, trích dẫn, tiêu đề; h1–h3 dùng cho Article)
const MD_PREFIX = { ul: '- ', quote: '> ', heading: '### ', h1: '# ', h2: '## ', h3: '### ' };
function mdLines(kind, ta = $('compose-text')) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const start = v.lastIndexOf('\n', s - 1) + 1;
  let end = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
  if (end < 0) end = v.length;
  const lines = v.slice(start, end).split('\n');
  const RE = kind === 'ol' ? /^\d+\. / : new RegExp('^' + MD_PREFIX[kind].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const has = lines.every((l) => RE.test(l));
  const out = lines.map((l, i) => {
    if (has) return l.replace(RE, '');
    const bare = l.replace(/^(- |\d+\. |> |#{1,6} )/, '');
    return (kind === 'ol' ? `${i + 1}. ` : MD_PREFIX[kind]) + bare;
  });
  const text = out.join('\n');
  editReplace(ta, start, end, text, start, start + text.length);
}

function mdLink(ta = $('compose-text')) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const url = prompt('Địa chỉ link (bắt đầu bằng https://):', 'https://');
  if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
  const label = v.slice(s, e) || 'chữ hiển thị';
  const text = `[${label}](${url.trim()})`;
  editReplace(ta, s, e, text, s + 1, s + 1 + label.length);
}

// Chèn một khối riêng dòng ở chỗ con trỏ (kẻ ngang, bảng, video…); sel: [đầu, cuối] trong khối để chọn sẵn
function mdBlock(block, ta = $('compose-text'), sel = null) {
  const { selectionStart: s, value: v } = ta;
  const pre = s && v[s - 1] !== '\n' ? '\n' : '';
  const text = pre + block + '\n';
  const at = s + pre.length;
  editReplace(ta, s, s, text, sel ? at + sel[0] : s + text.length, sel ? at + sel[1] : s + text.length);
}

function mdHr(ta = $('compose-text')) {
  mdBlock('---', ta);
}

const MD_ACTIONS = {
  bold: () => mdWrap('**', '**', 'chữ đậm'),
  italic: () => mdWrap('_', '_', 'chữ nghiêng'),
  strike: () => mdWrap('~~', '~~', 'chữ gạch'),
  code: () => mdWrap('`', '`', 'code'),
  heading: () => mdLines('heading'),
  ul: () => mdLines('ul'),
  ol: () => mdLines('ol'),
  quote: () => mdLines('quote'),
  hr: mdHr,
  link: mdLink,
};

function setEditorMode(mode) {
  editorMode = mode;
  setSegActive('editor-mode', mode);
  $('editor-body').classList.toggle('split', mode === 'split');
  $('compose-text').hidden = mode === 'preview';
  $('compose-preview').hidden = mode === 'write';
  for (const b of document.querySelectorAll('.editor-toolbar > button')) b.disabled = mode === 'preview';
  renderPreview();
}

function renderPreview() {
  if (editorMode === 'write') return;
  // renderMarkdown đã mã hoá HTML và chỉ sinh thẻ an toàn
  $('compose-preview').innerHTML = BG.renderMarkdown($('compose-text').value, { mentions: compose.mentions });
}

// ---------- Mẫu bài ----------

function renderTemplates() {
  const sel = $('tpl-select');
  const cur = sel.value;
  const list = data.templates || [];
  sel.replaceChildren(el('option', { value: '', text: list.length ? '— Chọn mẫu bài —' : '— Chưa có mẫu —' }), ...list.map((t) => el('option', { value: t.id, text: t.name })));
  sel.value = list.some((t) => t.id === cur) ? cur : '';
  $('btn-tpl-use').disabled = !sel.value;
  $('btn-tpl-delete').disabled = !sel.value;
}

async function saveTemplate() {
  const d = draftValue();
  if (!d.text.trim()) return toast('Bài chưa có nội dung để lưu làm mẫu', 'err');
  const name = prompt('Tên mẫu bài:', d.text.trim().split('\n')[0].slice(0, 40));
  if (!name?.trim()) return;
  const list = data.templates || [];
  const existing = list.find((t) => t.name === name.trim());
  const tpl = { id: existing?.id || 'tpl' + Date.now(), name: name.trim(), text: d.text, groupIds: d.groupIds, canComment: d.canComment, canReact: d.canReact, mentions: d.mentions, tags: d.tags, series: d.series };
  await chrome.storage.local.set({ templates: existing ? list.map((t) => (t.id === tpl.id ? tpl : t)) : [...list, tpl] });
  $('tpl-select').value = tpl.id;
  toast(`Đã lưu mẫu "${tpl.name}".`);
}

function useTemplate() {
  const t = (data.templates || []).find((x) => x.id === $('tpl-select').value);
  if (!t) return;
  if ($('compose-text').value.trim() && !confirm('Thay nội dung đang viết bằng mẫu này?')) return;
  applyDraft({ ...draftValue(), text: t.text, groupIds: t.groupIds, canComment: t.canComment, canReact: t.canReact, mentions: { ...compose.mentions, ...(t.mentions || {}) }, link: null, linkRemoved: [], tags: t.tags || [], series: t.series || [] });
  checkLink();
  saveDraft();
}

async function deleteTemplate() {
  const t = (data.templates || []).find((x) => x.id === $('tpl-select').value);
  if (!t || !confirm(`Xoá mẫu "${t.name}"?`)) return;
  await chrome.storage.local.set({ templates: (data.templates || []).filter((x) => x.id !== t.id) });
}

// ---------- Bài đã hẹn giờ ----------

async function loadScheduled() {
  if (sched.loading) return;
  sched.loading = true;
  renderScheduled();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'scheduled' });
    if (r?.status !== 'ok') sched.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else Object.assign(sched, { items: r.items, errors: r.errors || [], error: '', loaded: true });
  } finally {
    sched.loading = false;
    renderScheduled();
  }
}

// "còn 2 giờ 15 phút" tới giờ đăng
function untilText(t) {
  const min = Math.round((new Date(t).getTime() - Date.now()) / 60e3);
  if (!Number.isFinite(min)) return '';
  if (min < 0) return 'đã quá giờ';
  if (min < 60) return `còn ${min} phút`;
  if (min < 48 * 60) return `còn ${Math.floor(min / 60)} giờ${min % 60 ? ` ${min % 60} phút` : ''}`;
  return `còn ${Math.round(min / 1440)} ngày`;
}

// Nội dung bài hẹn giờ đã định dạng (thu gọn, bấm để xem hết); ảnh, link, tag, series, người được nhắc tên
function scheduledContent(p) {
  const full = el('div', { class: 'md-preview sched-full collapsed', title: 'Bấm để xem hết / thu gọn' });
  full.innerHTML = p.text ? BG.renderMarkdown(p.text) : '<p>(không có chữ)</p>'; // renderMarkdown đã escape HTML
  full.addEventListener('click', (e) => !e.target.closest('a') && full.classList.toggle('collapsed'));
  const more = p.media.images - p.thumbs.length;
  const lp = p.linkPreview;
  return el(
    'div',
    {},
    full,
    p.thumbs.length
      ? el('div', { class: 'thumbs' }, p.thumbs.map((src) => el('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })), more > 0 ? el('span', { class: 'thumb-more', text: '+' + more }) : null)
      : null,
    lp?.url
      ? el(
          'a',
          { class: 'link-card', href: lp.url, target: '_blank', rel: 'noreferrer' },
          lp.image ? el('img', { src: lp.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
          el('span', {}, el('b', { text: lp.title || lp.url }), el('span', { class: 'muted small', text: lp.domain || BG.linkDomains(lp.url)[0] || '' })),
        )
      : null,
    el(
      'div',
      { class: 'post-meta' },
      p.media.videos ? el('span', { class: 'tag info', text: `🎬 ${p.media.videos} video` }) : null,
      p.media.files ? el('span', { class: 'tag info', text: `📎 ${p.media.files} tệp` }) : null,
      p.tags.map((t) => el('span', { class: 'tag accent', text: '#' + t })),
      p.series.map((x) => el('span', { class: 'tag info', title: 'Series', text: '📚 ' + x })),
      p.mentions.length ? el('span', { class: 'tag info', title: 'Nhắc tên', text: p.mentions.map((u) => '@' + u).join(', ') }) : null,
    ),
  );
}

// Cài đặt của bài: chỉ hiện những gì khác mặc định
function scheduledSetting(s) {
  const lines = [];
  if (s.isImportant) lines.push(el('div', { class: 'warn-text', text: '⭐ Quan trọng' }), el('div', { class: 'muted', text: s.importantExpiredAt ? 'đến ' + fmtTime(s.importantExpiredAt) : 'không hết hạn' }));
  if (!s.canComment) lines.push(el('div', { text: '🚫 Tắt bình luận' }));
  if (!s.canReact) lines.push(el('div', { text: '🚫 Tắt cảm xúc' }));
  return lines.length ? el('div', { class: 'small sched-setting' }, lines) : el('span', { class: 'muted small', text: 'Mặc định' });
}

function renderScheduled() {
  renderBadges();
  const recurIdx = BG.recurIndex(data.recurring);
  $('scheduled-note').textContent = sched.loading ? 'Đang tải…' : sched.error || sched.errors.join('; ') || (sched.loaded ? `${sched.items.length} bài đang chờ (theo các community bạn quản trị group gốc)` : '');
  const body = $('scheduled-body');
  body.replaceChildren();
  if (!sched.items.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 6, text: sched.loading ? 'Đang tải…' : sched.loaded ? 'Không có bài nào đang hẹn giờ' : 'Bấm "Tải lại" để xem' })));
  for (const p of sched.items) {
    const failed = p.status === 'SCHEDULE_FAILED';
    body.append(
      el(
        'tr',
        { 'data-id': p.id },
        el(
          'td',
          { class: 'nowrap' },
          el('b', { text: fmtTime(p.scheduledAt) }),
          // Chờ tới giờ đăng: hiện thời gian còn lại; trạng thái khác (lỗi…) hiện nhãn
          p.status === 'WAITING_SCHEDULE' || !p.status
            ? el('div', { class: 'small', text: untilText(p.scheduledAt) })
            : el('div', {}, el('span', { class: 'tag ' + (failed ? 'err' : 'info'), text: BG.CONTENT_STATUS[p.status] || p.status })),
          p.createdAt ? el('div', { class: 'muted small', text: 'Tạo lúc ' + fmtTime(p.createdAt) }) : null,
          recurIdx.has(p.id) ? el('div', {}, el('span', { class: 'tag info', title: BG.RECUR_EVERY[recurIdx.get(p.id).every] || '', text: `🔁 ${recurIdx.get(p.id).k}/${recurIdx.get(p.id).n} · ${(BG.RECUR_EVERY[recurIdx.get(p.id).every] || '').toLowerCase()}` })) : null,
        ),
        el('td', {}, postAuthor(p.actor)),
        el('td', { class: 'sched-content' }, scheduledContent(p)),
        el('td', {}, postGroups(p)),
        el('td', {}, scheduledSetting(p.setting)),
        el(
          'td',
          { class: 'act' },
          el(
            'div',
            { class: 'act-stack' },
            p.type !== 'ARTICLE' && p.actor?.id && p.actor.id === data.state.me?.id ? el('button', { class: 'ghost sm', disabled: busy, title: 'Mở bài trong khung soạn để sửa nội dung, file, cài đặt, giờ đăng', text: 'Sửa', onclick: () => editPost(p, { scheduled: true }) }) : null,
            el('button', { class: 'ghost sm', disabled: busy, text: 'Đổi giờ', onclick: () => reschedulePost(p) }),
            el('button', { class: 'danger sm', disabled: busy, text: 'Huỷ', onclick: () => cancelPost(p) }),
            recurIdx.has(p.id) ? el('button', { class: 'danger sm', disabled: busy, text: 'Huỷ cả chuỗi', onclick: () => cancelSeries(recurIdx.get(p.id).id) }) : null,
            el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' }),
          ),
        ),
      ),
    );
  }
  renderCalendar(); // dash/calendar.js
}

async function reschedulePost(p) {
  const input = el('input', { type: 'datetime-local', 'aria-label': 'Giờ đăng mới' });
  input.value = toLocalInput(p.scheduledAt && new Date(p.scheduledAt) > new Date() ? new Date(p.scheduledAt) : nextQuarter());
  const ok = await confirmDialog({
    title: 'Đổi giờ đăng?',
    text: 'Giờ hiện tại: ' + fmtTime(p.scheduledAt),
    names: [snippet(p)],
    okText: 'Đổi giờ',
    extra: el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Giờ đăng mới' })), input),
    sendNote: 'Sẽ gửi lên Beincom ngay.',
  });
  if (!ok || !input.value) return;
  const at = new Date(input.value).toISOString();
  const r = await send({ type: 'scheduleAct', action: 'reschedule', contentId: p.id, scheduledAt: at, snippet: snippet(p), groupName: p.groups.map((g) => g.name).join(', ') }, () => `Đã đổi giờ đăng sang ${fmtTime(at)}.`);
  if (r?.status === 'ok' && !r.dryRun) loadScheduled();
}

async function cancelPost(p) {
  const ok = await confirmDialog({
    title: 'Huỷ bài hẹn giờ?',
    text: 'Bài sẽ bị xoá và không được đăng. Chỉ huỷ được bài của chính bạn.',
    names: [snippet(p)],
    okText: 'Huỷ bài',
    danger: true,
  });
  if (!ok) return;
  const r = await send({ type: 'scheduleAct', action: 'cancel', contentId: p.id, contentType: p.type, snippet: snippet(p), groupName: p.groups.map((g) => g.name).join(', ') }, () => 'Đã huỷ bài hẹn giờ.');
  if (r?.status === 'ok' && !r.dryRun) loadScheduled();
}

// Huỷ các bài còn đang hẹn giờ của một chuỗi định kỳ
async function cancelSeries(seriesId) {
  const rec = (data.recurring || []).find((r) => r.id === seriesId);
  if (!rec) return;
  const ids = new Set(rec.items.map((it) => it.contentId));
  const left = sched.items.filter((p) => ids.has(p.id));
  if (!left.length) return toast('Chuỗi này không còn bài nào đang hẹn giờ', 'warn');
  const ok = await confirmDialog({
    title: `Huỷ ${left.length} bài còn lại của chuỗi định kỳ?`,
    text: `${BG.RECUR_EVERY[rec.every] || ''} · ${rec.snippet}`,
    names: left.map((p) => fmtTime(p.scheduledAt) + ' — ' + snippet(p)),
    okText: `Huỷ ${left.length} bài`,
    danger: true,
    sendNote: `Các bài sẽ bị xoá và không được đăng${left.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi bài)` : ''}. Bài đã đăng rồi không bị ảnh hưởng.`,
  });
  if (!ok) return;
  const r = await send({ type: 'scheduleAct', action: 'cancel', contentIds: left.map((p) => p.id), snippet: '🔁 ' + rec.snippet, groupName: left[0].groups.map((g) => g.name).join(', ') }, (n) => `Đã huỷ ${n} bài của chuỗi định kỳ.`);
  if (r?.status === 'ok' && !r.dryRun) {
    if (!r.failed) {
      const { recurring = [] } = await chrome.storage.local.get('recurring');
      await chrome.storage.local.set({ recurring: recurring.filter((x) => x.id !== seriesId) });
    }
    loadScheduled();
  }
}

// ---------- Sự kiện ----------

// Đăng bài
$('compose-important-for').replaceChildren(...Object.entries(BG.IMPORTANT_FOR).map(([v, label]) => el('option', { value: v, text: label })));
$('compose-important-for').value = '1w';
$('compose-repeat').replaceChildren(el('option', { value: '', text: 'Không lặp lại' }), ...Object.entries(BG.RECUR_EVERY).map(([v, label]) => el('option', { value: v, text: '🔁 ' + label })));
for (const id of ['compose-text', 'compose-canComment', 'compose-canReact', 'compose-important', 'compose-important-for', 'compose-important-until', 'compose-at', 'compose-repeat', 'compose-repeat-n', 'compose-as-group']) {
  $(id).addEventListener('input', () => {
    updateCompose();
    saveDraft();
  });
}
for (const r of document.querySelectorAll('input[name="compose-when"]')) {
  r.addEventListener('change', () => {
    updateCompose();
    saveDraft();
  });
}
$('btn-compose').addEventListener('click', submitCompose);
$('btn-best-time').addEventListener('click', suggestBestTime);
// Trình soạn thảo
$('editor').querySelector('.editor-toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-md]');
  if (b && MD_ACTIONS[b.dataset.md]) MD_ACTIONS[b.dataset.md]();
});

$('compose-text').addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  MD_ACTIONS[k]();
});
onSeg('editor-mode', setEditorMode);

$('btn-compose-clear').addEventListener('click', () => {
  if (($('compose-text').value.trim() || compose.media.length) && !confirm('Xoá nội dung và file đính kèm đang soạn?')) return;
  clearMedia();
  compose.mentions = {};
  compose.link = null;
  compose.linkRemoved.clear();
  compose.tags = [];
  compose.series = [];
  renderLink();
  renderTagsSeries();
  $('compose-text').value = '';
  updateCompose();
  saveDraft();
});

$('tpl-select').addEventListener('change', renderTemplates);
$('btn-tpl-use').addEventListener('click', useTemplate);
$('btn-tpl-save').addEventListener('click', saveTemplate);
$('btn-tpl-delete').addEventListener('click', deleteTemplate);
