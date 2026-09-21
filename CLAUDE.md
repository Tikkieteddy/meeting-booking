# บันทึกสำหรับผู้พัฒนาต่อ (และ Claude Code ในเซสชันถัดไป)

ระบบจองห้องประชุม TNN — Next.js 15 (App Router) + PostgreSQL (Neon) + Vercel
**สื่อสารและเขียนข้อความในระบบเป็นภาษาไทยเสมอ**

เอกสารทั้งหมดอยู่ใน `docs/` เริ่มที่ [README.md](README.md)

---

## คำสั่งที่ใช้บ่อย

```bash
npm run dev               # เปิดเซิร์ฟเวอร์สำหรับพัฒนา
npm run verify            # typecheck + lint + unit test — รันก่อน commit ทุกครั้ง
npm run test:integration  # ต้องมี TEST_DATABASE_URL (ชื่อฐานข้อมูลต้องมีคำว่า test)
npm run test:e2e          # Playwright — จะล้างและ seed ฐานข้อมูลให้ก่อนอัตโนมัติ
npm run db:migrate        # รัน migration ที่ค้าง
npm run db:reset          # ย้อนทั้งหมด รันใหม่ แล้ว seed (ห้ามใช้บน production)
```

**บนเครื่องที่ยังไม่มีฐานข้อมูล:** `createdb tnn_meeting && createdb tnn_meeting_test`
แล้ว `cp .env.example .env.local` เติม `DATABASE_URL` กับ `AUTH_SECRET`

---

## กฎเหล็กของโปรเจกต์นี้ — อ่านก่อนแก้โค้ด

### 1. ห้ามพึ่งการตรวจเฉพาะฝั่งเว็บ

การกันจองซ้อนอยู่ที่ exclusion constraint ในฐานข้อมูล
(`bookings_no_overlap` บน `room_id` + `blocked_period`)
ถ้าจะเพิ่มเส้นทางสร้าง/แก้การจองใหม่ **ต้องผ่าน `src/lib/domain/booking-service.ts`**
ซึ่งล็อกห้องด้วย advisory lock ตรวจกฎธุรกิจ และจับ error `23P01` แปลเป็นข้อความไทย

### 2. ทุก query ที่ทำแทนผู้ใช้ต้องผ่าน `withTx(ctx, ...)`

`src/lib/db/pool.ts` ตั้ง `app.user_id` และ `app.user_role` ให้ RLS
ถ้าเรียก `pool.query()` ตรง ๆ RLS จะไม่มี context และจะไม่เห็นข้อมูลใดเลย

**งานของระบบที่ต้อง atomic กับธุรกรรมของผู้ใช้** (เขียน audit log, ใส่คิวแจ้งเตือน
ถึงผู้อื่น, สร้างคำขออนุมัติ, จับคู่ผู้เข้าร่วมกับบัญชี) ใช้ `asService(sql, fn)`
ยกระดับสิทธิ์เฉพาะคำสั่งนั้น — **ห้ามใช้ครอบคำสั่งที่รับข้อมูลดิบจากผู้ใช้
ไปเขียนตารางธุรกิจ** และต้องมีคอมเมนต์อธิบายเหตุผลทุกจุด

### 3. ตรวจสิทธิ์สามชั้นเสมอ

UI ซ่อนเมนู → API เรียก `requirePermission()` → ฐานข้อมูลบังคับด้วย RLS
เพิ่ม endpoint ใหม่ต้องทำครบทั้งสามชั้น และเพิ่มเทสต์ใน
`tests/integration/rls.test.ts` กับ `tests/e2e/permissions.spec.ts`

### 4. เวลาเก็บ UTC แสดง Asia/Bangkok

การแปลงทั้งหมดอยู่ใน `src/lib/util/time.ts` เท่านั้น
**ห้ามใช้ `new Date('2026-09-16 13:00')` หรือ `getHours()` ตรง ๆ** เพราะจะอิงโซนเวลาของเครื่อง

### 5. ข้อความที่ผู้ใช้เห็นต้องมาจาก `src/lib/i18n/`

