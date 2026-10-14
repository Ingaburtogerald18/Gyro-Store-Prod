import type { AdminCombo, EditorProduct, LandingConfig, StoreDraftProducts } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { FormSection } from '~/components/ui/form-layout';
import { describeProductChanges, hasDraftProductChanges } from '~/lib/store-draft-products';

type ReviewSection = 'banners' | 'navigation' | 'products' | 'items' | 'combos' | 'cart';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function StoreChangeReview({
  draft,
  published,
  changes,
  products,
  combos,
  onEdit,
}: {
  draft: LandingConfig | null;
  published: LandingConfig | null;
  changes: StoreDraftProducts;
  products: EditorProduct[];
  combos?: AdminCombo[];
  onEdit: (section: ReviewSection, id?: string) => void;
}) {
  const banners =
    draft?.heroSlides.filter(
      (slide) =>
        !same(
          slide,
          published?.heroSlides.find((previous) => previous.id === slide.id),
        ),
    ) ?? [];
  const removed =
    published?.heroSlides.filter(
      (slide) => !draft?.heroSlides.some((current) => current.id === slide.id),
    ) ?? [];
  const orderChanged = !same(
    draft?.heroSlides.map((slide) => slide.id),
    published?.heroSlides.map((slide) => slide.id),
  );
  const sections = [
    {
      id: 'navigation',
      title: 'Menú de categorías',
      changed: !same(
        [draft?.headerCategories, draft?.headerCategoriesMode],
        [published?.headerCategories, published?.headerCategoriesMode],
      ),
      description: 'Se actualizarán las categorías del encabezado y su orden.',
    },
    {
      id: 'products',
      title: 'Secciones del inicio',
      changed: !same(
        [draft?.homeCategories, draft?.homeCategoriesMode],
        [published?.homeCategories, published?.homeCategoriesMode],
      ),
      description: 'Se actualizarán las secciones de categorías y su orden.',
    },
    {
      id: 'cart',
      title: 'Carrito',
      changed: !same(draft?.cart, published?.cart),
      description: 'Se actualizarán los textos e imágenes del carrito.',
    },
  ] as const;
  return (
    <div className="space-y-5">
      {(banners.length > 0 || removed.length > 0 || orderChanged) && (
        <FormSection title="Portada" description="Banners que cambiarán en la tienda.">
          <ul className="space-y-4">
            {banners.map((slide) => {
              const previous = published?.heroSlides.find((item) => item.id === slide.id);
              const fields = previous
                ? [
                    !same(
                      [slide.mediaUrl, slide.mediaType],
                      [previous.mediaUrl, previous.mediaType],
                    ) && 'Imagen o video',
                    !same(
                      [slide.title, slide.description, slide.eyebrow],
                      [previous.title, previous.description, previous.eyebrow],
                    ) && 'Textos',
                    !same(
                      [slide.buttonText, slide.actionType, slide.actionTarget],
                      [previous.buttonText, previous.actionType, previous.actionTarget],
                    ) && 'Botón y destino',
                    slide.layout !== previous.layout && 'Apariencia',
                    slide.visible !== previous.visible && 'Visibilidad',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Banner nuevo';
              return (
                <li key={slide.id} className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {slide.mediaUrl && slide.mediaType !== 'video' && (
                      <img
                        src={slide.mediaUrl}
                        alt=""
                        className="size-14 shrink-0 rounded-xl border bg-background object-contain"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold">{slide.title || 'Banner sin título'}</p>
                      <p className="text-xs text-muted-foreground">
                        {fields || 'Información del banner'} ·{' '}
                        {slide.visible === false ? 'Quedará oculto' : 'Se mostrará'}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => onEdit('banners', slide.id)}>
                    Editar
                  </Button>
                </li>
              );
            })}
            {removed.map((slide) => (
              <li key={slide.id}>
                <p className="font-semibold">{slide.title || 'Banner sin título'}</p>
                <p className="text-xs text-destructive">Se quitará de la portada.</p>
              </li>
            ))}
            {orderChanged && (
              <li className="text-xs text-muted-foreground">
                Se actualizará el orden de los banners.
              </li>
            )}
          </ul>
        </FormSection>
      )}
      {sections
        .filter((section) => section.changed)
        .map((section) => (
          <FormSection
            key={section.id}
            title={section.title}
            action={
              <Button variant="outline" onClick={() => onEdit(section.id)}>
                Editar
              </Button>
            }
          >
            <p className="text-sm">{section.description}</p>
          </FormSection>
        ))}
      {hasDraftProductChanges(changes) && (
        <FormSection
          title="Productos y combos"
          description="Fotos, visibilidad y orden que se aplicarán al publicar."
        >
          <ul className="space-y-2 text-sm">
            {describeProductChanges(changes, products, combos).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(changes.items).length > 0 || changes.order) && (
              <Button variant="outline" onClick={() => onEdit('items')}>
                Revisar productos
              </Button>
            )}
            {Object.keys(changes.combos).length > 0 && (
              <Button variant="outline" onClick={() => onEdit('combos')}>
                Revisar combos
              </Button>
            )}
          </div>
        </FormSection>
      )}
    </div>
  );
}
