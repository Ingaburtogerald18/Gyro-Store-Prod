// Textos e imágenes del carrito, una parte a la vez, con vista previa hecha con las piezas reales.
// Cada cambio va al borrador; la tienda cambia al publicar.
import { useEffect, useState } from 'react';
import { Link } from '@remix-run/react';

import { CART_IMAGE_KEYS, type CartContent } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { CartBanner, CartEmptyState, CartLine } from '~/components/cart/cart-drawer';
import { OrderPlaced } from '~/components/cart/checkout-panel';
import {
  CART_DEFAULTS,
  CART_IMAGE_FALLBACK,
  CART_IMAGE_LABELS,
  resolveCartContent,
  type CartImages,
  type ResolvedCartContent,
} from '~/hooks/use-cart-content';
import { useStoreConfig } from '~/hooks/use-store-config';
import { useGetConfigQuery } from '~/state/api/session-api';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import {
  endBuilderChange,
  selectDraftLandingConfig,
  updateCartContent,
} from '~/state/slices/builder-slice';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { CartItem } from '~/types/cart';

export type CartEditorSection = 'empty' | 'items' | 'success';

export const CART_EDITOR_SECTIONS: Record<CartEditorSection, { label: string; hint: string }> = {
  empty: { label: 'Carrito vacío', hint: 'Lo que se ve cuando todavía no agregaron nada.' },
  items: { label: 'Carrito con productos', hint: 'Título, banner de promo y pie con el botón de finalizar.' },
  success: { label: 'Pedido recibido', hint: 'La pantalla que aparece después de enviar el pedido.' },
};

type ImageField = 'emptyImage' | 'bannerImage' | 'successImage';
type TextField = Exclude<keyof CartContent, ImageField>;

/** Selector de imagen: "Sin imagen" + miniaturas de los recursos cargados. */
function ImagePicker({
  field,
  value,
  images,
  onChange,
}: {
  field: ImageField;
  value: CartContent[ImageField];
  images: CartImages;
  onChange: (key: CartContent[ImageField]) => void;
}) {
  // Sin elegir, el lugar usa su imagen por defecto: se muestra como elegida.
  const selected = value === undefined ? CART_IMAGE_FALLBACK[field] : value;
  const options = CART_IMAGE_KEYS.filter((k) => images[k]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Imagen</legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!selected}
          onClick={() => onChange('')}
          className={cn(
            'grid size-16 place-items-center rounded-xl border text-2xs leading-tight text-muted-foreground',
            !selected && 'border-primary-2 ring-2 ring-primary-2/30',
          )}
        >
          Sin imagen
        </button>
        {options.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={selected === key}
            title={CART_IMAGE_LABELS[key]}
            aria-label={CART_IMAGE_LABELS[key]}
            onClick={() => onChange(key)}
            className={cn(
              'size-16 overflow-hidden rounded-xl border bg-muted p-1',
              selected === key && 'border-primary-2 ring-2 ring-primary-2/30',
            )}
          >
            <img src={images[key]} alt="" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
      <FieldDescription>
        Las imágenes se suben en{' '}
        <Link to="/admin/configuracion" className="underline">Configuración → Recursos de imágenes</Link>.
        {!images[CART_IMAGE_FALLBACK[field]] && ` Todavía no cargaste «${CART_IMAGE_LABELS[CART_IMAGE_FALLBACK[field]]}».`}
      </FieldDescription>
    </fieldset>
  );
}

/** Solo visual: no agrega nada al carrito ni crea pedidos. */
const SAMPLE_LINE: CartItem = {
  catalogId: 'preview',
  name: 'Producto de ejemplo',
  variantName: 'Negro',
  price: 650,
  image: '',
  quantity: 1,
};

function Preview({ section, c, currency }: { section: CartEditorSection; c: ResolvedCartContent; currency?: string }) {
  if (section === 'empty') {
    return <CartEmptyState content={c} active={false} onExplore={() => {}} />;
  }
  if (section === 'success') {
    return (
      <OrderPlaced
        order={{ id: 'a1b2c3d4-0000-4000-8000-000000000000', total: 650, whatsappUrl: '#' }}
        content={c}
        currency={currency}
        onDone={() => {}}
      />
    );
  }
  return (
    <div className="flex flex-col">
      <div className="border-b border-border pb-2">
        <p className="text-lg font-bold">{c.title}</p>
        <p className="text-sm text-muted-foreground">1 artículo{c.subtitle ? ` · ${c.subtitle}` : ''}</p>
      </div>
      <div className="space-y-3 py-3">
        {(c.bannerImage || c.bannerText) && (
          <CartBanner active={false} image={c.bannerImage} text={c.bannerText} link="" onNavigate={() => {}} />
        )}
        <ul className="space-y-2.5">
          <CartLine item={SAMPLE_LINE} itemKey="preview" currency={currency} />
        </ul>
      </div>
      <div className="space-y-3 border-t border-border pt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Subtotal de productos</span>
          <span className="text-xl font-bold tabular-nums">{formatCordobas(650, currency)}</span>
        </div>
        <Button className="h-12 w-full text-base" tabIndex={-1}>{c.checkoutButton}</Button>
        {c.footerNote && <p className="text-center text-xs text-muted-foreground">{c.footerNote}</p>}
      </div>
    </div>
  );
}

