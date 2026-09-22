// Navegación de categorías del header (escritorio). Click directo filtra la
// grilla y hace scroll suave al catálogo — sin dropdown, sin preview.
import { motion, useReducedMotion } from 'framer-motion';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { categorySet, selectActiveCategory } from '~/store/slices/uiSlice';
import { useNavigate } from '@remix-run/react';
import { cn } from '~/lib/utils';

export function inCategory(p: CatalogProduct, c: StoreCategory) {
  return p.categoryId === c.id || p.category === c.id || p.category === c.name;
}

export function CategoryNav({
  categories,
}: {
  categories: StoreCategory[];
  products?: CatalogProduct[];
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const activeCategory = useAppSelector(selectActiveCategory);

  if (categories.length === 0) return null;

  function goToCategory(slug: string | null) {
    dispatch(categorySet(slug));
    if (slug) {
      navigate(`/?categoria=${encodeURIComponent(slug)}#catalogo`);
    } else {
      navigate('/#catalogo');
    }
    setTimeout(
      () => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80,
    );
  }

  return (
    <nav aria-label="Categorías">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <NavTab
          selected={activeCategory === null}
          onSelect={() => goToCategory(null)}
          reduce={Boolean(reduce)}
        >
          Todo
        </NavTab>

        {categories.map((c) => (
          <NavTab
            key={c.id}
            selected={activeCategory === c.slug}
            onSelect={() => goToCategory(c.slug)}
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
  selected,
  onSelect,
  reduce,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
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
