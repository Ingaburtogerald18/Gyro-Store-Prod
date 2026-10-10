import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from '@remix-run/react';
import { Search01Icon, Store01Icon, Settings02Icon, UserCircleIcon, Logout03Icon } from '@hugeicons/core-free-icons';
import { HugeIcon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '~/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/components/ui/command';
import { NotificationsBell } from './NotificationsBell';
import { allowedNavGroups, currentNavItem } from '~/lib/admin-navigation';
import { useTheme } from '~/hooks/useTheme';
import { useLocalPreference } from '~/hooks/useLocalPreference';
import { DENSITY_KEY, isDensity, isStringList, type TableDensity } from '~/lib/ui-preferences';

const NO_MODULES: string[] = [];
const ROLE_LABELS: Record<string, string> = {
  global_admin: 'Administrador general', admin: 'Administrador', seller: 'Vendedor',
  cashier: 'Cajero', logistics_admin: 'Logística',
};

export function AdminHeader({ isAdmin, role, userId, name, email, photo, onSignOut }: {
  isAdmin: boolean; role: string | null; userId: string; name: string; email: string;
  photo?: string | null; onSignOut: () => Promise<void>;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { open: sidebarOpen, setOpen: setSidebarOpen, setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [favorites, setFavorites] = useLocalPreference(`gyro.admin.${userId}.favorites`, NO_MODULES, isStringList);
  const [recent, setRecent] = useLocalPreference(`gyro.admin.${userId}.recent`, NO_MODULES, isStringList);
  const [density, setDensity] = useLocalPreference<TableDensity>(DENSITY_KEY, 'normal', isDensity);
  const groups = allowedNavGroups(isAdmin, role);
  const modules = groups.flatMap((group) => group.items).filter((item) => !item.external);
  const current = currentNavItem(pathname, modules);
  const currentPath = current?.to;
  const section = groups.find((group) => group.items.some((item) => item.to === currentPath))?.label;
  const currentName = current?.name ?? (pathname === '/admin/mi-perfil' ? 'Mi perfil' : 'Administración');

  useEffect(() => {
    if (currentPath && recent[0] !== currentPath) {
      setRecent([currentPath, ...recent.filter((path) => path !== currentPath)].slice(0, 5));
    }
  }, [currentPath, recent, setRecent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (document.querySelector('[role="dialog"]') && !searchOpen) return;
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  function go(to: string) {
    setSearchOpen(false);
    setOpenMobile(false);
    navigate(to);
  }

  const favoriteModules = modules.filter((item) => favorites.includes(item.to));
  const recentModules = recent.flatMap((path) => modules.filter((item) => item.to === path && !favorites.includes(path)));

  return (
    <>
      <a href="#admin-content" className="sr-only z-50 rounded-xl bg-primary p-3 text-primary-foreground focus:not-sr-only focus:absolute">Saltar al contenido</a>
      <header className="admin-topbar sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:gap-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SidebarTrigger className="size-11 shrink-0 rounded-xl border border-border bg-card text-primary-2" aria-label="Abrir o cerrar navegación" title="Navegación (Ctrl+B)" />
          <nav aria-label="Ubicación actual" className="min-w-0 text-sm">
            <span className="hidden text-xs text-muted-foreground sm:block">{section ?? 'Cuenta'}</span>
            <span aria-current="page" className="block truncate font-medium">{currentName}</span>
          </nav>
        </div>
        <Button variant="outline" onClick={() => setSearchOpen(true)} aria-label="Buscar módulos (Ctrl+K)" className="shrink-0 gap-2 text-muted-foreground lg:w-64 lg:justify-start">
          <HugeIcon icon={Search01Icon} size={16} />
          <span className="hidden lg:inline">Buscar módulos…</span>
          <kbd className="ml-auto hidden rounded-sm border px-1.5 text-2xs lg:inline">Ctrl K</kbd>
        </Button>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <a href="/" target="_blank" rel="noopener noreferrer"><HugeIcon icon={Store01Icon} size={16} />Ver tienda<span className="sr-only"> (nueva pestaña)</span></a>
          </Button>
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Menú de usuario" className="grid size-11 shrink-0 place-items-center rounded-full border border-transparent transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar><AvatarImage src={photo ?? undefined} alt="" /><AvatarFallback className="uppercase">{name.charAt(0) || email.charAt(0) || 'U'}</AvatarFallback></Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
              <DropdownMenuLabel className="space-y-1 font-normal">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
                <p className="text-xs text-primary">{ROLE_LABELS[role ?? ''] ?? 'Colaborador'}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/admin/mi-perfil"><HugeIcon icon={UserCircleIcon} size={16} />Mi perfil</Link></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPreferencesOpen(true)}><HugeIcon icon={Settings02Icon} size={16} />Preferencias del panel</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHelpOpen(true)}>Ayuda y atajos</DropdownMenuItem>
              <DropdownMenuItem asChild className="sm:hidden"><a href="/" target="_blank" rel="noopener noreferrer">Ver tienda (nueva pestaña)</a></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Apariencia</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => { if (value === 'light' || value === 'dark') setTheme(value); }}>
                <DropdownMenuRadioItem value="light">Tema claro</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Tema oscuro</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void onSignOut()}><HugeIcon icon={Logout03Icon} size={16} />Cerrar sesión</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="gap-3 p-4 sm:max-w-xl">
          <DialogHeader><DialogTitle>Buscar módulos</DialogTitle><DialogDescription>Accesos disponibles para tu rol. Usá las flechas y Enter para abrirlos.</DialogDescription></DialogHeader>
          <Command>
            <CommandInput placeholder="Inventario, ventas, catálogo…" aria-label="Nombre del módulo" />
            <CommandList>
              <CommandEmpty>No encontramos ese módulo.</CommandEmpty>
              {[
                { label: 'Favoritos', items: favoriteModules },
                { label: 'Recientes', items: recentModules },
                ...groups.map((group) => ({ ...group, items: group.items.filter((item) => !item.external && !favorites.includes(item.to) && !recentModules.some((entry) => entry.to === item.to)) })),
              ].filter((group) => group.items.length > 0).map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.items.map((item) => (
                    <CommandItem key={item.to} value={item.name} onSelect={() => go(item.to)} className="min-h-11 gap-3">
                      <HugeIcon icon={item.icon} size={18} />{item.name}
                      {currentPath === item.to && <span className="ml-auto text-xs text-muted-foreground">Actual</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Preferencias del panel</DialogTitle><DialogDescription>Se recuerdan en este navegador. No cambian la configuración de la tienda.</DialogDescription></DialogHeader>
          <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Densidad de tablas</legend>
            <div className="flex flex-wrap gap-4">{(['normal', 'compact'] as const).map((value) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="radio" name="table-density" value={value} checked={density === value} onChange={() => setDensity(value)} className="size-4 accent-primary" />{value === 'normal' ? 'Cómoda' : 'Compacta'}</label>
            ))}</div>
          </fieldset>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-t pt-3 text-sm"><span>Mantener navegación expandida <span className="block text-xs text-muted-foreground">En escritorio</span></span><input type="checkbox" checked={sidebarOpen} onChange={(e) => setSidebarOpen(e.target.checked)} className="size-4 accent-primary" /></label>
          <fieldset className="space-y-1 border-t pt-4"><legend className="text-sm font-medium">Módulos favoritos</legend>
            <p className="pb-2 text-xs text-muted-foreground">Aparecen primero al abrir la búsqueda.</p>
            <div className="grid gap-x-4 sm:grid-cols-2">{modules.map((item) => (
              <label key={item.to} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={favorites.includes(item.to)} onChange={(event) => setFavorites(event.target.checked ? [...favorites, item.to] : favorites.filter((path) => path !== item.to))} className="size-4 shrink-0 accent-primary" />{item.name}</label>
            ))}</div>
          </fieldset>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ayuda y atajos</DialogTitle><DialogDescription>Movete por el panel sin perder el contexto de tu trabajo.</DialogDescription></DialogHeader>
          <dl className="space-y-4 text-sm">{[
            ['Ctrl / ⌘ + K', 'Buscar un módulo'], ['Ctrl / ⌘ + B', 'Abrir o cerrar la navegación'],
            ['/', 'Buscar en la tabla visible, fuera de campos de texto'], ['Esc', 'Cerrar un diálogo o limpiar la búsqueda de la tabla'],
            ['Tab · Enter · Espacio', 'Recorrer y activar controles'],
          ].map(([key, description]) => <div key={key} className="flex items-start justify-between gap-6"><dt className="shrink-0 rounded-sm border bg-muted px-2 py-1 text-xs">{key}</dt><dd className="text-right text-muted-foreground">{description}</dd></div>)}</dl>
          <p className="border-t pt-4 text-sm text-muted-foreground">En las tablas podés elegir columnas, cambiar la densidad y guardar una vista. La campana muestra avisos de ventas; cada módulo conserva sus propios filtros.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
