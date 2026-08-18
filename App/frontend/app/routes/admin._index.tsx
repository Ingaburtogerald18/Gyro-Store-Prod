import { DollarSquareIcon, Package01Icon, PercentIcon, PlusSignSquareIcon, ShoppingCart02Icon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useState, useMemo, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { QueryState } from '~/components/ui/QueryState';
import { SkeletonChart } from '~/components/ui/skeletons';
import { BrandLoader } from '~/components/ui/module-loader';

import type { MetaFunction } from '@remix-run/node';
import { useGetKpisQuery, useGetSellerPerformanceQuery, useGetSalesLedgerQuery, useGetSalesTrendQuery } from '~/store/api/reportsApi';
import { useGetCuadreQuery } from '~/store/api/cajaApi';
import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin } from '~/store/slices/authSlice';
import { formatCordobas } from '~/lib/formatters';
import { pageTitle } from '~/lib/brand';

// Reportería de ventas. Vive en components/admin/reports/ porque el panel del
// vendedor en /admin/ventas reusa la tendencia y el top de productos.
import { PageHeader } from '~/components/layout/PageHeader';
import { SectionLabel } from '~/components/layout/SectionLabel';
import { CompactKpi, HeroMetric } from '~/components/admin/reports/HeroMetric';
import { PeriodPicker } from '~/components/admin/reports/PeriodPicker';
// recharts es la dependencia más pesada del panel y solo la usa Reportería.
// Con `lazy`, abrir Ventas o Inventario ya no descarga una librería de gráficos
// que esas pantallas no dibujan.
const SalesTrendChart = lazy(() =>
  import('~/components/admin/reports/SalesTrendChart').then((m) => ({ default: m.SalesTrendChart })),
);
import { TopProductsTable } from '~/components/admin/reports/TopProductsTable';
import { SalesBreakdownCards } from '~/components/admin/reports/SalesBreakdownCards';
import { ExportSalesCsvButton } from '~/components/admin/reports/ExportSalesCsvButton';
import { CuadreBanner } from '~/components/admin/reports/CuadreBanner';
import { CostDistributionCard } from '~/components/admin/reports/CostDistributionCard';
import { IncomeBreakdownCard } from '~/components/admin/reports/IncomeBreakdownCard';
import { DashboardDrilldowns, type DrilldownType } from '~/components/admin/reports/DashboardDrilldowns';
import { getPeriodRange, isPeriodReady, pickBucket, type CustomRange, type PeriodId } from '~/components/admin/reports/period';

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Reportería', { admin: true }) }];
};

