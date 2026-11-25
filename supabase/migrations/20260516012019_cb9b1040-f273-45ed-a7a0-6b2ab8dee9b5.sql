DROP VIEW IF EXISTS public.psychologists_public;

CREATE POLICY "Approved psychologists are visible to all authenticated users"
ON public.psychologists
FOR SELECT
TO public
USING ((approved = true) AND (approval_status = 'approved'::text) AND (auth.role() = 'authenticated'::text));