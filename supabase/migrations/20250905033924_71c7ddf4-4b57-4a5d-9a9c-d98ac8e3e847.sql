-- Add rejected_at column to track when psychologist was rejected
ALTER TABLE public.psychologists 
ADD COLUMN rejected_at TIMESTAMP WITH TIME ZONE NULL;

-- Add rejected_at column to psychologist_registrations table too
ALTER TABLE public.psychologist_registrations 
ADD COLUMN rejected_at TIMESTAMP WITH TIME ZONE NULL;

-- Update the rejection handling function
CREATE OR REPLACE FUNCTION public.handle_psychologist_rejection(psychologist_id uuid, admin_id uuid, rejection_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  psych_record RECORD;
BEGIN
  -- Get psychologist data
  SELECT * INTO psych_record 
  FROM public.psychologists 
  WHERE id = psychologist_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Psicólogo não encontrado';
  END IF;

  -- Update psychologists table with rejection timestamp
  UPDATE public.psychologists
  SET 
    approval_status = 'rejected',
    approved = false,
    reviewed_at = now(),
    reviewed_by = admin_id,
    rejection_reason = handle_psychologist_rejection.rejection_reason,
    rejected_at = now()
  WHERE id = psychologist_id;

  -- Update or create registration entry with rejection timestamp
  INSERT INTO public.psychologist_registrations (
    user_id,
    status,
    reviewed_at,
    reviewed_by,
    rejection_reason,
    rejected_at
  ) VALUES (
    psych_record.user_id,
    'rejected',
    now(),
    admin_id,
    handle_psychologist_rejection.rejection_reason,
    now()
  ) ON CONFLICT (user_id) DO UPDATE
  SET 
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = admin_id,
    rejection_reason = handle_psychologist_rejection.rejection_reason,
    rejected_at = now();
END;
$function$;

-- Function to get psychologist rejection status for login check
CREATE OR REPLACE FUNCTION public.get_psychologist_rejection_status(p_user_id uuid)
RETURNS TABLE(
  is_rejected boolean,
  rejected_at timestamp with time zone,
  rejection_reason text,
  should_show_rejection_message boolean,
  should_cleanup boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rejection_data RECORD;
  days_since_rejection integer;
BEGIN
  -- Get rejection data from psychologist_registrations
  SELECT 
    r.status = 'rejected' as is_rejected,
    r.rejected_at,
    r.rejection_reason
  INTO rejection_data
  FROM public.psychologist_registrations r
  WHERE r.user_id = p_user_id;

  -- If no record found or not rejected
  IF NOT FOUND OR NOT rejection_data.is_rejected THEN
    RETURN QUERY SELECT false, NULL::timestamp with time zone, NULL::text, false, false;
    RETURN;
  END IF;

  -- Calculate days since rejection
  days_since_rejection := EXTRACT(days FROM (now() - rejection_data.rejected_at));

  -- Return appropriate flags
  RETURN QUERY SELECT 
    true,
    rejection_data.rejected_at,
    rejection_data.rejection_reason,
    days_since_rejection <= 3, -- Show message for 3 days
    days_since_rejection > 3;   -- Cleanup after 3 days
END;
$function$;

-- Function to cleanup rejected psychologist data
CREATE OR REPLACE FUNCTION public.cleanup_rejected_psychologist(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  doc_path text;
  storage_result record;
BEGIN
  -- Get document path before deletion
  SELECT document_url INTO doc_path
  FROM public.psychologists
  WHERE user_id = p_user_id AND approval_status = 'rejected';

  -- Delete from storage if document exists
  IF doc_path IS NOT NULL THEN
    -- Extract just the filename from the path for storage deletion
    doc_path := regexp_replace(doc_path, '^.*/', '');
    
    -- Delete from storage bucket (we'll handle this in the edge function)
    -- This function just marks for deletion
  END IF;

  -- Delete from all tables
  DELETE FROM public.psychologist_registrations WHERE user_id = p_user_id;
  DELETE FROM public.psychologists WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id AND user_type = 'psychologist';
  
  -- Delete user from auth (this will be done by edge function with service role)
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail
    RAISE LOG 'Error cleaning up psychologist %: %', p_user_id, SQLERRM;
    RETURN false;
END;
$function$;