// Lecturas del dashboard de analítica (admin). La ingesta de eventos NO pasa por
// acá: el visitante emite con sendBeacon desde analytics.client, sin token. Estos
// endpoints son de solo lectura y van autenticados (requireAdmin en el backend),
// así que reusan el Bearer de baseApi.
import { baseApi } from './baseApi';

export interface AnalyticsOverview {
  visitors: number;
  pageViews: number;
  searches: number;
  productViews: number;
  checkoutStarts: number;
  orders: number;
  /** productViews → orders, en 0..1. */
  viewToOrderRate: number;
  funnel: { step: string; sessions: number }[];
}

export interface SearchRow {
  query: string;
  count: number;
  zeroResultCount: number;
  avgResults: number;
}

export interface ViewedProductRow {
  catalogItemId: string;
  name: string;
  views: number;
}

/** Rango de fechas (ISO) opcional; el backend cae a los últimos 30 días. */
export interface AnalyticsRange {
  start?: string;
  end?: string;
  limit?: number;
}

const cleanParams = (r?: AnalyticsRange) => {
  if (!r) return undefined;
  const params: Record<string, string | number> = {};
  if (r.start) params.start = r.start;
  if (r.end) params.end = r.end;
  if (r.limit) params.limit = r.limit;
  return Object.keys(params).length ? params : undefined;
};

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAnalyticsOverview: build.query<AnalyticsOverview, AnalyticsRange | void>({
      query: (range) => ({ url: 'analytics/admin/overview', params: cleanParams(range ?? undefined) }),
    }),
    getTopSearches: build.query<SearchRow[], AnalyticsRange | void>({
      query: (range) => ({ url: 'analytics/admin/searches', params: cleanParams(range ?? undefined) }),
    }),
    getZeroResultSearches: build.query<SearchRow[], AnalyticsRange | void>({
      query: (range) => ({ url: 'analytics/admin/zero', params: cleanParams(range ?? undefined) }),
    }),
    getTopViewedProducts: build.query<ViewedProductRow[], AnalyticsRange | void>({
      query: (range) => ({ url: 'analytics/admin/products', params: cleanParams(range ?? undefined) }),
    }),
  }),
});

export const {
  useGetAnalyticsOverviewQuery,
  useGetTopSearchesQuery,
  useGetZeroResultSearchesQuery,
  useGetTopViewedProductsQuery,
} = analyticsApi;
