// Menús del header en escritorio, sobre DropdownMenu de Radix (teclado, Escape y foco resueltos).
// «Menú» es de quien compra; el avatar, solo del personal. Debajo de escritorio los reemplaza el ☰.
import { Link, useLocation } from '@remix-run/react';
import { Logout03Icon, Menu01Icon, Moon02Icon } from '@hugeicons/core-free-icons';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { HugeIcon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { useStaffWorkspace } from '~/hooks/use-staff-workspace';
import { useTheme } from '~/hooks/use-theme';
import { STORE_LINKS } from '~/lib/store-navigation';
import { cn } from '~/lib/utils';

// Filas de 44 px y foco neutro: el amarillo queda para comprar. Lo elegido, como en DESIGN.md §5.
export const MENU_ITEM =
  'min-h-11 gap-3 rounded-xl border-2 border-transparent px-3 text-sm focus:bg-muted focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground aria-[current=page]:border-primary-2 aria-[current=page]:bg-selection aria-[current=page]:font-semibold aria-[current=page]:text-selection-foreground';
export const MENU_CONTENT = 'w-72 max-w-[calc(100vw-1rem)] rounded-2xl border bg-card p-2 shadow-xl';
const CONTROL =
  'store-header-control shrink-0 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function HeaderMenu() {
  const { pathname } = useLocation();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={cn(CONTROL, 'hidden h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold lg:inline-flex')}>
        <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} />
        Menú
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className={MENU_CONTENT}>
        {STORE_LINKS.map((link) => (
          <DropdownMenuItem key={link.to} asChild className={MENU_ITEM}>
            <Link to={link.to} aria-current={pathname === link.to ? 'page' : undefined}>
              <HugeIcon icon={link.icon} size={18} strokeWidth={2} className="text-muted-foreground" />
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="my-2 bg-border" />
        <ThemeMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Casilla de menú con el interruptor a la vista: el estado se ve y se anuncia igual que la apariencia aplicada. */
function ThemeMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={isDark}
      // Queda abierto para ver el cambio sin volver a buscar el menú.
      onSelect={(event) => {
        event.preventDefault();
        toggleTheme();
      }}
      className={MENU_ITEM}
    >
      <HugeIcon icon={Moon02Icon} size={18} strokeWidth={2} className="text-muted-foreground" />
      <span className="flex-1">Tema oscuro</span>
      <Switch checked={isDark} tabIndex={-1} aria-hidden className="pointer-events-none" />
    </DropdownMenuItem>
  );
}

export function StaffMenu() {
  const staff = useStaffWorkspace();
  if (!staff) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Tu espacio de trabajo, ${staff.firstName}`}
        className={cn(CONTROL, 'hidden size-11 place-items-center rounded-full lg:grid')}
      >
        <StaffAvatar photo={staff.photo} initial={staff.initial} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className={MENU_CONTENT}>
        <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2 font-normal">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-primary-2">
            <StaffAvatar photo={staff.photo} initial={staff.initial} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold break-words text-foreground">{staff.firstName}</span>
            <span className="text-xs text-muted-foreground">{staff.role}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-2 bg-border" />

        {staff.actions.map((action) =>
          action.id === 'editor' ? (
            <DropdownMenuItem key={action.id} className={MENU_ITEM} onSelect={staff.openEditor}>
              <HugeIcon icon={action.icon} size={18} strokeWidth={2} className="text-muted-foreground" />
              {action.label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={action.id} asChild className={MENU_ITEM}>
              <Link to={action.to}>
                <HugeIcon icon={action.icon} size={18} strokeWidth={2} className="text-muted-foreground" />
                {action.label}
              </Link>
            </DropdownMenuItem>
          ),
        )}

        <DropdownMenuSeparator className="my-2 bg-border" />
        <DropdownMenuItem variant="destructive" className={MENU_ITEM} onSelect={() => void staff.signOut()}>
          <HugeIcon icon={Logout03Icon} size={18} strokeWidth={2} />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Foto de «Mi perfil» o, sin ella, la inicial. */
export function StaffAvatar({ photo, initial }: { photo: string | null; initial: string }) {
  return (
    <Avatar className="size-full after:border-0">
      {photo && <AvatarImage src={photo} alt="" />}
      <AvatarFallback className="bg-transparent text-sm font-semibold text-current">{initial}</AvatarFallback>
    </Avatar>
  );
}
