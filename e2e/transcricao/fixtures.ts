/**
 * Dados de teste da transcrição, no Supabase LOCAL (`supabase start`).
 *
 * Cria um paciente e uma psicóloga aprovada com a chave de serviço local e
 * apaga tudo no fim (os registros saem em cascata com os logins). Nunca
 * apontar para produção: a URL padrão é a do Supabase local e a chave de
 * serviço local é a de demonstração que o próprio `supabase start` imprime.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const LOCAL = {
  url: process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  anonKey:
    process.env.E2E_SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  serviceKey:
    process.env.E2E_SUPABASE_SERVICE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  /** Edge functions servidas pelo `functionsHost.ts` (Deno da máquina). */
  functionsUrl: process.env.E2E_FUNCTIONS_URL ?? 'http://127.0.0.1:54399/functions/v1',
  gatewayLog: process.env.E2E_GATEWAY_LOG ?? 'http://127.0.0.1:8787/log',
};

/** Chamadas a `/functions/v1/` vão para o servidor de funções do teste. */
export const functionsFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const rewritten = url.replace(`${LOCAL.url}/functions/v1`, LOCAL.functionsUrl);
  return fetch(rewritten === url ? input : rewritten, init);
};

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(LOCAL.url)) {
  throw new Error(`Os testes de transcrição só rodam no Supabase local (recebido ${LOCAL.url}).`);
}

export const admin = createClient(LOCAL.url, LOCAL.serviceKey, { auth: { persistSession: false } });

const LEGAL = ['age_18', 'terms_patient', 'terms_psychologist', 'privacy_policy', 'health_data_consent'].map((document) => ({
  document,
  version: '1.0',
}));

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  token: string;
}

const tag = () => `e2etx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const randomCpf = () => {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const check = (base: number[]) => {
    const sum = base.reduce((s, d, i) => s + d * (base.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  digits.push(check(digits));
  digits.push(check(digits));
  return digits.join('');
};

const signIn = async (email: string, password: string) => {
  const client = createClient(LOCAL.url, LOCAL.anonKey, { auth: { persistSession: false }, global: { fetch: functionsFetch } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error('sem sessão');
  return { client, token: data.session.access_token };
};

const createUser = async (kind: 'patient' | 'psychologist', name: string): Promise<TestUser> => {
  const email = `${tag()}.${kind}@example.com`;
  const password = `Senha-${tag()}-9`;
  const metadata =
    kind === 'patient'
      ? { user_type: 'patient', full_name: name, cpf: randomCpf(), state: 'SP', city: 'São Paulo', legal_acceptances: LEGAL }
      : { user_type: 'psychologist', full_name: name, legal_acceptances: LEGAL };
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (error || !data.user) throw error ?? new Error('usuário não criado');
  return { id: data.user.id, email, password, ...(await signIn(email, password)) };
};

const must = async <T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> => {
  const { data, error } = await promise;
  if (error) throw new Error(JSON.stringify(error));
  return data;
};

export interface Fixture {
  patient: TestUser;
  psychologist: TestUser;
  outsider: TestUser;
  cleanup: () => Promise<void>;
}

export const createFixture = async (): Promise<Fixture> => {
  const patient = await createUser('patient', 'Paciente Teste Transcrição');
  const psychologist = await createUser('psychologist', 'Dra. Teste Transcrição');
  const outsider = await createUser('patient', 'Outra Pessoa');

  // Paciente com identidade confirmada (exigida para SOS e consulta).
  await must(admin.from('patients').update({ identity_status: 'aprovado' }).in('user_id', [patient.id, outsider.id]));

  // Psicóloga aprovada.
  await must(
    admin.from('psychologists').insert({
      user_id: psychologist.id,
      full_name: 'Dra. Teste Transcrição',
      email: psychologist.email,
      crp_number: '06/999999',
      approved: true,
      approval_status: 'approved',
    }),
  );
  await must(admin.from('psychologist_registrations').insert({ user_id: psychologist.id, status: 'approved' }));

  const cleanup = async () => {
    for (const user of [patient, psychologist, outsider]) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
  };
  return { patient, psychologist, outsider, cleanup };
};

/** Consulta confirmada começando agora (a sala abre 10 min antes). */
export const createAppointment = async (fx: Fixture, startsInMinutes = 0) => {
  // Um horário por vez para a psicóloga: a consulta anterior do teste sai da agenda.
  await must(
    admin.from('appointments').update({ status: 'cancelled' }).eq('psychologist_id', fx.psychologist.id).neq('status', 'cancelled'),
  );
  const row = await must(
    admin
      .from('appointments')
      .insert({
        patient_id: fx.patient.id,
        psychologist_id: fx.psychologist.id,
        scheduled_at: new Date(Date.now() + startsInMinutes * 60_000).toISOString(),
        status: 'confirmed',
        appointment_type: 'regular',
        duration: 50,
      })
      .select('id')
      .single(),
  );
  return (row as { id: string }).id;
};

/** Crédito avulso de SOS, para o paciente poder pedir SOS sem plano. */
export const giveSosCredit = (userId: string) =>
  must(
    admin.from('extra_credits').insert({
      user_id: userId,
      kind: 'sos',
      amount_cents: 100,
      price_tier: 'free',
      stripe_payment_intent_id: `pi_teste_${tag()}`,
    }),
  );

export const segmentsOf = async (sessionId: string) =>
  (await must(
    admin
      .from('call_transcript_segments')
      .select('speaker_id, speaker_role, started_at, duration_ms, content')
      .eq('webrtc_session_id', sessionId)
      .order('started_at'),
  )) as { speaker_id: string; speaker_role: string; started_at: string; duration_ms: number; content: string }[];

export interface GatewayEntry {
  ok: boolean;
  error?: string;
  format?: number;
  channels?: number;
  sampleRate?: number;
  bits?: number;
  seconds?: number;
  text?: string;
  scores?: { text: string; score: number }[];
}

export const gatewayLog = async (): Promise<GatewayEntry[]> => (await fetch(LOCAL.gatewayLog)).json();
export const clearGatewayLog = () => fetch(LOCAL.gatewayLog, { method: 'DELETE' });

export const PHRASES = {
  patient: 'Eu estou me sentindo muito ansioso com o trabalho e não consigo dormir.',
  psychologist: 'Entendo. Vamos respirar juntos, devagar, e conversar sobre isso.',
};
