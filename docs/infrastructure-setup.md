# คู่มือตั้งค่าระบบตั้งแต่เริ่มต้น (ฉบับสำหรับผู้เริ่มต้น)

เอกสารนี้พาคุณจาก "ยังไม่มีอะไรเลย" ไปถึง "ระบบใช้งานจริงได้บนอินเทอร์เน็ต"
ทุกขั้นบอกชัดว่า **ทำที่ไหน / กดปุ่มไหน / พิมพ์อะไร / เห็นอะไรแปลว่าผ่าน / พังแล้วทำยังไง**

> **กฎเหล็กข้อเดียวที่ห้ามลืม**
> ค่าที่เป็นความลับ (รหัสผ่าน, API key, token) ให้ใส่ในหน้าตั้งค่าของผู้ให้บริการเท่านั้น
> **ห้ามพิมพ์ลงในไฟล์โค้ด ห้ามส่งในแชต และห้ามแคปหน้าจอที่เห็นค่าเต็ม**

---

## ส่วนที่ 0 — ภาพรวมก่อนเริ่ม

### ระบบนี้ประกอบด้วยอะไร

```
                 ┌──────────────────────┐
  ผู้ใช้ ─────────▶│  โดเมนขององค์กร       │
 (เบราว์เซอร์)     │  meeting.example.com │
                 └──────────┬───────────┘
                            │ DNS ชี้มาที่ Vercel
                            ▼
                 ┌──────────────────────┐        ┌───────────────────┐
                 │  Vercel (region sin1)│───────▶│ Supabase          │
                 │  Next.js + API       │  SQL   │ PostgreSQL        │
                 │  Cron ทุก 5/10 นาที   │        │ (region สิงคโปร์)   │
                 └───────┬───────┬──────┘        └───────────────────┘
                         │       │
              ส่งอีเมล ───┘       └─── ส่ง LINE
                   ▼                      ▼
            ┌─────────────┐        ┌──────────────────┐
            │ Resend      │        │ LINE Messaging   │
            │ (อีเมล)      │        │ API              │
            └─────────────┘        └──────────────────┘
```

### ลำดับการไหลของข้อมูลเมื่อมีคนจองห้อง

1. ผู้ใช้กดช่วงเวลาว่างในปฏิทิน → เบราว์เซอร์ส่งคำขอไปที่ Vercel
2. Vercel ตรวจว่าล็อกอินอยู่ ตรวจสิทธิ์ ตรวจกฎธุรกิจ แล้วเปิด transaction ไปที่ Supabase
3. Supabase ล็อกห้องนั้นไว้ ตรวจว่าไม่ชนกับการจองอื่น แล้วบันทึก
   (ถ้าชนกัน ฐานข้อมูลปฏิเสธเอง แม้มีคนกดพร้อมกันสิบคน)
4. ในทรานแซกชันเดียวกัน ระบบใส่ "งานแจ้งเตือน" ลงคิว และเขียน audit log
5. Vercel Cron เรียก `/api/cron/dispatch` ทุก 5 นาที เพื่อส่งอีเมล/LINE จากคิว

### บัญชีที่ต้องมี และสิทธิ์ขั้นต่ำ

| บริการ | ใช้ทำอะไร | สิทธิ์ที่ต้องมี | ค่าใช้จ่ายเริ่มต้น |
|---|---|---|---|
| GitHub | เก็บโค้ด | สิทธิ์ Admin ของ repository | ฟรี |
| Supabase | ฐานข้อมูล PostgreSQL | Owner ขององค์กร | ฟรี (Free tier) |
| Vercel | โฮสต์เว็บ | Owner หรือ Admin ของทีม | ฟรี (Hobby) / Pro ถ้าใช้ในองค์กร |
| Resend | ส่งอีเมล | Admin | ฟรี 3,000 ฉบับ/เดือน |
| LINE Developers | ส่งแจ้งเตือน LINE | Admin ของ Provider | ฟรี (จำกัดจำนวนข้อความ/เดือน) |
| ผู้ดูแลโดเมน | ตั้งค่า DNS | สิทธิ์แก้ DNS record | ตามที่จ่ายโดเมนอยู่แล้ว |

> ถ้าคุณเคยทำโปรเจกต์อื่นด้วยบัญชีเหล่านี้แล้ว **ไม่ต้องสมัครใหม่**
> ให้ล็อกอินบัญชีเดิม แล้วกด "สร้างโปรเจกต์ใหม่" ข้างใน
> เปรียบเทียบง่าย ๆ: ใช้กุญแจดอกเดิมเปิดตึกเดียวกัน แต่เป็นคนละห้อง ของในห้องไม่ปนกัน

### ข้อกำหนด: ระบบนี้ต้องแยกเป็นเอกเทศทุกชั้น

| ชั้น | ต้องแยกยังไง | ห้ามทำเด็ดขาด |
|---|---|---|
| ที่เก็บโค้ด | repository ของตัวเอง | ห้ามใส่ปนในโปรเจกต์อื่น |
| ฐานข้อมูล | Supabase project ใหม่ของตัวเอง | ห้ามสร้างตารางเพิ่มในฐานข้อมูลของระบบอื่น |
| เว็บโฮสต์ | Vercel project ใหม่ของตัวเอง | ห้าม deploy ทับโปรเจกต์เดิม |
| ค่าตั้งค่า | ชุดของตัวเอง แยก Development / Preview / Production | ห้ามยืมคีย์ของระบบอื่นมาใช้ |
| คีย์ส่งอีเมล | API key ใหม่แยกใบ ตั้งชื่อให้รู้ว่าเป็นของระบบนี้ | ห้ามใช้คีย์ใบเดียวกับระบบอื่น |
| ผู้ใช้และรหัสผ่าน | ตารางผู้ใช้ของตัวเอง | ห้ามแชร์ตารางผู้ใช้กับระบบอื่น |

**เหตุผลแบบภาษาคน**

- **พังแยกกัน** — ถ้าระบบอื่นมีคนเข้าพร้อมกันเยอะจนฐานข้อมูลล่ม ระบบจองห้องต้องยังใช้ได้
- **ปิดได้แยกกัน** — วันหนึ่งอยากเลิกใช้ระบบใดระบบหนึ่ง ลบทิ้งได้เลยไม่ลากอีกระบบพัง
- **คีย์รั่วแล้วเสียหายวงแคบ** — คีย์หลุดใบเดียว เพิกถอนใบเดียวจบ
- **กู้คืนง่าย** — ย้อนฐานข้อมูลกลับไปเมื่อวานได้โดยไม่ลากข้อมูลระบบอื่นย้อนตาม

