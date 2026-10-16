// Portada: destacados (o los primeros por disponibilidad), ofertas y una grilla corta por categoría, sin
// filtros (viven en /catalogo). Listado: grilla uniforme filtrada por useCatalogFilter, de a 12.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRevalidator } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight01Icon, PackageSearchIcon, WifiError01Icon } from '@hugeicons/core-free-icons';
import { Button } from '~/components/ui/button';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/state/api/session-api';
import { ProductCard } from '~/components/product/product-card';
import { Skeleton } from '~/components/ui/skeleton';
import { isDeal, useCatalogFilter, useCatalogFilters } from '~/hooks/use-catalog-filter';

import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectEditMode } from '~/state/slices/auth-slice';
import { catalogFiltersApplied, filtersClearedAll, searchSet } from '~/state/slices/ui-slice';
import { CATALOG_PATH, DEFAULT_FILTERS, catalogHref, categoryHref, filtersKey, findCategory, inCategory } from '~/lib/catalog-query';
import { visibleWindow } from '~/lib/catalog-products';
import { HOME_SHELF_SIZE, homeSections } from '~/lib/home-sections';
import { selectDraftLandingConfig } from '~/state/slices/builder-slice';
import { useStoreLanding } from '~/hooks/use-store-config';
import { cn } from '~/lib/utils';

export { isDeal };

interface ProductGridProps {
  products: CatalogProduct[];
  categories?: StoreCategory[];
  isLoading?: boolean;
  /** El API no respondió: no es un catálogo vacío. */
  error?: boolean;
  layout?: 'home' | 'listing';
}

/** De a cuántos se muestran en el listado. */
export const LISTING_STEP = 12;

const SECTION_TITLE = 'font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl';

export function ProductGrid({ products, categories = [], isLoading, error, layout = 'home' }: ProductGridProps) {
  const dispatch = useAppDispatch();
  const revalidator = useRevalidator();
  const filters = useCatalogFilters(categories);
  const { filtered, unknownCategory } = useCatalogFilter(products, categories);

  const editMode = useAppSelector(selectEditMode);
  const draftLanding = useAppSelector(selectDraftLandingConfig);
  const realLanding = useStoreLanding();
  // En el modo edición, el borrador; en la tienda, lo publicado.
  const landing = editMode ? draftLanding : realLanding;
  const sections = useMemo(() => homeSections(products, categories, landing), [products, categories, landing]);

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
    const emptyCategory = layout === 'listing' ? findCategory(categories, filters.category) : undefined;
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
    const { highlight, manual, deals, rows, uncategorized } = sections;
    return (
      <div className="space-y-8 pb-2 md:space-y-10 md:pb-8">
        <HighlightBlock products={highlight} manual={manual} />

        {deals && (
          <ProductShelf title="Ofertas" products={deals.products} href={catalogHref({ ...DEFAULT_FILTERS, onlyOnSale: true })} />
        )}
        {rows.map((row) => (
          <ProductShelf key={row.category!.id} title={row.category!.name} products={row.products} href={categoryHref(row.category!.slug)} />
        ))}
        {uncategorized && <ProductShelf title="Más productos" products={uncategorized.products} href={CATALOG_PATH} />}
      </div>
    );
  }

  // Listado: el título y el conteo los pone la página (catalog-listing.tsx).
  const category = findCategory(categories, filters.category);
  const query = filters.search.trim();
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
      // Se quitan precio, ofertas y disponibilidad; la categoría y el orden quedan.
      empty = {
        title: category ? `Ningún producto de ${category.name} coincide con los filtros` : 'Ningún producto coincide con los filtros',
        text: 'Probá quitar alguno.',
        action: (
          <Button
            onClick={() => dispatch(catalogFiltersApplied({ ...DEFAULT_FILTERS, category: filters.category, sort: filters.sort }))}
            className="h-12 px-6"
          >
            Quitar filtros
          </Button>
        ),
      };
    }
  }

  return (
    <div className="pb-2 md:pb-12">
      {empty ? <EmptyState {...empty} /> : <ProgressiveResults products={filtered} resetKey={filtersKey(filters)} />}
    </div>
  );
}

/** Destacados elegidos (todos, en su orden) o los primeros por disponibilidad, y el acceso al catálogo. */
function HighlightBlock({ products, manual }: { products: CatalogProduct[]; manual: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const gridId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  // En el celular se ven 4; el resto queda a un toque, sin perder la selección.
  const hidden = manual && !expanded ? Math.max(0, products.length - HOME_SHELF_SIZE) : 0;
  // El botón desaparece al abrir: el foco sigue en el primer destacado que apareció.
  useEffect(() => {
    if (expanded) gridRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]')[HOME_SHELF_SIZE]?.focus();
  }, [expanded]);

  return (
    <section aria-labelledby="home-highlight" className="space-y-4">
      <ShelfHeader id="home-highlight" title={manual ? 'Destacados' : 'Productos'} href={CATALOG_PATH} linkLabel="Ver todo el catálogo" />
      <ProductResultsGrid
        id={gridId}
        gridRef={gridRef}
        products={products}
        variant="shelf"
        eagerCount={2}
        mobileLimit={manual && !expanded ? HOME_SHELF_SIZE : undefined}
      />
      {hidden > 0 && (
        <Button variant="outline" aria-expanded={false} aria-controls={gridId} onClick={() => setExpanded(true)} className="h-11 px-5 md:hidden">
          Ver {hidden} {hidden === 1 ? 'destacado más' : 'destacados más'}
        </Button>
      )}
    </section>
  );
}

