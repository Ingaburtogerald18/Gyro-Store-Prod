// Header del catálogo público (Amazon-style): logo · búsqueda (filtra la grilla
// de la home) · carrito con contador animado · acceso (HeaderSettingsMenu).
import { useEffect, useMemo, useRef, useState } from 'react';

import { Link, useLocation } from '@remix-run/react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Menu01Icon, ShoppingCart02Icon, Search01Icon, Cancel01Icon, Edit02Icon } from '@hugeicons/core-free-icons';
import { SearchBar } from '~/components/catalog/search-bar';
import { CategoriesDrawer } from '~/components/store/categories-drawer';
import { CategoryNav, inCategory } from '~/components/store/category-nav';
import { CategoryNavEditorDialog } from '~/components/store/category-nav-editor-dialog';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { useGetCatalogQuery, useGetLandingConfigQuery } from '~/store/api/storefrontApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectCartCount, toggleCart } from '~/store/slices/cartSlice';
import { HeaderSettingsMenu } from './header-settings-menu';
import { getBrandName } from '~/lib/brand';

/** Botón del carrito con contador y "pop" al agregar. Comparte fuente de verdad
 *  con el resto de la app (cartSlice); reemplaza al botón estático. */
function CartButton() {
  const dispatch = useAppDispatch();
  const count = useAppSelector(selectCartCount);
  const controls = useAnimationControls();
  const prev = useRef(count);

  useEffect(() => {
    if (count > prev.current) {
      controls.start({ scale: [1, 1.25, 0.95, 1], transition: { duration: 0.4, ease: "easeOut" } });
    }
    prev.current = count;
  }, [count, controls]);

  return (
    <motion.button
      animate={controls}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => dispatch(toggleCart())}
      aria-label={count > 0 ? `Abrir carrito, ${count} artículo${count === 1 ? "" : "s"}` : "Abrir carrito"}
      className="relative grid h-10 w-10 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <HugeIcon icon={ShoppingCart02Icon} size={20} strokeWidth={2} aria-hidden />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 20 }}
            // ring-background lo separa del header con un halo del color de fondo → "flota".
            className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold tabular-nums text-background ring-2 ring-background shadow-lg"
          >
            {count > 99 ? '99+' : count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function StoreHeader() {
  // La búsqueda filtra la grilla de la home; en la ficha, el combo o contacto no
  // hay nada que filtrar, así que ahí no se pinta (y no ocupa el ancho).
  const { pathname } = useLocation();
  const showSearch = pathname === '/';
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // Controla si la barra de búsqueda móvil está visible. En escritorio no
  // interviene: la barra siempre se pinta en su fila propia.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [navEditorOpen, setNavEditorOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // El catálogo alimenta la muestra del mega-menú. RTK Query lo cachea, así que
  // en la home (que ya lo trae por SSR) esto no dispara una segunda descarga
  // visible para el usuario.
  const { data: config } = useGetConfigQuery();
  const { data: products = [] } = useGetCatalogQuery();

  const { data: landing } = useGetLandingConfigQuery();
  // La feature "Editar Navbar" (edición in-situ de categorías) quedó a medio
  // construir: el estado `editing` nunca se agregó al uiSlice. Se deja DORMIDA
  // (siempre false: el botón nunca aparece) para que compile, sin borrar el WIP.
  // Decidir luego: completarla (agregar `editing` al slice + su acción) o quitarla.
  const isEditing = false;

  // Mostrar todas las categorías configuradas
  const allCategories = useMemo(
    () => config?.categories ?? [],
    [config?.categories],
  );

  // Categorías seleccionadas para el navbar de escritorio
  const headerNavCategories = useMemo(() => {
    if (!landing?.headerCategories || landing.headerCategories.length === 0) {
      return allCategories.slice(0, 7); // Default limit
    }
    return landing.headerCategories
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 7); // Limit to 7 to prevent breaking the design
  }, [allCategories, landing?.headerCategories]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-28 max-w-6xl items-center gap-3 px-4">
        {/* Hamburger: solo en móvil, a la IZQUIERDA del logo */}
        {allCategories.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCategoriesOpen(true)}
            aria-label="Ver categorías"
            className="h-10 w-10 shrink-0 md:hidden"
          >
            <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} aria-hidden />
          </Button>
        )}

        {/* El logo ahora tiene transición y efecto hover */}
        <Link
          to="/"
          className="group flex shrink-0 items-center gap-3 rounded-xl px-2 py-1 transition-all duration-300 hover:bg-primary/5 active:scale-95"
          aria-label={`Ir al inicio de ${config?.brandName || getBrandName()}`}
        >
          {config?.images?.logoHeader ? (
            /* Logo horizontal dedicado del header: se muestra SOLO (un banner
               apaisado ya incluye la marca, así que no repetimos el texto). */
            <img
              src={config.images.logoHeader}
              alt={config.brandName || getBrandName()}
              loading="lazy"
              decoding="async"
              className="h-20 w-auto max-w-[420px] shrink-0 object-contain transition-all duration-300 group-hover:brightness-110"
            />
          ) : (
            <>
              {/* Sin logo horizontal: logo cuadrado/animado (si hay) + texto de marca */}
              {(config?.images?.logoStatic || config?.images?.logoAnimated) &&
                (!reduceMotion &&
                (config.images.logoAnimated?.match(/\.(webm|mp4|mov|m4v)($|\?)/i) ||
                  config.images.logoAnimated?.includes('video')) ? (
                  <video
                    src={config.images.logoAnimated}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    aria-hidden
                    className="h-24 w-auto max-w-[300px] shrink-0 object-contain transition-all duration-300 group-hover:brightness-110"
                  />
                ) : (
                  <img
                    src={config.images.logoStatic || config.images.logoAnimated}
                    alt={config.brandName || getBrandName()}
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-auto max-w-[300px] shrink-0 object-contain transition-all duration-300 group-hover:brightness-110"
                  />
                ))}

              {/* Texto de marca al lado del logo */}
              <span className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground transition-all group-hover:brightness-125">
                Gyro <span className="text-primary">Store</span>
              </span>
            </>
          )}
        </Link>

        {/* Búsqueda alineada a la derecha en escritorio; en móvil baja a su propia fila. */}
        {showSearch && (
          <div className="hidden flex-1 justify-end md:flex pr-4">
            <SearchBar className="max-w-md" />
          </div>
        )}

        {/* Zona derecha: Carrito Animado, Búsqueda móvil y Menú de Ajustes/Perfil */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {/* 🔍 Ícono de búsqueda: solo móvil. Alterna visibilidad de la barra inferior. */}
          {showSearch && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileSearchOpen((o) => !o)}
              aria-label={mobileSearchOpen ? 'Cerrar búsqueda' : 'Buscar productos'}
              aria-expanded={mobileSearchOpen}
              className="h-10 w-10 md:hidden"
            >
              <HugeIcon
                icon={mobileSearchOpen ? Cancel01Icon : Search01Icon}
                size={20}
                strokeWidth={2}
                aria-hidden
              />
            </Button>
          )}
          <CartButton />
          <HeaderSettingsMenu />
        </div>
      </div>

      {/* Barra de búsqueda móvil: se muestra al tocar el ícono de lupa.
          En escritorio NUNCA se renderiza (md:hidden la oculta siempre). */}
      {showSearch && mobileSearchOpen && (
        <div className="px-4 pb-3 md:hidden">
          <SearchBar />
        </div>
      )}

      {/* Mega-menú de escritorio: lista estática de categorías. Se oculta en
          móvil porque ahí existe el CategoriesDrawer. */}
      <div className="mx-auto flex max-w-6xl items-center relative">
        <CategoryNav categories={headerNavCategories} products={products} />
        
        {isEditing && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:block">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full border-dashed border-primary/50 text-primary shadow-sm hover:border-primary"
              onClick={() => setNavEditorOpen(true)}
            >
              <HugeIcon icon={Edit02Icon} size={14} />
              Editar Navbar
            </Button>
          </div>
        )}
      </div>

      <CategoryNavEditorDialog 
        open={navEditorOpen} 
        onOpenChange={setNavEditorOpen}
        allCategories={allCategories}
        headerCategories={landing?.headerCategories || []}
        landing={landing}
      />

      <CategoriesDrawer
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={allCategories}
        products={products}
      />
    </header>
  );
}
