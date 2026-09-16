# โครงสร้างข้อมูล (Data Model)

ฐานข้อมูลเป็น PostgreSQL ทั้งหมด ไม่มี ORM — ใช้ SQL ล้วนผ่าน `pg`
เพื่อให้เห็นคำสั่งที่ส่งไปจริงและควบคุม transaction ได้แน่นอน

**หลักการที่ใช้ทุกตาราง**

- เวลาเป็น `timestamptz` (เก็บ UTC) แสดงผลเป็น Asia/Bangkok ที่ชั้นแอป
- รหัสอ้างอิงเป็น `uuid` สร้างด้วย `gen_random_uuid()`
- สถานะเป็น `text` + `CHECK` constraint (แก้ง่ายกว่า enum ของ PostgreSQL เมื่อเพิ่มสถานะใหม่)
- ทุกตารางข้อมูลเปิด `ROW LEVEL SECURITY` และ `FORCE ROW LEVEL SECURITY`

---

## แผนผังความสัมพันธ์

```
organizations ──┬── app_settings
                ├── profiles ──┬── user_credentials
                │              ├── user_sessions
                │              ├── auth_tokens
                │              ├── user_roles ──── roles ──── role_permissions ──── permissions
                │              ├── notification_preferences
                │              └── line_links
                ├── buildings ──── rooms ──┬── room_amenities ──── amenities
                │                          ├── room_approvers ──── profiles
                │                          └── room_closures
                ├── holidays
                └── bookings ──┬── booking_attendees
                     │         ├── booking_resources ──── amenities
                     │         ├── approvals
                     │         └── notification_jobs ──── notification_deliveries
                     └── booking_series

แยกจากกิ่งหลัก: audit_logs, in_app_notifications, waitlist_entries,
               email_suppressions, rate_limit_counters, login_attempts
```

---

## ตารางหลัก

### organizations

องค์กรผู้ใช้ระบบ รองรับหลายองค์กรในอนาคต แต่ตอนนี้ใช้หนึ่งแถว

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | |
| `name`, `slug` | text | `slug` unique |
| `timezone` | text | ค่าปริยาย `Asia/Bangkok` |
| `locale`, `date_style` | text | `th`/`en`, `th-buddhist`/`iso` |

### app_settings

ค่าตั้งค่าที่แก้จากหน้า Admin ได้โดยไม่ต้องแก้โค้ด (บรีฟ AC06)
เป็น key/value แบบ `jsonb` ค่าปริยายอยู่ใน `src/lib/settings.ts`

| key | ชนิดค่า | ใช้ทำอะไร |
|---|---|---|
| `booking.horizon_days` | number | จองล่วงหน้าได้กี่วัน (ค่าปริยายระดับองค์กร) |
| `waitlist.offer_minutes` | number | ให้เวลายืนยันคิวรอกี่นาที |
| `auth.self_register` | boolean | เปิดให้สมัครเองไหม |
| `auth.allowed_email_domains` | string[] | โดเมนอีเมลที่อนุญาต |
| `calendar.default_view` | string | มุมมองปฏิทินเริ่มต้น |
| `calendar.week_starts_on` | number | วันเริ่มสัปดาห์ (1 = จันทร์) |
| `audit.retention_days` | number | เก็บ audit log กี่วัน |

### profiles

ผู้ใช้ในระบบ **ไม่เก็บรหัสผ่านในตารางนี้**

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK | |
| `email` | text | unique ต่อองค์กรแบบ case-insensitive |
| `full_name`, `department`, `job_title`, `phone` | text | |
| `locale`, `timezone` | text | ตั้งรายบุคคลได้ |
| `status` | text | `invited` / `active` / `suspended` / `deactivated` |
| `email_verified_at`, `onboarded_at`, `last_login_at` | timestamptz | `onboarded_at` ใช้ตัดสินว่าจะแสดง guided tour |

มี GIN index สำหรับค้นหาด้วยชื่อ อีเมล หรือแผนก

### user_credentials / user_sessions / auth_tokens

| ตาราง | เก็บอะไร | ทำไมแยกจาก profiles |
|---|---|---|
| `user_credentials` | `password_hash` (scrypt) | แยกความลับออกจากข้อมูลโปรไฟล์ เข้าถึงได้เฉพาะสิทธิ์ระบบ |
| `user_sessions` | `token_hash`, `expires_at`, `revoked_at` | เก็บเฉพาะ hash — ถ้าฐานข้อมูลรั่ว โทเค็นที่รั่วใช้ต่อไม่ได้ และรองรับ "ออกจากระบบทุกอุปกรณ์" |
| `auth_tokens` | โทเค็นใช้ครั้งเดียว 4 แบบ: `email_verify`, `password_reset`, `invite`, `line_link` | มี `used_at` และ `expires_at` ใช้แล้วใช้ซ้ำไม่ได้ |

