// Hero slider de la home. Portado de la versión que corre hoy en la tienda:
// contenedor split (media a la izquierda, texto a la derecha), transición
// horizontal entre slides, autoplay de 8s con pausa, flechas y puntos con
// barra de progreso.
//
// Los slides vienen de /api/landing-config (editables desde el panel). El SSR
// siembra el primer render con `initialLanding` para que no parpadee; RTK Query
// se vuelve la fuente de verdad en cliente.
//
// ── Modo edición ──
// Un admin puede activarlo desde el menú del avatar (solo en la home) y editar
// las diapositivas EN LA PÁGINA: mover, editar, agregar y borrar. Se edita acá y
// no en el panel porque una diapositiva es composición visual — el texto y la
// foto se juzgan viendo el resultado, no un formulario en otra pantalla.
import { HugeIcon } from "~/components/ui/icon";
import { Add01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowRight02Icon, Delete02Icon, Edit02Icon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@remix-run/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

function WhatsappIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={14}
      height={14}
      {...props}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

import { MAX_HERO_SLIDES, type HeroSlide, type LandingConfig } from '@shared/schemas';
import { HeroSlideEditorDialog } from '~/components/catalog/HeroSlideEditorDialog';
import { SlideMedia } from '~/components/catalog/slide-media';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { useAppSelector } from '~/store/hooks';
import { selectEditMode, selectIsAdmin } from '~/store/slices/authSlice';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useGetLandingConfigQuery, useUpdateLandingConfigMutation } from '~/store/api/storefrontApi';
import { cn } from "~/lib/utils"
import { buildWhatsappUrl } from "~/lib/formatters";

const SLIDE_MS = 8000;
const EMPTY_LANDING: LandingConfig = { headerCategories: [], heroSlides: [] };

/** Diapositiva nueva, ya válida contra el schema: el editor la completa. */
function blankSlide(): HeroSlide {
  return {
    id: `slide-${Date.now().toString(36)}`,
    eyebrow: '',
    title: 'Nueva diapositiva',
    description: '',
    mediaUrl: '',
    mediaType: 'image',
    buttonText: 'Ver catálogo',
    actionType: 'link',
    actionTarget: '/#catalogo',
  };
}

