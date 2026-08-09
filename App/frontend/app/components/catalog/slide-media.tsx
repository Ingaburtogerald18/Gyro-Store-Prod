// Render de la media de un slide: imagen (incluye GIF) o video en bucle mudo.
// Separado del Hero porque el editor del admin lo reusa para la vista previa.
import type { HeroSlide } from '@shared/schemas';
import { cn } from '~/lib/utils';

export function SlideMedia({
  slide,
  className,
}: {
  slide: Pick<HeroSlide, 'mediaUrl' | 'mediaType' | 'title'>;
  className?: string;
}) {
  if (!slide.mediaUrl) {
    return (
      <div className={cn('grid place-items-center bg-muted text-xs text-muted-foreground', className)}>
        Sin media
      </div>
    );
  }

  if (slide.mediaType === 'video') {
    return (
      <video
        key={slide.mediaUrl}
        src={slide.mediaUrl}
        autoPlay
        muted
        loop
        playsInline
        controls={false}
        disablePictureInPicture
        aria-label={slide.title || undefined}
        className={className}
        ref={(el) => {
          // Safari ignora el atributo `muted` en el markup: hay que forzarlo en
          // la propiedad, o el autoplay queda bloqueado.
          if (el) {
            el.defaultMuted = true;
            el.muted = true;
            el.play().catch(() => {});
          }
        }}
      />
    );
  }

  return <img src={slide.mediaUrl} alt={slide.title || ''} className={className} />;
}
