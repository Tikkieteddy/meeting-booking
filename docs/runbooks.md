# Runbooks — ขั้นตอนปฏิบัติงานและรับมือเหตุการณ์

เอกสารนี้ใช้ตอน "ต้องทำอะไรจริง" ทุก runbook เขียนให้ทำตามได้ทีละบรรทัด

**ก่อนเริ่มทุก runbook ให้จดสามอย่าง:** เวลาที่เริ่ม ใครเป็นคนทำ และเหตุผลที่ต้องทำ

---

## สารบัญ

- [Deployment Runbook](#deployment-runbook)
- [Migration Runbook](#migration-runbook)
- [Backup และ Restore Runbook](#backup-และ-restore-runbook)
- [Rollback Runbook](#rollback-runbook)
- [เหตุการณ์: เว็บล่ม](#เหตุการณ์-เว็บล่ม)
- [เหตุการณ์: ฐานข้อมูลล่ม](#เหตุการณ์-ฐานข้อมูลล่ม)
- [เหตุการณ์: DNS ผิด](#เหตุการณ์-dns-ผิด)
- [เหตุการณ์: อีเมลไม่ออก](#เหตุการณ์-อีเมลไม่ออก)
- [เหตุการณ์: LINE ไม่ออก](#เหตุการณ์-line-ไม่ออก)
- [เหตุการณ์: มีการจองซ้อนกัน](#เหตุการณ์-มีการจองซ้อนกัน)
- [เหตุการณ์: สงสัยว่าคีย์รั่วไหล](#เหตุการณ์-สงสัยว่าคีย์รั่วไหล)
- [หยุดการแจ้งเตือนทั้งระบบ](#หยุดการแจ้งเตือนทั้งระบบ)

---

## Deployment Runbook

### ก่อน deploy (ทำบนเครื่องตัวเอง)

```bash
git pull
npm install
npm run verify          # typecheck + lint + unit test
npm run test:integration   # ต้องมี TEST_DATABASE_URL
npm run build           # ต้องผ่านก่อน push เสมอ
```

**เกณฑ์ Go / No-go**

| ข้อ | ต้องเป็น |
|---|---|
| `npm run verify` | ผ่านทั้งหมด |
| `npm run build` | สำเร็จ ไม่มี error |
| มี migration ใหม่หรือไม่ | ถ้ามี ต้องรัน migration **ก่อน** deploy โค้ดที่ใช้ตารางใหม่ |
| มีการแก้ environment variable | ต้องใส่ใน Vercel ให้ครบก่อน แล้ว Redeploy |
| ช่วงเวลา | หลีกเลี่ยงเวลาที่คนใช้งานหนัก (เช้า 08:30–09:30) |

### ขั้นตอน deploy

1. `git push` ขึ้น branch → Vercel สร้าง **Preview deployment** อัตโนมัติ
2. เปิด Preview URL ทำ smoke test สั้น ๆ (ล็อกอิน, เปิดปฏิทิน, จองหนึ่งรายการ)
3. เปิด Pull Request → ให้เพื่อนร่วมทีมรีวิว
4. Merge เข้า `main` → Vercel deploy ขึ้น Production
5. **Smoke test บน production** (ทำทุกครั้ง ห้ามข้าม)

```bash
BASE=https://meeting.example.com
curl -s $BASE/api/health                       # ต้องได้ status ok และ database ok
curl -o /dev/null -w "%{http_code}\n" $BASE/login    # ต้องได้ 200
```

จากนั้นทำด้วยมือ

- [ ] ล็อกอินด้วยบัญชีทดสอบ
- [ ] เปิดปฏิทิน สลับ วัน / สัปดาห์ / เดือน
- [ ] ค้นหาห้อง
- [ ] จองหนึ่งรายการ → ต้องเห็นในปฏิทินทันที
- [ ] เปิดหน้า **ผู้ดูแลระบบ → สถานะระบบ** → ไม่มีงานค้างผิดปกติ
- [ ] แก้ไขและยกเลิกรายการที่จองทดสอบ
- [ ] ตรวจว่าอีเมลแจ้งเตือนมาถึง

6. อัปเดต `RELEASE_VERSION` ใน Vercel ให้ตรงกับเวอร์ชันที่ปล่อย แล้ว Redeploy

### หลัง deploy

เฝ้าดู 30 นาที: Vercel → Logs (มี error ผิดปกติไหม) และหน้า สถานะระบบ

---

## Migration Runbook

> ⚠️ Migration แก้โครงสร้างฐานข้อมูล **ต้อง backup ก่อนทุกครั้งบน production**

### ขั้นตอน

```bash
# 1) ดูว่ามี migration อะไรค้างอยู่
npm run db:migrate -- --status

# 2) backup ก่อน (ดู Backup Runbook)

# 3) รัน migration โดยใช้ DIRECT_URL (พอร์ต 5432)
#    ตั้งค่าใน .env.local ให้ DIRECT_URL ชี้ไปฐานข้อมูลที่ต้องการ
npm run db:migrate

# 4) ตรวจผล
npm run db:migrate -- --status
```

**ถ้าสำเร็จจะเห็น:** ทุกไฟล์ขึ้น `✔ รันแล้ว`

**ลำดับที่ปลอดภัย** เมื่อ migration เป็นการ *เพิ่ม* ตาราง/คอลัมน์: รัน migration ก่อน แล้ว deploy โค้ด
เมื่อเป็นการ *ลบ* หรือ *เปลี่ยนชนิดข้อมูล*: deploy โค้ดที่เลิกใช้ของเดิมก่อน แล้วค่อยรัน migration
(ทำให้ระบบใช้งานได้ต่อเนื่องระหว่างเปลี่ยน)

### ถ้า migration ล้มเหลวกลางทาง

ตัวรัน migration ห่อแต่ละไฟล์ด้วย transaction ถ้าไฟล์ใดล้มเหลว **ไฟล์นั้นจะถูก rollback ทั้งไฟล์**
และไม่ถูกบันทึกว่ารันแล้ว ฐานข้อมูลจึงไม่ค้างครึ่ง ๆ กลาง ๆ

1. อ่านข้อความ error — จะบอกชื่อไฟล์และบรรทัด
2. แก้ไฟล์ SQL แล้วรัน `npm run db:migrate` ซ้ำ
3. ถ้าแก้ไม่ได้ทันที ให้ย้อนกลับ: `npm run db:rollback`

### ย้อนกลับ migration

```bash
npm run db:rollback        # ย้อน 1 ขั้น
npm run db:rollback -- 3   # ย้อน 3 ขั้น
```

ทุกไฟล์ `.up.sql` มีไฟล์ `.down.sql` คู่กัน (มีเทสต์ integration ตรวจไว้ว่าต้องมีครบ)

> ⚠️ **การย้อน migration ที่ลบตารางจะทำให้ข้อมูลในตารางนั้นหายไปด้วย**
> ถ้าย้อนบน production ต้อง restore ข้อมูลจาก backup หลังย้อนเสร็จ

---

## Backup และ Restore Runbook

### Backup รายวัน (Supabase Pro ขึ้นไป)

ทำอัตโนมัติ ตรวจสถานะได้ที่ Supabase → Settings → Database → Backups

### Backup ด้วยมือ (จำเป็นสำหรับ Free tier และก่อนทำ migration)

```bash
STAMP=$(date +%F-%H%M)
# ใช้ DIRECT_URL (พอร์ต 5432) เพราะ pg_dump ต้องใช้ session mode
pg_dump "$DIRECT_URL" --no-owner --no-privileges -Fc -f backup-$STAMP.dump

# ตรวจว่าไฟล์ใช้ได้จริง (ห้ามเชื่อแค่ขนาดไฟล์)
pg_restore --list backup-$STAMP.dump | head -20
ls -lh backup-$STAMP.dump
```

**เก็บไฟล์ backup ไว้ที่ไหน:** ที่เก็บของบริษัทที่มีการเข้ารหัสและจำกัดผู้เข้าถึง
**ห้ามเก็บในเครื่องส่วนตัวหรือ cloud ส่วนตัว** เพราะเป็นข้อมูลส่วนบุคคลของพนักงาน

### Restore

```bash
# 1) สร้างฐานข้อมูลเปล่าสำหรับทดสอบ restore ก่อนเสมอ
createdb tnn_meeting_restore_test

# 2) restore ลงฐานข้อมูลทดสอบ
pg_restore --no-owner --no-privileges -d "postgresql://.../tnn_meeting_restore_test" backup-2026-09-16-0300.dump

# 3) ตรวจว่าข้อมูลครบ
psql "postgresql://.../tnn_meeting_restore_test" -c "
  select 'bookings' as t, count(*) from bookings
  union all select 'profiles', count(*) from profiles
  union all select 'rooms', count(*) from rooms;"
```

**เมื่อมั่นใจแล้วจึง restore ลงฐานข้อมูลจริง**

1. **ประกาศปิดระบบชั่วคราว** (ดู "หยุดการแจ้งเตือนทั้งระบบ" เพื่อกันการแจ้งเตือนซ้ำ)
2. Restore ตามขั้นข้างบน แต่ชี้ไปฐานข้อมูลจริง
3. รัน `npm run db:migrate -- --status` ตรวจว่าเวอร์ชันโครงสร้างตรงกับโค้ดที่ deploy อยู่
4. Smoke test ตาม Deployment Runbook
5. เปิดระบบ แล้วแจ้งผู้ใช้

### ทดสอบ restore ตามรอบ

**ต้องทำอย่างน้อยปีละครั้ง** และบันทึกผลไว้

| วันที่ทดสอบ | ผู้ทดสอบ | ไฟล์ backup ที่ใช้ | เวลาที่ใช้กู้คืน | ผล |
|---|---|---|---|---|
| | | | | |

**บันทึกเป้าหมาย**

- RPO (Recovery Point Objective) — ยอมเสียข้อมูลย้อนหลังได้กี่นาที: ______
- RTO (Recovery Time Objective) — ต้องกู้คืนเสร็จภายในกี่ชั่วโมง: ______

---

## Rollback Runbook

### กรณี 1: โค้ดใหม่มีปัญหา แต่โครงสร้างฐานข้อมูลไม่เปลี่ยน

**เร็วที่สุดและปลอดภัยที่สุด**

1. Vercel → Project → **Deployments**
2. หา deployment ตัวก่อนหน้าที่ใช้งานได้
3. กดปุ่ม **⋯** → **Promote to Production**
4. รอประมาณ 30 วินาที แล้วตรวจ `/api/health` และทำ smoke test

**ใช้เวลาประมาณ 1–2 นาที ไม่ต้องแตะฐานข้อมูล**

### กรณี 2: โค้ดใหม่มาพร้อม migration

1. Promote deployment เก่ากลับมาก่อน (ตามกรณีที่ 1) — ระบบมักยังทำงานได้
   เพราะ migration ที่เป็นการ "เพิ่ม" ไม่กระทบโค้ดเก่า
2. ถ้าโค้ดเก่าทำงานกับโครงสร้างใหม่ไม่ได้ ให้ย้อน migration ด้วย
   `npm run db:rollback` ตามจำนวนขั้นที่เพิ่มมาในรอบนี้
3. ถ้าการย้อน migration ทำให้ข้อมูลหาย ให้ restore จาก backup

### เกณฑ์ตัดสินใจ rollback

Rollback ทันทีถ้ามีข้อใดข้อหนึ่ง

- `/api/health` ไม่ตอบ 200 เกิน 5 นาที
- ผู้ใช้จองห้องไม่ได้
- ข้อมูลแสดงผิด (เช่น เห็นการจองของคนอื่นที่ไม่ควรเห็น)
- มี error ใน log เกิน 10% ของ request

---

## เหตุการณ์: เว็บล่ม

**อาการ:** เปิดเว็บไม่ได้ หรือขึ้น error 500

### ตรวจตามลำดับ

```bash
# 1) ระบบตอบสนองไหม
curl -si https://meeting.example.com/api/health

# 2) DNS ยังชี้ถูกไหม
dig +short CNAME meeting.example.com

# 3) certificate ยังไม่หมดอายุ
echo | openssl s_client -connect meeting.example.com:443 2>/dev/null | openssl x509 -noout -dates
```

| ผลที่เจอ | สาเหตุ | ทำอะไร |
|---|---|---|
| ไม่ได้คำตอบเลย / timeout | DNS หรือ Vercel ล่ม | ดู <https://vercel-status.com> และหัวข้อ "DNS ผิด" |
| ได้ 503 + `database: down` | ฐานข้อมูลล่ม | ไปหัวข้อ "ฐานข้อมูลล่ม" |
| ได้ 500 | โค้ดมีบั๊ก | ดู Vercel → Logs หา error แล้ว Rollback |
| Certificate หมดอายุ | SSL ไม่ได้ต่ออายุ | ตรวจ Vercel → Domains มี CAA record ขวางอยู่ไหม |

### แจ้งผู้ใช้

แจ้งทางช่องทางที่ไม่ได้พึ่งระบบนี้ (LINE กลุ่มภายใน / อีเมลองค์กร)
ระบุ: อาการ / เวลาที่เริ่ม / วิธีทำงานชั่วคราว (เช่น จดการจองไว้ก่อน) / เวลาที่คาดว่าจะแก้เสร็จ

---

## เหตุการณ์: ฐานข้อมูลล่ม

**อาการ:** `/api/health` ตอบ `database: down` หรือ log มี `connect ETIMEDOUT`

### ตรวจตามลำดับ

1. Supabase Dashboard → สถานะโปรเจกต์เป็นสีเขียวไหม
2. <https://status.supabase.com> มีเหตุขัดข้องไหม
3. Supabase → Reports → **Database** → ดูจำนวน connection

| สาเหตุ | อาการเฉพาะ | วิธีแก้ |
|---|---|---|
| Connection เต็ม | ล่มตอนคนเข้าพร้อมกัน error `too many connections` | ★ ตรวจว่า `DATABASE_URL` เป็น **พอร์ต 6543** ถ้าเป็น 5432 ให้แก้แล้ว Redeploy ทันที และลด `DATABASE_POOL_MAX` |
| โปรเจกต์ Free tier ถูกพัก | ไม่มีใครใช้เกิน 7 วัน | Supabase → กด **Restore project** และวางแผนขึ้น Pro |
| ดิสก์เต็ม | error `no space left` | ลบข้อมูล log เก่า (ปรับ `audit.retention_days`) หรือขยายแพ็กเกจ |
| รหัสผ่านถูกเปลี่ยน | `password authentication failed` | แก้ `DATABASE_URL` ทุก environment แล้ว Redeploy |

---

## เหตุการณ์: DNS ผิด

**อาการ:** เว็บเปิดไม่ได้ หรือเปิดได้บางเครื่องบางเครือข่าย

1. เทียบผลกับค่าที่บันทึกใน [dns-sheet.md](dns-sheet.md)
2. ถ้าค่าผิด ให้นำค่าเดิมจากไฟล์สำรองกลับไปใส่
3. ตรวจจาก DNS หลายตัว:
   `dig +short @8.8.8.8 CNAME meeting.example.com` และ `dig +short @1.1.1.1 CNAME meeting.example.com`
4. รอตาม TTL (ถ้าลด TTL ไว้ 300 วินาที จะกลับมาเร็ว)

> **ถ้าอีเมลองค์กรล่มหลังแก้ DNS** ให้ตรวจ MX record ของโดเมนหลักทันที
> นี่คือความผิดพลาดที่ร้ายแรงที่สุดของงาน DNS — กู้คืน MX ก่อนเรื่องอื่นทั้งหมด

---

## เหตุการณ์: อีเมลไม่ออก

1. เปิดหน้า **ผู้ดูแลระบบ → สถานะระบบ**
2. ดูตามอาการ

| สิ่งที่เห็น | สาเหตุ | วิธีแก้ |
|---|---|---|
| "ผู้ให้บริการอีเมล: โหมดทดสอบ (log)" | `EMAIL_PROVIDER` ยังเป็น `log` | ตั้งเป็น `resend` ใส่ `EMAIL_API_KEY` แล้ว Redeploy |
| งานค้างในคิวเยอะและค้างนาน | Cron ไม่ทำงาน | ตรวจ Vercel → Cron Jobs และทดสอบเรียกด้วย `CRON_SECRET` |
| ความผิดพลาด `HTTP 401` | API key ผิดหรือถูกเพิกถอน | สร้างคีย์ใหม่ → ใส่ → Redeploy → กด "ลองส่งใหม่" |
| ความผิดพลาด `HTTP 403` + domain not verified | DNS ของอีเมลยังไม่ผ่าน | ทำตาม [dns-sheet.md](dns-sheet.md) ส่วนอีเมล |
| ความผิดพลาด `HTTP 429` | ส่งเกินโควตา | รอ (ระบบ retry เอง) หรือขยายแพ็กเกจ |
| "อีเมลที่ถูกระงับส่ง" มีจำนวนมาก | อีเมลตีกลับหรือถูกรายงานสแปม | ตรวจว่าอีเมลผู้ใช้ถูกต้อง และตรวจ SPF/DKIM/DMARC |
| งานขึ้นสถานะ "ข้าม" | ผู้รับปิดการแจ้งเตือนทางอีเมลไว้เอง | ไม่ใช่ข้อผิดพลาด — แจ้งผู้ใช้ให้เปิดในหน้าโปรไฟล์ |

3. ทดสอบส่งซ้ำ: กด **ลองส่งใหม่** ที่รายการที่ล้มเหลว แล้วเรียก Cron ด้วยมือ

```bash
curl -H "authorization: Bearer $CRON_SECRET" https://meeting.example.com/api/cron/dispatch
```

---

## เหตุการณ์: LINE ไม่ออก

| สิ่งที่เห็น | สาเหตุ | วิธีแก้ |
|---|---|---|
| "ผู้ให้บริการ LINE: โหมดทดสอบ (log)" | `LINE_PROVIDER` ยังเป็น `log` | ตั้งเป็น `messaging-api` ใส่ token แล้ว Redeploy |
| งานขึ้น "ข้าม" พร้อมข้อความ "ยังไม่ได้เชื่อมบัญชี LINE" | ผู้ใช้ยังไม่เชื่อมบัญชี | แนะนำผู้ใช้ตาม [user-guide.md](user-guide.md) |
| `HTTP 401` | Channel access token หมดอายุ/ถูกเพิกถอน | ออก token ใหม่ → ใส่ → Redeploy → ลองส่งใหม่ |
| `HTTP 429` | ส่งเกินโควตาของแพ็กเกจ LINE | ระบบ retry เอง ถ้าเกิดต่อเนื่องให้ลดจำนวนเวลาเตือน |
| ผู้ใช้เชื่อมบัญชีไม่สำเร็จ | Webhook ล้ม | ตรวจ LINE Console → Verify webhook และดู Vercel Logs ของ `/api/webhooks/line` |
| ผู้ใช้บอกว่าไม่ได้รับแม้เชื่อมแล้ว | ผู้ใช้บล็อกบัญชีทางการ | ระบบตั้งสถานะเป็น blocked และปิดช่องทางให้อัตโนมัติ ให้ผู้ใช้เลิกบล็อกแล้วเชื่อมใหม่ |

---

## เหตุการณ์: มีการจองซ้อนกัน

**ถ้าเกิดเหตุนี้ขึ้นจริง ถือเป็นเรื่องร้ายแรง** เพราะระบบออกแบบให้ฐานข้อมูลกันไว้

### ตรวจว่าเกิดขึ้นจริงหรือไม่

```sql
-- ต้องได้ 0 แถวเสมอ
select a.id, a.title, a.starts_at, b.id, b.title, b.starts_at
from bookings a
join bookings b
  on a.room_id = b.room_id
 and a.id < b.id
 and a.blocked_period && b.blocked_period
where a.blocks_slot and b.blocks_slot;
```

### ถ้าพบแถว (ไม่ควรเกิดขึ้น)

1. ตรวจว่า exclusion constraint ยังอยู่

```sql
select conname, contype from pg_constraint where conname = 'bookings_no_overlap';
-- ต้องได้ 1 แถว contype = 'x'
```

2. ถ้า constraint หายไป แปลว่ามีคนลบออกจากฐานข้อมูลด้วยมือ → สร้างกลับทันที

```sql
alter table bookings add constraint bookings_no_overlap
  exclude using gist (room_id with =, blocked_period with &&) where (blocks_slot);
```

3. ตรวจ audit log หาผู้กระทำและเวลา
4. ติดต่อผู้จองทั้งสองรายเพื่อจัดการด้วยมือ แล้วยกเลิกรายการที่จองภายหลัง
5. บันทึกเหตุการณ์และสาเหตุ

### กรณีที่ "ดูเหมือน" ซ้อนแต่ถูกต้อง

- การจองที่ยกเลิก/ถูกปฏิเสธ/ไม่มาใช้ห้อง **ไม่กันเวลา** จึงซ้อนกับรายการใหม่ได้ตามปกติ
- ห้องต่างกันจองเวลาเดียวกันได้

---

## เหตุการณ์: สงสัยว่าคีย์รั่วไหล

ทำตามลำดับนี้ **อย่าข้ามขั้น**

1. **เพิกถอนคีย์เก่าทันที** (ไม่ต้องรอสร้างใหม่ก่อน)
   - Resend: ลบ API key ที่หน้า API Keys
   - LINE: กด Revoke ที่ Channel access token
   - ฐานข้อมูล: Supabase → Settings → Database → Reset database password
2. สร้างคีย์ใหม่ → ใส่ใน Vercel → **Redeploy**
3. ถ้า `AUTH_SECRET` รั่ว: เปลี่ยนค่าแล้ว Redeploy (ผู้ใช้ทุกคนต้องล็อกอินใหม่ ซึ่งเป็นผลที่ต้องการ)
4. ตรวจร่องรอยการใช้งานผิดปกติ

```sql
-- การล็อกอินล้มเหลวจำนวนมาก
select email, count(*) from login_attempts
where not succeeded and attempted_at > now() - interval '7 days'
group by email order by count(*) desc limit 20;

-- การกระทำของผู้ดูแลระบบย้อนหลัง
select created_at, actor_email, action, resource_type, ip_hint
from audit_logs
where action in ('role.grant','room.create','room.update','auth.logout_all_devices')
  and created_at > now() - interval '7 days'
order by created_at desc;
```

5. ถ้าพบว่ามีผู้บุกรุกเข้าถึงบัญชี: เตะทุกอุปกรณ์ออกจากระบบ

```sql
update user_sessions set revoked_at = now() where revoked_at is null;
```

6. บันทึกเหตุการณ์: เวลาที่พบ / คีย์ที่รั่ว / ช่องทางที่รั่ว / สิ่งที่ทำ / ผลกระทบ
7. แจ้งผู้รับผิดชอบด้านความปลอดภัยขององค์กรตามนโยบาย PDPA
   ถ้ามีข้อมูลส่วนบุคคลรั่วไหล

---

## หยุดการแจ้งเตือนทั้งระบบ

ใช้เมื่อระบบส่งแจ้งเตือนผิดพลาดซ้ำ ๆ หรือกำลังจะทำ maintenance

### วิธีที่ 1 — หยุดเฉพาะการส่ง (เร็วที่สุด งานยังอยู่ในคิว)

Vercel → Project → Cron Jobs → ปิด `/api/cron/dispatch`
งานจะค้างในคิวและส่งต่อเมื่อเปิดกลับ

### วิธีที่ 2 — สลับไปโหมดทดสอบ (ไม่ส่งจริงแต่ระบบยังทำงาน)

ตั้ง `EMAIL_PROVIDER=log` และ `LINE_PROVIDER=log` ใน Vercel แล้ว Redeploy
ระบบจะบันทึกการส่งลง log และฐานข้อมูลแต่ไม่ส่งออกภายนอก

### วิธีที่ 3 — ยกเลิกงานที่ค้างในคิว (ใช้เมื่อข้อความผิดพลาดไปแล้ว)

```sql
-- ดูก่อนว่ามีอะไรค้าง
select event_type, channel, count(*) from notification_jobs
where status in ('queued','failed') group by 1,2;

-- ยกเลิกทั้งหมดที่ยังไม่ส่ง
update notification_jobs
   set status = 'skipped', last_error = 'ยกเลิกโดยผู้ดูแลระบบระหว่างแก้ไขเหตุขัดข้อง'
 where status in ('queued','failed');
```

### เปิดกลับ

1. แก้สาเหตุให้เรียบร้อยก่อน
2. เปิด Cron / คืนค่า provider แล้ว Redeploy
3. เรียก Cron ด้วยมือหนึ่งรอบ แล้วดูหน้า สถานะระบบ ว่าส่งได้จริง

> ระบบใช้ **idempotency key** กันการส่งซ้ำ การเรียก Cron ซ้ำหลายรอบจึงไม่ทำให้ผู้ใช้
> ได้รับอีเมลเดิมซ้ำ
