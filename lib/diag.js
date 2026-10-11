// BeinGroup — lỗi kỹ thuật, tự kiểm tra.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  // ---------- Lỗi kỹ thuật ----------
  // Lỗi JavaScript (service worker, Dashboard, popup) và lỗi Beincom trả về khi gọi API, để người dùng sao chép gửi hỗ trợ.
  // Không ghi nội dung bài, body gửi đi, mật khẩu hay token; lỗi giống nhau trong 30 phút gộp thành một dòng (×N).
  const DIAG_MAX = 200;
  const DIAG_MERGE_MS = 30 * 60e3;
  const DIAG_WHERE = { sw: 'Nền (service worker)', dashboard: 'Dashboard', popup: 'Cửa sổ nhỏ' };
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const scrubSecret = (s) =>
    String(s ?? '')
      .replace(/bot\d{5,}:[\w-]{20,}/g, 'bot***')
      .replace(/\b(token|key|secret|password|pass)=[^&\s]*/gi, '$1=***');
  const shortStack = (s) =>
    scrubSecret(s)
      .replace(/chrome-extension:\/\/[a-p]{32}\//g, '')
      .replace(/file:\/\/\/[^\s)]*?\/BeinGroup\//g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join('\n')
      .slice(0, 800);

  // Làm sạch một lỗi (cả lỗi Dashboard gửi sang)
  function cleanDiag(e = {}) {
    const out = {
      where: DIAG_WHERE[e.where] ? e.where : 'sw',
      kind: e.kind === 'api' ? 'api' : 'js',
      message: scrubSecret(e.message).slice(0, 500) || '(không có mô tả)',
    };
    if (out.kind === 'api') {
      out.method = String(e.method || '').toUpperCase().slice(0, 8);
      out.path = scrubSecret(e.path).slice(0, 300);
      out.status = Number(e.status) || 0;
      out.code = String(e.code || '').slice(0, 80);
    } else if (e.stack) out.stack = shortStack(e.stack);
    return out;
  }

  // Khoá gộp: cùng nơi, loại, API (bỏ id), mã, nội dung
  function diagKey(e) {
    // Bỏ phần định danh (đoạn có chữ số, UUID) để cùng một API với bài khác nhau vẫn gộp
    const path = String(e.path || '')
      .split('?')[0]
      .replace(UUID_RE, ':id')
      .split('/')
      .map((seg) => (/\d/.test(seg) ? ':id' : seg))
      .join('/');
    return [e.where, e.kind, e.method || '', path, e.status ?? '', e.code || '', String(e.message).slice(0, 160)].join('|');
  }

  function pushDiag(list, entry, now = Date.now()) {
    const e = cleanDiag(entry);
    const key = diagKey(e);
    const cur = list || [];
    const i = cur.findIndex((x) => x.key === key && now - x.time < DIAG_MERGE_MS);
    if (i >= 0) return [{ ...cur[i], time: now, count: (cur[i].count || 1) + 1 }, ...cur.filter((_, k) => k !== i)].slice(0, DIAG_MAX);
    return [{ ...e, key, time: now, first: now, count: 1 }, ...cur].slice(0, DIAG_MAX);
  }

  const vnTime = (t) => {
    const d = new Date(t + 7 * 3600e3);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
  };

  function diagLine(e) {
    const what = e.kind === 'api' ? `${e.method} ${e.path} → ${e.status || 'không kết nối'}${e.code ? ' ' + e.code : ''}: ${e.message}` : e.message;
    return `${vnTime(e.time)} [${e.where} · ${e.kind === 'api' ? 'API' : 'JS'}] ${what}${e.count > 1 ? ` (×${e.count}, lần đầu ${vnTime(e.first)})` : ''}${e.stack ? '\n    ' + e.stack.replace(/\n/g, '\n    ') : ''}`;
  }

  // Báo cáo để dán cho người hỗ trợ
  function diagText(list, { version = '', ua = '', now = Date.now() } = {}) {
    const browser = (String(ua).match(/(Edg|Chrome)\/[\d.]+/) || [''])[0];
    return [`BeinGroup v${version} · ${browser || 'trình duyệt không rõ'} · ${vnTime(now)} (giờ VN) · ${list.length} lỗi`, ...list.map(diagLine)].join('\n');
  }

  // ---------- Tự kiểm tra ----------
  // Bản chữ kết quả (bg/selfcheck.js) để gửi người hỗ trợ: mỗi mục một dòng; mục lỗi kèm mã HTTP và đường dẫn API (không kèm query)
  const CHECK_MARK = { ok: '✓', skip: '–', fail: '✗' };
  function selfCheckText(r, { version = '', ua = '' } = {}) {
    const browser = (String(ua).match(/(Edg|Chrome)\/[\d.]+/) || [''])[0];
    const s = r.summary || {};
    return [
      `BeinGroup v${version} · ${browser || 'trình duyệt không rõ'} · tự kiểm tra ${r.group?.name || ''} lúc ${vnTime(r.at)} (giờ VN)${r.mode === 'tab' ? ' · gọi qua tab Beincom' : ''}`,
      `${s.ok || 0} dùng được · ${s.skip || 0} bỏ qua · ${s.fail || 0} lỗi`,
      ...(r.items || []).map((x) => `${CHECK_MARK[x.status] || '?'} ${x.label}${x.detail ? ': ' + x.detail : ''}${x.status === 'fail' && x.path ? ` [${x.httpStatus || 0} ${x.path}]` : ''}`),
    ].join('\n');
  }

  // Mục lần trước dùng được mà lần này lỗi (prev: items lần trước, chỉ cần { id, status })
  function selfCheckRegressions(prev, items) {
    const before = new Map((prev || []).map((x) => [x.id, x.status]));
    return (items || []).filter((x) => x.status === 'fail' && before.get(x.id) === 'ok');
  }

  Object.assign(BG, {
    selfCheckText,
    selfCheckRegressions,
    DIAG_WHERE,
    cleanDiag,
    pushDiag,
    diagLine,
    diagText,
  });
});
