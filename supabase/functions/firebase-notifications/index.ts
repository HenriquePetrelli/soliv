import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebaseServiceAccount, getAccessToken, sendToTokens } from '../_shared/fcm.ts';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Explicit token list — the only targeting mode supported today. */
  tokens?: string[];
  /** Tela aberta ao tocar (também aceito em data.url). */
  url?: string;
  /** SOS: prioridade alta e validade curta. */
  urgent?: boolean;
  ttl_seconds?: number;
  tag?: string;
}

Deno.serve(monitored("firebase-notifications", async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // This function is meant to be called server-to-server (from another
    // edge function that just wrote a notification) as well as by a
    // logged-in user's own client, so both a service-role caller (no user
    // JWT) and an authenticated user are accepted — but a bare request
    // with neither is not.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const callerToken = authHeader.replace('Bearer ', '');
    const isServiceRoleCall = callerToken === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let callerUserId: string | null = null;
    if (!isServiceRoleCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(callerToken);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      callerUserId = user.id;
    }

    const payload: NotificationPayload = await req.json();

    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: 'Title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!payload.tokens || payload.tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: 'tokens must be provided (a non-empty array)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // A non-service-role caller (a logged-in user's own client) may only
    // push to devices registered to themselves — fcm_tokens' own RLS
    // already enforces this for reads through the normal Supabase client,
    // but this function uses the service-role client internally and must
    // re-check ownership itself, otherwise any authenticated user could
    // target an arbitrary FCM token (someone else's device) with a
    // title/body of their choosing.
    if (!isServiceRoleCall) {
      const { data: ownedTokens } = await supabase
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', callerUserId)
        .in('token', payload.tokens);

      const ownedSet = new Set((ownedTokens ?? []).map((t) => t.token));
      payload.tokens = payload.tokens.filter((t) => ownedSet.has(t));

      if (payload.tokens.length === 0) {
        return new Response(
          JSON.stringify({ error: 'None of the provided tokens belong to the authenticated user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Requires three secrets from a Firebase service account JSON
    // (Project Settings → Service Accounts → Generate new private key):
    // FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID.
    const serviceAccount = firebaseServiceAccount();
    if (!serviceAccount) {
      return new Response(
        JSON.stringify({ error: 'Firebase configuration not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getAccessToken(serviceAccount);
    const results = await sendToTokens(serviceAccount, accessToken, payload.tokens, {
      title: payload.title,
      body: payload.body,
      url: payload.url ?? payload.data?.url,
      data: payload.data,
      urgent: Boolean(payload.urgent),
      ttlSeconds: payload.ttl_seconds,
      tag: payload.tag,
    });
    const successCount = results.filter((r) => r.ok).length;

    // Aparelhos que o Firebase diz que não existem mais (app desinstalado,
    // permissão revogada): desativados para não gastar envio com eles.
    const deadTokens = results.filter((r) => r.dead).map((r) => r.token);
    if (deadTokens.length > 0) {
      await supabase.from('fcm_tokens').update({ is_active: false }).in('token', deadTokens);
    }

    await supabase.from('notification_logs').insert({
      user_id: callerUserId,
      title: payload.title,
      body: payload.body,
      recipient_count: successCount,
      // Sem os tokens dos aparelhos: só o resultado de cada envio.
      fcm_response: { results: results.map((r) => ({ ok: r.ok, dead: r.dead, error: r.error ?? null })) },
    });

    return new Response(
      JSON.stringify({
        message: 'Notifications processed',
        sent: successCount,
        total: payload.tokens.length,
        transient: results.some((r) => r.transient) && successCount === 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in firebase-notifications function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