### RBAC: roles / permissions / role_permissions / user_roles

`src/lib/rbac/permissions.ts` เป็นแหล่งความจริงเดียว สคริปต์ seed คัดลอกลงฐานข้อมูล

| Role | สิทธิ์หลัก |
|---|---|
| `super_admin` | ทุกสิทธิ์ |
| `room_admin` | จัดการห้องตามขอบเขต ดู/แก้การจองในความรับผิดชอบ อนุมัติ ดูรายงาน |
| `approver` | อนุมัติ/ปฏิเสธ ดูรายละเอียดการจอง |
| `employee` | จอง แก้ไข ยกเลิกของตัวเอง |
| `viewer` | ดูตารางและสถานะว่าไม่ว่างเท่านั้น (ไม่มี permission ใด) |

`user_roles` รองรับขอบเขต (`scope_type`): `organization` / `building` / `room` / `department`
ทำให้ตั้ง "ผู้ดูแลห้องเฉพาะอาคาร B" ได้

> **ความปลอดภัย:** ตาราง `user_roles` เขียนได้เฉพาะ *สิทธิ์ระบบ* (migration 007)
> การให้/ถอนสิทธิ์ผ่าน API จะตรวจ `role:manage` บันทึก audit log แล้วจึงยกระดับสิทธิ์เฉพาะคำสั่งนั้น
> ป้องกันการยกระดับสิทธิ์แม้มีโค้ดเส้นใดลืมตรวจ

### rooms

ห้องประชุมพร้อม **นโยบายรายห้อง** ทั้งหมดอยู่ในแถวเดียว จึงตั้งค่าต่างกันได้ทุกห้อง

| กลุ่ม | คอลัมน์ |
|---|---|
| ข้อมูลพื้นฐาน | `code`, `name`, `description`, `floor`, `location_hint`, `capacity`, `room_type`, `photos`, `color` |
| เวลาทำการ | `open_time`, `close_time`, `open_days` (int[] 0=อาทิตย์) |
| กฎเวลา | `slot_step_minutes`, `min_duration_minutes`, `max_duration_minutes`, `booking_horizon_days` |
| กันชน | `buffer_before_minutes`, `buffer_after_minutes` |
| นโยบาย | `requires_approval`, `check_in_required`, `check_in_grace_minutes`, `waitlist_enabled`, `cancel_window_minutes`, `allow_external_guests` |
| การแสดง | `sort_order`, `is_active`, `archived_at` |

**ห้ามลบห้องที่มีประวัติการจอง** — `bookings.room_id` เป็น FK แบบ `ON DELETE RESTRICT`
ระบบให้ใช้ `archived_at` แทน เพื่อรักษารายงานและ audit trail

### bookings — ตารางหัวใจของระบบ

| กลุ่ม | คอลัมน์ | หมายเหตุ |
|---|---|---|
| เนื้อหา | `title`, `purpose`, `notes` | |
| เวลา | `starts_at`, `ends_at` | UTC |
| กันชน | `buffer_before_minutes`, `buffer_after_minutes` | **snapshot ณ เวลาจอง** — ถ้านโยบายห้องเปลี่ยนภายหลัง การจองเดิมไม่ขยับ |
| ช่วงที่กันไว้ | `blocked_period` (tstzrange) | คำนวณโดย trigger = เวลาประชุม + buffer |
| สถานะ | `status` | `draft`/`pending`/`confirmed`/`rejected`/`cancelled`/`checked_in`/`completed`/`no_show`/`maintenance` |
| กันซ้อน | `blocks_slot` (generated) | `true` เมื่อสถานะกินพื้นที่ห้องจริง |
| ความเป็นส่วนตัว | `privacy` | `public` / `busy_only` / `private` |
| ผู้จอง (snapshot) | `booker_name`, `booker_email`, `booker_department` | ทำให้ปฏิทินแสดงชื่อได้โดยไม่ต้องเปิดสิทธิ์อ่านตารางผู้ใช้ทั้งใบ |
| ผู้เข้าร่วม (สำเนา) | `attendee_profile_ids` (uuid[]) | ใช้ให้ RLS ตัดสินสิทธิ์การมองเห็นโดยไม่อ้างอิงข้ามตาราง (กัน policy เรียกวนซ้ำ) |
| เช็กอิน | `check_in_token`, `checked_in_at`, `checked_in_by` | `check_in_token` รองรับการทำ QR code |
| ยกเลิก | `cancelled_at`, `cancelled_by`, `cancel_reason` | |
| ควบคุมการแก้ | `version`, `idempotency_key` | optimistic concurrency และกันกดซ้ำ |

