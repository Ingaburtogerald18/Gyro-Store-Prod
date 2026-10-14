// Token app-only de Microsoft Graph. El del login es delegado y vive minutos; la subida corre
// en segundo plano horas después. El secreto nunca sale del backend.
import { config } from '../../core/config';
import { logger } from '../../utils/logger';

/** Falla al pedir el token. Tipada para que el worker la distinga de un fallo de datos. */
export class GraphAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GraphAuthError';
  }
}

interface CachedToken {
  value: string;
  /** Epoch ms a partir del cual se considera vencido (ya con el margen restado). */
  expiresAt: number;
}

let cached: CachedToken | null = null;
// Dos pedidos seguidos comparten la misma promesa en vez de pedir dos tokens.
let inFlight: Promise<string> | null = null;

// Se renueva 60 s antes de vencer: el desfase de reloj con Entra alcanza para un 401.
const EXPIRY_MARGIN_MS = 60_000;

async function requestToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(config.spo.tenantId)}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.spo.clientId,
    client_secret: config.spo.clientSecret,
    // `.default` = los permisos de aplicación ya concedidos (Sites.Selected).
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!res.ok || !payload?.access_token) {
    // Se recorta el detalle de Entra para el log. Nunca se loguean el secreto ni el token.
    const detail = payload?.error_description?.slice(0, 200) || payload?.error || res.statusText;
    throw new GraphAuthError(`No se pudo obtener el token de Graph: ${detail}`, res.status);
  }

  const ttlMs = (payload.expires_in ?? 3600) * 1000;
  cached = { value: payload.access_token, expiresAt: Date.now() + ttlMs - EXPIRY_MARGIN_MS };
  return payload.access_token;
}

/** Token válido, del caché si sirve. `forceRefresh` tras un 401: el token pudo revocarse antes de vencer. */
export async function getGraphToken({ forceRefresh = false } = {}): Promise<string> {
  if (!config.spo.enabled) {
    throw new GraphAuthError('SharePoint no está configurado (faltan variables de entorno).');
  }

  if (forceRefresh) cached = null;
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  if (!inFlight) {
    inFlight = requestToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Aviso único al arrancar: que SharePoint esté apagado tiene que quedar en los logs. */
export function logSpoStatusOnce() {
  if (config.spo.enabled) {
    logger.info('[spo] Espejo de ventas en SharePoint HABILITADO', { siteId: config.spo.siteId });
  } else {
    logger.info(
      '[spo] Espejo de ventas en SharePoint DESHABILITADO (faltan credenciales). ' +
        'Las ventas aprobadas se encolan en spo_outbox y se sincronizarán al configurarlo.',
    );
  }
}
