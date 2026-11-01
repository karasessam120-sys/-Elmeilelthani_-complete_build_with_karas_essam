-- Add stars_per_question to quizzes (servant decides star reward per question)
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS stars_per_question integer NOT NULL DEFAULT 10;

-- Add member phone, parent phone, and photo to absent_peers (servant enters when adding peer)
ALTER TABLE absent_peers ADD COLUMN IF NOT EXISTS member_phone text DEFAULT '';
ALTER TABLE absent_peers ADD COLUMN IF NOT EXISTS parent_phone text DEFAULT '';
ALTER TABLE absent_peers ADD COLUMN IF NOT EXISTS member_photo text DEFAULT '';

-- Add update policies for absent_peers new columns (already have update policy, just need the columns)