### ชื่อทรัพยากรที่แนะนำ (naming convention)

| สภาพแวดล้อม | Supabase project | Vercel environment | โดเมน |
|---|---|---|---|
| Development | `tnn-meeting-dev` | Development (เครื่องตัวเอง) | `localhost:3000` |
| Staging | `tnn-meeting-staging` | Preview | `meeting-staging.example.com` |
| Production | `tnn-meeting-prod` | Production | `meeting.example.com` |

> **เริ่มต้นแบบประหยัด:** ถ้างบจำกัด ให้ทำ Development + Production ก่อน (2 โปรเจกต์ Supabase)
> แล้วเพิ่ม Staging ทีหลังได้ โดยไม่ต้องแก้โค้ด

### Free tier และจุดที่จะเริ่มมีค่าใช้จ่าย

| บริการ | Free tier ให้เท่าไร | จุดที่จะเริ่มเสียเงิน | สิ่งที่ควรตั้ง alert |
|---|---|---|---|
| Supabase | ฐานข้อมูล 500 MB, โปรเจกต์หยุดเองถ้าไม่มีใครใช้ 7 วัน | ต้องการ backup ย้อนเวลา (PITR) หรือข้อมูลเกิน 500 MB → Pro | ขนาดฐานข้อมูล, จำนวน connection |
| Vercel | 100 GB bandwidth/เดือน | ใช้ในเชิงพาณิชย์ต้องใช้ Pro ตามเงื่อนไขของ Vercel | Bandwidth, จำนวน function invocation |
| Resend | 3,000 ฉบับ/เดือน, 100 ฉบับ/วัน | ส่งเกินโควตา | จำนวนอีเมลที่ส่ง, อัตราตีกลับ (bounce) |
| LINE Messaging API | ข้อความฟรีจำนวนจำกัดต่อเดือน | ส่งเกินโควตาของแพ็กเกจ | จำนวนข้อความที่ส่ง |

> ⚠️ **อย่าออกแบบให้ระบบผูกกับ Free tier** เช่นอย่าพึ่งว่าโปรเจกต์จะไม่หยุดทำงาน
> ถ้าจะใช้งานจริงกับพนักงานทั้งองค์กร ควรวางแผนขึ้นแพ็กเกจที่มี backup ย้อนเวลา

---

## ส่วนที่ 1 — เตรียม Repository บน GitHub

**ทำที่ไหน:** <https://github.com/new>

| ช่อง | ใส่ว่า | หมายเหตุ |
|---|---|---|
| Repository name | `tnn-meeting` (หรือชื่อที่คุณใช้จริง) | ห้ามเว้นวรรค ใช้ขีดกลาง |
| Description | `ระบบจองห้องประชุม TNN` | ไม่บังคับ |
| Public / Private | **Private** | ระบบภายในองค์กร ไม่ควรให้คนนอกเห็นโค้ด |
| Add a README | ติ๊กถูก | |
| Add .gitignore | เลือก **Node** | กันไฟล์รหัสผ่านหลุดขึ้นเว็บ |

กด **Create repository**

**ถ้าสำเร็จจะเห็น:** หน้า repository ของคุณ พร้อมไฟล์ `README.md`

**ตั้งค่าความปลอดภัยของ repository** (Settings ของ repository)

1. **Branches → Add branch protection rule**
   - Branch name pattern: `main`
   - ติ๊ก *Require a pull request before merging*
   - ติ๊ก *Require status checks to pass* (เลือก check ของ Vercel เมื่อเชื่อมแล้ว)
2. **Code security → Secret scanning** → เปิด (Enable)
3. **Code security → Dependabot alerts** → เปิด

**ถ้าพัง:** ถ้าขึ้นว่า *"The repository already exists"* แปลว่ามีชื่อนี้อยู่แล้ว
เปลี่ยนเป็น `tnn-meeting-room` แล้วจำชื่อที่ใช้จริงไว้ใช้ในขั้นถัดไป

---

## ส่วนที่ 2 — สร้างฐานข้อมูลบน Supabase

### 2.1 สร้างโปรเจกต์

**ทำที่ไหน:** <https://supabase.com/dashboard>

1. กด **New project**
2. กรอกตามนี้

| ช่อง | ใส่ว่า | เหตุผล |
|---|---|---|
| Organization | เลือกองค์กรของคุณ | |
| Name | `tnn-meeting-prod` | ให้รู้ทันทีว่าเป็นของระบบนี้และเป็น production |
| Database Password | กด **Generate a password** แล้วกด **Copy** | **เก็บไว้ในที่ปลอดภัยทันที — Supabase จะไม่แสดงอีก** |
| Region | **Southeast Asia (Singapore)** `ap-southeast-1` | ใกล้ผู้ใช้ในไทยที่สุด ทำให้เว็บเร็ว |
| Pricing plan | Free เพื่อทดลอง / Pro เมื่อใช้งานจริง | Pro ให้ backup ย้อนเวลาได้ |

3. กด **Create new project** แล้วรอประมาณ 2 นาที

**ถ้าสำเร็จจะเห็น:** หน้า Project overview และสถานะโปรเจกต์เป็นสีเขียว

**ถ้าพัง:** ถ้าค้างเกิน 5 นาที ให้ refresh หน้าเว็บ ถ้ายังไม่ขึ้นให้ลบโปรเจกต์แล้วสร้างใหม่
โดยเลือก region เดิม

### 2.2 เก็บค่าที่ต้องใช้

**ทำที่ไหน:** Project Settings (ไอคอนเฟือง) → **Data API** และ **Database**

จดค่าเหล่านี้ใส่ที่เก็บความลับขององค์กร (password manager)

| สิ่งที่ต้องเก็บ | หาได้ที่ | นำไปใส่ที่ตัวแปร | เปิดเผยต่อ browser ได้ไหม |
|---|---|---|---|
| Project URL | Settings → Data API | `NEXT_PUBLIC_SUPABASE_URL` (ยังไม่ใช้ในรุ่นนี้) | ได้ |
| Connection string — **Transaction pooler** | Settings → Database → Connection string → เลือกแท็บ **Transaction pooler** | `DATABASE_URL` | **ไม่ได้ (ความลับ)** |
| Connection string — **Session mode** | แท็บ **Session pooler** หรือ **Direct connection** | `DIRECT_URL` | **ไม่ได้ (ความลับ)** |

