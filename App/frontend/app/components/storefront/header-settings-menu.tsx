// Menú del header sobre DropdownMenu de Radix (teclado y foco resueltos). «Menú», no un engranaje:
// se entiende mejor para quien compra.
import { HugeIcon } from "~/components/ui/icon";
import {
  CustomerSupportIcon,
  DashboardSquare01Icon,
  Edit02Icon,
  Logout03Icon,
  Menu01Icon,
  Moon02Icon,
  PackageIcon,
  User02Icon,
} from "@hugeicons/core-free-icons";
import { Link, useLocation } from "@remix-run/react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "~/state/hooks";
import { selectAuthStatus, selectIsAdmin, selectEditMode, selectUser, toggleEditMode } from "~/state/slices/auth-slice";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";
import { signOut } from "~/lib/supabase.client";

// Filas cómodas (44px) y foco neutro: el amarillo queda para comprar.
const ITEM = "min-h-11 gap-3 rounded-xl px-3 text-sm focus:bg-muted focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground";

export function HeaderSettingsMenu() {
  const { theme, toggleTheme } = useTheme();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const user = useAppSelector(selectUser);
  const location = useLocation();

  const isHome = location.pathname === "/" && !new URLSearchParams(location.search).has("landing-preview");
  const isAuthed = status === "authenticated";
  const isDark = theme === "dark";
  const loginTo = `/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`;

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Staff";
  const initial = firstName.charAt(0).toUpperCase();

  async function handleLogout() {
    await signOut();
    toast.success("Sesión cerrada.");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="store-account-button relative grid size-11 place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={isAuthed ? `Menú de ${firstName}` : "Menú: pedidos, ayuda y apariencia"}
      >
        {isAuthed ? (
          <span className="text-sm font-bold" aria-hidden>{initial}</span>
        ) : (
          <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-1rem)] rounded-2xl border bg-card p-2 shadow-xl">
        {isAuthed && (
          <>
            <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold" aria-hidden>
                {initial}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{firstName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{user?.role ?? "Sesión iniciada"}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/mis-pedidos">
            <HugeIcon icon={PackageIcon} size={18} strokeWidth={2} className="text-muted-foreground" />
            Mis pedidos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/contacto">
            <HugeIcon icon={CustomerSupportIcon} size={18} strokeWidth={2} className="text-muted-foreground" />
            Ayuda y contacto
          </Link>
        </DropdownMenuItem>

        {/* Casilla de menú: el estado (activado o no) lo anuncia el lector de
            pantalla y el ícono coincide siempre con la apariencia aplicada. */}
        <DropdownMenuCheckboxItem
          checked={isDark}
          onCheckedChange={() => toggleTheme()}
          onSelect={(event) => event.preventDefault()}
          className={cn(ITEM, "pr-10 pl-3")}
        >
          <HugeIcon icon={Moon02Icon} size={18} strokeWidth={2} className="text-muted-foreground" />
          Tema oscuro
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        {isAuthed ? (
          <>
            <DropdownMenuItem asChild className={ITEM}>
              <Link to="/admin">
                <HugeIcon icon={DashboardSquare01Icon} size={18} strokeWidth={2} className="text-muted-foreground" />
                Centro de Administración
              </Link>
            </DropdownMenuItem>
            {isAdmin && isHome && (
              <DropdownMenuItem className={ITEM} onSelect={() => dispatch(toggleEditMode())}>
                <HugeIcon icon={Edit02Icon} size={18} strokeWidth={2} className="text-muted-foreground" />
                Editar portada
                {editMode && <span className="ml-auto text-xs font-medium text-primary-2">Activo</span>}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" className={ITEM} onSelect={() => void handleLogout()}>
              <HugeIcon icon={Logout03Icon} size={18} strokeWidth={2} />
              Cerrar sesión
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild className={ITEM}>
            <Link to={loginTo}>
              <HugeIcon icon={User02Icon} size={18} strokeWidth={2} className="text-muted-foreground" />
              Acceso del personal
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
