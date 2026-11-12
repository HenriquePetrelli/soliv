import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isTrustedCaller, unauthorized } from '../_shared/guards.ts';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(monitored("cleanup-quarterly-activities", async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rotina agendada: só o pg_cron (x-cron-secret) ou outra função (service role).
  if (!(await isTrustedCaller(req))) return unauthorized(corsHeaders);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    console.log('Starting quarterly activities cleanup...');

    const { error } = await supabaseClient.rpc('cleanup_quarterly_activities');

    if (error) {
      console.error('Error cleaning up quarterly activities:', error);
      throw error;
    }

    console.log('Quarterly activities cleanup completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Quarterly activities cleaned up successfully',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}));