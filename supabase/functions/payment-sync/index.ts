import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedCaller } from '../_shared/guards.ts';
import { adminMfaSatisfied } from '../_shared/adminMfa.ts';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(monitored("payment-sync", async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Unlike every other payment/admin mutation in this codebase, this
    // endpoint never checked who was calling it — recalculating pending
    // payment amounts is triggered from the admin panel, not a public
    // action.
    // O job semanal (pg_cron) chama com x-cron-secret; antes ele mandava a
    // chave anônima e era sempre recusado aqui (só admin passava).
    const trusted = await isTrustedCaller(req);
    const authHeader = req.headers.get('Authorization');
    if (!trusted && !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!trusted) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(
        (authHeader ?? '').replace('Bearer ', '')
      );
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: isAdmin, error: adminError } = await supabase.rpc('is_super_admin', {
        user_id_param: user.id,
      });
      // Também exige a verificação em duas etapas (token aal2).
      if (adminError || !isAdmin || !(await adminMfaSatisfied(authHeader))) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Call the sync function
    const { error: syncError } = await supabase.rpc('sync_psychologist_payments');
    
    if (syncError) {
      console.error('Error syncing payments:', syncError);
      return new Response(
        JSON.stringify({ error: syncError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Payment sync completed successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment synchronization completed successfully' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Payment sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}));