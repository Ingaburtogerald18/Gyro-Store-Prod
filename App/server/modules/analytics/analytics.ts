// Ingesta y lectura paginada de eventos para los reportes del storefront.
import { db } from '../../core/supabase';
import { logger } from '../../utils/logger';
import { readBoundedPages } from '../../utils/read-bounded-pages';
import type { AnalyticsDashboard, AnalyticsEventType, AnalyticsRange, ViewedProductRow } from '../../../shared/analytics';
import { summarizeOverview, summarizeSearches, summarizeZeroResults, type RawEvent } from './aggregates';
export { ANALYTICS_EVENT_TYPES } from '../../../shared/analytics';

type RangeParams = Pick<AnalyticsRange, 'start' | 'end'>;

export interface IngestEvent {
  type: AnalyticsEventType;
  sessionId?: string;
  path?: string;
  payload?: Record<string, unknown>;
}

// Techo de filas por consulta para no traer millones a memoria.
// Si el volumen se acerca, hay que pasar a tablas de resumen.
const QUERY_ROW_CAP = 100_000;

// Filtro de bots por user-agent: no es exhaustivo, corta el ruido obvio de crawlers.
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

function resolveRange({ start, end }: RangeParams) {
  const endIso = end ?? new Date().toISOString();
  const startIso = start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { startIso, endIso };
}

async function fetchEvents(range: RangeParams): Promise<RawEvent[]> {
  const { startIso, endIso } = resolveRange(range);
  return readBoundedPages<RawEvent>(
    (from, to) => db.from('analytics_events')
      .select('type, payload, session_id, created_at', from === 0 ? { count: 'exact' } : {})
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
    QUERY_ROW_CAP,
  );
}

export async function getDashboard(range: RangeParams, limit = 20): Promise<AnalyticsDashboard> {
  const events = await fetchEvents(range);
  const searches = summarizeSearches(events);
  return {
    overview: summarizeOverview(events),
    searches: searches.slice(0, limit),
    zero: summarizeZeroResults(searches, limit),
    products: await summarizeProducts(events, limit),
  };
}

// Productos más vistos. Resuelve el nombre de los top-N contra catalog_items +
// template (una sola query) para que el dashboard no muestre UUIDs pelados.
async function summarizeProducts(events: RawEvent[], limit = 20): Promise<ViewedProductRow[]> {
  const counts = new Map<string, number>();

  for (const e of events) {
    if (e.type !== 'product_view') continue;
    const value = e.payload?.catalogItemId;
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!top.length) return [];

  const ids = top.map(([id]) => id);
  const { data, error } = await db
    .from('catalog_items')
    .select('id, template:templates(name)')
    .in('id', ids);
  if (error) throw error;

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
