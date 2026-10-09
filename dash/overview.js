// Dashboard — tab Tổng quan: bảng group, cài đặt group.

// ---------- Bảng group ----------

function onOff(v) {
  return el('span', { class: 'tag ' + (v ? 'ok' : 'info'), text: v ? 'Bật' : 'Tắt' });
}

// Báo cáo chờ xử lý (chỉ group gốc của community mình làm admin) + bài bị Beincom gắn cờ
function reportCell(g) {
  if (!g.reportIds && !g.flaggedIds) return el('td', { class: 'num', text: '–' });
  const [r, f] = [g.reportIds?.length || 0, g.flaggedIds?.length || 0];
  const parts = [g.reportIds ? `${r} báo cáo chờ xử lý` : '', `${f} bài bị gắn cờ`].filter(Boolean);
  return el('td', { class: 'num' + (r + f ? ' count-hot' : ''), title: parts.join(', '), text: String(r + f) });
}

function renderGroups() {
  const body = $('groups-body');
  body.replaceChildren();
  const gs = groups();
  if (!gs.length) {
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 9, text: data.state.snapshot ? 'Không có group nào' : 'Chưa có dữ liệu' })));
    return;
  }
  for (const g of gs) {
    const links = el(
      'td',
      { class: 'links' },
      g.canApprove ? el('a', { href: BG.memberRequestsUrl(g), target: '_blank', text: 'Yêu cầu tham gia ↗' }) : null,
      g.approvalCount != null ? el('a', { href: BG.contentApprovalUrl(g.communityId), target: '_blank', text: 'Duyệt bài ↗' }) : null,
      g.communityId ? el('a', { href: BG.groupUrl(g), target: '_blank', text: 'Trang group ↗' }) : null,
    );
    const errors = [g.error, g.approvalError, g.timelineError].filter(Boolean);
    const tr = el(
      'tr',
      { class: g.id === selectedGroupId ? 'selected' : null, title: 'Xem yêu cầu tham gia của group này' },
      el(
        'td',
        { class: 'gcell' + (g.isCommunity ? '' : ` sub lvl-${Math.min(3, Math.max(1, g.level || 1))}`) },
        el('div', { class: 'gname', text: g.name }),
        el('div', { class: 'gpath', text: g.isCommunity ? 'Community' : `Group con của ${g.communityName || 'community'}` }),
        errors.map((x) => el('div', { class: 'tag err', text: x })),
      ),
      el('td', { text: BG.roleLabel(g.roles) }),
      el('td', { class: 'num', text: g.userCount != null ? g.userCount.toLocaleString('vi-VN') : '–' }),
      el('td', {}, g.settings ? onOff(g.settings.isJoinApproval) : '–'),
      el('td', {}, g.settings ? onOff(g.settings.contentApproval) : '–'),
      el('td', { class: 'num' + (g.pendingTotal ? ' count-hot' : ''), text: g.canApprove ? String(g.pendingTotal || 0) : '–' }),
      el('td', { class: 'num' + (g.approvalCount ? ' count-hot' : ''), text: g.approvalCount != null ? String(g.approvalCount) : '–' }),
      reportCell(g),
      links,
    );
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      selectGroup(g.id);
      showTab('members');
    });
    body.append(tr);
  }
}

// ---------- Cài đặt group ----------

const gset = { data: {}, loading: false, loaded: false, errors: [] };
const selectedGs = new Set();

function gsGroups() {
  return groups().filter((g) => !g.error);
}

async function loadGroupSettings() {
  const ids = gsGroups().map((g) => g.id);
  if (!ids.length || gset.loading) return;
  gset.loading = true;
  renderGroupSettings();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'groupSettings', groupIds: ids });
    if (r?.status === 'ok') {
      gset.data = { ...gset.data, ...r.settings };
      gset.errors = r.errors || [];
      gset.loaded = true;
    } else gset.errors = [r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Có lỗi'];
  } finally {
    gset.loading = false;
    renderGroupSettings();
  }
}

