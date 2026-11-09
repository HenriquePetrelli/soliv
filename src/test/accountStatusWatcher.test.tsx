import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
const { signOutMock, authState } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => {}),
  authState: { user: { id: 'p1' }, userType: 'patient' as string },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user, userType: authState.userType, signOut: signOutMock }),
}));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import AccountStatusWatcher from '@/components/AccountStatusWatcher';
import { clearLoginState } from '@/lib/loginState';

const stateWith = (patient: Record<string, unknown> | null) => () => ({
  data: { is_admin: false, profile: { user_type: 'patient', full_name: 'Ana' }, patient, psychologist: null, registration: null, rejection: null },
  error: null,
});

beforeEach(() => {
  signOutMock.mockClear();
  clearLoginState();
  fakeDb.rpcHandlers = {};
});

describe('bloqueio com o app aberto', () => {
  it('paciente bloqueado pelo admin sai da conta, com o motivo', async () => {
    fakeDb.rpcHandlers.get_login_state = stateWith({ is_blocked: true, blocked_until: null, blocked_reason: 'Uso indevido' });
    render(<AccountStatusWatcher />);
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
  });

  it('paciente sem bloqueio continua', async () => {
    const handler = vi.fn(stateWith({ is_blocked: false, blocked_until: null, blocked_reason: null }));
    fakeDb.rpcHandlers.get_login_state = handler;
    render(<AccountStatusWatcher />);
    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('bloqueio que já venceu não tira ninguém', async () => {
    const handler = vi.fn(stateWith({ is_blocked: true, blocked_until: '2000-01-01T00:00:00Z', blocked_reason: 'x' }));
    fakeDb.rpcHandlers.get_login_state = handler;
    render(<AccountStatusWatcher />);
    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('sai na hora em que o servidor avisa do bloqueio', async () => {
    let blocked = false;
    const handler = vi.fn(() =>
      stateWith(blocked ? { is_blocked: true, blocked_until: null, blocked_reason: 'Fraude' } : { is_blocked: false, blocked_until: null, blocked_reason: null })(),
    );
    fakeDb.rpcHandlers.get_login_state = handler;
    const channels: Array<{ topic: string; handlers: Array<{ event: string; cb: () => void }> }> = [];
    const original = fakeSupabase.channel;
    (fakeSupabase as { channel: unknown }).channel = (topic: string) => {
      const ch = {
        topic,
        handlers: [] as Array<{ event: string; cb: () => void }>,
        on(_t: string, f: { event: string }, cb: () => void) { ch.handlers.push({ event: f.event, cb }); return ch; },
        subscribe() { return ch; },
      };
      channels.push(ch);
      return ch;
    };
    try {
      render(<AccountStatusWatcher />);
      await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
      expect(signOutMock).not.toHaveBeenCalled();
      const ch = channels.find((c) => c.topic === 'account-status:p1');
      expect(ch).toBeTruthy();
      blocked = true;
      ch!.handlers.find((h) => h.event === 'check')!.cb();
      await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    } finally {
      (fakeSupabase as { channel: unknown }).channel = original;
    }
  });
});
