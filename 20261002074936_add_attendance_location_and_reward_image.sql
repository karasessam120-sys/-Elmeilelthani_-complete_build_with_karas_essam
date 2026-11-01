-- Add manual attendance fields (replacing GPS + face capture)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_name text DEFAULT '';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_day text DEFAULT '';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_time text DEFAULT '';

-- Add image_url to rewards (replacing description with photo)
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS image_url text DEFAULT '';