**ตัวกันจองซ้อน**

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (room_id WITH =, blocked_period WITH &&) WHERE (blocks_slot);
```

อ่านว่า: "ห้องเดียวกัน + ช่วงเวลาทับกัน + เป็นสถานะที่กินพื้นที่ → ปฏิเสธ"
ฐานข้อมูลบังคับเรื่องนี้เอง ไม่ว่าคำขอจะเข้ามาพร้อมกันกี่รายการ
ชั้นแอปยังใช้ `pg_advisory_xact_lock` ต่อห้องเพิ่ม เพื่อให้ได้ข้อความอธิบายที่เข้าใจง่าย
แทนที่จะโยน error ของฐานข้อมูลออกไปตรง ๆ

`blocked_period` ใช้ช่วงแบบ **half-open** `[start, end)` การจองที่ต่อกันพอดี
(เช่น 15:00–16:00 กับ 16:00–17:00) จึงไม่ถือว่าชน

### booking_series

กฎการจองซ้ำ (`frequency`, `interval_count`, `by_weekdays`, `until_date`, `occurrence_count`)
ทุกครั้งที่เกิดขึ้นจริงเป็นแถวใน `bookings` ที่ชี้กลับมาด้วย `series_id`
ทำให้แก้หรือยกเลิกได้ทั้ง "ครั้งนี้เท่านั้น" และ "ทั้งชุด"

### booking_attendees / booking_resources / approvals / waitlist_entries

| ตาราง | หมายเหตุ |
|---|---|
| `booking_attendees` | รองรับทั้งคนในองค์กร (`profile_id` ไม่ว่าง) และอีเมลภายนอก มี `response` สำหรับการตอบรับ |
| `booking_resources` | อุปกรณ์/บริการเสริมที่ร้องขอต่อการจอง |
| `approvals` | รองรับหลายลำดับขั้น (`step`) สถานะ `pending`/`approved`/`rejected`/`info_requested` |
| `waitlist_entries` | คิวรอห้องว่าง สถานะ `waiting`/`offered`/`claimed`/`expired`/`cancelled` พร้อม `offer_expires_at` |

### การแจ้งเตือน

| ตาราง | หมายเหตุ |
|---|---|
| `notification_jobs` | คิวงาน มี `dedupe_key` unique เป็น idempotency key, `attempts`, `next_attempt_at`, `locked_at`/`locked_by`, `status` รวม `dead` สำหรับ dead letter |
| `notification_deliveries` | บันทึกผลทุกครั้งที่พยายามส่ง (รวมครั้งที่ล้มเหลว) ใช้ในหน้า System health |
| `in_app_notifications` | ศูนย์การแจ้งเตือนในระบบ มี `read_at` |
| `notification_preferences` | ช่องทางและเวลาเตือน (`reminder_leads` เป็น int[] หน่วยนาที) |
| `line_links` | การเชื่อมบัญชี LINE + รหัสใช้ครั้งเดียวที่หมดอายุได้ |
| `email_suppressions` | อีเมลที่ตีกลับ/ร้องเรียน ระงับการส่งอัตโนมัติ |

### audit_logs

| คอลัมน์ | หมายเหตุ |
|---|---|
| `actor_profile_id`, `actor_email`, `actor_role` | ผู้กระทำ |
| `action`, `resource_type`, `resource_id` | เช่น `booking.create` / `booking` / uuid |
| `before_data`, `after_data` | jsonb โดยตัดฟิลด์อ่อนไหวออกก่อนบันทึก |
| `ip_hint` | เก็บเพียงช่วงเครือข่าย เช่น `203.0.113.0/24` ไม่เก็บ IP เต็ม |
| `user_agent`, `correlation_id` | ใช้ตามรอยข้าม log |

**แก้ไขย้อนหลังไม่ได้** — ตารางนี้มีเพียง policy สำหรับ SELECT และ INSERT
ไม่มี policy สำหรับ UPDATE/DELETE คำสั่งแก้จึงไม่มีผลแม้เป็นผู้ดูแลระบบสูงสุด
(มีเทสต์ integration ยืนยันไว้)

### rate_limit_counters / login_attempts

เก็บตัวนับใน PostgreSQL เพราะ Vercel เป็น serverless — ตัวแปรในหน่วยความจำไม่ถูกแชร์ข้าม instance
ล้างข้อมูลเก่าโดย cron งานดูแลระบบ

---

## View: app.v_calendar_bookings

View ที่หน้าปฏิทินและการค้นหาใช้ ปิดบังข้อมูลตามสิทธิ์ **ที่ชั้นฐานข้อมูล**

```sql
CREATE VIEW app.v_calendar_bookings WITH (security_invoker = on) AS
SELECT ...,
  CASE WHEN app.can_see_booking_details(...) THEN b.title ELSE 'ไม่ว่าง' END AS title,
  CASE WHEN app.can_see_booking_details(...) THEN b.booker_name ELSE NULL END AS booker_name
