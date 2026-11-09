// Dashboard — tab Trợ lý AI: nơi bắt đầu mọi tác vụ AI và theo dõi chúng. Thẻ Tác vụ AI: tình trạng (cách dùng, tháng này, chi
// phí ước tính) và các việc AI làm được — trả lời bình luận, tóm tắt bình luận một bài, bài chào thành viên mới, bài vinh danh,
// viết bài đăng; mỗi việc mở đúng hộp đã có (dash/aireply.js, dash/aidraft.js). Thẻ Lịch sử: mỗi lần nhờ AI một dòng (khoá
// aiLog, chỉ trong máy này — noteAi ở aireply.js ghi). Cài đặt khoá / mô hình vẫn ở Quy tắc & cài đặt › Trợ lý AI.
// Nạp sau aidraft.js (aiTemplateDraft, openAiDraft) và postview.js (openPost).

// Bình luận mới cần trả lời: chưa ẩn / bỏ qua, không phải của mình, mình chưa trả lời; mới nhất trước, tối đa một lượt AI
function aiReplyCandidates() {
  const me = data.state.me?.id;
  const all = data.state.recentComments || [];
  const answered = new Set(all.filter((c) => me && c.actor?.id === me && c.parentId).map((c) => c.parentId));
  return all
    .filter((c) => !c.isHidden && !c.dismissed && (!me || c.actor?.id !== me) && !answered.has(c.id))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, BG.AI_MAX);
}

// Bài để tóm tắt: bài mới đăng có bình luận, nhiều bình luận trước
const aiSummaryPosts = () =>
  (data.state.recentPosts || [])
    .filter((p) => !p.isHidden && p.commentsCount > 0)
    .sort((a, b) => b.commentsCount - a.commentsCount)
    .slice(0, 15);

// AI viết bài đăng: theo ý trong ô Ghi chú, hoặc viết lại chữ đang có trong ô soạn; kết quả đưa vào ô soạn ở tab Đăng bài
function aiPostDraft() {
  const current = $('compose-text').value;
  openAiDraft({
    kind: 'post',
    title: '✨ AI viết bài đăng',
    desc: current.trim() ? 'Ô soạn ở tab Đăng bài đang có chữ: AI viết lại cho rõ, giữ ý — hoặc ghi ý mới vào ô Ghi chú.' : 'Ghi ý chính của bài vào ô Ghi chú cho AI rồi nhờ AI viết; bài đưa vào ô soạn ở tab Đăng bài để bạn xem lại trước khi đăng.',
    notePlaceholder: 'Ý chính của bài — vd: thông báo AMA tối thứ Sáu 20h về ví lạnh',
    prompt: () => BG.aiPostPrompt({ idea: $('ad-note').value.trim(), current, note: AD.cfg?.note || '', persona: data.aiPersona }),
    useLabel: 'Đưa vào ô soạn',
    onUse: (text) => {
      showTab('compose');
      document.querySelector('#compose-kind button[data-f="post"]:not(.active)')?.click();
      $('compose').scrollIntoView({ block: 'start' });
      $('compose-text').value = text;
      $('compose-text').dispatchEvent(new Event('input', { bubbles: true }));
      toast('Đã đưa bài vào ô soạn — xem lại, chọn group rồi bấm Đăng.');
    },
  });
}

async function aiSummarize(postId) {
  const p = (data.state.recentPosts || []).find((x) => x.id === postId);
  if (!p) return;
  await openPost(p);
  if ($('postview').open && PV.post?.id === p.id) $('pv-sum').click();
}

