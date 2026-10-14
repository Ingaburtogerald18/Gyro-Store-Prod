// Portada: destacados y, con más de 8 productos, ofertas y una fila por categoría, sin filtros (viven en
// /catalogo). Listado: grilla uniforme, todas las tarjetas del mismo tamaño, filtrada por useCatalogFilter.
import { useMemo } from 'react';
import { Link, useRevalidator } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { PackageSearchIcon, WifiError01Icon } from '@hugeicons/core-free-icons';
import { Button } from '~/components/ui/button';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/state/api/session-api';
import { ProductCard } from '~/components/product/product-card';
import { ProductCarousel } from '~/components/product/product-carousel';
import { Skeleton } from '~/components/ui/skeleton';
import { isDeal, useCatalogFilter, useCatalogFilters } from '~/hooks/use-catalog-filter';

import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectEditMode } from '~/state/slices/auth-slice';
import { filtersClearedAll, searchSet } from '~/state/slices/ui-slice';
import { CATALOG_PATH, categoryHref, findCategory, inCategory } from '~/lib/catalog-query';
import { categoryMode } from '@shared/schemas';
import { selectDraftLandingConfig } from '~/state/slices/builder-slice';
import { useStoreLanding } from '~/hooks/use-store-config';

export { isDeal };

interface ProductGridProps {
  products: CatalogProduct[];
  categories?: StoreCategory[];
  isLoading?: boolean;
  /** El API no respondió: no es un catálogo vacío. */
  error?: boolean;
  layout?: 'home' | 'listing';
}

/** Con pocos productos, una grilla compacta en vez de filas casi vacías. */
const FEW_PRODUCTS = 8;