> ⚠️ **จุดที่พลาดกันมากที่สุดในโปรเจกต์นี้**
>
> - `DATABASE_URL` ที่เว็บใช้ **ต้องเป็นเส้น Transaction pooler พอร์ต 6543**
>   หน้าตาแบบนี้: `postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
>   ถ้าใช้พอร์ต 5432 บน Vercel จะเปิด connection เต็มโควตาแล้วเว็บล่มตอนคนเข้าพร้อมกัน
> - `DIRECT_URL` (พอร์ต 5432) ใช้เฉพาะรัน migration บนเครื่องตัวเอง **ห้ามใส่ใน Vercel**
>
> ในทั้งสองเส้น ให้แทนคำว่า `[YOUR-PASSWORD]` ด้วยรหัสผ่านฐานข้อมูลที่คุณ copy ไว้ในขั้น 2.1

### 2.3 รัน migration และใส่ข้อมูลตั้งต้น

**ทำที่ไหน:** Terminal บนเครื่องของคุณ ในโฟลเดอร์โปรเจกต์

```bash
# 1) เตรียมไฟล์ตั้งค่า
cp .env.example .env.local

# 2) เปิดไฟล์ .env.local แล้วเติมสองค่านี้ (ใส่ค่าจริงจากขั้น 2.2)
#    DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@...pooler.supabase.com:6543/postgres
#    DIRECT_URL=postgresql://postgres.xxxx:PASSWORD@...pooler.supabase.com:5432/postgres
#    DATABASE_SSL=true
#    AUTH_SECRET=<ผลลัพธ์ของคำสั่ง openssl rand -base64 48>

# 3) สร้างตารางทั้งหมด
npm run db:migrate

# 4) ตรวจว่ารันครบ
npm run db:migrate -- --status
```

**ถ้าสำเร็จจะเห็น:**

```
✔ สำเร็จ 001_foundation
...
✔ สำเร็จ 007_rbac_force_rls
✔ รัน migration สำเร็จ 7 ไฟล์
```

**ตรวจอีกชั้นที่หน้าเว็บ Supabase:** Table Editor → ต้องเห็นตาราง `bookings`, `rooms`,
`profiles`, `audit_logs` และอื่น ๆ

**ถ้าพัง**

| ข้อความที่เห็น | สาเหตุ | วิธีแก้ |
|---|---|---|
| `connect ECONNREFUSED` | connection string ผิด หรือเน็ตบล็อกพอร์ต | copy connection string ใหม่จาก Dashboard ตรวจว่าแทนรหัสผ่านแล้ว |
| `password authentication failed` | รหัสผ่านฐานข้อมูลผิด | Settings → Database → **Reset database password** แล้วแก้ทั้ง `DATABASE_URL` และ `DIRECT_URL` |
| `self signed certificate` | ยังไม่ได้เปิด SSL | ตั้ง `DATABASE_SSL=true` ใน `.env.local` |
| `permission denied for schema public` | ใช้ connection string ของบทบาทที่สิทธิ์น้อย | ใช้เส้นของผู้ใช้ `postgres` ตามที่ Dashboard ให้มา |

**ถ้าต้องย้อนกลับ:** `npm run db:rollback` (ย้อน 1 ขั้น) — ดูรายละเอียดใน
[runbooks.md](runbooks.md#migration-runbook)

### 2.4 สร้างบัญชีผู้ดูแลระบบคนแรก

ระบบยังไม่มีผู้ใช้เลย ทำตามนี้

```bash
# ใส่ข้อมูลตัวอย่างและบัญชีทดสอบ (เฉพาะ development / staging)
npm run db:seed
```

**สำหรับ production ห้าม seed ข้อมูลตัวอย่าง** ให้ทำแบบนี้แทน

1. เปิดเว็บที่ deploy แล้ว ไปหน้า **สร้างบัญชี** แล้วสมัครด้วยอีเมลองค์กรของผู้ดูแลระบบ
2. ยืนยันอีเมลจากลิงก์ที่ได้รับ
3. เปิด Supabase → **SQL Editor** → รันคำสั่งนี้ (แก้อีเมลเป็นของคุณ)

```sql
-- ยกสิทธิ์ผู้ดูแลระบบสูงสุดให้บัญชีแรก
insert into user_roles (profile_id, role_code, scope_type)
select p.id, 'super_admin', 'organization'
from profiles p
where lower(p.email) = lower('admin@tnnthailand.com')
on conflict do nothing;

