import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

export interface AdminPatient {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  state: string | null;
  city: string | null;
  created_at: string | null;
  is_blocked: boolean | null;
  blocked_until: string | null;
  blocked_reason: string | null;
  blocked_at: string | null;
}

export const usePatientManagement = () => {
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('patients')
        .select('id, user_id, full_name, email, cpf, phone, state, city, created_at, is_blocked, blocked_until, blocked_reason, blocked_at')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setPatients((data || []) as AdminPatient[]);
    } catch (err: unknown) {
      console.error('Erro ao carregar pacientes:', err);
      setError(getFriendlyErrorMessage(err, 'Erro ao carregar pacientes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  return { patients, loading, error, fetchPatients, setPatients };
};
