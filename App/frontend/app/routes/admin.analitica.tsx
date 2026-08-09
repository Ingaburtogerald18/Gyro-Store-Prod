// Dashboard de analítica del storefront (admin). Lee los agregados de
// /api/analytics/admin/* — embudo, top de búsquedas, búsquedas SIN resultado
// (la lista de compras del negocio) y productos más vistos.
//
// Rango: últimos 30 días (el default del backend). Un selector de rango es una
// mejora natural para una tanda siguiente; por ahora la vista es de una pieza.
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';

import {
  useGetAnalyticsOverviewQuery,
  useGetTopSearchesQuery,
  useGetZeroResultSearchesQuery,
  useGetTopViewedProductsQuery,
} from '~/store/api/analyticsApi';

import { PageHeader } from '~/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { QueryState } from '~/components/ui/QueryState';

export const meta: MetaFunction = () => [{ title: pageTitle('Analítica', { admin: true }) }];

const fmt = (n: number) => Number(n || 0).toLocaleString('es-NI');
const pct = (n: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;

export default function AdminAnalitica() {
  const overview = useGetAnalyticsOverviewQuery();
  const searches = useGetTopSearchesQuery();
  const zero = useGetZeroResultSearchesQuery();
  const products = useGetTopViewedProductsQuery();

  const o = overview.data;

  const stats = [
    { label: 'Visitantes', value: o ? fmt(o.visitors) : '—' },
    { label: 'Vistas de página', value: o ? fmt(o.pageViews) : '—' },
    { label: 'Búsquedas', value: o ? fmt(o.searches) : '—' },
    { label: 'Vistas de producto', value: o ? fmt(o.productViews) : '—' },
    { label: 'Pedidos', value: o ? fmt(o.orders) : '—' },
    { label: 'Vista → pedido', value: o ? pct(o.viewToOrderRate) : '—' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Análisis y sistema"
        title="Analítica del storefront"
        description="Visitas, búsquedas y conversión de la tienda pública (últimos 30 días)."
      />

      {/* KPIs del embudo */}
      <QueryState
        loading={overview.isLoading}
        error={overview.isError}
        loadingFallback={<div className="h-24 animate-pulse rounded-card bg-muted" />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{s.value}</p>
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
                    <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className="flex h-full items-center rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground"
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Búsquedas sin resultados — demanda insatisfecha (lo más accionable) */}
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg">Búsquedas sin resultados</CardTitle>
            <CardDescription>Qué busca la gente y no encuentra. Tu lista de compras.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <QueryState
              loading={zero.isLoading}
              error={zero.isError}
              empty={(zero.data?.length ?? 0) === 0}
              emptyFallback={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin búsquedas fallidas en el periodo. 🎯
                </p>
              }
              loadingFallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}
            >
              <SearchTable rows={zero.data ?? []} highlightZero />
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
              loading={searches.isLoading}
              error={searches.isError}
              empty={(searches.data?.length ?? 0) === 0}
              emptyFallback={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay búsquedas registradas.
                </p>
              }
              loadingFallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}
            >
              <SearchTable rows={searches.data ?? []} />
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
            loading={products.isLoading}
            error={products.isError}
            empty={(products.data?.length ?? 0) === 0}
            emptyFallback={
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aún no hay vistas de producto registradas.
              </p>
            }
            loadingFallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}
          >
            <div className="divide-y divide-border">
              {(products.data ?? []).map((p, i) => (
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
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.query} className="flex items-center justify-between gap-3 py-2.5">
          <span className="truncate text-sm text-foreground">{r.query}</span>
          <div className="flex shrink-0 items-center gap-3">
            {highlightZero ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {r.zeroResultCount} sin resultados
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">~{r.avgResults.toFixed(0)} result.</span>
            )}
            <span className="text-sm font-semibold tabular-nums text-foreground">{r.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