// Lý do không bấm được ô này: quyền theo lần quét, hoặc Beincom khoá cài đặt
function gsDenied(g, key) {
  return BG.settingDenied(g, key) || gset.data[g.id]?.locked?.[key] || '';
}

function renderGroupSettings() {
  const keys = Object.keys(BG.GROUP_SETTINGS);
  const gs = gsGroups();
  const sel = $('gsettings-key');
  if (!sel.options.length) sel.replaceChildren(...keys.map((k) => el('option', { value: k, text: BG.GROUP_SETTINGS[k].label })));
  $('gsettings-note').textContent = gset.loading ? 'Đang tải…' : gset.errors.join('; ') || (gset.loaded ? '' : 'Bấm "Tải lại" để xem');
  $('gsettings-head').replaceChildren(el('tr', {}, el('th', { class: 'cb' }), el('th', { text: 'Group' }), keys.map((k) => el('th', { class: 'gs-col', title: BG.GROUP_SETTINGS[k].hint, text: BG.GROUP_SETTINGS[k].label }))));
  pruneSelection(selectedGs, new Set(gs.map((g) => g.id)));
  const bulk = () => renderBulk({ set: selectedGs, shown: gs, idOf: (g) => g.id, checkAll: 'gsettings-check-all', countEl: 'gsettings-selected', buttons: ['btn-gsettings-on', 'btn-gsettings-off'] });
  const body = $('gsettings-body');
  body.replaceChildren();
  if (!gs.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: keys.length + 2, text: data.state.snapshot ? 'Không có group nào' : 'Chưa quét' })));
  for (const g of gs) {
    const vals = gset.data[g.id]?.values;
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selectedGs, g.id, g.name, bulk)),
        el('td', { class: 'gcell' + (g.isCommunity ? '' : ` sub lvl-${Math.min(3, Math.max(1, g.level || 1))}`) }, el('div', { class: 'gname', text: g.name }), el('div', { class: 'gpath', text: g.isCommunity ? 'Community' : `Group con của ${g.communityName || 'community'}` })),
        keys.map((k) => {
          if (!vals) return el('td', { class: 'gs-col muted', text: gset.loading ? '…' : '–' });
          const on = !!vals[k];
          const why = gsDenied(g, k);
          return el(
            'td',
            { class: 'gs-col' },
            el('button', {
              type: 'button',
              class: 'gs-toggle' + (on ? ' on' : ''),
              disabled: busy || !!why,
              title: why || `${BG.GROUP_SETTINGS[k].label}: đang ${on ? 'bật' : 'tắt'} — bấm để ${on ? 'tắt' : 'bật'}`,
              'aria-pressed': on ? 'true' : 'false',
              text: on ? 'Bật' : 'Tắt',
              onclick: () => actGroupSetting(k, !on, [g]),
            }),
          );
        }),
      ),
    );
  }
  bulk();
}

