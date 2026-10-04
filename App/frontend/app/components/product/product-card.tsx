// ProductCard — estilo panel del V1: la tarjeta es una superficie con marco
// hairline que se eleva entera al hover (no solo la foto), con la imagen en un
// stage cuadrado y el CTA anclado al fondo para que toda la fila alinee parejo.
// Con >1 combinación de variantes, el CTA abre el QuickAddSheet para elegir
// antes de agregar; con una sola va directo al carrito.
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
import { cn } from "~/lib/utils"
import { buildWhatsappUrl, formatCordobas, getProductUrl } from "~/lib/formatters";


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
  // Segunda foto: si existe, hace crossfade al pasar el mouse (patrón del V1).
  const hoverImage = product.images[1];
  const soldOut = product.stock <= 0;
  const lowStock = !soldOut && product.stock <= 5;
  const compareAt = product.compareAtPrice ?? 0;
  const onSale = compareAt > product.price;
  const discountPct = onSale ? Math.round((1 - product.price / compareAt) * 100) : 0;
  const isList = layout === 'list';
  const currency = config?.currency;
  const productUrl = getProductUrl(product.id, product.name);
  const description = product.description
    ? product.description.replace(/<[^>]*>?/gm, '').trim()
    : '';
  // Línea técnica (Chivo Mono): hasta tres valores CORTOS de la ficha, tipo
  // "1DD+1BA · 23 Ω · 110 dB". Los valores largos ("Hasta 15 metros (en
  // espacios abiertos)") son explicación, no dato: van a la ficha, no acá.
  // Sin specs cargadas no se muestra nada.
  const specLine = product.specs
    .map((s) => s.value.trim())
    .filter((v) => v && v.length <= 16)
    .slice(0, 3)
    .join(' · ');

  function handleCta(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) return;
    // Con más de una combinación hay que elegir variante: sheet, no carrito.
    if (product.variantCount > 1) {
      setQuickAddMounted(true);
      setQuickAddOpen(true);
      return;
    }
    dispatch(
      addItem({
        catalogId: product.id,
        name: product.name,
        variantName: 'Estándar',
        price: product.price,
        image: image || '',
        quantity: 1,
      }),
    );
    dispatch(openCart());
  }

  // "Pedir por WhatsApp": camino de compra directo, sin pasar por el carrito. Si
  // está agotado, el mensaje pide aviso de reposición: el lead no se pierde.
  function handleWhatsAppOrder(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = typeof window !== 'undefined' ? window.location.origin + productUrl : '';
    const message = soldOut
      ? `Hola, quiero que me avisen cuando vuelva a haber stock de: ${product.name}. ${url}`
      : `Hola, quiero: ${product.name} — ${formatCordobas(product.price, currency)}. ${url}`;
    window.open(
      buildWhatsappUrl(config?.whatsapp ?? '', message),
      '_blank',
      'noopener,noreferrer',
    );
  }

  // La tarjeta entera se eleva al hover (ver `shell` más abajo); acá la foto
  // solo hace zoom por separado, sin trasladarse.
  const Stage = (
    <div
      className={cn(
        'product-stage relative block overflow-hidden rounded-2xl',
        isList ? 'aspect-square h-full w-full shrink-0' : 'aspect-square w-full',
      )}
    >
      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5">
        {onSale && (
          <Badge variant="promo" className="text-2xs tabular-nums sm:px-2.5">
            −{discountPct}%
          </Badge>
        )}
        {product.isPromo && !onSale && (
          <Badge variant="promo" className="text-2xs sm:px-2.5">
            Oferta
          </Badge>
        )}
      </div>

      {lowStock && (
        <Badge
          variant="destructive"
          className="absolute top-2 right-2 z-10 text-2xs sm:px-2.5"
        >
          {product.stock === 1 ? 'Última unidad' : `Quedan ${product.stock}`}
        </Badge>
      )}

      {/* Crossfade a la 2da foto: se monta debajo y sube su opacidad al hover. */}
      {hoverImage && !soldOut && (
        <img
          src={hoverImage}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="ease-expo absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[600ms] group-hover:opacity-100"
        />
      )}

      {image ? (
        <img
          ref={imageRef}
          src={image}
          alt={product.name}
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          // Si la foto falla, el blur permanente sería peor que mostrarla rota:
          // se destapa igual y el alt hace su trabajo.
          onError={() => setImageLoaded(true)}
          className={cn(
            'ease-expo relative h-full w-full object-cover transition duration-[600ms] will-change-transform',
            // Sin zoom al pasar el mouse: con la tarjeta que se eleva y el cambio a la
            // segunda foto ya hay respuesta suficiente, y la foto se examina mejor quieta.
            // El blur-up no se anima con `motion`: es una transición CSS sobre
            // filter+scale, que el compositor resuelve sin trabajo de JS.
            !imageLoaded && !reduce && 'scale-[1.04] blur-lg',
            imageLoaded && 'scale-100 blur-0',
            hoverImage && !soldOut && 'group-hover:opacity-0',
            soldOut && 'opacity-70 grayscale',
          )}
        />
      ) : (
        <div className="grid h-full place-items-center text-muted-foreground">
          <HugeIcon icon={ImageNotFound01Icon} size={32} strokeWidth={2} aria-hidden />
        </div>
      )}

      {soldOut && (
        <Badge
          variant="secondary"
          className="font-spec absolute bottom-2 left-1/2 -translate-x-1/2 py-1 text-2xs sm:bottom-3 sm:px-3"
        >
          Agotado
        </Badge>
      )}
    </div>
  );

  const Info = (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1',
        isList ? 'flex-1 justify-center gap-1.5 py-1' : 'flex-1 pt-3 sm:pt-4',
      )}
    >
      <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-foreground sm:text-lg">
        {product.name}
      </h3>
      {specLine && (
        <p className="font-spec line-clamp-1 text-2xs text-muted-foreground">{specLine}</p>
      )}
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-heading text-lg font-extrabold tracking-tight text-foreground tabular-nums sm:text-xl">
          {formatCordobas(product.price, currency)}
        </span>
        {onSale && (
          <span className="text-xs text-muted-foreground line-through tabular-nums sm:text-sm">
            {formatCordobas(compareAt, currency)}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {description}
        </p>
      )}
    </div>
  );

  // Agotado: el badge de la foto ya dice "Agotado"; repetirlo en un botón
  // deshabilitado no aporta. El CTA principal pasa a ser el aviso de reposición
  // por WhatsApp — el lead no se pierde — y el ícono aparte sobra.
  const Cta = soldOut ? (
    <Button
      variant="whatsappOutline"
      onClick={handleWhatsAppOrder}
      aria-label={`Avisame cuando ${product.name} esté disponible, por WhatsApp`}
      className="h-11 w-full text-xs sm:text-sm"
    >
      <WhatsappIcon aria-hidden className="h-[15px] w-[15px]" />
      Avisame
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleCta}
        className="h-11 flex-1 text-xs sm:text-sm"
      >
        {/* Con variantes, el botón abre el selector: la etiqueta lo anticipa. */}
        {product.variantCount > 1 ? (
          "Elegir opciones"
        ) : (
          <>
            <HugeIcon icon={ShoppingCart02Icon} size={14} strokeWidth={2} aria-hidden />
            Agregar
          </>
        )}
      </Button>
      <Button
        variant="whatsappOutline"
        size="icon"
        onClick={handleWhatsAppOrder}
        aria-label={`Pedir ${product.name} por WhatsApp`}
        title="Pedir por WhatsApp"
        className="h-11 w-11"
      >
        <WhatsappIcon aria-hidden className="h-[15px] w-[15px] sm:h-[18px] sm:w-[18px]" />
      </Button>
    </div>
  );

  // Sin entrada animada desde opacity 0: el SSR pintaba todas las tarjetas
  // invisibles y, en una red lenta, la grilla quedaba vacía hasta hidratar.
  const motionProps = {
    whileHover: reduce
      ? undefined
      : { y: -4, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
    whileTap: reduce ? undefined : { scale: 0.985 },
  };

  const shell = 'group relative flex w-full';

  // El sheet se monta junto a la tarjeta pero renderiza por portal (Radix):
  // el whileTap/whileHover del article no lo afectan.
  const quickAdd = quickAddMounted && (
    <QuickAddSheet product={product} open={quickAddOpen} onOpenChange={setQuickAddOpen} />
  );

  if (isList) {
    return (
      <>
        <motion.article {...motionProps} className={cn(shell, 'gap-3 sm:gap-4')}>
          <Link to={productUrl} prefetch="intent" aria-label={product.name} className="flex w-full gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-4">
          <div className="relative w-[40%] max-w-[200px] shrink-0 self-center">{Stage}</div>
          {Info}
          </Link>
        </motion.article>
        {quickAdd}
      </>
    );
  }

  return (
    <>
      <motion.article {...motionProps} className={cn(shell, 'h-full flex-col')}>
        <Link to={productUrl} prefetch="intent" aria-label={product.name} className="flex flex-1 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {Stage}
        {Info}
        </Link>
        <div className="pt-3">{Cta}</div>
      </motion.article>
      {quickAdd}
    </>
  );
}
