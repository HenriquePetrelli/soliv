import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { invokeMock, toastMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), toastMock: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: vi.fn(),
    from: () => ({ select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/currentUser', () => ({ getSessionUser: async () => ({ data: { user: { id: 'psi-1' } } }) }));
vi.mock('@/lib/sosQueueChannel', () => ({ subscribeSosQueue: () => () => {} }));
vi.mock('@/lib/emergencyCallGuard', () => ({ findPsychologistOngoingCall: async () => null }));

import { usePsychologistEmergency } from '@/hooks/usePsychologistEmergency';

beforeEach(() => {
  invokeMock.mockReset();
  toastMock.mockReset();
});

describe('aceitar SOS: motivo da recusa', () => {
  it('mostra o motivo do banco (ex.: em consulta agora), não "aceita por outro psicólogo"', async () => {
    invokeMock.mockImplementation(async (name: string) =>
      name === 'psychologist-emergency'
        ? { data: { success: false, code: 'REQUEST_NOT_AVAILABLE', error: 'Você está em uma consulta agora. Termine a consulta antes de aceitar um SOS.' }, error: null }
        : { data: [], error: null },
    );
    const { result } = renderHook(() => usePsychologistEmergency());
    await act(async () => {
      await result.current.acceptEmergencyRequest('req-1');
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Você está em uma consulta agora. Termine a consulta antes de aceitar um SOS.' }),
    );
  });
});
