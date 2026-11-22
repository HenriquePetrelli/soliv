import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));

import {
  PATIENT_HOME_ROW_TTL_MS,
  forgetPatientHomeRow,
  getPatientHomeRow,
  prefetchPatientHomeRow,
} from '@/lib/patientHomeRow';

const PATIENT = 'patient-1';

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.writes = [];
  forgetPatientHomeRow();
  fakeDb.rows('patients').push({ user_id: PATIENT, daily_mood_enabled: true, last_mood_value: 3 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('patientHomeRow', () => {
  it('quem abre logo depois do login reaproveita a consulta já pedida', async () => {
    const from = vi.spyOn(fakeSupabase, 'from');
    prefetchPatientHomeRow(PATIENT);
    const [a, b] = await Promise.all([getPatientHomeRow(PATIENT), getPatientHomeRow(PATIENT)]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(a.data?.last_mood_value).toBe(3);
    expect(b).toBe(a);
    from.mockRestore();
  });

  it('depois de uma gravação a próxima leitura vai ao servidor e vê o valor novo', async () => {
    await getPatientHomeRow(PATIENT);
    fakeDb.rows('patients')[0].last_mood_value = 5;
    expect((await getPatientHomeRow(PATIENT)).data?.last_mood_value).toBe(3);
    forgetPatientHomeRow();
    expect((await getPatientHomeRow(PATIENT)).data?.last_mood_value).toBe(5);
  });

  it('a resposta guardada vence e não serve para outra conta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await getPatientHomeRow(PATIENT);
    fakeDb.rows('patients')[0].last_mood_value = 1;
    vi.setSystemTime(Date.now() + PATIENT_HOME_ROW_TTL_MS + 1);
    expect((await getPatientHomeRow(PATIENT)).data?.last_mood_value).toBe(1);

    fakeDb.rows('patients').push({ user_id: 'patient-2', last_mood_value: 2 });
    expect((await getPatientHomeRow('patient-2')).data?.last_mood_value).toBe(2);
  });

  it('fresh ignora a resposta guardada (aviso de mudança no banco)', async () => {
    await getPatientHomeRow(PATIENT);
    fakeDb.rows('patients')[0].last_mood_value = 4;
    expect((await getPatientHomeRow(PATIENT, { fresh: true })).data?.last_mood_value).toBe(4);
  });
});
