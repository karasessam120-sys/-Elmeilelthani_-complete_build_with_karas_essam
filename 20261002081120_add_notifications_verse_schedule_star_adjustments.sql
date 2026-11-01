-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_role text NOT NULL DEFAULT 'member',
  title text NOT NULL,
  body text NOT NULL,
  icon text DEFAULT 'bell',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_notifications" ON notifications;
CREATE POLICY "anon_select_notifications" ON notifications FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notifications" ON notifications;
CREATE POLICY "anon_insert_notifications" ON notifications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notifications" ON notifications;
CREATE POLICY "anon_delete_notifications" ON notifications FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Verse schedule table (AI auto-generate schedule)
CREATE TABLE IF NOT EXISTS verse_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_hour integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE verse_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_verse_schedule" ON verse_schedule;
CREATE POLICY "anon_select_verse_schedule" ON verse_schedule FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_verse_schedule" ON verse_schedule;
CREATE POLICY "anon_update_verse_schedule" ON verse_schedule FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO verse_schedule (update_hour, enabled)
SELECT 0, true
WHERE NOT EXISTS (SELECT 1 FROM verse_schedule);

-- Star adjustments table (track manual star add/remove by servants/admin)
CREATE TABLE IF NOT EXISTS star_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  adjusted_by text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  reason text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE star_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_star_adjustments" ON star_adjustments;
CREATE POLICY "anon_select_star_adjustments" ON star_adjustments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_star_adjustments" ON star_adjustments;
CREATE POLICY "anon_insert_star_adjustments" ON star_adjustments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_star_adj_user ON star_adjustments(user_id);
