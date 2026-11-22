import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));

import { AdminAppointmentsPanel, AdminCarePeoplePanel, AdminSosPanel } from '@/components/admin/care/AdminCarePanels';
import { AdminNav } from '@/components/admin/AdminNav';
import { ADMIN_NAV_ITEMS } from '@/components/admin/adminNavConfig';

const calls: { fn: string; params: Record<string, unknown> }[] = [];
const track = (fn: string, data: unknown) => (_db: unknown, params: Record<string, unknown>) => {
  calls.push({ fn, params });
  return { data, error: null };
};

const appointmentRow = {
  id: 'apt-1',
  scheduled_at: '2026-11-20T13:00:00Z',
  status: 'completed',
  planned_minutes: 50,
  psychologist_id: 'psi-1',
  psychologist_name: 'Beto Psicólogo',
  patient_id: 'pac-1',
  patient_name: 'Ana Paciente',
  call_seconds: 2950,
  transcription_consent: true,
  has_transcript: true,
  patient_rating: 5,
  psychologist_rating: 4,
};

const appointmentDetail = {
  care: {
    kind: 'appointment',
    id: 'apt-1',
    status: 'completed',
    scheduled_at: '2026-11-20T13:00:00Z',
    planned_minutes: 50,
    connected_at: '2026-11-20T13:01:00Z',
    ended_at: '2026-11-20T13:50:00Z',
    ended_by_type: 'psychologist',
    call_seconds: 2950,
    transcription_consent_at: '2026-11-20T12:59:00Z',
    notes: 'Paciente relatou insônia.',
  },
  patient: { user_id: 'pac-1', full_name: 'Ana Paciente', email: 'ana@t.dev', phone: null },
  psychologist: { user_id: 'psi-1', full_name: 'Beto Psicólogo', email: 'beto@t.dev', crp_number: '06/123456' },
  feedback: [
    { user_type: 'patient', rating: 5, comment: 'Ajudou muito', felt_heard: 'yes', resolution_status: 'resolved', has_complaint: false, complaint_categories: [], symptoms: [] },
    { user_type: 'psychologist', rating: 4, comment: null, symptoms: ['Ansiedade'], clinical_notes: 'Evoluindo bem.', has_complaint: false },
  ],
  safety_plan_count: 1,
  transcript_segments: 3,
};

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.search}</span>;
};

const renderWithRouter = (ui: React.ReactNode, path = '/admin-dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin-dashboard"
          element={
            <>
              {ui}
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  calls.length = 0;
  fakeDb.tables = {};
  fakeDb.rpcHandlers = {
    admin_appointment_metrics: track('admin_appointment_metrics', {
      total: 6, completed: 4, cancelled: 1, no_show: 1, upcoming: 2, avg_call_seconds: 2950, transcribed: 3, avg_patient_rating: 4.5,
    }),
    admin_list_appointments: track('admin_list_appointments', { total: 1, rows: [appointmentRow] }),
    admin_list_sos: track('admin_list_sos', {
      total: 1,
      rows: [{
        id: 'sos-1', created_at: '2026-11-21T02:00:00Z', status: 'completed', channel: 'video', duration: 600,
        psychologist_id: 'psi-1', psychologist_name: 'Beto Psicólogo', patient_id: 'pac-1', patient_name: 'Ana Paciente',
        transcription_consent: false, has_transcript: false, patient_rating: null, psychologist_rating: null,
      }],
    }),
    admin_get_care_detail: track('admin_get_care_detail', appointmentDetail),
    admin_get_care_safety_plan: track('admin_get_care_safety_plan', {
      plans: [{
        title: 'Plano da noite', warning_signs: ['Não consigo dormir'], coping_strategies: [], distractions: [], safe_environment: [],
        reasons_to_live: ['Minha filha'], updated_at: '2026-11-01T00:00:00Z',
        contacts: [{ name: 'Mãe', relationship: 'mãe', phone: '11988880000', is_primary: true }],
      }],
    }),
    admin_get_call_transcript: track('admin_get_call_transcript', [
      { speaker_role: 'patient', started_at: '2026-11-20T13:02:00Z', content: 'Oi, estou ansiosa.' },
      { speaker_role: 'psychologist', started_at: '2026-11-20T13:02:30Z', content: 'Vamos respirar juntos.' },
      { speaker_role: 'patient', started_at: '2026-11-20T13:03:00Z', content: 'Está ajudando.' },
    ]),
    admin_list_care_people: track('admin_list_care_people', {
      total: 1,
      rows: [{ user_id: 'psi-1', full_name: 'Beto Psicólogo', email: 'beto@t.dev', care_count: 3, last_at: '2026-11-20T13:00:00Z' }],
    }),
    get_sos_metrics: track('get_sos_metrics', {
      total: 1, attended: 1, unattended: 0, in_flight: 0, completed: 1, acceptance_rate: 100, crisis_resolved_rate: 0,
      avg_accept_seconds: 30, avg_duration_seconds: 600, avg_rating: 0, end_reasons: {},
    }),
  };
});

