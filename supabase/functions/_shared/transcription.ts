// Regras da transcrição das chamadas (edge function `transcribe-call-chunk`).
//
// Separado do `index.ts` para ser testado sem o Deno nem o Supabase: o
// handler recebe as dependências (banco, limite de chamadas, transcrição) e o
// `index.ts` liga as de verdade. Ver `src/test/transcribeCallChunk.test.ts`.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** ~60 s de WAV 16 kHz mono 16 bits em base64 (o app manda ~30 s). */
export const MAX_AUDIO_BASE64 = 2_700_000;
export const MAX_DURATION_MS = 90_000;
/** Trecho final enviado logo depois de a chamada encerrar ainda é aceito. */
export const AFTER_END_GRACE_MS = 5 * 60 * 1000;
/** ~2 trechos por minuto por pessoa; folga para reenvios. */
export const RATE_LIMIT = { max: 12, windowSeconds: 60 };

export const TRANSCRIBE_PROMPT =
  "Transcreva literalmente, em português do Brasil, a fala deste trecho de áudio de um atendimento psicológico. " +
  "Responda só com o texto falado, sem comentários, rótulos ou marcações de tempo. " +
  "Se não houver fala compreensível, responda com uma linha vazia.";

export const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const isWav = (bytes: Uint8Array) =>
  bytes.length > 44 &&
  String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";

/** Respostas de "sem fala" que alguns modelos devolvem em vez de vazio. */
const NO_SPEECH = /^\s*[[(]?\s*(sil[eê]ncio|sem fala|inaud[ií]vel|nenhuma fala|\.{3})\s*[\])]?\s*\.?\s*$/i;

export const cleanTranscript = (text: string): string => {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || NO_SPEECH.test(trimmed)) return "";
  return trimmed.slice(0, 8000);
};

export interface ChunkRequest {
  sessionId: string;
  startedAt: Date;
  durationMs: number;
  audio: string;
}

export const parseChunkRequest = (body: unknown): ChunkRequest | null => {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const sessionId = typeof b.session_id === "string" ? b.session_id : "";
  const durationMs = Math.round(Number(b.duration_ms));
  const startedAt = typeof b.started_at === "string" ? new Date(b.started_at) : new Date(NaN);
  const audio = typeof b.audio === "string" ? b.audio : "";
  if (
    !/^[0-9a-f-]{36}$/i.test(sessionId) ||
    !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS ||
    Number.isNaN(startedAt.getTime()) ||
    !audio || audio.length > MAX_AUDIO_BASE64
  ) {
    return null;
  }
  return { sessionId, startedAt, durationMs, audio };
};

/**
 * O horário do trecho vem do aparelho (e identifica o trecho num reenvio):
 * só é mantido se for plausível para a sala.
 */
export const resolveSegmentStart = (startedAt: Date, sessionCreatedAt: string, now: number, durationMs: number): Date => {
  const sessionStart = new Date(sessionCreatedAt).getTime();
  const plausible = startedAt.getTime() >= sessionStart - 60_000 && startedAt.getTime() <= now + 60_000;
  return plausible ? startedAt : new Date(now - durationMs);
};

export interface CallSession {
  id: string;
  patient_id: string | null;
  psychologist_id: string | null;
  emergency_request_id: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface SegmentRow {
  webrtc_session_id: string;
  speaker_id: string;
  speaker_role: "patient" | "psychologist";
  started_at: string;
  duration_ms: number;
  content: string;
}

export type Transcriber = (audio: { bytes: Uint8Array; base64: string }) => Promise<string>;

export interface TranscribeDeps {
  getUserId: (token: string) => Promise<string | null>;
  withinRateLimit: (key: string, max: number, windowSeconds: number) => Promise<boolean>;
  getSession: (id: string) => Promise<CallSession | null>;
  /** Data do consentimento do paciente no SOS ou na consulta da sala. */
  getConsentAt: (session: CallSession) => Promise<string | null>;
  /** null = nenhum provedor de transcrição configurado. */
  transcriber: Transcriber | null;
  insertSegment: (row: SegmentRow) => Promise<void>;
  now?: () => number;
}

export const handleTranscribeChunk = async (req: Request, deps: TranscribeDeps): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = token ? await deps.getUserId(token) : null;
  if (!userId) return json({ error: "Não autenticado" }, 401);

  const chunk = parseChunkRequest(await req.json().catch(() => null));
  if (!chunk) return json({ error: "Trecho inválido" }, 400);

