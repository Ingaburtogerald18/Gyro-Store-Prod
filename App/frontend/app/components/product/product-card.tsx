// Foto, nombre, precio y estado, sin botones (DESIGN.md §10): toda la tarjeta abre la ficha, donde se
// eligen las opciones y están WhatsApp y el carrito. En el celular es horizontal (foto a la izquierda, una
// por fila); desde tableta, vertical en la grilla.
import { HugeIcon } from "~/components/ui/icon";
import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';

import type { CatalogProduct } from '@shared/schemas';
import { THUMBNAIL_WIDTH } from '@shared/image-variants';
import { ThumbnailImg } from '~/components/product/thumbnail-img';
import { Badge } from '~/components/ui/badge';
import { Chip } from '~/components/ui/chip';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useThumbnail } from '~/hooks/use-thumbnail';
import { backStateFor } from '~/lib/back-link';
import { cardOptions, cardSpecs } from '~/lib/card-summary';
import { publicPrice } from '~/lib/catalog-products';
import { AVAILABILITY_LABEL } from '~/lib/purchase';
import { cn } from "~/lib/utils"
import { formatCordobas, getProductUrl } from "~/lib/formatters";

// En el celular la foto mide unos 150 px: alcanza la miniatura (480 px) aun en pantallas de alta densidad.
const DEFAULT_SIZES = '(min-width: 1024px) 300px, (min-width: 768px) 33vw, 152px';

export function ProductCard({
  product,
  index = 0,
  eager,
  sizes = DEFAULT_SIZES,
}: {
  product: CatalogProduct;
  /** Posición en la grilla: sin `eager`, las primeras 4 fotos cargan sin lazy. */
  index?: number;
  /** Lo decide la grilla: en la portada, solo las primeras del primer bloque. */
  eager?: boolean;
  /** Ancho de la tarjeta en la grilla que la contiene, para elegir miniatura u original. */
  sizes?: string;
}) {
  const config = useStoreConfig();
  const reduce = useReducedMotion();
  const location = useLocation();
  // onLoad puede ocurrir antes de hidratar: comprobar también la imagen del DOM.
  const [imageLoaded, setImageLoaded] = useState(false);

  const image = product.images[0];
  // La tarjeta se ve chica: el celular baja la miniatura y no la foto de 1200.
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
  const currency = config?.currency;
  const productUrl = getProductUrl(product);
  // Los datos técnicos van solo desde tableta (a lo sumo dos); en el celular quedan en la ficha.
  const specs = cardSpecs(product, 2);
  const options = cardOptions(product);

  return (
    // Sin entrada animada desde opacity 0 (el SSR pintaba tarjetas invisibles) y sin elevar la tarjeta al
    // hover: solo una respuesta breve al presionar.
    <motion.article
      whileTap={reduce ? undefined : { scale: 0.985 }}
      data-landing-product={product.id}
      className="group relative flex h-full w-full flex-col"
    >
      <Link
        to={productUrl}
        prefetch="intent"
        // «Volver» de la ficha regresa a este listado, con sus filtros y su posición.
        state={backStateFor(location)}
        className="flex flex-1 gap-3 rounded-2xl border border-border bg-card p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:flex-col md:gap-0 md:border-0 md:bg-transparent md:p-0"
      >
        {/* Celular: entre 132 y 152 px según el ancho, sin desbordar; desde tableta, todo el ancho. */}
        <div className="w-[clamp(8.25rem,36vw,9.5rem)] shrink-0 self-start md:w-full">
          <div className="product-stage relative block aspect-square w-full overflow-hidden rounded-xl bg-card md:rounded-2xl">
            {(onSale || product.isPromo || product.unpublished) && (
              <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1.5 md:top-2.5 md:left-2.5">
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

            {/* Crossfade a la 2da foto: se monta debajo y sube su opacidad al hover (solo con mouse). */}
            {hoverImage && available && (
              <ThumbnailImg
                src={hoverImage}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="ease-expo absolute inset-0 hidden h-full w-full object-contain opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none md:block"
              />
            )}

            {image ? (
              <img
                ref={imageRef}
                src={image}
                srcSet={thumb ? `${thumb} ${THUMBNAIL_WIDTH}w, ${image} 1200w` : undefined}
                sizes={sizes}
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
                  hoverImage && available && 'md:group-hover:opacity-0',
                  soldOut && 'opacity-70 grayscale',
                )}
              />
            ) : (
              <div className="grid h-full place-items-center text-muted-foreground">
                <HugeIcon icon={ImageNotFound01Icon} size={32} strokeWidth={2} aria-hidden />
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 py-1 md:py-0 md:pt-2.5">
          <h3 className="line-clamp-2 text-base leading-snug font-semibold text-foreground">{product.name}</h3>
          {/* Qué opciones hay, sin abrir la ficha: es lo primero que preguntan por WhatsApp. */}
          {options && <p className="line-clamp-1 text-sm text-muted-foreground md:text-xs">{options}</p>}
          {specs.length > 0 && (
            // Dato completo con su etiqueta, sin recortar.
            <dl className="hidden space-y-0.5 text-xs leading-snug text-muted-foreground md:block">
              {specs.map((s) => (
                <div key={s.label} className="break-words">
                  <dt className="inline">{s.label}: </dt>
                  <dd className="inline font-medium text-foreground">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {/* Al pie: en una fila de tarjetas, precios y estados quedan a la misma altura. */}
          <div className="mt-auto space-y-1 pt-1">
            {price != null && (
              <div className="flex flex-wrap items-baseline gap-x-2">
                {product.priceFrom && <span className="text-xs font-medium text-muted-foreground">Desde</span>}
                <span className="font-heading text-xl leading-tight font-extrabold tracking-tight text-primary-2 tabular-nums md:text-lg">
                  {formatCordobas(price, currency)}
                </span>
                {onSale && (
                  <span className="text-sm text-muted-foreground line-through tabular-nums">
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
              <p className={cn('text-sm font-medium md:text-xs', soldOut ? 'text-destructive' : 'text-foreground')}>
                {AVAILABILITY_LABEL[product.availability]}
              </p>
            )}
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
