import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { shouldCutChunk } from '@/lib/callTranscription';

const sb = vi.hoisted(() => ({
  consent: true as boolean,
  rpcError: null as null | { message: string },
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: sb.consent, error: sb.rpcError })),
    functions: { invoke: (...args: unknown[]) => sb.invoke(...args) },
  },
}));

import { useCallTranscription } from '@/hooks/useCallTranscription';

// --- Áudio falso: o hook usa AudioContext + ScriptProcessor ---------------

const SAMPLE_RATE = 48000;
const BLOCK = 4096;

class FakeProcessor {
  onaudioprocess: ((e: { inputBuffer: { length: number; getChannelData: () => Float32Array } }) => void) | null = null;
  connect() {}
  disconnect() {}
}

const audio = { contexts: [] as FakeContext[] };

class FakeContext {
  sampleRate = SAMPLE_RATE;
  processor = new FakeProcessor();
  destination = {};
  closed = false;
  constructor() {
    audio.contexts.push(this);
  }
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createScriptProcessor() {
    return this.processor;
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
  /** Empurra `seconds` de áudio com a amplitude dada (0 = silêncio). */
  feed(seconds: number, amplitude: number) {
    const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK);
    for (let i = 0; i < blocks; i++) {
      const data = new Float32Array(BLOCK).map((_, j) => (amplitude ? amplitude * Math.sin(j / 5) : 0));
      this.processor.onaudioprocess?.({ inputBuffer: { length: BLOCK, getChannelData: () => data } });
    }
  }
}

class FakeMediaStream {
  constructor(private tracks: unknown[] = []) {}
  getAudioTracks() {
    return this.tracks;
  }
}

const track = { kind: 'audio', id: 'mic-1' };
const stream = () => new FakeMediaStream([track]) as unknown as MediaStream;

beforeEach(() => {
  sb.consent = true;
  sb.rpcError = null;
  sb.invoke.mockReset();
  sb.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  audio.contexts = [];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('MediaStream', FakeMediaStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sentBodies = () => sb.invoke.mock.calls.map(([, opts]) => (opts as { body: Record<string, unknown> }).body);
const wavSeconds = (base64: string) => (atob(base64).length - 44) / 2 / 16000;

const start = async (props: { active?: boolean; localStream?: MediaStream | null } = {}) => {
  const hook = renderHook((p: { active: boolean; localStream: MediaStream | null }) =>
    useCallTranscription({ sessionId: 'sess-1', localStream: p.localStream, active: p.active }),
  { initialProps: { active: props.active ?? true, localStream: props.localStream === undefined ? stream() : props.localStream } });
  await waitFor(() => expect(hook.result.current.transcriptionEnabled).toBe(sb.consent));
  return hook;
};

describe('corte dos trechos', () => {
  it('antes de 30 s não corta; depois, só numa pausa de 0,3 s; em 40 s corta sempre', () => {
    expect(shouldCutChunk(29.9, 5)).toBe(false);
    expect(shouldCutChunk(30, 0.1)).toBe(false);
    expect(shouldCutChunk(30, 0.3)).toBe(true);
    expect(shouldCutChunk(39.9, 0)).toBe(false);
    expect(shouldCutChunk(40, 0)).toBe(true);
  });
});

describe('useCallTranscription', () => {
  it('com consentimento e chamada conectada, envia um trecho WAV de fala depois de 30 s e uma pausa', async () => {
    await start();
    const ctx = audio.contexts[0];
    expect(ctx).toBeDefined();
    act(() => ctx.feed(31, 0.3)); // fala contínua passa de 30 s sem pausa: ainda não corta
    expect(sb.invoke).not.toHaveBeenCalled();
    act(() => ctx.feed(0.5, 0)); // pausa
    await waitFor(() => expect(sb.invoke).toHaveBeenCalledTimes(1));
    const [name] = sb.invoke.mock.calls[0];
    expect(name).toBe('transcribe-call-chunk');
    const body = sentBodies()[0];
    expect(body.session_id).toBe('sess-1');
    expect(typeof body.started_at).toBe('string');
    const seconds = wavSeconds(body.audio as string);
    expect(seconds).toBeGreaterThan(31);
    expect(seconds).toBeLessThan(32);
    expect(body.duration_ms).toBe(Math.round(seconds * 1000));
    expect(atob(body.audio as string).slice(0, 4)).toBe('RIFF');
  });

  it('fala sem pausa é cortada em 40 s', async () => {
    await start();
    act(() => audio.contexts[0].feed(41, 0.3));
    await waitFor(() => expect(sb.invoke).toHaveBeenCalledTimes(1));
    expect(wavSeconds(sentBodies()[0].audio as string)).toBeCloseTo(40, 0);
  });

  it('silêncio (ou microfone desligado) não é enviado', async () => {
    await start();
    act(() => audio.contexts[0].feed(45, 0));
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('sem consentimento: não abre o microfone nem envia nada', async () => {
    sb.consent = false;
    await start();
    expect(audio.contexts).toHaveLength(0);
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('falha ao conferir o consentimento: fica desligada', async () => {
    sb.rpcError = { message: 'rede' };
    sb.consent = false;
    await start();
    expect(audio.contexts).toHaveLength(0);
  });

  it('antes de conectar não grava; ao conectar, começa', async () => {
    const hook = await start({ active: false });
    expect(audio.contexts).toHaveLength(0);
    hook.rerender({ active: true, localStream: stream() });
    expect(audio.contexts).toHaveLength(1);
  });

  it('ao sair da chamada, envia o que falta (se tiver 2 s ou mais) e fecha o áudio', async () => {
    const hook = await start();
    const ctx = audio.contexts[0];
    act(() => ctx.feed(5, 0.3));
    hook.rerender({ active: false, localStream: stream() });
    await waitFor(() => expect(sb.invoke).toHaveBeenCalledTimes(1));
    expect(wavSeconds(sentBodies()[0].audio as string)).toBeCloseTo(5, 0);
    expect(ctx.closed).toBe(true);
  });

  it('menos de 2 s no fim não é enviado', async () => {
    const hook = await start();
    act(() => audio.contexts[0].feed(1, 0.3));
    hook.unmount();
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('servidor recusa sem consentimento (403): para de enviar', async () => {
    sb.invoke.mockResolvedValue({ data: null, error: { message: 'x', context: { status: 403 } } });
    await start();
    const ctx = audio.contexts[0];
    act(() => ctx.feed(41, 0.3));
    await waitFor(() => expect(sb.invoke).toHaveBeenCalledTimes(1));
    act(() => ctx.feed(41, 0.3));
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.invoke).toHaveBeenCalledTimes(1);
  });

  it('erro de rede: tenta de novo o mesmo trecho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sb.invoke
      .mockResolvedValueOnce({ data: null, error: { message: 'falha', context: { status: 500 } } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    await start();
    act(() => audio.contexts[0].feed(41, 0.3));
    await waitFor(() => expect(sb.invoke).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await waitFor(() => expect(sb.invoke).toHaveBeenCalledTimes(2));
    expect(sentBodies()[1]).toEqual(sentBodies()[0]);
    vi.useRealTimers();
  });

  it('trocar o microfone recomeça a captura no aparelho novo', async () => {
    const hook = await start();
    expect(audio.contexts).toHaveLength(1);
    const other = new FakeMediaStream([{ kind: 'audio', id: 'mic-2' }]) as unknown as MediaStream;
    hook.rerender({ active: true, localStream: other });
    expect(audio.contexts).toHaveLength(2);
    expect(audio.contexts[0].closed).toBe(true);
  });
});