async function renderAiHub() {
  const cfg = await aiConfig();
  const api = BG.validAiKey(cfg.key) && cfg.mode !== 'web';
  const st = BG.aiLogStats(data.aiLog);
  const usd = (n) => (n ? (n < 0.01 ? '< 0,01' : n.toFixed(2).replace('.', ',')) + ' USD' : '0 USD');
  const tile = (value, label, tone = '', hint = '') => el('div', { class: 'me-stat' + (tone ? ' ' + tone : ''), title: hint }, el('b', {}, value), el('small', {}, label));
  $('ai-hub-status').replaceChildren(
    tile(api ? 'Khoá API' : 'Chép – dán', api ? BG.aiModel(cfg.model).label.split(' — ')[0] : 'qua ' + (BG.AI_WEB_SITES[cfg.site]?.label || 'Claude') + ' trên web', '', api ? 'Tự động bằng khoá API Claude (tính phí theo lần dùng)' : 'Không cần khoá: addon soạn đề bài, bạn dán vào trang chat AI rồi dán câu trả lời về'),
    tile(String(st.tasks), 'lần nhờ AI tháng này'),
    tile(String(st.sent), 'câu trả lời đã gửi tháng này'),
    tile(usd(st.cost), 'chi phí ước tính tháng này', '', 'Chỉ tính các lần dùng khoá API; chép – dán không mất phí'),
  );

  const pi = personaInfo();
  $('ai-persona-bar').className = 'ai-persona-bar' + (pi.on ? ' on' : '');
  $('ai-persona-bar').replaceChildren(
    el('span', { class: 'ai-task-ic', 'aria-hidden': 'true' }, icSvg('user')),
    el('span', { class: 'ai-persona-text' }, el('b', {}, 'Hồ sơ của bạn cho AI'), el('span', { class: 'muted small' }, pi.on ? `${pi.text} — AI viết theo giọng và bối cảnh của bạn` : pi.n ? 'Đang tắt — AI viết giọng chung chung' : 'Chưa điền — AI đang viết giọng chung chung. Vài dòng về bạn, cộng đồng và vài đoạn bạn từng viết là đủ.')),
    el('button', { type: 'button', class: pi.n ? 'ghost sm' : 'primary sm', onclick: openPersona }, pi.n ? 'Sửa hồ sơ' : 'Điền hồ sơ'),
  );

  const replies = aiReplyCandidates();
  const posts = aiSummaryPosts();
  const sel = $('ai-sum-post')?.value;
  const pick = el('select', { id: 'ai-sum-post', 'aria-label': 'Bài cần tóm tắt' }, ...posts.map((p) => el('option', { value: p.id, text: `${p.commentsCount} bình luận · ${String(p.title || p.text || 'Bài viết').replace(/\s+/g, ' ').slice(0, 60)}` })));
  if (posts.some((p) => p.id === sel)) pick.value = sel;
  const task = (id, icon, title, tip, info, button, onclick, disabled = false, extra = null) =>
    el(
      'div',
      { class: 'ai-task', 'data-task': id },
      el('span', { class: 'ai-task-ic', 'aria-hidden': 'true' }, icSvg(icon)),
      el('div', { class: 'ai-task-main' }, el('b', {}, title, ' ', el('button', { type: 'button', class: 'tip-i', 'data-tip': tip, 'aria-label': 'Gợi ý: ' + tip }, 'i')), el('span', { class: 'muted small' }, info), extra),
      el('button', { type: 'button', class: 'primary sm', disabled, onclick }, button),
    );
  $('ai-hub-tasks').replaceChildren(
    task('reply', 'message', 'Trả lời bình luận', 'AI viết nháp một câu trả lời cho từng bình luận theo nội dung bài; bạn xem, sửa, bỏ chọn rồi bấm Trả lời tất cả.', replies.length ? `${replies.length} bình luận mới chưa trả lời` : data.settings.scanComments ? 'Không có bình luận mới cần trả lời' : 'Bật Quét bình luận mới ở Cài đặt để có bình luận', 'Trả lời bằng AI', () => openAiReply(replies), !replies.length),
    task('summary', 'news', 'Tóm tắt bình luận', 'AI đọc bài và các bình luận đang hiện trong cửa sổ bài: ý chính, câu hỏi còn chờ, phàn nàn / spam, việc nên làm.', posts.length ? '' : 'Chưa có bài mới nào có bình luận', 'Tóm tắt', () => aiSummarize($('ai-sum-post').value), !posts.length, posts.length ? pick : null),
    task('welcome', 'users', 'Bài chào thành viên mới', 'AI viết mẫu bài có chỗ trống {danh_sach}; addon tự điền @tên những người bạn chọn ở Đăng bài › Chào thành viên mới.', 'Mẫu bài mới cho phần Chào thành viên mới', 'Viết mẫu', () => {
      showTab('compose');
      $('welcome').scrollIntoView({ block: 'start' });
      aiTemplateDraft('welcome');
    }),
    task('shoutout', 'star', 'Bài vinh danh', 'AI viết mẫu bài cảm ơn thành viên tích cực; addon tự điền danh sách @tên kèm huy chương.', 'Mẫu bài mới cho phần Vinh danh', 'Viết mẫu', () => {
      showTab('compose');
      $('shoutout').scrollIntoView({ block: 'start' });
      aiTemplateDraft('shoutout');
    }),
    task('post', 'pencil', 'Viết bài đăng', 'AI viết bài theo ý bạn ghi (hoặc viết lại chữ đang có trong ô soạn), rồi đưa vào ô soạn ở tab Đăng bài — không tự đăng.', $('compose-text').value.trim() ? 'Ô soạn đang có chữ: viết lại cho rõ, giữ ý' : 'Theo ý chính bạn ghi', 'Viết bài', aiPostDraft),
  );
}

