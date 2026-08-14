// ProductCard — estilo panel del V1: la tarjeta es una superficie con marco
// hairline que se eleva entera al hover (no solo la foto), con la imagen en un
// stage 4:3 y el CTA anclado al fondo para que toda la fila alinee parejo.
// Con >1 combinación de variantes, el CTA abre el QuickAddSheet para elegir
// antes de agregar; con una sola va directo al carrito.
import { HugeIcon } from "~/components/ui/icon";
import { ImageNotFound01Icon, Message01Icon, ShoppingCart02Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { Link } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';

import { toast } from 'sonner';
import type { CatalogProduct } from '@shared/schemas';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { QuickAddSheet } from '~/components/product/quick-add-sheet';
import { useGetConfigQuery } from '~/store/api/sessionApi';
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
  /** Posición en la grilla: escalona la entrada de las tarjetas visibles. */
  index?: number;
}) {
  const dispatch = useAppDispatch();
  const { data: config } = useGetConfigQuery();
  const reduce = useReducedMotion();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // El sheet se monta recién en el primer uso: con 40 tarjetas en pantalla, 40
  // portales vacíos son 40 nodos y 40 suscripciones que nadie pidió.
  const [quickAddMounted, setQuickAddMounted] = useState(false);
  // Blur-up: la foto entra desenfocada y se resuelve al cargar, en vez de
  // aparecer de golpe sobre un hueco. `onLoad` cubre también la imagen que ya
  // venía del caché del navegador (dispara igual, solo que de inmediato).
  const [imageLoaded, setImageLoaded] = useState(false);

  const image = product.images[0];
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
    toast.success('Agregado al carrito');
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
    <Link
      to={productUrl}
      prefetch="intent"
      aria-label={product.name}
      className={cn(
        // El stage ya no se levanta solo: ahora eleva la tarjeta entera.
        'product-stage relative block overflow-hidden rounded-xl focus-visible:outline-none',
        isList ? 'aspect-square h-full w-full shrink-0' : 'aspect-[4/3] w-full',
      )}
    >
      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5">
        {onSale && (
          <Badge variant="promo" className="text-[10px] tabular-nums sm:px-2.5 sm:text-[11px]">
            −{discountPct}%
          </Badge>
        )}
        {product.isPromo && !onSale && (
          <Badge variant="promo" className="text-[10px] sm:px-2.5 sm:text-[11px]">
            Oferta
          </Badge>
        )}
      </div>

      {lowStock && (
        <Badge
          variant="destructive"
          className="absolute top-2 right-2 z-10 text-[10px] sm:px-2.5 sm:text-[11px]"
        >
          ¡Últimas {product.stock}!
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
            'group-hover:scale-[1.06]',
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
          className="absolute bottom-2 left-1/2 -translate-x-1/2 py-1 text-[10px] sm:bottom-3 sm:px-3 sm:text-[11px]"
        >
          Agotado
        </Badge>
      )}
    </Link>
  );

  const Info = (
    <Link
      to={productUrl}
      prefetch="intent"
      className={cn(
        'flex min-w-0 flex-col gap-1 focus-visible:outline-none',
        isList ? 'flex-1 justify-center gap-1.5 py-1' : 'flex-1 pt-3 sm:pt-4',
      )}
    >
      <h3 className="line-clamp-2 text-[13px] leading-snug font-bold tracking-tight text-foreground transition-colors group-hover:text-primary-2 sm:text-lg">
        {product.name}
      </h3>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[13px] font-extrabold text-primary-2 tabular-nums sm:text-lg">
          {formatCordobas(product.price, currency)}
        </span>
        {onSale && (
          <span className="text-xs text-muted-foreground line-through tabular-nums sm:text-sm">
            {formatCordobas(compareAt, currency)}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed font-light text-muted-foreground sm:text-sm">
          {description}
        </p>
      )}
    </Link>
  );

  const Cta = (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleCta}
        disabled={soldOut}
        className="h-11 flex-1 text-xs sm:text-sm"
      >
        <HugeIcon icon={ShoppingCart02Icon} size={14} strokeWidth={2} aria-hidden />
        {soldOut ? 'Agotado' : 'Agregar'}
      </Button>
      {/* Nunca se deshabilita, ni agotado: "avísame" sigue siendo un lead. */}
      <Button
        variant="whatsapp"
        size="icon"
        onClick={handleWhatsAppOrder}
        aria-label={
          soldOut
            ? `Avísame cuando ${product.name} esté disponible, por WhatsApp`
            : `Pedir ${product.name} por WhatsApp`
        }
        title={soldOut ? 'Avísame por WhatsApp' : 'Pedir por WhatsApp'}
        className="h-11 w-11 rounded-lg"
      >
        <HugeIcon icon={Message01Icon} size={16} strokeWidth={2} aria-hidden className="h-[15px] w-[15px] sm:h-[18px] sm:w-[18px]" />
      </Button>
    </div>
  );

  const motionProps = {
    initial: reduce ? false : ({ opacity: 0, y: 20 } as const),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-40px' },
    transition: {
      duration: 0.5,
      delay: (index % 4) * 0.06,
      ease: [0.16, 1, 0.3, 1] as const,
    },
    // La elevación y el tactile push llevan su propio `transition` anidado —
    // Framer Motion lo respeta por gesto sin pisar el de entrada de arriba.
    whileHover: reduce
      ? undefined
      : { y: -4, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
    whileTap: reduce ? undefined : { scale: 0.985 },
  };

  // Panel del V1: superficie con marco hairline que se eleva entera al hover
  // (whileHover de arriba), no solo la foto. Sin flex-col acá: el variant
  // `list` necesita fila (imagen al lado del texto), no columna.
  const shell = cn(
    'group relative flex w-full rounded-2xl border border-border bg-card p-3',
    'transition-colors duration-300 hover:border-foreground/20',
  );

  // El sheet se monta junto a la tarjeta pero renderiza por portal (Radix):
  // el whileTap/whileHover del article no lo afectan.
  const quickAdd = quickAddMounted && (
    <QuickAddSheet product={product} open={quickAddOpen} onOpenChange={setQuickAddOpen} />
  );

  if (isList) {
    return (
      <>
        <motion.article {...motionProps} className={cn(shell, 'gap-3 sm:gap-4')}>
          <div className="relative w-[40%] max-w-[200px] shrink-0 self-center">{Stage}</div>
          {Info}
        </motion.article>
        {quickAdd}
      </>
    );
  }

  return (
    <>
      <motion.article {...motionProps} className={cn(shell, 'h-full flex-col')}>
        {Stage}
        {Info}
        {/* El CTA vive fuera del <Link> flex-1: así todas las tarjetas de una fila
            alinean su botón a la misma altura sin importar el largo del nombre. */}
        <div className="pt-3">{Cta}</div>
      </motion.article>
      {quickAdd}
    </>
  );
}
