// ProductCard — foto, nombre, uno o dos datos con su etiqueta, precio,
// disponibilidad en palabras y la acción. La tarjeta entera es un enlace a la
// ficha; la acción va aparte (una tarjeta = un solo enlace enfocable).
//
// Acciones según el producto:
//   · Disponible, una combinación → «Agregar» directo al carrito.
//   · Disponible, varias          → «Elegir opciones» (selector rápido).
//   · Agotado o sin stock verificable → «Consultar por WhatsApp», sin inventar
//     existencias ni prometer avisos automáticos.
import { HugeIcon } from "~/components/ui/icon";
import { ImageNotFound01Icon, ShoppingCart02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { Link } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';

import type { CatalogProduct } from '@shared/schemas';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { QuickAddSheet } from '~/components/product/quick-add-sheet';
import { useStoreConfig } from '~/hooks/useStoreConfig';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useAppDispatch } from '~/store/hooks';
import { addItem, openCart } from '~/store/slices/cartSlice';
import { AVAILABILITY_LABEL } from '~/lib/purchase';
import { cn } from "~/lib/utils"
import { buildWhatsappUrl, formatCordobas, getProductUrl, productWhatsappMessage } from "~/lib/formatters";

/**
 * Hasta dos datos de la ficha, CON su etiqueta ("Driver: 10 mm"). Los valores
 * largos son explicación, no dato: van a la ficha. Sin specs, nada.
 */
export function cardSpecs(specs: CatalogProduct['specs'], max = 2) {
  return specs
    .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
    .filter((s) => s.label && s.value && s.value.length <= 18 && s.label.length <= 22)
    .slice(0, max);
}

