import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { isTrustedCaller, unauthorized } from '../_shared/guards.ts';
import { errorMessage } from '../_shared/errors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

const handler = async (req: Request): Promise<Response> => {
  console.log('Psychologist cleanup function called');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional shared secret (same pattern as reset-weekly-goals): once
    // CRON_SECRET is configured as an edge function secret, only callers
    // sending a matching x-cron-secret header (the pg_cron job) get through.
    // Só o pg_cron (x-cron-secret) ou outra função (service role).
    if (!(await isTrustedCaller(req))) return unauthorized(corsHeaders);

    // Find rejected psychologists older than 3 days
    const { data: rejectedPsychologists, error: queryError } = await supabase
      .from('psychologist_registrations')
      .select(`
        user_id,
        rejected_at,
        rejection_reason
      `)
      .eq('status', 'rejected')
      .not('rejected_at', 'is', null);

    if (queryError) {
      console.error('Error querying rejected psychologists:', queryError);
      throw queryError;
    }

    console.log(`Found ${rejectedPsychologists?.length || 0} rejected psychologists`);

    let cleanedCount = 0;
    const now = new Date();

    for (const rejected of rejectedPsychologists || []) {
      const rejectedDate = new Date(rejected.rejected_at);
      const daysSinceRejection = Math.floor((now.getTime() - rejectedDate.getTime()) / (1000 * 60 * 60 * 24));

      console.log(`Psychologist ${rejected.user_id}: ${daysSinceRejection} days since rejection`);

      if (daysSinceRejection > 3) {
        console.log(`Cleaning up psychologist ${rejected.user_id}`);

        try {
          // Get document path before deletion
          const { data: psychData } = await supabase
            .from('psychologists')
            .select('document_url')
            .eq('user_id', rejected.user_id)
            .single();

          // Delete documents from storage if they exist
          if (psychData?.document_url) {
            // Extract filename from URL
            const documentPath = psychData.document_url.split('/').pop();
            
            if (documentPath) {
              const { error: storageError } = await supabase.storage
                .from('psychologist-documents')
                .remove([documentPath]);
              
              if (storageError) {
                console.error(`Error deleting document ${documentPath}:`, storageError);
              } else {
                console.log(`Deleted document: ${documentPath}`);
              }
            }
          }

          // Delete from database tables
          const { error: deleteRegError } = await supabase
            .from('psychologist_registrations')
            .delete()
            .eq('user_id', rejected.user_id);

          if (deleteRegError) {
            console.error(`Error deleting registration for ${rejected.user_id}:`, deleteRegError);
            continue;
          }

          const { error: deletePsychError } = await supabase
            .from('psychologists')
            .delete()
            .eq('user_id', rejected.user_id);

          if (deletePsychError) {
            console.error(`Error deleting psychologist ${rejected.user_id}:`, deletePsychError);
            continue;
          }

          const { error: deleteProfileError } = await supabase
            .from('profiles')
            .delete()
            .eq('user_id', rejected.user_id)
            .eq('user_type', 'psychologist');

          if (deleteProfileError) {
            console.error(`Error deleting profile for ${rejected.user_id}:`, deleteProfileError);
          }

          // Delete user from auth
          const { error: deleteUserError } = await supabase.auth.admin.deleteUser(rejected.user_id);
          
          if (deleteUserError) {
            console.error(`Error deleting user ${rejected.user_id} from auth:`, deleteUserError);
          } else {
            console.log(`Successfully deleted user ${rejected.user_id} from auth`);
          }

          cleanedCount++;
          console.log(`Successfully cleaned up psychologist ${rejected.user_id}`);

        } catch (error) {
          console.error(`Error cleaning up psychologist ${rejected.user_id}:`, error);
        }
      }
    }

    console.log(`Cleanup complete. Cleaned up ${cleanedCount} rejected psychologists.`);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Cleanup complete. Cleaned up ${cleanedCount} rejected psychologists.`,
      cleanedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    console.error('Error in cleanup function:', error);
    return new Response(JSON.stringify({ 
      error: errorMessage(error) || 'Erro interno do servidor' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
};

serve(handler);