export function ProductGrid({ products, categories = [], isLoading, error, layout = 'home' }: ProductGridProps) {
  const dispatch = useAppDispatch();
  const revalidator = useRevalidator();
  const { search, category: activeCategory } = useCatalogFilters(categories);
  const { filtered, unknownCategory } = useCatalogFilter(products, categories);
  const deals = useMemo(() => products.filter(isDeal), [products]);

  const editMode = useAppSelector(selectEditMode);
  const draftLanding = useAppSelector(selectDraftLandingConfig);
  const realLanding = useStoreLanding();

  // Categorías de los carriles según el modo de la portada (auto / elegidas /
  // ocultas), compatible con configuraciones sin modo.
  const landingToUse = editMode ? draftLanding : realLanding;
  const railMode = categoryMode(landingToUse?.homeCategoriesMode, landingToUse?.homeCategories);
  const railCategoriesIds = useMemo(
    () => (railMode === 'custom' ? landingToUse?.homeCategories ?? [] : []),
    [railMode, landingToUse?.homeCategories],
  );

  // Una fila por categoría con productos; las ofertas siguen también en su categoría.
  const rows = useMemo(() => {
    let orderedCategories = categories;

    if (railMode === 'hidden') return [];
    if (railMode === 'custom') {
      orderedCategories = railCategoriesIds
        .map(id => categories.find(c => c.id === id))
        .filter((c): c is StoreCategory => Boolean(c));
    }

    return orderedCategories
      .map((c) => ({ category: c, items: products.filter((p) => inCategory(p, c)) }))
      .filter((row) => row.items.length > 0);
  }, [products, categories, railCategoriesIds, railMode]);

  // Productos que no caen en ninguna categoría de la config
  const uncategorized = useMemo(() => {
    if (categories.length === 0 || railMode !== 'auto') return [];
    return products.filter((p) => !categories.some((c) => inCategory(p, c)));
  }, [products, categories, railMode]);

  if (isLoading) return <GridSkeleton />;

  // Cada vacío dice POR QUÉ está vacío y qué se puede hacer.
  if (error) {
    return (
      <EmptyState
        icon={WifiError01Icon}
        title="No pudimos cargar el catálogo"
        text="Puede ser un problema de conexión. Tu carrito sigue guardado."
        action={
          <Button onClick={() => revalidator.revalidate()} disabled={revalidator.state !== 'idle'} className="h-12 px-6">
            {revalidator.state !== 'idle' ? 'Reintentando…' : 'Reintentar'}
          </Button>
        }
      />
    );
  }
  if (products.length === 0) {
    const emptyCategory = layout === 'listing' ? findCategory(categories, activeCategory) : undefined;
    if (emptyCategory) {
      return (
        <EmptyState
          title={`Todavía no hay productos en ${emptyCategory.name}`}
          text="Mirá el resto del catálogo mientras tanto."
          action={
            <Button asChild className="h-12 px-6">
              <Link to={CATALOG_PATH}>Ver todo el catálogo</Link>
            </Button>
          }
        />
      );
    }
    return <EmptyState title="Todavía no hay productos publicados" text="Volvé pronto o escribinos por WhatsApp." />;
  }

  if (layout === 'home') {
    // Destacados elegidos en el modo edición (los que siguen publicados); sin elección, los primeros
    // de la vitrina: la portada siempre muestra productos temprano.
    const featured = (landingToUse?.featuredProductIds ?? [])
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is CatalogProduct => Boolean(p));
    const highlight = featured.length ? featured : products.slice(0, FEW_PRODUCTS);
    // Con pocos productos ya están todos a la vista: las filas solo repetirían los mismos.
    const showRows = products.length > FEW_PRODUCTS && railMode !== 'hidden';
    return (
      <div className="space-y-2 pb-2 md:space-y-6 md:pb-8">
        <section aria-labelledby="home-highlight" className="space-y-4">
          <h2 id="home-highlight" className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {featured.length ? 'Destacados' : 'Productos'}
          </h2>
          <ProductResultsGrid products={highlight} />
        </section>

        {showRows && deals.length > 0 && (
          <ProductCarousel
            title="Ofertas"
            subtitle="Productos con precio rebajado."
            products={deals}
            variant="showcase"
          />
        )}

        {showRows &&
          rows.map((row) => (
            <ProductCarousel
              key={row.category.id}
              title={row.category.name}
              href={categoryHref(row.category.slug)}
              products={row.items}
              variant="showcase"
            />
          ))}

        {showRows && uncategorized.length > 0 && (
          <ProductCarousel title="Más productos" products={uncategorized} variant="showcase" />
        )}
      </div>
    );
  }

  // Listado: el título y el conteo los pone la página (catalog-listing.tsx).
  const category = findCategory(categories, activeCategory);
  const query = search.trim();
  let empty: { title: string; text: string; action: React.ReactNode } | null = null;
  if (filtered.length === 0) {
    const clearAll = (
      <Button onClick={() => dispatch(filtersClearedAll())} className="h-12 px-6">
        Ver todo el catálogo
      </Button>
    );
    if (unknownCategory) {
      empty = { title: 'Esa categoría ya no está disponible', text: 'Puede que la hayan renombrado o quitado.', action: clearAll };
    } else if (query) {
      empty = {
        title: `No encontramos «${query}»`,
        text: 'Probá con menos palabras o revisá cómo está escrito.',
        action: (
          <Button variant="outline" onClick={() => dispatch(searchSet(''))} className="h-12 px-6">
            Limpiar búsqueda
          </Button>
        ),
      };
    } else if (category && products.every((p) => !inCategory(p, category))) {
      empty = { title: `Todavía no hay productos en ${category.name}`, text: 'Mirá el resto del catálogo mientras tanto.', action: clearAll };
    } else {
      empty = { title: 'Ningún producto coincide con los filtros', text: 'Probá quitar alguno.', action: clearAll };
    }
  }

  return (
    <div className="pb-2 md:pb-12">
      {empty ? <EmptyState {...empty} /> : <ProductResultsGrid products={filtered} />}
    </div>
  );
}

// Grilla uniforme: el `h-full` de cada celda ancla el CTA al fondo. La entrada
// animada la hace ProductCard, no la celda.
export function ProductResultsGrid({ products }: { products: CatalogProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {products.map((p, i) => (
        <div key={p.id} className="h-full">
          <ProductCard product={p} index={i} />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          {/* Mismo aspect que el stage real de ProductCard: evita el salto de layout. */}
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  text,
  action,
  icon = PackageSearchIcon,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
  icon?: Parameters<typeof HugeIcon>[0]['icon'];
}) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary-2/10 text-primary-2" aria-hidden>
        <HugeIcon icon={icon} size={26} strokeWidth={2} />
      </span>
      <p className="font-heading text-lg font-bold text-balance text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-balance text-muted-foreground">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
