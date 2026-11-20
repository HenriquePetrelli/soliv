import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => db.rpc(...a) } }));

import CallTranscriptSection from '@/components/calls/CallTranscriptSection';

const seg = (role: 'patient' | 'psychologist', minute: number, content: string) => ({
  speaker_role: role,
  started_at: `2026-11-20T13:${String(minute).padStart(2, '0')}:00Z`,
  content,
});

beforeEach(() => db.rpc.mockReset());

describe('CallTranscriptSection', () => {
  it('pede a transcrição da consulta e mostra quem falou, juntando falas seguidas', async () => {
    db.rpc.mockResolvedValue({
      data: [seg('patient', 0, 'Oi.'), seg('patient', 1, 'Estou ansioso.'), seg('psychologist', 2, 'Entendo.')],
      error: null,
    });
    render(<CallTranscriptSection kind="appointment" sourceId="apt-1" viewer="psychologist" />);
    expect(await screen.findByText('Oi. Estou ansioso.')).toBeInTheDocument();
    expect(screen.getByText('Entendo.')).toBeInTheDocument();
    expect(screen.getByText('Paciente')).toBeInTheDocument();
    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(db.rpc).toHaveBeenCalledWith('get_call_transcript', { p_appointment_id: 'apt-1' });
  });

  it('SOS usa o id do pedido de emergência', async () => {
    db.rpc.mockResolvedValue({ data: [], error: null });
    render(<CallTranscriptSection kind="sos" sourceId="er-1" viewer="psychologist" />);
    expect(await screen.findByText('Sem transcrição para este atendimento.')).toBeInTheDocument();
    expect(db.rpc).toHaveBeenCalledWith('get_call_transcript', { p_emergency_request_id: 'er-1' });
  });

  it('erro ao carregar: avisa sem quebrar a tela', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'Acesso negado' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<CallTranscriptSection kind="appointment" sourceId="apt-1" viewer="psychologist" />);
    expect(await screen.findByText('Não foi possível carregar a transcrição.')).toBeInTheDocument();
  });

  it('transcrição longa: mostra as 4 primeiras falas e "Ver tudo"', async () => {
    db.rpc.mockResolvedValue({
      data: Array.from({ length: 6 }, (_, i) => seg(i % 2 ? 'psychologist' : 'patient', i, `Fala ${i + 1}`)),
      error: null,
    });
    render(<CallTranscriptSection kind="appointment" sourceId="apt-1" viewer="patient" />);
    expect(await screen.findByText('Fala 4')).toBeInTheDocument();
    expect(screen.queryByText('Fala 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver tudo \(6 falas\)/ }));
    expect(screen.getByText('Fala 6')).toBeInTheDocument();
    // Para o paciente, a própria fala é "Você" e a do outro lado, "Psicólogo".
    expect(screen.getAllByText('Psicólogo').length).toBeGreaterThan(0);
  });
});
