# API Reference

ทุก endpoint อยู่ใต้ `/api` ตอบเป็น JSON และ **ไม่ cache** (`cache-control: no-store`)

## หลักการที่ใช้ทุก endpoint

| เรื่อง | รายละเอียด |
|---|---|
| ยืนยันตัวตน | cookie `tnn_session` (HttpOnly, SameSite=Lax, Secure บน production) |
| ตรวจสิทธิ์ | ตรวจที่ API ด้วย `requirePermission()` และตรวจซ้ำที่ฐานข้อมูลด้วย RLS |
| ตรวจข้อมูลเข้า | zod schema จาก `src/lib/validation/schemas.ts` (ชุดเดียวกับที่ฟอร์มใช้) |
| จำกัดอัตรา | login, สมัคร, ค้นหา และการจอง |
| ตามรอย | ทุก response มี header `x-correlation-id` ใช้อ้างอิงเวลาแจ้งปัญหา |

## รูปแบบข้อผิดพลาด (เหมือนกันทุก endpoint)

```json
{
  "error": {
    "code": "conflict",
    "message": "ช่วงเวลานี้ถูกจองไปแล้ว กรุณาเลือกเวลาอื่นหรือห้องอื่น — มีการจอง \"ประชุมทีม\" เวลา 10:00 – 11:00 น. อยู่แล้ว",
    "violations": [
      { "code": "over_capacity", "field": "attendeeCount", "message": "จำนวนผู้เข้าร่วมเกินความจุห้อง (6 คน)" }
    ],
    "details": { "conflictStart": "2026-09-16T03:00:00.000Z", "conflictEnd": "2026-09-16T04:00:00.000Z" }
  },
  "correlationId": "b20f4e33-c327-4000-819b-14f16becdbb0"
}
```

| `code` | HTTP | ความหมาย |
|---|---|---|
| `validation` | 422 | ข้อมูลไม่ถูกต้อง — ดู `violations` เพื่อชี้ไปที่ฟิลด์ |
| `unauthorized` | 401 | ยังไม่ได้ล็อกอิน หรือเซสชันหมดอายุ |
| `forbidden` | 403 | ล็อกอินแล้วแต่ไม่มีสิทธิ์ |
| `not_found` | 404 | ไม่พบข้อมูล (หรือมีแต่ไม่มีสิทธิ์เห็น) |
| `conflict` | 409 | ชนเวลา, ห้องปิดปรับปรุง, หรือมีผู้อื่นแก้ไปแล้ว (version ไม่ตรง) |
| `rate_limited` | 429 | เรียกถี่เกินไป |
| `internal_error` | 500 | ข้อผิดพลาดของระบบ — ไม่เปิดเผยรายละเอียดภายใน ให้แจ้ง `correlationId` |

---

## ยืนยันตัวตน

### `POST /api/auth/login`

```json
// request
{ "email": "user@example.com", "password": "..." }

// response 200 — ตั้ง cookie tnn_session ให้ด้วย
{ "user": { "id": "...", "email": "...", "fullName": "...", "onboarded": false } }
```

จำกัด 8 ครั้ง/15 นาที ต่ออีเมล และ 24 ครั้ง/15 นาที ต่อ IP
ตอบ `invalid_credentials` ด้วยข้อความเดียวกันทั้งกรณีไม่พบอีเมลและรหัสผ่านผิด
เพื่อไม่ให้ไล่เดารายชื่อผู้ใช้ได้

| Endpoint | ทำอะไร |
|---|---|
| `POST /api/auth/logout` | ออกจากระบบอุปกรณ์นี้ (เพิกถอนเซสชันเดียว) |
| `POST /api/auth/logout-all` | ออกจากระบบทุกอุปกรณ์ |
| `POST /api/auth/register` | สมัครด้วยตนเอง (ถ้าเปิดไว้) — ส่งอีเมลยืนยัน ไม่คืนโทเค็นให้ client |
| `POST /api/auth/forgot-password` | ขอลิงก์ตั้งรหัสผ่านใหม่ — ตอบข้อความเดียวกันเสมอไม่ว่าอีเมลจะมีจริงหรือไม่ |
| `POST /api/auth/reset-password` | ตั้งรหัสผ่านใหม่ด้วยโทเค็น (เตะทุกอุปกรณ์ออกด้วย) |
| `POST /api/auth/accept-invite` | ผู้ถูกเชิญตั้งรหัสผ่านครั้งแรก |
| `POST /api/auth/change-password` | เปลี่ยนรหัสผ่าน (ต้องใส่รหัสผ่านปัจจุบัน) |

