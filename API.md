# API quản trị Group/Community Beincom

Ghi lại ngày 2026-10-07: đọc mã JavaScript của group.beincom.com (966 file) và gọi thử các API **chỉ đọc** bằng tài khoản đang đăng nhập. Chưa gọi API ghi nào: các dòng ghi "chưa gọi" lấy từ mã nguồn, cần thử trên community test trước khi dùng thật.

Ký hiệu cột **Thử**: ✅ đã gọi, trả 200 · ⏱ gọi nhưng không trả lời trong 30 giây · — chưa gọi (API ghi).

## Chung
- Gốc API:
  - `https://api.beincom.com/v1/group/…` — community, group, thành viên, quyền
  - `https://api.beincom.com/v1/content/…` — bài viết, duyệt bài, báo cáo
- Header: `x-application: BIC_GROUP`, `x-platform: WEB`, `x-version-id: 2.0.0` (một vài API dùng `2.1.0`). Xác thực bằng cookie (`credentials: 'include'`), giống addon `Beincom`.
- Body và query gửi lên dùng **snake_case** (trang tự đổi `approvalStatus` → `approval_status`, `userIds` → `user_ids`). Dữ liệu trả về phần lớn là camelCase.
- Dữ liệu trả về: `{ code: "api.ok", data, meta }`. Lỗi: `code: "api.validation_error"`, `meta.message`.
- Phân trang có hai kiểu:
  - Theo con trỏ: `data.meta.hasNextPage` / `endCursor`, trang sau gửi `after=<endCursor>`
  - Theo trang: `limit`, `page`, `sort=desc` (nhật ký hoạt động)

### Hai loại ID
- `communityId`: ID trong link `/community-detail/<communityId>`.
- `groupId` gốc: lấy từ `GET group/communities/{communityId}` → `data.groupId`. Phần lớn API của nhóm `/v1/content/manage/…` cần **ID này** (trong mã tên là `rootGroupId`), không phải `communityId`.

## 1. Community và quyền
| Method | Đường dẫn | Ghi chú | Thử |
|---|---|---|---|
| GET | `group/me/permissions` | `data.communities[communityId]` và `data.groups[groupId]` là danh sách quyền | ✅ |
| GET | `group/communities/{communityId}` | `groupId`, `name`, `privacy`, `userCount`, `totalPendingMembers`, `settings`, `ownerId` | ✅ |
| GET | `group/manage/communities/{communityId}/groups` | Cây group con | ✅ |

Các quyền cần biết:
- Vai trò: `role_OWNER`, `role_COMMUNITY_ADMIN`, `role_GROUP_ADMIN`
- Quản trị chung: `manage`
- Duyệt và quản lý thành viên: `approve_reject_jr` (duyệt yêu cầu tham gia), `remove_member`, `ban_member`, `assign_unassign_role`
- Cài đặt: `edit_join_setting`, `edit_own_content_setting`
- Nội dung: `pin_content`

Addon chỉ hiện chức năng khi tài khoản có quyền tương ứng.

## 2. Duyệt thành viên (yêu cầu tham gia)
| Method | Đường dẫn | Body / tham số | Thử |
|---|---|---|---|
| GET | `group/groups/{groupId}/join-requests` | `limit`, `offset` → `meta.total`, `meta.hasNextPage` | ✅ |
| PUT | `group/groups/{groupId}/joining-requests/{joinRequestId}/approve` | — | — |
| PUT | `group/groups/{groupId}/joining-requests/{joinRequestId}/decline` | — | — |
| PUT | `group/groups/{groupId}/joining-requests/approve` | **Duyệt TẤT CẢ** yêu cầu đang chờ | — |
| PUT | `group/groups/{groupId}/joining-requests/decline` | **Từ chối TẤT CẢ** | — |
| GET/POST | `group/groups/{groupId}/membership-questions` | Câu hỏi khi xin vào | ✅ (GET) |
| PUT/DELETE | `group/groups/{groupId}/membership-questions/{id}` | | — |

