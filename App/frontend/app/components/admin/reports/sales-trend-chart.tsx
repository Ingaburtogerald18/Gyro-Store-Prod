// Tendencia de ventas del periodo. Las barras son el VOLUMEN vendido y las
// líneas los márgenes (comisión y, si quien mira es admin, ganancia de tienda):
// mezclarlos en barras agrupadas vuelve ilegible cualquier rango largo, porque
// tres barras por bucket × 30 buckets no entran en el ancho de una tarjeta.
import { HugeIcon } from '~/components/ui/icon';
import { ChartLineData01Icon } from '@hugeicons/core-free-icons';
import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/query-state';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '~/components/ui/chart';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSalesTrendQuery, type TrendBucket } from '~/state/api/reports-api';
import { formatBucketLabel, pickBucket, type PeriodRange } from './period';

const trendChartConfig = {
  total_vendido: { label: 'Vendido', color: 'var(--color-chart-1)' },
  ganancia: { label: 'Ganancia tienda', color: 'var(--color-chart-4)' },
  comision: { label: 'Comisión', color: 'var(--color-chart-2)' },
} satisfies ChartConfig;

const BUCKET_LABEL: Record<TrendBucket, string> = {
  day: 'por día',
  week: 'por semana',
  month: 'por mes',
};

/** Eje Y compacto: "C$120,000" repetido seis veces come todo el ancho útil. */
function compactAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 0)}k`;
  return formatNumber(value, 0);
}

export function SalesTrendChart({
  range,
  sellerUid,
  /** Si es false no se pide ni se dibuja la ganancia de tienda (vista vendedor). */
  showGanancia = true,
  title = 'Tendencia de ventas',
}: {
  range: PeriodRange;
  sellerUid?: string;
  showGanancia?: boolean;
  title?: string;
}) {
  const bucket = pickBucket(range);
  const { data = [], isLoading, isError } = useGetSalesTrendQuery({ ...range, bucket, sellerUid });

  const points = useMemo(
    () =>
      data.map((p) => ({
        ...p,
        label: formatBucketLabel(p.bucket_start, bucket),
      })),
    [data, bucket],
  );

  return (
    <SpotlightCard variant="default" className="p-5">
      {/* `border-b` solo. `border` a secas pone 1px en los CUATRO lados, así que
          `border-b border` dibujaba una caja completa en vez de un subrayado. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <div className="flex items-center gap-2">
          <HugeIcon icon={ChartLineData01Icon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{BUCKET_LABEL[bucket]}</span>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={points.length === 0}
        emptyFallback={
          <p className="py-16 text-center text-sm text-muted-foreground">
            No hay ventas en este periodo.
          </p>
        }
        loadingFallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}
      >
        <ChartContainer config={trendChartConfig} className="aspect-auto h-64 w-full">
          <ComposedChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={compactAxis}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {trendChartConfig[name as keyof typeof trendChartConfig]?.label ?? name}
                      </span>
                      <span className="nums font-medium text-foreground">
                        {formatCordobas(Number(value), 'C$', 2)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="total_vendido" fill="var(--color-total_vendido)" radius={[4, 4, 0, 0]} />
            {showGanancia && (
              <Line
                type="monotone"
                dataKey="ganancia"
                stroke="var(--color-ganancia)"
                strokeWidth={2}
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="comision"
              stroke="var(--color-comision)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </QueryState>
    </SpotlightCard>
  );
}