-- ตรวจผล
select p.email, ur.role_code from profiles p
join user_roles ur on ur.profile_id = p.id;
```

**ถ้าสำเร็จจะเห็น:** อีเมลของคุณคู่กับ `super_admin` และเมื่อ refresh หน้าเว็บจะเห็นเมนู
"ผู้ดูแลระบบ" ในเมนูโปรไฟล์

### 2.5 ตั้งค่า Backup

**ทำที่ไหน:** Supabase → Settings → **Database** → หัวข้อ Backups

| แพ็กเกจ | สิ่งที่ได้ | สิ่งที่ต้องทำเพิ่ม |
|---|---|---|
| Free | ไม่มี backup อัตโนมัติ | ตั้งเวลา export เองสัปดาห์ละครั้ง (ดู runbooks) |
| Pro | Backup รายวัน ย้อนได้ 7 วัน | เปิด **Point in Time Recovery** ถ้าต้องการย้อนถึงระดับนาที |

**บันทึกไว้ในเอกสารขององค์กร**

- RPO (ยอมเสียข้อมูลย้อนหลังได้กี่นาที): แนะนำไม่เกิน 24 ชั่วโมงสำหรับ Free, 5 นาทีสำหรับ Pro+PITR
- RTO (ต้องกู้คืนเสร็จภายในกี่ชั่วโมง): แนะนำไม่เกิน 4 ชั่วโมง
- ผู้รับผิดชอบการกู้คืน: ระบุชื่อและเบอร์ติดต่อ

**ต้องทดสอบ restore จริงอย่างน้อยปีละครั้ง** ไม่ใช่แค่เปิดฟีเจอร์ไว้
ขั้นตอนอยู่ใน [runbooks.md](runbooks.md#backup-และ-restore-runbook)

---

## ส่วนที่ 3 — Deploy บน Vercel

### 3.1 สร้างโปรเจกต์

**ทำที่ไหน:** <https://vercel.com/new>

1. กด **Import Git Repository** แล้วเลือก repository ของคุณ
   (ถ้าไม่เห็น กด **Adjust GitHub App Permissions** เพื่ออนุญาต repository นี้)
2. ตั้งค่าตามนี้

| ช่อง | ใส่ว่า |
|---|---|
| Project Name | `tnn-meeting` |
| Framework Preset | **Next.js** (ระบบตรวจให้อัตโนมัติ) |
| Root Directory | `./` (ค่าเริ่มต้น) |
| Build Command | `npm run build` (ค่าเริ่มต้น) |
| Install Command | `npm install` (ค่าเริ่มต้น) |
| Output Directory | ปล่อยว่าง (Next.js จัดการเอง) |

3. **ยังไม่ต้องกด Deploy** ให้กางหัวข้อ **Environment Variables** ก่อน แล้วทำขั้น 3.2

### 3.2 ใส่ Environment Variables

ใส่ตัวแปรตามตารางนี้ โดยเลือก environment ให้ถูก
(รายละเอียดครบทุกตัวอยู่ใน [env-matrix.md](env-matrix.md))

| ชื่อตัวแปร | ค่า | Environment |
|---|---|---|
| `APP_ENV` | `production` | Production |
| `APP_ENV` | `preview` | Preview |
| `APP_TIMEZONE` | `Asia/Bangkok` | ทั้งหมด |
| `NEXT_PUBLIC_APP_URL` | `https://meeting.example.com` | Production |
| `NEXT_PUBLIC_APP_URL` | `https://meeting-staging.example.com` | Preview |
| `DATABASE_URL` | เส้น **Transaction pooler พอร์ต 6543** | Production / Preview (คนละฐานข้อมูล) |
| `DATABASE_SSL` | `true` | ทั้งหมด |
| `DATABASE_POOL_MAX` | `5` | ทั้งหมด |
| `AUTH_SECRET` | ผลของ `openssl rand -base64 48` (คนละค่าต่อ environment) | ทั้งหมด |
| `AUTH_SESSION_HOURS` | `12` | ทั้งหมด |
| `AUTH_ALLOW_SELF_REGISTER` | `false` เมื่อเปิดใช้จริง | Production |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | `tnnthailand.com` (โดเมนอีเมลองค์กรของคุณ) | Production |
| `EMAIL_PROVIDER` | `resend` | Production |
| `EMAIL_API_KEY` | คีย์จากขั้นที่ 4 | Production / Preview (คนละใบ) |
| `EMAIL_FROM` | `TNN Meeting <no-reply@notify.example.com>` | ทั้งหมด |
| `EMAIL_REPLY_TO` | อีเมลที่มีคนดูแลจริง | ทั้งหมด |
| `EMAIL_WEBHOOK_SECRET` | ค่าจากขั้นที่ 4.5 | Production |
| `LINE_PROVIDER` | `messaging-api` | Production |
| `LINE_CHANNEL_SECRET` | ค่าจากขั้นที่ 5 | Production |
| `LINE_CHANNEL_ACCESS_TOKEN` | ค่าจากขั้นที่ 5 | Production |
| `CRON_SECRET` | ผลของ `openssl rand -hex 32` | ทั้งหมด |
| `LOG_LEVEL` | `info` | ทั้งหมด |
| `RELEASE_VERSION` | `v1.0.0` (อัปเดตทุกครั้งที่ปล่อยเวอร์ชัน) | ทั้งหมด |

> ❌ **ห้ามใส่ `DIRECT_URL` ใน Vercel** ตัวแปรนี้เป็นเส้นพอร์ต 5432
> ใช้เฉพาะรัน migration จากเครื่องตัวเอง ถ้าใส่ใน Vercel เสี่ยงมีโค้ดเผลอใช้แล้ว connection เต็ม
>
> 📌 **ทุกครั้งที่แก้ Environment variable ต้องกด Redeploy** ค่าใหม่จะไม่มีผลกับ deployment เดิม

### 3.3 ตั้ง Region ให้ใกล้ผู้ใช้

ไฟล์ `vercel.json` ในโปรเจกต์กำหนด `"regions": ["sin1"]` ไว้แล้ว (สิงคโปร์)
ถ้าต้องการเปลี่ยน ให้แก้ที่ไฟล์นี้ ไม่ต้องตั้งในหน้าเว็บ

**ตรวจว่าผ่าน:** หลัง deploy ไปที่ Deployment → Functions จะเห็น region เป็น `sin1`

### 3.4 Deploy ครั้งแรกและตรวจผล

กด **Deploy** แล้วรอ 2–4 นาที

**ถ้าสำเร็จจะเห็น:** หน้าจอ Congratulations พร้อม URL แบบ `tnn-meeting.vercel.app`

ตรวจทีละข้อ

```bash
# 1) ระบบตอบสนองและต่อฐานข้อมูลได้
curl https://tnn-meeting.vercel.app/api/health
# ต้องได้: {"status":"ok","database":"ok",...}

# 2) หน้าเข้าสู่ระบบเปิดได้
curl -o /dev/null -w "%{http_code}\n" https://tnn-meeting.vercel.app/login
# ต้องได้: 200
```

**ถ้าพัง**

| อาการ | สาเหตุที่พบบ่อย | วิธีแก้ |
|---|---|---|
| Build ล้มเหลว | TypeScript error | รัน `npm run build` บนเครื่องก่อน push ทุกครั้ง |
| `/api/health` ตอบ 503 | `DATABASE_URL` ผิด หรือลืม `DATABASE_SSL=true` | ตรวจค่าใน Settings → Environment Variables แล้ว Redeploy |
| `ตั้งค่า Environment variable ไม่ครบ` | ลืมตัวแปรบังคับ เช่น `AUTH_SECRET` | ข้อความ error จะบอกชื่อตัวแปรที่ขาด ใส่ให้ครบแล้ว Redeploy |
| หน้าเว็บขึ้นแต่ล็อกอินไม่ได้ | ยังไม่ได้รัน migration บนฐานข้อมูลนี้ | กลับไปทำขั้น 2.3 |

### 3.5 เปิด Deployment Protection สำหรับ Preview

**ทำที่ไหน:** Project Settings → **Deployment Protection**

เปิด **Vercel Authentication** สำหรับ Preview deployments เพื่อไม่ให้คนนอกเปิด staging
ที่มีข้อมูลภายในองค์กรได้