Mỗi yêu cầu gồm:
- `id` (dùng làm `joinRequestId`), `groupId`, `userId`, `status: "waiting"`, `createdAt`, `membershipAnswers: []`
- `user`: `id`, `username`, `fullname`, `avatar`, `isVerified`, `isDeactivated`, `subscriptions[]` (vd `type: "premium"`), `userNFT { isLinkedPoNFT, isLinkedUoNFT }`

Câu hỏi gia nhập gồm `id`, `question`, `isRequired`.

`totalPendingMembers` trong thông tin group có thể vẫn là 0 khi đang có yêu cầu chờ. Muốn đếm đúng thì dùng `meta.total` của `join-requests`.

Quyền: admin group (`role_GROUP_ADMIN`) đọc được `join-requests`, `users`, `settings`, `activity-logs` của group và `approval-contents/count`. Các API `stats` của `manage/communities` cần quyền `manage` (admin community), nếu không sẽ trả 403.

## 3. Thành viên
Body của API nhóm `group/` phải gửi **snake_case**: web viết `userIds` nhưng client tự đổi thành `user_ids` trước khi gửi.

| Method | Đường dẫn | Body / tham số | Thử |
|---|---|---|---|
| GET | `group/manage/communities/{communityId}/members` | `limit` (≤100), `offset`, `key` (tìm theo tên/username, có dấu được), `sort=joined_at:desc` \| `is_community_admin:desc` → `meta.total`, `meta.hasNextPage`; mỗi người: `id`, `username`, `fullname`, `avatar`, `joinedAt`, `isCommunityAdmin`, `totalJoinedGroup`, `totalGroupAdmin`, `isVerified` | ✅ |
| GET | `group/groups/{groupId}/users` | `limit`, `offset`, `key`. Trả `groupAdmin` và `groupMember` (mỗi phần có `data`, `userCount`); admin ra trước, `offset` tính chung. **Không có ngày vào** | ✅ |
| PUT | `group/groups/{groupId}/users/remove` | `{ user_ids: [...] }`. Group gốc = xoá khỏi community | — |
| PUT | `group/manage/communities/{communityId}/groups/{groupId}/users/remove` | `{ user_ids: [...] }` | — |
| PUT | `group/communities/{communityId}/assign-admin` · `revoke-admin` | `{ user_ids: [...] }` (admin community) | — |
| PUT | `group/groups/{groupId}/assign-admin` · `revoke-admin` | `{ user_id }` (admin group) | — |
| POST | `group/communities/{communityId}/users/{userId}/ban` | `{ reason: "SPAM" \| "BULLYING" \| "VIOLATE_RULE" }`, cần quyền `ban_member` của community | — |
| POST | `group/communities/{communityId}/users/{userId}/unban` | | — |
| GET | `group/communities/{communityId}/banned-members` | `limit`, … | ✅ |
| GET | `group/member-ban-reasons` | `[{ id: "SPAM", value: "Spam" }, { id: "BULLYING", … }, { id: "VIOLATE_RULE", … }]` | ✅ |

Nhật ký hoạt động của group (`GET group/groups/{groupId}/activity-logs`):
- Tham số: `limit`, `page`, `sort=desc`. Lọc được theo `useCase` (vd `useCase=leave.group`); tham số `eventType` thì bị bỏ qua. Mỗi trang 50 dòng mất khoảng 3–5 giây.
- Mỗi dòng có `useCase`, `eventTime`, `data.actor`, `data.user`, `data.changes`. Với sự kiện tự làm (vào, rời) thì không có `data.user`: người liên quan chính là `actor`.
- Các `useCase` gặp trong mã:
  - Vào: `join.community.as_member`, `join.group.as_member`, `join.group.as_admin`, `approve.join_request`, `accept.invitation`
  - Rời / bị đưa ra: `leave.group`, `remove.member`, `ban.member`
  - Vai trò: `assign.group_admin`, `revoke.group_admin`, `assign.community_admin`, `revoke.community_admin`
  - Khác: `unban.member`, `decline.join_request`, `decline.invitation`, `cancel.invitation`, `assign.group_badge`, `assign.group_scheme`
