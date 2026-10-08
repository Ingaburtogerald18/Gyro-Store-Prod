import type { IconSvgElement } from "@hugeicons/react";
import { HugeIcon } from "~/components/ui/icon";
import { Analytics01Icon, Cancel01Icon, Coupon01Icon, CreditCardIcon, DashboardSquare01Icon, File01Icon, Logout03Icon, Package01Icon, PackageIcon, Settings02Icon, ShoppingBag01Icon, ShoppingCart02Icon, Store01Icon, UserCircleIcon, UserMultiple02Icon, UserSettings01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from '@remix-run/react';
import type { User } from '@supabase/supabase-js';
import { motion, useReducedMotion } from 'framer-motion';



import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';

import { NotificationsBell } from '~/components/admin/NotificationsBell';
import { ThemeToggle } from '~/components/layout/ThemeToggle';
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
  SidebarTrigger,
  useSidebar,
} from '~/components/ui/sidebar';
import gyroBag from '~/assets/brand/gyro-bag.png';
import { getSupabaseClient, signOut } from '~/lib/supabase.client';
import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin, selectIsStaff, selectUser, selectUserPhoto } from '~/store/slices/authSlice';
import { useGetMeQuery, useGetConfigQuery } from '~/store/api/sessionApi';
import { BrandLoader } from '~/components/ui/module-loader';
import { getBrandName } from '~/lib/brand';

interface NavItem {
  name: string;
  to: string;
  icon: IconSvgElement;
  end?: boolean;
  external?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operación',
    items: [
      { name: 'Inventario', to: '/admin/inventario', icon: PackageIcon },
      { name: 'Ver tienda', to: '/', icon: Store01Icon, end: true, external: true },
      // Solo vendedor (ver el filtro de rol más abajo): sus facturas de solo
      // lectura, para copiar el número y registrar la venta en Ventas.
      { name: 'Mis Facturas', to: '/admin/mis-facturas', icon: File01Icon },
      { name: 'Ventas', to: '/admin/ventas', icon: ShoppingCart02Icon },
      { name: 'Pedidos web', to: '/admin/pedidos-web', icon: ShoppingBag01Icon },
      { name: 'Cuotas', to: '/admin/cuotas', icon: CreditCardIcon },
    ],
  },
  {
    label: 'Tienda',
    items: [
      { name: 'Catálogo', to: '/admin/catalogo', icon: Package01Icon },
      { name: 'Facturación', to: '/admin/facturacion', icon: File01Icon },
      { name: 'Códigos de descuento', to: '/admin/codigos-descuento', icon: Coupon01Icon },
    ],
  },
  {
    label: 'Análisis y sistema',
    items: [
      { name: 'Reportería', to: '/admin', icon: DashboardSquare01Icon, end: true },
      { name: 'CRM y clientes', to: '/admin/crm', icon: UserMultiple02Icon },
      { name: 'Analítica', to: '/admin/analitica', icon: Analytics01Icon },
      { name: 'Personal', to: '/admin/usuarios', icon: UserSettings01Icon },
      { name: 'Configuración', to: '/admin/configuracion', icon: Settings02Icon },
    ],
  },
];

// ── La foto de perfil ya NO viene de Microsoft ──
// Acá vivía `syncEntraPhoto`: en cada login mandaba el `provider_token` al
// backend, que descargaba la foto de Microsoft Graph y la copiaba a R2. Falló
// más veces de las que funcionó (cuentas sin foto en el tenant, permisos de
// Graph, `provider_token` ausente salvo en el SIGNED_IN inmediato) y el error
// era silencioso a propósito, así que la gente quedaba sin avatar sin saber por
// qué. Ahora cada persona sube la suya en /admin/mi-perfil y el admin puede
// cambiar la de cualquiera desde Personal. Ver server/routes/me.ts.

