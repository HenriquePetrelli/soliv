import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { JoinResult } from '@/lib/organizations';
import { parsePlanTier, type PlanTier } from '@/lib/plans';

export interface CompanyBenefit {
  tier: PlanTier;
  organizationName: string;
  endsOn: string | null;
}

/** Benefício da empresa (B2B) de quem está logado e as empresas que ele gerencia (RH). */
export const useCompanyBenefit = () => {
  const { user } = useAuth();
  const { checkSubscription } = useSubscription();
  const [benefit, setBenefit] = useState<CompanyBenefit | null>(null);
  const [managedOrganizationIds, setManagedOrganizationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const [entitlement, memberships] = await Promise.all([
      supabase.rpc('organization_entitlement', { p_user_id: user.id }),
      supabase.from('organization_members').select('organization_id, role, status').eq('user_id', user.id),
    ]);
    const row = entitlement.data?.[0];
    setBenefit(
      row && parsePlanTier(row.tier) ? { tier: parsePlanTier(row.tier) as PlanTier, organizationName: row.organization_name, endsOn: row.ends_on } : null,
    );
    setManagedOrganizationIds(
      (memberships.data ?? []).filter((m) => m.role === 'manager' && m.status === 'active').map((m) => m.organization_id),
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const join = useCallback(
    async (code: string): Promise<JoinResult> => {
      const { data, error } = await supabase.rpc('join_organization', { p_code: code });
      if (error) return { ok: false };
      const result = data as unknown as JoinResult;
      if (result.ok) {
        await load();
        // O plano novo já está em `subscribers`; atualiza SOS, cotas e telas.
        void checkSubscription();
      }
      return result;
    },
    [load, checkSubscription],
  );

  const leave = useCallback(async () => {
    const { error } = await supabase.rpc('leave_organization');
    if (error) throw error;
    await load();
    void checkSubscription();
  }, [load, checkSubscription]);

  return { benefit, managedOrganizationIds, loading, join, leave, reload: load };
};
