import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  SILENCE_RMS,
  TRANSCRIPTION_CHUNK_SECONDS,
  TRANSCRIPTION_SAMPLE_RATE,
  bytesToBase64,
  concatFloat32,
  downsample,
  encodeWav,
  rms,
} from '@/lib/callTranscription';

interface UseCallTranscriptionOptions {
  sessionId: string;
  /** Microfone desta pessoa (cada lado transcreve só a própria voz). */
  localStream: MediaStream | null;
  /** Só grava com a chamada conectada e a sala aberta. */
  active: boolean;
}

/** Menos que isso no fim da chamada não vale um envio. */
const MIN_TAIL_SECONDS = 2;
const MAX_ATTEMPTS = 3;

type AudioContextCtor = typeof AudioContext;

/**
 * Transcrição da chamada: confere com o banco se o paciente consentiu
 * (`get_call_transcription_status`) e, se sim, envia o próprio microfone em
 * trechos de 30 s para `transcribe-call-chunk`. Microfone desligado ou
 * silêncio não são enviados. Devolve se a transcrição está ligada, para a sala
 * mostrar o aviso aos dois lados.
 */
export const useCallTranscription = ({ sessionId, localStream, active }: UseCallTranscriptionOptions) => {
  const [enabled, setEnabled] = useState(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc('get_call_transcription_status', { p_session_id: sessionId });
      if (cancelled) return;
      if (error) {
        console.warn('Transcrição: falha ao conferir o consentimento', error.message);
        setEnabled(false);
        return;
      }
      setEnabled(data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const audioTrack = localStream?.getAudioTracks()[0] ?? null;

  useEffect(() => {
    if (!enabled || !active || !audioTrack || stoppedRef.current) return;
    const Ctor: AudioContextCtor | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
        : undefined;
    if (!Ctor) return;

    let context: AudioContext;
    try {
      context = new Ctor();
    } catch (error) {
      console.warn('Transcrição: áudio indisponível', error);
      return;
    }
    // A mesma faixa do microfone (sem clonar): desligar o microfone na chamada
    // também silencia o que vai para a transcrição.
    const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
    const processor = context.createScriptProcessor(4096, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;

    let parts: Float32Array[] = [];
    let collected = 0;
    let chunkStartedAt = Date.now();
    const chunkSamples = TRANSCRIPTION_CHUNK_SECONDS * context.sampleRate;
    let queue: Promise<void> = Promise.resolve();
    let disposed = false;

    const send = (samples: Float32Array, startedAt: number, inputRate: number) => {
      const voice = downsample(samples, inputRate, TRANSCRIPTION_SAMPLE_RATE);
      if (rms(voice) < SILENCE_RMS) return;
      const durationMs = Math.round((voice.length / TRANSCRIPTION_SAMPLE_RATE) * 1000);
      const body = {
        session_id: sessionId,
        started_at: new Date(startedAt).toISOString(),
        duration_ms: durationMs,
        audio: bytesToBase64(encodeWav(voice, TRANSCRIPTION_SAMPLE_RATE)),
      };
      // Um envio por vez; repete se a rede falhar (o servidor não duplica).
      queue = queue.then(async () => {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const { error } = await supabase.functions.invoke('transcribe-call-chunk', { body });
          if (!error) return;
          const status = (error as { context?: { status?: number } }).context?.status;
          // Sem consentimento, chamada encerrada ou sem configuração: para de enviar.
          if (status === 403 || status === 409 || status === 503) {
            stoppedRef.current = true;
            return;
          }
          if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 2000));
          else console.warn('Transcrição: trecho não enviado', error.message);
        }
      });
    };

    const flush = (minSeconds: number) => {
      if (collected < minSeconds * context.sampleRate) return;
      const samples = concatFloat32(parts);
      const startedAt = chunkStartedAt;
      parts = [];
      collected = 0;
      chunkStartedAt = Date.now();
      send(samples, startedAt, context.sampleRate);
    };

    processor.onaudioprocess = (event) => {
      if (disposed || stoppedRef.current) return;
      if (collected === 0) chunkStartedAt = Date.now() - Math.round((event.inputBuffer.length / context.sampleRate) * 1000);
      parts.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      collected += event.inputBuffer.length;
      if (collected >= chunkSamples) flush(0);
    };

    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);
    void context.resume().catch(() => undefined);

    return () => {
      disposed = true;
      if (!stoppedRef.current) flush(MIN_TAIL_SECONDS);
      processor.onaudioprocess = null;
      try {
        source.disconnect();
        processor.disconnect();
        sink.disconnect();
      } catch {
        // já desconectado
      }
      void context.close().catch(() => undefined);
    };
  }, [enabled, active, audioTrack, sessionId]);

  return { transcriptionEnabled: enabled };
};
