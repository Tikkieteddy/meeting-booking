-- ============================================================
-- 004 bookings: การจอง ผู้เข้าร่วม อุปกรณ์ที่ขอ การอนุมัติ คิวรอ
-- หัวใจของระบบ: กันการจองซ้อนด้วย exclusion constraint ที่ชั้นฐานข้อมูล
-- (บรีฟข้อ 6 และ AC04 — ห้ามพึ่งการตรวจเฉพาะหน้าเว็บ)
-- ============================================================

-- ชุดการจองซ้ำ (recurring series)
CREATE TABLE booking_series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  frequency        text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval_count   int NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 12),
  by_weekdays      int[],                       -- ใช้กับ weekly
  until_date       date,
  occurrence_count int CHECK (occurrence_count IS NULL OR occurrence_count BETWEEN 1 AND 104),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_series_end_required CHECK (until_date IS NOT NULL OR occurrence_count IS NOT NULL)
);

CREATE TABLE bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_id           uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  series_id         uuid REFERENCES booking_series(id) ON DELETE SET NULL,

  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  purpose           text CHECK (purpose IS NULL OR length(purpose) <= 500),
  notes             text CHECK (notes IS NULL OR length(notes) <= 2000),

  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  -- buffer snapshot ณ เวลาที่จอง เพื่อให้การคำนวณช่วงกันชนคงที่แม้นโยบายห้องเปลี่ยน
  buffer_before_minutes int NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes  int NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  blocked_period    tstzrange NOT NULL,   -- ตั้งค่าโดย trigger bookings_set_period

  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'draft', 'pending', 'confirmed', 'rejected', 'cancelled',
                      'checked_in', 'completed', 'no_show', 'maintenance')),
  privacy           text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'busy_only', 'private')),

  -- snapshot ข้อมูลผู้จอง เพื่อให้ปฏิทินแสดงชื่อได้โดยไม่ต้องเปิดสิทธิ์อ่านตารางผู้ใช้ทั้งใบ
  booker_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  booker_name       text NOT NULL,
  booker_email      text NOT NULL,
  booker_department text,

  attendee_count    int NOT NULL DEFAULT 1 CHECK (attendee_count >= 0),
  -- สำเนารายชื่อ profile ของผู้เข้าร่วม ใช้ให้ RLS ตัดสินสิทธิ์การมองเห็นได้
  -- โดยไม่ต้องอ้างอิงข้ามตาราง (กัน policy เรียกวนซ้ำ) — ชั้น service เขียนค่านี้
  -- พร้อมกับตาราง booking_attendees ในทรานแซกชันเดียวกันเสมอ
  attendee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  capacity_override_reason text,

  check_in_token    text,
  checked_in_at     timestamptz,
  checked_in_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,

  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancel_reason     text,

  idempotency_key   text,
  version           int NOT NULL DEFAULT 1,
  created_by        uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  updated_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_time_order CHECK (ends_at > starts_at),
  -- สถานะที่ "กินพื้นที่" ห้องจริง ใช้เป็นเงื่อนไขของ exclusion constraint
  blocks_slot boolean GENERATED ALWAYS AS (
    status IN ('pending', 'confirmed', 'checked_in', 'completed', 'maintenance')
  ) STORED
);

CREATE UNIQUE INDEX bookings_idempotency_key_idx
  ON bookings (booker_profile_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ★ กันจองซ้อนที่ชั้นฐานข้อมูล: ห้องเดียวกัน + ช่วงเวลา (รวม buffer) ทับกัน = ปฏิเสธ
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (room_id WITH =, blocked_period WITH &&) WHERE (blocks_slot);

CREATE INDEX bookings_room_time_idx ON bookings (room_id, starts_at, ends_at) WHERE blocks_slot;
CREATE INDEX bookings_status_idx ON bookings (status, starts_at);
CREATE INDEX bookings_booker_idx ON bookings (booker_profile_id, starts_at DESC);
CREATE INDEX bookings_attendees_gin_idx ON bookings USING gin (attendee_profile_ids);
CREATE INDEX bookings_series_idx ON bookings (series_id) WHERE series_id IS NOT NULL;
CREATE INDEX bookings_period_gist_idx ON bookings USING gist (blocked_period);
CREATE INDEX bookings_search_idx ON bookings USING gin (
  to_tsvector('simple',
    coalesce(title, '') || ' ' || coalesce(booker_name, '') || ' ' ||
    coalesce(booker_email, '') || ' ' || coalesce(booker_department, ''))
);

-- คำนวณ blocked_period จากเวลาเริ่ม/สิ้นสุด + buffer
CREATE OR REPLACE FUNCTION app.bookings_set_period() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.blocked_period := tstzrange(
    NEW.starts_at - make_interval(mins => NEW.buffer_before_minutes),
    NEW.ends_at   + make_interval(mins => NEW.buffer_after_minutes),
    '[)'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_set_period_trg BEFORE INSERT OR UPDATE OF starts_at, ends_at,
  buffer_before_minutes, buffer_after_minutes ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.bookings_set_period();

CREATE TRIGGER bookings_touch BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ผู้เข้าร่วม (ภายในองค์กรหรืออีเมลภายนอก)
CREATE TABLE booking_attendees (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  profile_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email         text NOT NULL,
  display_name  text,
  kind          text NOT NULL DEFAULT 'internal' CHECK (kind IN ('internal', 'external')),
  response      text NOT NULL DEFAULT 'pending' CHECK (response IN ('pending', 'accepted', 'declined', 'tentative')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX booking_attendees_unique_idx ON booking_attendees (booking_id, lower(email));
CREATE INDEX booking_attendees_profile_idx ON booking_attendees (profile_id);

-- อุปกรณ์/บริการเสริมที่ร้องขอต่อการจอง
CREATE TABLE booking_resources (
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amenity_code text NOT NULL REFERENCES amenities(code) ON DELETE CASCADE,
  quantity     int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note         text,
  PRIMARY KEY (booking_id, amenity_code)
);

-- การอนุมัติ (รองรับหลายลำดับขั้น)
CREATE TABLE approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  step          int NOT NULL DEFAULT 1,
  approver_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested')),
  comment       text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_booking_idx ON approvals (booking_id);
CREATE INDEX approvals_pending_idx ON approvals (status, created_at) WHERE status = 'pending';

-- คิวรอห้องว่าง (บรีฟข้อ 6: เปิดปิดได้รายห้อง)
CREATE TABLE waitlist_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  desired_start  timestamptz NOT NULL,
  desired_end    timestamptz NOT NULL,
  title          text NOT NULL,
  attendee_count int NOT NULL DEFAULT 1,
  status         text NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting', 'offered', 'claimed', 'expired', 'cancelled')),
  offered_at     timestamptz,
  offer_expires_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_range CHECK (desired_end > desired_start)
);
CREATE INDEX waitlist_lookup_idx ON waitlist_entries (room_id, desired_start, status);
CREATE INDEX waitlist_profile_idx ON waitlist_entries (profile_id, status);

-- ผู้ที่ "เกี่ยวข้อง" กับการจอง ใช้ใน RLS policy
CREATE OR REPLACE FUNCTION app.is_booking_participant(p_booking_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = p_booking_id AND b.booker_profile_id = app.current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM booking_attendees a
    WHERE a.booking_id = p_booking_id AND a.profile_id = app.current_user_id()
  );
$$;
