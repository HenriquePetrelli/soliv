import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// App instalado (Android/iOS): opção A, sem venda de assinatura.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }));
const invoke = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) },
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

const subscription = {
  subscribed: false,
  subscriptionTier: null as string | null,
  subscriptionEnd: null as string | null,
  entitlementSource: null as string | null,
  organizationName: null,
  personalSubscriptionTier: null,
  cancelAtPeriodEnd: false,
  pendingTier: null,
  pendingFrom: null,
  paymentIssue: false,
  extraSubscriptions: 0,
  checkSubscription: vi.fn(async () => {}),
};
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => subscription }));

import SubscriptionPlans from '@/pages/SubscriptionPlans';

const renderPage = () => render(<MemoryRouter><SubscriptionPlans /></MemoryRouter>);

beforeEach(() => {
  Object.assign(subscription, { subscribed: false, subscriptionTier: null, entitlementSource: null, paymentIssue: false });
});

describe('planos no app instalado', () => {
  it('não vende assinatura nem mostra preço de plano', () => {
    renderPage();
    expect(screen.getByText(/não estão disponíveis neste app/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assinar Agora/ })).toBeNull();
    expect(screen.queryByText('R$ 69,90')).toBeNull();
    expect(screen.queryByText(/site/i)).toBeNull();
  });

  it('quem já assina vê o plano e pode cancelar, sem trocar nem abrir o pagamento', () => {
    Object.assign(subscription, {
      subscribed: true,
      subscriptionTier: 'Essencial',
      subscriptionEnd: '2026-12-20T12:00:00.000Z',
      entitlementSource: 'stripe',
      paymentIssue: true,
    });
    renderPage();
    expect(screen.getAllByText('Plano Atual').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mudar para/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gerenciar pagamento|Atualizar pagamento/ })).toBeNull();
    expect(screen.queryByText(/Atualize o cartão/)).toBeNull();
  });
});
