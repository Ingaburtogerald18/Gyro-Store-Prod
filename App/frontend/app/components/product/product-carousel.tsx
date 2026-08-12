// Carrusel horizontal de productos. Fila con scroll-snap nativo (suave, sin
// reflow) + flechas que se deshabilitan en los extremos y degradado de borde
// para insinuar continuidad. Portado de la versión que corre hoy en la tienda.
import { HugeIcon } from "~/components/ui/icon";
import { ArrowLeft01Icon, ArrowRight01Icon, ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@remix-run/react';
import { motion, useReducedMotion } from 'framer-motion';

import type { CatalogProduct } from '@shared/schemas';
import { ProductCard } from './product-card';
import { Button } from '~/components/ui/button';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { cn } from "~/lib/utils"
import { formatCordobas, getProductUrl } from "~/lib/formatters";

export function ProductCarousel({
  title,
  subtitle,
  products,
  variant = 'product',
}: {
  title: string;
  subtitle?: string;
  products: CatalogProduct[];
  /** "product" = tarjetas con precio + CTA. "showcase" = tiles editoriales
   *  grandes (foto protagonista, sin CTA) para descubrimiento. */
  variant?: 'product' | 'showcase';
}) {
  const showcase = variant === 'showcase';
  const trackRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update, products]);

  function scrollByView(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  if (!products.length) return null;

  return (
    <section className="py-2 sm:py-5 md:py-8" aria-label={title}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] font-light text-muted-foreground sm:text-sm">{subtitle}</p>
          )}
        </div>

        {/* También en móvil: son la pista visible de que la fila se desliza. */}
        <div className="flex shrink-0 gap-2">
          {([-1, 1] as const).map((dir) => {
            const enabled = dir === -1 ? canPrev : canNext;
            const Icon = dir === -1 ? ArrowLeft01Icon : ArrowRight01Icon;
            return (
              <Button
                key={dir}
                variant={showcase ? 'onMedia' : 'outline'}
                size="icon"
                onClick={() => scrollByView(dir)}
                disabled={!enabled}
                aria-label={dir === -1 ? 'Anterior' : 'Siguiente'}
                className={cn(
                  'ease-expo h-10 w-10 rounded-full active:scale-95',
                  'disabled:opacity-30',
                  !showcase && 'bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                <HugeIcon icon={Icon} size={16} strokeWidth={2} aria-hidden className="sm:size-5" />
              </Button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent transition-opacity',
            canNext ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden
        />
        <ul
          ref={trackRef}
          onScroll={update}
          className={cn(
            'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:gap-5',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {products.map((p, i) => (
            <li
              key={p.id}
              className={cn(
                'shrink-0 snap-start',
                showcase ? 'w-[54%] md:w-[31%] lg:w-[23.5%]' : 'w-[40%] md:w-[23.5%] lg:w-[19%]',
              )}
            >
              {showcase ? (
                <ShowcaseCard product={p} index={i} />
              ) : (
                <ProductCard product={p} index={i} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Tile editorial grande: foto protagonista + nombre, precio y descripción corta.
// Sin CTA — es descubrimiento; el tap lleva a la ficha, donde vive la conversión.
// El precio SÍ va: en un mercado sensible al precio, sin él no se puede evaluar.
function ShowcaseCard({ product, index }: { product: CatalogProduct; index: number }) {
  const reduce = useReducedMotion();
  const { data: config } = useGetConfigQuery();
  const image = product.images[0];
  const description = product.description
    ? product.description.replace(/<[^>]*>?/gm, '').trim()
    : '';
  const compareAt = product.compareAtPrice ?? 0;
  const onSale = compareAt > product.price;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="group"
    >
      <Link
        to={getProductUrl(product.id, product.name)}
        prefetch="intent"
        aria-label={product.name}
        className="block focus-visible:outline-none"
      >
        <div className="product-stage ease-expo relative aspect-square overflow-hidden rounded-2xl transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_48px_-16px_rgba(0,0,0,0.5)]">
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading={index < 4 ? 'eager' : 'lazy'}
              decoding="async"
              className="ease-expo h-full w-full object-cover transition-transform duration-[600ms] will-change-transform group-hover:scale-[1.06]"
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <HugeIcon icon={ImageNotFound01Icon} size={32} strokeWidth={2} aria-hidden />
            </div>
          )}
        </div>

        <h3 className="mt-3 text-[13px] leading-snug font-bold tracking-tight text-foreground transition-colors group-hover:text-primary-2 sm:mt-4 sm:text-xl">
          {product.name}
        </h3>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[13px] font-extrabold text-primary-2 tabular-nums sm:text-lg">
            {formatCordobas(product.price, config?.currency)}
          </span>
          {onSale && (
            <span className="text-xs text-muted-foreground line-through tabular-nums sm:text-sm">
              {formatCordobas(compareAt, config?.currency)}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1.5 line-clamp-2 max-w-[400px] text-[11px] leading-relaxed font-light text-pretty text-muted-foreground sm:mt-2 sm:line-clamp-4 sm:text-sm">
            {description}
          </p>
        )}
      </Link>
    </motion.article>
  );
}
