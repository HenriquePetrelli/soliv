import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/components/Logo', () => ({ default: () => <div /> }));

import ResetPassword from '@/pages/ResetPassword';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/entrar" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.authUpdates = [];
  fakeDb.authUpdateError = null;
  fakeDb.authListeners = [];
  window.location.hash = '';
});

describe('troca de senha pelo link do e-mail', () => {
  it('com a sessão de recuperação, define a nova senha e volta ao login', async () => {
    fakeDb.currentUserId = 'u1';
    renderPage();
    fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'novaSenha1' } });
    fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: 'novaSenha1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => expect(fakeDb.authUpdates).toEqual([{ password: 'novaSenha1' }]));
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
    expect(fakeDb.currentUserId).toBeNull();
  });

  it('não aceita senhas diferentes', async () => {
    fakeDb.currentUserId = 'u1';
    renderPage();
    fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'novaSenha1' } });
    fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: 'outra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não coincidem');
    expect(fakeDb.authUpdates).toHaveLength(0);
  });

  it('a sessão de recuperação pode chegar depois, pelo evento do Supabase', async () => {
    fakeDb.currentUserId = null;
    renderPage();
    await act(async () => fakeDb.authListeners.forEach((l) => l('PASSWORD_RECOVERY', { user: { id: 'u1' } })));
    expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument();
  });

  it('link vencido: oferece pedir outro', async () => {
    fakeDb.currentUserId = null;
    window.location.hash = '#error=access_denied&error_code=otp_expired';
    renderPage();
    expect(await screen.findByText(/venceu ou já foi usado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir um novo link' })).toBeInTheDocument();
  });
});