---

## ปฏิทิน

### `GET /api/calendar`

| พารามิเตอร์ | ชนิด | จำเป็น |
|---|---|---|
| `view` | `day` \| `week` \| `month` | – (ปริยาย `day`) |
| `date` | `YYYY-MM-DD` | ✅ |
| `roomId` | uuid | – (ไม่ใส่ = ทุกห้อง) |

```json
{
  "view": "day",
  "dateISO": "2026-09-16",
  "rangeStartISO": "2026-09-16",
  "rangeEndISO": "2026-09-16",
  "bookings": [
    {
      "id": "...", "roomId": "...", "title": "ประชุมวางแผนข่าวเช้า",
      "startsAt": "2026-09-16T02:00:00.000Z", "endsAt": "2026-09-16T03:30:00.000Z",
      "status": "confirmed", "privacy": "public",
      "bookerName": "ปิยะ พนักงานข่าว", "bookerDepartment": "ข่าว",
      "attendeeCount": 8, "canSeeDetails": true, "isMine": true, "checkedIn": false
    }
  ],
  "closures": [], "holidays": [], "monthDays": []
}
```

- `title` เป็น `"ไม่ว่าง"` และ `bookerName` เป็น `null` เมื่อ `canSeeDetails` เป็น `false`
- การจองแบบ `private` ของผู้อื่น **จะไม่ปรากฏในรายการเลย**
- `monthDays` มีค่าเฉพาะเมื่อ `view=month` (สรุปรายวัน + ระดับความหนาแน่น)

---

## ค้นหา

### `GET /api/search`

| พารามิเตอร์ | หมายเหตุ |
|---|---|
| `q` | คำค้น รองรับภาษาไทยแบบผสม เช่น `พรุ่งนี้ 13:00 ถึง 15:00 12 คน ทีวี` |
| `mode` | `auto` (ปริยาย) \| `rooms` \| `bookings` \| `slots` |
| `date`, `startTime`, `endTime`, `capacity`, `buildingId`, `floor` | ตัวกรองที่ผู้ใช้ตั้งเอง (มีน้ำหนักกว่าค่าที่ตีความจาก `q`) |
| `amenities` | ใส่ซ้ำได้หลายครั้ง |

```json
{
  "mode": "slots",
  "parsed": { "text": "", "capacity": 12, "dateISO": "2026-09-17", "startTime": "13:00", "endTime": "15:00", "amenityCodes": ["tv"] },
  "slots": [{ "room": { "id": "...", "name": "ห้องประชุมย่อย 2", "capacity": 6, "...": "..." }, "matchedAmenities": ["tv"] }]
}
```

`parsed` บอกว่าระบบตีความคำค้นได้อย่างไร ใช้แสดง filter chip ให้ผู้ใช้ยืนยัน
ถ้าข้อมูลไม่พอสำหรับค้นช่วงเวลา ระบบจะตกไปค้นห้องแทนและตอบ `mode: "rooms"`

จำกัด 120 ครั้ง/นาที ต่อผู้ใช้

> ⚠️ ผลค้นหาช่วงเวลาว่างเป็นเพียงข้อมูลชี้แนะ — ตอนกดจองจริงระบบจะ **ตรวจ conflict
> ฝั่ง server อีกครั้งภายใน transaction** เสมอ

---

## การจอง

### `POST /api/bookings`

ต้องมีสิทธิ์ `booking:create`

```json
{
  "roomId": "uuid",
  "title": "ประชุมวางแผนข่าว",
  "purpose": "วางแผนข่าวประจำสัปดาห์",
  "notes": null,
  "dateISO": "2026-09-17",
  "startTime": "13:00",
  "endTime": "14:30",
  "attendeeCount": 8,
  "attendees": [{ "email": "colleague@example.com" }],
  "resources": [{ "amenityCode": "tv", "quantity": 1 }],
  "privacy": "public",
  "recurrence": { "frequency": "weekly", "intervalCount": 1, "occurrenceCount": 4 },
  "idempotencyKey": "bk-1758000000-abc123",
  "overrideReason": null
}
```

- เวลาส่งเป็น **เวลาท้องถิ่น** (`dateISO` + `startTime`/`endTime`) ระบบแปลงเป็น UTC ให้
- `idempotencyKey` กันกดซ้ำ — ส่งค่าเดิมซ้ำจะได้รายการเดิมกลับมา ไม่สร้างใหม่
- `overrideReason` ใช้ได้เฉพาะผู้มีสิทธิ์ `booking:manage_all` และจะถูกบันทึกลง audit log

