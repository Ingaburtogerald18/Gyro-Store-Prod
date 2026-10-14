// Sube el comprobante PDF a la biblioteca y guarda su URL en `spo_outbox`. La app nunca lee de SharePoint
// (por qué no una Lista: Docs/04-Comprobantes-SharePoint.md §1).
import { config } from '../../core/config';
import { getGraphToken } from './graph-token';
import { getIsoWeek } from '../../utils/iso-week';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * `retryable` separa lo que se arregla solo (429, 5xx, red) de lo que no (403, 404):
 * el worker no gasta intentos en un permiso que sigue sin concederse.
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
 * Un reintento ante 401 con forceRefresh (token revocado); si sigue, son permisos. El 429 no se reintenta
 * acá: se propaga con su Retry-After para no bloquear el drenado.
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
 * Carpeta = semana ISO de aprobación (`2026-W32`), la misma clave que agrupa los pagos de comisión:
 * cotejar lo pagado con los comprobantes de una semana es abrir una carpeta.
 */
function comprobanteFolder(when: Date): string {
  return getIsoWeek(when);
}

/**
 * Ruta relativa a la raíz de la biblioteca de SPO_DRIVE_ID; Graph crea las carpetas que falten.
 * Subida simple, hasta 4 MB: si el PDF algún día pasa de eso, migrar a createUploadSession.
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

/** SharePoint rechaza `" * : < > ? / \ |` y se come los puntos finales. Cinturón por si entra texto libre. */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|#%]/g, '-')
      .replace(/\.+$/, '')
      .trim()
      .slice(0, 120) || 'comprobante.pdf'
  );
}
