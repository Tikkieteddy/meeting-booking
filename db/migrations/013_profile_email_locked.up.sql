-- ============================================================
-- 013 — อีเมลของบัญชีแก้ไขไม่ได้โดยเด็ดขาด (ผู้ใช้สั่ง 2 ต.ค. 2569)
--
-- อีเมลเป็นชื่อเข้าสู่ระบบและเป็นตัวจับคู่ผู้เข้าร่วมกับบัญชี ถ้าเปลี่ยนได้
-- คนอื่นอาจสวมบัญชี หรือการแจ้งเตือนไปผิดคน
-- โค้ดไม่มีเส้นทางไหนแก้อีเมลอยู่แล้ว — trigger นี้กันซ้ำที่ฐานข้อมูล
-- เผื่อโค้ดในอนาคตพลาด หรือมีคนสั่ง SQL ตรง (ถ้าจำเป็นจริง ต้องปิด trigger ชั่วคราวโดยตั้งใจ)
-- ============================================================

CREATE OR REPLACE FUNCTION app.profiles_email_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'อีเมลของบัญชีแก้ไขไม่ได้'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'profiles_email_locked';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER profiles_email_locked BEFORE UPDATE OF email ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.profiles_email_locked();
