import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const db = vi.hoisted(() => ({
  consentAt: null as string | null,
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'apt-1',
              scheduled_at: new Date().toISOString(),
              duration: 50,
              patient_id: 'pat-1',
              transcription_consent_at: db.consentAt,
              psychologists: { full_name: 'Dra. Marta' },
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => db.rpc(...args),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userType: 'patient' }) }));
vi.mock('@/hooks/useAppointmentVideoCall', () => ({ useAppointmentVideoCall: () => ({ endConsultation: vi.fn() }) }));
vi.mock('@/components/calls/VideoCallRoom', () => ({ default: () => <div data-testid="room" /> }));

import ConsultationCall from '@/pages/ConsultationCall';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/consultation-call/apt-1']}>
      <Routes>
        <Route path="/consultation-call/:appointmentId" element={<ConsultationCall />} />
        <Route path="/appointments" element={<div>lista</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  db.consentAt = null;
  db.rpc.mockReset();
  db.rpc.mockImplementation(async (name: string) => {
    if (name === 'give_appointment_transcription_consent') return { data: '2026-11-20T10:00:00Z', error: null };
    if (name === 'get_or_create_appointment_webrtc_session') return { data: 'sess-1', error: null };
    return { data: null, error: null };
  });
});

describe('consulta agendada: consentimento com a transcrição', () => {
  it('o paciente só entra depois de consentir', async () => {
    renderPage();
    expect(await screen.findByTestId('consultation-consent')).toBeInTheDocument();
    const enter = screen.getByRole('button', { name: 'Concordar e entrar' });
    expect(enter).toBeDisabled();
    expect(db.rpc).not.toHaveBeenCalledWith('get_or_create_appointment_webrtc_session', expect.anything());

    fireEvent.click(screen.getByRole('checkbox', { name: /transcrito/ }));
    fireEvent.click(enter);

    expect(await screen.findByTestId('room')).toBeInTheDocument();
    expect(db.rpc).toHaveBeenCalledWith('give_appointment_transcription_consent', { p_appointment_id: 'apt-1', p_version: '1.0' });
  });

  it('quem já consentiu nessa consulta entra direto', async () => {
    db.consentAt = '2026-11-20T09:00:00Z';
    renderPage();
    expect(await screen.findByTestId('room')).toBeInTheDocument();
    expect(screen.queryByTestId('consultation-consent')).not.toBeInTheDocument();
  });

  it('erro ao gravar o consentimento não abre a sala', async () => {
    db.rpc.mockImplementation(async (name: string) =>
      name === 'give_appointment_transcription_consent' ? { data: null, error: { message: 'falhou' } } : { data: 'sess-1', error: null },
    );
    renderPage();
    fireEvent.click(await screen.findByRole('checkbox', { name: /transcrito/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Concordar e entrar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByTestId('room')).not.toBeInTheDocument();
  });
});
