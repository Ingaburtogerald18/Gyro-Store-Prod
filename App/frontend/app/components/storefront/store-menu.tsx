// Menú único del celular y la tableta (DESIGN.md §10): catálogo, categorías, ayuda y apariencia en un
// solo lugar, para no adivinar entre dos menús. En escritorio lo reemplazan la fila de categorías y el menú.
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight02Icon, Moon02Icon } from '@hugeicons/core-free-icons';

import type { Category } from '@shared/schemas';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Separator } from '~/components/ui/separator';
import { Switch } from '~/components/ui/switch';
import { useTheme } from '~/hooks/use-theme';
import { CATALOG_PATH, categoriesWithProducts, categoryFromPath, categoryHref } from '~/lib/catalog-query';
import { STORE_PAGES } from '~/lib/store-pages';
import { cn } from '~/lib/utils';

const HELP_LINKS = [
  { label: 'Compras por mayor', to: STORE_PAGES.wholesale },
  { label: 'Ayuda', to: STORE_PAGES.help },
  { label: 'Mis pedidos', to: STORE_PAGES.orders },
  { label: 'Contacto', to: STORE_PAGES.contact },
];

/** `children` es el botón que lo abre: como SheetTrigger, el foco vuelve a él al cerrar. */
export function StoreMenu({
  children,
  categories,
  counts,
}: {
  children: ReactNode;
  categories: Category[];
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const activeCategory = categoryFromPath(pathname);
  const close = () => setOpen(false);

  // Las categorías sin productos no se listan: un "0" en el menú es un callejón sin salida.
  // Sin conteos, se muestran todas y sin número.
  const listed = categoriesWithProducts(categories, counts);
  const showCounts = Boolean(counts && Object.values(counts).some((n) => n > 0));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="left" className="w-[min(88vw,20rem)] p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription className="sr-only">Catálogo, categorías, ayuda y apariencia.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          <nav aria-label="Catálogo">
            <MenuRow label="Todo el catálogo" to={categoryHref(null)} selected={pathname === CATALOG_PATH} onSelect={close} />
            {listed.map((c) => (
              <MenuRow
                key={c.id}
                label={c.name}
                count={showCounts ? (counts?.[c.id] ?? 0) : undefined}
                to={categoryHref(c.slug)}
                selected={activeCategory === c.slug}
                onSelect={close}
              />
            ))}
          </nav>

          <Separator className="my-2 bg-border" />

          <nav aria-label="Ayuda y pedidos">
            {HELP_LINKS.map((link) => (
              <MenuRow key={link.to} label={link.label} to={link.to} selected={pathname === link.to} onSelect={close} />
            ))}
          </nav>

          <Separator className="my-2 bg-border" />

          {/* Al final: no ayuda a comprar, pero se encuentra donde se espera. */}
          <div className="flex items-center gap-3 rounded-xl px-3 hover:bg-muted">
            <HugeIcon icon={Moon02Icon} size={18} strokeWidth={2} aria-hidden className="text-muted-foreground" />
            <label htmlFor="store-menu-dark-theme" className="flex min-h-12 flex-1 cursor-pointer items-center text-sm font-medium text-foreground">
              Tema oscuro
            </label>
            <Switch id="store-menu-dark-theme" checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuRow({
  label,
  count,
  to,
  selected,
  onSelect,
}: {
  label: string;
  count?: number;
  to: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-2 px-3 text-left text-sm transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected
          ? 'border-primary-2 bg-selection font-semibold text-selection-foreground'
          : 'border-transparent font-medium text-foreground hover:bg-muted',
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
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}
