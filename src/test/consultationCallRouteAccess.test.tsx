import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteGuard from '@/components/RouteGuard';
import { ROUTE_PERMISSIONS } from '@/lib/routePermissions';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}));

vi.mock('@/utils/psychologistBlock', () => ({
  isCurrentlyBlocked: () => false,
  notifyBlockedAccess: vi.fn(),
}));

let mockUserType: 'patient' | 'psychologist' = 'patient';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, get userType() { return mockUserType; }, loading: false }),
}));

const renderGuardAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteGuard allowedUserTypes={['patient', 'psychologist']}>
        <div>conteúdo da chamada</div>
      </RouteGuard>
    </MemoryRouter>
  );

describe('/consultation-call access for both roles', () => {
  it('lists the route (as a param prefix) for both patient and psychologist', () => {
    expect(ROUTE_PERMISSIONS.patient.some((r) => r.startsWith('/consultation-call'))).toBe(true);
    expect(ROUTE_PERMISSIONS.psychologist.some((r) => r.startsWith('/consultation-call'))).toBe(true);
  });

  it('lets a patient reach /consultation-call/:id', async () => {
    mockUserType = 'patient';
    renderGuardAt('/consultation-call/appt-1');
    await waitFor(() => expect(screen.getByText('conteúdo da chamada')).toBeTruthy());
  });

  it('lets a psychologist reach /consultation-call/:id too (previously blocked)', async () => {
    mockUserType = 'psychologist';
    renderGuardAt('/consultation-call/appt-1');
    await waitFor(() => expect(screen.getByText('conteúdo da chamada')).toBeTruthy());
  });
});
