// Render de la media de un slide: imagen (incluye GIF) o video en bucle mudo.
// Separado del Hero porque el editor del admin lo reusa para la vista previa.
import { useEffect, useRef } from 'react';

import { mobileImageOf, type HeroSlide } from '@shared/schemas';
import { cn } from '~/lib/utils';

/**
 * Debajo de `md` (48rem), donde el banner pasa a su composición de celular. Es el complemento exacto
 * del `md` de Tailwind: no queda ningún ancho sin imagen ni con las dos.
 */
export const MOBILE_IMAGE_MEDIA = 'not all and (min-width: 48rem)';

const isAnimated = (url: string | undefined) => Boolean(url && /\.(gif|webp)($|\?)/i.test(url));

export function SlideMedia({
  slide,
  className,
  paused = false,
  freeze = false,
  priority = true,
}: {
  slide: Pick<HeroSlide, 'mediaUrl' | 'mediaType' | 'mobileImageUrl' | 'title'>;
  className?: string;
  /** Pausa el video (fuera de pantalla o con movimiento reducido). */
  paused?: boolean;
  /** Congela GIF/WebP animados (movimiento reducido). */
  freeze?: boolean;
  /** La presentación es lo primero que se ve: carga ya. Las novedades, más abajo, cuando hacen falta. */
  priority?: boolean;
}) {
  if (!slide.mediaUrl) {
    return (
      <div className={cn('grid place-items-center bg-muted text-xs text-muted-foreground', className)}>
        Sin media
      </div>
    );
  }

  if (slide.mediaType === 'video') {
    return <SlideVideo key={slide.mediaUrl} slide={slide} className={className} paused={paused} />;
  }

  const mobile = mobileImageOf(slide);
  const alt = slide.title || '';

  // Una <img> animada no se pausa: congelada se dibuja un cuadro fijo en un canvas.
  if (freeze && (isAnimated(slide.mediaUrl) || isAnimated(mobile))) {
    return <FrozenImage src={slide.mediaUrl} mobileSrc={mobile} alt={alt} className={className} />;
  }

  // React 18 requiere el atributo HTML en minúsculas para evitar un warning.
  const image = priority ? (
    <img src={slide.mediaUrl} alt={alt} {...{ fetchpriority: 'high' }} loading="eager" width={1200} height={900} className={className} />
  ) : (
    <img src={slide.mediaUrl} alt={alt} loading="lazy" decoding="async" width={1200} height={900} className={className} />
  );
  if (!mobile) return image;

  // El navegador elige y descarga una sola: la del celular debajo de md y la principal en el resto.
  return (
    <picture>
      <source media={MOBILE_IMAGE_MEDIA} srcSet={mobile} />
      {image}
    </picture>
  );
}

/**
 * Primer cuadro de una imagen animada, quieto. La elige un <picture> oculto, igual que la imagen
 * normal, y se vuelve a dibujar si al cambiar el ancho el navegador elige la otra.
 */
function FrozenImage({ src, mobileSrc, alt, className }: { src: string; mobileSrc?: string; alt: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement>(null);

  // La imagen puede terminar de cargar antes de hidratar, sin que React vea el onLoad.
  useEffect(() => {
    if (source.current?.complete) drawFrame(source.current, canvas.current);
  }, [src, mobileSrc]);

  return (
    <>
      <picture hidden>
        {mobileSrc && <source media={MOBILE_IMAGE_MEDIA} srcSet={mobileSrc} />}
        <img ref={source} src={src} alt="" onLoad={(event) => drawFrame(event.currentTarget, canvas.current)} />
      </picture>
      <canvas ref={canvas} role="img" aria-label={alt || undefined} width={1200} height={900} className={className} />
    </>
  );
}

function drawFrame(img: HTMLImageElement, el: HTMLCanvasElement | null) {
  if (!el || !img.naturalWidth) return;
  el.width = img.naturalWidth;
  el.height = img.naturalHeight;
  el.getContext('2d')?.drawImage(img, 0, 0);
}

function SlideVideo({
  slide,
  className,
  paused,
}: {
  slide: Pick<HeroSlide, 'mediaUrl' | 'title'>;
  className?: string;
  paused: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Safari ignora el atributo `muted` en el markup: hay que forzarlo en la
    // propiedad, o el autoplay queda bloqueado.
    el.defaultMuted = true;
    el.muted = true;
    if (paused) el.pause();
    else el.play().catch(() => {});
  }, [paused]);

  return (
    <video
      ref={ref}
      src={slide.mediaUrl}
      autoPlay={!paused}
      muted
      loop
      playsInline
      controls={false}
      disablePictureInPicture
      aria-label={slide.title || undefined}
      className={className}
    />
  );
}
