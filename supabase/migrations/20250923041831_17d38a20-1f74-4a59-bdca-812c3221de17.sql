-- Create suporte_psicologo table
CREATE TABLE public.suporte_psicologo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  psicologo_id UUID REFERENCES auth.users(id),
  email_retorno TEXT NOT NULL,
  telefone_retorno TEXT,
  descricao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.suporte_psicologo ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Psychologists can create their own support tickets"
  ON public.suporte_psicologo
  FOR INSERT
  WITH CHECK (auth.uid() = psicologo_id);

CREATE POLICY "Psychologists can view their own support tickets"
  ON public.suporte_psicologo
  FOR SELECT
  USING (auth.uid() = psicologo_id);

CREATE POLICY "Super admins can view all psychologist support tickets"
  ON public.suporte_psicologo
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can update all psychologist support tickets"
  ON public.suporte_psicologo
  FOR UPDATE
  USING (is_super_admin());