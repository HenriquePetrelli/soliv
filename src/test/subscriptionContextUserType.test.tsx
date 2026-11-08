import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const auth = { user: null as { id: string } | null, userType: 'unknown' as string };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const toastFn = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastFn }) }));

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: { getSession: () => getSession() },
  },
}));

import { SubscriptionProvider } from '@/contexts/SubscriptionContext';

const mount = () => render(<SubscriptionProvider><div /></SubscriptionProvider>);

describe('conferência de assinatura', () => {
  beforeEach(() => {
    invoke.mockReset();
    getSession.mockReset();
    toastFn.mockReset();
    sessionStorage.clear();
  });

  it('psicólogo em análise (tipo desconhecido) não consulta a assinatura', async () => {
    auth.user = { id: 'u1' };
    auth.userType = 'unknown';
    mount();
    await new Promise((r) => setTimeout(r, 700));
    expect(invoke).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('paciente consulta a assinatura', async () => {
    auth.user = { id: 'u2' };
    auth.userType = 'patient';
    invoke.mockResolvedValue({ data: { subscribed: true }, error: null });
    mount();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('check-subscription', { body: { force: false } }), { timeout: 4000 });
  });

  it('falha depois de sair da conta não mostra "Erro ao verificar assinatura"', async () => {
    auth.user = { id: 'u3' };
    auth.userType = 'patient';
    invoke.mockResolvedValue({ data: null, error: new Error('401') });
    getSession.mockResolvedValue({ data: { session: null } });
    mount();
    await waitFor(() => expect(getSession).toHaveBeenCalled(), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 20));
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('falha com a sessão ativa avisa o paciente', async () => {
    auth.user = { id: 'u4' };
    auth.userType = 'patient';
    invoke.mockResolvedValue({ data: null, error: new Error('500') });
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u4' } } } });
    mount();
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ description: 'Erro ao verificar assinatura' })), { timeout: 4000 });
  });
});
