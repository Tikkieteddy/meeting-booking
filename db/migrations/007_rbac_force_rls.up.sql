-- ============================================================
-- 007 ปิดช่องโหว่การยกระดับสิทธิ์ที่ชั้นฐานข้อมูล
--
-- ปัญหาที่พบจากเทสต์ integration:
--   migration 006 เปิด RLS บนตาราง RBAC (user_roles ฯลฯ) แต่ไม่ได้ FORCE
--   เพราะกลัว policy เรียกวนซ้ำ เมื่อแอปต่อฐานข้อมูลด้วยบัญชี "เจ้าของตาราง"
--   RLS จึงถูกข้ามทั้งหมด ทำให้ผู้ใช้ที่ล็อกอินแล้วสามารถ INSERT แถวใน
--   user_roles เพื่อยกสิทธิ์ตัวเองเป็น super_admin ได้ ถ้ามีโค้ดเส้นใดลืมตรวจสิทธิ์
--
-- วิธีแก้:
--   1. FORCE RLS ทุกตาราง RBAC
--   2. เขียน policy ของ user_roles โดย "ไม่เรียก app.has_permission"
--      (ซึ่งอ่าน user_roles เอง) จึงไม่เกิดการเรียกวนซ้ำ
--        - อ่าน: ดูสิทธิ์ของตัวเองได้เท่านั้น
--        - เขียน: เฉพาะ service context
--      การให้/ถอนสิทธิ์เป็นงานของผู้ดูแลระบบ ซึ่งชั้นแอปตรวจ role:manage
--      บันทึก audit log แล้วจึงยกระดับเป็น service เฉพาะคำสั่งนั้น
--   3. roles / permissions / role_permissions เป็น metadata: อ่านได้ทุกคนที่
--      ล็อกอิน แก้ได้เฉพาะ service (migration และ seed)
--
-- ผลข้างเคียงที่ต้องการ: app.has_permission() ที่ถูกเรียกจาก policy ของตารางอื่น
-- จะอ่าน user_roles ผ่าน policy ใหม่ ซึ่งคืนเฉพาะแถวของผู้ใช้ปัจจุบัน
-- ผลลัพธ์ของการตรวจสิทธิ์จึงยังถูกต้องทุกกรณี
-- ============================================================

ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE room_approvers FORCE ROW LEVEL SECURITY;

-- roles / permissions / role_permissions: อ่านได้ แก้ได้เฉพาะระบบ
DROP POLICY IF EXISTS roles_write ON roles;
CREATE POLICY roles_write ON roles FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

DROP POLICY IF EXISTS permissions_write ON permissions;
CREATE POLICY permissions_write ON permissions FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

DROP POLICY IF EXISTS role_permissions_write ON role_permissions;
CREATE POLICY role_permissions_write ON role_permissions FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

-- user_roles: อ่านของตัวเอง แก้เฉพาะระบบ (ห้ามอ้างอิง app.has_permission)
DROP POLICY IF EXISTS user_roles_read ON user_roles;
DROP POLICY IF EXISTS user_roles_write ON user_roles;

CREATE POLICY user_roles_read_own ON user_roles FOR SELECT
  USING (app.is_service() OR profile_id = app.current_user_id());

CREATE POLICY user_roles_service_write ON user_roles FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());
