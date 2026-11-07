import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type InvokeResult = { data: unknown; error: unknown };
const handlers: Record<string, (body: Record<string, unknown> | undefined) => InvokeResult> = {};
const invoke = vi.fn(async (name: string, options?: { body?: Record<string, unknown> }) =>
  handlers[name] ? handlers[name](options?.body) : { data: null, error: null },
);
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (name: string, options?: { body?: Record<string, unknown> }) => invoke(name, options) },
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  },
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

const subscription = {
  subscribed: false,
  subscriptionTier: null as string | null,
  subscriptionEnd: null as string | null,
  entitlementSource: null as string | null,
  organizationName: null,
  personalSubscriptionTier: null,
  cancelAtPeriodEnd: false,
  pendingTier: null as string | null,
  pendingFrom: null as string | null,
  paymentIssue: false,
  extraSubscriptions: 0,
  checkSubscription: vi.fn(async () => {}),
};
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => subscription }));

import SubscriptionPlans from '@/pages/SubscriptionPlans';

const renderPage = () =>
  render(
    <MemoryRouter>
      <SubscriptionPlans />
    </MemoryRouter>,
  );

const subscribedTo = (tier: string, extra: Partial<typeof subscription> = {}) =>
  Object.assign(subscription, {
    subscribed: true,
    subscriptionTier: tier,
    subscriptionEnd: '2026-10-20T12:00:00.000Z',
    entitlementSource: 'stripe',
    ...extra,
  });

beforeEach(() => {
  invoke.mockClear();
  toastMock.mockClear();
  for (const key of Object.keys(handlers)) delete handlers[key];
  Object.assign(subscription, {
    subscribed: false,
    subscriptionTier: null,
    subscriptionEnd: null,
    entitlementSource: null,
    cancelAtPeriodEnd: false,
    pendingTier: null,
    pendingFrom: null,
    paymentIssue: false,
    extraSubscriptions: 0,
  });
});

const calls = (name: string) => invoke.mock.calls.filter(([fn]) => fn === name).map(([, options]) => options?.body);

