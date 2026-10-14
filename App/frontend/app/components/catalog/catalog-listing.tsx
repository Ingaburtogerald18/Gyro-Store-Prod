// Página de /catalogo y /categoria/:slug: título, recorrido, filtros y grilla. La categoría ya viene
// resuelta del loader (lib/catalog-listing.server.ts); los demás filtros salen de la URL.
import type { HeadersFunction, MetaFunction } from '@remix-run/node';
import type { ShouldRevalidateFunction } from '@remix-run/react';
import { Link, useLoaderData } from '@remix-run/react';

import { ActiveFilters } from '~/components/catalog/active-filters';
import { CatalogUrlSync } from '~/components/catalog/catalog-url-sync';
import { FilterBar } from '~/components/catalog/filter-bar';
import { FilterSheet } from '~/components/catalog/filter-sheet';
import { ProductGrid } from '~/components/catalog/product-grid';
import { StorefrontShell } from '~/components/storefront/storefront-shell';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb';
import { useCatalogFilter } from '~/hooks/use-catalog-filter';
import { useSearchTelemetry } from '~/hooks/use-search-telemetry';
import { getBrandName, pageTitle } from '~/lib/brand';
import { CATALOG_PATH, categoryHref } from '~/lib/catalog-query';
import type { CatalogListingLoader } from '~/lib/catalog-listing.server';
import { breadcrumbJsonLd, canonicalLink } from '~/lib/seo';

// Igual que la portada: 60 s fresco y 5 min de respaldo; un 503 trae su propio no-store.
export const catalogListingHeaders: HeadersFunction = ({ loaderHeaders }) => ({
  'Cache-Control': loaderHeaders.get('Cache-Control') ?? 'public, max-age=60, stale-while-revalidate=300',
});

// Cambiar filtros no vuelve a pedir datos: la grilla filtra lo que ya tiene.
export const catalogListingShouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
};

function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
}

export const catalogListingMeta: MetaFunction<CatalogListingLoader> = ({ data }) => {
  if (!data) return [{ title: pageTitle('Catálogo') }];
  const { category, listing, categoryCounts, siteUrl } = data;
  const brand = data.config?.brandName || getBrandName();
  const home = `${siteUrl}/`;
  const catalogUrl = `${siteUrl}${CATALOG_PATH}`;
  const pageUrl = `${siteUrl}${categoryHref(category?.slug ?? null)}`;

  const title = category ? pageTitle(`${category.name} en Managua`) : pageTitle('Catálogo');
  // El texto propio de la categoría manda; sin él, uno armado con datos reales (qué productos o
  // categorías hay), sin texto de relleno.
  const firstNames = listing.slice(0, 3).map((p) => p.name);
  const withProducts = (data.config?.categories ?? []).filter((c) => (categoryCounts[c.id] ?? 0) > 0).map((c) => c.name);
  const categoryText = category?.description?.trim();
  const description = category
    ? categoryText ||
      (firstNames.length
        ? `${category.name} en ${brand}, Managua: ${joinNames(firstNames)}${listing.length > 3 ? ' y más' : ''}. Mirá precio y disponibilidad y consultá por WhatsApp.`
        : `${category.name} en ${brand}, Managua, Nicaragua.`)
    : `Catálogo de ${brand} en Managua, Nicaragua${withProducts.length ? `: ${joinNames(withProducts)}` : ''}. Mirá precio y disponibilidad y consultá por WhatsApp.`;
  const image = listing.find((p) => p.images[0])?.images[0] || data.config?.images?.logoStatic || '';

  const trail = [{ name: 'Inicio', url: home }, { name: 'Catálogo', url: catalogUrl }];
  if (category) trail.push({ name: category.name, url: pageUrl });

  return [
    { title },
    { name: 'description', content: description },
    data.indexable ? canonicalLink(pageUrl) : { name: 'robots', content: 'noindex, follow' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: brand },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: pageUrl },
    ...(image ? [{ property: 'og:image', content: image }] : []),
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    { 'script:ld+json': breadcrumbJsonLd(trail) },
  ];
};

export function CatalogListing() {
  const { listing, config, category, catalogError } = useLoaderData<CatalogListingLoader>();
  const categories = config?.categories;
  const { filtered } = useCatalogFilter(listing, categories);
  useSearchTelemetry(filtered.length);

  return (
    <StorefrontShell>
      <CatalogUrlSync categories={categories} />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" prefetch="intent">Inicio</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {category ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={CATALOG_PATH} prefetch="intent">Catálogo</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{category.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>Catálogo</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {category?.name ?? 'Catálogo'}
        </h1>
        {category?.description?.trim() && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{category.description}</p>
        )}
        {/* En pantallas anchas el conteo va en la barra de filtros. */}
        {!catalogError && listing.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground tabular-nums sm:hidden">
            {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}
          </p>
        )}

        <div className="mt-6">
          {!catalogError && listing.length > 0 && (
            <>
              <FilterBar products={listing} categories={categories} />
              <ActiveFilters categories={categories} />
            </>
          )}
          <ProductGrid products={listing} categories={categories} error={catalogError} layout="listing" />
        </div>
      </main>

      {/* Vive fuera del <main>: es un panel modal, no contenido de la página. */}
      <FilterSheet />
    </StorefrontShell>
  );
}
