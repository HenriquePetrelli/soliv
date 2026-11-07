import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
const user = { id: 'patient-1' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user }) }));
const checkSubscription = vi.fn();
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => ({ checkSubscription, personalSubscriptionTier: personalTier }) }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/PatientBottomNav', () => ({ default: () => <div /> }));

import CompanyBenefit from '@/pages/CompanyBenefit';
import CompanyPortal from '@/pages/CompanyPortal';
import { joinErrorMessage } from '@/lib/organizations';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/beneficio-empresa" element={<CompanyBenefit />} />
        <Route path="/empresa" element={<CompanyPortal />} />
      </Routes>
    </MemoryRouter>,
  );

let personalTier: string | null = null;
let entitled: { tier: string; organization_name: string; ends_on: string | null } | null;

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.rpcHandlers = {};
  fakeDb.currentUserId = 'patient-1';
  entitled = null;
  personalTier = null;
  checkSubscription.mockClear();
  toastMock.success.mockClear();
  fakeDb.rpcHandlers.organization_entitlement = () => ({ data: entitled ? [entitled] : [], error: null });
});

describe('benefício da empresa (colaborador)', () => {
  it('usa o código do RH e passa a mostrar o plano da empresa', async () => {
    const join = vi.fn((_db: unknown, params: Record<string, unknown>) => {
      entitled = { tier: 'Completo', organization_name: 'Empresa X', ends_on: null };
      return { data: { ok: true, organization: 'Empresa X', tier: 'Completo', code: params.p_code }, error: null };
    });
    fakeDb.rpcHandlers.join_organization = join;
    renderAt('/beneficio-empresa');

    fireEvent.change(await screen.findByLabelText('Código da empresa'), { target: { value: 'empx2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar código' }));

    await waitFor(() => expect(join).toHaveBeenCalled());
    expect(join.mock.calls[0][1]).toEqual({ p_code: 'EMPX2026' });
    expect(await screen.findByText('Plano Completo pela Empresa X')).toBeInTheDocument();
    expect(screen.getByText('1 consulta agendada por mês, de 50 minutos')).toBeInTheDocument();
    expect(checkSubscription).toHaveBeenCalled();
  });

  it('explica por que o código não serviu', async () => {
    fakeDb.rpcHandlers.join_organization = () => ({ data: { ok: false, error: 'no_seats' }, error: null });
    renderAt('/beneficio-empresa');
    fireEvent.change(await screen.findByLabelText('Código da empresa'), { target: { value: 'EMPX2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('As vagas do benefício da sua empresa acabaram');
  });

  it('sai do benefício com confirmação', async () => {
    entitled = { tier: 'Essencial', organization_name: 'Empresa X', ends_on: '2026-12-31' };
    const leave = vi.fn(() => {
      entitled = null;
      return { data: null, error: null };
    });
    fakeDb.rpcHandlers.leave_organization = leave;
    renderAt('/beneficio-empresa');
    expect(await screen.findByText('Válido até 31/12/2026.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair do benefício' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(leave).toHaveBeenCalled());
    expect(await screen.findByLabelText('Código da empresa')).toBeInTheDocument();
  });

  it('avisa quem ainda paga assinatura própria com o plano da empresa ativo', async () => {
    entitled = { tier: 'Completo', organization_name: 'Empresa X', ends_on: null };
    personalTier = 'Essencial';
    renderAt('/beneficio-empresa');
    expect(await screen.findByRole('note')).toHaveTextContent('Você ainda paga uma assinatura própria (Essencial)');
  });

  it('mensagem do domínio cita o domínio da empresa', () => {
    expect(joinErrorMessage({ error: 'domain_mismatch', domain: 'empresa.com.br' })).toContain('@empresa.com.br');
  });
});

describe('portal do RH', () => {
  const dashboard = {
    id: 'org-1',
    name: 'Empresa X',
    plan_tier: 'Completo',
    status: 'active',
    starts_on: '2026-09-01',
    ends_on: null,
    seats: 10,
    members: 3,
    invite_code: 'EMPX2026',
    allowed_email_domain: 'empresa.com.br',
    usage: null,
    usage_min_members: 5,
  };

  it('mostra vagas e convite, e esconde o uso abaixo de 5 colaboradores', async () => {
    fakeDb.seed('organization_members', [{ user_id: 'patient-1', organization_id: 'org-1', role: 'manager', status: 'active' }]);
    fakeDb.rpcHandlers.get_organization_dashboard = () => ({ data: dashboard, error: null });
    renderAt('/empresa');
    expect(await screen.findByText('3 de 10')).toBeInTheDocument();
    expect(screen.getByText('EMPX2026')).toBeInTheDocument();
    expect(screen.getByText(/aparecem a partir de 5 colaboradores/)).toBeInTheDocument();
    expect(screen.getByText(/não vê quem usa o Soliv/)).toBeInTheDocument();
  });

  it('com 5+ colaboradores mostra só totais', async () => {
    fakeDb.seed('organization_members', [{ user_id: 'patient-1', organization_id: 'org-1', role: 'manager', status: 'active' }]);
    fakeDb.rpcHandlers.get_organization_dashboard = () => ({
      data: { ...dashboard, members: 7, usage: { sos_this_month: 2, consultations_this_month: 4, active_last_30_days: 6 } },
      error: null,
    });
    renderAt('/empresa');
    expect(await screen.findByText('Atendimentos SOS')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('desliga um colaborador pelo e-mail com acesso até o fim do mês', async () => {
    fakeDb.seed('organization_members', [{ user_id: 'patient-1', organization_id: 'org-1', role: 'manager', status: 'active' }]);
    fakeDb.rpcHandlers.get_organization_dashboard = () => ({ data: dashboard, error: null });
    const remove = vi.fn((_db: unknown, _params: Record<string, unknown>) => ({ data: { ok: true, access_until: '2026-10-31' }, error: null }));
    fakeDb.rpcHandlers.remove_organization_member_by_email = remove;
    renderAt('/empresa');

    fireEvent.change(await screen.findByLabelText('E-mail do colaborador'), { target: { value: 'ana@empresa.com.br ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar acesso' }));

    expect(await screen.findByRole('status')).toHaveTextContent('o acesso vai até 31/10/2026');
    expect(remove.mock.calls[0][1]).toEqual({ p_org: 'org-1', p_email: 'ana@empresa.com.br' });
  });

  it('quem não é gestor não vê o portal', async () => {
    renderAt('/empresa');
    expect(await screen.findByText('Você não é gestor de nenhuma empresa no Soliv.')).toBeInTheDocument();
  });
});
