import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
const user = { id: 'patient-1' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user }) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/PatientBottomNav', () => ({ default: () => <div /> }));

import SafetyPlanEditor from '@/pages/SafetyPlanEditor';
import SafetyPlanView from '@/pages/SafetyPlanView';
import SosSafetyPlanDialog from '@/components/sos/SosSafetyPlanDialog';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/safety-plan" element={<div>lista</div>} />
        <Route path="/safety-plan/:planId" element={<SafetyPlanEditor />} />
        <Route path="/safety-plan/:planId/ver" element={<SafetyPlanView />} />
      </Routes>
    </MemoryRouter>,
  );

const seedPlan = () => {
  fakeDb.seed('safety_plans', [
    {
      id: '1',
      patient_id: 'patient-1',
      title: 'Plano da noite',
      warning_signs: [],
      coping_strategies: ['Respirar fundo'],
      distractions: [],
      safe_environment: [],
      reasons_to_live: ['Minha filha'],
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
    },
  ]);
  fakeDb.seed('emergency_contacts', [
    { plan_id: '1', name: 'Mãe', relationship: null, phone: '11988880000', is_primary: true, created_at: '2026-09-21' },
  ]);
};

const offline = { message: 'TypeError: Failed to fetch', code: '' };

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.writes = [];
  fakeDb.rpcHandlers = {};
  fakeDb.currentUserId = 'patient-1';
  fakeDb.failSelectWith = null;
  fakeDb.offlineError = null;
  localStorage.clear();
  toast.mockClear();
});

describe('plano de segurança: na crise, sem internet', () => {
  it('abre a última versão guardada no aparelho, com os contatos para ligar', async () => {
    seedPlan();
    const online = renderAt('/safety-plan/1/ver');
    expect(await screen.findByText('Minha filha')).toBeInTheDocument();
    online.unmount();

    fakeDb.offlineError = offline;
    renderAt('/safety-plan/1/ver');
    expect(await screen.findByText('Minha filha')).toBeInTheDocument();
    expect(screen.getByText(/Sem internet: mostrando a última versão salva neste aparelho/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ligar para Mãe')).toHaveAttribute('href', 'tel:11988880000');
  });

  it('no SOS, sem internet e sem cópia, não diz "você não tem plano": oferece o CVV', async () => {
    fakeDb.offlineError = offline;
    render(<SosSafetyPlanDialog open onOpenChange={() => {}} />);
    expect(await screen.findByText(/Sem internet para abrir o seu plano agora/)).toBeInTheDocument();
    expect(screen.queryByText(/Você ainda não tem um plano/)).not.toBeInTheDocument();
  });
});

describe('plano de segurança: editar sem perder nada', () => {
  it('sair sem salvar e voltar recupera o que foi escrito', async () => {
    const first = renderAt('/safety-plan/novo');
    const title = await screen.findByLabelText('Título do plano');
    fireEvent.change(title, { target: { value: 'Para as noites' } });
    await waitFor(() => expect(localStorage.getItem('plano:patient-1:rascunho:novo')).toContain('Para as noites'));
    first.unmount();

    renderAt('/safety-plan/novo');
    // O campo aparece quando termina o carregamento; o rascunho entra logo depois.
    const restored = await screen.findByLabelText('Título do plano');
    await waitFor(() => expect(restored).toHaveValue('Para as noites'));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recuperamos o que você não tinha salvado' }));
  });

  it('plano novo: tentar salvar de novo usa o mesmo id (não cria plano em dobro)', async () => {
    const saveSpy = vi
      .fn()
      .mockReturnValueOnce({ data: null, error: offline })
      .mockReturnValue({ data: 'novo-1', error: null });
    fakeDb.rpcHandlers.save_safety_plan = (_db, params) => saveSpy(params);
    renderAt('/safety-plan/novo');
    fireEvent.change(await screen.findByLabelText('Título do plano'), { target: { value: 'Plano A' } });
    fireEvent.click(screen.getByText('Salvar plano'));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByText('Salvar plano'));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    const [a, b] = saveSpy.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(a.p_new_id).toBeTruthy();
    expect(b.p_new_id).toBe(a.p_new_id);
    await screen.findByText('lista');
    expect(localStorage.getItem('plano:patient-1:rascunho:novo')).toBeNull();
  });

  it('mudou em outro aparelho: não sobrescreve e explica', async () => {
    seedPlan();
    const saveSpy = vi.fn((_params: Record<string, unknown>) => ({ data: null, error: { code: '40001', message: 'alterado em outro aparelho' } }));
    fakeDb.rpcHandlers.save_safety_plan = (_db, params) => saveSpy(params);
    renderAt('/safety-plan/1');
    fireEvent.change(await screen.findByLabelText('Título do plano'), { target: { value: 'Outro título' } });
    fireEvent.click(screen.getByText('Salvar plano'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'O plano mudou em outro aparelho' })));
    expect((saveSpy.mock.calls[0] as unknown[])[0]).toMatchObject({ p_expected_updated_at: '2026-09-21T00:00:00Z' });
  });
});
