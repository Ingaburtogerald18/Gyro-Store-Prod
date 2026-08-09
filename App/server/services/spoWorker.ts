// Worker que drena `spo_outbox` hacia SharePoint Online.
//
// Corre en el mismo proceso que la API, cada minuto. Por cada venta pendiente:
// genera el comprobante PDF → lo sube a la biblioteca, en la carpeta de la semana
// ISO de aprobación → guarda la URL en la fila del outbox y la marca `synced`.
//
// Esa URL es el único vínculo que queda entre Postgres y SharePoint: para llegar
// al comprobante de una venta se lee `spo_outbox.comprobante_url` por `order_id`.
// Ver services/sharepoint.ts para por qué no se replican los datos de la venta
// en una Lista.
//
// ── Concurrencia ──
// La app es un monolito de UNA sola instancia en Render (un servicio Express que
// además sirve el build de Remix), así que alcanza con un `setInterval` en
// proceso más el guard de `running` de abajo, que evita que dos ciclos se pisen
// si uno se demora más que el intervalo.
//
// SI ALGÚN DÍA HAY MÁS DE UNA INSTANCIA, dos procesos leerían las mismas
// pendientes y subirían el mismo PDF dos veces (inocuo: misma ruta, se
// sobrescribe) pero gastarían el doble de llamadas y podrían pisarse al escribir
// la URL. La corrección es tomar el lote con `SELECT ... FOR UPDATE SKIP LOCKED`
// dentro de una transacción (vía una función RPC en Postgres, porque PostgREST no
// expone el lock), o mover el worker a un servicio propio de una sola réplica.
import { config } from '../config';
import { db } from '../supabase';
import { logger } from '../utils/logger';
import { GraphAuthError } from './graphToken';
import { GraphApiError, uploadComprobante } from './sharepoint';
import { buildComprobanteData, comprobanteFilename, renderComprobantePdf } from './comprobante';

const TICK_MS = 60_000;
// Arranque diferido: el primer ciclo no compite con el arranque del server ni con
// el primer request, y le da margen a que la red del contenedor esté lista.
const FIRST_RUN_DELAY_MS = 45_000;
// Lote por ciclo. Con backlog grande (el día que se enciendan las credenciales y
// haya meses acumulados) se drena de a poco en vez de disparar cientos de
// requests a Graph de golpe y comerse un 429 general.
const BATCH_SIZE = 10;
// Tope de reintentos. Pasado esto la fila queda en `error` para revisión manual:
// seguir reintentando algo que falla igual 12 veces no lo arregla, solo tapa el
// log y gasta cuota de Graph.
const MAX_ATTEMPTS = 12;

let running = false;

interface OutboxRow {
  id: string;
  order_id: string;
  attempts: number;
  comprobante_url: string | null;
}

/**
 * Un ciclo de drenado. Exportada para poder dispararla a mano (script, o un
 * endpoint de admin si algún día hace falta forzar la sincronización).
 *
 * @returns cuántas filas se sincronizaron.
 */
export async function drainSpoOutbox(): Promise<number> {
  // Sin credenciales no hay nada que hacer: las filas se quedan `pending` y se
  // sincronizan solas cuando se configure Microsoft. NO se marcan como error —
  // "todavía no configurado" no es una falla de la venta.
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
      // Un 429 tumba el resto del lote: Graph pidió que paremos, y seguir
      // martillando con las nueve ventas siguientes alarga el throttling. El
      // resto queda pendiente para el próximo ciclo.
      if (ok === null) break;
    }
  } catch (err) {
    logger.error('[spo] Error inesperado drenando el outbox', { message: (err as Error)?.message });
  } finally {
    running = false;
  }

  return synced;
}

/**
 * Procesa UNA fila.
 * @returns `true` sincronizada · `false` falló (queda pendiente o en error) ·
 *          `null` throttling: hay que cortar el lote.
 */
async function processRow(row: OutboxRow): Promise<boolean | null> {
  try {
    // Defensa contra trabajo repetido: si la fila ya tiene URL, el PDF ya está
    // arriba. Puede pasar si el UPDATE final falló después de una subida
    // exitosa. Se cierra la fila sin volver a generar ni subir nada.
    if (row.comprobante_url) {
      await markSynced(row.id, row.comprobante_url);
      return true;
    }

    const data = await buildComprobanteData(row.order_id);
    if (!data) {
      // La orden ya no existe (borrada). No hay nada que espejar nunca más: se
      // cierra como error definitivo en vez de reintentar hasta agotar intentos.
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
        // No cuenta como intento fallido: no falló la venta, nos pidieron
        // esperar. Sumarlo gastaría el presupuesto de reintentos por un límite
        // de tasa que se resuelve solo.
        logger.warn('[spo] Graph pidió esperar (429)', {
          orderId: row.order_id,
          retryAfterSeconds: err.retryAfterSeconds,
        });
        return null;
      }

      // Lo no-reintentable se cierra ya: un 403 por permisos sin conceder o un
      // 404 por un drive id equivocado va a fallar igual dentro de una hora.
      // Queda en `error` con el motivo, para arreglarlo y re-encolar.
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
 * Arranca el worker. Se llama una vez desde `index.ts`, después de que el server
 * esté escuchando.
 *
 * Se monta INCLUSO con SPO deshabilitado: el ciclo es un `return 0` inmediato, y
 * dejarlo puesto significa que el día que se carguen las credenciales alcanza con
 * reiniciar — no hay que acordarse de encender nada más. `unref()` para que un
 * timer pendiente no le impida al proceso terminar.
 */
export function startSpoWorker() {
  if (process.env.NODE_ENV === 'test') return;

  setTimeout(() => void drainSpoOutbox(), FIRST_RUN_DELAY_MS).unref();
  setInterval(() => void drainSpoOutbox(), TICK_MS).unref();
}
