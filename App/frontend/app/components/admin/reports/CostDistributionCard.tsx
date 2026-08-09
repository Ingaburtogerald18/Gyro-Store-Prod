// Tarjeta "Distribución de costos fijos" del dashboard (extraída de
// admin._index.tsx). Muestra el reparto del Costo F/U entre los 7 pozos como
// barras ordenadas de mayor a menor (% sobre el total repartido).
import { HugeIcon } from "~/components/ui/icon";
import { DropletIcon } from "@hugeicons/core-free-icons";
import { SpotlightCard } from "~/components/ui/stat-card";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";
import type { FinancialKPIs } from "~/store/api/reportsApi";

// Los 7 pozos del doc 11, en el orden en que se reparte el Costo F/U.
const POZOS = [
  'publicidad',
  'mantenimiento',
  'utiles',
  'garantias',
  'prestamos',
  'suscripciones',
  'servicios',
] as const;

export function CostDistributionCard({
  kpis,
  barsReady,
  formatMoney,
}: {
  kpis: FinancialKPIs;
  barsReady: boolean;
  formatMoney: (n: number) => string;
}) {
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
          {formatMoney(
            Object.values(kpis.pozos_recogidos || {}).reduce((s, v) => s + (v || 0), 0),
          )}
        </span>
      </div>

      {/* La barra mide el % SOBRE EL TOTAL repartido, no sobre el
          pozo más grande. Con `amount / max` el mayor llegaba SIEMPRE
          al 100% aunque se llevara el 22% del Costo F/U, y el gráfico
          decía lo mismo con cualquier dato: era un ranking disfrazado
          de proporción. Ahora las siete barras suman 100%. */}
      <div className="space-y-3">
        {(() => {
          const totalPozos = Object.values(kpis.pozos_recogidos || {}).reduce(
            (sum, v) => sum + (v || 0),
            0,
          );

          // De mayor a menor, no en el orden fijo del array `POZOS`:
          // esto es un ranking de a dónde se va el costo fijo, y un
          // ranking se lee ordenado.
          const ordenados = [...POZOS]
            .map((pozoKey) => ({
              pozoKey,
              amount: kpis.pozos_recogidos?.[pozoKey] || 0,
            }))
            .sort((a, b) => b.amount - a.amount);

          return ordenados.map(({ pozoKey, amount }, i) => {
            const pct = totalPozos > 0 ? (amount / totalPozos) * 100 : 0;
            // Los tres mayores en primary pleno; los cuatro restantes
            // atenuados. Siete barras del mismo color son monótonas y
            // hay que leer los siete números para encontrar el mayor.
            const destacado = i < 3;

            return (
              <div key={pozoKey} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium capitalize text-foreground">{pozoKey}</span>
                  <span className="nums text-muted-foreground">
                    {formatMoney(amount)}
                    <span className="ml-2 text-xs opacity-70">{pct.toFixed(1)}%</span>
                  </span>
                </div>
                {/* Progress de shadcn: trae role="progressbar" y sus valores
                    ARIA, que la barra hecha a mano no tenía. Arranca en 0 y
                    sube al montar; con reduced-motion va directo al valor. */}
                <Progress
                  value={barsReady ? pct : 0}
                  aria-label={`${pozoKey}: ${pct.toFixed(1)}% del costo fijo repartido`}
                  className={cn(
                    'h-1.5 bg-primary/10',
                    destacado
                      ? '[&>[data-slot=progress-indicator]]:bg-primary'
                      : '[&>[data-slot=progress-indicator]]:bg-primary/40',
                  )}
                />
              </div>
            );
          });
        })()}
      </div>

      {/* Si el Costo F/U de los lotes vendidos es 0 o nulo, los siete
          pozos salen en 0 y la tarjeta parecía rota sin decir por qué. */}
      {Object.values(kpis.pozos_recogidos || {}).every((v) => !v) && (
        <p className="mt-4 text-xs text-muted-foreground">
          Sin reparto en este periodo. Si hubo ventas, revisá que los lotes vendidos
          tengan cargado el <span className="font-medium">Costo F/U</span> en Inventario.
        </p>
      )}
    </SpotlightCard>
  );
}
