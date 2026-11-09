import { supabase } from '@/integrations/supabase/client';

/** Bloqueio de depoimentos do próprio paciente (posto pelo admin). */
export interface TestimonialBlock {
  blocked: boolean;
  /** null com blocked = tempo indeterminado. */
  blocked_until: string | null;
}

export const fetchMyTestimonialBlock = async (): Promise<TestimonialBlock> => {
  try {
    const { data, error } = await supabase.rpc('get_my_testimonial_block');
    if (error || !data) return { blocked: false, blocked_until: null };
    const block = data as unknown as TestimonialBlock;
    if (block.blocked && block.blocked_until && new Date(block.blocked_until).getTime() <= Date.now()) {
      return { blocked: false, blocked_until: null };
    }
    return { blocked: block.blocked === true, blocked_until: block.blocked_until ?? null };
  } catch {
    return { blocked: false, blocked_until: null };
  }
};

/** O banco recusou a gravação por causa do bloqueio (trigger guard_testimonial_ban). */
export const testimonialBlockFromError = (error: unknown): TestimonialBlock | null => {
  const e = error as { message?: string; details?: string } | null;
  if (!e?.message || !e.message.includes('TESTIMONIAL_BLOCKED')) return null;
  const until = e.details && e.details !== 'indefinite' ? e.details : null;
  return { blocked: true, blocked_until: until };
};

/** Texto do aviso ao paciente (genérico: não repete o motivo interno do admin). */
export const testimonialBlockMessage = (block: TestimonialBlock): string => {
  const ate = block.blocked_until
    ? `até ${new Date(block.blocked_until).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`
    : 'por tempo indeterminado';
  return (
    'Um depoimento seu fugiu dos padrões do Soliv e pode acabar afetando negativamente outras pessoas do grupo. ' +
    `Por isso, a criação de depoimentos está bloqueada na sua conta ${ate}. ` +
    'Você continua podendo ler os depoimentos do grupo.'
  );
};
