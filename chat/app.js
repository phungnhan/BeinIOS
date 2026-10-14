// Trang Chat — gắn sự kiện, đọc lại định kỳ, khởi động. Nạp cuối cùng (sau mọi tệp chat/*.js).

// ---------- Sự kiện ----------

for (const b of document.querySelectorAll('#fmt [data-md]')) {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // giữ vùng chọn trong ô gõ
  b.addEventListener('click', () => format(b.dataset.md));
}
$('btn-preview').addEventListener('click', () => setPreview(!S.preview));
$('preview').addEventListener('click', () => setPreview(false));
$('btn-fmt').addEventListener('click', () => setFmt(!S.fmt));
$('btn-prio').addEventListener('click', () => ($('prio-menu').hidden ? openPop($('prio-menu'), $('btn-prio'), 'left') : closePops()));
for (const b of document.querySelectorAll('#prio-menu [data-prio]')) b.addEventListener('click', () => setPriority(b.dataset.prio));
$('btn-emoji').addEventListener('mousedown', (e) => e.preventDefault());
$('btn-emoji').addEventListener('click', () => {
  if (!$('emoji-pop').hidden) return closePops();
  renderEmoji(0);
  openPop($('emoji-pop'), $('btn-emoji'), 'right');
});
$('btn-attach').addEventListener('click', () => !$('text').disabled && $('file-input').click());
$('file-input').addEventListener('change', () => {
  addFiles($('file-input').files);
  $('file-input').value = '';
});
// Dán ảnh (chỉ khi không dán chữ), kéo thả tệp vào cuộc trò chuyện
$('text').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length && !e.clipboardData.getData('text/plain')) {
    e.preventDefault();
    addFiles(files);
  }
});
for (const id of ['msgs', 'composer']) {
  $(id).addEventListener('dragover', (e) => {
    if (!S.sel || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    $('composer').classList.add('drop');
  });
  $(id).addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !$('conv').contains(e.relatedTarget)) $('composer').classList.remove('drop');
  });
  $(id).addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    $('composer').classList.remove('drop');
    addFiles(e.dataTransfer.files);
  });
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest?.('.pop, #btn-prio, #btn-emoji')) closePops();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePops();
});
setFmt(S.fmt);
renderPrio();

$('t-close').addEventListener('click', closeThread);
$('t-follow').addEventListener('click', () => S.thread && toggleFollow(S.thread.root));
$('t-more').addEventListener('click', loadMoreThread);
$('t-composer').addEventListener('submit', sendThread);
$('t-text').addEventListener('input', () => {
  tAutosize();
  mentionInput($('t-text'));
  if (!S.tEditing) setDraft(threadKey(), $('t-text').value);
});
$('t-text').addEventListener('keydown', (e) => {
  if (e.isComposing || mentionKey(e)) return;
  if (e.key === 'Escape' && S.tEditing) {
    e.preventDefault();
    return cancelEdit(true);
  }
  if (e.key === 'Escape' && S.tQuote) {
    e.preventDefault();
    return cancelQuote(true);
  }
  const t = $('t-text');
  if (e.ctrlKey || e.metaKey) {
    const k = SHORTCUTS.find(([code, shift, alt]) => e.code === code && e.shiftKey === shift && e.altKey === alt);
    if (k) {
      e.preventDefault();
      return applyEdit(BG.mdEdit(t.value, t.selectionStart, t.selectionEnd, k[3]), t);
    }
  }
  if (e.key === 'Enter' && e.shiftKey) {
    const r = BG.mdNewline(t.value, t.selectionStart);
    if (r && t.selectionStart === t.selectionEnd) {
      e.preventDefault();
      applyEdit(r, t);
    }
    return;
  }
  if (e.key === 'Enter') sendThread(e);
  if (e.key === 'Escape') closeThread();
});
for (const id of ['text', 't-text']) $(id).addEventListener('blur', () => setTimeout(() => document.activeElement !== $(id) && closeMention(), 150));
$('t-edit-x').addEventListener('click', () => (cancelEdit(true), $('t-text').focus()));
$('btn-pinned').addEventListener('click', () => ($('pins').hidden ? openPins() : closePins()));
$('p-close').addEventListener('click', closePins);
$('person').addEventListener('click', (e) => e.target === $('person') && $('person').close());

