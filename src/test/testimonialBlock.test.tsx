import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { testimonialBlockFromError, testimonialBlockMessage } from '@/lib/testimonialBlock';

const hook = vi.hoisted(() => ({
  deleteTestimonial: vi.fn(async () => true),
  blockAuthor: vi.fn(async () => true),
  unblockAuthor: vi.fn(async () => true),
}));

const row = {
  testimonial_id: 't1',
  group_id: 'g1',
  group_nome: 'Ansiedade',
  autor_nome: 'Ana Souza',
  anonimo: true,
  texto: 'texto ofensivo',
  humor: 3,
  likes_positivos: 0,
  likes_negativos: 12,
  flagged: true,
  criado_em: '2026-11-01T10:00:00Z',
  pending_reports: 1,
  report_reasons: ['ofensivo'],
  autor_user_id: 'u1',
  autor_email: 'ana@exemplo.com',
  autor_bloqueado: false,
  autor_bloqueado_ate: null,
};

vi.mock('@/hooks/useGroupTestimonialModeration', () => ({
  useGroupTestimonialModeration: () => ({
    testimonials: [row],
    loading: false,
    savingId: null,
    updateTestimonial: vi.fn(),
    dismissReports: vi.fn(),
    reload: vi.fn(),
    ...hook,
  }),
}));

import { GroupTestimonialModerationPanel } from '@/components/admin/GroupTestimonialModerationPanel';

beforeEach(() => Object.values(hook).forEach((fn) => fn.mockClear()));

describe('depoimentos: admin', () => {
  it('mostra o autor real do depoimento anônimo', () => {
    render(<GroupTestimonialModerationPanel />);
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('Anônimo para os outros')).toBeInTheDocument();
  });

  it('depois de excluir, abre a modal e bloqueia novos depoimentos do autor', async () => {
    render(<GroupTestimonialModerationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir depoimento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(hook.deleteTestimonial).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('Bloquear novos depoimentos?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1 mês' }));
    fireEvent.click(screen.getByRole('button', { name: /Bloquear \(1 mês\)/ }));
    await waitFor(() =>
      expect(hook.blockAuthor).toHaveBeenCalledWith('u1', { kind: 'timed', unit: 'months', amount: 1 }, ''),
    );
  });
});

describe('depoimentos: aviso ao paciente', () => {
  it('lê o bloqueio do erro do banco', () => {
    expect(testimonialBlockFromError({ message: 'TESTIMONIAL_BLOCKED', details: '2026-11-12T02:33:06Z' })).toEqual({
      blocked: true,
      blocked_until: '2026-11-12T02:33:06Z',
    });
    expect(testimonialBlockFromError({ message: 'TESTIMONIAL_BLOCKED', details: 'indefinite' })?.blocked_until).toBeNull();
    expect(testimonialBlockFromError({ message: 'outro erro' })).toBeNull();
  });

  it('mensagem genérica com até quando vale', () => {
    const msg = testimonialBlockMessage({ blocked: true, blocked_until: '2026-11-12T15:00:00Z' });
    expect(msg).toMatch(/fugiu dos padrões do Soliv/);
    expect(msg).toMatch(/afetando negativamente outras pessoas/);
    expect(msg).toMatch(/até 12 de novembro de 2026/);
    expect(testimonialBlockMessage({ blocked: true, blocked_until: null })).toMatch(/por tempo indeterminado/);
  });
});
