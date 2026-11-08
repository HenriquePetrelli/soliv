import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, User, FileText, CheckCircle, XCircle } from 'lucide-react';
import { Appointment } from '@/hooks/useAppointments';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/utils/errorMessage';
import { canCancelAppointment } from '@/lib/appointmentCancellation';
import CancelAppointmentDialog from './CancelAppointmentDialog';

interface AppointmentDetailsModalProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({
  appointment,
  isOpen,
  onClose,
  onUpdate
}) => {
  const { toast } = useToast();
  const [respondingAction, setRespondingAction] = useState<'accept' | 'reject' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!appointment) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success/15 text-success border-success/20';
      case 'scheduled':
        return 'bg-secondary/15 text-secondary-foreground border-secondary/20';
      case 'pending':
        return 'bg-warning/15 text-warning border-warning/20';
      case 'declined':
        return 'bg-destructive/15 text-destructive border-destructive/20';
      case 'reschedule_proposed':
        return 'bg-secondary/15 text-secondary-foreground border-secondary/20';
      case 'cancelled':
        return 'bg-muted text-muted-foreground border-border';
      case 'in_progress':
        return 'bg-primary/15 text-primary border-primary/20';
      default:
        return 'bg-muted text-foreground border-border';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Concluída';
      case 'scheduled':
        return 'Confirmada';
      case 'pending':
        return 'Aguardando confirmação';
      case 'declined':
        return 'Recusada';
      case 'reschedule_proposed':
        return 'Reagendamento proposto';
      case 'cancelled':
        return 'Cancelada';
      case 'in_progress':
        return 'Em andamento';
      case 'no_show':
        return 'Não realizada';
      default:
        return status;
    }
  };

  const handleRescheduleResponse = async (accept: boolean) => {
    if (respondingAction) return;
    setRespondingAction(accept ? 'accept' : 'reject');
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'PUT',
        body: {
          appointmentId: appointment.id,
          status: accept ? 'scheduled' : 'declined',
          action: 'respond_reschedule'
        }
      });

      if (error) throw error;

      toast({
        title: accept ? 'Reagendamento aceito' : 'Reagendamento recusado',
        description: accept ? undefined : 'Você pode agendar uma nova consulta.',
      });

      onUpdate?.();
      onClose();

    } catch (error: unknown) {
      console.error('Error responding to reschedule:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Erro ao responder reagendamento. Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setRespondingAction(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detalhes da Consulta
          </DialogTitle>
          <DialogDescription>
            Informações completas sobre sua consulta
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            <Badge className={getStatusColor(appointment.status)}>
              {getStatusText(appointment.status)}
            </Badge>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Data
              </div>
              <p className="text-sm">
                {format(new Date(appointment.scheduled_at), 'PPP', { locale: ptBR })}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                Horário
              </div>
              <p className="text-sm">
                {format(new Date(appointment.scheduled_at), 'HH:mm')} 
                {appointment.duration && ` (${appointment.duration} min)`}
              </p>
            </div>
          </div>

          {/* Psychologist */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <User className="h-4 w-4" />
              Psicólogo
            </div>
            <p className="text-sm font-medium">
              {appointment.psychologist?.full_name || 'Psicólogo não identificado'}
            </p>
            {appointment.psychologist?.specialization && (
              <p className="text-xs text-muted-foreground">
                {appointment.psychologist.specialization}
              </p>
            )}
          </div>

          {/* Appointment Type */}
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Tipo de Consulta</span>
            <Badge variant="outline">
              {appointment.appointment_type === 'emergency' ? 'Emergência' : 'Regular'}
            </Badge>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                Observações Iniciais
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm">{appointment.notes}</p>
              </div>
            </div>
          )}

          {/* Proposed Reschedule */}
          {appointment.status === 'reschedule_proposed' && appointment.proposed_scheduled_at && (
            <div className="space-y-3 border border-secondary/20 bg-secondary/10 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
                <Calendar className="h-4 w-4" />
                Novo horário proposto
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Nova Data</p>
                  <p className="text-sm text-secondary-foreground">
                    {format(new Date(appointment.proposed_scheduled_at), 'PPP', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Novo Horário</p>
                  <p className="text-sm text-secondary-foreground">
                    {format(new Date(appointment.proposed_scheduled_at), 'HH:mm')}
                  </p>
                </div>
              </div>
              
              {appointment.proposal_notes && (
                <div>
                  <p className="text-sm font-medium">Observações</p>
                  <p className="text-sm text-secondary-hover">{appointment.proposal_notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => handleRescheduleResponse(true)}
                  className="flex-1"
                  disabled={respondingAction !== null}
                >
                  {respondingAction === 'accept' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {respondingAction === 'accept' ? 'Aceitando...' : 'Aceitar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRescheduleResponse(false)}
                  className="flex-1"
                  disabled={respondingAction !== null}
                >
                  {respondingAction === 'reject' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  {respondingAction === 'reject' ? 'Recusando...' : 'Recusar'}
                </Button>
              </div>
            </div>
          )}

          {/* Cancelar */}
          {canCancelAppointment(appointment) && (
            <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar consulta
            </Button>
          )}

          {/* Session Summary */}
          {appointment.session_summary && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                Resumo da Sessão
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm">{appointment.session_summary}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
      <CancelAppointmentDialog
        appointment={appointment}
        by="patient"
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={() => {
          onUpdate?.();
          onClose();
        }}
      />
    </Dialog>
  );
};