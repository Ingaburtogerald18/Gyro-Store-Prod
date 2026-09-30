// Catálogo de la home. Dos vistas bien distintas:
//
//   · Por DEFECTO (sin filtros): SuperOfertas + un carrusel por categoría. Se
//     recorre como una tienda, gama por gama, sin decidir nada primero.
//   · Con búsqueda o filtro: una GRILLA UNIFORME de resultados. Acá el usuario ya
//     dijo qué quiere y lo que importa es comparar, no descubrir.
//
// Regla dura de esa grilla: todas las tarjetas del mismo tamaño y aspect-ratio,
// cero huecos. Nada de `col-span-2` ni `grid-auto-flow:dense`.
//
// El filtrado NO vive acá: lo hace useCatalogFilter sobre el uiSlice, para que
// la barra de herramientas y esta grilla cuenten siempre lo mismo. Las
// categorías se eligen desde el header (CategoryNav / CategoriesDrawer).
import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { PackageSearchIcon } from '@hugeicons/core-free-icons';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/store/api/sessionApi';
import { ProductCard } from '~/components/product/product-card';
import { ProductCarousel } from '~/components/product/product-carousel';
import { Skeleton } from '~/components/ui/skeleton';
import { isDeal, useCatalogFilter } from '~/hooks/useCatalogFilter';

import { useAppSelector } from '~/store/hooks';
import { selectEditMode } from '~/store/slices/authSlice';
import { selectDraftLandingConfig } from '~/store/slices/builderSlice';
import { useGetLandingConfigQuery } from '~/store/api/storefrontApi';
import { InlineRailsEditor } from '~/components/store/inline-rails-editor';

export { isDeal };

// Un producto pertenece a la categoría tanto si guarda el id como el nombre
// (el contrato trae `category` como texto y `categoryId` opcional).
function inCategory(p: CatalogProduct, c: StoreCategory) {
  return p.categoryId === c.id || p.category === c.id || p.category === c.name;
}

interface ProductGridProps {
  products: CatalogProduct[];
  categories?: StoreCategory[];
  isLoading?: boolean;
}

export function ProductGrid({ products, categories = [], isLoading }: ProductGridProps) {
  const { filtered, isDefault } = useCatalogFilter(products, categories);
  const deals = useMemo(() => products.filter(isDeal), [products]);

  const editMode = useAppSelector(selectEditMode);
  const draftLanding = useAppSelector(selectDraftLandingConfig);
  const { data: realLanding } = useGetLandingConfigQuery();

  // Determinar qué categorías usar para los carriles según el estado
  const railCategoriesIds = useMemo(() => {
    const configToUse = editMode ? draftLanding : realLanding;
    return configToUse?.homeCategories || [];
  }, [editMode, draftLanding, realLanding]);

  // Una fila por categoría CON productos, y las ofertas fuera.
  // Ahora usamos el orden de railCategoriesIds si existe, si no, caemos a todas.
  const rows = useMemo(() => {
    const rest = products.filter((p) => !isDeal(p));
    let orderedCategories = categories;

    if (railCategoriesIds.length > 0) {
      orderedCategories = railCategoriesIds
        .map(id => categories.find(c => c.id === id))
        .filter((c): c is StoreCategory => Boolean(c));
    }

    return orderedCategories
      .map((c) => ({ category: c, items: rest.filter((p) => inCategory(p, c)) }))
      .filter((row) => row.items.length > 0);
  }, [products, categories, railCategoriesIds]);

  // Productos que no caen en ninguna categoría de la config
  const uncategorized = useMemo(() => {
    if (categories.length === 0) return [];
    return products.filter((p) => !isDeal(p) && !categories.some((c) => inCategory(p, c)));
  }, [products, categories]);

  if (isLoading) return <GridSkeleton />;

  // "No hay catálogo" y "tu filtro no encontró nada" son problemas distintos, y
  // el usuario solo puede resolver el segundo.
  if (products.length === 0) {
    return <EmptyState text="Aún no hay productos publicados." />;
  }

  if (isDefault) {
    return (
      <div className="space-y-2 pb-2 md:space-y-6 md:pb-12">
        {editMode && <InlineRailsEditor allCategories={categories} />}

        {deals.length > 0 && (
          <ProductCarousel
            title="SuperOfertas"
            subtitle="Precios rebajados por tiempo limitado"
            products={deals}
            variant="showcase"
          />
        )}

        {rows.map((row) => (
          <ProductCarousel
            key={row.category.id}
            title={row.category.name}
            products={row.items}
            variant="showcase"
          />
        ))}

        {uncategorized.length > 0 && (
          <ProductCarousel title="Más productos" products={uncategorized} variant="showcase" />
        )}

        {/* Sin categorías configuradas no hay filas que armar: se cae a la
            grilla completa antes que dejar la home en blanco. */}
        {rows.length === 0 && uncategorized.length === 0 && deals.length === 0 && (
          <ProductResultsGrid products={products} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2 md:pb-12">
      <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        Resultados{' '}
        <span className="ml-1 text-sm font-medium text-muted-foreground tabular-nums">
          ({filtered.length})
        </span>
      </h2>

      {filtered.length > 0 ? (
        <ProductResultsGrid products={filtered} />
      ) : (
        <EmptyState text="Ningún producto coincide con lo que buscás. Probá quitar algún filtro." />
      )}
    </div>
  );
}

// Grilla uniforme: todas las tarjetas del mismo tamaño y aspect-ratio, sin tiles
// anchos. El `h-full` en cada celda ancla el CTA al fondo con alturas parejas.
// La entrada animada (fade + subida, escalonada por fila) la hace ProductCard;
// antes esta celda animaba lo mismo por encima y se sumaban dos transiciones.
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border bg-card py-20 text-center">
      <span
        className="relative grid h-16 w-16 place-items-center rounded-2xl bg-primary/8 text-primary-2 ring-1 ring-primary/15 ring-inset"
        aria-hidden >
        <HugeIcon icon={PackageSearchIcon} size={28} strokeWidth={2} className="relative" />
      </span>
      <p className="max-w-xs text-sm text-balance text-muted-foreground">{text}</p>
    </div>
  );
}