/** Título del bloque y su enlace. Un nombre largo pasa a otra línea; el enlace queda a la derecha y nunca se le encima. */
function ShelfHeader({ id, title, href, linkLabel = 'Ver todo' }: { id: string; title: string; href: string; linkLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 id={id} className={cn(SECTION_TITLE, 'min-w-0 break-words')}>{title}</h2>
      <Link
        to={href}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-1 text-sm font-semibold text-primary-2 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {linkLabel}
        {linkLabel === 'Ver todo' && <span className="sr-only"> en {title}</span>}
        <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}

/** Bloque de la portada: hasta 4 productos en grilla (dos columnas en el celular) y «Ver todo». */
function ProductShelf({ title, products, href }: { title: string; products: CatalogProduct[]; href: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4">
      <ShelfHeader id={id} title={title} href={href} />
      <ProductResultsGrid products={products} variant="shelf" />
    </section>
  );
}

// Lo que ya se mostró de un listado, por entrada del historial: al volver de una ficha se ve igual.
const SHOWN_KEY = 'gyro:catalog-shown';
let hydrated = false;

function readShown(locationKey: string, resetKey: string): number | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`${SHOWN_KEY}:${locationKey}`) ?? 'null') as { key?: string; count?: number } | null;
    return saved?.key === resetKey && typeof saved.count === 'number' ? saved.count : null;
  } catch {
    return null;
  }
}

/** Listado de a 12 con «Mostrar más productos». Todos ya llegaron del servidor: esto no ahorra descarga. */
function ProgressiveResults({ products, resetKey }: { products: CatalogProduct[]; resetKey: string }) {
  const location = useLocation();
  const gridRef = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);
  const fullKey = `${location.pathname}?${resetKey}`;
  // Al hidratar, lo mismo que pintó el servidor; al volver a una página ya vista, lo que se había abierto.
  const [state, setState] = useState(() => ({
    key: fullKey,
    count: (hydrated && readShown(location.key, fullKey)) || LISTING_STEP,
  }));
  useEffect(() => {
    hydrated = true;
  }, []);

  // Otra búsqueda, categoría, filtro u orden vuelve a empezar desde 12.
  const count = state.key === fullKey ? state.count : LISTING_STEP;
  const { visible, hasMore, next } = visibleWindow(products.length, count, LISTING_STEP);

  useEffect(() => {
    try {
      sessionStorage.setItem(`${SHOWN_KEY}:${location.key}`, JSON.stringify({ key: fullKey, count: visible }));
    } catch {
      // Sin almacenamiento, al volver se ven 12 otra vez.
    }
  }, [location.key, fullKey, visible]);

  // El foco pasa al primer producto nuevo: con teclado o lector se sigue desde ahí.
  useEffect(() => {
    if (focusFrom.current == null) return;
    gridRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]')[focusFrom.current]?.focus();
    focusFrom.current = null;
  }, [visible]);

  return (
    <>
      <ProductResultsGrid gridRef={gridRef} products={products.slice(0, visible)} variant="listing" eagerCount={4} />
      <div className="mt-6 flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          Mostrando {visible} de {products.length}
        </p>
        {hasMore && (
          <Button
            variant="outline"
            className="h-11 px-6"
            onClick={() => {
              focusFrom.current = visible;
              setState({ key: fullKey, count: next });
            }}
          >
            Mostrar más productos
          </Button>
        )}
      </div>
    </>
  );
}

// En el celular, una tarjeta horizontal por fila (foto de unos 150 px); desde tableta, la grilla de siempre.
const GRID = {
  // Listado: 3 columnas en tableta y 4 en escritorio.
  listing: { className: 'grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4', sizes: '(min-width: 1024px) 300px, (min-width: 768px) 33vw, 152px' },
  // Portada: bloques de 4, en una sola fila desde tableta.
  shelf: { className: 'grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-5', sizes: '(min-width: 1280px) 300px, (min-width: 768px) 25vw, 152px' },
} as const;

// Grilla uniforme: el `h-full` de cada celda lleva precio y estado al pie de la tarjeta.
export function ProductResultsGrid({
  products,
  variant = 'listing',
  eagerCount = 0,
  mobileLimit,
  id,
  gridRef,
}: {
  products: CatalogProduct[];
  variant?: keyof typeof GRID;
  /** Cuántas fotos cargan sin lazy: solo las primeras que se ven al entrar. */
  eagerCount?: number;
  /** En el celular, cuántas se ven; el resto, desde tableta o al pedirlas. */
  mobileLimit?: number;
  id?: string;
  gridRef?: React.Ref<HTMLDivElement>;
}) {
  const grid = GRID[variant];
  return (
    <div ref={gridRef} id={id} className={grid.className}>
      {products.map((p, i) => (
        <div key={p.id} className={cn('h-full', mobileLimit != null && i >= mobileLimit && 'max-md:hidden')}>
          <ProductCard product={p} eager={i < eagerCount} sizes={grid.sizes} />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className={GRID.listing.className}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-border p-2 md:flex-col md:border-0 md:p-0">
          <Skeleton className="aspect-square w-[clamp(8.25rem,36vw,9.5rem)] shrink-0 rounded-2xl md:w-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-11 w-full" />
          </div>
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
