// Solo páginas públicas con contenido: portada, catálogo, categorías con productos, Ayuda, Por mayor,
// contacto, productos y combos publicados. Pedidos, panel, login, búsquedas y borradores quedan fuera.
import type { LoaderFunctionArgs } from '@remix-run/node';
import type { CatalogProduct, Combo } from '@shared/schemas';
import type { StoreConfig } from '~/state/api/session-api';
import { categoryHref, inCategory } from '~/lib/catalog-query';
import { comboName, getComboUrl, getProductUrl } from '~/lib/formatters';
import { buildSitemap } from '~/lib/seo';
import { STORE_PAGES } from '~/lib/store-pages';
import { siteOrigin } from '~/lib/site-url.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const site = siteOrigin(request);
  const [catalogRes, combosRes, configRes] = await Promise.all([
    fetch(`${origin}/api/catalog`).catch(() => null),
    fetch(`${origin}/api/combos`).catch(() => null),
    fetch(`${origin}/api/config`).catch(() => null),
  ]);

  try {
    if (!catalogRes?.ok || !combosRes?.ok || !configRes?.ok) throw new Error('catálogo no disponible');
    const products = ((await catalogRes.json()) as { items?: CatalogProduct[] }).items ?? [];
    const combos = ((await combosRes.json()) as { items?: Combo[] }).items ?? [];
    const config = (await configRes.json()) as StoreConfig;
    const categories = config.categories ?? [];
    const xml = buildSitemap([
      `${site}/`,
      `${site}${categoryHref(null)}`,
      ...categories.filter((c) => products.some((p) => inCategory(p, c))).map((c) => `${site}${categoryHref(c.slug)}`),
      `${site}${STORE_PAGES.help}`,
      `${site}${STORE_PAGES.howToBuy}`,
      `${site}${STORE_PAGES.paymentsDelivery}`,
      // En borrador la página no existe: no se anuncia.
      ...(config.policies?.warrantyPage ? [`${site}${STORE_PAGES.warranty}`] : []),
      `${site}${STORE_PAGES.wholesale}`,
      `${site}${STORE_PAGES.contact}`,
      ...products.map((p) => ({ loc: `${site}${getProductUrl(p.id, p.name)}`, lastmod: p.updatedAt })),
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
