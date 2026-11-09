import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challengeAndVerify: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { mfa, signOut: vi.fn(async () => ({ error: null })) }, rpc },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/Logo', () => ({ default: () => null }));

import AdminMfaVerification from '@/pages/AdminMfaVerification';
import AdminMfaGate from '@/components/admin/AdminMfaGate';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/verificacao" element={<AdminMfaVerification />} />
        <Route path="/admin-dashboard" element={<AdminMfaGate><p>Painel admin</p></AdminMfaGate>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(mfa).forEach((fn) => fn.mockReset());
  mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
  mfa.unenroll.mockResolvedValue({ error: null });
  // Produção: o código é exigido.
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe('verificação em duas etapas do admin', () => {
  it('app em teste: o painel abre só com a senha, sem pedir o código', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    renderAt('/admin-dashboard');
    expect(await screen.findByText('Painel admin')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('admin_mfa_required');
    expect(mfa.listFactors).not.toHaveBeenCalled();
  });

  it('app em teste: a tela do código leva direto ao painel', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    renderAt('/admin/verificacao');
    expect(await screen.findByText('Painel admin')).toBeInTheDocument();
  });

  it('sem conseguir ler o ambiente, o código continua sendo exigido', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'falhou' } });
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }, error: null });
    renderAt('/admin-dashboard');
    expect(await screen.findByText('Digite o código de 6 dígitos do seu app autenticador.')).toBeInTheDocument();
  });

  it('painel sem o código leva para a tela de verificação', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }, error: null });
    renderAt('/admin-dashboard');
    expect(await screen.findByText('Digite o código de 6 dígitos do seu app autenticador.')).toBeInTheDocument();
    expect(screen.queryByText('Painel admin')).not.toBeInTheDocument();
  });

  it('primeira vez: mostra o QR code, recomeça cadastro pela metade e ativa com o código', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'velho', factor_type: 'totp', status: 'unverified' }] }, error: null });
    mfa.enroll.mockResolvedValue({ data: { id: 'f2', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC123' } }, error: null });
    mfa.challengeAndVerify.mockImplementation(async () => {
      mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
      return { data: {}, error: null };
    });
    renderAt('/admin/verificacao');
    expect(await screen.findByAltText('QR code para o app autenticador')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-secret')).toHaveTextContent('ABC123');
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'velho' });

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Painel admin')).toBeInTheDocument();
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f2', code: '123456' });
  });

  it('código errado: avisa e não entra', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: new Error('Invalid TOTP code entered') });
    renderAt('/admin/verificacao');
    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Código inválido ou expirado/)).toBeInTheDocument();
    expect(screen.queryByText('Painel admin')).not.toBeInTheDocument();
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it('código incompleto não é enviado', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }, error: null });
    renderAt('/admin/verificacao');
    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Digite os 6 números que aparecem no app autenticador.')).toBeInTheDocument();
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('sessão já verificada abre o painel direto', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
    renderAt('/admin-dashboard');
    expect(await screen.findByText('Painel admin')).toBeInTheDocument();
    await waitFor(() => expect(mfa.listFactors).not.toHaveBeenCalled());
  });
});
