-- ============================================================
-- 006 Row Level Security — บรีฟข้อ 8:
-- "ตรวจ Permission ทั้ง UI API และ Database RLS ไม่ใช่เพียงซ่อนปุ่ม"
--
-- หลักการ:
--  * ตารางข้อมูล (bookings, profiles, rooms, notifications, audit) เปิด RLS + FORCE
--    เพื่อให้ policy มีผลแม้แอปต่อฐานข้อมูลด้วยบัญชีเจ้าของตาราง
--  * ตาราง metadata ของ RBAC (roles, permissions, role_permissions, user_roles,
--    room_approvers) เปิด RLS แต่ไม่ FORCE เพราะฟังก์ชันตรวจสิทธิ์ต้องอ่านตารางเหล่านี้
--    ถ้า FORCE ด้วยจะเกิด policy เรียกวนซ้ำ (infinite recursion)
--  * ทุกคำสั่งที่ทำแทนผู้ใช้ต้องผ่าน withTx() ซึ่งตั้ง app.user_id / app.user_role
-- ============================================================

CREATE OR REPLACE FUNCTION app.is_authenticated() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_service() OR app.current_user_id() IS NOT NULL;
$$;

-- ------------------------------------------------------------
-- organizations / app_settings
-- ------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_read ON organizations FOR SELECT USING (app.is_authenticated());
CREATE POLICY organizations_write ON organizations FOR ALL
  USING (app.has_permission('settings:manage')) WITH CHECK (app.has_permission('settings:manage'));

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY app_settings_read ON app_settings FOR SELECT USING (app.is_authenticated());
CREATE POLICY app_settings_write ON app_settings FOR ALL
  USING (app.has_permission('settings:manage')) WITH CHECK (app.has_permission('settings:manage'));

-- ------------------------------------------------------------
-- profiles: เห็นของตัวเองเสมอ ผู้มีสิทธิ์ user:read จึงเห็นของคนอื่น
-- ------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_read ON profiles FOR SELECT
  USING (id = app.current_user_id() OR app.has_permission('user:read'));
CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = app.current_user_id() OR app.has_permission('user:manage'))
  WITH CHECK (id = app.current_user_id() OR app.has_permission('user:manage'));
CREATE POLICY profiles_insert_admin ON profiles FOR INSERT
  WITH CHECK (app.has_permission('user:manage'));
CREATE POLICY profiles_delete_admin ON profiles FOR DELETE
  USING (app.has_permission('user:manage'));

-- ------------------------------------------------------------
-- ตารางลับของระบบยืนยันตัวตน: เข้าถึงได้เฉพาะ service context
-- ------------------------------------------------------------
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY user_credentials_service ON user_credentials FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY user_sessions_service ON user_sessions FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());
CREATE POLICY user_sessions_read_own ON user_sessions FOR SELECT
  USING (profile_id = app.current_user_id());

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_tokens_service ON auth_tokens FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY login_attempts_service ON login_attempts FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_limit_service ON rate_limit_counters FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

-- ------------------------------------------------------------
-- RBAC metadata: เปิด RLS (กันการเรียกตรงจาก API ภายนอก) แต่ไม่ FORCE
-- ------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_read ON roles FOR SELECT USING (app.is_authenticated());
CREATE POLICY roles_write ON roles FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissions_read ON permissions FOR SELECT USING (app.is_authenticated());
CREATE POLICY permissions_write ON permissions FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT USING (app.is_authenticated());
CREATE POLICY role_permissions_write ON role_permissions FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_read ON user_roles FOR SELECT
  USING (profile_id = app.current_user_id() OR app.has_permission('user:read'));
CREATE POLICY user_roles_write ON user_roles FOR ALL
  USING (app.has_permission('role:manage')) WITH CHECK (app.has_permission('role:manage'));

-- ------------------------------------------------------------
-- ห้องและข้อมูลประกอบ: ทุกคนที่ล็อกอินอ่านได้ แก้ไขได้เฉพาะผู้ดูแลตามขอบเขต
-- ------------------------------------------------------------
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings FORCE ROW LEVEL SECURITY;
CREATE POLICY buildings_read ON buildings FOR SELECT USING (app.is_authenticated());
CREATE POLICY buildings_write ON buildings FOR ALL
  USING (app.has_permission('room:manage')) WITH CHECK (app.has_permission('room:manage'));

ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities FORCE ROW LEVEL SECURITY;
CREATE POLICY amenities_read ON amenities FOR SELECT USING (app.is_authenticated());
CREATE POLICY amenities_write ON amenities FOR ALL
  USING (app.has_permission('room:manage')) WITH CHECK (app.has_permission('room:manage'));

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms FORCE ROW LEVEL SECURITY;
CREATE POLICY rooms_read ON rooms FOR SELECT USING (app.is_authenticated());
CREATE POLICY rooms_insert ON rooms FOR INSERT WITH CHECK (app.has_permission('room:manage'));
CREATE POLICY rooms_update ON rooms FOR UPDATE
  USING (app.can_manage_room(id)) WITH CHECK (app.can_manage_room(id));
