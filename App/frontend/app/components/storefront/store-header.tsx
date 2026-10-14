// Header del catálogo público (Amazon-style): logo · búsqueda (filtra la grilla
// de la home) · carrito con contador animado · acceso (HeaderSettingsMenu).
import { useEffect, useMemo, useRef, useState } from 'react';

import { Link } from '@remix-run/react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { GridViewIcon, ShoppingCart02Icon, Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { categoryMode } from '@shared/schemas';
import { inCategory } from '~/components/storefront/category-nav';
import { SearchBar } from '~/components/catalog/search-bar';
import { CategoriesDrawer } from '~/components/storefront/categories-drawer';
import { CategoryNav } from '~/components/storefront/category-nav';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { useStoreCatalog, useStoreConfig, useStoreLanding } from '~/hooks/use-store-config';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectCartCount, toggleCart } from '~/state/slices/cart-slice';
import { HeaderSettingsMenu } from './header-settings-menu';
import { getBrandName } from '~/lib/brand';
import gyroBag from '~/assets/brand/gyro-bag.png';

/** Botón del carrito con contador y "pop" al agregar (lee cartSlice). */
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
      className="store-cart-button relative grid size-11 place-items-center rounded-full border transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-2xs font-bold tabular-nums text-destructive-foreground ring-2 ring-background"
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
  const reduceMotion = useReducedMotion();
  // Logo del panel. El animado solo si es video y no hay movimiento reducido;
  // si no, el estático (o el animado si es una imagen, p. ej. un GIF/WebP).
  const animated = config?.images?.logoAnimated;
  const animatedIsVideo = Boolean(animated && /\.(webm|mp4|mov|m4v)($|\?)/i.test(animated));
  const logoVideo = animatedIsVideo && !reduceMotion ? animated : undefined;
  const logoImage = config?.images?.logoStatic || (animatedIsVideo ? undefined : animated);
  const products = useStoreCatalog();
  const landing = useStoreLanding();

  const allCategories = useMemo(
    () => config?.categories ?? [],
    [config?.categories],
  );

  // Modo de la zona (auto / elegidas / oculta), compatible con configuraciones
  // viejas sin modo. «Automático» = las categorías que tienen productos.
  const mode = categoryMode(landing?.headerCategoriesMode, landing?.headerCategories);
  const headerNavCategories = useMemo(() => {
    if (mode === 'hidden') return [];
    if (mode === 'auto') {
      const withProducts = allCategories.filter((c) => products.length === 0 || products.some((p) => inCategory(p, c)));
      return withProducts.slice(0, 7);
    }
    return (landing?.headerCategories ?? [])
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 7);
  }, [mode, allCategories, products, landing?.headerCategories]);
  const showCategories = headerNavCategories.length > 0;

  return (
    <header data-landing-section="navigation" className="store-header sticky top-0 z-40 border-b border-border transition-all">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        {/* Categorías en panel hasta escritorio ancho: en tablet, la fila de
            categorías y el buscador se tapaban entre sí. */}
        {showCategories && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCategoriesOpen(true)}
            aria-label="Ver categorías"
            className="size-11 shrink-0 text-primary-2 lg:hidden"
          >
            <HugeIcon icon={GridViewIcon} size={20} strokeWidth={2} aria-hidden />
          </Button>
        )}

        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2 rounded-xl py-1 transition-colors hover:bg-primary-2/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Ir al inicio de ${config?.brandName || getBrandName()}`}
        >
          {/* Logo: el que se sube en el panel (Recursos de imágenes → logo
              estático o animado). Se muestra a 40px de alto y hasta 140px de
              ancho (formato recomendado 560×160, 3.5:1). Si el panel no tiene
              logo, va la bolsa del logo nuevo con el nombre en texto. */}
          {logoVideo ? (
            <video
              src={logoVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              aria-hidden
              className="h-9 w-auto max-w-24 shrink-0 object-contain object-left sm:h-10 sm:max-w-[140px]"
            />
          ) : logoImage ? (
            <img
              src={logoImage}
              alt=""
              height={40}
              loading="eager"
              decoding="async"
              className="h-9 w-auto max-w-24 shrink-0 object-contain object-left sm:h-10 sm:max-w-[140px]"
            />
          ) : (
            <>
              <img
                src={gyroBag}
                alt=""
                width={40}
                height={40}
                loading="eager"
                decoding="async"
                className="size-10 shrink-0 transition-transform duration-300 motion-safe:group-hover:-rotate-6"
              />
              <span className="hidden font-heading text-lg font-extrabold tracking-tight whitespace-nowrap sm:inline">
                {config?.brandName || getBrandName()}
              </span>
            </>
          )}
        </Link>

        {/* Contenedor central: categorías + búsqueda siempre visible. La búsqueda
            vivía tras un ícono y solo en la home; en una tienda es la forma más
            rápida de llegar a un producto, así que está a la vista en toda página. */}
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex">
          {showCategories && (
            <div className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
              <CategoryNav categories={headerNavCategories} products={products} />
            </div>
          )}

          <SearchBar className="w-full max-w-sm shrink lg:w-72 lg:shrink-0 xl:w-80" />
        </div>
        {/* Zona derecha */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          {(
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileSearchOpen((o) => !o)}
              aria-label={mobileSearchOpen ? 'Cerrar búsqueda' : 'Buscar productos'}
              aria-expanded={mobileSearchOpen}
              className="size-11 text-primary-2 md:hidden"
            >
              <HugeIcon
                icon={mobileSearchOpen ? Cancel01Icon : Search01Icon}
                size={20}
                strokeWidth={2}
                aria-hidden
              />
            </Button>
          )}
          {<CartButton />}
          {<HeaderSettingsMenu />}
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="px-4 pb-3 md:hidden">
          <SearchBar />
        </div>
      )}


      <CategoriesDrawer
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={mode === 'custom' ? headerNavCategories : allCategories}
        products={products}
      />
    </header>
  );
}
