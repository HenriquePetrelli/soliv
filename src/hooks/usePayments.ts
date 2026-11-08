import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

export interface PaymentRecord {
  id: string;
  psychologist_id: string;
  name: string;
  cpf?: string;
  crp?: string;
  email: string;
  pix_key?: string;
  pix_type?: string;
  total_paid_amount: number;
  total_pending_amount: number;
  scheduled_pending_count: number;
  scheduled_paid_count: number;
  emergency_pending_count: number;
  emergency_paid_count: number;
  updated_at: string;
}

export const usePayments = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('psychologist_payments')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      setPayments(data || []);
    } catch (err: unknown) {
      console.error('Error fetching payments:', err);
      setError(getFriendlyErrorMessage(err, 'Erro ao carregar pagamentos.'));
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pagamentos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };


  const confirmPayment = async (
    psychologist_id: string,
    confirmation: { expectedAmount: number; pixE2eId: string; receipt?: File | null }
  ) => {
    try {
      setLoading(true);

      // The receipt (optional) goes to the private payment-receipts bucket,
      // under the psychologist's folder so they can read it too.
      let receipt_path: string | null = null;
      if (confirmation.receipt) {
        const ext = confirmation.receipt.name.split('.').pop()?.toLowerCase() || 'pdf';
        const path = `${psychologist_id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('payment-receipts')
          .upload(path, confirmation.receipt, { contentType: confirmation.receipt.type || undefined });
        if (uploadError) throw uploadError;
        receipt_path = path;
      }

      const { data, error } = await supabase.functions.invoke('confirm-payment', {
        body: {
          psychologist_id,
          expected_amount: confirmation.expectedAmount,
          pix_e2e_id: confirmation.pixE2eId,
          receipt_path,
        },
      });
      
      if (error) {
        // Surface the function's own message (value changed, E2E reused...)
        // instead of the generic "non-2xx status" error.
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? error.message);
      }
      
      toast({ title: `Pagamento confirmado — R$ ${data.amount_paid}` });
      
      await fetchPayments();
      return data;
    } catch (error: unknown) {
      console.error('Error confirming payment:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível confirmar o pagamento.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const syncPayments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('payment-sync');
      
      if (error) throw error;
      
      toast({ title: 'Sincronização concluída' });
      
      await fetchPayments();
      return data;
    } catch (error: unknown) {
      console.error('Error syncing payments:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível sincronizar os pagamentos.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  return {
    payments,
    loading,
    error,
    fetchPayments,
    confirmPayment,
    syncPayments,
  };
};
