// Render de la media de un slide: imagen (incluye GIF) o video en bucle mudo.
// Separado del Hero porque el editor del admin lo reusa para la vista previa.
import { useEffect, useRef } from 'react';

import type { HeroSlide } from '@shared/schemas';
import { cn } from '~/lib/utils';

export function SlideMedia({
  slide,
  className,
  paused = false,
}: {
  slide: Pick<HeroSlide, 'mediaUrl' | 'mediaType' | 'title'>;
  className?: string;
  /** Pausa el video. El botón de pausa del hero y el movimiento reducido
   *  detenían la rotación de slides, pero el video seguía en bucle. */
  paused?: boolean;
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

  // React 18 requiere el atributo HTML en minúsculas para evitar un warning.
  return <img src={slide.mediaUrl} alt={slide.title || ''} {...{ fetchpriority: 'high' }} loading="eager" width={1200} height={900} className={className} />;
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
