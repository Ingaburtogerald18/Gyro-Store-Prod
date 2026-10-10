import {
  DollarSquareIcon,
  Package01Icon,
  PercentIcon,
  PlusSignSquareIcon,
  ShoppingCart02Icon,
  Invoice02Icon,
} from "@hugeicons/core-free-icons";
import { formatNumber } from "~/lib/formatters";
import { cn } from "~/lib/utils";
import {
  useGetExpensesOverflowQuery,
  useGetKpisQuery,
  type SalesLedgerRow,
  type SellerPerformanceRow,
  type FinancialKPIs,
} from "~/store/api/reportsApi";
import { DrilldownDialog } from "./DrilldownDialog";

export type DrilldownType =
  | 'vendido'
  | 'coste'
  | 'comisiones'
  | 'ganancia'
  | 'ventas'
  | 'ticket_promedio'
  | null;

export function DashboardDrilldowns({
  drilldown,
  onClose,
  ledger,
  sellers,
  formatMoney,
  queryParams,
  kpis: kpisProp,
}: {
  drilldown: DrilldownType;
  onClose: () => void;
  ledger: SalesLedgerRow[];
  sellers: SellerPerformanceRow[];
  formatMoney: (n: number) => string;
  queryParams?: { startDate?: string; endDate?: string };
  kpis?: FinancialKPIs;
}) {
  const ledgerTotalVendido = ledger.reduce((s, r) => s + r.total_vendido, 0);
  const ledgerTotalCoste = ledger.reduce((s, r) => s + r.coste, 0);
  const ledgerTotalGanancia = ledger.reduce((s, r) => s + r.ganancia, 0);
  const totalCount = ledger.length;
  const ticketPromedio = totalCount > 0 ? ledgerTotalVendido / totalCount : 0;

  const { data: queriedKpis } = useGetKpisQuery(queryParams, {
    skip: !!kpisProp || drilldown !== 'ganancia',
  });
  const kpis = kpisProp ?? queriedKpis;

  // La ganancia real y lo que se tomó de ella salen del libro de pozos del mes
  // (server/services/pozoLedger.ts), la misma cifra que la pestaña Gastos.
  const { data: pozoLedger } = useGetExpensesOverflowQuery(queryParams, {
    skip: drilldown !== 'ganancia',
  });
  const gananciaTienda = pozoLedger?.gananciaTienda ?? kpis?.ganancia_tienda_total ?? ledgerTotalGanancia;
  const gastosDeGanancia = pozoLedger?.deGanancia.total ?? kpis?.gastos_de_ganancia ?? 0;
  const gananciaReal = pozoLedger?.gananciaReal ?? kpis?.ganancia_real ?? gananciaTienda;
  const pozosQueTomaron = (pozoLedger?.pozos ?? []).filter((p) => p.tomadoGanancia > 0);
  const deGananciaRows = pozosQueTomaron.map((p) => ({ label: `${p.label} (se pasó)`, value: p.tomadoGanancia }));

  return (
    <>
      {/* 1. Total Vendido */}
      <DrilldownDialog
        open={drilldown === 'vendido'}
        onOpenChange={(open) => !open && onClose()}
        title="Total Vendido — Detalle por venta"
        icon={DollarSquareIcon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total vendido ({totalCount} transacciones)</span>
            <span className="nums">{formatMoney(ledgerTotalVendido)}</span>
          </div>
        }
      >
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin ventas registradas en este mes.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {ledger.map((row) => (
              <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {new Date(row.created_at).toLocaleDateString('es-NI', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                  <span className="ml-2 text-muted-foreground truncate">
                    {row.cliente || 'Cliente sin nombre'}
                  </span>
                  {row.invoice_number && (
                    <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-mono text-muted-foreground">
                      #{row.invoice_number}
                    </span>
                  )}
                </div>
                <span className="nums shrink-0 font-semibold text-foreground">
                  {formatMoney(row.total_vendido)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>

      {/* 2. Número de Ventas */}
      <DrilldownDialog
        open={drilldown === 'ventas'}
        onOpenChange={(open) => !open && onClose()}
        title="Número de Ventas — Listado de transacciones"
        icon={ShoppingCart02Icon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Transacciones aprobadas</span>
            <span className="nums">{totalCount} ventas</span>
          </div>
        }
      >
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin ventas registradas en este mes.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {ledger.map((row) => (
              <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {new Date(row.created_at).toLocaleDateString('es-NI', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {row.cliente || 'Cliente no especificado'}
                  </span>
                  {row.invoice_number && (
                    <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-mono text-muted-foreground">
                      #{row.invoice_number}
                    </span>
                  )}
                </div>
                <span className="nums shrink-0 font-medium text-foreground">
                  {formatMoney(row.total_vendido)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>

      {/* 3. Ticket Promedio */}
      <DrilldownDialog
        open={drilldown === 'ticket_promedio'}
        onOpenChange={(open) => !open && onClose()}
        title="Ticket Promedio — Comparativa por venta"
        icon={Invoice02Icon}
        note={`El ticket promedio del mes es de ${formatMoney(ticketPromedio)} calculado sobre ${totalCount} ventas.`}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Promedio por venta</span>
            <span className="nums">{formatMoney(ticketPromedio)}</span>
          </div>
        }
      >
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin ventas registradas en este mes.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {ledger.map((row) => {
              const diff = row.total_vendido - ticketPromedio;
              const isAbove = diff >= 0;
              return (
                <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">
                      {new Date(row.created_at).toLocaleDateString('es-NI', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {row.cliente || 'Cliente sin nombre'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="nums block font-semibold text-foreground">
                      {formatMoney(row.total_vendido)}
                    </span>
                    <span
                      className={`nums block text-2xs font-medium ${
                        isAbove ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {isAbove ? `+${formatMoney(diff)}` : formatMoney(diff)} vs promedio
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DrilldownDialog>

      {/* 4. Comisiones */}
      <DrilldownDialog
        open={drilldown === 'comisiones'}
        onOpenChange={(open) => !open && onClose()}
        title="Comisiones — Desglose por vendedor"
        icon={PercentIcon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total comisiones pagadas</span>
            <span className="nums">{formatMoney(sellers.reduce((s, r) => s + r.comision, 0))}</span>
          </div>
        }
      >
        {sellers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin comisiones generadas en este mes.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {sellers.map((row) => (
              <div
                key={row.seller_uid ?? row.seller_email}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {row.seller_name || row.seller_email || 'Sin vendedor'}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatNumber(row.num_ventas)} {row.num_ventas === 1 ? 'venta' : 'ventas'}
                  </span>
                </div>
                <span className="nums shrink-0 font-semibold text-foreground">
                  {formatMoney(row.comision)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>

      {/* 5. Ganancia real */}
      <DrilldownDialog
        open={drilldown === 'ganancia'}
        onOpenChange={(open) => !open && onClose()}
        title="Rentabilidad y ganancia real"
        icon={PlusSignSquareIcon}
        note="Cada gasto se paga primero con su pozo (más lo heredado). Si un pozo común se pasa, toma de la bolsa extra y después de los otros pozos; Préstamos y el fondo salario no comparten. Solo lo que no alcanzan a cubrir los pozos se resta de la ganancia."
        footer={
          <div className="flex w-full flex-col gap-1.5 text-xs font-medium sm:text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Ganancia tienda</span>
              <span className="nums font-semibold text-foreground">{formatMoney(gananciaTienda)}</span>
            </div>
            {deGananciaRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between border-l-2 border-destructive/50 pl-3 text-xs text-muted-foreground">
                <span>{r.label}</span>
                <span className="nums font-medium text-destructive">−{formatMoney(r.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm font-bold text-foreground sm:text-base">
              <span>Ganancia real</span>
              <span className={cn('nums', gananciaReal >= 0 ? 'text-foreground' : 'text-destructive')}>
                {formatMoney(gananciaReal)}
              </span>
            </div>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
              <span className="text-2xs font-medium text-muted-foreground">Ganancia tienda</span>
              <p className="nums mt-1 text-base font-semibold text-foreground sm:text-lg">{formatMoney(gananciaTienda)}</p>
              <span className="text-2xs text-muted-foreground">
                {totalCount} {totalCount === 1 ? 'venta' : 'ventas'}
              </span>
            </div>
            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-3">
              <span className="text-2xs font-medium text-warning">Gastos pagados con ganancia</span>
              <p className="nums mt-1 text-base font-semibold text-warning sm:text-lg">−{formatMoney(gastosDeGanancia)}</p>
              <span className="text-2xs text-muted-foreground">
                {gastosDeGanancia === 0 ? 'Los pozos cubrieron todo' : 'Lo que los pozos no alcanzaron'}
              </span>
            </div>
            <div className={cn('rounded-2xl border p-3', gananciaReal >= 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5')}>
              <span className={cn('text-2xs font-medium', gananciaReal >= 0 ? 'text-foreground' : 'text-destructive')}>Ganancia real</span>
              <p className={cn('nums mt-1 text-base font-semibold sm:text-lg', gananciaReal >= 0 ? 'text-foreground' : 'text-destructive')}>
                {formatMoney(gananciaReal)}
              </p>
              <span className="text-2xs text-muted-foreground">{gananciaReal >= 0 ? 'Balance positivo' : 'Operando en rojo'}</span>
            </div>
          </div>

          {pozosQueTomaron.length > 0 && (
            <div className="space-y-1.5 rounded-2xl border border-border/70 bg-card/60 p-3.5 text-xs">
              <p className="font-semibold text-foreground">Pozos que tomaron de la ganancia</p>
              {pozosQueTomaron.map((p) => (
                <div key={p.pozo} className="flex items-center justify-between text-muted-foreground">
                  <span>
                    {p.label}: gastó {formatMoney(p.gastado)} con {formatMoney(Math.max(0, p.heredado + p.recogido))} de presupuesto
                  </span>
                  <span className="nums font-medium text-destructive">−{formatMoney(p.tomadoGanancia)}</span>
                </div>
              ))}
              <p className="pt-1 text-2xs text-muted-foreground">Los pagos de préstamo se registran como gasto del pozo Préstamos, en Gastos y presupuesto.</p>
            </div>
          )}

          {/* Sección: Detalle de Ventas */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ganancia por venta ({totalCount} {totalCount === 1 ? 'transacción' : 'transacciones'})
            </h4>

            {ledger.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Sin ventas registradas en este mes.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {ledger.map((row) => (
                  <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">
                        {new Date(row.created_at).toLocaleDateString('es-NI', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {row.cliente || (row.invoice_number ? `#${row.invoice_number}` : 'Venta')}
                      </span>
                    </div>
                    <span className="nums shrink-0 font-semibold text-foreground">
                      {formatMoney(row.ganancia)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DrilldownDialog>

      {/* Coste Total (opcional para mantener compatibilidad) */}
      <DrilldownDialog
        open={drilldown === 'coste'}
        onOpenChange={(open) => !open && onClose()}
        title="Coste Total — Detalle por venta"
        icon={Package01Icon}
        note="Costo de la mercadería vendida = costo de importación + costo fijo unitario, congelado al aprobar."
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Coste total</span>
            <span className="nums">{formatMoney(ledgerTotalCoste)}</span>
          </div>
        }
      >
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin ventas registradas en este mes.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {ledger.map((row) => (
              <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {new Date(row.created_at).toLocaleDateString('es-NI')}
                  </span>
                  {row.invoice_number && (
                    <span className="ml-2 text-xs text-muted-foreground">#{row.invoice_number}</span>
                  )}
                </div>
                <span className="nums shrink-0 font-medium text-foreground">
                  {formatMoney(row.coste)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>

    </>
  );
}
