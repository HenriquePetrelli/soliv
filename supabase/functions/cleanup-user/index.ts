import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupUserRequest {
  userId: string;
}

Deno.serve(monitored("cleanup-user", async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    const { userId }: CleanupUserRequest = await req.json();

    // This function performs a full, irreversible account deletion. It is
    // only meant to roll back a signup that just failed for the caller's own
    // still-incomplete account, so only self-cleanup is allowed.
    if (userId !== user.id) {
      throw new Error('You can only clean up your own account');
    }

    // Só conta recém-criada e ainda incompleta: antes qualquer conta (psicólogo
    // aprovado com consultas, admin) se apagava por aqui, pulando a exclusão
    // de conta normal (delete-own-account), que cancela consultas e cuida do
    // repasse e dos dados.
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const recent = Date.now() - createdAt < 24 * 60 * 60 * 1000;
    const [{ data: approved }, { data: admin }, { count: appointments }] = await Promise.all([
      supabaseAdmin.from('psychologists').select('id').eq('user_id', userId).eq('approved', true).maybeSingle(),
      supabaseAdmin.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
      supabaseAdmin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .or(`patient_id.eq.${userId},psychologist_id.eq.${userId}`),
    ]);
    if (!recent || approved || admin || (appointments ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: 'Para excluir sua conta, use Perfil > Excluir conta.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Starting cleanup for user:', userId);

    // 1. Remove documents from storage
    const { data: files } = await supabaseAdmin.storage
      .from('documents')
      .list(userId);
    
    if (files && files.length > 0) {
      const filesToRemove = files.map(f => `${userId}/${f.name}`);
      await supabaseAdmin.storage
        .from('documents')
        .remove(filesToRemove);
      console.log('Documents removed from storage');
    }

    // 2. Remove from database tables (in order due to constraints)
    await supabaseAdmin
      .from('psychologist_registrations')
      .delete()
      .eq('user_id', userId);

    await supabaseAdmin
      .from('psychologists')
      .delete()
      .eq('user_id', userId);

    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    console.log('Database records removed');

    // 3. Delete user from auth (requires admin privileges)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error('Error deleting user from auth:', deleteUserError);
      throw deleteUserError;
    }

    console.log('User successfully deleted from auth');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User cleanup completed successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in cleanup-user function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to cleanup user' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
}));