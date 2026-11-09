import { describe, it, expect } from 'vitest';
import { addToDate, authBanDuration, parseBlockDuration } from '../../supabase/functions/_shared/blockDuration';
import { describeBlockDuration, toBlockChoice, blockDurationBody } from '@/utils/psychologistBlock';

const now = new Date('2026-01-31T12:00:00Z');

describe('bloqueio pelo admin: período', () => {
  it('aceita horas, dias, semanas, meses e anos', () => {
    const at = (unit: string, amount: number) => {
      const r = parseBlockDuration({ duration_unit: unit, duration_amount: amount }, now);
      if (!r.ok) throw new Error((r as { error: string }).error);
      return r.until?.toISOString();
    };
    expect(at('hours', 5)).toBe('2026-01-31T17:00:00.000Z');
    expect(at('days', 3)).toBe('2026-02-03T12:00:00.000Z');
    expect(at('weeks', 2)).toBe('2026-02-14T12:00:00.000Z');
    expect(at('months', 1)).toBe(addToDate(now, 'months', 1).toISOString());
    expect(at('years', 2)).toBe('2028-01-31T12:00:00.000Z');
  });

  it('tempo indeterminado não tem data de fim', () => {
    const r = parseBlockDuration({ duration: 'indefinite' }, now);
    expect(r).toEqual({ ok: true, until: null, label: 'tempo indeterminado' });
    expect(authBanDuration(null, true)).toBe('876000h');
    expect(authBanDuration(null, false)).toBe('none');
  });

  it('códigos antigos continuam valendo', () => {
    const r = parseBlockDuration({ duration: '1w' }, now);
    expect(r.ok && r.until?.toISOString()).toBe('2026-02-07T12:00:00.000Z');
    expect(parseBlockDuration({ duration: 'forever' }, now)).toMatchObject({ ok: true, until: null });
  });

  it('recusa quantidade ou unidade inválida', () => {
    expect(parseBlockDuration({ duration_unit: 'days', duration_amount: 0 }, now).ok).toBe(false);
    expect(parseBlockDuration({ duration_unit: 'days', duration_amount: 1.5 }, now).ok).toBe(false);
    expect(parseBlockDuration({ duration_unit: 'years', duration_amount: 11 }, now).ok).toBe(false);
    expect(parseBlockDuration({ duration_unit: 'minutes', duration_amount: 5 }, now).ok).toBe(false);
    expect(parseBlockDuration({}, now).ok).toBe(false);
  });

  it('painel: texto e corpo enviados', () => {
    expect(describeBlockDuration({ kind: 'timed', unit: 'months', amount: 1 })).toBe('1 mês');
    expect(describeBlockDuration({ kind: 'timed', unit: 'hours', amount: 12 })).toBe('12 horas');
    expect(toBlockChoice({ indefinite: false, unit: 'days', amount: '' })).toBeNull();
    const choice = toBlockChoice({ indefinite: false, unit: 'weeks', amount: '3' });
    expect(choice && blockDurationBody(choice)).toEqual({ duration_unit: 'weeks', duration_amount: 3 });
    const forever = toBlockChoice({ indefinite: true, unit: 'days', amount: '' });
    expect(forever && blockDurationBody(forever)).toEqual({ duration: 'indefinite' });
  });
});
