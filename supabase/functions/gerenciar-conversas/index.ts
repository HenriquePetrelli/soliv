import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedCaller, unauthorized } from '../_shared/guards.ts';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(monitored("gerenciar-conversas", async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional shared secret (same pattern as reset-weekly-goals): once
    // CRON_SECRET is configured as an edge function secret, only callers
    // sending a matching x-cron-secret header (the pg_cron job) get through.
    // Só o pg_cron (x-cron-secret) ou outra função (service role).
    if (!(await isTrustedCaller(req))) return unauthorized(corsHeaders);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting conversation management...');
    
    // Executar função de gerenciamento de expiração
    const { error } = await supabaseClient.rpc('gerenciar_expiracao_conversas');
    
    if (error) {
      console.error('Error managing conversations:', error);
      throw error;
    }

    console.log('Conversation management completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conversas gerenciadas com sucesso' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in gerenciar-conversas function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
}));