// Cliente mínimo de Graph para `spo-ids`; el servidor no lo usa. No reusa graph-token.ts porque
// este exige los ids que el script viene a averiguar.
import * as jose from 'jose';

export const GRAPH = 'https://graph.microsoft.com/v1.0';

export const tenantId = (process.env.AZURE_TENANT_ID || '').trim();
export const clientId = (process.env.AZURE_CLIENT_ID || '').trim();
export const clientSecret = (process.env.AZURE_CLIENT_SECRET || '').trim();

/** `fetch` envuelve todo fallo de red en «fetch failed»; el motivo real viaja en `.cause`, a veces anidado. */
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

/** Reintenta solo fallos de conexión: un 401 o 403 es un diagnóstico y se devuelve tal cual. */
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
 * Corta antes de ir a Entra si las credenciales tienen forma inválida (Secret ID en vez del Value,
 * una URL como tenant): los mensajes de Entra no dicen la causa.
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
 * Lee (no verifica) el token para informar sus permisos. `roles` solo trae los del recurso de `aud`:
 * con Graph no aparecen los permisos agregados bajo la API «SharePoint».
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

