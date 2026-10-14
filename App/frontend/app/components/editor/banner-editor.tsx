// La imagen anterior se conserva hasta recibir la URL confirmada del servidor.
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, type PathValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { heroSlideSchema, type HeroSlide } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { NativeSelect } from '~/components/ui/native-select';
import { Combobox } from '~/components/ui/combobox';
import { Progress } from '~/components/ui/progress';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { uploadSlideMedia } from '~/lib/upload-slide-media';
import { useStoreCatalog } from '~/hooks/use-store-config';
import { getProductUrl } from '~/lib/formatters';
import type { SlideErrors } from '~/lib/landing-validation';
import { cn } from '~/lib/utils';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'sending'; percent: number | null }
  | { kind: 'processing' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

type ActionChoice = 'link' | 'product' | 'social' | 'modal';

const actionOf = (slide: HeroSlide): ActionChoice =>
  slide.actionType === 'social'
    ? 'social'
    : slide.actionType === 'modal'
    ? 'modal'
    : slide.actionTarget.startsWith('/producto/')
    ? 'product'
    : 'link';

export function BannerEditor({
  slide,
  onChange,
  onBusy,
  errors = {},
  disabled = false,
}: {
  slide: HeroSlide;
  onChange: (slide: HeroSlide) => void;
  onBusy: (busy: boolean) => void;
  errors?: SlideErrors;
  disabled?: boolean;
}) {
  const form = useForm<HeroSlide>({
    resolver: zodResolver(heroSlideSchema),
    values: slide,
    mode: 'onChange',
  });
  const [upload, setUpload] = useState<UploadState>({ kind: 'idle' });
  const [actionChoice, setActionChoice] = useState<ActionChoice>(actionOf(slide));
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(slide);
  latest.current = slide;
  const products = useStoreCatalog();
  const ids = useId();
  const busy = disabled || upload.kind === 'sending' || upload.kind === 'processing';
  useEffect(() => {
    if (slide.actionTarget || slide.actionType !== 'link')
      setActionChoice(
        slide.actionType === 'social'
          ? 'social'
          : slide.actionType === 'modal'
          ? 'modal'
          : slide.actionTarget.startsWith('/producto/')
          ? 'product'
          : 'link',
      );
  }, [slide.actionTarget, slide.actionType]);
  // Limpieza al desmontar: una carga en curso se corta.
  useEffect(() => () => controller.current?.abort(), []);

  const set = <K extends keyof HeroSlide>(key: K, value: HeroSlide[K]) => {
    form.setValue(key, value as PathValue<HeroSlide, K>, { shouldValidate: true });
    onChange({ ...slide, [key]: value });
  };

  function finish(next: UploadState) {
    setUpload(next);
    onBusy(false);
    // Permite volver a elegir el MISMO archivo para reintentar.
    if (fileInput.current) fileInput.current.value = '';
  }

  async function startUpload(file?: File) {
    if (!file) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setUpload({ kind: 'sending', percent: 0 });
    onBusy(true);
    try {
      const mediaUrl = await uploadSlideMedia(file, {
        signal: request.signal,
        onProgress: (percent) => setUpload({ kind: 'sending', percent }),
        onTransferred: () => setUpload({ kind: 'processing' }),
      });
      if (request.signal.aborted) return;
      onChange({
        ...latest.current,
        mediaUrl,
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      });
      finish({ kind: 'done' });
    } catch (err) {
      if (controller.current !== request) return; // la reemplazó otra carga
      if (request.signal.aborted) finish({ kind: 'cancelled' });
      else
        finish({
          kind: 'error',
          message: err instanceof Error ? err.message : 'No se pudo subir el archivo.',
        });
    }
  }

  function cancelUpload() {
    controller.current?.abort();
    // El estado se restablece acá mismo: no depende de que XHR avise.
    finish({ kind: 'cancelled' });
  }

  function changeAction(choice: ActionChoice) {
    setActionChoice(choice);
    // Cambiar el tipo de acción NO inventa un destino: el campo queda vacío y
    // la validación pide completarlo.
    if (choice === 'social') onChange({ ...slide, actionType: 'social', actionTarget: '' });
    else if (choice === 'modal') onChange({ ...slide, actionType: 'modal', actionTarget: '' });
    else onChange({ ...slide, actionType: 'link', actionTarget: '' });
  }

  const action = actionChoice;
  const designFields = (
    <fieldset disabled={busy} className="space-y-5">
      <legend className="mb-4 text-sm font-semibold">Composición del banner</legend>
      <div className="grid gap-2">
        {(
          [
            { value: 'left', label: 'Imagen a la izquierda' },
            { value: 'right', label: 'Imagen a la derecha' },
            { value: 'top', label: 'Imagen arriba' },
          ] as const
        ).map((item) => (
          <Button
            key={item.value}
            type="button"
            variant="outline"
            aria-pressed={(slide.layout ?? 'left') === item.value}
            onClick={() => set('layout', item.value)}
            className={cn(
              'justify-start',
              (slide.layout ?? 'left') === item.value && 'border-2 border-primary-2 font-semibold',
            )}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">En móvil, la imagen va arriba del texto.</p>
    </fieldset>
  );

  return (
    <div className="space-y-5">
      <div>
        <Field>
          <FieldLabel htmlFor={`${ids}-file`}>Imagen o video</FieldLabel>
          <div className="overflow-hidden rounded-xl border bg-muted">
            {slide.mediaUrl ? (
              slide.mediaType === 'video' ? (
                <video
                  src={slide.mediaUrl}
                  muted
                  controls
                  className="aspect-video w-full object-contain"
                />
              ) : (
                <img
                  src={slide.mediaUrl}
                  alt="Imagen actual del banner"
                  className="aspect-video w-full object-contain"
                />
              )
            ) : (
              <div className="grid aspect-video place-items-center text-sm text-muted-foreground">
                Sin imagen todavía
              </div>
            )}
          </div>
          <Input
            ref={fileInput}
            id={`${ids}-file`}
            type="file"
            accept="image/*,video/*"
            disabled={busy}
            aria-describedby={`${ids}-file-hint ${ids}-upload-status`}
            onChange={(event) => void startUpload(event.target.files?.[0])}
          />
          <FieldDescription id={`${ids}-file-hint`}>
            PNG, JPG, WebP, GIF o video. Revisá también el encuadre en móvil.
          </FieldDescription>
          <FieldError>{errors.mediaUrl}</FieldError>

          <div id={`${ids}-upload-status`} aria-live="polite" className="space-y-2">
            {upload.kind === 'sending' && (
              <>
                <Progress value={upload.percent ?? null} aria-label="Progreso de la carga" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    {upload.percent === null ? 'Enviando archivo…' : `Enviando ${upload.percent}%`}
                  </p>
                  <Button type="button" variant="cancel" onClick={cancelUpload}>
                    Cancelar carga
                  </Button>
                </div>
              </>
            )}
            {upload.kind === 'processing' && (
              <>
                <Progress value={null} aria-label="Procesando el archivo" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">Procesando archivo…</p>
                  <Button type="button" variant="cancel" onClick={cancelUpload}>
                    Cancelar carga
                  </Button>
                </div>
              </>
            )}
            {upload.kind === 'done' && (
              <p className="text-sm text-foreground">Archivo listo en el borrador.</p>
            )}
            {upload.kind === 'cancelled' && (
              <p className="text-sm text-muted-foreground">
                Carga cancelada. La imagen anterior no cambió.
              </p>
            )}
            {upload.kind === 'error' && (
              <p role="alert" className="text-sm text-destructive">
                {upload.message} La imagen anterior no cambió.
              </p>
            )}
          </div>
          {slide.mediaUrl && !busy && (
            <Button
              type="button"
              variant="destructive"
              className="w-fit"
              onClick={() => set('mediaUrl', '')}
            >
              Quitar imagen
            </Button>
          )}
        </Field>
      </div>

      <fieldset disabled={busy} className="space-y-5">
        <div>
          <Field data-invalid={Boolean(errors.title)}>
            <FieldLabel htmlFor={`${ids}-title`} required>
              Título
            </FieldLabel>
            <Textarea
              {...form.register('title')}
              id={`${ids}-title`}
              rows={2}
              maxLength={120}
              value={slide.title}
              aria-invalid={Boolean(errors.title)}
              onChange={(event) => set('title', event.target.value)}
            />
            <span className="text-right text-xs text-muted-foreground">
              {slide.title.length}/120
            </span>
            <FieldError>{errors.title || form.formState.errors.title?.message}</FieldError>
          </Field>
        </div>
        <div>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>Descripción</FieldLabel>
            <Textarea
              {...form.register('description')}
              id={`${ids}-description`}
              rows={3}
              maxLength={400}
              value={slide.description}
              onChange={(event) => set('description', event.target.value)}
            />
            <FieldDescription>
              Ideal: dos o tres líneas. No repitas el texto que ya trae la imagen.
            </FieldDescription>
          </Field>
        </div>
        <div className="space-y-5 border-t pt-5">
          <h3 className="font-semibold">Botón del banner</h3>
          <Field>
            <FieldLabel htmlFor={`${ids}-action`}>Al tocar el botón</FieldLabel>
            <NativeSelect
              className="w-full"
              id={`${ids}-action`}
              value={action}
              onChange={(event) => changeAction(event.target.value as ActionChoice)}
            >
              <option value="link">Ir a un enlace</option>
              <option value="product" disabled={!products.length}>
                Ver un producto
              </option>
              <option value="social">Mostrar redes sociales</option>
              {/* Solo para configuraciones guardadas antes: se conserva tal cual. */}
              {action === 'modal' && <option value="modal">Abrir «Quiénes somos»</option>}
            </NativeSelect>
          </Field>
          {action !== 'modal' && (
            <Field data-invalid={Boolean(errors.buttonText)}>
              <FieldLabel htmlFor={`${ids}-button`} required>
                Texto del botón
              </FieldLabel>
              <Input
                {...form.register('buttonText')}
                id={`${ids}-button`}
                maxLength={40}
                value={slide.buttonText}
                aria-invalid={Boolean(errors.buttonText)}
                onChange={(event) => set('buttonText', event.target.value)}
              />
              <FieldError>
                {errors.buttonText || form.formState.errors.buttonText?.message}
              </FieldError>
            </Field>
          )}
          {action === 'product' && (
            <Field data-invalid={Boolean(errors.actionTarget)}>
              <FieldLabel htmlFor={`${ids}-product`} required>
                Producto
              </FieldLabel>
              {products.length > 10 ? (
                <BannerProductPicker
                  id={`${ids}-product`}
                  value={slide.actionTarget}
                  invalid={Boolean(errors.actionTarget)}
                  onChange={(value) => set('actionTarget', value)}
                />
              ) : (
                <NativeSelect
                  className="w-full"
                  id={`${ids}-product`}
                  value={slide.actionTarget}
                  aria-invalid={Boolean(errors.actionTarget)}
                  onChange={(event) => set('actionTarget', event.target.value)}
                >
                  <option value="">Elegí un producto</option>
                  {products.map((product) => (
                    <option key={product.id} value={getProductUrl(product.id, product.name)}>
                      {product.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
              <FieldError>{errors.actionTarget}</FieldError>
            </Field>
          )}
          {action === 'link' && (
            <Field data-invalid={Boolean(errors.actionTarget)}>
              <FieldLabel htmlFor={`${ids}-link`} required>
                Destino
              </FieldLabel>
              <Input
                {...form.register('actionTarget')}
                id={`${ids}-link`}
                value={slide.actionTarget}
                placeholder="/#catalogo o https://…"
                aria-invalid={Boolean(errors.actionTarget)}
                onChange={(event) => set('actionTarget', event.target.value)}
              />
              <FieldDescription>
                Un enlace de la tienda (empieza con /) o una dirección https://.
              </FieldDescription>
              <FieldError>{errors.actionTarget}</FieldError>
            </Field>
          )}
          {action === 'social' && errors.actionTarget && (
            <FieldError>{errors.actionTarget}</FieldError>
          )}
        </div>
      </fieldset>
      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer rounded-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Apariencia del banner
        </summary>
        <div className="mt-4">{designFields}</div>
      </details>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-background p-4 text-sm">
        <input
          type="checkbox"
          checked={slide.visible !== false}
          disabled={busy}
          onChange={(event) => set('visible', event.target.checked)}
          className="size-5 accent-primary-2"
        />
        <span className="font-semibold">Mostrar este banner</span>
        <span className="ml-auto text-xs text-muted-foreground">Se aplica al publicar.</span>
      </label>
    </div>
  );
}

function BannerProductPicker({
  id,
  value,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const products = useStoreCatalog();
  const selected = products.find((product) => getProductUrl(product.id, product.name) === value);
  const label = selected ? `${selected.name} · ${selected.id}` : '';
  const [query, setQuery] = useState(label);
  useEffect(() => {
    if (value) setQuery(label);
  }, [value, label]);
  return (
    <Combobox
      id={id}
      value={query}
      aria-invalid={invalid}
      placeholder="Buscá un producto"
      options={products.map((product) => `${product.name} · ${product.id}`)}
      onChange={(text) => {
        setQuery(text);
        const product = products.find((product) => `${product.name} · ${product.id}` === text);
        onChange(product ? getProductUrl(product.id, product.name) : '');
      }}
    />
  );
}
