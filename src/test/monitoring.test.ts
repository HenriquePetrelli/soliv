import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrubDeep, scrubText } from '@/lib/monitoring/scrub';
import { isMonitoringEnabled, parseSampleRate, startMonitoring } from '@/lib/monitoring';
import { monitored, scrubText as scrubEdgeText } from '../../supabase/functions/_shared/monitoring';

describe('limpeza do que vai para o Grafana (app)', () => {
  it('tira e-mail, token, ids, CPF e telefone', () => {
    const text =
      'falha para maria@ex.com.br user 3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab ' +
      'cpf 123.456.789-09 tel (11) 98765-4321 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF';
    const out = scrubText(text);
    expect(out).not.toMatch(/maria|3f2b8c1e|123\.456|98765|eyJ/);
    expect(out).toContain('[email]');
    expect(out).toContain(':id');
    expect(out).toContain('[cpf]');
    expect(out).toContain('[telefone]');
    expect(out).toContain('[token]');
  });

  it('corta consulta e fragmento dos endereços (token do link de senha)', () => {
    expect(scrubText('https://app.soliv.com/reset#access_token=abc&type=recovery')).toBe('https://app.soliv.com/reset');
    expect(scrubText('GET https://x.supabase.co/rest/v1/chat?user_id=eq.5 failed')).toBe(
      'GET https://x.supabase.co/rest/v1/chat failed',
    );
  });

  it('mantém números e o formato do evento', () => {
    const item = { meta: { page: { url: 'https://a.com/x?y=1' } }, payload: { value: 1731234567890, ok: true, list: ['a@b.co'] } };
    expect(scrubDeep(item)).toEqual({
      meta: { page: { url: 'https://a.com/x' } },
      payload: { value: 1731234567890, ok: true, list: ['[email]'] },
    });
  });
});

describe('ligar o monitoramento', () => {
  it('só no build publicado e com o endereço do coletor', () => {
    expect(isMonitoringEnabled({ PROD: false, MODE: 'development', VITE_FARO_URL: 'https://c' })).toBe(false);
    expect(isMonitoringEnabled({ PROD: true, MODE: 'production', VITE_FARO_URL: ' ' })).toBe(false);
    expect(isMonitoringEnabled({ PROD: true, MODE: 'production', VITE_FARO_URL: 'https://c' })).toBe(true);
  });

  it('amostragem fica entre 0 e 1 e vale 1 sem configuração', () => {
    expect(parseSampleRate(undefined)).toBe(1);
    expect(parseSampleRate('')).toBe(1);
    expect(parseSampleRate('abc')).toBe(1);
    expect(parseSampleRate('0.5')).toBe(0.5);
    expect(parseSampleRate('3')).toBe(1);
    expect(parseSampleRate('-1')).toBe(0);
  });

  it('desligado não baixa o SDK', async () => {
    expect(await startMonitoring({ PROD: false, MODE: 'development' })).toBe(false);
  });
});

describe('erros das edge functions', () => {
  const realDeno = (globalThis as { Deno?: unknown }).Deno;
  const realFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as { Deno?: unknown }).Deno = realDeno;
    (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime = undefined;
    globalThis.fetch = realFetch;
  });

  const setup = (vars: Record<string, string>) => {
    (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => vars[k] } };
    const waits: Promise<unknown>[] = [];
    (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return { waits, fetchMock };
  };
  const loki = { GRAFANA_LOKI_URL: 'https://logs.grafana.net/', GRAFANA_LOKI_USER: '123', GRAFANA_LOKI_TOKEN: 'tok' };

  it('manda 5xx para o Loki, limpo, sem mexer na resposta', async () => {
    const { waits, fetchMock } = setup(loki);
    const handler = monitored('buy-extra', async () =>
      new Response(JSON.stringify({ error: 'Stripe falhou para ana@ex.com' }), { status: 500 }),
    );
    const res = await handler(new Request('https://f/buy-extra', { method: 'POST' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Stripe falhou para ana@ex.com' });
    await Promise.all(waits);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://logs.grafana.net/loki/api/v1/push');
    expect(init.headers.Authorization).toBe(`Basic ${btoa('123:tok')}`);
    const body = JSON.parse(init.body);
    expect(body.streams[0].stream).toMatchObject({ app: 'soliv', fn: 'buy-extra', level: 'error' });
    const line = JSON.parse(body.streams[0].values[0][1]);
    expect(line).toMatchObject({ fn: 'buy-extra', method: 'POST', status: 500, message: 'Stripe falhou para [email]' });
  });

  it('não envia nada em respostas boas nem sem os secrets', async () => {
    const ok = setup(loki);
    await monitored('x', async () => new Response('ok'))(new Request('https://f/x'));
    expect(ok.fetchMock).not.toHaveBeenCalled();

    const off = setup({});
    await monitored('x', async () => new Response('', { status: 503 }))(new Request('https://f/x'));
    await Promise.all(off.waits);
    expect(off.fetchMock).not.toHaveBeenCalled();
  });

  it('exceção: registra e repassa', async () => {
    const { waits, fetchMock } = setup(loki);
    const handler = monitored('x', async () => {
      throw new Error('boom sk_live_abc123');
    });
    await expect(handler(new Request('https://f/x'))).rejects.toThrow('boom');
    await Promise.all(waits);
    const line = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).streams[0].values[0][1]);
    expect(line.message).toBe('Error: boom [segredo]');
  });

  it('limpa texto do servidor', () => {
    expect(scrubEdgeText('user 3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab whsec_abc')).toBe('user :id [segredo]');
  });
});
