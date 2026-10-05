// Header del catálogo público (Amazon-style): logo · búsqueda (filtra la grilla
// de la home) · carrito con contador animado · acceso (HeaderSettingsMenu).
import { useEffect, useMemo, useRef, useState } from 'react';

import { Link } from '@remix-run/react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Menu01Icon, ShoppingCart02Icon, Search01Icon, Cancel01Icon, Edit02Icon } from '@hugeicons/core-free-icons';
import { SearchBar } from '~/components/catalog/search-bar';
import { CategoriesDrawer } from '~/components/store/categories-drawer';
import { CategoryNav, inCategory } from '~/components/store/category-nav';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { useGetCatalogQuery, useUpdateLandingConfigMutation } from '~/store/api/storefrontApi';
import { useStoreConfig, useStoreLanding } from '~/hooks/useStoreConfig';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectCartCount, toggleCart } from '~/store/slices/cartSlice';
import { selectIsAdmin, selectEditMode, toggleEditMode } from '~/store/slices/authSlice';
import { selectDraftLandingConfig, initBuilderSession, clearBuilderSession } from '~/store/slices/builderSlice';
import { InlineCategoryNavEditor } from './inline-category-nav-editor';
import { HeaderSettingsMenu } from './header-settings-menu';
import { getBrandName } from '~/lib/brand';
import gyroBag from '~/assets/brand/gyro-bag.png';
import { cn } from '~/lib/utils';

/** Botón del carrito con contador y "pop" al agregar. Comparte fuente de verdad
 *  con el resto de la app (cartSlice); reemplaza al botón estático. */
function CartButton() {
  const dispatch = useAppDispatch();
  const count = useAppSelector(selectCartCount);
  const controls = useAnimationControls();
  // Con movimiento reducido el contador cambia sin "pop" ni escalas al hover.
  const reduce = useReducedMotion();
  const prev = useRef(count);

  useEffect(() => {
    if (count > prev.current && !reduce) {
      controls.start({ scale: [1, 1.25, 0.95, 1], transition: { duration: 0.4, ease: "easeOut" } });
    }
    prev.current = count;
  }, [count, controls, reduce]);

  return (
    <motion.button
      animate={controls}
      whileHover={reduce ? undefined : { scale: 1.06 }}
      whileTap={reduce ? undefined : { scale: 0.92 }}
      onClick={() => dispatch(toggleCart())}
      aria-label={count > 0 ? `Abrir carrito, ${count} artículo${count === 1 ? "" : "s"}` : "Abrir carrito"}
      className="relative grid h-10 w-10 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary-2/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2"
    >
      <HugeIcon icon={ShoppingCart02Icon} size={20} strokeWidth={2} aria-hidden />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 20 }}
            // ring-background lo separa del header con un halo del color de fondo → "flota".
            className="font-spec absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-2xs font-bold tabular-nums text-primary-foreground ring-2 ring-background shadow-lg"
          >
            {count > 99 ? '99+' : count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function StoreHeader() {

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const config = useStoreConfig();
  const { data: products = [] } = useGetCatalogQuery();
  const landing = useStoreLanding();
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
      toast.success('Cambios de la tienda guardados.');
    } catch (err) {
      // Antes era un catch vacío: el botón volvía a su estado y el admin creía
      // que se había guardado. El borrador se conserva para reintentar.
      const message =
        (err as { data?: { error?: string } })?.data?.error ??
        'No se pudieron guardar los cambios. Probá de nuevo.';
      toast.error(message);
    }
  };

  const handleCancel = () => {
    dispatch(toggleEditMode());
    dispatch(clearBuilderSession());
  };

  return (
    <header className={cn(
      "store-header sticky top-0 z-40 transition-all",
      editMode ? "border-b border-primary-2/20 border-t-[4px] border-t-primary" : "border-b border-border"
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
          className={cn("group flex shrink-0 items-center gap-2 rounded-xl px-2 py-1 transition-all duration-300", 
            !editMode && "hover:bg-primary/5 active:scale-95"
          )}
          aria-label={`Ir al inicio de ${config?.brandName || getBrandName()}`}
          onClick={(e) => {
            if (editMode) {
               e.preventDefault();
            }
          }}
        >
          {/* Logo de la tienda: la bolsa del logo nuevo + el nombre en texto.
              El logo completo (nombre curvo arriba de la mascota) no se lee a
              40px, así que en el header va esta versión horizontal. Se sirve
              desde el bundle y no desde la config del panel: es la marca fija
              de la tienda, no un recurso que cambie por campaña. */}
          <img
            src={gyroBag}
            alt=""
            width={40}
            height={40}
            loading="eager"
            decoding="async"
            className="size-10 shrink-0 transition-transform duration-300 motion-safe:group-hover:-rotate-6"
          />
          <span className="font-heading text-lg font-extrabold tracking-tight whitespace-nowrap">
            {config?.brandName || getBrandName()}
          </span>
        </Link>

        {/* Contenedor central: categorías + búsqueda siempre visible. La búsqueda
            vivía tras un ícono y solo en la home; en una tienda es la forma más
            rápida de llegar a un producto, así que está a la vista en toda página. */}
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {editMode ? (
              <InlineCategoryNavEditor allCategories={allCategories} />
            ) : (
              <CategoryNav categories={headerNavCategories} products={products} />
            )}
          </div>

          {!editMode && <SearchBar className="w-56 shrink-0 lg:w-72" />}
        </div>
        {/* Zona derecha */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {editMode && (
            <div className="flex items-center gap-3 bg-primary/10 pl-3 pr-1 py-1 rounded-full border border-primary-2/20">
              <div className="hidden sm:flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                </span>
                <span className="text-xs font-bold tracking-wider text-primary-2">MODO EDICIÓN</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCancel}
                className="h-8 rounded-full px-4 text-xs font-semibold text-primary-2 hover:bg-primary/10"
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
                {isSaving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          )}
          
          {!editMode && (
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

      {!editMode && mobileSearchOpen && (
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
