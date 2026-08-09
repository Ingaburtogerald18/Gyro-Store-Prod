// Detalle de una venta, en diálogo centrado.
//
// `flex flex-col` + max-h-[90vh]: el cuerpo scrollea y el pie con las acciones
// (aprobar/rechazar) queda siempre fijo a la vista.
//
// ── Por qué es ENLAZABLE (`?sale=<id>`) ──
// Es lo que permite que la campana de notificaciones apunte al registro exacto
// en vez de a la pestaña que lo contiene. Hasta ahora no se podía: no existía
// `GET /api/sales/:id`.
import { HugeIcon } from '~/components/ui/icon';
import { CancelCircleIcon, CheckmarkCircle01Icon, Edit02Icon } from '@hugeicons/core-free-icons';

import { Button } from '~/components/ui/button';
import { QueryState } from '~/components/ui/QueryState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { StatusBadge } from '~/components/ui/StatusBadge';
import { formatCordobas } from '~/lib/formatters';
import { SALE_STATUS, statusMeta } from '~/lib/status';
import { useGetSaleQuery, type SaleWithItems } from '~/store/api/salesApi';
import { InvoiceCodeCell } from '~/components/admin/invoices/InvoiceCodeCell';

export function SaleDetailDrawer({
  saleId,
  onClose,
  isAdmin,
  onApprove,
  onReject,
  onEdit,
}: {
  saleId: string | null;
  onClose: () => void;
  isAdmin: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onEdit?: (sale: SaleWithItems) => void;
}) {
  const { data: sale, isLoading, isError, refetch } = useGetSaleQuery(saleId!, { skip: !saleId });

  const meta = sale ? statusMeta(SALE_STATUS, sale.status) : null;
  const pending = sale?.status === 'pending_approval';
  // El backend ya manda `comision` por línea a CUALQUIER rol (solo poda costo
  // y ganancia de tienda para no-admin, ver server/routes/sales.ts → GET
  // /:id) — el vendedor necesita ver cuánto va a ganar ANTES de que un admin
  // apruebe, no solo después.
  const hasComision = !!sale?.items.some((it) => it.comision !== undefined);
  const totalComision = sale?.items.reduce((s, it) => s + (it.comision ?? 0), 0) ?? 0;

  return (
    <Dialog open={!!saleId} onOpenChange={(open) => !open && onClose()}>
      {/* `flex flex-col` + max-h-[90vh]: el cuerpo scrollea y el pie con las
          acciones primarias queda siempre a la vista. */}
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2">
            Venta
            {meta && <StatusBadge status={meta.status} label={meta.label} />}
          </DialogTitle>
          <DialogDescription>
            {sale
              ? `${sale.sellerName || sale.sellerEmail} · ${new Date(sale.createdAt).toLocaleDateString('es-NI')}`
              : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <QueryState
            loading={isLoading}
            error={isError}
            onRetry={refetch}
            errorMessage="No se pudo cargar el detalle de la venta."
            shape="list"
            shapeCount={4}
          >
            {sale && (
              <div className="space-y-5">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Cliente</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{sale.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Origen</dt>
                    <dd className="mt-0.5 font-medium capitalize text-foreground">{sale.saleOrigin}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Nº Factura</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {sale.invoiceCode ? <InvoiceCodeCell code={sale.invoiceCode} /> : '—'}
                    </dd>
                  </div>
                </dl>

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Productos
                  </h3>
                  <div className="divide-y divide-border rounded-card border border-border">
                    {sale.items.map((it, i) => (
                      <div key={`${it.productName}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{it.productName}</p>
                          <p className="nums text-xs text-muted-foreground">
                            {it.quantity} × {formatCordobas(it.salePrice, 'C$', 2)}
                          </p>
                        </div>
                        <span className="nums shrink-0 font-medium text-foreground">
                          {formatCordobas(it.quantity * it.salePrice, 'C$', 2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Solo admin. El backend ya recorta estos campos para el
                    vendedor, así que acá vendrían undefined — pero no se
                    dibuja el bloque para no dejar un encabezado vacío. */}
                {isAdmin && sale.items.some((it) => it.gananciaTienda !== undefined) && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Desglose financiero
                    </h3>
                    <dl className="space-y-1.5 rounded-card border border-border px-3 py-2.5 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Costo de mercadería</dt>
                        <dd className="nums">
                          {formatCordobas(
                            sale.items.reduce((s, it) => s + (it.costeFinalSnap ?? 0) * it.quantity, 0),
                            'C$',
                            2,
                          )}
                        </dd>
                      </div>
                      {/* La comisión ya se ve arriba (pie del diálogo, visible
                          para cualquier rol) — repetirla acá sería lo mismo
                          dos veces en la misma pantalla. */}
                      <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                        <dt>Ganancia de la tienda</dt>
                        <dd className="nums">
                          {formatCordobas(sale.items.reduce((s, it) => s + (it.gananciaTienda ?? 0), 0), 'C$', 2)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
              </div>
            )}
          </QueryState>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4">
          {hasComision && (
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Comisión</span>
              <span className="nums text-sm font-medium text-primary-2">
                {formatCordobas(totalComision, 'C$', 2)}
              </span>
            </div>
          )}
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="nums text-lg font-semibold text-foreground">
              {formatCordobas(sale?.total ?? 0, 'C$', 2)}
            </span>
          </div>

          {isAdmin && pending && sale && (
            <div className="flex flex-col gap-2">
              {/* Corregir antes de decidir: abre el editor con la venta cargada.
                  Va arriba y como botón visible (no ghost) porque es el paso
                  previo natural a aprobar/rechazar si hay un dato malo. */}
              {onEdit && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onEdit(sale)}
                >
                  <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} className="mr-1.5" />
                  Editar venta (corregir datos)
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onReject?.(sale.id);
                    onClose();
                  }}
                >
                  <HugeIcon icon={CancelCircleIcon} size={16} strokeWidth={2} className="mr-1.5 text-destructive" />
                  Rechazar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    onApprove?.(sale.id);
                    onClose();
                  }}
                >
                  <HugeIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={2} className="mr-1.5" />
                  Aprobar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
