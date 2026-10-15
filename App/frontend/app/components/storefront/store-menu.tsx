// Menú único del celular y la tableta (DESIGN.md §10): catálogo, pedidos y ayuda, lo del personal y la
// apariencia en un solo lugar, para no adivinar entre dos menús. En escritorio lo reemplazan la fila de
// categorías, «Menú» y el avatar.
import { useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight02Icon, Logout03Icon, Moon02Icon } from '@hugeicons/core-free-icons';

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
import { useStaffWorkspace } from '~/hooks/use-staff-workspace';
import { useTheme } from '~/hooks/use-theme';
import { CATALOG_PATH, categoryFromPath, categoryHref } from '~/lib/catalog-query';
import { STORE_LINKS } from '~/lib/store-navigation';
import { cn } from '~/lib/utils';

const ROW =
  'group flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** `children` es el botón que lo abre: como SheetTrigger, el foco vuelve a él al cerrar. */
export function StoreMenu({
  children,
  categories,
  counts,
}: {
  children: ReactNode;
  /** Ya filtradas: las del header y con productos. */
  categories: Category[];
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const staff = useStaffWorkspace();
  const activeCategory = categoryFromPath(pathname);
  const close = () => setOpen(false);
  // Sin conteos se muestran sin número.
  const showCounts = Boolean(counts && Object.values(counts).some((n) => n > 0));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="left" className="w-[min(88vw,22rem)] p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription className="sr-only">Catálogo, pedidos, ayuda y apariencia.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2 pb-6">
          <MenuGroup title="Explorá la tienda">
            <MenuRow label="Todo el catálogo" to={categoryHref(null)} selected={pathname === CATALOG_PATH} onSelect={close} />
            {categories.map((c) => (
              <MenuRow
                key={c.id}
                label={c.name}
                count={showCounts ? (counts?.[c.id] ?? 0) : undefined}
                to={categoryHref(c.slug)}
                selected={activeCategory === c.slug}
                onSelect={close}
              />
            ))}
          </MenuGroup>

          <MenuGroup title="Pedidos y ayuda">
            {STORE_LINKS.map((link) => (
              <MenuRow key={link.to} label={link.label} to={link.to} selected={pathname === link.to} onSelect={close} />
            ))}
          </MenuGroup>

          {staff && (
            <MenuGroup title="Tu espacio de trabajo">
              <p className="px-3 pb-2 text-sm">
                <span className="font-semibold break-words text-foreground">{staff.firstName}</span>
                <span className="block text-xs text-muted-foreground">{staff.role}</span>
              </p>
              {staff.actions.map((action) =>
                action.id === 'editor' ? (
                  <MenuRow
                    key={action.id}
                    label={action.label}
                    onSelect={() => {
                      close();
                      staff.openEditor();
                    }}
                  />
                ) : (
                  <MenuRow key={action.id} label={action.label} to={action.to} selected={pathname === action.to} onSelect={close} />
                ),
              )}
              <button
                type="button"
                onClick={() => {
                  close();
                  void staff.signOut();
                }}
                className={cn(ROW, 'mt-1 border-transparent font-medium text-destructive hover:bg-destructive/10')}
              >
                <span className="min-w-0 flex-1">Cerrar sesión</span>
                <HugeIcon icon={Logout03Icon} size={16} strokeWidth={2} />
              </button>
            </MenuGroup>
          )}

          {/* Al final: no ayuda a comprar, pero se encuentra donde se espera. */}
          <MenuGroup title="Apariencia" as="div" last>
            <div className="flex items-center gap-3 rounded-xl px-3 hover:bg-muted">
              <HugeIcon icon={Moon02Icon} size={18} strokeWidth={2} aria-hidden className="text-muted-foreground" />
              <label htmlFor="store-menu-dark-theme" className="flex min-h-12 flex-1 cursor-pointer items-center text-sm font-medium text-foreground">
                Tema oscuro
              </label>
              <Switch id="store-menu-dark-theme" checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} />
            </div>
          </MenuGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuGroup({ title, as: Tag = 'nav', last, children }: { title: string; as?: 'nav' | 'div'; last?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <>
      <Tag aria-labelledby={id} role={Tag === 'div' ? 'group' : undefined}>
        <h3 id={id} className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{title}</h3>
        {children}
      </Tag>
      {!last && <Separator className="my-2 bg-border" />}
    </>
  );
}

/** Fila del menú: enlace con `to`; sin él, botón (abrir el editor). */
function MenuRow({
  label,
  count,
  to,
  selected = false,
  onSelect,
}: {
  label: string;
  count?: number;
  to?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  const className = cn(
    ROW,
    selected
      ? 'border-primary-2 bg-selection font-semibold text-selection-foreground'
      : 'border-transparent font-medium text-foreground hover:bg-muted',
  );
  const content = (
    <>
      {/* Los nombres largos pasan a otra línea: cortarlos esconde justo lo que distingue a la categoría. */}
      <span className="min-w-0 flex-1 break-words">{label}</span>
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
    </>
  );

  return to ? (
    <Link to={to} onClick={onSelect} aria-current={selected ? 'page' : undefined} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onSelect} className={className}>
      {content}
    </button>
  );
}
