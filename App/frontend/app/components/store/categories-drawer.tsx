// Categorías en móvil. El mega-menú de escritorio no cabe en 360px, así que ahí
// la navegación es un panel lateral con la lista y el conteo de cada gama.
//
// Sobre <Sheet> (Radix): foco atrapado, Escape y bloqueo de scroll resueltos.
import { useNavigate } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';

import type { CatalogProduct } from '@shared/schemas';
import type { Category } from '@shared/schemas';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { inCategory } from '~/components/store/category-nav';
import { useAppSelector } from '~/store/hooks';
import { selectActiveCategory } from '~/store/slices/uiSlice';
import { cn } from '~/lib/utils';
import { useReducedMotion } from 'framer-motion';

export function CategoriesDrawer({
  open,
  onOpenChange,
  categories,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  products: CatalogProduct[];
}) {
  const navigate = useNavigate();
  const activeCategory = useAppSelector(selectActiveCategory);
  const reduce = useReducedMotion();

  function pick(slug: string | null) {
    // El filtro lo aplica la URL (CatalogUrlSync); acá solo se baja al catálogo.
    onOpenChange(false);
    if (slug) {
      navigate(`/?categoria=${encodeURIComponent(slug)}#catalogo`);
    } else {
      navigate('/#catalogo');
    }
    setTimeout(
      () => document.getElementById('catalogo')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
      120,
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(88vw,20rem)] p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Categorías</SheetTitle>
          <SheetDescription>Elegí una gama para filtrar el catálogo.</SheetDescription>
        </SheetHeader>

        <nav aria-label="Categorías" className="overflow-y-auto p-2">
          <CategoryRow label="Todo el catálogo" selected={activeCategory === null} onSelect={() => pick(null)} />

          {/* Las categorías sin productos no se listan: un "0" en el menú es un
              callejón sin salida. Mientras el catálogo no cargó, se muestran todas. */}
          {categories
            .filter((c) => products.length === 0 || products.some((p) => inCategory(p, c)))
            .map((c) => {
            const count = products.filter((p) => inCategory(p, c)).length;
            return (
              <CategoryRow
                key={c.id}
                label={c.name}
                count={products.length ? count : undefined}
                selected={activeCategory === c.slug}
                onSelect={() => pick(c.slug)}
              />
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function CategoryRow({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      // min-h-12: fila cómoda para el pulgar, no un enlace de 20px.
      className={cn(
        'group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected
          ? 'bg-primary/10 font-semibold text-primary-2'
          : 'font-medium text-foreground hover:bg-muted',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
      <HugeIcon
        icon={ArrowRight02Icon}
        size={14}
        strokeWidth={2}
        aria-hidden
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
