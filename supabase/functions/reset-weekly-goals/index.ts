import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCaller, unauthorized } from '../_shared/guards.ts';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(monitored("reset-weekly-goals", async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Só o pg_cron (x-cron-secret) ou outra função (service role).
    if (!(await isTrustedCaller(req))) return unauthorized(corsHeaders);

    // Antes esta função APAGAVA as metas e o histórico de todos os pacientes
    // toda segunda-feira (a semana do app vai de domingo a sábado: o que foi
    // feito no domingo sumia). Agora a virada é pela função do banco, que só
    // convida a revisar as metas e mantém o histórico; a rotina do banco a
    // chama no domingo. Esta função ficou só para chamadas antigas.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await supabase.rpc('reset_weekly_goals');
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[RESET-WEEKLY-GOALS] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}));