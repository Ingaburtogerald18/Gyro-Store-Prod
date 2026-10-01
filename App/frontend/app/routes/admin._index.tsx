import {
  DollarSquareIcon,
  PercentIcon,
  PlusSignSquareIcon,
  ShoppingCart02Icon,
  Invoice02Icon,
  ChartLineData01Icon,
  Coins01Icon,
} from '@hugeicons/core-free-icons';
import { useState, useMemo, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { QueryState } from '~/components/ui/QueryState';
import { BrandLoader } from '~/components/ui/module-loader';
import { Button } from '~/components/ui/button';

import type { MetaFunction } from '@remix-run/node';
import {
  useGetKpisQuery,
  useGetSellerPerformanceQuery,
  useGetSalesLedgerQuery,
  useGetSalesTrendQuery,
} from '~/store/api/reportsApi';
import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin } from '~/store/slices/authSlice';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { pageTitle } from '~/lib/brand';
import { HugeIcon } from '~/components/ui/icon';

import { PageHeader } from '~/components/layout/PageHeader';
import { SectionLabel } from '~/components/layout/SectionLabel';
import { CompactKpi, HeroMetric } from '~/components/admin/reports/HeroMetric';
import { TopProductsTable } from '~/components/admin/reports/TopProductsTable';
import { SalesBreakdownCards } from '~/components/admin/reports/SalesBreakdownCards';
import { ExportSalesCsvButton } from '~/components/admin/reports/ExportSalesCsvButton';
import { CostDistributionCard } from '~/components/admin/reports/CostDistributionCard';
import { IncomeBreakdownCard, type IncomeSlice } from '~/components/admin/reports/IncomeBreakdownCard';
import { DashboardDrilldowns, type DrilldownType } from '~/components/admin/reports/DashboardDrilldowns';
import { RegisterLoanPaymentDialog } from '~/components/admin/reports/RegisterLoanPaymentDialog';
import { MonthSelector, getMonthRange, type MonthYear } from '~/components/admin/reports/MonthSelector';
import { SalesDailyTrendChart } from '~/components/admin/reports/SalesDailyTrendChart';
import { PaymentMethodDonut } from '~/components/admin/reports/PaymentMethodDonut';
import { SellerRankingTable } from '~/components/admin/reports/SellerRankingTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ExpensesTab } from '~/components/admin/expenses/ExpensesTab';

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Reportería', { admin: true }) }];
};

