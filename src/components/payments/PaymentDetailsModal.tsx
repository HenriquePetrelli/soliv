import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  User,
  CreditCard,
  Calendar,
  AlertTriangle,
  DollarSign,
  Loader2,
  CheckCircle,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PaymentRecord } from '@/hooks/usePayments';
import { SkeletonList } from '@/components/skeletons/Skeletons';

interface PaymentDetailsModalProps {
  paymentId: string;
  onClose: () => void;
}

export const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({
  paymentId,
  onClose
}) => {
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentDetails();
  }, [paymentId]);

  const fetchPaymentDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('psychologist_payments')
        .select('*')
        .eq('id', paymentId)
        .single();
      
      if (error) throw error;
      
      setPayment(data);
    } catch (error) {
      console.error('Error fetching payment details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getPixTypeLabel = (type?: string) => {
    const types: Record<string, string> = {
      cpf: 'CPF',
      email: 'E-mail',
      phone: 'Telefone',
      random_key: 'Chave Aleatória'
    };
    return types[type || ''] || type || 'N/A';
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Detalhes do Pagamento
          </DialogTitle>
          <DialogDescription>
            Histórico completo de consultas e pagamentos
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-2">
            <SkeletonList count={5} showAvatar={false} />
          </div>
        ) : payment ? (
          <div className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>{payment.name}</CardTitle>
                <CardDescription>{payment.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">CPF:</span>
                    <p className="font-medium">{payment.cpf || 'Não informado'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">CRP:</span>
                    <p className="font-medium">{payment.crp || 'Não informado'}</p>
                  </div>
                </div>
                
                {payment.pix_key && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4" />
                        <span className="text-sm font-medium">Dados PIX</span>
                      </div>
                      <div className="bg-muted p-3 rounded-lg">
                        <p className="font-mono text-sm">{payment.pix_key}</p>
                        <Badge variant="secondary" className="mt-1">
                          {getPixTypeLabel(payment.pix_type)}
                        </Badge>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payment Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Pagamentos Pendentes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Consultas Agendadas</span>
                    <Badge variant={payment.scheduled_pending_count > 0 ? "default" : "secondary"}>
                      {payment.scheduled_pending_count}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Emergências</span>
                    <Badge variant={payment.emergency_pending_count > 0 ? "default" : "secondary"}>
                      {payment.emergency_pending_count}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center font-medium">
                    <span>Total Pendente</span>
                    <span className="text-primary">
                      {formatCurrency(payment.total_pending_amount)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Pagamentos Confirmados
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Consultas Pagas</span>
                    <Badge variant="secondary">
                      {payment.scheduled_paid_count}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Emergências Pagas</span>
                    <Badge variant="secondary">
                      {payment.emergency_paid_count}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center font-medium">
                    <span>Total Pago</span>
                    <span className="text-success">
                      {formatCurrency(payment.total_paid_amount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Totals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Resumo Financeiro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Valor por Consulta Agendada</p>
                    <p className="text-2xl font-bold text-success">R$ 85,00</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Valor por Emergência</p>
                    <p className="text-2xl font-bold text-primary">R$ 40,00</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total Geral</span>
                  <span>
                    {formatCurrency(payment.total_paid_amount + payment.total_pending_amount)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Last Update */}
            <div className="text-sm text-muted-foreground text-center">
              Última atualização: {new Date(payment.updated_at).toLocaleString('pt-BR')}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">Erro ao carregar detalhes do pagamento</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};