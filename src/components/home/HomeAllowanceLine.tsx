import { useOptionalSubscription } from '@/contexts/SubscriptionContext';
import { formatHomeAllowance, homeAllowance } from '@/lib/homeAllowance';

/** "SOS: 1 Agendado: 1" no topo da home (só com plano pago ativo). */
const HomeAllowanceLine = () => {
  const subscription = useOptionalSubscription();
  if (!subscription || subscription.loading) return null;

  const allowance = homeAllowance({
    subscribed: subscription.subscribed,
    subscriptionTier: subscription.subscriptionTier,
    planHasAppointments: subscription.planLimits.appointments > 0,
    planCanUseSos: subscription.planCanUseSos,
    planCanScheduleAppointment: subscription.planCanScheduleAppointment,
    extraCredits: subscription.extraCredits,
  });
  if (!allowance) return null;

  return (
    <p data-testid="home-allowance" className="text-sm font-medium text-muted-foreground">
      {formatHomeAllowance(allowance)}
    </p>
  );
};

export default HomeAllowanceLine;
