import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';

/**
 * Anotação privada do psicólogo sobre uma consulta. Fica separada do resumo
 * da sessão (que o paciente vê): a tabela só é lida pelo psicólogo da consulta.
 */
const table = () => supabase.from('appointment_private_notes');

export const PRIVATE_NOTE_MAX = 10000;

export const loadPrivateNotes = async (appointmentIds: string[]): Promise<Record<string, string>> => {
  if (appointmentIds.length === 0) return {};
  const { data, error } = await table().select('appointment_id, note').in('appointment_id', appointmentIds);
  if (error) throw error;
  const notes: Record<string, string> = {};
  for (const row of (data ?? []) as { appointment_id: string; note: string }[]) {
    notes[row.appointment_id] = row.note;
  }
  return notes;
};

export const loadPrivateNote = async (appointmentId: string): Promise<string> =>
  (await loadPrivateNotes([appointmentId]))[appointmentId] ?? '';

/** Grava a anotação; vazia apaga. */
export const savePrivateNote = async (appointmentId: string, note: string): Promise<void> => {
  const text = note.trim().slice(0, PRIVATE_NOTE_MAX);
  if (!text) {
    const { error } = await table().delete().eq('appointment_id', appointmentId);
    if (error) throw error;
    return;
  }
  const { data: auth } = await getSessionUser();
  const psychologistId = auth.user?.id;
  if (!psychologistId) throw new Error('Sessão expirada');
  const { error } = await table().upsert(
    { appointment_id: appointmentId, psychologist_id: psychologistId, note: text },
    { onConflict: 'appointment_id' },
  );
  if (error) throw error;
};
