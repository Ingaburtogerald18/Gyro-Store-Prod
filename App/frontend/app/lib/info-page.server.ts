// Loader de las páginas informativas (Ayuda, Por mayor): su contenido sale de Configuración, así que
// sin config no hay página que mostrar y se responde 503 en vez de una página vacía.
import type { StoreConfig } from '~/state/api/session-api';
import { siteOrigin } from '~/lib/site-url.server';

export async function loadInfoPage(request: Request, path: string) {
  const url = new URL(request.url);
  const res = await fetch(`${url.origin}/api/config`).catch(() => null);
  const config = res?.ok ? ((await res.json().catch(() => null)) as StoreConfig | null) : null;
  if (!config) throw new Response('No pudimos cargar esta página. Probá de nuevo en un momento.', { status: 503 });
  const siteUrl = siteOrigin(request);
  return { config, siteUrl, canonicalUrl: `${siteUrl}${path}` };
}
