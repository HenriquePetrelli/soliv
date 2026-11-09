import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { adminMfaSatisfied } from "../_shared/adminMfa.ts";
import { errorMessage } from '../_shared/errors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(resendKey);


interface ApprovalRequest {
  psychologist_id: string;
}

interface RejectionRequest extends ApprovalRequest {
  rejection_reason?: string;
}

// Nome e motivo vêm de texto livre (do psicólogo e do admin): escapar antes de pôr no HTML do e-mail.
const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));

const generateApprovalEmail = (name: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cadastro Aprovado - Soliv</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #4CAF50;">Parabéns! Seu cadastro foi aprovado!</h1>
    
    <p>Olá, ${escapeHtml(name)}!</p>
    
    <p>Temos o prazer de informar que seu cadastro como psicólogo na plataforma Soliv foi <strong>aprovado</strong>!</p>
    
    <p>Agora você pode:</p>
    <ul>
      <li>Acessar o painel do psicólogo</li>
      <li>Configurar sua disponibilidade</li>
      <li>Atender consultas de emergência</li>
      <li>Agendar consultas com pacientes</li>
    </ul>
    
    <p>Seja bem-vindo à nossa equipe!</p>
    
    <p>Atenciosamente,<br>Equipe Soliv</p>
  </div>
</body>
</html>
`;

const generateRejectionEmail = (name: string, reason?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cadastro não aprovado - Soliv</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #f44336;">Cadastro não aprovado</h1>
    
    <p>Olá, ${escapeHtml(name)}!</p>
    
    <p>Infelizmente, seu cadastro como psicólogo na plataforma Soliv não foi aprovado neste momento.</p>
    
    ${reason ? `<p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
    
    <p>Você pode tentar se cadastrar novamente após verificar e corrigir as informações necessárias.</p>
    
    <p>Se tiver dúvidas, entre em contato conosco.</p>
    
    <p>Atenciosamente,<br>Equipe Soliv</p>
  </div>
</body>
</html>
`;

const generatePendingEmail = (name: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cadastro recebido - Soliv</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #2196F3;">Cadastro recebido com sucesso!</h1>
    
    <p>Olá, ${escapeHtml(name)}!</p>
    
    <p>Recebemos seu cadastro como psicólogo na plataforma Soliv.</p>
    
    <p>Seus dados estão sendo analisados por nossa equipe. Você receberá uma resposta em até 48 horas.</p>
    
    <p>Obrigado por seu interesse em fazer parte da nossa plataforma!</p>
    
    <p>Atenciosamente,<br>Equipe Soliv</p>
  </div>
</body>
</html>
`;

const validateInput = (data: Record<string, unknown>, requiredFields: string[]) => {
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Campo obrigatório ausente: ${field}`);
    }
  }
};

const checkSuperAdminPermission = async (userId: string) => {
  const { data, error } = await supabase.rpc('is_super_admin', { user_id_param: userId });
  if (error) throw new Error('Erro ao verificar permissões');
  return data === true;
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Recebida requisição:', req.method, new URL(req.url).pathname);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Token de autorização ausente');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Token inválido');
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Registrar novo psicólogo
    //
    // Esta função grava com a service role, que pula o gatilho
    // a_guard_psychologist_client_write. Antes o corpo da requisição ia
    // inteiro para o insert: qualquer conta logada podia mandar
    // `approved: true` / `approval_status: 'approved'` e virar psicólogo
    // aprovado (com acesso à fila do SOS), ou cadastrar outro `user_id`, e o
    // e-mail de confirmação ia para qualquer endereço, com HTML do atacante.
    // Agora: só a própria conta, só os campos do formulário, sempre pendente.
    if (req.method === 'POST' && action === 'register') {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') throw new Error('Corpo da requisição inválido');

      if (body.user_id !== undefined && body.user_id !== user.id) {
        throw new Error('Você só pode cadastrar a sua própria conta');
      }
      if (!user.email) throw new Error('Conta sem e-mail');

      const text = (key: string, max: number, required = false): string | null => {
        const value = body[key];
        if (value === undefined || value === null || value === '') {
          if (required) throw new Error(`Campo obrigatório ausente: ${key}`);
          return null;
        }
        if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
          throw new Error(`Campo inválido: ${key}`);
        }
        return value.trim();
      };

      const documentUrl = text('document_url', 2048);
      if (documentUrl && /^[a-z][a-z0-9+.-]*:/i.test(documentUrl) && !/^https:\/\//i.test(documentUrl)) {
        throw new Error('Campo inválido: document_url');
      }

      const insertData = {
        user_id: user.id,
        email: user.email,
        full_name: text('full_name', 200, true),
        crp_number: text('crp_number', 30, true),
        cpf: text('cpf', 20),
        specialization: text('specialization', 200),
        bio: text('bio', 5000),
        state: text('state', 50),
        city: text('city', 100),
        address: text('address', 300),
        document_url: documentUrl,
        approved: false,
        approval_status: 'pending',
        is_blocked: false,
        submitted_at: new Date().toISOString(),
      };

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile?.user_type === 'patient') {
        throw new Error('Usuários já cadastrados como pacientes não podem se registrar como psicólogos');
      }

      const { data: existingOwn } = await supabase
        .from('psychologists')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existingOwn) {
        throw new Error('Esta conta já tem um cadastro de psicólogo');
      }

      // Mensagem única para CRP/CPF repetidos: não revela qual dado já existe.
      const duplicateChecks = [
        supabase.from('psychologists').select('id').eq('crp_number', insertData.crp_number).limit(1),
        supabase.from('psychologists').select('id').eq('email', insertData.email).limit(1),
        ...(insertData.cpf ? [supabase.from('psychologists').select('id').eq('cpf', insertData.cpf).limit(1)] : []),
      ];
      const duplicates = await Promise.all(duplicateChecks);
      if (duplicates.some((r) => (r.data ?? []).length > 0)) {
        throw new Error('Já existe um cadastro com estes dados (CRP, CPF ou e-mail).');
      }

      const { data, error } = await supabase
        .from('psychologists')
        .insert([insertData])
        .select('id, full_name, approval_status')
        .single();

      if (error) throw error;

      const { error: regError } = await supabase
        .from('psychologist_registrations')
        .insert({
          user_id: user.id,
          status: 'pending',
          submitted_at: new Date().toISOString()
        });

      if (regError) {
        console.error('Erro ao criar registro de aprovação:', regError);
      }

      await resend.emails.send({
        from: 'Soliv <onboarding@resend.dev>',
        to: [user.email],
        subject: 'Cadastro recebido - Soliv',
        html: generatePendingEmail(insertData.full_name ?? ''),
      });

      console.log('Psicólogo registrado com sucesso:', data.id);

      return new Response(JSON.stringify({
        success: true,
        data: data,
        message: 'Cadastro realizado com sucesso! Você receberá um email com atualizações.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      });
    }

    // Verificar permissões de admin para outras operações
    // Também exige a verificação em duas etapas (token aal2).
    const isAdmin = (await checkSuperAdminPermission(user.id)) && (await adminMfaSatisfied(authHeader));
    if (!isAdmin) {
      throw new Error('Acesso negado. Apenas administradores podem realizar esta operação.');
    }

    // Buscar psicólogos pendentes
    if (req.method === 'GET' && action === 'pending') {
      const { data, error } = await supabase
        .from('psychologists')
        .select(`
          id,
          full_name,
          email,
          crp_number,
          specialization,
          bio,
          submitted_at,
          documents,
          approval_status,
          pix_key,
          pix_type,
          is_blocked,
          blocked_until,
          blocked_reason,
          blocked_at
        `)
        .eq('approval_status', 'pending')
        .order('submitted_at', { ascending: true });
      
      if (error) throw error;
      
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar todos os psicólogos
    if (req.method === 'GET' && action === 'all') {
      const { data, error } = await supabase
        .from('psychologists')
        .select(`
          id,
          full_name,
          email,
          cpf,
          crp_number,
          specialization,
          bio,
          state,
          document_url,
          submitted_at,
          documents,
          approval_status,
          pix_key,
          pix_type,
          is_blocked,
          blocked_until,
          blocked_reason,
          blocked_at
        `)
        .order('submitted_at', { ascending: false });
      
      if (error) throw error;
      
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar psicólogo específico
    if (req.method === 'GET' && url.searchParams.get('id')) {
      const psychologistId = url.searchParams.get('id');
      
      const { data, error } = await supabase
        .from('psychologists')
        .select('*')
        .eq('id', psychologistId)
        .single();
      
      if (error) throw error;
      
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Aprovar psicólogo
    if (req.method === 'POST' && action === 'approve') {
      const { psychologist_id }: ApprovalRequest = await req.json();

      validateInput({ psychologist_id }, ['psychologist_id']);

      // Buscar dados do psicólogo antes da aprovação
      const { data: psychologist, error: fetchError } = await supabase
        .from('psychologists')
        .select('*')
        .eq('id', psychologist_id)
        .single();

      if (fetchError || !psychologist) {
        throw new Error('Psicólogo não encontrado');
      }

      // Usar função RPC para aprovação. admin_id vem do usuário já
      // verificado (user.id), nunca do corpo da requisição — do contrário
      // qualquer admin poderia atribuir a aprovação a outro admin no
      // registro permanente de auditoria (reviewed_by).
      const { error: approvalError } = await supabase.rpc('handle_psychologist_approval', {
        psychologist_id: psychologist_id,
        admin_id: user.id
      });
      
      if (approvalError) throw approvalError;

      // Registro na Auditoria do painel (antes aprovar e recusar não apareciam).
      await supabase.from('admin_audit_log').insert({
        admin_id: user.id,
        action: 'approve_psychologist',
        target_type: 'psychologist',
        target_id: psychologist.user_id ?? null,
        target_name: psychologist.full_name ?? null,
        details: {},
      });

      // Enviar email de aprovação. A aprovação já valeu: falha no e-mail não
      // vira erro para o admin (antes ele via "erro" e tentava de novo).
      try {
        await resend.emails.send({
          from: 'Soliv <onboarding@resend.dev>',
          to: [psychologist.email],
          subject: 'Cadastro aprovado - Soliv',
          html: generateApprovalEmail(psychologist.full_name),
        });
      } catch (emailError) {
        console.error('Falha ao enviar e-mail de aprovação:', emailError);
      }
      
      console.log('Psicólogo aprovado com sucesso:', psychologist_id);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Psicólogo aprovado com sucesso!' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rejeitar psicólogo
    if (req.method === 'POST' && action === 'reject') {
      const { psychologist_id, rejection_reason }: RejectionRequest = await req.json();

      validateInput({ psychologist_id }, ['psychologist_id']);

      // Buscar dados do psicólogo antes da rejeição
      const { data: psychologist, error: fetchError } = await supabase
        .from('psychologists')
        .select('*')
        .eq('id', psychologist_id)
        .single();

      if (fetchError || !psychologist) {
        throw new Error('Psicólogo não encontrado');
      }

      // Usar função RPC para rejeição. admin_id vem do usuário já
      // verificado (user.id), nunca do corpo da requisição — mesmo motivo
      // da correção em "approve" acima.
      const { error: rejectionError } = await supabase.rpc('handle_psychologist_rejection', {
        psychologist_id: psychologist_id,
        admin_id: user.id,
        rejection_reason: rejection_reason || null
      });
      
      if (rejectionError) throw rejectionError;

      await supabase.from('admin_audit_log').insert({
        admin_id: user.id,
        action: 'reject_psychologist',
        target_type: 'psychologist',
        target_id: psychologist.user_id ?? null,
        target_name: psychologist.full_name ?? null,
        details: rejection_reason ? { reason: String(rejection_reason).slice(0, 1000) } : {},
      });

      // Enviar email de rejeição (a recusa já valeu; falha no e-mail não vira erro).
      try {
        await resend.emails.send({
          from: 'Soliv <onboarding@resend.dev>',
          to: [psychologist.email],
          subject: 'Cadastro não aprovado - Soliv',
          html: generateRejectionEmail(psychologist.full_name, rejection_reason),
        });
      } catch (emailError) {
        console.error('Falha ao enviar e-mail de recusa:', emailError);
      }
      
      console.log('Psicólogo rejeitado:', psychologist_id);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Psicólogo rejeitado com sucesso!' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Ação não encontrada' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } catch (error: unknown) {
    console.error('Erro na função:', error);
    return new Response(JSON.stringify({ 
      error: errorMessage(error) || 'Erro interno do servidor' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
};

serve(handler);