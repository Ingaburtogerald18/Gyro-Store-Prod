// Carrusel horizontal de productos. Fila con scroll-snap nativo (suave, sin
// reflow) + flechas que se deshabilitan en los extremos y degradado de borde
// para insinuar continuidad. Portado de la versión que corre hoy en la tienda.
import { HugeIcon } from "~/components/ui/icon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CatalogProduct } from '@shared/schemas';
import { ProductCard } from './product-card';
import { Button } from '~/components/ui/button';
import { cn } from "~/lib/utils";

export function ProductCarousel({
  title,
  subtitle,
  products,
}: {
  title: string;
  subtitle?: string;
  products: CatalogProduct[];
  variant?: string;
}) {
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
                variant="outline"
                size="icon"
                onClick={() => scrollByView(dir)}
                disabled={!enabled}
                aria-label={dir === -1 ? 'Anterior' : 'Siguiente'}
                className={cn(
                  'ease-expo h-10 w-10 rounded-full active:scale-95',
                  'disabled:opacity-30',
                  'bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
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
              className="w-[54%] shrink-0 snap-start md:w-[31%] lg:w-[23.5%]"
            >
              <ProductCard product={p} index={i} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

