import { describe, expect, it } from 'vitest';
import { formatHomeAllowance, homeAllowance, type HomeAllowanceInput } from '@/lib/homeAllowance';

const base: HomeAllowanceInput = {
  subscribed: true,
  subscriptionTier: 'Completo',
  planHasAppointments: true,
  planCanUseSos: true,
  planCanScheduleAppointment: true,
  extraCredits: { sos: 0, appointment: 0 },
};

const text = (input: Partial<HomeAllowanceInput>) => {
  const a = homeAllowance({ ...base, ...input });
  return a ? formatHomeAllowance(a) : null;
};

describe('contagem da home', () => {
  it('Completo com tudo disponível', () => {
    expect(text({})).toBe('SOS: 1 Agendado: 1');
  });

  it('soma os avulsos e mostra 0 do que já foi usado', () => {
    expect(text({ planCanUseSos: false, extraCredits: { sos: 2, appointment: 1 } })).toBe('SOS: 2 Agendado: 2');
    expect(text({ planCanUseSos: false, planCanScheduleAppointment: false })).toBe('SOS: 0 Agendado: 0');
  });

  it('Flex usado em um SOS: os dois zeram', () => {
    expect(text({ subscriptionTier: 'Flex', planCanUseSos: false, planCanScheduleAppointment: false })).toBe('SOS: 0 Agendado: 0');
  });

  it('Essencial: só o SOS, a não ser que tenha consulta avulsa', () => {
    expect(text({ subscriptionTier: 'Essencial', planHasAppointments: false, planCanScheduleAppointment: false })).toBe('SOS: 1');
    expect(
      text({ subscriptionTier: 'Essencial', planHasAppointments: false, planCanScheduleAppointment: false, extraCredits: { sos: 0, appointment: 1 } }),
    ).toBe('SOS: 1 Agendado: 1');
  });

  it('sem plano pago não mostra nada', () => {
    expect(text({ subscribed: false, subscriptionTier: null })).toBeNull();
    expect(text({ subscribed: false, subscriptionTier: null, extraCredits: { sos: 1, appointment: 1 } })).toBeNull();
  });
});
