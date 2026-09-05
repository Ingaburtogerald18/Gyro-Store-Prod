// Tarjeta "Distribución de costos fijos" del dashboard (extraída de
// admin._index.tsx). Muestra el reparto del Costo F/U entre los 7 pozos.
//
// Las barras viven en `FinancialBreakdown` (components/admin/sales): son las
// mismas que el detalle de una venta usa para mostrar SU reparto. Acá el total
// es el del periodo, allá el de una venta — mismo gráfico, distinto alcance.
import { HugeIcon } from "~/components/ui/icon";
import { DropletIcon } from "@hugeicons/core-free-icons";
import { SpotlightCard } from "~/components/ui/stat-card";
import { PozosBars } from "~/components/admin/sales/FinancialBreakdown";
import type { FinancialKPIs } from "~/store/api/reportsApi";

export function CostDistributionCard({
  kpis,
  barsReady,
  formatMoney,
}: {
  kpis: FinancialKPIs;
  barsReady: boolean;
  formatMoney: (n: number) => string;
}) {
  const pozos = kpis.pozos_recogidos || {};

  return (
    <SpotlightCard variant="highlight" className="col-span-7 lg:col-span-4 p-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b pb-4">
        <span className="flex items-center gap-2">
          <HugeIcon icon={DropletIcon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">Distribución de costos fijos</h3>
        </span>
        {/* El total repartido: sin él, los porcentajes de abajo son
            proporciones de una cifra que no está en ningún lado. */}
        <span className="nums text-sm font-medium text-muted-foreground">
          {formatMoney(Object.values(pozos).reduce((s, v) => s + (v || 0), 0))}
        </span>
      </div>

      <PozosBars pozos={pozos} formatMoney={formatMoney} barsReady={barsReady} />

      {/* Si el Costo F/U de los lotes vendidos es 0 o nulo, los siete
          pozos salen en 0 y la tarjeta parecía rota sin decir por qué. */}
      {Object.values(pozos).every((v) => !v) && (
        <p className="mt-4 text-xs text-muted-foreground">
          Sin reparto en este periodo. Si hubo ventas, revisá que los lotes vendidos
          tengan cargado el <span className="font-medium">Costo F/U</span> en Inventario.
        </p>
      )}
    </SpotlightCard>
  );
}
