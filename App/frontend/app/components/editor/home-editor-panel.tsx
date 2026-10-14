import type { ReactNode } from 'react';
import { ArrowLeft01Icon, ArrowRight01Icon, Image01Icon } from '@hugeicons/core-free-icons';
import { presentationSlideId, type LandingConfig, type HeroSlide } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { HugeIcon } from '~/components/ui/icon';
import type { LandingErrors } from '~/lib/landing-validation';
import { BannerEditor } from './banner-editor';

export type HomeSection = 'banners' | 'navigation' | 'products';

const TITLES: Record<HomeSection, string> = {
  banners: 'Editar banner',
  navigation: 'Menú de categorías',
  products: 'Productos del inicio',
};

export function HomeEditorPanel({
  draft,
  slide,
  section,
  overview,
  disabled,
  errors,
  canAdd,
  onSelect,
  onBack,
  onAdd,
  onMove,
  onRemove,
  onChange,
  onBusy,
  children,
}: {
  draft: LandingConfig | null;
  slide?: HeroSlide;
  section: HomeSection;
  overview: boolean;
  disabled: boolean;
  errors: LandingErrors | null;
  canAdd: boolean;
  onSelect: (section: HomeSection, id?: string) => void;
  onBack: () => void;
  onAdd: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onChange: (slide: HeroSlide) => void;
  onBusy: (busy: boolean) => void;
  children: ReactNode;
}) {
  const index = draft?.heroSlides.findIndex((item) => item.id === slide?.id) ?? -1;
  const presentationId = draft ? presentationSlideId(draft.heroSlides) : undefined;
  return (
    <aside
      aria-label="Editar la portada"
      className="flex max-h-[55%] min-h-0 w-full shrink-0 flex-col border-b bg-card lg:max-h-none lg:w-96 lg:border-r lg:border-b-0"
    >
      <div className="shrink-0 space-y-3 border-b p-5">
        {!overview && (
          <Button variant="outline" disabled={disabled} onClick={onBack}>
            <HugeIcon icon={ArrowLeft01Icon} size={16} aria-hidden /> Volver a los bloques
          </Button>
        )}
        <div>
          <h2 className="text-lg font-semibold">
            {overview ? 'Organizá la portada' : TITLES[section]}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {overview
              ? 'Elegí un bloque para editarlo y ver el resultado.'
              : section === 'banners'
              ? slide?.title || 'Banner sin título'
              : 'Los cambios se muestran en la vista previa.'}
          </p>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
        key={overview ? 'overview' : `${section}:${slide?.id}`}
      >
        {overview ? (
          <>
            <section className="space-y-3" aria-label="Banners de la portada">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Presentación y novedades</h3>
                <span className="text-xs text-muted-foreground">
                  {draft?.heroSlides.length ?? 0} bloques
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                La presentación va fija al principio y es el título de la portada. Las novedades se muestran todas
                juntas más abajo, sin rotar.
              </p>
              <ul className="space-y-3">
                {draft?.heroSlides.map((item, position) => (
                  <li key={item.id}>
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => onSelect('banners', item.id)}
                      className="h-auto min-h-20 w-full justify-start gap-3 whitespace-normal p-3 text-left"
                    >
                      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background">
                        {item.mediaUrl && item.mediaType !== 'video' ? (
                          <img src={item.mediaUrl} alt="" className="size-full object-contain" />
                        ) : (
                          <HugeIcon icon={Image01Icon} size={20} aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block text-xs text-muted-foreground">
                          {item.id === presentationId ? 'Presentación' : 'Novedad'}
                        </span>
                        <span className="block font-semibold">
                          {item.title || (item.id === presentationId ? 'Presentación sin título' : `Novedad ${position}`)}
                        </span>
                        <Chip
                          variant="status"
                          tone={
                            errors?.slides[item.id]
                              ? 'error'
                              : item.visible === false
                              ? 'neutral'
                              : 'success'
                          }
                        >
                          {errors?.slides[item.id]
                            ? 'Revisar campos'
                            : item.visible === false
                            ? 'Oculto'
                            : 'Visible'}
                        </Chip>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full"
                disabled={disabled || !canAdd}
                onClick={onAdd}
              >
                Agregar novedad
              </Button>
            </section>
            <section className="space-y-3 border-t pt-5" aria-label="Organización de categorías">
              <h3 className="font-semibold">Categorías</h3>
              {(
                [
                  {
                    id: 'navigation',
                    title: 'Menú de categorías',
                    description: 'Qué categorías aparecen en el encabezado.',
                  },
                  {
                    id: 'products',
                    title: 'Productos del inicio',
                    description: 'Destacados y filas por categoría.',
                  },
                ] as const
              ).map((item) => (
                <Button
                  key={item.id}
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onSelect(item.id)}
                  className="h-auto min-h-20 w-full flex-col items-start gap-1 whitespace-normal p-4 text-left"
                >
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                  {(item.id === 'navigation'
                    ? errors?.headerCategories
                    : errors?.homeCategories) && (
                    <span className="text-xs text-destructive">Revisar selección</span>
                  )}
                </Button>
              ))}
            </section>
          </>
        ) : section === 'banners' ? (
          slide ? (
            <>
              <BannerEditor
                key={slide.id}
                slide={slide}
                onChange={onChange}
                onBusy={onBusy}
                disabled={disabled}
                errors={errors?.slides[slide.id]}
              />
              <section className="space-y-3 border-t pt-5" aria-label="Orden del banner">
                <h3 className="font-semibold">Posición</h3>
                <p className="text-xs text-muted-foreground">
                  {slide.locked
                    ? 'La presentación va siempre primero, fija.'
                    : `Novedad ${index} de ${(draft?.heroSlides.length ?? 1) - 1}.`}
                </p>
                {!slide.locked && (
                  <>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={disabled || index <= 0 || draft?.heroSlides[index - 1]?.locked}
                        onClick={() => onMove(-1)}
                      >
                        <HugeIcon icon={ArrowLeft01Icon} size={16} aria-hidden /> Antes
                      </Button>
                      <Button
                        variant="outline"
                        disabled={disabled || index === (draft?.heroSlides.length ?? 0) - 1}
                        onClick={() => onMove(1)}
                      >
                        Después <HugeIcon icon={ArrowRight01Icon} size={16} aria-hidden />
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      disabled={disabled || (draft?.heroSlides.length ?? 0) <= 1}
                      onClick={onRemove}
                    >
                      Quitar banner
                    </Button>
                  </>
                )}
              </section>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Agregá un banner para empezar.</p>
          )
        ) : (
          <fieldset disabled={disabled} className="space-y-5">
            {children}
          </fieldset>
        )}
      </div>
    </aside>
  );
}