**ตอบกลับกรณีจองครั้งเดียว** (201)

```json
{ "booking": { "id": "...", "status": "confirmed", "version": 1, "...": "..." }, "requiresApproval": false }
```

**ตอบกลับกรณีจองซ้ำ** (201) — ครั้งที่ชนเวลาจะถูกข้ามและรายงานกลับ ไม่ล้มทั้งชุด

```json
{
  "bookings": [{ "id": "...", "...": "..." }],
  "skipped": [{ "dateISO": "2026-09-24", "reason": "ช่วงเวลานี้ถูกจองไปแล้ว — มีการจอง ..." }],
  "seriesId": "uuid",
  "requiresApproval": false
}
```

จำกัด 30 ครั้ง/5 นาที ต่อผู้ใช้

### `GET /api/bookings?upcoming=true`

การจองของฉัน (ทั้งที่จองเองและที่ถูกเชิญ)

### `GET /api/bookings/{id}`

รายละเอียดเต็ม พร้อม `permissions` บอกว่าผู้เรียกทำอะไรได้

```json
{
  "booking": {
    "id": "...", "title": "...", "status": "confirmed", "version": 2,
    "attendees": [...], "resources": [...], "approvals": [...],
    "canSeeDetails": true,
    "permissions": { "canEdit": true, "canCancel": true, "canCheckIn": false }
  }
}
```

### `PATCH /api/bookings/{id}`

ต้องส่ง `expectedVersion` ที่อ่านมาล่าสุด ถ้ามีผู้อื่นแก้ไปก่อนจะได้ `409 conflict`
(optimistic concurrency) ส่งเฉพาะฟิลด์ที่ต้องการแก้ได้

### `POST /api/bookings/{id}/cancel`

```json
{ "reason": "เปลี่ยนแผน", "scope": "this" }   // scope: "this" | "series"
```

`scope: "series"` ยกเลิกเฉพาะครั้งที่ยังไม่ถึงในชุดเดียวกัน
เมื่อยกเลิกแล้วระบบจะเสนอช่วงเวลาให้คิวรอลำดับถัดไปอัตโนมัติ

### `POST /api/bookings/{id}/check-in`

เช็กอินได้ตั้งแต่ 15 นาทีก่อนเริ่ม จนถึงหมดเวลาผ่อนผันของห้อง
ผู้จองเช็กอินเองได้ ผู้มีสิทธิ์ `booking:check_in_any` เช็กอินแทนได้

### `GET /api/bookings/{id}/ics`

ดาวน์โหลดไฟล์ปฏิทิน `.ics` (`text/calendar`) หัวข้อจะถูกปิดบังถ้าผู้เรียกไม่มีสิทธิ์เห็น

### `POST /api/waitlist`

เข้าคิวรอห้องว่าง (เฉพาะห้องที่เปิดใช้คิวรอ)

---

## การอนุมัติ

### `POST /api/approvals/{bookingId}`

ต้องมีสิทธิ์ `booking:approve` และต้องเป็นผู้อนุมัติของห้องนั้น

```json
{ "decision": "approved", "comment": "อนุมัติตามคำขอ" }
// decision: "approved" | "rejected" | "info_requested"
```

`rejected` **ต้องมี `comment`** ไม่อย่างนั้นได้ `422`

---

## ห้องประชุม

| Endpoint | สิทธิ์ | ทำอะไร |
|---|---|---|
| `GET /api/rooms` | ล็อกอิน | รายการห้อง (`?includeArchived=true` เห็นห้องที่เก็บเข้าคลัง) |
| `POST /api/rooms` | `room:manage` | เพิ่มห้องใหม่ — ปรากฏในระบบทันทีโดยไม่ต้องแก้โค้ด |
| `GET /api/rooms/{id}` | ล็อกอิน | รายละเอียดห้องและนโยบาย |
| `PUT /api/rooms/{id}` | `room:manage` (ตามขอบเขต) | แก้ไขห้อง |
| `POST /api/rooms/{id}/archive` | `room:manage` | เก็บเข้าคลัง (`{"action":"restore"}` เพื่อนำกลับ) |
| `GET/POST /api/rooms/{id}/closures` | `room:manage` | ช่วงปิดปรับปรุง — ตอน POST จะแจ้งผู้ที่ได้รับผลกระทบทันที |

