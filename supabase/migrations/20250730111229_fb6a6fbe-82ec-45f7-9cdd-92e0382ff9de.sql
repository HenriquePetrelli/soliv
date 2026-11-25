-- Enable RLS on tables that have policies but RLS disabled
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychologist_availability ENABLE ROW LEVEL SECURITY;