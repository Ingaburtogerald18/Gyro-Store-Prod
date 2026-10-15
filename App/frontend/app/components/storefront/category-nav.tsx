// Fila de categorías del escritorio. Cada categoría es un enlace real a su página (`/categoria/slug`): se
// puede compartir e indexar. Las que no entran van a «Más categorías», sin cortar nombres ni ocultarlas.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';

import type { StoreCategory } from '~/state/api/session-api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { HugeIcon } from '~/components/ui/icon';
import { CATALOG_PATH, categoryFromPath, categoryHref } from '~/lib/catalog-query';
import { fittingCount } from '~/lib/store-navigation';
import { cn } from '~/lib/utils';
import { MENU_CONTENT, MENU_ITEM } from './header-menus';

const TAB =
  'store-category-link flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm whitespace-nowrap transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none';
const MORE_LABEL = 'Más categorías';

export function CategoryNav({ categories }: { categories: StoreCategory[] }) {
  // Lo elegido sale de la ruta: el HTML del servidor ya marca dónde estás.
  const { pathname } = useLocation();
  const activeCategory = categoryFromPath(pathname);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // Null hasta medir: el servidor no sabe el ancho, y lo que no entra baja a una línea oculta.
  const [visible, setVisible] = useState<number | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const update = () => {
      // Medidas: «Todo el catálogo», cada categoría y el botón «Más categorías», en semibold (el más ancho).
      const widths = Array.from(measure.children, (el) => Math.ceil(el.getBoundingClientRect().width));
      const all = widths.shift() ?? 0;
      const more = widths.pop() ?? 0;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      setVisible(fittingCount(widths, row.clientWidth - all - gap, more, gap));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [categories]);

  if (categories.length === 0) return null;

  const shown = visible === null ? categories : categories.slice(0, visible);
  const rest = visible === null ? [] : categories.slice(visible);
  const activeInRest = rest.some((c) => c.slug === activeCategory);

  return (
    <nav aria-label="Categorías" className="relative min-w-0 flex-1">
      <div ref={rowRef} className="flex h-11 flex-wrap items-center gap-1 overflow-hidden">
        <NavTab to={categoryHref(null)} selected={pathname === CATALOG_PATH}>
          Todo el catálogo
        </NavTab>
        {shown.map((c) => (
          <NavTab key={c.id} to={categoryHref(c.slug)} selected={activeCategory === c.slug}>
            {c.name}
          </NavTab>
        ))}

        {rest.length > 0 && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              data-selected={activeInRest || undefined}
              className={cn(TAB, 'store-category-more', activeInRest ? 'font-semibold' : 'font-medium')}
            >
              {MORE_LABEL}
              {activeInRest && <span className="sr-only">, incluye la categoría actual</span>}
              <HugeIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className={MENU_CONTENT}>
              {rest.map((c) => (
                <DropdownMenuItem key={c.id} asChild className={MENU_ITEM}>
                  <Link to={categoryHref(c.slug)} aria-current={activeCategory === c.slug ? 'page' : undefined}>
                    {c.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Copia invisible para medir cada enlace aunque esté dentro de «Más categorías». */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex w-max gap-1">
        {['Todo el catálogo', ...categories.map((c) => c.name)].map((label, i) => (
          <span key={i} className={cn(TAB, 'font-semibold')}>{label}</span>
        ))}
        <span className={cn(TAB, 'font-semibold')}>
          {MORE_LABEL}
          <HugeIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} />
        </span>
      </div>
    </nav>
  );
}

function NavTab({ to, selected, children }: { to: string; selected: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={selected ? 'page' : undefined}
      className={cn(TAB, selected ? 'font-semibold' : 'font-medium')}
    >
      {children}
    </Link>
  );
}
