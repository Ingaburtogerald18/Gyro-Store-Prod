// Home del storefront. El catálogo y la config se piden en el SERVIDOR (loader),
// no en el cliente: mejora SEO y primer render, y evita el parpadeo de carga.
// /api/catalog y /api/config son públicos, así que no hace falta token.
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { getBrandName } from '~/lib/brand';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { useEffect } from 'react';
import type { CatalogProduct, LandingConfig } from '@shared/schemas';
import { useAppDispatch } from '~/store/hooks';
import { searchSet, categorySet } from '~/store/slices/uiSlice';
import { ActiveFilters } from '~/components/catalog/active-filters';
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

  try {
    const [catalogRes, configRes, landingRes] = await Promise.all([
      fetch(`${origin}/api/catalog`),
      fetch(`${origin}/api/config`),
      fetch(`${origin}/api/landing-config`),
    ]);
    if (catalogRes.ok) {
      products = ((await catalogRes.json()) as { items?: CatalogProduct[] }).items ?? [];
    }
    if (configRes.ok) config = (await configRes.json()) as StoreConfig;
    if (landingRes.ok) landing = (await landingRes.json()) as LandingConfig;
  } catch {
    // API caída: se renderiza la home con lo que haya (catálogo vacío) en vez
    // de tumbar la página entera.
  }

  return { origin, products, config, landing };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const origin = data?.origin ?? '';
  const brand = data?.config?.brandName || getBrandName();
  const title = brand;
  const description =
    'Audífonos KZ, adaptadores Bluetooth y accesorios de tecnología en Managua, Nicaragua.';
  // Sin `og:image` el link compartido por WhatsApp sale sin foto y parece spam.
  // Se usa el logo configurado desde el panel; si no hay, el del repo.
  const image = data?.config?.images?.logoStatic || `${origin}/logo.jpg`;

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: brand },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: image },
    { property: 'og:url', content: `${origin}/` },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: image },
  ];
};

export default function Index() {
  const { products, config, landing } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();

  // Sincroniza la URL con el estado global de Redux al cargar la página
  // o al usar las flechas del navegador (back/forward).
  useEffect(() => {
    const q = searchParams.get('q');
    const cat = searchParams.get('categoria');
    if (q !== null) dispatch(searchSet(q));
    if (cat !== null) dispatch(categorySet(cat));
  }, [searchParams, dispatch]);

  return (
    <StorefrontShell>
      <main key="home">
        <Hero initialLanding={landing} />
        <div data-landing-section="products" id="catalogo" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-8">
          <FilterBar products={products} categories={config?.categories} />
          <ActiveFilters categories={config?.categories} />
          <ProductGrid products={products} categories={config?.categories} />
        </div>
      </main>

      {/* Vive fuera del <main>: es un panel modal, no contenido de la página. */}
      <FilterSheet />
    </StorefrontShell>
  );
}
