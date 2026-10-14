import { HugeIcon } from "~/components/ui/icon";
import { Cancel01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from '@remix-run/react';
import type { User } from '@supabase/supabase-js';
import { motion, useReducedMotion } from 'framer-motion';



import { AdminHeader } from '~/components/admin/admin-header';
import { allowedNavGroups } from '~/lib/admin-navigation';
import { useLocalPreference } from '~/hooks/use-local-preference';
import { isBoolean } from '~/lib/ui-preferences';
import { Button } from '~/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '~/components/ui/sidebar';
import gyroBag from '~/assets/brand/gyro-bag.png';
import { getSupabaseClient, signOut } from '~/lib/supabase.client';
import { useAppSelector } from '~/state/hooks';
import { selectIsAdmin, selectIsStaff, selectUser, selectUserPhoto } from '~/state/slices/auth-slice';
import { useGetMeQuery, useGetConfigQuery } from '~/state/api/session-api';
import { BrandLoader } from '~/components/ui/module-loader';
import { getBrandName } from '~/lib/brand';

function AdminSidebar({ isAdmin, role, pathname }: { isAdmin: boolean; role: string | null; pathname: string }) {
  const { data: config } = useGetConfigQuery();
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);

  // Navegación estable: se abre por botón y se cierra al elegir una ruta en móvil.
  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="gap-3 pt-4 pb-6">
        {isMobile && (
          <div className="flex justify-end px-3">
            <Button variant="cancel" size="icon" className="size-11" aria-label="Cerrar menú de administración" onClick={() => setOpenMobile(false)}>
              <HugeIcon icon={Cancel01Icon} size={18} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        )}
        <NavLink
          to="/admin"
          aria-label={`Inicio del centro de administración de ${config?.brandName || getBrandName()}`}
          onClick={() => setOpenMobile(false)}
          className="admin-sidebar-brand flex shrink-0 flex-col items-center gap-2 rounded-xl px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:px-2"
        >
          <img
            src={config?.images?.logoStatic || gyroBag}
            alt=""
            height={40}
            decoding="async"
            className="h-10 w-auto max-w-[168px] object-contain group-data-[collapsible=icon]:hidden"
          />
          <img src={gyroBag} alt="" width={28} height={28} className="hidden size-7 object-contain group-data-[collapsible=icon]:block" />
          <span className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
            Centro de administración
          </span>
        </NavLink>

        {allowedNavGroups(isAdmin, role).map((group, groupIdx) => {
          const allowedItems = group.items.filter((item) => !item.external);

          return (
            <SidebarGroup key={group.label} className="px-2 py-1">
              {/* `hidden` en rail: la etiqueta del grupo se recortaba a dos
                  letras ilegibles y dejaba un hueco entre bloques de iconos. */}
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
                {group.label}
              </SidebarGroupLabel>
              {/* Línea separadora sutil entre grupos en modo colapsado (no en el primero) */}
              {groupIdx > 0 && <div className="hidden group-data-[collapsible=icon]:block mx-auto mb-1 w-4 border-t border-border/40" />}
              <SidebarMenu>
                {allowedItems.map((item) => {
                  const isActive = item.end
                    ? pathname === item.to
                    : pathname === item.to || pathname.startsWith(`${item.to}/`);

                  return (
                    <SidebarMenuItem key={item.name} className="relative">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.name}
                        className="admin-nav-link h-11 px-3 text-sm [&_svg]:size-[18px] md:h-10 group-data-[collapsible=icon]:size-9!"
                      >
                        {item.external ? (
                          <a href={item.to} target="_blank" rel="noopener noreferrer">
                            <HugeIcon
                              icon={item.icon}
                              size={16}
                              strokeWidth={2}
                            />
                            <span className="text-sm">{item.name}</span>
                          </a>
                        ) : (
                          <NavLink to={item.to} end={item.end} prefetch="intent" onClick={() => setOpenMobile(false)}>
                            <HugeIcon
                              icon={item.icon}
                              size={16}
                              strokeWidth={2}
                            />
                            <span className="text-sm">{item.name}</span>
                          </NavLink>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>



      <SidebarRail />
    </Sidebar>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useLocalPreference('gyro.admin.sidebar', true, isBoolean);
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const { isLoading: isLoadingMe } = useGetMeQuery(undefined, { skip: !user });
  const { isLoading: isConfigLoading } = useGetConfigQuery();

  const isAdmin = useAppSelector(selectIsAdmin);
  const isStaff = useAppSelector(selectIsStaff);
  const authUser = useAppSelector(selectUser);
  const role = authUser?.role ?? null;
  // Foto y nombre salen de /auth/me (`profiles`), no de user_metadata: es lo que
  // la persona edita en «Mi perfil», y con Entra ese metadata viene vacío.
  const profilePhoto = useAppSelector(selectUserPhoto);

  // Sin overlay entre módulos: la carga la muestran `GlobalProgress` y los
  // esqueletos de cada bloque.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate('/login', { replace: true });
        return;
      }
      setUser(data.session.user);
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      setUser(session.user);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  if (checking || isLoadingMe || isConfigLoading) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
        <BrandLoader text="Cargando interfaz..." />
      </div>
    );
  }

  // Sin rol de personal no se renderiza nada del panel.
  if (!isStaff) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <HugeIcon icon={Settings02Icon} size={36} strokeWidth={2} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Acceso Denegado</h2>
            <p className="text-muted-foreground">
              Esta cuenta no tiene permisos para acceder al centro de administración.
            </p>
          </div>
          <Button onClick={handleSignOut} className="mt-4">
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider data-skin="admin" open={sidebarOpen} onOpenChange={setSidebarOpen} style={{ '--sidebar-width-icon': '3.5rem' } as CSSProperties}>
      <AdminSidebar isAdmin={isAdmin} role={role} pathname={location.pathname} />

      {/* La barra de progreso NO se monta acá: `root.tsx` ya tiene una para
          toda la app y dos instancias dibujarían dos barras. */}
      <SidebarInset className="relative min-w-0">
        <AdminHeader
          isAdmin={isAdmin}
          role={role}
          userId={user?.id ?? ''}
          name={authUser?.name || (user?.user_metadata?.name as string | undefined) || 'Colaborador'}
          email={user?.email ?? ''}
          photo={profilePhoto ?? user?.user_metadata?.avatar_url}
          onSignOut={handleSignOut}
        />

        {/* Solo opacidad: el desplazamiento al entrar parecía un reflow y competía con la entrada de cada bloque. */}
        {/* Tope de 1600 px: en un monitor grande las filas de datos se estiraban hasta no poder seguirlas. */}
        <motion.div
          id="admin-content"
          tabIndex={-1}
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.15, ease: 'easeOut' }}
          className="admin-page mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col px-4 py-6 lg:px-8 lg:py-8"
        >
          <Outlet />
        </motion.div>
      </SidebarInset>
    </SidebarProvider>
  );
}
