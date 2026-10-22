// Dashboard — Trả lời bình luận bằng AI: AI viết một câu trả lời cho từng bình luận (theo nội dung bài); chính chủ xem, sửa,
// bỏ chọn rồi bấm Trả lời tất cả (gửi lần lượt như nút Trả lời, nghỉ theo "Nghỉ giữa hai thao tác"). Hai cách nhờ AI:
//   - AI trên web (chép – dán): addon soạn đề bài, chép vào bộ nhớ tạm, mở trang chat (Claude / ChatGPT / Gemini) — người dùng
//     tự dán, gửi, rồi dán câu trả lời về (không tự điều khiển trang chat: điều khoản các trang này cấm truy cập tự động)
//   - Khoá API Claude: gọi thẳng Claude Messages API, tự động hoàn toàn
// Mở từ bảng Bình luận mới (các bình luận đã chọn) và cửa sổ Bài viết & bình luận (bình luận chưa được mình trả lời).
// Khoá API, mô hình, giọng văn: Cài đặt → ✨ Trả lời bình luận bằng AI (chrome.storage.local `aiConfig`, ngoài sao lưu / đồng bộ).
// Nạp sau postview.js (dùng PV, loadPostComments, postOf).

// drafts[id] = { text, on, skip, reason, status: '' | 'sending' | 'sent' | 'dry' | 'error', error }
// mode: 'web' | 'api' · webIds: mã rút gọn trong đề bài đã chép -> mã bình luận thật
const AR = { list: [], posts: {}, drafts: {}, gen: false, sending: false, stop: false, cost: 0, cfg: null, fromPost: '', error: '', mode: 'web', webIds: null };

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
  await chrome.storage.local.set({ aiConfig: { ...(await aiConfig()), ...v } });
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

// Hộp Hướng dẫn (dash/ui.js openHelp): nút ❓ trong Cài đặt và các hộp AI
HELP_TOPICS.ai = {
  title: '✨ Hướng dẫn dùng AI',
  sections: [
    {
      h: 'AI giúp được gì',
      items: [
        'Trả lời bình luận hàng loạt: tab Bài viết → Bình luận mới → chọn bình luận → ✨ Trả lời bằng AI (hoặc mở một bài → ✨ Trả lời hàng loạt bằng AI).',
        'Viết bài chào thành viên mới / vinh danh: tab Đăng bài → ✨ AI viết bài. AI viết mẫu bài mới, addon tự điền @tên những người bạn đã chọn.',
        'Tóm tắt bình luận của một bài: cửa sổ Bài viết & bình luận → ✨ Tóm tắt bình luận.',
        'AI chỉ viết nháp: bạn xem, sửa, bỏ chọn rồi tự bấm Trả lời tất cả / Đăng. Đang bật Chạy thử thì chỉ ghi nhật ký.',
      ],
    },
    {
      h: 'Cách 1 — AI trên web (chép – dán), không cần khoá',
      items: [
        [
          'Chọn trang chat AI (Claude, ChatGPT hoặc Gemini — đã đăng nhập sẵn) rồi bấm Chép đề bài & mở….',
          'Trong trang chat: bấm vào ô nhập, dán (Ctrl + V; trên iPhone giữ ngón tay rồi chọn Dán), gửi.',
          'Đợi AI viết xong, bấm nút chép câu trả lời của trang chat.',
          'Quay lại addon bấm 📋 Dán — addon điền nháp vào từng bình luận / ô Kết quả.',
        ],
        'Addon chỉ chép đề bài và mở trang; mọi thao tác trên trang chat do bạn làm (các trang chat AI cấm phần mềm tự điều khiển).',
      ],
    },
    {
      h: 'Cách 2 — Khoá API Claude (tự động)',
      items: [
        [
          'Tạo khoá ở console.anthropic.com → API Keys (cần nạp tiền vào tài khoản Anthropic).',
          'Cài đặt → ✨ Trả lời bình luận bằng AI: dán khoá, bấm Kiểm tra rồi Lưu.',
          'Trong hộp AI chọn Khoá API Claude (tự động) → Tạo câu trả lời.',
        ],
        'Chi phí tính vào tài khoản Anthropic của bạn: Opus 5.5 khoảng 0,02–0,1 USD cho 20 bình luận; Sonnet 5.5 rẻ bằng nửa, Haiku 5.5 rẻ nhất. Hộp báo chi phí ước tính sau mỗi lần tạo.',
      ],
    },
    {
      h: 'Mẹo',
      items: [
        'Ghi chú cho AI giúp câu trả lời sát ý: cách xưng hô, thông tin sự kiện, điều cần nhắc. Ghi chú dùng cho mọi lần thì đặt ở Cài đặt → Hướng dẫn thêm cho AI.',
        'AI trả lời ngắn gọn, thân thiện, không lặp lại; bình luận chỉ có icon thì trả lời bằng icon; bình luận spam / lừa đảo được đề nghị bỏ qua (không chọn sẵn).',
        'Mỗi lượt tối đa 60 bình luận. AI bỏ sót bình luận nào thì gõ tay hoặc nhờ AI viết thêm.',
      ],
    },
    {
      h: 'Riêng tư',
      items: [
        'Gửi cho AI: nội dung bài, các bình luận và tên người viết — không gửi mật khẩu hay phiên đăng nhập.',
        'Khoá API chỉ lưu trong trình duyệt này, không có trong sao lưu / đồng bộ.',
      ],
    },
  ],
};

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
  Object.assign(AR, { list, posts: postText, drafts: {}, gen: false, sending: false, stop: false, cost: 0, fromPost, error: '', webIds: null });
  AR.cfg = await aiConfig();
  // Cách dùng: lần trước chọn gì thì giữ; chưa chọn: có khoá API thì tự động, không thì AI trên web
  AR.mode = AR.cfg.mode === 'api' || AR.cfg.mode === 'web' ? AR.cfg.mode : BG.validAiKey(AR.cfg.key) ? 'api' : 'web';
  $('ar-style').replaceChildren(...Object.entries(BG.AI_STYLES).map(([k, t]) => el('option', { value: k, text: t })));
  $('ar-style').value = BG.AI_STYLES[AR.cfg.style] ? AR.cfg.style : 'friendly';
  $('ar-site').replaceChildren(...Object.entries(BG.AI_WEB_SITES).map(([k, w]) => el('option', { value: k, text: w.label })));
  $('ar-site').value = BG.AI_WEB_SITES[AR.cfg.site] ? AR.cfg.site : 'claude';
  $('ar-note').value = '';
  $('ar-paste').value = '';
  arStatus('');
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
    d ? box : el('p', { class: 'muted small', text: AR.gen ? 'Đang chờ AI viết…' : AR.mode === 'web' ? 'Làm bước 1 và 2 ở trên để AI viết nháp.' : 'Bấm Tạo câu trả lời để AI viết nháp.' }),
    d?.skip ? el('div', { class: 'warn-text small', text: 'AI đề nghị không trả lời' + (d.reason ? ': ' + d.reason : '') }) : null,
    d?.status === 'error' || (d?.error && !d.status) ? el('div', { class: 'err-text small', text: d.error }) : null,
  );
}

