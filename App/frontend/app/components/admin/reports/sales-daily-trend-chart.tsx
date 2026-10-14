import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ChartLineData01Icon } from '@hugeicons/core-free-icons';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/query-state';
import { ChartContainer, ChartTooltip, type ChartConfig } from '~/components/ui/chart';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSalesTrendQuery } from '~/state/api/reports-api';
import type { PeriodRange } from './period';

// Vendido y ganancia en bordó: barras suaves para lo vendido, línea llena para la ganancia.
const dailyChartConfig = {
  total_vendido: { label: 'Vendido', color: 'var(--color-primary-2)' },
  ganancia: { label: 'Ganancia tienda', color: 'var(--color-primary-2)' },
} satisfies ChartConfig;

function compactAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 0)}k`;
  return formatNumber(value, 0);
}

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
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
const fmt = (n: number) => formatCordobas(n, 'C$', 2);

export function SalesDailyTrendChart({
  range,
  year,
  month,
  sellerUid,
  showGanancia = true,
  title = 'Ventas por día',
}: {
  range: PeriodRange;
  year: number;
  month: number;
  sellerUid?: string;
  showGanancia?: boolean;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const { data = [], isLoading, isError } = useGetSalesTrendQuery({
    ...range,
    bucket: 'day',
    sellerUid,
  });

  // Todos los días del mes (1..28/30/31), con o sin ventas.
  const dailyPoints = useMemo<DailyPoint[]>(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();

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
      const dayOfWeek = new Date(year, month, day).toLocaleDateString('es-NI', { weekday: 'long' });
      points.push({
        day,
        label: `${day}`,
        dateStr: `${dayOfWeek} ${day} de ${MONTH_NAMES_ES[month]}`,
        total_vendido: entry?.total_vendido ?? 0,
        ganancia: entry?.ganancia ?? 0,
        num_ventas: entry?.num_ventas ?? 0,
        hasSales: Boolean(entry && entry.num_ventas > 0),
      });
    }
    return points;
  }, [data, year, month]);

  const stats = useMemo(() => {
    const conVentas = dailyPoints.filter((p) => p.hasSales);
    const total = conVentas.reduce((s, p) => s + p.total_vendido, 0);
    const mejor = conVentas.reduce<DailyPoint | null>((b, p) => (!b || p.total_vendido > b.total_vendido ? p : b), null);
    return {
      total,
      diasConVentas: conVentas.length,
      diasSinVentas: dailyPoints.length - conVentas.length,
      promedio: conVentas.length > 0 ? total / conVentas.length : 0,
      mejor,
    };
  }, [dailyPoints]);

  return (
    <SpotlightCard variant="default" className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2">
          <HugeIcon icon={ChartLineData01Icon} size={20} strokeWidth={2} className="text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {stats.diasConVentas} de {dailyPoints.length} días con ventas
              {stats.mejor && (
                <>
                  {' · '}mejor día: el {stats.mejor.day} con <span className="nums font-medium text-foreground">{fmt(stats.mejor.total_vendido)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-primary-2/45" />
            <dt>Vendido</dt>
            <dd className="nums font-display font-semibold text-foreground">{fmt(stats.total)}</dd>
          </div>
          {showGanancia && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded-full bg-primary-2" />
              <dt>Ganancia tienda</dt>
            </div>
          )}
          {stats.promedio > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="inline-block w-3 border-t border-dashed border-muted-foreground" />
              <dt>Promedio por día con ventas</dt>
              <dd className="nums font-medium text-foreground">{fmt(stats.promedio)}</dd>
            </div>
          )}
        </dl>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        loadingFallback={<div className="h-72 animate-pulse rounded-2xl bg-muted" />}
      >
        <ChartContainer config={dailyChartConfig} className="aspect-auto h-72 w-full">
          <ComposedChart key={`${year}-${month}`} data={dailyPoints} margin={{ left: 8, right: 12, top: 12, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={6} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} width={54} tickFormatter={compactAxis} fontSize={11} />

            <ChartTooltip cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }} content={<DayTooltip showGanancia={showGanancia} />} />

            {stats.promedio > 0 && (
              <ReferenceLine y={stats.promedio} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.7} />
            )}

            <Bar
              dataKey="total_vendido"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={!reduce}
              animationDuration={500}
            >
              {dailyPoints.map((entry) => (
                <Cell
                  key={`cell-${entry.day}`}
                  fill="var(--color-primary-2)"
                  fillOpacity={entry.hasSales ? 0.45 : 0}
                />
              ))}
            </Bar>

            {showGanancia && (
              <Line
                type="monotone"
                dataKey="ganancia"
                stroke="var(--color-primary-2)"
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-primary-2)' }}
                isAnimationActive={!reduce}
                animationDuration={700}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </QueryState>
    </SpotlightCard>
  );
}

/** El día completo: vendido, ganancia, número de ventas, ticket y margen. */
function DayTooltip({
  active,
  payload,
  showGanancia,
}: {
  active?: boolean;
  payload?: { payload?: DailyPoint }[];
  showGanancia?: boolean;
}) {
  const data = active ? payload?.[0]?.payload : undefined;
  if (!data) return null;

  const ticket = data.num_ventas > 0 ? data.total_vendido / data.num_ventas : 0;
  const margen = data.total_vendido > 0 ? (data.ganancia / data.total_vendido) * 100 : 0;

  return (
    <div className="min-w-[220px] rounded-2xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="mb-2 border-b border-border pb-1.5 font-semibold first-letter:uppercase">{data.dateStr}</p>
      {data.hasSales ? (
        <dl className="space-y-1">
          <Row label="Vendido" value={fmt(data.total_vendido)} strong />
          {showGanancia && <Row label="Ganancia tienda" value={`${fmt(data.ganancia)} · ${margen.toLocaleString('es-NI', { maximumFractionDigits: 1 })}%`} />}
          <Row label="Ventas" value={`${data.num_ventas} ${data.num_ventas === 1 ? 'venta' : 'ventas'}`} />
          <Row label="Ticket promedio" value={fmt(ticket)} />
        </dl>
      ) : (
        <p className="text-muted-foreground">Sin ventas este día.</p>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'nums font-display font-semibold text-foreground' : 'nums font-medium text-foreground'}>{value}</dd>
    </div>
  );
}
