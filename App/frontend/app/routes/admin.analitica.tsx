// Analítica de la tienda (admin): embudo, búsquedas, búsquedas sin resultado y
// productos más vistos de los últimos 30 días.
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { errMsg } from '~/lib/formatters';

import { useGetAnalyticsDashboardQuery } from '~/store/api/analyticsApi';

import { PageHeader } from '~/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { QueryState } from '~/components/ui/QueryState';
import { BrandLoader } from '~/components/ui/module-loader';

export const meta: MetaFunction = () => [{ title: pageTitle('Analítica', { admin: true }) }];

const fmt = (n: number) => Number(n || 0).toLocaleString('es-NI');
const pct = (n: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;

export default function AdminAnalitica() {
  const dashboard = useGetAnalyticsDashboardQuery();
  const o = dashboard.data?.overview;

  const stats = [
    { label: 'Visitantes', value: o ? fmt(o.visitors) : '—' },
    { label: 'Vistas de página', value: o ? fmt(o.pageViews) : '—' },
    { label: 'Búsquedas', value: o ? fmt(o.searches) : '—' },
    { label: 'Vistas de producto', value: o ? fmt(o.productViews) : '—' },
    { label: 'Pedidos', value: o ? fmt(o.orders) : '—' },
    { label: 'Vista → pedido', value: o ? pct(o.viewToOrderRate) : '—' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Análisis y sistema"
        title="Analítica del storefront"
        description="Visitas, búsquedas y conversión de la tienda pública (últimos 30 días)."
      />

      {/* KPIs del embudo */}
      <QueryState
        loading={dashboard.isLoading}
        error={dashboard.isError}
        errorMessage={errMsg(dashboard.error, 'No se pudo cargar la analítica.')}
        onRetry={() => { void dashboard.refetch(); }}
        loadingFallback={<BrandLoader text="Cargando analítica..." />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-heading text-2xl font-extrabold tabular-nums text-foreground">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </QueryState>

      {/* Embudo por sesión */}
      {o && (
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg">Embudo</CardTitle>
            <CardDescription>Sesiones únicas que alcanzaron cada paso.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-2">
              {o.funnel.map((f) => {
                const top = o.funnel[0]?.sessions || 0;
                const width = top > 0 ? Math.max(2, (f.sessions / top) * 100) : 0;
                return (
                  <div key={f.step} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm text-muted-foreground">{f.step}</span>
                    <div className="h-6 flex-1 overflow-hidden rounded-xl bg-muted">
                      <div
                        className="flex h-full items-center rounded-xl bg-primary px-2 text-xs font-semibold text-primary-foreground"
                        style={{ width: `${width}%` }}
                      >
                        {fmt(f.sessions)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Búsquedas sin resultados — demanda insatisfecha (lo más accionable) */}
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg">Búsquedas sin resultados</CardTitle>
            <CardDescription>Qué busca la gente y no encuentra. Tu lista de compras.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <QueryState
              loading={dashboard.isLoading}
              error={dashboard.isError}
        errorMessage={errMsg(dashboard.error, 'No se pudo cargar la analítica.')}
        onRetry={() => { void dashboard.refetch(); }}
              empty={(dashboard.data?.zero?.length ?? 0) === 0}
              emptyFallback={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin búsquedas fallidas en el período.
                </p>
              }
              loadingFallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}
            >
              <SearchTable rows={dashboard.data?.zero ?? []} highlightZero />
            </QueryState>
          </CardContent>
        </Card>

        {/* Top de búsquedas */}
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg">Búsquedas más frecuentes</CardTitle>
            <CardDescription>Lo que la gente escribe en el buscador.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <QueryState
              loading={dashboard.isLoading}
              error={dashboard.isError}
        errorMessage={errMsg(dashboard.error, 'No se pudo cargar la analítica.')}
        onRetry={() => { void dashboard.refetch(); }}
              empty={(dashboard.data?.searches?.length ?? 0) === 0}
              emptyFallback={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay búsquedas registradas.
                </p>
              }
              loadingFallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}
            >
              <SearchTable rows={dashboard.data?.searches ?? []} />
            </QueryState>
          </CardContent>
        </Card>
      </div>

      {/* Productos más vistos */}
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-lg">Productos más vistos</CardTitle>
          <CardDescription>Qué fichas abre la gente en la tienda.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <QueryState
            loading={dashboard.isLoading}
            error={dashboard.isError}
        errorMessage={errMsg(dashboard.error, 'No se pudo cargar la analítica.')}
        onRetry={() => { void dashboard.refetch(); }}
            empty={(dashboard.data?.products?.length ?? 0) === 0}
            emptyFallback={
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aún no hay vistas de producto registradas.
              </p>
            }
            loadingFallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}
          >
            <div className="divide-y divide-border">
              {(dashboard.data?.products ?? []).map((p, i) => (
                <div key={p.catalogItemId} className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-3 truncate text-sm text-foreground">
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {fmt(p.views)}
                  </span>
                </div>
              ))}
            </div>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function SearchTable({
  rows,
  highlightZero,
}: {
  rows: { query: string; count: number; zeroResultCount: number; avgResults: number }[];
  highlightZero?: boolean;
}) {
  return (
    <Table containerClassName="rounded-none border-0">
      <TableHeader>
        <tr>
          <TableHead>Búsqueda</TableHead>
          <TableHead className="text-right">{highlightZero ? 'Sin resultados' : 'Resultados promedio'}</TableHead>
          <TableHead className="text-right">Veces</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.query}>
            <TableCell className="max-w-0 truncate">{r.query}</TableCell>
            <TableCell className="text-right tabular-nums">
              {highlightZero ? <span className="text-destructive">{r.zeroResultCount}</span> : r.avgResults.toFixed(0)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{r.count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
