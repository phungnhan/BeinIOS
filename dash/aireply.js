// Dashboard — Trả lời bình luận bằng AI: gửi nội dung các bình luận (kèm bài) cho Claude, nhận một câu trả lời cho từng bình
// luận; chính chủ xem, sửa, bỏ chọn rồi bấm Trả lời tất cả (gửi lần lượt như nút Trả lời, nghỉ theo "Nghỉ giữa hai thao tác").
// Mở từ bảng Bình luận mới (các bình luận đã chọn) và cửa sổ Bài viết & bình luận (bình luận chưa được mình trả lời).
// Khoá API, mô hình, giọng văn: Cài đặt → ✨ Trả lời bình luận bằng AI (chrome.storage.local `aiConfig`, ngoài sao lưu / đồng bộ).
// Nạp sau postview.js (dùng PV, loadPostComments, postOf).

// drafts[id] = { text, on, skip, reason, status: '' | 'sending' | 'sent' | 'dry' | 'error', error }
const AR = { list: [], posts: {}, drafts: {}, gen: false, sending: false, stop: false, cost: 0, cfg: null, fromPost: '', error: '' };

async function aiConfig() {
  const { aiConfig: c } = await chrome.storage.local.get('aiConfig');
  return { ...BG.DEFAULT_AI, ...c };
}

// Xin quyền gửi tới api.anthropic.com ngay trong lúc bấm (một lần). Không có quyền vẫn thử gọi được nhờ CORS của Anthropic.
async function askAiPermission() {
  try {
    return (await chrome.permissions?.request?.({ origins: [BG.AI_ORIGIN] })) !== false;
  } catch {
    return true;
  }
}

// Gọi Claude: trả về { body } hoặc ném Error câu tiếng Việt
async function aiCall(req) {
  let res;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
  } catch {
    throw new Error(BG.aiErrorText(0));
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(BG.aiErrorText(res.status, body));
  return body;
}

// ---------- Cài đặt ----------

async function loadAiForm() {
  const cfg = await aiConfig();
  $('ai-key').value = cfg.key || '';
  $('ai-model').replaceChildren(...BG.AI_MODELS.map((m) => el('option', { value: m.id, text: m.label })));
  $('ai-model').value = BG.aiModel(cfg.model).id;
  $('ai-style').replaceChildren(...Object.entries(BG.AI_STYLES).map(([k, t]) => el('option', { value: k, text: t })));
  $('ai-style').value = BG.AI_STYLES[cfg.style] ? cfg.style : 'friendly';
  $('ai-note').value = cfg.note || '';
  $('ai-status').textContent = cfg.key ? 'Đã có khoá API.' : 'Chưa có khoá API.';
}

function aiFormValues() {
  return { key: $('ai-key').value.trim(), model: $('ai-model').value, style: $('ai-style').value, note: $('ai-note').value.trim() };
}

$('btn-ai-show').addEventListener('click', () => {
  const t = $('ai-key');
  t.type = t.type === 'password' ? 'text' : 'password';
  $('btn-ai-show').textContent = t.type === 'password' ? 'Hiện' : 'Ẩn';
});

$('btn-ai-save').addEventListener('click', async () => {
  const v = aiFormValues();
  if (v.key && !BG.validAiKey(v.key)) return toast('Khoá API chưa đúng dạng (bắt đầu bằng sk-ant-…)', 'err');
  if (v.key) await askAiPermission();
  await chrome.storage.local.set({ aiConfig: v });
  $('ai-status').textContent = v.key ? 'Đã lưu khoá API.' : 'Đã xoá khoá API.';
  toast(v.key ? 'Đã lưu. Chọn bình luận ở tab Bài viết → ✨ Trả lời bằng AI.' : 'Đã lưu (chưa có khoá API).');
});

