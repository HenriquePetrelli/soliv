import { describe, it, expect, vi } from 'vitest';
import {
  cleanTranscript,
  handleTranscribeChunk,
  isWav,
  lovableTranscriber,
  openAiTranscriber,
  parseChunkRequest,
  pickTranscriber,
  resolveSegmentStart,
  type CallSession,
  type SegmentRow,
  type TranscribeDeps,
} from '../../supabase/functions/_shared/transcription';
import { bytesToBase64, encodeWav } from '@/lib/callTranscription';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PATIENT = 'patient-1';
const PSYCHOLOGIST = 'psy-1';
const NOW = Date.parse('2026-11-20T12:00:00Z');

const wavBase64 = bytesToBase64(encodeWav(new Float32Array(1600).fill(0.3), 16000));

const baseSession: CallSession = {
  id: SESSION_ID,
  patient_id: PATIENT,
  psychologist_id: PSYCHOLOGIST,
  emergency_request_id: null,
  created_at: '2026-11-20T11:50:00Z',
  ended_at: null,
};

const makeDeps = (overrides: Partial<TranscribeDeps> = {}) => {
  const inserted: SegmentRow[] = [];
  const transcriber = vi.fn(async () => 'Estou me sentindo ansioso.');
  const deps: TranscribeDeps = {
    getUserId: async (token) => ({ 'tok-patient': PATIENT, 'tok-psy': PSYCHOLOGIST, 'tok-outsider': 'other' } as Record<string, string>)[token] ?? null,
    withinRateLimit: async () => true,
    getSession: async (id) => (id === SESSION_ID ? baseSession : null),
    getConsentAt: async () => '2026-11-20T11:49:00Z',
    transcriber,
    insertSegment: async (row) => {
      inserted.push(row);
    },
    now: () => NOW,
    ...overrides,
  };
  return { deps, inserted, transcriber };
};

const request = (body: unknown, token: string | null = 'tok-patient', method = 'POST') =>
  new Request('http://localhost/transcribe-call-chunk', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

const validBody = (extra: Record<string, unknown> = {}) => ({
  session_id: SESSION_ID,
  started_at: '2026-11-20T11:59:00Z',
  duration_ms: 30000,
  audio: wavBase64,
  ...extra,
});

const call = async (body: unknown, token?: string | null, deps = makeDeps()) => {
  const response = await handleTranscribeChunk(request(body, token === undefined ? 'tok-patient' : token), deps.deps);
  return { status: response.status, body: response.status === 204 ? null : await response.json().catch(() => null), ...deps };
};

describe('transcribe-call-chunk: caminho feliz', () => {
  it('paciente: transcreve e grava o texto com o papel e o horário do trecho', async () => {
    const r = await call(validBody());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(r.inserted).toEqual([
      {
        webrtc_session_id: SESSION_ID,
        speaker_id: PATIENT,
        speaker_role: 'patient',
        started_at: '2026-11-20T11:59:00.000Z',
        duration_ms: 30000,
        content: 'Estou me sentindo ansioso.',
      },
    ]);
    expect(r.transcriber).toHaveBeenCalledWith(expect.objectContaining({ base64: wavBase64 }));
  });

  it('psicólogo: grava como psychologist', async () => {
    const r = await call(validBody(), 'tok-psy');
    expect(r.status).toBe(200);
    expect(r.inserted[0].speaker_role).toBe('psychologist');
    expect(r.inserted[0].speaker_id).toBe(PSYCHOLOGIST);
  });

  it('SOS: confere o consentimento do pedido de emergência da sala', async () => {
    const getConsentAt = vi.fn(async (s: CallSession) => (s.emergency_request_id === 'er-1' ? '2026-11-20T11:49:00Z' : null));
    const deps = makeDeps({ getSession: async () => ({ ...baseSession, emergency_request_id: 'er-1' }), getConsentAt });
    const r = await call(validBody(), 'tok-patient', deps);
    expect(r.status).toBe(200);
    expect(getConsentAt).toHaveBeenCalledWith(expect.objectContaining({ emergency_request_id: 'er-1' }));
  });

  it('silêncio ou "sem fala": responde ok sem gravar nada', async () => {
    const deps = makeDeps({ transcriber: async () => '  [silêncio]  ' });
    const r = await call(validBody(), 'tok-patient', deps);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, empty: true });
    expect(r.inserted).toEqual([]);
  });

  it('horário implausível vindo do aparelho é trocado pelo do servidor', async () => {
    const r = await call(validBody({ started_at: '2020-01-01T00:00:00Z' }));
    expect(r.inserted[0].started_at).toBe(new Date(NOW - 30000).toISOString());
  });

  it('trecho enviado até 5 min depois do fim da chamada ainda é aceito', async () => {
    const deps = makeDeps({ getSession: async () => ({ ...baseSession, ended_at: new Date(NOW - 4 * 60_000).toISOString() }) });
    expect((await call(validBody(), 'tok-patient', deps)).status).toBe(200);
  });
});

