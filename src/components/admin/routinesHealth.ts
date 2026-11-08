export interface RoutineHealth {
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_start: string | null;
  failures_24h: number;
  last_error: string | null;
}

/** Rotinas que pedem atenção: desligadas ou com falha nas últimas 24 h. */
export const routinesNeedingAttention = (rows: RoutineHealth[]) =>
  rows.filter((r) => !r.active || r.failures_24h > 0 || r.last_status === 'failed');
