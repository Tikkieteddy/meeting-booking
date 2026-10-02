-- ย้อน 013 — เลิกล็อกอีเมลที่ชั้นฐานข้อมูล
DROP TRIGGER IF EXISTS profiles_email_locked ON profiles;
DROP FUNCTION IF EXISTS app.profiles_email_locked();
