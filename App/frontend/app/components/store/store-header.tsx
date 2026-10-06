// Header del catálogo público (Amazon-style): logo · búsqueda (filtra la grilla
// de la home) · carrito con contador animado · acceso (HeaderSettingsMenu).
import { useEffect, useMemo, useRef, useState } from 'react';

import { Link } from '@remix-run/react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Menu01Icon, ShoppingCart02Icon, Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { SearchBar } from '~/components/catalog/search-bar';
import { CategoriesDrawer } from '~/components/store/categories-drawer';
import { CategoryNav } from '~/components/store/category-nav';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { useStoreCatalog, useStoreConfig, useStoreLanding } from '~/hooks/useStoreConfig';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectCartCount, toggleCart } from '~/store/slices/cartSlice';
import { HeaderSettingsMenu } from './header-settings-menu';
import { getBrandName } from '~/lib/brand';
import gyroBag from '~/assets/brand/gyro-bag.png';

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
      className="store-cart-button relative grid h-10 w-10 place-items-center rounded-full border transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-11 sm:w-11"
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
            className="font-spec absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-2xs font-bold tabular-nums text-destructive-foreground ring-2 ring-background shadow-lg"
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

  const headerNavCategories = useMemo(() => {
    if (!landing?.headerCategories || landing.headerCategories.length === 0) {
      return allCategories.slice(0, 7);
    }
    return landing.headerCategories
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 7);
  }, [allCategories, landing?.headerCategories]);

  return (
    <header data-landing-section="navigation" className="store-header sticky top-0 z-40 border-b border-border transition-all">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        {(
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCategoriesOpen(true)}
            aria-label="Ver categorías"
            className="h-9 w-9 shrink-0 text-primary-2 sm:h-10 sm:w-10 md:hidden"
          >
            <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} aria-hidden />
          </Button>
        )}

        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2 rounded-xl py-1 transition-all duration-300 sm:px-2 hover:bg-primary-2/5 motion-safe:active:scale-95"
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
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <CategoryNav categories={headerNavCategories} products={products} />
          </div>

          {<SearchBar className="w-56 shrink-0 lg:w-80" />}
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
              className="h-9 w-9 text-primary-2 sm:h-10 sm:w-10 md:hidden"
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
        categories={allCategories}
        products={products}
      />
    </header>
  );
}
