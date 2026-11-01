-- Add location_name to church_config (replacing GPS coordinates for AI-based verification)
ALTER TABLE church_config ADD COLUMN IF NOT EXISTS location_name text DEFAULT 'قاعة الكنيسة';