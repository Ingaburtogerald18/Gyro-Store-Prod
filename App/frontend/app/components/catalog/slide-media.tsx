// Render de la media de un slide: imagen (incluye GIF) o video en bucle mudo.
// Separado del Hero porque el editor del admin lo reusa para la vista previa.
import { useEffect, useRef } from 'react';

import type { HeroSlide } from '@shared/schemas';
import { cn } from '~/lib/utils';

export function SlideMedia({
  slide,
  className,
  paused = false,
  freeze = false,
}: {
  slide: Pick<HeroSlide, 'mediaUrl' | 'mediaType' | 'title'>;
  className?: string;
  /** Pausa el video y congela GIF/WebP. El botón de pausa del hero y el
   *  movimiento reducido detenían la rotación, pero la media seguía en bucle. */
  paused?: boolean;
  /** Congela GIF/WebP animados (movimiento reducido). */
  freeze?: boolean;
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

  // Una <img> animada no se pausa: congelada se dibuja un cuadro fijo en un canvas.
  if (freeze && /\.(gif|webp)($|\?)/i.test(slide.mediaUrl)) {
    return <FrozenImage src={slide.mediaUrl} alt={slide.title || ''} className={className} />;
  }

  // React 18 requiere el atributo HTML en minúsculas para evitar un warning.
  return <img src={slide.mediaUrl} alt={slide.title || ''} {...{ fetchpriority: 'high' }} loading="eager" width={1200} height={900} className={className} />;
}

/** Primer cuadro de una imagen animada, quieto. */
function FrozenImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const el = canvas.current;
      if (!el) return;
      el.width = img.naturalWidth;
      el.height = img.naturalHeight;
      el.getContext('2d')?.drawImage(img, 0, 0);
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return <canvas ref={canvas} role="img" aria-label={alt || undefined} width={1200} height={900} className={className} />;
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
