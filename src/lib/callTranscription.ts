/**
 * Transcrição das chamadas de vídeo (SOS e consulta agendada).
 *
 * O paciente consente antes de entrar (confirmação do SOS por vídeo; tela antes
 * da sala da consulta). Durante a chamada, cada lado envia trechos do próprio
 * microfone para a edge function `transcribe-call-chunk`, que só aceita se o
 * consentimento estiver gravado no atendimento. O áudio não é guardado; só o
 * texto.
 */

/** Muda quando o texto do consentimento muda (fica gravado com o aceite). */
export const TRANSCRIPTION_CONSENT_VERSION = '1.0';

export const TRANSCRIPTION_CONSENT_LABEL =
  'Concordo que o áudio da chamada seja gravado e transcrito em texto.';

export const TRANSCRIPTION_CONSENT_DETAILS =
  'O áudio é usado só para gerar a transcrição e não fica guardado. O texto fica no seu registro de atendimento, ' +
  'visível para você e para o psicólogo que te atender, e é guardado pelo prazo legal dos registros de atendimento (5 anos).';

/** Duração mínima de cada trecho enviado: a partir dela, corta na próxima pausa. */
export const TRANSCRIPTION_CHUNK_SECONDS = 30;
/** Sem pausa na fala, corta mesmo assim neste limite (o servidor aceita até 90 s). */
export const TRANSCRIPTION_MAX_CHUNK_SECONDS = 40;
/** Abaixo disso (RMS de um bloco de ~85 ms), o bloco é silêncio. */
export const PAUSE_RMS = 0.01;
/** Silêncio seguido por esse tempo é uma pausa entre frases (não entre palavras). */
export const PAUSE_SECONDS = 0.3;
/** Frequência do áudio enviado (suficiente para voz e 3x menor que 48 kHz). */
export const TRANSCRIPTION_SAMPLE_RATE = 16000;
/** Abaixo disso (RMS), o trecho é silêncio e não é enviado. */
export const SILENCE_RMS = 0.006;

// ---------------------------------------------------------------------------
// Consentimento do SOS: passa da confirmação para a tela do SOS pela sessão da
// aba, como a triagem e o canal.

const SOS_CONSENT_KEY = 'sos:transcricao';

export const saveSosTranscriptionConsent = (consent: boolean) => {
  try {
    sessionStorage.setItem(SOS_CONSENT_KEY, consent ? '1' : '0');
  } catch {
    // Sem armazenamento: o SOS segue sem transcrição.
  }
};

export const takeSosTranscriptionConsent = (): boolean => {
  try {
    const raw = sessionStorage.getItem(SOS_CONSENT_KEY);
    sessionStorage.removeItem(SOS_CONSENT_KEY);
    return raw === '1';
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Áudio

/** Junta pedaços Float32 em um só. */
export const concatFloat32 = (parts: Float32Array[]): Float32Array => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

/** Reduz a frequência por média simples (voz, 48/44,1 kHz -> 16 kHz). */
export const downsample = (input: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
};

/**
 * Corta o trecho numa pausa da fala depois de 30 s, para não partir palavras
 * ou frases entre dois trechos (cada um é transcrito separado); sem pausa,
 * corta em 40 s. `quietSeconds` é há quanto tempo o microfone está em silêncio.
 */
export const shouldCutChunk = (collectedSeconds: number, quietSeconds: number): boolean =>
  collectedSeconds >= TRANSCRIPTION_MAX_CHUNK_SECONDS ||
  (collectedSeconds >= TRANSCRIPTION_CHUNK_SECONDS && quietSeconds >= PAUSE_SECONDS);

export const rms = (samples: Float32Array): number => {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
};

/** WAV PCM 16 bits mono. */
export const encodeWav = (samples: Float32Array, sampleRate: number): Uint8Array => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
};

// ---------------------------------------------------------------------------
// Leitura

export interface TranscriptSegment {
  speaker_role: 'patient' | 'psychologist';
  started_at: string;
  content: string;
}

/** Falas seguidas da mesma pessoa viram um bloco só. */
export const groupTranscript = (segments: TranscriptSegment[]): TranscriptSegment[] => {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.speaker_role === seg.speaker_role) {
      last.content = `${last.content} ${seg.content}`;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
};
