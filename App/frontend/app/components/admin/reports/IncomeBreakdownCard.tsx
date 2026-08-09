// Tarjeta "Ingresos de la tienda" del dashboard (extraída de admin._index.tsx):
// donut de coste / comisiones / salary / ganancia, con leyenda propia y cifras.
import { HugeIcon } from "~/components/ui/icon";
import { PieChartIcon } from "@hugeicons/core-free-icons";
import { Pie, PieChart } from "recharts";
import { SpotlightCard } from "~/components/ui/stat-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";

// Series del gráfico. Los colores salen de los tokens chart-*, así que siguen
// el tema (claro/oscuro) sin tocar nada acá.
const incomeChartConfig = {
  coste: { label: 'Coste', color: 'var(--color-chart-1)' },
  comision: { label: 'Comisiones', color: 'var(--color-chart-2)' },
  salary: { label: 'Salary', color: 'var(--color-chart-3)' },
  ganancia: { label: 'Ganancia tienda', color: 'var(--color-chart-4)' },
} satisfies ChartConfig;

export interface IncomeSlice {
  key: string;
  label: string;
  value: number;
  fill: string;
}

export function IncomeBreakdownCard({
  incomeBreakdown,
  formatMoney,
}: {
  incomeBreakdown: IncomeSlice[];
  formatMoney: (n: number) => string;
}) {
  return (
    <SpotlightCard variant="default" className="col-span-7 lg:col-span-3 p-5">
      <div className="mb-4 flex items-center gap-2 border-b pb-4">
        <HugeIcon icon={PieChartIcon} size={20} strokeWidth={2} className="text-primary" />
        <h3 className="font-semibold text-foreground">Ingresos de la tienda</h3>
      </div>

      <ChartContainer
        config={incomeChartConfig}
        className="mx-auto aspect-square max-h-[240px]"
      >
        <PieChart>
          <ChartTooltip
            content={<ChartTooltipContent hideLabel nameKey="label" />}
          />
          <Pie
            data={incomeBreakdown}
            dataKey="value"
            nameKey="label"
            innerRadius={55}
            strokeWidth={4}
          />
        </PieChart>
      </ChartContainer>

      {/* Leyenda propia: más compacta que la de Recharts y con cifras. */}
      <ul className="mt-4 space-y-2">
        {incomeBreakdown.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: slice.fill }}
              />
              {slice.label}
            </span>
            <span className="nums font-medium text-foreground">{formatMoney(slice.value)}</span>
          </li>
        ))}
      </ul>
    </SpotlightCard>
  );
}