เพิ่มคีย์ใน `th.ts` (จำเป็น) และ `en.ts` (ถ้าแปลได้) แล้วเรียกผ่าน `t('key')`
ห้าม hardcode ข้อความในคอมโพเนนต์

### 6. ห้ามใส่ความลับใน `NEXT_PUBLIC_*`

ตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` ถูกฝังลงไฟล์ที่ส่งไปให้เบราว์เซอร์
โค้ดฝั่ง server ที่แตะความลับต้องมี `import 'server-only'` ที่บรรทัดแรก

### 7. ฟังก์ชันบริสุทธิ์ที่ client ใช้ ต้องไม่อยู่ในไฟล์ `server-only`

ตัวอย่างรูปแบบที่ใช้: `domain/calendar.ts` (server-only, ดึงข้อมูล) แยกจาก
`domain/calendar-shared.ts` (ชนิดข้อมูล + ฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งสองฝั่ง)

### 8. ห้องที่มีประวัติการจองลบไม่ได้

ใช้ `archived_at` แทน — FK เป็น `ON DELETE RESTRICT` และไม่มี endpoint ลบห้องโดยเจตนา

### 9. ห้าม service worker แคชข้อมูลของผู้ใช้

`public/sw.js` แคชได้เฉพาะ `/_next/static/...`, `/icons/...` และหน้า `/offline`
**ห้ามแคชหน้า HTML และห้ามแคช `/api/` เด็ดขาด** เพราะหน้าเว็บถูกประกอบที่เซิร์ฟเวอร์
พร้อมข้อมูลของผู้ที่ล็อกอินอยู่ ถ้าแคชไว้บนเครื่องที่ใช้ร่วมกัน (เช่นแท็บเล็ต
หน้าห้องประชุม) คนถัดไปจะเห็นข้อมูลของคนก่อน — มีเทสต์ใน
`tests/e2e/pwa.spec.ts` บังคับกฎนี้ไว้ ถ้าแก้ให้แคชมากขึ้นเทสต์จะแดงทันที

ทุกฟีเจอร์ต้องใช้งานได้แม้ service worker ใช้ไม่ได้ (progressive enhancement)

### 10. สีที่เป็นตัวอักษรต้องผ่านเกณฑ์ WCAG AA (4.5:1)

ตรวจก่อนใช้ทุกครั้ง — ค่าที่เคยพลาดมาแล้ว:

| อย่าใช้ | อัตราส่วน | ใช้แทน |
|---|---|---|
| `text-ink-400` เป็นสีข้อความ | ต่ำกว่า 3:1 | `text-ink-500` ขึ้นไป |
| `bg-red-500` + `text-white` | 3.81:1 | `bg-red-600` |
| `text-brand-600` บนพื้นขาว | 4.36:1 | `text-brand-700` |
| `bg-brand-500` + `text-white` | **3.36:1** | ยังไม่ผ่าน — รอการตัดสินใจเรื่องสีแบรนด์ (ดู `docs/performance.md` ข้อ 7) |

### 11. ชื่อที่ screen reader อ่าน ต้องครอบคลุมข้อความที่ตาเห็น

กฎ WCAG 2.5.3 (Label in Name) — คนที่สั่งงานด้วยเสียงจะพูดตามที่เห็นบนจอ
ถ้าบนจอเขียน `09:00–10:30` แต่ `aria-label` เขียน `09:00 ถึง 10:30` คำสั่งเสียง
จะหาปุ่มนั้นไม่เจอ และ `aria-hidden` **ไม่ช่วย** เพราะข้อความนั้นยังมองเห็นอยู่จริง

แนวทางที่ใช้ในโปรเจกต์นี้:
- ถ้าปุ่มมีข้อความอยู่แล้ว **อย่าเขียน `aria-label` ทับ** — ให้ชื่อเกิดจากเนื้อหา
  แล้วเติมข้อมูลที่ตาเห็นจากสี/สัญลักษณ์ด้วย `<span className="sr-only">`
  (ตัวอย่าง: `src/components/calendar/booking-card.tsx`)
- โลโก้ที่เป็นตัวอักษรต้องใช้ SVG (`src/components/ui/brand-mark.tsx`)
  ไม่ใช่ตัวอักษรใน DOM

### 12. ลิงก์ในเมนูใช้ `SmartLink` ไม่ใช่ `next/link`

`src/components/ui/smart-link.tsx` ปิดการโหลดหน้าถัดไปล่วงหน้าเมื่อผู้ใช้เปิด
โหมดประหยัดเน็ต หรือเน็ตช้ากว่า 4G — มีเทสต์ใน `tests/e2e/network-saving.spec.ts`

---

## โครงสร้างที่ควรรู้

| ที่อยู่ | เนื้อหา |
|---|---|
| `db/migrations/NNN_name.up.sql` + `.down.sql` | migration ต้องมีไฟล์ย้อนกลับคู่กันทุกไฟล์ (มีเทสต์ตรวจ) |
| `src/lib/rbac/permissions.ts` | แหล่งความจริงเดียวของ role และ permission — seed คัดลอกลงฐานข้อมูล |
| `src/lib/domain/booking-rules.ts` | กฎธุรกิจแบบ pure function ทดสอบได้ตรง ๆ |
| `src/lib/domain/booking-service.ts` | หัวใจของการจอง — ทุกการเขียนการจองต้องผ่านที่นี่ |
| `src/lib/validation/schemas.ts` | zod schema ใช้ร่วมกันทั้ง API และฟอร์ม |
| `src/lib/api/respond.ts` | รูปแบบ error เดียวกันทุก endpoint + correlation id |
| `src/lib/notify/` | คิวงาน worker adapter อีเมล/LINE template และ ICS |

## การเพิ่มฟีเจอร์ใหม่ — ลำดับที่ควรทำ

1. เพิ่ม migration (`.up.sql` + `.down.sql`) และ RLS policy ถ้ามีตารางใหม่
2. เขียนกฎธุรกิจเป็น pure function ใน `src/lib/domain/` พร้อม unit test
3. เพิ่ม zod schema ใน `src/lib/validation/schemas.ts`
4. เขียน service ที่ใช้ `withTx` + audit log
5. เพิ่ม route handler ที่เรียก `requirePermission` และห่อด้วย `withApi`
6. เพิ่มข้อความใน `i18n/th.ts` แล้วทำ UI
7. เพิ่มเทสต์: unit → integration (RLS ด้วย) → e2e
8. `npm run verify` และ `npm run build` ให้ผ่านก่อน commit

## จุดที่พลาดกันบ่อย

- `DATABASE_URL` บน Vercel ต้องเป็นเส้นที่ชื่อ host มี **`-pooler`** (PgBouncer โหมด transaction)
  เส้นตรงจะทำให้ connection เต็มแล้วเว็บล่ม และ **ห้ามใส่ `DIRECT_URL` ใน Vercel**
  ระบบใช้ `pg_advisory_xact_lock` (ล็อกระดับ transaction) จึงทำงานถูกต้องใต้ pooler โหมดนี้ —
  **ห้ามเปลี่ยนไปใช้ล็อกระดับ session** เพราะจะพังเงียบ ๆ เมื่อ connection ถูกสลับ
- แก้ environment variable แล้วต้อง **Redeploy** ค่าใหม่จึงมีผล
- ข้อความใน `<label>` ต้องเท่ากับชื่อฟิลด์เป๊ะ ๆ (เครื่องหมาย `*` วางไว้นอก label)
  เพราะ screen reader และเทสต์ใช้ข้อความนี้เป็นชื่อของ control
- ห้องตัวอย่างในไฟล์ seed เปิดจันทร์–ศุกร์ เทสต์ที่จองต้องเลือกวันทำการ
- ระบบจำกัดอัตราการล็อกอิน เทสต์จึงต้องล็อกอินครั้งเดียวแล้วใช้ storageState ร่วมกัน
