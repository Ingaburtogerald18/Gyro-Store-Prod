import { HugeIcon } from "~/components/ui/icon";
import { ArrowRight01Icon, CustomerSupportIcon, DashboardSquare01Icon, Edit02Icon, Logout03Icon, Moon02Icon, Settings02Icon, Sun01Icon, TruckIcon, User02Icon } from "@hugeicons/core-free-icons";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "@remix-run/react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "~/store/hooks";
import { selectAuthStatus, selectIsAdmin, selectEditMode, selectUser, toggleEditMode } from "~/store/slices/authSlice";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { signOut } from "~/lib/supabase.client";

// Fila estándar del menú: alineada con el estilo DropdownMenuItem del preset Rhea
const ROW =
  "group flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground";

// Contenedor del ícono dentro de una fila del menú (chip cuadrado pequeño).
const CHIP =
  "grid h-6 w-6 shrink-0 place-items-center rounded-md";

/** Interruptor accesible (role="switch") para el tema. Unificado: se usa tanto en
 *  la vista de invitado como en la autenticada (antes había dos botones distintos). */
function ThemeSwitch({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <div className={cn(ROW, "justify-between cursor-pointer")} onClick={onToggle}>
      <span className="flex items-center gap-2">
        {isDark ? <HugeIcon icon={Moon02Icon} size={16} strokeWidth={2} className="text-muted-foreground" /> : <HugeIcon icon={Sun01Icon} size={16} strokeWidth={2} className="text-muted-foreground" />}
        Apariencia
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={`Cambiar a tema ${isDark ? "claro" : "oscuro"}`}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isDark ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <motion.span
          aria-hidden
          animate={{ x: isDark ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="absolute left-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-background shadow"
        >
          {isDark ? (
            <HugeIcon icon={Moon02Icon} size={12} strokeWidth={2} className="text-primary" />
          ) : (
            <HugeIcon icon={Sun01Icon} size={12} strokeWidth={2} className="text-warning" />
          )}
        </motion.span>
      </button>
    </div>
  );
}

export function HeaderSettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const user = useAppSelector(selectUser);
  const location = useLocation();

  const isHome = location.pathname === "/";
  const isAuthed = status === "authenticated";
  const isDark = theme === "dark";
  const loginTo = `/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`;

  // Nombre corto y etiqueta del rol para el encabezado del menú autenticado.
  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Staff";
  const initial = firstName.charAt(0).toUpperCase();
  const roleLabel = user?.role ? user.role.toUpperCase() : "Sesión iniciada";

  async function handleLogout() {
    setIsOpen(false);
    await signOut();
    toast.success("Sesión cerrada.");
  }

  function comingSoon() {
    setIsOpen(false);
    toast.info("Próximamente disponible.");
  }

  // Cierra el menú al hacer clic afuera.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Disparador premium: píldora con borde; muestra la INICIAL del colaborador
          cuando hay sesión (avatar), o el icono de usuario cuando es invitado. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-full border shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isAuthed
            ? "border-primary/30 bg-primary/10 hover:bg-primary/15"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
        aria-label="Menú de cuenta y configuración"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {isAuthed ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary ring-1 ring-primary/30">
            {initial}
          </span>
        ) : (
          <HugeIcon icon={Settings02Icon} size={20} strokeWidth={2} />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] origin-top-right overflow-hidden rounded-2xl border bg-card shadow-xl backdrop-blur-xl"
          >
            <div className="flex flex-col p-2">
              {/* ── VISTA INVITADO ── */}
              {!isAuthed && (
                <>
                  <div className="px-2.5 pb-2 pt-1">
                    <p className="text-sm font-semibold text-foreground">Tu cuenta</p>
                    <p className="text-xs text-muted-foreground">Ajustes y pedidos</p>
                  </div>

                  {/* Bloque destacado: seguimiento de pedido, con jerarquía visual
                      propia (borde + fondo acentuado) para que no se sienta plano. */}
                  <button
                    onClick={comingSoon}
                    className="group mb-1 flex items-center gap-3 rounded-xl border bg-primary/5 px-2.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
                    role="menuitem"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                      <HugeIcon icon={TruckIcon} size={20} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">Rastrear mi pedido</span>
                      <span className="block text-xs text-muted-foreground">Consulta el estado de tu envío</span>
                    </span>
                    <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>

                  <button
                    onClick={comingSoon}
                    className={cn(ROW, "text-muted-foreground hover:bg-muted hover:text-foreground")}
                    role="menuitem"
                  >
                    <span className={cn(CHIP, "bg-muted text-muted-foreground group-hover:text-foreground")}>
                      <HugeIcon icon={CustomerSupportIcon} size={16} strokeWidth={2} />
                    </span>
                    Ayuda y FAQs
                  </button>

                  <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />

                  <div className="my-1 h-px bg-border" />

                  <Link
                    to={loginTo}
                    onClick={() => setIsOpen(false)}
                    className={ROW}
                    role="menuitem"
                  >
                    <HugeIcon icon={User02Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
                    Iniciar Sesión
                  </Link>
                </>
              )}

              {/* ── VISTA ADMINISTRADOR / COLABORADOR ── */}
              {isAuthed && (
                <>
                  <div className="mb-2 flex items-center gap-3 rounded-md px-2 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
                      {initial}
                    </span>
                    <span className="min-w-0 flex flex-col">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {firstName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
                    </span>
                  </div>
                  <div className="-mx-1 my-1 h-px bg-border" />

                  <Link
                    to="/admin"
                    onClick={() => setIsOpen(false)}
                    className={ROW}
                    role="menuitem"
                  >
                    <HugeIcon icon={DashboardSquare01Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
                    Centro de Administración
                  </Link>

                  {isAdmin && isHome && (
                    <button
                      onClick={() => {
                        dispatch(toggleEditMode());
                        setIsOpen(false);
                      }}
                      className={ROW}
                      role="menuitem"
                    >
                      <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
                      Modo Edición {editMode && <span className="ml-auto text-xs font-medium text-primary">Activo</span>}
                    </button>
                  )}

                  <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />

                  <div className="-mx-1 my-1 h-px bg-border" />

                  <button
                    onClick={handleLogout}
                    className={cn(ROW, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                    role="menuitem"
                  >
                    <HugeIcon icon={Logout03Icon} size={16} strokeWidth={2} />
                    Cerrar Sesión
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