### 3.6 ตรวจว่า Cron ถูกตั้งแล้ว

**ทำที่ไหน:** Project → **Cron Jobs**

ต้องเห็นสองรายการ (มาจาก `vercel.json` โดยอัตโนมัติ)

| Path | ตาราง | ทำอะไร |
|---|---|---|
| `/api/cron/dispatch` | ทุก 5 นาที | ส่งอีเมล/LINE ที่อยู่ในคิว |
| `/api/cron/maintenance` | ทุก 10 นาที | ปล่อยห้องที่ไม่เช็กอิน ปิดงานที่ผ่านไปแล้ว จัดการคิวรอ ล้างข้อมูลหมดอายุ |

**ทดสอบด้วยมือ**

```bash
curl -H "authorization: Bearer <CRON_SECRET ของคุณ>" \
     https://meeting.example.com/api/cron/dispatch
# ต้องได้: {"claimed":0,"sent":0,...}
```

**ถ้าเรียกโดยไม่ใส่ header ต้องได้ 403** — ถ้าได้ 200 แปลว่ายังไม่ได้ตั้ง `CRON_SECRET`
ให้ไปตั้งทันที

---

## ส่วนที่ 4 — ตั้งค่าอีเมล (Resend)

### 4.1 ทำไมต้องใช้ subdomain แยก

ส่งอีเมลระบบจากโดเมนย่อยเช่น `notify.example.com` แทนโดเมนหลัก เพื่อว่าถ้าอีเมลระบบ
ถูกรายงานเป็นสแปม จะไม่กระทบชื่อเสียงอีเมลของพนักงานที่ใช้โดเมนหลัก

### 4.2 เพิ่มโดเมน

**ทำที่ไหน:** <https://resend.com/domains> → กด **Add Domain**

1. Domain: `notify.example.com`
2. Region: เลือกที่ใกล้ที่สุดที่ Resend รองรับ
3. กด **Add**

Resend จะแสดง DNS record ที่ต้องเพิ่ม (โดยทั่วไปคือ DKIM แบบ TXT/CNAME, SPF TXT และ DMARC)

> ⚠️ **ห้ามเดาค่า** ให้ copy ค่าจากหน้า Dashboard ณ เวลาติดตั้งเสมอ
> เพราะค่า DKIM selector และ verification ต่างกันในแต่ละโปรเจกต์

### 4.3 เพิ่ม DNS record

ทำตาม [dns-sheet.md](dns-sheet.md) ส่วน "อีเมล" แล้วกลับมากด **Verify DNS Records**

**ถ้าสำเร็จจะเห็น:** สถานะโดเมนเป็น **Verified** (สีเขียว) ทุกรายการ

**ถ้าพัง:** DNS ใช้เวลากระจาย 5 นาทีถึง 48 ชั่วโมง ตรวจด้วย

```bash
dig +short TXT resend._domainkey.notify.example.com
dig +short TXT notify.example.com     # ต้องเห็น v=spf1 ...
dig +short TXT _dmarc.notify.example.com
```

ถ้ายังไม่เห็นค่า ให้ตรวจว่าใส่ชื่อ host ถูกต้อง (ผู้ให้บริการ DNS บางรายเติมโดเมนต่อท้ายให้เอง
ทำให้กลายเป็น `resend._domainkey.notify.example.com.example.com` ซึ่งผิด)

### 4.4 สร้าง API key แยกต่อ environment

**ทำที่ไหน:** <https://resend.com/api-keys> → **Create API Key**

| ช่อง | Production | Preview/Staging |
|---|---|---|
| Name | `tnn-meeting-prod` | `tnn-meeting-staging` |
| Permission | **Sending access** เท่านั้น | Sending access |
| Domain | `notify.example.com` | `notify.example.com` |

copy ค่าแล้วนำไปใส่ `EMAIL_API_KEY` ใน Vercel **แยกคนละใบต่อ environment**
Resend แสดงค่าเต็มครั้งเดียว ถ้าพลาดให้สร้างใบใหม่และลบใบเก่า

### 4.5 ตั้ง Webhook รับ bounce และ complaint

**ทำที่ไหน:** <https://resend.com/webhooks> → **Add Webhook**

| ช่อง | ใส่ว่า |
|---|---|
| Endpoint URL | `https://meeting.example.com/api/webhooks/email` |
| Events | `email.bounced`, `email.complained` |

copy **Signing Secret** ไปใส่ตัวแปร `EMAIL_WEBHOOK_SECRET` ใน Vercel แล้ว Redeploy

ระบบจะใส่อีเมลที่ตีกลับหรือร้องเรียนลงรายการระงับการส่งอัตโนมัติ
ดูจำนวนได้ที่หน้า **ผู้ดูแลระบบ → สถานะระบบ**

### 4.6 ทดสอบการส่งจริง

1. เปิดเว็บ → หน้าโปรไฟล์ → เปิดรับแจ้งเตือนทางอีเมล
2. จองห้องหนึ่งรายการ
3. รอ Cron รอบถัดไป หรือเรียกด้วยมือ:
   `curl -H "authorization: Bearer <CRON_SECRET>" https://meeting.example.com/api/cron/dispatch`
4. ตรวจกล่องจดหมาย

**ต้องทดสอบกับอย่างน้อย 3 ปลายทาง:** Gmail, Outlook/Microsoft 365 และอีเมลองค์กร
โดยตรวจว่า

- ไม่เข้า Junk/Spam
- ภาษาไทยไม่เป็นตัวต่างดาว
- ปุ่มในอีเมลกดได้และลิงก์ถูกต้อง
- ไฟล์ปฏิทิน `.ics` เปิดแล้วเวลาตรง (ต้องตรงกับเวลาไทย)
- เปิดบนมือถือแล้วอ่านได้ ไม่ต้องเลื่อนซ้ายขวา

**ถ้าอีเมลไม่ออก:** ไปที่หน้า **ผู้ดูแลระบบ → สถานะระบบ** ดูหัวข้อ "ความผิดพลาดล่าสุด"
จะเห็นสาเหตุจริงจากผู้ให้บริการ และกด "ลองส่งใหม่" ได้

---

## ส่วนที่ 5 — ตั้งค่า LINE Messaging API

> บรีฟกำหนดให้ใช้ **LINE Messaging API** ไม่ใช่ LINE Notify (ซึ่งปิดให้บริการแล้ว)

### 5.1 สร้าง Channel

**ทำที่ไหน:** <https://developers.line.biz/console/>

