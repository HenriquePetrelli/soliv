import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  LOCAL,
  PHRASES,
  admin,
  clearGatewayLog,
  createAppointment,
  createFixture,
  gatewayLog,
  giveSosCredit,
  segmentsOf,
  type Fixture,
  type TestUser,
} from './fixtures';

/**
 * Transcrição de ponta a ponta no servidor (Supabase local): banco, RPCs,
 * edge functions `transcribe-call-chunk` e `emergency-sos` de verdade, e o
 * gateway falso no lugar da Lovable. O navegador entra no `call.spec.ts`.
 */

const audio = (name: 'paciente' | 'psicologo') =>
  fs.readFileSync(new URL(`./audio/${name}.wav`, import.meta.url)).toString('base64');

const sendChunk = async (user: TestUser | null, body: Record<string, unknown>) => {
  const response = await fetch(`${LOCAL.functionsUrl}/transcribe-call-chunk`, {
    method: 'POST',
    headers: {
      apikey: LOCAL.anonKey,
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const chunk = (sessionId: string, file: 'paciente' | 'psicologo', offsetSeconds = 0) => ({
  session_id: sessionId,
  started_at: new Date(Date.now() - 30_000 + offsetSeconds * 1000).toISOString(),
  duration_ms: 7000,
  audio: audio(file),
});

let fx: Fixture;

test.beforeAll(async () => {
  fx = await createFixture();
});

test.afterAll(async () => {
  await fx?.cleanup();
});

test.beforeEach(async () => {
  await clearGatewayLog();
});

test('consulta: consentimento, sala, trechos dos dois lados e leitura pelo psicólogo', async () => {
  const appointmentId = await createAppointment(fx);

  // Antes do consentimento a sala existe, mas a transcrição fica desligada
  // e o servidor recusa áudio.
  const { data: sessionId, error: roomError } = await fx.patient.client.rpc('get_or_create_appointment_webrtc_session', {
    p_appointment_id: appointmentId,
  });
  expect(roomError).toBeNull();
  expect((await fx.patient.client.rpc('get_call_transcription_status', { p_session_id: sessionId })).data).toBe(false);
  const refused = await sendChunk(fx.patient, chunk(sessionId, 'paciente'));
  expect(refused.status).toBe(403);
  expect(refused.body.code).toBe('NO_CONSENT');
  expect(await gatewayLog()).toHaveLength(0);

  // Só o paciente da consulta consente.
  expect(
    (await fx.psychologist.client.rpc('give_appointment_transcription_consent', { p_appointment_id: appointmentId, p_version: '1.0' })).error,
  ).not.toBeNull();
  expect(
    (await fx.outsider.client.rpc('give_appointment_transcription_consent', { p_appointment_id: appointmentId, p_version: '1.0' })).error,
  ).not.toBeNull();

  const consent = await fx.patient.client.rpc('give_appointment_transcription_consent', { p_appointment_id: appointmentId, p_version: '1.0' });
  expect(consent.error).toBeNull();
  const { data: stored } = await admin.from('appointments').select('transcription_consent_at, transcription_consent_version').eq('id', appointmentId).single();
  expect(stored?.transcription_consent_at).toBeTruthy();
  expect(stored?.transcription_consent_version).toBe('1.0');

  // Os dois lados veem a transcrição ligada; quem não está na sala, não.
  expect((await fx.patient.client.rpc('get_call_transcription_status', { p_session_id: sessionId })).data).toBe(true);
  expect((await fx.psychologist.client.rpc('get_call_transcription_status', { p_session_id: sessionId })).data).toBe(true);
  expect((await fx.outsider.client.rpc('get_call_transcription_status', { p_session_id: sessionId })).data).toBe(false);

  // Cada lado manda a própria voz.
  const fromPatient = await sendChunk(fx.patient, chunk(sessionId, 'paciente', 0));
  const fromPsychologist = await sendChunk(fx.psychologist, chunk(sessionId, 'psicologo', 10));
  expect(fromPatient).toEqual({ status: 200, body: { ok: true } });
  expect(fromPsychologist).toEqual({ status: 200, body: { ok: true } });

  // O gateway recebeu WAV 16 kHz mono, e cada áudio bateu com a voz certa.
  const log = await gatewayLog();
  expect(log).toHaveLength(2);
  for (const entry of log) {
    expect(entry).toMatchObject({ ok: true, format: 1, channels: 1, sampleRate: 16000, bits: 16 });
  }
  expect(log.map((e) => e.text)).toEqual([PHRASES.patient, PHRASES.psychologist]);

  const segments = await segmentsOf(sessionId);
  expect(segments.map((s) => [s.speaker_role, s.speaker_id, s.content])).toEqual([
    ['patient', fx.patient.id, PHRASES.patient],
    ['psychologist', fx.psychologist.id, PHRASES.psychologist],
  ]);

  // Reenvio do mesmo trecho (rede caiu na resposta) não duplica.
  const retry = chunk(sessionId, 'paciente', 0);
  retry.started_at = segments[0].started_at;
  expect((await sendChunk(fx.patient, retry)).status).toBe(200);
  expect(await segmentsOf(sessionId)).toHaveLength(2);

  // Leitura: psicólogo e paciente da consulta; os outros, não.
  const read = await fx.psychologist.client.rpc('get_call_transcript', { p_appointment_id: appointmentId });
  expect(read.error).toBeNull();
  expect(read.data.map((r: { speaker_role: string; content: string }) => [r.speaker_role, r.content])).toEqual([
    ['patient', PHRASES.patient],
    ['psychologist', PHRASES.psychologist],
  ]);
  expect((await fx.patient.client.rpc('get_call_transcript', { p_appointment_id: appointmentId })).data).toHaveLength(2);
  expect((await fx.outsider.client.rpc('get_call_transcript', { p_appointment_id: appointmentId })).error).not.toBeNull();

  // A tabela não é lida direto pelo app (só pela RPC).
  expect((await fx.psychologist.client.from('call_transcript_segments').select('id')).data).toEqual([]);
  expect((await fx.patient.client.from('call_transcript_segments').insert({
    webrtc_session_id: sessionId, speaker_id: fx.patient.id, speaker_role: 'psychologist', started_at: new Date().toISOString(), duration_ms: 1, content: 'forjado',
  })).error).not.toBeNull();
});

test('recusas do servidor: sem login, fora da sala, áudio inválido, silêncio, chamada encerrada', async () => {
  const appointmentId = await createAppointment(fx);
  const { data: sessionId } = await fx.patient.client.rpc('get_or_create_appointment_webrtc_session', { p_appointment_id: appointmentId });
  await fx.patient.client.rpc('give_appointment_transcription_consent', { p_appointment_id: appointmentId, p_version: '1.0' });

  // Sem login, o verify_jwt da função já recusa.
  expect((await sendChunk(null, chunk(sessionId, 'paciente'))).status).toBe(401);
  // Outra pessoa logada não manda áudio para a sala dos outros.
  expect((await sendChunk(fx.outsider, chunk(sessionId, 'paciente'))).status).toBe(403);
  // Formato.
  expect((await sendChunk(fx.patient, { ...chunk(sessionId, 'paciente'), audio: Buffer.from('não é wav'.repeat(10)).toString('base64') })).status).toBe(400);
  expect((await sendChunk(fx.patient, { ...chunk(sessionId, 'paciente'), duration_ms: 0 })).status).toBe(400);

  // Silêncio: o gateway devolve vazio e nada é gravado.
  const silence = Buffer.alloc(44 + 16000 * 2 * 3);
  silence.write('RIFF', 0); silence.writeUInt32LE(36 + 16000 * 6, 4); silence.write('WAVE', 8); silence.write('fmt ', 12);
  silence.writeUInt32LE(16, 16); silence.writeUInt16LE(1, 20); silence.writeUInt16LE(1, 22); silence.writeUInt32LE(16000, 24);
  silence.writeUInt32LE(32000, 28); silence.writeUInt16LE(2, 32); silence.writeUInt16LE(16, 34); silence.write('data', 36); silence.writeUInt32LE(16000 * 6, 40);
  const quiet = await sendChunk(fx.patient, { ...chunk(sessionId, 'paciente'), audio: silence.toString('base64') });
  expect(quiet).toEqual({ status: 200, body: { ok: true, empty: true } });
  expect(await segmentsOf(sessionId)).toHaveLength(0);

  // Chamada encerrada há mais de 5 min: 409.
  await admin.from('webrtc_sessions').update({ ended_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', sessionId);
  const late = await sendChunk(fx.patient, chunk(sessionId, 'paciente'));
  expect(late.status).toBe(409);
  expect(late.body.code).toBe('CALL_ENDED');
});

test('SOS: o consentimento vai no pedido e libera a transcrição da sala', async () => {
  await giveSosCredit(fx.patient.id);
  const invoke = (body: Record<string, unknown>) => fx.patient.client.functions.invoke('emergency-sos', { body });

  // Por mensagem, o consentimento enviado é ignorado (não há áudio).
  const text = await invoke({ channel: 'text', transcription_consent: true, transcription_consent_version: '1.0' });
  expect(text.error).toBeNull();
  const textId = text.data?.emergency_request?.id ?? text.data?.id ?? text.data?.request_id;
  const { data: textRow } = await admin
    .from('emergency_requests')
    .select('id, channel, transcription_consent_at')
    .eq('patient_id', fx.patient.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(textRow?.channel).toBe('text');
  expect(textRow?.transcription_consent_at).toBeNull();
  if (textId) expect(textRow?.id).toBe(textId);
  await admin.from('emergency_requests').update({ status: 'cancelled' }).eq('id', textRow!.id);

  // Por vídeo, com consentimento: gravado com a versão.
  await giveSosCredit(fx.patient.id);
  const video = await invoke({ channel: 'video', transcription_consent: true, transcription_consent_version: '1.0' });
  expect(video.error).toBeNull();
  const { data: videoRow } = await admin
    .from('emergency_requests')
    .select('id, channel, transcription_consent_at, transcription_consent_version')
    .eq('patient_id', fx.patient.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(videoRow).toMatchObject({ channel: 'video', transcription_consent_version: '1.0' });
  expect(videoRow?.transcription_consent_at).toBeTruthy();

  // Sala do SOS (o aceite do psicólogo cria; aqui direto no banco) transcreve.
  const { data: room } = await admin
    .from('webrtc_sessions')
    .insert({ patient_id: fx.patient.id, psychologist_id: fx.psychologist.id, emergency_request_id: videoRow!.id, status: 'active', expires_at: new Date(Date.now() + 3600_000).toISOString() })
    .select('id')
    .single();
  expect((await fx.psychologist.client.rpc('get_call_transcription_status', { p_session_id: room!.id })).data).toBe(true);
  expect((await sendChunk(fx.patient, chunk(room!.id, 'paciente'))).status).toBe(200);
  const read = await fx.psychologist.client.rpc('get_call_transcript', { p_emergency_request_id: videoRow!.id });
  expect(read.data.map((r: { content: string }) => r.content)).toEqual([PHRASES.patient]);
  await admin.from('emergency_requests').update({ status: 'cancelled' }).eq('id', videoRow!.id);

  // Por vídeo, sem marcar: nada gravado e a sala recusa áudio.
  await giveSosCredit(fx.patient.id);
  expect((await invoke({ channel: 'video', transcription_consent: false })).error).toBeNull();
  const { data: noConsent } = await admin
    .from('emergency_requests')
    .select('id, transcription_consent_at')
    .eq('patient_id', fx.patient.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(noConsent?.transcription_consent_at).toBeNull();
  const { data: room2 } = await admin
    .from('webrtc_sessions')
    .insert({ patient_id: fx.patient.id, psychologist_id: fx.psychologist.id, emergency_request_id: noConsent!.id, status: 'active', expires_at: new Date(Date.now() + 3600_000).toISOString() })
    .select('id')
    .single();
  expect((await sendChunk(fx.patient, chunk(room2!.id, 'paciente'))).body.code).toBe('NO_CONSENT');
  await admin.from('emergency_requests').update({ status: 'cancelled' }).eq('id', noConsent!.id);
});

test('excluir a conta arquiva a transcrição com os registros de atendimento', async () => {
  const appointmentId = await createAppointment(fx);
  const { data: sessionId } = await fx.patient.client.rpc('get_or_create_appointment_webrtc_session', { p_appointment_id: appointmentId });
  await fx.patient.client.rpc('give_appointment_transcription_consent', { p_appointment_id: appointmentId, p_version: '1.0' });
  expect((await sendChunk(fx.patient, chunk(sessionId, 'paciente'))).status).toBe(200);

  const { error } = await admin.rpc('archive_patient_care_records', { p_patient_id: fx.patient.id });
  expect(error).toBeNull();
  const { data: archived } = await admin
    .from('care_record_archive')
    .select('record_type, data')
    .eq('record_type', 'transcript')
    .eq('source_id', sessionId)
    .single();
  expect(archived?.data.segments.map((s: { content: string }) => s.content)).toEqual([PHRASES.patient]);
  await admin.from('care_record_archive').delete().eq('former_patient_id', fx.patient.id);
});
