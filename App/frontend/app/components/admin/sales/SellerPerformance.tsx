// "Mi desempeño": lo que un VENDEDOR ve de sus propias ventas, dentro de
// /admin/ventas (el Dashboard no está en su nav).
//
// Lo que se muestra es lo suyo y nada más: cuánto vendió, cuántas unidades y
// cuánta comisión generó. NO hay coste, ganancia de tienda, pozos, ranking ni
// delivery — y eso no depende de este archivo: el backend recorta esos campos
// antes de mandarlos y fuerza el `sellerUid` al del token (ver
// server/routes/reports.ts). Acá simplemente no se piden.
import { HugeIcon } from '~/components/ui/icon';
import { DollarSquareIcon, PercentIcon, ShoppingCart02Icon, Analytics01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';

import { StatCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import { PeriodPicker } from '~/components/admin/reports/PeriodPicker';
import { SalesTrendChart } from '~/components/admin/reports/SalesTrendChart';
import { TopProductsTable } from '~/components/admin/reports/TopProductsTable';
import { getPeriodRange, isPeriodReady, type CustomRange, type PeriodId } from '~/components/admin/reports/period';
import { formatCordobas } from '~/lib/formatters';
import { useGetKpisQuery } from '~/store/api/reportsApi';

export function SellerPerformance() {
  const [period, setPeriod] = useState<PeriodId>('month');
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });

  const range = useMemo(() => getPeriodRange(period, custom), [period, custom]);
  // Sin las dos fechas del rango libre no hay filtro: el backend devolvería
  // todo el histórico como si fuera el periodo elegido.
  const periodReady = isPeriodReady(range);
  const { data: kpis, isLoading, isError } = useGetKpisQuery(range, { skip: !periodReady });

  const formatMoney = (n: number) => formatCordobas(n, 'C$', 2);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <HugeIcon icon={Analytics01Icon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="text-lg font-bold text-foreground">Mi desempeño</h3>
        </div>
        <PeriodPicker
          period={period}
          onPeriodChange={setPeriod}
          custom={custom}
          onCustomChange={setCustom}
          layoutId="seller-performance-range"
        />
      </div>

      {!periodReady ? (
        <div className="rounded-card border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Elegí la fecha de inicio y la de fin para ver tu desempeño.
          </p>
        </div>
      ) : (
      <QueryState
        loading={isLoading}
        error={isError}
        empty={!kpis}
        loadingFallback={
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-32 animate-pulse rounded-card bg-muted" />
            <div className="h-32 animate-pulse rounded-card bg-muted" />
            <div className="h-32 animate-pulse rounded-card bg-muted" />
          </div>
        }
      >
        {kpis && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                icon={ShoppingCart02Icon}
                label="Mis ventas"
                countTo={kpis.total_ventas}
                sub={`${kpis.total_unidades} unidades`}
                color="indigo"
                delay={0}
              />
              <StatCard
                icon={DollarSquareIcon}
                label="Vendido"
                countTo={kpis.total_vendido}
                format={formatMoney}
                color="emerald"
                delay={0.05}
              />
              <StatCard
                icon={PercentIcon}
                label="Mi comisión"
                countTo={kpis.comision_total}
                format={formatMoney}
                color="purple"
                delay={0.1}
              />
            </div>

            {/* `showGanancia={false}`: la ganancia de tienda ni siquiera llega
                en la respuesta, así que dibujar la serie mostraría una línea
                plana en cero. */}
            <SalesTrendChart range={range} showGanancia={false} title="Mi tendencia" />

            <TopProductsTable range={range} limit={5} title="Lo que más vendí" />
          </div>
        )}
      </QueryState>
      )}
    </section>
  );
}
