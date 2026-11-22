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
    localStorage.clear();
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

  it('primeiro login (sem plano guardado) confere na hora, sem esperar o navegador ficar ocioso', () => {
    auth.user = { id: 'u5' };
    auth.userType = 'patient';
    invoke.mockReturnValue(new Promise(() => {}));
    mount();
    expect(invoke).toHaveBeenCalledWith('check-subscription', { body: { force: false } });
  });

  it('guarda o último plano no aparelho e, no login seguinte, mostra antes de conferir', async () => {
    auth.user = { id: 'u6' };
    auth.userType = 'patient';
    invoke.mockResolvedValue({ data: { subscribed: true, subscription_tier: 'essencial' }, error: null });
    const first = mount();
    await waitFor(() => expect(localStorage.getItem('soliv:subscription:u6')).toContain('"subscribed":true'));
    first.unmount();

    invoke.mockClear();
    invoke.mockReturnValue(new Promise(() => {}));
    mount();
    // Com o plano guardado, a conferência espera o navegador ficar ocioso.
    expect(invoke).not.toHaveBeenCalled();
    await waitFor(() => expect(invoke).toHaveBeenCalled(), { timeout: 4000 });
  });
});
