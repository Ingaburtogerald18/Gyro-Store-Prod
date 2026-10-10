// Popup que se abre después de aprobar en lote (admin.ventas.tsx): resume
// cuánto le acabamos de reconocer al vendedor en ESTE lote y cuánto se le
// debe en total (incluye ventas aprobadas antes, sin pagar todavía).
import { HugeIcon } from '~/components/ui/icon';
import { CheckmarkCircle01Icon, Wallet01Icon } from '@hugeicons/core-free-icons';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { formatCordobas } from '~/lib/formatters';
import { useGetSellerSummaryForQuery } from '~/store/api/salesApi';

export interface PayoutSummaryTarget {
  sellerEmail: string;
  sellerName: string;
  /** Ventas de ESTE lote que se acaban de aprobar. */
  batchCount: number;
  batchComision: number;
}

export function SellerPayoutSummaryDialog({
  target,
  onClose,
  onPay,
}: {
  target: PayoutSummaryTarget | null;
  onClose: () => void;
  /** Abre el pago de comisiones de este vendedor. */
  onPay?: (sellerEmail: string) => void;
}) {
  const { data: summary, isLoading } = useGetSellerSummaryForQuery(target?.sellerEmail ?? '', {
    skip: !target,
  });

  // Lo que hay que pagarle HOY: las ventas aprobadas sin cobrar todavía, más
  // cualquier ajuste arrastrado de un corte anterior (mismo cálculo que
  // `payCommissions` en el backend — no se inventa un total nuevo acá).
  const totalAPagar = summary ? summary.approvedUnpaid.comision + summary.balance : 0;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeIcon icon={CheckmarkCircle01Icon} size={20} className="text-foreground" />
            Ventas aprobadas
          </DialogTitle>
          <DialogDescription>{target?.sellerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
            <p className="text-foreground">
              Se aprobaron <strong>{target?.batchCount}</strong> venta{target?.batchCount === 1 ? '' : 's'} por{' '}
              <strong>{formatCordobas(target?.batchComision ?? 0)}</strong> de comisión.
            </p>
          </div>

          <div className="space-y-2 rounded-2xl border border-border px-4 py-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <HugeIcon icon={Wallet01Icon} size={14} strokeWidth={2} />
              Total pendiente de pago
            </div>

            {isLoading || !summary ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground">
                <Spinner className="h-4 w-4" /> Calculando…
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Ventas aprobadas sin pagar ({summary.approvedUnpaid.count})
                  </span>
                  <span className="nums">{formatCordobas(summary.approvedUnpaid.comision)}</span>
                </div>
                {summary.balance !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ajustes arrastrados</span>
                    <span className="nums">{formatCordobas(summary.balance)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                  <span>A pagar</span>
                  <span className="nums">{formatCordobas(totalAPagar)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          {onPay && target && (
            <Button variant="outline" onClick={() => onPay(target.sellerEmail)}>
              Pagar ahora
            </Button>
          )}
          <Button onClick={onClose}>Listo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