describe('planos e pagamento', () => {
  it('quem não assina vai ao checkout do plano escolhido', async () => {
    handlers['create-checkout'] = () => ({ data: { url: 'https://checkout.stripe.com/x' }, error: null });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar Agora' })[2]);
    await waitFor(() => expect(calls('create-checkout')).toEqual([{ plan: 'Completo' }]));
  });

  it('mostra os três planos pagos, com o Flex (SOS ou consulta) no meio', async () => {
    handlers['create-checkout'] = () => ({ data: { url: 'https://checkout.stripe.com/x' }, error: null });
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Assinar Agora' })).toHaveLength(3);
    expect(screen.getByText('R$ 69,90')).toBeInTheDocument();
    expect(screen.getByText('R$ 120,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 159,90')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar Agora' })[1]);
    await waitFor(() => expect(calls('create-checkout')).toEqual([{ plan: 'Flex' }]));
  });

  it('subir de plano mostra a diferença e troca na mesma assinatura, sem novo checkout', async () => {
    subscribedTo('Essencial');
    handlers['manage-subscription'] = (body) =>
      body?.action === 'preview_change'
        ? { data: { direction: 'upgrade', amount_due: 2505, proration_date: 1790000000, renews_on: '2026-10-20T12:00:00.000Z' }, error: null }
        : { data: { ok: true, direction: 'upgrade' }, error: null };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Mudar para Completo' }));
    expect(await screen.findByText(/Hoje cobramos R\$\s?25,05/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(calls('manage-subscription')).toContainEqual({ action: 'change_plan', plan: 'Completo', proration_date: 1790000000 }),
    );
    expect(calls('create-checkout')).toEqual([]);
    expect(subscription.checkSubscription).toHaveBeenCalled();
  });

  it('descer de plano vale na renovação, sem cobrança agora', async () => {
    subscribedTo('Completo');
    handlers['manage-subscription'] = () => ({ data: { direction: 'downgrade', effective_on: '2026-10-20T12:00:00.000Z' }, error: null });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para Essencial' }));
    expect(await screen.findByText(/Você continua no Completo até 20\/10\/2026.*Nada é cobrado agora/)).toBeInTheDocument();
  });

  it('cartão recusado na troca: avisa e nada muda', async () => {
    subscribedTo('Essencial');
    handlers['manage-subscription'] = (body) =>
      body?.action === 'preview_change'
        ? { data: { direction: 'upgrade', amount_due: 100, proration_date: 1, renews_on: '2026-10-20T12:00:00.000Z' }, error: null }
        : { data: { error_code: 'payment_failed' }, error: null };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para Completo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'O cartão recusou a cobrança' })));
  });

  it('cancelar mostra até quando o plano continua', async () => {
    subscribedTo('Essencial');
    handlers['cancel-subscription'] = (body) =>
      body?.preview
        ? { data: { refund_eligible: false, mode: 'period_end', access_until: '2026-10-20T12:00:00.000Z' }, error: null }
        : { data: { success: true, mode: 'period_end', access_until: '2026-10-20T12:00:00.000Z', refund_status: 'none' }, error: null };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    expect(await screen.findByText(/continua até 20\/10\/2026 e não será renovado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Cancelamento' }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('até 20/10/2026') })),
    );
  });

  it('cancelar dentro dos 7 dias avisa que a consulta agendada também é cancelada', async () => {
    subscribedTo('Completo');
    handlers['cancel-subscription'] = (body) =>
      body?.preview
        ? { data: { refund_eligible: true, refund_amount: 12000, mode: 'immediate', access_until: null, future_appointments: 1 }, error: null }
        : { data: { success: true, mode: 'immediate', refund_status: 'refunded', cancelled_appointments: 1 }, error: null };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    expect(await screen.findByTestId('cancel-appointments-warning')).toHaveTextContent('consulta agendada também será cancelada');
  });

  it('cancelar no fim do período avisa que a consulta marcada depois do fim será cancelada', async () => {
    subscribedTo('Completo');
    handlers['cancel-subscription'] = () => ({
      data: { refund_eligible: false, mode: 'period_end', access_until: '2026-10-20T12:00:00.000Z', future_appointments: 1 },
      error: null,
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    expect(await screen.findByTestId('cancel-appointments-warning')).toHaveTextContent(
      'consulta marcada para depois do fim do plano será cancelada quando ele terminar',
    );
  });

  it('plano já coberto pela empresa não abre checkout', async () => {
    handlers['create-checkout'] = () => ({ data: { error_code: 'covered_by_organization' }, error: null });
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar Agora' })[0]);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Seu plano já vem da empresa' })),
    );
  });

  it('cancelamento agendado pode ser desfeito', async () => {
    subscribedTo('Essencial', { cancelAtPeriodEnd: true });
    handlers['manage-subscription'] = () => ({ data: { ok: true }, error: null });
    renderPage();
    expect(screen.getByRole('note')).toHaveTextContent('Até 20/10/2026, tudo do Essencial continua liberado; depois, sua conta passa para o plano grátis.');
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manter minha assinatura' }));
    await waitFor(() => expect(calls('manage-subscription')).toEqual([{ action: 'resume' }]));
  });

  it('troca para baixo agendada aparece e pode ser desfeita', async () => {
    subscribedTo('Completo', { pendingTier: 'Essencial', pendingFrom: '2026-10-20T12:00:00.000Z' });
    handlers['manage-subscription'] = () => ({ data: { ok: true }, error: null });
    renderPage();
    expect(screen.getByRole('button', { name: 'Começa em 20/10/2026' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar no Completo' }));
    await waitFor(() => expect(calls('manage-subscription')).toEqual([{ action: 'keep_current' }]));
  });

  it('pagamento recusado na renovação pede para atualizar o cartão', () => {
    subscribedTo('Essencial', { paymentIssue: true });
    renderPage();
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Não conseguimos cobrar a renovação');
    expect(screen.getByRole('button', { name: 'Atualizar pagamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mudar para Completo' })).toBeDisabled();
  });

  it('avisa cobrança em dobro', () => {
    subscribedTo('Completo', { extraSubscriptions: 1 });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('está sendo cobrado em dobro');
  });
});
