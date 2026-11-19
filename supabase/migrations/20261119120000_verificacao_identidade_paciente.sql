-- Verificação de identidade do paciente.
--
-- O paciente envia uma foto do documento; o admin confere e aprova (ou recusa).
-- SOS e agendamento só funcionam com a identidade aprovada (conferido também
-- nas funções emergency-sos e appointments, não só na tela).
--
-- A modal que pede o documento aparece:
--   1) uma vez, no primeiro login (identity_prompt_seen_at);
--   2) se a pessoa escolheu "Não autenticar agora", mais uma vez, quando ela
--      pagar um plano pela primeira vez (identity_prompt_after_plan_at);
--   3) sempre que ela tocar em SOS ou Agendamento sem a identidade aprovada.

-- 1. Colunas na linha do paciente.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'nao_enviado',
  ADD COLUMN IF NOT EXISTS identity_document_path text,
  ADD COLUMN IF NOT EXISTS identity_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS identity_rejection_reason text,
  ADD COLUMN IF NOT EXISTS identity_prompt_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_prompt_after_plan_at timestamptz;

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_identity_status_check;
ALTER TABLE public.patients
  ADD CONSTRAINT patients_identity_status_check
  CHECK (identity_status IN ('nao_enviado', 'pendente', 'aprovado', 'recusado'));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_identity_rejection_reason_len;
ALTER TABLE public.patients
  ADD CONSTRAINT patients_identity_rejection_reason_len
  CHECK (identity_rejection_reason IS NULL OR length(identity_rejection_reason) <= 500);

COMMENT ON COLUMN public.patients.identity_status IS
  'nao_enviado | pendente (aguardando o admin) | aprovado | recusado. SOS e agendamento exigem aprovado.';
COMMENT ON COLUMN public.patients.identity_prompt_seen_at IS 'Quando a modal de identidade do primeiro login foi mostrada.';
COMMENT ON COLUMN public.patients.identity_prompt_after_plan_at IS 'Quando a modal foi mostrada de novo após o primeiro pagamento de plano.';

CREATE INDEX IF NOT EXISTS idx_patients_identity_pending
  ON public.patients (identity_submitted_at)
  WHERE identity_status = 'pendente';

-- 2. O paciente não aprova a própria identidade: só as colunas da modal
--    (identity_prompt_*) podem ser gravadas pelo app. O envio passa pela
--    função submit_patient_identity e a decisão por review_patient_identity.
CREATE OR REPLACE FUNCTION public.guard_patient_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_user <> 'authenticated' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.identity_status := 'nao_enviado';
    NEW.identity_document_path := NULL;
    NEW.identity_submitted_at := NULL;
    NEW.identity_reviewed_at := NULL;
    NEW.identity_reviewed_by := NULL;
    NEW.identity_rejection_reason := NULL;
    RETURN NEW;
  END IF;

  NEW.identity_status := OLD.identity_status;
  NEW.identity_document_path := OLD.identity_document_path;
  NEW.identity_submitted_at := OLD.identity_submitted_at;
  NEW.identity_reviewed_at := OLD.identity_reviewed_at;
  NEW.identity_reviewed_by := OLD.identity_reviewed_by;
  NEW.identity_rejection_reason := OLD.identity_rejection_reason;
  -- Marcas da modal só vão de vazio para preenchido (não "reabrem").
  IF OLD.identity_prompt_seen_at IS NOT NULL THEN
    NEW.identity_prompt_seen_at := OLD.identity_prompt_seen_at;
  END IF;
  IF OLD.identity_prompt_after_plan_at IS NOT NULL THEN
    NEW.identity_prompt_after_plan_at := OLD.identity_prompt_after_plan_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_patient_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_patient_identity() TO service_role;

-- "b_": roda depois de a_guard_patient_client_write.
DROP TRIGGER IF EXISTS b_guard_patient_identity ON public.patients;
CREATE TRIGGER b_guard_patient_identity
  BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.guard_patient_identity();

-- 3. Bucket privado para os documentos (pasta = id do usuário).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-identity',
  'patient-identity',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Paciente envia o próprio documento de identidade" ON storage.objects;
CREATE POLICY "Paciente envia o próprio documento de identidade"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-identity'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Paciente e admin leem documento de identidade" ON storage.objects;
CREATE POLICY "Paciente e admin leem documento de identidade"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-identity'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_super_admin())
    )
  );

