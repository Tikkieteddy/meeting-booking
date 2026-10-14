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
