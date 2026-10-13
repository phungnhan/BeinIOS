// Kịch bản kiểm thử giao diện: mỗi kịch bản mở trang mới (dữ liệu mẫu trong stub.js) rồi bấm như người dùng.
// Lỗi JavaScript trong trang (exception, console.error) làm kịch bản trượt.

const B64_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TABS = ['overview', 'members', 'content', 'reports', 'compose', 'stats', 'settings', 'log'];

const toastText = (page) => page.ev(`[...document.querySelectorAll('.toast')].map((t) => t.textContent).pop() || ''`);
const confirmOk = async (page) => {
  await page.until(() => document.getElementById('confirm')?.open || !!document.getElementById('confirm-title').textContent);
  await page.ev(`document.getElementById('confirm-ok').click(); true`);
};
const setValue = (page, id, value) =>
  page.call(
    (i, v) => {
      const e = document.getElementById(i);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    id,
    value,
  );
// Chọn file ảnh giả cho một <input type=file>
const pickImage = (page, id, name = 'anh.png') =>
  page.call(
    (i, n, b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], n, { type: 'image/png' }));
      const input = document.getElementById(i);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      return true;
    },
    id,
    name,
    B64_PNG,
  );

export const scenarios = [
  {
    name: 'Mọi tab hiện được',
    async run({ page, url, assert }) {
      await page.open(url('dashboard'));
      for (const t of TABS) {
        await page.ev(`showTab(${JSON.stringify(t)}); true`);
        const info = await page.call((tab) => {
          const cards = [...document.querySelectorAll(`main > [data-tab="${tab}"]`)].filter((s) => !s.hidden);
          return { cards: cards.length, text: cards.reduce((n, c) => n + c.innerText.trim().length, 0) };
        }, t);
        assert.ok(info.cards > 0 && info.text > 20, `tab ${t} trống`);
      }
    },
  },
  {
    name: 'Popup',
    async run({ page, url, assert }) {
      await page.open(url('popup'), { width: 380, height: 600 });
      await page.until(() => document.getElementById('todo').children.length > 0);
      assert.ok(Number(await page.ev(`document.getElementById('flagged').textContent`)) > 0);
    },
  },
  {
    name: 'Đăng bài: nhắc tên rồi đăng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`document.querySelector('#compose-groups input[type=checkbox]').click(); true`);
      await page.call(() => {
        const ta = document.getElementById('compose-text');
        ta.focus();
        ta.value = 'Cảm ơn @ki';
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.dispatchEvent(new Event('input'));
        return true;
      });
      await page.until(() => document.querySelectorAll('#mention-pop .mention-item').length > 0);
      await page.ev(`document.getElementById('compose-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`);
      const v = await page.ev(`document.getElementById('compose-text').value`);
      assert.match(v, /^Cảm ơn @\w+ $/);
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__composes || []).length === 1);
      const m = await page.ev(`window.__composes[0]`);
      assert.equal(Object.keys(m.mentions).length, 1);
      assert.equal(m.scheduledAt, null);
    },
  },
  {
    name: 'Hẹn giờ: Giờ tốt nhất',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.call(() => {
        [...document.querySelectorAll('#compose-groups input[type=checkbox]')][1].click();
        const r = document.querySelector('input[name=compose-when][value=later]');
        r.checked = true;
        r.dispatchEvent(new Event('change'));
        return true;
      });
      assert.equal(await page.ev(`document.getElementById('btn-best-time').hidden`), false);
      await page.ev(`document.getElementById('btn-best-time').click(); true`);
      await page.until(() => document.querySelectorAll('#best-times button.best-chip').length > 0, 6000);
      const before = await page.ev(`document.getElementById('compose-at').value`);
      await page.ev(`document.querySelector('#best-times button.best-chip').click(); true`);
      const after = await page.ev(`document.getElementById('compose-at').value`);
      assert.ok(after && after !== before);
      assert.match(await page.ev(`document.getElementById('btn-compose').textContent`), /Hẹn giờ/);
    },
  },
  {
    name: 'Lịch tháng / tuần, nút +',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`loadScheduled(); true`);
      await page.until(() => sched.loaded);
      await page.ev(`document.querySelector('#sched-view button[data-f=month]').click(); true`);
      const m = await page.call(() => ({ days: document.querySelectorAll('#sched-cal .cal-day').length, items: document.querySelectorAll('#sched-cal .cal-item').length, list: document.getElementById('sched-list').hidden }));
      assert.ok(m.days >= 28 && m.items >= 5 && m.list);
      await page.call(() => {
        const days = [...document.querySelectorAll('#sched-cal .cal-day')].filter((d) => d.querySelector('.cal-add'));
        days.at(-1).querySelector('.cal-add').click();
        return true;
      });
      assert.equal(await page.ev(`document.querySelector('input[name=compose-when]:checked').value`), 'later');
      await page.ev(`document.querySelector('#sched-cal .cal-item').click(); true`);
      await page.until(() => document.querySelectorAll('#scheduled-body tr.flash').length === 1);
      assert.equal(await page.ev(`document.getElementById('sched-cal').hidden`), true);
    },
  },
  {
    name: 'Nhập CSV',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`readCsvFile(new File([BG.csvTemplate(csvGroups().slice(0, 2).map((g) => g.path))], 'mau.csv', { type: 'text/csv' })).then(() => true)`);
      const info = await page.call(() => ({ rows: document.querySelectorAll('#csv-body tr').length, bad: document.querySelectorAll('#csv-body tr.csv-bad').length, btn: document.getElementById('btn-csv-submit').textContent }));
      assert.deepEqual(info, { rows: 2, bad: 0, btn: 'Hẹn giờ 2 bài' });
      await page.ev(`document.getElementById('btn-csv-submit').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__composes || []).length === 2, 12000);
      assert.equal(await page.ev(`document.getElementById('btn-csv-submit').textContent`), 'Đã hẹn xong');
    },
  },
  {
    name: 'Article: trình soạn thảo',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      const sel = (text, s, e) =>
        page.call(
          (t, a, b) => {
            const ta = document.getElementById('art-content');
            ta.value = t;
            ta.focus();
            ta.setSelectionRange(a, b);
            ta.dispatchEvent(new Event('input'));
            return true;
          },
          text,
          s,
          e,
        );
      const click = (md) => page.ev(`document.querySelector('#art-toolbar button[data-md=${md}]').click(); true`);
      const val = () => page.ev(`document.getElementById('art-content').value`);
      await sel('Xin chào cả nhà', 4, 8);
      await click('bold');
      assert.equal(await val(), 'Xin **chào** cả nhà');
      await sel('Thị trường', 0, 0);
      await click('h2');
      assert.equal(await val(), '## Thị trường');
      await sel('Chữ', 3, 3);
      await click('table');
      assert.match(await val(), /\| Cột 1 \| Cột 2 \| Cột 3 \|\n\|---\|---\|---\|/);
      await sel('abc', 0, 3);
      await page.ev(`document.getElementById('art-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true })); true`);
      assert.equal(await val(), '++abc++');
      await page.ev(`document.querySelector('#art-view button[data-f=split]').click(); true`);
      await sel('## Mục\n- a\n| A | B |\n|---|---|\n| 1 | 2 |', 0, 0);
      const pv = await page.call(() => ({ split: document.getElementById('art-editor').classList.contains('split'), h2: document.querySelector('#art-preview h2')?.textContent, td: document.querySelectorAll('#art-preview td').length }));
      assert.deepEqual(pv, { split: true, h2: 'Mục', td: 2 });
    },
  },
  {
    name: 'Article hẹn giờ và Series',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`[...document.querySelectorAll('#art-groups input[type=checkbox]')][1].click(); true`);
      await setValue(page, 'art-title', 'Bản tin tuần');
      await setValue(page, 'art-content', '## Thị trường\nBTC tăng **8%**.');
      await page.until(() => document.querySelectorAll('#art-cats .art-chip').length > 0);
      await page.ev(`document.querySelector('#art-cats .art-chip').click(); true`);
      await pickImage(page, 'art-cover-file', 'bia.png');
      await page.call(() => {
        const r = document.querySelector('input[name=art-when][value=later]');
        r.checked = true;
        r.dispatchEvent(new Event('change'));
        return true;
      });
      await page.until(() => !document.getElementById('btn-art-submit').disabled);
      await page.ev(`document.getElementById('btn-art-submit').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__articles || []).length === 1, 6000);
      const a = await page.ev(`window.__articles[0]`);
      assert.equal(a.type, 'composeArticle');
      assert.ok(a.scheduledAt && a.categoryIds.length === 1 && a.coverId);
      assert.deepEqual(await page.ev(`window.__uploadResources`), ['article:cover']);
      // Series
      await page.ev(`document.querySelector('#article-mode button[data-f=series]').click(); true`);
      await setValue(page, 'art-title', 'Kiến thức ví');
      await pickImage(page, 'art-cover-file', 's.png');
      await page.until(() => !document.getElementById('btn-art-submit').disabled);
      await page.ev(`document.getElementById('btn-art-submit').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__articles || []).length === 2, 6000);
      assert.equal(await page.ev(`window.__articles[1].type`), 'composeSeries');
    },
  },
  {
    name: 'Sửa bài hẹn giờ',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`loadScheduled(); true`);
      await page.until(() => sched.loaded);
      const edits = await page.ev(`[...document.querySelectorAll('#scheduled-body button')].filter((b) => b.textContent === 'Sửa').length`);
      assert.equal(edits, 1); // chỉ bài của chính mình
      await page.ev(`[...document.querySelectorAll('#scheduled-body button')].find((b) => b.textContent === 'Sửa').click(); true`);
      await page.until(() => !!compose.edit?.scheduled);
      assert.equal(await page.ev(`document.getElementById('btn-compose').textContent`), 'Lưu bài hẹn giờ');
      assert.notEqual(await page.ev(`getComputedStyle(document.getElementById('compose-at')).display`), 'none');
      await setValue(page, 'compose-text', 'Nội dung đã sửa');
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await confirmOk(page);
      await page.until(() => !!window.__lastEditSched);
      const m = await page.ev(`window.__lastEditSched`);
      assert.deepEqual([m.type, m.content], ['editScheduled', 'Nội dung đã sửa']);
      assert.equal(await page.ev(`!!compose.edit`), false);
    },
  },
  {
    name: 'Tự duyệt bài tin cậy: cài đặt và nút ⭐',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      await page.ev(`document.getElementById('autoApprovePosts').click(); true`);
      await setValue(page, 'trustedMembers', '@Lan, kai');
      await setValue(page, 'trustAfterApproved', '5');
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.trustAfterApproved === 5 && o.settings.trustedMembers.length === 2 && o.settings.autoApprovePosts));
      await page.ev(`showTab('content'); true`);
      await page.ev(`[...document.querySelectorAll('#approval-body button')].find((b) => b.textContent === '⭐').click(); true`);
      await page.until(() => [...document.querySelectorAll('#approval-body .tag')].some((t) => t.textContent.includes('Tin cậy')));
      const list = await page.ev(`chrome.storage.local.get('settings').then((o) => o.settings.trustedMembers)`);
      assert.equal(list.length, 3);
    },
  },
  {
    name: 'Bộ mẫu chống lừa đảo, xuất quy tắc',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      await page.ev(`document.getElementById('btn-preset-scam').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      const checks = `[...document.querySelectorAll('#confirm-extra .preset-part > label input')]`;
      const impact = () => page.ev(`document.querySelector('#confirm-extra .preset-impact').textContent`);
      assert.equal(await page.ev(`document.querySelectorAll('#confirm-extra .preset-part').length`), 4);
      assert.deepEqual(await page.ev(`${checks}.map((c) => c.checked)`), [true, true, true, false]); // link rút gọn: mặc định không chọn
      assert.match(await impact(), /Sẽ thêm: 13 từ khoá vi phạm, 25 từ khoá cần xem, cần xem khi có liên hệ riêng\./); // "cam kết lợi nhuận" đã có
      // Bỏ phần từ khoá cần xem, sửa ô từ khoá vi phạm
      await page.ev(`${checks}[1].click(); true`);
      await page.ev(`(() => { const t = document.querySelector('#confirm-extra .preset-part textarea'); t.value = 'gửi trước nhận sau, Cam kết lợi nhuận, kèo lùa gà'; t.dispatchEvent(new Event('input')); return true; })()`);
      assert.match(await impact(), /Sẽ thêm: 2 từ khoá vi phạm, cần xem khi có liên hệ riêng\./);
      await confirmOk(page);
      await page.until(() => chrome.storage.local.get('postRules').then((o) => o.postRules.reviewContacts === true));
      const pr = await page.ev(`chrome.storage.local.get('postRules').then((o) => o.postRules)`);
      assert.deepEqual([pr.bannedKeywords, pr.blockedDomains, pr.reviewKeywords || []], [['cam kết lợi nhuận', 'gửi trước nhận sau', 'kèo lùa gà'], ['t.me', 'bit.ly'], []]);
      await page.until(() => document.getElementById('post-reviewContacts').checked && document.getElementById('post-bannedKeywords').value.includes('kèo lùa gà'));
      // Lần hai: không còn gì mới ở phần đã thêm
      await page.ev(`document.getElementById('btn-preset-scam').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      await page.ev(`${checks}[0].click(); ${checks}[1].click(); true`);
      assert.match(await impact(), /đã có đủ/);
      await page.ev(`document.querySelector('#confirm button[value=cancel]').click(); true`);
      // Xuất quy tắc: tệp sao lưu chỉ có quy tắc
      await page.ev(`window.__blobs = []; { const o = URL.createObjectURL; URL.createObjectURL = (b) => (window.__blobs.push(b), o(b)); } HTMLAnchorElement.prototype.click = function () {}; true`);
      await page.ev(`document.getElementById('btn-rules-export').click(); true`);
      await page.until(() => window.__blobs.length === 1);
      const file = JSON.parse(await page.ev(`window.__blobs[0].text()`));
      assert.equal(file.app, 'BeinGroup');
      assert.deepEqual([Object.keys(file.data).filter((k) => !['rules', 'postRules', 'groupRules'].includes(k)), file.data.postRules.reviewContacts], [[], true]);
    },
  },
  {
    name: 'Quản lý tag',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      await page.until(() => document.querySelectorAll('#tags-body tr').length > 0);
      assert.equal(await page.ev(`document.getElementById('btn-tag-create').disabled`), true); // community đầu không có quyền
      await setValue(page, 'tags-group', 'gCL');
      await page.until(() => !document.getElementById('btn-tag-create').disabled);
      const unlocked = await page.ev(`[...document.querySelectorAll('#tags-body button.danger')].filter((b) => !b.disabled).length`);
      assert.equal(unlocked, 2); // chỉ tag chưa dùng
      await setValue(page, 'tags-new', 'defi');
      await page.ev(`document.getElementById('btn-tag-create').click(); true`);
      assert.match(await toastText(page), /đã có tag DEFI/);
      await setValue(page, 'tags-new', 'phân tích');
      await page.ev(`document.getElementById('btn-tag-create').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__tagActs || []).length === 1);
      assert.deepEqual(await page.ev(`window.__tagActs[0]`), { type: 'tagAct', action: 'create', groupId: 'gCL', name: 'PHÂN TÍCH' });
      await page.until(() => document.getElementById('tags-count').textContent === '7 tag');
    },
  },
  {
    name: 'Lọc bài và Dọn tài khoản',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      await page.ev(`document.querySelector('#recent-filter button[data-f=all]').click(); true`);
      const rows = () => page.ev(`document.querySelectorAll('#recent-body tr:not(.empty-row)').length`);
      assert.equal(await rows(), 3);
      await setValue(page, 'recent-q', '@airdrop');
      assert.equal(await rows(), 1);
      await setValue(page, 'recent-q', '');
      await page.ev(`document.querySelector('#recent-body .cleanup-btn').click(); true`);
      // Hộp dọn: bài gần đây có sẵn, bài cũ tự tìm thêm; mọi mục được tick sẵn
      await page.until(() => document.querySelectorAll('#confirm-extra .pick-list .pick').length === 3);
      assert.equal(await page.ev(`document.querySelectorAll('#confirm-extra .pick-list input:checked').length`), 3);
      assert.match(await page.ev(`document.querySelector('#confirm-extra .pick-list').textContent`), /Bài cũ/);
      // Bỏ tick bài cũ thứ hai, bật cấm
      await page.ev(`document.querySelectorAll('#confirm-extra .pick-list input')[2].click(); true`);
      await page.ev(`document.querySelector('#confirm-extra label.check input').click(); true`);
      assert.match(await page.ev(`document.querySelector('#confirm-extra .pick-tools').textContent`), /Đã chọn 2\/3/);
      await confirmOk(page);
      await page.until(() => !!window.__cleanup);
      const m = await page.ev(`window.__cleanup`);
      assert.deepEqual([m.user.id, m.reasonType, m.ban, m.postIds, m.commentIds, m.posts.map((p) => p.id)], ['at1', 'SPAM', true, ['t1', 'old1'], [], ['old1']]);
      await page.until(() => document.querySelectorAll('#recent-body tr:not(.empty-row)').length === 2);
    },
  },
  {
    name: 'Tìm & dọn bài',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      await setValue(page, 'sweep-q', 'a');
      await page.ev(`document.getElementById('btn-sweep').click(); true`);
      assert.equal(await page.ev(`!!window.__sweepSearch`), false); // ít hơn 2 ký tự: không tìm
      await setValue(page, 'sweep-q', 'airdrop');
      await page.ev(`document.getElementById('btn-sweep').click(); true`);
      await page.until(() => document.querySelectorAll('#sweep-body tr').length === 5);
      assert.deepEqual(await page.ev(`window.__sweepSearch`), { type: 'sweepSearch', keyword: 'airdrop', groupId: '', days: 30 });
      // Không bài nào được chọn sẵn; bài của mình và của admin được đánh dấu giữ
      assert.equal(await page.ev(`document.querySelectorAll('#sweep-body input:checked').length`), 0);
      assert.equal(await page.ev(`document.querySelectorAll('#sweep-body tr.muted-row').length`), 2);
      assert.match(await page.ev(`document.getElementById('sweep-body').textContent`), /Bài của bạn[\s\S]*Admin/);
      assert.match(await page.ev(`document.getElementById('sweep-note').textContent`), /5 bài[\s\S]*2 bài .*được giữ/);
      // Người đăng nhiều nhất: nút dọn tài khoản
      assert.match(await page.ev(`document.getElementById('sweep-authors').textContent`), /Spam Bot \(2\)/);
      // Chọn tất cả: chỉ 3 bài không được giữ; bỏ bài của người mới
      await page.ev(`document.getElementById('sweep-check-all').click(); true`);
      assert.equal(await page.ev(`document.getElementById('sweep-selected').textContent`), 'Đã chọn 3');
      await page.ev(`[...document.querySelectorAll('#sweep-body tr')].find((r) => r.textContent.includes('testnet')).querySelector('input').click(); true`);
      assert.equal(await page.ev(`document.getElementById('btn-sweep-hide').textContent`), 'Ẩn 2 bài đã chọn');
      await page.ev(`document.getElementById('btn-sweep-hide').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      assert.match(await page.ev(`document.getElementById('confirm-dry').textContent`), /không hiện lại được/);
      await confirmOk(page);
      await page.until(() => !!window.__hidePosts);
      const m = await page.ev(`window.__hidePosts`);
      assert.deepEqual([m.posts.map((p) => p.id).sort(), m.reasonType], [['sw1', 'sw2'], 'SPAM']);
      await page.until(() => document.querySelectorAll('#sweep-body tr').length === 3);
      assert.equal(await page.ev(`document.getElementById('sweep-selected').textContent`), 'Đã chọn 0');
    },
  },
  {
    name: 'Hiệu quả bài đã đăng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      await page.ev(`showTab('stats'); true`);
      await page.until(() => document.querySelectorAll('#ins-body tr').length === 5);
      assert.ok((await page.ev(`document.querySelectorAll('#ins-best .best-chip').length`)) > 0);
      await page.ev(`document.querySelector('#ins-sort button[data-f=score]').click(); true`);
      assert.match(await page.ev(`document.querySelector('#ins-body tr td').innerText`), /Bản tin thị trường/);
      await page.ev(`document.getElementById('btn-ins-refresh').click(); true`);
      await page.until(() => [...document.querySelectorAll('.toast')].some((t) => /Đã cập nhật số liệu/.test(t.textContent)));
    },
  },
  {
    name: 'Báo cáo tháng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      const months = await page.ev(`[...document.querySelectorAll('#monthly-month option')].map((o) => [o.value, o.selected])`);
      assert.equal(months.length, 3);
      assert.deepEqual(months[1], [await page.ev(`BG.shiftMonth(BG.monthKey(), -1)`), true]); // mặc định tháng trước
      assert.equal(await page.ev(`document.getElementById('monthly-out').hidden`), true);
      await page.ev(`document.getElementById('btn-monthly-run').click(); true`);
      await page.until(() => !document.getElementById('monthly-out').hidden);
      assert.equal((await page.ev(`window.__monthly`)).groupId, 'gFood'); // community đầu tiên
      await setValue(page, 'monthly-group', 'gCL');
      assert.equal(await page.ev(`document.getElementById('monthly-out').hidden`), true); // đổi group: tạo lại
      await page.ev(`document.getElementById('btn-monthly-run').click(); true`);
      await page.until(() => !document.getElementById('monthly-out').hidden && window.__monthly.groupId === 'gCL');
      const info = await page.call(() => ({
        tiles: [...document.querySelectorAll('#monthly-tiles .stat-tile .value')].map((x) => x.textContent),
        posts: document.querySelectorAll('#monthly-posts tr').length,
        newAuthor: [...document.querySelectorAll('#monthly-authors tr')].some((tr) => /Người m1/.test(tr.textContent) && /Người mới/.test(tr.textContent)),
        text: document.getElementById('monthly-text').textContent,
      }));
      // 12361 hiện tại, sau tháng báo cáo có 1 người bị xoá => cuối tháng 12362; vào 5, rời 1 (m2 rời ngay ngày đầu)
      assert.deepEqual(info.tiles.slice(0, 4), ['12.362', '+5 / −1', '80%', '6']);
      assert.equal(info.posts, 5);
      assert.ok(info.newAuthor);
      assert.match(info.text, /^BeinGroup: báo cáo Tháng \d+\/\d{4} — Crypto Life\n• Thành viên: 12\.358 → 12\.362 \(\+4\)/);
      assert.match(info.text, /• Người mới trong tháng: 5 người · còn ở lại 4 \(80%\) · 1 tự rời · đã đăng bài 1/);
      assert.match(info.text, /• Bài viết: 6 bài \(tháng trước 4, \+50%\)/);
      await page.ev(`navigator.clipboard.writeText = async (t) => { window.__clip = t; }; document.getElementById('btn-monthly-copy').click(); true`);
      await page.until(() => window.__clip && /Đã sao chép báo cáo/.test([...document.querySelectorAll('.toast')].map((t) => t.textContent).join()));
      assert.equal(await page.ev(`window.__clip`), info.text);
      await page.ev(`document.getElementById('btn-monthly-tg').click(); true`);
      await page.until(() => !!window.__tgReport);
      const tg = await page.ev(`window.__tgReport`);
      assert.match(tg.title, /^BeinGroup: báo cáo Tháng \d+\/\d{4} — Crypto Life$/);
      assert.match(tg.text, /^• Thành viên:/);
      // Mở từ thông báo đầu tháng: tự tạo báo cáo tháng trước
      await page.open(url('dashboard', 'tab=stats&monthly=1'));
      await page.until(() => !!window.__monthly && !document.getElementById('monthly-out').hidden);
    },
  },
  {
    name: 'Thành viên mới có ở lại không',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      await setValue(page, 'ret-group', 'gCL');
      await page.ev(`document.querySelector('#ret-range button[data-f="60"]').click(); document.getElementById('btn-ret-run').click(); true`);
      await page.until(() => !document.getElementById('ret-out').hidden);
      assert.deepEqual(await page.ev(`window.__retention`), { type: 'retention', groupId: 'gCL', days: 60 });
      const info = await page.call(() => ({
        tiles: [...document.querySelectorAll('#ret-tiles .stat-tile .value')].map((x) => x.textContent),
        weeks: document.querySelectorAll('#ret-weeks tr').length,
        rows: document.querySelectorAll('#ret-body tr').length,
        status: [...document.querySelectorAll('#ret-body .tag')].map((t) => t.textContent),
        nudge: document.getElementById('btn-ret-nudge').textContent,
      }));
      assert.deepEqual(info.tiles, ['8', '75%', '83%', '–', '25%', '3']);
      assert.ok(info.weeks >= 4);
      assert.equal(info.rows, 8);
      assert.ok(info.status.includes('Tự rời trong ngày đầu') && info.status.includes('Bị xoá sau 9 ngày'));
      assert.match(info.nudge, /\(3\)$/);
      await page.ev(`document.querySelector('#ret-filter button[data-f="silent"]').click(); true`);
      assert.equal(await page.ev(`document.querySelectorAll('#ret-body tr').length`), 3);
      await page.ev(`document.querySelector('#ret-filter button[data-f="gone"]').click(); true`);
      assert.equal(await page.ev(`document.querySelectorAll('#ret-body tr').length`), 2);
      // Soạn bài nhắc người chưa hoạt động vào ô Đăng bài
      await page.ev(`document.getElementById('btn-ret-nudge').click(); true`);
      await page.until(() => currentTab === 'compose' && /@newbie1/.test(document.getElementById('compose-text').value));
      const c = await page.call(() => ({ text: document.getElementById('compose-text').value, groups: [...compose.groupIds], mentions: Object.keys(compose.mentions) }));
      assert.deepEqual(c.groups, ['gCL']);
      assert.ok(['newbie1', 'newbie6', 'newbie7'].every((k) => c.mentions.includes(k)));
      assert.match(c.text, /^Chào @newbie1, @newbie6, @newbie7 👋\n\nCác bạn vào Crypto Life/);
    },
  },
  {
    name: 'Việc đầu tuần',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=overview&digest=1'));
      await page.until(() => !document.getElementById('digest').classList.contains('is-off'));
      assert.equal(await page.ev(`document.querySelectorAll('#digest-list li').length`), 4);
      assert.match(await page.ev(`document.getElementById('digest-at').textContent`), /^4\/4 việc chưa làm/);
      // Làm việc "bài thảo luận": mở thẻ ở tab Đăng bài, đánh dấu xong
      await page.ev(`[...document.querySelectorAll('#digest-list button')].find((b) => b.textContent === 'Mở bài thảo luận').click(); true`);
      await page.until(() => currentTab === 'compose');
      await page.until(() => chrome.storage.local.get('periodicDigest').then((o) => o.periodicDigest.done.prompt === true));
      await page.ev(`showTab('overview'); true`);
      assert.match(await page.ev(`document.getElementById('digest-at').textContent`), /^3\/4 việc chưa làm/);
      assert.equal(await page.ev(`document.querySelectorAll('#digest-list li.done').length`), 1);
      // Xem tóm tắt: cuộn tới thẻ Tóm tắt hoạt động
      await page.ev(`[...document.querySelectorAll('#digest-list button')].find((b) => b.textContent === 'Xem tóm tắt').click(); true`);
      await page.until(() => document.querySelectorAll('#digest-list li.done').length === 2);
      // Ẩn
      await page.ev(`document.getElementById('btn-digest-hide').click(); true`);
      await page.until(() => document.getElementById('digest').classList.contains('is-off'));
      assert.equal(await page.ev(`chrome.storage.local.get('periodicDigest').then((o) => o.periodicDigest.dismissed)`), true);
    },
  },
  {
    name: 'Mục lục nhanh và thu gọn thẻ',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      await page.ev(`localStorage.removeItem('beingroup-folded'); true`);
      await page.open(url('dashboard', 'tab=stats'));
      const chips = await page.ev(`[...document.querySelectorAll('#tab-toc .toc-chip')].map((b) => b.textContent)`);
      assert.deepEqual(chips, ['Thống kê', 'Bài nổi bật', 'Người đăng tích cực', 'Giờ đăng tốt nhất', 'Báo cáo tháng', 'Thành viên mới có ở lại không?', 'Hiệu quả bài đã đăng qua addon', 'Thu gọn tất cả']);
      // Thu gọn một thẻ: chỉ còn tiêu đề, nhớ sau khi mở lại trang
      await page.ev(`document.querySelector('#monthly .card-fold').click(); true`);
      assert.deepEqual(await page.call(() => [document.getElementById('monthly').classList.contains('folded'), getComputedStyle(document.getElementById('monthly-note')).display, JSON.parse(localStorage.getItem('beingroup-folded'))]), [true, 'none', ['monthly']]);
      await page.open(url('dashboard', 'tab=stats'));
      assert.equal(await page.ev(`document.getElementById('monthly').classList.contains('folded')`), true);
      assert.equal(await page.ev(`[...document.querySelectorAll('#tab-toc .toc-chip.folded')].map((b) => b.textContent).join()`), 'Báo cáo tháng');
      // Bấm mục lục: mở thẻ và tới thẻ
      await page.ev(`[...document.querySelectorAll('#tab-toc .toc-chip')].find((b) => b.textContent === 'Báo cáo tháng').click(); true`);
      assert.deepEqual(await page.call(() => [document.getElementById('monthly').classList.contains('folded'), localStorage.getItem('beingroup-folded')]), [false, '[]']);
      // Thu gọn / mở tất cả
      await page.ev(`document.querySelector('#tab-toc .toc-all').click(); true`);
      assert.equal(await page.ev(`document.querySelectorAll('main section.card.folded').length`), 7);
      assert.equal(await page.ev(`document.querySelector('#tab-toc .toc-all').textContent`), 'Mở tất cả');
      await page.ev(`document.querySelector('#tab-toc .toc-all').click(); true`);
      assert.equal(await page.ev(`document.querySelectorAll('main section.card.folded').length`), 0);
      // Tiêu đề có huy hiệu số: mục lục chỉ lấy chữ
      await page.ev(`showTab('overview'); true`);
      assert.ok((await page.ev(`[...document.querySelectorAll('#tab-toc .toc-chip')].map((b) => b.textContent)`)).includes('Việc cần làm'));
      // Tab ít thẻ (Thành viên: 2 thẻ): không có mục lục
      await page.ev(`showTab('members'); true`);
      assert.equal(await page.ev(`document.getElementById('tab-toc').hidden`), true);
      await page.ev(`localStorage.removeItem('beingroup-folded'); true`);
    },
  },
  {
    name: 'Bắt đầu nhanh khi cài mới',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=overview&fresh=1'));
      await page.until(() => document.getElementById('onboard').open);
      assert.equal(await page.ev(`document.getElementById('whatsnew').open`), false);
      assert.match(await page.ev(`document.getElementById('onb-login').textContent`), /^✓ Đã kết nối\. Addon thấy \d+ group bạn quản trị: Food Research, Crypto Life/);
      assert.equal(await page.ev(`document.getElementById('onb-back').hidden`), true);
      // Bước 2: tự kiểm tra
      await page.ev(`document.getElementById('onb-next').click(); true`);
      assert.equal(await page.ev(`document.getElementById('onb-progress').textContent`), 'Bước 2/3');
      await page.ev(`document.getElementById('onb-check-group').value = 'gCL'; document.getElementById('onb-check-run').click(); true`);
      await page.until(() => /^4 dùng được · 1 bỏ qua \(không có quyền\) · 1 lỗi: Bài ghim — xem chi tiết/.test(document.getElementById('onb-check-out').textContent));
      assert.deepEqual(await page.ev(`window.__selfCheck`), { type: 'selfCheck', groupId: 'gCL' });
      // Bước 3: chọn tính năng (giữ Chạy thử, bật bài nhắc và bài thảo luận cho Crypto Life)
      await page.ev(`document.getElementById('onb-next').click(); true`);
      const f = await page.call(() => [...document.querySelectorAll('#onb-features input')].map((x) => x.checked));
      assert.deepEqual(f, [true, true, true, false, false, false, false]); // theo cài đặt đang có: báo cáo, tự kiểm tra, nhắc chào bật; tự động khác tắt
      assert.equal(await page.ev(`document.getElementById('onb-dry').checked`), true);
      await page.ev(`document.querySelector('#onb-features input[data-i="3"]').click(); document.querySelector('#onb-features input[data-i="4"]').click(); document.getElementById('onb-group').value = 'gCL'; document.getElementById('onb-next').click(); true`);
      await page.until(() => !document.getElementById('onboard').open);
      const st = await page.ev(`chrome.storage.local.get(['settings', 'onboarded', 'seenVersion']).then((o) => ({ ...o, version: chrome.runtime.getManifest().version }))`);
      assert.deepEqual([st.settings.nudgeWeekly, st.settings.nudgeGroupId, st.settings.promptWeekly, st.settings.promptGroupId, st.settings.dryRun, st.onboarded, st.seenVersion], [true, 'gCL', true, 'gCL', true, true, st.version]);
      assert.equal(await page.ev(`document.getElementById('whatsnew').open`), false);
      // Mở lại ở chân trang, bỏ qua được
      await page.ev(`document.getElementById('btn-onboard').click(); true`);
      await page.until(() => document.getElementById('onboard').open && document.getElementById('onb-progress').textContent === 'Bước 1/3');
      await page.ev(`document.getElementById('onb-skip').click(); true`);
      await page.until(() => !document.getElementById('onboard').open);
    },
  },
  {
    name: 'Bắt đầu nhanh: hỏi gửi báo cáo sử dụng (mặc định không)',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=overview&fresh=1&usage=1'));
      await page.until(() => document.getElementById('onboard').open);
      await page.ev(`document.getElementById('onb-next').click(); document.getElementById('onb-next').click(); true`);
      await page.until(() => !document.getElementById('onb-usage-row').hidden);
      assert.equal(await page.ev(`document.getElementById('onb-usage').checked`), false);
      await page.ev(`window.__permRequests = 0; document.getElementById('onb-next').click(); true`);
      await page.until(() => !document.getElementById('onboard').open);
      await page.until(() => chrome.storage.local.get('usageConsent').then((o) => o.usageConsent?.choice === 'no'));
      assert.deepEqual(await page.call(() => [window.__permRequests, window.__usageSends || 0, document.getElementById('usage-consent').open]), [0, 0, false]);
    },
  },
  {
    name: 'Có gì mới sau khi cập nhật',
    async run({ page, url, assert }) {
      // Đã xem tới v0.22.0: hiện các bản mới hơn, mới nhất trước
      await page.open(url('dashboard', 'tab=overview&seen=0.22.0'));
      await page.until(() => document.getElementById('whatsnew').open);
      const info = await page.call(() => ({
        title: document.getElementById('whatsnew-title').textContent,
        heads: [...document.querySelectorAll('#whatsnew-body h4')].map((h) => h.textContent),
        items: document.querySelectorAll('#whatsnew-body li').length,
        bold: !!document.querySelector('#whatsnew-body li b, #whatsnew-body li strong'),
      }));
      const version = await page.ev(`chrome.runtime.getManifest().version`);
      assert.equal(info.title, `BeinGroup đã cập nhật lên v${version}`);
      assert.ok(info.heads[0].startsWith(`v${version} — `));
      assert.ok(info.heads.every((h) => !/^v0\.(22|21|20)\./.test(h)));
      assert.ok(info.items >= 3 && info.bold);
      await page.ev(`document.getElementById('whatsnew-ok').click(); true`);
      // sự kiện close chạy sau khi hộp đóng: chờ tới khi bản đã xem được ghi
      await page.until((v) => !document.getElementById('whatsnew').open && chrome.storage.local.get('seenVersion').then((o) => o.seenVersion === v), 4000, version);
      // Link cuối trang: xem lại 3 bản mới nhất
      await page.ev(`document.getElementById('btn-whatsnew').click(); true`);
      await page.until(() => document.getElementById('whatsnew').open && document.querySelectorAll('#whatsnew-body h4').length === 3);
      // Đang dùng bản mới nhất thì không tự hiện
      await page.open(url('dashboard', 'tab=overview'));
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(await page.ev(`document.getElementById('whatsnew').open`), false);
    },
  },
  {
    name: 'Nhắc người mới: bản soạn sẵn, soạn hằng tuần, hiệu quả',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats&nudge=1'));
      await page.until(() => !document.getElementById('nudge-draft').hidden);
      assert.match(await page.ev(`document.getElementById('nudge-draft-title').textContent`), /3 người mới chưa hoạt động ở Crypto Life/);
      assert.match(await page.ev(`document.getElementById('nudge-draft-sub').textContent`), /@thanhvienmoi0, @thanhvienmoi1, @thanhvienmoi2$/);
      assert.equal(await page.ev(`document.getElementById('ret-group').value`), 'gCL');
      // Hiệu quả các lần nhắc: chưa đo -> bấm Đo hiệu quả
      assert.equal(await page.ev(`document.querySelectorAll('#nudge-effect-body tr').length`), 2);
      assert.match(await page.ev(`document.getElementById('nudge-effect-body').textContent`), /bấm Đo hiệu quả/);
      await page.ev(`document.getElementById('btn-nudge-effect').click(); true`);
      await page.until(() => /1 \(50%\)/.test(document.getElementById('nudge-effect-body').textContent));
      assert.match(await page.ev(`document.getElementById('nudge-effect-body').textContent`), /1 đăng bài · 1 bình luận · sau 9 ngày/);
      // Bật soạn sẵn hằng tuần cho group đang chọn
      await page.ev(`document.getElementById('nudge-weekly').click(); true`);
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.nudgeWeekly === true && o.settings.nudgeGroupId === 'gCL'));
      assert.match(await page.ev(`document.getElementById('nudge-weekly-note').textContent`), /đang bật/);
      // Group khác: công tắc tắt, ghi rõ đang bật cho group nào
      await setValue(page, 'ret-group', 'gFood');
      assert.deepEqual(await page.call(() => [document.getElementById('nudge-weekly').checked, document.getElementById('nudge-weekly-note').textContent]), [false, '(đang bật cho Crypto Life)']);
      // Mở bản soạn sẵn trong ô Đăng bài rồi đăng: gửi kèm danh sách người được nhắc
      await page.ev(`document.getElementById('btn-nudge-open').click(); true`);
      await page.until(() => currentTab === 'compose' && /@thanhvienmoi2/.test(document.getElementById('compose-text').value));
      assert.deepEqual(await page.ev(`compose.nudge`), { groupId: 'gCL', userIds: ['nd0', 'nd1', 'nd2'] });
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__composes || []).length === 1);
      const m = await page.ev(`window.__composes[0]`);
      assert.deepEqual([m.groupIds, m.nudge.userIds, Object.keys(m.mentions).sort()], [['gCL'], ['nd0', 'nd1', 'nd2'], ['thanhvienmoi0', 'thanhvienmoi1', 'thanhvienmoi2']]);
      await page.until(() => compose.nudge === null);
      // Bỏ qua bản soạn sẵn
      await page.ev(`showTab('stats'); document.getElementById('btn-nudge-skip').click(); true`);
      await page.until(() => document.getElementById('nudge-draft').hidden);
      assert.equal(await page.ev(`chrome.storage.local.get('nudgeDraft').then((o) => o.nudgeDraft ?? null)`), null);
    },
  },
  {
    name: 'Bài thảo luận hằng tuần',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose&prompt=1'));
      await page.until(() => !document.getElementById('prompt-draft').hidden);
      const info = await page.call(() => ({
        title: document.getElementById('prompt-draft-title').textContent,
        text: document.getElementById('prompt-draft-text').textContent,
        sub: document.getElementById('prompt-draft-sub').textContent,
        perf: [...document.querySelectorAll('#prompt-perf tr')].map((tr) => tr.querySelector('td').textContent.slice(0, 20)),
        count: document.getElementById('prompt-count').textContent,
      }));
      assert.equal(info.title, '📬 Bài thảo luận tuần này cho Crypto Life');
      assert.match(info.sub, /^Gợi ý đăng lúc .* \(giờ có tương tác tốt nhất theo bài của bạn\)$/);
      assert.equal(info.count, '4');
      assert.equal(info.perf.length, 2); // câu đã dùng, điểm cao trước (bài ps1 > ps2)
      assert.match(info.perf[0], /^Nếu chỉ được giữ/);
      // Đổi câu khác: không lặp lại câu vừa bỏ, không chọn câu vừa dùng ở group
      await page.ev(`document.getElementById('btn-prompt-other').click(); true`);
      await page.until(() => /Người mới vào crypto nên học điều gì đầu tiên\? Góp ý cho các thành viên mới của Crypto Life/.test(document.getElementById('prompt-draft-text').textContent));
      // Mở trong ô Đăng bài: hẹn giờ theo gợi ý, gửi kèm câu hỏi đã dùng
      await page.ev(`document.getElementById('btn-prompt-open').click(); true`);
      await page.until(() => /Người mới vào crypto/.test(document.getElementById('compose-text').value));
      assert.deepEqual(await page.call(() => [document.querySelector('input[name=compose-when]:checked').value, !!document.getElementById('compose-at').value, compose.prompt, [...compose.groupIds]]), ['later', true, { id: 'd4' }, ['gCL']]);
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__composes || []).length === 1);
      const m = await page.ev(`window.__composes[0]`);
      assert.deepEqual([m.prompt, !!m.scheduledAt], [{ id: 'd4' }, true]);
      // Soạn ngay cho group khác; sửa kho
      await page.ev(`document.getElementById('prompt-group').value = 'gFood'; document.getElementById('prompt-group').dispatchEvent(new Event('change')); document.getElementById('btn-prompt-now').click(); true`);
      await page.until(() => /Tuần này bạn đang theo dõi/.test(document.getElementById('compose-text').value));
      await setValue(page, 'prompt-bank', 'Câu một\nCâu hai\n\nCâu một');
      await page.ev(`document.getElementById('btn-prompt-save').click(); true`);
      await page.until(() => chrome.storage.local.get('promptBank').then((o) => o.promptBank.items.length === 2));
      // Bật soạn sẵn hằng tuần
      await page.ev(`document.getElementById('prompt-weekly').click(); true`);
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.promptWeekly === true && o.settings.promptGroupId === 'gFood'));
      // Bỏ qua bản soạn sẵn
      await page.ev(`document.getElementById('btn-prompt-skip').click(); true`);
      await page.until(() => document.getElementById('prompt-draft').hidden);
    },
  },
  {
    name: 'Mở từ thông báo việc đầu tuần',
    async run({ page, url }) {
      await page.open(url('dashboard', 'tab=compose&welcome=1'));
      await page.until(() => window.__msgs.some((m) => m.type === 'newMembers') && currentTab === 'compose');
    },
  },
  {
    name: 'Telegram: lưu cài đặt có nút xử lý',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      await page.ev(`document.getElementById('tg-enabled').click(); true`);
      await setValue(page, 'tg-token', '123456789:' + 'B'.repeat(35));
      await page.ev(`document.getElementById('btn-tg-chat').click(); true`);
      await page.until(() => !!document.getElementById('tg-chat').value);
      await page.ev(`document.getElementById('tg-actions').click(); document.getElementById('btn-tg-save').click(); true`);
      await page.until(() => chrome.storage.local.get('telegram').then((o) => !!o.telegram?.actions));
      const t = await page.ev(`chrome.storage.local.get('telegram').then((o) => o.telegram)`);
      assert.deepEqual([t.enabled, t.actions, !!t.chatId], [true, true, true]);
    },
  },
  {
    name: 'Việc cần làm',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=overview'));
      await page.until(() => document.querySelectorAll('#todo-list .todo-item').length >= 3);
    },
  },
  {
    name: 'Việc chờ lâu',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      assert.deepEqual(await page.ev(`[document.getElementById('remindPending').checked, document.getElementById('pendingHours').value]`), [true, '24']);
      // Yêu cầu tham gia gửi 30 giờ trước: quá 24 giờ
      await page.ev(`chrome.storage.local.get('state').then(({ state }) => { state.snapshot.groups[0].requests[0].createdAt = new Date(Date.now() - 30 * 3600e3).toISOString(); return chrome.storage.local.set({ state }); }).then(() => true)`);
      // Mở từ thông báo: Việc cần làm lọc sẵn Chờ lâu
      await page.ev(`location.hash = 'tab=overview&todo=overdue'; true`);
      await page.until(() => document.querySelector('#todo-filter button[data-f=overdue]').classList.contains('active'));
      await page.until(() => document.querySelectorAll('#todo-list .todo-item').length === 1);
      assert.match(await page.ev(`document.querySelector('#todo-list .todo-item').textContent`), /Xin vào group[\s\S]*⏳ chờ 30 giờ/);
      assert.equal(await page.ev(`document.getElementById('tcnt-overdue').textContent`), '(1)');
      // Đổi thành 48 giờ: không còn việc chờ lâu
      await page.ev(`showTab('settings'); true`);
      await setValue(page, 'pendingHours', '48');
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.pendingHours === 48));
      await page.ev(`showTab('overview'); true`);
      await page.until(() => /chờ quá 48 giờ/.test(document.getElementById('todo-list').textContent));
    },
  },
  {
    name: 'Tự kiểm tra',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=log'));
      await page.until(() => /Chưa chạy lần nào/.test(document.getElementById('check-body').textContent));
      // Tự kiểm tra mỗi ngày: bật sẵn, ghi lần tự chạy gần nhất và mục ngừng chạy; tắt được
      assert.equal(await page.ev(`document.getElementById('check-daily').checked`), true);
      assert.match(await page.ev(`document.getElementById('check-daily-note').textContent`), /^\(lần gần nhất .* · 2 community · ngừng chạy: Food Research: Bài ghim\)$/);
      await page.ev(`document.getElementById('check-daily').click(); true`);
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.selfCheckDaily === false));
      await setValue(page, 'check-group', 'gCL');
      await page.ev(`document.getElementById('btn-check-run').click(); true`);
      await page.until(() => document.querySelectorAll('#check-body tr:not(.empty-row)').length === 6);
      assert.deepEqual(await page.ev(`window.__selfCheck`), { type: 'selfCheck', groupId: 'gCL' });
      const info = await page.call(() => ({
        tags: [...document.querySelectorAll('#check-body .tag')].map((t) => t.textContent),
        note: document.getElementById('check-note').textContent,
      }));
      assert.deepEqual(info.tags, ['✓ Dùng được', '✓ Dùng được', '✓ Dùng được', '✓ Dùng được', 'Bỏ qua', '✗ Lỗi']);
      assert.match(info.note, /^Crypto Life · lúc .* · 4 dùng được · 1 bỏ qua · 1 lỗi\. Bấm Sao chép kết quả/);
      await page.ev(`navigator.clipboard.writeText = async (t) => { window.__clip = t; }; document.getElementById('btn-check-copy').click(); true`);
      await page.until(() => !!window.__clip);
      const clip = await page.ev(`window.__clip`);
      assert.match(clip.split('\n')[0], /^BeinGroup v\d+\.\d+\.\d+ · .* · tự kiểm tra Crypto Life lúc /);
      assert.match(clip, /\n✗ Bài ghim: Không thấy API \(404\) — Beincom có thể đã đổi đường dẫn \[404 content\/contents\/pinned-content\/groups\/gCL\]$/);
      // Gửi về Telegram: tiêu đề có tên group và số lỗi, nội dung là bản chữ đầy đủ
      await page.ev(`document.getElementById('btn-check-tg').click(); true`);
      await page.until(() => !!window.__tgReport);
      const tg = await page.ev(`window.__tgReport`);
      assert.deepEqual([tg.title, tg.text], ['BeinGroup: tự kiểm tra Crypto Life — 1 lỗi', clip]);
      await page.until(() => [...document.querySelectorAll('.toast')].some((t) => /Đã gửi kết quả kiểm tra về Telegram/.test(t.textContent)));
    },
  },
  {
    name: 'Báo cáo sử dụng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=log'));
      await page.until(() => /báo cáo sử dụng 30 ngày/.test(document.getElementById('usage-text').textContent));
      assert.equal(await page.ev(`document.getElementById('usage-share').hidden`), true); // bản này chưa có nơi nhận
      assert.equal(await page.ev(`document.getElementById('usage-consent').open`), false);
      const t = await page.ev(`document.getElementById('usage-text').textContent`);
      assert.match(t, /\n• Dùng từ 2026-09-20 · 2 ngày có dùng trong 30 ngày · quản trị 2 community, \d+ group\n/);
      assert.match(t, /\n• Tính năng dùng: Duyệt \/ từ chối thành viên 5 · Đăng \/ hẹn giờ bài 4 · Xem thống kê 2\n/);
      assert.match(t, /\n• Tự kiểm tra gần nhất: chưa chạy$/);
      for (const name of ['Crypto Life', 'Food Research', 'keovip', 'airdrop']) assert.ok(!t.includes(name), 'lộ ' + name);
      // Ghi chú: hiện ngay trong báo cáo và nhớ cho lần sau
      await setValue(page, 'usage-note', 'Lan — admin thử');
      await page.until(() => / · Lan — admin thử\n/.test(document.getElementById('usage-text').textContent));
      await page.ev(`navigator.clipboard.writeText = async (x) => { window.__clip = x; }; document.getElementById('btn-usage-copy').click(); true`);
      await page.until(() => !!window.__clip);
      assert.equal(await page.ev(`window.__clip`), await page.ev(`document.getElementById('usage-text').textContent`));
      await page.ev(`document.getElementById('btn-usage-tg').click(); true`);
      await page.until(() => !!window.__tgReport);
      assert.match((await page.ev(`window.__tgReport`)).title, /^BeinGroup v\d+\.\d+\.\d+ · .* · Lan — admin thử$/);
      assert.equal(await page.ev(`chrome.storage.local.get('usageNote').then((o) => o.usageNote)`), 'Lan — admin thử');
    },
  },
  {
    name: 'Báo cáo sử dụng: hỏi ý rồi tự gửi mỗi tuần',
    async run({ page, url, assert }) {
      // Có nơi nhận, chưa hỏi: hiện hộp với đúng nội dung sẽ gửi
      await page.open(url('dashboard', 'tab=log&usage=1'));
      await page.until(() => document.getElementById('usage-consent').open);
      await page.until(() => document.getElementById('usage-consent-text').textContent === document.getElementById('usage-text').textContent && /báo cáo sử dụng 30 ngày/.test(document.getElementById('usage-text').textContent));
      // Đồng ý: xin quyền Google Script, lưu đồng ý + mã ngẫu nhiên, gửi lần đầu
      await page.ev(`window.__permRequests = 0; document.getElementById('usage-yes').click(); true`);
      await page.until(() => window.__usageSends === 1);
      const c = await page.ev(`chrome.storage.local.get('usageConsent').then((o) => o.usageConsent)`);
      assert.equal(c.choice, 'yes');
      assert.match(c.installId, /^[0-9a-f-]{36}$/);
      assert.equal(await page.ev(`window.__permRequests`), 1);
      await page.until(() => !document.getElementById('usage-share').hidden && /lần gửi gần nhất/.test(document.getElementById('usage-auto-note').textContent));
      assert.equal(await page.ev(`document.getElementById('usage-auto').checked`), true);
      // Gửi ngay; tắt
      await page.ev(`document.getElementById('btn-usage-send').click(); true`);
      await page.until(() => window.__usageSends === 2);
      await page.ev(`document.getElementById('usage-auto').click(); true`);
      await page.until(() => chrome.storage.local.get('usageConsent').then((o) => o.usageConsent.choice === 'no' && o.usageConsent.installId.length === 36));
      await page.until(() => document.getElementById('usage-auto-note').textContent === '(đang tắt)');
      // Lần khác: không gửi
      await page.open(url('dashboard', 'tab=log&usage=1'));
      await page.until(() => document.getElementById('usage-consent').open);
      await page.ev(`document.getElementById('usage-no').click(); true`);
      await page.until(() => chrome.storage.local.get('usageConsent').then((o) => o.usageConsent?.choice === 'no'));
      assert.equal(await page.ev(`window.__usageSends || 0`), 0);
      assert.equal(await page.ev(`document.getElementById('usage-consent').open`), false);
    },
  },
  {
    name: 'Lỗi kỹ thuật',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=log'));
      await page.until(() => document.querySelectorAll('#diag-body tr:not(.empty-row)').length === 2);
      await page.ev(`navigator.clipboard.writeText = async (t) => { window.__clip = t; }; document.getElementById('btn-diag-copy').click(); true`);
      await page.until(() => [...document.querySelectorAll('.toast')].some((t) => /Đã sao chép báo cáo 2 lỗi/.test(t.textContent)));
      const clip = await page.ev(`window.__clip`);
      assert.match(clip.split('\n')[0], /^BeinGroup v\d+\.\d+\.\d+ · .* · 2 lỗi$/);
      assert.equal(clip.split('\n').filter((l) => /^\d\d:\d\d \d\d\/\d\d \[/.test(l)).length, 2);
      // Lỗi JavaScript của trang được ghi lại (lỗi cố ý nên bỏ khỏi danh sách lỗi của kịch bản)
      await page.ev(`setTimeout(() => { throw new Error('lỗi thử nghiệm'); }); true`);
      await page.until(() => chrome.storage.local.get('diagLog').then((o) => o.diagLog.some((e) => /lỗi thử nghiệm/.test(e.message))));
      page.problems.length = 0;
      await page.ev(`document.getElementById('btn-diag-reload').click(); true`);
      await page.until(() => document.querySelectorAll('#diag-body tr:not(.empty-row)').length === 3);
      await page.ev(`document.getElementById('btn-diag-clear').click(); true`);
      await page.until(() => document.querySelectorAll('#diag-body tr.empty-row').length === 1);
      assert.ok(true);
    },
  },
  {
    name: 'Màn hình điện thoại: không tràn ngang',
    async run({ page, url, assert }) {
      await page.open(url('dashboard'), { width: 390, height: 844, mobile: true });
      for (const t of TABS) {
        await page.ev(`showTab(${JSON.stringify(t)}); true`);
        const w = await page.ev(`document.documentElement.scrollWidth`);
        assert.ok(w <= 392, `tab ${t} rộng ${w}px`);
      }
    },
  },
];
