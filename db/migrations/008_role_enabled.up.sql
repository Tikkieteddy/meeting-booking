-- ============================================================
-- 008 — เปิด/ปิดการใช้งานบทบาท (role) ได้จากหน้าผู้ดูแลระบบ
--
-- ที่มา: บางองค์กรยังไม่เปิดใช้บางกระบวนการตั้งแต่วันแรก เช่นยังไม่ใช้
-- การขออนุมัติการจอง จึงไม่ต้องการให้บทบาท "ผู้อนุมัติ" โผล่ในรายการให้เลือก
--
-- ความหมายของ enabled = false
--   * ซ่อนบทบาทนั้นจากรายการให้เลือกตอนเชิญผู้ใช้และตอนแก้สิทธิ์
--   * ผู้ที่ได้รับบทบาทนั้นไว้ก่อนแล้ว ยังใช้สิทธิ์เดิมได้ต่อ (ไม่ตัดสิทธิ์ย้อนหลัง)
--     เพราะการตัดสิทธิ์เงียบ ๆ จะทำให้คนทำงานค้างอยู่กลางทางโดยไม่รู้สาเหตุ
--   * ไม่ได้ปิดตัวกระบวนการอนุมัติ — สวิตช์นั้นอยู่ที่ห้องแต่ละห้อง
--     (คอลัมน์ rooms.requires_approval) คนละเรื่องกัน
-- ============================================================

ALTER TABLE roles ADD COLUMN enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN roles.enabled IS
  'false = ซ่อนจากรายการให้เลือก ผู้ที่ถือบทบาทนี้อยู่แล้วยังใช้สิทธิ์ได้ตามเดิม';

-- super_admin ปิดไม่ได้ ไม่อย่างนั้นจะไม่มีใครเปิดกลับได้เลย
-- employee ปิดไม่ได้ เพราะเป็นบทบาทตั้งต้นของผู้สมัครใหม่ทุกคน
ALTER TABLE roles ADD CONSTRAINT roles_core_always_enabled
  CHECK (enabled OR code NOT IN ('super_admin', 'employee'));

-- ------------------------------------------------------------
-- ชั้นฐานข้อมูล (RLS) — ผู้มีสิทธิ์ role:manage แก้ตารางนี้ได้
--
-- migration 007 ตั้งใจให้ตาราง roles แก้ได้เฉพาะสิทธิ์ระบบ เพื่อกันการยกสิทธิ์
-- ตัวเอง เราจึงเปิดเพิ่มแบบแคบที่สุด: อนุญาตเฉพาะ UPDATE และมี trigger บังคับว่า
-- แก้ได้แค่คอลัมน์ enabled เท่านั้น ส่วน INSERT/DELETE ยังเป็นสิทธิ์ระบบเหมือนเดิม
-- และตาราง role_permissions (ตัวที่ผูกสิทธิ์จริง) ยังแก้ไม่ได้เลย
-- ------------------------------------------------------------
CREATE POLICY roles_toggle_enabled ON roles FOR UPDATE
  USING (app.has_permission('role:manage'))
  WITH CHECK (app.has_permission('role:manage'));

CREATE OR REPLACE FUNCTION app.roles_only_enabled_editable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- งานของระบบ (seed / migration) แก้ได้ทุกคอลัมน์ตามเดิม
  IF app.is_service() THEN
    RETURN NEW;
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.name_th IS DISTINCT FROM OLD.name_th
     OR NEW.name_en IS DISTINCT FROM OLD.name_en
     OR NEW.rank IS DISTINCT FROM OLD.rank
     OR NEW.is_system IS DISTINCT FROM OLD.is_system
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    RAISE EXCEPTION 'แก้ไขได้เฉพาะสถานะเปิด/ปิดใช้งานของบทบาทเท่านั้น';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER roles_only_enabled_editable
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app.roles_only_enabled_editable();
