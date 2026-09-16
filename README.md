# ระบบจองห้องประชุม TNN

ระบบจองห้องประชุมสำหรับใช้งานภายในองค์กร — ปฏิทินเต็มหน้าจอสลับมุมมองวัน/สัปดาห์/เดือน
ค้นหาห้องและช่วงเวลาว่าง กันการจองซ้อนที่ชั้นฐานข้อมูล อนุมัติ เช็กอิน คิวรอ
แจ้งเตือนทางอีเมลและ LINE พร้อมระบบหลังบ้าน รายงาน และ Audit Log

ข้อความในระบบเป็นภาษาไทยทั้งหมด และเตรียมโครงสร้าง i18n สำหรับภาษาอังกฤษไว้แล้ว

---

## สารบัญ

| เอกสาร | ใช้เมื่อไร |
|---|---|
| ไฟล์นี้ | ติดตั้งบนเครื่องตัวเอง โครงสร้างโค้ด คำสั่งที่ใช้บ่อย |
| [docs/infrastructure-setup.md](docs/infrastructure-setup.md) | ตั้งค่า Supabase, Vercel, Resend, LINE, DNS ทีละขั้นตั้งแต่ยังไม่มีบัญชี |
| [docs/env-matrix.md](docs/env-matrix.md) | ตัวแปร environment ตัวไหนใส่ที่ไหน |
| [docs/dns-sheet.md](docs/dns-sheet.md) | ตาราง DNS ที่ต้องกรอก พร้อมวิธีตรวจสอบ |
| [docs/runbooks.md](docs/runbooks.md) | ขั้นตอน deploy, migration, backup, restore, rollback และเหตุการณ์ฉุกเฉิน |
| [docs/data-model.md](docs/data-model.md) | ตารางฐานข้อมูล ความสัมพันธ์ และเหตุผลของการออกแบบ |
| [docs/api.md](docs/api.md) | รายการ API endpoint พร้อมตัวอย่าง request/response |
| [docs/architecture-decisions.md](docs/architecture-decisions.md) | การตัดสินใจเชิงสถาปัตยกรรมและ trade-off |
| [docs/user-guide.md](docs/user-guide.md) | คู่มือผู้ใช้ทั่วไป |
| [docs/admin-guide.md](docs/admin-guide.md) | คู่มือผู้ดูแลระบบ |
| [docs/production-readiness.md](docs/production-readiness.md) | เช็กลิสต์ก่อนเปิดใช้งานจริง |
| [docs/troubleshooting.md](docs/troubleshooting.md) | แก้ปัญหาที่พบบ่อย |
| [docs/delivery-report.md](docs/delivery-report.md) | สรุปสิ่งที่ส่งมอบ ผลทดสอบ ข้อจำกัด และงานต่อเนื่อง |

---

## Stack ที่ใช้

| ชั้น | เทคโนโลยี | เหตุผล |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 | ยกมาจากโปรเจกต์เดิมที่ขึ้น production แล้ว ทีมคุ้นเคย |
| Backend | Route Handlers + Service layer แยกชั้น | ตรวจ auth, permission, validation และ conflict ฝั่ง server เสมอ |
| Database | PostgreSQL (Supabase) + Row Level Security | กันจองซ้อนและกันสิทธิ์ที่ชั้นฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม |
| Deploy | Vercel region `sin1` (สิงคโปร์) | ใกล้ผู้ใช้ในไทยที่สุดที่ Vercel รองรับ |
| Email | Resend (สลับเป็นโหมด log ได้) | ใช้อยู่แล้วในโปรเจกต์เดิม |
| LINE | LINE Messaging API | ตามบรีฟ — ไม่ใช้ LINE Notify ที่ปิดบริการแล้ว |
| งานตามเวลา | Vercel Cron + ตารางคิวงานใน PostgreSQL | ทำงานได้บน serverless และตรวจย้อนหลังได้ |
| เทสต์ | Vitest (unit + integration) และ Playwright (e2e) | |

ไม่มี dependency ฝั่ง runtime นอกจาก `next`, `react`, `pg`, `zod` และ `server-only`
เพื่อลดพื้นที่ความเสี่ยงและทำให้ build บน Vercel เร็ว

---

## ติดตั้งบนเครื่องตัวเอง

### สิ่งที่ต้องมีก่อน

- Node.js 20.9 ขึ้นไป (`node -v` เพื่อตรวจ)
- PostgreSQL 14 ขึ้นไป บนเครื่อง **หรือ** โปรเจกต์ Supabase สำหรับพัฒนา

### ขั้นตอน

```bash
# 1) ติดตั้ง dependency
npm install

# 2) สร้างไฟล์ตั้งค่าจากตัวอย่าง แล้วเติมค่าจริง
cp .env.example .env.local

# 3) สร้างฐานข้อมูล (ถ้าใช้ PostgreSQL บนเครื่อง)
createdb tnn_meeting
createdb tnn_meeting_test      # สำหรับเทสต์ integration

# 4) สร้างตารางและใส่ข้อมูลตัวอย่าง
npm run db:migrate
npm run db:seed

# 5) เปิดเซิร์ฟเวอร์สำหรับพัฒนา
npm run dev
```

