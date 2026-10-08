// Home del storefront. El catálogo y la config se piden en el SERVIDOR (loader),
// no en el cliente: mejora SEO y primer render, y evita el parpadeo de carga.
// /api/catalog y /api/config son públicos, así que no hace falta token.
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import type { ShouldRevalidateFunction } from '@remix-run/react';
import { getBrandName } from '~/lib/brand';
import { useLoaderData } from '@remix-run/react';
import type { CatalogProduct, LandingConfig } from '@shared/schemas';
import { ActiveFilters } from '~/components/catalog/active-filters';
import { CatalogUrlSync } from '~/components/catalog/catalog-url-sync';
import { FilterBar } from '~/components/catalog/filter-bar';
import { FilterSheet } from '~/components/catalog/filter-sheet';
import { Hero } from '~/components/catalog/hero';
import { ProductGrid } from '~/components/catalog/product-grid';
import { StorefrontShell } from '~/components/layout/storefront-shell';
import type { StoreConfig } from '~/store/api/sessionApi';

// Catálogo público: 60s fresco + 5min de stale-while-revalidate. El HTML del SSR
// no contiene nada privado, así que es seguro cachearlo en navegador/CDN.
export const headers: HeadersFunction = () => ({
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
});

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
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

  return { origin, products, config, landing, catalogError };
}

// Los filtros viven en la URL (?q=, ?categoria=, …). Cambiarlos NO vuelve a pedir
// catálogo, config y portada al servidor: la grilla filtra lo que ya tiene. Sí se
// revalida al llegar desde otra ruta, después de un envío o al pedir reintento.
export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const origin = data?.origin ?? '';
  const brand = data?.config?.brandName || getBrandName();
  const title = brand;
  const description =
    'Audífonos KZ, adaptadores Bluetooth y accesorios de tecnología en Managua, Nicaragua.';
  // Imagen para compartir: el logo configurado en el panel. Si no hay, no se
  // declara ninguna (antes apuntaba a /logo.jpg, que no existe). Una imagen
  // social propia (1200×630) está pendiente: ver el reporte de contenido.
  const image = data?.config?.images?.logoStatic || '';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: brand },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    ...(image ? [{ property: 'og:image', content: image }, { name: 'twitter:image', content: image }] : []),
    { property: 'og:url', content: `${origin}/` },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
  ];
};

export default function Index() {
  const { products, config, landing, catalogError } = useLoaderData<typeof loader>();
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
