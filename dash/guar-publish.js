// Kết nối Guar Studio (Cài đặt › Tích hợp › Guar Studio): một lần ghép nối dùng cho cả Nhận bài đăng (bg/guar-publish.js) và
// Ảnh từ Guar Studio (dash/guar.js — guarImagesProbe thử cổng ảnh sau mỗi lần Lưu kết nối / Kiểm tra / Ngắt kết nối).
(() => {
  const ids = ['guar-publish-save', 'guar-publish-poll', 'guar-publish-disconnect'];
  const status = document.getElementById('guar-publish-status');
  const url = document.getElementById('guar-publish-url');
  const token = document.getElementById('guar-publish-token');
  const enabled = document.getElementById('guar-publish-enabled');
  let busy = false;
  let hasToken = false;
  document.getElementById('guar-publish-origin').textContent = location.origin;
  document.getElementById('guar-publish-copy').addEventListener('click', () => arCopy(location.origin).then((ok) => toast(ok ? 'Đã chép Mã của BeinFusion — dán vào Guar Studio › Cài đặt › Beincom qua BeinFusion.' : 'Không chép được — bôi đen mã rồi chép tay.', ok ? 'ok' : 'err')));
  const say = (message, bad = false) => {
    status.textContent = message;
    status.className = 'small ' + (bad ? 'err-text' : 'muted');
  };
  async function read() {
    const r = await chrome.runtime.sendMessage({ type: 'guarPublishStatus' });
    if (r?.status !== 'ok') return say(r?.message || 'Chưa đọc được kết nối.', true);
    if (document.activeElement !== url) url.value = r.config.url || (typeof GS === 'object' && GS.cfg.url) || 'http://127.0.0.1:9191';
    enabled.checked = r.config.enabled;
    hasToken = !!r.config.has_token;
    token.placeholder = hasToken ? 'Đã lưu mã · để trống để giữ nguyên, dán mã mới để thay' : 'Dán mã ghép nối từ Guar Studio';
    say(!hasToken ? 'Chưa nối — dán mã ghép nối rồi Lưu kết nối.' : r.config.enabled ? r.worker?.message || 'Đang nhận bài. Bấm Kiểm tra để đồng bộ nhóm.' : 'Đã nối — chưa bật nhận bài.', r.config.enabled && r.worker?.status === 'error');
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
        // Xin quyền ngay trong lúc bấm (trước mọi lần chờ khác); có mã ghép nối là cần, kể cả chỉ dùng phần ảnh
        if ((enabled.checked || token.value.trim() || hasToken) && !(await chrome.permissions.request({ origins: [base.protocol + '//' + base.hostname + '/*'] }))) return say('Chưa được cấp quyền truy cập Guar Studio.', true);
        message = { type: 'guarPublishSave', config: { url: base.origin, enabled: enabled.checked, token: token.value.trim() } };
      } else message = { type: action === 'poll' ? 'guarPublishPoll' : 'guarPublishDisconnect' };
      say(action === 'poll' ? 'Đang đối chiếu tài khoản và hàng đợi…' : 'Đang lưu…');
      const r = await chrome.runtime.sendMessage(message);
      token.value = '';
      if (r?.status !== 'ok') {
        if (action !== 'save' && typeof guarImagesProbe === 'function') await guarImagesProbe();
        return say(r?.message || 'Chưa hoàn tất thao tác.', true);
      }
      await read();
      if (r.message) say(r.message);
      if (typeof guarImagesProbe === 'function') await guarImagesProbe(); // dash/guar.js: cổng ảnh dùng chung mã ghép nối
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
