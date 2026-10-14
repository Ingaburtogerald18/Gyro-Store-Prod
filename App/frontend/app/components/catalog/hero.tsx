// Banners de la portada. No rotan solos salvo que se active la reproducción; se detienen fuera de
// pantalla. El SSR siembra el primer render con `initialLanding` para que no parpadee.
import { HugeIcon } from "~/components/ui/icon";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowRight02Icon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from '@remix-run/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { type LandingConfig } from '@shared/schemas';
import { SlideMedia } from '~/components/catalog/slide-media';
import { Button } from '~/components/ui/button';
import { useAppSelector } from '~/state/hooks';
import { selectEditMode, selectIsAdmin } from '~/state/slices/auth-slice';
import { selectDraftLandingConfig, selectActiveHeroSlideId } from '~/state/slices/builder-slice';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useGetLandingConfigQuery } from '~/state/api/storefront-api';
import { WhatsappIcon } from '~/components/ui/whatsapp-icon';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '~/components/ui/social-icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { cn } from "~/lib/utils"
import { buildWhatsappUrl } from "~/lib/formatters";

const SLIDE_MS = 8000;
const EMPTY_LANDING: LandingConfig = { headerCategories: [], heroSlides: [] };

export function Hero({ initialLanding }: { initialLanding?: LandingConfig | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduce = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  // Manual hasta que la persona pida reproducir.
  const [playing, setPlaying] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  // El primer slide sale visible desde el HTML del servidor; solo se animan los
  // cambios de slide, así una red lenta no deja el titular invisible.
  const [animateEntry, setAnimateEntry] = useState(false);
  if (activeIndex !== 0 && !animateEntry) setAnimateEntry(true);

  const { data: landingData } = useGetLandingConfigQuery();
  
  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const editing = (isAdmin || params.get('landing-preview') === '1') && editMode;
  const draftLanding = useAppSelector(selectDraftLandingConfig);
  const selectedSlideId = useAppSelector(selectActiveHeroSlideId);
  
  const landing = editing && draftLanding ? draftLanding : (landingData ?? initialLanding ?? EMPTY_LANDING);
  const slides = landing.heroSlides.filter(slide => slide.visible !== false || (editing && slide.id === selectedSlideId));

  const config = useStoreConfig();
  // Redes del slide con acción "social": solo las que tienen link cargado.
  const social = config?.socialLinks;
  const socialItems = [
    { key: 'facebook', label: 'Facebook', href: social?.facebook?.trim(), Icon: FacebookIcon },
    { key: 'instagram', label: 'Instagram', href: social?.instagram?.trim(), Icon: InstagramIcon },
    { key: 'tiktok', label: 'TikTok', href: social?.tiktok?.trim(), Icon: TikTokIcon },
  ].filter((s): s is typeof s & { href: string } => Boolean(s.href));
  const whatsappOrderUrl = buildWhatsappUrl(
    config?.whatsapp ?? '',
    `Hola ${config?.brandName ?? ''}, quiero hacer un pedido`.replace(/\s+,/, ','),
  );

  // El índice nunca debe salirse del rango: los slides pueden crecer o menguar.
  const selectedIndex = editing ? slides.findIndex(slide => slide.id === selectedSlideId) : -1;
  const safeIndex = selectedIndex >= 0 ? selectedIndex : slides.length ? Math.min(activeIndex, slides.length - 1) : 0;
  const activeSlide = slides[safeIndex];
  // Editando NO rota solo: el carrusel cambiando de slide mientras alguien
  // acomoda uno es pelearse con la pantalla.
  const autoPlaying = playing && visible && !reduce && !editing && slides.length > 1;

  // Fuera de pantalla o con la pestaña oculta no rota (ni gasta trabajo).
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

  const goTo = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((prev) =>
        slides.length ? (prev + dir + slides.length) % slides.length : 0,
      );
    },
    [slides.length],
  );

  useEffect(() => {
    if (!autoPlaying) return;
    const timer = setTimeout(() => goTo(1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [autoPlaying, safeIndex, goTo]);

  // Sin slides configurados: no romper la home, simplemente no pintar el hero.
  if (!activeSlide) return null;
  if (activeSlide.visible === false) return <section data-landing-section="banners" data-landing-slide={activeSlide.id} className="mx-auto max-w-7xl p-8"><div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Este banner está oculto. Podés volver a mostrarlo desde «Diseño».</div></section>;

  function handlePrimaryAction() {
    const target = activeSlide.actionTarget || '/#catalogo';
    if (target.startsWith('http')) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(target);
    // Si es un ancla de la misma página, el scroll suave hay que hacerlo a mano.
    if (target.includes('#')) {
      const id = target.split('#')[1];
      setTimeout(
        () => document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
        50,
      );
    }
  }

  return (
    <section ref={sectionRef} data-landing-section="banners" data-landing-slide={activeSlide.id} aria-roledescription="carrusel" aria-label="Novedades de la tienda" className="mx-auto w-full max-w-7xl px-4 pt-3 pb-2 sm:pt-5">
      <div className="relative w-full overflow-hidden rounded-3xl border border-border bg-card">
        {/* Altura contenida: el catálogo tiene que asomar antes. min-h y no h
            fija para que un título largo no se salga de la tarjeta. */}
        <div className={cn('flex min-h-[300px] flex-col items-stretch md:min-h-[360px]', activeSlide.layout !== 'top' && 'md:flex-row')}>
          {/* ── Media ── */}
          <div data-landing-element="image" role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined} aria-label={editing ? 'Editar imagen del banner' : undefined} className={cn('relative flex h-[150px] w-full items-center justify-center overflow-hidden border-b border-border bg-card sm:h-[240px]', activeSlide.layout === 'top' ? 'md:h-80' : 'md:h-auto md:w-1/2 md:border-b-0', activeSlide.layout === 'right' ? 'md:order-2 md:border-l' : activeSlide.layout !== 'top' && 'md:border-r')}>
            <SlideMedia
              key={activeSlide.id}
              slide={activeSlide}
              // El video se pausa fuera de pantalla o con movimiento reducido; la pausa del carrusel detiene la
              // rotación, no la animación de la imagen.
              paused={Boolean(reduce) || !visible}
              freeze={Boolean(reduce)}
              className="absolute inset-0 h-full w-full object-contain p-2 sm:p-4"
            />
          </div>

          {/* ── Texto ── */}
          <div className={cn('relative z-10 flex w-full flex-col justify-center p-5 text-left sm:p-8 md:px-10 md:py-10', activeSlide.layout !== 'top' && 'md:w-1/2')}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide.id}
                initial={reduce || editing || !animateEntry ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }}
                transition={{ duration: reduce || editing ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-3 sm:space-y-4"
              >
                {/* Título y mensaje en HTML (no dentro de la imagen): se leen,
                    se traducen y escalan en cualquier pantalla. */}
                <h1 data-landing-element="title" role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined} className="font-heading text-3xl leading-[1.08] font-extrabold tracking-tight text-balance text-foreground lg:text-5xl">
                  {activeSlide.title}
                </h1>

                {activeSlide.description && (
                  <p data-landing-element="description" role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined} className="line-clamp-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:line-clamp-none sm:text-base">
                    {activeSlide.description}
                  </p>
                )}

                {/* Una acción principal y WhatsApp como secundaria. A 320px se
                    apilan: los nombres nunca se recortan. */}
                <div className="flex flex-col gap-2 pt-1 min-[360px]:flex-row min-[360px]:flex-wrap sm:gap-3">
                  {activeSlide.actionType === 'social' && socialItems.length > 0 ? (
                    // Acción "redes sociales": menú con las redes configuradas.
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-landing-element="button" className="h-12 justify-center px-5 text-sm sm:text-base">
                          {activeSlide.buttonText || 'Seguinos'}
                          <HugeIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-auto min-w-48">
                        {socialItems.map(({ key, label, href, Icon }) => (
                          <DropdownMenuItem key={key} asChild className="min-h-11 gap-3 text-sm font-medium">
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              <Icon className="size-5 shrink-0" />
                              {label}
                            </a>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button data-landing-element="button" onClick={handlePrimaryAction} className="group/cta h-12 justify-center px-5 text-sm sm:text-base">
                      {activeSlide.buttonText || 'Ver catálogo'}
                      <HugeIcon icon={ArrowRight02Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 transition-transform duration-200 group-hover/cta:translate-x-0.5 motion-reduce:transition-none" />
                    </Button>
                  )}

                  <Button
                    variant="whatsappOutline"
                    onClick={() => window.open(whatsappOrderUrl, '_blank', 'noopener,noreferrer')}
                    aria-label="Escribinos por WhatsApp"
                    className="h-12 justify-center px-5 text-sm sm:text-base"
                  >
                    <WhatsappIcon aria-hidden className="size-4 shrink-0" />
                    WhatsApp
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Controles: discretos, con objetivos cómodos ── */}
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              data-preview-control
              onClick={() => setPlaying((p) => !p)}
              disabled={Boolean(reduce)}
              aria-pressed={undefined}
              aria-label={playing ? 'Pausar el cambio automático de banners' : 'Reproducir los banners automáticamente'}
              title={reduce ? 'Cambio automático desactivado por movimiento reducido' : undefined}
              className="size-11 rounded-full text-muted-foreground"
            >
              <HugeIcon icon={playing ? PauseIcon : PlayIcon} size={14} strokeWidth={2} aria-hidden className="fill-current" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-preview-control
              onClick={() => goTo(-1)}
              aria-label="Banner anterior"
              className="size-11 rounded-full text-muted-foreground"
            >
              <HugeIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden />
            </Button>

            <div className="flex items-center">
              {slides.map((slide, idx) => {
                const isActive = idx === safeIndex;
                return (
                  // El botón aporta los 44px de zona táctil; el indicador visible es chico.
                  // Tocar un indicador NO reanuda la rotación: la pausa manual se respeta.
                  <button
                    key={slide.id}
                    type="button"
                    data-preview-control
                    onClick={() => setActiveIndex(idx)}
                    className="group/dot grid size-11 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Banner ${idx + 1} de ${slides.length}`}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span
                      className={cn(
                        'relative block h-2 overflow-hidden rounded-full bg-muted-foreground/30 transition-[width] duration-200 motion-reduce:transition-none',
                        isActive ? 'w-6 bg-primary-2' : 'w-2 group-hover/dot:bg-muted-foreground/60',
                      )}
                    />
                  </button>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="icon"
              data-preview-control
              onClick={() => goTo(1)}
              aria-label="Banner siguiente"
              className="size-11 rounded-full text-muted-foreground"
            >
              <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
