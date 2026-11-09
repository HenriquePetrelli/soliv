import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
const authState = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: authState.user }) }));

import { AccessLogsPanel } from '@/components/admin/AccessLogsPanel';
import AccessLogger from '@/components/AccessLogger';
import { brasiliaDayEnd, brasiliaDayStart, buildAccessLogsCsv } from '@/lib/accessLogsCsv';

const row = {
  id: 1,
  user_id: 'u1',
  email: 'maria@teste.local',
  user_name: 'Maria',
  event: 'login',
  ip_address: '187.1.2.3',
  user_agent: '=HYPERLINK("x")',
  created_at: '2026-11-09T15:00:00Z',
};

beforeEach(() => {
  fakeDb.rpcHandlers = {};
  toastMock.error.mockClear();
  toastMock.success.mockClear();
});

describe('CSV dos registros de acesso', () => {
  it('traz hora em UTC e em Brasília e neutraliza fórmula', () => {
    const csv = buildAccessLogsCsv([row]);
    const [header, line] = csv.split('\n');
    expect(header).toContain('"Data e hora (UTC)"');
    expect(line).toContain('"2026-11-09T15:00:00.000Z"');
    expect(line).toContain('"09/11/2026, 12:00:00"');
    expect(line).toContain('"Login"');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('período vai do início do dia inicial ao fim do dia final, em Brasília', () => {
    expect(brasiliaDayStart('2026-11-01')).toBe('2026-11-01T03:00:00.000Z');
    expect(brasiliaDayEnd('2026-11-09')).toBe('2026-11-10T03:00:00.000Z');
  });
});

describe('painel de registros de acesso', () => {
  it('busca, mostra e exporta só com motivo', async () => {
    const getHandler = vi.fn((_db: unknown, _params: Record<string, unknown>) => ({ data: [{ ...row, total_count: 1 }], error: null }));
    const exportHandler = vi.fn((_db: unknown, _params: Record<string, unknown>) => ({ data: [row], error: null }));
    fakeDb.rpcHandlers = { admin_get_access_logs: getHandler, admin_export_access_logs: exportHandler };
    const createUrl = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AccessLogsPanel />);
    expect(screen.getByText('Busque para ver os registros')).toBeInTheDocument();
    expect(getHandler).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('E-mail, ID da conta ou IP'), { target: { value: 'maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(await screen.findByText('187.1.2.3')).toBeInTheDocument();
    expect(getHandler.mock.calls[0][1]).toMatchObject({ p_search: 'maria', p_offset: 0 });

    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Exportar$/ }));
    expect(toastMock.error).toHaveBeenCalled();
    expect(exportHandler).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Ofício 123/2026' } });
    fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }));
    await waitFor(() => expect(exportHandler).toHaveBeenCalled());
    expect(exportHandler.mock.calls[0][1]).toMatchObject({ p_reason: 'Ofício 123/2026', p_search: 'maria' });
    await waitFor(() => expect(click).toHaveBeenCalled());
    click.mockRestore();
  });

  it('avisa quando a exportação passa do limite', async () => {
    fakeDb.rpcHandlers = {
      admin_get_access_logs: () => ({ data: [{ ...row, total_count: 60000 }], error: null }),
      admin_export_access_logs: () => ({ data: null, error: { message: 'EXPORT_TOO_LARGE', hint: 'Mais de 50 mil registros: diminua o período ou filtre por pessoa.' } }),
    };
    render(<AccessLogsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Exportar CSV/ }));
    fireEvent.change(await screen.findByLabelText('Motivo'), { target: { value: 'Incidente de segurança' } });
    fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Mais de 50 mil registros: diminua o período ou filtre por pessoa.'));
  });
});

describe('registro de uso do app', () => {
  it('registra ao abrir e não repete ao voltar logo em seguida', async () => {
    const handler = vi.fn(() => ({ data: true, error: null }));
    fakeDb.rpcHandlers = { register_access: handler };
    render(<AccessLogger />);
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sem login não registra', () => {
    authState.user = null;
    const handler = vi.fn(() => ({ data: true, error: null }));
    fakeDb.rpcHandlers = { register_access: handler };
    render(<AccessLogger />);
    expect(handler).not.toHaveBeenCalled();
    authState.user = { id: 'u1' };
  });
});
