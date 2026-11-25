-- Enable RLS on brazilian_cities and brazilian_states (if they need it)
ALTER TABLE public.brazilian_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brazilian_states ENABLE ROW LEVEL SECURITY;

-- Add policies for brazilian_cities and brazilian_states (they should be publicly readable)
CREATE POLICY "Enable read access for everyone on brazilian_cities" 
ON public.brazilian_cities FOR SELECT 
USING (true);

CREATE POLICY "Enable read access for everyone on brazilian_states" 
ON public.brazilian_states FOR SELECT 
USING (true);