> **ไม่มี endpoint สำหรับลบห้อง** โดยเจตนา — ห้องที่มีประวัติการจองต้องคงไว้เพื่อรายงานและ audit trail

---

## การแจ้งเตือน

| Endpoint | ทำอะไร |
|---|---|
| `GET /api/notifications` | รายการแจ้งเตือนในระบบของตัวเอง (`?unread=true` เอาเฉพาะที่ไม่ได้อ่าน) |
| `POST /api/notifications/read-all` | ทำเครื่องหมายอ่านแล้ว (ส่ง `{"id":"..."}` เพื่อทำรายการเดียว) |
| `GET/PUT /api/notifications/preferences` | ช่องทางและเวลาเตือนของตัวเอง |
| `POST /api/notifications/line/link` | ขอรหัสเชื่อมบัญชี LINE (8 ตัว อายุ 15 นาที ใช้ครั้งเดียว) |
| `POST /api/notifications/line/unlink` | ยกเลิกการเชื่อม |

---

## ผู้ดูแลระบบ

| Endpoint | สิทธิ์ | ทำอะไร |
|---|---|---|
| `GET /api/admin/users` | `user:read` | รายชื่อผู้ใช้และสิทธิ์ (`?q=` ค้นหา) |
| `POST /api/admin/users` | `user:manage` | เชิญผู้ใช้ — ส่งอีเมลคำเชิญ ไม่คืนโทเค็นให้ client |
| `PUT /api/admin/users/{id}/roles` | `role:manage` | กำหนด Role และสถานะบัญชี — กันไม่ให้เหลือ super admin เป็นศูนย์ |
| `GET /api/admin/reports/export` | `report:read` | ดาวน์โหลด CSV (`?from=&to=&roomId=`) มี BOM ให้ Excel อ่านไทยได้ |
| `POST /api/admin/jobs/{id}/requeue` | `system:manage` | สั่งส่งงานแจ้งเตือนที่ล้มเหลวใหม่ |

---

## งานตามเวลา (Cron)

ต้องแนบ header `authorization: Bearer <CRON_SECRET>`
**ถ้าไม่ได้ตั้ง `CRON_SECRET` ระบบจะปฏิเสธทุกคำขอ** (ไม่เปิดช่องโดยไม่ตั้งใจ)

| Endpoint | ความถี่ที่แนะนำ | ทำอะไร |
|---|---|---|
| `GET/POST /api/cron/dispatch` | ทุก 5 นาที | ส่งการแจ้งเตือนในคิว retry แบบ backoff และตกเป็น dead letter เมื่อครบครั้ง |
| `GET/POST /api/cron/maintenance` | ทุก 10 นาที | ปล่อยห้องที่ไม่เช็กอิน ปิดงานที่ผ่านไปแล้ว จัดการคิวรอ ล้างข้อมูลหมดอายุ |

```json
// ตัวอย่างผลของ /api/cron/dispatch
{ "claimed": 6, "sent": 4, "failed": 0, "dead": 0, "skipped": 2, "reclaimed": 0, "ranAt": "..." }
```

ทั้งสอง endpoint เป็น **idempotent** เรียกซ้ำได้อย่างปลอดภัย

---

## Webhook

| Endpoint | ผู้เรียก | การตรวจสอบ |
|---|---|---|
| `POST /api/webhooks/line` | LINE Platform | ตรวจ `x-line-signature` (HMAC-SHA256 ด้วย channel secret) ทุก request |
| `POST /api/webhooks/email` | ผู้ให้บริการอีเมล | ตรวจ `x-webhook-signature` / `svix-signature` ด้วย `EMAIL_WEBHOOK_SECRET` |

ถ้าลายเซ็นไม่ถูกต้องจะตอบ `401` และไม่ประมวลผลเนื้อหาใด ๆ
**ข้อความจากผู้ใช้ใน webhook ของ LINE ถูกใช้เพียงเพื่อเทียบรหัสเชื่อมบัญชีเท่านั้น**

---

## สุขภาพระบบ

### `GET /api/health`

ไม่ต้องล็อกอิน ใช้กับ uptime monitor

```json
{ "status": "ok", "database": "ok", "release": "v1.0.0", "env": "production", "latencyMs": 12, "checkedAt": "..." }
```

ตอบ `503` เมื่อต่อฐานข้อมูลไม่ได้ **ไม่เปิดเผยค่า secret หรือรายละเอียดภายในระบบ**