1. ล็อกอินด้วยบัญชี LINE ขององค์กร (ไม่ใช่บัญชีส่วนตัวของพนักงานคนเดียว)
2. สร้างหรือเลือก **Provider** ขององค์กร
3. กด **Create a new channel** → เลือก **Messaging API**
4. กรอกข้อมูล

| ช่อง | ใส่ว่า |
|---|---|
| Channel name | `TNN Meeting` |
| Channel description | `แจ้งเตือนการจองห้องประชุม` |
| Category / Subcategory | เลือกที่ใกล้เคียงที่สุด |
| Email address | อีเมลผู้ดูแลระบบ |

5. เปิด **MFA** ให้บัญชีเจ้าของ และเพิ่มผู้ดูแลสำรองอย่างน้อยหนึ่งคน
   (อย่าให้บัญชีเดียวเป็นเจ้าของ production คนเดียว)

### 5.2 เก็บค่าที่ต้องใช้

| สิ่งที่ต้องเก็บ | หาได้ที่ | ตัวแปร |
|---|---|---|
| Channel secret | แท็บ **Basic settings** | `LINE_CHANNEL_SECRET` |
| Channel access token (long-lived) | แท็บ **Messaging API** → กด **Issue** | `LINE_CHANNEL_ACCESS_TOKEN` |

**ทั้งสองค่าเป็นความลับ** ห้ามใส่ในโค้ดหรือฝั่ง client

### 5.3 ตั้ง Webhook

**ทำที่ไหน:** แท็บ **Messaging API**

| ช่อง | ใส่ว่า |
|---|---|
| Webhook URL | `https://meeting.example.com/api/webhooks/line` |
| Use webhook | **เปิด** |
| Auto-reply messages | **ปิด** |
| Greeting messages | ปิดหรือแก้ข้อความให้บอกวิธีเชื่อมบัญชี |

กด **Verify** ข้าง Webhook URL

**ถ้าสำเร็จจะเห็น:** ข้อความ **Success**

**ถ้าพัง**

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `The webhook returned an error` 401 | ยังไม่ได้ใส่ `LINE_CHANNEL_SECRET` ใน Vercel หรือใส่แล้วแต่ยังไม่ Redeploy | ใส่ค่าแล้วกด Redeploy |
| `Request timeout` | ยังไม่ได้ผูกโดเมน หรือ URL พิมพ์ผิด | ตรวจว่า `curl https://meeting.example.com/api/health` ตอบ 200 |
| Verify ผ่านแต่ไม่มีข้อความเข้า | ปิด Use webhook ไว้ | เปิดสวิตช์ Use webhook |

### 5.4 ขั้นตอนเชื่อมบัญชีของผู้ใช้ (ออกแบบให้ไม่ผูกผิดคน)

1. ผู้ใช้เพิ่มบัญชีทางการเป็นเพื่อนใน LINE (จาก QR code ในแท็บ Messaging API)
2. เปิดเว็บ → **โปรไฟล์ → การแจ้งเตือน → ขอรหัสเชื่อมบัญชี**
3. ระบบให้รหัส 8 ตัว **ใช้ครั้งเดียว หมดอายุใน 15 นาที**
4. ผู้ใช้พิมพ์รหัสนั้นในแชตบัญชีทางการ
5. ระบบตอบกลับว่าเชื่อมสำเร็จ และเปิดช่องทาง LINE ให้อัตโนมัติ (ถือเป็นการยินยอมชัดเจน)

**ยกเลิกการเชื่อม:** กด "ยกเลิกการเชื่อม LINE" ในหน้าโปรไฟล์
หรือผู้ใช้บล็อก/เลิกติดตามบัญชีทางการ ระบบจะหยุดส่งให้อัตโนมัติ

### 5.5 เมื่อ token หมดอายุหรือ webhook ล้มเหลว

| เหตุการณ์ | อาการ | วิธีแก้ |
|---|---|---|
| Token ถูกเพิกถอน/หมดอายุ | หน้า สถานะระบบ แสดง error `HTTP 401` ที่ช่องทาง line | ออก token ใหม่ในแท็บ Messaging API → แก้ `LINE_CHANNEL_ACCESS_TOKEN` → Redeploy → กด "ลองส่งใหม่" |
| ส่งถี่เกินโควตา | error `HTTP 429` | ระบบจะ retry แบบ backoff ให้เอง ถ้าเกิดต่อเนื่องให้ลดจำนวนเวลาเตือนต่อคน |
| Webhook ล้ม | ผู้ใช้เชื่อมบัญชีไม่ได้ | ตรวจ `/api/health` และดู Vercel → Logs ของ `/api/webhooks/line` |

---

## ส่วนที่ 6 — โดเมนและ DNS

### 6.1 วางแผนชื่อก่อนลงมือ

| สภาพแวดล้อม | ชื่อที่แนะนำ |
|---|---|
| Production | `meeting.example.com` |
| Staging | `meeting-staging.example.com` |
| อีเมลระบบ | `notify.example.com` |

**บันทึกข้อมูลผู้ถือครองโดเมนไว้ในเอกสารขององค์กร**

| หัวข้อ | ค่า |
|---|---|
| ผู้ให้บริการจดโดเมน (Registrar) | (กรอก) |
| บัญชีที่ใช้ล็อกอิน | (กรอก — ควรเป็นบัญชีองค์กร ไม่ใช่ของพนักงานคนเดียว) |
| วันหมดอายุโดเมน | (กรอก) |
| Auto-renewal | เปิด / ปิด |
| MFA ของบัญชี registrar | เปิด / ปิด (**ต้องเปิด**) |
| ช่องทางกู้คืนบัญชี | (กรอก) |
| ผู้รับผิดชอบ | (ชื่อ + เบอร์) |

### 6.2 สำรอง DNS record เดิมก่อนเปลี่ยนอะไร

**สำคัญมาก** ถ้าเผลอลบ record ของระบบอีเมลองค์กร อีเมลทั้งบริษัทจะล่ม

```bash
# บันทึกค่าเดิมลงไฟล์เก็บไว้ก่อนแก้
for type in A AAAA CNAME MX TXT NS CAA; do
  echo "=== $type ==="
  dig +short $type example.com
done | tee dns-backup-$(date +%F).txt
```

จดลงตารางใน [dns-sheet.md](dns-sheet.md) ให้ครบก่อนเปลี่ยน

### 6.3 ลด TTL ล่วงหน้า

