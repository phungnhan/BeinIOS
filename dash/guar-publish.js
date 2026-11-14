// Publishing opt-in is independent of the older read-only image connection.
(() => {
  const ids = ['guar-publish-save', 'guar-publish-poll', 'guar-publish-disconnect'];
  const status = document.getElementById('guar-publish-status');
  const url = document.getElementById('guar-publish-url');
  const token = document.getElementById('guar-publish-token');
  const enabled = document.getElementById('guar-publish-enabled');
  let busy = false;
  document.getElementById('guar-publish-origin').textContent = location.origin;
  const say = (message, bad = false) => {
    status.textContent = message;
    status.className = 'small ' + (bad ? 'err-text' : 'muted');
  };
  async function read() {
    const r = await chrome.runtime.sendMessage({ type: 'guarPublishStatus' });
    if (r?.status !== 'ok') return say(r?.message || 'Chưa đọc được kết nối.', true);
    if (document.activeElement !== url) url.value = r.config.url;
    enabled.checked = r.config.enabled;
    token.placeholder = r.config.has_token ? 'Đã lưu mã · để trống để giữ nguyên' : 'Dán mã ghép nối từ Guar Studio';
    say(r.config.enabled ? r.worker?.message || 'Đang bật. Kiểm tra hàng đợi để đồng bộ nhóm.' : 'Đăng tự động đang tắt.', r.config.enabled && r.worker?.status === 'error');
  }
  async function act(action) {
    if (busy) return;
    busy = true;
    for (const id of ids) document.getElementById(id).disabled = true;
    try {
      let message;
      if (action === 'save') {
        let base;
        try { base = new URL(url.value.trim()); } catch { return say('Địa chỉ Guar Studio không hợp lệ.', true); }
        if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.hash || base.search) return say('Dùng địa chỉ Guar Studio trên máy này, không có đường dẫn phía sau.', true);
        // Permission request stays in the direct button gesture, before other awaits.
        if (enabled.checked && !(await chrome.permissions.request({ origins: [base.protocol + '//' + base.hostname + '/*'] }))) return say('Chưa được cấp quyền truy cập Guar Studio.', true);
        message = { type: 'guarPublishSave', config: { url: base.origin, enabled: enabled.checked, token: token.value.trim() } };
      } else message = { type: action === 'poll' ? 'guarPublishPoll' : 'guarPublishDisconnect' };
      say(action === 'poll' ? 'Đang đối chiếu tài khoản và hàng đợi…' : 'Đang lưu…');
      const r = await chrome.runtime.sendMessage(message);
      token.value = '';
      if (r?.status !== 'ok') return say(r?.message || 'Chưa hoàn tất thao tác.', true);
      await read();
      if (r.message) say(r.message);
    } catch { say('Kết nối bị gián đoạn; thử đọc lại trạng thái. Không tạo bài mới.', true); }
    finally {
      busy = false;
      for (const id of ids) document.getElementById(id).disabled = false;
    }
  }
  document.getElementById('guar-publish-save').addEventListener('click', () => act('save'));
  document.getElementById('guar-publish-poll').addEventListener('click', () => act('poll'));
  document.getElementById('guar-publish-disconnect').addEventListener('click', () => act('disconnect'));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.guarPublishStatus && !busy) say(changes.guarPublishStatus.newValue?.message || '', changes.guarPublishStatus.newValue?.status === 'error');
  });
  read().catch(() => say('Chưa đọc được trạng thái kết nối.', true));
})();
