// Drena `spo_outbox` cada minuto en el mismo proceso: genera el PDF, lo sube y guarda la URL.
// Con más de una instancia habría que tomar el lote con FOR UPDATE SKIP LOCKED (Docs/04 §7).
import { config } from '../../core/config';
import { db } from '../../core/supabase';
import { logger } from '../../utils/logger';
import { GraphAuthError } from './graph-token';
import { GraphApiError, uploadComprobante } from './sharepoint';
import { buildComprobanteData, comprobanteFilename, renderComprobantePdf } from './comprobante';

const TICK_MS = 60_000;
// Arranque diferido: el primer ciclo no compite con el arranque del server ni con
// el primer request, y le da margen a que la red del contenedor esté lista.
const FIRST_RUN_DELAY_MS = 45_000;
// De a 10 por ciclo: con un backlog grande no se dispara un 429 general.
const BATCH_SIZE = 10;
// Pasados 12 intentos la fila queda en `error` para revisión: seguir reintentando no lo arregla.
const MAX_ATTEMPTS = 12;

let running = false;

interface OutboxRow {
  id: string;
  order_id: string;
  attempts: number;
  comprobante_url: string | null;
}

/** Un ciclo de drenado; exportado para dispararlo a mano. Devuelve cuántas filas se sincronizaron. */
export async function drainSpoOutbox(): Promise<number> {
  // Sin credenciales las filas quedan `pending` y se sincronizan cuando se configure: no es un error.
  if (!config.spo.enabled) return 0;
  if (running) return 0;
  running = true;

  let synced = 0;
  try {
    const { data, error } = await db
      .from('spo_outbox')
      .select('id, order_id, attempts, comprobante_url')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      logger.warn('[spo] No se pudo leer el outbox', { message: error.message });
      return 0;
    }

    for (const row of (data || []) as OutboxRow[]) {
      const ok = await processRow(row);
      if (ok) synced += 1;
      // Un 429 corta el resto del lote: seguir alarga el throttling.
      if (ok === null) break;
    }
  } catch (err) {
    logger.error('[spo] Error inesperado drenando el outbox', { message: (err as Error)?.message });
  } finally {
    running = false;
  }

  return synced;
}

/** `true` sincronizada · `false` falló · `null` throttling: hay que cortar el lote. */
async function processRow(row: OutboxRow): Promise<boolean | null> {
  try {
    // Si ya tiene URL el PDF está arriba (falló el UPDATE final): se cierra sin volver a subir.
    if (row.comprobante_url) {
      await markSynced(row.id, row.comprobante_url);
      return true;
    }

    const data = await buildComprobanteData(row.order_id);
    if (!data) {
      // La orden ya no existe: error definitivo en vez de reintentar.
      await markError(row.id, row.attempts + 1, 'La venta ya no existe.', true);
      return false;
    }

    const pdf = await renderComprobantePdf(data);
    const url = await uploadComprobante(
      pdf,
      comprobanteFilename(data),
      new Date(data.createdAt),
    );

    await markSynced(row.id, url);
    return true;
  } catch (err) {
    const attempts = row.attempts + 1;

    if (err instanceof GraphApiError) {
      if (err.status === 429) {
        // Un 429 no cuenta como intento: no falló la venta, pidieron esperar.
        logger.warn('[spo] Graph pidió esperar (429)', {
          orderId: row.order_id,
          retryAfterSeconds: err.retryAfterSeconds,
        });
        return null;
      }

      // Lo no reintentable (403, 404) se cierra ya con el motivo, para arreglarlo y re-encolar.
      const giveUp = !err.retryable || attempts >= MAX_ATTEMPTS;
      await markError(row.id, attempts, `${err.status}: ${err.message}`, giveUp);
      return false;
    }

    if (err instanceof GraphAuthError) {
      // Credenciales mal cargadas o secreto vencido: afecta a TODAS las filas,
      // así que no tiene sentido seguir con el lote.
      logger.error('[spo] Falla de autenticación con Graph', { message: err.message });
      await markError(row.id, attempts, err.message, attempts >= MAX_ATTEMPTS);
      return null;
    }

    await markError(row.id, attempts, (err as Error)?.message ?? 'Error desconocido', attempts >= MAX_ATTEMPTS);
    return false;
  }
}

async function markSynced(id: string, comprobanteUrl: string) {
  const { error } = await db
    .from('spo_outbox')
    .update({
      status: 'synced',
      comprobante_url: comprobanteUrl,
      synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', id);
  if (error) logger.warn('[spo] No se pudo marcar la fila como sincronizada', { id, message: error.message });
}

async function markError(id: string, attempts: number, message: string, giveUp: boolean) {
  const { error } = await db
    .from('spo_outbox')
    .update({
      attempts,
      last_error: message.slice(0, 500),
      status: giveUp ? 'error' : 'pending',
    })
    .eq('id', id);
  if (error) logger.warn('[spo] No se pudo registrar el error de la fila', { id, message: error.message });

  logger[giveUp ? 'error' : 'warn']('[spo] Falló la sincronización de una venta', {
    id,
    attempts,
    giveUp,
    reason: message.slice(0, 200),
  });
}

/**
 * Se monta aunque SharePoint esté apagado: al cargar las credenciales alcanza con reiniciar.
 * `unref()` para que el timer no impida terminar el proceso.
 */
export function startSpoWorker() {
  if (process.env.NODE_ENV === 'test') return;

  setTimeout(() => void drainSpoOutbox(), FIRST_RUN_DELAY_MS).unref();
  setInterval(() => void drainSpoOutbox(), TICK_MS).unref();
}
