-- Drop the broad SELECT policy that exposed sensitive fields
DROP POLICY IF EXISTS "Approved psychologists are visible to all authenticated users" ON public.psychologists;

-- Create a public view exposing only non-sensitive professional fields
CREATE OR REPLACE VIEW public.psychologists_public
WITH (security_invoker = off) AS
SELECT
  id,
  user_id,
  full_name,
  crp_number,
  specialization,
  bio,
  state,
  city,
  area_atendimento,
  average_rating,
  ratings_count,
  total_appointments,
  approved,
  approval_status,
  created_at,
  updated_at
FROM public.psychologists
WHERE approved = true AND approval_status = 'approved';

GRANT SELECT ON public.psychologists_public TO authenticated, anon;