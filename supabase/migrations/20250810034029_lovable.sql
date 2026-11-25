-- Remove in-person flag from psychologists table
ALTER TABLE public.psychologists
DROP COLUMN IF EXISTS accepts_presential;
