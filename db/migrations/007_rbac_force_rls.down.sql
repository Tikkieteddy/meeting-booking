DROP POLICY IF EXISTS user_roles_service_write ON user_roles;
DROP POLICY IF EXISTS user_roles_read_own ON user_roles;
CREATE POLICY user_roles_read ON user_roles FOR SELECT
  USING (profile_id = app.current_user_id() OR app.has_permission('user:read'));
CREATE POLICY user_roles_write ON user_roles FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

DROP POLICY IF EXISTS role_permissions_write ON role_permissions;
CREATE POLICY role_permissions_write ON role_permissions FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

DROP POLICY IF EXISTS permissions_write ON permissions;
CREATE POLICY permissions_write ON permissions FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

DROP POLICY IF EXISTS roles_write ON roles;
CREATE POLICY roles_write ON roles FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

ALTER TABLE room_approvers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE roles NO FORCE ROW LEVEL SECURITY;
