import { PLANS, tierHasAppointments } from "@/lib/plans";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Crown, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppointmentScheduler } from '@/components/appointments/AppointmentScheduler';
import { UpcomingAppointments } from '@/components/appointments/UpcomingAppointments';
import { AppointmentHistory } from '@/components/appointments/AppointmentHistory';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';


const Appointments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { subscribed, subscriptionTier, canScheduleAppointment, appointmentReason, checkSubscription } = useSubscription();
  const [showScheduler, setShowScheduler] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleScheduleSuccess = () => {
    setShowScheduler(false);
    // O agendamento consumiu a cota mensal (Flex e Completo: 1x/mês; no Flex, também gasta o SOS do mês) — recarrega
    // pra refletir isso imediatamente na tela, sem esperar o próximo check.
    void checkSubscription();
  };

  const handleScheduleClick = () => {
    if (!subscribed) {
      toast({
        title: "Assinatura necessária",
        description: "Você precisa de uma assinatura para agendar consultas.",
        variant: "destructive",
      });
      navigate('/subscription-plans');
      return;
    }

    if (!tierHasAppointments(subscriptionTier)) {
      setShowUpgradeModal(true);
      return;
    }

    if (!canScheduleAppointment) {
      toast({
        title: "Limite mensal atingido",
        description: appointmentReason || "Você já usou sua consulta agendada deste mês.",
        variant: "destructive",
      });
      return;
    }
    setShowScheduler(true);
  };

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
                  <p className="text-sm text-muted-foreground">Marque uma sessão com um psicólogo</p>
                </div>
              </div>
              <Button
                size="sm"
                className="flex items-center justify-center gap-1.5 w-full sm:w-auto"
                onClick={handleScheduleClick}
                disabled={!tierHasAppointments(subscriptionTier)}
              >
                <Plus className="w-4 h-4" />
                <span>Agendar</span>
                {!tierHasAppointments(subscriptionTier) && <Crown className="w-3.5 h-3.5 ml-1" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <UpcomingAppointments />

        {/* Consultation History */}
        <AppointmentHistory />


      {/* Upgrade Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              Consultas agendadas
            </DialogTitle>
            <DialogDescription>
              O agendamento de consultas está disponível nos planos Flex e Completo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {[PLANS.Flex, PLANS.Completo].map((plan) => (
              <div key={plan.id} className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2">
                  Plano {plan.name} - {plan.price}
                  {plan.period}
                </h4>
                <ul className="text-sm space-y-1">
                  {plan.features.slice(0, plan.name === 'Completo' ? 2 : 1).map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setShowUpgradeModal(false);
                  navigate('/subscription-plans');
                }}
                className="flex-1"
              >
                Fazer Upgrade
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Appointments;