async function actGroupSetting(key, value, list) {
  if (busy) return;
  const spec = BG.GROUP_SETTINGS[key];
  const denied = list.filter((g) => gsDenied(g, key));
  const same = list.filter((g) => !gsDenied(g, key) && gset.data[g.id] && !!gset.data[g.id].values[key] === !!value);
  const targets = list.filter((g) => !denied.includes(g) && !same.includes(g));
  if (!targets.length) {
    const why = [same.length ? `${same.length} group đã ${value ? 'bật' : 'tắt'} sẵn` : '', denied.length ? `${denied.length} group không đổi được (${gsDenied(denied[0], key)})` : ''].filter(Boolean).join(', ');
    return toast(`Không có group nào cần đổi "${spec.label}": ${why}`, same.length && !denied.length ? 'ok' : 'err');
  }
  // Tắt duyệt thành viên: Beincom tự duyệt các yêu cầu đang chờ
  const autoApprove = key === 'isJoinApproval' && !value ? targets.reduce((n, g) => n + (g.pendingTotal || 0), 0) : 0;
  const skipped = [denied.length ? `${denied.length} group không có quyền` : '', same.length ? `${same.length} group đã ${value ? 'bật' : 'tắt'} sẵn` : ''].filter(Boolean).join(', ');
  const ok = await confirmDialog({
    title: `${value ? 'Bật' : 'Tắt'} "${spec.label}" cho ${targets.length} group?`,
    text: `Khi bật: ${spec.hint.charAt(0).toLowerCase() + spec.hint.slice(1)}.` + (skipped ? ` Bỏ qua: ${skipped}.` : ''),
    names: targets.map((g) => groupPath(g) + (key === 'isJoinApproval' && !value && g.pendingTotal ? ` — ${g.pendingTotal} yêu cầu đang chờ sẽ được TỰ DUYỆT` : '')),
    okText: value ? 'Bật' : 'Tắt',
    danger: autoApprove > 0,
    sendNote: (autoApprove ? `⚠ Beincom sẽ tự duyệt ${autoApprove} yêu cầu tham gia đang chờ. ` : '') + 'Sẽ gửi lên Beincom ngay.',
  });
  if (!ok) return;
  const r = await send({ type: 'groupSettingAct', key, value, groupIds: targets.map((g) => g.id) }, (n) => `Đã ${value ? 'bật' : 'tắt'} "${spec.label}" cho ${n} group.`);
  for (const id of r?.done || []) if (gset.data[id]) gset.data[id] = { ...gset.data[id], values: { ...gset.data[id].values, [key]: !!value } };
  if ((r?.done || []).length && key === 'isJoinApproval' && !value) refreshPart('groups'); // các yêu cầu đã được tự duyệt
  renderGroupSettings();
}


// Sự kiện
$('gsettings-check-all').addEventListener('change', (e) => {
  for (const g of gsGroups()) e.target.checked ? selectedGs.add(g.id) : selectedGs.delete(g.id);
  renderGroupSettings();
});
const pickedGs = () => gsGroups().filter((g) => selectedGs.has(g.id));
$('btn-gsettings-on').addEventListener('click', () => actGroupSetting($('gsettings-key').value, true, pickedGs()));
$('btn-gsettings-off').addEventListener('click', () => actGroupSetting($('gsettings-key').value, false, pickedGs()));

// ---------- Tóm tắt hoạt động (7 / 30 ngày) ----------

let weeklyDays = 7;

function currentReport() {
  return BG.weeklyReport(
    { log: data.log, profiles: data.profiles, recentPosts: data.state.recentPosts, recentComments: data.settings.scanComments ? data.state.recentComments : [], memberHistory: data.state.memberHistory, groups: groups(), ctx: rulesCtx() },
    { days: weeklyDays },
  );
}

// Ô Thành viên: chỉ liệt kê group có số thành viên thay đổi (tăng xanh, giảm đỏ), group không đổi thì gộp lại
const MEMBER_SHOW = 5;
function memberDetail(members) {
  if (!members.length) return 'chưa có số liệu (addon ghi sau mỗi lần quét)';
  const n = (x) => Number(x || 0).toLocaleString('vi-VN');
  const changed = members.filter((m) => m.change).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const same = members.length - changed.length;
  const rows = changed.slice(0, MEMBER_SHOW).map((m) =>
    el('div', { class: 'w-chg', title: `${m.name}: ${n(m.start)} → ${n(m.end)} thành viên` }, m.name + ' ', el('b', { class: m.change > 0 ? 'up' : 'down', text: (m.change > 0 ? '+' : '−') + n(Math.abs(m.change)) }), el('span', { class: 'w-total', text: ` (${n(m.end)})` })),
  );
  if (changed.length > MEMBER_SHOW) rows.push(el('div', { text: `… và ${changed.length - MEMBER_SHOW} group khác có thay đổi` }));
  if (!changed.length) rows.push(el('div', { text: 'Không group nào thay đổi' }));
  if (same && changed.length) rows.push(el('div', { text: `${same} group không đổi` }));
  return rows;
}

