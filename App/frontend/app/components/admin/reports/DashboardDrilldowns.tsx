// Pop-ups de drilldown de las StatCards del dashboard (extraídos de
// admin._index.tsx): Total Vendido, Coste Total, Comisiones y Ganancia Tienda.
// El estado (`drilldown`) y los datos (ledger/sellers) viven en la ruta; acá
// solo se pintan los cuatro DrilldownDialog según cuál esté abierto.
import { DollarSquareIcon, Package01Icon, PercentIcon, PlusSignSquareIcon } from "@hugeicons/core-free-icons";
import { formatNumber } from "~/lib/formatters";
import type { SalesLedgerRow, SellerPerformanceRow } from "~/store/api/reportsApi";
import { DrilldownDialog } from "./DrilldownDialog";

export type DrilldownType = 'vendido' | 'coste' | 'comisiones' | 'ganancia' | null;

export function DashboardDrilldowns({
  drilldown,
  onClose,
  ledger,
  sellers,
  formatMoney,
}: {
  drilldown: DrilldownType;
  onClose: () => void;
  ledger: SalesLedgerRow[];
  sellers: SellerPerformanceRow[];
  formatMoney: (n: number) => string;
}) {
  const ledgerTotalVendido = ledger.reduce((s, r) => s + r.total_vendido, 0);
  const ledgerTotalCoste = ledger.reduce((s, r) => s + r.coste, 0);
  const ledgerTotalGanancia = ledger.reduce((s, r) => s + r.ganancia, 0);

  return (
    <>
      {/* Total Vendido */}
      <DrilldownDialog
        open={drilldown === 'vendido'}
        onOpenChange={(open) => !open && onClose()}
        title="Total Vendido — Detalle por venta"
        icon={DollarSquareIcon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total vendido</span>
            <span className="nums">{formatMoney(ledgerTotalVendido)}</span>
          </div>
        }
      >
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en este periodo.</p>
        ) : (
          <div className="divide-y divide-border">
            {ledger.map((row) => (
              <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {new Date(row.created_at).toLocaleDateString('es-NI')}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {row.cliente || 'Sin cliente'}
                  </span>
                  {row.invoice_number && (
                    <span className="ml-2 text-xs text-muted-foreground">#{row.invoice_number}</span>
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

      {/* Coste Total */}
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
          <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en este periodo.</p>
        ) : (
          <div className="divide-y divide-border">
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

      {/* Comisiones */}
      <DrilldownDialog
        open={drilldown === 'comisiones'}
        onOpenChange={(open) => !open && onClose()}
        title="Comisiones — Por vendedor"
        icon={PercentIcon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total comisiones</span>
            <span className="nums">{formatMoney(sellers.reduce((s, r) => s + r.comision, 0))}</span>
          </div>
        }
      >
        {sellers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin comisiones en este periodo.</p>
        ) : (
          <div className="divide-y divide-border">
            {sellers.map((row) => (
              <div key={row.seller_uid ?? row.seller_email} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {row.seller_name || row.seller_email || 'Sin vendedor'}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatNumber(row.num_ventas)} {row.num_ventas === 1 ? 'venta' : 'ventas'}
                  </span>
                </div>
                <span className="nums shrink-0 font-medium text-foreground">
                  {formatMoney(row.comision)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>

      {/* Ganancia Tienda */}
      <DrilldownDialog
        open={drilldown === 'ganancia'}
        onOpenChange={(open) => !open && onClose()}
        title="Ganancia Tienda — Detalle por venta"
        icon={PlusSignSquareIcon}
        footer={
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total ganancia tienda</span>
            <span className="nums">{formatMoney(ledgerTotalGanancia)}</span>
          </div>
        }
      >
        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en este periodo.</p>
        ) : (
          <div className="divide-y divide-border">
            {ledger.map((row) => (
              <div key={row.order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {row.invoice_number ? `#${row.invoice_number}` : new Date(row.created_at).toLocaleDateString('es-NI')}
                  </span>
                </div>
                <span className="nums shrink-0 font-medium text-foreground">
                  {formatMoney(row.ganancia)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DrilldownDialog>
    </>
  );
}
