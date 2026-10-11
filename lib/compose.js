// BeinGroup — đăng bài: kiểm tra và body, đính kèm, tag / series, bài định kỳ, giờ đăng tốt nhất, lịch, nhập CSV, sửa bài, xem trước markdown.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { norm, httpsUrl, MENTION_ALL, MENTION_TAIL, slimLinkPreview, usedMentions } = BG;

  // ---------- Đăng bài ----------

  const POST_MAX = 3000; // Beincom giới hạn 3000 ký tự mỗi bài
  const MIN_SCHEDULE_MIN = 5; // hẹn giờ ít nhất 5 phút sau

  const DEFAULT_POST_SETTING = { canComment: true, canReact: true, isImportant: false, importantExpiredAt: null };

  const CONTENT_STATUS = {
    DRAFT: 'Bản nháp',
    PROCESSING: 'Đang xử lý',
    PUBLISHED: 'Đã đăng',
    WAITING_SCHEDULE: 'Chờ tới giờ đăng',
    SCHEDULE_FAILED: 'Hẹn giờ lỗi',
    WAITING_SCAN: 'Đang kiểm duyệt tự động',
    SCAN_REJECTED: 'Bị kiểm duyệt tự động chặn',
  };

  // Kiểm tra trước khi đăng; trả về câu báo lỗi hoặc '' nếu được
  function validateCompose({ groupIds, content, scheduledAt, setting, media, tags, series, asGroup = false }, now = Date.now()) {
    if (!groupIds?.length) return 'Chưa chọn group để đăng';
    if (asGroup && groupIds.length !== 1) return 'Đăng dưới tên group: chỉ chọn một group';
    const text = String(content || '').trim();
    const kinds = Object.keys(MEDIA).filter((k) => media?.[MEDIA_FIELD[k]]?.length);
    if (!text && !kinds.length) return 'Bài chưa có nội dung';
    if (kinds.length > 1) return 'Mỗi bài chỉ đính kèm một loại: ảnh, video hoặc tệp';
    for (const k of kinds) if (media[MEDIA_FIELD[k]].length > MEDIA[k].max) return `Tối đa ${MEDIA[k].max} ${MEDIA[k].label} mỗi bài`;
    if ((tags?.length || 0) > TAG_MAX) return `Tối đa ${TAG_MAX} tag mỗi bài`;
    if ((series?.length || 0) > SERIES_MAX) return `Tối đa ${SERIES_MAX} series mỗi bài`;
    if (text.length > POST_MAX) return `Bài dài ${text.length} ký tự, Beincom chỉ cho tối đa ${POST_MAX}`;
    if (scheduledAt) {
      const t = new Date(scheduledAt).getTime();
      if (!Number.isFinite(t)) return 'Giờ hẹn không hợp lệ';
      if (t < now + MIN_SCHEDULE_MIN * 60e3) return `Giờ hẹn phải sau bây giờ ít nhất ${MIN_SCHEDULE_MIN} phút`;
    }
    // importantExpiredAt = null: Quan trọng không hết hạn
    if (setting?.isImportant && setting.importantExpiredAt !== null) {
      const t = new Date(setting.importantExpiredAt).getTime();
      if (!Number.isFinite(t) || t <= (scheduledAt ? new Date(scheduledAt).getTime() : now)) return 'Ngày hết "Quan trọng" phải sau lúc bài được đăng';
    }
    return '';
  }

  // Body cho PUT content/posts/{id}/publish | schedule (giống web gửi)
  // mentions: { username: {...} } đã lọc theo nội dung; linkPreview: chỉ gửi khi bài không có ảnh / video / tệp (web chỉ hiện lúc đó)
  // tags / series: [{ id, … }] hoặc [id]; body chỉ gửi id (giống web)
  function composeBody({ groupIds, content, setting, scheduledAt, media, mentions, linkPreview, tags, series }) {
    const s = { ...DEFAULT_POST_SETTING, ...setting };
    const body = {
      audience: { groupIds: [...groupIds], userIds: [] },
      content: String(content || '').trim(),
      media: { images: [...(media?.images || [])], videos: [...(media?.videos || [])], files: [...(media?.files || [])] },
      setting: { canComment: !!s.canComment, canReact: !!s.canReact, isImportant: !!s.isImportant, importantExpiredAt: s.isImportant && s.importantExpiredAt ? new Date(s.importantExpiredAt).toISOString() : null },
      mentions: usedMentions(content, mentions),
      tags: (tags || []).map((x) => x?.id ?? x).filter(Boolean),
      series: (series || []).map((x) => x?.id ?? x).filter(Boolean),
    };
    const hasMedia = body.media.images.length + body.media.videos.length + body.media.files.length > 0;
    const lp = slimLinkPreview(linkPreview);
    if (lp && !hasMedia) body.linkPreview = lp;
    if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();
    return body;
  }

  // ---------- Ảnh, video, tệp đính kèm (giới hạn giống web Beincom) ----------
  const MB = 1024 * 1024;
  const MEDIA = {
    image: {
      label: 'ảnh',
      max: 10,
      size: 25 * MB,
      types: ['image/bmp', 'image/x-ms-bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/heic', 'image/heif', 'image/heif-sequence', 'image/heic-sequence', 'image/avif', 'image/avif-sequence', 'image/webp'],
    },
    video: { label: 'video', max: 1, size: 300 * MB, prefix: 'video/' },
    file: { label: 'tệp', max: 25, size: 5 * MB, exts: ['pdf', 'doc', 'docx', 'htm', 'html', 'odt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'txt', 'zip', 'csv'] },
  };
  const MEDIA_FIELD = { image: 'images', video: 'videos', file: 'files' };

  function sizeText(n) {
    return n < MB ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  }

  // Lọc file vừa chọn: đúng loại, không quá dung lượng, không quá số lượng. current = { image: số đã có, ... }.
  // Một bài chỉ đính kèm một loại (ảnh, video hoặc tệp), giống web.
  function pickMedia(kind, files, current = {}) {
    const rule = MEDIA[kind];
    const other = Object.keys(MEDIA).find((k) => k !== kind && current[k] > 0);
    if (other) return { accepted: [], errors: [`Bài đang có ${MEDIA[other].label}: mỗi bài chỉ đính kèm một loại (ảnh, video hoặc tệp)`] };
    const accepted = [];
    const errors = [];
    let count = current[kind] || 0;
    for (const f of files) {
      const ext = String(f.name || '').split('.').pop().toLowerCase();
      const type = String(f.type || '');
      const okType = rule.types ? rule.types.includes(type) : rule.prefix ? type.startsWith(rule.prefix) : rule.exts.includes(ext);
      if (!okType) errors.push(`${f.name}: Beincom không nhận loại ${rule.label} này`);
      else if (f.size > rule.size) errors.push(`${f.name}: ${sizeText(f.size)}, tối đa ${sizeText(rule.size)}`);
      else if (count >= rule.max) {
        errors.push(`Tối đa ${rule.max} ${rule.label} mỗi bài`);
        break;
      } else {
        accepted.push(f);
        count += 1;
      }
    }
    return { accepted, errors };
  }

  // "3 ảnh" / "1 video" / "2 tệp" / ''
  function mediaSummary(media) {
    return Object.entries(MEDIA_FIELD)
      .map(([k, f]) => (media?.[f]?.length ? `${media[f].length} ${MEDIA[k].label}` : ''))
      .filter(Boolean)
      .join(', ');
  }

  const camelKey = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // Đối tượng đính kèm gửi trong media của bài, giống web dựng sau khi tải lên:
  //  - ảnh:  { url, id, ...properties }
  //  - video: { id, url, ...properties, status: 'waiting_process', thumbnails }
  //  - tệp:  { id, url, ...properties } (web đổi khoá sang camelCase)
  function mediaItem(kind, id, d = {}) {
    if (kind === 'image') return { url: d.url, id, ...(d.properties || {}) };
    if (kind === 'video') return { id, url: d.url, ...(d.properties || {}), status: 'waiting_process', thumbnails: d.thumbnails };
    const props = Object.fromEntries(Object.entries(d.properties || {}).map(([k, v]) => [camelKey(k), v]));
    return { id: d.id || id, url: d.origin_url || d.originUrl || d.url || '', ...props };
  }

  // ---------- Tag và series (giới hạn như web: 5 tag, 3 series mỗi bài) ----------
  const TAG_MAX = 5;
  const SERIES_MAX = 3;

  // GET content/tags?groupIds[]=… : tag của community (theo group gốc)
  function slimTag(t) {
    return { id: t.id, name: t.name || '', totalUsed: t.totalUsed ?? null };
  }

  // GET content/series?groupIds[]=… : series có các group đó trong phạm vi
  function slimSeries(x) {
    return { id: x.id, title: x.title || '', cover: httpsUrl(x.coverMedia?.url), summary: String(x.summary || '').slice(0, 160) };
  }

  // Câu báo khi Beincom trả tag_series_invalid: meta.errors = { seriesIds, tagIds }
  function tagSeriesError(body, tags = [], series = []) {
    const e = body?.meta?.errors || {};
    const names = (list, ids, f) => (ids || []).map((id) => list.find((x) => x.id === id)?.[f] || id);
    const parts = [];
    const s = names(series, e.seriesIds, 'title');
    const t = names(tags, e.tagIds || e.tagsIds, 'name');
    if (s.length) parts.push('series ' + s.join(', '));
    if (t.length) parts.push('tag ' + t.join(', '));
    return `${parts.length ? parts.join('; ') : 'Tag / series'} không dùng được với các group đã chọn — bỏ ra rồi đăng lại`;
  }

  // Hạn "Quan trọng" giống web Beincom, tính từ lúc bài được đăng
  const IMPORTANT_FOR = {
    never: 'Không hết hạn',
    '1d': '1 ngày',
    '3d': '3 ngày',
    '1w': '1 tuần',
    '2w': '2 tuần',
    '1m': '1 tháng',
    '3m': '3 tháng',
    '6m': '6 tháng',
    '1y': '1 năm',
    custom: 'Tự chọn ngày giờ',
  };

  // Ngày hết "Quan trọng" (ISO) theo hạn đã chọn; null = không hết hạn; tự chọn thì do người dùng nhập
  function importantUntil(preset, base) {
    if (preset === 'never') return null;
    const d = new Date(base);
    const days = { '1d': 1, '3d': 3, '1w': 7, '2w': 14 }[preset];
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[preset];
    if (days) d.setDate(d.getDate() + days);
    else if (months) {
      // 31/01 + 1 tháng = 28 hoặc 29/02, không nhảy sang tháng 3
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + months);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else return undefined;
    return d.toISOString();
  }

  // ---------- Bài đăng định kỳ ----------
  // Đặt trước nhiều bài hẹn giờ cách đều nhau (tới giờ Beincom tự đăng, không cần mở máy)
  const RECUR_EVERY = { day: 'Hằng ngày', week: 'Hằng tuần', '2w': '2 tuần một lần', month: 'Hằng tháng' };
  const RECUR_MIN = 2;
  const RECUR_MAX = 30;

  // Giờ đăng của từng bài trong chuỗi (giữ nguyên giờ trong ngày; 31/01 hằng tháng -> 28 hoặc 29/02, 31/03…)
  function recurTimes(start, every, count) {
    const t0 = new Date(start);
    if (!Number.isFinite(t0.getTime()) || !RECUR_EVERY[every]) return [];
    const n = Math.max(1, Math.min(RECUR_MAX, Math.floor(Number(count)) || 1));
    const out = [];
    for (let k = 0; k < n; k++) {
      const d = new Date(t0);
      if (every === 'month') {
        d.setDate(1);
        d.setMonth(t0.getMonth() + k);
        d.setDate(Math.min(t0.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      } else d.setDate(t0.getDate() + k * { day: 1, week: 7, '2w': 14 }[every]);
      out.push(d.toISOString());
    }
    return out;
  }

  // Cài đặt của từng bài: hạn "Quan trọng" tính lại theo giờ đăng của bài đó
  // (chọn sẵn "1 tuần"… thì tính từ giờ đăng; tự chọn ngày giờ thì dời theo khoảng cách tới bài đầu)
  function recurSetting(setting, preset, firstAt, at) {
    if (!setting?.isImportant || !setting.importantExpiredAt) return { ...setting };
    const expiredAt = preset && preset !== 'custom' ? importantUntil(preset, at) : new Date(new Date(setting.importantExpiredAt).getTime() + (new Date(at) - new Date(firstAt))).toISOString();
    return { ...setting, importantExpiredAt: expiredAt };
  }

  // Bài thuộc chuỗi nào: contentId -> { id, k (thứ tự, từ 1), n, every }
  function recurIndex(recurring) {
    const map = new Map();
    for (const r of recurring || []) (r.items || []).forEach((it, i) => map.set(it.contentId, { id: r.id, k: i + 1, n: r.count || r.items.length, every: r.every }));
    return map;
  }

  // Bỏ chuỗi đã đăng hết từ hơn 7 ngày trước; giữ tối đa 50 chuỗi
  function pruneRecurring(recurring, now = Date.now()) {
    return (recurring || [])
      .filter((r) => (r.items || []).some((it) => new Date(it.scheduledAt).getTime() > now - 7 * 864e5))
      .slice(0, 50);
  }

  // ---------- Giờ đăng tốt nhất ----------
  // Tương tác của một bài = cảm xúc + 2 × bình luận. Gom theo thứ trong tuần × giờ (giờ Việt Nam).
  // Ô ít bài được kéo về mức trung bình chung (điểm = (tổng + k × trung bình) / (số bài + k)) để một bài may mắn không lấn át.
  const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const BEST_SHRINK = 2;

  const vnParts = (t) => {
    const d = new Date(t + 7 * 3600e3);
    return { day: d.getUTCDay(), hour: d.getUTCHours() };
  };

  function bestTimes(posts, { top = 3 } = {}) {
    const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ posts: 0, eng: 0 })));
    let total = 0;
    let sum = 0;
    for (const p of posts || []) {
      const t = Date.parse(p.publishedAt);
      if (!Number.isFinite(t)) continue;
      const { day, hour } = vnParts(t);
      const e = (p.reactions || 0) + 2 * (p.commentsCount || 0);
      cells[day][hour].posts++;
      cells[day][hour].eng += e;
      total++;
      sum += e;
    }
    const mean = total ? sum / total : 0;
    const score = (c) => (c.eng + BEST_SHRINK * mean) / (c.posts + BEST_SHRINK);
    const grid = cells.map((row, day) => row.map((c, hour) => ({ day, hour, posts: c.posts, avg: c.posts ? c.eng / c.posts : 0, score: c.posts ? score(c) : 0 })));
    const flat = grid.flat().filter((c) => c.posts);
    const max = flat.reduce((m, c) => Math.max(m, c.score), 0);
    // Gợi ý: điểm cao nhất, mỗi ngày tối đa một khung giờ để trải đều trong tuần
    const picks = [];
    for (const c of [...flat].sort((a, b) => b.score - a.score || b.posts - a.posts)) {
      if (picks.length >= top) break;
      if (picks.some((x) => x.day === c.day)) continue;
      picks.push(c);
    }
    const byHour = Array.from({ length: 24 }, (_, h) => {
      const list = grid.map((row) => row[h]).filter((c) => c.posts);
      const n = list.reduce((s, c) => s + c.posts, 0);
      return n ? list.reduce((s, c) => s + c.avg * c.posts, 0) / n : 0;
    });
    return { grid, max, mean, total, top: picks, byHour };
  }

  // Giờ tốt nhất của từng thứ trong tuần (0 = CN) theo bảng của bestTimes; null nếu ngày đó chưa có bài
  function dayBestHours(b) {
    return (b?.grid || []).map((row) => row.reduce((best, c) => (c.posts && (!best || c.score > best.score) ? c : best), null)?.hour ?? null);
  }

  // Lần tới (sau `now` ít nhất `minMinutes` phút) rơi vào thứ `day`, `hour` giờ đúng (giờ Việt Nam) -> ISO
  function nextSlot(day, hour, now = Date.now(), minMinutes = MIN_SCHEDULE_MIN + 5) {
    const vn = new Date(now + 7 * 3600e3);
    for (let i = 0; i <= 7; i++) {
      const d = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + i, hour, 0, 0) - 7 * 3600e3);
      if (vnParts(d.getTime()).day === day && d.getTime() >= now + minMinutes * 60e3) return d.toISOString();
    }
    return null;
  }

  // ---------- Lịch nội dung ----------
  // Lưới tháng (Thứ Hai đầu tuần) theo ngày Việt Nam: mảng tuần, mỗi tuần 7 ô { key: 'YYYY-MM-DD', day, inMonth }
  function monthGrid(year, month) {
    const first = new Date(Date.UTC(year, month, 1));
    const lead = (first.getUTCDay() + 6) % 7; // số ô trước ngày 1 (Thứ Hai = 0)
    const start = Date.UTC(year, month, 1 - lead);
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const weeks = Math.ceil((lead + days) / 7);
    return Array.from({ length: weeks }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const t = new Date(start + (w * 7 + d) * 864e5);
        return { key: t.toISOString().slice(0, 10), day: t.getUTCDate(), inMonth: t.getUTCMonth() === month };
      }),
    );
  }

  // ---------- Nhập nhiều bài từ CSV ----------
  const CSV_MAX_ROWS = 100;

  // Đọc CSV (dấu phẩy hoặc chấm phẩy — Excel tiếng Việt hay dùng chấm phẩy), có ngoặc kép, xuống dòng trong ô, BOM
  function parseCsv(text) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const firstLine = src.split(/\r?\n/)[0] || '';
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') quoted = true;
      else if (ch === delim) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  }

  const CSV_COLUMNS = {
    content: ['noi dung', 'noi_dung', 'content', 'bai', 'bai viet', 'text'],
    group: ['group', 'groups', 'nhom', 'dang vao'],
    time: ['gio dang', 'gio_dang', 'thoi gian', 'thoi_gian', 'ngay gio', 'time', 'scheduled', 'scheduledat'],
    important: ['quan trong', 'quan_trong', 'important'],
    noComment: ['tat binh luan', 'tat_binh_luan', 'khong binh luan'],
  };
  const yes = (v) => /^(co|x|yes|true|1|bat)$/i.test(norm(v).trim());

  // Giờ đăng theo giờ Việt Nam: dd/mm/yyyy HH:mm, yyyy-mm-dd HH:mm, yyyy-mm-ddTHH:mm; có Z / +07:00 thì đọc nguyên
  function parseVnTime(s) {
    const v = String(s || '').trim();
    // Ngày giờ không có thật (31/02, 25:00) -> NaN thay vì để Date tự cộng dồn
    const vn = (y, mo, d, h, mi) => {
      const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
      return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === h && mi < 60 ? t.getTime() - 7 * 3600e3 : NaN;
    };
    let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[ T]+(\d{1,2})[:h](\d{2})(?::\d{2})?$/i);
    if (m) return vn(+m[3], +m[2], +m[1], +m[4], +m[5]);
    m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return vn(+m[1], +m[2], +m[3], +m[4], +m[5]);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) return Date.parse(v);
    return NaN;
  }

  // Tên group để so khớp: bỏ dấu, chữ thường; "Community › Group", "Community > Group", "Community / Group" như nhau
  const groupKey = (s) => norm(s).replace(/\s*[›>/]\s*/g, ' > ').replace(/\s+/g, ' ');

  // Dòng CSV -> bài hẹn giờ (kèm lỗi từng dòng). groups: group đang quản trị { id, name, path? }
  // Ô group: tên, "Community > Group" hoặc id; nhiều group cách nhau ; hoặc |
  function csvPosts(rows, { groups = [], now = Date.now() } = {}) {
    if (!rows.length) return { posts: [], error: 'Tệp trống' };
    const head = rows[0].map((h) => norm(h).replace(/\s+/g, ' ').trim());
    const col = Object.fromEntries(Object.entries(CSV_COLUMNS).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))]));
    if (col.content < 0 || col.group < 0 || col.time < 0) return { posts: [], error: 'Thiếu cột: cần có noi_dung, group, gio_dang (xem tệp mẫu)' };
    const byKey = new Map(); // khoá -> các group khớp (tên trùng nhau ở nhiều community)
    const add = (k, g) => {
      if (!k) return;
      const list = byKey.get(k) || [];
      if (!list.includes(g)) list.push(g);
      byKey.set(k, list);
    };
    for (const g of groups) {
      add(g.id, g);
      add(groupKey(g.name), g);
      if (g.path) add(groupKey(g.path), g);
    }
    const body = rows.slice(1);
    const posts = body.slice(0, CSV_MAX_ROWS).map((r, i) => {
      const errors = [];
      const content = String(r[col.content] ?? '').trim();
      if (!content) errors.push('Thiếu nội dung');
      else if (content.length > POST_MAX) errors.push(`Dài ${content.length} ký tự (tối đa ${POST_MAX})`);
      const names = String(r[col.group] ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);
      const targets = [];
      for (const n of names) {
        const list = byKey.get(n) || byKey.get(groupKey(n)) || [];
        if (list.length === 1) targets.push(list[0]);
        else if (list.length > 1) errors.push(`Tên "${n}" trùng ${list.length} group — ghi kèm community (vd "Community > Group")`);
        else errors.push(`Không có group "${n}"`);
      }
      if (!names.length) errors.push('Thiếu group');
      const rawTime = String(r[col.time] ?? '').trim();
      const t = parseVnTime(rawTime);
      if (!rawTime) errors.push('Thiếu giờ đăng');
      else if (!Number.isFinite(t)) errors.push(`Giờ đăng "${rawTime}" không đọc được (vd 15/10/2026 20:00)`);
      else if (t < now + (MIN_SCHEDULE_MIN + 5) * 60e3) errors.push('Giờ đăng đã qua hoặc quá gần (cần sau bây giờ ít nhất 10 phút)');
      const important = col.important >= 0 && yes(r[col.important]);
      const noComment = col.noComment >= 0 && yes(r[col.noComment]);
      const post = {
        line: i + 2,
        content,
        groupIds: [...new Set(targets.map((g) => g.id))],
        groupNames: [...new Set(targets.map((g) => g.path || g.name))],
        scheduledAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
        setting: { canComment: !noComment, canReact: true, isImportant: important, importantExpiredAt: null },
        errors,
      };
      // Kiểm tra như khi bấm Đăng (cùng một hàm) để lỗi hiện ngay ở bản xem trước
      if (!errors.length) {
        const e = validateCompose(post, now);
        if (e) errors.push(e);
      }
      return post;
    });
    return { posts, error: '', truncated: body.length > CSV_MAX_ROWS ? body.length - CSV_MAX_ROWS : 0 };
  }

  // Tệp mẫu (có BOM để Excel đọc đúng tiếng Việt)
  function csvTemplate(groupNames = ['Tên group'], now = Date.now()) {
    const day = (d, h) => {
      const t = new Date(now + 7 * 3600e3 + d * 864e5);
      return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()} ${h}`;
    };
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    return '\uFEFF' + [
      'noi_dung,group,gio_dang,quan_trong,tat_binh_luan',
      [q('Chào cả nhà! Tối thứ 6 này có AMA, mọi người chuẩn bị câu hỏi nhé.'), q(groupNames[0]), day(1, '20:00'), 'không', 'không'].join(','),
      [q('Nhắc lịch họp admin hằng tuần.\nDòng thứ hai cũng được.'), q(groupNames.slice(0, 2).join('; ')), day(2, '09:00'), 'có', 'không'].join(','),
    ].join('\r\n') + '\r\n';
  }

  // ---------- Ghim, cài đặt bài, sửa bài đã đăng ----------
  const PIN_MAX = 5; // Beincom: tối đa 5 bài ghim mỗi group

  // Body PUT content/contents/{id}/setting
  function settingBody(setting) {
    const s = { ...DEFAULT_POST_SETTING, ...setting };
    return { canComment: !!s.canComment, canReact: !!s.canReact, isImportant: !!s.isImportant, importantExpiredAt: s.isImportant && s.importantExpiredAt ? new Date(s.importantExpiredAt).toISOString() : null };
  }

  // Body PUT content/posts/{id} khi sửa bài đã đăng: như khi đăng nhưng không có setting / scheduledAt (web đổi cài đặt bằng API riêng)
  function editBody(input) {
    const { setting, scheduledAt, ...body } = composeBody({ ...input, scheduledAt: null });
    // Không còn xem trước link: web gửi giá trị rỗng này để xoá thẻ cũ của bài
    if (!body.linkPreview) body.linkPreview = { domain: '', url: '' };
    return body;
  }

  // mentions của bài (theo username) -> dạng web giữ khi soạn
  function mentionEntries(mentions) {
    const out = {};
    for (const [key, u] of Object.entries(mentions || {})) {
      if (!u?.id) continue;
      const name = u.username || u.name || key;
      out[name] = { id: u.id, avatar: u.avatar || '', name, fullname: u.fullname || '', isVerified: !!(u.isVerified ?? u.is_verified) };
    }
    return out;
  }

  // Bài từ GET content/contents/{id} -> dữ liệu để mở lại trong khung soạn
  function editState(d) {
    const s = d.setting || {};
    return {
      id: d.id,
      status: d.status || '',
      actorId: d.actor?.id || '',
      groups: (d.audience?.groups || []).map((g) => ({ id: g.id, name: g.name || '' })),
      content: String(d.content || ''),
      media: { images: d.media?.images || [], videos: d.media?.videos || [], files: d.media?.files || [] },
      mentions: mentionEntries(d.mentions),
      linkPreview: slimLinkPreview(d.linkPreview),
      tags: (d.tags || []).map((t) => ({ id: t.id, name: t.name || '' })),
      series: (d.series || []).map((x) => ({ id: x.id, title: x.title || '' })),
      setting: { canComment: s.canComment !== false, canReact: s.canReact !== false, isImportant: !!s.isImportant, importantExpiredAt: s.importantExpiredAt || null },
      scheduledAt: d.scheduledAt || null,
    };
  }

  // ---------- Xem trước markdown ----------
  // Chỉ những gì trình soạn thảo Beincom xuất ra: **đậm**, _nghiêng_ / *nghiêng*, ~~gạch~~, `code`,
  // [chữ](link), tiêu đề #, > trích dẫn, - danh sách, 1. danh sách, ``` khối code, ---.
  // An toàn: mã hoá HTML trước, chỉ sinh thẻ đã biết, link chỉ nhận http(s).

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const MARK = String.fromCharCode(1); // giữ chỗ cho `code` khi xử lý các định dạng khác

  function inlineMdBase(s, mentions) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => {
      codes.push(c);
      return MARK + (codes.length - 1) + MARK;
    });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|\s)(https?:\/\/[^\s<"]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    // @username đã chọn từ danh sách nhắc tên
    if (mentions) s = s.replace(MENTION_ALL, (all, pre, name) => (mentions[name.replace(MENTION_TAIL, '')] ? `${pre}<span class="mention">@${name}</span>` : all));
    return s.replace(new RegExp(MARK + '(\\d+)' + MARK, 'g'), (_, i) => `<code>${codes[Number(i)]}</code>`);
  }

  // opts.mentions: tô màu các @username có trong bảng nhắc tên
  function renderMarkdown(md, opts = {}) {
    const inlineMd = (x) => inlineMdBase(x, opts.mentions);
    const lines = escapeHtml(String(md ?? '').replace(/\r\n?/g, '\n')).split('\n');
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
      para = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^```/.test(line)) {
        flush();
        const code = [];
        while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
        out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      } else if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
        flush();
        out.push(`<h4>${inlineMd(m[1])}</h4>`);
      } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        flush();
        out.push('<hr>');
      } else if (/^&gt;\s?/.test(line)) {
        flush();
        const q = [];
        for (; i < lines.length && /^&gt;\s?/.test(lines[i]); i++) q.push(inlineMd(lines[i].replace(/^&gt;\s?/, '')));
        i--;
        out.push(`<blockquote>${q.join('<br>')}</blockquote>`);
      } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flush();
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        const items = [];
        for (; i < lines.length && re.test(lines[i]); i++) items.push(`<li>${inlineMd(lines[i].replace(re, ''))}</li>`);
        i--;
        out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      } else if (!line.trim()) {
        flush();
      } else {
        para.push(line);
      }
    }
    flush();
    return out.join('');
  }

  Object.assign(BG, {
    POST_MAX,
    MIN_SCHEDULE_MIN,
    DEFAULT_POST_SETTING,
    CONTENT_STATUS,
    validateCompose,
    PIN_MAX,
    settingBody,
    editBody,
    mentionEntries,
    editState,
    TAG_MAX,
    SERIES_MAX,
    slimTag,
    slimSeries,
    tagSeriesError,
    MEDIA,
    MEDIA_FIELD,
    sizeText,
    pickMedia,
    mediaSummary,
    mediaItem,
    IMPORTANT_FOR,
    importantUntil,
    RECUR_EVERY,
    RECUR_MIN,
    RECUR_MAX,
    recurTimes,
    recurSetting,
    recurIndex,
    pruneRecurring,
    composeBody,
    monthGrid,
    CSV_MAX_ROWS,
    parseCsv,
    parseVnTime,
    csvPosts,
    csvTemplate,
    WEEKDAYS,
    WEEKDAY_NAMES,
    bestTimes,
    dayBestHours,
    nextSlot,
    escapeHtml,
    renderMarkdown,
  });
});
