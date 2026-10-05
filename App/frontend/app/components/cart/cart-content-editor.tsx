// Editor de textos e imágenes del carrito (modo edición de la tienda).
//
// Mismo patrón que el editor de slides: guarda en el BORRADOR (builderSlice) y
// se publica con «Guardar cambios» del header. Las imágenes se eligen entre las
// de "Recursos de imágenes" del panel; acá no se suben archivos — para cambiar
// una imagen se reemplaza en Recursos y el carrito la toma sola.
import { useEffect, useState } from 'react';
import { Link } from '@remix-run/react';
import { toast } from 'sonner';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

import { CART_IMAGE_KEYS, type CartContent, type CartImageKey } from '@shared/schemas';
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
import { CART_DEFAULTS, CART_IMAGE_LABELS } from '~/hooks/useCartContent';
import { useAppDispatch } from '~/store/hooks';
import { updateCartContent } from '~/store/slices/builderSlice';
import { cn } from '~/lib/utils';

type Images = Partial<Record<CartImageKey, string | undefined>>;

/** Selector de imagen: miniaturas de los recursos cargados + "Sin imagen". */
function ImagePicker({
  label,
  value,
  images,
  onChange,
}: {
  label: string;
  value: CartContent['emptyImage'];
  images: Images;
  onChange: (key: CartContent['emptyImage']) => void;
}) {
  const options = CART_IMAGE_KEYS.filter((k) => images[k]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange('')}
          className={cn(
            'grid size-16 place-items-center rounded-lg border text-[11px] text-muted-foreground',
            !value && 'border-primary-2 ring-2 ring-primary-2/30',
          )}
        >
          Sin imagen
        </button>
        {options.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            title={CART_IMAGE_LABELS[key]}
            aria-label={CART_IMAGE_LABELS[key]}
            onClick={() => onChange(key)}
            className={cn(
              'size-16 overflow-hidden rounded-lg border bg-muted p-1',
              value === key && 'border-primary-2 ring-2 ring-primary-2/30',
            )}
          >
            <img src={images[key]} alt="" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
      {options.length === 0 && (
        <FieldDescription>
          No hay imágenes cargadas. Subilas en{' '}
          <Link to="/admin/configuracion" className="underline">Configuración → Recursos de imágenes</Link>.
        </FieldDescription>
      )}
    </fieldset>
  );
}

export function CartContentEditor({
  open,
  onOpenChange,
  content,
  images,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: CartContent;
  images: Images;
}) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<CartContent>(content);

  // Cada vez que se abre, arranca desde lo que hay en el borrador.
  useEffect(() => {
    if (open) setDraft(content);
  }, [open, content]);

  const set = <K extends keyof CartContent>(key: K, value: CartContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    dispatch(updateCartContent(draft));
    toast.success('Carrito actualizado en el borrador. Publicalo con «Guardar cambios».');
    onOpenChange(false);
  }

  const text = (
    key: Exclude<keyof CartContent, 'emptyImage' | 'bannerImage' | 'successImage'>,
    label: string,
    placeholder: string,
    opts: { multiline?: boolean; max: number },
  ) => (
    <Field>
      <FieldLabel htmlFor={`cart-${key}`}>{label}</FieldLabel>
      {opts.multiline ? (
        <Textarea
          id={`cart-${key}`}
          rows={2}
          maxLength={opts.max}
          placeholder={placeholder}
          value={draft[key] ?? ''}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <Input
          id={`cart-${key}`}
          maxLength={opts.max}
          placeholder={placeholder}
          value={draft[key] ?? ''}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogClose asChild>
          <Button variant="destructiveSolid" size="icon" className="absolute top-4 right-4 z-10 size-9 rounded-full" aria-label="Cerrar">
            <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
          </Button>
        </DialogClose>

        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle>Editar carrito</DialogTitle>
          <DialogDescription>
            Guarda en el borrador y publica con «Guardar cambios». Lo que dejes vacío usa el texto de siempre.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-4">
            <h3 className="text-sm font-bold">Encabezado</h3>
            {text('title', 'Título', CART_DEFAULTS.title, { max: 60 })}
            {text('subtitle', 'Línea de abajo', 'Ej.: Envío o retiro lo elegís al finalizar', { max: 120 })}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold">Carrito vacío</h3>
            <ImagePicker label="Imagen" value={draft.emptyImage} images={images} onChange={(v) => set('emptyImage', v)} />
            {text('emptyTitle', 'Título', CART_DEFAULTS.emptyTitle, { max: 80 })}
            {text('emptyText', 'Texto', CART_DEFAULTS.emptyText, { multiline: true, max: 200 })}
            {text('emptyButton', 'Botón', CART_DEFAULTS.emptyButton, { max: 40 })}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold">Banner de promo (arriba de los productos)</h3>
            <ImagePicker label="Imagen" value={draft.bannerImage} images={images} onChange={(v) => set('bannerImage', v)} />
            {text('bannerText', 'Texto', 'Ej.: Seguinos y llevate 15% de descuento', { max: 120 })}
            {text('bannerLink', 'Link al tocarlo (opcional)', '/?categoria=mouses#catalogo o https://…', { max: 2048 })}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold">Pie del carrito</h3>
            {text('checkoutButton', 'Botón', CART_DEFAULTS.checkoutButton, { max: 40 })}
            {text('footerNote', 'Nota chica (opcional)', 'Ej.: ¿Tenés código? Lo aplicás al finalizar', { max: 160 })}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold">Pedido recibido</h3>
            <ImagePicker label="Imagen" value={draft.successImage} images={images} onChange={(v) => set('successImage', v)} />
            {text('successTitle', 'Título', CART_DEFAULTS.successTitle, { max: 80 })}
            {text('successText', 'Texto', CART_DEFAULTS.successText, { multiline: true, max: 300 })}
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="destructiveSolid" onClick={() => onOpenChange(false)} className="h-11 px-5">
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
