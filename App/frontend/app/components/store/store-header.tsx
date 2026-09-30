// Header del catálogo público (Amazon-style): logo · búsqueda (filtra la grilla
// de la home) · carrito con contador animado · acceso (HeaderSettingsMenu).
import { useEffect, useMemo, useRef, useState } from 'react';

import { Link, useLocation } from '@remix-run/react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Menu01Icon, ShoppingCart02Icon, Search01Icon, Cancel01Icon, Edit02Icon } from '@hugeicons/core-free-icons';
import { SearchBar } from '~/components/catalog/search-bar';
import { CategoriesDrawer } from '~/components/store/categories-drawer';
import { CategoryNav, inCategory } from '~/components/store/category-nav';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { useGetCatalogQuery, useGetLandingConfigQuery, useUpdateLandingConfigMutation } from '~/store/api/storefrontApi';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectCartCount, toggleCart } from '~/store/slices/cartSlice';
import { selectIsAdmin, selectEditMode, toggleEditMode } from '~/store/slices/authSlice';
import { selectDraftLandingConfig, initBuilderSession, clearBuilderSession } from '~/store/slices/builderSlice';
import { InlineCategoryNavEditor } from './inline-category-nav-editor';
import { HeaderSettingsMenu } from './header-settings-menu';
import { getBrandName } from '~/lib/brand';
import { cn } from '~/lib/utils';

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
  const { pathname } = useLocation();
  const showSearch = pathname === '/';
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const reduceMotion = useReducedMotion();

  const { data: config } = useGetConfigQuery();
  const { data: products = [] } = useGetCatalogQuery();
  const { data: landing } = useGetLandingConfigQuery();
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const draftLanding = useAppSelector(selectDraftLandingConfig);
  const dispatch = useAppDispatch();
  const [updateLanding, { isLoading: isSaving }] = useUpdateLandingConfigMutation();

  // Inicializar borrador al entrar al modo edición
  useEffect(() => {
    if (editMode && landing && !draftLanding) {
      dispatch(initBuilderSession(landing));
    }
  }, [editMode, landing, draftLanding, dispatch]);

  const allCategories = useMemo(
    () => config?.categories ?? [],
    [config?.categories],
  );

  const headerNavCategories = useMemo(() => {
    if (!landing?.headerCategories || landing.headerCategories.length === 0) {
      return allCategories.slice(0, 7);
    }
    return landing.headerCategories
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 7);
  }, [allCategories, landing?.headerCategories]);

  const handleSave = async () => {
    if (!draftLanding) return;
    try {
      await updateLanding(draftLanding).unwrap();
      dispatch(toggleEditMode());
      dispatch(clearBuilderSession());
    } catch {
      // Error manejado por RTK Query globalmente o ignorado
    }
  };

  const handleCancel = () => {
    dispatch(toggleEditMode());
    dispatch(clearBuilderSession());
  };

  return (
    <header className={cn(
      "sticky top-0 z-40 bg-card/90 backdrop-blur-xl transition-all",
      editMode ? "border-b border-primary/20 border-t-[4px] border-t-primary" : "border-b border-border"
    )}>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        {!editMode && (
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

        <Link
          to="/"
          className={cn("group flex shrink-0 items-center gap-3 rounded-xl px-2 py-1 transition-all duration-300", 
            !editMode && "hover:bg-primary/5 active:scale-95"
          )}
          aria-label={`Ir al inicio de ${config?.brandName || getBrandName()}`}
          onClick={(e) => {
            if (editMode) {
               e.preventDefault();
            }
          }}
        >
          {(() => {
            const logoSrc = config?.images?.logoStatic || config?.images?.logoAnimated;
            if (!logoSrc) return (
              <span className="font-bold text-lg tracking-tight">
                {config?.brandName || getBrandName()}
              </span>
            );
            const isVideo = !reduceMotion &&
              (config?.images?.logoAnimated?.match(/\.(webm|mp4|mov|m4v)($|\?)/i) ||
                config?.images?.logoAnimated?.includes('video'));
            return isVideo ? (
              <video
                src={config?.images?.logoAnimated}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                aria-hidden
                className="h-10 max-w-[160px] shrink-0 object-contain object-left transition-all duration-300 group-hover:brightness-110"
                style={{ minWidth: '40px' }}
              />
            ) : (
              <img
                src={logoSrc}
                alt={config?.brandName || getBrandName()}
                loading="eager"
                decoding="async"
                className="h-10 max-w-[160px] shrink-0 object-contain object-left transition-all duration-300 group-hover:brightness-110"
                style={{ minWidth: '40px' }}
              />
            );
          })()}
        </Link>

        {/* Contenedor central (Categorías + Búsqueda Expandible) */}
        <div className="hidden flex-1 items-center justify-end gap-1 md:flex relative">
          
          {/* Categorías (fade out when search is active) */}
          <div className={cn(
            "flex flex-1 items-center gap-1 transition-all duration-300 ease-out", 
            isSearchExpanded && !editMode ? "opacity-0 -translate-y-1 pointer-events-none absolute left-0" : "opacity-100 translate-y-0 relative"
          )}>
            {editMode ? (
              <InlineCategoryNavEditor allCategories={allCategories} />
            ) : (
              <CategoryNav categories={headerNavCategories} products={products} />
            )}
          </div>

          {/* Search Bar - Desktop Expandible */}
          {!editMode && showSearch && (
            <div className={cn(
              "flex items-center justify-end transition-all duration-300 ease-out",
              isSearchExpanded ? "w-full max-w-xl opacity-100 absolute right-0" : "w-10 opacity-100 relative"
            )}>
              {isSearchExpanded ? (
                <SearchBar 
                  className="w-full shadow-lg" 
                  autoFocus
                  onBlur={() => setIsSearchExpanded(false)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsSearchExpanded(true)}
                  aria-label="Abrir búsqueda"
                >
                  <HugeIcon icon={Search01Icon} size={20} strokeWidth={2} />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Zona derecha */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {editMode && (
            <div className="flex items-center gap-3 bg-primary/10 pl-3 pr-1 py-1 rounded-full border border-primary/20">
              <div className="hidden sm:flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                </span>
                <span className="text-xs font-bold tracking-wider text-primary">MODO EDICIÓN</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCancel}
                className="h-8 rounded-full px-4 text-xs font-semibold text-primary hover:bg-primary/10"
                disabled={isSaving}
              >
                Descartar
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleSave}
                className="h-8 rounded-full px-4 text-xs font-semibold shadow-sm"
                disabled={isSaving}
              >
                {isSaving ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          )}
          
          {!editMode && showSearch && (
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
          {!editMode && <CartButton />}
          {!editMode && <HeaderSettingsMenu />}
        </div>
      </div>

      {!editMode && showSearch && mobileSearchOpen && (
        <div className="px-4 pb-3 md:hidden">
          <SearchBar />
        </div>
      )}

      <CategoriesDrawer
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={allCategories}
        products={products}
      />
    </header>
  );
}
