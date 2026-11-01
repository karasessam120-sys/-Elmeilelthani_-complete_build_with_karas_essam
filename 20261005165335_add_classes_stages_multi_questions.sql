-- Classes table (for church classes / servers)
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_classes" ON classes;
CREATE POLICY "anon_select_classes" ON classes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_classes" ON classes;
CREATE POLICY "anon_insert_classes" ON classes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_classes" ON classes;
CREATE POLICY "anon_delete_classes" ON classes FOR DELETE
  TO anon, authenticated USING (true);

-- Education stages table
CREATE TABLE IF NOT EXISTS education_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE education_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_edu_stages" ON education_stages;
CREATE POLICY "anon_select_edu_stages" ON education_stages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_edu_stages" ON education_stages;
CREATE POLICY "anon_insert_edu_stages" ON education_stages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_edu_stages" ON education_stages;
CREATE POLICY "anon_delete_edu_stages" ON education_stages FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default education stages
INSERT INTO education_stages (name)
SELECT 'الابتدائية'
WHERE NOT EXISTS (SELECT 1 FROM education_stages WHERE name = 'الابتدائية');

INSERT INTO education_stages (name)
SELECT 'الإعدادية'
WHERE NOT EXISTS (SELECT 1 FROM education_stages WHERE name = 'الإعدادية');

INSERT INTO education_stages (name)
SELECT 'الثانوية'
WHERE NOT EXISTS (SELECT 1 FROM education_stages WHERE name = 'الثانوية');

-- Seed ~20 default church classes (servers)
INSERT INTO classes (name)
SELECT name FROM (VALUES
  ('فصل ماربقطر'),
  ('فصل مارجرجس'),
  ('فصل العذراء'),
  ('فصل الأنبا كاراس'),
  ('فصل مارمينا'),
  ('فصل الأنبا أنطونيوس'),
  ('فصل مارمرقس'),
  ('فصل الأنبا بيشوي'),
  ('فصل القديسة دميانة'),
  ('فصل الأنبا بولا'),
  ('فصل ماريوحنا المعمدان'),
  ('فصل الأنبا صموئيل'),
  ('فصل الشهيد أبوسيفين'),
  ('فصل الأنبا هدرا'),
  ('فصل القديسة مريم'),
  ('فصل الأنبا موسى الأسود'),
  ('فصل ماتبتي'),
  ('فصل الأنبا واكسن'),
  ('فصل الشهيد فيلوباتير'),
  ('فصل الأنبا برسوم العريان')
) AS t(name)
WHERE NOT EXISTS (SELECT 1 FROM classes WHERE classes.name = t.name);

-- Add questions JSONB column to quizzes for multi-question support
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS questions jsonb DEFAULT '[]'::jsonb;

-- Set default verse schedule to 6 AM
UPDATE verse_schedule SET update_hour = 6 WHERE update_hour = 0;