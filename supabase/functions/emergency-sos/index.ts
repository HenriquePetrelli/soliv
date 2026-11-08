import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { isPriorityTriage, sanitizeTriage } from "../_shared/sosTriage.ts";
import { errorMessage } from '../_shared/errors.ts';

const getCorsHeaders = (origin: string | null) => {
  // Check if origin is from Lovable domains or localhost
  const isLovableOrigin = origin && (
    origin.includes('sandbox.lovable.dev') ||
    origin.includes('lovable.app') ||
    origin.startsWith('http://localhost')
  );
  
  return {
    'Access-Control-Allow-Origin': isLovableOrigin ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  console.log('🆘 emergency-sos function called, method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🆘 Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    console.log('🆘 Authorization header present:', !!authHeader);
    
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    console.log('🆘 User authentication result:', { userId: user?.id, error: authError?.message });

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    // Verify user type from profile - only patients and psychologists can access SOS
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    console.log('🆘 User profile:', { userId: user.id, userType: profile?.user_type });

    if (!profile || (profile.user_type !== 'patient' && profile.user_type !== 'psychologist')) {
      throw new Error('Access denied. Invalid user type.');
    }

    if (req.method === 'POST') {
      console.log('🆘 POST request - Creating emergency request for patient:', user.id);

      // Só paciente pede SOS (o psicólogo atende).
      if (profile.user_type !== 'patient') {
        throw new Error('Access denied. Only patients can request SOS.');
      }

      // Cap rapid-fire create/cancel cycles from flooding the psychologist
      // queue — a real crisis doesn't need more than a handful of attempts
      // in a short window.
      const { data: withinLimit } = await supabase.rpc('check_rate_limit', {
        p_key: `emergency-sos:${user.id}`,
        p_max_requests: 5,
        p_window_seconds: 600,
      });
      if (withinLimit === false) {
        throw new Error('Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.');
      }

      // A patient that is already inside an open flow must be sent back to it
      // instead of creating a duplicated request.
      const { data: existingRequest } = await supabase
        .from('emergency_requests')
        .select('id, status, video_room_id')
        .eq('patient_id', user.id)
        .in('status', ['pending', 'accepted', 'in_progress'])
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRequest) {
        console.log('🆘 User already has active request:', existingRequest.id);
        return new Response(
          JSON.stringify({
            success: true,
            emergency_request_id: existingRequest.id,
            status: existingRequest.status,
            session_id: existingRequest.video_room_id,
            message: 'Você já tem uma solicitação de emergência ativa. Aguardando resposta dos psicólogos.'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Patient must not be blocked.
      const { data: patientRow } = await supabase
        .from('patients')
        .select('is_blocked, blocked_until, blocked_reason')
        .eq('user_id', user.id)
        .maybeSingle();

      const blockActive =
        patientRow?.is_blocked === true &&
        (!patientRow?.blocked_until || new Date(patientRow.blocked_until) > new Date());

      if (blockActive) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'PATIENT_BLOCKED',
            error: patientRow?.blocked_reason
              ? `Sua conta está bloqueada: ${patientRow.blocked_reason}`
              : 'Sua conta está temporariamente bloqueada para atendimentos de emergência.',
          }),
          // This is an expected business-rule outcome, not a transport failure.
          // Returning 200 lets the SPA render the blocked state without Supabase
          // promoting the response to a FunctionsHttpError/runtime error.
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Subscription / monthly SOS quota is enforced server-side.
      const { data: quota, error: quotaError } = await supabase
        .rpc('can_use_sos', { p_user_id: user.id })
        .maybeSingle();

      if (quotaError) {
        console.error('❌ Error checking SOS quota:', quotaError);
      } else if (quota && quota.can_use === false) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'SOS_NOT_ALLOWED',
            error: quota.reason || 'Seu plano não permite o uso do SOS neste momento.',
            plan_type: quota.plan_type ?? null,
          }),
          // Subscription/quota denial is an expected application response.
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }



      // Create emergency request
      console.log('🆘 Creating emergency request for patient:', user.id);
      
      // Triagem opcional (o que o paciente marcou na confirmação). Só as
      // opções conhecidas; corpo ausente ou inválido = sem triagem.
      const requestBody = await req.json().catch(() => null) as { triage?: unknown; channel?: unknown } | null;
      const triage = sanitizeTriage(requestBody?.triage);
      // "Por vídeo" (padrão) ou "Por mensagem", escolhido na confirmação.
      const channel = requestBody?.channel === 'text' ? 'text' : 'video';

      const { data: emergencyRequest, error: insertError } = await supabase
        .from('emergency_requests')
        .insert({
          patient_id: user.id,
          status: 'pending',
          channel,
          ...(triage.length > 0 ? { triage } : {}),
        })
        .select()
        .single();

      if (insertError) {
        // Dois toques ao mesmo tempo: o banco recusa o segundo pedido
        // (guard_sos_concurrency). Devolve o pedido que já está aberto.
        if (insertError.code === '23505' || /SOS_ALREADY_OPEN/.test(insertError.message ?? '')) {
          const { data: openRequest } = await supabase
            .from('emergency_requests')
            .select('id, status, video_room_id')
            .eq('patient_id', user.id)
            .in('status', ['pending', 'accepted', 'in_progress'])
            .is('ended_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (openRequest) {
            return new Response(
              JSON.stringify({
                success: true,
                emergency_request_id: openRequest.id,
                status: openRequest.status,
                session_id: openRequest.video_room_id,
                message: 'Você já tem uma solicitação de emergência ativa. Aguardando resposta dos psicólogos.'
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        console.error('❌ Error creating emergency request:', insertError);
        throw new Error(`Erro ao criar solicitação: ${insertError.message}`);
      }

      console.log('✅ Emergency request created successfully:', {
        id: emergencyRequest.id,
        patient_id: emergencyRequest.patient_id,
        status: emergencyRequest.status,
        created_at: emergencyRequest.created_at
      });

      // Push psychologists' devices even when the app is closed — that's the
      // whole point of push: the in-app realtime queue and Web Notifications
      // only reach someone who already has the dashboard open. Targeting
      // only psychologists seen online in the last few minutes (as before)
      // meant exactly the people push exists for never got it. Target every
      // approved, unblocked psychologist who isn't already in another
      // emergency call. Best-effort: a push failure must never block SOS
      // creation itself.
      try {
        const { data: eligible } = await supabase
          .from('psychologists')
          .select('user_id, is_blocked, blocked_until')
          .eq('approved', true)
          .eq('approval_status', 'approved');

        const now = Date.now();
        const eligibleIds = (eligible ?? [])
          .filter((p) => !(p.is_blocked === true && (!p.blocked_until || new Date(p.blocked_until).getTime() > now)))
          .map((p) => p.user_id);

        const { data: busy } = eligibleIds.length > 0
          ? await supabase
              .from('psychologist_presence')
              .select('psychologist_id')
              .in('psychologist_id', eligibleIds)
              .not('current_emergency_id', 'is', null)
          : { data: [] as { psychologist_id: string }[] };
        const busyIds = new Set((busy ?? []).map((p) => p.psychologist_id));
        // Em consulta agendada agora: não chama (não pode aceitar até terminar).
        const { data: inConsultation } = eligibleIds.length > 0
          ? await supabase
              .from('appointments')
              .select('psychologist_id')
              .in('psychologist_id', eligibleIds)
              .eq('status', 'in_progress')
          : { data: [] as { psychologist_id: string }[] };
        for (const row of inConsultation ?? []) busyIds.add(row.psychologist_id);
        const targetIds = eligibleIds.filter((id) => !busyIds.has(id));

        if (targetIds.length > 0) {
          const { data: tokens } = await supabase
            .from('fcm_tokens')
            .select('token')
            .in('user_id', targetIds)
            .eq('is_active', true);

          if (tokens && tokens.length > 0) {
            await supabase.functions.invoke('firebase-notifications', {
              body: {
                // Texto discreto (tela bloqueada): diz só que é prioritário,
                // nunca o que o paciente marcou.
                title: isPriorityTriage(triage) ? 'Pedido de emergência prioritário' : 'Nova solicitação de emergência',
                body: channel === 'text'
                  ? 'Um paciente precisa de atendimento imediato, por mensagem.'
                  : 'Um paciente precisa de atendimento imediato.',
                tokens: tokens.map((t) => t.token),
                data: { type: 'sos', emergency_request_id: emergencyRequest.id },
                // Tocar abre a fila do SOS; entrega imediata e, se não chegar em
                // 10 min (o pedido já expirou), o Firebase descarta.
                url: '/psychologist-dashboard',
                urgent: true,
                ttl_seconds: 600,
                tag: `sos-${emergencyRequest.id}`,
              },
            });
          }
        }
      } catch (pushError) {
        console.error('Error sending SOS push notification:', pushError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          emergency_request_id: emergencyRequest.id,
          message: 'Solicitação de emergência enviada. Aguardando resposta dos psicólogos.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (req.method === 'GET') {
      // Check status of emergency request - GET requests should use URL params
      const url = new URL(req.url);
      const requestId = url.searchParams.get('request_id');

      if (!requestId) {
        return new Response(
          JSON.stringify({ 
            error: 'Request ID is required',
            message: 'Parameter request_id é obrigatório'
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: request, error } = await supabase
        .from('emergency_requests')
        .select('*')
        .eq('id', requestId)
        .eq('patient_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching emergency request:', error.message);
        return new Response(
          JSON.stringify({ 
            error: 'Database error',
            message: 'Erro interno do servidor. Tente novamente.',
            temporary: true
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // If request doesn't exist, return success with null data
      if (!request) {
        console.log('Emergency request not found:', requestId);
        return new Response(
          JSON.stringify({ 
            success: true,
            data: null,
            message: 'Solicitação não encontrada ou foi cancelada'
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Get psychologist name if request is accepted
      let psychologistName = null;
      if (request.accepted_by) {
        const { data: psychologist } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', request.accepted_by)
          .maybeSingle();
        
        psychologistName = psychologist?.full_name || null;
      }

      return new Response(
        JSON.stringify({
          ...request,
          psychologist: psychologistName ? { full_name: psychologistName } : null
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error: unknown) {
    console.error('Error in emergency-sos function:', errorMessage(error));
    return new Response(
      JSON.stringify({ error: errorMessage(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});