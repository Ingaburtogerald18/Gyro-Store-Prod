// Menú único del celular y la tableta (DESIGN.md §10): explorar, pedidos y ayuda, personal y apariencia
// en un solo lugar, para no adivinar entre dos menús. En escritorio lo reemplazan la fila de categorías,
// «Menú» y el avatar.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowRight01Icon, Logout03Icon, Moon02Icon } from '@hugeicons/core-free-icons';

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
import { categoryFromPath, categoryHref } from '~/lib/catalog-query';
import { CATALOG_LINK, STAFF_ACCESS, STORE_LINKS } from '~/lib/store-navigation';
import { cn } from '~/lib/utils';
import { StaffAvatar } from './header-menus';

type Icon = typeof CATALOG_LINK.icon;

// Filas neutras de 48 px; lo elegido, con fondo rosa y borde bordó (DESIGN.md §5).
const ROW =
  'group flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none';
const ROW_STATE = (selected: boolean) =>
  selected
    ? 'border-primary-2 bg-selection font-semibold text-selection-foreground'
    : 'border-transparent font-medium text-foreground hover:bg-muted';

/** `children` es el botón que lo abre: como SheetTrigger, el foco vuelve a él al cerrar. */
export function StoreMenu({
  children,
  categories,
}: {
  children: ReactNode;
  /** Ya filtradas: las del header y con productos. */
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { pathname, key } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const staff = useStaffWorkspace();
  const activeCategory = categoryFromPath(pathname);
  const close = () => setOpen(false);
  useEffect(() => setOpen(false), [key]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      {/* Misma variante que el ancho base (data-[side=left]): si no, el 75 % de la base le gana. */}
      <SheetContent
        side="left"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panelRef.current?.querySelector<HTMLElement>('a')?.focus();
        }}
        className="p-0 data-[side=left]:w-[min(90vw,24rem)] md:data-[side=left]:w-3/4"
      >
        {/* La línea bordó repite la del header: el menú es parte de la tienda. */}
        <SheetHeader className="border-b-2 border-primary-2 px-4 py-4">
          <SheetTitle className="font-heading text-lg font-bold">Menú</SheetTitle>
          <SheetDescription className="sr-only">Catálogo, pedidos, ayuda, personal y apariencia.</SheetDescription>
        </SheetHeader>

        <div ref={panelRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <MenuGroup title="Explorá la tienda">
            {/* El catálogo entero en tarjeta: es la puerta principal; las categorías cuelgan de él. */}
            <MenuRow
              label={CATALOG_LINK.label}
              icon={CATALOG_LINK.icon}
              to={CATALOG_LINK.to}
              selected={pathname === CATALOG_LINK.to}
              onSelect={close}
              featured
            />
            {categories.length > 0 && (
              <ul aria-label="Categorías" className="mt-1 ml-5 space-y-0.5 border-l border-border pl-2">
                {categories.map((c) => (
                  <li key={c.id}>
                    <MenuRow
                      label={c.name}
                      to={categoryHref(c.slug)}
                      selected={activeCategory === c.slug}
                      onSelect={close}
                      compact
                    />
                  </li>
                ))}
              </ul>
            )}
          </MenuGroup>

          <MenuGroup title="Pedidos y ayuda">
            {STORE_LINKS.map((link) => (
              <MenuRow key={link.to} label={link.label} icon={link.icon} to={link.to} selected={pathname === link.to} onSelect={close} />
            ))}
          </MenuGroup>

          <MenuGroup title="Personal">
            {staff ? (
              <>
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background text-primary-2" aria-hidden>
                    <StaffAvatar photo={staff.photo} initial={staff.initial} />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold break-words text-foreground">{staff.firstName}</span>
                    <span className="block text-xs text-muted-foreground">{staff.role}</span>
                  </span>
                </div>
                {staff.actions.map((action) =>
                  action.id === 'editor' ? (
                    <MenuRow
                      key={action.id}
                      label={action.label}
                      icon={action.icon}
                      onSelect={() => {
                        close();
                        staff.openEditor();
                      }}
                    />
                  ) : (
                    <MenuRow key={action.id} label={action.label} icon={action.icon} to={action.to} selected={pathname === action.to} onSelect={close} />
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
                  <HugeIcon icon={Logout03Icon} size={20} strokeWidth={2} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1">Cerrar sesión</span>
                </button>
              </>
            ) : (
              // Discreto: es para el equipo, no para quien compra.
              <>
              <Link
                to={STAFF_ACCESS.to}
                onClick={close}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
              >
                <HugeIcon icon={STAFF_ACCESS.icon} size={18} strokeWidth={2} aria-hidden className="shrink-0" />
                {STAFF_ACCESS.label}
              </Link>
              <div className="hidden md:block">
                <MenuRow label={STAFF_ACCESS.label} hint={STAFF_ACCESS.hint} icon={STAFF_ACCESS.icon} to={STAFF_ACCESS.to} onSelect={close} />
              </div>
              </>
            )}
          </MenuGroup>

          {/* Al final: no ayuda a comprar, pero se encuentra donde se espera. */}
          <MenuGroup title="Apariencia" as="div" last>
            <div className="flex items-center gap-3 rounded-xl px-3 hover:bg-muted">
              <HugeIcon icon={Moon02Icon} size={20} strokeWidth={2} aria-hidden className="shrink-0 text-primary-2" />
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
        <h3 id={id} className="px-3 pt-2 pb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {children}
      </Tag>
      {!last && <Separator className="my-2 bg-border" />}
    </>
  );
}

/** Fila del menú: enlace con `to`; sin él, botón (abrir el editor). */
function MenuRow({
  label,
  hint,
  icon,
  to,
  selected = false,
  featured = false,
  compact = false,
  onSelect,
}: {
  label: string;
  hint?: string;
  icon?: Icon;
  to?: string;
  selected?: boolean;
  /** «Todo el catálogo»: tarjeta con borde, más visible que el resto. */
  featured?: boolean;
  /** Categorías: dentro del catálogo, sin ícono propio. */
  compact?: boolean;
  onSelect: () => void;
}) {
  const className = cn(
    ROW,
    ROW_STATE(selected),
    featured && !selected && 'min-h-14 border border-border bg-background font-semibold',
    featured && selected && 'min-h-14',
    compact && 'min-h-11 py-1.5',
  );
  const content = (
    <>
      {icon && (
        <span
          className={cn(
            'grid shrink-0 place-items-center text-primary-2',
            featured && 'size-9 rounded-xl border border-border bg-card',
          )}
        >
          <HugeIcon icon={icon} size={20} strokeWidth={2} aria-hidden />
        </span>
      )}
      {/* Los nombres largos pasan a otra línea: cortarlos esconde justo lo que distingue a la categoría. */}
      <span className="min-w-0 flex-1 break-words">
        {label}
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      <HugeIcon
        icon={ArrowRight01Icon}
        size={16}
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
