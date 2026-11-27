import { supabase } from '@/integrations/supabase/client';
import { subscribePrivate } from '@/lib/privateChannel';

/**
 * Broadcast bus for the SOS queue.
 *
 * Postgres realtime events respect RLS: when a pending request is cancelled the
 * psychologist can no longer read the row, so the UPDATE never reaches him and
 * the card would stay on screen forever. A broadcast channel is RLS-free and
 * lets both sides refresh their view instantly.
 *
 * Um broadcast só chega a quem está no canal com o MESMO nome. Antes, cada tela
 * ouvia um canal próprio (`sos-queue-listener-<aleatório>`) e o aviso, enviado
 * em `sos-queue`, nunca chegava: a fila só se atualizava pela checagem
 * periódica. Agora há um canal só (o Supabase devolve o mesmo objeto para o
 * mesmo nome) e as telas se inscrevem numa lista interna.
 *
 * Quem avisa é o banco (gatilho em emergency_requests, realtime.send), a cada
 * pedido novo ou mudança de status. Antes cada aparelho também mandava avisos
 * (e cada psicólogo escutava a tabela inteira): cada mudança virava vários
 * avisos para todos os conectados.
 */
const CHANNEL = 'sos-queue';

const listeners = new Set<() => void>();
let shared: ReturnType<typeof supabase.channel> | null = null;

const getChannel = () => {
  if (!shared) {
    shared = subscribePrivate(
      supabase
        // Privado: só quem está logado ouve; só o banco envia.
        .channel(CHANNEL, { config: { private: true } })
        .on('broadcast', { event: 'queue-changed' }, () => {
          listeners.forEach((listener) => {
            try {
              listener();
            } catch (error) {
              console.error('[SOS] queue listener failed', error);
            }
          });
        }),
    );
  }
  return shared;
};

/** Subscribes to queue changes. Returns an unsubscribe function. */
export const subscribeSosQueue = (onChange: () => void) => {
  listeners.add(onChange);
  getChannel();
  return () => {
    listeners.delete(onChange);
  };
};
