import { describe, it, expect, vi } from 'vitest';

// Simula o Supabase: um canal por nome, e broadcast só para o mesmo nome.
const rooms = new Map<string, { handlers: (() => void)[] }>();
vi.mock('@/integrations/supabase/client', () => {
  const channel = (name: string) => {
    if (!rooms.has(name)) rooms.set(name, { handlers: [] });
    const room = rooms.get(name)!;
    const api = {
      on: (_type: string, _filter: unknown, cb: () => void) => { room.handlers.push(cb); return api; },
      subscribe: () => api,
      send: () => { room.handlers.forEach((h) => h()); return Promise.resolve('ok'); },
    };
    return api;
  };
  return { supabase: { channel, removeChannel: vi.fn() } };
});

import { subscribeSosQueue } from '@/lib/sosQueueChannel';

// O aviso vem do banco (realtime.send no canal sos-queue).
const serverBroadcast = (name: string) => rooms.get(name)?.handlers.forEach((h) => h());

describe('fila do SOS em tempo real', () => {
  it('o aviso do banco chega a quem está ouvindo (mesmo canal)', () => {
    const psicologo = vi.fn();
    const paciente = vi.fn();
    const off1 = subscribeSosQueue(psicologo);
    subscribeSosQueue(paciente);
    serverBroadcast('sos-queue');
    expect(psicologo).toHaveBeenCalledTimes(1);
    expect(paciente).toHaveBeenCalledTimes(1);
    expect([...rooms.keys()]).toEqual(['sos-queue']);

    off1();
    serverBroadcast('sos-queue');
    expect(psicologo).toHaveBeenCalledTimes(1);
    expect(paciente).toHaveBeenCalledTimes(2);
  });
});