function AdminSidebar({ isAdmin, role, pathname }: { isAdmin: boolean; role: string | null; pathname: string }) {
  const { data: config } = useGetConfigQuery();
  const { isMobile, setOpenMobile } = useSidebar();

  // Navegación estable: se abre por botón y se cierra al elegir una ruta en móvil.
  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="gap-3 pt-4 pb-6">
        {isMobile && (
          <div className="flex justify-end px-3">
            <Button variant="outline" size="icon" className="size-11" aria-label="Cerrar menú de administración" onClick={() => setOpenMobile(false)}>
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

        {NAV_GROUPS.map((group, groupIdx) => {
          // Quien no es admin solo ve su operación diaria. "Mis Facturas" es
          // la excepción: es EXCLUSIVA del vendedor (el admin ya tiene el
          // módulo completo en "Facturación"), así que no entra en el
          // `isAdmin ? true : …` de abajo.
          const allowedItems = group.items.filter((item) => {
            if (item.name === 'Mis Facturas') return role === 'seller';
            // "Catálogo" lo ve el vendedor en modo LECTURA (ver admin.catalogo.tsx).
            // "CRM y clientes" también es de admin+seller (doc 10 §6).
            return isAdmin ? true : ['Ventas', 'Pedidos web', 'Personal', 'Catálogo', 'CRM y clientes'].includes(item.name);
          });
          if (allowedItems.length === 0) return null;

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
                    : pathname.startsWith(item.to);

                  return (
                    <SidebarMenuItem key={item.name} className="relative">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.name}
                        className="admin-nav-link h-11 px-3 text-sm [&_svg]:size-[18px] md:h-10 group-data-[collapsible=icon]:size-8!"
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

  // ── Sin overlay entre módulos ──
  // Acá vivía un `ModuleLoader` que tapaba el contenido en CADA cambio de ruta,
  // con un mínimo anti-parpadeo de 450 ms y un tope de 6 s. El mínimo se pagaba
  // siempre: con el backend respondiendo en 80 ms, la navegación igual costaba
  // medio segundo de pantalla tapada. Un mínimo artificial no arregla el
  // parpadeo, solo lo convierte en lentitud constante.
  //
  // Lo reemplaza la barra fina de `GlobalProgress` (que aparece recién a los
  // 150 ms, así que en las cargas rápidas no se ve nada) más los skeletons de
  // cada bloque, que ocupan la forma final del contenido. Ver Docs/16.
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

  // Guardia de Rol (UI Leak Fix)
  // Si no es staff (ej: un cliente, o un Entra ID que no está en la lista blanca),
  // bloqueamos el renderizado de la UI de administración.
  if (!isStaff) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive shadow-sm">
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
    // Etiquetas visibles en escritorio; en móvil se abre desde el botón del encabezado.
    <SidebarProvider data-skin="admin" defaultOpen={true}>
      <AdminSidebar isAdmin={isAdmin} role={role} pathname={location.pathname} />

      {/* La barra de progreso NO se monta acá: `root.tsx` ya tiene una para
          toda la app y dos instancias dibujarían dos barras. */}
      <SidebarInset className="relative min-w-0">
        <header className="admin-topbar sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 bg-card/95 px-3 backdrop-blur-md sm:px-6">
          <SidebarTrigger className="size-11 shrink-0 rounded-xl border border-border bg-card text-primary-2" />
          <div className="min-w-0 flex-1">
            <p className="hidden text-xs text-muted-foreground sm:block">Centro de administración</p>
            <p className="truncate font-heading text-sm font-semibold text-foreground">
              {location.pathname === '/admin/mi-perfil' ? 'Mi perfil' : NAV_GROUPS.flatMap(group => group.items).find(item => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.name || 'Administración'}
            </p>
          </div>


          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <NotificationsBell />

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Menú de usuario"
                    className="grid size-11 place-items-center rounded-full border border-border bg-secondary text-primary-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar>
                      <AvatarImage src={profilePhoto ?? user.user_metadata?.avatar_url} alt="" />
                      <AvatarFallback className="uppercase">
                        {user.email?.charAt(0) ?? 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm leading-none font-medium">
                        {authUser?.name || (user.user_metadata?.name as string | undefined) || 'Staff'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* Disponible para TODO el staff: cada persona edita su foto,
                      su nombre a mostrar, su contacto y su cuenta de pagos.
                      No está en el sidebar a propósito — es una pantalla de
                      cuenta, no un módulo del negocio. */}
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <NavLink to="/admin/mi-perfil">
                      <HugeIcon icon={UserCircleIcon} size={16} strokeWidth={2} className="mr-2" />
                      <span>Mi perfil</span>
                    </NavLink>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={handleSignOut}>
                    <HugeIcon icon={Logout03Icon} size={16} strokeWidth={2} className="mr-2" />
                    <span>Cerrar sesión</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Solo opacidad, sin `y`. El desplazamiento vertical al entrar hacía
            parecer que la página reflowea, y además competía con la entrada de
            cada bloque de contenido. Una sola animación de entrada por
            pantalla. */}
        {/* `max-w-[1600px]` + `mx-auto`: sin tope de ancho, en un monitor de
            27" las tablas y los KPIs se estiraban a ~2400 px. Una fila de datos
            de dos metros de ancho es imposible de seguir con la vista, y es lo
            que más delata a una herramienta interna. */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.15, ease: 'easeOut' }}
          className="admin-page mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col px-4 py-5 sm:py-6 lg:px-8 lg:py-8"
        >
          <Outlet />
        </motion.main>
      </SidebarInset>
    </SidebarProvider>
  );
}
