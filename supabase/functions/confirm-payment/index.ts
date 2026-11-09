import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminMfaSatisfied } from '../_shared/adminMfa.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user is super admin
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_super_admin', {
      user_id_param: user.id,
    });

    // Também exige a verificação em duas etapas (token aal2).
    if (adminError || !isAdmin || !(await adminMfaSatisfied(authHeader))) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { psychologist_id, expected_amount, pix_e2e_id, receipt_path } = await req.json();
    if (!psychologist_id) {
      return new Response(
        JSON.stringify({ error: 'psychologist_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reconciliation: a payout is only marked as paid with the PIX end-to-end
    // id (32 chars, starts with "E") — the identifier both banks' statements
    // show — so it can be checked later against the bank statement.
    const e2e = typeof pix_e2e_id === 'string' ? pix_e2e_id.trim().toUpperCase() : '';
    if (!/^E[0-9A-Z]{31}$/.test(e2e)) {
      return new Response(
        JSON.stringify({ error: 'Informe o código E2E do PIX (32 caracteres, começa com E), que aparece no comprovante.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (receipt_path !== undefined && receipt_path !== null &&
        (typeof receipt_path !== 'string' || !receipt_path.startsWith(`${psychologist_id}/`))) {
      return new Response(
        JSON.stringify({ error: 'Comprovante inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Numa operação só no banco: confere o valor pendente (a soma dos itens
    // ainda não pagos), marca os itens como pagos, atualiza os totais e grava
    // o registro com o E2E (único). Antes eram passos separados: se o registro
    // falhasse, o repasse ficava pago sem o E2E.
    const { data: result, error: confirmError } = await supabase.rpc('confirm_psychologist_payout', {
      p_psychologist_id: psychologist_id,
      p_expected_amount: typeof expected_amount === 'number' ? expected_amount : null,
      p_pix_e2e_id: e2e,
      p_receipt_path: receipt_path ?? null,
      p_admin_id: user.id,
      p_admin_email: user.email ?? null,
    });

    if (confirmError) {
      const code = (confirmError as { code?: string }).code;
      const status = code === 'P0002' ? 404 : code === 'P0001' || code === '40001' || code === '23505' ? 409 : 500;
      if (status === 500) console.error('Error confirming payment:', confirmError);
      return new Response(
        JSON.stringify({ error: code === '23505' ? 'Esse código E2E já foi usado em outro repasse.' : confirmError.message }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const payment = { total_pending_amount: (result as { amount_paid?: number } | null)?.amount_paid ?? 0 };

    // Registro na Auditoria do painel.
    const { data: psy } = await supabase.from('psychologists').select('user_id, full_name').eq('id', psychologist_id).maybeSingle();
    await supabase.from('admin_audit_log').insert({
      admin_id: user.id,
      action: 'confirm_payout',
      target_type: 'psychologist',
      target_id: psy?.user_id ?? null,
      target_name: psy?.full_name ?? null,
      details: { amount: payment.total_pending_amount, pix_e2e_id: e2e },
    });

    console.log(`Payment confirmed for psychologist ${psychologist_id} by admin ${user.id}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment confirmed successfully',
        amount_paid: payment.total_pending_amount
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Payment confirmation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});