  if (!(await deps.withinRateLimit(`transcribe:${userId}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
    return new Response(
      JSON.stringify({ error: "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  const session = await deps.getSession(chunk.sessionId);
  if (!session) return json({ error: "Sala não encontrada" }, 404);

  const speakerRole = userId === session.patient_id ? "patient" : userId === session.psychologist_id ? "psychologist" : null;
  if (!speakerRole) return json({ error: "Você não está nesta sala" }, 403);

  const now = (deps.now ?? Date.now)();
  if (session.ended_at && now - new Date(session.ended_at).getTime() > AFTER_END_GRACE_MS) {
    return json({ error: "A chamada já terminou", code: "CALL_ENDED" }, 409);
  }

  if (!(await deps.getConsentAt(session))) {
    return json({ error: "O paciente não consentiu com a transcrição", code: "NO_CONSENT" }, 403);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(chunk.audio);
  } catch {
    return json({ error: "Áudio inválido" }, 400);
  }
  if (!isWav(bytes)) return json({ error: "Áudio inválido" }, 400);

  if (!deps.transcriber) return json({ error: "Transcrição não configurada", code: "NOT_CONFIGURED" }, 503);

  const content = cleanTranscript(await deps.transcriber({ bytes, base64: chunk.audio }));
  if (!content) return json({ ok: true, empty: true });

  await deps.insertSegment({
    webrtc_session_id: chunk.sessionId,
    speaker_id: userId,
    speaker_role: speakerRole,
    started_at: resolveSegmentStart(chunk.startedAt, session.created_at, now, chunk.durationMs).toISOString(),
    duration_ms: chunk.durationMs,
    content,
  });

  return json({ ok: true });
};

// ---------------------------------------------------------------------------
// Provedores

type Env = (name: string) => string | undefined;
type Fetch = typeof fetch;

export const openAiTranscriber = (apiKey: string, env: Env, fetchFn: Fetch = fetch): Transcriber => async ({ bytes }) => {
  const form = new FormData();
  const wav = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  form.append("file", new Blob([wav], { type: "audio/wav" }), "trecho.wav");
  form.append("model", env("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("response_format", "json");
  const response = await fetchFn(env("OPENAI_TRANSCRIBE_URL") ?? "https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`OpenAI: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  return typeof body?.text === "string" ? body.text : "";
};

/** Conteúdo da resposta do chat: texto, ou lista de partes de texto. */
const chatContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join(" ");
  }
  return "";
};

/**
 * Sem raciocínio: transcrever não precisa dele e o Gemini 2.5 Flash raciocina
 * por padrão, cobrando esses tokens como saída. Se o gateway recusar o
 * parâmetro, repete o pedido sem ele (a transcrição não pode parar por isso).
 */
export const LOVABLE_REASONING_EFFORT = "none";

export const lovableTranscriber = (apiKey: string, env: Env, fetchFn: Fetch = fetch): Transcriber => async ({ base64 }) => {
  const url = env("LOVABLE_AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions";
  const payload = {
    model: env("LOVABLE_TRANSCRIBE_MODEL") ?? "google/gemini-2.5-flash",
    temperature: 0,
    messages: [
      { role: "system", content: TRANSCRIBE_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcreva este trecho." },
          { type: "input_audio", input_audio: { data: base64, format: "wav" } },
        ],
      },
    ],
  };
  const send = (body: object) =>
    fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let response = await send({ ...payload, reasoning_effort: LOVABLE_REASONING_EFFORT });
  if (response.status === 400) {
    const errorText = await response.text();
    if (!/reasoning/i.test(errorText)) throw new Error(`Lovable AI: 400 ${errorText.slice(0, 300)}`);
    console.warn("Lovable AI recusou reasoning_effort; repetindo sem ele", errorText.slice(0, 300));
    response = await send(payload);
  }
  if (!response.ok) throw new Error(`Lovable AI: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  return chatContent(body?.choices?.[0]?.message?.content);
};

/** OpenAI tem preferência; sem ela, a Lovable; sem nenhuma, null. */
export const pickTranscriber = (env: Env, fetchFn: Fetch = fetch): Transcriber | null => {
  const openAiKey = env("OPENAI_API_KEY");
  if (openAiKey) return openAiTranscriber(openAiKey, env, fetchFn);
  const lovableKey = env("LOVABLE_API_KEY");
  if (lovableKey) return lovableTranscriber(lovableKey, env, fetchFn);
  return null;
};
