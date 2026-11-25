-- Create a simple view for dashboard metrics
CREATE OR REPLACE VIEW admin_metrics AS
SELECT 
  (SELECT COUNT(*) FROM profiles WHERE user_type = 'patient') as total_patients,
  (SELECT COUNT(*) FROM profiles WHERE user_type = 'psychologist' AND registration_status = 'approved') as active_psychologists,
  (SELECT COUNT(*) FROM profiles WHERE user_type = 'psychologist' AND registration_status = 'pending') as pending_psychologists,
  (SELECT COUNT(*) FROM appointments WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as appointments_last_30_days,
  (SELECT COUNT(*) FROM emergency_requests WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as sos_requests_last_30_days,
  (SELECT COUNT(*) FROM subscribers WHERE subscribed = true) as active_subscribers;

-- Grant access to authenticated users
GRANT SELECT ON admin_metrics TO authenticated;