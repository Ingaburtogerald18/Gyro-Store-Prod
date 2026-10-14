// Cliente mínimo de Graph para el script de configuración de SharePoint
// (`spo-ids`). NO lo usa el servidor.
//
// ── Por qué no reusa modules/sharepoint/graph-token.ts ──
// Huevo y gallina: `getGraphToken` exige `config.spo.enabled`, que a su vez exige
// los ids del sitio y la biblioteca — que es justamente lo que este script viene
// a averiguar. Relajar ese guard debilitaría la protección del worker, que SÍ
// debe negarse a correr con la configuración a medias. Se paga con este archivo,
// de un solo uso, en vez de con el camino de producción.
import * as jose from 'jose';

export const GRAPH = 'https://graph.microsoft.com/v1.0';

export const tenantId = (process.env.AZURE_TENANT_ID || '').trim();
export const clientId = (process.env.AZURE_CLIENT_ID || '').trim();
export const clientSecret = (process.env.AZURE_CLIENT_SECRET || '').trim();

/**
 * `fetch` de Node envuelve TODO fallo de red en un `TypeError: fetch failed` sin
 * detalle; el motivo real (ENOTFOUND, timeout, certificado rechazado por un
 * proxy) viaja en `.cause`, a veces anidado. Sin desenrollarlo, el mensaje no
 * distingue "no hay internet" de "el tenant id está mal escrito".
 */
export function explain(err: unknown): string {
  const parts: string[] = [];
  let current: any = err;
  while (current) {
    const code = current.code ? ` [${current.code}]` : '';
    const message = current.message ?? String(current);
    if (message) parts.push(`${message}${code}`);
    current = current.cause;
  }
  return parts.join('\n    ↳ ');
}

/**
 * Reintenta solo los fallos de CONEXIÓN (el socket nunca se abrió). Cualquier
 * respuesta HTTP —incluido un 401 o un 403— se devuelve tal cual: son
 * diagnósticos, no accidentes, y reintentarlos solo tardaría más en dar la misma
 * respuesta.
 *
 * Existe porque este enlace demostró ser intermitente: la misma llamada dio
 * `AADSTS7000215` (llegó a Entra) y `UND_ERR_CONNECT_TIMEOUT` (no llegó) con
 * minutos de diferencia.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        console.log(`  (intento ${attempt} falló: conexión; reintentando…)`);
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Corta ANTES de gastar un viaje a Entra si las credenciales tienen forma
 * inválida. Los dos errores de este paso (pegar el Secret ID en vez del Value,
 * pegar una URL como tenant) producen mensajes de Entra que no todo el mundo
 * asocia con la causa.
 */
export function assertCredentials(): void {
  const missing = [
    !tenantId && 'AZURE_TENANT_ID',
    !clientId && 'AZURE_CLIENT_ID',
    !clientSecret && 'AZURE_CLIENT_SECRET',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Faltan variables: ${missing.join(', ')}`);
  }

  if (/^https?:/i.test(tenantId) || tenantId.includes('/')) {
    throw new Error(
      `AZURE_TENANT_ID no parece un tenant: "${tenantId}".\n` +
        'Debe ser el GUID de Entra ID > Overview > Directory (tenant) ID, ' +
        'o el dominio (gyrostore.onmicrosoft.com). No una URL.',
    );
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientSecret)) {
    throw new Error(
      'AZURE_CLIENT_SECRET tiene forma de GUID: eso es el «Secret ID», no el «Value».\n' +
        'El Value solo se puede copiar entero al crear el secreto; si saliste de esa\n' +
        'pantalla, aparece recortado y hay que crear uno nuevo.',
    );
  }

  if (clientSecret.length < 30) {
    throw new Error(
      `AZURE_CLIENT_SECRET tiene solo ${clientSecret.length} caracteres: parece recortado.`,
    );
  }
}

export async function getToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  console.log(`Pidiendo token a: ${url}`);

  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
  } catch (err) {
    throw new Error(
      `No se pudo conectar con Microsoft:\n    ${explain(err)}\n\n` +
        'Causas habituales:\n' +
        '  · IPv6 sin ruta real (clásico en Windows): probá\n' +
        '      $env:NODE_OPTIONS="--dns-result-order=ipv4first"\n' +
        '  · Proxy/antivirus corporativo interceptando TLS.\n' +
        '  · VPN o firewall bloqueando la salida.',
    );
  }

  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`No se pudo obtener el token: ${json.error_description || res.statusText}`);
  }
  return json.access_token;
}

/**
 * Verifica que el token traiga permisos de aplicación de SharePoint y los
 * informa. Se DECODIFICA, no se verifica: no estamos confiando en el token (lo
 * acaba de emitir Entra a este mismo proceso), solo lo leemos para diagnosticar.
 *
 * El claim `roles` refleja los permisos concedidos PARA EL RECURSO del claim
 * `aud`. Con `aud = graph.microsoft.com` solo cuentan los permisos agregados bajo
 * la API «Microsoft Graph»; los de la API «SharePoint» son de otro recurso y
 * nunca aparecen acá — es el error que más cuesta ver.
 */
export function assertSharePointRoles(token: string): void {
  const claims = jose.decodeJwt(token) as { roles?: string[]; appid?: string; aud?: string };
  const roles = claims.roles ?? [];
  console.log(`  Audiencia: ${claims.aud}`);
  console.log(`  Permisos de aplicación: ${roles.length ? roles.join(', ') : '(ninguno)'}`);

  if (!roles.some((role) => role.startsWith('Sites.'))) {
    console.error('\nClaims del token:');
    console.error(JSON.stringify(claims, null, 2));
    throw new Error(
      'El token no trae NINGÚN permiso de SharePoint.\n\n' +
        'Verificá en Entra ID > Enterprise applications > tu app > Permissions\n' +
        '(esa pantalla muestra lo CONCEDIDO; App registrations muestra lo SOLICITADO).\n' +
        '`Sites.Selected` debe figurar con API name «Microsoft Graph» y Type\n' +
        '«Application». El consentimiento tarda un par de minutos en propagarse.',
    );
  }
}

export async function graphGet<T>(token: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithRetry(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new Error(`No se pudo conectar con Graph (${path}):\n    ${explain(err)}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`GET ${path} → ${res.status}: ${body?.error?.message || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