export function ProductCard({
  product,
  layout = 'grid',
  index = 0,
}: {
  product: CatalogProduct;
  layout?: 'grid' | 'list';
  /** Posición en la grilla: las primeras 4 fotos cargan sin lazy. */
  index?: number;
}) {
  const dispatch = useAppDispatch();
  const config = useStoreConfig();
  const reduce = useReducedMotion();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // El sheet se monta recién en el primer uso: con 40 tarjetas en pantalla, 40
  // portales vacíos son 40 nodos y 40 suscripciones que nadie pidió.
  const [quickAddMounted, setQuickAddMounted] = useState(false);
  // onLoad puede ocurrir antes de hidratar: comprobar también la imagen del DOM.
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const image = product.images[0];
  useEffect(() => {
    const img = imageRef.current;
    setImageLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [image]);
  // Segunda foto: si existe, hace crossfade al pasar el mouse.
  const hoverImage = product.images[1];
  const available = product.availability === 'available';
  const soldOut = product.availability === 'sold_out';
  const compareAt = product.compareAtPrice ?? 0;
  const onSale = compareAt > product.price;
  const discountPct = onSale ? Math.round((1 - product.price / compareAt) * 100) : 0;
  const isList = layout === 'list';
  const currency = config?.currency;
  const productUrl = getProductUrl(product.id, product.name);
  const specs = cardSpecs(product.specs);
  const needsChoice = product.variantCount > 1 || product.singleVariant === undefined;

  function handleCta(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!available) return;
    // Con más de una combinación hay que elegir variante: selector, no carrito.
    if (needsChoice) {
      setQuickAddMounted(true);
      setQuickAddOpen(true);
      return;
    }
    dispatch(
      addItem({
        catalogId: product.id,
        name: product.name,
        variantName: product.singleVariant ?? '',
        price: product.price,
        image: image || '',
        quantity: 1,
        maxQuantity: product.stock > 0 ? product.stock : undefined,
      }),
    );
    dispatch(openCart());
  }

  // Consulta por WhatsApp: no requiere elegir opciones ni promete stock.
  function handleWhatsApp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = typeof window !== 'undefined' ? window.location.origin + productUrl : '';
    const message = productWhatsappMessage({ kind: available ? 'info' : 'availability', name: product.name, url });
    window.open(buildWhatsappUrl(config?.whatsapp ?? '', message), '_blank', 'noopener,noreferrer');
  }

  const Stage = (
    <div
      className={cn(
        'product-stage relative block overflow-hidden rounded-2xl bg-card',
        isList ? 'aspect-square h-full w-full shrink-0' : 'aspect-square w-full',
      )}
    >
      {(onSale || product.isPromo) && (
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col items-start gap-1.5">
          <Badge variant="promo" className="text-xs tabular-nums">
            {onSale ? `−${discountPct}%` : product.promoScope === 'some' ? 'Oferta en opciones' : 'Oferta'}
          </Badge>
        </div>
      )}

      {/* Crossfade a la 2da foto: se monta debajo y sube su opacidad al hover. */}
      {hoverImage && available && (
        <img
          src={hoverImage}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="ease-expo absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
        />
      )}

      {image ? (
        <img
          ref={imageRef}
          src={image}
          alt={product.name}
          width={400}
          height={400}
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          // Si la foto falla, el blur permanente sería peor que mostrarla rota.
          onError={() => setImageLoaded(true)}
          className={cn(
            // Misma escala en todas las tarjetas: la foto completa, sin recortes.
            'ease-expo relative h-full w-full object-contain transition duration-500 motion-reduce:transition-none',
            !imageLoaded && !reduce && 'blur-md',
            imageLoaded && 'blur-0',
            hoverImage && available && 'group-hover:opacity-0',
            soldOut && 'opacity-70 grayscale',
          )}
        />
      ) : (
        <div className="grid h-full place-items-center text-muted-foreground">
          <HugeIcon icon={ImageNotFound01Icon} size={32} strokeWidth={2} aria-hidden />
        </div>
      )}
    </div>
  );

  const Info = (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1',
        isList ? 'flex-1 justify-center gap-1.5 py-1' : 'flex-1 pt-3',
      )}
    >
      <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-foreground sm:text-base">
        {product.name}
      </h3>
      {specs.length > 0 && (
        // Dato completo con su etiqueta, sin recortar; en móvil chico, uno solo.
        <dl className="space-y-0.5 text-xs leading-snug text-muted-foreground sm:text-sm">
          {specs.map((s, i) => (
            <div key={s.label} className={cn('break-words', i > 0 && 'hidden min-[400px]:block')}>
              <dt className="inline">{s.label}: </dt>
              <dd className="inline font-medium text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        {product.priceFrom && <span className="text-xs font-medium text-muted-foreground">Desde</span>}
        <span className="font-heading text-lg font-extrabold tracking-tight text-primary-2 tabular-nums">
          {formatCordobas(product.price, currency)}
        </span>
        {onSale && (
          <span className="text-xs text-muted-foreground line-through tabular-nums sm:text-sm">
            <span className="sr-only">Antes </span>
            {formatCordobas(compareAt, currency)}
          </span>
        )}
      </div>
      {!available && (
        <p className={cn('text-xs font-medium', soldOut ? 'text-destructive' : 'text-foreground')}>
          {AVAILABILITY_LABEL[product.availability]}
        </p>
      )}
    </div>
  );

  const Cta = !available ? (
    <Button
      variant="whatsappOutline"
      onClick={handleWhatsApp}
      aria-label={`Consultar por WhatsApp la disponibilidad de ${product.name}`}
      className="h-11 w-full text-sm"
    >
      <WhatsappIcon aria-hidden className="size-4" />
      Consultar
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleCta}
        aria-label={needsChoice ? `Elegir opciones de ${product.name}` : `Agregar ${product.name} al carrito`}
        className="h-auto min-h-11 min-w-0 flex-1 px-2 py-1 text-sm leading-tight whitespace-normal"
      >
        {needsChoice ? (
          'Elegir opciones'
        ) : (
          <>
            <HugeIcon icon={ShoppingCart02Icon} size={16} strokeWidth={2} aria-hidden />
            Agregar
          </>
        )}
      </Button>
      <Button
        variant="whatsappOutline"
        size="icon"
        onClick={handleWhatsApp}
        aria-label={`Consultar por ${product.name} por WhatsApp`}
        title="Consultar por WhatsApp"
        className="size-11 shrink-0"
      >
        <WhatsappIcon aria-hidden className="size-[18px]" />
      </Button>
    </div>
  );

  // Sin entrada animada desde opacity 0 (el SSR pintaba tarjetas invisibles) y
  // sin elevar la tarjeta al hover: solo una respuesta breve al presionar.
  const motionProps = {
    whileTap: reduce ? undefined : { scale: 0.985 },
  };

  const shell = 'group relative flex w-full';

  // El sheet se monta junto a la tarjeta pero renderiza por portal (Radix).
  const quickAdd = quickAddMounted && (
    <QuickAddSheet product={product} open={quickAddOpen} onOpenChange={setQuickAddOpen} />
  );

  if (isList) {
    return (
      <>
        <motion.article {...motionProps} className={cn(shell, 'flex-col gap-3')}>
          <Link to={productUrl} prefetch="intent" className="flex w-full gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-4">
            <div className="relative w-[38%] max-w-[180px] shrink-0 self-start">{Stage}</div>
            {Info}
          </Link>
          {Cta}
        </motion.article>
        {quickAdd}
      </>
    );
  }

  return (
    <>
      <motion.article {...motionProps} className={cn(shell, 'h-full flex-col')}>
        <Link to={productUrl} prefetch="intent" className="flex flex-1 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          {Stage}
          {Info}
        </Link>
        <div className="pt-3">{Cta}</div>
      </motion.article>
      {quickAdd}
    </>
  );
}
