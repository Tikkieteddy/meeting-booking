# ตาราง Environment Variables

ตัวแปรทั้งหมดที่ระบบใช้ ตัวไหนใส่ที่ไหน ตัวไหนเป็นความลับ
ไฟล์ตัวอย่างที่มีแต่ชื่อกับคำอธิบาย (ไม่มีค่าจริง) อยู่ที่ [`.env.example`](../.env.example)

## วิธีอ่านตาราง

- **เปิดเผยต่อ browser** — ตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` จะถูกฝังลงในไฟล์ JavaScript
  ที่ส่งไปให้เบราว์เซอร์ **ห้ามใส่ความลับในตัวแปรกลุ่มนี้เด็ดขาด**
- **Server only** — ใช้ได้เฉพาะโค้ดฝั่งเซิร์ฟเวอร์ ปลอดภัยที่จะเก็บความลับ
- **บังคับ** — ถ้าไม่ใส่ ระบบจะไม่เริ่มทำงานและแจ้งชื่อตัวแปรที่ขาดให้

## กลุ่ม Application

| ตัวแปร | บังคับ | ขอบเขต | Local | Preview | Production | หมายเหตุ |
|---|---|---|---|---|---|---|
| `APP_ENV` | – | Server | `development` | `preview` | `production` | ใช้กันการรันคำสั่งอันตรายบน production |
| `APP_TIMEZONE` | – | Server | `Asia/Bangkok` | `Asia/Bangkok` | `Asia/Bangkok` | ฐานข้อมูลเก็บ UTC เสมอ ตัวนี้ใช้แสดงผล |
| `NEXT_PUBLIC_APP_URL` | – | **Browser** | `http://localhost:3000` | URL ของ staging | `https://meeting.example.com` | ใช้ประกอบลิงก์ในอีเมล/LINE ถ้าผิดลิงก์จะพาไปผิดที่ |
| `LOG_LEVEL` | – | Server | `debug` | `info` | `info` | `debug` บน production จะทำให้ log เยอะเกินจำเป็น |
| `RELEASE_VERSION` | – | Server | `dev` | commit sha | `v1.0.0` | ติดไปกับทุกบรรทัด log ช่วยตามรอยว่าเวอร์ชันไหนมีปัญหา |

## กลุ่มฐานข้อมูล

| ตัวแปร | บังคับ | ขอบเขต | Local | Preview | Production | หมายเหตุ |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | ✅ | Server (**ความลับ**) | เส้น PostgreSQL บนเครื่อง | เส้น pooler ของ Neon staging | เส้น pooler ของ Neon prod | ★ **ชื่อ host ต้องมี `-pooler`** |
| `DIRECT_URL` | – | Server (**ความลับ**) | เหมือน `DATABASE_URL` | – | – | ★ **ห้ามใส่ใน Vercel** ใช้เฉพาะรัน migration บนเครื่อง (เส้นที่ไม่มี `-pooler`) |
| `DATABASE_SSL` | – | Server | `false` | `true` | `true` | มีผลเฉพาะเมื่อ connection string ไม่มี `sslmode` — สายของ Neon มีอยู่แล้ว ค่านี้จึงเป็นแค่ตัวสำรอง |
| `DATABASE_POOL_MAX` | – | Server | `5` | `5` | `5` | บน serverless ไม่ควรเกิน 5 ต่อ instance |
| `TEST_DATABASE_URL` | – | Server (**ความลับ**) | ฐานข้อมูลที่ชื่อมีคำว่า `test` | – | – | ใช้เฉพาะเทสต์ integration ระบบจะปฏิเสธถ้าชื่อไม่มีคำว่า test |

> **ทำไมต้องแยกสองเส้น**
> เส้นที่ชื่อ host มี `-pooler` วิ่งผ่าน PgBouncer โหมด *transaction* — เหมาะกับ serverless
> ที่เปิด-ปิด connection ถี่ และรับได้หลักพัน connection
> เส้นที่ไม่มี `-pooler` ต่อตรงเข้าฐานข้อมูล รองรับคำสั่ง DDL ของ migration ได้ครบ
> แต่รับ connection ได้ไม่ถึงร้อย
> ถ้าเอาเส้นตรงไปใช้บน Vercel จะเปิด connection ค้างจนเต็มโควตาแล้วเว็บล่มตอนคนเข้าพร้อมกัน

## กลุ่มยืนยันตัวตน

