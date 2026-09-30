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

function WhatsappIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={16} height={16} {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

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
          className="font-spec absolute top-2 right-2 z-10 text-2xs sm:px-2.5"
        >
          {product.stock === 1 ? '¡Último disponible!' : `¡Últimas ${product.stock}!`}
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
      <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-foreground transition-colors group-hover:text-primary-2 sm:text-lg">
        {product.name}
      </h3>
      {specLine && (
        <p className="font-spec line-clamp-1 text-2xs text-muted-foreground">{specLine}</p>
      )}
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-heading text-lg font-extrabold tracking-tight text-primary-2 tabular-nums sm:text-xl">
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
        <HugeIcon icon={ShoppingCart02Icon} size={14} strokeWidth={2} aria-hidden />
        Agregar
      </Button>
      <Button
        variant="whatsapp"
        size="icon"
        onClick={handleWhatsAppOrder}
        aria-label={`Pedir ${product.name} por WhatsApp`}
        title="Pedir por WhatsApp"
        className="h-11 w-11 rounded-lg"
      >
        <WhatsappIcon aria-hidden className="h-[15px] w-[15px] sm:h-[18px] sm:w-[18px]" />
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
