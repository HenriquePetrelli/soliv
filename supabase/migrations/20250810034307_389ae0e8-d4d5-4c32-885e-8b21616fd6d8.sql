-- Drop obsolete column from psychologists
ALTER TABLE public.psychologists
DROP COLUMN IF EXISTS accepts_presential;