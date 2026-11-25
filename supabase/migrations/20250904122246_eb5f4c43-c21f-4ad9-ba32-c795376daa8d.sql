-- Enable RLS on all tables that have policies but RLS is disabled
-- Based on the query results, these tables need RLS enabled:

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychologist_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychologist_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychologists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webrtc_sessions ENABLE ROW LEVEL SECURITY;