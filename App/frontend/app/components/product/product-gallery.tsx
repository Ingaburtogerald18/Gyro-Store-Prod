// Galería de la ficha: foto grande y miniaturas. En móvil se pasa con swipe; en
// todos lados, clic o Enter abre el lightbox con anterior y siguiente.
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowLeft01Icon, ArrowRight01Icon, ImageNotFound01Icon, ZoomInAreaIcon } from '@hugeicons/core-free-icons';

import { Badge } from '~/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { ThumbnailImg } from '~/components/product/thumbnail-img';

/** Píxeles de arrastre para pasar de foto. Menos que esto es un toque, no swipe. */
const SWIPE_THRESHOLD = 50;

export function ProductGallery({
  images,
  name,
  soldOut = false,
}: {
  images: string[];
  name: string;
  soldOut?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLButtonElement>(null);
  // La primera foto se pinta visible desde el servidor; el fundido solo acompaña
  // los cambios de foto.
  const [changed, setChanged] = useState(false);

  // Si cambia el juego de fotos (otra variante de color), volver a la primera:
  // el índice viejo puede no existir en la lista nueva.
  useEffect(() => setActive(0), [images]);

  const current = images[active] ?? images[0];
  const hasMany = images.length > 1;

  function step(direction: 1 | -1) {
    setChanged(true);
    setActive((prev) => (prev + direction + images.length) % images.length);
  }

  function show(index: number) {
    setChanged(true);
    setActive(index);
  }

  return (
    <div className="space-y-3">
      {current ? (
        <button
          ref={stageRef}
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={`Ampliar imagen de ${name}`}
          className="product-stage group relative mx-auto block aspect-square w-full max-w-[20rem] cursor-zoom-in overflow-hidden rounded-2xl bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:max-w-[30rem]"
        >
          <motion.img
            key={current}
            src={current}
            alt={name}
            loading="eager"
            decoding="async"
            width={480}
            height={480}
            initial={changed && !reduce ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            // El drag solo existe con más de una foto; con una sola, arrastrar
            // no lleva a ningún lado y estorba al scroll de la página.
            drag={hasMany && !reduce ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_THRESHOLD) step(1);
              else if (info.offset.x > SWIPE_THRESHOLD) step(-1);
            }}
            className="h-full w-full touch-pan-y object-contain select-none"
          />

          {soldOut && (
            <Badge variant="category" className="absolute top-3 left-3">
              Agotado
            </Badge>
          )}

          {/* Pista de ampliar, siempre visible: es la única forma de ver la foto grande. */}
          <span
            aria-hidden
            className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-background text-foreground"
          >
            <HugeIcon icon={ZoomInAreaIcon} size={18} strokeWidth={2} />
          </span>
        </button>
      ) : (
        <div className="product-stage relative mx-auto grid aspect-square w-full max-w-[20rem] place-items-center overflow-hidden rounded-2xl bg-muted text-muted-foreground sm:max-w-[30rem]">
          <HugeIcon icon={ImageNotFound01Icon} size={40} strokeWidth={2} aria-hidden />
        </div>
      )}

      {/* Puntos: en móvil son la única señal de que hay más fotos, porque las
          miniaturas quedan fuera de la primera pantalla. */}
      {hasMany && (
        <div className="flex justify-center gap-1.5 md:hidden">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => show(i)}
              aria-label={`Ver imagen ${i + 1} de ${images.length}`}
              aria-current={i === active}
              // El botón aporta los 44px táctiles; el punto visible mide 6px.
              className="grid h-11 w-11 place-items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span
                className={cn(
                  'h-1.5 rounded-full transition-all motion-reduce:transition-none',
                  i === active ? 'w-4 bg-primary-2' : 'w-1.5 bg-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
      )}

      {/* Miniaturas solo en escritorio: en móvil los puntos ya cumplen esa función. */}
      {hasMany && (
        <div className="mx-auto hidden w-fit max-w-full gap-2 overflow-x-auto pb-1 md:flex [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => show(i)}
              aria-label={`Ver imagen ${i + 1} de ${name}`}
              aria-current={i === active}
              className={cn(
                'h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                i === active ? 'border-primary-2' : 'border-border hover:border-foreground/25',
              )}
            >
              <ThumbnailImg src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent
          aria-describedby={undefined}
          className="max-w-[min(92vw,64rem)] border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,64rem)]"
        >
          <DialogTitle className="sr-only">{name}</DialogTitle>
          {current && (
            <div className="relative">
              <img
                src={current}
                alt={name}
                className="max-h-[85dvh] w-full rounded-xl object-contain"
              />
              {hasMany && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Foto anterior"
                    className="absolute top-1/2 left-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <HugeIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Foto siguiente"
                    className="absolute top-1/2 right-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <HugeIcon icon={ArrowRight01Icon} size={20} strokeWidth={2} aria-hidden />
                  </button>
                  <span className="font-spec absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-0.5 text-xs text-foreground tabular-nums">
                    {active + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
