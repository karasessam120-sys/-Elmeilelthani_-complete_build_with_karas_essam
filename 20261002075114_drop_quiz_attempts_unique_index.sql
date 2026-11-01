-- Drop the unique index so general exams can be retaken multiple times
DROP INDEX IF EXISTS idx_quiz_attempts_unique;

-- Add a non-unique index for query performance
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_user ON quiz_attempts(quiz_id, user_id);