- Bản `manage/communities/{id}/activity-logs` cần quyền admin community (admin group nhận 403).

## 4. Duyệt bài (khi bật `contentApproval`)
API nhóm `content/` nhận tên trường **camelCase** (client của web không đổi sang snake_case như nhóm `group/`). Query `approvalStatus` và `approval_status` đều được.

| Method | Đường dẫn | Body / tham số | Thử |
|---|---|---|---|
| GET | `content/manage/communities/{groupId}/approval-contents` | `approvalStatus=WAITING_APPROVAL`, `limit`, `after` → `data.list`, `data.meta.endCursor` / `hasNextPage` | ✅ |
| GET | `content/manage/communities/{groupId}/approval-contents/count` | `approvalStatus=…` → số | ✅ |
| GET | `content/manage/communities/{groupId}/approval-contents/{contentId}` | Chi tiết: có `content` đầy đủ | ✅ |
| PUT | `content/contents/approval-contents/{contentId}` | `{ status: "APPROVED" }` hoặc `{ status: "REJECTED", rejectionReason: { reason } }` | — |

- Các trạng thái: `WAITING_APPROVAL`, `APPROVED`, `REJECTED`, `AUTO_APPROVED`.
- Mỗi bài trong danh sách có `id`, `type`, `title`, `actor`, `audience.groups[]` (mỗi group có `approval.status`), `media`, `linkPreview`, `submittedAt`. **Không có `content`**: `title` chỉ là 500 ký tự đầu, muốn có cả bài phải gọi API chi tiết.
- Admin group (chưa phải admin community) vẫn đọc được danh sách và số bài chờ duyệt.

## 5. Bài đã đăng: xem, ẩn, ghim
| Method | Đường dẫn | Body / tham số | Thử |
|---|---|---|---|
| GET | `content/timeline/{groupId}` | `limit`, `after`, `type?`, `order?` → bài mới nhất trước; mỗi bài có `content`, `actor`, `audience`, `media`, `linkPreview`, `isHidden`, `commentsCount`, `latestComment` | ✅ |
| GET | `content/manage/groups/{groupId}/contents/published` · `hidden` · `flagged` | `type=POST`, `limit`, `after` (`published` chậm ~5 giây) | ✅ |
| POST | `content/contents/{contentId}/hide` | `{ reasonType, groupIds: [...] }`: ẩn bài khỏi các group đã chọn | — |
| GET | `content/contents/pinned-content/groups/{groupId}` | Bài đang ghim | ✅ |
| PUT | `content/contents/pinned-content/{contentId}` | `{ pinGroupIds, unpinGroupIds }` | — |

- `reasonType`: `SPAM`, `BULLYING_THREATENING_OR_HARASSING`, `VIOLENT_OR_PORN`, `PRETENDING_SOMEONE`, `ILLEGAL`, `CHILD_ABUSE_EXPLOITATION`, `OTHERS`.
- Không tìm thấy API hiện lại bài đã ẩn trong mã web.
- Link bài trên web: `/posts/{id}` (bài thường), `/article/{id}` (article).
- Bình luận: base `content/comments` (thêm, sửa, xoá, trả lời). Chưa tìm ra API đọc danh sách bình luận của một bài.

## 6. Báo cáo vi phạm
| Method | Đường dẫn | Body / tham số | Thử |
|---|---|---|---|
| GET | `content/manage/communities/{groupId}/content-reports` | `limit`, `after` | ⏱ / 400 |
| GET | `content/manage/communities/{groupId}/content-reports/{id}` | Chi tiết, số lượng theo lý do | — |
| PUT | `content/manage/communities/{groupId}/content-reports/{targetId}/status` | `{ status: "IGNORED" \| "HID" }` | — |

- Trạng thái: `CREATED`, `IGNORED`, `HID`. Loại nội dung: `POST`, `ARTICLE`, `COMMENT`.
- Cần quyền admin community: admin group nhận lỗi `400 community.not_admin`.
- Gọi bằng tài khoản chủ community Food Research thì API không trả lời trong hơn 60 giây (thử 2 lần). Addon chưa dùng.