DROP POLICY IF EXISTS "Admin apaga documento de identidade" ON storage.objects;
CREATE POLICY "Admin apaga documento de identidade"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-identity' AND (SELECT public.is_super_admin()));

-- 4. Paciente envia o documento (depois de subir o arquivo no bucket).
CREATE OR REPLACE FUNCTION public.submit_patient_identity(p_document_path text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Faça login novamente.';
  END IF;
  IF p_document_path IS NULL
     OR split_part(p_document_path, '/', 1) <> v_uid::text
     OR length(p_document_path) > 300 THEN
    RAISE EXCEPTION 'Documento inválido.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'patient-identity' AND name = p_document_path
  ) THEN
    RAISE EXCEPTION 'O arquivo do documento não foi encontrado. Envie de novo.';
  END IF;

  SELECT identity_status INTO v_status FROM public.patients WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro de paciente não encontrado.';
  END IF;
  IF v_status = 'aprovado' THEN
    RETURN 'aprovado';
  END IF;

  UPDATE public.patients
     SET identity_status = 'pendente',
         identity_document_path = p_document_path,
         identity_submitted_at = now(),
         identity_reviewed_at = NULL,
         identity_reviewed_by = NULL,
         identity_rejection_reason = NULL,
         identity_prompt_seen_at = COALESCE(identity_prompt_seen_at, now())
   WHERE user_id = v_uid;

  -- Avisa os admins que há documento para conferir.
  BEGIN
    INSERT INTO public.notifications (patient_id, title, message)
    SELECT au.user_id,
           'Nova identidade de paciente para verificar',
           'Um paciente enviou o documento de identidade e aguarda verificação (prazo: 24 horas).'
      FROM public.admin_users au
     WHERE au.is_active = true;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN 'pendente';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_patient_identity(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_patient_identity(text) TO authenticated;

-- 5. Admin aprova ou recusa.
CREATE OR REPLACE FUNCTION public.review_patient_identity(
  p_patient_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_status text;
  v_name text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar identidades.';
  END IF;
  IF NOT p_approve AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Informe o motivo da recusa.';
  END IF;

  SELECT user_id, identity_status, full_name INTO v_user, v_status, v_name FROM public.patients WHERE id = p_patient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.';
  END IF;
  IF p_approve AND v_status = 'nao_enviado' THEN
    RAISE EXCEPTION 'O paciente ainda não enviou o documento.';
  END IF;

  UPDATE public.patients
     SET identity_status = CASE WHEN p_approve THEN 'aprovado' ELSE 'recusado' END,
         identity_reviewed_at = now(),
         identity_reviewed_by = auth.uid(),
         identity_rejection_reason = CASE WHEN p_approve THEN NULL ELSE left(btrim(p_reason), 500) END
   WHERE id = p_patient_id;

  -- Fica no registro de auditoria do painel (quem conferiu e o que decidiu).
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_approve THEN 'approve_identity' ELSE 'reject_identity' END,
    'patient',
    p_patient_id,
    v_name,
    jsonb_strip_nulls(jsonb_build_object('previous_status', v_status, 'reason', CASE WHEN p_approve THEN NULL ELSE left(btrim(p_reason), 500) END))
  );

  -- Avisa o paciente no app.
  IF v_user IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (patient_id, title, message, status, push, link)
      VALUES (
        v_user,
        CASE WHEN p_approve THEN 'Identidade confirmada' ELSE 'Identidade não confirmada' END,
        CASE WHEN p_approve
          THEN 'Sua identidade foi confirmada. O SOS e o agendamento de consultas já estão liberados.'
          ELSE 'Não conseguimos confirmar sua identidade: ' || left(btrim(p_reason), 500) || ' Envie um novo documento pelo app.'
        END,
        'unread',
        true,
        CASE WHEN p_approve THEN '/home' ELSE '/home?identidade=1' END
      );
    EXCEPTION WHEN OTHERS THEN
      -- Notificação é um extra: não desfaz a revisão se a tabela recusar.
      NULL;
    END;
  END IF;

  RETURN CASE WHEN p_approve THEN 'aprovado' ELSE 'recusado' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_patient_identity(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_patient_identity(uuid, boolean, text) TO authenticated;

-- 6. Usado pelas funções do servidor (SOS e agendamento).
CREATE OR REPLACE FUNCTION public.patient_identity_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT identity_status = 'aprovado' FROM public.patients WHERE user_id = p_user_id),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.patient_identity_verified(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_identity_verified(uuid) TO service_role;
