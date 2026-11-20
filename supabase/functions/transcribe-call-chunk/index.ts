// Transcrição das chamadas de vídeo (SOS e consulta agendada).
//
// Cada lado da chamada envia trechos curtos (~30 s) do próprio microfone, em
// WAV 16 kHz mono. Esta função confere que quem envia está na sala e que o
// paciente consentiu com a transcrição naquele atendimento, transcreve e grava
// só o texto em `call_transcript_segments`. O áudio não é guardado.
//
// Transcrição (secrets das edge functions), na ordem:
// - OPENAI_API_KEY: API de transcrição da OpenAI (modelo em
//   OPENAI_TRANSCRIBE_MODEL, padrão `gpt-4o-mini-transcribe`);
// - LOVABLE_API_KEY (já configurada): AI Gateway da Lovable com um modelo que
//   aceita áudio (LOVABLE_TRANSCRIBE_MODEL, padrão `google/gemini-2.5-flash`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { monitored } from "../_shared/monitoring.ts";
import { withinRateLimit, tooManyRequests } from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** ~60 s de WAV 16 kHz mono 16 bits em base64 (o app manda ~30 s). */
const MAX_AUDIO_BASE64 = 2_700_000;
/** Trecho final enviado logo depois de a chamada encerrar ainda é aceito. */
const AFTER_END_GRACE_MS = 5 * 60 * 1000;

const PROMPT =
  "Transcreva literalmente, em português do Brasil, a fala deste trecho de áudio de um atendimento psicológico. " +
  "Responda só com o texto falado, sem comentários, rótulos ou marcações de tempo. " +
  "Se não houver fala compreensível, responda com uma linha vazia.";

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const isWav = (bytes: Uint8Array) =>
  bytes.length > 44 &&
  String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";

const transcribeWithOpenAI = async (apiKey: string, audio: Uint8Array): Promise<string> => {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "trecho.wav");
  form.append("model", Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`OpenAI: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  return typeof body?.text === "string" ? body.text : "";
};

const transcribeWithLovable = async (apiKey: string, audioBase64: string): Promise<string> => {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("LOVABLE_TRANSCRIBE_MODEL") ?? "google/gemini-2.5-flash",
      temperature: 0,
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva este trecho." },
            { type: "input_audio", input_audio: { data: audioBase64, format: "wav" } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Lovable AI: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
};

/** Respostas de "sem fala" que alguns modelos devolvem em vez de vazio. */
const NO_SPEECH = /^\s*[[(]?\s*(sil[eê]ncio|sem fala|inaud[ií]vel|nenhuma fala|\.{3})\s*[\])]?\s*\.?\s*$/i;

const cleanTranscript = (text: string): string => {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || NO_SPEECH.test(trimmed)) return "";
  return trimmed.slice(0, 8000);
};

Deno.serve(monitored("transcribe-call-chunk", async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Não autenticado" }, 401);
  const userId = auth.user.id;

  const body = await req.json().catch(() => null) as {
    session_id?: unknown;
    started_at?: unknown;
    duration_ms?: unknown;
    audio?: unknown;
  } | null;

  const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
  const durationMs = Math.round(Number(body?.duration_ms));
  const startedAt = typeof body?.started_at === "string" ? new Date(body.started_at) : new Date(NaN);
  const audio = typeof body?.audio === "string" ? body.audio : "";

  if (
    !/^[0-9a-f-]{36}$/i.test(sessionId) ||
    !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 90_000 ||
    Number.isNaN(startedAt.getTime()) ||
    !audio || audio.length > MAX_AUDIO_BASE64
  ) {
    return json({ error: "Trecho inválido" }, 400);
  }

  // ~2 trechos por minuto por pessoa; folga para reenvios.
  if (!(await withinRateLimit(`transcribe:${userId}`, 12, 60))) return tooManyRequests(corsHeaders);

  const { data: session, error: sessionError } = await supabase
    .from("webrtc_sessions")
    .select("id, patient_id, psychologist_id, emergency_request_id, created_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return json({ error: "Sala não encontrada" }, 404);

  const speakerRole = userId === session.patient_id ? "patient" : userId === session.psychologist_id ? "psychologist" : null;
  if (!speakerRole) return json({ error: "Você não está nesta sala" }, 403);

  const now = Date.now();
  if (session.ended_at && now - new Date(session.ended_at).getTime() > AFTER_END_GRACE_MS) {
    return json({ error: "A chamada já terminou", code: "CALL_ENDED" }, 409);
  }
  // O horário do trecho vem do aparelho (e identifica o trecho num reenvio):
  // só o mantém se for plausível.
  const sessionStart = new Date(session.created_at).getTime();
  const plausibleStart = startedAt.getTime() >= sessionStart - 60_000 && startedAt.getTime() <= now + 60_000;
  const segmentStart = plausibleStart ? startedAt : new Date(now - durationMs);

  // Consentimento do paciente, gravado no atendimento.
  let consentAt: string | null = null;
  if (session.emergency_request_id) {
    const { data } = await supabase
      .from("emergency_requests")
      .select("transcription_consent_at")
      .eq("id", session.emergency_request_id)
      .maybeSingle();
    consentAt = data?.transcription_consent_at ?? null;
  } else {
    const { data } = await supabase
      .from("appointments")
      .select("transcription_consent_at")
      .eq("video_room_id", sessionId)
      .maybeSingle();
    consentAt = data?.transcription_consent_at ?? null;
  }
  if (!consentAt) return json({ error: "O paciente não consentiu com a transcrição", code: "NO_CONSENT" }, 403);

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(audio);
  } catch {
    return json({ error: "Áudio inválido" }, 400);
  }
  if (!isWav(bytes)) return json({ error: "Áudio inválido" }, 400);

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!openAiKey && !lovableKey) return json({ error: "Transcrição não configurada", code: "NOT_CONFIGURED" }, 503);

  const raw = openAiKey ? await transcribeWithOpenAI(openAiKey, bytes) : await transcribeWithLovable(lovableKey!, audio);
  const content = cleanTranscript(raw);
  if (!content) return json({ ok: true, empty: true });

  const { error: insertError } = await supabase
    .from("call_transcript_segments")
    .upsert(
      {
        webrtc_session_id: sessionId,
        speaker_id: userId,
        speaker_role: speakerRole,
        started_at: segmentStart.toISOString(),
        duration_ms: durationMs,
        content,
      },
      { onConflict: "webrtc_session_id,speaker_role,started_at", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;

  return json({ ok: true });
}));
