-- ============================================================
-- 001 foundation: extension, schema ช่วยเหลือ, ฟังก์ชันร่วม
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- exclusion constraint room_id + tstzrange

CREATE SCHEMA IF NOT EXISTS app;

-- ผู้ใช้ปัจจุบันจาก session variable ที่ชั้นแอปตั้งไว้ (withTx ใน src/lib/db/pool.ts)
-- บน Supabase สามารถอ่านจาก JWT ของ PostgREST ได้ด้วย จึงรองรับทั้งสองทาง
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw text;
BEGIN
  raw := nullif(current_setting('app.user_id', true), '');
  IF raw IS NULL THEN
    BEGIN
      raw := nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '');
    EXCEPTION WHEN others THEN
      raw := NULL;
    END;
  END IF;
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_role_name() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.user_role', true), ''), 'anonymous');
$$;

-- สิทธิ์ระบบ: ใช้โดย migration, seed, cron และ job worker เท่านั้น
CREATE OR REPLACE FUNCTION app.is_service() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_role_name() = 'service_role';
$$;

CREATE OR REPLACE FUNCTION app.correlation_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.correlation_id', true), '');
$$;

-- trigger กลางสำหรับคอลัมน์ updated_at
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
