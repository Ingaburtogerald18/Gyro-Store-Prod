import { useState } from "react";
import {
  DollarSquareIcon,
  Package01Icon,
  PercentIcon,
  PlusSignSquareIcon,
  ShoppingCart02Icon,
  Invoice02Icon,
  Add01Icon,
  Delete02Icon,
  Coins01Icon,
} from "@hugeicons/core-free-icons";
import { formatNumber, errMsg } from "~/lib/formatters";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { HugeIcon } from "~/components/ui/icon";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  useGetLoanPaymentsListQuery,
  useDeleteLoanPaymentMutation,
  type SalesLedgerRow,
  type SellerPerformanceRow,
  type LoanPaymentItem,
} from "~/store/api/reportsApi";
import { DrilldownDialog } from "./DrilldownDialog";
import { RegisterLoanPaymentDialog } from "./RegisterLoanPaymentDialog";

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
}: {
  drilldown: DrilldownType;
  onClose: () => void;
  ledger: SalesLedgerRow[];
  sellers: SellerPerformanceRow[];
  formatMoney: (n: number) => string;
  queryParams?: { startDate?: string; endDate?: string };
}) {
  const ledgerTotalVendido = ledger.reduce((s, r) => s + r.total_vendido, 0);
  const ledgerTotalCoste = ledger.reduce((s, r) => s + r.coste, 0);
  const ledgerTotalGanancia = ledger.reduce((s, r) => s + r.ganancia, 0);
  const totalCount = ledger.length;
  const ticketPromedio = totalCount > 0 ? ledgerTotalVendido / totalCount : 0;

  const { data: loanPaymentsData } = useGetLoanPaymentsListQuery(queryParams, {
    skip: drilldown !== 'ganancia',
  });
  const [deleteLoanPayment, { isLoading: isDeletingLoan }] = useDeleteLoanPaymentMutation();
  const [isRegisterLoanOpen, setIsRegisterLoanOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<LoanPaymentItem | null>(null);

  const totalLoans = loanPaymentsData?.total ?? 0;
  const loanPayments = loanPaymentsData?.payments ?? [];
  const gananciaReal = ledgerTotalGanancia - totalLoans;

  const handleConfirmDelete = async () => {
    if (!paymentToDelete) return;
    try {
      await deleteLoanPayment(paymentToDelete.id).unwrap();
      toast.success('Pago de préstamo eliminado');
      setPaymentToDelete(null);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo eliminar el pago'));
    }
  };

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
                    <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
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
                    <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
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
                      className={`nums block text-[10px] font-medium ${
                        isAbove ? 'text-emerald-400' : 'text-muted-foreground'
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
                <span className="nums shrink-0 font-semibold text-emerald-400">
                  {formatMoney(row.comision)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>

      {/* 5. Ganancia Neta y Real */}
      <DrilldownDialog
        open={drilldown === 'ganancia'}
        onOpenChange={(open) => !open && onClose()}
        title="Rentabilidad y Ganancia Real"
        icon={PlusSignSquareIcon}
        note="La ganancia real deduce los pagos mensuales de préstamos de la ganancia operativa de la tienda."
        footer={
          <div className="flex flex-col gap-2 text-xs sm:text-sm font-medium">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Ganancia operativa (ventas)</span>
              <span className="nums font-semibold text-foreground">{formatMoney(ledgerTotalGanancia)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Pagos de préstamos del período</span>
              <span className="nums font-semibold text-amber-500">-{formatMoney(totalLoans)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm sm:text-base font-bold text-foreground">
              <span>Ganancia real neta</span>
              <span
                className={cn(
                  'nums',
                  gananciaReal >= 0 ? 'text-emerald-500' : 'text-rose-500',
                )}
              >
                {formatMoney(gananciaReal)}
              </span>
            </div>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          {/* Tarjetas resumen de 3 columnas */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Ganancia tienda
              </span>
              <p className="nums mt-1 text-lg font-semibold text-foreground">
                {formatMoney(ledgerTotalGanancia)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {totalCount} {totalCount === 1 ? 'venta' : 'ventas'}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-amber-500/5 p-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-amber-500">
                Pagos préstamos
              </span>
              <p className="nums mt-1 text-lg font-semibold text-amber-500">
                -{formatMoney(totalLoans)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {loanPayments.length} {loanPayments.length === 1 ? 'pago' : 'pagos'}
              </span>
            </div>

            <div
              className={cn(
                'rounded-lg border p-3',
                gananciaReal >= 0
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-rose-500/30 bg-rose-500/5',
              )}
            >
              <span
                className={cn(
                  'text-[11px] font-medium uppercase tracking-wider',
                  gananciaReal >= 0 ? 'text-emerald-500' : 'text-rose-500',
                )}
              >
                Ganancia real
              </span>
              <p
                className={cn(
                  'nums mt-1 text-lg font-semibold',
                  gananciaReal >= 0 ? 'text-emerald-500' : 'text-rose-500',
                )}
              >
                {formatMoney(gananciaReal)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {gananciaReal >= 0 ? 'Balance positivo' : 'Operando en rojo'}
              </span>
            </div>
          </div>

          {/* Sección: Pagos de Préstamos */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <HugeIcon icon={Coins01Icon} size={16} className="text-amber-500" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Pagos de Préstamos ({loanPayments.length})
                </h4>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsRegisterLoanOpen(true)}
                className="h-7 gap-1 px-2.5 text-xs text-amber-500 hover:text-amber-400"
              >
                <HugeIcon icon={Add01Icon} size={13} strokeWidth={2} />
                Registrar pago
              </Button>
            </div>

            {loanPayments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  No hay pagos de préstamos registrados en este período.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsRegisterLoanOpen(true)}
                  className="mt-2 text-xs text-amber-500 hover:text-amber-400"
                >
                  + Registrar primer pago
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
                {loanPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.fecha}
                        </span>
                        {p.nota && (
                          <span className="truncate text-xs font-medium text-foreground">
                            {p.nota}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="nums font-semibold text-amber-500">
                          -{formatMoney(p.monto_cs)}
                        </span>
                        {p.monto_usd && (
                          <p className="nums text-[11px] text-muted-foreground font-mono">
                            (${p.monto_usd.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentToDelete(p)}
                        disabled={isDeletingLoan}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Eliminar pago de préstamo"
                      >
                        <HugeIcon icon={Delete02Icon} size={15} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sección: Detalle de Ventas */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ganancia por Venta ({totalCount} {totalCount === 1 ? 'transacción' : 'transacciones'})
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
                    <span className="nums shrink-0 font-semibold text-emerald-400">
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

      {/* Sub-diálogo para registrar pago de préstamo */}
      <RegisterLoanPaymentDialog
        open={isRegisterLoanOpen}
        onOpenChange={setIsRegisterLoanOpen}
        defaultDate={queryParams?.startDate ? queryParams.startDate.slice(0, 10) : undefined}
      />

      {/* Diálogo de confirmación para eliminar pago */}
      <ConfirmDialog
        open={!!paymentToDelete}
        onOpenChange={(open) => !open && setPaymentToDelete(null)}
        title="Eliminar pago de préstamo"
        description={
          paymentToDelete ? (
            <span>
              ¿Estás seguro de eliminar el pago de{' '}
              <strong className="text-foreground font-mono">
                {paymentToDelete.monto_usd
                  ? `$${paymentToDelete.monto_usd.toFixed(2)} USD (${formatMoney(paymentToDelete.monto_cs)})`
                  : formatMoney(paymentToDelete.monto_cs)}
              </strong>{' '}
              del {paymentToDelete.fecha}? La ganancia real se recalculará automáticamente.
            </span>
          ) : null
        }
        confirmText="Eliminar pago"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
