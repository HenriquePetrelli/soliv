import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PsychologistData } from '@/hooks/usePsychologistManagement';

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const base = { email: 'x@x.com', submitted_at: '2026-01-01T00:00:00Z', approval_status: 'approved' as const };
const list: PsychologistData[] = [
  { ...base, id: 'ok', full_name: 'Conferida Recente', crp_number: '08/1', crp_status: 'ativo', crp_verified_at: new Date().toISOString() },
  { ...base, id: 'old', full_name: 'Bruna Antiga', crp_number: '08/2', crp_status: 'ativo', crp_verified_at: '2025-01-01T00:00:00Z' },
  { ...base, id: 'never', full_name: 'Carla Nunca', crp_number: '08/09958' },
];
const verifyCrp = vi.fn();

vi.mock('@/hooks/usePsychologistManagement', () => ({
  usePsychologistManagement: () => ({
    loading: false,
    error: null,
    pendingPsychologists: list,
    getPendingPsychologists: vi.fn(),
    getPsychologistDetails: vi.fn(),
    approvePsychologist: vi.fn(),
    rejectPsychologist: vi.fn(),
    verifyCrp,
  }),
}));

import { PsychologistApprovalPanel } from '@/components/psychologist/PsychologistApprovalPanel';

describe('Verificação de rotina do CRP (lista de psicólogos)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    verifyCrp.mockReset();
  });

  it('passa pelos pendentes um a um (nunca conferidos primeiro) e resume no fim', async () => {
    verifyCrp.mockImplementation(async (id: string) => ({ success: true, data: { ...list.find((p) => p.id === id)!, crp_status: 'ativo' } }));
    render(<PsychologistApprovalPanel adminUserId="admin" />);

    fireEvent.click(screen.getByRole('button', { name: /Verificação de rotina do CRP \(2\)/ }));
    expect(await screen.findByText('Verificação de rotina · 1 de 2')).toBeInTheDocument();
    expect(screen.getByText(/Carla Nunca · CRP/)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://cadastro.cfp.org.br',
        data: { source: 'soliv-cfp', version: 1, rows: [{ situacao: 'ATIVO', nome: 'CARLA NUNCA', regiao: '08ª Região - PR', registro: '09958', inscricao: '' }] },
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar: ATIVO no CFP/ }));

    expect(await screen.findByText('Verificação de rotina · 2 de 2')).toBeInTheDocument();
    expect(screen.getByText(/Bruna Antiga · CRP/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pular este/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rotina concluída: 1 ativo(s), 1 pulado(s).'));
    expect(screen.queryByText(/Verificação de rotina ·/)).not.toBeInTheDocument();
    expect(verifyCrp).toHaveBeenCalledTimes(1);
  });

  it('encerrar no meio avisa quantos faltam', async () => {
    render(<PsychologistApprovalPanel adminUserId="admin" />);
    fireEvent.click(screen.getByRole('button', { name: /Verificação de rotina do CRP/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Encerrar rotina/ }));
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('Faltam 2'));
  });
});
