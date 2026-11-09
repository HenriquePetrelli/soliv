import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminMfaOk, adminMfaSatisfied, tokenAal } from '../../supabase/functions/_shared/adminMfa';

const jwt = (claims: object) =>
  `Bearer h.${btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`;

describe('funções de admin: verificação em duas etapas no token', () => {
  it('só aceita token aal2', () => {
    expect(adminMfaOk(jwt({ sub: 'a', aal: 'aal2' }))).toBe(true);
    expect(adminMfaOk(jwt({ sub: 'a', aal: 'aal1' }))).toBe(false);
    expect(adminMfaOk(jwt({ sub: 'a' }))).toBe(false);
  });

  it('token ausente ou estragado não passa', () => {
    expect(tokenAal(null)).toBeNull();
    expect(tokenAal('Bearer abc')).toBeNull();
    expect(tokenAal('Bearer a.###.c')).toBeNull();
  });
});

describe('funções de admin: código só em produção', () => {
  const g = globalThis as { Deno?: unknown };
  const withEnv = (rpcAnswer: unknown, ok = true) => {
    g.Deno = { env: { get: (k: string) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] } };
    const fetchMock = vi.fn(async () => ({ ok, json: async () => rpcAnswer }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  afterEach(() => {
    delete g.Deno;
    vi.unstubAllGlobals();
  });

  it('token aal2 passa sem consultar o ambiente', async () => {
    const fetchMock = withEnv(true);
    expect(await adminMfaSatisfied(jwt({ aal: 'aal2' }))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('em teste, a senha (aal1) basta; em produção, não', async () => {
    withEnv(false);
    expect(await adminMfaSatisfied(jwt({ aal: 'aal1' }))).toBe(true);
    withEnv(true);
    expect(await adminMfaSatisfied(jwt({ aal: 'aal1' }))).toBe(false);
  });

  it('erro ao ler o ambiente exige o código', async () => {
    withEnv(false, false);
    expect(await adminMfaSatisfied(jwt({ aal: 'aal1' }))).toBe(false);
    delete g.Deno;
    expect(await adminMfaSatisfied(jwt({ aal: 'aal1' }))).toBe(false);
  });
});
