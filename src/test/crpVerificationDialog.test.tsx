import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CrpVerificationDialog } from '@/components/psychologist/CrpVerificationDialog';
import type { PsychologistData } from '@/hooks/usePsychologistManagement';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const psychologist: PsychologistData = {
  id: 'p1',
  full_name: 'Adriana Cláudia Bavelloni',
  email: 'a@a.com',
  crp_number: '08/09958',
  submitted_at: '2026-11-01T00:00:00Z',
  approval_status: 'pending',
};

const capture = (situacao: string) => ({
  source: 'soliv-cfp',
  version: 1,
  query: 'adriana',
  rows: [
    { situacao: 'ATIVO', nome: 'OUTRA PESSOA', regiao: '08ª Região - PR', registro: '11111', inscricao: '' },
    { situacao, nome: 'ADRIANA CLAUDIA BAVELLONI', regiao: '08ª Região - PR', registro: '09958', inscricao: '30/01/2004' },
  ],
});

const sendFromCfp = (data: unknown, origin = 'https://cadastro.cfp.org.br') =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  });

describe('Verificar CRP no CFP (painel)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'focus').mockImplementation(() => {});
  });

  it('recebe o resultado do atalho, acha o CRP e salva a linha confirmada', async () => {
    const verifyCrp = vi.fn().mockResolvedValue({ success: true, data: { ...psychologist, crp_status: 'ativo' } });
    const onVerified = vi.fn();
    render(<CrpVerificationDialog open onOpenChange={vi.fn()} psychologist={psychologist} verifyCrp={verifyCrp} onVerified={onVerified} />);

    expect(screen.getByText(/Aguardando o resultado do CFP/)).toBeInTheDocument();
    sendFromCfp(capture('ATIVO'));

    fireEvent.click(await screen.findByRole('button', { name: /Confirmar: ATIVO no CFP/ }));
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    expect(verifyCrp).toHaveBeenCalledWith('p1', expect.objectContaining({ registro: '09958', situacao: 'ATIVO' }), 'Busca no CFP: "adriana"');
  });

  it('ignora mensagens de outros sites', () => {
    render(<CrpVerificationDialog open onOpenChange={vi.fn()} psychologist={psychologist} verifyCrp={vi.fn()} onVerified={vi.fn()} />);
    sendFromCfp(capture('ATIVO'), 'https://malicioso.example');
    expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
  });

  it('CRP fora dos resultados: oferece marcar como não encontrado', async () => {
    const verifyCrp = vi.fn().mockResolvedValue({ success: true, data: { ...psychologist, crp_status: 'nao_encontrado' } });
    render(
      <CrpVerificationDialog
        open
        onOpenChange={vi.fn()}
        psychologist={{ ...psychologist, crp_number: '08/77777' }}
        verifyCrp={verifyCrp}
        onVerified={vi.fn()}
      />,
    );
    sendFromCfp(capture('ATIVO'));
    fireEvent.click(await screen.findByRole('button', { name: /Marcar como não encontrado/ }));
    await waitFor(() => expect(verifyCrp).toHaveBeenCalledWith('p1', null, expect.any(String)));
  });
});
