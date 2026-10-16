// Catálogo y config en el loader: mejor SEO y primer render, sin parpadeo. Son públicos: sin token.
import { json, redirect, type HeadersFunction, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import type { ShouldRevalidateFunction } from '@remix-run/react';
import { getBrandName } from '~/lib/brand';
import { legacyCatalogRedirect } from '~/lib/catalog-query';
import { canonicalLink, storeJsonLd } from '~/lib/seo';
import { siteOrigin } from '~/lib/site-url.server';
import { storeReader } from '~/lib/store-reader.server';
import { useLoaderData } from '@remix-run/react';
import { Hero } from '~/components/catalog/hero';
import { HomeGuides } from '~/components/catalog/home-guides';
import { Novedades } from '~/components/catalog/novedades';
import { ProductGrid } from '~/components/catalog/product-grid';
import { StorefrontShell } from '~/components/storefront/storefront-shell';
import { useAppSelector } from '~/state/hooks';
import { selectPreviewCatalog } from '~/state/slices/builder-slice';

// Catálogo público: 60s fresco + 5min de stale-while-revalidate. El HTML del SSR
// no contiene nada privado, así que es seguro cachearlo en navegador/CDN.
// Un 503 del catálogo trae su propio no-store: un error no se guarda en caché.
export const headers: HeadersFunction = ({ loaderHeaders }) => ({
  'Cache-Control': loaderHeaders.get('Cache-Control') ?? 'public, max-age=60, stale-while-revalidate=300',
});

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const siteUrl = siteOrigin(request);
  const store = storeReader(context, request);
  // Config y portada son accesorias: sin ellas la home sale con sus valores por defecto.
  const [catalog, config, landing] = await Promise.all([
    store.catalog().catch(() => null),
    store.config().catch(() => null),
    store.landing().catch(() => null),
  ]);
  // Una caída no se disfraza de «catálogo vacío»: la grilla muestra un error con reintento.
  const catalogError = catalog === null;
  const products = catalog ?? [];

  // Búsqueda y filtros viven en /catalogo: los enlaces viejos (/?q=…, /?categoria=…) llevan ahí.
  const legacy = legacyCatalogRedirect(url.pathname, url.searchParams, config?.categories ?? []);
  if (legacy) throw redirect(legacy, 301);

  const data = { siteUrl, products, config, landing, catalogError };
  // Sin catálogo la portada no cumple su función: el buscador recibe 503 y vuelve más tarde.
  if (catalogError) return json(data, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return json(data);
}

// Cambiar solo la query (p. ej. la vista previa del modo edición) no vuelve a pedir datos.
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
        telephone: config?.whatsapp,
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

  // Orden de DESIGN.md §10: Presentación, Destacados (con «Ver todo el catálogo») y categorías, Novedades,
  // Cómo comprar y Mayoreo.
  return (
    <StorefrontShell>
      <main key="home">
        <Hero initialLanding={landing} />
        {/* `id="catalogo"`: los enlaces viejos a /#catalogo siguen bajando a los productos. */}
        <div data-landing-section="products" id="catalogo" className="scroll-below-header mx-auto max-w-7xl px-4 py-6 md:py-8">
          <ProductGrid products={products} categories={categories} error={catalogError} layout="home" />
        </div>
        <Novedades initialLanding={landing} />
        <HomeGuides />
      </main>
    </StorefrontShell>
  );
}
