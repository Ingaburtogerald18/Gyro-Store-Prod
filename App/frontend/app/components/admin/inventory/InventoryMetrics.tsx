// Franja de métricas del inventario: UNA superficie con cuatro números y
// divisores verticales. Reemplaza las seis StatCard + la barra de resumen que
// había arriba de la tabla.
//
// ── Por qué así ──
// Las tarjetas repetían datos (724 aparecía tres veces, el total dos) y cada
// una tenía su color de número sin que el color significara nada. Acá los
// números van en el color del texto y en Chivo (--font-display, la letra de los
// montos); el color queda para UNA señal: ámbar cuando hay algo que mirar
// (mercadería en camino, productos agotados).
import { Metric, MetricStrip as Strip, MetricStripSkeleton as StripSkeleton } from "~/components/admin/workspace";
import { useGetCurrentInventoryQuery, useGetInventoryKpisQuery, useGetPurchasesQuery } from "~/store/api/inventoryV1Api";
import { cordobasFromUsd, formatUsd } from "~/lib/formatters";
import { cn } from "~/lib/utils";

const fmtInt = (n: number) => n.toLocaleString("en-US");

/** Compras: qué se compró en el periodo y cuánto costó. */
export function PurchaseMetrics({ period = "all" }: { period?: string }) {
  const { data: k, isLoading } = useGetInventoryKpisQuery(period);
  const { data: purchases = [] } = useGetPurchasesQuery(period);

  if (isLoading || !k) return <StripSkeleton />;

  const units = k.totalPurchases || 0;
  const avgUnit = units > 0 ? k.totalInversionConImpuestosUsd / units : 0;
  const taxPct = k.subtotalInvertidoUsd > 0 ? (k.totalImpuestosUsd / k.subtotalInvertidoUsd) * 100 : 0;
  const distinctProducts = new Set(purchases.map((p) => p.productName)).size;

  return (
    <Strip>
      <Metric
        label="Unidades en bodega"
        value={fmtInt(k.received)}
        sub={
          <span className={cn(k.inTransit > 0 && "font-medium text-warning")}>
            {fmtInt(k.inTransit)} en tránsito
          </span>
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
    </Strip>
  );
}

/** Stock actual: la foto de lo que hay hoy en bodega. */
export function StockMetrics({ period = "all" }: { period?: string }) {
  const { data: rows = [], isLoading } = useGetCurrentInventoryQuery(period);

  if (isLoading) return <StripSkeleton />;

  const available = rows.reduce((acc, r) => acc + (r.available || 0), 0);
  const inStock = rows.filter((r) => (r.available || 0) > 0).length;
  const shippingUsd = rows.reduce((acc, r) => acc + (r.shippingUnitUsd || 0) * (r.available || 0), 0);
  const valueUsd = rows.reduce((acc, r) => acc + (r.totalFinalUsd || 0), 0);
  const outOfStock = rows.length - inStock;

  return (
    <Strip>
      <Metric
        label="Unidades disponibles"
        value={fmtInt(available)}
        sub={`${fmtInt(inStock)} ${inStock === 1 ? "producto" : "productos"} con stock`}
      />
      <Metric label="Valor en bodega" value={formatUsd(valueUsd)} sub={cordobasFromUsd(valueUsd)} />
      <Metric label="Costo de envío" value={formatUsd(shippingUsd)} sub="Incluido en el valor en bodega" />
      <Metric
        label="Productos agotados"
        value={fmtInt(outOfStock)}
        sub={
          <span className={cn(outOfStock > 0 && "font-medium text-warning")}>
            {outOfStock > 0 ? "Para reponer" : "Nada agotado"}
          </span>
        }
      />
    </Strip>
  );
}
