-- ============================================================
-- 002 identity: องค์กร ผู้ใช้ สิทธิ์ เซสชัน และการตั้งค่าระบบ
-- ============================================================

CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  timezone      text NOT NULL DEFAULT 'Asia/Bangkok',
  locale        text NOT NULL DEFAULT 'th',
  date_style    text NOT NULL DEFAULT 'th-buddhist' CHECK (date_style IN ('th-buddhist', 'iso')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- การตั้งค่าระดับระบบ แก้ผ่านหน้า Admin ได้โดยไม่ต้องแก้โค้ด (บรีฟ AC06)
CREATE TABLE app_settings (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  value           jsonb NOT NULL,
  description     text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  PRIMARY KEY (organization_id, key)
);

CREATE TABLE profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             text NOT NULL,
  full_name         text NOT NULL,
  avatar_url        text,
  phone             text,
  department        text,
  job_title         text,
  locale            text NOT NULL DEFAULT 'th' CHECK (locale IN ('th', 'en')),
  timezone          text NOT NULL DEFAULT 'Asia/Bangkok',
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'deactivated')),
  email_verified_at timestamptz,
  onboarded_at      timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_key ON profiles (organization_id, lower(email));
CREATE INDEX profiles_search_idx ON profiles USING gin (
  to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(department, ''))
);

-- รหัสผ่านเก็บเป็น hash เท่านั้น (scrypt) ห้ามเก็บ plain text (บรีฟข้อ 16)
CREATE TABLE user_credentials (
  profile_id     uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash  text NOT NULL,
  algorithm      text NOT NULL DEFAULT 'scrypt',
  must_change    boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  ip_hint     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX user_sessions_profile_idx ON user_sessions (profile_id) WHERE revoked_at IS NULL;

-- โทเค็นใช้ครั้งเดียว: ยืนยันอีเมล, ตั้งรหัสผ่านใหม่, เชิญผู้ใช้, เชื่อม LINE
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('email_verify', 'password_reset', 'invite', 'line_link')),
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX auth_tokens_profile_purpose_idx ON auth_tokens (profile_id, purpose) WHERE used_at IS NULL;

-- กัน brute force (บรีฟข้อ 7.1)
CREATE TABLE login_attempts (
  id           bigserial PRIMARY KEY,
  email        text NOT NULL,
  ip_hint      text,
  succeeded    boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_lookup_idx ON login_attempts (lower(email), attempted_at DESC);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip_hint, attempted_at DESC);

-- ============================================================
-- RBAC: role / permission / scope  (บรีฟข้อ 8)
-- ============================================================

CREATE TABLE roles (
  code        text PRIMARY KEY,
  name_th     text NOT NULL,
  name_en     text NOT NULL,
  rank        int NOT NULL,
  is_system   boolean NOT NULL DEFAULT true,
  description text
);

CREATE TABLE permissions (
  code        text PRIMARY KEY,           -- เช่น 'booking:create'
  resource    text NOT NULL,              -- เช่น 'booking'
  action      text NOT NULL,              -- เช่น 'create'
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_code       text NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_code   text NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  scope_type  text NOT NULL DEFAULT 'organization'
              CHECK (scope_type IN ('organization', 'building', 'room', 'department')),
  scope_id    text,                        -- uuid ของอาคาร/ห้อง หรือชื่อแผนก
  granted_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique_idx
  ON user_roles (profile_id, role_code, scope_type, coalesce(scope_id, ''));
CREATE INDEX user_roles_profile_idx ON user_roles (profile_id);

-- ------------------------------------------------------------
-- ฟังก์ชันตรวจสิทธิ์ ใช้ทั้งใน RLS policy และเรียกจากชั้นแอป
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.has_permission(p_code text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_service() OR EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_code = ur.role_code
    WHERE ur.profile_id = app.current_user_id()
      AND rp.permission_code = p_code
  );
$$;

CREATE OR REPLACE FUNCTION app.has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_service() OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.profile_id = app.current_user_id() AND ur.role_code = p_role
  );
$$;

CREATE OR REPLACE FUNCTION app.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_role('super_admin');
$$;

CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