export function Hero({ initialLanding }: { initialLanding?: LandingConfig | null }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  // Con prefers-reduced-motion no arranca solo: el movimiento automático es
  // justo lo que esa preferencia pide evitar.
  const [playing, setPlaying] = useState(!reduce);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [slideToDeleteIndex, setSlideToDeleteIndex] = useState<number | null>(null);

  const { data: landingData } = useGetLandingConfigQuery();
  const landing = landingData ?? initialLanding ?? EMPTY_LANDING;
  const slides = landing.heroSlides;

  const isAdmin = useAppSelector(selectIsAdmin);
  const editMode = useAppSelector(selectEditMode);
  const editing = isAdmin && editMode;
  const [updateLanding, { isLoading: saving }] = useUpdateLandingConfigMutation();

  const { data: config } = useGetConfigQuery();
  const whatsappOrderUrl = buildWhatsappUrl(
    config?.whatsapp ?? '',
    `Hola ${config?.brandName ?? ''}, quiero hacer un pedido`.replace(/\s+,/, ','),
  );

  // El índice nunca debe salirse del rango: los slides pueden crecer o menguar.
  const safeIndex = slides.length ? Math.min(activeIndex, slides.length - 1) : 0;
  const activeSlide = slides[safeIndex];
  // Editando NO rota solo: el carrusel cambiando de slide mientras alguien
  // acomoda uno es pelearse con la pantalla.
  const autoPlaying = playing && !editing && slides.length > 1;

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

  // ── Persistencia del modo edición ──
  // Cada acción guarda el ARREGLO COMPLETO de slides junto con `headerCategories`
  // intacto: el endpoint reemplaza toda la configuración del landing, así que
  // mandar solo los slides borraría el orden del header.
  async function commit(nextSlides: HeroSlide[]): Promise<boolean> {
    try {
      await updateLanding({ ...landing, heroSlides: nextSlides }).unwrap();
      return true;
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error ?? 'No se pudieron guardar los cambios.',
      );
      return false;
    }
  }

  async function handleMove(dir: -1 | 1) {
    const target = safeIndex + dir;
    if (target < 0 || target >= slides.length) return;
    // La de marca queda anclada al principio: es la portada de la tienda.
    if (slides[safeIndex].locked || slides[target].locked) return;

    const next = [...slides];
    [next[safeIndex], next[target]] = [next[target], next[safeIndex]];
    if (await commit(next)) setActiveIndex(target);
  }

  async function handleAdd() {
    if (slides.length >= MAX_HERO_SLIDES) {
      toast.error(`El hero admite hasta ${MAX_HERO_SLIDES} diapositivas.`);
      return;
    }
    const slide = blankSlide();
    if (await commit([...slides, slide])) {
      setActiveIndex(slides.length);
      // Se abre el editor de una: una diapositiva en blanco publicada en la
      // tienda es peor que ninguna.
      setEditingSlideId(slide.id);
    }
  }

  async function handleDelete(index: number) {
    const slide = slides[index];
    if (slide.locked) return;
    if (slides.length <= 1) {
      toast.error('Debe quedar al menos una diapositiva.');
      return;
    }
    setSlideToDeleteIndex(index);
  }

  async function confirmDeleteSlide() {
    if (slideToDeleteIndex === null) return;
    if (await commit(slides.filter((_, i) => i !== slideToDeleteIndex))) {
      setActiveIndex((cur) => Math.max(0, Math.min(cur, slides.length - 2)));
      toast.success('Diapositiva eliminada.');
    }
    setSlideToDeleteIndex(null);
  }

  async function handleSaveSlide(updated: HeroSlide) {
    if (await commit(slides.map((s) => (s.id === updated.id ? updated : s)))) {
      setEditingSlideId(null);
      toast.success('Diapositiva actualizada.');
    }
  }

  // Sin slides configurados: no romper la home, simplemente no pintar el hero.
  if (!activeSlide) return null;

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
        () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        50,
      );
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 pt-3 pb-6 sm:pt-6 sm:pb-12">
      <div className="group relative w-full overflow-hidden rounded-[2.5rem] border border-border/40 bg-card shadow-2xl">
        {/* ── Controles de edición ──
            Flotan sobre la diapositiva en vez de ir en una barra aparte: la
            referencia visual es el slide que se está tocando, y separarlos
            obligaría a mirar a otro lado para saber sobre cuál se actúa.
            Fondo oscuro translúcido porque van encima de una foto cualquiera. */}
        {editing && (
          <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2 py-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => void handleMove(-1)}
              disabled={saving || safeIndex === 0 || activeSlide.locked || slides[safeIndex - 1]?.locked}
              title="Mover a la izquierda"
              className="grid size-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <HugeIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => void handleMove(1)}
              disabled={saving || safeIndex >= slides.length - 1 || activeSlide.locked}
              title="Mover a la derecha"
              className="grid size-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
            </button>

            <div className="mx-0.5 h-4 w-px bg-white/15" />

            <button
              type="button"
              onClick={() => setEditingSlideId(activeSlide.id)}
              disabled={saving}
              title="Editar esta diapositiva"
              className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-40"
            >
              <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving || slides.length >= MAX_HERO_SLIDES}
              title={slides.length >= MAX_HERO_SLIDES ? `Máximo ${MAX_HERO_SLIDES} diapositivas` : 'Agregar diapositiva'}
              className="grid size-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(safeIndex)}
              disabled={saving || activeSlide.locked || slides.length <= 1}
              title={
                activeSlide.locked
                  ? 'La diapositiva de marca no se puede eliminar'
                  : 'Eliminar esta diapositiva'
              }
              className="grid size-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-destructive hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/80"
            >
              <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="flex min-h-[420px] flex-col items-stretch md:h-[620px] md:flex-row">
          {/* ── Media ── */}
          <div className="relative flex h-[260px] w-full items-center justify-center overflow-hidden border-b border-border/30 bg-card sm:h-[320px] md:h-auto md:w-1/2 md:border-r md:border-b-0">
            {/* Glow radial muy tenue: da profundidad al vacío sin leerse como halo. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_60%)] blur-3xl"
            />
            <SlideMedia
              key={activeSlide.id}
              slide={activeSlide}
              className={cn(
                'absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ease-out',
                safeIndex === 0 ? 'p-2 sm:p-6' : 'p-6 max-md:scale-125 max-md:p-0',
              )}
            />
            {/* Velo de contraste sobre la media. Con `bg-foreground/5` sigue a la
                inversa del tema: oscurece en claro y aclara en oscuro, en vez de
                pintar negro fijo (que en tema claro ensuciaba la foto). */}
            <div className="pointer-events-none absolute inset-0 bg-foreground/5" />
          </div>

          {/* ── Texto ── */}
          <div className="relative z-10 flex w-full flex-col justify-center p-5 text-left sm:p-10 md:w-1/2 md:p-16">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide.id}
                initial={reduce ? false : { opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-2.5 sm:space-y-6"
              >
                <span className="inline-block text-[10px] font-black tracking-[0.2em] text-primary-2 uppercase sm:text-xs">
                  {activeSlide.eyebrow}
                </span>

                <h1 className="text-[20px] leading-[0.95] font-black tracking-tight text-balance text-foreground sm:text-4xl md:text-6xl">
                  {activeSlide.title}
                </h1>

                {/* Recortada en móvil: el CTA no puede depender de qué tan larga
                    sea la descripción de cada slide. */}
                <p className="line-clamp-2 max-w-lg text-[12px] leading-relaxed font-medium text-muted-foreground sm:line-clamp-none sm:text-base">
                  {activeSlide.description}
                </p>

                {/* Ambos CTAs comparten patrón (contorno, mismo tamaño, una sola
                    línea) y se diferencian solo por color: acento para la acción
                    principal, verde para WhatsApp. */}
                <div className="pt-2.5 sm:pt-4">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
                    <Button
                      variant="default"
                      size="lg"
                      onClick={handlePrimaryAction}
                      className="group/cta w-full justify-center text-[12px] sm:w-auto sm:text-sm"
                    >
                      <span className="truncate">{activeSlide.buttonText || 'Ver catálogo'}</span>
                      <HugeIcon icon={ArrowRight02Icon} size={14} strokeWidth={2} aria-hidden className="shrink-0 transition-transform duration-300 group-hover/cta:translate-x-1" />
                    </Button>

                    <Button
                      variant="whatsapp"
                      size="lg"
                      onClick={() => window.open(whatsappOrderUrl, '_blank', 'noopener,noreferrer')}
                      className="group/wa w-full justify-center text-[12px] sm:w-auto sm:text-sm"
                    >
                      <WhatsappIcon aria-hidden className="shrink-0 transition-transform duration-300 group-hover/wa:scale-110" />
                      <span className="truncate">WhatsApp</span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Barra flotante de navegación y progreso ── */}
      {slides.length > 1 && (
        <div className="mt-3 flex justify-center sm:mt-6">
          <div className="flex items-center gap-3 rounded-full border border-border/40 bg-card px-4 py-2.5">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setPlaying((p) => !p)}
              title={playing ? 'Pausar presentación' : 'Reanudar presentación'}
              aria-label={playing ? 'Pausar presentación' : 'Reanudar presentación'}
              className="h-11 w-11 rounded-full md:h-7 md:w-7"
            >
              {playing ? (
                <HugeIcon icon={PauseIcon} size={14} strokeWidth={2} aria-hidden className="fill-current" />
              ) : (
                <HugeIcon icon={PlayIcon} size={14} strokeWidth={2} aria-hidden className="ml-0.5 fill-current" />
              )}
            </Button>

            <Separator orientation="vertical" className="h-4" />

            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  goTo(-1);
                  setPlaying(false);
                }}
                title="Anterior"
                aria-label="Diapositiva anterior"
                className="h-11 w-11 rounded-full md:h-7 md:w-7"
              >
                <HugeIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden />
              </Button>

              <div className="mx-1 flex items-center gap-1">
                {slides.map((slide, idx) => {
                  const isActive = idx === safeIndex;
                  return (
                    // El botón aporta los 44px de zona táctil (WCAG 2.5.5); el
                    // pastel visible adentro sigue midiendo 10px de alto.
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => {
                        setActiveIndex(idx);
                        setPlaying(true);
                      }}
                      className="group/dot flex h-11 items-center rounded-full px-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                      aria-label={`Ir a la diapositiva ${idx + 1}`}
                      aria-current={isActive}
                    >
                      <span
                        className={cn(
                          'relative h-2.5 overflow-hidden rounded-full bg-muted-foreground/25 transition-all duration-300',
                          isActive ? 'w-11' : 'w-2.5 group-hover/dot:bg-muted-foreground/50',
                        )}
                      >
                        {isActive && autoPlaying && (
                          <motion.span
                            key={safeIndex}
                            initial={{ width: '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ duration: SLIDE_MS / 1000, ease: 'linear' }}
                            className="absolute inset-y-0 left-0 rounded-full bg-primary-2"
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  goTo(1);
                  setPlaying(false);
                }}
                title="Siguiente"
                aria-label="Siguiente diapositiva"
                className="h-11 w-11 rounded-full md:h-7 md:w-7"
              >
                <HugeIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      )}

      <HeroSlideEditorDialog
        slide={slides.find((s) => s.id === editingSlideId) ?? null}
        saving={saving}
        onSave={handleSaveSlide}
        onClose={() => setEditingSlideId(null)}
      />

      <ConfirmDialog
        open={slideToDeleteIndex !== null}
        onOpenChange={(open) => !open && setSlideToDeleteIndex(null)}
        title="Eliminar diapositiva"
        description={`¿Seguro que deseas eliminar la diapositiva «${slideToDeleteIndex !== null ? slides[slideToDeleteIndex]?.title : ''}»? Esta acción no se puede deshacer.`}
        onConfirm={confirmDeleteSlide}
      />
    </section>
  );
}