ก่อนย้ายโดเมน 24–48 ชั่วโมง ให้ลด TTL ของ record ที่จะเปลี่ยนเป็น `300` วินาที
เพื่อให้ย้อนกลับได้เร็วถ้ามีปัญหา เสร็จงานแล้วค่อยปรับกลับเป็น `3600`

### 6.4 เพิ่ม Custom Domain ใน Vercel

**ทำที่ไหน:** Vercel Project → Settings → **Domains** → **Add**

1. พิมพ์ `meeting.example.com` แล้วกด **Add**
2. Vercel จะแสดงค่าที่ต้องไปตั้งใน DNS — **ใช้ค่าที่หน้าจอแสดง ห้ามเดา**
3. ไปเพิ่ม record ที่ผู้ให้บริการ DNS ตาม [dns-sheet.md](dns-sheet.md)
4. กลับมาที่ Vercel รอสถานะเปลี่ยนเป็น **Valid Configuration** (ปกติ 1–30 นาที)
5. รอ SSL certificate ออกให้เอง สถานะจะขึ้น **Certificate Issued**

**ถ้าใช้ Cloudflare เป็น DNS:** ตั้ง record ที่ชี้ไป Vercel เป็น **DNS only (ไม่ Proxied)**
ตามคำแนะนำปัจจุบันของ Vercel เพราะถ้าเปิด Proxy ทั้งสองชั้นจะออก certificate ซ้อนกัน
และ Vercel ตรวจ domain ไม่ผ่าน

### 6.5 บังคับ host หลักเพียงแบบเดียว

ใน Vercel → Domains ให้ตั้งให้ `www.meeting.example.com` **Redirect** ไป
`meeting.example.com` (หรือกลับกันก็ได้ แต่ต้องเลือกอย่างเดียว)
เพื่อไม่ให้เกิด URL ซ้ำสองแบบซึ่งทำให้ cookie และลิงก์ในอีเมลสับสน

### 6.6 ตรวจสอบผล

```bash
# ชี้ไป Vercel ถูกต้อง
dig +short CNAME meeting.example.com

# HTTPS ใช้งานได้และ header ความปลอดภัยครบ
curl -sI https://meeting.example.com | grep -iE "^(HTTP|strict-transport|content-security|x-frame)"

# ระบบตอบสนอง
curl -s https://meeting.example.com/api/health
```

**ถ้าสำเร็จจะเห็น:** `HTTP/2 200`, มี `strict-transport-security`,
`content-security-policy` และ `x-frame-options: DENY`

**ถ้าพัง:** ดู [troubleshooting.md](troubleshooting.md) หัวข้อ "DNS pending" และ "SSL pending"

### 6.7 แผนย้อนกลับ DNS

| หัวข้อ | ต้องกรอกก่อนเปลี่ยน |
|---|---|
| ค่าเดิมของทุก record ที่จะแก้ | (จากไฟล์ backup ขั้น 6.2) |
| ผู้อนุมัติการเปลี่ยน | (ชื่อ) |
| วันเวลาที่เปลี่ยน | (กรอก) |
| เกณฑ์ตัดสินใจย้อนกลับ | เช่น เว็บเปิดไม่ได้เกิน 15 นาที หรืออีเมลองค์กรส่งไม่ออก |
| วิธีย้อนกลับ | นำค่าเดิมกลับไปใส่ (TTL 300 จึงกลับมาเร็ว) แล้วแจ้งผู้ใช้ |

---

## ส่วนที่ 7 — ตั้งค่าระบบในหน้าเว็บ

หลัง deploy สำเร็จและมีบัญชีผู้ดูแลระบบแล้ว เข้าเว็บแล้วทำตามลำดับนี้
(ดูรายละเอียดใน [admin-guide.md](admin-guide.md))

1. **ผู้ดูแลระบบ → จัดการห้อง** — เพิ่มห้องประชุมจริงทั้งหมด
   ตั้งความจุ เวลาทำการ อุปกรณ์ และนโยบายรายห้อง
2. กำหนดว่าห้องไหน **ต้องขออนุมัติ** และใครเป็นผู้อนุมัติ
3. **ผู้ดูแลระบบ → ผู้ใช้และสิทธิ์** — เชิญผู้ใช้ และกำหนด Role
4. เพิ่ม **วันหยุด** ขององค์กร
5. ทดสอบจองหนึ่งรายการแล้วตรวจว่าอีเมลและ LINE ออกจริง
6. ทำตาม [production-readiness.md](production-readiness.md) ให้ครบทุกข้อ

> ✅ **เพิ่มห้องใหม่ภายหลังไม่ต้องแก้โค้ด** ห้องจะปรากฏในตัวเลือก ค้นหา และปฏิทินทันที

---

## ส่วนที่ 8 — ความปลอดภัยของ Infrastructure

### 8.1 บัญชีและสิทธิ์

- เปิด **MFA** ทุกบัญชี Owner: GitHub, Supabase, Vercel, Resend, LINE, Registrar
- ใช้บัญชีองค์กรเป็นเจ้าของ production **ห้ามให้บัญชีส่วนตัวของพนักงานคนเดียวเป็นเจ้าของ**
- ให้สิทธิ์เท่าที่จำเป็น (least privilege) และบันทึกรายชื่อผู้มีสิทธิ์ไว้

| บริการ | Owner | Admin | Developer | Viewer |
|---|---|---|---|---|
| GitHub | (กรอก) | (กรอก) | (กรอก) | (กรอก) |
| Supabase | (กรอก) | (กรอก) | — | (กรอก) |
| Vercel | (กรอก) | (กรอก) | (กรอก) | (กรอก) |
| Resend | (กรอก) | (กรอก) | — | — |
| LINE | (กรอก) | (กรอก) | — | — |

### 8.2 การหมุนเวียนและเพิกถอนคีย์ (Secret rotation)

**ทำทุก 6–12 เดือน และทำทันทีเมื่อ**

- พนักงานที่เคยเข้าถึงคีย์พ้นสภาพ
- สงสัยว่าคีย์รั่วไหล (เช่น เผลอ commit, เผลอส่งในแชต)