FROM bookings b WHERE b.status <> 'draft';
```

`security_invoker = on` ทำให้ RLS ของตารางต้นทางมีผลกับผู้เรียก
จึงได้การป้องกันสองชั้น: RLS ตัด *แถว* ที่ไม่มีสิทธิ์ และ view ปิดบัง *ฟิลด์* ที่ไม่ควรเห็น

| สถานะความเป็นส่วนตัว | ผู้ไม่เกี่ยวข้องเห็นอะไร |
|---|---|
| `public` | เห็นหัวข้อและชื่อผู้จอง |
| `busy_only` | เห็นเพียงช่วงเวลาและคำว่า "ไม่ว่าง" |
| `private` | **ไม่เห็นแถวนั้นเลย** (RLS ตัดออก) |

---

## ฟังก์ชันช่วยตรวจสิทธิ์ (schema `app`)

| ฟังก์ชัน | ใช้ทำอะไร |
|---|---|
| `app.current_user_id()` | อ่านผู้ใช้ปัจจุบันจาก session variable `app.user_id` (รองรับ JWT ของ PostgREST ด้วย) |
| `app.current_role_name()` / `app.is_service()` | บทบาทของ connection ปัจจุบัน |
| `app.has_permission(code)` | ผู้ใช้มีสิทธิ์นี้ไหม |
| `app.can_manage_room(room_id)` | จัดการห้องนี้ได้ไหม (ตามขอบเขต) |
| `app.can_approve_room(room_id)` | อนุมัติห้องนี้ได้ไหม |
| `app.can_see_booking_details(...)` | เห็นรายละเอียดการจองนี้ไหม |

ชั้นแอปตั้งค่า context ผ่าน `withTx()` ใน `src/lib/db/pool.ts` ซึ่งใช้
`set_config(..., is_local := true)` จึงหลุดไปเมื่อ transaction จบ ไม่รั่วข้าม request

**การยกระดับสิทธิ์ชั่วคราว** — งาน "บัญชีระบบ" ที่ต้องเกิดพร้อมธุรกรรมของผู้ใช้แบบ atomic
(เขียนคิวแจ้งเตือนถึงผู้อื่น, เขียน audit log, สร้างคำขออนุมัติ, จับคู่ผู้เข้าร่วมกับบัญชี)
ใช้ `asService(sql, ...)` ยกระดับเฉพาะคำสั่งนั้นแล้วคืนสิทธิ์เดิมทุกกรณี
วิธีนี้ทำให้ไม่ต้องผ่อนปรน RLS policy ให้หลวมกว่าที่ควร

---

## Index ที่สำคัญ

| ตาราง | Index | ใช้ตอนไหน |
|---|---|---|
| `bookings` | `(room_id, starts_at, ends_at) WHERE blocks_slot` | โหลดปฏิทินและตรวจเวลาว่าง |
| `bookings` | GiST บน `blocked_period` | ตรวจการทับซ้อนของช่วงเวลา |
| `bookings` | GIN บน `attendee_profile_ids` | RLS ตรวจว่าเป็นผู้เข้าร่วมไหม |
| `bookings` | GIN บน `to_tsvector(title, booker_name, booker_email, department)` | ค้นหาผู้จอง |
| `bookings` | `(booker_profile_id, starts_at DESC)` | หน้า "การจองของฉัน" |
| `rooms` | GIN บน `to_tsvector(name, code, floor, description)` | ค้นหาห้อง |
| `notification_jobs` | `(next_attempt_at) WHERE status IN ('queued','failed')` | worker ดึงงานที่ถึงกำหนด |
| `audit_logs` | `(created_at DESC)`, `(actor_profile_id, created_at DESC)`, `(resource_type, resource_id, created_at DESC)` | ค้นหา audit log |

---

## Migration

| ไฟล์ | เนื้อหา |
|---|---|
| `001_foundation` | extension (`pgcrypto`, `btree_gist`), schema `app`, ฟังก์ชันร่วม |
| `002_identity` | องค์กร ผู้ใช้ สิทธิ์ เซสชัน การตั้งค่า |
| `003_rooms` | อาคาร ห้อง อุปกรณ์ ผู้อนุมัติ ช่วงปิดปรับปรุง วันหยุด |
| `004_bookings` | การจอง ผู้เข้าร่วม อุปกรณ์ที่ขอ การอนุมัติ คิวรอ + exclusion constraint |
| `005_notifications_audit` | คิวแจ้งเตือน บันทึกการส่ง LINE audit log rate limit |
| `006_rls` | เปิด RLS ทุกตารางและสร้าง policy + view ปิดบังข้อมูล |
| `007_rbac_force_rls` | ปิดช่องโหว่การยกระดับสิทธิ์ที่พบจากเทสต์ integration |

ทุกไฟล์มี `.down.sql` คู่กัน และมีเทสต์ integration ตรวจว่ามีครบทุกไฟล์
