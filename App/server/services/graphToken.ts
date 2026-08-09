// Token de Microsoft Graph para el espejo en SharePoint (flujo app-only).
//
// ── Por qué no se reusa el token del login ──
// El staff entra con Entra ID vía Supabase (middleware/auth.ts), pero ese es un
// token DELEGADO: representa a una persona, vive minutos y solo llega al backend
// si el navegador acaba de hacer login. Escribir en la Lista es una tarea de
// SERVIDOR que corre en segundo plano, minutos u horas después de la aprobación
// (y con la persona hace rato desconectada), así que necesita una identidad
// propia: el service principal de la app, autenticado con client credentials.
//
// El secreto NUNCA sale del backend. No hay endpoint que lo exponga ni que
// devuelva el token.
import { config } from '../config';
import { logger } from '../utils/logger';

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
// Vuelo en curso: si el worker pide el token dos veces seguidas (o el día que
// haya más de un llamador), se comparte la MISMA promesa en vez de disparar dos
// requests a Entra por lo mismo.
let inFlight: Promise<string> | null = null;

// Margen contra el reloj: se pide uno nuevo 60 s ANTES de que expire. Sin esto,
// un token que vence "en 3 segundos" pasa el chequeo, sale hacia Graph y vuelve
// 401 — el desfase de reloj entre nuestro server y Entra es suficiente para eso.
const EXPIRY_MARGIN_MS = 60_000;

async function requestToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(config.spo.tenantId)}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.spo.clientId,
    client_secret: config.spo.clientSecret,
    // `.default` = "todos los permisos de APLICACIÓN que ya tiene concedidos este
    // app registration". En client credentials no se piden scopes sueltos: los
    // consiente un admin del tenant de antemano (acá, Sites.Selected).
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
    // El `error_description` de Entra es largo y trae ids de correlación: se
    // recorta para no volcar un párrafo en cada línea de log. NUNCA se loguea el
    // secreto ni el token.
    const detail = payload?.error_description?.slice(0, 200) || payload?.error || res.statusText;
    throw new GraphAuthError(`No se pudo obtener el token de Graph: ${detail}`, res.status);
  }

  const ttlMs = (payload.expires_in ?? 3600) * 1000;
  cached = { value: payload.access_token, expiresAt: Date.now() + ttlMs - EXPIRY_MARGIN_MS };
  return payload.access_token;
}

/**
 * Devuelve un token válido, del caché si todavía sirve.
 *
 * @param forceRefresh lo usa el cliente de Graph al recibir un 401: el token
 *   cacheado puede haber sido revocado antes de su expiración nominal (secreto
 *   rotado, permisos cambiados), y ahí el caché miente.
 */
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

/**
 * Aviso ÚNICO al arrancar. Si SPO está apagado no es un error —es la mitad del
 * plan de despliegue— pero tiene que estar dicho en los logs: si no, el día que
 * alguien pregunte por qué la Lista está vacía, no hay rastro de que el módulo
 * nunca se encendió.
 */
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