เปิดเบราว์เซอร์ที่ <http://localhost:3000>

**ค่าที่ต้องเติมใน `.env.local` อย่างน้อย**

```bash
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/tnn_meeting
DIRECT_URL=postgresql://postgres:password@127.0.0.1:5432/tnn_meeting
AUTH_SECRET=<สร้างด้วย openssl rand -base64 48>
```

### บัญชีตัวอย่างหลังรัน `npm run db:seed`

ข้อมูลทั้งหมดเป็นข้อมูลสมมติ **ห้ามใช้ชุดนี้บน production**

| อีเมล | สิทธิ์ | ใช้ทดสอบอะไร |
|---|---|---|
| `admin@example.com` | ผู้ดูแลระบบสูงสุด | หลังบ้านทั้งหมด รายงาน audit log |
| `roomadmin@example.com` | ผู้ดูแลห้อง | เพิ่ม/แก้ห้อง ปิดปรับปรุง |
| `approver@example.com` | ผู้อนุมัติ | คิวรออนุมัติ |
| `user1@example.com` | พนักงาน | จอง แก้ไข ยกเลิก |
| `user2@example.com` | พนักงาน | ทดสอบการจองชนกันสองคน |
| `reception@example.com` | ผู้ชม / ประชาสัมพันธ์ | ดูตารางแต่จองไม่ได้ |

รหัสผ่านทุกบัญชี: `TnnDemo2569!` (เปลี่ยนได้ด้วย `SEED_PASSWORD=... npm run db:seed`)

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | เปิดเซิร์ฟเวอร์สำหรับพัฒนา |
| `npm run build` | build สำหรับ production |
| `npm start` | รันเวอร์ชันที่ build แล้ว |
| `npm run typecheck` | ตรวจชนิดข้อมูลด้วย TypeScript |
| `npm run lint` | ตรวจสไตล์โค้ดด้วย ESLint |
| `npm run verify` | typecheck + lint + unit test (รันก่อน commit) |
| `npm run test:unit` | เทสต์ระดับ unit (ไม่ต้องมีฐานข้อมูล) |
| `npm run test:integration` | เทสต์ระดับ integration (ต้องมี `TEST_DATABASE_URL`) |
| `npm run test:e2e` | เทสต์ end-to-end ด้วย Playwright |
| `npm run db:migrate` | รัน migration ที่ยังไม่ถูกรัน |
| `npm run db:migrate -- --status` | ดูว่า migration ไหนรันแล้ว |
| `npm run db:rollback` | ย้อนกลับ migration ล่าสุด 1 ขั้น |
| `npm run db:rollback -- 3` | ย้อนกลับ 3 ขั้น |
| `npm run db:seed` | ใส่ข้อมูลตัวอย่าง |
| `npm run db:reset` | ย้อนทั้งหมด รันใหม่ แล้ว seed (ห้ามใช้บน production) |

---

## โครงสร้างโปรเจกต์

```
db/migrations/           SQL ล้วน ไฟล์ .up.sql กับ .down.sql คู่กันทุกไฟล์
scripts/                 ตัวรัน migration และ seed
src/app/
  (auth)/                หน้าเข้าสู่ระบบ สมัคร ลืมรหัสผ่าน ยืนยันอีเมล
  (app)/                 หน้าใช้งานหลังล็อกอิน (ปฏิทิน การจอง อนุมัติ โปรไฟล์ หลังบ้าน)
  api/                   Route handlers ทั้งหมด
src/components/
  ui/                    ปุ่ม ฟิลด์ modal/drawer toast ที่เข้าถึงได้
  layout/                โครงหน้าจอ แถบบน เมนู ศูนย์การแจ้งเตือน
  calendar/              Toolbar และมุมมอง Day / Week / Month
  booking/               ฟอร์มจอง รายละเอียด คิวอนุมัติ
  admin/                 จัดการห้อง ผู้ใช้ และสถานะระบบ
src/lib/
  db/                    connection pool + การตั้ง context ให้ RLS
  auth/                  รหัสผ่าน โทเค็น เซสชัน ผู้ใช้ปัจจุบัน
  rbac/                  นิยาม role และ permission (แหล่งความจริงเดียว)
  domain/                กฎธุรกิจ การจอง ห้อง ค้นหา ปฏิทิน รายงาน งานตามเวลา
  notify/                คิวงาน adapter อีเมล/LINE template และ ICS
  validation/            zod schema ที่ใช้ร่วมกันทั้ง API และฟอร์ม
  util/                  เวลา/โซนเวลา logger rate limit
  i18n/                  ข้อความไทย/อังกฤษ
tests/
  unit/                  ฟังก์ชันบริสุทธิ์
  integration/           ต่อ PostgreSQL จริง (RLS, กันจองซ้อน, race condition)
  e2e/                    Playwright ทดสอบหน้าจอที่ 360 / 768 / 1024 / Desktop
docs/                    คู่มือทั้งหมด
```

