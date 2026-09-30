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
import {
  ArrowDown01Icon,
  CancelCircleIcon,
  CheckmarkCircle01Icon,
  DropletIcon,
  Edit02Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { Button } from '~/components/ui/button';
import { QueryState } from '~/components/ui/QueryState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { StatusBadge } from '~/components/ui/StatusBadge';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import { SALE_STATUS, statusMeta } from '~/lib/status';
import { useGetSaleQuery, type SaleWithItems } from '~/store/api/salesApi';
import { InvoiceCodeCell } from '~/components/admin/invoices/InvoiceCodeCell';
import { LineBreakdown, PozosBars, sumPozos } from './FinancialBreakdown';

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
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>
              {sale
                ? `${sale.sellerName || sale.sellerEmail} · ${new Date(sale.createdAt).toLocaleDateString('es-NI')}`
                : 'Cargando…'}
            </span>
            {sale?.isManualDate && (
              <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning border border-warning/20">
                Fecha manual
              </span>
            )}
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
                  <div>
                    <dt className="text-xs text-muted-foreground">Fecha de venta</dt>
                    <dd className="mt-0.5 font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                      <span>{new Date(sale.createdAt).toLocaleDateString('es-NI')}</span>
                      {sale.isManualDate && (
                        <span className="inline-flex items-center rounded-full bg-warning/10 px-1.5 py-0.2 text-[10px] font-medium text-warning border border-warning/20">
                          Fecha manual
                        </span>
                      )}
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
                  <FinancialSection sale={sale} />
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
          {(sale?.deliveryFee ?? 0) > 0 ? (
            <>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total productos</span>
                <span className="nums text-sm font-medium text-foreground">
                  {formatCordobas(Math.max(0, (sale?.total ?? 0) - (sale?.deliveryFee ?? 0)), 'C$', 2)}
                </span>
              </div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Delivery</span>
                <span className="nums text-sm font-medium text-muted-foreground">
                  +{formatCordobas(sale?.deliveryFee ?? 0, 'C$', 2)}
                </span>
              </div>
              <div className="mb-3 flex items-baseline justify-between border-t border-border/60 pt-1.5">
                <span className="text-sm font-medium text-foreground">Total a cobrar</span>
                <span className="nums text-lg font-semibold text-foreground">
                  {formatCordobas(sale?.total ?? 0, 'C$', 2)}
                </span>
              </div>
            </>
          ) : (
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="nums text-lg font-semibold text-foreground">
                {formatCordobas(sale?.total ?? 0, 'C$', 2)}
              </span>
            </div>
          )}

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

/**
 * El desglose financiero de la venta, en dos capas.
 *
 * Arriba, siempre visible: los dos números que resumen la venta (qué costó la
 * mercadería y qué le quedó a la tienda). Debajo, tras un botón: la cadena
 * completa producto por producto y el reparto en pozos.
 *
 * Es progressive disclosure a propósito. Nueve de cada diez veces se abre una
 * venta para ver QUÉ se vendió y por cuánto, no para auditar de dónde salió
 * cada córdoba; poner las ~40 cifras del detalle de entrada convertiría el
 * diálogo en un muro y escondería lo que sí se viene a buscar.
 */
function FinancialSection({ sale }: { sale: SaleWithItems }) {
  const [expanded, setExpanded] = useState(false);

  const costoMercaderia = sale.items.reduce((s, it) => s + (it.costeFinalSnap ?? 0) * it.quantity, 0);
  const gananciaTienda = sale.items.reduce((s, it) => s + (it.gananciaTienda ?? 0), 0);

  // El snapshot de `order_items` se llena DOS veces: al registrar con el costo
  // FIFO estimado, y al aprobar con el de los lotes que realmente se
  // consumieron (doc 11, regla de oro). Mientras la venta no esté aprobada, lo
  // que se muestra puede moverse — y quien lo lee tiene derecho a saberlo.
  const definitivo = sale.status === 'approved' || sale.status === 'paid';

  const pozos = useMemo(() => sumPozos(sale.items), [sale.items]);
  const totalPozos = Object.values(pozos).reduce((s, v) => s + (v || 0), 0);

  // Las barras entran desde 0 en el primer frame tras desplegarse, para que se
  // vea el llenado. Con reduced-motion van directo al valor.
  const reduce = useReducedMotion();
  const [barsReady, setBarsReady] = useState(false);
  useEffect(() => {
    if (!expanded) {
      setBarsReady(false);
      return;
    }
    if (reduce) {
      setBarsReady(true);
      return;
    }
    const id = requestAnimationFrame(() => setBarsReady(true));
    return () => cancelAnimationFrame(id);
  }, [expanded, reduce]);

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Desglose financiero
        {!definitivo && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
            Estimado
          </span>
        )}
      </h3>

      <dl className="space-y-1.5 rounded-card border border-border px-3 py-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Costo de mercadería</dt>
          <dd className="nums">{formatCordobas(costoMercaderia, 'C$', 2)}</dd>
        </div>
        {/* La comisión ya se ve abajo (pie del diálogo, visible para cualquier
            rol) — repetirla acá sería lo mismo dos veces en la misma pantalla. */}
        <div className="flex justify-between border-t border-border pt-1.5 font-medium">
          <dt>Ganancia de la tienda</dt>
          <dd className="nums">{formatCordobas(gananciaTienda, 'C$', 2)}</dd>
        </div>
      </dl>

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 h-8 w-full justify-center text-xs text-muted-foreground"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Ocultar desglose' : 'Ver desglose completo'}
        <HugeIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'ml-1.5 transition-transform motion-reduce:transition-none',
            expanded && 'rotate-180',
          )}
        />
      </Button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {!definitivo && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              Estos números son una <span className="font-medium">estimación</span>: el costo sale del
              stock disponible, no de los lotes que se van a consumir. Al aprobar la venta se
              recalculan con el costo real y pueden moverse.
            </p>
          )}

          {/* Producto por producto. Arrancan colapsados cuando hay varios: cinco
              cadenas abiertas a la vez no se leen, se hojean. */}
          {sale.items.map((it, i) => (
            <LineBreakdown
              key={`${it.productName}-${i}`}
              line={{ ...it, precioUnit: it.salePrice }}
              defaultExpanded={sale.items.length === 1}
            />
          ))}

          {totalPozos > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
                <span className="flex items-center gap-1.5">
                  <HugeIcon icon={DropletIcon} size={15} strokeWidth={2} className="text-primary" aria-hidden />
                  <h4 className="text-xs font-semibold text-foreground">Reparto del costo fijo</h4>
                </span>
                <span className="nums text-xs font-medium text-muted-foreground">
                  {formatCordobas(totalPozos, 'C$', 2)}
                </span>
              </div>

              <PozosBars pozos={pozos} formatMoney={(n) => formatCordobas(n, 'C$', 2)} barsReady={barsReady} />

              {/* Sin esta línea, "C$210 en pozos" se lee como plata disponible o
                  como una tajada que compite con la ganancia. Es ninguna de las
                  dos: el Costo F/U ya venía descontado dentro del costo del
                  producto (doc 11 §2). */}
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Ya está incluido en el costo de mercadería de arriba —{' '}
                <span className="font-medium">no sale de la ganancia</span>. Cada venta recoge el
                Costo F/U de sus unidades y lo reserva para estos gastos.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