function renderAr() {
  const n = AR.list.length;
  $('ar-title').textContent = `✨ Trả lời ${n} bình luận bằng AI`;
  const hasKey = BG.validAiKey(AR.cfg?.key);
  const web = AR.mode === 'web';
  for (const b of document.querySelectorAll('#ar-mode button')) {
    b.classList.toggle('active', b.dataset.m === AR.mode);
    b.setAttribute('aria-pressed', String(b.dataset.m === AR.mode));
    b.disabled = AR.gen || AR.sending;
  }
  $('ar-web').hidden = !web;
  $('ar-gen').hidden = web;
  $('ar-setup').hidden = web || hasKey;
  $('ar-copy').textContent = `Chép đề bài & mở ${BG.AI_WEB_SITES[$('ar-site').value]?.label || 'trang chat AI'}`;
  for (const id of ['ar-site', 'ar-copy', 'ar-paste', 'ar-paste-btn', 'ar-fill']) $(id).disabled = AR.sending;
  $('ar-gen').disabled = AR.gen || AR.sending || !hasKey;
  $('ar-gen').textContent = AR.gen ? 'AI đang viết…' : Object.keys(AR.drafts).length ? 'Tạo lại' : 'Tạo câu trả lời';
  $('ar-gen').title = Object.keys(AR.drafts).length ? 'Viết lại các câu chưa gửi (bỏ chỗ đã sửa tay)' : '';
  $('ar-style').disabled = $('ar-note').disabled = AR.gen || AR.sending;
  $('ar-dry').hidden = !data.settings.dryRun;
  $('ar-list').replaceChildren(...AR.list.map(arItem));
  renderArFoot();
}

// Câu trả lời của AI -> nháp từng bình luận (thêm @tên người được trả lời như nút Trả lời)
function arApply(comments, out) {
  for (const c of comments) {
    const r = out[c.id];
    const pre = BG.replyTarget(c).prefill;
    AR.drafts[c.id] = r
      ? { text: r.skip && !r.reply ? '' : pre + BG.aiCleanReply(r.reply, c.actor?.username), on: !r.skip && !!r.reply, skip: r.skip, reason: r.reason, status: '', error: '' }
      : { text: pre, on: false, skip: false, reason: '', status: '', error: 'AI chưa viết cho bình luận này — gõ tay, hoặc nhờ AI viết lại.' };
  }
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
      arApply(chunk, out);
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
  else arStatus(`AI đã viết nháp cho ${done} bình luận${cost}.`);
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

// ---------- AI trên web (chép – dán) ----------

const arTodo = () => AR.list.filter((c) => !['sent', 'dry'].includes(AR.drafts[c.id]?.status));
const arCommunity = (list) => [...new Set(list.flatMap((c) => (c.groups || []).map((g) => g.communityName || g.name)).filter(Boolean))].slice(0, 3).join(', ');

// Chép vào bộ nhớ tạm (trình duyệt chặn Clipboard API thì dùng cách cũ)
async function arCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  const t = el('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' });
  t.value = text;
  $('ai-reply').append(t);
  t.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {}
  t.remove();
  return ok;
}

