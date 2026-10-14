import {
  DollarSquareIcon,
  PercentIcon,
  PlusSignSquareIcon,
  ShoppingCart02Icon,
  Invoice02Icon,
  ChartLineData01Icon,
} from '@hugeicons/core-free-icons';
import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { QueryState } from '~/components/ui/query-state';
import { BrandLoader } from '~/components/ui/module-loader';

import type { MetaFunction } from '@remix-run/node';
import {
  useGetKpisQuery,
  useGetSellerPerformanceQuery,
  useGetSalesLedgerQuery,
  useGetSalesTrendQuery,
  useGetDeliverySummaryQuery,
  useGetExpensesOverflowQuery,
} from '~/state/api/reports-api';
import { useAppSelector } from '~/state/hooks';
import { selectIsAdmin } from '~/state/slices/auth-slice';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { pageTitle } from '~/lib/brand';
import { HugeIcon } from '~/components/ui/icon';

import { PageHeader } from '~/components/admin/page-header';
import { SectionLabel } from '~/components/admin/section-label';
import { CompactKpi, HeroMetric } from '~/components/admin/reports/hero-metric';
import { TopProductsTable } from '~/components/admin/reports/top-products-table';
import { SalesBreakdownCards } from '~/components/admin/reports/sales-breakdown-cards';
import { ExportSalesCsvButton } from '~/components/admin/reports/export-sales-csv-button';
import { PozoFlowBars } from '~/components/admin/expenses/pozo-flow-bars';
import { IncomeWaterfall, type WaterfallInput } from '~/components/admin/reports/income-waterfall';
import { DashboardDrilldowns, type DrilldownType } from '~/components/admin/reports/dashboard-drilldowns';
import { MonthSelector, getMonthRange, type MonthYear } from '~/components/admin/reports/month-selector';
import { SalesDailyTrendChart } from '~/components/admin/reports/sales-daily-trend-chart';
import { SellerRankingTable } from '~/components/admin/reports/seller-ranking-table';
import { Tabs, TabsContent } from '~/components/ui/tabs';
import { SegmentedControl } from '~/components/admin/workspace';
import { ExpensesTab } from '~/components/admin/expenses/expenses-tab';

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
  const reduce = useReducedMotion();

  // Cascada "de lo vendido a la ganancia real". costo + comisión + salario +
  // ganancia bruta = total vendido; la ganancia real sale del motor de pozos.
  const waterfall = useMemo<WaterfallInput | null>(() => {
    if (!kpis || kpis.coste_total === undefined) return null;
    const gananciaBruta = kpis.ganancia_tienda_total ?? 0;
    return {
      totalVendido: kpis.total_vendido,
      coste: kpis.coste_total,
      retencionPozos: Object.values(kpis.pozos_recogidos ?? {}).reduce((acc, v) => acc + (v || 0), 0),
      comision: kpis.comision_total,
      salario: kpis.salary_acumulado ?? 0,
      gananciaBruta,
      gastosDeGanancia: kpis.gastos_de_ganancia ?? 0,
      prestamosDeGanancia: kpis.prestamos_de_ganancia ?? 0,
      gananciaReal: kpis.ganancia_real ?? gananciaBruta,
    };
  }, [kpis]);

  // Libro de pozos del mes (mismo dato que la pestaña Gastos).
  const { data: pozoLedger, isLoading: pozoLedgerLoading } = useGetExpensesOverflowQuery(queryParams, { skip: !isAdmin });

  // El total vendido no lleva delivery; se muestra aparte bajo el número.
  const { data: delivery } = useGetDeliverySummaryQuery(queryParams, { skip: !isAdmin });

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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Reportería"
        description={isAdmin ? 'Análisis comercial y métricas de desempeño mensual.' : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            {isAdmin && activeTab === 'resumen' && (
              <ExportSalesCsvButton range={queryParams} />
            )}
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'resumen' | 'gastos')}
        className="space-y-5"
      >
        {isAdmin && (
          <SegmentedControl
            label="Vista de la reportería"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "resumen", label: "Ventas y rentabilidad" },
              { value: "gastos", label: "Gastos y presupuesto" },
            ]}
          />
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
              <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
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
                  note={
                    isAdmin && delivery && delivery.num_deliveries > 0 ? (
                      <>
                        Sin delivery. Delivery cobrado aparte:{' '}
                        <span className="nums font-medium text-foreground">{formatMoney(delivery.total_delivery)}</span>{' '}
                        en {delivery.num_deliveries} {delivery.num_deliveries === 1 ? 'envío' : 'envíos'}
                        {delivery.num_anuladas > 0 && ` (${delivery.num_anuladas} de facturas anuladas)`}.
                      </>
                    ) : undefined
                  }
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
                    valueClassName={gananciaReal >= 0 ? 'text-foreground' : 'text-destructive'}
                    sub={isAdmin && (kpis.gastos_de_ganancia ?? 0) > 0 ? 'Después de los gastos que no cubrieron los pozos' : undefined}
                    onClick={() => setDrilldown('ganancia')}
                  />
                </div>
              </div>
            </section>

            {/* 3. De lo vendido a la ganancia real */}
            {isAdmin && waterfall && waterfall.totalVendido > 0 && (
              <section className="space-y-3">
                <SectionLabel>De lo vendido a la ganancia</SectionLabel>
                <IncomeWaterfall data={waterfall} formatMoney={formatMoney} />
              </section>
            )}

            {/* 4. Pozos del mes: herencia, desbordes y bolsa extra */}
            {isAdmin && (
              <section className="space-y-3">
                <SectionLabel>Pozos del mes</SectionLabel>
                <PozoFlowBars ledger={pozoLedger} isLoading={pozoLedgerLoading} />
              </section>
            )}

            {/* 5. Gráfico de Tendencia Diaria del Mes */}
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

            {/* 6. Vendedores y productos */}
            <section className="space-y-3">
              <SectionLabel>{isAdmin ? 'Vendedores y productos' : 'Productos destacados'}</SectionLabel>
              <div className={isAdmin ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : undefined}>
                {isAdmin && <SellerRankingTable range={queryParams} />}
                <TopProductsTable range={queryParams} limit={10} />
              </div>
            </section>

            {/* 7. Cortes de ventas */}
            {isAdmin && (
              <section className="space-y-3">
                <SectionLabel>Cortes de ventas</SectionLabel>
                <SalesBreakdownCards range={queryParams} />
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
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/route-error';
