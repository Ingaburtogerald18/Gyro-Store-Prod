// Header de la tienda. Escritorio: logo, buscador, «Menú», carrito y avatar del personal arriba, y las
// categorías debajo. Celular y tableta: ☰ con todo lo demás, logo, carrito y el buscador en su fila.
import { useEffect, useMemo, useRef } from 'react';

import { Link } from '@remix-run/react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Menu01Icon, ShoppingCart02Icon } from '@hugeicons/core-free-icons';
import { headerCategories, menuCategories } from '~/lib/store-navigation';
import { SearchBar } from '~/components/catalog/search-bar';
import { StoreMenu } from '~/components/storefront/store-menu';
import { CategoryNav } from '~/components/storefront/category-nav';
import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import { useCategoryCounts, useStoreConfig, useStoreLanding } from '~/hooks/use-store-config';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectCartCount, toggleCart } from '~/state/slices/cart-slice';
import { HeaderMenu, StaffMenu } from './header-menus';
import { getBrandName } from '~/lib/brand';
import gyroBag from '~/assets/brand/gyro-bag.png';
import { useMediaQuery } from '~/hooks/use-media-query';

/** Botón del carrito con contador y "pop" al agregar (lee cartSlice). */
function CartButton() {
  const dispatch = useAppDispatch();
  const count = useAppSelector(selectCartCount);
  const controls = useAnimationControls();
  // Con movimiento reducido el contador cambia sin "pop" ni escalas al hover.
  const reduce = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 767px)');
  const prev = useRef(count);

  useEffect(() => {
    if (count > prev.current && !reduce && !mobile) {
      controls.start({ scale: [1, 1.25, 0.95, 1], transition: { duration: 0.4, ease: "easeOut" } });
    }
    prev.current = count;
  }, [count, controls, reduce, mobile]);

  return (
    <motion.button
      animate={controls}
      whileHover={reduce || mobile ? undefined : { scale: 1.06 }}
      whileTap={reduce ? undefined : { scale: mobile ? 0.98 : 0.92 }}
      transition={mobile ? { duration: 0.15 } : undefined}
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
            transition={reduce ? { duration: 0 } : mobile ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 20 }}
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
  const config = useStoreConfig();
  const mobile = useMediaQuery('(max-width: 767px)');
  const reduceMotion = useReducedMotion();
  // Logo del panel. El animado solo si es video y no hay movimiento reducido;
  // si no, el estático (o el animado si es una imagen, p. ej. un GIF/WebP).
  const animated = config?.images?.logoAnimated;
  const animatedIsVideo = Boolean(animated && /\.(webm|mp4|mov|m4v)($|\?)/i.test(animated));
  const logoVideo = animatedIsVideo && !reduceMotion ? animated : undefined;
  const logoImage = config?.images?.logoStatic || (animatedIsVideo ? undefined : animated);
  const counts = useCategoryCounts();
  const landing = useStoreLanding();

  // La misma lista para la fila del escritorio y el ☰: la zona que eligió el dueño, sin las vacías.
  const categories = useMemo(
    () => headerCategories(landing, config?.categories ?? [], counts),
    [landing, config?.categories, counts],
  );
  // El ☰ suma las que tienen productos y no están elegidas para el header (solo en el celular).
  const mobileCategories = useMemo(
    () => menuCategories(landing, config?.categories ?? [], counts),
    [landing, config?.categories, counts],
  );
  const showCategoryRow = categories.length > 0;

  return (
    <header
      data-landing-section="navigation"
      // Sin fila de categorías el header es más bajo: tailwind.css ajusta --store-header-height.
      data-category-row={showCategoryRow ? undefined : 'off'}
      className="store-header sticky top-0 z-40 border-b border-border"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 lg:h-16 lg:gap-4">
        {/* Hasta escritorio: en la tableta, categorías, buscador y menús en una fila quedaban apretados. */}
        <StoreMenu categories={mobile ? mobileCategories : categories}>
          <Button variant="ghost" size="icon" aria-label="Abrir menú" className="-ml-2 size-11 shrink-0 text-primary-2 lg:hidden">
            <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} aria-hidden />
          </Button>
        </StoreMenu>

        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2 rounded-xl py-1 transition-colors hover:bg-primary-2/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Ir al inicio de ${config?.brandName || getBrandName()}`}
        >
          {/* Logo del panel a 40 px de alto y hasta 140 de ancho (recomendado 560×160); sin logo, la bolsa y el nombre. */}
          {logoVideo ? (
            <video
              src={logoVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              aria-hidden
              className="h-10 w-auto max-w-[140px] shrink-0 object-contain object-left"
            />
          ) : logoImage ? (
            <img
              src={logoImage}
              alt=""
              height={40}
              loading="eager"
              decoding="async"
              className="h-10 w-auto max-w-[140px] shrink-0 object-contain object-left"
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

        {/* La búsqueda está a la vista en toda página: es la forma más rápida de llegar a un producto. */}
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <SearchBar className="max-w-2xl" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <HeaderMenu />
          <CartButton />
          <StaffMenu />
        </div>
      </div>

      {showCategoryRow && (
        <div className="mx-auto hidden h-12 max-w-7xl items-start px-4 lg:flex">
          <CategoryNav categories={categories} />
        </div>
      )}

      {/* Celular y tableta: el buscador en su propia fila, sin lupa que haya que descubrir. */}
      <div className="px-4 pb-2 lg:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
