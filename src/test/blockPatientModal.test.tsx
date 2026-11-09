import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn(async () => ({ data: { success: true, message: 'ok' }, error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BlockPatientModal } from '@/components/admin/BlockPatientModal';

describe('admin bloqueia paciente', () => {
  it('envia a quantidade e a unidade escolhidas', async () => {
    render(<BlockPatientModal open onOpenChange={() => {}} patientId="pt1" patientName="Ana" mode="block" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '36' } });
    expect(screen.getByTestId('block-duration-preview')).toHaveTextContent('36 dias: bloqueada até');
    fireEvent.change(screen.getByPlaceholderText(/Descreva o motivo/), { target: { value: 'Uso indevido do chat' } });
    fireEvent.click(screen.getByRole('button', { name: /Bloquear \(36 dias\)/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin-block-patient', {
        body: { patient_id: 'pt1', action: 'block', duration_unit: 'days', duration_amount: 36, reason: 'Uso indevido do chat' },
      }),
    );
  });

  it('tempo indeterminado', async () => {
    invoke.mockClear();
    render(<BlockPatientModal open onOpenChange={() => {}} patientId="pt1" patientName="Ana" mode="block" onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tempo indeterminado' }));
    fireEvent.change(screen.getByPlaceholderText(/Descreva o motivo/), { target: { value: 'Fraude' } });
    fireEvent.click(screen.getByRole('button', { name: /Bloquear \(tempo indeterminado\)/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin-block-patient', {
        body: { patient_id: 'pt1', action: 'block', duration: 'indefinite', reason: 'Fraude' },
      }),
    );
  });
});
