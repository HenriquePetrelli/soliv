import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PaymentRecord } from '@/hooks/usePayments';
import { isValidPixE2eId } from '@/components/payments/pixE2e';


const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

interface Props {
  payment: PaymentRecord | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (data: { pixE2eId: string; receipt: File | null }) => Promise<boolean>;
  formatCurrency: (value: number) => string;
  pixTypeLabel: (type?: string) => string;
}

/**
 * Reconciliation step before marking a payout as paid: the admin records the
 * PIX E2E id (and may attach the receipt) for the exact amount shown here.
 */
export const ConfirmPayoutDialog = ({ payment, submitting, onCancel, onConfirm, formatCurrency, pixTypeLabel }: Props) => {
  const [e2e, setE2e] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setE2e('');
    setReceipt(null);
    setTouched(false);
    setFileError(null);
  }, [payment?.psychologist_id]);

  const e2eInvalid = touched && !isValidPixE2eId(e2e);

  return (
    <Dialog open={Boolean(payment)} onOpenChange={(open) => !open && !submitting && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar repasse</DialogTitle>
          <DialogDescription>
            Faça o PIX primeiro e depois registre aqui o código do comprovante. O valor é conferido no servidor.
          </DialogDescription>
        </DialogHeader>

        {payment && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setTouched(true);
              if (!isValidPixE2eId(e2e) || fileError) return;
              await onConfirm({ pixE2eId: e2e.trim().toUpperCase(), receipt });
            }}
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
              <dt className="text-muted-foreground">Psicólogo</dt>
              <dd className="font-medium">{payment.name}</dd>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-semibold">{formatCurrency(payment.total_pending_amount)}</dd>
              <dt className="text-muted-foreground">Chave PIX</dt>
              <dd className="break-all">
                {payment.pix_key || '—'} <span className="text-muted-foreground">({pixTypeLabel(payment.pix_type)})</span>
              </dd>
            </dl>

            <div className="space-y-1.5">
              <Label htmlFor="pix-e2e">Código E2E do PIX</Label>
              <Input
                id="pix-e2e"
                value={e2e}
                onChange={(e) => setE2e(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="E00000000202609241200abcdefghij"
                autoComplete="off"
                maxLength={40}
                aria-invalid={e2eInvalid}
                aria-describedby="pix-e2e-hint"
              />
              <p id="pix-e2e-hint" className={`text-xs ${e2eInvalid ? 'text-destructive' : 'text-muted-foreground'}`}>
                {e2eInvalid
                  ? 'O código tem 32 caracteres e começa com E. Está no comprovante do banco.'
                  : 'Aparece no comprovante como "ID da transação" ou "E2E".'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pix-receipt">Comprovante (opcional)</Label>
              <Input
                id="pix-receipt"
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setFileError(file && file.size > MAX_RECEIPT_BYTES ? 'Arquivo maior que 5 MB.' : null);
                  setReceipt(file);
                }}
              />
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Confirmando...' : `Confirmar ${formatCurrency(payment.total_pending_amount)}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmPayoutDialog;