## 7. Đăng bài và hẹn giờ
Luồng của web: tạo bản nháp (lấy `id`), rồi đăng ngay hoặc hẹn giờ trên bản nháp đó. Body camelCase.

| Method | Đường dẫn | Body / tham số | Thử |
|---|---|---|---|
| POST | `content/posts` | `{ audience: { groupIds: [...] }, isEnableDonation: false }` → `data.id` (bản nháp) | — |
| PUT | `content/posts/{id}/publish` | `{ audience: { groupIds, userIds: [] }, content, media: { images, videos, files }, setting, mentions: {}, linkPreview?, tags: [], series: [] }` | — |
| PUT | `content/posts/{id}/schedule` | Như publish, thêm `scheduledAt` (ISO) | — |
| PATCH | `content/posts/{id}` | Sửa bài (cùng body, không có `scheduledAt`) | — |
| DELETE | `content/posts/{id}` | Xoá bài / bản nháp của mình | — |
| PUT | `content/contents/{id}/reschedule` | `{ scheduledAt }` | — |
| GET | `content/manage/groups/{groupId}/contents/scheduled` | `type=POST\|ARTICLE\|SERIES`, `limit`, `after`: bài đang chờ tới giờ đăng | ✅ |
| GET | `content/manage/groups/{groupId}/contents/pending` | như trên | ✅ |

- `content` là **markdown**. Bài thật có cả `\n` lẫn `\n\n`, không dùng ký hiệu ngắt dòng đặc biệt; `**đậm**` dùng được. Web đổi `#` / `##` thành `###` khi mở lại bài.
- Tối đa **3000 ký tự** mỗi bài.
- `setting` mặc định: `{ canComment: true, canReact: true, isImportant: false, importantExpiredAt: null }`.
- Một bài đăng được vào nhiều group cùng lúc qua `audience.groupIds`.
- Trạng thái bài: `DRAFT`, `PROCESSING`, `PUBLISHED`, `WAITING_SCHEDULE`, `SCHEDULE_FAILED`, `WAITING_SCAN`, `SCAN_REJECTED`.
- Beincom giới hạn số bản nháp (lỗi `DraftLimitExceededException`).
- Web còn có "đăng dưới danh nghĩa group": `POST …/{groupId}/posts`, sau cờ tính năng `create-content-by-group`. Addon chưa dùng.
- Ảnh/video phải tải lên qua API upload riêng trước khi đăng. Addon chưa làm.

## 8. Thống kê và nhật ký
Thống kê chính thức chỉ dành cho **chủ / admin community**. Admin group nhận `403 forbidden` hoặc `400 community.not_admin`.

| Method | Đường dẫn | Tham số | Thử |
|---|---|---|---|
| GET | `group/manage/communities/{communityId}/stats` | → `{ invitationCount, reportedUserCount }` | ✅ |
| GET | `group/manage/communities/{communityId}/stats/member-count` | `from`, `to` (ISO, **bắt buộc**); mỗi ngày: `date` (`…T00:00:00.000Z`), `memberCount`, `joinedCount`, `leftCount`, `memberCountPercentageChange` | ✅ |
| GET | `content/stats/communities/{groupId gốc}/contents/daily-counts` | `from`, `to`; mỗi ngày: `postCount`, `articleCount`, `seriesCount`, `totalCount` (+ `…PercentageChange`). Dùng **ID group gốc**, gọi bằng `communityId` sẽ bị `community.not_admin` | ✅ |
| GET | `group/manage/communities/{communityId}/statistics/top-contributors` | (community thử nghiệm trả mảng rỗng) | ✅ |
| GET | `group/manage/communities/{communityId}/activity-logs` | `limit`, `page`, `sort=desc`, `groupId?` | ✅ |
| GET | `group/groups/{groupId}/activity-logs` | như trên; mỗi dòng: `eventType`, `eventTime`, `actor`, `user`, `changes {old,new}` | ✅ |

