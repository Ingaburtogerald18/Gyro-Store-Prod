// Novedades de la portada (DESIGN.md §10): los banners que no son la presentación, todos a la vista y sin
// rotar. El botón de cada una va con borde: el amarillo queda para la presentación.
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { presentationSlideId, type HeroSlide, type LandingConfig } from '@shared/schemas';
import { useShownLanding } from '~/components/catalog/hero';
import { SlideAction } from '~/components/catalog/slide-action';
import { SlideMedia } from '~/components/catalog/slide-media';
import { Chip } from '~/components/ui/chip';

export function Novedades({ initialLanding }: { initialLanding?: LandingConfig | null }) {
  const { landing, editing, selectedSlideId } = useShownLanding(initialLanding);
  const presentationId = presentationSlideId(landing.heroSlides);
  // Una novedad oculta solo aparece en el modo edición mientras se la edita.
  const items = landing.heroSlides.filter(
    (slide) => slide.id !== presentationId && (slide.visible !== false || (editing && slide.id === selectedSlideId)),
  );
  if (items.length === 0) return null;

  return (
    <section data-landing-section="banners" aria-labelledby="novedades-title" className="mx-auto max-w-7xl px-4 py-6 md:py-8">
      <h2 id="novedades-title" className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        Novedades
      </h2>
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((slide) => (
          <NovedadCard key={slide.id} slide={slide} editing={editing} />
        ))}
      </ul>
    </section>
  );
}

function NovedadCard({ slide, editing }: { slide: HeroSlide; editing: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  // Varios videos a la vez pesan: cada uno se reproduce solo mientras está en pantalla.
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <li ref={ref} data-landing-slide={slide.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <div
        data-landing-element="image"
        role={editing ? 'button' : undefined}
        tabIndex={editing ? 0 : undefined}
        aria-label={editing ? 'Editar imagen de la novedad' : undefined}
        className="relative aspect-[4/3] border-b border-border bg-card"
      >
        <SlideMedia
          slide={slide}
          priority={false}
          paused={Boolean(reduce) || !inView}
          freeze={Boolean(reduce)}
          className="absolute inset-0 h-full w-full object-contain p-2"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {slide.visible === false && (
          <Chip variant="status" tone="neutral" className="self-start">Oculta</Chip>
        )}
        <h3 data-landing-element="title" role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined} className="text-lg font-semibold text-foreground">
          {slide.title}
        </h3>
        {slide.description && (
          <p data-landing-element="description" role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined} className="text-sm leading-relaxed text-muted-foreground">
            {slide.description}
          </p>
        )}
        <div className="mt-auto pt-2">
          <SlideAction slide={slide} variant="outline" className="w-full sm:w-auto" />
        </div>
      </div>
    </li>
  );
}
