import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { PieChartIcon } from '@hugeicons/core-free-icons';
import { Pie, PieChart, Cell } from 'recharts';
import { SpotlightCard } from '~/components/ui/stat-card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '~/components/ui/chart';

const incomeChartConfig = {
  coste: { label: 'Costo de productos', color: 'var(--color-chart-1)' },
  comision: { label: 'Comisiones', color: 'var(--color-chart-2)' },
  salary: { label: 'Salary', color: 'var(--color-chart-3)' },
  prestamos: { label: 'Pago de préstamos', color: 'var(--color-chart-5, #f59e0b)' },
  ganancia: { label: 'Ganancia real', color: 'var(--color-chart-4)' },
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
  className,
}: {
  incomeBreakdown: IncomeSlice[];
  formatMoney: (n: number) => string;
  className?: string;
}) {
  const totalIncome = useMemo(
    () => incomeBreakdown.reduce((s, slice) => s + slice.value, 0),
    [incomeBreakdown],
  );

  return (
    <SpotlightCard variant="default" className={className || 'p-5'}>
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <HugeIcon icon={PieChartIcon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">Distribución de ingresos</h3>
        </div>
        <span className="nums text-xs font-medium text-muted-foreground">
          {formatMoney(totalIncome)}
        </span>
      </div>

      {incomeBreakdown.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">
          Sin datos de ingresos en este periodo.
        </p>
      ) : (
        <div>
          <div className="relative mx-auto w-52">
            <ChartContainer
              config={incomeChartConfig}
              className="mx-auto aspect-square max-h-[210px]"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-3 text-xs">
                          <span className="font-medium text-foreground">{name}:</span>
                          <span className="nums font-semibold">
                            {formatMoney(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={incomeBreakdown}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={56}
                  outerRadius={82}
                  strokeWidth={3}
                  stroke="var(--color-card)"
                >
                  {incomeBreakdown.map((slice) => (
                    <Cell key={`cell-${slice.key}`} fill={slice.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Ingresos
              </span>
              <span className="nums text-xs font-bold text-foreground">
                {formatMoney(totalIncome)}
              </span>
            </div>
          </div>

          {/* Leyenda con porcentaje y monto */}
          <ul className="mt-4 space-y-2">
            {incomeBreakdown.map((slice) => {
              const pct = totalIncome > 0 ? (slice.value / totalIncome) * 100 : 0;
              return (
                <li
                  key={slice.key}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.fill }}
                    />
                    <span className="font-medium text-foreground">{slice.label}</span>
                  </span>

                  <div className="text-right">
                    <span className="nums font-semibold text-foreground">
                      {formatMoney(slice.value)}
                    </span>
                    <span className="nums ml-2 text-[11px] text-muted-foreground">
                      ({pct.toFixed(1)}%)
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SpotlightCard>
  );
}
