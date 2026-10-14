import { ANALYTICS_EVENT_TYPES, type AnalyticsEventType, type AnalyticsOverview, type SearchRow } from '../../../shared/analytics';

export interface RawEvent {
  type: AnalyticsEventType;
  payload: Record<string, unknown> | null;
  session_id: string | null;
  created_at: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const asBool = (v: unknown): boolean => v === true || v === 'true';

// Embudo: por cada tipo, cuántas sesiones distintas lo alcanzaron. Un evento sin sesión cuenta
// como una sesión propia para no perderlo.
function sessionsByType(events: RawEvent[]) {
  const map = new Map<AnalyticsEventType, Set<string>>();
  for (const t of ANALYTICS_EVENT_TYPES) map.set(t, new Set());
  for (const e of events) {
    const set = map.get(e.type);
    if (!set) continue;
    set.add(e.session_id ?? `anon:${e.created_at}`);
  }
  return map;
}

export function summarizeOverview(events: RawEvent[]): AnalyticsOverview {
  const byType = sessionsByType(events);

  const countType = (t: AnalyticsEventType) => events.filter((e) => e.type === t).length;
  const pageViews = countType('page_view');
  const searches = countType('search');
  const productViews = countType('product_view');
  const checkoutStarts = countType('checkout_start');
  const orders = countType('order_created');
  const addToCart = countType('add_to_cart');
  // Aperturas, no mensajes: WhatsApp no avisa si se envió. Por eso no entra al embudo de pedidos.
  const whatsappOpens = countType('whatsapp_open');

  const visitors = byType.get('page_view')?.size ?? 0;

  return {
    visitors,
    pageViews,
    searches,
    productViews,
    addToCart,
    whatsappOpens,
    checkoutStarts,
    orders,
    viewToOrderRate: productViews > 0 ? orders / productViews : 0,
    funnel: [
      { step: 'Visitas', sessions: byType.get('page_view')?.size ?? 0 },
      { step: 'Búsquedas', sessions: byType.get('search')?.size ?? 0 },
      { step: 'Vistas de producto', sessions: byType.get('product_view')?.size ?? 0 },
      { step: 'Agregar al carrito', sessions: byType.get('add_to_cart')?.size ?? 0 },
      { step: 'Checkout', sessions: byType.get('checkout_start')?.size ?? 0 },
      { step: 'Pedidos', sessions: byType.get('order_created')?.size ?? 0 },
    ],
  };
}

// Agrupa por la búsqueda normalizada. Las de promedio 0 resultados son demanda insatisfecha.
export function summarizeSearches(events: RawEvent[]): SearchRow[] {
  const agg = new Map<string, { count: number; zero: number; resultsSum: number }>();

  for (const e of events) {
    if (e.type !== 'search') continue;
    const q = str(e.payload?.queryNormalized).trim();
    if (!q) continue;
    const cur = agg.get(q) ?? { count: 0, zero: 0, resultsSum: 0 };
    cur.count += 1;
    const results = Number(e.payload?.resultsCount) || 0;
    cur.resultsSum += results;
    if (asBool(e.payload?.zeroResults) || results === 0) cur.zero += 1;
    agg.set(q, cur);
  }

  return [...agg.entries()]
    .map(([query, v]) => ({
      query,
      count: v.count,
      zeroResultCount: v.zero,
      avgResults: v.count ? v.resultsSum / v.count : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// Solo las búsquedas SIN resultados, ordenadas por frecuencia: la lista de
// compras del negocio (qué producto traer que la gente busca y no encuentra).
export function summarizeZeroResults(all: SearchRow[], limit = 20): SearchRow[] {
  return all
    .filter((s) => s.zeroResultCount > 0 && s.avgResults < 1)
    .sort((a, b) => b.zeroResultCount - a.zeroResultCount)
    .slice(0, limit);
}

