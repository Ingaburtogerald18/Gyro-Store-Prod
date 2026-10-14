// Presentación de la portada (DESIGN.md §10): el banner principal, fijo, sin rotar, con el único H1 de la
// portada. Los demás banners son Novedades (novedades.tsx). El SSR siembra el primer render con `initialLanding`.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import { useReducedMotion } from 'framer-motion';

import { presentationSlideId, type LandingConfig } from '@shared/schemas';
import { SlideAction } from '~/components/catalog/slide-action';
import { SlideMedia } from '~/components/catalog/slide-media';
import { Button } from '~/components/ui/button';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { useAppSelector } from '~/state/hooks';
import { selectEditMode, selectIsAdmin, selectIsStaff } from '~/state/slices/auth-slice';
import { selectDraftLandingConfig, selectActiveHeroSlideId } from '~/state/slices/builder-slice';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useGetLandingConfigQuery } from '~/state/api/storefront-api';
import { cn } from '~/lib/utils';
import { buildWhatsappUrl } from '~/lib/formatters';
import { trackWhatsappOpen } from '~/lib/analytics.client';

const EMPTY_LANDING: LandingConfig = { headerCategories: [], heroSlides: [] };

/** La portada que se pinta: el borrador en el modo edición; si no, la publicada. */
export function useShownLanding(initialLanding?: LandingConfig | null) {
  const [params] = useSearchParams();
  // Mismo criterio que useStoreLanding: el visitante usa lo que trajo la página.
  const isStaff = useAppSelector(selectIsStaff);
  const { data: landingData } = useGetLandingConfigQuery(undefined, { skip: Boolean(initialLanding) && !isStaff });
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const editing = (isAdmin || params.get('landing-preview') === '1') && editMode;
  const draftLanding = useAppSelector(selectDraftLandingConfig);
  const selectedSlideId = useAppSelector(selectActiveHeroSlideId);
  const landing = editing && draftLanding ? draftLanding : (landingData ?? initialLanding ?? EMPTY_LANDING);
  return { landing, editing, selectedSlideId };
}

export function Hero({ initialLanding }: { initialLanding?: LandingConfig | null }) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const { landing, editing, selectedSlideId } = useShownLanding(initialLanding);
  const presentationId = presentationSlideId(landing.heroSlides);
  const slide = landing.heroSlides.find((item) => item.id === presentationId);

  const config = useStoreConfig();
  const whatsappUrl = buildWhatsappUrl(
    config?.whatsapp ?? '',
    `Hola ${config?.brandName ?? ''}, tengo una consulta`.replace(/\s+,/, ','),
  );

  // Fuera de pantalla o con la pestaña oculta, un video de la presentación se pausa.
  useEffect(() => {
    const el = sectionRef.current;
    let inView = true;
    let pageVisible = !document.hidden;
    const update = () => setVisible(inView && pageVisible);
    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { inView = Boolean(entry?.isIntersecting); update(); }, { threshold: 0.3 })
      : null;
    if (el && observer) observer.observe(el);
    const onVisibility = () => { pageVisible = !document.hidden; update(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Sin presentación configurada: no romper la home, simplemente no pintarla.
  if (!slide) return null;
  if (slide.visible === false) {
    if (!(editing && selectedSlideId === slide.id)) return null;
    return (
      <section data-landing-section="banners" data-landing-slide={slide.id} className="mx-auto max-w-7xl p-8">
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          La presentación está oculta. Podés volver a mostrarla desde «Diseño».
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      data-landing-section="banners"
      data-landing-slide={slide.id}
      aria-label="Presentación"
      className="mx-auto w-full max-w-7xl px-4 pt-3 pb-2 sm:pt-5"
    >
      <div className="relative w-full overflow-hidden rounded-3xl border border-border bg-card">
        {/* Altura contenida: los productos tienen que asomar antes. min-h y no h fija para que un título
            largo no se salga de la tarjeta. */}
        <div className={cn('flex min-h-[300px] flex-col items-stretch md:min-h-[360px]', slide.layout !== 'top' && 'md:flex-row')}>
          <div
            data-landing-element="image"
            role={editing ? 'button' : undefined}
            tabIndex={editing ? 0 : undefined}
            aria-label={editing ? 'Editar imagen de la presentación' : undefined}
            className={cn(
              'relative flex h-[150px] w-full items-center justify-center overflow-hidden border-b border-border bg-card sm:h-[240px]',
              slide.layout === 'top' ? 'md:h-80' : 'md:h-auto md:w-1/2 md:border-b-0',
              slide.layout === 'right' ? 'md:order-2 md:border-l' : slide.layout !== 'top' && 'md:border-r',
            )}
          >
            <SlideMedia
              key={slide.id}
              slide={slide}
              paused={Boolean(reduce) || !visible}
              freeze={Boolean(reduce)}
              className="absolute inset-0 h-full w-full object-contain p-2 sm:p-4"
            />
          </div>

          <div className={cn('relative z-10 flex w-full flex-col justify-center p-5 text-left sm:p-8 md:px-10 md:py-10', slide.layout !== 'top' && 'md:w-1/2')}>
            <div className="space-y-3 sm:space-y-4">
              {/* Título y mensaje en HTML (no dentro de la imagen): se leen, se traducen y escalan. */}
              <h1
                data-landing-element="title"
                role={editing ? 'button' : undefined}
                tabIndex={editing ? 0 : undefined}
                className="font-heading text-3xl leading-[1.08] font-extrabold tracking-tight text-balance text-foreground lg:text-5xl"
              >
                {slide.title}
              </h1>

              {slide.description && (
                <p
                  data-landing-element="description"
                  role={editing ? 'button' : undefined}
                  tabIndex={editing ? 0 : undefined}
                  className="line-clamp-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:line-clamp-none sm:text-base"
                >
                  {slide.description}
                </p>
              )}

              {/* Una acción principal y WhatsApp como secundaria. A 320px se apilan: los nombres nunca se recortan. */}
              <div className="flex flex-col gap-2 pt-1 min-[360px]:flex-row min-[360px]:flex-wrap sm:gap-3">
                <SlideAction slide={slide} variant="default" />
                <Button variant="whatsappOutline" asChild className="h-12 justify-center px-5 text-sm sm:text-base">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Escribinos por WhatsApp" onClick={() => trackWhatsappOpen('consult')}>
                    <WhatsappIcon aria-hidden className="size-4 shrink-0" />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