function renderWeekly() {
  setSegActive('weekly-range', String(weeklyDays));
  const r = currentReport();
  const a = r.actions;
  const n = (x) => Number(x || 0).toLocaleString('vi-VN');
  const memberChange = r.members.reduce((s, m) => s + m.change, 0);
  const items = [
    ['Thành viên', r.members.length ? (memberChange > 0 ? '+' : memberChange < 0 ? '−' : '±') + n(Math.abs(memberChange)) : '–', memberDetail(r.members), false, memberChange > 0 ? 'up' : memberChange < 0 ? 'down' : ''],
    ['Duyệt thành viên', n(a.approved + a.autoApproved), `${n(a.autoApproved)} tự động · ${n(a.declined + a.autoDeclined)} từ chối`],
    ['Xoá / cấm thành viên', n(a.removed + a.banned), `${n(a.removed)} xoá · ${n(a.banned)} cấm · ${n(a.unbanned)} gỡ cấm`],
    ['Kiểm duyệt bài', n(a.postsApproved + a.postsRejected + a.postsHidden + a.postsDeleted), `${n(a.postsApproved)} duyệt · ${n(a.postsRejected)} từ chối · ${n(a.postsHidden)} ẩn · ${n(a.postsDeleted)} xoá`],
    ['Báo cáo đã xử lý', n(a.reportsHandled), `${n(a.commentsHidden)} bình luận đã ẩn`],
    ['Phát hiện vi phạm', n(r.detected.posts + r.detected.comments), `${n(r.detected.posts)} bài · ${n(r.detected.comments)} bình luận`, r.detected.posts + r.detected.comments > 0],
    ['Đăng bài qua addon', n(a.published + a.scheduled), `${n(a.published)} đăng · ${n(a.scheduled)} hẹn giờ`],
    ['Thao tác lỗi', n(a.errors), 'xem tab Nhật ký', a.errors > 0],
  ];
  $('weekly-grid').replaceChildren(
    ...items.map(([label, value, sub, hot, tone]) =>
      el('div', { class: 'weekly-item' + (hot ? ' hot' : '') }, el('div', { class: 'w-label', text: label }), el('div', { class: 'w-value' + (tone ? ' ' + tone : ''), text: value }), el('div', { class: 'w-sub' }, sub)),
    ),
  );
  $('weekly-violators').replaceChildren(
    ...(r.violators.length
      ? [el('b', { text: 'Vi phạm nhiều nhất: ' }), ...r.violators.flatMap((v, i) => [i ? ', ' : '', el('span', { text: `${v.user.fullname || v.user.username || '?'} (${v.count} lần: ${v.types.join(', ')})` })])]
      : []),
  );
  $('weekly-note').textContent = `Từ ${fmtTime(r.from)} đến nay, theo nhật ký addon, số thành viên addon ghi sau mỗi lần quét và hồ sơ vi phạm. Việc làm trực tiếp trên web Beincom không có trong nhật ký addon.`;
}

onSeg('weekly-range', (f) => {
  weeklyDays = Number(f);
  renderWeekly();
});
$('btn-weekly-copy').addEventListener('click', async () => {
  const text = BG.reportText(currentReport());
  try {
    await navigator.clipboard.writeText(text);
    toast('Đã sao chép tóm tắt.');
  } catch {
    toast('Không sao chép được — dùng Tải tệp .txt', 'err');
  }
});
$('btn-weekly-file').addEventListener('click', () => download(`beingroup-tom-tat-${weeklyDays}-ngay-${BG.vnDay()}.txt`, BG.reportText(currentReport()), 'text/plain;charset=utf-8'));
