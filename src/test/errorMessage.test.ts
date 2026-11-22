import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE, getFriendlyErrorMessage, getFunctionErrorMessage } from '@/utils/errorMessage';

const FALLBACK = 'Não foi possível concluir.';

describe('getFriendlyErrorMessage', () => {
  it('mostra a mensagem de regra que vem do banco (objeto do Supabase, não Error)', () => {
    const postgrestError = { code: 'P0001', message: 'Esta consulta já entrou no repasse. Fale com o suporte para ajustar.', details: null, hint: null };
    expect(getFriendlyErrorMessage(postgrestError, FALLBACK)).toBe(postgrestError.message);
  });

  it('traduz erros técnicos do banco', () => {
    expect(getFriendlyErrorMessage({ message: 'new row violates row-level security policy for table "x"' }, FALLBACK)).toBe(
      'Você não tem permissão para fazer isso.',
    );
    expect(getFriendlyErrorMessage({ message: 'duplicate key value violates unique constraint "x"' }, FALLBACK)).toBe(
      'Esse registro já existe.',
    );
  });

  it('não mostra texto técnico desconhecido', () => {
    expect(getFriendlyErrorMessage({ message: 'relation "public.x" does not exist' }, FALLBACK)).toBe(FALLBACK);
    expect(getFriendlyErrorMessage({ code: '42P01' }, FALLBACK)).toBe(FALLBACK);
    expect(getFriendlyErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it('continua aceitando Error e texto', () => {
    expect(getFriendlyErrorMessage(new Error('Failed to fetch'), FALLBACK)).toMatch(/Sem conexão/);
    expect(getFriendlyErrorMessage('Horário indisponível.', FALLBACK)).toBe('Horário indisponível.');
  });
});

describe('erros do Supabase Auth (por código)', () => {
  it('senha vazada (weak_password / pwned)', () => {
    const error = Object.assign(new Error('Password is known to be weak and easy to guess, please choose a different one.'), {
      name: 'AuthWeakPasswordError',
      code: 'weak_password',
      status: 422,
      reasons: ['pwned'],
    });
    expect(getFriendlyErrorMessage(error, FALLBACK)).toMatch(/vazamentos/);
  });

  it('senha curta e sem caracteres variados', () => {
    expect(getFriendlyErrorMessage({ code: 'weak_password', reasons: ['length'] }, FALLBACK)).toMatch(/8 caracteres/);
    expect(getFriendlyErrorMessage({ code: 'weak_password', reasons: ['characters'] }, FALLBACK)).toMatch(/letras e números/);
  });

  it('erros que a pessoa resolve ganham mensagem própria', () => {
    expect(getFriendlyErrorMessage({ code: 'user_already_exists', status: 422, message: 'User already registered' }, FALLBACK)).toMatch(/já está cadastrado/);
    expect(getFriendlyErrorMessage({ code: 'invalid_credentials', status: 400 }, FALLBACK)).toBe('E-mail ou senha incorretos.');
    expect(getFriendlyErrorMessage({ code: 'email_not_confirmed', status: 400 }, FALLBACK)).toMatch(/Confirme seu e-mail/);
    expect(getFriendlyErrorMessage({ code: 'over_email_send_rate_limit', status: 429 }, FALLBACK)).toMatch(/Aguarde/);
    expect(getFriendlyErrorMessage({ code: 'same_password', status: 422 }, FALLBACK)).toMatch(/diferente/);
    expect(getFriendlyErrorMessage({ code: 'email_address_invalid', status: 400 }, FALLBACK)).toMatch(/E-mail inválido/);
  });

  it('falha do sistema vira mensagem genérica', () => {
    expect(getFriendlyErrorMessage({ code: 'unexpected_failure', status: 500, message: 'Database error saving new user' }, FALLBACK)).toBe(FALLBACK);
    expect(getFriendlyErrorMessage({ status: 503, message: 'Service Unavailable' }, FALLBACK)).toBe(FALLBACK);
    expect(getFriendlyErrorMessage({ status: 500, message: 'Internal Server Error' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(getFriendlyErrorMessage({ code: '42703', message: 'column "x" does not exist' }, FALLBACK)).toBe(FALLBACK);
  });

  it('sem internet', () => {
    expect(getFriendlyErrorMessage(Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 }), FALLBACK)).toMatch(/Sem conexão/);
  });
});

describe('erros do banco e de edge function', () => {
  it('SQLSTATE conhecido', () => {
    expect(getFriendlyErrorMessage({ code: '23505', message: 'duplicate key' }, FALLBACK)).toBe('Esse registro já existe.');
    expect(getFriendlyErrorMessage({ code: '42501', message: 'permission denied for table x' }, FALLBACK)).toMatch(/permissão/);
    expect(getFriendlyErrorMessage({ code: 'PGRST301', message: 'JWT expired' }, FALLBACK)).toMatch(/sessão expirou/);
  });

  it('raise exception em inglês não aparece', () => {
    expect(getFriendlyErrorMessage({ code: 'P0001', message: 'unexpected null in trigger' }, FALLBACK)).toBe(FALLBACK);
  });

  it('edge function: usa o status quando o corpo não ajuda', async () => {
    const make = (status: number, body: unknown) =>
      Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify(body), { status }),
      });
    expect(await getFunctionErrorMessage(make(500, { error: 'TypeError: cannot read x' }), FALLBACK)).toBe(FALLBACK);
    expect(await getFunctionErrorMessage(make(429, { error: 'Too Many Requests' }), FALLBACK)).toMatch(/Muitas tentativas/);
    expect(await getFunctionErrorMessage(make(400, { error: 'A consulta já começou.' }), FALLBACK)).toBe('A consulta já começou.');
  });
});
