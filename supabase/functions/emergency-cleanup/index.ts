import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { monitored } from "../_shared/monitoring.ts";

const getCorsHeaders = (origin: string | null) => {
  // Check if origin is from Lovable domains or localhost
  const isLovableOrigin = origin && (
    origin.includes('sandbox.lovable.dev') ||
    origin.includes('lovable.app') ||
    origin.includes('preview--soliv.lovable.app') ||
    origin.startsWith('http://localhost')
  );
  
  return {
    'Access-Control-Allow-Origin': isLovableOrigin ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
};

serve(monitored("emergency-cleanup", async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse request body safely
    let requestBody;
    try {
      const rawBody = await req.text();
      if (!rawBody || rawBody.trim() === '') {
        throw new Error('Empty request body');
      }
      requestBody = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { request_id, patient_id, access_token } = requestBody;

    if (!request_id || !patient_id) {
      return new Response(
        JSON.stringify({ error: 'Missing request_id or patient_id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Só o próprio paciente cancela o pedido. Antes bastava saber o id do
    // pedido e do paciente (o psicólogo vê os dois na fila) para cancelar o
    // SOS de outra pessoa.
    const { data: auth } = typeof access_token === 'string'
      ? await supabase.auth.getUser(access_token)
      : { data: { user: null } };
    if (!auth.user || auth.user.id !== patient_id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the request exists and is still pending
    const { data: existingRequest, error: fetchError } = await supabase
      .from('emergency_requests')
      .select('*')
      .eq('id', request_id)
      .eq('patient_id', patient_id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !existingRequest) {
      return new Response(
        JSON.stringify({ message: 'No pending request to cleanup' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Keep the row for history: mark it as cancelled instead of deleting it
    const { error } = await supabase
      .from('emergency_requests')
      .update({
        status: 'cancelled',
        ended_at: new Date().toISOString(),
        ended_by: patient_id,
        ended_by_type: 'patient',
        end_reason: 'expired',
      })
      .eq('id', request_id)
      .eq('patient_id', patient_id)
      .eq('status', 'pending');

    if (error) {
      console.error('Error cancelling emergency request:', error);
      throw error;
    }


    console.log(`Emergency request ${request_id} cleaned up for patient ${patient_id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Emergency request cleaned up' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in emergency cleanup:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}));