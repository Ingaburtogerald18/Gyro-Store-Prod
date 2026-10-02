// Navegación de categorías del header (escritorio). Cada categoría es un enlace
// real (`/?categoria=slug#catalogo`): se puede abrir en otra pestaña, compartir
// y lo indexan los buscadores. Al hacer clic además filtra la grilla y baja al
// catálogo con scroll suave.
import { Link } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { categorySet, selectActiveCategory } from '~/store/slices/uiSlice';
import { cn } from '~/lib/utils';

export function inCategory(p: CatalogProduct, c: StoreCategory) {
  return p.categoryId === c.id || p.category === c.id || p.category === c.name;
}

export function categoryHref(slug: string | null): string {
  return slug ? `/?categoria=${encodeURIComponent(slug)}#catalogo` : '/#catalogo';
}

export function CategoryNav({
  categories,
}: {
  categories: StoreCategory[];
  products?: CatalogProduct[];
}) {
  const dispatch = useAppDispatch();
  const reduce = useReducedMotion();
  const activeCategory = useAppSelector(selectActiveCategory);

  if (categories.length === 0) return null;

  function onSelect(slug: string | null) {
    dispatch(categorySet(slug));
    setTimeout(
      () => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80,
    );
  }

  return (
    <nav aria-label="Categorías" className="min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <NavTab
          to={categoryHref(null)}
          selected={activeCategory === null}
          onSelect={() => onSelect(null)}
          reduce={Boolean(reduce)}
        >
          Todo
        </NavTab>

        {categories.map((c) => (
          <NavTab
            key={c.id}
            to={categoryHref(c.slug)}
            selected={activeCategory === c.slug}
            onSelect={() => onSelect(c.slug)}
            reduce={Boolean(reduce)}
          >
            {c.name}
          </NavTab>
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  to,
  selected,
  onSelect,
  reduce,
  children,
}: {
  to: string;
  selected: boolean;
  onSelect: () => void;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'relative flex h-11 shrink-0 items-center px-3 text-sm whitespace-nowrap transition-colors',
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
    </Link>
  );
}