describe('admin: consultas agendadas', () => {
  it('mostra os números e a lista com psicólogo, paciente, duração e avaliações', async () => {
    renderWithRouter(<AdminAppointmentsPanel />);
    expect(await screen.findByTestId('admin-appointment-metrics')).toHaveTextContent('Realizadas4');
    const list = await screen.findByTestId('admin-care-list');
    expect(list).toHaveTextContent('Paciente: Ana Paciente');
    expect(list).toHaveTextContent('Psicólogo: Beto Psicólogo');
    expect(list).toHaveTextContent('Duração: 49min 10s');
    expect(list).toHaveTextContent('Transcrição');
    expect(calls.find((c) => c.fn === 'admin_list_appointments')?.params).toMatchObject({ p_psychologist_id: null, p_patient_id: null, p_offset: 0 });
  });

  it('clicando, abre os detalhes; plano de segurança e transcrição só carregam no clique', async () => {
    renderWithRouter(<AdminAppointmentsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Ver detalhes: consulta/ }));

    const detail = await screen.findByTestId('admin-care-detail');
    expect(await within(detail).findByText('Ana Paciente')).toBeInTheDocument();
    expect(within(detail).getByText('CRP 06/123456')).toBeInTheDocument();
    expect(within(detail).getByText('49min 10s')).toBeInTheDocument();
    expect(within(detail).getByText('Ajudou muito')).toBeInTheDocument();
    expect(within(detail).getByText('Sim, conseguiu me ajudar')).toBeInTheDocument();
    expect(within(detail).getByText('Evoluindo bem.')).toBeInTheDocument();
    expect(within(detail).getByText('Ansiedade')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('atendimento=apt-1');
    expect(calls.find((c) => c.fn === 'admin_get_care_detail')?.params).toEqual({ p_kind: 'appointment', p_id: 'apt-1' });
    expect(calls.some((c) => c.fn === 'admin_get_care_safety_plan' || c.fn === 'admin_get_call_transcript')).toBe(false);

    fireEvent.click(within(detail).getByRole('button', { name: /Ver plano de segurança/ }));
    const plans = await screen.findByTestId('admin-safety-plans');
    expect(plans).toHaveTextContent('Plano da noite');
    expect(plans).toHaveTextContent('Minha filha');
    expect(plans).toHaveTextContent('Mãe (mãe) · 11988880000 · principal');

    fireEvent.click(within(detail).getByRole('button', { name: /Abrir transcrição do paciente e do psicólogo/ }));
    const transcript = await screen.findByTestId('admin-transcript');
    expect(transcript).toHaveTextContent('Oi, estou ansiosa.');
    expect(transcript).toHaveTextContent('Vamos respirar juntos.');
    expect(calls.find((c) => c.fn === 'admin_get_call_transcript')?.params).toEqual({ p_kind: 'appointment', p_id: 'apt-1' });

    // Só as falas do psicólogo.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Psicólogo' }));
    await waitFor(() => expect(screen.getByTestId('admin-transcript')).not.toHaveTextContent('Oi, estou ansiosa.'));
    expect(screen.getByTestId('admin-transcript')).toHaveTextContent('Vamos respirar juntos.');
  });

  it('o atendimento aberto na URL abre direto os detalhes', async () => {
    renderWithRouter(<AdminAppointmentsPanel />, '/admin-dashboard?secao=appointments&atendimento=apt-1');
    expect(await screen.findByTestId('admin-care-detail')).toBeInTheDocument();
    expect(calls.find((c) => c.fn === 'admin_get_care_detail')?.params).toEqual({ p_kind: 'appointment', p_id: 'apt-1' });
  });

  it('sem transcrição e sem plano, diz o motivo e não oferece os botões', async () => {
    fakeDb.rpcHandlers.admin_get_care_detail = track('admin_get_care_detail', {
      ...appointmentDetail,
      care: { ...appointmentDetail.care, transcription_consent_at: null },
      feedback: [],
      safety_plan_count: 0,
      transcript_segments: 0,
    });
    renderWithRouter(<AdminAppointmentsPanel />, '/admin-dashboard?atendimento=apt-1');
    const detail = await screen.findByTestId('admin-care-detail');
    expect(await within(detail).findByText('Sem transcrição: o paciente não consentiu.')).toBeInTheDocument();
    expect(within(detail).getByText('O paciente não tem plano de segurança cadastrado.')).toBeInTheDocument();
    expect(within(detail).getByText('O paciente não avaliou.')).toBeInTheDocument();
    expect(within(detail).getByText('O psicólogo não avaliou.')).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /Abrir transcrição/ })).not.toBeInTheDocument();
  });
});

