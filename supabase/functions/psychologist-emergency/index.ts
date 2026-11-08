
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { isPriorityTriage } from '../_shared/sosTriage.ts';
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
    'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS, DELETE',
    'Access-Control-Allow-Credentials': 'true'
  };
};

// Helper function to check if psychologist can help with patient symptoms
async function canPsychologistHelp(supabase: SupabaseClient, psychologistId: string, patientSymptoms: string[]) {
  try {
    // 1. Get psychologist's area of attention
    const { data: psychologist, error: psychError } = await supabase
      .from('psychologists')
      .select('area_atendimento')
      .eq('user_id', psychologistId)
      .single();

    if (psychError || !psychologist?.area_atendimento) {
      console.error('Error fetching psychologist:', psychError);
      return false;
    }

    // 2. Get symptoms associated with the psychologist's disorder
    const { data: transtornoData, error: transtornoError } = await supabase
      .from('transtornos_sintomas')
      .select('sintomas')
      .eq('transtorno', psychologist.area_atendimento)
      .single();

    if (transtornoError || !transtornoData?.sintomas) {
      console.error('Error fetching disorder symptoms:', transtornoError);
      return false;
    }

    // 3. Check if there's intersection between patient symptoms and disorder symptoms
    const transtornoSintomas = transtornoData.sintomas;
    const hasMatch = patientSymptoms.some((symptom: string) => 
      transtornoSintomas.includes(symptom)
    );

    return hasMatch;
  } catch (error) {
    console.error('Error in matching logic:', error);
    return false;
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    // Verify user is a psychologist
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.user_type !== 'psychologist') {
      throw new Error('Access denied. Psychologist access required.');
    }

    if (req.method === 'GET' || req.method === 'POST') {
      console.log('📋 Psychologist requesting emergency list');
      
      // A fila (com nome e sintomas do paciente) é só para psicólogo aprovado
      // e não bloqueado — a mesma regra da policy do banco, que esta função
      // pula por usar a chave de serviço.
      const { data: canSeeQueue } = await supabase.rpc('psychologist_can_attend', {
        p_user_id: user.id,
      });
      if (!canSeeQueue) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Pedidos pendentes ainda dentro dos 10 minutos de espera.
      const { data: emergencyRequests, error } = await supabase
        .from('emergency_requests')
        .select('*')
        .eq('status', 'pending')
        .gt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching emergency requests:', error);
        throw error;
      }
      console.log(`✅ Found ${emergencyRequests?.length || 0} emergency requests with status pending`);
      
      if (emergencyRequests && emergencyRequests.length > 0) {
        console.log('📝 Emergency request IDs:', emergencyRequests.map(r => r.id));
        console.log('📝 Emergency request statuses:', emergencyRequests.map(r => `${r.id}: ${r.status}`));
      }

      // Enhance requests with patient information - show ALL emergency requests
      const enhancedRequests = [];
      
      for (const request of emergencyRequests || []) {
        console.log(`🔍 Processing emergency ${request.id} for patient ${request.patient_id}`);
        
        // Get patient profile for display
        const { data: patientProfile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', request.patient_id)
          .maybeSingle();

        if (profileError) {
          console.error(`❌ Error fetching patient profile for ${request.patient_id}:`, profileError);
        }

        // Get patient symptoms for additional context (optional)
        const { data: patient } = await supabase
          .from('patients')
          .select('sintomas_selecionados')
          .eq('user_id', request.patient_id)
          .maybeSingle();

        // Always include the emergency request - in emergency situations, any psychologist should be able to help
        enhancedRequests.push({
          ...request,
          patient: {
            full_name: patientProfile?.full_name || 'Paciente',
            symptoms: patient?.sintomas_selecionados || []
          }
        });
        
        console.log(`✅ Enhanced emergency ${request.id} with patient name: ${patientProfile?.full_name || 'Paciente'}`);
      }

      // Risco marcado na triagem (suicídio, perigo) vai para a frente da fila;
      // dentro de cada grupo, o pedido mais antigo primeiro.
      enhancedRequests.sort((a, b) => {
        const pa = isPriorityTriage(a.triage) ? 0 : 1;
        const pb = isPriorityTriage(b.triage) ? 0 : 1;
        return pa - pb || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      console.log(`📤 Returning ${enhancedRequests.length} emergency requests to psychologist`);

      return new Response(
        JSON.stringify(enhancedRequests),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (req.method === 'PUT') {
      // Accept/decline emergency request
      let requestBody;
      try {
        const rawBody = await req.text();
        if (!rawBody || rawBody.trim() === '') {
          throw new Error('Empty request body');
        }
        requestBody = JSON.parse(rawBody);
      } catch (parseError) {
        console.error('JSON parsing failed:', parseError);
        throw new Error(`Invalid request body: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      const { requestId, action } = requestBody;

      if (!requestId || !action || !['accept', 'decline'].includes(action)) {
        throw new Error('Invalid request parameters');
      }

      if (action === 'accept') {
        // Eligibility is enforced server-side: approved, not blocked and not
        // already attending another emergency call.
        const { data: canAttend } = await supabase.rpc('psychologist_can_attend', {
          p_user_id: user.id,
        });

        if (!canAttend) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Sua conta não está habilitada para atender emergências no momento.',
              code: 'PSYCHOLOGIST_NOT_ELIGIBLE',
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: ongoingCall } = await supabase
          .from('emergency_requests')
          .select('id')
          .eq('accepted_by', user.id)
          .in('status', ['accepted', 'in_progress'])
          .is('ended_at', null)
          .neq('id', requestId)
          .limit(1)
          .maybeSingle();

        if (ongoingCall) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Você já está em um atendimento de emergência. Finalize-o antes de aceitar outro.',
              code: 'PSYCHOLOGIST_BUSY',
              ongoing_request_id: ongoingCall.id,
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // First check if the request still exists and is pending

        const { data: existingRequest, error: checkError } = await supabase
          .from('emergency_requests')
          .select('id, status, accepted_by')
          .eq('id', requestId)
          .maybeSingle();

        if (checkError) {
          console.error('Error checking emergency request:', checkError);
          throw new Error('Erro ao verificar solicitação de emergência');
        }

        if (!existingRequest) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Esta solicitação de emergência não existe mais ou foi cancelada pelo paciente',
              code: 'REQUEST_NOT_FOUND'
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        if (existingRequest.status !== 'pending') {
          const statusMessage = existingRequest.status === 'accepted' 
            ? 'Esta solicitação já foi aceita por outro psicólogo'
            : `Esta solicitação não está mais disponível (status: ${existingRequest.status})`;
          
          return new Response(
            JSON.stringify({
              success: false,
              error: statusMessage,
              code: 'REQUEST_NOT_AVAILABLE'
            }),
            {
              status: 409,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Accept the emergency request and save the session_id
        const { data: updatedRequest, error } = await supabase
          .from('emergency_requests')
          .update({
            status: 'accepted',
            accepted_by: user.id,
            accepted_at: new Date().toISOString()
          })
          .eq('id', requestId)
          .eq('status', 'pending') // Only accept if still pending
          .select()
          .single();

        if (error) {
          console.error('Error accepting emergency request:', error);
          
          // Handle specific database errors
          // Regras do banco (guard_sos_concurrency): pedido expirado ou
          // psicólogo já em outro atendimento.
          if (error.code === 'P0001') {
            return new Response(
              JSON.stringify({ success: false, error: error.message, code: 'REQUEST_NOT_AVAILABLE' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (error.code === 'PGRST116') {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Esta solicitação não está mais disponível - pode ter sido aceita por outro psicólogo',
                code: 'REQUEST_ALREADY_TAKEN'
              }),
              {
                status: 409,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
          
          throw error;
        }

        // Audit trail: persist the acceptance in the SOS lifecycle trace.
        if (updatedRequest) {
          await supabase.from('sos_trace_events').insert({
            trace_id: `req:${requestId}`,
            emergency_request_id: requestId,
            event_type: 'request_accepted',
            actor_user_id: user.id,
            actor_type: 'psychologist',
            message: 'Psicólogo aceitou a solicitação de emergência',
            metadata: { accepted_at: updatedRequest.accepted_at },
          });
        }

        if (!updatedRequest) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Solicitação não pôde ser aceita - pode ter sido cancelada pelo paciente',
              code: 'REQUEST_UNAVAILABLE'
            }),
            {
              status: 409,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Create WebRTC session after accepting the emergency
        console.log('Creating WebRTC session for accepted emergency request:', requestId);
        
        try {
          // Check for existing WebRTC session first
          const { data: existingSession, error: existingError } = await supabase
            .from("webrtc_sessions")
            .select("*")
            .eq("emergency_request_id", requestId)
            .maybeSingle();

          let sessionId;
          
          if (existingSession) {
            console.log('Reusing existing WebRTC session:', existingSession.id);
            sessionId = existingSession.id;

            // Refresh the row so a reused/stale session never lands the
            // participants on an "expired session" screen.
            const { error: refreshError } = await supabase
              .from("webrtc_sessions")
              .update({
                psychologist_id: user.id,
                patient_id: updatedRequest.patient_id,
                status: "pending",
                offer: null,
                answer: null,
                ice_candidates: [],
                ended_at: null,
                ended_by: null,
                ended_by_type: null,
                end_reason: null,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingSession.id);

            if (refreshError) {
              console.error('Failed to refresh existing WebRTC session:', refreshError);
            }

          } else {
            // Create new WebRTC session
            const sessionData = {
              emergency_request_id: requestId,
              psychologist_id: user.id,
              patient_id: updatedRequest.patient_id,
              status: "pending",
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            };

            console.log('Creating new WebRTC session:', sessionData);

            const { data: newSession, error: sessionError } = await supabase
              .from("webrtc_sessions")
              .insert(sessionData)
              .select()
              .single();

            if (sessionError) {
              console.error('Failed to create WebRTC session:', sessionError);
              throw new Error(`Falha ao criar sessão de vídeo: ${sessionError.message}`);
            }

            sessionId = newSession.id;
            console.log('WebRTC session created successfully:', sessionId);
          }

          // CRITICAL: Update the emergency_requests table with the session_id
          const { error: updateSessionError } = await supabase
            .from('emergency_requests')
            .update({
              video_room_id: sessionId,
              room_url: sessionId // For backward compatibility
            })
            .eq('id', requestId);

          if (updateSessionError) {
            console.error('Error updating emergency request with session_id:', updateSessionError);
            // Continue anyway, session was created successfully
          } else {
            console.log('Emergency request updated with session_id:', sessionId);
          }

          // Mark the psychologist as busy so the queue stops routing to them.
          // A DB trigger clears this automatically when the request finishes.
          await supabase
            .from('psychologist_presence')
            .upsert(
              {
                psychologist_id: user.id,
                current_emergency_id: requestId,
                last_online: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'psychologist_id' }
            );



          return new Response(
            JSON.stringify({
              success: true,
              message: 'Emergência aceita com sucesso',
              emergency_request: updatedRequest,
              session_id: sessionId,
              webrtc_data: {
                session_id: sessionId,
                stun_servers: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"]
              }
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );

        } catch (sessionError) {
          console.error('Error creating WebRTC session:', sessionError);
          
          // Still return success for the emergency acceptance, but indicate session creation failed
          return new Response(
            JSON.stringify({
              success: true,
              message: 'Emergência aceita, mas houve erro ao criar sessão de vídeo',
              emergency_request: updatedRequest,
              session_error: sessionError instanceof Error ? sessionError.message : String(sessionError),
              // Return null session_id so frontend can handle it appropriately
              session_id: null,
              webrtc_data: null
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      } else {
        // For decline, we don't need to update the request - it remains available for other psychologists
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Emergência recusada'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error: unknown) {
    console.error('Error in psychologist-emergency function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