CREATE POLICY rooms_delete ON rooms FOR DELETE USING (app.is_super_admin());

ALTER TABLE room_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_amenities FORCE ROW LEVEL SECURITY;
CREATE POLICY room_amenities_read ON room_amenities FOR SELECT USING (app.is_authenticated());
CREATE POLICY room_amenities_write ON room_amenities FOR ALL
  USING (app.can_manage_room(room_id)) WITH CHECK (app.can_manage_room(room_id));

ALTER TABLE room_approvers ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_approvers_read ON room_approvers FOR SELECT USING (app.is_authenticated());
CREATE POLICY room_approvers_write ON room_approvers FOR ALL
  USING (app.can_manage_room(room_id)) WITH CHECK (app.can_manage_room(room_id));

ALTER TABLE room_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_closures FORCE ROW LEVEL SECURITY;
CREATE POLICY room_closures_read ON room_closures FOR SELECT USING (app.is_authenticated());
CREATE POLICY room_closures_write ON room_closures FOR ALL
  USING (app.can_manage_room(room_id)) WITH CHECK (app.can_manage_room(room_id));

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays FORCE ROW LEVEL SECURITY;
CREATE POLICY holidays_read ON holidays FOR SELECT USING (app.is_authenticated());
CREATE POLICY holidays_write ON holidays FOR ALL
  USING (app.has_permission('room:manage')) WITH CHECK (app.has_permission('room:manage'));

-- ------------------------------------------------------------
-- bookings
--   อ่าน: ผู้ล็อกอินเห็นการจองทั่วไปเพื่อดูว่าห้องว่างหรือไม่
--         แต่การจองแบบ private เห็นเฉพาะผู้จอง ผู้เข้าร่วม และผู้อนุมัติ/ผู้ดูแลห้อง
--   เขียน: ผู้จองของตัวเอง หรือผู้ดูแล/ผู้อนุมัติห้องนั้น
-- policy ทั้งหมดไม่อ้างอิงตาราง booking_attendees เพื่อเลี่ยง policy เรียกวนซ้ำ
-- ------------------------------------------------------------
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

CREATE POLICY bookings_read ON bookings FOR SELECT USING (
  app.is_service()
  OR booker_profile_id = app.current_user_id()
  OR app.current_user_id() = ANY (attendee_profile_ids)
  OR app.can_approve_room(room_id)
  OR app.has_permission('booking:read_all')
  OR (privacy <> 'private' AND app.current_user_id() IS NOT NULL)
);

CREATE POLICY bookings_insert ON bookings FOR INSERT WITH CHECK (
  app.is_service()
  OR (app.has_permission('booking:create') AND booker_profile_id = app.current_user_id())
  OR app.can_manage_room(room_id)
);

CREATE POLICY bookings_update ON bookings FOR UPDATE USING (
  app.is_service()
  OR booker_profile_id = app.current_user_id()
  OR app.can_approve_room(room_id)
) WITH CHECK (
  app.is_service()
  OR booker_profile_id = app.current_user_id()
  OR app.can_approve_room(room_id)
);

-- ห้ามลบการจอง ให้เปลี่ยนสถานะเป็น cancelled แทน เพื่อรักษารายงานและ audit trail
CREATE POLICY bookings_delete ON bookings FOR DELETE USING (app.is_super_admin());

ALTER TABLE booking_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_series FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_series_read ON booking_series FOR SELECT
  USING (app.is_service() OR created_by = app.current_user_id() OR app.can_approve_room(room_id));
CREATE POLICY booking_series_write ON booking_series FOR ALL
  USING (app.is_service() OR created_by = app.current_user_id() OR app.can_manage_room(room_id))
  WITH CHECK (app.is_service() OR created_by = app.current_user_id() OR app.can_manage_room(room_id));

ALTER TABLE booking_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_attendees FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_attendees_read ON booking_attendees FOR SELECT USING (
  app.is_service()
  OR profile_id = app.current_user_id()
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = booking_id
      AND (b.booker_profile_id = app.current_user_id() OR app.can_approve_room(b.room_id))
  )
);
CREATE POLICY booking_attendees_write ON booking_attendees FOR ALL USING (
  app.is_service()
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = booking_id
      AND (b.booker_profile_id = app.current_user_id() OR app.can_manage_room(b.room_id))
  )
) WITH CHECK (
  app.is_service()
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = booking_id
      AND (b.booker_profile_id = app.current_user_id() OR app.can_manage_room(b.room_id))
  )
);

