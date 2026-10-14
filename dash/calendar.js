// Dashboard — tab Đăng bài: lịch nội dung (tuần / tháng) của "Bài đã hẹn giờ" và nhập nhiều bài từ CSV.
// Dùng sched, bestTime, nextQuarter… ở dash/compose.js (nạp trước tệp này). Ngày theo giờ Việt Nam.

// ---------- Lịch nội dung ----------

const VN_MS = 7 * 3600e3;
const vnKey = (t) => new Date(new Date(t).getTime() + VN_MS).toISOString().slice(0, 10);
const keyDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m: m - 1, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const addDays = (key, n) => {
  const { y, m, d } = keyDate(key);
  return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10);
};
const dm = (key) => `${keyDate(key).d}/${keyDate(key).m + 1}`;

const cal = { view: 'list', anchor: vnKey(Date.now()), hintLoading: false, hintKey: '' };

// Giờ nên đăng mỗi thứ trong tuần, theo community đang chọn ở khung Soạn bài (hoặc group đang xem ở tab Thống kê)
function calHint() {
  const g = bestTimeGroup() || groups().find((x) => x.id === stats.groupId) || null;
  if (!g) return null;
  const posts = bestTime.cache[g.id] || (stats.raw?.posts && stats.groupId === g.id ? stats.raw.posts : null);
  if (!posts) return { g, hours: null };
  const b = BG.bestTimes(posts);
  return { g, hours: b.total ? BG.dayBestHours(b) : null, total: b.total };
}

async function loadCalHint() {
  const h = calHint();
  if (!h || cal.hintLoading) return;
  cal.hintLoading = true;
  renderCalendar();
  try {
    const r = await bestPostsFor(h.g);
    if (r.error) toast(r.error, 'err');
  } finally {
    cal.hintLoading = false;
    renderCalendar();
  }
}

function setSchedView(v) {
  cal.view = v;
  for (const b of $('sched-view').querySelectorAll('button')) b.classList.toggle('active', b.dataset.f === v);
  renderCalendar();
}

function moveCal(dir) {
  if (!dir) cal.anchor = vnKey(Date.now());
  else if (cal.view === 'week') cal.anchor = addDays(cal.anchor, 7 * dir);
  else {
    const { y, m } = keyDate(cal.anchor);
    cal.anchor = new Date(Date.UTC(y, m + dir, 1)).toISOString().slice(0, 10);
  }
  renderCalendar();
}

// Bài hẹn giờ theo ngày (giờ Việt Nam), sắp theo giờ
function schedByDay() {
  const by = new Map();
  for (const p of [...sched.items].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))) {
    const k = vnKey(p.scheduledAt);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  }
  return by;
}

const hhmm = (t) => new Date(new Date(t).getTime() + VN_MS).toISOString().slice(11, 16);

