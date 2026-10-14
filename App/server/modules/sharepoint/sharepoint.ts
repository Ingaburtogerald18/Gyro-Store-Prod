// Cliente de Microsoft Graph para el espejo de ventas: sube el comprobante PDF a
// la biblioteca de SharePoint.
//
// ── Por qué solo una biblioteca y no una Lista ──
// La primera versión también creaba una fila por venta en una Lista de
// SharePoint, con quince columnas (vendedor, cliente, montos, método…). Se
// descartó: TODOS esos datos ya viven en Postgres, que es la fuente de verdad, y
// nadie iba a consultar la Lista para decidir nada. Era duplicación pura, pagada
// con quince nombres internos de columna que hay que mantener sincronizados y con
// un permiso de esquema (`owner`) que el resto del sistema no necesita.
//
// Lo que sí aporta SharePoint es lo que Postgres no hace bien: guardar y buscar
// DOCUMENTOS. Así que la app sube el PDF y guarda su URL en
// `spo_outbox.comprobante_url`. Postgres queda como índice, SharePoint como
// archivo. Para llegar al comprobante de una venta se consulta esa columna.
//
// La app NO lee de SharePoint. Es un espejo de una sola dirección: ningún flujo
// del negocio depende de que esto responda.
import { config } from '../../core/config';
import { getGraphToken } from './graph-token';
import { getIsoWeek } from '../../utils/iso-week';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Error de una llamada a Graph.
 *
 * `retryable` separa lo que se arregla solo (429, 5xx, red caída) de lo que no
 * (403 por permisos sin conceder, 404 por un drive id equivocado). El worker
 * reintenta lo primero y deja de gastar intentos en lo segundo: un permiso que no
 * está concedido va a seguir sin estarlo dentro de una hora, y reintentarlo 20
 * veces solo llena el log.
 */
export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    /** Segundos que Graph pidió esperar (cabecera Retry-After), si los mandó. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

function isRetryableStatus(status: number): boolean {
  // 429 = throttling (Graph lo usa mucho y SIEMPRE hay que respetarlo).
  // 5xx = del lado de Microsoft. 408 = timeout.
  return status === 429 || status === 408 || status >= 500;
}

async function describeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    const code = body?.error?.code;
    const message = body?.error?.message;
    if (code || message) return [code, message].filter(Boolean).join(': ').slice(0, 300);
  } catch {
    /* cuerpo vacío o no-JSON: caemos al statusText */
  }
  return res.statusText || `HTTP ${res.status}`;
}

/**
 * Llamada a Graph con el token puesto y UN reintento ante 401.
 *
 * El 401 se reintenta una sola vez y con `forceRefresh`: el caso real es un token
 * revocado antes de expirar (secreto rotado). Si el segundo intento también da
 * 401, el problema es de permisos y no lo arregla pedir otro token.
 *
 * El 429 NO se reintenta acá: se propaga con su `Retry-After` para que el worker
 * lo respete y deje la fila pendiente. Dormir dentro del request bloquearía el
 * drenado entero por lo que Graph pida (a veces minutos).
 */
async function graphFetch(path: string, init: RequestInit, retriedAuth = false): Promise<Response> {
  const token = await getGraphToken({ forceRefresh: retriedAuth });

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${GRAPH_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !retriedAuth) {
    return graphFetch(path, init, true);
  }

  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new GraphApiError(
      await describeError(res),
      res.status,
      isRetryableStatus(res.status),
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  return res;
}

/**
 * Carpeta de destino de un comprobante: la SEMANA ISO de la aprobación
 * (`2026-W32`), que es como el negocio agrupa — las ventas se aprueban por
 * semana y los pagos de comisión usan esa misma clave en `orders.week_of`. Así
 * una carpeta de la biblioteca y un período de pago son la misma unidad, y
 * cotejar "lo que se pagó" contra "los comprobantes de esa semana" es abrir una
 * carpeta.
 *
 * Ordena solo alfabéticamente (`2026-W01` … `2026-W52`, `2027-W01`), que es como
 * SharePoint lista las carpetas por defecto.
 */
function comprobanteFolder(when: Date): string {
  return getIsoWeek(when);
}

/**
 * Sube el comprobante a la biblioteca y devuelve su `webUrl`.
 *
 * La ruta es relativa a la RAÍZ del drive de `SPO_DRIVE_ID`, que apunta a una
 * biblioteca dedicada a comprobantes: por eso no lleva un prefijo `Comprobantes/`
 * — quedaría `Comprobantes/Comprobantes/2026-W32/`. Graph crea las carpetas que
 * falten sobre la marcha.
 *
 * `PUT .../content` es la subida SIMPLE, que sirve hasta 4 MB. Un comprobante de
 * una página pesa decenas de KB, así que no hace falta la sesión de subida por
 * partes; si algún día se le meten fotos al PDF y pasa de ahí, Graph responde 413
 * y hay que migrar a createUploadSession.
 *
 * El `:` final de `{ruta}:/content` no es decorativo: es lo que le dice a Graph
 * que lo anterior es una ruta y no un id de item.
 */
export async function uploadComprobante(
  buffer: Buffer,
  filename: string,
  when: Date = new Date(),
): Promise<string> {
  const path = `${comprobanteFolder(when)}/${sanitizeFilename(filename)}`;

  const res = await graphFetch(
    `/sites/${config.spo.siteId}/drives/${config.spo.driveId}/root:/${encodeURI(path)}:/content`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      // `Buffer` es un Uint8Array, que es un BodyInit válido; el cast evita que
      // TS se pelee con el tipo genérico del ArrayBuffer subyacente.
      body: new Uint8Array(buffer) as unknown as BodyInit,
    },
  );

  const file = (await res.json()) as { webUrl?: string };
  if (!file?.webUrl) {
    throw new GraphApiError('Graph subió el archivo pero no devolvió su webUrl.', 200, false);
  }
  return file.webUrl;
}

/**
 * SharePoint rechaza `" * : < > ? / \ |` en los nombres de archivo y se come los
 * puntos finales. El nombre lo arma la app (correlativo o uuid), así que esto es
 * un cinturón por si algún día entra texto libre.
 */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|#%]/g, '-')
      .replace(/\.+$/, '')
      .trim()
      .slice(0, 120) || 'comprobante.pdf'
  );
}
