import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = {
  subscribed: false,
  subscriptionTier: null as string | null,
  entitlementSource: null as string | null,
  checkSubscription: vi.fn(async () => {
    // O webhook confirma na segunda verificação.
    if (state.checkSubscription.mock.calls.length >= 2) {
      Object.assign(state, { subscribed: true, subscriptionTier: 'Completo', entitlementSource: 'stripe' });
    }
  }),
};
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => state }));

import SubscriptionSuccess from '@/pages/SubscriptionSuccess';

describe('volta do checkout', () => {
  it('só diz "ativado" depois que o servidor confirma', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <SubscriptionSuccess />
      </MemoryRouter>,
    );
    expect(screen.getByText('Confirmando seu pagamento...')).toBeInTheDocument();
    expect(await screen.findByText('Plano Completo ativado!', {}, { timeout: 6000 })).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <SubscriptionSuccess />
      </MemoryRouter>,
    );
    expect(screen.getByText('1 consulta agendada por mês, de 50 minutos')).toBeInTheDocument();
  }, 10000);
});
