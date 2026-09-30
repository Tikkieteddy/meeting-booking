-- ย้อน 010 — กลับไปใช้เวลาเตือนจากค่าตั้งส่วนตัวอย่างเดียว
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_reminder_leads_valid;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_leads;
