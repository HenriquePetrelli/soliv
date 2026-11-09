import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BlockedAccountNoticeHost from '@/components/BlockedAccountNoticeHost';
import { dismissBlockedNotice, notifyBlockedAccess } from '@/utils/psychologistBlock';


describe('aviso de conta bloqueada', () => {
  it('mostra o tempo e o motivo até a pessoa fechar', async () => {
    render(<BlockedAccountNoticeHost />);
    const until = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    await act(async () => {
      await notifyBlockedAccess({ is_blocked: true, blocked_until: until, blocked_reason: 'Mensagens ofensivas' });
    });
    expect(await screen.findByText('Conta bloqueada')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-notice-reason')).toHaveTextContent('Mensagens ofensivas');
    expect(screen.getByTestId('blocked-notice-period')).toHaveTextContent(/Até .*restantes/);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(screen.queryByText('Conta bloqueada')).not.toBeInTheDocument());
  });

  it('bloqueio por tempo indeterminado', async () => {
    dismissBlockedNotice();
    render(<BlockedAccountNoticeHost />);
    await act(async () => {
      await notifyBlockedAccess({ is_blocked: true, blocked_until: null, blocked_reason: null });
    });
    expect(await screen.findByTestId('blocked-notice-period')).toHaveTextContent('Por tempo indeterminado');
    expect(screen.getByTestId('blocked-notice-reason')).toHaveTextContent('Não informado');
  });
});