describe('transcribe-call-chunk: recusas', () => {
  it('sem login: 401, sem transcrever', async () => {
    const r = await call(validBody(), null);
    expect(r.status).toBe(401);
    expect(r.transcriber).not.toHaveBeenCalled();
  });

  it('token inválido: 401', async () => {
    expect((await call(validBody(), 'tok-falso')).status).toBe(401);
  });

  it('quem não está na sala: 403', async () => {
    const r = await call(validBody(), 'tok-outsider');
    expect(r.status).toBe(403);
    expect(r.transcriber).not.toHaveBeenCalled();
  });

  it('sem consentimento do paciente: 403 NO_CONSENT, o áudio não vai para a transcrição', async () => {
    const deps = makeDeps({ getConsentAt: async () => null });
    const r = await call(validBody(), 'tok-psy', deps);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NO_CONSENT');
    expect(r.transcriber).not.toHaveBeenCalled();
    expect(r.inserted).toEqual([]);
  });

  it('sala inexistente: 404', async () => {
    expect((await call(validBody({ session_id: '22222222-2222-4222-8222-222222222222' }))).status).toBe(404);
  });

  it('chamada encerrada há mais de 5 min: 409 CALL_ENDED', async () => {
    const deps = makeDeps({ getSession: async () => ({ ...baseSession, ended_at: new Date(NOW - 6 * 60_000).toISOString() }) });
    const r = await call(validBody(), 'tok-patient', deps);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CALL_ENDED');
  });

  it.each([
    ['id da sala inválido', { session_id: 'abc' }],
    ['duração zero', { duration_ms: 0 }],
    ['duração acima de 90 s', { duration_ms: 91_000 }],
    ['horário inválido', { started_at: 'ontem' }],
    ['sem áudio', { audio: '' }],
    ['áudio grande demais', { audio: 'A'.repeat(2_700_001) }],
  ])('%s: 400', async (_label, extra) => {
    const r = await call(validBody(extra));
    expect(r.status).toBe(400);
    expect(r.transcriber).not.toHaveBeenCalled();
  });

  it('áudio que não é WAV: 400', async () => {
    const r = await call(validBody({ audio: btoa('isto não é um wav, é só um texto qualquer com mais de 44 bytes...') }));
    expect(r.status).toBe(400);
  });

  it('base64 quebrado: 400', async () => {
    expect((await call(validBody({ audio: '***' }))).status).toBe(400);
  });

  it('muitas chamadas seguidas: 429, sem consultar a sala', async () => {
    const getSession = vi.fn(async () => baseSession);
    const r = await call(validBody(), 'tok-patient', makeDeps({ withinRateLimit: async () => false, getSession }));
    expect(r.status).toBe(429);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('sem provedor configurado: 503 NOT_CONFIGURED', async () => {
    const r = await call(validBody(), 'tok-patient', makeDeps({ transcriber: null }));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('NOT_CONFIGURED');
  });

  it('erro do provedor sobe (vira 500 no monitored e o app tenta de novo)', async () => {
    const deps = makeDeps({ transcriber: async () => { throw new Error('Lovable AI: 400'); } });
    await expect(handleTranscribeChunk(request(validBody()), deps.deps)).rejects.toThrow('Lovable AI: 400');
  });

  it('OPTIONS responde ao CORS; GET é 405', async () => {
    const { deps } = makeDeps();
    expect((await handleTranscribeChunk(new Request('http://x', { method: 'OPTIONS' }), deps)).status).toBe(200);
    expect((await handleTranscribeChunk(new Request('http://x', { method: 'GET' }), deps)).status).toBe(405);
  });
});

describe('transcrição: funções puras', () => {
  it('parseChunkRequest aceita o formato que o app envia', () => {
    expect(parseChunkRequest(validBody())).toMatchObject({ sessionId: SESSION_ID, durationMs: 30000 });
    expect(parseChunkRequest(null)).toBeNull();
    expect(parseChunkRequest('texto')).toBeNull();
  });

  it('isWav reconhece o WAV do app', () => {
    expect(isWav(encodeWav(new Float32Array(10), 16000))).toBe(true);
    expect(isWav(new Uint8Array(50))).toBe(false);
  });

  it('cleanTranscript junta espaços e descarta respostas de "sem fala"', () => {
    expect(cleanTranscript('  Olá,\n tudo   bem? ')).toBe('Olá, tudo bem?');
    for (const empty of ['', '...', '(silêncio)', 'Sem fala.', '[inaudível]', 'Nenhuma fala']) {
      expect(cleanTranscript(empty)).toBe('');
    }
    expect(cleanTranscript('silêncio é difícil para mim')).toBe('silêncio é difícil para mim');
    expect(cleanTranscript('a'.repeat(9000))).toHaveLength(8000);
  });

  it('resolveSegmentStart mantém o horário plausível', () => {
    const start = new Date('2026-11-20T11:55:00Z');
    expect(resolveSegmentStart(start, '2026-11-20T11:50:00Z', NOW, 30000)).toBe(start);
    expect(resolveSegmentStart(new Date(NOW + 5 * 60_000), '2026-11-20T11:50:00Z', NOW, 30000).getTime()).toBe(NOW - 30000);
  });
});

describe('transcrição: provedores', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];
  const audio = { bytes: encodeWav(new Float32Array(10), 16000), base64: wavBase64 };

  it('Lovable: manda o WAV como input_audio e lê o texto da resposta', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Oi, tudo bem?' } }] })));
    const text = await lovableTranscriber('key-l', env({}), fetchFn as unknown as typeof fetch)(audio);
    expect(text).toBe('Oi, tudo bem?');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai.gateway.lovable.dev/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-l');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('google/gemini-2.5-flash');
    expect(sent.messages[1].content[1]).toEqual({ type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } });
  });

  it('Lovable: resposta em partes também é lida', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: 'Parte um.' }, { type: 'text', text: 'Parte dois.' }] } }] })));
    expect(await lovableTranscriber('k', env({}), fetchFn as unknown as typeof fetch)(audio)).toBe('Parte um. Parte dois.');
  });

  it('Lovable: erro HTTP vira exceção com o status', async () => {
    const fetchFn = vi.fn(async () => new Response('formato não suportado', { status: 400 }));
    await expect(lovableTranscriber('k', env({}), fetchFn as unknown as typeof fetch)(audio)).rejects.toThrow(/Lovable AI: 400/);
  });

  it('OpenAI: envia multipart com o arquivo e o idioma', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ text: 'Olá' })));
    expect(await openAiTranscriber('key-o', env({}), fetchFn as unknown as typeof fetch)(audio)).toBe('Olá');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    const form = init.body as FormData;
    expect(form.get('language')).toBe('pt');
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('pickTranscriber: OpenAI tem preferência; sem chave nenhuma, null', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ text: 'x', choices: [{ message: { content: 'y' } }] })));
    const both = pickTranscriber(env({ OPENAI_API_KEY: 'o', LOVABLE_API_KEY: 'l' }), fetchFn as unknown as typeof fetch);
    await both!(audio);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain('openai.com');
    expect(pickTranscriber(env({ LOVABLE_API_KEY: 'l' }))).not.toBeNull();
    expect(pickTranscriber(env({}))).toBeNull();
  });
});
