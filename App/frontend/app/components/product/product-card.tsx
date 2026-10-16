// Foto, nombre, precio y estado, sin botones (DESIGN.md §10): toda la tarjeta abre la ficha, donde se
// eligen las opciones y están WhatsApp y el carrito.
import { HugeIcon } from "~/components/ui/icon";
import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from 'react';
import { Link } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';

import type { CatalogProduct } from '@shared/schemas';
import { THUMBNAIL_WIDTH } from '@shared/image-variants';
import { ThumbnailImg } from '~/components/product/thumbnail-img';
import { Badge } from '~/components/ui/badge';
import { Chip } from '~/components/ui/chip';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useThumbnail } from '~/hooks/use-thumbnail';
import { cardOptions, cardSpecs } from '~/lib/card-summary';
import { publicPrice } from '~/lib/catalog-products';
import { AVAILABILITY_LABEL } from '~/lib/purchase';
import { cn } from "~/lib/utils"
import { formatCordobas, getProductUrl } from "~/lib/formatters";

const DEFAULT_SIZES = '(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw';

export function ProductCard({
  product,
  layout = 'grid',
  index = 0,
  eager,
  sizes = DEFAULT_SIZES,
}: {
  product: CatalogProduct;
  layout?: 'grid' | 'list';
  /** Posición en la grilla: sin `eager`, las primeras 4 fotos cargan sin lazy. */
  index?: number;
  /** Lo decide la grilla: en la portada, solo las primeras del primer bloque. */
  eager?: boolean;
  /** Ancho de la tarjeta en la grilla que la contiene, para elegir miniatura u original. */
  sizes?: string;
}) {
  const config = useStoreConfig();
  const reduce = useReducedMotion();
  // onLoad puede ocurrir antes de hidratar: comprobar también la imagen del DOM.
  const [imageLoaded, setImageLoaded] = useState(false);

  const image = product.images[0];
  // La tarjeta se ve a unos 200 px: el celular baja la miniatura y no la foto de 1200.
  const { ref: imageRef, thumb, fallback } = useThumbnail(image);
  useEffect(() => {
    const img = imageRef.current;
    setImageLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [image, thumb, imageRef]);
  // Segunda foto: si existe, hace crossfade al pasar el mouse.
  const hoverImage = product.images[1];
  const available = product.availability === 'available';
  const soldOut = product.availability === 'sold_out';
  // «Próximamente» (y un producto sin precio cargado) no muestra precio: el estado de abajo lo dice.
  const price = publicPrice(product);
  const compareAt = product.compareAtPrice ?? 0;
  const onSale = price != null && compareAt > price;
  const discountPct = onSale ? Math.round((1 - price / compareAt) * 100) : 0;
  const isList = layout === 'list';
  const currency = config?.currency;
  const productUrl = getProductUrl(product.id, product.name);
  // En el celular, a lo sumo un dato además de las opciones; desde tableta, dos.
  const specs = cardSpecs(product, 2);
  const options = cardOptions(product);
  const Stage = (
    <div
      className={cn(
        'product-stage relative block overflow-hidden rounded-2xl bg-card',
        isList ? 'aspect-square h-full w-full shrink-0' : 'aspect-square w-full',
      )}
    >
      {(onSale || product.isPromo || product.unpublished) && (
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col items-start gap-1.5">
          {/* Solo llega en la vista previa del modo edición. */}
          {product.unpublished && (
            <Badge variant="outline" className="bg-card text-xs">
              Sin publicar
            </Badge>
          )}
          {(onSale || product.isPromo) && (
            <Badge variant="promo" className="text-xs tabular-nums">
              {onSale ? `−${discountPct}%` : product.promoScope === 'some' ? 'Oferta en opciones' : 'Oferta'}
            </Badge>
          )}
        </div>
      )}

      {/* Crossfade a la 2da foto: se monta debajo y sube su opacidad al hover. */}
      {hoverImage && available && (
        <ThumbnailImg
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
          srcSet={thumb ? `${thumb} ${THUMBNAIL_WIDTH}w, ${image} 1200w` : undefined}
          sizes={isList ? '180px' : sizes}
          alt={product.name}
          width={400}
          height={400}
          loading={(eager ?? index < 4) ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          // Sin miniatura se pide la original; si la foto falla, el blur permanente sería peor que mostrarla rota.
          onError={() => {
            if (!fallback()) setImageLoaded(true);
          }}
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
        isList ? 'flex-1 justify-center gap-1.5 py-1' : 'flex-1 pt-2.5',
      )}
    >
      <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-foreground sm:text-base">
        {product.name}
      </h3>
      {/* Qué opciones hay, sin abrir la ficha: es lo primero que preguntan por WhatsApp. */}
      {options && <p className="line-clamp-1 text-xs text-muted-foreground">{options}</p>}
      {specs.length > 0 && (
        // Dato completo con su etiqueta, sin recortar; el segundo, solo desde tableta.
        <dl className="space-y-0.5 text-xs leading-snug text-muted-foreground">
          {specs.map((s, i) => (
            <div key={s.label} className={cn('break-words', i > 0 && 'hidden md:block')}>
              <dt className="inline">{s.label}: </dt>
              <dd className="inline font-medium text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Al pie de la tarjeta: en una fila, precios y estados quedan a la misma altura. */}
      <div className="mt-auto space-y-1 pt-1">
        {price != null && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            {product.priceFrom && <span className="text-xs font-medium text-muted-foreground">Desde</span>}
            <span className="font-heading text-lg leading-tight font-extrabold tracking-tight text-primary-2 tabular-nums">
              {formatCordobas(price, currency)}
            </span>
            {onSale && (
              <span className="text-xs text-muted-foreground line-through tabular-nums sm:text-sm">
                <span className="sr-only">Antes </span>
                {formatCordobas(compareAt, currency)}
              </span>
            )}
          </div>
        )}
        {available ? (
          <Chip variant="status" tone="success" className="self-start">
            {AVAILABILITY_LABEL.available}
          </Chip>
        ) : (
          <p className={cn('text-xs font-medium', soldOut ? 'text-destructive' : 'text-foreground')}>
            {AVAILABILITY_LABEL[product.availability]}
          </p>
        )}
      </div>
    </div>
  );

  // Sin entrada animada desde opacity 0 (el SSR pintaba tarjetas invisibles) y
  // sin elevar la tarjeta al hover: solo una respuesta breve al presionar.
  const motionProps = {
    whileTap: reduce ? undefined : { scale: 0.985 },
  };

  const shell = 'group relative flex w-full';

  if (isList) {
    return (
      <motion.article {...motionProps} data-landing-product={product.id} className={cn(shell, 'flex-col gap-3')}>
        <Link to={productUrl} prefetch="intent" className="flex w-full gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-4">
          <div className="relative w-[38%] max-w-[180px] shrink-0 self-start">{Stage}</div>
          {Info}
        </Link>
      </motion.article>
    );
  }

  return (
    <motion.article {...motionProps} data-landing-product={product.id} className={cn(shell, 'h-full flex-col')}>
      <Link to={productUrl} prefetch="intent" className="flex flex-1 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {Stage}
        {Info}
      </Link>
    </motion.article>
  );
}
