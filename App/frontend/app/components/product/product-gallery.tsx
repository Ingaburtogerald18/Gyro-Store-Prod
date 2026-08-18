// Galería de la ficha: foto grande + miniaturas.
//
// Tres formas de mirar de cerca, una por contexto:
//   · Escritorio: LUPA al pasar el mouse — la foto escala desde el punto que se
//     está mirando (`transform-origin` sigue al cursor).
//   · Móvil: SWIPE horizontal entre fotos, con puntos de paginación.
//   · Ambos: clic/Enter abre el lightbox sobre <Dialog> (Escape, clic afuera y
//     foco gestionado los da Radix).
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ImageNotFound01Icon, ZoomInAreaIcon } from '@hugeicons/core-free-icons';

import { Badge } from '~/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';

/** Cuánto escala la lupa. Más de esto y se ve el pixelado de la foto original. */
const ZOOM = 1.8;
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
  const [hovering, setHovering] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLButtonElement>(null);

  // Si cambia el juego de fotos (otra variante de color), volver a la primera:
  // el índice viejo puede no existir en la lista nueva.
  useEffect(() => setActive(0), [images]);

  const current = images[active] ?? images[0];
  const hasMany = images.length > 1;

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  function step(direction: 1 | -1) {
    setActive((prev) => (prev + direction + images.length) % images.length);
  }

  return (
    <div className="space-y-3">
      {current ? (
        <button
          ref={stageRef}
          type="button"
          onClick={() => setZoomed(true)}
          onMouseMove={reduce ? undefined : handleMouseMove}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => {
            setHovering(false);
            setOrigin({ x: 50, y: 50 });
          }}
          aria-label={`Ampliar imagen de ${name}`}
          className="product-stage group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <motion.img
            key={current}
            src={current}
            alt={name}
            loading="eager"
            decoding="async"
            // El drag solo existe con más de una foto; con una sola, arrastrar
            // no lleva a ningún lado y estorba al scroll de la página.
            drag={hasMany && !reduce ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_THRESHOLD) step(1);
              else if (info.offset.x > SWIPE_THRESHOLD) step(-1);
            }}
            className="h-full w-full touch-pan-y object-cover select-none"
            style={{
              transformOrigin: `${origin.x}% ${origin.y}%`,
              // La lupa es transform puro: la resuelve el compositor, sin
              // recalcular layout en cada movimiento del mouse.
              transform: hovering && !reduce ? `scale(${ZOOM})` : 'scale(1)',
              transition: 'transform 150ms ease-out',
            } as React.CSSProperties}
          />

          {soldOut && (
            <Badge variant="secondary" className="absolute top-3 left-3">
              Agotado
            </Badge>
          )}

          {/* Pista de zoom: aparece al hover, no compite con la foto. */}
          <span
            aria-hidden
            className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-background/70 text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <HugeIcon icon={ZoomInAreaIcon} size={18} strokeWidth={2} />
          </span>
        </button>
      ) : (
        <div className="product-stage relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
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
              onClick={() => setActive(i)}
              aria-label={`Ver imagen ${i + 1} de ${images.length}`}
              aria-current={i === active}
              // El botón aporta los 44px táctiles; el punto visible mide 6px.
              className="grid h-11 w-5 place-items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === active ? 'w-4 bg-primary' : 'w-1.5 bg-border',
                )}
              />
            </button>
          ))}
        </div>
      )}

      {hasMany && (
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver imagen ${i + 1} de ${name}`}
              aria-current={i === active}
              className={cn(
                'h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                i === active ? 'border-primary' : 'border-border hover:border-foreground/25',
              )}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
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
            <img
              src={current}
              alt={name}
              className="max-h-[85dvh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