// Kiểm tra: một yêu cầu rất ngắn (vài token) để biết khoá dùng được với mô hình đã chọn
$('btn-ai-test').addEventListener('click', async () => {
  const v = aiFormValues();
  if (!BG.validAiKey(v.key)) return toast('Dán khoá API (sk-ant-…) trước', 'err');
  await askAiPermission();
  const btn = $('btn-ai-test');
  btn.disabled = true;
  $('ai-status').textContent = 'Đang kiểm tra…';
  try {
    const req = BG.aiRequest({ key: v.key, model: v.model, input: 'Reply with the single word OK.', maxTokens: 512 });
    delete req.body.output_config.format;
    req.body.output_config.effort = 'low';
    const body = await aiCall(req);
    $('ai-status').textContent = `Khoá dùng được ✓ (${BG.aiModel(body.model || v.model).label.split(' — ')[0]}). Bấm Lưu để giữ.`;
  } catch (e) {
    $('ai-status').textContent = e.message;
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

loadAiForm();

// ---------- Hộp trả lời bằng AI ----------

// comments: bình luận đã gọn; posts: { [postId]: chữ của bài } (thiếu thì lấy bài trong kết quả quét / đoạn đầu bài)
async function openAiReply(comments, { posts = {}, fromPost = '' } = {}) {
  const me = data.state.me?.id;
  const seen = new Set();
  const all = (comments || []).filter((c) => c?.id && c.postId && !c.isHidden && (!me || c.actor?.id !== me) && !seen.has(c.id) && seen.add(c.id));
  if (!all.length) return toast('Không có bình luận nào để trả lời (bỏ qua bình luận đã ẩn và của chính bạn).', 'err');
  if (all.length > BG.AI_MAX) toast(`Mỗi lượt tối đa ${BG.AI_MAX} bình luận — lấy ${BG.AI_MAX} bình luận đầu.`, 'warn');
  const list = all.slice(0, BG.AI_MAX);
  const postText = {};
  for (const c of list) postText[c.postId] ||= posts[c.postId] || postOf(c.postId, c).text || c.postSnippet || '';
  Object.assign(AR, { list, posts: postText, drafts: {}, gen: false, sending: false, stop: false, cost: 0, fromPost, error: '' });
  AR.cfg = await aiConfig();
  $('ar-style').replaceChildren(...Object.entries(BG.AI_STYLES).map(([k, t]) => el('option', { value: k, text: t })));
  $('ar-style').value = BG.AI_STYLES[AR.cfg.style] ? AR.cfg.style : 'friendly';
  $('ar-note').value = '';
  renderAr();
  if (!$('ai-reply').open) $('ai-reply').showModal();
}

const arReady = (c) => {
  const d = AR.drafts[c.id];
  return !!d?.on && !['sent', 'dry', 'sending'].includes(d.status) && !BG.validateComment(d.text) && d.text.trim() !== BG.replyTarget(c).prefill.trim();
};

function renderArFoot() {
  const n = AR.list.filter(arReady).length;
  const send = $('ar-send');
  send.textContent = AR.sending ? 'Đang gửi…' : `Trả lời tất cả (${n})`;
  send.disabled = AR.gen || AR.sending || !n;
  $('ar-stop').hidden = !AR.sending;
  $('ar-stop').disabled = AR.stop;
}

function arStatusTag(d) {
  if (!d?.status) return null;
  const map = { sending: ['info', 'Đang gửi…'], sent: ['ok', 'Đã gửi ✓'], dry: ['warn', 'Chạy thử: đã ghi nhật ký'], error: ['err', 'Lỗi'] };
  const [cls, text] = map[d.status] || [];
  return text ? el('span', { class: 'tag ' + cls, title: d.error || '', text }) : null;
}

function arItem(c) {
  const d = AR.drafts[c.id];
  const locked = AR.sending || ['sent', 'dry', 'sending'].includes(d?.status);
  const box = el('textarea', { rows: 3, class: 'ar-text', disabled: locked, 'aria-label': 'Câu trả lời cho ' + (c.actor?.fullname || c.actor?.username || 'bình luận') });
  box.value = d?.text || '';
  box.addEventListener('input', () => {
    d.text = box.value;
    if (box.value.trim() && !d.on && !d.skip) {
      d.on = true;
      cb.checked = true;
    }
    renderArFoot();
  });
  const cb = el('input', { type: 'checkbox', checked: !!d?.on, disabled: !d || locked, 'aria-label': 'Gửi câu trả lời này' });
  cb.addEventListener('change', () => {
    d.on = cb.checked;
    renderArFoot();
  });
  const snippet = String(AR.posts[c.postId] || '').replace(/\s+/g, ' ').slice(0, 90);
  return el(
    'div',
    { class: 'ar-item' + (d?.skip ? ' skip' : '') + (d?.status === 'sent' ? ' done' : ''), id: 'ar-' + c.id },
    el('div', { class: 'pv-chead' }, el('label', { class: 'check', title: 'Gửi câu trả lời này' }, cb), c.actor ? postAuthor(c.actor) : null, el('span', { class: 'muted small', title: fmtTime(c.createdAt), text: ago(c.createdAt) }), c.parentId ? el('span', { class: 'tag info', text: '↳ trả lời' }) : null, arStatusTag(d)),
    el('div', { class: 'pv-ctext', text: c.text || (c.images ? '(ảnh)' : c.giphy ? '(ảnh GIF)' : '(không có chữ)') }),
    !AR.fromPost && snippet ? el('div', { class: 'muted small ar-post', text: 'Trên bài: ' + snippet }) : null,
    d ? box : el('p', { class: 'muted small', text: AR.gen ? 'Đang chờ AI viết…' : 'Bấm Tạo câu trả lời để AI viết nháp.' }),
    d?.skip ? el('div', { class: 'warn-text small', text: 'AI đề nghị không trả lời' + (d.reason ? ': ' + d.reason : '') + ' — vẫn muốn trả lời thì gõ vào ô trên.' }) : null,
    d?.status === 'error' || (d?.error && !d.status) ? el('div', { class: 'err-text small', text: d.error }) : null,
  );
}

function renderAr() {
  const n = AR.list.length;
  $('ar-title').textContent = `✨ Trả lời ${n} bình luận bằng AI`;
  const hasKey = BG.validAiKey(AR.cfg?.key);
  $('ar-setup').hidden = hasKey;
  $('ar-gen').disabled = AR.gen || AR.sending || !hasKey;
  $('ar-gen').textContent = AR.gen ? 'AI đang viết…' : Object.keys(AR.drafts).length ? 'Tạo lại' : 'Tạo câu trả lời';
  $('ar-gen').title = Object.keys(AR.drafts).length ? 'Viết lại các câu chưa gửi (bỏ chỗ đã sửa tay)' : '';
  $('ar-style').disabled = $('ar-note').disabled = AR.gen || AR.sending;
  $('ar-dry').hidden = !data.settings.dryRun;
  $('ar-list').replaceChildren(...AR.list.map(arItem));
  renderArFoot();
}

const arStatus = (text, cls = '') => {
  $('ar-status').textContent = text;
  $('ar-status').className = 'small ' + (cls || 'muted');
};

// Nhờ AI viết: chia đợt AI_BATCH bình luận, đợt nào xong hiện ngay đợt đó
async function arGenerate() {
  if (AR.gen || AR.sending) return;
  await askAiPermission();
  const cfg = (AR.cfg = await aiConfig());
  if (!BG.validAiKey(cfg.key)) return renderAr();
  const style = $('ar-style').value;
  const note = [cfg.note, $('ar-note').value.trim()].filter(Boolean).join('\n');
  if (style !== cfg.style) chrome.storage.local.set({ aiConfig: { ...cfg, style } });
  const todo = AR.list.filter((c) => !['sent', 'dry'].includes(AR.drafts[c.id]?.status));
  if (!todo.length) return;
  AR.gen = true;
  AR.error = '';
  const community = [...new Set(todo.flatMap((c) => (c.groups || []).map((g) => g.communityName || g.name)).filter(Boolean))].slice(0, 3).join(', ');
  renderAr();
  let done = 0;
  try {
    for (const chunk of BG.aiChunks(todo)) {
      arStatus(`AI đang viết… ${done}/${todo.length}`);
      const req = BG.aiRequest({ key: cfg.key, model: cfg.model, input: BG.aiReplyInput({ comments: chunk, posts: AR.posts, style, note, community }) });
      const body = await aiCall(req);
      const out = BG.aiParseReplies(body, chunk.map((c) => c.id));
      AR.cost += BG.aiCost(body.usage, body.model || cfg.model);
      for (const c of chunk) {
        const r = out[c.id];
        const pre = BG.replyTarget(c).prefill;
        AR.drafts[c.id] = r
          ? { text: r.skip && !r.reply ? '' : pre + BG.aiCleanReply(r.reply, c.actor?.username), on: !r.skip && !!r.reply, skip: r.skip, reason: r.reason, status: '', error: '' }
          : { text: pre, on: false, skip: false, reason: '', status: '', error: 'AI chưa viết cho bình luận này — gõ tay hoặc bấm Tạo lại.' };
      }
      done += chunk.length;
      renderAr();
    }
  } catch (e) {
    AR.error = e.message || String(e);
  } finally {
    AR.gen = false;
  }
  const cost = AR.cost ? ` · chi phí ước tính ${AR.cost < 0.01 ? '< 0,01' : AR.cost.toFixed(2).replace('.', ',')} USD` : '';
  if (AR.error) arStatus(`${AR.error}${done ? ` (đã viết xong ${done}/${todo.length})` : ''}${cost}`, 'err-text');
  else arStatus(`AI đã viết nháp cho ${done} bình luận${cost}. Xem, sửa hoặc bỏ chọn từng câu rồi bấm Trả lời tất cả.`);
  renderAr();
}

// Gửi lần lượt các câu đã chọn (như nút Trả lời: trả lời bình luận gốc, nhắc tên người được trả lời)
async function arSendAll() {
  const picks = AR.list.filter(arReady);
  if (!picks.length || AR.sending) return;
  const who = (c) => c.actor?.fullname || c.actor?.username || 'bình luận';
  const ok = await confirmDialog({
    title: `Trả lời ${picks.length} bình luận?`,
    text: 'Các câu trả lời được đăng lên Beincom dưới tên tài khoản của bạn, lần lượt từng câu.',
    names: picks.map((c) => `${who(c)}: ${AR.drafts[c.id].text.replace(/\s+/g, ' ').slice(0, 90)}`),
    okText: `Trả lời ${picks.length} bình luận`,
  });
  if (!ok) return;
  AR.sending = true;
  AR.stop = false;
  const people = [...new Map([...AR.list.map((c) => c.actor), ...[...new Set(AR.list.map((c) => c.postId))].map((id) => postOf(id).actor)].filter((u) => u?.id && u.username).map((u) => [u.id, u])).values()];
  const n = { ok: 0, dry: 0, failed: 0 };
  let loginLost = false;
  renderAr();
  for (let i = 0; i < picks.length; i++) {
    if (AR.stop) break;
    const c = picks[i];
    const d = AR.drafts[c.id];
    d.status = 'sending';
    arStatus(`Đang gửi ${i + 1}/${picks.length}…`);
    renderAr();
    const t = BG.replyTarget(c);
    let r;
    try {
      r = await chrome.runtime.sendMessage({ type: 'commentWrite', postId: c.postId, commentId: t.commentId, content: d.text, mentions: BG.commentMentions(d.text, people), source: 'ai' });
    } catch (e) {
      r = { status: 'error', message: e?.message || String(e) };
    }
    if (r?.status === 'need_login') {
      Object.assign(d, { status: 'error', error: 'Phiên đăng nhập Beincom hết hạn' });
      loginLost = true;
      break;
    }
    if (r?.status !== 'ok' || r.failed) {
      Object.assign(d, { status: 'error', error: r?.errors?.join('; ') || r?.message || 'Không gửi được' });
      n.failed++;
    } else if (r.dryRun) {
      d.status = 'dry';
      n.dry++;
    } else {
      d.status = 'sent';
      n.ok++;
    }
    renderAr();
    // Nghỉ như giữa hai thao tác (bấm Dừng thì thôi chờ)
    if (i < picks.length - 1 && !AR.stop) {
      const end = Date.now() + (Number(data.settings.actionDelaySec) || 0) * 1000;
      while (Date.now() < end && !AR.stop) await new Promise((res) => setTimeout(res, 200));
    }
  }
  for (const c of picks) if (AR.drafts[c.id].status === 'sending') AR.drafts[c.id].status = '';
  const left = picks.filter((c) => !AR.drafts[c.id].status).length;
  AR.sending = false;
  AR.stop = false;
  const parts = [n.ok && `đã trả lời ${n.ok}`, n.dry && `Chạy thử: đã ghi ${n.dry} vào nhật ký`, n.failed && `lỗi ${n.failed}`, left && `còn ${left} chưa gửi`].filter(Boolean).join(', ');
  if (loginLost) toast('Phiên đăng nhập Beincom đã hết hạn — đăng nhập lại rồi bấm Trả lời tất cả để gửi tiếp.', 'err');
  else toast(parts ? parts[0].toUpperCase() + parts.slice(1) + '.' : 'Không có gì được gửi.', n.failed ? 'err' : n.dry ? 'warn' : 'ok');
  arStatus(parts ? parts[0].toUpperCase() + parts.slice(1) + '.' : '');
  renderAr();
  await loadAll();
}

$('ar-gen').addEventListener('click', arGenerate);
$('ar-send').addEventListener('click', arSendAll);
$('ar-stop').addEventListener('click', () => {
  AR.stop = true;
  renderArFoot();
});
$('ar-close').addEventListener('click', () => $('ai-reply').close());
$('ai-reply').addEventListener('cancel', (e) => AR.sending && e.preventDefault()); // đang gửi: Esc không đóng
$('ai-reply').addEventListener('close', () => {
  // Mở từ cửa sổ bài viết và đã trả lời: đọc lại bình luận của bài
  if (AR.fromPost && PV.post?.id === AR.fromPost && AR.list.some((c) => AR.drafts[c.id]?.status === 'sent')) {
    PV.replies = {};
    loadPostComments();
  }
});
$('ar-open-settings').addEventListener('click', () => {
  $('ai-reply').close();
  if ($('postview').open) $('postview').close();
  showTab('settings');
  document.querySelector('#settings .ai-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Bảng Bình luận mới: các bình luận đã chọn
$('btn-ai-comments').addEventListener('click', () => openAiReply((data.state.recentComments || []).filter((c) => selectedComments.has(c.id))));

// Cửa sổ Bài viết & bình luận: bình luận (gốc và trả lời đã tải) chưa được mình trả lời
function pvAiTargets() {
  const me = data.state.me?.id;
  const all = [...PV.items, ...Object.values(PV.replies).flat()];
  const answered = new Set(all.filter((c) => me && c.actor?.id === me && c.parentId).map((c) => c.parentId));
  return all.filter((c) => !c.isHidden && (!me || c.actor?.id !== me) && !(!c.parentId && answered.has(c.id)));
}
$('pv-ai').addEventListener('click', () => {
  const p = PV.post;
  if (!p) return;
  const text = [p.title, PV.full?.text || p.text].filter(Boolean).join('\n');
  openAiReply(pvAiTargets(), { posts: { [p.id]: text }, fromPost: p.id });
});