// Bước 1: soạn đề bài (giọng văn, ghi chú, bài, bình luận chưa gửi), chép, mở trang chat AI ở thẻ mới
// Safari (iPhone) chỉ cho chép và mở thẻ mới ngay trong lúc bấm: soạn đề bài từ cài đặt đã đọc lúc mở hộp, chép và mở trang
// trước mọi việc phải chờ
function arWebCopy() {
  const todo = arTodo();
  if (!todo.length) return toast('Các bình luận đã được trả lời hết.', 'warn');
  const cfg = AR.cfg || BG.DEFAULT_AI;
  const site = BG.AI_WEB_SITES[$('ar-site').value] ? $('ar-site').value : 'claude';
  const style = $('ar-style').value;
  const note = [cfg.note, $('ar-note').value.trim()].filter(Boolean).join('\n');
  const p = BG.aiWebPrompt({ comments: todo, posts: AR.posts, style, note, community: arCommunity(todo) });
  AR.webIds = p.ids;
  const copying = arCopy(p.text);
  window.open(BG.AI_WEB_SITES[site].url, '_blank', 'noopener');
  AR.cfg = { ...cfg, site, style, mode: 'web' };
  chrome.storage.local.set({ aiConfig: AR.cfg });
  copying.then((copied) => arStatus(copied ? `Đã chép đề bài (${todo.length} bình luận) và mở ${BG.AI_WEB_SITES[site].label}.` : 'Trình duyệt không cho chép tự động — thử lại, hoặc dùng khoá API.', copied ? '' : 'err-text'));
}

// Bước 2: đọc khối JSON dán về, điền nháp
function arWebFill() {
  const text = $('ar-paste').value;
  if (!text.trim()) return toast('Dán câu trả lời của AI vào ô trước', 'err');
  // Chưa bấm Chép đề bài ở lần mở hộp này: mã rút gọn theo đúng thứ tự đề bài sẽ soạn
  const ids = AR.webIds || Object.fromEntries(arTodo().map((c, i) => [String(i + 1), String(c.id)]));
  let out;
  try {
    out = BG.aiParseWebReplies(text, ids);
  } catch (e) {
    return arStatus(e.message, 'err-text');
  }
  const want = new Set(Object.values(ids));
  const list = AR.list.filter((c) => want.has(String(c.id)));
  arApply(list, out);
  const got = list.filter((c) => out[c.id]).length;
  arStatus(got === list.length ? `Đã điền nháp cho ${got} bình luận.` : `Đã điền ${got}/${list.length} bình luận — AI bỏ sót ${list.length - got} (gõ tay, hoặc nhờ AI viết thêm).`, got === list.length ? '' : 'warn-text');
  renderAr();
}

// Nút Dán: đọc bộ nhớ tạm rồi điền luôn; không đọc được thì nhắc dán tay
// Đọc bộ nhớ tạm ngay trong lúc bấm (Safari cần vậy); addon chưa có quyền đọc thì xin rồi đọc lại. Không đọc được: ''
async function aiReadClipboard() {
  const read = async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  };
  let text = await read();
  if (text == null && chrome.permissions?.request) {
    try {
      await chrome.permissions.request({ permissions: ['clipboardRead'] });
    } catch {}
    text = await read();
  }
  return text || '';
}

async function arWebPaste() {
  const text = await aiReadClipboard();
  if (!text.trim()) {
    $('ar-paste').focus();
    return arStatus('Không đọc được bộ nhớ tạm — dán tay vào ô (Ctrl + V).', 'warn-text');
  }
  $('ar-paste').value = text;
  arWebFill();
}

$('ar-copy').addEventListener('click', arWebCopy);
$('ar-paste-btn').addEventListener('click', arWebPaste);
$('ar-fill').addEventListener('click', arWebFill);
// Dán tay vào ô (Ctrl + V) cũng điền luôn
$('ar-paste').addEventListener('paste', () => setTimeout(arWebFill, 0));
$('ar-site').addEventListener('change', () => renderAr());
for (const b of document.querySelectorAll('#ar-mode button')) {
  b.addEventListener('click', async () => {
    if (AR.mode === b.dataset.m) return;
    AR.mode = b.dataset.m;
    AR.cfg = await aiConfig();
    chrome.storage.local.set({ aiConfig: { ...AR.cfg, mode: AR.mode } });
    arStatus('');
    renderAr();
  });
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
