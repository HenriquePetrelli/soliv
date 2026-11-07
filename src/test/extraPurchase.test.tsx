import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type InvokeResult = { data: unknown; error: unknown };
const handlers: Record<string, (body: Record<string, unknown> | undefined) => InvokeResult> = {};
const invoke = vi.fn(async (name: string, options?: { body?: Record<string, unknown> }) =>
  handlers[name] ? handlers[name](options?.body) : { data: null, error: null },
);
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (name: string, options?: { body?: Record<string, unknown> }) => invoke(name, options) } },
}));
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/components/appointments/AppointmentScheduler', () => ({ AppointmentScheduler: () => <div>agenda aberta</div> }));
vi.mock('@/components/appointments/UpcomingAppointments', () => ({ UpcomingAppointments: () => null }));
vi.mock('@/components/appointments/AppointmentHistory', () => ({ AppointmentHistory: () => null }));

const subscription = {
  subscribed: false,
  subscriptionTier: null as string | null,
  canScheduleAppointment: false,
  planCanScheduleAppointment: false,
  planAppointmentReason: null as string | null,
  extraCredits: { sos: 0, appointment: 0 },
  extraPrices: { sos: 7990, appointment: 14990 },
  checkSubscription: vi.fn(async () => {}),
};
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => subscription }));

import Appointments from '@/pages/Appointments';

const renderPage = () =>
  render(
    <MemoryRouter>
      <Appointments />
    </MemoryRouter>,
  );

beforeEach(() => {
  invoke.mockClear();
  toastMock.mockClear();
  for (const key of Object.keys(handlers)) delete handlers[key];
  Object.assign(subscription, {
    subscribed: false,
    subscriptionTier: null,
    canScheduleAppointment: false,
    planCanScheduleAppointment: false,
    planAppointmentReason: null,
    extraCredits: { sos: 0, appointment: 0 },
    extraPrices: { sos: 7990, appointment: 14990 },
  });
});

describe('consulta avulsa', () => {
  it('sem plano: oferece assinar ou comprar a consulta avulsa por R$ 149,90', async () => {
    handlers['buy-extra'] = () => ({ data: { ok: true, credit_id: 'c1' }, error: null });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Agendar/ }));
    expect(await screen.findByText(/Plano Grátis, que não inclui consultas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinar um plano' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Comprar por R\$\s?149,90/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('buy-extra', expect.objectContaining({ body: expect.objectContaining({ action: 'buy', kind: 'appointment' }) })));
    // Cobrado no cartão salvo: abre a agenda na hora.
    expect(await screen.findByText('agenda aberta')).toBeInTheDocument();
  });

  it('com plano e consulta do mês usada: avisa e cobra o preço de assinante (R$ 109,90)', async () => {
    Object.assign(subscription, {
      subscribed: true,
      subscriptionTier: 'Completo',
      planAppointmentReason: 'Limite mensal de consultas agendadas já utilizado (COMPLETO: 1x/mês)',
      extraPrices: { sos: 5490, appointment: 10990 },
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Agendar/ }));
    expect(await screen.findByText('Você já usou a consulta agendada do seu plano neste mês.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comprar por R\$\s?109,90/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver planos' })).toBeInTheDocument();
  });

  it('sem cartão salvo: vai para a página de pagamento do Stripe', async () => {
    handlers['buy-extra'] = () => ({ data: { url: 'https://checkout.stripe.com/c/pay/x' }, error: null });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, set href(v: string) { assign(v); } }, writable: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Agendar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Comprar por/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/x'));
  });

  it('com consulta avulsa já paga: agenda direto, sem cobrar de novo', async () => {
    Object.assign(subscription, { canScheduleAppointment: true, extraCredits: { sos: 0, appointment: 1 } });
    renderPage();
    expect(screen.getByText('Você tem 1 consulta avulsa para agendar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Agendar/ }));
    expect(await screen.findByText('agenda aberta')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('compra recusada: avisa que nada foi cobrado', async () => {
    handlers['buy-extra'] = () => ({ data: null, error: new Error('falhou') });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Agendar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Comprar por/ }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: 'Nada foi cobrado. Tente de novo.' })));
  });
});
