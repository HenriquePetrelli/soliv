-- First drop the dependent policy
DROP POLICY IF EXISTS "Public can view online psychologists" ON psychologist_presence;

-- Then drop the is_online column
ALTER TABLE psychologist_presence DROP COLUMN IF EXISTS is_online;

-- Update existing policies
DROP POLICY IF EXISTS "Psychologists can manage their own presence" ON psychologist_presence;

-- Recreate policies with the new logic
CREATE POLICY "Psychologists can manage their own presence" 
ON psychologist_presence
FOR ALL USING (psychologist_id = auth.uid());

-- Allow public to view all presence records (existence = online status)
CREATE POLICY "Public can view available psychologists"
ON psychologist_presence
FOR SELECT USING (true);

-- Add an index for better query performance using the correct column name
CREATE INDEX IF NOT EXISTS idx_psychologist_presence_last_online 
ON psychologist_presence(last_online DESC);