Khi không có số liệu chính thức, addon tự tính:
- **Vào / rời**: đếm `activity-logs` của group.
- **Bài mới, cảm xúc, bình luận**: đọc `content/timeline/{groupId}` của các group đang quản trị. Mỗi bài có `reactionsCount` (đếm theo loại cảm xúc) và `commentsCount`.
- **Số thành viên**: addon tự ghi `userCount` sau mỗi lần quét.

## 8b. Quyền trên từng bài và tài khoản đang đăng nhập
| Method | Đường dẫn | Ghi chú | Thử |
|---|---|---|---|
| GET | `content/contents/{id}/menu-settings` | Quyền của mình trên bài: `canDelete`, `canEdit`, `canHideContent`, `canPinContent`, `canReportContent`… Admin group xem bài người khác: `canDelete: false`, `canHideContent: true`, `canPinContent: true`, tức **admin không xoá được bài người khác, chỉ ẩn / ghim** | ✅ |
| GET | `user/me/profile` | `id`, `username`, `fullname`… (snake_case). **Không được gửi `x-version-id`**: có header này thì bị `400 api.version.minimum` | ✅ |

## 9. Cài đặt
| Method | Đường dẫn | Body | Thử |
|---|---|---|---|
| GET | `group/groups/{groupId}/settings` | `settings` + `changeableSettings` | ✅ |
| PUT | `group/groups/{groupId}/settings` | `isJoinApproval`, `isActiveMembershipQuestions`, `isInvitedOnly`, `isHiddenMembers`, … | — |
| GET | `group/communities/{communityId}/content-settings` | | ✅ |
| PUT | `group/communities/{communityId}/content-settings` | `{ groupId, contentApproval: { value }, isUpdateAll }` | — |

## 10. Trang admin trên web (để addon mở thẳng)
Trang quản trị chính là `https://group.beincom.com/admin-panel/{communityId}/…`:
- Duyệt bài: `content-approval?approvalStatus=pending`, cài đặt duyệt bài: `content-approval/settings`
- Thành viên: `com-members`, `com-members/ban-members`, `com-members/invitation`
- Báo cáo: `report/reported-content`, `report/reported-user`
- `dashboard` (thống kê), `com-activity-log`, `groups/group-structure`, `permission`

Yêu cầu tham gia:
- Group gốc: `/community-detail/{communityId}/members/member-requests`
- Group con: `/group-detail/{communityId}/groups/{groupId}/members/member-requests`

Trang cũ dưới `https://group.beincom.com/community-detail/{communityId}` (`admin/pending-posts` hiện báo "We are developing this feature"):
- Thành viên:
  - `/members/member-requests` — yêu cầu tham gia
  - `/members/invited-people`
- `/admin/…`:
  - Cài đặt: `post-settings`, `profile`, `membership-policy-settings`, `community-terms`
  - Nội dung: `pending-posts`, `content-pending`, `content-scheduled`, `content-published`, `content-flagged`, `content-hidden`
  - `activity-log`

## Điều cần biết khi làm addon
- Beincom đã có sẵn duyệt bài, câu hỏi gia nhập, duyệt/từ chối tất cả, cấm thành viên, hẹn giờ đăng, thống kê, nhật ký. Addon nên lo phần Beincom không có:
  - Một dashboard cho nhiều community
  - Lọc yêu cầu tham gia theo quy tắc trước khi duyệt
  - Thông báo
  - Xuất dữ liệu
- Không dùng API "duyệt tất cả" cho chức năng lọc theo quy tắc: phải duyệt từng `joinRequestId` đã qua lọc.
- Tài khoản dùng để thử:
  - Là admin group của Crypto Life: group gốc và 2 group con "General" và "Strong Foundation". Chưa phải admin community nên không xem được `stats`.
  - Là chủ (`role_OWNER`) của 2 community nhỏ, dùng để thử thao tác ghi an toàn: "Food Research" (bật duyệt thành viên) và "The Heroic Spirit of Đông A".
- Crypto Life đang **tắt duyệt thành viên** (`isJoinApproval: false`, người xin vào được vào luôn) và **bật duyệt bài** (`contentApproval: true`).