export default function AdminDashboard() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<MonthYear>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const queryParams = useMemo(
    () => getMonthRange(selectedMonth.year, selectedMonth.month),
    [selectedMonth],
  );

  const isAdmin = useAppSelector(selectIsAdmin);

  // Consulta de KPIs agregados del mes seleccionado
  const { data: kpis, isLoading, isError } = useGetKpisQuery(queryParams);

  // ── Drilldown state ──
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);

  // Sales ledger se carga solo cuando un pop-up lo necesita
  const needsLedger =
    drilldown === 'vendido' ||
    drilldown === 'coste' ||
    drilldown === 'ganancia' ||
    drilldown === 'ventas' ||
    drilldown === 'ticket_promedio';

  const { data: ledger = [] } = useGetSalesLedgerQuery(queryParams, {
    skip: !needsLedger,
  });

  // Seller performance se carga para el drilldown de comisiones
  const { data: sellers = [] } = useGetSellerPerformanceQuery(queryParams, {
    skip: drilldown !== 'comisiones',
  });

  const formatMoney = (n: number) => formatCordobas(n, 'C$', 2);

  // Animación de barras de pozos
  const reduce = useReducedMotion();
  const [barsReady, setBarsReady] = useState(false);

  const pozosKey = kpis
    ? Object.values(kpis.pozos_recogidos || {}).reduce((s, v) => s + (v || 0), 0)
    : 0;

  useEffect(() => {
    if (reduce) {
      setBarsReady(true);
      return;
    }
    setBarsReady(false);
    const id = requestAnimationFrame(() => setBarsReady(true));
    return () => cancelAnimationFrame(id);
  }, [reduce, pozosKey]);

  // Desglose de ingresos para el donut financiero
  const incomeBreakdown = useMemo<IncomeSlice[]>(() => {
    if (!kpis) return [];
    return [
      {
        key: 'coste',
        label: 'Costo de productos',
        value: kpis.coste_total ?? 0,
        fill: 'var(--color-chart-1)',
      },
      {
        key: 'comision',
        label: 'Comisiones',
        value: kpis.comision_total,
        fill: 'var(--color-chart-2)',
      },
      ...(kpis.salary_acumulado
        ? [
            {
              key: 'salary',
              label: 'Fondo salario',
              value: kpis.salary_acumulado,
              fill: 'var(--color-chart-3)',
            },
          ]
        : []),
      // costo + comisión + salario + ganancia tienda = total vendido. La parte de
      // los préstamos que cubre el pozo Préstamos ya está dentro del costo; acá
      // solo va la que sale de la ganancia. Antes se sumaba el pago completo
      // además de la ganancia y el donut pasaba del total (agosto: 74,126.40
      // contra 72,010).
      ...(kpis.prestamos_de_ganancia
        ? [
            {
              key: 'prestamos',
              label: 'Préstamos pagados con ganancia',
              value: Math.min(kpis.prestamos_de_ganancia, Math.max(0, kpis.ganancia_tienda_total ?? 0)),
              fill: 'var(--color-chart-5)',
              note: kpis.prestamos_cubierto_por_budget
                ? `Otros ${formatMoney(kpis.prestamos_cubierto_por_budget)} salieron del pozo Préstamos`
                : undefined,
            },
          ]
        : []),
      {
        key: 'ganancia',
        label: 'Ganancia real',
        // Puede ser negativa: se muestra así en la leyenda (sin porción).
        value: kpis.ganancia_real ?? kpis.ganancia_tienda_total ?? 0,
        fill: 'var(--color-chart-4)',
      },
    ].filter((slice) => slice.value !== 0);
  }, [kpis]);

  // Sparkline para la tarjeta hero (Total Vendido)
  const { data: trend = [] } = useGetSalesTrendQuery(
    { ...queryParams, bucket: 'day', sellerUid: undefined },
    { skip: !isAdmin },
  );

  const heroSeries = useMemo(
    () => trend.map((p) => ({ value: p.total_vendido })),
    [trend],
  );

  // Métricas calculadas para tarjetas secundarias
  const ticketPromedio = useMemo(() => {
    if (!kpis || kpis.total_ventas === 0) return 0;
    return kpis.total_vendido / kpis.total_ventas;
  }, [kpis]);

  const ticketPromedioPrev = useMemo(() => {
    if (!kpis || !kpis.total_ventas_prev || kpis.total_ventas_prev === 0) return undefined;
    return (kpis.total_vendido_prev ?? 0) / kpis.total_ventas_prev;
  }, [kpis]);

  const gananciaReal = useMemo(() => {
    if (!kpis) return 0;
    if (kpis.ganancia_real !== undefined) return kpis.ganancia_real;

    const totalLoans = kpis.total_prestamos ?? 0;
    const budgetDisponible = Math.max(0, kpis.budget_prestamos_disponible ?? (kpis.pozos_recogidos?.prestamos ?? 0));
    const cubierto = Math.min(totalLoans, budgetDisponible);
    const excedente = Math.max(0, totalLoans - cubierto);

    if (kpis.ganancia_tienda_total !== undefined) {
      return kpis.ganancia_tienda_total - excedente;
    }
    return kpis.total_vendido - (kpis.coste_total ?? 0) - kpis.comision_total - excedente;
  }, [kpis]);

  const monthKey = `${selectedMonth.year}-${selectedMonth.month}`;

  const isMonthEmpty = kpis && kpis.total_ventas === 0 && kpis.total_vendido === 0;

  const [activeTab, setActiveTab] = useState<'resumen' | 'gastos'>('resumen');

  const monthLabel = useMemo(() => {
    const d = new Date(selectedMonth.year, selectedMonth.month, 1);
    const name = d.toLocaleDateString('es-NI', { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${selectedMonth.year}`;
  }, [selectedMonth]);

  return (
    <>
      {/* 1. Header con Título, Selector de Mes y Botón Exportar CSV */}
      <PageHeader
        eyebrow="Operación"
        title="Reportería"
        description={isAdmin ? 'Análisis comercial y métricas de desempeño mensual.' : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            {isAdmin && activeTab === 'resumen' && (
              <>
                <RegisterLoanPaymentDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 rounded-md text-xs"
                    >
                      <HugeIcon icon={Coins01Icon} size={15} strokeWidth={2} />
                      Pagar préstamo
                    </Button>
                  }
                  defaultDate={queryParams.startDate?.slice(0, 10)}
                />
                <ExportSalesCsvButton range={queryParams} />
              </>
            )}
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'resumen' | 'gastos')}
        className="space-y-6"
      >
        {isAdmin && (
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <TabsList className="bg-muted/80 p-1">
              <TabsTrigger value="resumen" className="gap-2 px-4 py-1.5 text-xs font-medium">
                <HugeIcon icon={ChartLineData01Icon} size={15} />
                Ventas y rentabilidad
              </TabsTrigger>
              <TabsTrigger value="gastos" className="gap-2 px-4 py-1.5 text-xs font-medium">
                <HugeIcon icon={DollarSquareIcon} size={15} />
                Gastos y presupuesto
              </TabsTrigger>
            </TabsList>
          </div>
        )}

        <TabsContent value="resumen" className="mt-0 focus-visible:outline-none">
            <QueryState
              loading={isLoading}
              error={isError}
              empty={!kpis}
              loadingFallback={<BrandLoader text="Cargando reportería del mes..." />}
            >
        {kpis && (
          <motion.div
            key={monthKey}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-8"
          >
            {/* Si el mes está totalmente vacío, mostrar un banner informativo pero permitir explorar */}
            {isMonthEmpty && (
              <div className="rounded-card border border-dashed border-border/80 bg-card/40 p-8 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                  <HugeIcon icon={ChartLineData01Icon} size={22} strokeWidth={1.8} />
                </div>
                <h3 className="font-heading text-base font-semibold text-foreground">
                  Sin transacciones en este mes
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  No se registraron ventas aprobadas en el mes elegido. Podés ver otros meses con el
                  selector del encabezado.
                </p>
              </div>
            )}

            {/* 2. KPIs Principales (Hero + 4 Tarjetas secundarias) */}
            <section className="space-y-4">
              <SectionLabel>Métricas del mes</SectionLabel>
              <div className="space-y-4">
                {/* Fila principal: Hero Total Vendido */}
                <HeroMetric
                  icon={DollarSquareIcon}
                  eyebrow="Total vendido"
                  value={kpis.total_vendido}
                  prev={kpis.total_vendido_prev}
                  format={formatMoney}
                  series={heroSeries}
                  onClick={() => setDrilldown('vendido')}
                />

                {/* Fila secundaria: 4 Tarjetas */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Número de Ventas */}
                  <CompactKpi
                    icon={ShoppingCart02Icon}
                    label="Número de ventas"
                    value={kpis.total_ventas}
                    prev={kpis.total_ventas_prev}
                    sub={`${formatNumber(kpis.total_unidades)} unidades`}
                    onClick={() => setDrilldown('ventas')}
                  />

                  {/* Ticket Promedio */}
                  <CompactKpi
                    icon={Invoice02Icon}
                    label="Ticket promedio"
                    value={ticketPromedio}
                    prev={ticketPromedioPrev}
                    format={formatMoney}
                    onClick={() => setDrilldown('ticket_promedio')}
                  />

                  {/* Comisiones Pagadas */}
                  <CompactKpi
                    icon={PercentIcon}
                    label="Comisiones pagadas"
                    value={kpis.comision_total}
                    prev={kpis.comision_total_prev}
                    format={formatMoney}
                    onClick={() => setDrilldown('comisiones')}
                  />

                  {/* Ganancia Neta / Real */}
                  <CompactKpi
                    icon={PlusSignSquareIcon}
                    label="Ganancia neta"
                    value={gananciaReal}
                    prev={kpis.ganancia_real_prev ?? kpis.ganancia_tienda_total_prev}
                    format={formatMoney}
                    valueClassName={gananciaReal >= 0 ? 'text-success' : 'text-destructive'}
                    sub={isAdmin && (kpis.total_prestamos ?? 0) > 0 ? 'Después de préstamos' : undefined}
                    onClick={() => setDrilldown('ganancia')}
                  />
                </div>
              </div>
            </section>

            {/* 3. Gráfico de Tendencia Diaria del Mes */}
            {isAdmin && (
              <section className="space-y-3">
                <SectionLabel>Evolución diaria</SectionLabel>
                <SalesDailyTrendChart
                  range={queryParams}
                  year={selectedMonth.year}
                  month={selectedMonth.month}
                  showGanancia={isAdmin}
                />
              </section>
            )}

            {/* 4. Ventas por método de pago + Ventas por vendedor (lado a lado en desktop) */}
            {isAdmin && (
              <section className="space-y-3">
                <SectionLabel>Canales y equipo comercial</SectionLabel>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <PaymentMethodDonut
                    range={queryParams}
                    className="p-5 lg:col-span-5"
                  />
                  <SellerRankingTable
                    range={queryParams}
                    className="p-5 lg:col-span-7"
                  />
                </div>
              </section>
            )}

            {/* 5. Top 10 Productos Más Vendidos */}
            <section className="space-y-3">
              <SectionLabel>Productos destacados</SectionLabel>
              <TopProductsTable range={queryParams} limit={10} />
            </section>

            {/* 6. Distribución de Costos (Pozos) */}
            {isAdmin && (
              <section className="space-y-3">
                <SectionLabel>Estructura de costos</SectionLabel>
                <CostDistributionCard
                  kpis={kpis}
                  barsReady={barsReady}
                  formatMoney={formatMoney}
                />
              </section>
            )}

            {/* 7. Desglose Financiero (Donut ingresos + Tarjetas breakdown) */}
            {isAdmin && (
              <section className="space-y-3">
                <SectionLabel>Desglose financiero</SectionLabel>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-4">
                    <IncomeBreakdownCard
                      incomeBreakdown={incomeBreakdown}
                      total={kpis?.total_vendido ?? 0}
                      formatMoney={formatMoney}
                      className="h-full p-5"
                    />
                  </div>
                  <div className="lg:col-span-8">
                    <SalesBreakdownCards
                      range={queryParams}
                      excludeMethod
                      className="grid gap-4 sm:grid-cols-2"
                    />
                  </div>
                </div>
              </section>
            )}
          </motion.div>
        )}
      </QueryState>
    </TabsContent>

    {isAdmin && (
      <TabsContent value="gastos" className="mt-0 focus-visible:outline-none">
        <ExpensesTab queryParams={queryParams} monthLabel={monthLabel} />
      </TabsContent>
    )}
  </Tabs>

  {/* Pop-ups de drilldown de las tarjetas */}
  <DashboardDrilldowns
    drilldown={drilldown}
    onClose={() => setDrilldown(null)}
    ledger={ledger}
    sellers={sellers}
    formatMoney={formatMoney}
    queryParams={queryParams}
    kpis={kpis}
  />
</>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
