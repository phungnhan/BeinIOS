// BeinFusion — Hướng dẫn trong ứng dụng: nội dung các chủ đề, dùng chung cho Dashboard (hộp ❓ Hướng dẫn, mục lục ở Cài đặt)
// và BeinIOS (Cài đặt → Hướng dẫn). Chỉ có dữ liệu: mỗi nơi tự dựng giao diện. Không dẫn link ra ngoài — viết đủ ngay đây.
// HELP_TOPICS[chủ đề] = { title, sections: [{ h, items: [chuỗi | [chuỗi…] (danh sách đánh số)] }] }
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const HELP_TOPICS = {
    start: {
      title: '🚀 Bắt đầu',
      sections: [
        {
          h: 'Lần đầu dùng',
          items: [
            [
              'Đăng nhập Beincom (group.beincom.com) trên chính trình duyệt này bằng tài khoản admin group.',
              'Mở Dashboard: addon tự quét các group bạn quản trị (yêu cầu tham gia, bài chờ duyệt, bài mới, báo cáo).',
              'Vào Nhật ký → Tự kiểm tra, bấm ▶ Chạy kiểm tra để chắc mọi chức năng đọc được dữ liệu.',
              'Thử quy tắc ở tab Quy tắc & cài đặt, xem gợi ý có đúng không, rồi mới tắt Chạy thử.',
            ],
            'Chân trang có Bắt đầu nhanh (3 bước có nút bấm) và Có gì mới (các thay đổi của bản đang chạy).',
          ],
        },
        {
          h: 'Chạy thử',
          items: [
            'Addon mặc định bật Chạy thử: bấm Duyệt / Từ chối / Ẩn / Xoá chỉ ghi Nhật ký, chưa gửi lên Beincom. Tắt ở Cài đặt khi đã yên tâm.',
            'Tin nhắn, bình luận bạn tự gõ và gửi thì vẫn gửi thật.',
          ],
        },
        {
          h: 'Đọc Dashboard',
          items: [
            'Số trên mỗi tab là việc đang chờ. Tổng quan → Việc cần làm gom mọi việc, việc gấp lên trước; phím J / K chọn việc, 1 2 3 bấm nút, O mở trên web.',
            '↻ Tải lại chỉ đọc lại tab đang xem (nhanh); Quét ngay quét toàn bộ, có thông báo và tự xử lý.',
            'Tab có nhiều thẻ có mục lục nhanh ở đầu; mỗi thẻ có ▾ để thu gọn.',
            'Nút ⓘ cạnh một mục: rê chuột hoặc chạm để xem mô tả ngắn. Nút ❓ mở hướng dẫn chi tiết.',
          ],
        },
        {
          h: 'Số trên biểu tượng addon',
          items: [
            'Số = yêu cầu tham gia + bài chờ duyệt + bài mới vi phạm + báo cáo chờ xử lý + bài bị Beincom gắn cờ + tin chat bị báo cáo. OFF là addon đang tắt, ! là cần đăng nhập lại Beincom.',
          ],
        },
      ],
    },

    members: {
      title: '👥 Thành viên',
      sections: [
        {
          h: 'Duyệt thành viên',
          items: [
            'Mỗi yêu cầu có ảnh, tên, câu trả lời câu hỏi gia nhập và gợi ý theo quy tắc: Gợi ý duyệt, Cần xem hoặc Gợi ý từ chối. Duyệt / từ chối từng người hoặc tick nhiều người.',
            'Người có hồ sơ vi phạm luôn ở mức Cần xem, không bao giờ được tự duyệt.',
          ],
        },
        {
          h: 'Danh sách, bị cấm, vào / rời',
          items: [
            'Danh sách: tìm theo tên hoặc username, gán / gỡ admin group, xoá, cấm khỏi community (cần quyền admin community). Xuất CSV toàn bộ danh sách (không có email).',
            'Bị cấm: người bị cấm của community, gỡ cấm từng người hoặc hàng loạt (chỉ chủ / admin community).',
            'Vào / rời gần đây: theo nhật ký hoạt động của group, số người vào / rời trong 24 giờ và 7 ngày.',
          ],
        },
        {
          h: '🛡 Bảo vệ community',
          items: [
            'Sau mỗi lần quét addon xem ai vừa vào (chỉ đọc) và báo tài khoản giống admin — kể cả viết lách như 0→o, chữ Kirin, "hỗ trợ", "cskh". Mỗi người báo một lần, có nút Cấm ở mọi community / Xoá khỏi group / Không phải.',
            'Đợt vào ồ ạt: nhiều người vào trong 60 phút (mặc định từ 30 người) — thường là tài khoản ảo trước một đợt spam. Có nút Bật Duyệt thành viên và Xem người vừa vào.',
            '🔍 Tìm trong toàn bộ thành viên để soát cả những người đã vào từ trước.',
          ],
        },
        {
          h: 'Hồ sơ vi phạm',
          items: [
            'Mỗi người một hồ sơ, gom từ mọi community bạn quản trị: bị ẩn bài, bị từ chối, bị xoá / cấm (cả do admin khác làm trên web), bị báo cáo, bài bị gắn cờ.',
            'Người có hồ sơ có huy hiệu ⚠ cạnh tên ở mọi bảng; bấm tên người để mở cửa sổ Hồ sơ (bài còn hiện, thao tác của admin, Dọn tài khoản, Cấm ở mọi community).',
          ],
        },
      ],
    },

    content: {
      title: '📰 Bài viết & bình luận',
      sections: [
        {
          h: 'Duyệt bài và bài mới đăng',
          items: [
            'Duyệt bài (community bật duyệt bài): bài chờ duyệt kèm nội dung đầy đủ và gợi ý theo quy tắc bài viết; từ chối có lý do gửi người đăng.',
            'Bài mới đăng: 20 bài mới nhất mỗi group sau mỗi lần quét. Mục Cần xử lý gồm bài vi phạm và bài cần xem; Chưa ai trả lời là bài của thành viên quá vài giờ chưa có bình luận.',
            '💬 Bình luận mở cửa sổ Bài viết & bình luận: đọc cả bài, các bình luận, trả lời ngay trong addon.',
            'Ẩn bài: gỡ bài người khác khỏi group. Xoá bài: chỉ bài của chính bạn. Bỏ qua: chỉ ẩn khỏi danh sách của addon. Còn có 📌 Ghim, ⚙ Cài đặt bài, ✎ Sửa (bài của bạn).',
          ],
        },
        {
          h: 'Bình luận mới và đợt spam',
          items: [
            'Bật Quét bình luận mới ở Cài đặt: addon đọc bình luận mới của các bài có bình luận tăng và chấm theo quy tắc bài viết. Ẩn, Bỏ qua, Trả lời ngay trong addon.',
            'Đợt spam: cùng một link (hoặc cùng nội dung) từ 3 tài khoản trở lên trong 6 giờ. Có Ẩn cả đợt, Cấm tên miền, Bỏ qua.',
            'Ô Lọc: @tên theo người đăng, #TAG theo tag, hoặc chữ bất kỳ (không cần dấu); lọc xong chọn tất cả rồi Ẩn / Bỏ qua cả loạt.',
          ],
        },
        {
          h: '🧹 Dọn tài khoản và Tìm & dọn bài',
          items: [
            'Dọn tài khoản: liệt kê và tự tìm mọi bài / bình luận còn hiện của một người trong các community bạn quản trị; bỏ tick mục không muốn ẩn, chọn lý do, tuỳ chọn cấm luôn.',
            'Tìm & dọn bài: gõ từ khoá hoặc link (vd t.me/, airdrop, một tên miền lừa đảo), chọn community và khoảng thời gian → danh sách mọi bài còn hiện khớp. Không bài nào được chọn sẵn; bài của bạn, admin và thành viên tin cậy có nhãn giữ.',
            '⚠ Ẩn là một chiều: Beincom chỉ có lệnh ẩn, không có lệnh hiện lại. Vì vậy mọi chỗ ẩn hàng loạt đều cho xem trước từng mục.',
          ],
        },
        {
          h: 'Tag',
          items: [
            'Quản lý tag (cuối tab): xem số bài dùng tag, tạo, đổi tên, xoá. Giống web: chỉ đổi tên / xoá được tag chưa gắn vào bài nào; cần quyền quản lý tag của community.',
          ],
        },
      ],
    },

    reports: {
      title: '🚩 Báo cáo',
      sections: [
        {
          h: 'Các mục',
          items: [
            'Người dùng báo cáo (chủ / admin community, chọn group gốc): bài, article, bình luận bị báo cáo, lý do và số lượt; bấm Ai đã báo cáo? để xem người báo.',
            'Gắn cờ tự động: bài hệ thống của Beincom phát hiện có dấu hiệu vi phạm, kèm loại vi phạm.',
            'Đã ẩn: bài đã bị ẩn trong group (chỉ xem).',
            'Tin nhắn chat (cần bật Chat Beincom): tin trong chat của community bị thành viên báo cáo.',
          ],
        },
        {
          h: 'Xử lý',
          items: [
            'Bỏ qua: nội dung không vi phạm, đóng báo cáo. Ẩn: gỡ nội dung khỏi community và ghi vào hồ sơ vi phạm của người viết.',
            'Làm từng mục hoặc chọn nhiều; số trên tab và biểu tượng tự trừ khi xử lý xong.',
          ],
        },
      ],
    },

    compose: {
      title: '✍ Đăng bài',
      sections: [
        {
          h: 'Soạn bài',
          items: [
            'Chọn một hoặc nhiều group: một bài hiện ở mọi group đã chọn (như chọn nhiều nơi đăng trên Beincom).',
            'Bôi đen chữ rồi bấm nút trên thanh công cụ để định dạng (Ctrl + B / I / K); có Soạn, Soạn + xem trước, Xem trước. Tối đa 3000 ký tự; addon báo nếu bài dính quy tắc bài viết của chính bạn.',
            'Gõ @ rồi vài chữ để nhắc tên; link cuối bài có thẻ xem trước (bấm × để bỏ); chọn tối đa 5 tag và 3 series.',
            'Ảnh (tối đa 10, mỗi ảnh ≤ 25 MB), một video (≤ 300 MB) hoặc tệp (tối đa 25, mỗi tệp ≤ 5 MB) — mỗi bài một loại. File tải lên Beincom lúc bấm Đăng.',
            'Đăng dưới tên group: khi chọn đúng một group bạn có quyền, bài hiện với tên và ảnh của group.',
          ],
        },
        {
          h: 'Hẹn giờ và bài định kỳ',
          items: [
            'Hẹn giờ dùng chức năng có sẵn của Beincom: tới giờ Beincom tự đăng, không cần mở trình duyệt.',
            'Lặp lại (hằng ngày, hằng tuần, 2 tuần, hằng tháng; 2–30 bài) đặt trước từng bài hẹn giờ ngay lúc bấm. Ảnh / video / tệp tải lên một lần cho mỗi bài.',
            'Bài đã hẹn giờ: đổi giờ, sửa, huỷ (bài của chính bạn); xem dạng Danh sách, Tuần hoặc Tháng như một lịch nội dung.',
            'Gợi ý giờ đăng lấy từ Thống kê → Giờ đăng tốt nhất.',
          ],
        },
        {
          h: 'Chào thành viên mới, vinh danh, bài thảo luận',
          items: [
            'Chào thành viên mới: chọn group và 7 / 14 / 30 ngày → Tìm người mới → tick người → Soạn bài chào.',
            'Vinh danh: chọn group, khoảng ngày và Top 3 / 5 / 10 → Tìm người tích cực → Soạn bài vinh danh.',
            'Mẫu bài dùng chỗ trống {danh_sach} (@tên từng người), {so_nguoi} (số người), {group} (tên group). ✨ AI viết bài viết mẫu mới cho bạn.',
            'Bài thảo luận hằng tuần: câu hỏi mồi để thành viên có chủ đề trả lời. ✍ Soạn ngay chọn câu chưa dùng ở group trong 8 tuần và giờ có tương tác tốt nhất.',
            'Addon chỉ soạn vào ô Đăng bài — bạn xem lại rồi tự bấm Đăng.',
          ],
        },
      ],
    },

    csv: {
      title: '📄 Nhập nhiều bài từ CSV',
      sections: [
        {
          h: 'Cách làm',
          items: [
            [
              'Soạn lịch đăng cả tháng trong Excel hoặc Google Sheets, mỗi bài một dòng.',
              'Lưu thành tệp CSV (Google Sheets: Tệp → Tải xuống → CSV). Nút Tải tệp mẫu có sẵn tên group của bạn.',
              'Tab Đăng bài → Nhập nhiều bài từ CSV: chọn tệp hoặc kéo thả vào ô.',
              'Bản xem trước báo lỗi từng dòng (thiếu nội dung, group không có, giờ đã qua…) — dòng lỗi bị bỏ qua. Bấm hẹn giờ một lần cho tất cả.',
            ],
          ],
        },
        {
          h: 'Các cột',
          items: [
            'Bắt buộc — noi_dung: nội dung bài.',
            'Bắt buộc — group: tên group, "Community > Group" hoặc mã group; nhiều group cách nhau dấu ;.',
            'Bắt buộc — gio_dang: giờ Việt Nam, vd 15/10/2026 20:00 hoặc 2026-10-15 20:00.',
            'Tuỳ chọn — quan_trong, tat_binh_luan: có / không.',
          ],
        },
        {
          h: 'Giới hạn',
          items: ['Tối đa 100 bài mỗi tệp. Bài chỉ có chữ (không ảnh / video / tệp). Đang Chạy thử thì chỉ ghi Nhật ký.'],
        },
      ],
    },

    article: {
      title: '📝 Article & Series',
      sections: [
        {
          h: 'Article',
          items: [
            'Giống web Beincom: cần tiêu đề, ảnh bìa và ít nhất một chuyên mục; hẹn giờ thì tới giờ Beincom tự đăng.',
            'Bôi đen chữ rồi bấm nút để định dạng (Ctrl + B / I / U / K). Một dòng chỉ có link YouTube / Vimeo là video nhúng. Ai quen Markdown gõ thẳng được: ## tiêu đề, **đậm**, - danh sách, | bảng |.',
            'Ảnh trong bài tải lên Beincom lúc bấm Đăng. Nháp chữ được lưu tự động (ảnh bìa thì không).',
          ],
        },
        {
          h: 'Series',
          items: ['Series gom các Article theo chủ đề. Tạo series trước, rồi chọn series khi soạn Article.'],
        },
      ],
    },

    stats: {
      title: '📊 Thống kê & báo cáo',
      sections: [
        {
          h: 'Thống kê',
          items: [
            'Chọn community hoặc group và 7 / 30 / 90 ngày: thành viên, bài viết, bài nổi bật, người đăng tích cực.',
            'Giờ đăng tốt nhất: bảng 7 ngày × 24 giờ theo tương tác trung bình mỗi bài, và 3 khung giờ nên đăng.',
            'Hiệu quả bài đã đăng qua addon: lượt xem, cảm xúc, bình luận sau 24 giờ và 7 ngày.',
          ],
        },
        {
          h: 'Báo cáo tháng',
          items: [
            'Thành viên đầu → cuối tháng, người mới còn ở lại bao nhiêu, bài viết, kiểm duyệt qua addon và bảng Đội admin (ai làm gì).',
            '📋 Sao chép, Tải tệp .txt hoặc Gửi về Telegram để chia sẻ với các admin khác.',
          ],
        },
        {
          h: 'Thành viên mới có ở lại không?',
          items: [
            'Phân tích người vào trong 30 / 60 / 90 ngày: còn ở lại, đã đăng bài, có bình luận, chưa thấy hoạt động.',
            '✉ Soạn bài nhắc người chưa hoạt động: bài có @tên những người còn ở lại nhưng im lặng, bạn xem rồi tự đăng.',
          ],
        },
        {
          h: 'Tóm tắt hoạt động',
          items: ['Tổng quan → Tóm tắt hoạt động (7 / 30 ngày) lấy từ Nhật ký addon; việc làm thẳng trên web Beincom không có trong đó.'],
        },
      ],
    },

    rules: {
      title: '📋 Quy tắc lọc',
      sections: [
        {
          h: 'Quy tắc thành viên',
          items: [
            'Gợi ý từ chối: tài khoản bị vô hiệu hoá, dính từ khoá cấm (trong tên, username, câu trả lời) hoặc mạo danh admin.',
            'Cần xem: không ảnh đại diện, chưa trả lời câu hỏi bắt buộc hoặc trả lời quá ngắn, chưa xác minh (nếu bật), có hồ sơ vi phạm.',
            'Gợi ý duyệt: đạt mọi quy tắc. Username luôn duyệt / luôn từ chối thắng mọi quy tắc khác.',
          ],
        },
        {
          h: 'Quy tắc bài viết',
          items: [
            'Dùng cho Duyệt bài, Bài mới đăng, Bình luận và tin chat.',
            'Vi phạm: có từ khoá cấm hoặc link tới tên miền cấm (tính cả tên miền con: cấm t.me thì chặn cả www.t.me).',
            'Cần xem: từ khoá cần xem; liên hệ riêng (số điện thoại, link Zalo / Telegram / WhatsApp) và link ra ngoài các tên miền cho phép — khi bật.',
            'Từ khoá không phân biệt hoa thường và dấu: "kiem tien" khớp "Kiếm Tiền". Đổi quy tắc là đánh giá cập nhật ngay.',
          ],
        },
        {
          h: 'Quy tắc riêng, mẫu có sẵn, chia sẻ',
          items: [
            'Áp dụng quy tắc cho → chọn group → Dùng quy tắc riêng cho group này. Quy tắc riêng của community dùng luôn cho các group con chưa có quy tắc riêng.',
            '🛡 Bộ mẫu chống lừa đảo: thêm các từ khoá lừa đảo hay gặp (gửi trước nhận sau, cam kết lợi nhuận, seed phrase…) vào quy tắc đang sửa, có xem trước.',
            'Xuất quy tắc / Nhập quy tắc… để gửi bộ quy tắc cho admin khác.',
            'Quy tắc chỉ là gợi ý — addon chỉ tự làm khi bạn bật Tự xử lý.',
          ],
        },
      ],
    },

    auto: {
      title: '🤖 Tự xử lý',
      sections: [
        {
          h: 'Các tuỳ chọn (mặc định tắt)',
          items: [
            'Tự duyệt "Gợi ý duyệt" và Tự từ chối "Gợi ý từ chối": yêu cầu tham gia, chạy sau mỗi lần quét.',
            'Tự ẩn spam có link cấm: bài và bình luận mới có link tới Tên miền cấm bị ẩn với lý do Spam. Chỉ xét tên miền cấm; không ẩn của chính bạn; tối đa 20 mục mỗi lần.',
            'Tự duyệt bài của thành viên tin cậy: bài chờ duyệt đạt mọi quy tắc bài viết của người trong danh sách Thành viên tin cậy (hoặc đã được duyệt đủ 3 / 5 / 10 bài qua addon). Thêm nhanh bằng nút ⭐ ở hàng chờ duyệt bài.',
          ],
        },
        {
          h: 'Luôn an toàn',
          items: [
            '"Cần xem" không bao giờ tự xử lý; người có hồ sơ vi phạm không bao giờ được tự duyệt.',
            'Đang Chạy thử thì chỉ ghi Nhật ký. Mọi việc tự làm đều ghi Nhật ký với nguồn "Addon tự xử lý".',
          ],
        },
      ],
    },

    notify: {
      title: '🔔 Thông báo & theo dõi',
      sections: [
        {
          h: 'Thông báo',
          items: [
            'Có thông báo khi có yêu cầu tham gia mới, bài chờ duyệt tăng, bài / bình luận mới vi phạm, báo cáo mới, bài bị gắn cờ, tin chat bị báo cáo. Lần quét đầu chỉ ghi nhận, không báo.',
            'Bấm thông báo để mở thẳng đúng tab. Addon quét khi mở trình duyệt rồi theo Chu kỳ quét (15 phút – 4 giờ).',
            'Sáng thứ Hai: tóm tắt tuần, nhắc chào thành viên mới / vinh danh; đầu tháng: nhắc xem báo cáo tháng — mỗi loại tắt riêng được.',
          ],
        },
        {
          h: '🔔 Theo dõi',
          items: [
            'Từ khoá cần để ý (vd lừa đảo, mất tiền, tên dự án): không phải vi phạm, nhưng bài / bình luận mới nhắc tới thì báo và hiện ở Việc cần làm.',
            'Nhắc bài chưa ai trả lời: bài của thành viên quá số giờ đã chọn mà chưa có bình luận.',
            'Nhắc việc chờ lâu: yêu cầu tham gia và bài chờ duyệt chờ quá số giờ đã chọn — mỗi việc báo một lần.',
          ],
        },
      ],
    },

    telegram: {
      title: '✈ Telegram',
      sections: [
        {
          h: 'Tạo bot (2 phút)',
          items: [
            [
              'Trong Telegram, nhắn @BotFather lệnh /newbot, đặt tên → nhận token dạng 123456789:AA….',
              'Mở bot vừa tạo, bấm Start (hoặc nhắn /start).',
              'Cài đặt → Gửi thông báo về Telegram: dán token, bấm Lấy chat ID, rồi Gửi thử và Lưu.',
            ],
            'Muốn nhận trong một nhóm Telegram: thêm bot vào nhóm, nhắn một tin trong nhóm rồi bấm Lấy chat ID.',
            'Token chỉ lưu trong trình duyệt này: không có trong bản sao lưu, không đồng bộ.',
          ],
        },
        {
          h: 'Chọn loại tin',
          items: [
            'Tick các loại muốn nhận: đợt spam, báo cáo, bài / bình luận vi phạm, yêu cầu tham gia và bài chờ duyệt, từ khoá, tóm tắt tuần, tin nhắn riêng… Tuỳ chọn không gửi từ 23:00 đến 7:00 (trừ đợt spam và cần đăng nhập).',
          ],
        },
        {
          h: 'Nút xử lý ngay trong tin',
          items: [
            'Bật Kèm nút xử lý ngay trong tin: mỗi việc mới là một tin riêng có nút (tối đa 10 tin mỗi lần quét) thay cho tin gộp. Nhớ bật loại tin tương ứng (vd "Yêu cầu tham gia, bài chờ duyệt").',
            'Nút: ✅ Duyệt / ❌ Từ chối yêu cầu tham gia, ✅ Duyệt bài, 🙈 Ẩn / Bỏ qua bài và bình luận vi phạm, Ẩn cả đợt spam.',
            'Addon đọc nút bấm mỗi 30 giây khi trình duyệt đang mở; bấm nút có tác dụng như bấm trong Dashboard. Đang Chạy thử thì chỉ ghi Nhật ký (nguồn "Telegram").',
            'Chỉ nhận nút bấm trong đúng chat đã cài — nếu là nhóm Telegram thì mọi thành viên nhóm đều bấm được.',
          ],
        },
      ],
    },

    chat: {
      title: '💬 Chat Beincom',
      sections: [
        {
          h: 'Bật chat',
          items: [
            'Cài đặt → 💬 Chat Beincom → Kết nối chat Beincom. Addon dùng chính phiên đăng nhập của bạn (như web).',
            'Quét tin nhắn kênh chat: chấm tin mới trong kênh của các group bạn quản trị theo quy tắc bài viết; xem ở Bài viết → Tin nhắn chat.',
            'Báo tin nhắn riêng, nhắc tên và bình luận ở thread bạn theo dõi; Kiểm tra nhanh mỗi phút để được báo trong khoảng 1 phút.',
          ],
        },
        {
          h: 'Trang Chat',
          items: [
            'Nút 💬 Chat mở trang Chat: tin nhắn riêng, kênh theo cộng đồng (group con theo cây), thread, lời mời trò chuyện, tìm tin.',
            'Rê chuột (hoặc chạm) vào tin để thả biểu cảm, trả lời, bình luận, sửa, sao chép, ghim, xoá. Gõ / ở đầu ô để chèn câu trả lời mẫu; gõ @ để nhắc tên.',
            'Bấm tên / ảnh một người để mở hồ sơ: nhắn riêng, hồ sơ vi phạm, Dọn tài khoản.',
            'Tin bạn tự gõ gửi thật kể cả khi Chạy thử. Nội dung tin không lưu ra máy.',
          ],
        },
      ],
    },

    ai: {
      title: '✨ Dùng AI',
      sections: [
        {
          h: 'AI giúp được gì',
          items: [
            'Trả lời bình luận hàng loạt: tab Bài viết → Bình luận mới → chọn bình luận → ✨ Trả lời bằng AI (hoặc mở một bài → ✨ Trả lời hàng loạt bằng AI).',
            'Viết bài chào thành viên mới / vinh danh: tab Đăng bài → ✨ AI viết bài. AI viết mẫu bài mới, addon tự điền @tên những người bạn đã chọn.',
            'Tóm tắt bình luận của một bài: cửa sổ Bài viết & bình luận → ✨ Tóm tắt bình luận.',
            'AI chỉ viết nháp: bạn xem, sửa, bỏ chọn rồi tự bấm Trả lời tất cả / Đăng. Đang bật Chạy thử thì chỉ ghi nhật ký.',
          ],
        },
        {
          h: 'Cách 1 — AI trên web (chép – dán), không cần khoá',
          items: [
            [
              'Chọn trang chat AI (Claude, ChatGPT hoặc Gemini — đã đăng nhập sẵn) rồi bấm Chép đề bài & mở….',
              'Trong trang chat: bấm vào ô nhập, dán (Ctrl + V; trên iPhone giữ ngón tay rồi chọn Dán), gửi.',
              'Đợi AI viết xong, bấm nút chép câu trả lời của trang chat.',
              'Quay lại addon bấm 📋 Dán — addon điền nháp vào từng bình luận / ô Kết quả.',
            ],
            'Trên iPhone, Claude mở thẳng ứng dụng Claude (đã đăng nhập sẵn, khỏi đăng nhập lại trên web); chưa cài ứng dụng thì bấm Mở bản web. ChatGPT / Gemini mở bằng link thường — iPhone tự mở ứng dụng nếu được.',
            'Addon chỉ chép đề bài và mở trang; mọi thao tác trên trang chat do bạn làm (các trang chat AI cấm phần mềm tự điều khiển).',
          ],
        },
        {
          h: 'Cách 2 — Khoá API Claude (tự động)',
          items: [
            [
              'Tạo khoá ở console.anthropic.com → API Keys (cần nạp tiền vào tài khoản Anthropic).',
              'Cài đặt → ✨ Trả lời bình luận bằng AI: dán khoá, bấm Kiểm tra rồi Lưu.',
              'Trong hộp AI chọn Khoá API Claude (tự động) → Tạo câu trả lời.',
            ],
            'Chi phí tính vào tài khoản Anthropic của bạn: Opus 5.5 khoảng 0,02–0,1 USD cho 20 bình luận; Sonnet 5.5 rẻ bằng nửa, Haiku 5.5 rẻ nhất. Hộp báo chi phí ước tính sau mỗi lần tạo.',
          ],
        },
        {
          h: 'Mẹo',
          items: [
            'Giọng văn và Hướng dẫn thêm (vd: xưng mình – bạn; hỏi về phần thưởng thì nhắc đọc bài ghim) giúp câu trả lời đúng ý hơn.',
            'AI viết ngắn gọn, thân thiện, không trùng lặp giữa các câu; bình luận chỉ có icon thì trả lời bằng icon; spam / lừa đảo thì AI đề nghị bỏ qua.',
          ],
        },
        {
          h: 'Riêng tư',
          items: [
            'Gửi cho AI: chữ của bài và các bình luận (tên người viết, nội dung). Không gửi mật khẩu, cookie hay dữ liệu khác.',
            'Khoá API chỉ lưu trong trình duyệt này: không có trong bản sao lưu, không đồng bộ.',
          ],
        },
      ],
    },

    backup: {
      title: '💾 Sao lưu & đồng bộ',
      sections: [
        {
          h: 'Sao lưu cài đặt',
          items: [
            'Tải bản sao lưu: tệp gồm cài đặt, quy tắc (chung và riêng từng group), mẫu bài, kho câu hỏi thảo luận, câu trả lời mẫu của Chat — để chuyển sang máy khác hoặc giữ lại khi cài lại addon.',
            'Tuỳ chọn kèm hồ sơ vi phạm và lịch sử số liệu (hiệu quả bài, số thành viên theo ngày, nhật ký thao tác).',
            'Không chứa mật khẩu, phiên đăng nhập, token Telegram hay khoá API.',
            'Khôi phục từ tệp…: hộp xác nhận ghi rõ các mục sẽ thay; hồ sơ vi phạm và lịch sử thì gộp thêm, không trùng.',
          ],
        },
        {
          h: 'Đồng bộ giữa các máy',
          items: [
            'Bật Đồng bộ qua tài khoản Chrome / Edge: cài đặt, quy tắc, mẫu bài chào / vinh danh đi theo tài khoản trình duyệt sang máy khác có cài BeinFusion.',
            'Không đồng bộ: công tắc bật addon, mẫu bài đăng, hồ sơ vi phạm (dùng Sao lưu).',
          ],
        },
      ],
    },

    beinios: {
      title: '📱 BeinIOS (iPhone)',
      sections: [
        {
          h: 'BeinIOS là gì',
          items: [
            'BeinFusion chạy như ứng dụng trên iPhone: thêm trang BeinIOS vào Màn hình chính bằng Safari. Cần một proxy Cloudflare của riêng bạn (địa chỉ + khoá).',
            'Trên iPhone có đủ Chat, Quản trị (Dashboard) và Cài đặt như addon.',
          ],
        },
        {
          h: 'Chuyển đăng nhập từ addon',
          items: [
            [
              'Trên máy tính, nên mở cửa sổ ẩn danh và đăng nhập Beincom (để BeinIOS có phiên riêng).',
              'Dashboard → Cài đặt → 📱 BeinIOS → Chuyển đăng nhập sang BeinIOS. Lần đầu addon xin quyền đọc cookie Beincom.',
              'Điền mục Proxy của BeinIOS (địa chỉ + khoá) để có mã QR ngắn.',
              'Quét mã QR bằng Camera iPhone → mở trang → Chép, rồi ở BeinIOS → Cài đặt → Proxy & Login bấm Dán từ addon.',
              'Đóng cửa sổ ẩn danh — đừng bấm Đăng xuất.',
            ],
            'Không có proxy: bấm Chép rồi gửi đoạn chữ sang iPhone qua cách riêng tư, dán ở Dán từ addon.',
          ],
        },
        {
          h: 'An toàn',
          items: [
            'Đăng nhập là chìa khoá tài khoản Beincom: addon không gửi cookie đi đâu, không lưu lại; mã tự ẩn sau 2 phút hoặc khi đóng hộp.',
            'Mã QR ngắn: đăng nhập được mã hoá trước khi gửi lên proxy của bạn; proxy chỉ giữ bản mã hoá, dùng một lần, tối đa 5 phút.',
          ],
        },
      ],
    },

    support: {
      title: '🛠 Khi gặp trục trặc',
      sections: [
        {
          h: 'Tự kiểm tra',
          items: [
            'Nhật ký → Tự kiểm tra → ▶ Chạy kiểm tra: addon gọi thử (chỉ đọc) các API mà tính năng dùng và báo mục nào lỗi. Bật Tự kiểm tra mỗi ngày để được báo khi Beincom đổi gì đó.',
            '📋 Sao chép kết quả hoặc Gửi về Telegram để gửi người hỗ trợ.',
          ],
        },
        {
          h: 'Lỗi kỹ thuật',
          items: [
            'Addon tự ghi lỗi khi chạy (của nền, Dashboard, cửa sổ nhỏ, trang Chat) và lỗi Beincom trả về khi gọi API — không ghi nội dung bài, mật khẩu hay token.',
            'Gặp trục trặc: Nhật ký → Lỗi kỹ thuật → 📋 Sao chép báo cáo rồi dán cho người hỗ trợ. Hết phiên đăng nhập và bài đã bị xoá trên web không tính là lỗi.',
          ],
        },
        {
          h: 'Báo cáo sử dụng',
          items: [
            'Giúp tác giả biết addon được dùng thế nào và chỗ nào hay lỗi. Addon chỉ đếm trong máy (tính năng nào dùng bao nhiêu lần, cài đặt nào đang bật, lỗi kỹ thuật) — không có tên group, tên thành viên hay nội dung bài.',
            'Không tự gửi đi đâu: xem ở Nhật ký → Báo cáo sử dụng rồi tự gửi cho tác giả (Kai | Crypto Life), hoặc bật Tự gửi mỗi tuần nếu đồng ý.',
          ],
        },
        {
          h: 'Hay gặp',
          items: [
            'Biểu tượng có dấu !: phiên Beincom hết hạn — mở group.beincom.com đăng nhập lại.',
            'Không thấy group: tài khoản không phải admin group đó, hoặc chưa quét xong — bấm Quét ngay.',
            'Bấm mà không có gì xảy ra trên Beincom: kiểm tra Chạy thử đang tắt chưa.',
          ],
        },
      ],
    },
  };

  // Mục lục: nhóm → các chủ đề theo thứ tự hiện
  const HELP_INDEX = [
    { label: 'Bắt đầu', topics: ['start'] },
    { label: 'Quản trị', topics: ['members', 'content', 'reports', 'compose', 'csv', 'article', 'stats'] },
    { label: 'Quy tắc & tự động', topics: ['rules', 'auto', 'notify', 'telegram'] },
    { label: 'Khác', topics: ['chat', 'ai', 'backup', 'beinios', 'support'] },
  ];

  Object.assign(BG, { HELP_TOPICS, HELP_INDEX });
});
