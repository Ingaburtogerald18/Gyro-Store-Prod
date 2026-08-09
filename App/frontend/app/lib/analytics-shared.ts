// Tipos y etiquetas de la telemetría, compartidos entre el cliente de tracking
// (analytics.client.ts) y el dashboard (analyticsApi / admin.analitica). Sin
// lógica ni acceso a window: seguro de importar en cualquier lado.
//
// Debe mantenerse en sync con `ANALYTICS_EVENT_TYPES` del backend
// (server/services/analytics.ts) y con el CHECK de la migración 0005.

export const ANALYTICS_EVENT_TYPES = [
  'page_view',
  'product_view',
  'search',
  'checkout_start',
  'order_created',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];
