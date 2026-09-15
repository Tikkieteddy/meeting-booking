-- ============================================================
-- 005 notifications + audit: คิวงานแจ้งเตือน บันทึกการส่ง การแจ้งเตือนในระบบ
-- การเชื่อม LINE และ Audit Log (บรีฟข้อ 10 และ 11)
-- ============================================================

CREATE TABLE notification_preferences (
  profile_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_enabled     boolean NOT NULL DEFAULT true,
  line_enabled      boolean NOT NULL DEFAULT false,
  in_app_enabled    boolean NOT NULL DEFAULT true,
  reminder_leads    int[] NOT NULL DEFAULT '{1440,15}',  -- นาทีก่อนประชุม: 24 ชม. และ 15 นาที
  quiet_hours_start time,
  quiet_hours_end   time,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- การเชื่อมบัญชี LINE แบบยินยอม ใช้รหัสใช้ครั้งเดียว (บรีฟ 22.7)
CREATE TABLE line_links (
  profile_id     uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  line_user_id   text UNIQUE,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'unlinked', 'blocked')),
  link_code      text UNIQUE,
  code_expires_at timestamptz,
  linked_at      timestamptz,
  unlinked_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- คิวงานแจ้งเตือน: retry + exponential backoff + idempotency + dead letter
CREATE TABLE notification_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       text NOT NULL,     -- booking.confirmed, booking.reminder, ...
  channel          text NOT NULL CHECK (channel IN ('email', 'line', 'in_app')),
  booking_id       uuid REFERENCES bookings(id) ON DELETE CASCADE,
  recipient_profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_address text,             -- อีเมล หรือ LINE user id
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key       text NOT NULL UNIQUE,   -- idempotency key: กันส่งซ้ำ
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'dead', 'skipped')),
  attempts         int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 5,
  scheduled_for    timestamptz NOT NULL DEFAULT now(),
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_at        timestamptz,
  locked_by        text,
  last_error       text,
  provider_message_id text,
  sent_at          timestamptz,
  correlation_id   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_jobs_due_idx ON notification_jobs (next_attempt_at)
  WHERE status IN ('queued', 'failed');
CREATE INDEX notification_jobs_status_idx ON notification_jobs (status, created_at DESC);
CREATE INDEX notification_jobs_booking_idx ON notification_jobs (booking_id);

CREATE TRIGGER notification_jobs_touch BEFORE UPDATE ON notification_jobs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- บันทึกผลการส่งทุกครั้ง (รวมความพยายามที่ล้มเหลว) สำหรับหน้า System health
CREATE TABLE notification_deliveries (
  id             bigserial PRIMARY KEY,
  job_id         uuid NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  attempt        int NOT NULL,
  outcome        text NOT NULL CHECK (outcome IN ('sent', 'failed', 'bounced', 'complained', 'skipped')),
  provider       text,
  provider_message_id text,
  detail         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_job_idx ON notification_deliveries (job_id, attempt);

-- ศูนย์การแจ้งเตือนในระบบ (in-app)
CREATE TABLE in_app_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  booking_id  uuid REFERENCES bookings(id) ON DELETE CASCADE,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX in_app_notifications_inbox_idx ON in_app_notifications (profile_id, created_at DESC);
CREATE INDEX in_app_notifications_unread_idx ON in_app_notifications (profile_id) WHERE read_at IS NULL;

-- ที่อยู่อีเมลที่ระงับการส่ง (bounce / complaint / unsubscribe)
CREATE TABLE email_suppressions (
  email      text PRIMARY KEY,
  reason     text NOT NULL CHECK (reason IN ('bounce', 'complaint', 'unsubscribe', 'manual')),
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Audit Log — ห้ามแก้ไขหรือลบจากหน้า Admin ทั่วไป (บรีฟข้อ 11)
-- ============================================================
CREATE TABLE audit_logs (
  id             bigserial PRIMARY KEY,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email    text,
  actor_role     text,
  action         text NOT NULL,          -- booking.create, room.update, role.grant, ...
  resource_type  text NOT NULL,
  resource_id    text,
  before_data    jsonb,
  after_data     jsonb,
  ip_hint        text,
  user_agent     text,
  correlation_id text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_profile_id, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

-- Rate limit ทั่วไป (login, search, booking) เก็บใน DB เพื่อให้ทำงานได้บน serverless
CREATE TABLE rate_limit_counters (
  bucket      text NOT NULL,
  window_start timestamptz NOT NULL,
  hits        int NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limit_window_idx ON rate_limit_counters (window_start);