function calItem(p, recurIdx) {
  const r = recurIdx.get(p.id);
  const text = (p.text || '').replace(/[#*_>`~[\]()]/g, '').replace(/\s+/g, ' ').trim() || '(không có chữ)';
  return el(
    'button',
    {
      type: 'button',
      class: 'cal-item' + (p.status === 'SCHEDULE_FAILED' ? ' failed' : ''),
      title: `${fmtTime(p.scheduledAt)} · ${p.groups.map((g) => g.name).join(', ')}${r ? ` · 🔁 ${r.k}/${r.n}` : ''}\n${text.slice(0, 300)}`,
      onclick: () => showSchedRow(p.id),
    },
    el('b', { text: hhmm(p.scheduledAt) }),
    r ? el('span', { text: ' 🔁' }) : null,
    el('span', { text: ' ' + text.slice(0, 60) }),
  );
}

// Bấm một bài trên lịch: về dạng danh sách, cuộn tới dòng đó (có nút Đổi giờ / Huỷ)
function showSchedRow(id) {
  setSchedView('list');
  const tr = [...$('scheduled-body').querySelectorAll('tr')].find((x) => x.dataset.id === id);
  if (!tr) return;
  tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
  tr.classList.add('flash');
  setTimeout(() => tr.classList.remove('flash'), 2400);
}

// "+" ở một ngày: chuyển khung Soạn bài sang Hẹn giờ vào ngày đó (giờ gợi ý nếu có, không thì 20:00)
function composeOnDay(key) {
  if (compose.edit) return toast('Đang sửa bài đã đăng — bấm "Thoát sửa" trước', 'warn');
  const { y, m, d, wd } = keyDate(key);
  const h = calHint();
  const hour = h?.hours?.[wd] ?? 20;
  let t = Date.UTC(y, m, d, hour, 0) - VN_MS;
  let note = h?.hours?.[wd] != null ? ` (giờ nên đăng theo ${h.g.name})` : '';
  if (t < Date.now() + (BG.MIN_SCHEDULE_MIN + 5) * 60e3) {
    t = nextQuarter().getTime();
    note = ' (giờ gợi ý đã qua, chọn khung gần nhất)';
  }
  document.querySelector('input[name="compose-when"][value="later"]').checked = true;
  $('compose-at').value = toLocalInput(new Date(t));
  updateCompose();
  saveDraft();
  $('compose').scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('compose-text').focus({ preventScroll: true });
  toast(`Hẹn giờ lúc ${fmtTime(t)}${note}. Chọn group, viết bài rồi bấm Hẹn giờ.`);
}

function calDay(key, items, recurIdx, { today, hint, max = Infinity, inMonth = true }) {
  const { d, wd } = keyDate(key);
  const past = key < today;
  const shown = items.slice(0, max);
  return el(
    'div',
    { class: 'cal-day' + (key === today ? ' today' : '') + (past ? ' past' : '') + (inMonth ? '' : ' out') },
    el(
      'div',
      { class: 'cal-day-head' },
      el('span', { class: 'cal-date', text: cal.view === 'week' ? `${BG.WEEKDAYS[wd]} ${dm(key)}` : String(d) }),
      !past && hint?.[wd] != null ? el('span', { class: 'cal-hint', title: 'Giờ nên đăng ngày này (theo tương tác 30 ngày)', text: `⏱${hint[wd]}h` }) : null,
      past ? null : el('button', { type: 'button', class: 'cal-add', title: 'Soạn bài hẹn giờ vào ngày này', 'aria-label': `Soạn bài cho ngày ${dm(key)}`, text: '+', onclick: () => composeOnDay(key) }),
    ),
    shown.map((p) => calItem(p, recurIdx)),
    items.length > shown.length
      ? el('button', {
          type: 'button',
          class: 'cal-more',
          text: `+${items.length - shown.length} bài nữa`,
          onclick: () => {
            cal.anchor = key;
            setSchedView('week');
          },
        })
      : null,
  );
}

function renderCalendar() {
  const list = cal.view === 'list';
  $('sched-list').hidden = !list;
  $('sched-cal').hidden = list;
  $('cal-nav').hidden = list;
  $('cal-foot').hidden = list;
  if (list) return;
  const today = vnKey(Date.now());
  const recurIdx = BG.recurIndex(data.recurring);
  const by = schedByDay();
  const h = calHint();
  const hint = h?.hours;
  const head = BG.WEEKDAYS.slice(1)
    .concat(BG.WEEKDAYS[0])
    .map((w) => el('div', { class: 'cal-wd', text: w }));
  if (cal.view === 'week') {
    const mon = addDays(cal.anchor, -((keyDate(cal.anchor).wd + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const end = keyDate(days[6]);
    $('cal-label').textContent = `${dm(days[0])} – ${dm(days[6])}/${end.y}`;
    $('sched-cal').className = 'cal week';
    $('sched-cal').replaceChildren(...days.map((k) => calDay(k, by.get(k) || [], recurIdx, { today, hint })));
  } else {
    const { y, m } = keyDate(cal.anchor);
    $('cal-label').textContent = `Tháng ${m + 1}/${y}`;
    $('sched-cal').className = 'cal month';
    $('sched-cal').replaceChildren(...head, ...BG.monthGrid(y, m).flat().map((c) => calDay(c.key, by.get(c.key) || [], recurIdx, { today, hint, max: 3, inMonth: c.inMonth })));
  }
  // Chân lịch: trạng thái tải + giờ gợi ý
  const foot = [];
  if (!sched.loaded) foot.push(el('span', { text: sched.loading ? 'Đang tải bài hẹn giờ…' : 'Bấm "↻ Tải lại" để thấy bài đã hẹn giờ trên lịch.' }));
  if (hint) foot.push(el('span', { text: `⏱ Giờ nên đăng mỗi ngày theo ${h.total} bài 30 ngày ở ${h.g.name}.` }));
  else if (h && h.total === 0) foot.push(el('span', { text: `${h.g.name} chưa có bài nào trong 30 ngày để gợi ý giờ.` }));
  else if (h) foot.push(el('button', { type: 'button', class: 'ghost sm', disabled: cal.hintLoading, text: cal.hintLoading ? 'Đang đọc bài…' : `⏱ Hiện giờ nên đăng theo ${h.g.name}`, onclick: loadCalHint }));
  else foot.push(el('span', { text: 'Chọn group ở khung Soạn bài để thấy giờ nên đăng mỗi ngày.' }));
  foot.push(el('span', { text: 'Bấm + ở một ngày để soạn bài hẹn giờ vào ngày đó; bấm một bài để đổi giờ hoặc huỷ.' }));
  $('cal-foot').replaceChildren(...foot);
}

onSeg('sched-view', setSchedView);
$('cal-prev').addEventListener('click', () => moveCal(-1));
$('cal-next').addEventListener('click', () => moveCal(1));
$('cal-today').addEventListener('click', () => moveCal(0));

// ---------- Nhập nhiều bài từ CSV ----------

const csvImp = { name: '', posts: [], error: '', truncated: 0, status: {}, running: false, progress: '', encoding: '' };

const csvGroups = () =>
  groups()
    .filter((g) => !g.error)
    .map((g) => ({ id: g.id, name: g.name, path: groupPath(g) }));

async function readCsvFile(file) {
  if (!file) return;
  if (file.size > 1e6) return toast('Tệp quá lớn (tối đa 1 MB)', 'err');
  if (!groups().length) return toast('Chưa có danh sách group — bấm Quét ngay trước', 'err');
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  let encoding = '';
  // Excel "CSV (Comma delimited)" lưu theo bảng mã Windows tiếng Việt, không phải UTF-8
  if (text.includes('�')) {
    text = new TextDecoder('windows-1258').decode(buf);
    encoding = 'windows-1258';
  }
  const r = BG.csvPosts(BG.parseCsv(text), { groups: csvGroups() });
  Object.assign(csvImp, { name: file.name, posts: r.posts, error: r.error, truncated: r.truncated || 0, status: {}, progress: '', encoding });
  renderCsv();
}

// Cảnh báo (vẫn cho hẹn): dính quy tắc bài viết, trùng giờ trong tệp hoặc với bài đã hẹn
function csvWarnings(p, all) {
  const out = [];
  const ev = evalPost({ title: '', text: p.content, link: '', seenIn: p.groupIds });
  if (ev.verdict !== 'ok') out.push('Dính quy tắc: ' + ev.reasons.map((r) => r.text).join('; '));
  const same = (q) => q.scheduledAt === p.scheduledAt && q.groupIds.some((id) => p.groupIds.includes(id));
  const dup = all.find((q) => q !== p && !q.errors.length && q.line < p.line && same(q));
  if (dup) out.push(`Cùng giờ, cùng group với dòng ${dup.line}`);
  if (sched.items.some((s) => new Date(s.scheduledAt).getTime() === new Date(p.scheduledAt).getTime() && s.groups.some((g) => p.groupIds.includes(g.id)))) out.push('Đã có bài hẹn cùng giờ ở group này');
  return out;
}

const csvPending = () => csvImp.posts.filter((p) => !p.errors.length && csvImp.status[p.line]?.state !== 'ok');

function renderCsv() {
  const has = !!csvImp.name;
  $('csv-preview').hidden = !has;
  if (!has) return;
  const good = csvImp.posts.filter((p) => !p.errors.length);
  const bad = csvImp.posts.length - good.length;
  const done = good.filter((p) => csvImp.status[p.line]?.state === 'ok').length;
  const left = csvPending().length;
  $('csv-note').textContent = csvImp.error
    ? `${csvImp.name}: ${csvImp.error}`
    : csvImp.progress ||
      [
        `${csvImp.name}${csvImp.encoding ? ' (bảng mã Windows)' : ''}: ${good.length} bài hợp lệ`,
        bad && `${bad} dòng lỗi sẽ bỏ qua — sửa trong tệp rồi chọn lại`,
        done && `đã hẹn ${done}`,
        csvImp.truncated && `${csvImp.truncated} dòng sau cùng không đọc (tối đa ${BG.CSV_MAX_ROWS} bài mỗi lần)`,
      ]
        .filter(Boolean)
        .join(' · ');
  $('csv-note').className = 'small ' + (csvImp.error ? 'err-text' : bad ? 'warn-text' : '');
  const btn = $('btn-csv-submit');
  btn.textContent = csvImp.running ? 'Đang hẹn…' : !left && done ? 'Đã hẹn xong' : `${data.settings.dryRun ? 'Chạy thử' : 'Hẹn giờ'} ${left} bài`;
  btn.disabled = !left || csvImp.running || busy;
  $('btn-csv-clear').disabled = csvImp.running;
  const body = $('csv-body');
  body.replaceChildren();
  if (!csvImp.posts.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 6, text: csvImp.error || 'Tệp không có dòng nào' })));
  for (const p of csvImp.posts) {
    const st = csvImp.status[p.line];
    const warns = p.errors.length || st?.state === 'ok' ? [] : csvWarnings(p, csvImp.posts);
    body.append(
      el(
        'tr',
        { class: p.errors.length ? 'csv-bad' : '' },
        el('td', { class: 'muted', text: String(p.line) }),
        el('td', { class: 'nowrap' }, p.scheduledAt ? el('b', { text: fmtTime(p.scheduledAt) }) : el('span', { class: 'muted', text: '–' })),
        el('td', {}, p.groupNames.map((n) => el('div', { class: 'small', text: n }))),
        el('td', { class: 'csv-content', title: p.content, text: p.content.length > 220 ? p.content.slice(0, 220) + '…' : p.content || '–' }),
        el('td', {}, scheduledSetting(p.setting)),
        el(
          'td',
          {},
          st ? el('div', {}, el('span', { class: 'tag ' + (st.state === 'ok' ? 'ok' : 'err'), text: st.text })) : null,
          p.errors.map((e) => el('div', {}, el('span', { class: 'tag err', text: e }))),
          warns.map((w) => el('div', {}, el('span', { class: 'tag warn', text: '⚠ ' + w }))),
          !st && !p.errors.length && !warns.length ? el('span', { class: 'tag ok', text: 'Hợp lệ' }) : null,
        ),
      ),
    );
  }
}

async function submitCsv() {
  const todo = csvPending();
  if (!todo.length || busy || csvImp.running) return;
  const dry = data.settings.dryRun;
  const delay = Math.max(1, Number(data.settings.actionDelaySec) || 0);
  const times = todo.map((p) => new Date(p.scheduledAt).getTime());
  const nGroups = new Set(todo.flatMap((p) => p.groupIds)).size;
  const ok = await confirmDialog({
    title: `${dry ? 'Chạy thử' : 'Hẹn giờ'} ${todo.length} bài từ ${csvImp.name}?`,
    text: `Từ ${fmtTime(Math.min(...times))} đến ${fmtTime(Math.max(...times))}, vào ${nGroups} group.`,
    names: todo.slice(0, 20).map((p) => `${fmtTime(p.scheduledAt)} · ${p.groupNames.join(', ')} · ${p.content.replace(/\s+/g, ' ').slice(0, 60)}`).concat(todo.length > 20 ? [`… và ${todo.length - 20} bài nữa`] : []),
    okText: `${dry ? 'Chạy thử' : 'Hẹn giờ'} ${todo.length} bài`,
    sendNote: dry
      ? 'Đang bật Chạy thử: chỉ ghi nhật ký, không gửi lên Beincom.'
      : `Tạo lần lượt ${todo.length} bài hẹn giờ trên Beincom (nghỉ ${delay} giây giữa mỗi bài, khoảng ${Math.ceil((todo.length * (delay + 2)) / 60)} phút); tới giờ Beincom tự đăng. Giữ trang này mở tới khi xong. Huỷ từng bài ở "Bài đã hẹn giờ".`,
  });
  if (!ok) return;
  let done = 0;
  let failed = 0;
  let streak = 0;
  let stop = '';
  csvImp.running = true;
  busy = true;
  renderAll();
  try {
    for (const [i, p] of todo.entries()) {
      if (i && !dry) await new Promise((r) => setTimeout(r, delay * 1000));
      csvImp.progress = `Đang hẹn bài ${i + 1}/${todo.length} (dòng ${p.line})…`;
      renderCsv();
      // Giờ hẹn có thể đã quá gần trong lúc chờ: kiểm tra lại theo giờ hiện tại
      const err = BG.validateCompose(p);
      const r = err ? { status: 'error', message: err } : await chrome.runtime.sendMessage({ type: 'compose', groupIds: p.groupIds, content: p.content, setting: p.setting, scheduledAt: p.scheduledAt });
      if (r?.status === 'ok') {
        csvImp.status[p.line] = { state: 'ok', text: r.dryRun ? 'Chạy thử ✓' : 'Đã hẹn ✓' };
        done++;
        streak = 0;
        continue;
      }
      csvImp.status[p.line] = { state: 'err', text: 'Lỗi: ' + (r?.message || 'không rõ') };
      failed++;
      if (r?.status === 'need_login') stop = 'Phiên đăng nhập Beincom đã hết hạn';
      else if (++streak >= 3) stop = '3 bài lỗi liên tiếp';
      if (stop) break;
    }
  } finally {
    csvImp.running = false;
    csvImp.progress = '';
    busy = false;
  }
  renderAll();
  const left = csvPending().length;
  toast(
    [`${dry ? 'Chạy thử' : 'Đã hẹn giờ'} ${done} bài`, failed && `${failed} bài lỗi`, stop && `dừng: ${stop}`, left && `còn ${left} bài chưa hẹn — bấm lại để thử tiếp`].filter(Boolean).join(' · '),
    failed ? 'warn' : 'ok',
  );
  if (done && !dry) loadScheduled();
}

$('btn-csv-template').addEventListener('click', () => {
  const names = csvGroups()
    .slice(0, 2)
    .map((g) => g.path);
  download('beinfusion-mau-bai-hen-gio.csv', BG.csvTemplate(names.length ? names : undefined), 'text/csv;charset=utf-8');
});
$('btn-csv-pick').addEventListener('click', () => $('csv-file').click());
$('csv-file').addEventListener('change', (e) => {
  readCsvFile(e.target.files[0]);
  e.target.value = '';
});
$('btn-csv-clear').addEventListener('click', () => {
  Object.assign(csvImp, { name: '', posts: [], error: '', truncated: 0, status: {}, progress: '', encoding: '' });
  renderCsv();
});
$('btn-csv-submit').addEventListener('click', submitCsv);
// Kéo thả tệp CSV vào thẻ
$('csv-import').addEventListener('dragover', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  $('csv-import').classList.add('drop');
});
$('csv-import').addEventListener('dragleave', () => $('csv-import').classList.remove('drop'));
$('csv-import').addEventListener('drop', (e) => {
  e.preventDefault();
  $('csv-import').classList.remove('drop');
  if (!csvImp.running) readCsvFile(e.dataTransfer.files[0]);
});