| ตัวแปร | บังคับ | ขอบเขต | Local | Preview | Production | หมายเหตุ |
|---|---|---|---|---|---|---|
| `AUTH_SECRET` | ✅ | Server (**ความลับ**) | ค่าสุ่มอะไรก็ได้ที่ยาวพอ | ค่าสุ่มคนละค่า | ค่าสุ่มคนละค่า | สร้างด้วย `openssl rand -base64 48` เปลี่ยนค่า = ทุกคนต้องล็อกอินใหม่ |
| `AUTH_SESSION_HOURS` | – | Server | `12` | `12` | `12` | อายุเซสชัน (ชั่วโมง) |
| `AUTH_ALLOW_SELF_REGISTER` | – | Server | `true` | `true` | **`false`** | บน production ควรให้ผู้ดูแลระบบเชิญเท่านั้น |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | – | Server | ว่าง | โดเมนองค์กร | โดเมนองค์กร | คั่นด้วยจุลภาค เช่น `tnnthailand.com,tnn16.co.th` |

## กลุ่มอีเมล

| ตัวแปร | บังคับ | ขอบเขต | Local | Preview | Production | หมายเหตุ |
|---|---|---|---|---|---|---|
| `EMAIL_PROVIDER` | – | Server | `log` | `resend` | `resend` | `log` = บันทึกลง log และฐานข้อมูลอย่างเดียว ทดสอบ flow ได้โดยไม่ส่งจริง |
| `EMAIL_API_KEY` | – | Server (**ความลับ**) | – | คีย์ staging | คีย์ production | แยกคนละใบต่อ environment |
| `EMAIL_FROM` | – | Server | อะไรก็ได้ | `TNN Meeting <no-reply@notify.example.com>` | เหมือน staging | ต้องเป็นโดเมนที่ verify กับผู้ให้บริการแล้ว |
| `EMAIL_REPLY_TO` | – | Server | – | อีเมลที่มีคนดูแล | อีเมลที่มีคนดูแล | ห้ามใช้อีเมลที่ไม่มีใครอ่าน |
| `EMAIL_WEBHOOK_SECRET` | – | Server (**ความลับ**) | – | ค่าจาก Resend | ค่าจาก Resend | ใช้ตรวจลายเซ็น webhook bounce/complaint |

## กลุ่ม LINE

| ตัวแปร | บังคับ | ขอบเขต | Local | Preview | Production | หมายเหตุ |
|---|---|---|---|---|---|---|
| `LINE_PROVIDER` | – | Server | `log` | `log` หรือ `messaging-api` | `messaging-api` | |
| `LINE_CHANNEL_SECRET` | – | Server (**ความลับ**) | – | ของ channel ทดสอบ | ของ channel จริง | ใช้ตรวจลายเซ็น webhook |
| `LINE_CHANNEL_ACCESS_TOKEN` | – | Server (**ความลับ**) | – | ของ channel ทดสอบ | ของ channel จริง | ใช้ส่งข้อความ |

> LINE Messaging API ให้ webhook ได้ URL เดียวต่อ channel
> ถ้าต้องการทดสอบบน staging ให้สร้าง channel แยกอีกใบ ไม่ใช้ channel เดียวกับ production

## กลุ่มงานเบื้องหลังและความปลอดภัย

| ตัวแปร | บังคับ | ขอบเขต | Local | Preview | Production | หมายเหตุ |
|---|---|---|---|---|---|---|
| `CRON_SECRET` | – | Server (**ความลับ**) | ค่าอะไรก็ได้ | ค่าสุ่ม | ค่าสุ่ม | สร้างด้วย `openssl rand -hex 32` **ถ้าไม่ตั้ง ระบบจะปฏิเสธการเรียก `/api/cron/*` ทั้งหมด** |
| `SEED_PASSWORD` | – | Server | ตั้งได้ตามสะดวก | – | **ห้ามใช้** | ใช้เฉพาะตอนรัน `npm run db:seed` บนเครื่องพัฒนา |

## เช็กลิสต์ก่อนขึ้น production

- [ ] `DATABASE_URL` เป็นเส้นที่ชื่อ host มี **`-pooler`**
- [ ] **ไม่มี** `DIRECT_URL` ใน Vercel
- [ ] `AUTH_SECRET` เป็นค่าสุ่มคนละค่ากับ staging
- [ ] `APP_ENV=production` และ `NEXT_PUBLIC_APP_URL` เป็นโดเมนจริง
- [ ] `AUTH_ALLOW_SELF_REGISTER=false` และตั้ง `AUTH_ALLOWED_EMAIL_DOMAINS` แล้ว
- [ ] `EMAIL_PROVIDER=resend` และคีย์เป็นใบของ production
- [ ] `LINE_PROVIDER=messaging-api` และใช้ค่าของ channel จริง
- [ ] `CRON_SECRET` ตั้งแล้ว และเรียก `/api/cron/dispatch` โดยไม่ใส่ header ได้ **403**
- [ ] กด **Redeploy** หลังแก้ตัวแปรทุกครั้ง
- [ ] ตรวจว่า bundle ฝั่ง client ไม่มีความลับหลุด:
      `npm run build && grep -ril "service_role\|LINE_CHANNEL\|EMAIL_API_KEY" .next/static | head`
      (ต้องไม่พบไฟล์ใด)
