# ตาราง DNS Record

กรอกเอกสารนี้ **ก่อน** แก้ DNS จริง แล้วเก็บไว้เป็นหลักฐานสำหรับย้อนกลับ

> ⚠️ **ค่าที่ต้องกรอกในช่อง "ค่าเป้าหมาย" ให้ copy จาก Dashboard ของผู้ให้บริการ ณ เวลาติดตั้งเสมอ**
> ห้ามเดา และห้ามลอกจากเอกสารเก่า เพราะค่า verification และ endpoint ต่างกันในแต่ละโปรเจกต์

---

## ขั้นที่ 1 — สำรอง DNS record เดิมทั้งหมด

รันคำสั่งนี้แล้วเก็บผลลัพธ์ไว้

```bash
DOMAIN=example.com
for type in A AAAA CNAME MX TXT NS CAA SRV; do
  echo "=== $type ==="
  dig +short $type $DOMAIN
done | tee dns-backup-$(date +%F).txt
```

### บันทึกค่าเดิม (กรอกก่อนเปลี่ยน)

| Type | Name / Host | ค่าเดิม | TTL เดิม | ใช้ทำอะไร | จะแก้ไหม |
|---|---|---|---|---|---|
| MX | `@` | | | รับอีเมลองค์กร | **ห้ามแก้** |
| TXT | `@` | | | SPF ของอีเมลองค์กร | แก้เฉพาะถ้าจำเป็น |
| TXT | `_dmarc` | | | DMARC | อาจต้องเพิ่ม |
| A / CNAME | `@` | | | เว็บหลักองค์กร | **ห้ามแก้** |
| | | | | | |

---

## ขั้นที่ 2 — ลด TTL ล่วงหน้า

24–48 ชั่วโมงก่อนเปลี่ยน ให้ลด TTL ของ record ที่จะแก้เป็น `300` วินาที
เพื่อให้ย้อนกลับได้เร็ว เสร็จงานแล้วปรับกลับเป็น `3600`

---

## ขั้นที่ 3 — Record ที่ต้องเพิ่มสำหรับเว็บ

| # | Type | Name / Host | ค่าเป้าหมาย (copy จาก Vercel) | TTL | Proxy (ถ้าใช้ Cloudflare) | ผู้ให้บริการ | ตรวจแล้ว |
|---|---|---|---|---|---|---|---|
| 1 | CNAME | `meeting` | (จาก Vercel → Domains) | 300 → 3600 | **DNS only** | | ☐ |
| 2 | CNAME | `meeting-staging` | (จาก Vercel) | 300 → 3600 | **DNS only** | | ☐ |
| 3 | TXT | (ถ้า Vercel ขอ verification) | (จาก Vercel) | 300 | DNS only | | ☐ |

**ถ้าต้องชี้โดเมนหลัก (root domain) เช่น `example.com` เอง**
ผู้ให้บริการ DNS บางรายไม่รองรับ CNAME ที่ root ให้ใช้ **A record** หรือ **ALIAS/ANAME**
ตามค่าที่ Vercel แสดง — ห้ามใช้ IP ที่จำมาจากที่อื่น

**ทำไมต้อง DNS only บน Cloudflare**
Vercel ออกและต่ออายุ SSL certificate เอง ถ้าเปิด Proxy ของ Cloudflare ทับ
จะมี certificate สองชั้นและ Vercel ตรวจ domain ไม่ผ่าน
(ตรวจคำแนะนำล่าสุดของ Vercel อีกครั้งก่อนตั้งค่า)

---

## ขั้นที่ 4 — Record ที่ต้องเพิ่มสำหรับอีเมล

ใช้ subdomain แยกสำหรับอีเมลระบบ (แนะนำ `notify.example.com`) เพื่อไม่ให้กระทบ
ชื่อเสียงการส่งอีเมลของโดเมนหลัก

