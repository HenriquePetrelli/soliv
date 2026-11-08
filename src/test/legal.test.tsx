import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
const auth = { user: { id: 'patient-1' } as { id: string } | null, userType: 'patient', signOut: vi.fn() };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  LEGAL_PAGES,
  LEGAL_VERSIONS,
  REQUIRED_DOCUMENTS,
  fetchMissingAcceptances,
  hasPendingPlaceholders,
  signupAcceptanceMetadata,
} from '@/lib/legal';
import LegalMarkdown from '@/components/legal/LegalMarkdown';
import { cleanLegalMarkdown } from '@/components/legal/cleanLegalMarkdown';
import LegalAcceptanceGate from '@/components/legal/LegalAcceptanceGate';
import { consentKeysFor } from '@/components/legal/consents';
import { renderHook } from '@testing-library/react';
import { useLegalGateStatus } from '@/lib/legalGateStatus';

const acceptAll = (userId: string, userType: 'patient' | 'psychologist') => {
  fakeDb.tables.legal_acceptances = REQUIRED_DOCUMENTS[userType].map((document) => ({
    user_id: userId,
    document,
    version: LEGAL_VERSIONS[document],
  }));
};

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.writes = [];
  fakeDb.currentUserId = 'patient-1';
  auth.user = { id: 'patient-1' };
  auth.userType = 'patient';
});

describe('documentos legais', () => {
  it('lê a versão de cada documento do próprio texto', () => {
    expect(LEGAL_VERSIONS.terms_patient).toBe('1.0');
    expect(LEGAL_VERSIONS.terms_psychologist).toBe('1.0');
    expect(LEGAL_VERSIONS.privacy_policy).toBe('1.0');
  });

  it('detecta campos a preencher, mas não confunde com links', () => {
    expect(hasPendingPlaceholders('Operado por [RAZÃO SOCIAL] LTDA')).toBe(true);
    expect(hasPendingPlaceholders('Veja a [Política](./politica-de-privacidade.md).')).toBe(false);
  });

  it('tira o aviso interno de revisão e as marcações para o advogado', () => {
    const cleaned = cleanLegalMarkdown(LEGAL_PAGES.privacy_policy.markdown);
    expect(cleaned).not.toContain('⚖️');
    expect(cleaned).not.toContain('Versão para revisão jurídica');
  });

  it('renderiza títulos, tabelas e links internos', () => {
    render(
      <MemoryRouter>
        <LegalMarkdown markdown={LEGAL_PAGES.terms_patient.markdown} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /Termos de Uso do Soliv/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'R$ 69,90 por mês' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Política de Privacidade' })[0]).toHaveAttribute('href', '/privacidade');
  });

  it('manda no cadastro o aceite de todos os documentos exigidos', () => {
    const meta = signupAcceptanceMetadata('patient');
    expect(meta.legal_acceptances.map((a) => a.document)).toEqual([
      'age_18',
      'terms_patient',
      'privacy_policy',
      'health_data_consent',
    ]);
    expect(signupAcceptanceMetadata('psychologist').legal_acceptances.map((a) => a.document)).not.toContain(
      'health_data_consent',
    );
  });

  it('só pede o consentimento de dados de saúde ao paciente', () => {
    expect(consentKeysFor('patient')).toEqual(['age_18', 'terms', 'health_data_consent']);
    expect(consentKeysFor('psychologist')).toEqual(['age_18', 'terms']);
    expect(consentKeysFor('patient', ['privacy_policy'])).toEqual(['terms']);
  });

  it('aponta o que falta aceitar quando a versão muda', async () => {
    acceptAll('patient-1', 'patient');
    fakeDb.tables.legal_acceptances[2].version = '0.9'; // privacy_policy numa versão antiga
    expect(await fetchMissingAcceptances('patient-1', 'patient')).toEqual(['privacy_policy']);
  });
});

describe('novo aceite após o login', () => {
  const renderGate = (path = '/home') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <LegalAcceptanceGate />
      </MemoryRouter>,
    );

  it('não aparece quando tudo já foi aceito', async () => {
    acceptAll('patient-1', 'patient');
    renderGate();
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByText('Aceitar e continuar')).not.toBeInTheDocument();
  });

  it('bloqueia até marcar tudo e grava o aceite com a versão atual', async () => {
    renderGate();
    const accept = await screen.findByText('Aceitar e continuar');

    fireEvent.click(accept);
    expect(screen.getByText('Marque todas as confirmações para continuar.')).toBeInTheDocument();
    expect(fakeDb.tables.legal_acceptances ?? []).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Consentimento para dados de saúde' }));
    fireEvent.click(accept);

    await waitFor(() => expect(screen.queryByText('Aceitar e continuar')).not.toBeInTheDocument());
    const saved = fakeDb.tables.legal_acceptances.map((r) => `${r.document}@${r.version}`).sort();
    expect(saved).toEqual(
      REQUIRED_DOCUMENTS.patient.map((d) => `${d}@${LEGAL_VERSIONS[d]}`).sort(),
    );
  });

  it('avisa as outras janelas (metas) para esperar até o aceite', async () => {
    const status = renderHook(() => useLegalGateStatus());
    renderGate();
    const accept = await screen.findByText('Aceitar e continuar');
    expect(status.result.current).toBe('pending');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Consentimento para dados de saúde' }));
    fireEvent.click(accept);

    await waitFor(() => expect(status.result.current).toBe('clear'));
  });

  it('libera as outras janelas quando não falta aceite', async () => {
    acceptAll('patient-1', 'patient');
    const status = renderHook(() => useLegalGateStatus());
    renderGate();
    await waitFor(() => expect(status.result.current).toBe('clear'));
  });

  it('deixa ler os documentos sem o bloqueio por cima', async () => {
    renderGate('/privacidade');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByText('Aceitar e continuar')).not.toBeInTheDocument();
  });

  it('não pede aceite ao administrador', async () => {
    auth.userType = 'admin';
    renderGate();
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByText('Aceitar e continuar')).not.toBeInTheDocument();
  });
});
