import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildFcmMessage, sendToTokens } from '../../supabase/functions/_shared/fcm';

const account = { client_email: 'x@y', private_key: 'k', project_id: 'p' };

afterEach(() => vi.unstubAllGlobals());

describe('mensagem do push (FCM)', () => {
  it('SOS vai com prioridade alta, validade curta e abre a fila', () => {
    const m = buildFcmMessage('t1', {
      title: 'Nova solicitação de emergência',
      body: 'Um paciente precisa de atendimento imediato.',
      url: '/psychologist-dashboard',
      urgent: true,
      ttlSeconds: 600,
      tag: 'sos-1',
    });
    expect(m.android.priority).toBe('HIGH');
    expect(m.android.ttl).toBe('600s');
    expect(m.webpush.headers).toEqual({ TTL: '600', Urgency: 'high' });
    expect(m.apns.headers['apns-priority']).toBe('10');
    expect(m.apns.payload.aps.sound).toBe('default'); // iPhone toca o som do aviso
    expect(m.webpush.fcm_options).toEqual({ link: '/psychologist-dashboard' });
    expect(m.data.url).toBe('/psychologist-dashboard');
  });

  it('nunca abre outro site ao tocar', () => {
    const m = buildFcmMessage('t1', { title: 'a', body: 'b', url: '//golpe.com' });
    expect(m.webpush).not.toHaveProperty('fcm_options');
    expect(m.data).not.toHaveProperty('url');
  });

  it('só desativa o aparelho que não existe mais; falha do Firebase é passageira', async () => {
    const replies: Record<string, { status: number; body: unknown }> = {
      ok: { status: 200, body: { name: 'm1' } },
      gone: { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } },
      badPayload: { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at message.data' } } },
      down: { status: 503, body: { error: { status: 'UNAVAILABLE' } } },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const token = JSON.parse(init.body).message.token as string;
        const r = replies[token];
        return { ok: r.status === 200, status: r.status, json: async () => r.body };
      }),
    );
    const results = await sendToTokens(account, 'access', ['ok', 'gone', 'badPayload', 'down', 'ok'], { title: 'a', body: 'b' });
    const by = Object.fromEntries(results.map((r) => [r.token, r]));
    expect(results).toHaveLength(4); // token repetido vai uma vez só
    expect(by.ok).toMatchObject({ ok: true, dead: false });
    expect(by.gone).toMatchObject({ ok: false, dead: true, transient: false });
    expect(by.badPayload).toMatchObject({ ok: false, dead: false, transient: false });
    expect(by.down).toMatchObject({ ok: false, dead: false, transient: true });
  });
});
