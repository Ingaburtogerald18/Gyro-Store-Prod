import { baseApi } from './baseApi';
import type { AnalyticsDashboard, AnalyticsRange } from '@shared/analytics';

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAnalyticsDashboard: build.query<AnalyticsDashboard, AnalyticsRange | void>({
      query: (range) => ({
        url: 'analytics/admin/dashboard',
        params: range ?? undefined,
      }),
    }),
  }),
});

export const { useGetAnalyticsDashboardQuery } = analyticsApi;
