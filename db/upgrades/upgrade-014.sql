-- ============================================================
-- อัปเดตฐานข้อมูลระบบจองห้องประชุม TNN — migration 014
-- วิธีใช้: เปิด Neon → SQL Editor → วางทั้งไฟล์ → Run
-- ทั้งหมดอยู่ในธุรกรรมเดียว ถ้าพังกลางทางจะไม่มีอะไรเปลี่ยน
-- ============================================================

BEGIN;

-- ยกระดับสิทธิ์เป็นระบบเฉพาะในธุรกรรมนี้ (ทุกตารางบังคับ RLS ไว้)
SELECT set_config('app.user_role', 'service_role', true);

-- ---------- 014_calendar_feeds ----------
-- ============================================================
-- 014 — ลิงก์ปฏิทินส่วนตัว (เพิ่มใน Outlook / Teams แล้วอัปเดตเอง) — ผู้ใช้เลือก "ระดับ 1" 14 ต.ค. 2569
--
-- แต่ละคนมีลิงก์ลับได้หนึ่งลิงก์ เก็บเฉพาะ hash (sha256) ของโทเค็น ถ้าฐานข้อมูลรั่ว
-- ก็เอาไปเปิดปฏิทินของใครไม่ได้ สร้างใหม่ = ลิงก์เดิมใช้ไม่ได้ทันที (แถวเดียวต่อคน)
-- Outlook ดึงลิงก์โดยไม่มีการล็อกอิน เส้นทางที่อ่านลิงก์จึงใช้สิทธิ์ระบบค้นด้วย hash เท่านั้น
-- ============================================================

CREATE TABLE calendar_feed_tokens (
  profile_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash        text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_accessed_at  timestamptz
);

ALTER TABLE calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_feed_tokens FORCE ROW LEVEL SECURITY;

-- เห็น/สร้าง/ลบได้เฉพาะลิงก์ของตัวเอง (ผู้ดูแลก็ไม่เห็นของคนอื่น) — ระบบอ่านได้ตอน Outlook มาดึง
CREATE POLICY calendar_feed_tokens_own ON calendar_feed_tokens FOR ALL
  USING (app.is_service() OR profile_id = app.current_user_id())
  WITH CHECK (app.is_service() OR profile_id = app.current_user_id());

INSERT INTO schema_migrations (version, name) VALUES ('014', '014_calendar_feeds')
  ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------- ตรวจผล: ทุกแถวต้องขึ้น "ผ่าน" ----------
SELECT set_config('app.user_role', 'service_role', false);
SELECT m.version AS migration,
       CASE WHEN s.version IS NULL THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END AS result
FROM (VALUES ('014')) AS m(version)
LEFT JOIN schema_migrations s ON s.version = m.version
ORDER BY m.version;
