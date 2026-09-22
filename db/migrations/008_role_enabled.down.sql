-- ย้อน 008 — เลิกเปิด/ปิดบทบาท
DROP TRIGGER IF EXISTS roles_only_enabled_editable ON roles;
DROP FUNCTION IF EXISTS app.roles_only_enabled_editable();
DROP POLICY IF EXISTS roles_toggle_enabled ON roles;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_core_always_enabled;
ALTER TABLE roles DROP COLUMN IF EXISTS enabled;
