// Editor de textos e imágenes del carrito (modo edición de la tienda).
//
// Se abre desde el menú «Editar carrito» de la barra de edición, una parte por
// vez (carrito vacío, carrito con productos, pedido recibido), con una VISTA
// PREVIA de esa parte al lado de los campos. No pasa por el carrito real: así
// no se confunde con lo que el admin tenga agregado.
//
// Mismo patrón que el editor de slides: guarda en el BORRADOR (builderSlice) y
// se publica con «Guardar cambios». Las imágenes se eligen entre las de
// "Recursos de imágenes"; cada lugar usa la suya por defecto.
import { useEffect, useState } from 'react';
import { Link } from '@remix-run/react';
import { toast } from 'sonner';
import { Cancel01Icon, CheckmarkCircle02Icon, ShoppingBag02Icon } from '@hugeicons/core-free-icons';

import { CART_IMAGE_KEYS, type CartContent } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { HugeIcon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  CART_DEFAULTS,
  CART_IMAGE_FALLBACK,
  CART_IMAGE_LABELS,
  resolveCartContent,
  type CartImages,
  type ResolvedCartContent,
} from '~/hooks/useCartContent';
import { useGetConfigQuery } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectDraftLandingConfig, updateCartContent } from '~/store/slices/builderSlice';
import { cn } from '~/lib/utils';

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
            'grid size-16 place-items-center rounded-lg border text-[11px] leading-tight text-muted-foreground',
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
              'size-16 overflow-hidden rounded-lg border bg-muted p-1',
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

/** Vista previa de la parte que se edita, con los mismos estilos del carrito. */
function Preview({ section, c }: { section: CartEditorSection; c: ResolvedCartContent }) {
  if (section === 'empty') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        {c.emptyImage ? (
          <img src={c.emptyImage} alt="" className="size-28 object-contain" />
        ) : (
          <div className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
            <HugeIcon icon={ShoppingBag02Icon} size={24} strokeWidth={2} aria-hidden />
          </div>
        )}
        <p className="font-bold">{c.emptyTitle}</p>
        <p className="max-w-[14rem] text-xs text-muted-foreground">{c.emptyText}</p>
        <Button size="sm" tabIndex={-1}>{c.emptyButton}</Button>
      </div>
    );
  }
  if (section === 'success') {
    return (
      <div className="flex flex-col gap-2 p-2">
        {c.successImage ? (
          <img src={c.successImage} alt="" className="size-24 object-contain" />
        ) : (
          <span className="grid size-10 place-items-center rounded-full bg-success/15 text-success" aria-hidden>
            <HugeIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2} />
          </span>
        )}
        <p className="font-bold">{c.successTitle}</p>
        <p className="text-xs text-muted-foreground">
          Tu número de pedido es <span className="font-semibold text-foreground">#A1B2C3D4</span>. {c.successText}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="border-b pb-2">
        <p className="font-bold">{c.title}</p>
        <p className="text-xs text-muted-foreground">
          2 artículos · {c.subtitle || 'envío o retiro lo elegís al finalizar'}
        </p>
      </div>
      {(c.bannerImage || c.bannerText) && (
        <div className="flex flex-col gap-1.5 rounded-xl border bg-background p-2">
          {c.bannerImage && <img src={c.bannerImage} alt="" className="w-full rounded-lg object-cover" />}
          {c.bannerText && <p className="px-1 text-xs font-semibold">{c.bannerText}</p>}
        </div>
      )}
      <div className="flex items-center gap-2 rounded-xl border bg-background p-2 text-xs text-muted-foreground">
        <span className="size-8 rounded-md bg-muted" /> Producto de ejemplo
      </div>
      <Button size="sm" className="w-full" tabIndex={-1}>{c.checkoutButton}</Button>
      {c.footerNote && <p className="text-center text-[11px] text-muted-foreground">{c.footerNote}</p>}
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
  // Se pide la config de nuevo al abrir: si el admin acaba de subir una imagen
  // en Recursos (en otra pestaña), la vista previa la muestra sin recargar.
  const { data: config, refetch } = useGetConfigQuery();
  const images: CartImages = config?.images ?? {};
  const [draft, setDraft] = useState<CartContent>({});

  useEffect(() => {
    if (section) {
      setDraft(landingDraft?.cart ?? {});
      void refetch();
    }
    // Solo al abrir: después, el estado local es el que se edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const set = <K extends keyof CartContent>(key: K, value: CartContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    dispatch(updateCartContent(draft));
    toast.success('Guardado en el borrador. Publicalo con «Guardar cambios».');
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
    <Dialog open={section !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogClose asChild>
          <Button variant="destructiveSolid" size="icon" className="absolute top-4 right-4 z-10 size-9 rounded-full" aria-label="Cerrar">
            <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
          </Button>
        </DialogClose>

        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle>Editar carrito · {meta?.label}</DialogTitle>
          <DialogDescription>
            {meta?.hint} Lo que dejes vacío usa el texto de siempre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[1fr_16rem]">
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
                {text('subtitle', 'Línea de abajo', 'envío o retiro lo elegís al finalizar', 120)}
                <p className="pt-2 text-sm font-bold">Banner de promo (opcional)</p>
                {picker('bannerImage')}
                {text('bannerText', 'Texto del banner', 'Ej.: Seguinos y llevate 15% de descuento', 120)}
                {text('bannerLink', 'Link al tocarlo (opcional)', '/?categoria=mouses#catalogo o https://…', 2048)}
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
          <aside className="md:sticky md:top-0 md:self-start">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa</p>
            <div className="pointer-events-none rounded-2xl border bg-card p-3">
              {section && <Preview section={section} c={resolveCartContent(draft, images)} />}
            </div>
          </aside>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="destructiveSolid" onClick={onClose} className="h-11 px-5">
            Cancelar
          </Button>
          <Button onClick={save} className="h-11 px-5">
            Guardar en el borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
