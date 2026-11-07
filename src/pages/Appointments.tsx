import { tierHasAppointments } from "@/lib/plans";
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Calendar } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import ExtraPurchaseDialog from '@/components/ExtraPurchaseDialog';
import { AppointmentScheduler } from '@/components/appointments/AppointmentScheduler';
import { UpcomingAppointments } from '@/components/appointments/UpcomingAppointments';
import { AppointmentHistory } from '@/components/appointments/AppointmentHistory';
import { useSubscription } from '@/contexts/SubscriptionContext';


const Appointments = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { subscriptionTier, canScheduleAppointment, planCanScheduleAppointment, planAppointmentReason, extraCredits, checkSubscription } = useSubscription();
  const [showScheduler, setShowScheduler] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);

  // Volta do pagamento de uma consulta avulsa: abre a agenda direto.
  useEffect(() => {
    if (searchParams.get('agendar') === '1') {
      setShowScheduler(true);
      searchParams.delete('agendar');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleScheduleSuccess = () => {
    setShowScheduler(false);
    // O agendamento consumiu a cota do mês (Flex e Completo; no Flex, também o
    // SOS) ou uma consulta avulsa: recarrega para a tela refletir na hora.
    void checkSubscription();
  };

  // Sem cota do plano e sem avulso disponível: oferece comprar avulso ou assinar.
  const handleScheduleClick = () => {
    if (!canScheduleAppointment) {
      setShowPurchase(true);
      return;
    }
    setShowScheduler(true);
  };

  const purchaseReason = !tierHasAppointments(subscriptionTier)
    ? subscriptionTier
      ? `O plano ${subscriptionTier} não inclui consultas agendadas (elas fazem parte do Flex e do Completo).`
      : 'Você está no Plano Grátis, que não inclui consultas com psicólogo.'
    : planAppointmentReason && /SOS/.test(planAppointmentReason)
      ? 'No Flex, o atendimento do mês vale para SOS ou consulta, e você já usou o SOS deste mês.'
      : 'Você já usou a consulta agendada do seu plano neste mês.';

  if (showScheduler) {
    return (
      <AppointmentScheduler
        onBack={() => setShowScheduler(false)}
        onSuccess={handleScheduleSuccess}
      />
    );
  }

  return (
    <div className="space-y-6">

        {/* Schedule New Appointment */}
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground leading-tight">Agendar Nova Consulta</h3>
                  <p className="text-sm text-muted-foreground">
                    {extraCredits.appointment > 0 && !planCanScheduleAppointment
                      ? `Você tem ${extraCredits.appointment} ${extraCredits.appointment === 1 ? 'consulta avulsa' : 'consultas avulsas'} para agendar`
                      : 'Marque uma sessão com um psicólogo'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="flex items-center justify-center gap-1.5 w-full sm:w-auto"
                onClick={handleScheduleClick}
              >
                <Plus className="w-4 h-4" />
                <span>Agendar</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <UpcomingAppointments />

        {/* Consultation History */}
        <AppointmentHistory />


      <ExtraPurchaseDialog
        kind="appointment"
        open={showPurchase}
        onOpenChange={setShowPurchase}
        reason={purchaseReason}
        onPurchased={() => setShowScheduler(true)}
      />
    </div>
  );
};

export default Appointments;