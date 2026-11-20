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
//
// As regras ficam em `../_shared/transcription.ts` (testadas no vitest).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { monitored } from "../_shared/monitoring.ts";
import { withinRateLimit } from "../_shared/guards.ts";
import { handleTranscribeChunk, pickTranscriber, type CallSession } from "../_shared/transcription.ts";

const env = (name: string) => Deno.env.get(name) || undefined;

Deno.serve(monitored("transcribe-call-chunk", (req: Request): Promise<Response> => {
  const supabase = createClient(env("SUPABASE_URL") ?? "", env("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  return handleTranscribeChunk(req, {
    getUserId: async (token) => {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    withinRateLimit,
    getSession: async (id) => {
      const { data, error } = await supabase
        .from("webrtc_sessions")
        .select("id, patient_id, psychologist_id, emergency_request_id, created_at, ended_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as CallSession | null) ?? null;
    },
    getConsentAt: async (session) => {
      const { data, error } = session.emergency_request_id
        ? await supabase.from("emergency_requests").select("transcription_consent_at").eq("id", session.emergency_request_id).maybeSingle()
        : await supabase.from("appointments").select("transcription_consent_at").eq("video_room_id", session.id).maybeSingle();
      if (error) throw error;
      return (data as { transcription_consent_at?: string | null } | null)?.transcription_consent_at ?? null;
    },
    transcriber: pickTranscriber(env),
    insertSegment: async (row) => {
      const { error } = await supabase
        .from("call_transcript_segments")
        .upsert(row, { onConflict: "webrtc_session_id,speaker_role,started_at", ignoreDuplicates: true });
      if (error) throw error;
    },
  });
}));
