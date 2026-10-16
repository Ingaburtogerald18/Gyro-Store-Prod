// Galería de la ficha. En el celular, un carrusel nativo (se desliza sin trabar el scroll vertical, y deslizar
// no abre la ampliación) con «1 de 9» y flechas de 44 px; desde tableta, foto grande y miniaturas. En los
// dos, tocar la foto la amplía con anterior y siguiente.
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon, ImageNotFound01Icon, ZoomInAreaIcon } from '@hugeicons/core-free-icons';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { ThumbnailImg } from '~/components/product/thumbnail-img';

/** Píxeles de arrastre para pasar de foto. Menos que esto es un toque, no swipe. */
const SWIPE_THRESHOLD = 50;
// Botón redondo sobre la foto: 44 px de objetivo táctil.
const ROUND = 'grid size-11 place-items-center rounded-full border border-border bg-background text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40';

/** Desplaza un carrusel nativo hasta una foto. */
function scrollToSlide(track: HTMLDivElement | null, index: number, smooth: boolean) {
  if (!track) return;
  track.scrollTo({ left: index * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

/** La foto que se ve en un carrusel nativo, según dónde quedó el desplazamiento. */
const slideAt = (track: HTMLDivElement) => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));

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
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef({ x: 0, y: 0, moved: false });
  const activeRef = useRef(active);
  activeRef.current = active;
  // La primera foto se pinta visible desde el servidor; el fundido solo acompaña los cambios de foto.
  const [changed, setChanged] = useState(false);

  // Si cambia el juego de fotos (otra variante de color), volver a la primera: el índice viejo puede no existir.
  useEffect(() => {
    setActive(0);
    scrollToSlide(trackRef.current, 0, false);
  }, [images]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => scrollToSlide(track, activeRef.current, false));
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const current = images[active] ?? images[0];
  const hasMany = images.length > 1;
  const smooth = !reduce;

  function step(direction: 1 | -1) {
    setChanged(true);
    setActive((prev) => (prev + direction + images.length) % images.length);
  }

  function show(index: number) {
    setChanged(true);
    setActive(index);
  }

  // Celular: las flechas mueven el carrusel; el índice lo actualiza el propio desplazamiento.
  function slide(direction: 1 | -1) {
    scrollToSlide(trackRef.current, Math.min(images.length - 1, Math.max(0, active + direction)), smooth);
  }

  // Al cerrar la ampliación, el carrusel queda en la foto que se estaba mirando.
  function onZoomChange(open: boolean) {
    setZoomed(open);
    if (!open) scrollToSlide(trackRef.current, active, false);
  }

  if (!current) {
    return (
      <div className="product-stage relative mx-auto grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-muted text-muted-foreground sm:max-w-[30rem]">
        <HugeIcon icon={ImageNotFound01Icon} size={40} strokeWidth={2} aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Celular: carrusel a todo el ancho ── */}
      <div className="relative md:hidden">
        <div
          ref={trackRef}
          onScroll={(event) => setActive(slideAt(event.currentTarget))}
          aria-label={`Fotos de ${name}`}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onPointerDown={(event) => {
                gesture.current = { x: event.clientX, y: event.clientY, moved: false };
              }}
              onPointerMove={(event) => {
                if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 8) gesture.current.moved = true;
              }}
              onPointerCancel={() => { gesture.current.moved = true; }}
              onClick={(event) => {
                if (event.detail > 0 && gesture.current.moved) return;
                setActive(i);
                setZoomed(true);
              }}
              tabIndex={i === active ? 0 : -1}
              aria-label={hasMany ? `Ampliar foto ${i + 1} de ${images.length}` : `Ampliar foto de ${name}`}
              className="product-stage relative aspect-square w-full shrink-0 snap-center snap-always overflow-hidden rounded-2xl bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            >
              <img
                src={src}
                alt={i === 0 ? name : `${name}, foto ${i + 1}`}
                width={1000}
                height={1000}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
                className="h-full w-full object-contain select-none"
              />
            </button>
          ))}
        </div>

        {soldOut && (
          <Badge variant="category" className="pointer-events-none absolute top-3 left-3">
            Agotado
          </Badge>
        )}
        {hasMany && (
          <>
            <span className="pointer-events-none absolute top-3 right-3 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground tabular-nums" aria-hidden>
              {active + 1} de {images.length}
            </span>
            <span className="sr-only" aria-live="polite">
              Foto {active + 1} de {images.length}
            </span>
            <button type="button" onClick={() => slide(-1)} disabled={active === 0} aria-label="Foto anterior" className={cn(ROUND, 'absolute top-1/2 left-2 -translate-y-1/2')}>
              <HugeIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} aria-hidden />
            </button>
            <button type="button" onClick={() => slide(1)} disabled={active === images.length - 1} aria-label="Foto siguiente" className={cn(ROUND, 'absolute top-1/2 right-2 -translate-y-1/2')}>
              <HugeIcon icon={ArrowRight01Icon} size={20} strokeWidth={2} aria-hidden />
            </button>
          </>
        )}
        <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-background text-foreground">
          <HugeIcon icon={ZoomInAreaIcon} size={18} strokeWidth={2} />
        </span>
      </div>

      {/* ── Desde tableta: foto grande y miniaturas, como siempre ── */}
      <button
        ref={stageRef}
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={`Ampliar imagen de ${name}`}
        className="product-stage group relative mx-auto hidden aspect-square w-full max-w-[30rem] cursor-zoom-in overflow-hidden rounded-2xl bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:block"
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
          // El drag solo existe con más de una foto; con una sola, arrastrar no lleva a ningún lado.
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
        <span aria-hidden className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-background text-foreground">
          <HugeIcon icon={ZoomInAreaIcon} size={18} strokeWidth={2} />
        </span>
      </button>

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

      <Dialog open={zoomed} onOpenChange={onZoomChange}>
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          // Safari no enfoca un botón al tocarlo: el foco vuelve a mano a la foto que se estaba mirando.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const mobileSlide = trackRef.current?.offsetParent ? trackRef.current.children[active] : null;
            ((mobileSlide ?? stageRef.current) as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          className={cn(
            'max-w-[min(92vw,64rem)] border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,64rem)]',
            // Celular: pantalla completa, con los controles abajo, al alcance del pulgar.
            'max-md:inset-0 max-md:flex max-md:h-dvh max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:flex-col max-md:gap-0 max-md:rounded-none max-md:bg-background',
          )}
        >
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <ZoomViewer images={images} name={name} active={active} onActive={show} onPrev={() => step(-1)} onNext={() => step(1)} onClose={() => onZoomChange(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Ampliación: la foto original (nunca la miniatura). Celular: se desliza y los controles van abajo. */
function ZoomViewer({
  images,
  name,
  active,
  onActive,
  onPrev,
  onNext,
  onClose,
}: {
  images: string[];
  name: string;
  active: number;
  onActive: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const hasMany = images.length > 1;
  const current = images[active] ?? images[0];

  // Abre en la foto que se estaba mirando; las flechas mueven el carrusel.
  useEffect(() => {
    const track = trackRef.current;
    if (track && slideAt(track) !== active) scrollToSlide(track, active, false);
  }, [active]);

  function slide(direction: 1 | -1) {
    scrollToSlide(trackRef.current, Math.min(images.length - 1, Math.max(0, active + direction)), !reduce);
  }

  return (
    <>
      {/* Celular */}
      <div
        ref={trackRef}
        onScroll={(event) => {
          const index = slideAt(event.currentTarget);
          if (index !== active) onActive(index);
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <div key={src} className="grid h-full w-full shrink-0 snap-center snap-always place-items-center p-4">
            <img src={src} alt={i === 0 ? name : `${name}, foto ${i + 1}`} loading={Math.abs(i - active) <= 1 ? 'eager' : 'lazy'} decoding="async" className="max-h-full w-full object-contain" />
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="flex items-center gap-2">
          {hasMany && (
            <>
              <button type="button" onClick={() => slide(-1)} disabled={active === 0} aria-label="Foto anterior" className={ROUND}>
                <HugeIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} aria-hidden />
              </button>
              <span className="min-w-14 text-center text-sm font-medium text-foreground tabular-nums" aria-live="polite">
                {active + 1} de {images.length}
              </span>
              <button type="button" onClick={() => slide(1)} disabled={active === images.length - 1} aria-label="Foto siguiente" className={ROUND}>
                <HugeIcon icon={ArrowRight01Icon} size={20} strokeWidth={2} aria-hidden />
              </button>
            </>
          )}
        </div>
        <Button variant="cancel" onClick={onClose} className="h-11 px-4">
          <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
          Cerrar
        </Button>
      </div>

      {/* Desde tableta, como siempre */}
      <div className="relative hidden md:block">
        <img src={current} alt={name} className="max-h-[85dvh] w-full rounded-xl object-contain" />
        <Button variant="cancel" size="icon-sm" onClick={onClose} className="absolute top-2.5 right-2.5 size-11" aria-label="Cerrar">
          <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
        </Button>
        {hasMany && (
          <>
            <button type="button" onClick={onPrev} aria-label="Foto anterior" className="absolute top-1/2 left-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <HugeIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} aria-hidden />
            </button>
            <button type="button" onClick={onNext} aria-label="Foto siguiente" className="absolute top-1/2 right-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <HugeIcon icon={ArrowRight01Icon} size={20} strokeWidth={2} aria-hidden />
            </button>
            <span className="font-spec absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-0.5 text-xs text-foreground tabular-nums">
              {active + 1} / {images.length}
            </span>
          </>
        )}
      </div>
    </>
  );
}
