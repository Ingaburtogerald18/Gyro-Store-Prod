// Loader de /catalogo y /categoria/:slug. Los productos de la categoría se eligen acá, en el servidor:
// el HTML inicial ya trae solo los suyos, sin esperar a que el navegador filtre.
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node';
import type { StoreCategory } from '~/state/api/session-api';
import { categoryHref, countByCategory, findCategory, hasCatalogParams, inCategory, legacyCatalogRedirect } from '~/lib/catalog-query';
import { siteOrigin } from '~/lib/site-url.server';
import { storeReader } from '~/lib/store-reader.server';

export async function loadCatalogListing({ request, context }: LoaderFunctionArgs, slug: string | null) {
  const url = new URL(request.url);
  const store = storeReader(context, request);
  const [products, config, landing] = await Promise.all([
    store.catalog().catch(() => null),
    store.config().catch(() => null),
    store.landing().catch(() => null),
  ]);
  const categories = config?.categories ?? [];

  const legacy = legacyCatalogRedirect(url.pathname, url.searchParams, categories);
  if (legacy) throw redirect(legacy, 301);

  let category: StoreCategory | null = null;
  if (slug !== null) {
    // Sin la config no se sabe si la categoría existe: es una caída, no un 404.
    if (!config) throw new Response('No pudimos cargar el catálogo. Probá de nuevo en un momento.', { status: 503 });
    category = findCategory(categories, slug) ?? null;
    if (!category) throw new Response('Categoría no encontrada', { status: 404 });
    // Un id o un nombre viejo en la URL lleva al slug actual.
    if (category.slug !== slug) throw redirect(`${categoryHref(category.slug)}${url.search}`, 301);
  }

  const catalogError = products === null;
  const all = products ?? [];
  const listing = category ? all.filter((p) => inCategory(p, category)) : all;
  const data = {
    siteUrl: siteOrigin(request),
    // Header y pie necesitan solo cuántos hay por categoría; `listing` es lo que muestra esta página.
    categoryCounts: countByCategory(all, categories),
    listing,
    config,
    landing,
    category,
    catalogError,
    // Búsquedas, filtros, orden y categorías vacías no se indexan.
    indexable: !hasCatalogParams(url.searchParams) && listing.length > 0,
  };
  if (catalogError) return json(data, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return json(data);
}

export type CatalogListingLoader = (args: LoaderFunctionArgs) => ReturnType<typeof loadCatalogListing>;