export function CartContentEditor({
  section,
  onClose,
}: {
  /** Parte que se edita; null = cerrado. */
  section: CartEditorSection | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const landingDraft = useAppSelector(selectDraftLandingConfig);
  const config = useStoreConfig();
  // Se pide la config de nuevo al abrir: si el admin acaba de subir una imagen
  // en Recursos (en otra pestaña), la vista previa la muestra sin recargar.
  const { data: freshConfig, refetch } = useGetConfigQuery();
  const images: CartImages = freshConfig?.images ?? config?.images ?? {};
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const draft: CartContent = landingDraft?.cart ?? {};

  useEffect(() => {
    if (section) void refetch();
  }, [section, refetch]);

  const set = <K extends keyof CartContent>(key: K, value: CartContent[K]) =>
    dispatch(updateCartContent({ content: { ...draft, [key]: value }, key: `cart:${key}` }));

  function close() {
    dispatch(endBuilderChange());
    onClose();
  }

  const text = (key: TextField, label: string, placeholder: string, max: number, multiline = false) => (
    <Field>
      <FieldLabel htmlFor={`cart-${key}`}>{label}</FieldLabel>
      {multiline ? (
        <Textarea id={`cart-${key}`} rows={2} maxLength={max} placeholder={placeholder}
          value={draft[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <Input id={`cart-${key}`} maxLength={max} placeholder={placeholder}
          value={draft[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
      )}
    </Field>
  );

  const picker = (field: ImageField) => (
    <ImagePicker field={field} value={draft[field]} images={images} onChange={(v) => set(field, v)} />
  );

  const meta = section ? CART_EDITOR_SECTIONS[section] : null;

  return (
    <Dialog open={section !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle>Editar carrito · {meta?.label}</DialogTitle>
          <DialogDescription>
            {meta?.hint} Lo que dejes vacío usa el texto de siempre. Cada cambio queda en el
            borrador; la tienda cambia al publicar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            {section === 'empty' && (
              <>
                {picker('emptyImage')}
                {text('emptyTitle', 'Título', CART_DEFAULTS.emptyTitle, 80)}
                {text('emptyText', 'Texto', CART_DEFAULTS.emptyText, 200, true)}
                {text('emptyButton', 'Botón', CART_DEFAULTS.emptyButton, 40)}
              </>
            )}
            {section === 'items' && (
              <>
                {text('title', 'Título del carrito', CART_DEFAULTS.title, 60)}
                {text('subtitle', 'Línea de abajo (opcional)', 'Ej.: retiro en tienda o envío', 120)}
                <p className="pt-2 text-sm font-bold">Banner de promo (opcional)</p>
                {picker('bannerImage')}
                {text('bannerText', 'Texto del banner', 'Ej.: Seguinos en redes y pedí tu código', 120)}
                {text('bannerLink', 'Enlace al tocarlo (opcional)', '/categoria/audifonos o https://…', 2048)}
                <p className="pt-2 text-sm font-bold">Pie</p>
                {text('checkoutButton', 'Botón', CART_DEFAULTS.checkoutButton, 40)}
                {text('footerNote', 'Nota chica (opcional)', 'Ej.: ¿Tenés código? Lo aplicás al finalizar', 160)}
              </>
            )}
            {section === 'success' && (
              <>
                {picker('successImage')}
                {text('successTitle', 'Título', CART_DEFAULTS.successTitle, 80)}
                {text('successText', 'Texto', CART_DEFAULTS.successText, 300, true)}
              </>
            )}
          </div>

          {/* Vista previa: fija arriba mientras se recorren los campos. */}
          <aside className="md:sticky md:top-0 md:self-start" aria-label="Vista previa">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Vista previa</p>
              <div role="group" aria-label="Tema de la vista previa" className="flex rounded-xl border p-0.5 text-xs">
                {(['light', 'dark'] as const).map((theme) => (
                  <button key={theme} type="button" aria-pressed={previewTheme === theme} onClick={() => setPreviewTheme(theme)}
                    className={cn('rounded-xl px-2 py-1', previewTheme === theme ? 'bg-muted font-semibold' : 'text-muted-foreground')}>
                    {theme === 'light' ? 'Claro' : 'Oscuro'}
                  </button>
                ))}
              </div>
            </div>
            {/* inert: se ve, pero no se puede usar (ni con teclado). */}
            <div data-theme={previewTheme} className="store-preview pointer-events-none rounded-2xl border p-4 select-none" {...{ inert: '' }}>
              {section && <Preview section={section} c={resolveCartContent(draft, images)} currency={config?.currency} />}
            </div>
          </aside>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button onClick={close}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