---

## หลักการออกแบบที่สำคัญ

**1. กันจองซ้อนที่ชั้นฐานข้อมูล ไม่พึ่งการตรวจฝั่งเว็บ**

ตาราง `bookings` มี exclusion constraint บน `(room_id, blocked_period)` โดย `blocked_period`
คือช่วงเวลาประชุมบวกเวลา buffer หน้า/หลัง ถึงแม้หลายคำขอจะเข้ามาพร้อมกัน
ฐานข้อมูลจะยอมให้สำเร็จเพียงรายการเดียว (มีเทสต์ยิง 10 คำขอพร้อมกันยืนยันไว้)

**2. ตรวจสิทธิ์สามชั้น**

UI ซ่อนเมนู → API ตรวจ `requirePermission()` → ฐานข้อมูลบังคับด้วย RLS ที่เปิด
`FORCE ROW LEVEL SECURITY` ทุกตารางข้อมูล แม้แอปต่อด้วยบัญชีเจ้าของตารางก็ยังถูกตรวจ

**3. เก็บเวลาเป็น UTC แสดงผลเป็น Asia/Bangkok**

ทุกคอลัมน์เวลาเป็น `timestamptz` การแปลงอยู่ในไฟล์เดียว (`src/lib/util/time.ts`)
และมีเทสต์ครอบกรณีข้ามวันและสิ้นเดือน

**4. ข้อมูลส่วนตัวถูกปิดบังที่ฐานข้อมูล**

`app.v_calendar_bookings` เป็น view ที่ปิดบังหัวข้อและชื่อผู้จองของการประชุมที่ตั้งค่า
"แสดงเฉพาะว่าไม่ว่าง" และ RLS ตัดแถวการประชุมส่วนตัวของผู้อื่นออกทั้งแถว

**5. งานแจ้งเตือนเป็นคิวที่ตรวจย้อนหลังได้**

ทุกการแจ้งเตือนถูกบันทึกเป็นงานในตาราง `notification_jobs` พร้อม idempotency key
ส่งโดย worker ที่เรียกผ่าน Vercel Cron มี retry แบบ exponential backoff และ dead letter

---

## การ deploy

ดูขั้นตอนเต็มใน [docs/infrastructure-setup.md](docs/infrastructure-setup.md) และ
[docs/runbooks.md](docs/runbooks.md) โดยย่อคือ

1. Import repository เข้า Vercel เลือก region `sin1`
2. ใส่ Environment variables ตาม [docs/env-matrix.md](docs/env-matrix.md)
   (**ห้ามใส่ `DIRECT_URL` ใน Vercel**)
3. รัน migration จากเครื่องตัวเองโดยชี้ `DIRECT_URL` ไปที่ Supabase
4. เพิ่ม Custom domain และรอ SSL
5. ตรวจ `/api/health` แล้วทำ smoke test ตาม [docs/production-readiness.md](docs/production-readiness.md)

> ⚠️ **ข้อผิดพลาดที่ทำให้เว็บล่มบ่อยที่สุด**
> `DATABASE_URL` ที่เว็บใช้ต้องเป็นเส้น **Transaction pooler พอร์ต 6543**
> ถ้าใช้พอร์ต 5432 บน Vercel จะเปิด connection เต็มโควตาแล้วเว็บล่มตอนคนเข้าพร้อมกัน
> ส่วน `DIRECT_URL` (พอร์ต 5432) ใช้เฉพาะรัน migration บนเครื่องตัวเอง

---

## ความปลอดภัย

- รหัสผ่านเก็บเป็น scrypt hash เท่านั้น เซสชันเป็น opaque token ที่เก็บเฉพาะ hash ในฐานข้อมูล
- Security headers: CSP, HSTS (เฉพาะ production), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`
- Cookie เป็น `HttpOnly` + `SameSite=Lax` + `Secure` บน production
- จำกัดอัตราการเรียกที่ login, สมัคร, ค้นหา และการจอง (เก็บตัวนับใน PostgreSQL เพื่อให้ใช้ได้บน serverless)
- Webhook ของ LINE และอีเมลตรวจลายเซ็นทุก request
- Audit log ไม่มี policy สำหรับ UPDATE/DELETE จึงแก้ไขย้อนหลังไม่ได้
- ไม่มี secret ใดอยู่ใน source code — `.env.example` มีแต่ชื่อกับคำอธิบาย

พบช่องโหว่หรือข้อสงสัยด้านความปลอดภัย ให้แจ้งผู้ดูแลระบบขององค์กรโดยตรง
ห้ามเปิด issue สาธารณะ
