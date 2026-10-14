// Solo páginas públicas con contenido: portada, contacto, productos y combos publicados. Pedidos, panel,
// login y vistas previas quedan fuera.
import type { LoaderFunctionArgs } from '@remix-run/node';
import type { CatalogProduct, Combo } from '@shared/schemas';
import { comboName, getComboUrl, getProductUrl } from '~/lib/formatters';
import { buildSitemap } from '~/lib/seo';
import { siteOrigin } from '~/lib/site-url.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const site = siteOrigin(request);
  const [catalogRes, combosRes] = await Promise.all([
    fetch(`${origin}/api/catalog`).catch(() => null),
    fetch(`${origin}/api/combos`).catch(() => null),
  ]);

  try {
    if (!catalogRes?.ok || !combosRes?.ok) throw new Error('catálogo no disponible');
    const products = ((await catalogRes.json()) as { items?: CatalogProduct[] }).items ?? [];
    const combos = ((await combosRes.json()) as { items?: Combo[] }).items ?? [];
    const xml = buildSitemap([
      `${site}/`,
      `${site}/contacto`,
      ...products.map((p) => `${site}${getProductUrl(p.id, p.name)}`),
      ...combos.map((c) => `${site}${getComboUrl(c.id, comboName(c.name))}`),
    ]);
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
    });
  } catch {
    // Un sitemap a medias haría creer que faltan productos: mejor 503 y que el buscador vuelva.
    return new Response('Sitemap no disponible por el momento.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' },
    });
  }
}
