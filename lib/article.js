// BeinGroup — Article và Series (Markdown → nội dung trình soạn thảo của Beincom).
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { MENTION_CHAR, MENTION_TAIL, escapeHtml, MIN_SCHEDULE_MIN, SERIES_MAX, TAG_MAX } = BG;

  // ---------- Article và Series ----------
  // Giống web Beincom: tiêu đề ≤ 64 ký tự, tóm tắt ≤ 255, nội dung ≤ 100.000 ký tự chữ; bắt buộc ảnh bìa và ít nhất một chuyên mục.
  // Nội dung Article là cây khối của trình soạn thảo (Plate/Slate) dạng JSON, không phải Markdown như bài thường:
  // p, h1–h3, blockquote, ul/ol > li > lic, hr, a { url }, media_embed { url } (video); chữ đậm / nghiêng… là thuộc tính của đoạn chữ.
  const ARTICLE_TITLE_MAX = 64;
  const ARTICLE_SUMMARY_MAX = 255;
  const ARTICLE_MAX = 100000;
  const SERIES_TITLE_MAX = 64;
  const SERIES_SUMMARY_MAX = 255;

  // Mỗi khối có id 21 ký tự như web (nanoid)
  const NODE_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  function nodeId(rand = Math.random) {
    let s = '';
    for (let i = 0; i < 21; i++) s += NODE_ID_CHARS[Math.floor(rand() * 64) & 63];
    return s;
  }

  // Một dòng chỉ có link YouTube / Vimeo -> khối video nhúng (web cũng nhúng như vậy)
  const VIDEO_URL = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?|shorts\/|embed\/|live\/)|youtu\.be\/|vimeo\.com\/\d)\S*$/i;
  // Một dòng chỉ có ảnh: ![mô tả](https://media.beincom.com/…) — ảnh tải lên với resource 'article:content'.
  // Dashboard ghi ảnh chưa tải là local:N, thay bằng link thật trước khi gửi.
  const IMAGE_LINE = /^!\[([^\]\n]*)\]\(((?:https:\/\/|blob:|local:)\S+)\)$/;
  const LOCAL_IMAGE = /\]\(local:(\d+)\)/g;
  const ARTICLE_IMAGES_MAX = 30;
  // Bảng: dòng tiêu đề | a | b |, dòng | --- | --- |, rồi các dòng dữ liệu
  const TABLE_SEP = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;
  const tableCells = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const INLINE_RULES = [
    { re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/, kind: 'link' },
    { re: /`([^`\n]+)`/, kind: 'code' },
    { re: /\*\*\*(?!\s)(.+?)\*\*\*/, marks: { bold: true, italic: true } },
    { re: /\*\*(?!\s)(.+?)\*\*/, marks: { bold: true } },
    { re: /~~(?!\s)(.+?)~~/, marks: { strikethrough: true } },
    { re: /\+\+(?!\s)(.+?)\+\+/, marks: { underline: true } },
    { re: /\*(?![\s*])([^*\n]+?)\*/, marks: { italic: true } },
    { re: /(?<![\w\p{L}])_(?![\s_])([^_\n]+?)_(?![\w\p{L}])/u, marks: { italic: true } },
    { re: /https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,!?;:'"]/, kind: 'url' },
    { re: new RegExp(`(?<![^\\s(])@(${MENTION_CHAR}+)`, 'u'), kind: 'mention' },
  ];
  const MARKS = ['bold', 'italic', 'underline', 'strikethrough', 'code'];
  const sameMarks = (a, b) => MARKS.every((k) => !!a[k] === !!b[k]);

  // Chữ một dòng Markdown -> các đoạn chữ / link / nhắc tên. mentions: người đã chọn khi soạn (username -> dữ liệu)
  function inlineRaw(text, marks, inLink, mentions = null) {
    const out = [];
    let rest = text;
    while (rest) {
      let best = null;
      for (const r of INLINE_RULES) {
        if (inLink && (r.kind === 'link' || r.kind === 'url')) continue;
        if (r.kind === 'mention' && !mentions) continue;
        const m = r.re.exec(rest);
        if (m && (!best || m.index < best.m.index)) best = { r, m };
      }
      if (!best) {
        out.push({ text: rest, ...marks });
        break;
      }
      const { r, m } = best;
      if (m.index) out.push({ text: rest.slice(0, m.index), ...marks });
      let used = m[0].length;
      if (r.kind === 'link') out.push({ type: 'a', url: m[2], children: inlineRaw(m[1], marks, true, mentions) });
      else if (r.kind === 'url') out.push({ type: 'a', url: m[0], children: [{ text: m[0], ...marks }] });
      else if (r.kind === 'code') out.push({ text: m[1], ...marks, code: true });
      else if (r.kind === 'mention') {
        // Chỉ người đã chọn trong ô nhắc tên mới thành nhắc tên (dấu câu dính sau tên bỏ ra, như bài thường)
        const name = m[1].replace(MENTION_TAIL, '');
        if (mentions[name]) {
          used = 1 + name.length;
          out.push({ type: 'mention', value: name, data: { ...mentions[name] }, children: [{ text: '' }] });
        } else out.push({ text: m[0], ...marks });
      } else out.push(...inlineRaw(m[1], { ...marks, ...r.marks }, inLink, mentions));
      rest = rest.slice(m.index + used);
    }
    return out;
  }

  // Gộp đoạn chữ cùng định dạng, bỏ đoạn rỗng; link / nhắc tên luôn có chữ hai bên (quy ước của Slate)
  function tidyInline(list) {
    const out = [];
    for (const n of list) {
      if (n.type) {
        if (n.type === 'a') n.children = tidyInline(n.children);
        if (!out.length || out[out.length - 1].type) out.push({ text: '' });
        out.push(n);
        continue;
      }
      const prev = out[out.length - 1];
      if (prev && !prev.type && sameMarks(prev, n)) prev.text += n.text;
      else if (n.text || !prev || prev.type) out.push(n);
    }
    if (!out.length || out[out.length - 1].type) out.push({ text: '' });
    return out.filter((n, i) => n.type || n.text || i === 0 || out[i - 1]?.type || out.length === 1);
  }

  // Markdown -> nội dung Article. Mỗi dòng có chữ là một đoạn; dòng trống chỉ để tách khối.
  // mentions: { username: dữ liệu } người đã chọn khi soạn — "@username" của họ thành khối nhắc tên.
  function mdToPlate(md, { id = () => nodeId(), mentions = null } = {}) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const nodes = [];
    const inline = (text) => tidyInline(inlineRaw(String(text || ''), {}, false, mentions));
    const block = (type, text, extra = {}) => ({ type, id: id(), ...extra, children: inline(text) });
    let list = null;
    let quote = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      let m;
      if (/^```/.test(line)) {
        // Khối mã: mỗi dòng một đoạn chữ dạng mã
        list = quote = null;
        for (i++; i < lines.length && !/^```/.test(lines[i].trim()); i++) nodes.push({ type: 'p', id: id(), children: [lines[i] ? { text: lines[i], code: true } : { text: '' }] });
        continue;
      }
      if (!line) {
        list = quote = null;
        continue;
      }
      if (line.startsWith('|') && TABLE_SEP.test((lines[i + 1] || '').trim())) {
        // Bảng: hàng đầu là tiêu đề (th), các hàng sau là dữ liệu (td); mỗi ô một đoạn
        list = quote = null;
        const head = tableCells(line);
        const rows = [head];
        for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(tableCells(lines[i]));
        i--;
        const cell = (type, text) => ({ type, id: id(), children: [{ type: 'p', id: id(), children: inline(text) }] });
        nodes.push({ type: 'table', id: id(), children: rows.map((r, k) => ({ type: 'tr', id: id(), children: head.map((_, c) => cell(k ? 'td' : 'th', r[c] || '')) })) });
        continue;
      }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        list = quote = null;
        nodes.push(block('h' + Math.min(3, m[1].length), m[2]));
      } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
        list = quote = null;
        nodes.push({ type: 'hr', id: id(), children: [{ text: '' }] });
      } else if ((m = /^>\s?(.*)$/.exec(line))) {
        list = null;
        if (quote) quote.children = tidyInline([...quote.children, { text: '\n' }, ...inlineRaw(m[1], {}, false, mentions)]);
        else nodes.push((quote = block('blockquote', m[1])));
      } else if ((m = /^(?:[-*+]|(\d{1,3})[.)])\s+(.*)$/.exec(line))) {
        quote = null;
        const type = m[1] ? 'ol' : 'ul';
        if (!list || list.type !== type) nodes.push((list = { type, id: id(), children: [] }));
        list.children.push({ type: 'li', id: id(), children: [{ type: 'lic', id: id(), indent: 0, listStyleType: '', children: inline(m[2]) }] });
      } else if ((m = IMAGE_LINE.exec(line))) {
        list = quote = null;
        nodes.push({ type: 'img', id: id(), url: m[2], children: [{ text: '' }] });
      } else if (VIDEO_URL.test(line)) {
        list = quote = null;
        nodes.push({ type: 'media_embed', id: id(), url: line, caption: [{ text: '' }], children: [{ text: '' }] });
      } else {
        list = quote = null;
        nodes.push(block('p', line));
      }
    }
    // Link và nhắc tên cũng có id như web
    const ids = (n) => {
      if (n.type && n.id === undefined) n.id = id();
      (n.children || []).forEach(ids);
    };
    nodes.forEach(ids);
    return nodes.length ? nodes : [{ type: 'p', id: id(), children: [{ text: '' }] }];
  }

  // Người được nhắc trong nội dung (để gửi kèm mentions như web: { username: dữ liệu })
  function plateMentions(nodes) {
    const out = {};
    const walk = (n) => {
      if (n?.type === 'mention' && n.value) out[n.value] = { ...n.data };
      (n?.children || []).forEach(walk);
    };
    (nodes || []).forEach(walk);
    return out;
  }

  // Dữ liệu một người nhắc tên trong Article (giống ô chọn người của trình soạn thảo Article trên web)
  function articleMentionEntry(u) {
    return { id: u.id, avatar: u.avatar || '', name: u.username, fullname: u.fullname || '', username: u.username };
  }

  const nodeText = (n) => (typeof n?.text === 'string' ? n.text : (n?.children || []).map(nodeText).join(''));
  // Chữ để đếm độ dài như web (nối các khối, bỏ xuống dòng và khoảng trắng đầu / cuối dòng)
  function plateText(nodes) {
    return (nodes || [])
      .map(nodeText)
      .join(' ')
      .replace(/^\s+|\s+$|(\r\n|\n|\r)/gm, '');
  }
  // Số từ như web: đếm từ trong từng khối
  function plateWords(nodes) {
    return (nodes || []).reduce((n, b) => {
      const t = nodeText(b).trim();
      return n + (t ? t.split(/\s+/).length : 0);
    }, 0);
  }

  // Xem trước nội dung Article (HTML đã escape; link chỉ http/https, ảnh chỉ https / blob)
  function plateHtml(nodes) {
    const leaf = (n) => {
      if (n.type === 'a') return `<a href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer">${(n.children || []).map(leaf).join('')}</a>`;
      if (n.type === 'mention') return `<span class="mention">@${escapeHtml(n.value)}</span>`;
      let h = escapeHtml(n.text || '').replace(/\n/g, '<br>');
      if (n.code) h = `<code>${h}</code>`;
      if (n.bold) h = `<strong>${h}</strong>`;
      if (n.italic) h = `<em>${h}</em>`;
      if (n.underline) h = `<u>${h}</u>`;
      if (n.strikethrough) h = `<s>${h}</s>`;
      return h;
    };
    const inner = (n) => (n.children || []).map(leaf).join('');
    const blockHtml = (n) => {
      switch (n.type) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'blockquote':
          return `<${n.type}>${inner(n)}</${n.type}>`;
        case 'ul':
        case 'ol':
          return `<${n.type}>${(n.children || []).map((li) => `<li>${(li.children || []).map(inner).join('')}</li>`).join('')}</${n.type}>`;
        case 'hr':
          return '<hr>';
        case 'img':
          return /^(https:|blob:)/.test(n.url) ? `<p class="art-img"><img src="${escapeHtml(n.url)}" alt=""></p>` : '<p class="muted">[ảnh]</p>';
        case 'table':
          return `<table>${(n.children || []).map((tr) => `<tr>${(tr.children || []).map((c) => `<${c.type === 'th' ? 'th' : 'td'}>${(c.children || []).map(inner).join('')}</${c.type === 'th' ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
        case 'media_embed':
          return `<p class="embed">🎬 <a href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer">${escapeHtml(n.url)}</a></p>`;
        default:
          return `<p>${inner(n) || '<br>'}</p>`;
      }
    };
    return (nodes || []).map(blockHtml).join('');
  }

  function validateArticle({ groupIds, title, summary = '', content, categoryIds, hasCover, tags, series, scheduledAt, asGroup = false }, now = Date.now()) {
    if (!groupIds?.length) return 'Chưa chọn group để đăng';
    if (asGroup && groupIds.length !== 1) return 'Đăng dưới tên group: chỉ chọn một group';
    const t = String(title || '').trim();
    if (!t) return 'Article cần tiêu đề';
    if (t.length > ARTICLE_TITLE_MAX) return `Tiêu đề dài ${t.length} ký tự, tối đa ${ARTICLE_TITLE_MAX}`;
    if (String(summary || '').trim().length > ARTICLE_SUMMARY_MAX) return `Tóm tắt tối đa ${ARTICLE_SUMMARY_MAX} ký tự`;
    if (/\]\((local|blob):/.test(String(content || ''))) return 'Ảnh trong bài chưa tải lên';
    const nodes = mdToPlate(content, { id: () => '' });
    const len = plateText(nodes).length;
    const images = nodes.filter((n) => n.type === 'img').length;
    if (!len && !images) return 'Article chưa có nội dung';
    if (len > ARTICLE_MAX) return `Nội dung dài ${len.toLocaleString('vi-VN')} ký tự, tối đa ${ARTICLE_MAX.toLocaleString('vi-VN')}`;
    if (images > ARTICLE_IMAGES_MAX) return `Tối đa ${ARTICLE_IMAGES_MAX} ảnh trong bài`;
    if (!categoryIds?.length) return 'Chọn ít nhất một chuyên mục';
    if (!hasCover) return 'Article cần ảnh bìa';
    if ((tags?.length || 0) > TAG_MAX) return `Tối đa ${TAG_MAX} tag mỗi bài`;
    if ((series?.length || 0) > SERIES_MAX) return `Tối đa ${SERIES_MAX} series mỗi bài`;
    if (scheduledAt) {
      const at = new Date(scheduledAt).getTime();
      if (!Number.isFinite(at)) return 'Giờ hẹn không hợp lệ';
      if (at < now + MIN_SCHEDULE_MIN * 60e3) return `Giờ hẹn phải sau bây giờ ít nhất ${MIN_SCHEDULE_MIN} phút`;
    }
    return '';
  }

  // Body cho PUT content/articles/{id}/publish | schedule (giống web gửi)
  function articleBody({ groupIds, title, summary = '', content, categoryIds, coverId, tags = [], series = [], scheduledAt = null, mentions = null }, { id } = {}) {
    const nodes = mdToPlate(content, { ...(id ? { id } : {}), mentions });
    const ids = (list) => (list || []).map((x) => (typeof x === 'string' ? x : x.id));
    return {
      audience: { groupIds: [...groupIds], userIds: [] },
      categories: ids(categoryIds),
      series: ids(series),
      content: JSON.stringify(nodes),
      title: String(title).trim(),
      mentions: plateMentions(nodes),
      summary: String(summary || '').trim(),
      coverMedia: { id: coverId },
      tags: ids(tags),
      wordCount: plateWords(nodes),
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    };
  }

  function validateSeries({ groupIds, title, summary = '', hasCover, asGroup = false }) {
    if (!groupIds?.length) return 'Chưa chọn group';
    if (asGroup && groupIds.length !== 1) return 'Tạo dưới tên group: chỉ chọn một group';
    const t = String(title || '').trim();
    if (!t) return 'Series cần tên';
    if (t.length > SERIES_TITLE_MAX) return `Tên series dài ${t.length} ký tự, tối đa ${SERIES_TITLE_MAX}`;
    if (String(summary || '').trim().length > SERIES_SUMMARY_MAX) return `Mô tả tối đa ${SERIES_SUMMARY_MAX} ký tự`;
    if (!hasCover) return 'Series cần ảnh bìa';
    return '';
  }

  // Body cho POST content/series (hoặc content/manage/groups/{id}/series khi tạo dưới tên group) — giống web
  function seriesBody({ groupIds, title, summary = '', coverId, isImportant = false }) {
    return {
      title: String(title).trim(),
      summary: String(summary || '').trim(),
      setting: { isImportant: !!isImportant, importantExpiredAt: null, canComment: true, canReact: true, canShare: true },
      coverMedia: { id: coverId },
      audience: { groupIds: [...groupIds] },
    };
  }

  // Chuyên mục Article (GET content/category)
  const slimCategory = (c) => ({ id: c.id, name: c.name || '', slug: c.slug || '' });

  Object.assign(BG, {
    ARTICLE_TITLE_MAX,
    ARTICLE_SUMMARY_MAX,
    ARTICLE_MAX,
    SERIES_TITLE_MAX,
    SERIES_SUMMARY_MAX,
    nodeId,
    mdToPlate,
    plateMentions,
    articleMentionEntry,
    ARTICLE_IMAGES_MAX,
    LOCAL_IMAGE,
    plateText,
    plateWords,
    plateHtml,
    validateArticle,
    articleBody,
    validateSeries,
    seriesBody,
    slimCategory,
  });
});
