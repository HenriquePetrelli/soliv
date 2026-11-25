-- Criar nova conta admin e corrigir estrutura de autenticação

-- 1. Criar nova conta admin com email admin@calmconnect.com
-- Primeiro, vamos verificar se já existe e limpar se necessário
DELETE FROM public.admin_users WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin@calmconnect.com'
);

-- 2. Remover vínculo admin do henriquepetrelli96@gmail.com
UPDATE public.profiles 
SET user_type = 'psychologist' 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'henriquepetrelli96@gmail.com'
) AND user_type = 'admin';

DELETE FROM public.admin_users 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'henriquepetrelli96@gmail.com'
);

-- 3. Função para criar conta admin segura
CREATE OR REPLACE FUNCTION public.create_admin_account(
  admin_email text,
  admin_password text,
  admin_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  new_user_id uuid;
  result json;
BEGIN
  -- Verificar se já existe um admin com este email
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
    RETURN json_build_object('error', 'Email já existe');
  END IF;

  -- Criar usuário via auth (simulado - na prática será feito via edge function)
  -- Por enquanto, vamos criar o perfil manualmente
  new_user_id := gen_random_uuid();
  
  -- Inserir no profiles
  INSERT INTO public.profiles (user_id, user_type, full_name)
  VALUES (new_user_id, 'admin'::user_type, admin_name);
  
  -- Inserir no admin_users
  INSERT INTO public.admin_users (user_id, granted_by, is_active)
  VALUES (new_user_id, new_user_id, true);
  
  RETURN json_build_object(
    'success', true,
    'user_id', new_user_id,
    'email', admin_email,
    'message', 'Conta admin criada. Use edge function para criar usuário completo.'
  );
END;
$$;

-- 4. Função para verificar tipo de usuário de forma segura
CREATE OR REPLACE FUNCTION public.get_user_type(user_id_param uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = user_id_param AND is_active = true) THEN 'admin'
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = user_id_param AND user_type = 'psychologist') THEN 'psychologist'
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = user_id_param AND user_type = 'patient') THEN 'patient'
      ELSE 'unknown'
    END;
$$;

-- 5. Atualizar políticas RLS para separação de sessões
-- Profiles - Restringir acesso baseado no tipo de usuário
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id OR 
  (public.is_admin() AND user_type IN ('patient', 'psychologist'))
);

-- Emergency requests - Admins podem ver tudo
DROP POLICY IF EXISTS "Admins can view all emergency requests" ON public.emergency_requests;
CREATE POLICY "Admins can view all emergency requests" ON public.emergency_requests
FOR SELECT
USING (public.is_admin());

-- Appointments - Separar acesso por tipo
CREATE POLICY "Admins can view all appointments" ON public.appointments
FOR SELECT
USING (public.is_admin());

-- 6. Função para validar acesso a rotas
CREATE OR REPLACE FUNCTION public.validate_route_access(
  user_id_param uuid,
  route_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
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
      RETURN true; -- Rotas públicas
  END CASE;
END;
$$;