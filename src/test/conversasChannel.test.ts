import { describe, it, expect, vi } from 'vitest';

// Supabase falso: um canal por nome (como o de verdade) e aviso do banco.
const rooms = vi.hoisted(() => new Map<string, { handlers: (() => void)[]; config: unknown; removed: boolean }>());
vi.mock('@/integrations/supabase/client', () => {
  const channel = (name: string, opts?: { config?: unknown }) => {
    if (!rooms.has(name)) rooms.set(name, { handlers: [], config: opts?.config, removed: false });
    const room = rooms.get(name)!;
    const api = {
      on: (_t: string, _f: unknown, cb: () => void) => { room.handlers.push(cb); return api; },
      subscribe: () => api,
      name,
    };
    return api;
  };
  return {
    supabase: {
      channel,
      realtime: { setAuth: () => Promise.resolve() },
      removeChannel: vi.fn((ch: { name: string }) => { rooms.get(ch.name)!.removed = true; rooms.delete(ch.name); }),
    },
  };
});

import { subscribeConversas } from '@/lib/conversasChannel';

const serverBroadcast = (name: string) => rooms.get(name)?.handlers.forEach((h) => h());

describe('lista de conversas: aviso do banco no canal privado da pessoa', () => {
  it('lista e conversa aberta dividem o canal; ele só sai quando as duas saem', () => {
    const lista = vi.fn();
    const conversa = vi.fn();
    const offLista = subscribeConversas('u1', lista);
    const offConversa = subscribeConversas('u1', conversa);
    expect([...rooms.keys()]).toEqual(['conversas:u1']);
    expect(rooms.get('conversas:u1')!.config).toEqual({ private: true });

    serverBroadcast('conversas:u1');
    expect(lista).toHaveBeenCalledTimes(1);
    expect(conversa).toHaveBeenCalledTimes(1);

    offLista();
    expect(rooms.has('conversas:u1')).toBe(true);
    serverBroadcast('conversas:u1');
    expect(lista).toHaveBeenCalledTimes(1);
    expect(conversa).toHaveBeenCalledTimes(2);

    offConversa();
    expect(rooms.has('conversas:u1')).toBe(false);
  });
});
