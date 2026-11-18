import { hasPaidPlan, type PlanTier } from '@/lib/plans';

export interface HomeAllowanceInput {
  subscribed: boolean;
  subscriptionTier: PlanTier | null;
  /** O plano tem consulta agendada (Flex e Completo). */
  planHasAppointments: boolean;
  planCanUseSos: boolean;
  planCanScheduleAppointment: boolean;
  extraCredits: { sos: number; appointment: number };
}

export interface HomeAllowance {
  sos: number;
  /** null: o plano não tem consulta agendada e não há avulsa. */
  appointments: number | null;
}

/**
 * Atendimentos que o paciente ainda tem (do mês + avulsos), para a linha do
 * topo da home. Sem plano pago (grátis, ou cancelado com o período já
 * vencido, que o app já trata como grátis): não mostra nada.
 */
export const homeAllowance = (input: HomeAllowanceInput): HomeAllowance | null => {
  if (!hasPaidPlan(input.subscribed, input.subscriptionTier)) return null;
  const sos = (input.planCanUseSos ? 1 : 0) + Math.max(0, input.extraCredits.sos);
  const extraAppointments = Math.max(0, input.extraCredits.appointment);
  const appointments =
    input.planHasAppointments || extraAppointments > 0
      ? (input.planCanScheduleAppointment ? 1 : 0) + extraAppointments
      : null;
  return { sos, appointments };
};

export const formatHomeAllowance = ({ sos, appointments }: HomeAllowance): string =>
  appointments === null ? `SOS: ${sos}` : `SOS: ${sos} Agendado: ${appointments}`;
