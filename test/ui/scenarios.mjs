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
      // Chưa có gói số đếm (vừa nâng cấp): tính tại chỗ một lần, nhờ nền ghi gói
      await page.open(url('popup'), { width: 380, height: 600 });
      await page.until(() => document.getElementById('todo').children.length > 0);
      assert.ok(Number(await page.ev(`document.getElementById('flagged').textContent`)) > 0);
      assert.ok(await page.ev(`window.__msgs.some((m) => m.type === 'refreshBadge')`));
      // Có gói: chỉ đọc gói (không đọc kết quả quét), không nhờ nền tính lại
      await page.open(url('popup', 'pinfo=1'), { width: 380, height: 600 });
      await page.until(() => document.getElementById('requests').textContent === '17');
      const v = await page.call(() => ({ posts: document.getElementById('posts').textContent, flagged: document.getElementById('flagged').textContent, todo: [...document.querySelectorAll('#todo li a')].map((a) => a.textContent), status: document.getElementById('status').textContent, asked: window.__msgs.some((m) => m.type === 'refreshBadge') }));
      assert.deepEqual(v, { posts: '4', flagged: '3', todo: ['Bài mới vi phạm quy tắc', 'Báo cáo vi phạm', 'Crypto Life'], status: 'Có việc cần xử lý', asked: false });
      // Nền ghi gói mới -> popup vẽ lại
      await page.ev(`chrome.storage.local.get('popupInfo').then(({ popupInfo }) => chrome.storage.local.set({ popupInfo: { ...popupInfo, totals: { ...popupInfo.totals, requests: 0 } } })).then(() => true)`);
      await page.until(() => document.getElementById('requests').textContent === '0');
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
    name: 'Ẩn nhiều bài: chia đợt, tiến độ, Dừng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      // Nghỉ 59 giây giữa hai thao tác => mỗi lệnh 2 bài (khoảng 2 phút)
      await page.ev(`chrome.storage.local.get('settings').then(({ settings }) => chrome.storage.local.set({ settings: { ...settings, actionDelaySec: 59 } })).then(() => true)`);
      await page.until(() => data.settings.actionDelaySec === 59);
      await setValue(page, 'sweep-q', 'airdrop');
      await page.ev(`document.getElementById('btn-sweep').click(); true`);
      await page.until(() => document.querySelectorAll('#sweep-body tr').length === 5);
      await page.ev(`document.getElementById('sweep-check-all').click(); true`);
      await page.ev(`document.getElementById('btn-sweep-hide').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      await confirmOk(page);
      // Đợt 1 (2 bài): thanh tiến độ theo từng bài
      await page.until(() => !document.getElementById('bulk-run').hidden && /: 1\/3$/.test(document.getElementById('bulk-run-text').textContent));
      await page.until(() => /: 2\/3$/.test(document.getElementById('bulk-run-text').textContent) && (window.__hideCalls || []).length === 1);
      assert.deepEqual(await page.ev(`window.__hideCalls`), [['sw1', 'sw2']]);
      // Đang nghỉ trước đợt 2: bấm Dừng
      await page.ev(`document.getElementById('btn-bulk-stop').click(); true`);
      await page.until(() => document.getElementById('bulk-run').hidden && /Đã dừng: xong 2, còn 1 mục chưa làm/.test([...document.querySelectorAll('.toast')].map((t) => t.textContent).join()));
      assert.equal((await page.ev(`window.__hideCalls`)).length, 1);
      assert.ok(await page.ev(`window.__msgs.some((m) => m.type === 'cancelActions')`));
      // Bài chưa làm vẫn còn trong danh sách
      await page.until(() => document.querySelectorAll('#sweep-body tr').length === 3);
    },
  },
  {
    name: 'Bộ mẫu chống lừa đảo, xuất quy tắc',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      await page.until(() => /^💽 Bộ nhớ addon đang dùng: [\d,]+ MB \(không giới hạn\)\. Chi tiết ở Nhật ký/.test(document.getElementById('storage-usage').textContent));
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
      // Đội admin theo nhật ký Beincom
      assert.equal(info.tiles[6], '7 tin'); // Chat
      assert.match(info.text, /• Chat: 7 tin nhắn \(tháng trước 4, \+75%\) · 3 người nhắn/);
      assert.equal(info.tiles[7], '2 admin');
      assert.deepEqual(await page.ev(`[...document.querySelectorAll('#monthly-team tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()).slice(1, 8))`), [['3', '–', '–', '–', '–', '–', '–'], ['–', '–', '1', '–', '–', '–', '1']]);
      assert.match(await page.ev(`document.getElementById('monthly-team').textContent`), /Kai Crypto[\s\S]*Bạn/);
      assert.match(await page.ev(`document.getElementById('monthly-changes').textContent`), /Admin Hà — Đổi cài đặt — Duyệt thành viên: tắt → bật · Crypto Life/);
      assert.match(info.text, /• Đội admin \(nhật ký Beincom, cả việc làm trên web\): Kai Crypto \(@kaicrypto\): 3 duyệt vào · Admin Hà \(@adminha\): 1 xoá, 1 đổi cài đặt/);
      assert.match(info.text, /• Đổi cài đặt \/ quyền admin: \d\d\/\d\d Admin Hà — Đổi cài đặt — Duyệt thành viên: tắt → bật \(Crypto Life\)/);
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
    name: 'Lên đầu trang',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      assert.equal(await page.ev(`document.getElementById('to-top').hidden`), true);
      await page.ev(`window.scrollTo(0, 1500); true`);
      await page.until(() => !document.getElementById('to-top').hidden);
      await page.ev(`document.getElementById('to-top').click(); true`);
      await page.until(() => window.scrollY === 0 && document.getElementById('to-top').hidden);
      assert.equal(await page.ev(`document.activeElement.dataset.tab`), 'content'); // phím Tab quay về thanh tab
      // Đổi tab: tab mới mở từ đầu trang
      await page.ev(`window.scrollTo(0, 1500); true`);
      await page.until(() => window.scrollY > 0);
      await page.ev(`document.querySelector('#tabs [data-tab=stats]').click(); true`);
      await page.until(() => window.scrollY === 0);
      // Mở từ thông báo tới một thẻ giữa tab: vẫn cuộn tới đúng thẻ
      await page.ev(`showTab('content'); window.scrollTo(0, 1500); openMonthly(); true`);
      await page.until(() => Math.abs(document.getElementById('monthly').getBoundingClientRect().top) < 200);
    },
  },
  {
    name: 'Bảo vệ community',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=members'));
      // Dữ liệu mẫu: 2 admin, 1 đợt vào ồ ạt (35 người, 30 phút trước), 2 tài khoản giống admin
      await page.ev(`(() => {
        const now = Date.now();
        const u = (i, extra = {}) => ({ id: 'j' + i, username: 'nguoimoi' + i, fullname: 'Người mới ' + i, avatar: i % 3 ? '' : 'https://media.beincom.com/a.jpg', ...extra });
        return chrome.storage.local.get('state').then(({ state }) => chrome.storage.local.set({ state: { ...state,
          admins: { at: now, ids: ['gCL'], byGroup: { gCL: [{ id: 'me1', username: 'kaicrypto', fullname: 'Kai Crypto', avatar: '' }, { id: 'aHa', username: 'adminha', fullname: 'Hà Crypto', avatar: '' }] } },
          recentJoins: { gCL: Array.from({ length: 35 }, (_, i) => ({ id: 'e' + i, time: new Date(now - (30 + i) * 60e3).toISOString(), user: u(i) })) },
          bursts: { gCL: { at: now - 30 * 60e3, groupId: 'gCL', groupName: 'Crypto Life', minutes: 60, count: 31, noAvatar: 21, from: now - 89 * 60e3, to: now - 30 * 60e3, dismissed: false } },
          impostors: [
            { key: 'cCL:i1', user: { id: 'i1', username: 'kai_crypto_vn', fullname: 'Kai Crypt0', avatar: '' }, groupId: 'gCL', groupName: 'Crypto Life', communityId: 'cCL', level: 'bad', reason: 'Tên giống hệt admin Kai Crypto (@kaicrypto)', at: new Date(now - 3600e3).toISOString(), source: 'join' },
            { key: 'cCL:i2', user: { id: 'i2', username: 'lanmod', fullname: 'Lan Mod', avatar: '' }, groupId: 'gCL', groupName: 'Crypto Life', communityId: 'cCL', level: 'review', reason: 'Tên có chữ "mod"', at: new Date(now - 7200e3).toISOString(), source: 'search' },
          ] } }));
      })().then(() => true)`);
      await page.until(() => document.querySelectorAll('#guard-imps tr').length === 2 && document.querySelectorAll('#guard-bursts .guard-burst').length === 1);
      assert.match(await page.ev(`document.getElementById('guard-note').textContent`), /so tên với 2 admin \(Kai Crypto, Hà Crypto\)/);
      assert.match(await page.ev(`document.getElementById('guard-bursts').textContent`), /31 người vào Crypto Life trong 60 phút.*21 người không có ảnh đại diện/);
      assert.equal(await page.ev(`document.getElementById('guard').classList.contains('has-urgent')`), true);
      assert.match(await page.ev(`document.querySelector('#guard-imps tr').textContent`), /Kai Crypt0[\s\S]*Rất giống[\s\S]*Tên giống hệt admin Kai Crypto/);
      // Xem người vừa vào: chọn người không có ảnh -> Xoá khỏi community (hộp xác nhận có sẵn)
      await page.ev(`[...document.querySelectorAll('#guard-bursts button')].find((b) => /^Xem 35 người vừa vào$/.test(b.textContent)).click(); true`);
      await page.until(() => document.querySelectorAll('.guard-joiners tr').length === 35);
      await page.ev(`[...document.querySelectorAll('.guard-joiners button')].find((b) => b.textContent === 'Chọn người không có ảnh').click(); true`);
      await page.until(() => document.querySelectorAll('.guard-joiners input:checked').length === 23);
      await page.ev(`[...document.querySelectorAll('.guard-joiners button')].find((b) => b.textContent === 'Xoá khỏi community').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      assert.match(await page.ev(`document.getElementById('confirm-title').textContent`), /Xoá 23 thành viên khỏi community/);
      await page.ev(`document.querySelector('#confirm button[value=cancel]').click(); true`);
      // Không phải: bỏ khỏi danh sách
      await page.ev(`[...document.querySelectorAll('#guard-imps tr')][1].querySelector('button:last-child').click(); true`);
      await page.until(() => (window.__guardActs || []).length === 1 && document.querySelectorAll('#guard-imps tr').length === 1);
      assert.deepEqual(await page.ev(`window.__guardActs[0]`), { type: 'guardAct', action: 'notImpostor', userIds: ['i2'] });
      // Việc cần làm có đợt vào ồ ạt và tài khoản giống admin
      await page.ev(`showTab('overview'); true`);
      await page.until(() => /Đợt vào ồ ạt/.test(document.getElementById('todo-list').textContent) && /Giống admin/.test(document.getElementById('todo-list').textContent));
      // Tìm trong toàn bộ thành viên
      await page.ev(`openGuard(); document.getElementById('btn-guard-search').click(); true`);
      await page.until(() => /Đã xem 42 thành viên có tên giống 2 admin/.test(document.getElementById('guard-search-note').textContent));
      // Bỏ đợt vào ồ ạt
      await page.ev(`[...document.querySelectorAll('#guard-bursts button')].find((b) => b.textContent === 'Bỏ qua').click(); true`);
      await page.until(() => !document.querySelector('#guard-bursts .guard-burst'));
    },
  },
  {
    name: 'Chat Beincom',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      assert.match(await page.ev(`document.getElementById('chat-note').textContent`), /^Chưa bật/);
      // Dữ liệu mẫu: 2 kênh (xoá được tin ở kênh chính), 6 tin (1 vi phạm, 3 tin cùng link lạ), tin nhắn riêng chưa đọc
      await page.ev(`(() => {
        const now = Date.now();
        const t = (min) => new Date(now - min * 60e3).toISOString();
        const u = (n, name) => ({ id: 'u' + n, chatId: 'cu' + n, username: 'user' + n, fullname: name, avatar: '' });
        const msg = (id, ch, user, text, min) => ({ id, channelId: ch, groupId: ch === 'chMain' ? 'gCL' : 'gGen', groupName: ch === 'chMain' ? 'Crypto Life' : 'Crypto Life - General', teamName: 'crypto-life', createdAt: t(min), text, link: '', files: 0, rootId: '', user });
        return chrome.storage.local.get(['settings', 'state']).then(({ settings, state }) => chrome.storage.local.set({
          settings: { ...settings, chatEnabled: true, chatScan: true, chatUnread: true },
          state: { ...state,
            chatMap: { at: now, me: { chatId: 'cu1', id: 'me1', username: 'kaicrypto' }, dmTeam: { id: 'tDM', name: 'direct' }, teams: [{ id: 'tCL', name: 'crypto-life', communityId: 'cCL' }],
              channels: [{ id: 'chMain', teamId: 'tCL', teamName: 'crypto-life', communityId: 'cCL', groupId: 'gCL', name: 'Crypto Life', type: 'O', canDelete: true, canPost: true }, { id: 'chSub', teamId: 'tCL', teamName: 'crypto-life', communityId: 'cCL', groupId: 'gGen', name: 'Crypto Life - General', type: 'P', canDelete: false, canPost: false }] },
            chatMessages: [
              msg('c1', 'chMain', u(60, 'Kèo VIP'), 'Vào nhóm kèo tại t.me/keovip nhé', 10),
              msg('c2', 'chMain', u(61, 'Lan Anh'), 'Chào mọi người', 20),
              ...[62, 63, 64].map((n, i) => msg('w' + i, 'chMain', u(n, 'Người ' + n), 'Nhận quà miễn phí tại claim-bic.xyz/go nhanh tay nhé', 30 + i)),
              msg('s1', 'chSub', u(65, 'Minh'), 'Ai có link t.me/nhom không', 40),
            ],
            chatUnread: { at: now, mentions: 2, dms: [{ channelId: 'dm1', type: 'D', otherId: 'cu50', unread: 2, mentions: 0, lastPostAt: now - 5 * 60e3, user: { fullname: 'Lan Anh', username: 'lananh' }, url: 'https://group.beincom.com/chat-home?teamName=direct&channel=dm1' }] },
          } }));
      })().then(() => true)`);
      await page.until(() => document.querySelectorAll('#chat-body tr:not(.empty-row)').length === 2); // Cần xử lý: 2 tin có link t.me (tên miền cấm)
      assert.equal(await page.ev(`document.getElementById('chcnt-all').textContent`), '(6)');
      await page.ev(`document.querySelector('#chat-filter button[data-f=all]').click(); true`);
      await page.until(() => document.querySelectorAll('#chat-body tr:not(.empty-row)').length === 6);
      assert.match(await page.ev(`document.getElementById('chat-note').textContent`), /2 kênh chat .*\(1 kênh bạn xoá được tin\)/);
      assert.match(await page.ev(`document.getElementById('chat-unread').textContent`), /✉ 2 tin nhắn riêng chưa đọc từ Lan Anh · 🔔 Bạn được nhắc tên 2 lần trong kênh chat · Mở trang Chat ↗/);
      assert.match(await page.ev(`document.getElementById('chat-waves').textContent`), /Đợt spam trong chat.*claim-bic\.xyz\/go.*3 tài khoản/);
      // Chỉ kênh có quyền mới có nút Xoá tin
      const rows = await page.ev(`[...document.querySelectorAll('#chat-body tr')].map((tr) => [tr.children[3].textContent, [...tr.querySelectorAll('button')].some((b) => b.textContent === 'Xoá tin')])`);
      assert.deepEqual(rows.find((r) => r[0] === 'Crypto Life - General'), ['Crypto Life - General', false]);
      assert.ok(rows.filter((r) => r[0] === 'Crypto Life').every((r) => r[1]));
      // Xoá tin vi phạm: hộp xác nhận ghi rõ mất hẳn
      await page.ev(`[...document.querySelectorAll('#chat-body tr')].find((tr) => tr.textContent.includes('t.me/keovip')).querySelector('button.danger').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      assert.equal(await page.ev(`document.getElementById('confirm-title').textContent`), 'Xoá 1 tin nhắn trong chat?');
      assert.match(await page.ev(`document.getElementById('confirm-dry').textContent`), /mất hẳn/);
      await confirmOk(page);
      await page.until(() => (window.__chatActs || []).some((a) => a.action === 'delete'));
      assert.deepEqual(await page.ev(`window.__chatActs.find((a) => a.action === 'delete')`), { type: 'chatAct', action: 'delete', ids: ['c1'] });
      await page.until(() => /\(1\)/.test(document.getElementById('chcnt-deleted').textContent));
      // Việc cần làm: tin nhắn riêng chưa đọc
      await page.ev(`showTab('overview'); true`);
      await page.until(() => /Tin nhắn riêng/.test(document.getElementById('todo-list').textContent));
      // Đăng bài: chọn Crypto Life -> ô gửi kèm vào kênh chat
      await page.ev(`showTab('compose'); true`);
      await page.ev(`[...document.querySelectorAll('#compose-groups label')].find((l) => l.querySelector('span')?.textContent === 'Crypto Life').querySelector('input').click(); true`);
      await page.until(() => !document.getElementById('compose-chat-row').hidden && /Gửi vào kênh chat: Crypto Life\./.test(document.getElementById('compose-chat-hint').textContent));
      await page.ev(`document.getElementById('compose-chat').click(); true`);
      await page.until(() => !document.getElementById('compose-chat-text').hidden);
      await setValue(page, 'compose-chat-text', 'Mời mọi người đọc');
      await setValue(page, 'compose-text', 'Bản tin thị trường tuần này');
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await page.until(() => document.getElementById('confirm').open);
      assert.match(await page.ev(`document.getElementById('confirm-text').textContent`), /Gửi kèm vào kênh chat/);
      await confirmOk(page);
      await page.until(() => !!window.__lastCompose);
      assert.deepEqual(await page.ev(`window.__lastCompose.chat`), { text: 'Mời mọi người đọc' });
      // Hẹn giờ: không gửi kèm được
      await page.ev(`document.querySelector('input[name=compose-when][value=later]').click(); true`);
      await page.until(() => document.getElementById('compose-chat').disabled && /Chỉ khi Đăng ngay/.test(document.getElementById('compose-chat-hint').textContent));
      // Cài đặt: tắt rồi bật lại -> xin quyền chat.beincom.com, đọc chat lần đầu
      await page.ev(`showTab('settings'); document.getElementById('chatEnabled').click(); true`);
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.chatEnabled === false));
      const before = await page.ev(`window.__permRequests || 0`);
      await page.ev(`document.getElementById('chatEnabled').click(); true`);
      await page.until(() => (window.__chatRefresh || 0) >= 1);
      assert.ok((await page.ev(`window.__permRequests || 0`)) > before);
    },
  },
  {
    name: 'Trang Chat',
    async run({ page, url, assert }) {
      // Chưa bật: nút Kết nối, bấm thì xin quyền và bật
      await page.open(url('chat'));
      await page.until(() => !document.getElementById('btn-enable').hidden && document.getElementById('empty-title').textContent === 'Kết nối Chat Beincom');
      await page.ev(`document.getElementById('btn-enable').click(); true`);
      await page.until(() => document.querySelectorAll('#list .item').length === 4);
      assert.ok((await page.ev(`window.__permRequests || 0`)) >= 1);
      // Đã bật, mở thẳng kênh trong địa chỉ
      await page.open(url('chat', 'chat=1&c=chMain'));
      await page.until(() => document.querySelectorAll('#msg-list .msg').length === 5); // bình luận (n3) nằm trong thread
      const info = await page.call(() => ({
        sections: [...document.querySelectorAll('.sec-title')].map((x) => x.textContent),
        sel: document.querySelector('.item.sel .item-title')?.textContent,
        title: document.getElementById('conv-title').textContent,
        sub: document.getElementById('conv-sub').textContent,
        days: [...document.querySelectorAll('.day')].map((x) => x.textContent),
        divider: !!document.querySelector('.unread-line'),
        mine: document.querySelectorAll('.msg.me').length,
        sys: [...document.querySelectorAll('.sys')].map((x) => x.textContent),
        mention: !!document.querySelector('.msg.mentioned .mention.mine'),
        bold: document.querySelector('.msg.mentioned b')?.textContent,
        link: document.querySelector('.bubble a')?.getAttribute('href'),
        quote: document.querySelector('.quote')?.textContent,
        files: [...document.querySelectorAll('.file-chip span')].map((x) => x.textContent),
        unreadChip: document.getElementById('cnt-unread').textContent,
        doc: document.title,
      }));
      assert.deepEqual(info.sections, ['Tin nhắn riêng', 'Crypto Life']);
      assert.deepEqual([info.sel, info.title], ['Crypto Life', 'Crypto Life']);
      assert.match(info.sub, /Crypto Life · kênh chung · bạn là admin kênh/);
      assert.deepEqual(info.days, ['Hôm qua', 'Hôm nay']);
      assert.ok(info.divider);
      assert.equal(info.mine, 1);
      assert.deepEqual(info.sys, ['tuan đã vào kênh']);
      assert.ok(info.mention);
      assert.equal(info.bold, 'ví lạnh');
      assert.equal(info.link, 'https://group.beincom.com/posts/abc');
      assert.equal(await page.ev(`document.querySelector('#m-n2 .tbar-n').textContent`), '1 bình luận');
      assert.deepEqual(info.files, ['bieu-do.png', 'bao-cao.pdf']);
      await page.until(() => (window.__chatRead || 0) >= 1); // mở kênh: đánh dấu đã đọc
      // Gửi tin: Enter
      await page.ev(`(() => { const t = document.getElementById('text'); t.value = 'Tối nay 20h nhé'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
      await page.until(() => (window.__chatSends || []).length === 1 && document.querySelectorAll('#msg-list .msg').length === 6);
      assert.deepEqual(await page.ev(`window.__chatSends[0]`), { type: 'chatSend', channelId: 'chMain', message: 'Tối nay 20h nhé', rootId: '' });
      assert.equal(await page.ev(`document.getElementById('text').value`), '');
      // Bình luận một tin: mở thread, gửi kèm mã tin gốc; tin hiện "1 bình luận"
      await page.ev(`[...[...document.querySelectorAll('#msg-list .msg')].find((x) => x.textContent.includes('Mọi người xem bài')).querySelectorAll('.tools button')].find((b) => b.textContent === 'Bình luận').click(); true`);
      await page.until(() => !document.getElementById('thread').hidden);
      await page.ev(`(() => { const t = document.getElementById('t-text'); t.value = 'Cảm ơn em'; t.dispatchEvent(new Event('input')); document.getElementById('t-send').click(); return true; })()`);
      await page.until(() => (window.__chatSends || []).length === 2 && document.querySelector('#m-n1 .tbar-n')?.textContent === '1 bình luận');
      assert.equal(await page.ev(`window.__chatSends[1].rootId`), 'n1');
      await page.ev(`document.getElementById('t-close').click(); true`);
      // Tin mới của người khác hiện sau lần đọc lại (4 giây)
      await page.ev(`window.__chatIncoming = [{ id: 'in1', channelId: 'chMain', user: { id: 'u70', chatId: 'cu70', username: 'moi', fullname: 'Người mới', pictureAt: 0 }, createAt: Date.now(), updateAt: Date.now() + 1, editAt: 0, deleted: false, system: false, message: 'Xin chào cả nhà!', rootId: '', replyCount: 0, pinned: false, files: [] }]; true`);
      await page.until(() => [...document.querySelectorAll('.bubble')].some((b) => b.textContent.includes('Xin chào cả nhà!')), 9000);
      // Tải tin cũ hơn
      await page.ev(`document.getElementById('older').click(); true`);
      await page.until(() => [...document.querySelectorAll('.bubble')].some((b) => b.textContent.includes('Tin cũ hơn nữa')));
      // Xoá tin của mình: hộp hỏi
      await page.ev(`[...document.querySelectorAll('#msg-list .msg.me')].find((x) => x.textContent.includes('AMA')).querySelector('.tools .del').click(); true`);
      await page.until(() => document.getElementById('ask').open);
      assert.equal(await page.ev(`document.getElementById('ask-title').textContent`), 'Xoá tin nhắn của bạn?');
      await page.ev(`document.getElementById('ask-ok').click(); true`);
      await page.until(() => (window.__chatDeletes || []).length === 1 && document.querySelectorAll('.msg.deleted').length === 1);
      assert.deepEqual(await page.ev(`[window.__chatDeletes[0].postId, window.__chatDeletes[0].own]`), ['o2', true]);
      // Kênh chỉ xem: không gõ được
      await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Hỏi đáp')).click(); true`);
      await page.until(() => document.getElementById('text').disabled && /chỉ xem/.test(document.getElementById('text').placeholder));
      // Tìm và lọc
      await setValue(page, 'q', 'lan');
      await page.until(() => document.querySelectorAll('#list .item').length === 1);
      await setValue(page, 'q', '');
      await page.ev(`document.querySelector('#filters button[data-f=dm]').click(); true`);
      await page.until(() => document.querySelectorAll('#list .item').length === 2);
      // Điện thoại: danh sách và cuộc trò chuyện thay nhau
      await page.open(url('chat', 'chat=1&c=dm1'), { width: 390, height: 800, mobile: true });
      await page.until(() => document.getElementById('app').classList.contains('open') && document.querySelectorAll('#msg-list .msg').length === 1);
      assert.equal(await page.ev(`getComputedStyle(document.getElementById('side')).display`), 'none');
      await page.ev(`document.getElementById('back').click(); true`);
      await page.until(() => getComputedStyle(document.getElementById('side')).display !== 'none');
      assert.equal(await page.ev(`document.documentElement.scrollWidth > innerWidth`), false);
    },
  },
  {
    name: 'Trang Chat: lời mời trò chuyện',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1&req=1'), { width: 1280, height: 820 });
      await page.ev(`localStorage.removeItem('beingroup-chat-dmtab'); true`);
      await page.open(url('chat', 'chat=1&req=1'), { width: 1280, height: 820 });
      await page.until(() => !!document.querySelector('.sec-tabs'));
      const secs = () => [...document.querySelectorAll('.sec')].map((x) => [x.querySelector('.sec-title').textContent, [...x.querySelectorAll('.item-title')].map((t) => t.textContent)]);
      const tabs = () => [...document.querySelectorAll('.sec-tabs .tab')].map((t) => [t.textContent, t.classList.contains('on')]);
      // Lời mời là tab cạnh Tin nhắn riêng (lời mình gửi đi vẫn ở Tin nhắn riêng)
      assert.deepEqual(await page.call(tabs), [['Tin nhắn riêng', true], ['Lời mời3', false]]);
      assert.deepEqual(await page.call(secs), [['Tin nhắn riêng', ['Lan Anh', 'Hải Yến', 'Minh Quân']], ['Crypto Life', ['Crypto Life', 'Hỏi đáp']]]);
      assert.equal(await page.ev(`document.querySelectorAll('.sec-tabs .tab')[1].classList.contains('hot')`), true); // có lời mời chưa đọc
      await page.ev(`document.querySelectorAll('.sec-tabs .tab')[1].click(); true`);
      await page.until(() => document.querySelectorAll('.sec-tabs .tab')[1].classList.contains('on'));
      assert.deepEqual((await page.call(secs))[0], ['Lời mời3', ['Người Lạ', 'Tặng Quà', 'Bạn Mới']]);
      assert.deepEqual(await page.ev(`[...document.querySelectorAll('.sec')[0].querySelectorAll('.item-sub')].map((x) => x.textContent)`), ['@nguoila · Lời mời đang chờ', '@tangqua · Lời mời bị xếp vào Spam', '@banmoi · Lời mời đang chờ']);
      // Mở lời mời: thanh Chấp nhận / Bỏ qua; Chấp nhận -> chuyển sang Tin nhắn riêng
      const open = (name) => page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.querySelector('.item-title').textContent === ${JSON.stringify(name)}).click(); true`);
      await open('Người Lạ');
      await page.until(() => !document.getElementById('req-bar').hidden && document.querySelectorAll('#msg-list .msg').length === 1);
      assert.match(await page.ev(`document.getElementById('req-text').textContent`), /^Người Lạ chưa kết nối với bạn và đã gửi lời mời trò chuyện\. Nếu bạn trả lời, bạn cũng chấp nhận/);
      assert.match(await page.ev(`document.getElementById('conv-sub').textContent`), /lời mời trò chuyện/);
      assert.equal(await page.ev(`document.getElementById('text').disabled`), false);
      await page.ev(`document.getElementById('req-accept').click(); true`);
      // Chấp nhận: chuyển sang Tin nhắn riêng (tab Tin nhắn riêng mở để thấy cuộc trò chuyện), tab Lời mời còn 2
      await page.until(() => document.getElementById('req-bar').hidden && document.querySelectorAll('.sec-tabs .tab')[0].classList.contains('on'));
      assert.deepEqual(await page.ev(`window.__chatContacts`), [{ type: 'chatContact', contactId: 'ct1', action: 'accept' }]);
      assert.deepEqual((await page.call(secs))[0], ['Tin nhắn riêng', ['Lan Anh', 'Người Lạ', 'Hải Yến', 'Minh Quân']]);
      assert.equal(await page.ev(`document.querySelectorAll('.sec-tabs .tab')[1].textContent`), 'Lời mời2');
      await page.ev(`document.querySelectorAll('.sec-tabs .tab')[1].click(); true`);
      await page.until(() => document.querySelectorAll('.sec')[0].querySelectorAll('.item').length === 2);
      assert.match(await page.ev(`document.getElementById('conv-sub').textContent`), /tin nhắn riêng/);
      // Spam: ghi rõ; Bỏ qua có hỏi lại
      await open('Tặng Quà');
      await page.until(() => /Spam/.test(document.getElementById('req-text').textContent));
      await page.ev(`document.getElementById('req-ignore').click(); true`);
      await page.until(() => document.getElementById('ask').open);
      assert.equal(await page.ev(`document.getElementById('ask-title').textContent`), 'Bỏ qua lời mời trò chuyện?');
      await page.ev(`document.getElementById('ask-ok').click(); true`);
      await page.until(() => /Bạn đã bỏ qua/.test(document.getElementById('req-text').textContent) && document.getElementById('req-ignore').hidden);
      assert.deepEqual(await page.ev(`window.__chatContacts[1]`), { type: 'chatContact', contactId: 'ct2', action: 'ignore' });
      assert.match(await page.ev(`document.querySelector('.sec .item.sel .item-sub').textContent`), /Bạn đã bỏ qua/);
      // Trả lời lời mời: gửi kèm chấp nhận, chuyển sang Tin nhắn riêng
      await open('Bạn Mới');
      await page.until(() => !document.getElementById('req-bar').hidden && /Bạn Mới/.test(document.getElementById('req-text').textContent));
      await page.ev(`(() => { const t = document.getElementById('text'); t.value = 'Chào bạn'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
      await page.until(() => (window.__chatSends || []).length === 1 && document.getElementById('req-bar').hidden);
      assert.equal(await page.ev(`window.__chatSends[0].acceptContactId`), 'ct3');
      assert.equal(await page.ev(`document.querySelectorAll('.sec-tabs .tab')[1].textContent`), 'Lời mời1');
      // Lời mình gửi đi: chờ người nhận chấp nhận, chưa gửi tiếp được
      await open('Hải Yến');
      await page.until(() => document.getElementById('text').disabled && /Bạn đã gửi lời mời/.test(document.getElementById('req-text').textContent));
      assert.equal(await page.ev(`document.getElementById('req-actions').hidden`), true);
      // Tìm: gộp cả tin nhắn riêng và lời mời (lời mời có ghi chú)
      await setValue(page, 'q', 'Tặng');
      await page.until(() => document.querySelectorAll('#list .item').length === 1 && !document.querySelector('.sec-tabs'));
      await setValue(page, 'q', '');
      // Lọc Tin nhắn riêng: vẫn có hai tab
      await page.ev(`document.querySelector('#filters button[data-f=dm]').click(); true`);
      await page.until(() => !!document.querySelector('.sec-tabs') && document.querySelectorAll('.sec').length === 1);
      // Mở lại trang: nhớ tab đang chọn; mở thẳng một lời mời thì sang tab Lời mời
      await page.open(url('chat', 'chat=1&req=1&c=rq2'), { width: 1280, height: 820 });
      await page.until(() => !document.getElementById('req-bar').hidden && document.querySelectorAll('.sec-tabs .tab')[1].classList.contains('on'));
      await page.ev(`localStorage.removeItem('beingroup-chat-dmtab'); true`);
    },
  },
  {
    name: 'Trang Chat: thread (bình luận, theo dõi) và huy hiệu',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1&c=chMain'), { width: 1280, height: 820 });
      await page.until(() => !!document.querySelector('#m-n2 .tbar'));
      // Huy hiệu cạnh tên: tin, danh sách
      assert.deepEqual(await page.ev(`[!!document.querySelector('#m-n1 .msg-name .vb.ok'), !!document.querySelector('#m-n1 .msg-name .vb.pr.lifetime'), document.querySelector('#m-n1 .msg-name .vb.ok').title, !!document.querySelector('#m-o1 .vb')]`), [true, true, 'Đã xác minh', false]);
      assert.equal(await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Lan Anh')).querySelectorAll('.item-title .vb').length`), 2);
      // Thanh thread: người tham gia, số bình luận, theo dõi
      assert.deepEqual(await page.ev(`[document.querySelectorAll('#m-n2 .tbar .avatar').length, document.querySelector('#m-n2 .tbar-n').textContent, document.querySelector('#m-n2 .tbar-follow').textContent]`), [1, '1 bình luận', 'Theo dõi']);
      assert.equal(await page.ev(`!!document.querySelector('#m-n1 .tbar')`), false);
      // Mở thread: tin gốc + bình luận, đánh dấu đã đọc
      await page.ev(`document.querySelector('#m-n2 .tbar-n').click(); true`);
      await page.until(() => !document.getElementById('thread').hidden && !!document.getElementById('t-n3'));
      assert.deepEqual(await page.ev(`[!!document.getElementById('t-n2'), document.querySelector('#t-list .t-sep').textContent, document.getElementById('t-sub').textContent, window.__msgs.some((m) => m.type === 'chatThreadRead' && m.rootId === 'n2' && m.teamId === 'tCL'), document.getElementById('app').classList.contains('thread-open')]`), [true, '1 bình luận', 'Crypto Life', true, true]);
      assert.equal(await page.ev(`!!document.querySelector('#t-n2 .tbar') || !![...document.querySelectorAll('#t-list .tools button')].find((b) => b.textContent === 'Bình luận')`), false);
      // Theo dõi
      await page.ev(`document.getElementById('t-follow').click(); true`);
      await page.until(() => document.getElementById('t-follow').textContent === 'Đang theo dõi' && document.querySelector('#m-n2 .tbar-follow').textContent === 'Đang theo dõi');
      assert.deepEqual(await page.ev(`window.__chatFollows`), [{ teamId: 'tCL', rootId: 'n2', follow: true }]);
      // Bình luận: Enter gửi kèm mã tin gốc; số bình luận tăng
      await page.ev(`(() => { const t = document.getElementById('t-text'); t.focus(); t.value = 'Cảm ơn anh'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; })()`);
      await page.until(() => (window.__chatSends || []).length === 1 && document.querySelectorAll('#t-list .msg').length === 3);
      assert.deepEqual(await page.ev(`[window.__chatSends[0].rootId, window.__chatSends[0].message, document.querySelector('#m-n2 .tbar-n').textContent, document.getElementById('t-text').value]`), ['n2', 'Cảm ơn anh', '2 bình luận', '']);
      // Bình luận mới của người khác: hiện trong thread, số bình luận tăng (không tính lại khi đọc lần sau)
      await page.ev(`window.__chatIncoming = [{ id: 'in2', channelId: 'chMain', user: { id: 'u70', chatId: 'cu70', username: 'moi', fullname: 'Người mới', pictureAt: 0 }, createAt: Date.now(), updateAt: Date.now() + 1, editAt: 0, deleted: false, system: false, message: 'Mình dùng Ledger', rootId: 'n2', replyCount: 0, pinned: false, files: [], participants: [], following: false }]; true`);
      await page.until(() => !!document.getElementById('t-in2') && document.querySelector('#m-n2 .tbar-n').textContent === '3 bình luận', 9000);
      await new Promise((r) => setTimeout(r, 4500));
      assert.equal(await page.ev(`document.querySelector('#m-n2 .tbar-n').textContent`), '3 bình luận');
      assert.deepEqual(await page.ev(`[!!document.getElementById('m-in2'), !!document.getElementById('m-n3'), !!document.getElementById('m-new1')]`), [false, false, false]); // bình luận không lẫn vào cuộc trò chuyện
      // Đóng bằng Esc trong ô bình luận
      await page.ev(`document.getElementById('t-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
      await page.until(() => document.getElementById('thread').hidden && !document.getElementById('app').classList.contains('thread-open'));
      // Điện thoại: thread phủ cả màn hình, không tràn ngang
      await page.open(url('chat', 'chat=1&c=chMain'), { width: 390, height: 800, mobile: true });
      await page.until(() => !!document.querySelector('#m-n2 .tbar-n'));
      await page.ev(`document.querySelector('#m-n2 .tbar-n').click(); true`);
      await page.until(() => !document.getElementById('thread').hidden && !!document.getElementById('t-n3'));
      assert.deepEqual(await page.ev(`[Math.round(document.getElementById('thread').getBoundingClientRect().width), document.documentElement.scrollWidth > innerWidth]`), [390, false]);
    },
  },
  {
    name: 'Trang Chat: thread đang theo dõi',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1'), { width: 1280, height: 820 });
      await page.until(() => !!document.querySelector('#list .tl-entry'));
      // Mục Thread đầu danh sách: số thread có bình luận chưa đọc (có nhắc tên: đỏ)
      assert.deepEqual(await page.ev(`[document.querySelector('.tl-entry .badge').textContent, document.querySelector('.tl-entry .badge').classList.contains('at'), document.querySelectorAll('#list .item').length]`), ['2', true, 4]);
      await page.ev(`document.querySelector('.tl-entry').click(); true`);
      await page.until(() => !document.getElementById('tview').hidden && document.querySelectorAll('#tv-list .tcard').length === 3);
      const cards = await page.ev(`[...document.querySelectorAll('#tv-list .tcard')].map((c) => [c.querySelector('.tc-where').textContent, c.querySelector('.tc-text').textContent, c.querySelector('.tc-meta').textContent, c.classList.contains('unread')])`);
      assert.deepEqual(cards, [
        ['# Crypto Life', 'Lan Anh: @kaicrypto ơi cho em hỏi ví lạnh nào tốt?', 'KC1 bình luận@1', true], // KC, LA: chữ trong ảnh đại diện người tham gia
        ['✉ Lan Anh', 'Lan Anh: Chào anh!', 'LA2 bình luận2 mới', true],
        ['# Hỏi đáp · Crypto Life', 'Bảo Ngọc: Hỏi về ví lạnh', '4 bình luận', false],
      ]);
      assert.deepEqual(await page.ev(`[location.hash, document.querySelector('.tl-entry').classList.contains('sel'), document.getElementById('conv-head').hidden, !!document.querySelector('#tv-list .tcard .vb.ok')]`), ['#threads', true, true, true]);
      // Chưa đọc
      await page.ev(`document.querySelector('#tv-filters [data-f=unread]').click(); true`);
      await page.until(() => document.querySelectorAll('#tv-list .tcard').length === 2 && window.__chatThreadsCalls.at(-1).unread === true);
      // Bấm thread: mở cuộc trò chuyện + khung bình luận của tin đó; bớt số chưa đọc
      await page.ev(`document.querySelector('#tv-list .tcard').click(); true`);
      await page.until(() => document.getElementById('tview').hidden && !document.getElementById('thread').hidden && !!document.getElementById('t-n3'));
      assert.deepEqual(await page.ev(`[S.sel.id, document.querySelector('.tl-entry .badge').textContent, document.querySelector('.tl-entry').classList.contains('sel')]`), ['chMain', '1', false]);
      // Mở thẳng bằng địa chỉ #threads
      await page.open(url('chat', 'chat=1&threads'), { width: 1280, height: 820 });
      await page.until(() => !document.getElementById('tview').hidden && document.querySelectorAll('#tv-list .tcard').length === 3);
      // Điện thoại: trang Thread thay danh sách, nút quay lại
      await page.open(url('chat', 'chat=1'), { width: 390, height: 800, mobile: true });
      await page.until(() => !!document.querySelector('#list .tl-entry'));
      await page.ev(`document.querySelector('.tl-entry').click(); true`);
      await page.until(() => document.querySelectorAll('#tv-list .tcard').length === 3 && getComputedStyle(document.getElementById('side')).display === 'none');
      assert.equal(await page.ev(`document.documentElement.scrollWidth > innerWidth`), false);
      await page.ev(`document.getElementById('tv-back').click(); true`);
      await page.until(() => getComputedStyle(document.getElementById('side')).display !== 'none' && document.getElementById('tview').hidden);
    },
  },
  {
    name: 'Trang Chat: hồ sơ người, ghim tin, gợi ý @tên, sửa tin, bản nháp',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1&c=chMain'), { width: 1280, height: 820 });
      await page.ev(`localStorage.removeItem('beingroup-chat-drafts'); true`);
      await page.until(() => document.getElementById('pinned-n').textContent === '1' && !!document.querySelector('#m-o1 .pin-tag'));
      // Tin đã ghim: khung bên phải; bỏ ghim (admin kênh)
      await page.ev(`document.getElementById('btn-pinned').click(); true`);
      await page.until(() => !document.getElementById('pins').hidden && !!document.getElementById('p-o1'));
      assert.deepEqual(await page.ev(`[...document.querySelectorAll('#p-o1 .tools button')].map((b) => b.textContent)`), ['Tới tin nhắn', 'Sao chép', 'Bỏ ghim']);
      await page.ev(`[...document.querySelectorAll('#p-o1 .tools button')].find((b) => b.textContent === 'Bỏ ghim').click(); true`);
      await page.until(() => document.getElementById('pinned-n').textContent === '' && !document.querySelector('#m-o1 .pin-tag') && /chưa có tin nào được ghim/.test(document.getElementById('p-list').textContent));
      // Ghim tin khác từ cuộc trò chuyện
      await page.ev(`[...document.querySelectorAll('#m-n2 .tools button')].find((b) => b.textContent === 'Ghim').click(); true`);
      await page.until(() => document.getElementById('pinned-n').textContent === '1' && !!document.querySelector('#m-n2 .pin-tag') && !!document.getElementById('p-n2'));
      assert.deepEqual(await page.ev(`window.__chatPins`), [{ postId: 'o1', pin: false }, { postId: 'n2', pin: true }]);
      await page.ev(`document.getElementById('p-close').click(); true`);
      // Bấm tên người: hồ sơ, vi phạm, bài, xử lý
      await page.ev(`chrome.storage.local.get('profiles').then(({ profiles }) => chrome.storage.local.set({ profiles: { users: { ...profiles.users, u62: { user: { id: 'u62', username: 'lananh', fullname: 'Lan Anh' }, events: [{ type: 'hidden', key: 'hidden:z1', time: new Date().toISOString(), group: 'Crypto Life', snippet: 'Link lạ', reason: 'Spam', by: 'Bạn (qua addon)' }] } } } })).then(() => true)`);
      await page.ev(`document.querySelector('#m-n1 .nm-btn').click(); true`);
      await page.until(() => document.getElementById('person').open && /Nội dung bị ẩn 1/.test(document.getElementById('pc-body').textContent));
      const card = await page.call(() => ({
        name: document.querySelector('#pc-head .nm').textContent,
        badges: document.querySelectorAll('#pc-head .vb').length,
        sub: document.querySelector('#pc-head .pc-who > span').textContent,
        links: [...document.querySelectorAll('#pc-body a.pc-btn')].map((a) => [a.textContent, a.getAttribute('href')]),
        buttons: [...document.querySelectorAll('#pc-body button.pc-btn')].map((b) => b.textContent),
      }));
      assert.deepEqual(card.name, 'Lan Anh');
      assert.equal(card.badges, 2);
      assert.equal(card.sub, '@lananh · đã xác minh · Premium');
      assert.deepEqual(card.links, [['Trang cá nhân ↗', 'https://group.beincom.com/users/lananh'], ['🧹 Dọn tài khoản…', 'dashboard.html#tab=content&cleanup=u62&u=lananh&n=Lan%20Anh'], ['⚠ Hồ sơ trên Dashboard', 'dashboard.html#tab=members&profile=u62&u=lananh&n=Lan%20Anh']]);
      assert.deepEqual(card.buttons, ['Tìm bài của người này', 'Xoá 2 tin của người này đang hiện']); // chưa có tin nhắn riêng với người này: không có nút Nhắn riêng
      await page.ev(`[...document.querySelectorAll('#pc-body button.pc-btn')].find((b) => b.textContent === 'Tìm bài của người này').click(); true`);
      await page.until(() => /2 bài còn hiện/.test(document.getElementById('pc-body').textContent) && document.querySelectorAll('#pc-body .pc-events a').length === 2);
      await page.ev(`document.querySelector('#pc-head button').click(); true`);
      // Của mình: không có công cụ xử lý
      await page.ev(`document.querySelector('.side-foot .avatar') ; openPerson(S.me); true`);
      await page.until(() => document.getElementById('person').open);
      assert.equal(await page.ev(`!!document.querySelector('#pc-body .pc-actions')`), false);
      await page.ev(`document.getElementById('person').close(); true`);
      // Gợi ý @tên: gõ "@la" -> Lan Anh; Enter chèn @lananh; @al -> @all
      const typeAt = (v) => page.ev(`(() => { const t = document.getElementById('text'); t.focus(); t.value = ${JSON.stringify(v)}; t.setSelectionRange(t.value.length, t.value.length); t.dispatchEvent(new Event('input')); return true; })()`);
      await typeAt('chào @la');
      await page.until(() => !document.getElementById('mention-pop').hidden && document.querySelectorAll('#mention-pop .mi').length === 1);
      assert.deepEqual(await page.ev(`[document.querySelector('#mention-pop .mi-name').textContent, document.querySelector('#mention-pop .mi-sub').textContent, document.querySelectorAll('#mention-pop .mi .vb').length]`), ['Lan Anh', '@lananh', 2]);
      await page.ev(`document.getElementById('text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); true`);
      assert.deepEqual(await page.ev(`[document.getElementById('text').value, document.getElementById('mention-pop').hidden, (window.__chatSends || []).length]`), ['chào @lananh ', true, 0]); // Enter chọn tên, không gửi
      await typeAt('@al');
      await page.until(() => !document.getElementById('mention-pop').hidden && /@all/.test(document.getElementById('mention-pop').textContent));
      await page.ev(`document.getElementById('text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`);
      assert.equal(await page.ev(`document.getElementById('mention-pop').hidden`), true);
      // Bản nháp: đổi cuộc trò chuyện giữ chữ đang gõ
      await typeAt('nháp dở');
      await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Lan Anh')).click(); true`);
      await page.until(() => S.sel?.id === 'dm1' && document.getElementById('text').value === '');
      assert.match(await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Crypto Life')).querySelector('.item-sub').textContent`), /^✏ Nháp: nháp dở$/);
      await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.querySelector('.item-title').textContent === 'Crypto Life').click(); true`);
      await page.until(() => S.sel?.id === 'chMain' && document.getElementById('text').value === 'nháp dở');
      // Sửa tin của mình: nút Sửa -> Enter lưu; mũi tên lên khi ô trống; Esc huỷ (trả lại nháp)
      await page.until(() => !!document.querySelector('#m-o2'));
      await page.ev(`[...document.querySelectorAll('#m-o2 .tools button')].find((b) => b.textContent === 'Sửa').click(); true`);
      assert.deepEqual(await page.ev(`[document.getElementById('reply').hidden, document.getElementById('reply').classList.contains('editing'), document.getElementById('text').value, document.getElementById('btn-attach').disabled]`), [false, true, 'Chào cả nhà, tối nay có AMA nhé', true]);
      await page.ev(`(() => { const t = document.getElementById('text'); t.value = 'Chào cả nhà, AMA lúc 20h nhé'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; })()`);
      await page.until(() => (window.__chatEdits || []).length === 1 && /AMA lúc 20h/.test(document.querySelector('#m-o2 .bubble').textContent) && /đã sửa/.test(document.querySelector('#m-o2 .meta').textContent));
      assert.deepEqual(await page.ev(`[window.__chatEdits[0], document.getElementById('text').value, document.getElementById('reply').hidden, (window.__chatSends || []).length]`), [{ postId: 'o2', message: 'Chào cả nhà, AMA lúc 20h nhé' }, 'nháp dở', true, 0]);
      await page.ev(`(() => { const t = document.getElementById('text'); t.value = ''; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); return true; })()`);
      assert.equal(await page.ev(`document.getElementById('text').value`), 'Chào cả nhà, AMA lúc 20h nhé');
      await page.ev(`document.getElementById('text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`);
      assert.deepEqual(await page.ev(`[document.getElementById('reply').hidden, document.getElementById('text').value]`), [true, '']);
      await page.ev(`localStorage.removeItem('beingroup-chat-drafts'); true`);
      // Dashboard mở thẳng hộp Dọn tài khoản / hồ sơ vi phạm từ trang Chat
      await page.open(url('dashboard', 'tab=content&cleanup=u60&u=hoamai&n=Hoa%20Mai'));
      await page.until(() => document.getElementById('confirm').open && document.getElementById('confirm-title').textContent === 'Dọn tài khoản Hoa Mai (@hoamai)?');
      await page.ev(`document.querySelector('#confirm button[value=cancel]').click(); true`);
      await page.open(url('dashboard', 'tab=members&profile=u1&u=trnminhanh1&n=Trần Minh Anh'));
      await page.until(() => !document.getElementById('members-profiles-pane').hidden && document.getElementById('profiles-key').value === 'trnminhanh1');
    },
  },
  {
    name: 'Trang Chat: biểu cảm, tìm tin nhắn',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1&c=chMain'), { width: 1280, height: 820 });
      await page.until(() => document.querySelectorAll('#m-n1 .reacts .rc[data-name]').length === 3);
      const chips = () => page.ev(`[...document.querySelectorAll('#m-n1 .reacts .rc[data-name]')].map((b) => [b.textContent, b.classList.contains('mine')])`);
      assert.deepEqual(await chips(), [['👍2', false], ['❤️1', true], [':bic_star:1', false]]);
      // Rê chuột: ai đã thả
      await page.ev(`document.querySelector('#m-n1 .reacts').dispatchEvent(new MouseEvent('mouseenter')); true`);
      await page.until(() => document.querySelector('#m-n1 .rc[data-name="+1"]').title === '👍 Hoa Mai, Minh' && document.querySelector('#m-n1 .rc[data-name="heart"]').title === '❤️ Bạn');
      // Bấm chip: thả / bỏ biểu cảm của mình
      await page.ev(`document.querySelector('#m-n1 .rc[data-name="+1"]').click(); true`);
      await page.until(() => document.querySelector('#m-n1 .rc[data-name="+1"]')?.textContent === '👍3');
      await page.ev(`document.querySelector('#m-n1 .rc[data-name="heart"]').click(); true`);
      await page.until(() => !document.querySelector('#m-n1 .rc[data-name="heart"]'));
      assert.deepEqual(await page.ev(`window.__chatReacts`), [{ postId: 'n1', emoji: '+1', add: true }, { postId: 'n1', emoji: 'heart', add: false }]);
      assert.equal(await page.ev(`document.querySelector('#m-n1 .rc[data-name="+1"]').classList.contains('mine')`), true);
      // Nút 😊 trên tin chưa có biểu cảm: chọn nhanh, … xem thêm
      await page.ev(`[...document.querySelectorAll('#m-n2 .tools button')].find((b) => b.textContent === '😊').click(); true`);
      await page.until(() => !document.getElementById('react-pop').hidden && document.querySelectorAll('#react-pop .rp-quick .emo').length === 9);
      await page.ev(`document.querySelector('#react-pop .rp-more').click(); true`);
      assert.ok(await page.ev(`document.querySelectorAll('#react-pop .emoji-grid .emo').length > 40`));
      await page.ev(`[...document.querySelectorAll('#react-pop .emo')].find((b) => b.textContent === '🔥').click(); true`);
      await page.until(() => document.getElementById('react-pop').hidden && document.querySelector('#m-n2 .rc[data-name="fire"]')?.textContent === '🔥1');
      // Tìm trong kênh: kết quả là bình luận -> mở khung bình luận, nháy tin
      await page.ev(`document.getElementById('btn-search').click(); true`);
      await page.until(() => !document.getElementById('search').hidden && document.getElementById('s-sub').textContent === 'Trong Crypto Life');
      await page.ev(`(() => { document.getElementById('s-q').value = 'ledger'; document.getElementById('s-form').requestSubmit(); return true; })()`);
      await page.until(() => document.querySelectorAll('#s-list .s-item').length === 1);
      assert.match(await page.ev(`document.querySelector('#s-list .s-where').textContent`), /^# Crypto Life · bình luận · /);
      assert.deepEqual(await page.ev(`window.__chatSearches.at(-1)`), { terms: 'ledger', channelId: 'chMain' });
      await page.ev(`[...document.querySelectorAll('#s-list .tools button')].find((b) => b.textContent === 'Mở').click(); true`);
      await page.until(() => !document.getElementById('thread').hidden && document.getElementById('t-n3')?.classList.contains('flash') && document.getElementById('search').hidden);
      // Mọi nơi: tin nhắn riêng -> mở cuộc trò chuyện đó
      await page.ev(`document.getElementById('btn-search').click(); true`);
      await page.ev(`document.querySelector('#s-scope [data-s=all]').click(); true`);
      await page.ev(`(() => { document.getElementById('s-q').value = 'chào anh'; document.getElementById('s-form').requestSubmit(); return true; })()`);
      await page.until(() => document.querySelectorAll('#s-list .s-item').length === 1 && /^✉ Lan Anh/.test(document.querySelector('#s-list .s-where').textContent));
      await page.ev(`[...document.querySelectorAll('#s-list .tools button')].find((b) => b.textContent === 'Mở').click(); true`);
      await page.until(() => S.sel?.id === 'dm1' && document.getElementById('m-d1')?.classList.contains('flash'));
      // Ô tìm bên trái: Enter tìm trong tin nhắn ở mọi nơi
      await page.ev(`(() => { const q = document.getElementById('q'); q.value = 'xem bài'; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; })()`);
      await page.until(() => !document.getElementById('search').hidden && document.querySelectorAll('#s-list .s-item').length === 1);
      assert.deepEqual(await page.ev(`[window.__chatSearches.at(-1), document.querySelector('#s-scope [data-s=all]').classList.contains('on')]`), [{ terms: 'xem bài', channelId: '' }, true]);
      // Cài đặt: báo bình luận mới ở thread đang theo dõi (bật sẵn)
      await page.open(url('dashboard', 'tab=settings'));
      assert.deepEqual(await page.ev(`[!!document.getElementById('chatThreads'), document.getElementById('chatThreads').checked]`), [true, true]);
    },
  },
  {
    name: 'Trang Chat: bộ gõ tin nhắn',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1&md=1&c=chMain'), { width: 1280, height: 820 });
      await page.until(() => document.querySelectorAll('#msg-list .msg').length === 6);
      // Tin có định dạng và độ ưu tiên
      const mk = await page.call(() => {
        const m = document.getElementById('m-mk1');
        return { prio: m.querySelector('.prio.urgent')?.textContent, quote: m.querySelector('.md blockquote')?.textContent, li: m.querySelectorAll('.md li').length, s: m.querySelector('.md s')?.textContent, i: m.querySelector('.md i')?.textContent, link: [m.querySelector('.md li a')?.textContent, m.querySelector('.md li a')?.getAttribute('href')], pre: m.querySelector('.md pre')?.textContent };
      });
      assert.deepEqual(mk, { prio: 'KHẨN CẤP', quote: 'Lịch AMA tuần này', li: 2, s: '20h', i: '21h', link: ['đăng ký', 'https://group.beincom.com/ama'], pre: 'npm i' });
      const val = () => page.ev(`document.getElementById('text').value`);
      const setText = (v, s, e) => page.ev(`(() => { const t = document.getElementById('text'); t.focus(); t.value = ${JSON.stringify(v)}; t.dispatchEvent(new Event('input')); t.setSelectionRange(${s}, ${e}); return true; })()`);
      const key = (code, o = {}) => page.ev(`document.getElementById('text').dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${o.key || ''}', ctrlKey: ${!!o.ctrl}, shiftKey: ${!!o.shift}, altKey: ${!!o.alt}, bubbles: true, cancelable: true })); true`);
      // Nút định dạng và phím tắt (bấm lại thì bỏ)
      await setText('xin chào', 4, 8);
      await page.ev(`document.querySelector('#fmt [data-md=bold]').click(); true`);
      assert.equal(await val(), 'xin **chào**');
      await key('KeyB', { ctrl: true });
      assert.equal(await val(), 'xin chào');
      await setText('xin chào', 4, 8);
      await key('KeyX', { ctrl: true, shift: true });
      assert.equal(await val(), 'xin ~~chào~~');
      await setText('xem', 0, 3);
      await key('KeyK', { ctrl: true, alt: true });
      assert.deepEqual(await page.ev(`[document.getElementById('text').value, document.getElementById('text').selectionStart, document.getElementById('text').selectionEnd]`), ['[xem](url)', 6, 9]);
      await setText('mua\nbán', 0, 7);
      await page.ev(`document.querySelector('#fmt [data-md=ol]').click(); true`);
      assert.equal(await val(), '1. mua\n2. bán');
      // Shift + Enter trong danh sách: dòng mới có số kế tiếp
      await setText('1. mua\n2. bán', 13, 13);
      await key('Enter', { key: 'Enter', shift: true });
      assert.equal(await val(), '1. mua\n2. bán\n3. ');
      // Ctrl + Z hoàn tác được
      await page.ev(`document.execCommand('undo'); true`);
      assert.equal(await val(), '1. mua\n2. bán');
      // Xem trước
      await setText('**Đậm** và `mã`', 0, 0);
      await page.ev(`document.getElementById('btn-preview').click(); true`);
      assert.deepEqual(await page.ev(`[document.getElementById('text').hidden, document.querySelector('#preview b')?.textContent, document.querySelector('#preview code')?.textContent]`), [true, 'Đậm', 'mã']);
      await page.ev(`document.getElementById('preview').click(); true`);
      assert.equal(await page.ev(`document.getElementById('text').hidden`), false);
      // Aa: ẩn / hiện thanh định dạng (nhớ trong máy)
      await page.ev(`document.getElementById('btn-fmt').click(); true`);
      assert.deepEqual(await page.ev(`[document.getElementById('fmt').hidden, localStorage.getItem('beingroup-chat-fmt'), getComputedStyle(document.getElementById('btn-prio')).display !== 'none']`), [true, '0', true]);
      await page.ev(`document.getElementById('btn-fmt').click(); true`);
      // Độ ưu tiên: Quan trọng, gửi kèm; gửi xong về Tiêu chuẩn
      await page.ev(`document.getElementById('btn-prio').click(); true`);
      await page.until(() => !document.getElementById('prio-menu').hidden);
      assert.equal(await page.ev(`document.querySelector('#prio-menu [data-prio=""]').getAttribute('aria-checked')`), 'true');
      await page.ev(`document.querySelector('#prio-menu [data-prio=important]').click(); true`);
      await page.until(() => document.getElementById('prio-menu').hidden && !document.getElementById('prio-chip').hidden);
      assert.match(await page.ev(`document.getElementById('prio-chip').textContent`), /QUAN TRỌNG/);
      await setText('Họp lúc 20h', 11, 11);
      await page.ev(`document.getElementById('send').click(); true`);
      await page.until(() => (window.__chatSends || []).length === 1 && document.getElementById('prio-chip').hidden);
      assert.deepEqual(await page.ev(`window.__chatSends[0]`), { type: 'chatSend', channelId: 'chMain', message: 'Họp lúc 20h', rootId: '', priority: 'important' });
      // Emoji: chèn vào chỗ con trỏ, nhớ emoji hay dùng
      await setText('Tuyệt', 5, 5);
      await page.ev(`document.getElementById('btn-emoji').click(); true`);
      await page.until(() => !document.getElementById('emoji-pop').hidden && document.querySelectorAll('#emoji-grid .emo').length > 5);
      await page.ev(`document.querySelectorAll('#emoji-tabs .etab')[4].click(); true`);
      await page.ev(`document.querySelector('#emoji-grid .emo').click(); true`);
      assert.equal(await val(), 'Tuyệt🚀');
      assert.equal(await page.ev(`JSON.parse(localStorage.getItem('beingroup-chat-emoji'))[0]`), '🚀');
      await page.ev(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true`);
      assert.equal(await page.ev(`document.getElementById('emoji-pop').hidden`), true);
      // Đính kèm: chọn tệp -> tải lên ngay; tệp quá 25 MB thì báo; gửi chỉ có tệp (không cần chữ)
      await setText('', 0, 0);
      await page.ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['abc'], 'ghi-chu.txt', { type: 'text/plain' })); dt.items.add(new File([new Uint8Array(26 * 1024 * 1024)], 'lon.zip', { type: 'application/zip' })); const i = document.getElementById('file-input'); i.files = dt.files; i.dispatchEvent(new Event('change')); return true; })()`);
      await page.until(() => document.querySelectorAll('#attach-list .att.ok').length === 1);
      assert.match(await page.ev(`document.getElementById('toast').textContent`), /lon\.zip: lớn quá 25 MB/);
      assert.deepEqual(await page.ev(`window.__chatUploads`), [{ channelId: 'chMain', name: 'ghi-chu.txt', mime: 'text/plain', bytes: 3 }]);
      // Dán ảnh
      await page.ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' })); document.getElementById('text').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
      await page.until(() => document.querySelectorAll('#attach-list .att.ok').length === 2 && !!document.querySelector('#attach-list .att img'));
      // Bỏ một tệp rồi gửi
      await page.ev(`document.querySelectorAll('#attach-list .att-x')[0].click(); true`);
      assert.equal(await page.ev(`document.getElementById('send').disabled`), false);
      await page.ev(`document.getElementById('send').click(); true`);
      await page.until(() => (window.__chatSends || []).length === 2 && document.getElementById('attach-list').hidden);
      assert.deepEqual(await page.ev(`[window.__chatSends[1].message, window.__chatSends[1].fileIds]`), ['', ['fu2']]);
      // Đổi cuộc trò chuyện: bỏ tệp đang soạn
      await page.ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' })); const i = document.getElementById('file-input'); i.files = dt.files; i.dispatchEvent(new Event('change')); return true; })()`);
      await page.until(() => document.querySelectorAll('#attach-list .att').length === 1);
      await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Lan Anh')).click(); true`);
      await page.until(() => document.getElementById('attach-list').hidden);
      // Điện thoại: thanh công cụ không tràn ngang
      await page.open(url('chat', 'chat=1&c=chMain'), { width: 390, height: 800, mobile: true });
      await page.until(() => document.getElementById('app').classList.contains('open') && !document.getElementById('composer').hidden);
      assert.deepEqual(await page.ev(`[document.documentElement.scrollWidth > innerWidth, document.getElementById('send').getBoundingClientRect().right <= innerWidth]`), [false, true]);
      await page.ev(`localStorage.removeItem('beingroup-chat-emoji'); true`);
    },
  },
  {
    name: 'Trang Chat: xem ảnh phóng to',
    async run({ page, url, assert }) {
      await page.open(url('chat', 'chat=1&imgs=1&c=chMain'), { width: 1280, height: 820 });
      await page.until(() => document.querySelectorAll('#msg-list .shot').length === 5);
      // Bấm ảnh thứ hai: phóng to ngay trong trang (không mở tab), 2 / 5, có nút mở tab mới
      await page.ev(`window.__opened = 0; window.open = () => { window.__opened++; return null; }; document.querySelectorAll('#msg-list .shot')[1].click(); true`);
      await page.until(() => document.getElementById('viewer').open && document.getElementById('v-count').textContent === '2 / 5');
      const v = await page.call(() => ({
        name: document.getElementById('v-name').textContent,
        meta: document.getElementById('v-meta').textContent,
        open: [document.getElementById('v-open').target, document.getElementById('v-open').href.startsWith('data:image/svg+xml')],
        thumbs: document.querySelectorAll('#v-thumbs .v-thumb').length,
        on: [...document.querySelectorAll('#v-thumbs .v-thumb')].findIndex((b) => b.classList.contains('on')),
        url: location.href.includes('c=chMain') && location.protocol === 'file:',
      }));
      assert.deepEqual(v, { name: 'anh-2.png', meta: v.meta, open: ['_blank', true], thumbs: 5, on: 1, url: true });
      assert.match(v.meta, /^Minh · /);
      // Như playlist: phím mũi tên, nút sau / trước, Home / End, bấm ảnh nhỏ
      const key = (k) => page.ev(`document.getElementById('viewer').dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true })); true`);
      await key('ArrowRight');
      await page.until(() => document.getElementById('v-count').textContent === '3 / 5');
      await page.ev(`document.getElementById('v-next').click(); true`);
      await page.until(() => document.getElementById('v-count').textContent === '4 / 5' && document.getElementById('v-name').textContent === 'anh-4.png');
      await key('End');
      await page.until(() => document.getElementById('v-count').textContent === '5 / 5' && document.getElementById('v-next').disabled);
      // Ảnh chỉ có bản xem trước: có ghi chú, mở tab mới là mở trên web Beincom
      assert.ok(await page.ev(`!!document.querySelector('#v-stage img.blur') && /xem trước/.test(document.querySelector('.v-note').textContent) && document.getElementById('v-open').href.includes('chat-home')`));
      await key('Home');
      await page.until(() => document.getElementById('v-count').textContent === '1 / 5' && document.getElementById('v-prev').disabled);
      await page.ev(`document.querySelectorAll('#v-thumbs .v-thumb')[2].click(); true`);
      await page.until(() => document.getElementById('v-count').textContent === '3 / 5' && document.querySelectorAll('#v-thumbs .v-thumb')[2].classList.contains('on'));
      // Ảnh lớn hơn khung: bấm để xem đúng cỡ, bấm lại thu về
      await page.until(() => document.getElementById('v-stage').classList.contains('can-zoom'));
      await page.ev(`document.querySelector('#v-stage img').click(); true`);
      await page.until(() => document.getElementById('v-stage').classList.contains('zoomed') && document.querySelector('#v-stage img').clientWidth === 1600);
      await page.ev(`document.querySelector('#v-stage img').click(); true`);
      await page.until(() => !document.getElementById('v-stage').classList.contains('zoomed'));
      // Tới tin nhắn: đóng và nháy tin có ảnh
      await page.ev(`document.getElementById('v-goto').click(); true`);
      await page.until(() => !document.getElementById('viewer').open && document.getElementById('m-im1').classList.contains('flash'));
      // Đóng bằng nút ✕; không lần nào mở tab
      await page.ev(`document.querySelectorAll('#msg-list .shot')[3].click(); true`);
      await page.until(() => document.getElementById('viewer').open && document.getElementById('v-count').textContent === '4 / 5');
      await page.ev(`document.getElementById('v-close').click(); true`);
      await page.until(() => !document.getElementById('viewer').open);
      assert.equal(await page.ev(`window.__opened`), 0);
      // Điện thoại: khung xem vừa màn hình, nút chỉ còn biểu tượng
      await page.open(url('chat', 'chat=1&imgs=1&c=chMain'), { width: 390, height: 800, mobile: true });
      await page.until(() => document.querySelectorAll('#msg-list .shot').length === 5);
      await page.ev(`document.querySelectorAll('#msg-list .shot')[0].click(); true`);
      await page.until(() => document.getElementById('viewer').open);
      assert.deepEqual(await page.ev(`[document.documentElement.scrollWidth > innerWidth, getComputedStyle(document.querySelector('#v-open span')).display, document.getElementById('viewer').getBoundingClientRect().width]`), [false, 'none', 390]);
      // Tin nhiều ảnh: lưới 4 ô, ô cuối "+2"; bấm ô đó mở đúng ảnh, ảnh bị ẩn trong lưới vẫn có trong playlist
      await page.open(url('chat', 'chat=1&imgs=6&c=chMain'), { width: 1280, height: 820 });
      await page.until(() => !!document.querySelector('#m-im6 .album.grid'));
      assert.deepEqual(await page.ev(`[document.querySelectorAll('#m-im6 .shot').length, document.querySelector('#m-im6 .shot .more')?.textContent, document.querySelector('#m-im1 .album').className]`), [4, '+2', 'album grid n3']);
      await page.ev(`document.querySelectorAll('#m-im6 .shot')[3].click(); true`);
      await page.until(() => document.getElementById('viewer').open && document.getElementById('v-count').textContent === '4 / 11' && document.getElementById('v-name').textContent === 'anh-A4.png');
      await page.ev(`document.getElementById('v-next').click(); true`);
      await page.until(() => document.getElementById('v-name').textContent === 'anh-A5.png');
    },
  },
  {
    name: 'Trang Chat: nhiều cuộc trò chuyện',
    async run({ page, url, assert }) {
      // Khung chờ, rồi lần đọc nhanh: 8 tin nhắn riêng gần nhất + 5 cộng đồng (2 đã ghim lên đầu)
      await page.open(url('chat', 'chat=1'));
      await page.ev(`localStorage.removeItem('beingroup-chat-dmtab'); true`);
      await page.open(url('chat', 'chat=1&many=1'));
      await page.until(() => document.querySelectorAll('#list .item.skel').length > 0);
      await page.until(() => document.querySelectorAll('#list .item:not(.skel)').length > 0);
      const quick = await page.call(() => ({ sec: [...document.querySelectorAll('.sec')].map((x) => [x.querySelector('.sec-title').textContent, x.querySelectorAll('.item').length, !!x.querySelector('.pin')]), more: [...document.querySelectorAll('.more-btn')].map((b) => b.textContent), first: document.querySelector('.item .item-title').textContent }));
      assert.deepEqual(quick.sec, [['Tin nhắn riêng', 8, false], ['Cộng đồng 1', 1, true], ['Cộng đồng 2', 1, true], ['Cộng đồng 3', 1, false], ['Cộng đồng 4', 1, false], ['Cộng đồng 5', 1, false]]);
      assert.deepEqual(quick.more, ['Xem thêm 4 tin nhắn riêng', 'Xem thêm 2 cộng đồng']);
      assert.equal(quick.first, 'Lan Anh');
      // Lần đọc đủ chạy ngay sau: điền tên mọi tin nhắn riêng, quyền gửi tin
      await page.until(() => (window.__chatFull || 0) >= 1 && window.__chatQuick === 1);
      await page.ev(`document.querySelector('.more-btn').click(); true`);
      await page.until(() => document.querySelectorAll('.sec')[0].querySelectorAll('.item').length === 12);
      const titles = await page.ev(`[...document.querySelectorAll('.sec')[0].querySelectorAll('.item-title')].map((x) => x.textContent)`);
      assert.deepEqual(titles.slice(8), ['Quốc Bảo', 'Thanh Tâm', 'Gia Hưng', 'Khánh Linh']);
      assert.equal(await page.ev(`document.querySelector('.sec .more-btn').textContent`), 'Thu gọn');
      // Xem thêm cộng đồng
      await page.ev(`[...document.querySelectorAll('.more-btn')].find((b) => b.textContent.includes('cộng đồng')).click(); true`);
      await page.until(() => document.querySelectorAll('.sec').length === 8);
      // Tìm: hiện đủ (không giới hạn), không có nút Xem thêm
      await page.ev(`[...document.querySelectorAll('.more-btn')].forEach((b) => b.textContent === 'Thu gọn' && b.click()); true`);
      await setValue(page, 'q', 'Khánh');
      await page.until(() => document.querySelectorAll('#list .item').length === 1 && !document.querySelector('.more-btn'));
      await setValue(page, 'q', '');
      // Kênh chỉ xem (biết sau lần đọc đủ): không gõ được; kênh gửi được thì gõ được
      await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Cộng đồng 2')).click(); true`);
      await page.until(() => document.getElementById('text').disabled);
      await page.ev(`[...document.querySelectorAll('#list .item')].find((x) => x.textContent.includes('Cộng đồng 1')).click(); true`);
      await page.until(() => !document.getElementById('text').disabled);
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
