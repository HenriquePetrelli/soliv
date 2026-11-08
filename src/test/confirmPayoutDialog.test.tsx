import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmPayoutDialog } from '@/components/payments/ConfirmPayoutDialog';
import { isValidPixE2eId } from '@/components/payments/pixE2e';

const payment = {
  id: 'p1',
  psychologist_id: 'psy-1',
  name: 'Dra. Ana',
  email: 'ana@x.com',
  pix_key: 'ana@x.com',
  pix_type: 'email',
  total_paid_amount: 0,
  total_pending_amount: 150,
  scheduled_pending_count: 1,
  scheduled_paid_count: 0,
  emergency_pending_count: 1,
  emergency_paid_count: 0,
} as never;

const E2E = 'E1234567820260924120000000000001';

describe('confirmação de repasse', () => {
  it('valida o formato do E2E do PIX', () => {
    expect(E2E).toHaveLength(32);
    expect(isValidPixE2eId(E2E)).toBe(true);
    expect(isValidPixE2eId(E2E.toLowerCase())).toBe(true);
    expect(isValidPixE2eId('123')).toBe(false);
    expect(isValidPixE2eId('X' + E2E.slice(1))).toBe(false);
  });

  it('não confirma sem E2E válido e envia o código em maiúsculas quando válido', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(
      <ConfirmPayoutDialog
        payment={payment}
        submitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
        formatCurrency={(v) => `R$ ${v}`}
        pixTypeLabel={() => 'E-mail'}
      />
    );

    fireEvent.click(screen.getByText('Confirmar R$ 150'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText(/32 caracteres e começa com E/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Código E2E do PIX'), { target: { value: E2E.toLowerCase() } });
    fireEvent.click(screen.getByText('Confirmar R$ 150'));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ pixE2eId: E2E, receipt: null }));
  });
});