function renderAiLog() {
  const list = data.aiLog || [];
  $('btn-ai-log-clear').disabled = !list.length;
  const how = (e) => (e.mode === 'api' ? 'Khoá API' + (e.model ? ' · ' + BG.aiModel(e.model).label.split(' — ')[0].replace('Claude ', '') : '') : e.mode === 'web' ? 'Chép – dán' + (e.site ? ' · ' + (BG.AI_WEB_SITES[e.site]?.label || e.site) : '') : '');
  const result = (e) => {
    if (e.status === 'cancel') return ['info', 'Đã huỷ' + (e.count ? ` · ${e.count}/${e.total} đã viết` : '')];
    if (e.status === 'error') return ['err', 'Lỗi' + (e.error ? ': ' + e.error.slice(0, 80) : e.failed ? ` · ${e.failed} câu không gửi được` : '')];
    if (e.kind === 'replySend') return ['ok', [e.sent && `đã gửi ${e.sent}`, e.dry && `Chạy thử ${e.dry}`].filter(Boolean).join(' · ') || 'Xong'];
    if (e.kind === 'reply') return ['ok', e.total && e.count < e.total ? `${e.count}/${e.total} bình luận` : `${e.count || 0} bình luận`];
    return ['ok', 'Xong'];
  };
  const cell = (label, ...kids) => el('td', { 'data-label': label }, ...kids);
  $('ai-log-body').replaceChildren(
    ...(list.length
      ? list.slice(0, 100).map((e) => {
          const [tone, text] = result(e);
          return el('tr', {}, cell('Lúc', fmtTime(e.at)), cell('Tác vụ', BG.AI_TASKS[e.kind] || e.kind), cell('Cách', how(e)), cell('Kết quả', el('span', { class: 'tag ' + tone, text })), el('td', { class: 'num', 'data-label': 'Chi phí' }, e.cost ? (e.cost < 0.01 ? '< 0,01' : e.cost.toFixed(2).replace('.', ',')) + ' USD' : '–'));
        })
      : [el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: 'Chưa nhờ AI lần nào — bắt đầu ở thẻ Tác vụ AI.' }))]),
  );
}

// Số trên tab: bình luận mới chưa trả lời (gợi ý, không phải việc gấp)
function aiBadgeCount() {
  return aiReplyCandidates().length;
}

$('btn-ai-hub-settings').addEventListener('click', () => {
  showTab('settings');
  showSettingsSec('ai');
});
$('btn-ai-log-clear').addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Xoá lịch sử tác vụ AI?', text: 'Chỉ xoá danh sách trong tab này (trong máy này); không ảnh hưởng gì trên Beincom.', okText: 'Xoá lịch sử' }))) return;
  await chrome.storage.local.remove('aiLog');
});
$('btn-compose-ai').addEventListener('click', aiPostDraft);
