import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  LOCAL,
  PHRASES,
  admin,
  clearGatewayLog,
  createAppointment,
  createFixture,
  gatewayLog,
  segmentsOf,
  type Fixture,
  type TestUser,
} from './fixtures';

/**
 * Chamada de vídeo de verdade entre dois navegadores (paciente e psicóloga),
 * cada um com uma fala sintetizada como microfone. Confere a tela de
 * consentimento, a chamada conectando, o aviso "Chamada sendo transcrita" e
 * que cada trecho chega ao gateway como WAV 16 kHz com a voz de quem falou,
 * vira texto no banco com o papel certo e aparece no histórico da psicóloga.
 */

const audioFile = (name: 'paciente' | 'psicologo') => fileURLToPath(new URL(`./audio/${name}.wav`, import.meta.url));

const launch = (file: string) =>
  chromium.launch({
    // Ambientes com o Chromium em outro lugar (ex.: a versão instalada não é a do projeto).
    executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${file}`,
      '--autoplay-policy=no-user-gesture-required',
      '--no-proxy-server',
    ],
  });

/** As edge functions do teste são servidas pelo functionsHost.ts. */
const routeFunctions = async (context: BrowserContext) => {
  await context.route(`${LOCAL.url}/functions/v1/**`, async (route) => {
    const url = route.request().url().replace(`${LOCAL.url}/functions/v1`, LOCAL.functionsUrl);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });
};

const login = async (page: Page, user: TestUser) => {
  await page.goto('/');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !/\/$/.test(url.pathname) || url.pathname !== '/', { timeout: 30_000 });
};

let fx: Fixture;
const browsers: Browser[] = [];

test.beforeAll(async () => {
  fx = await createFixture();
});

test.afterAll(async () => {
  for (const b of browsers) await b.close().catch(() => undefined);
  await fx?.cleanup();
});

test('consulta por vídeo: consentimento, chamada conectada e transcrição dos dois lados', async () => {
  test.setTimeout(5 * 60_000);
  await clearGatewayLog();
  const appointmentId = await createAppointment(fx);

  const patientBrowser = await launch(audioFile('paciente'));
  const psychologistBrowser = await launch(audioFile('psicologo'));
  browsers.push(patientBrowser, psychologistBrowser);
  const contextOptions = { baseURL: test.info().project.use.baseURL, permissions: ['camera', 'microphone'] };
  const patientContext = await patientBrowser.newContext(contextOptions);
  const psychologistContext = await psychologistBrowser.newContext(contextOptions);
  await routeFunctions(patientContext);
  await routeFunctions(psychologistContext);
  const patientPage = await patientContext.newPage();
  const psychologistPage = await psychologistContext.newPage();
  const errors: string[] = [];
  for (const [who, page] of [['paciente', patientPage], ['psicóloga', psychologistPage]] as const) {
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  }

  await login(patientPage, fx.patient);
  await login(psychologistPage, fx.psychologist);

  // Paciente: a tela de consentimento vem antes da sala.
  await patientPage.goto(`/consultation-call/${appointmentId}`);
  await expect(patientPage.getByTestId('consultation-consent')).toBeVisible({ timeout: 30_000 });
  const enter = patientPage.getByRole('button', { name: 'Concordar e entrar' });
  await expect(enter).toBeDisabled();
  await patientPage.screenshot({ path: test.info().outputPath('1-consentimento.png') });
  await patientPage.getByRole('checkbox', { name: /transcrito/ }).check();
  await enter.click();
  await expect(patientPage.getByTestId('video-call-room')).toBeVisible({ timeout: 30_000 });

  // Psicóloga entra direto.
  await psychologistPage.goto(`/consultation-call/${appointmentId}`);
  await expect(psychologistPage.getByTestId('video-call-room')).toBeVisible({ timeout: 30_000 });
  await expect(psychologistPage.getByTestId('consultation-consent')).toHaveCount(0);

  // Chamada conectada nos dois lados (o banco marca quando os dois têm mídia).
  const { data: appointment } = await admin.from('appointments').select('video_room_id, transcription_consent_at').eq('id', appointmentId).single();
  expect(appointment?.transcription_consent_at).toBeTruthy();
  const sessionId = appointment!.video_room_id as string;
  await expect
    .poll(async () => (await admin.from('webrtc_sessions').select('connected_at').eq('id', sessionId).single()).data?.connected_at, {
      timeout: 60_000,
      message: 'a chamada não conectou',
    })
    .toBeTruthy();

  // Aviso nos dois lados.
  await expect(patientPage.getByTestId('transcription-indicator')).toBeVisible();
  await expect(psychologistPage.getByTestId('transcription-indicator')).toBeVisible();
  await psychologistPage.screenshot({ path: test.info().outputPath('2-sala-psicologa.png') });

  // Primeiro trecho de cada lado (30 s depois de conectar).
  await expect
    .poll(async () => (await segmentsOf(sessionId)).map((s) => s.speaker_role).sort(), { timeout: 100_000, intervals: [5_000] })
    .toEqual(['patient', 'psychologist']);

  const log = await gatewayLog();
  expect(log.length).toBeGreaterThanOrEqual(2);
  for (const entry of log) {
    expect(entry, JSON.stringify(entry)).toMatchObject({ ok: true, format: 1, channels: 1, sampleRate: 16000, bits: 16 });
    // Cortado numa pausa entre 30 e 40 s: cada trecho tem a frase inteira.
    expect(entry.seconds).toBeGreaterThanOrEqual(29.9);
    expect(entry.seconds).toBeLessThanOrEqual(40.1);
    expect(entry.text, `trecho sem frase inteira: ${JSON.stringify(entry.scores)}`).toBeTruthy();
  }

  const segments = await segmentsOf(sessionId);
  const byRole = Object.fromEntries(segments.map((s) => [s.speaker_role, s]));
  expect(byRole.patient.content).toBe(PHRASES.patient);
  expect(byRole.patient.speaker_id).toBe(fx.patient.id);
  expect(byRole.psychologist.content).toBe(PHRASES.psychologist);
  expect(byRole.psychologist.speaker_id).toBe(fx.psychologist.id);

  // Microfone desligado: a paciente some da transcrição (o trecho vira silêncio).
  await patientPage.getByRole('button', { name: 'Desativar microfone' }).click();
  const before = (await segmentsOf(sessionId)).filter((s) => s.speaker_role === 'patient').length;
  await clearGatewayLog();
  await patientPage.waitForTimeout(65_000);
  const patientAfter = (await segmentsOf(sessionId)).filter((s) => s.speaker_role === 'patient').length;
  expect(patientAfter - before, 'com o microfone desligado entrou no máximo o trecho que já estava em andamento').toBeLessThanOrEqual(1);
  const psychologistAfter = (await segmentsOf(sessionId)).filter((s) => s.speaker_role === 'psychologist').length;
  expect(psychologistAfter).toBeGreaterThanOrEqual(2);
  // Depois de desligar, só a psicóloga (e no máximo o trecho em andamento da paciente) chegou ao gateway.
  const afterMute = await gatewayLog();
  expect(afterMute.filter((e) => e.text === PHRASES.patient).length).toBeLessThanOrEqual(1);
  expect(afterMute.filter((e) => e.text === PHRASES.psychologist).length).toBeGreaterThanOrEqual(1);

  // A psicóloga lê a transcrição pela RPC do histórico.
  const read = await fx.psychologist.client.rpc('get_call_transcript', { p_appointment_id: appointmentId });
  expect(read.error).toBeNull();
  expect(read.data.some((r: { speaker_role: string; content: string }) => r.speaker_role === 'patient' && r.content === PHRASES.patient)).toBe(true);

  // Tela do histórico da psicóloga: a transcrição aparece nos detalhes da consulta.
  await psychologistPage.getByRole('button', { name: /Encerrar|Sair/ }).first().click().catch(() => undefined);
  await admin.from('appointments').update({ status: 'completed' }).eq('id', appointmentId);
  await psychologistPage.goto('/psicologo/consultas');
  await psychologistPage.getByRole('tab', { name: /Histórico/ }).click();
  await psychologistPage.getByRole('row', { name: /Paciente Teste Transcrição/ }).getByRole('button', { name: 'Ver' }).first().click();
  const transcript = psychologistPage.getByTestId('call-transcript');
  await expect(transcript).toContainText('Transcrição da chamada');
  await expect(transcript).toContainText(PHRASES.patient);
  await expect(transcript).toContainText(PHRASES.psychologist);
  await expect(transcript).toContainText('Paciente');
  await expect(transcript).toContainText('Você');
  await psychologistPage.screenshot({ path: test.info().outputPath('4-historico-transcricao.png') });

  expect(errors).toEqual([]);
});

test('consulta: sem marcar o consentimento, a paciente não entra e nada é transcrito', async () => {
  const appointmentId = await createAppointment(fx);
  const browser = await launch(audioFile('paciente'));
  browsers.push(browser);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, permissions: ['camera', 'microphone'] });
  await routeFunctions(context);
  const page = await context.newPage();
  await login(page, fx.patient);
  await page.goto(`/consultation-call/${appointmentId}`);
  await expect(page.getByTestId('consultation-consent')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Concordar e entrar' })).toBeDisabled();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/appointments/);
  const { data } = await admin.from('appointments').select('video_room_id, transcription_consent_at').eq('id', appointmentId).single();
  expect(data).toEqual({ video_room_id: null, transcription_consent_at: null });
});

test('SOS: a confirmação exige o consentimento por vídeo e o pedido sai com ele', async () => {
  const browser = await launch(audioFile('paciente'));
  browsers.push(browser);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, permissions: ['camera', 'microphone'] });
  await routeFunctions(context);
  const page = await context.newPage();
  await login(page, fx.patient);
  await admin.from('extra_credits').insert({ user_id: fx.patient.id, kind: 'sos', amount_cents: 100, price_tier: 'free', stripe_payment_intent_id: `pi_teste_${Date.now()}` });

  await page.goto('/home');
  // Conta nova: a janela das metas da semana aparece antes.
  const goals = page.getByRole('button', { name: 'Cancelar' });
  if (await goals.isVisible({ timeout: 5_000 }).catch(() => false)) await goals.click();
  await page.getByRole('button', { name: /Ajuda Emergencial/i }).first().click();
  const call = page.getByRole('button', { name: 'Sim, chamar um psicólogo' });
  await expect(call).toBeVisible();
  await expect(call).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('3-sos-confirmacao.png') });
  await page.getByRole('checkbox', { name: /transcrito/ }).check();
  await expect(call).toBeEnabled();
  await call.click();

  await expect
    .poll(async () =>
      (await admin.from('emergency_requests').select('channel, transcription_consent_at, transcription_consent_version').eq('patient_id', fx.patient.id).order('created_at', { ascending: false }).limit(1).maybeSingle()).data,
    { timeout: 30_000 })
    .toMatchObject({ channel: 'video', transcription_consent_version: '1.0' });
  const { data: request } = await admin.from('emergency_requests').select('id, transcription_consent_at').eq('patient_id', fx.patient.id).order('created_at', { ascending: false }).limit(1).single();
  expect(request?.transcription_consent_at).toBeTruthy();
  await admin.from('emergency_requests').update({ status: 'cancelled' }).eq('id', request!.id);
});
