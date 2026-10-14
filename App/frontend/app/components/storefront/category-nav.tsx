// Cada categoría es un enlace real a su página (`/categoria/slug`): se puede compartir e indexar.
import { Link, useLocation } from '@remix-run/react';

import type { CatalogProduct } from '@shared/schemas';
import type { StoreCategory } from '~/state/api/session-api';
import { CATALOG_PATH, categoryFromPath, categoryHref } from '~/lib/catalog-query';
import { cn } from '~/lib/utils';

export function CategoryNav({
  categories,
}: {
  categories: StoreCategory[];
  products?: CatalogProduct[];
}) {
  // Lo elegido sale de la ruta: el HTML del servidor ya marca dónde estás.
  const { pathname } = useLocation();
  const activeCategory = categoryFromPath(pathname);

  if (categories.length === 0) return null;

  return (
    <nav aria-label="Categorías" className="min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavTab to={categoryHref(null)} selected={pathname === CATALOG_PATH}>
          Todo
        </NavTab>

        {categories.map((c) => (
          <NavTab key={c.id} to={categoryHref(c.slug)} selected={activeCategory === c.slug}>
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
  children,
}: {
  to: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? 'page' : undefined}
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
