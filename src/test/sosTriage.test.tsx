import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sanitizeTriage, isPriorityTriage, saveSosTriage, takeSosTriage } from '@/lib/sosTriage';
import ConfirmationModal from '@/components/sos/ConfirmationModal';

const emergency = vi.hoisted(() => ({ requests: [] as any[] }));
vi.mock('@/hooks/usePsychologistEmergency', () => ({
  usePsychologistEmergency: () => ({
    emergencyRequests: emergency.requests,
    loading: false,
    acceptEmergencyRequest: vi.fn(),
    declineEmergencyRequest: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePsychologistPresence', () => ({
  usePsychologistPresence: () => ({ isOnline: true, loading: false, initialized: true, setOnlineStatus: vi.fn() }),
}));

import EmergencyNotifications from '@/components/psychologist/EmergencyNotifications';

beforeEach(() => {
  sessionStorage.clear();
  emergency.requests = [];
});

describe('triagem do SOS: regras', () => {
  it('aceita só opções conhecidas, sem repetir, na ordem da lista', () => {
    expect(sanitizeTriage(['panico', 'inventado', 'suicidio', 'panico', 3])).toEqual(['suicidio', 'panico']);
    expect(sanitizeTriage('suicidio')).toEqual([]);
  });

  it('suicídio e perigo são prioritários', () => {
    expect(isPriorityTriage(['ansiedade'])).toBe(false);
    expect(isPriorityTriage(['ansiedade', 'suicidio'])).toBe(true);
    expect(isPriorityTriage(['perigo'])).toBe(true);
    expect(isPriorityTriage(null)).toBe(false);
  });

  it('a escolha passa da confirmação para o SOS uma vez só', () => {
    saveSosTriage(['panico']);
    expect(takeSosTriage()).toEqual(['panico']);
    expect(takeSosTriage()).toEqual([]);
  });
});

describe('triagem do SOS: tela de confirmação', () => {
  const renderModal = (onConfirm = vi.fn()) => {
    render(<ConfirmationModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    return onConfirm;
  };

  it('chama o psicólogo sem marcar nenhuma triagem (só o consentimento do vídeo)', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('checkbox', { name: /transcrito/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, chamar um psicólogo' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(takeSosTriage()).toEqual([]);
  });

  it('pensamentos de suicídio mostram SAMU e CVV na hora, e a escolha segue com o pedido', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Pensamentos de suicídio ou de me machucar' }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('link', { name: /SAMU 192/ })).toHaveAttribute('href', 'tel:192');
    expect(within(alert).getByRole('link', { name: /CVV 188/ })).toHaveAttribute('href', 'tel:188');
    fireEvent.click(screen.getByRole('button', { name: 'Crise de pânico' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /transcrito/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, chamar um psicólogo' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(takeSosTriage()).toEqual(['suicidio', 'panico']);
  });

  it('perigo ou violência mostra polícia e Ligue 180', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Estou em perigo ou sofri violência' }));
    expect(screen.getByRole('link', { name: /Polícia 190/ })).toHaveAttribute('href', 'tel:190');
    expect(screen.getByRole('link', { name: /Ligue 180/ })).toHaveAttribute('href', 'tel:180');
  });

  it('tocar de novo desmarca', () => {
    renderModal();
    const option = screen.getByRole('button', { name: 'Crise de ansiedade' });
    fireEvent.click(option);
    expect(option).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(option);
    expect(option).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('triagem do SOS: fila do psicólogo', () => {
  it('mostra o que o paciente marcou e põe o prioritário na frente', () => {
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    const recent = new Date().toISOString();
    emergency.requests = [
      { id: 'a', status: 'pending', created_at: old, triage: ['ansiedade'], patient: { full_name: 'Ana' } },
      { id: 'b', status: 'pending', created_at: recent, triage: ['suicidio'], patient: { full_name: 'Bia' } },
      { id: 'c', status: 'pending', created_at: old, triage: [], patient: { full_name: 'Caio' } },
    ];
    render(<MemoryRouter><EmergencyNotifications /></MemoryRouter>);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names.indexOf('Bia')).toBeLessThan(names.indexOf('Ana'));
    expect(screen.getByText('PRIORITÁRIO')).toBeInTheDocument();
    expect(screen.getByText('Pensamentos de suicídio ou de me machucar')).toBeInTheDocument();
    expect(screen.getByText('Crise de ansiedade')).toBeInTheDocument();
    expect(screen.getByText('O paciente não marcou nada na triagem.')).toBeInTheDocument();
  });
});
