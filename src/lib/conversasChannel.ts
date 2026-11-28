import { supabase } from '@/integrations/supabase/client';
import { subscribePrivate } from '@/lib/privateChannel';

/**
 * Aviso de "suas conversas mudaram" (conversa nova, status, mensagem nova ou
 * lida), mandado pelo banco no canal privado `conversas:<id>` — só a própria
 * pessoa ouve e ninguém do app envia.
 *
 * Antes a lista escutava a tabela `conversas` pelo postgres_changes: no teste
 * de carga de 2026-11-27, o tempo real gastou 72% do tempo do banco lendo e
 * conferindo mudanças assim. O Supabase devolve o mesmo canal para o mesmo
 * nome, então as telas (lista e conversa aberta) se inscrevem numa lista
 * interna e o canal sai quando a última sai.
 */
type Entry = { channel: ReturnType<typeof supabase.channel>; listeners: Set<() => void> };
const byUser = new Map<string, Entry>();

export const subscribeConversas = (userId: string, onChange: () => void) => {
  let entry = byUser.get(userId);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = subscribePrivate(
      supabase.channel(`conversas:${userId}`, { config: { private: true } }).on('broadcast', { event: 'changed' }, () => {
        listeners.forEach((listener) => {
          try {
            listener();
          } catch (error) {
            console.error('[chat] conversas listener failed', error);
          }
        });
      }),
    );
    entry = { channel, listeners };
    byUser.set(userId, entry);
  }
  entry.listeners.add(onChange);
  return () => {
    const current = byUser.get(userId);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      byUser.delete(userId);
      void supabase.removeChannel(current.channel);
    }
  };
};
