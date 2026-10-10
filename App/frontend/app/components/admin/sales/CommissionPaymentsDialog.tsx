// Historial de pagos de comisión (admin): cada lote emitido, con lo que se
// pagó, el saldo arrastrado y el comprobante. Solo lectura: un lote es inmutable.
import { useMemo, useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { QueryState } from '~/components/ui/QueryState';
import { ToolbarSelect } from '~/components/admin/workspace';
import { formatCordobas, formatLongDate } from '~/lib/formatters';
import { useGetCommissionPaymentsQuery } from '~/store/api/salesApi';

const METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

export function CommissionPaymentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: payments = [], isLoading, isError, refetch } = useGetCommissionPaymentsQuery(undefined, {
    skip: !open,
  });
  const [seller, setSeller] = useState('all');

  const sellerOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of payments) names.set(p.sellerEmail, p.sellerName || p.sellerEmail);
    return [
      { value: 'all', label: 'Todos los vendedores' },
      ...[...names.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    ];
  }, [payments]);

  const visible = seller === 'all' ? payments : payments.filter((p) => p.sellerEmail === seller);
  const totalPaid = visible.reduce((sum, p) => sum + p.totalComision, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle>Pagos de comisiones</DialogTitle>
          <DialogDescription>
            {visible.length} pago{visible.length === 1 ? '' : 's'} · {formatCordobas(totalPaid, 'C$', 2)} en total
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b border-border px-5 py-3">
          <ToolbarSelect label="Vendedor" value={seller} onChange={setSeller} options={sellerOptions} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <QueryState loading={isLoading} error={isError} onRetry={refetch} shape="table">
            {visible.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Todavía no hay pagos registrados.</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {visible.map((p) => (
                  <li key={p.id} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{p.sellerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatLongDate(p.createdAt)} · {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod} ·{' '}
                          {p.isSettlement
                            ? 'Saldo de ajustes'
                            : `${p.orderIds.length} venta${p.orderIds.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <span className="nums shrink-0 font-semibold text-foreground">
                        {formatCordobas(p.totalComision, 'C$', 2)}
                      </span>
                    </div>
                    {p.saldoAplicado !== 0 && (
                      <p className="nums text-xs text-muted-foreground">
                        Comisión {formatCordobas(p.grossComision, 'C$', 2)} · ajustes{' '}
                        {formatCordobas(p.saldoAplicado, 'C$', 2)}
                      </p>
                    )}
                    {p.receiptUrl ? (
                      <a
                        href={p.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary-2 hover:underline"
                      >
                        Ver comprobante
                      </a>
                    ) : p.noReceiptComment ? (
                      <p className="text-xs text-muted-foreground">Sin comprobante: {p.noReceiptComment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </div>
      </DialogContent>
    </Dialog>
  );
}
