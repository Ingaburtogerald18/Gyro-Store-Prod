import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { ChartLineData01Icon } from '@hugeicons/core-free-icons';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '~/components/ui/chart';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSalesTrendQuery } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';

const dailyChartConfig = {
  total_vendido: { label: 'Vendido', color: 'var(--color-chart-1)' },
  ganancia: { label: 'Ganancia tienda', color: 'var(--color-chart-3)' },
} satisfies ChartConfig;

function compactAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 0)}k`;
  return formatNumber(value, 0);
}

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface DailyPoint {
  day: number;
  label: string;
  dateStr: string;
  total_vendido: number;
  ganancia: number;
  num_ventas: number;
  hasSales: boolean;
}

const DAY_IN_MANAGUA = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Managua', day: 'numeric' });

export function SalesDailyTrendChart({
  range,
  year,
  month,
  sellerUid,
  showGanancia = true,
  title = 'Tendencia diaria del mes',
}: {
  range: PeriodRange;
  year: number;
  month: number;
  sellerUid?: string;
  showGanancia?: boolean;
  title?: string;
}) {
  const { data = [], isLoading, isError } = useGetSalesTrendQuery({
    ...range,
    bucket: 'day',
    sellerUid,
  });

  // Genera todos los días del mes (1..28/30/31) y cruza con los datos del backend
  const dailyPoints = useMemo<DailyPoint[]>(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Indexar datos existentes por número de día local
    const dataByDay = new Map<number, { total_vendido: number; ganancia: number; num_ventas: number }>();
    for (const p of data) {
      // bucket_start es la medianoche de Nicaragua en UTC (…T06:00Z): el día se
      // lee en esa zona, no en UTC ni en la del navegador.
      const dayNum = Number(DAY_IN_MANAGUA.format(new Date(p.bucket_start)));
      dataByDay.set(dayNum, {
        total_vendido: p.total_vendido,
        ganancia: p.ganancia ?? 0,
        num_ventas: Number(p.num_ventas) || 0,
      });
    }

    const points: DailyPoint[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const entry = dataByDay.get(day);
      const hasSales = Boolean(entry && entry.num_ventas > 0);
      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.toLocaleDateString('es-NI', { weekday: 'short' });

      points.push({
        day,
        label: `${day}`,
        dateStr: `${dayOfWeek} ${day} ${MONTH_NAMES_ES[month]}`,
        total_vendido: entry ? entry.total_vendido : 0,
        ganancia: entry ? entry.ganancia : 0,
        num_ventas: entry ? entry.num_ventas : 0,
        hasSales,
      });
    }

    return points;
  }, [data, year, month]);

  const daysWithoutSalesCount = useMemo(
    () => dailyPoints.filter((p) => !p.hasSales).length,
    [dailyPoints],
  );

  const totalSoldInMonth = useMemo(
    () => dailyPoints.reduce((s, p) => s + p.total_vendido, 0),
    [dailyPoints],
  );

  return (
    <SpotlightCard variant="default" className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <div className="flex items-center gap-2">
          <HugeIcon icon={ChartLineData01Icon} size={20} strokeWidth={2} className="text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {MONTH_NAMES_ES[month]} {year} • {dailyPoints.length} días
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-primary" />
            <span>Vendido: <strong className="font-medium text-foreground">{formatCordobas(totalSoldInMonth, 'C$', 2)}</strong></span>
          </div>
          {daysWithoutSalesCount > 0 && (
            <span className="rounded-md border border-border/80 bg-muted/50 px-2 py-0.5 text-muted-foreground">
              {daysWithoutSalesCount} {daysWithoutSalesCount === 1 ? 'día' : 'días'} sin ventas
            </span>
          )}
        </div>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        loadingFallback={<div className="h-72 animate-pulse rounded-card bg-muted" />}
      >
        <ChartContainer config={dailyChartConfig} className="aspect-auto h-72 w-full">
          <ComposedChart data={dailyPoints} margin={{ left: 8, right: 12, top: 12, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={54}
              tickFormatter={compactAxis}
              fontSize={11}
            />

            {/* Custom Tooltip */}
            <TooltipContent />

            <ChartLegend content={<ChartLegendContent />} />

            {/* Barras con colores que diferencian días con ventas vs sin ventas */}
            <Bar
              dataKey="total_vendido"
              fill="var(--color-total_vendido)"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            >
              {dailyPoints.map((entry) => (
                <Cell
                  key={`cell-${entry.day}`}
                  fill={
                    entry.hasSales
                      ? 'var(--color-chart-1)'
                      : 'rgba(255, 255, 255, 0.05)'
                  }
                  stroke={entry.hasSales ? 'none' : 'rgba(255, 255, 255, 0.12)'}
                  strokeDasharray={entry.hasSales ? undefined : '2 2'}
                />
              ))}
            </Bar>

            {/* Línea de ganancia superpuesta */}
            {showGanancia && (
              <Line
                type="monotone"
                dataKey="ganancia"
                stroke="var(--color-ganancia)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 1 }}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </QueryState>
    </SpotlightCard>
  );
}

// Tooltip con información completa requerida: fecha, total vendido, ganancia, transacciones
function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: any[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const data: DailyPoint = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="z-50 min-w-[200px] rounded-card border border-border/80 bg-popover/95 p-3 text-xs text-popover-foreground shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between border-b border-border/60 pb-1.5 font-medium">
        <span className="capitalize text-foreground font-semibold">{data.dateStr}</span>
        {data.hasSales ? (
          <span className="nums rounded-sm bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary">
            Día {data.day}
          </span>
        ) : (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
            Sin ventas
          </span>
        )}
      </div>

      {data.hasSales ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-[var(--color-chart-1)]" />
              Total vendido:
            </span>
            <span className="nums font-semibold text-foreground">
              {formatCordobas(data.total_vendido, 'C$', 2)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-[var(--color-chart-3)]" />
              Ganancia tienda:
            </span>
            <span className="nums font-semibold text-success">
              {formatCordobas(data.ganancia, 'C$', 2)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-1 text-muted-foreground">
            <span>Transacciones:</span>
            <span className="nums font-medium text-foreground">
              {data.num_ventas} {data.num_ventas === 1 ? 'venta' : 'ventas'}
            </span>
          </div>
        </div>
      ) : (
        <p className="py-1 text-center text-muted-foreground">
          No se registraron ventas en esta fecha.
        </p>
      )}
    </div>
  );
}
