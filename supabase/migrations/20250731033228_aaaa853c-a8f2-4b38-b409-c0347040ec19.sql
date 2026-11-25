-- Create unique index for CRP to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_psychologists_crp_unique ON psychologists(crp_number);

-- Create improved RPC function for psychologist approval
CREATE OR REPLACE FUNCTION handle_psychologist_approval(
  psychologist_id uuid,
  admin_id uuid
) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  psych_record RECORD;
BEGIN
  -- Get psychologist data
  SELECT * INTO psych_record 
  FROM psychologists 
  WHERE id = psychologist_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Psicólogo não encontrado';
  END IF;

  -- Update psychologists table
  UPDATE psychologists
  SET 
    approval_status = 'approved',
    approved = true,
    reviewed_at = now(),
    reviewed_by = admin_id
  WHERE id = psychologist_id;

  -- Update or create registration entry
  INSERT INTO psychologist_registrations (
    user_id,
    status,
    reviewed_at,
    reviewed_by
  ) VALUES (
    psych_record.user_id,
    'approved',
    now(),
    admin_id
  ) ON CONFLICT (user_id) DO UPDATE
  SET 
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = admin_id;

  -- Update profiles table
  INSERT INTO profiles (
    user_id,
    user_type,
    full_name,
    crp
  ) VALUES (
    psych_record.user_id,
    'psychologist',
    psych_record.full_name,
    psych_record.crp_number
  ) ON CONFLICT (user_id) DO UPDATE
  SET 
    user_type = 'psychologist',
    full_name = psych_record.full_name,
    crp = psych_record.crp_number;

  -- Update auth.users metadata
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'account_type', 'psychologist',
      'account_status', 'approved',
      'full_name', psych_record.full_name,
      'crp', psych_record.crp_number
    )
  WHERE id = psych_record.user_id;
END;
$$;

-- Create improved RPC function for psychologist rejection
CREATE OR REPLACE FUNCTION handle_psychologist_rejection(
  psychologist_id uuid,
  admin_id uuid,
  rejection_reason text DEFAULT NULL
) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  psych_record RECORD;
BEGIN
  -- Get psychologist data
  SELECT * INTO psych_record 
  FROM psychologists 
  WHERE id = psychologist_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Psicólogo não encontrado';
  END IF;

  -- Update psychologists table
  UPDATE psychologists
  SET 
    approval_status = 'rejected',
    approved = false,
    reviewed_at = now(),
    reviewed_by = admin_id,
    rejection_reason = handle_psychologist_rejection.rejection_reason
  WHERE id = psychologist_id;

  -- Update or create registration entry
  INSERT INTO psychologist_registrations (
    user_id,
    status,
    reviewed_at,
    reviewed_by,
    rejection_reason
  ) VALUES (
    psych_record.user_id,
    'rejected',
    now(),
    admin_id,
    handle_psychologist_rejection.rejection_reason
  ) ON CONFLICT (user_id) DO UPDATE
  SET 
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = admin_id,
    rejection_reason = handle_psychologist_rejection.rejection_reason;
END;
$$;