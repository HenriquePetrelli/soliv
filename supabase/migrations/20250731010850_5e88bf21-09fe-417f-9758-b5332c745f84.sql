-- Criação da tabela psychologists
CREATE TABLE public.psychologists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  crp_number TEXT NOT NULL UNIQUE,
  specialization TEXT,
  bio TEXT,
  approved BOOLEAN DEFAULT FALSE,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  documents TEXT[], -- URLs dos documentos enviados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.psychologists ENABLE ROW LEVEL SECURITY;

-- Índices para melhor performance
CREATE INDEX idx_psychologists_approval_status ON public.psychologists(approval_status);
CREATE INDEX idx_psychologists_user_id ON public.psychologists(user_id);
CREATE INDEX idx_psychologists_email ON public.psychologists(email);

-- Política para admins verem todos os psicólogos
CREATE POLICY "Enable admin access to all psychologists" 
ON public.psychologists
FOR SELECT USING (
  public.is_super_admin()
);

-- Política para psicólogos verem apenas seu próprio registro
CREATE POLICY "Enable read access for own profile" 
ON public.psychologists
FOR SELECT USING (
  user_id = auth.uid()
);

-- Política para inserção (qualquer usuário autenticado pode se cadastrar)
CREATE POLICY "Enable insert for authenticated users" 
ON public.psychologists
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
);

-- Política para admins atualizarem registros
CREATE POLICY "Enable admin update access" 
ON public.psychologists
FOR UPDATE USING (
  public.is_super_admin()
);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_psychologists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_psychologists_updated_at
  BEFORE UPDATE ON public.psychologists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_psychologists_updated_at();

-- Função para notificar mudanças de status
CREATE OR REPLACE FUNCTION public.notify_psychologist_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approval_status <> OLD.approval_status THEN
    PERFORM pg_notify('psychologist_status_changed', 
      json_build_object(
        'psychologist_id', NEW.id,
        'new_status', NEW.approval_status,
        'email', NEW.email,
        'user_id', NEW.user_id
      )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar mudanças de status
CREATE TRIGGER psychologist_status_change
  AFTER UPDATE OF approval_status ON public.psychologists
  FOR EACH ROW 
  EXECUTE FUNCTION public.notify_psychologist_status_change();

-- Função para validar CRP único
CREATE OR REPLACE FUNCTION public.validate_unique_crp(crp_input TEXT, exclude_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.psychologists 
    WHERE crp_number = crp_input 
    AND (exclude_id IS NULL OR id != exclude_id)
  );
END;
$$;