// Carrusel horizontal de productos. Fila con scroll-snap nativo (suave, sin
// reflow) + flechas que se deshabilitan en los extremos y degradado de borde
// para insinuar continuidad. Portado de la versión que corre hoy en la tienda.
import { HugeIcon } from "~/components/ui/icon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@remix-run/react';

import type { CatalogProduct } from '@shared/schemas';
import { ProductCard } from './product-card';
import { Button } from '~/components/ui/button';
import { cn } from "~/lib/utils";

export function ProductCarousel({
  title,
  href,
  subtitle,
  products,
}: {
  title: string;
  /** Destino de "Ver todo" (la grilla filtrada por esa categoría). */
  href?: string;
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
          <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
          )}
        </div>

        {/* "Ver todo" lleva a la grilla de la categoría. Las flechas quedan para
            escritorio: en móvil la tarjeta asomada y el degradado ya dicen que la
            fila se desliza, y "Ver todo" es la salida que faltaba. */}
        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link
              to={href}
              className="rounded-xl px-1 text-sm font-semibold text-primary-2 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Ver todo
              <span className="sr-only"> en {title}</span>
            </Link>
          )}
        <div className={cn("hidden gap-2 sm:flex", !canPrev && !canNext && "sm:invisible")}>
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
                aria-label={dir === -1 ? `Ver anteriores de ${title}` : `Ver más de ${title}`}
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

