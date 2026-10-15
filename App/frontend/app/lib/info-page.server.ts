// Loader de las páginas informativas (Ayuda, Por mayor): su contenido sale de Configuración, así que
// sin config no hay página que mostrar y se responde 503 en vez de una página vacía.
import type { LoaderFunctionArgs } from '@remix-run/node';
import { siteOrigin } from '~/lib/site-url.server';
import { readStoreFrame, storeReader } from '~/lib/store-reader.server';

export async function loadInfoPage({ request, context }: LoaderFunctionArgs, path: string) {
  const { config, landing, categoryCounts } = await readStoreFrame(storeReader(context, request));
  if (!config) throw new Response('No pudimos cargar esta página. Probá de nuevo en un momento.', { status: 503 });
  const siteUrl = siteOrigin(request);
  return { config, landing, categoryCounts, siteUrl, canonicalUrl: `${siteUrl}${path}` };
}
