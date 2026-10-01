import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { CreditCardIcon } from '@hugeicons/core-free-icons';
import { Pie, PieChart, Cell } from 'recharts';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '~/components/ui/chart';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSalesBreakdownQuery } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';

// Tonos de marca (tokens tone-*), no hex sueltos: siguen al tema claro/oscuro.
const paymentMethodChartConfig = {
  efectivo: { label: 'Efectivo', color: 'var(--color-tone-emerald)' },
  transferencia: { label: 'Transferencia', color: 'var(--color-tone-sky)' },
  tarjeta: { label: 'Tarjeta', color: 'var(--color-tone-purple)' },
  sin_metodo: { label: 'Sin método', color: 'var(--color-muted-foreground)' },
} satisfies ChartConfig;

const METHOD_CONFIG: Record<string, { label: string; fill: string }> = {
  efectivo: { label: 'Efectivo', fill: 'var(--color-tone-emerald)' },
  transferencia: { label: 'Transferencia', fill: 'var(--color-tone-sky)' },
  tarjeta: { label: 'Tarjeta', fill: 'var(--color-tone-purple)' },
  sin_metodo: { label: 'Sin registrar', fill: 'var(--color-muted-foreground)' },
};

export function PaymentMethodDonut({
  range,
  className,
}: {
  range: PeriodRange;
  className?: string;
}) {
  const { data, isLoading, isError } = useGetSalesBreakdownQuery(range);

  const methodsData = useMemo(() => {
    const raw = data?.by_method || [];
    const totalSum = raw.reduce((s, g) => s + g.total, 0);

    return raw
      .map((g) => {
        const conf = METHOD_CONFIG[g.key] || { label: g.key, fill: 'var(--color-muted-foreground)' };
        const pct = totalSum > 0 ? (g.total / totalSum) * 100 : 0;
        return {
          key: g.key,
          label: conf.label,
          value: g.total,
          count: g.count,
          percentage: pct,
          fill: conf.fill,
        };
      })
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const totalAmount = useMemo(
    () => methodsData.reduce((s, m) => s + m.value, 0),
    [methodsData],
  );

  return (
    <SpotlightCard variant="default" className={className}>
      <div className="mb-4 flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <HugeIcon icon={CreditCardIcon} size={18} strokeWidth={2} className="text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Métodos de pago <span className="font-normal text-muted-foreground">(ventas facturadas)</span></h4>
        </div>
        <span className="nums text-xs font-medium text-muted-foreground">
          {formatCordobas(totalAmount, 'C$', 0)}
        </span>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={methodsData.length === 0}
        emptyFallback={
          <p className="py-12 text-center text-xs text-muted-foreground">
            No hay registros de cobros en este periodo.
          </p>
        }
        loadingFallback={<div className="h-56 animate-pulse rounded-card bg-muted" />}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Donut Chart */}
          <div className="relative mx-auto w-48 shrink-0">
            <ChartContainer
              config={paymentMethodChartConfig}
              className="mx-auto aspect-square max-h-[190px]"
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
                            {formatCordobas(Number(value), 'C$', 2)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={methodsData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={76}
                  strokeWidth={2}
                  stroke="var(--color-card)"
                >
                  {methodsData.map((slice) => (
                    <Cell key={`cell-${slice.key}`} fill={slice.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            {/* Total al centro del donut */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="nums text-xs font-bold text-foreground">
                {formatCordobas(totalAmount, 'C$', 0)}
              </span>
            </div>
          </div>

          {/* Leyenda con porcentaje y monto */}
          <div className="flex-1 space-y-2.5">
            {methodsData.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 p-2 text-xs transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-2xs text-muted-foreground">
                      {formatNumber(item.count)} {item.count === 1 ? 'venta' : 'ventas'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="nums block font-semibold text-foreground">
                    {formatCordobas(item.value, 'C$', 2)}
                  </span>
                  <span className="nums block text-2xs font-medium text-muted-foreground">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </QueryState>
    </SpotlightCard>
  );
}