| คีย์ | วิธีเปลี่ยน | ผลกระทบตอนเปลี่ยน |
|---|---|---|
| `AUTH_SECRET` | สร้างค่าใหม่ → ใส่ใน Vercel → Redeploy | ผู้ใช้ทุกคนต้องล็อกอินใหม่ |
| รหัสผ่านฐานข้อมูล | Supabase → Settings → Database → Reset | ต้องแก้ `DATABASE_URL` ทุก environment แล้ว Redeploy |
| `EMAIL_API_KEY` | สร้างใบใหม่ → ใส่ค่าใหม่ → Redeploy → ลบใบเก่า | ไม่มีผลถ้าทำตามลำดับนี้ |
| `LINE_CHANNEL_ACCESS_TOKEN` | ออก token ใหม่ → ใส่ → Redeploy | ข้อความที่ค้างในคิวจะส่งได้หลัง Redeploy |
| `CRON_SECRET` | สร้างค่าใหม่ → ใส่ → Redeploy | Cron ของ Vercel ใช้ค่าใหม่อัตโนมัติ |
| `EMAIL_WEBHOOK_SECRET` | สร้างที่ Resend → ใส่ → Redeploy | webhook จะล้มชั่วคราวระหว่างรอ Redeploy |

**เมื่อสงสัยว่าคีย์รั่ว** ทำตามลำดับนี้: เพิกถอนคีย์เก่า → สร้างคีย์ใหม่ → Redeploy →
ตรวจ audit log ว่ามีการใช้งานผิดปกติหรือไม่ → บันทึกเหตุการณ์

### 8.3 เครือข่ายและการจำกัดอัตรา

ระบบมีมาให้แล้ว ไม่ต้องตั้งเพิ่ม

- จำกัดอัตราการล็อกอิน (8 ครั้ง/15 นาที ต่ออีเมล และ 24 ครั้ง/15 นาที ต่อ IP)
- จำกัดอัตราการสมัคร (5 ครั้ง/ชั่วโมง ต่อ IP), การค้นหา (120 ครั้ง/นาที), การจอง (30 ครั้ง/5 นาที)
- Security headers และ CSP ตั้งไว้ใน `next.config.ts`
- Cookie เป็น `HttpOnly` + `SameSite=Lax` + `Secure` บน production

ถ้าองค์กรมี WAF หรือ Bot protection อยู่แล้ว ให้เปิดคุ้มครองเส้นทาง `/login`,
`/api/auth/*` และ `/api/search` เพิ่ม

### 8.4 ผู้ติดต่อกรณีฉุกเฉิน

| เรื่อง | ผู้รับผิดชอบ | ช่องทางติดต่อ |
|---|---|---|
| เว็บล่ม | (กรอก) | (กรอก) |
| ฐานข้อมูลล่ม | (กรอก) | (กรอก) |
| คีย์รั่วไหล | (กรอก) | (กรอก) |
| DNS / โดเมน | (กรอก) | (กรอก) |

วิธีปิด API key, หยุดการแจ้งเตือน และ rollback อยู่ใน [runbooks.md](runbooks.md)

---

## ส่วนที่ 9 — Monitoring

### 9.1 Uptime monitor

ตั้งบริการตรวจสอบภายนอก (เช่น UptimeRobot, Better Stack หรือเครื่องมือขององค์กร)

| สิ่งที่ตรวจ | URL | ความถี่ | เงื่อนไขแจ้งเตือน |
|---|---|---|---|
| หน้าเว็บ | `https://meeting.example.com/login` | 5 นาที | ไม่ใช่ 200 สองครั้งติด |
| สุขภาพระบบ + ฐานข้อมูล | `https://meeting.example.com/api/health` | 5 นาที | ไม่ใช่ 200 หรือ `database` ไม่ใช่ `ok` |

### 9.2 สิ่งที่ต้องตั้ง alert

| เรื่อง | ดูจากที่ไหน | เกณฑ์แนะนำ |
|---|---|---|
| งานแจ้งเตือนค้างในคิว | หน้า **สถานะระบบ** | ค้างเกิน 15 นาที |
| งานล้มเหลวถาวร (dead letter) | หน้า **สถานะระบบ** | มากกว่า 0 |
| อีเมลตีกลับ | หน้า **สถานะระบบ** + Resend | อัตราตีกลับเกิน 2% |
| การล็อกอินล้มเหลวผิดปกติ | ตาราง `login_attempts` / audit log | เกิน 50 ครั้ง/ชั่วโมงจากอีเมลเดียว |
| โดเมนใกล้หมดอายุ | Registrar | 60 วันก่อนหมดอายุ |
| ขนาดฐานข้อมูล | Supabase | เกิน 70% ของโควตา |
| ค่าใช้จ่าย | Vercel / Supabase Billing | เกินงบที่ตั้งไว้ |

### 9.3 Log และการปกปิดข้อมูล

ระบบเขียน log แบบ structured JSON และ **ปกปิดค่า** password, token, secret, cookie
และ authorization header ให้อัตโนมัติ IP ถูกเก็บเพียงช่วงเครือข่าย (`203.0.113.0/24`)
ไม่เก็บ IP เต็ม เพื่อลดข้อมูลส่วนบุคคล

ดู log ได้ที่ Vercel → Project → **Logs** (เก็บตามแพ็กเกจของ Vercel)
ส่วน audit log ของการใช้งานอยู่ในหน้า **ผู้ดูแลระบบ → บันทึกการใช้งาน**
และปรับระยะเก็บได้ผ่านค่า `audit.retention_days`

---

## ส่วนที่ 10 — เอกสารที่ต้องส่งมอบให้องค์กร

เมื่อทำครบทุกขั้นแล้ว ให้รวบรวมสิ่งเหล่านี้เก็บไว้ในที่เก็บเอกสารขององค์กร

- [ ] คู่มือฉบับนี้ พร้อมช่อง "(กรอก)" ที่กรอกค่าจริงแล้ว (**ยกเว้นรหัสผ่านและคีย์**)
- [ ] [dns-sheet.md](dns-sheet.md) ที่กรอกค่าจริงแล้ว
- [ ] [env-matrix.md](env-matrix.md) ระบุว่าตัวแปรใดตั้งที่ไหนแล้ว (ไม่ต้องใส่ค่า)
- [ ] [runbooks.md](runbooks.md)
- [ ] [production-readiness.md](production-readiness.md) ที่ติ๊กครบแล้ว พร้อมวันที่ตรวจ
- [ ] รายชื่อผู้มีสิทธิ์ทุกบริการ และวันต่ออายุโดเมน
- [ ] ผลการทดสอบส่งอีเมลไป Gmail / Outlook / อีเมลองค์กร
- [ ] ผลการทดสอบ restore ฐานข้อมูล
