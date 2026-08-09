// Telemetría propia del storefront (doc PORT-CATALOGO-V1 §3.2 — la pieza que
// quedó "[BLOQUEADO] / fuera de tanda" en el port del catálogo, ahora resuelta).
//
// Dos responsabilidades:
//   1. INGESTA: recibe lotes de eventos del cliente (sendBeacon) y los persiste
//      en `analytics_events`, filtrando bots.
//   2. LECTURA: agrega los eventos por rango de fecha para el dashboard admin
//      (embudo, top de búsquedas, búsquedas sin resultado, productos más vistos).
//
// La agregación se hace EN MEMORIA a propósito: PostgREST no hace GROUP BY, y a
// la escala de la tienda traer los eventos de un rango acotado y agruparlos en JS
// es más simple que mantener RPCs de SQL (mismo criterio que el resto del backend,
// que filtra en memoria). Hay un techo de filas para no desbordar la memoria.
import { db } from '../supabase';
import { logger } from '../utils/logger';

// Los cinco tipos del embudo. Fuente única compartida con el CHECK de la
// migración 0005 y con el schema Zod de la ruta.
export const ANALYTICS_EVENT_TYPES = [
  'page_view',
  'product_view',
  'search',
  'checkout_start',
  'order_created',
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface IngestEvent {
  type: AnalyticsEventType;
  sessionId?: string;
  path?: string;
  payload?: Record<string, unknown>;
}

// Techo de filas por consulta de dashboard: evita que un rango enorme traiga
// millones de filas a memoria. A la escala de la tienda no se alcanza; si algún
// día se acerca, es la señal para pasar a rollups agregados (ver nota en 0005).
const QUERY_ROW_CAP = 100_000;

// Filtro de bots por user-agent. No pretende ser exhaustivo (eso es una carrera
// perdida); corta el ruido obvio de crawlers para que las visitas reflejen
// personas. El cliente además solo emite con consentimiento y con JS activo, así
// que la mayoría de los bots ni llegan acá.
const BOT_RE =
  /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|go-http|semrush|ahrefs|dataprovider|screaming/i;

export function isBot(userAgent: string): boolean {
  if (!userAgent) return true; // sin UA = casi siempre un script, no un navegador real
  return BOT_RE.test(userAgent);
}

// ── Ingesta ────────────────────────────────────────────────────────────────

// Inserta el lote. NO se espera que rompa una respuesta al visitante: la ruta
// responde 202 igual, esto es telemetría best-effort. Si falla, se loguea y ya.
export async function ingestEvents(events: IngestEvent[]): Promise<void> {
  if (!events.length) return;
  const rows = events.map((e) => ({
    type: e.type,
    session_id: e.sessionId ?? null,
    path: e.path ?? null,
    payload: e.payload ?? {},
  }));
  const { error } = await db.from('analytics_events').insert(rows);
  if (error) {
    // Un fallo de telemetría no debe escalar; queda el rastro para depurar.
    logger.warn('[analytics] No se pudo insertar el lote de eventos', { message: error.message });
  }
}

// ── Lectura (dashboard) ──────────────────────────────────────────────────────

interface RangeParams {
  /** ISO. Por defecto: hace 30 días. */
  start?: string;
  /** ISO. Por defecto: ahora. */
  end?: string;
}

interface RawEvent {
  type: AnalyticsEventType;
  payload: Record<string, unknown> | null;
  session_id: string | null;
  created_at: string;
}

function resolveRange({ start, end }: RangeParams) {
  const endIso = end ?? new Date().toISOString();
  const startIso = start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { startIso, endIso };
}

// Trae los eventos del rango una sola vez; los distintos reportes agregan sobre
// el mismo arreglo para no pegarle a la DB cinco veces por carga del dashboard.
async function fetchEvents(range: RangeParams): Promise<RawEvent[]> {
  const { startIso, endIso } = resolveRange(range);
  const { data, error } = await db
    .from('analytics_events')
    .select('type, payload, session_id, created_at')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(QUERY_ROW_CAP);
  if (error) throw error;
  return (data ?? []) as RawEvent[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const asBool = (v: unknown): boolean => v === true || v === 'true';

export interface AnalyticsOverview {
  /** Visitantes únicos por sesión (fallback: nº de page_view si no hubo sesión). */
  visitors: number;
  pageViews: number;
  searches: number;
  productViews: number;
  checkoutStarts: number;
  orders: number;
  /** productViews → orders, en 0..1. */
  viewToOrderRate: number;
  /** Sesiones que llegaron a cada paso del embudo. */
  funnel: { step: string; sessions: number }[];
}

export interface SearchRow {
  query: string;
  count: number;
  zeroResultCount: number;
  /** Promedio de resultados devueltos (0 = siempre sin resultados). */
  avgResults: number;
}

export interface ViewedProductRow {
  catalogItemId: string;
  name: string;
  views: number;
}

// Cuenta el embudo: por cada tipo, cuántas SESIONES distintas lo alcanzaron.
// Si un evento no trae sesión (consentimiento raro o cliente viejo) se cuenta
// como una sesión propia para no perderlo del todo.
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

export async function getOverview(range: RangeParams): Promise<AnalyticsOverview> {
  const events = await fetchEvents(range);
  const byType = sessionsByType(events);

  const countType = (t: AnalyticsEventType) => events.filter((e) => e.type === t).length;
  const pageViews = countType('page_view');
  const searches = countType('search');
  const productViews = countType('product_view');
  const checkoutStarts = countType('checkout_start');
  const orders = countType('order_created');

  const visitors = byType.get('page_view')?.size ?? 0;

  return {
    visitors,
    pageViews,
    searches,
    productViews,
    checkoutStarts,
    orders,
    viewToOrderRate: productViews > 0 ? orders / productViews : 0,
    funnel: [
      { step: 'Visitas', sessions: byType.get('page_view')?.size ?? 0 },
      { step: 'Búsquedas', sessions: byType.get('search')?.size ?? 0 },
      { step: 'Vistas de producto', sessions: byType.get('product_view')?.size ?? 0 },
      { step: 'Checkout', sessions: byType.get('checkout_start')?.size ?? 0 },
      { step: 'Pedidos', sessions: byType.get('order_created')?.size ?? 0 },
    ],
  };
}

// Top de búsquedas: agrupa por la query NORMALIZADA (el cliente ya la manda en
// minúsculas/trim). Devuelve el conteo, cuántas fueron sin resultados y el
// promedio de resultados — las de promedio 0 son demanda insatisfecha pura.
export async function getTopSearches(
  range: RangeParams,
  limit = 20,
): Promise<SearchRow[]> {
  const events = await fetchEvents(range);
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
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Solo las búsquedas SIN resultados, ordenadas por frecuencia: la lista de
// compras del negocio (qué producto traer que la gente busca y no encuentra).
export async function getZeroResultSearches(
  range: RangeParams,
  limit = 20,
): Promise<SearchRow[]> {
  const all = await getTopSearches(range, 1000);
  return all
    .filter((s) => s.zeroResultCount > 0 && s.avgResults < 1)
    .sort((a, b) => b.zeroResultCount - a.zeroResultCount)
    .slice(0, limit);
}

// Productos más vistos. Resuelve el nombre de los top-N contra catalog_items +
// template (una sola query) para que el dashboard no muestre UUIDs pelados.
export async function getTopViewedProducts(
  range: RangeParams,
  limit = 20,
): Promise<ViewedProductRow[]> {
  const events = await fetchEvents(range);
  const counts = new Map<string, number>();

  for (const e of events) {
    if (e.type !== 'product_view') continue;
    const id = str(e.payload?.catalogItemId).trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!top.length) return [];

  const ids = top.map(([id]) => id);
  const { data } = await db
    .from('catalog_items')
    .select('id, template:templates(name)')
    .in('id', ids);

  const nameById = new Map<string, string>();
  for (const row of data ?? []) {
    const template = row.template as unknown as
      | { name?: string | null }
      | { name?: string | null }[]
      | null;
    const name = Array.isArray(template) ? template[0]?.name : template?.name;
    nameById.set(row.id, name ?? 'Producto');
  }

  return top.map(([id, views]) => ({
    catalogItemId: id,
    name: nameById.get(id) ?? 'Producto (eliminado)',
    views,
  }));
}