$('req-accept').addEventListener('click', () => reqAction('accept'));
$('req-ignore').addEventListener('click', () => reqAction('ignore'));
$('v-close').addEventListener('click', () => $('viewer').close());
$('v-prev').addEventListener('click', () => showImage(V.i - 1));
$('v-next').addEventListener('click', () => showImage(V.i + 1));
$('v-goto').addEventListener('click', () => {
  const id = V.list[V.i]?.post.id;
  $('viewer').close();
  if (id) flashTo(id, V.mode === 'thread' ? 't-' : 'm-');
});
$('viewer').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') showImage(V.i - 1);
  else if (e.key === 'ArrowRight') showImage(V.i + 1);
  else if (e.key === 'Home') showImage(0);
  else if (e.key === 'End') showImage(V.list.length - 1);
  else return;
  e.preventDefault();
});
$('viewer').addEventListener('close', () => {
  V.zoom = false;
  $('v-stage').replaceChildren();
});
// Bấm ra ngoài ảnh: đóng. Bấm vào ảnh lớn: xem đúng cỡ (bấm lại để thu về vừa khung)
$('v-stage').addEventListener('click', (e) => {
  const stage = $('v-stage');
  if (V.swiped) return void (V.swiped = false);
  if (e.target === stage) return $('viewer').close();
  if (e.target.tagName !== 'IMG' || !stage.classList.contains('can-zoom')) return;
  const img = e.target;
  const rx = e.offsetX / img.clientWidth;
  const ry = e.offsetY / img.clientHeight;
  V.zoom = !V.zoom;
  stage.classList.toggle('zoomed', V.zoom);
  if (V.zoom) stage.scrollTo(rx * img.clientWidth - stage.clientWidth / 2, ry * img.clientHeight - stage.clientHeight / 2);
});
// Vuốt ngang (điện thoại) hoặc kéo chuột: ảnh trước / sau
$('v-stage').addEventListener('pointerdown', (e) => {
  V.swipe = V.zoom ? null : { x: e.clientX, y: e.clientY };
});
$('v-stage').addEventListener('pointerup', (e) => {
  if (!V.swipe) return;
  const dx = e.clientX - V.swipe.x;
  const dy = e.clientY - V.swipe.y;
  V.swipe = null;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
  V.swiped = true;
  setTimeout(() => (V.swiped = false), 400);
  showImage(V.i + (dx < 0 ? 1 : -1));
});