export default function AdminDashboard() {
  const [range, setRange] = useState<PeriodId>('month');
  // Rango libre: solo se usa cuando `range === 'range'`, pero se conserva al
  // saltar entre presets para no perder lo que el usuario ya había elegido.
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });

  const queryParams = useMemo(() => getPeriodRange(range, custom), [range, custom]);
  // Con el rango libre a medio llenar no hay filtro que mandar: pedirlo igual
  // traería el histórico completo rotulado como "el periodo elegido".
  const periodReady = isPeriodReady(queryParams);

  // La Reportería es de admin, pero la ruta /admin no lo bloquea por rol: si un
  // vendedor entra por URL, el backend ya le recorta los KPIs y acá se ocultan
  // las secciones que no le corresponden. La UI acompaña al backend, no lo suple.
  const isAdmin = useAppSelector(selectIsAdmin);

  const { data: kpis, isLoading, isError } = useGetKpisQuery(queryParams, { skip: !periodReady });

  // Se pide acá además de dentro de `CuadreBanner` solo para saber DÓNDE
  // colocarlo. RTK Query deduplica: es la misma entrada de caché, un request.
  const { data: cuadreForPlacement } = useGetCuadreQuery();
  const bannerOnTop = (cuadreForPlacement?.ventasPendientes ?? 0) > 0;

  // ── Drilldown state ──
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);

  // Sales ledger se carga solo cuando un pop-up lo necesita
  const needsLedger = drilldown === 'vendido' || drilldown === 'coste' || drilldown === 'ganancia';
  const { data: ledger = [] } = useGetSalesLedgerQuery(queryParams, { skip: !needsLedger || !periodReady });

  // Seller performance se carga solo para el pop-up de comisiones
  const { data: sellers = [] } = useGetSellerPerformanceQuery(queryParams, { skip: drilldown !== 'comisiones' || !periodReady });

  const formatMoney = (n: number) => formatCordobas(n, 'C$', 2);

  // Las barras entran desde 0 en el primer frame tras montar, para que se vea
  // el llenado. Si el usuario pidió menos movimiento, van directo al valor.
  const reduce = useReducedMotion();
  const [barsReady, setBarsReady] = useState(false);

  // La dependencia es una CLAVE PRIMITIVA, no el objeto `kpis`.
  //
  // `kpis` es el objeto de RTK Query: cambia de referencia en cada refetch
  // aunque los datos sean idénticos. Dependiendo de él, este efecto reiniciaba
  // la animación de las barras en cada revalidación —las barras volvían a cero
  // y subían de nuevo sin que nada hubiera cambiado—. Con la suma de los pozos,
  // solo se reinicia cuando el reparto cambió de verdad.
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

  // A dónde va cada córdoba vendido. Se descartan los tramos en cero para que
  // el donut no dibuje segmentos invisibles.
  // `?? 0` porque el backend recorta estos campos cuando quien pregunta no es
  // admin (ver routes/reports.ts): sin el fallback el donut recibiría undefined.
  const incomeBreakdown = useMemo(
    () =>
      kpis
        ? [
            { key: 'coste', label: 'Coste', value: kpis.coste_total ?? 0, fill: 'var(--color-chart-1)' },
            { key: 'comision', label: 'Comisiones', value: kpis.comision_total, fill: 'var(--color-chart-2)' },
            { key: 'salary', label: 'Salary', value: kpis.salary_acumulado ?? 0, fill: 'var(--color-chart-3)' },
            { key: 'ganancia', label: 'Ganancia tienda', value: kpis.ganancia_tienda_total ?? 0, fill: 'var(--color-chart-4)' },
          ].filter((slice) => slice.value > 0)
        : [],
    [kpis],
  );

  // Sparkline del héroe.
  //
  // Reusa la serie del gráfico de tendencia en vez de pedir un endpoint nuevo.
  // Los argumentos son EXACTAMENTE los mismos que usa `SalesTrendChart`
  // (`{...range, bucket, sellerUid}`), así que RTK Query reconoce la misma
  // entrada de caché y sale UN solo request, no dos. Si algún día cambian los
  // argumentos de uno de los dos, se duplica el pedido en silencio.
  const { data: trend = [] } = useGetSalesTrendQuery(
    { ...queryParams, bucket: pickBucket(queryParams), sellerUid: undefined },
    { skip: !periodReady || !isAdmin },
  );

  const heroSeries = useMemo(() => trend.map((p) => ({ value: p.total_vendido })), [trend]);

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Reportería"
        description={isAdmin ? 'Ventas del periodo elegido.' : undefined}
        actions={isAdmin ? <ExportSalesCsvButton range={queryParams} /> : undefined}
        // El selector de periodo baja a su propia fila. Apilado a la derecha del
        // título competía con él y en móvil se acomodaba de forma impredecible.
        filters={
          <PeriodPicker
            period={range}
            onPeriodChange={setRange}
            custom={custom}
            onCustomChange={setCustom}
            layoutId="dashboard-range"
          />
        }
      />

      {/* El banner sube arriba del héroe SOLO si hay algo que resolver. El
          espacio caro de la parte superior es para lo que requiere acción; si
          todo está al día, esos números son referencia y van abajo. */}
      {bannerOnTop && (
        <div className="mb-6">
          <CuadreBanner range={queryParams} />
        </div>
      )}

      {!periodReady ? (
        <div className="rounded-card border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Elegí la fecha de inicio y la de fin para ver el reporte del periodo.
          </p>
        </div>
      ) : (
      <QueryState
        loading={isLoading}
        error={isError}
        empty={!kpis}
        loadingFallback={<BrandLoader text="Cargando dashboard..." />}
      >
        {kpis && (
          <div className="space-y-6">
            {/* Un solo elemento domina: Total Vendido a 48 px con su delta y
                su sparkline. El resto pasa a compacto — el peso no se reparte,
                o ninguno gana. */}
            <div className="grid grid-cols-12 gap-4">
              <HeroMetric
                className="col-span-12 lg:col-span-5"
                icon={DollarSquareIcon}
                eyebrow="Total vendido"
                value={kpis.total_vendido}
                prev={kpis.total_vendido_prev}
                format={formatMoney}
                series={heroSeries}
                onClick={() => setDrilldown('vendido')}
              />

              <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
                <CompactKpi
                  icon={ShoppingCart02Icon}
                  label="Ventas"
                  value={kpis.total_ventas}
                  prev={kpis.total_ventas_prev}
                  sub={`${kpis.total_unidades} unidades`}
                  href="/admin/ventas?status=approved"
                />
                <CompactKpi
                  icon={PercentIcon}
                  label="Comisiones"
                  value={kpis.comision_total}
                  prev={kpis.comision_total_prev}
                  format={formatMoney}
                  onClick={() => setDrilldown('comisiones')}
                />
                {isAdmin && (
                  <CompactKpi
                    icon={Package01Icon}
                    label="Coste total"
                    value={kpis.coste_total ?? 0}
                    prev={kpis.coste_total_prev}
                    format={formatMoney}
                    // Subir el coste NO es una buena noticia: sin `invert` el
                    // delta lo pintaría de verde.
                    invert
                    onClick={() => setDrilldown('coste')}
                  />
                )}
                {isAdmin && (
                  <CompactKpi
                    icon={PlusSignSquareIcon}
                    label="Ganancia tienda"
                    value={kpis.ganancia_tienda_total ?? 0}
                    prev={kpis.ganancia_tienda_total_prev}
                    format={formatMoney}
                    onClick={() => setDrilldown('ganancia')}
                  />
                )}
              </div>
            </div>

            {isAdmin && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <CostDistributionCard kpis={kpis} barsReady={barsReady} formatMoney={formatMoney} />
              <IncomeBreakdownCard incomeBreakdown={incomeBreakdown} formatMoney={formatMoney} />
            </div>
            )}

            {/* ── Reportería de ventas del periodo ──
                Todo lo de abajo es admin: son datos del negocio (márgenes de
                todos, top productos), no de una venta propia.
                El vendedor tiene su propio panel en /admin/ventas. */}
            {isAdmin && (
              <div className="space-y-6">
                <Suspense fallback={<SkeletonChart />}>
                  <SalesTrendChart range={queryParams} />
                </Suspense>

                <TopProductsTable range={queryParams} />

                <section className="space-y-3">
                  <SectionLabel>Desglose del periodo</SectionLabel>
                  <SalesBreakdownCards range={queryParams} />
                </section>

                {!bannerOnTop && <CuadreBanner range={queryParams} />}
              </div>
            )}
          </div>
        )}
      </QueryState>
      )}

      {/* ── Pop-ups de drilldown de las StatCards ── */}
      <DashboardDrilldowns
        drilldown={drilldown}
        onClose={() => setDrilldown(null)}
        ledger={ledger}
        sellers={sellers}
        formatMoney={formatMoney}
      />
    </>
  );
}
