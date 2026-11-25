-- ================================================================
-- CRITICAL SECURITY FIXES (Updated to handle existing objects)
-- ================================================================

-- 1. ENSURE ADMIN_USERS TABLE EXISTS WITH PROPER STRUCTURE
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_users') THEN
    CREATE TABLE public.admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      granted_by UUID REFERENCES auth.users(id),
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- RLS for admin_users table (drop and recreate to ensure correct policies)
DROP POLICY IF EXISTS "Only super admins can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Only super admins can manage admin_users" ON public.admin_users;

CREATE POLICY "Only super admins can view admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = auth.uid() AND a.is_active = true
    )
  );

CREATE POLICY "Only super admins can manage admin_users"
  ON public.admin_users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = auth.uid() AND a.is_active = true
    )
  );

-- 2. UPDATE is_super_admin FUNCTION - Use admin_users table instead of metadata
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id_param uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = user_id_param 
      AND is_active = true
  );
$$;

-- 3. FIX group_testimonials RLS - RESTRICT TO AUTHENTICATED USERS ONLY
DROP POLICY IF EXISTS "Todos podem visualizar depoimentos" ON public.group_testimonials;
DROP POLICY IF EXISTS "Authenticated users can view testimonials" ON public.group_testimonials;

CREATE POLICY "Authenticated users can view testimonials"
  ON public.group_testimonials FOR SELECT
  TO authenticated
  USING (true);

-- 4. FIX psychologist_presence RLS - RESTRICT SENSITIVE DATA
DROP POLICY IF EXISTS "Public can view available psychologists" ON public.psychologist_presence;
DROP POLICY IF EXISTS "Authenticated users can view psychologist presence" ON public.psychologist_presence;

CREATE POLICY "Authenticated users can view psychologist presence"
  ON public.psychologist_presence FOR SELECT
  TO authenticated
  USING (true);

-- 5. ADD EXPLICIT POLICIES TO psychologist_payments
DROP POLICY IF EXISTS "Deny public access to payments" ON public.psychologist_payments;
CREATE POLICY "Deny public access to payments"
  ON public.psychologist_payments FOR ALL
  TO anon
  USING (false);

-- 6. ADD SUPER ADMIN ACCESS TO patients TABLE
DROP POLICY IF EXISTS "Super admins can view all patients" ON public.patients;
CREATE POLICY "Super admins can view all patients"
  ON public.patients FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- 7. SPLIT fcm_tokens ALL POLICY
DROP POLICY IF EXISTS "Users can manage their own FCM tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can insert their own FCM tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can update their own FCM tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can delete their own FCM tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can view their own FCM tokens" ON public.fcm_tokens;

CREATE POLICY "Users can insert their own FCM tokens"
  ON public.fcm_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own FCM tokens"
  ON public.fcm_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own FCM tokens"
  ON public.fcm_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own FCM tokens"
  ON public.fcm_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 8. UPDATE get_user_type FUNCTION WITH PROPER search_path
CREATE OR REPLACE FUNCTION public.get_user_type(user_id_param uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN public.is_super_admin(user_id_param) THEN 'admin'
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = user_id_param AND user_type = 'psychologist') THEN 'psychologist'
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = user_id_param AND user_type = 'patient') THEN 'patient'
      ELSE 'unknown'
    END;
$$;

-- 9. UPDATE validate_route_access WITH PROPER search_path
CREATE OR REPLACE FUNCTION public.validate_route_access(user_id_param uuid, route_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_type_val text;
BEGIN
  user_type_val := public.get_user_type(user_id_param);
  
  CASE 
    WHEN route_path LIKE '/admin%' THEN
      RETURN user_type_val = 'admin';
    WHEN route_path LIKE '/psych%' OR route_path LIKE '/psychologist%' THEN
      RETURN user_type_val = 'psychologist';
    WHEN route_path LIKE '/patient%' OR route_path LIKE '/user%' THEN
      RETURN user_type_val = 'patient';
    ELSE
      RETURN true;
  END CASE;
END;
$$;

-- 10. CREATE SECURITY AUDIT TRIGGER FOR ADMIN CHANGES
CREATE OR REPLACE FUNCTION public.audit_admin_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id, 
    action, 
    table_name, 
    record_id,
    old_values, 
    new_values
  ) VALUES (
    auth.uid(), 
    TG_OP, 
    'admin_users',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_admin_users_changes ON public.admin_users;
CREATE TRIGGER audit_admin_users_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_admin_changes();

-- 11. COMMENT DOCUMENTATION
COMMENT ON TABLE public.admin_users IS 'Stores admin role assignments separately from user profiles for security';
COMMENT ON FUNCTION public.is_super_admin IS 'Securely checks if a user has admin privileges using the admin_users table';
COMMENT ON POLICY "Authenticated users can view testimonials" ON public.group_testimonials IS 'Restricts testimonial viewing to authenticated users only for privacy';
COMMENT ON POLICY "Authenticated users can view psychologist presence" ON public.psychologist_presence IS 'Restricts presence data to authenticated users only';