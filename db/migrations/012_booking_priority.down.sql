-- ย้อน 012 — คืน view เดิม (ต้อง DROP ก่อน เพราะ CREATE OR REPLACE ลบคอลัมน์ไม่ได้) แล้วลบคอลัมน์
DROP VIEW IF EXISTS app.v_calendar_bookings;
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
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_category_valid;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_priority_valid;
ALTER TABLE bookings DROP COLUMN IF EXISTS category, DROP COLUMN IF EXISTS priority;