describe('admin: SOS', () => {
  it('lista os SOS com quem atendeu e abre os detalhes do SOS', async () => {
    fakeDb.rpcHandlers.admin_get_care_detail = track('admin_get_care_detail', {
      care: { kind: 'sos', id: 'sos-1', status: 'completed', channel: 'video', created_at: '2026-11-21T02:00:00Z', duration_seconds: 600, triage: ['ansiedade', 'panico'] },
      patient: { user_id: 'pac-1', full_name: 'Ana Paciente', email: null, phone: null },
      psychologist: { user_id: 'psi-1', full_name: 'Beto Psicólogo', email: null, crp_number: null },
      feedback: [],
      safety_plan_count: 0,
      transcript_segments: 0,
    });
    renderWithRouter(<AdminSosPanel />);
    const list = await screen.findByTestId('admin-care-list');
    expect(list).toHaveTextContent('Psicólogo: Beto Psicólogo');
    expect(list).toHaveTextContent('Duração: 10min 00s');
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes: SOS/ }));
    const detail = await screen.findByTestId('admin-care-detail');
    expect(await within(detail).findByText('Por vídeo')).toBeInTheDocument();
    expect(within(detail).getByText('Crise de ansiedade, Crise de pânico')).toBeInTheDocument();
    expect(calls.find((c) => c.fn === 'admin_get_care_detail')?.params).toEqual({ p_kind: 'sos', p_id: 'sos-1' });
  });
});

describe('admin: atendimentos por pessoa', () => {
  it('lista as pessoas e, clicando, os atendimentos só daquela pessoa', async () => {
    renderWithRouter(<AdminCarePeoplePanel role="psychologist" kind="sos" />);
    const people = await screen.findByTestId('admin-care-people');
    expect(people).toHaveTextContent('Beto Psicólogo');
    expect(people).toHaveTextContent('3 SOS');
    expect(calls.find((c) => c.fn === 'admin_list_care_people')?.params).toMatchObject({ p_role: 'psychologist', p_kind: 'sos' });

    fireEvent.click(screen.getByRole('button', { name: /Beto Psicólogo/ }));
    expect(await screen.findByText('SOS · Beto Psicólogo')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('pessoa=psi-1');
    await waitFor(() =>
      expect(calls.find((c) => c.fn === 'admin_list_sos')?.params).toMatchObject({ p_psychologist_id: 'psi-1', p_patient_id: null }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Voltar para a lista/ }));
    expect(await screen.findByTestId('admin-care-people')).toBeInTheDocument();
  });

  it('paciente com consultas: filtra pelo paciente; recarregando a página, o nome vem da lista', async () => {
    renderWithRouter(<AdminCarePeoplePanel role="patient" kind="appointment" />, '/admin-dashboard?pessoa=pac-1');
    expect(await screen.findByText('Consultas agendadas · Ana Paciente')).toBeInTheDocument();
    expect(calls.find((c) => c.fn === 'admin_list_appointments')?.params).toMatchObject({ p_psychologist_id: null, p_patient_id: 'pac-1' });
  });

  it('a busca vai para o servidor', async () => {
    renderWithRouter(<AdminCarePeoplePanel role="patient" kind="sos" />);
    await screen.findByTestId('admin-care-people');
    fireEvent.change(screen.getByLabelText('Buscar por nome ou e-mail'), { target: { value: 'ana' } });
    await waitFor(() => expect(calls.some((c) => c.fn === 'admin_list_care_people' && c.params.p_search === 'ana')).toBe(true));
  });
});

describe('admin: menu', () => {
  it('psicólogos e pacientes têm os subitens de consultas agendadas e SOS', () => {
    const onSelect = vi.fn();
    render(<AdminNav active="patient_sos" onSelect={onSelect} onLogout={() => {}} />);
    expect(screen.getByRole('button', { name: 'SOS por paciente' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Consultas agendadas por psicólogo' }));
    expect(onSelect).toHaveBeenCalledWith('psychologist_appointments');
    fireEvent.click(screen.getByRole('button', { name: /^Consultas agendadas$/ }));
    expect(onSelect).toHaveBeenCalledWith('appointments');
    expect(ADMIN_NAV_ITEMS.filter((i) => i.parent === 'psychologists').map((i) => i.value)).toEqual(['psychologist_appointments', 'psychologist_sos']);
    expect(ADMIN_NAV_ITEMS.filter((i) => i.parent === 'patients').map((i) => i.value)).toEqual(['patient_appointments', 'patient_sos']);
  });
});
