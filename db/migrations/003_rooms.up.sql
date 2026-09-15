-- ============================================================
-- 003 rooms: อาคาร ห้องประชุม อุปกรณ์ ผู้อนุมัติ ช่วงปิดปรับปรุง วันหยุด
-- ============================================================

CREATE TABLE buildings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  code            text NOT NULL,
  address         text,
  sort_order      int NOT NULL DEFAULT 100,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX buildings_code_key ON buildings (organization_id, lower(code));

CREATE TABLE amenities (
  code       text PRIMARY KEY,            -- tv, projector, video_conference, ...
  name_th    text NOT NULL,
  name_en    text NOT NULL,
  icon       text NOT NULL DEFAULT 'dot',
  sort_order int NOT NULL DEFAULT 100
);

CREATE TABLE rooms (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  building_id          uuid REFERENCES buildings(id) ON DELETE SET NULL,
  code                 text NOT NULL,
  name                 text NOT NULL,
  description          text,
  floor                text,
  location_hint        text,
  capacity             int NOT NULL CHECK (capacity > 0),
  room_type            text NOT NULL DEFAULT 'meeting'
                       CHECK (room_type IN ('meeting', 'board', 'training', 'studio', 'huddle')),
  photos               jsonb NOT NULL DEFAULT '[]'::jsonb,
  color                text NOT NULL DEFAULT '#EC5F27',

  -- นโยบายรายห้อง (บรีฟข้อ 6 และ 9) แก้ผ่านหน้า Admin ได้
  open_time            time NOT NULL DEFAULT '08:00',
  close_time           time NOT NULL DEFAULT '20:00',
  open_days            int[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 0=อาทิตย์ .. 6=เสาร์
  slot_step_minutes    int NOT NULL DEFAULT 30 CHECK (slot_step_minutes IN (5, 10, 15, 20, 30, 60)),
  min_duration_minutes int NOT NULL DEFAULT 30 CHECK (min_duration_minutes > 0),
  max_duration_minutes int NOT NULL DEFAULT 240 CHECK (max_duration_minutes > 0),
  buffer_before_minutes int NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes  int NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  booking_horizon_days int NOT NULL DEFAULT 90 CHECK (booking_horizon_days > 0),
  cancel_window_minutes int NOT NULL DEFAULT 0 CHECK (cancel_window_minutes >= 0),
  requires_approval    boolean NOT NULL DEFAULT false,
  check_in_required    boolean NOT NULL DEFAULT false,
  check_in_grace_minutes int NOT NULL DEFAULT 15 CHECK (check_in_grace_minutes >= 0),
  waitlist_enabled     boolean NOT NULL DEFAULT false,
  allow_external_guests boolean NOT NULL DEFAULT true,

  sort_order           int NOT NULL DEFAULT 100,
  is_active            boolean NOT NULL DEFAULT true,
  archived_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_duration_order CHECK (max_duration_minutes >= min_duration_minutes),
  CONSTRAINT rooms_hours_order CHECK (close_time > open_time)
);
CREATE UNIQUE INDEX rooms_code_key ON rooms (organization_id, lower(code));
CREATE INDEX rooms_active_idx ON rooms (organization_id, is_active, sort_order) WHERE archived_at IS NULL;
CREATE INDEX rooms_building_idx ON rooms (building_id);
CREATE INDEX rooms_search_idx ON rooms USING gin (
  to_tsvector('simple',
    coalesce(name, '') || ' ' || coalesce(code, '') || ' ' ||
    coalesce(floor, '') || ' ' || coalesce(description, ''))
);

CREATE TABLE room_amenities (
  room_id      uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  amenity_code text NOT NULL REFERENCES amenities(code) ON DELETE CASCADE,
  quantity     int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note         text,
  PRIMARY KEY (room_id, amenity_code)
);

CREATE TABLE room_approvers (
  room_id    uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  step       int NOT NULL DEFAULT 1 CHECK (step > 0),
  PRIMARY KEY (room_id, profile_id)
);
CREATE INDEX room_approvers_profile_idx ON room_approvers (profile_id);

-- ช่วงปิดปรับปรุงห้อง: กันการจองในช่วงเวลานี้ (ตรวจใน transaction ตอนจอง)
CREATE TABLE room_closures (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  reason     text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_closures_range CHECK (ends_at > starts_at)
);
CREATE INDEX room_closures_lookup_idx ON room_closures (room_id, starts_at, ends_at);

-- วันหยุดองค์กร (ทั้งองค์กรหรือเฉพาะห้อง)
CREATE TABLE holidays (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_id         uuid REFERENCES rooms(id) ON DELETE CASCADE,
  holiday_date    date NOT NULL,
  name            text NOT NULL,
  blocks_booking  boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX holidays_unique_idx
  ON holidays (organization_id, holiday_date, coalesce(room_id::text, 'org'));

-- ขอบเขตความรับผิดชอบของผู้ดูแลห้อง (scope: organization / building / room)
CREATE OR REPLACE FUNCTION app.can_manage_room(p_room_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_service()
     OR app.is_super_admin()
     OR EXISTS (
       SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_code = ur.role_code
       LEFT JOIN rooms r ON r.id = p_room_id
       WHERE ur.profile_id = app.current_user_id()
         AND rp.permission_code = 'room:manage'
         AND (
           ur.scope_type = 'organization'
           OR (ur.scope_type = 'room' AND ur.scope_id = p_room_id::text)
           OR (ur.scope_type = 'building' AND ur.scope_id = r.building_id::text)
         )
     );
$$;

-- ผู้อนุมัติของห้องนี้หรือไม่
CREATE OR REPLACE FUNCTION app.can_approve_room(p_room_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_service()
     OR app.is_super_admin()
     OR app.can_manage_room(p_room_id)
     OR EXISTS (
       SELECT 1 FROM room_approvers ra
       WHERE ra.room_id = p_room_id AND ra.profile_id = app.current_user_id()
     );
$$;

CREATE TRIGGER buildings_touch BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER rooms_touch BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
