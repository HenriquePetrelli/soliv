import React, { useState } from 'react';
import { SkeletonSectionCard, SkeletonTable, SkeletonStatsGrid, SkeletonCardList } from '@/components/skeletons/Skeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  CreditCard,
  RefreshCw,
  Eye,
  Check,
  DollarSign,
  Calendar,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { usePayments, type PaymentRecord } from '@/hooks/usePayments';
import { ConfirmPayoutDialog } from './ConfirmPayoutDialog';
import { PaymentDetailsModal } from './PaymentDetailsModal';

export const PaymentsPanel = () => {
  const { payments, loading, error, fetchPayments, confirmPayment, syncPayments } = usePayments();
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);

  // Opens the reconciliation dialog; the payout is only confirmed there,
  // with the PIX E2E id (and optionally the receipt).
  const [confirmTarget, setConfirmTarget] = useState<PaymentRecord | null>(null);
  const handleConfirmPayment = (psychologist_id: string) => {
    setConfirmTarget(payments.find((p) => p.psychologist_id === psychologist_id) ?? null);
  };
  const submitConfirmation = async (data: { pixE2eId: string; receipt: File | null }) => {
    if (!confirmTarget) return false;
    try {
      setProcessingPayment(confirmTarget.psychologist_id);
      await confirmPayment(confirmTarget.psychologist_id, {
        expectedAmount: confirmTarget.total_pending_amount,
        ...data,
      });
      setConfirmTarget(null);
      return true;
    } catch {
      // Error handled in hook
      return false;
    } finally {
      setProcessingPayment(null);
    }
  };

  const handleSyncPayments = async () => {
    try {
      await syncPayments();
    } catch (error) {
      // Error handled in hook
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

  const totalPending = payments.reduce((sum, payment) => sum + payment.total_pending_amount, 0);
  const totalPaid = payments.reduce((sum, payment) => sum + payment.total_paid_amount, 0);
  const pendingPayments = payments.filter(p => p.total_pending_amount > 0).length;

  const showSkeleton = loading && !payments.length;

  const paymentsSkeleton = (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-56 bg-muted rounded animate-pulse" />
          <div className="h-3 w-72 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-9 w-full sm:w-32 bg-muted rounded animate-pulse" />
      </div>
      <SkeletonStatsGrid count={3} columns="grid-cols-2 md:grid-cols-3" compact />
      <Card>
        <CardHeader className="p-4 sm:p-6 space-y-2">
          <div className="h-4 w-40 bg-muted rounded animate-pulse" />
          <div className="h-3 w-64 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="md:hidden">
            <SkeletonCardList count={4} />
          </div>
          <div className="hidden md:block">
            <SkeletonTable rows={6} cols={5} />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (error && !payments.length && !showSkeleton) {
    return (
      <ContentTransition loading={false} skeleton={paymentsSkeleton}>
        <ErrorState
          title="Falha ao carregar pagamentos"
          description="Não conseguimos buscar os dados de pagamentos agora. Verifique sua conexão e tente novamente."
          onRetry={fetchPayments}
          retrying={loading}
        />
      </ContentTransition>
    );
  }

  return (
    <ContentTransition loading={showSkeleton} skeleton={paymentsSkeleton}>
    <div className="space-y-4 sm:space-y-6">

      {/* Header with actions */}
      <div className="flex sm:justify-end">
        <Button onClick={handleSyncPayments} disabled={loading} size="sm" className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Sincronizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Pendente</CardTitle>
            <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-primary truncate">
              {formatCurrency(totalPending)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {pendingPayments} psicólogo(s) pendente(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Pago</CardTitle>
            <Check className="h-4 w-4 text-success shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-success truncate">
              {formatCurrency(totalPaid)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pagamentos confirmados
            </p>
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Psicólogos Ativos</CardTitle>
            <DollarSign className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold">{payments.length}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Com histórico de pagamentos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Lista de Pagamentos</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Consultas agendadas = R$ 85,00 | Emergências = R$ 40,00
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {payments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Nenhum pagamento encontrado"
              description="Execute a sincronização para carregar os dados de pagamentos dos psicólogos."
              variant="primary"
              inCard={false}
              action={
                <Button size="sm" onClick={handleSyncPayments} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Sincronizar agora
                </Button>
              }
            />
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-lg border bg-card p-3 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{payment.name}</div>
                        {payment.crp && (
                          <div className="text-xs text-muted-foreground">CRP: {payment.crp}</div>
                        )}
                        <div className="text-xs text-muted-foreground truncate">{payment.email}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground uppercase">Pendente</div>
                        <div className={`text-sm font-semibold ${payment.total_pending_amount > 0 ? "text-primary" : "text-muted-foreground"}`}>
                          {formatCurrency(payment.total_pending_amount)}
                        </div>
                      </div>
                    </div>

                    {payment.pix_key && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">PIX: </span>
                        <span className="font-mono">{payment.pix_key}</span>
                        <Badge variant="secondary" className="text-xs ml-2">
                          {getPixTypeLabel(payment.pix_type)}
                        </Badge>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={payment.scheduled_pending_count > 0 ? "default" : "secondary"}>
                        Agendadas: {payment.scheduled_pending_count}
                      </Badge>
                      <Badge variant={payment.emergency_pending_count > 0 ? "default" : "secondary"}>
                        Emergências: {payment.emergency_pending_count}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setSelectedPayment(payment.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Detalhes
                      </Button>
                      {payment.total_pending_amount > 0 && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleConfirmPayment(payment.psychologist_id)}
                          disabled={processingPayment === payment.psychologist_id}
                        >
                          {processingPayment === payment.psychologist_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Confirmar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">PIX</TableHead>
                      <TableHead className="text-center font-semibold">Agendadas Pendentes</TableHead>
                      <TableHead className="text-center font-semibold">Emergências Pendentes</TableHead>
                      <TableHead className="text-right font-semibold">Valor Pendente</TableHead>
                      <TableHead className="text-center font-semibold">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors">

                        <TableCell className="font-medium">
                          <div>
                            <div>{payment.name}</div>
                            {payment.crp && (
                              <div className="text-sm text-muted-foreground">
                                CRP: {payment.crp}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{payment.email}</TableCell>
                        <TableCell>
                          {payment.pix_key ? (
                            <div>
                              <div className="font-mono text-sm">{payment.pix_key}</div>
                              <Badge variant="secondary" className="text-xs">
                                {getPixTypeLabel(payment.pix_type)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Não informado</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={payment.scheduled_pending_count > 0 ? "default" : "secondary"}>
                            {payment.scheduled_pending_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={payment.emergency_pending_count > 0 ? "default" : "secondary"}>
                            {payment.emergency_pending_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <span className={payment.total_pending_amount > 0 ? "text-primary" : "text-muted-foreground"}>
                            {formatCurrency(payment.total_pending_amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedPayment(payment.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {payment.total_pending_amount > 0 && (
                              <Button
                                size="sm"
                                onClick={() => handleConfirmPayment(payment.psychologist_id)}
                                disabled={processingPayment === payment.psychologist_id}
                              >
                                {processingPayment === payment.psychologist_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-4 w-4 mr-1" />
                                    Confirmar
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

        </CardContent>
      </Card>

      {/* Payment Details Modal */}
      {selectedPayment && (
        <PaymentDetailsModal
          paymentId={selectedPayment}
          onClose={() => setSelectedPayment(null)}
        />
      )}

      <ConfirmPayoutDialog
        payment={confirmTarget}
        submitting={Boolean(confirmTarget && processingPayment === confirmTarget.psychologist_id)}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={submitConfirmation}
        formatCurrency={formatCurrency}
        pixTypeLabel={getPixTypeLabel}
      />
    </div>
    </ContentTransition>
  );
};

