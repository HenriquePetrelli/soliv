import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Supabase falso que guarda cada escuta de tempo real (tabela, filtro, função).
type Listener = { table?: string; filter?: string; event?: string; cb: (payload: unknown) => void };
const rt = vi.hoisted(() => ({
  listeners: [] as Listener[],
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel = () => {
    const ch = {
      on: (_type: string, filter: { table?: string; filter?: string; event?: string }, cb: (p: unknown) => void) => {
        rt.listeners.push({ table: filter?.table, filter: filter?.filter, event: filter?.event, cb });
        return ch;
      },
      subscribe: () => ch,
      send: vi.fn(),
    };
    return ch;
  };
  const query = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.order = async () => ({ data: [], error: null });
    q.maybeSingle = async () => ({ data: null, error: null });
    return q;
  };
  return {
    supabase: {
      from: query,
      channel,
      removeChannel: vi.fn(),
      rpc: (name: string, params: unknown) => {
        rt.rpc(name, params);
        if (name === 'sos_chat_heartbeat') {
          return Promise.resolve({ data: { server_now: new Date().toISOString(), status: 'in_progress' }, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});

import { applyChatStateRow, emptySosChatState } from '@/lib/sosTextChat';
import { useSosChat } from '@/hooks/useSosChat';
import { FCM_CONCURRENCY, sendToTokens } from '../../supabase/functions/_shared/fcm';

beforeEach(() => {
  rt.listeners.length = 0;
  rt.rpc.mockClear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => vi.unstubAllGlobals());

describe('SOS por mensagem: sem laço de sinais', () => {
  it('a linha que chega pelo tempo real é aplicada sem chamar o servidor', async () => {
    const { result } = renderHook(() => useSosChat({ requestId: 'req-1', userType: 'patient' }));
    await waitFor(() => expect(rt.rpc).toHaveBeenCalledWith('sos_chat_heartbeat', expect.anything()));
    const beatsBefore = rt.rpc.mock.calls.filter(([n]) => n === 'sos_chat_heartbeat').length;

    const stateListener = rt.listeners.find((l) => l.table === 'sos_chat_state');
    expect(stateListener?.filter).toBe('request_id=eq.req-1');

    // O outro lado gravou dez vezes seguidas: antes, cada evento virava um
    // sinal novo (que gravava e gerava outro evento para os dois lados).
    const seenAt = '2026-11-27T10:00:00.000Z';
    act(() => {
      for (let i = 0; i < 10; i++) {
        stateListener!.cb({ new: { request_id: 'req-1', psychologist_seen_at: seenAt, psychologist_read_at: seenAt } });
      }
    });

    const beatsAfter = rt.rpc.mock.calls.filter(([n]) => n === 'sos_chat_heartbeat').length;
    expect(beatsAfter).toBe(beatsBefore);
    expect(result.current.state.psychologistSeenAt).toBe(seenAt);
    expect(result.current.state.psychologistReadAt).toBe(seenAt);
  });

  it('applyChatStateRow só troca o que veio na linha', () => {
    const prev = { ...emptySosChatState(), status: 'in_progress', patientSeenAt: 'a', lastPatientMessageAt: 'b' };
    const next = applyChatStateRow(prev, { psychologist_seen_at: 'c', last_patient_message_at: null });
    expect(next).toMatchObject({ status: 'in_progress', patientSeenAt: 'a', psychologistSeenAt: 'c', lastPatientMessageAt: null });
  });
});

describe('push para muitos aparelhos', () => {
  it(`no máximo ${FCM_CONCURRENCY} envios ao mesmo tempo, com o resultado de cada aparelho`, async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      const token = JSON.parse(init.body).message.token as string;
      return token.endsWith('7')
        ? new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 })
        : new Response('{}', { status: 200 });
    }));
    const tokens = Array.from({ length: 600 }, (_, i) => `tok-${i}`);
    const results = await sendToTokens({ client_email: 'x@y', private_key: 'k', project_id: 'p' }, 'access', tokens, { title: 'a', body: 'b' });
    expect(results).toHaveLength(600);
    expect(results.map((r) => r.token)).toEqual(tokens);
    expect(peak).toBeLessThanOrEqual(FCM_CONCURRENCY);
    expect(results.filter((r) => r.dead)).toHaveLength(60);
  });
});
