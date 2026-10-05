// Navegación de categorías del header (escritorio). Cada categoría es un enlace
// real (`/?categoria=slug#catalogo`): se puede abrir en otra pestaña, compartir
// y lo indexan los buscadores. Al hacer clic además filtra la grilla y baja al
// catálogo con scroll suave.
import { Link } from '@remix-run/react';
import { useReducedMotion } from 'framer-motion';

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
      () => document.getElementById('catalogo')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
      80,
    );
  }

  return (
    <nav aria-label="Categorías" className="min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavTab
          to={categoryHref(null)}
          selected={activeCategory === null}
          onSelect={() => onSelect(null)}
        >
          Todo
        </NavTab>

        {categories.map((c) => (
          <NavTab
            key={c.id}
            to={categoryHref(c.slug)}
            selected={activeCategory === c.slug}
            onSelect={() => onSelect(c.slug)}
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
  children,
}: {
  to: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'store-category-link flex h-10 shrink-0 items-center rounded-xl px-3 text-sm whitespace-nowrap transition-colors motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none',
        selected ? 'font-semibold' : 'font-medium',
      )}
    >
      {children}
    </Link>
  );
}
