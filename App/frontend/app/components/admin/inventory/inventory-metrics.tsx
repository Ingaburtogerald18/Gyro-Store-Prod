// Métricas de Inventario: cuatro números en el color del texto; el ámbar marca
// lo único que hay que mirar (mercadería en camino, agotados).
import { Metric, MetricStrip, MetricStripSkeleton } from "~/components/admin/workspace";
import { useGetCurrentInventoryQuery, useGetInventoryKpisQuery, useGetPurchasesQuery } from "~/state/api/inventory-api";
import { cordobasFromUsd, formatUsd } from "~/lib/formatters";
import { cn } from "~/lib/utils";

const fmtInt = (n: number) => n.toLocaleString("en-US");

/** Unidades disponibles por producto (suma de sus lotes). */
export function stockPerProduct(rows: { productName: string; available: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.productName, (map.get(r.productName) ?? 0) + (r.available || 0));
  return map;
}

/** Compras: qué se compró en el periodo y cuánto costó. */
export function PurchaseMetrics({ period = "all" }: { period?: string }) {
  const { data: k, isLoading } = useGetInventoryKpisQuery(period);
  const { data: purchases = [] } = useGetPurchasesQuery(period);

  if (isLoading || !k) return <MetricStripSkeleton />;

  const units = k.totalPurchases || 0;
  const avgUnit = units > 0 ? k.totalInversionConImpuestosUsd / units : 0;
  const taxPct = k.subtotalInvertidoUsd > 0 ? (k.totalImpuestosUsd / k.subtotalInvertidoUsd) * 100 : 0;
  const distinctProducts = new Set(purchases.map((p) => p.productName)).size;

  return (
    <MetricStrip>
      <Metric
        label="Unidades en bodega"
        value={fmtInt(k.availableUnits)}
        sub={
          <>
            {fmtInt(k.received)} recibidas ·{" "}
            <span className={cn(k.inTransit > 0 && "font-medium text-warning")}>
              {fmtInt(k.inTransit)} en tránsito
            </span>
          </>
        }
      />
      <Metric
        label="Inversión total"
        value={formatUsd(k.totalInversionConImpuestosUsd)}
        sub={cordobasFromUsd(k.totalInversionConImpuestosUsd)}
      />
      <Metric
        label="Impuestos pagados"
        value={formatUsd(k.totalImpuestosUsd)}
        sub={
          <>
            <span className="font-medium text-foreground">{taxPct.toFixed(1)} %</span> del subtotal{" "}
            {formatUsd(k.subtotalInvertidoUsd)}
          </>
        }
      />
      <Metric
        label="Costo promedio por unidad"
        value={formatUsd(avgUnit)}
        sub={`${fmtInt(distinctProducts)} ${distinctProducts === 1 ? "producto distinto" : "productos distintos"}`}
      />
    </MetricStrip>
  );
}

/** Stock actual: la foto de lo que hay hoy en bodega. Sin `showCosts`, solo unidades. */
export function StockMetrics({ period = "all", showCosts = true }: { period?: string; showCosts?: boolean }) {
  const { data: rows = [], isLoading } = useGetCurrentInventoryQuery(period);

  if (isLoading) return <MetricStripSkeleton count={showCosts ? 4 : 2} />;

  const available = rows.reduce((acc, r) => acc + (r.available || 0), 0);
  const shippingUsd = rows.reduce((acc, r) => acc + (r.shippingUnitUsd || 0) * (r.available || 0), 0);
  const valueUsd = rows.reduce((acc, r) => acc + (r.totalFinalUsd || 0), 0);
  // Por PRODUCTO, no por lote: un producto con el lote viejo vendido y uno
  // nuevo con stock no está agotado.
  const stockByProduct = stockPerProduct(rows);
  const inStock = [...stockByProduct.values()].filter((n) => n > 0).length;
  const outOfStock = stockByProduct.size - inStock;

  return (
    <MetricStrip columns={showCosts ? 4 : 2}>
      <Metric
        label="Unidades disponibles"
        value={fmtInt(available)}
        sub={`${fmtInt(inStock)} ${inStock === 1 ? "producto" : "productos"} con stock`}
      />
      {showCosts && <Metric label="Valor en bodega" value={formatUsd(valueUsd)} sub={cordobasFromUsd(valueUsd)} />}
      {showCosts && <Metric label="Costo de envío" value={formatUsd(shippingUsd)} sub="Incluido en el valor en bodega" />}
      <Metric
        label="Productos agotados"
        value={fmtInt(outOfStock)}
        sub={
          <span className={cn(outOfStock > 0 && "font-medium text-warning")}>
            {outOfStock > 0 ? "Para reponer" : "Nada agotado"}
          </span>
        }
      />
    </MetricStrip>
  );
}
