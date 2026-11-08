import { useState, useEffect } from 'react';
import { useAppointmentUpdates } from '@/hooks/useAppointmentUpdates';
import { SkeletonSectionCard } from '@/components/skeletons/Skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, User, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { usePsychologistSchedule } from '@/hooks/usePsychologistSchedule';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/utils/errorMessage';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { RejectAppointmentModal } from './RejectAppointmentModal';

interface Appointment {
  id: string;
  patient_id: string;
  psychologist_id: string;
  scheduled_at: string;
  status: string;
  appointment_type: string;
  notes?: string;
  created_at: string;
  patient: {
    full_name: string;
  };
}

const PendingAppointments = () => {
  const { acceptAppointment, declineAppointment, fetchPendingAppointments } = usePsychologistSchedule();
  const { toast } = useToast();
  const [pendingAppointments, setPendingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAppointments, setProcessingAppointments] = useState<Set<string>>(new Set());
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const loadPendingAppointments = async () => {
    const data = await fetchPendingAppointments();
    setPendingAppointments(data);
    setLoading(false);
  };

  useEffect(() => {
    loadPendingAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useAppointmentUpdates(loadPendingAppointments);

  const handleAccept = async (appointmentId: string) => {
    setProcessingAppointments(prev => new Set(prev).add(appointmentId));
    try {
      await acceptAppointment(appointmentId);
      // Remove from pending list
      setPendingAppointments(prev => prev.filter(a => a.id !== appointmentId));
    } catch (error) {
      console.error('Error accepting appointment:', error);
    } finally {
      setProcessingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
    }
  };

  const handleDecline = async (appointmentId: string) => {
    setSelectedAppointmentId(appointmentId);
  };

  const handleRejectOnly = async () => {
    if (!selectedAppointmentId) return;
    
    setProcessingAppointments(prev => new Set(prev).add(selectedAppointmentId));
    try {
      await declineAppointment(selectedAppointmentId);
      setPendingAppointments(prev => prev.filter(a => a.id !== selectedAppointmentId));
      setSelectedAppointmentId(null);
    } catch (error) {
      console.error('Error declining appointment:', error);
    } finally {
      setProcessingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedAppointmentId);
        return newSet;
      });
    }
  };

  const handleRescheduleProposal = async (scheduledAt: string, notes: string): Promise<boolean> => {
    if (!selectedAppointmentId) return false;

    const appointmentId = selectedAppointmentId;
    setProcessingAppointments(prev => new Set(prev).add(appointmentId));
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'PUT',
        body: {
          appointmentId,
          status: 'reschedule_proposed',
          proposedScheduledAt: scheduledAt,
          proposalNotes: notes
        }
      });

      if (error) throw error;

      setPendingAppointments(prev => prev.filter(a => a.id !== appointmentId));
      setSelectedAppointmentId(null);
      return true;
    } catch (error: unknown) {
      console.error('Error proposing reschedule:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Não foi possível propor o reagendamento.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setProcessingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
    }
  };

  const getTimeUntilExpiry = (createdAt: string) => {
    const created = new Date(createdAt);
    const expiry = new Date(created.getTime() + 24 * 60 * 60 * 1000); // 24 horas
    const now = new Date();
    const timeLeft = expiry.getTime() - now.getTime();
    
    if (timeLeft <= 0) return 'Expirado';
    
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hoursLeft > 0) {
      return `${hoursLeft}h ${minutesLeft}m restantes`;
    }
    return `${minutesLeft}m restantes`;
  };

  const renderPendingCard = (appointment: Appointment) => {
    const appointmentTime = format(new Date(appointment.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR });
    const timeLeft = getTimeUntilExpiry(appointment.created_at);
    const isExpired = timeLeft === 'Expirado';
    const isProcessing = processingAppointments.has(appointment.id);
    
    const patientInitials = appointment.patient.full_name
      .split(' ')
      .map((name: string) => name[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    return (
      <Card key={appointment.id}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-warning/15 text-warning font-medium">
                  {patientInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium text-foreground">
                  {appointment.patient.full_name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  {appointmentTime}
                  {appointment.appointment_type && (
                    <>
                      <span>•</span>
                      <span className="capitalize">{appointment.appointment_type}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={isExpired ? 'destructive' : 'secondary'} className="mb-1">
                Pendente
              </Badge>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {timeLeft}
              </div>
            </div>
          </div>

          {appointment.notes && (
            <div className="bg-muted/50 rounded-lg p-3 mb-3">
              <p className="text-sm text-foreground">
                <strong>Observações do paciente:</strong> {appointment.notes}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {!isExpired ? (
              <>
                <Button
                  onClick={() => handleAccept(appointment.id)}
                  disabled={isProcessing}
                  className="flex-1 bg-success hover:bg-success/90 text-white"
                >
                  {isProcessing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Aceitar
                </Button>
                <Button
                  onClick={() => handleDecline(appointment.id)}
                  disabled={isProcessing}
                  variant="destructive"
                  className="flex-1"
                >
                  {isProcessing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Recusar
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled className="flex-1">
                <XCircle className="w-4 h-4 mr-2" />
                Expirado (recusado automaticamente)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <SkeletonSectionCard rows={2} accent="secondary" />;
  }

  if (pendingAppointments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-warning/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="text-warning" size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">Consultas Pendentes de Confirmação</h3>
            <p className="text-sm text-muted-foreground font-normal">Solicitações aguardando sua resposta</p>
          </div>
          <Badge variant="secondary" className="bg-warning/15 text-warning">
            {pendingAppointments.length}
          </Badge>
        </div>

        <div className="space-y-3">
          {pendingAppointments.map((appointment) => renderPendingCard(appointment))}
        </div>
      </div>

      <RejectAppointmentModal
        isOpen={!!selectedAppointmentId}
        onClose={() => setSelectedAppointmentId(null)}
        onReject={handleRejectOnly}
        onReschedule={handleRescheduleProposal}
        loading={selectedAppointmentId ? processingAppointments.has(selectedAppointmentId) : false}
        originalDate={selectedAppointmentId ? pendingAppointments.find(a => a.id === selectedAppointmentId)?.scheduled_at || '' : ''}
      />
    </>
  );
};

export default PendingAppointments;