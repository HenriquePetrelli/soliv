import { supabase } from '@/integrations/supabase/client';

type Channel = ReturnType<typeof supabase.channel>;

/**
 * Entra num canal privado do tempo real com o login já carregado.
 *
 * Canal privado confere o login de quem entra. No primeiro canal da sessão,
 * o cliente ainda não terminou de carregar o login e entraria com a chave
 * pública (recusada; ele tentaria de novo depois de alguns segundos).
 */
export const subscribePrivate = (channel: Channel, callback?: Parameters<Channel['subscribe']>[0]) => {
  void Promise.resolve(supabase.realtime?.setAuth?.())
    .catch(() => undefined)
    .finally(() => channel.subscribe(callback));
  return channel;
};
