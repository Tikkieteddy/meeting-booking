-- ย้อน 011 — กฎรายปีแปลงเป็นรายเดือนทุก 12 เดือน (ความหมายเดียวกันสำหรับ interval 1)
ALTER TABLE booking_series DROP CONSTRAINT IF EXISTS booking_series_month_week_valid;
ALTER TABLE booking_series DROP COLUMN IF EXISTS month_week;
UPDATE booking_series SET frequency = 'monthly', interval_count = 12 WHERE frequency = 'yearly';
ALTER TABLE booking_series DROP CONSTRAINT booking_series_frequency_check;
ALTER TABLE booking_series ADD CONSTRAINT booking_series_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'monthly'));
