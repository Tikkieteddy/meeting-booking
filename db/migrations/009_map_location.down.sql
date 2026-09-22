-- ย้อน 009 — เลิกเก็บตำแหน่งบนแผนที่
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_map_url_https;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_latlng_valid;
ALTER TABLE rooms DROP COLUMN IF EXISTS map_url, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_map_url_https;
ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_latlng_valid;
ALTER TABLE buildings DROP COLUMN IF EXISTS map_url, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
