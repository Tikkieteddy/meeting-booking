-- ============================================================
-- อัปเดตฐานข้อมูลระบบจองห้องประชุม TNN — migration 013
-- วิธีใช้: เปิด Neon → SQL Editor → วางทั้งไฟล์ → Run
-- ทั้งหมดอยู่ในธุรกรรมเดียว ถ้าพังกลางทางจะไม่มีอะไรเปลี่ยน
-- ============================================================

BEGIN;

-- ยกระดับสิทธิ์เป็นระบบเฉพาะในธุรกรรมนี้ (ทุกตารางบังคับ RLS ไว้)
SELECT set_config('app.user_role', 'service_role', true);

-- ---------- 013_profile_email_locked ----------
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

INSERT INTO schema_migrations (version, name) VALUES ('013', '013_profile_email_locked')
  ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------- ตรวจผล: ทุกแถวต้องขึ้น "ผ่าน" ----------
SELECT set_config('app.user_role', 'service_role', false);
SELECT m.version AS migration,
       CASE WHEN s.version IS NULL THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END AS result
FROM (VALUES ('013')) AS m(version)
LEFT JOIN schema_migrations s ON s.version = m.version
ORDER BY m.version;
