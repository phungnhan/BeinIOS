// BeinFusion — biểu đồ SVG nhỏ cho tab Thống kê (không dùng thư viện ngoài).
// Quy ước: cột ≤ 24px, đầu cột bo 4px (vuông ở đường gốc), đường 2px, chấm ≥ 8px có viền màu nền,
// lưới mảnh, rê chuột hiện số liệu. Màu lấy từ biến CSS --series-up / --series-down (đổi theo nền sáng/tối).
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const H = 220;
  const PAD = { l: 48, r: 18, t: 16, b: 28 };

  function svg(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  const fmt = (n) => Number(n).toLocaleString('vi-VN');
  const dayLabel = (d) => {
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  };

  // Mốc trục y tròn số (0 / 5 / 10 …)
  function niceStep(span, count) {
    const raw = span / count;
    const p = 10 ** Math.floor(Math.log10(raw || 1));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function niceTicks(min, max, count = 4) {
    if (max === min) max = min + 1;
    const step = Math.max(1, niceStep(max - min, count));
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
    return out;
  }

  function barPath(x, w, yBase, yEnd) {
    const h = Math.abs(yBase - yEnd);
    if (h < 0.5) return '';
    const r = Math.min(4, w / 2, h);
    if (yEnd < yBase) return `M${x},${yBase}V${yEnd + r}Q${x},${yEnd} ${x + r},${yEnd}H${x + w - r}Q${x + w},${yEnd} ${x + w},${yEnd + r}V${yBase}Z`;
    return `M${x},${yBase}V${yEnd - r}Q${x},${yEnd} ${x + r},${yEnd}H${x + w - r}Q${x + w},${yEnd} ${x + w},${yEnd - r}V${yBase}Z`;
  }

  // Khung chung: trục, lưới, nhãn ngày, vùng rê chuột và tooltip
  function frame(el, { days, ticks, tipRows }) {
    el.replaceChildren();
    const W = Math.max(320, Math.round(el.clientWidth || 640));
    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const y = (v) => PAD.t + plotH - ((v - lo) / (hi - lo)) * plotH;
    const band = plotW / days.length;
    const xc = (i) => PAD.l + band * (i + 0.5);
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });

    const grid = svg('g', { class: 'grid' });
    for (const t of ticks) {
      grid.append(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }));
      const lab = svg('text', { x: PAD.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' });
      lab.textContent = fmt(t);
      grid.append(lab);
    }
    s.append(grid);

    // Nhãn ngày: đầu, giữa, cuối (không ghi mọi ngày)
    const idx = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
    for (const i of idx) {
      const t = svg('text', { x: xc(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle', class: 'tick' });
      if (i === 0) t.setAttribute('x', PAD.l);
      if (i === days.length - 1) t.setAttribute('x', W - PAD.r);
      t.textContent = dayLabel(days[i]);
      s.append(t);
    }

    const marks = svg('g');
    s.append(marks);
    const hover = svg('rect', { class: 'hover-band', y: PAD.t, height: plotH, width: band, x: -999 });
    s.insertBefore(hover, marks);

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    const hits = svg('g');
    days.forEach((d, i) => {
      const r = svg('rect', { x: PAD.l + band * i, y: PAD.t, width: band, height: plotH, fill: 'transparent' });
      r.addEventListener('mouseenter', () => {
        hover.setAttribute('x', PAD.l + band * i);
        tip.replaceChildren();
        const head = document.createElement('div');
        head.className = 'tip-head';
        head.textContent = dayLabel(d) + '/' + d.slice(0, 4);
        tip.append(head);
        for (const row of tipRows(i)) {
          const line = document.createElement('div');
          const sw = document.createElement('i');
          sw.className = 'tip-sw';
          sw.style.background = row.color;
          line.append(sw, `${row.label}: `);
          const b = document.createElement('b');
          b.textContent = row.value;
          line.append(b);
          tip.append(line);
        }
        tip.hidden = false;
        const left = Math.min(Math.max(xc(i) + 12, 0), W - 170);
        tip.style.left = left + 'px';
        tip.style.top = PAD.t + 'px';
      });
      hits.append(r);
    });
    s.addEventListener('mouseleave', () => {
      tip.hidden = true;
      hover.setAttribute('x', -999);
    });
    s.append(hits);
    el.append(s, tip);
    return { s, marks, y, xc, band, plotH, W };
  }

  function empty(el, text) {
    el.replaceChildren();
    const p = document.createElement('div');
    p.className = 'chart-empty';
    p.textContent = text;
    el.append(p);
  }

  const barWidth = (band) => Math.max(2, Math.min(24, band - 2));

  // Cột một chuỗi (bài mới mỗi ngày)
  function columns(el, { days, values, label, color = 'var(--series-up)', emptyText = 'Chưa có dữ liệu trong khoảng này' }) {
    remember(el, columns, arguments[1]);
    const max = Math.max(0, ...values);
    if (!max) return empty(el, emptyText);
    const ticks = niceTicks(0, max);
    const f = frame(el, { days, ticks, tipRows: (i) => [{ label, value: fmt(values[i]), color }] });
    const w = barWidth(f.band);
    values.forEach((v, i) => {
      const d = barPath(f.xc(i) - w / 2, w, f.y(0), f.y(v));
      if (d) f.marks.append(svg('path', { d, fill: color }));
    });
    f.s.setAttribute('aria-label', `${label} theo ngày, cao nhất ${fmt(max)}`);
  }

  // Cột hai chiều quanh đường 0 (vào lên trên, rời xuống dưới)
  function diverging(el, { days, up, down, upLabel, downLabel, emptyText = 'Không có ai vào hay rời trong khoảng này' }) {
    remember(el, diverging, arguments[1]);
    const maxUp = Math.max(0, ...up);
    const maxDown = Math.max(0, ...down);
    if (!maxUp && !maxDown) return empty(el, emptyText);
    const step = Math.max(1, niceStep(Math.max(maxUp, maxDown, 1) * 2, 4)); // đếm người: vạch trục là số nguyên
    const top = Math.max(step, Math.ceil(maxUp / step) * step);
    const bottom = Math.max(maxDown ? step : 0, Math.ceil(maxDown / step) * step);
    const ticks = [];
    for (let v = -bottom; v <= top + step / 2; v += step) ticks.push(v);
    const f = frame(el, {
      days,
      ticks,
      tipRows: (i) => [
        { label: upLabel, value: fmt(up[i]), color: 'var(--series-up)' },
        { label: downLabel, value: fmt(down[i]), color: 'var(--series-down)' },
      ],
    });
    // Nhãn trục âm hiện số dương (số người rời)
    for (const t of f.s.querySelectorAll('text.tick')) if (/^-/.test(t.textContent)) t.textContent = t.textContent.slice(1);
    f.marks.append(svg('line', { x1: 48, x2: f.W - 18, y1: f.y(0), y2: f.y(0), class: 'baseline' }));
    const w = barWidth(f.band);
    days.forEach((_, i) => {
      const a = barPath(f.xc(i) - w / 2, w, f.y(0) - 1, f.y(up[i]) - 1);
      if (a) f.marks.append(svg('path', { d: a, fill: 'var(--series-up)' }));
      const b = barPath(f.xc(i) - w / 2, w, f.y(0) + 1, f.y(-down[i]) + 1);
      if (b) f.marks.append(svg('path', { d: b, fill: 'var(--series-down)' }));
    });
    f.s.setAttribute('aria-label', `${upLabel} và ${downLabel} theo ngày`);
  }

  // Đường một chuỗi (số thành viên); ngày không có số liệu thì đứt đoạn
  function line(el, { days, values, label, color = 'var(--series-up)', emptyText = 'Chưa có dữ liệu' }) {
    remember(el, line, arguments[1]);
    const known = values.filter((v) => v != null);
    if (!known.length) return empty(el, emptyText);
    const min = Math.min(...known);
    const max = Math.max(...known);
    const pad = Math.max(1, Math.round((max - min) * 0.15));
    const ticks = niceTicks(Math.max(0, min - pad), max + pad);
    const f = frame(el, { days, ticks, tipRows: (i) => [{ label, value: values[i] == null ? 'chưa có' : fmt(values[i]), color }] });
    let d = '';
    let open = false;
    values.forEach((v, i) => {
      if (v == null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${f.xc(i)},${f.y(v)}`;
      open = true;
    });
    if (d) f.marks.append(svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // Chấm cho điểm đứng riêng và điểm cuối, kèm nhãn giá trị cuối
    values.forEach((v, i) => {
      if (v == null) return;
      const lone = values[i - 1] == null && values[i + 1] == null;
      const last = i === values.length - 1 || values.slice(i + 1).every((x) => x == null);
      if (!lone && !last) return;
      f.marks.append(svg('circle', { cx: f.xc(i), cy: f.y(v), r: 4, fill: color, class: 'dot' }));
      if (last) {
        const t = svg('text', { x: Math.min(f.xc(i), f.W - 20), y: f.y(v) - 10, 'text-anchor': 'end', class: 'end-label' });
        t.textContent = fmt(v);
        f.marks.append(t);
      }
    });
    f.s.setAttribute('aria-label', `${label} theo ngày, mới nhất ${fmt(known[known.length - 1])}`);
  }

  // Vẽ lại khi đổi cỡ cửa sổ
  const drawn = new Map();
  function remember(el, fn, opts) {
    drawn.set(el, [fn, opts]);
  }
  let resizeTimer = 0;
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        for (const [el, [fn, opts]] of drawn) if (el.isConnected && el.offsetParent) fn(el, opts);
      }, 150);
    });
  }

  root.Charts = { columns, diverging, line };
})(typeof self !== 'undefined' ? self : this);
