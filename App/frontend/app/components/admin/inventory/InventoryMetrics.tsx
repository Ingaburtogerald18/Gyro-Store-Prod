// Franja de métricas del inventario: UNA tarjeta con cuatro números y
// divisores verticales. Reemplaza las seis StatCard + la barra de resumen que
// había arriba de la tabla.
//
// ── Por qué así ──
// Las tarjetas repetían datos (724 aparecía tres veces, el total dos) y cada
// una tenía su color de número sin que el color significara nada. Acá los
// números van en el color del texto, con el mismo peso que los precios del
// catálogo; el esmeralda solo marca el ícono de cada dato y el ámbar queda para
// UNA señal: algo que mirar (mercadería en camino, productos agotados).
import type { ReactNode } from "react";
import {
  Alert02Icon,
  Coins01Icon,
  DeliveryBox01Icon,
  Invoice01Icon,
  MoneyBag02Icon,
  PackageIcon,
  ShippingTruck01Icon,
  Calculator01Icon,
} from "@hugeicons/core-free-icons";

import { HugeIcon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { useGetCurrentInventoryQuery, useGetInventoryKpisQuery, useGetPurchasesQuery } from "~/store/api/inventoryV1Api";
import { cordobasFromUsd, formatUsd } from "~/lib/formatters";
import { cn } from "~/lib/utils";

type Icon = typeof PackageIcon;

function Strip({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "inventory-metrics grid grid-cols-2 overflow-clip rounded-2xl border bg-card lg:grid-cols-4",
        // Divisores: en dos columnas, vertical al medio y horizontal entre filas;
        // en cuatro, solo verticales.
        "[&>*]:border-border [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+3)]:border-t",
        "lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:last-child)]:border-r",
      )}
    >
      {children}
    </div>
  );
}

/** Un dato de la franja. `sub` es el dato secundario (equivalente, contexto). */
function Metric({ icon, label, value, sub }: { icon: Icon; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="inventory-metric flex min-w-0 flex-col gap-1.5 px-5 py-4">
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="inventory-metric-icon grid size-7 shrink-0 place-items-center rounded-lg">
          <HugeIcon icon={icon} size={15} strokeWidth={2} aria-hidden />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {sub && <span className="truncate text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

function StripSkeleton() {
  return (
    <Strip>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="inventory-metric flex flex-col gap-2 px-5 py-4">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
      ))}
    </Strip>
  );
}

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

  if (isLoading || !k) return <StripSkeleton />;

  const units = k.totalPurchases || 0;
  const avgUnit = units > 0 ? k.totalInversionConImpuestosUsd / units : 0;
  const taxPct = k.subtotalInvertidoUsd > 0 ? (k.totalImpuestosUsd / k.subtotalInvertidoUsd) * 100 : 0;
  const distinctProducts = new Set(purchases.map((p) => p.productName)).size;

  return (
    <Strip>
      {/* Antes mostraba `received` (todo lo comprado de lotes ya recibidos,
          vendido incluido) bajo el nombre "en bodega". */}
      <Metric
        icon={DeliveryBox01Icon}
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
        icon={MoneyBag02Icon}
        label="Inversión total"
        value={formatUsd(k.totalInversionConImpuestosUsd)}
        sub={cordobasFromUsd(k.totalInversionConImpuestosUsd)}
      />
      <Metric
        icon={Invoice01Icon}
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
        icon={Calculator01Icon}
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
  const shippingUsd = rows.reduce((acc, r) => acc + (r.shippingUnitUsd || 0) * (r.available || 0), 0);
  const valueUsd = rows.reduce((acc, r) => acc + (r.totalFinalUsd || 0), 0);
  // Por PRODUCTO, no por lote: un producto con el lote viejo vendido y uno
  // nuevo con stock no está agotado.
  const stockByProduct = stockPerProduct(rows);
  const inStock = [...stockByProduct.values()].filter((n) => n > 0).length;
  const outOfStock = stockByProduct.size - inStock;

  return (
    <Strip>
      <Metric
        icon={PackageIcon}
        label="Unidades disponibles"
        value={fmtInt(available)}
        sub={`${fmtInt(inStock)} ${inStock === 1 ? "producto" : "productos"} con stock`}
      />
      <Metric icon={Coins01Icon} label="Valor en bodega" value={formatUsd(valueUsd)} sub={cordobasFromUsd(valueUsd)} />
      <Metric icon={ShippingTruck01Icon} label="Costo de envío" value={formatUsd(shippingUsd)} sub="Incluido en el valor en bodega" />
      <Metric
        icon={Alert02Icon}
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