$('composer').addEventListener('submit', sendMsg);
$('text').addEventListener('input', () => {
  autosize();
  mentionInput($('text'));
  if (S.sel && !S.editing) setDraft(S.sel.id, $('text').value);
});
$('text').addEventListener('blur', () => (S.caret = $('text').selectionStart));
$('text').addEventListener('keydown', (e) => {
  if (e.isComposing || mentionKey(e)) return;
  // Mũi tên lên khi ô gõ trống: sửa tin gần nhất của mình (như Slack / Mattermost)
  if (e.key === 'ArrowUp' && !$('text').value && !S.editing) {
    const last = sortedPosts().filter((p) => p.user.chatId === S.me?.chatId && !p.deleted && !p.system && p.message).pop();
    if (last) {
      e.preventDefault();
      return startEdit(last);
    }
  }
  if (e.key === 'Escape' && S.editing) {
    e.preventDefault();
    return cancelEdit();
  }
  // Phím tắt định dạng như web: Ctrl + B / I, Ctrl + Shift + X, Ctrl + Alt + K / C, Ctrl + Shift + 7 / 8 / 9; Ctrl + Alt + P xem trước
  if (e.ctrlKey || e.metaKey) {
    const k = SHORTCUTS.find(([code, shift, alt]) => e.code === code && e.shiftKey === shift && e.altKey === alt);
    if (k) {
      e.preventDefault();
      return format(k[3]);
    }
    if (e.altKey && e.code === 'KeyP') {
      e.preventDefault();
      return setPreview(true);
    }
  }
  // Shift + Enter trong danh sách: dòng mới có sẵn ký hiệu
  if (e.key === 'Enter' && e.shiftKey) {
    const r = BG.mdNewline($('text').value, $('text').selectionStart);
    if (r && $('text').selectionStart === $('text').selectionEnd) {
      e.preventDefault();
      applyEdit(r);
    }
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) sendMsg(e);
  if (e.key === 'Escape' && S.quote) cancelQuote();
});
$('quote-bar-x').addEventListener('click', () => (cancelQuote(), $('text').focus()));
$('t-quote-x').addEventListener('click', () => (cancelQuote(true), $('t-text').focus()));
$('reply-x').addEventListener('click', () => {
  cancelEdit();
  $('text').focus();
});
$('older').addEventListener('click', loadOlder);
$('msgs').addEventListener('scroll', () => {
  if ($('msgs').scrollTop < 60) loadOlder();
  updateJump();
});
$('jump').addEventListener('click', () => {
  $('msgs').scrollTo({ top: $('msgs').scrollHeight, behavior: 'smooth' });
  S.newBelow = 0;
  updateJump();
});
$('tv-back').addEventListener('click', () => {
  hideThreads();
  $('app').classList.remove('open');
  history.replaceState(null, '', location.href.split('#')[0]);
  renderList();
  showEmpty('Chọn một cuộc trò chuyện', 'Tin nhắn riêng và kênh chat của các group bạn tham gia ở bên trái. Tin mới tự hiện khi trang đang mở.');
});
$('tv-refresh').addEventListener('click', loadThreads);
for (const b of document.querySelectorAll('#tv-filters button')) {
  b.addEventListener('click', () => {
    if (S.tlistFilter === b.dataset.f) return;
    S.tlistFilter = b.dataset.f;
    renderThreads();
    loadThreads();
  });
}
$('back').addEventListener('click', () => {
  S.sel = null;
  $('app').classList.remove('open');
  history.replaceState(null, '', location.href.split('#')[0]);
  renderList();
});
$('q').addEventListener('input', () => {
  S.q = $('q').value.trim();
  renderList();
});
// Enter ở ô tìm cuộc trò chuyện: tìm chữ đó trong tin nhắn ở mọi nơi
$('q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || $('q').value.trim().length < 2) return;
  e.preventDefault();
  if (!S.sel) $('app').classList.add('open');
  openSearch($('q').value.trim(), 'all');
});
$('btn-search').addEventListener('click', () => ($('search').hidden ? openSearch('', 'channel') : closeSearch()));
$('s-close').addEventListener('click', closeSearch);
$('s-form').addEventListener('submit', (e) => (e.preventDefault(), runSearch()));
$('s-q').addEventListener('keydown', (e) => e.key === 'Escape' && (e.preventDefault(), closeSearch()));
for (const b of document.querySelectorAll('#s-scope button')) {
  b.addEventListener('click', () => {
    S.sScope = b.dataset.s;
    renderSearchScope();
    if ($('s-q').value.trim().length >= 2) runSearch();
  });
}
document.addEventListener('mousedown', (e) => {
  if (!$('react-pop').hidden && !e.target.closest?.('#react-pop, .rc.add, .tools button')) closeReactPop();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeReactPop());
for (const b of document.querySelectorAll('#filters button')) {
  b.addEventListener('click', () => {
    S.filter = b.dataset.f;
    renderList();
  });
}
$('btn-enable').addEventListener('click', async () => {
  if ($('btn-enable').dataset.mode === 'web') return window.open(BG.SITE + '/chat-home', '_blank');
  let granted = false;
  try {
    granted = (await chrome.permissions.contains({ origins: [BG.CHAT_ORIGIN] })) || (await chrome.permissions.request({ origins: [BG.CHAT_ORIGIN] }));
  } catch {}
  if (!granted) return toast('Cần cho phép addon kết nối chat.beincom.com', 'err');
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...BG.DEFAULT_SETTINGS, ...settings, chatEnabled: true } }); // trang đọc lại khi cài đặt đổi
});
window.addEventListener('focus', () => {
  if (S.sel) markRead();
  pollChat();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    pollChat();
    loadOverview({ quiet: true });
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.chatReplies) RP.list = BG.chatRepliesOf(changes.chatReplies.newValue);
  if (area !== 'local' || !changes.settings) return;
  const on = !!changes.settings.newValue?.chatEnabled;
  if (on === S.on) return;
  if (!on) {
    S.sel = null;
    $('app').classList.remove('open');
  }
  loadOverview();
});

async function start() {
  initSide();
  loadReplies();
  warmEmojiCache();
  const want = new URLSearchParams(location.hash.slice(1)).get('c');
  // Tin của cuộc trò chuyện trong địa chỉ: đọc song song với danh sách
  if (want && /^\w+$/.test(want)) fetchConv(want);
  let cached = null;
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings?.chatEnabled) cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || null;
  } catch {}
  if (cached) {
    applyOverview(cached);
    afterOverview();
  } else renderList(); // khung chờ
  const r = await loadOverview({ quiet: !!cached, quick: true });
  // Đọc nhanh xong thì đọc đủ (tên mọi tin nhắn riêng, quyền vai trò) mà không chặn trang
  if (r?.status === 'ok' && r.quick) loadOverview({ quiet: true });
}

setInterval(pollChat, POLL_MS);
setInterval(() => !document.hidden && loadOverview({ quiet: true }), LIST_MS);
start();
