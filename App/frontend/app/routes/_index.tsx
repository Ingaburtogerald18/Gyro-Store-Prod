// Catálogo y config en el loader: mejor SEO y primer render, sin parpadeo. Son públicos: sin token.
import { json, type HeadersFunction, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import type { ShouldRevalidateFunction } from '@remix-run/react';
import { getBrandName } from '~/lib/brand';
import { canonicalLink, storeJsonLd } from '~/lib/seo';
import { siteOrigin } from '~/lib/site-url.server';
import { useLoaderData } from '@remix-run/react';
import type { CatalogProduct, LandingConfig } from '@shared/schemas';
import { ActiveFilters } from '~/components/catalog/active-filters';
import { CatalogUrlSync } from '~/components/catalog/catalog-url-sync';
import { FilterBar } from '~/components/catalog/filter-bar';
import { FilterSheet } from '~/components/catalog/filter-sheet';
import { Hero } from '~/components/catalog/hero';
import { ProductGrid } from '~/components/catalog/product-grid';
import { StorefrontShell } from '~/components/storefront/storefront-shell';
import type { StoreConfig } from '~/state/api/session-api';
import { useAppSelector } from '~/state/hooks';
import { selectPreviewCatalog } from '~/state/slices/builder-slice';

// Catálogo público: 60s fresco + 5min de stale-while-revalidate. El HTML del SSR
// no contiene nada privado, así que es seguro cachearlo en navegador/CDN.
// Un 503 del catálogo trae su propio no-store: un error no se guarda en caché.
export const headers: HeadersFunction = ({ loaderHeaders }) => ({
  'Cache-Control': loaderHeaders.get('Cache-Control') ?? 'public, max-age=60, stale-while-revalidate=300',
});

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const siteUrl = siteOrigin(request);
  let products: CatalogProduct[] = [];
  let config: StoreConfig | null = null;
  let landing: LandingConfig | null = null;
  // Una caída del API no se disfraza de «catálogo vacío»: la grilla muestra un
  // error con reintento.
  let catalogError = false;

  const [catalogRes, configRes, landingRes] = await Promise.all([
    fetch(`${origin}/api/catalog`).catch(() => null),
    fetch(`${origin}/api/config`).catch(() => null),
    fetch(`${origin}/api/landing-config`).catch(() => null),
  ]);
  try {
    if (catalogRes?.ok) {
      products = ((await catalogRes.json()) as { items?: CatalogProduct[] }).items ?? [];
    } else {
      catalogError = true;
    }
  } catch {
    catalogError = true;
  }
  try {
    if (configRes?.ok) config = (await configRes.json()) as StoreConfig;
    if (landingRes?.ok) landing = (await landingRes.json()) as LandingConfig;
  } catch {
    // Config y portada son accesorias: la home sale con sus valores por defecto.
  }

  const data = { siteUrl, products, config, landing, catalogError };
  // Sin catálogo la portada no cumple su función: el buscador recibe 503 y vuelve más tarde.
  if (catalogError) return json(data, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return json(data);
}

// Cambiar filtros (viven en la URL) no vuelve a pedir datos: la grilla filtra lo que ya tiene.
export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const siteUrl = data?.siteUrl ?? '';
  const config = data?.config;
  const brand = config?.brandName || getBrandName();
  const title = `${brand} · Accesorios tecnológicos en Managua, Nicaragua`;
  const description =
    'Tienda en línea de accesorios tecnológicos en Managua, Nicaragua. Importación directa, asesoría por WhatsApp y garantía por fallas de fábrica.';
  // Imagen para compartir: el logo configurado; si no hay, ninguna. Falta una social propia de 1200×630.
  const image = config?.images?.logoStatic || '';
  const social = config?.socialLinks;

  return [
    { title },
    { name: 'description', content: description },
    canonicalLink(`${siteUrl}/`),
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: brand },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    ...(image ? [{ property: 'og:image', content: image }, { name: 'twitter:image', content: image }] : []),
    { property: 'og:url', content: `${siteUrl}/` },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    {
      'script:ld+json': storeJsonLd({
        origin: siteUrl,
        brand,
        logo: image,
        email: config?.contactEmail,
        socialLinks: [social?.facebook, social?.instagram, social?.tiktok],
      }),
    },
  ];
};

export default function Index() {
  const { products: published, config, landing, catalogError } = useLoaderData<typeof loader>();
  // En la vista previa del modo edición: con los cambios de productos del borrador.
  const products = useAppSelector(selectPreviewCatalog) ?? published;
  const categories = config?.categories;

  return (
    <StorefrontShell>
      <CatalogUrlSync categories={categories} />
      <main key="home">
        <Hero initialLanding={landing} />
        <div data-landing-section="products" id="catalogo" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-6 md:py-8">
          {!catalogError && products.length > 0 && (
            <>
              <FilterBar products={products} categories={categories} />
              <ActiveFilters categories={categories} />
            </>
          )}
          <ProductGrid products={products} categories={categories} error={catalogError} />
        </div>
      </main>

      {/* Vive fuera del <main>: es un panel modal, no contenido de la página. */}
      <FilterSheet />
    </StorefrontShell>
  );
}