| # | Type | Name / Host | ค่าเป้าหมาย (copy จาก Resend) | TTL | ตรวจแล้ว |
|---|---|---|---|---|---|
| 4 | TXT | `notify` | `v=spf1 include:...  ~all` | 3600 | ☐ |
| 5 | TXT หรือ CNAME | `resend._domainkey.notify` | (DKIM public key จาก Resend) | 3600 | ☐ |
| 6 | TXT | `_dmarc.notify` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` | 3600 | ☐ |
| 7 | MX | `notify` | (เฉพาะกรณีต้องรับอีเมลที่ subdomain นี้ — ปกติไม่ต้อง) | 3600 | ☐ |

### กฎที่พลาดกันบ่อย

1. **SPF ต้องมี record เดียวต่อหนึ่ง host** ถ้าที่ `notify` มี SPF อยู่แล้ว
   ให้รวม `include:` เข้าไปใน record เดิม **ห้ามสร้าง TXT SPF เพิ่มอีกใบ**
   ผิด: สอง record `v=spf1 include:a ~all` และ `v=spf1 include:b ~all`
   ถูก: หนึ่ง record `v=spf1 include:a include:b ~all`
2. **DMARC เริ่มด้วย `p=none` ก่อน** เพื่อเก็บรายงานดูว่าอะไรส่งในนามโดเมนเราอยู่
   เมื่อมั่นใจแล้วจึงเข้มขึ้นเป็น `p=quarantine` แล้ว `p=reject`
3. **ห้ามแก้ MX ของโดเมนหลัก** เพราะอีเมลพนักงานทั้งบริษัทจะล่มทันที
4. ผู้ให้บริการ DNS บางรายเติมโดเมนต่อท้ายชื่อ host ให้เอง
   ถ้าใส่ `resend._domainkey.notify.example.com` แล้วกลายเป็น
   `resend._domainkey.notify.example.com.example.com` ให้ใส่แค่ `resend._domainkey.notify`

---

## ขั้นที่ 5 — CAA record (ไม่บังคับ)

เพิ่มเฉพาะเมื่อองค์กรมีนโยบายจำกัดผู้ออก certificate

| # | Type | Name | ค่า | หมายเหตุ |
|---|---|---|---|---|
| 8 | CAA | `@` | `0 issue "letsencrypt.org"` | **ต้องใส่ผู้ออกที่ Vercel ใช้ให้ครบ** ไม่อย่างนั้น SSL จะออกไม่ได้ |

> ถ้าไม่แน่ใจ **อย่าใส่ CAA** เพราะใส่ผิดจะทำให้ต่ออายุ certificate ไม่ได้และเว็บล่มในอนาคต

---

## ขั้นที่ 6 — คำสั่งตรวจสอบและวิธีอ่านผล

```bash
# เว็บชี้ไป Vercel แล้ว
dig +short CNAME meeting.example.com
# ผ่าน: ได้ค่าโฮสต์ของ Vercel ตามที่ Dashboard แสดง
# ไม่ผ่าน: ไม่ได้ค่าอะไรเลย = record ยังไม่กระจาย หรือใส่ชื่อ host ผิด

# SPF
dig +short TXT notify.example.com
# ผ่าน: เห็นบรรทัดเดียวที่ขึ้นต้น v=spf1 และมี include ของ Resend
# ไม่ผ่าน: เห็นสองบรรทัดที่ขึ้นต้น v=spf1 = ต้องรวมเป็นบรรทัดเดียว

# DKIM
dig +short TXT resend._domainkey.notify.example.com
# ผ่าน: เห็นค่ายาว ๆ ขึ้นต้น p= หรือ v=DKIM1

# DMARC
dig +short TXT _dmarc.notify.example.com
# ผ่าน: เห็น v=DMARC1; p=...

# MX ของโดเมนหลักยังอยู่ครบ (ตรวจว่าไม่เผลอลบ)
dig +short MX example.com

# HTTPS และ security header
curl -sI https://meeting.example.com | grep -iE "^(HTTP|strict-transport|content-security)"
```

**ถ้าใช้ Windows** ใช้ `nslookup -type=TXT notify.example.com` แทน `dig`

**DNS ใช้เวลากระจาย** ปกติ 5–30 นาที แต่อาจถึง 48 ชั่วโมงตาม TTL เดิมของ record
ถ้าตรวจไม่เจอในช่วงแรกให้รอแล้วลองใหม่ ไม่ต้องรีบแก้ค่าซ้ำ ๆ

---

## ขั้นที่ 7 — แผนย้อนกลับ

| หัวข้อ | ค่า |
|---|---|
| ไฟล์สำรอง record เดิม | `dns-backup-YYYY-MM-DD.txt` |
| ผู้อนุมัติการเปลี่ยน | |
| วันเวลาที่เปลี่ยน | |
| เกณฑ์ตัดสินใจย้อนกลับ | เว็บเปิดไม่ได้เกิน 15 นาที **หรือ** อีเมลองค์กรส่ง/รับไม่ได้ |
| ขั้นตอนย้อนกลับ | 1) นำค่าเดิมจากไฟล์สำรองกลับไปใส่ 2) รอตาม TTL (300 วินาทีถ้าลดไว้แล้ว) 3) ตรวจด้วยคำสั่งในขั้นที่ 6 4) แจ้งผู้ใช้ |
| ผู้ที่ต้องแจ้งเมื่อย้อนกลับ | |
