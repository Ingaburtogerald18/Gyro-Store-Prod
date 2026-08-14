// Navegación de categorías del header (escritorio). Cada pestaña abre un panel
// con una muestra de productos de esa gama; "Ver todo" filtra el catálogo.
//
// Sustituye a los chips que vivían sobre la grilla: al mover la navegación
// arriba, la categoría se elige antes de ver la lista y no compite con la barra
// de filtros por el mismo espacio.
//
// El panel muestra productos, no "subcategorías": el contrato solo tiene
// `{ id, name, icon }` y el V1 fingía subcategorías inyectando productos. Acá se
// muestran como lo que son.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight02Icon, ImageNotFound01Icon } from '@hugeicons/core-free-icons';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { categorySet, selectActiveCategory } from '~/store/slices/uiSlice';
import { formatCordobas, getProductUrl } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import { ProductCard } from '~/components/product/product-card';

/** Cuántos productos se asoman en el panel. */
const PREVIEW_LIMIT = 10;
/** Margen para cruzar el hueco pestaña↔panel sin que se cierre. */
const CLOSE_DELAY_MS = 140;

export function inCategory(p: CatalogProduct, c: StoreCategory) {
  return p.categoryId === c.id || p.category === c.id || p.category === c.name;
}

export function CategoryNav({
  categories,
  products,
}: {
  categories: StoreCategory[];
  products: CatalogProduct[];
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const activeCategory = useAppSelector(selectActiveCategory);
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el timer al desmontar: si el header se va con uno pendiente, el
  // setState posterior cae sobre un componente muerto.
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  if (categories.length === 0) return null;

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), CLOSE_DELAY_MS);
  }
  function goToCategory(slug: string | null) {
    dispatch(categorySet(slug));
    setOpenId(null);
    if (slug) {
      navigate(`/?categoria=${encodeURIComponent(slug)}#catalogo`);
    } else {
      navigate('/#catalogo');
    }
    // Si ya estamos en la home la ruta no remonta, así que el scroll va a mano.
    setTimeout(
      () => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80,
    );
  }

  const openCategory = categories.find((c) => c.id === openId) ?? null;
  const openProducts = openCategory
    ? products.filter((p) => inCategory(p, openCategory)).slice(0, PREVIEW_LIMIT)
    : [];

  return (
    <nav
      aria-label="Categorías"
      className="relative"
      onMouseLeave={scheduleClose}
    >
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <NavTab
          selected={activeCategory === null}
          onSelect={() => goToCategory(null)}
          onHover={() => setOpenId(null)}
          reduce={Boolean(reduce)}
        >
          Todo
        </NavTab>

        {categories.map((c) => (
          <NavTab
            key={c.id}
            selected={activeCategory === c.slug}
            expanded={openId === c.id}
            onSelect={() => goToCategory(c.slug)}
            onHover={() => {
              cancelClose();
              setOpenId(c.id);
            }}
            reduce={Boolean(reduce)}
          >
            {c.name}
          </NavTab>
        ))}
      </div>

      <AnimatePresence>
        {openCategory && (
          <motion.div
            key={openCategory.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={cancelClose}
            className="absolute inset-x-0 top-full z-40 border-y border-border bg-background/95 shadow-lg backdrop-blur-xl"
          >
            <div className="mx-auto max-w-7xl px-4 py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{openCategory.name}</h3>
                <button
                  type="button"
                  onClick={() => goToCategory(openCategory.slug)}
                  className="group/all inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Ver todo
                  <HugeIcon
                    icon={ArrowRight02Icon}
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className="transition-transform group-hover/all:translate-x-0.5"
                  />
                </button>
              </div>

              {openProducts.length > 0 ? (
                <ul className="grid grid-cols-3 gap-3 lg:grid-cols-5">
                  {openProducts.map((p) => (
                    <li key={p.id}>
                      <div onClick={() => setOpenId(null)} className="h-full">
                        <ProductCard product={p} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aún no hay productos en esta categoría.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function NavTab({
  selected,
  expanded,
  onSelect,
  onHover,
  reduce,
  children,
}: {
  selected: boolean;
  expanded?: boolean;
  onSelect: () => void;
  onHover: () => void;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      aria-expanded={expanded}
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cn(
        'relative h-11 shrink-0 px-3 text-sm whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {selected && (
        <motion.span
          layoutId="category-nav-indicator"
          aria-hidden
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }}
        />
      )}
    </button>
  );
}