ALTER TABLE booking_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_resources_read ON booking_resources FOR SELECT USING (
  app.is_service() OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id)
);
CREATE POLICY booking_resources_write ON booking_resources FOR ALL USING (
  app.is_service()
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = booking_id
      AND (b.booker_profile_id = app.current_user_id() OR app.can_manage_room(b.room_id))
  )
) WITH CHECK (
  app.is_service()
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = booking_id
      AND (b.booker_profile_id = app.current_user_id() OR app.can_manage_room(b.room_id))
  )
);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY approvals_read ON approvals FOR SELECT USING (
  app.is_service()
  OR approver_id = app.current_user_id()
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = booking_id
      AND (b.booker_profile_id = app.current_user_id() OR app.can_approve_room(b.room_id))
  )
);
CREATE POLICY approvals_write ON approvals FOR ALL USING (
  app.is_service()
  OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND app.can_approve_room(b.room_id))
) WITH CHECK (
  app.is_service()
  OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND app.can_approve_room(b.room_id))
);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY waitlist_read ON waitlist_entries FOR SELECT
  USING (app.is_service() OR profile_id = app.current_user_id() OR app.can_approve_room(room_id));
CREATE POLICY waitlist_write ON waitlist_entries FOR ALL
  USING (app.is_service() OR profile_id = app.current_user_id() OR app.can_manage_room(room_id))
  WITH CHECK (app.is_service() OR profile_id = app.current_user_id() OR app.can_manage_room(room_id));

-- ------------------------------------------------------------
-- การแจ้งเตือน
-- ------------------------------------------------------------
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_own ON notification_preferences FOR ALL
  USING (app.is_service() OR profile_id = app.current_user_id())
  WITH CHECK (app.is_service() OR profile_id = app.current_user_id());

ALTER TABLE line_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_links FORCE ROW LEVEL SECURITY;
CREATE POLICY line_links_own ON line_links FOR ALL
  USING (app.is_service() OR profile_id = app.current_user_id())
  WITH CHECK (app.is_service() OR profile_id = app.current_user_id());

ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_jobs_admin ON notification_jobs FOR SELECT
  USING (app.is_service() OR app.has_permission('system:manage'));
CREATE POLICY notification_jobs_service_write ON notification_jobs FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_deliveries_admin ON notification_deliveries FOR SELECT
  USING (app.is_service() OR app.has_permission('system:manage'));
CREATE POLICY notification_deliveries_service_write ON notification_deliveries FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suppressions FORCE ROW LEVEL SECURITY;
CREATE POLICY email_suppressions_admin ON email_suppressions FOR SELECT
  USING (app.is_service() OR app.has_permission('system:manage'));
CREATE POLICY email_suppressions_service_write ON email_suppressions FOR ALL
  USING (app.is_service()) WITH CHECK (app.is_service());

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY in_app_notifications_own ON in_app_notifications FOR ALL
  USING (app.is_service() OR profile_id = app.current_user_id())
  WITH CHECK (app.is_service() OR profile_id = app.current_user_id());

-- ------------------------------------------------------------
-- Audit log: อ่านได้เฉพาะผู้มีสิทธิ์ เขียนได้เฉพาะ service
-- ไม่มี policy สำหรับ UPDATE/DELETE => แก้ไขหรือลบไม่ได้เลย (บรีฟข้อ 11)
-- ------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON audit_logs FOR SELECT
  USING (app.is_service() OR app.has_permission('audit:read'));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (app.is_service());

-- ------------------------------------------------------------
-- View สำหรับปฏิทิน: ปิดบังหัวข้อของการจองที่ตั้งค่า "แสดงเฉพาะว่าไม่ว่าง"
-- security_invoker = on เพื่อให้ RLS ของตารางต้นทางมีผลกับผู้เรียก
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.can_see_booking_details(
  p_booker uuid, p_room uuid, p_privacy text, p_attendees uuid[]
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_service()
      OR p_privacy = 'public'
      OR p_booker = app.current_user_id()
      OR app.current_user_id() = ANY (coalesce(p_attendees, '{}'::uuid[]))
      OR app.can_approve_room(p_room)
      OR app.has_permission('booking:read_all');
$$;

CREATE VIEW app.v_calendar_bookings WITH (security_invoker = on) AS
SELECT
  b.id,
  b.room_id,
  b.series_id,
  b.starts_at,
  b.ends_at,
  b.buffer_before_minutes,
  b.buffer_after_minutes,
  b.status,
  b.privacy,
  b.attendee_count,
  b.checked_in_at,
  b.booker_profile_id,
  app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids) AS can_see_details,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.title ELSE 'ไม่ว่าง' END AS title,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.booker_name ELSE NULL END AS booker_name,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.booker_department ELSE NULL END AS booker_department,
  CASE WHEN app.can_see_booking_details(b.booker_profile_id, b.room_id, b.privacy, b.attendee_profile_ids)
       THEN b.purpose ELSE NULL END AS purpose
FROM bookings b
WHERE b.status <> 'draft';
