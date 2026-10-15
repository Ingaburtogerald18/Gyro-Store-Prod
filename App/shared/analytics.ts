// add_to_cart y whatsapp_open necesitan la 0032. Abrir WhatsApp no es enviar el mensaje ni un pedido.
export const ANALYTICS_EVENT_TYPES = [
  'page_view', 'product_view', 'search', 'checkout_start', 'order_created', 'add_to_cart', 'whatsapp_open',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface AnalyticsRange {
  start?: string;
  end?: string;
  limit?: number;
}

export interface AnalyticsOverview {
  visitors: number;
  pageViews: number;
  searches: number;
  productViews: number;
  addToCart: number;
  whatsappOpens: number;
  checkoutStarts: number;
  orders: number;
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

export interface AnalyticsDashboard {
  overview: AnalyticsOverview;
  searches: SearchRow[];
  zero: SearchRow[];
  products: ViewedProductRow[];
}
