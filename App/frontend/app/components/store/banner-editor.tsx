// Formulario de un banner. Edita una COPIA local: los cambios llegan al borrador
// recién con «Aplicar al borrador» (lo maneja el editor de portada).
//
// Subida de imagen o video:
//   · barra con el porcentaje REAL mientras se transfiere;
//   · «Procesando archivo…» (indeterminado) cuando el envío terminó y el
//     servidor optimiza y guarda;
//   · «Archivo listo» solo con la URL confirmada por el servidor.
// Se puede cancelar en cualquier momento (aunque el resto del formulario esté
// bloqueado), y un fallo, una respuesta inválida o una demora excesiva dejan
// reintentar sin trabar el editor. La imagen anterior no se reemplaza hasta
// tener la nueva confirmada.
import { useEffect, useId, useRef, useState } from 'react';
import type { HeroSlide } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { NativeSelect } from '~/components/ui/native-select';
import { Progress } from '~/components/ui/progress';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { uploadSlideMedia } from '~/lib/uploadSlideMedia';
import { useStoreCatalog } from '~/hooks/useStoreConfig';
import { getProductUrl } from '~/lib/formatters';
import type { SlideErrors } from '~/lib/landingValidation';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'sending'; percent: number | null }
  | { kind: 'processing' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

type ActionChoice = 'link' | 'product' | 'social' | 'modal';

const actionOf = (slide: HeroSlide): ActionChoice =>
  slide.actionType === 'social' ? 'social' : slide.actionType === 'modal' ? 'modal' : slide.actionTarget.startsWith('/producto/') ? 'product' : 'link';

export function BannerEditor({ slide, onChange, onBusy, errors = {} }: {
  slide: HeroSlide;
  onChange: (slide: HeroSlide) => void;
  onBusy: (busy: boolean) => void;
  errors?: SlideErrors;
}) {
  const [upload, setUpload] = useState<UploadState>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(slide);
  latest.current = slide;
  const products = useStoreCatalog();
  const ids = useId();
  const busy = upload.kind === 'sending' || upload.kind === 'processing';
  // Limpieza al desmontar: una carga en curso se corta.
  useEffect(() => () => controller.current?.abort(), []);

  const set = <K extends keyof HeroSlide>(key: K, value: HeroSlide[K]) => onChange({ ...slide, [key]: value });

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
      onChange({ ...latest.current, mediaUrl, mediaType: file.type.startsWith('video/') ? 'video' : 'image' });
      finish({ kind: 'done' });
    } catch (err) {
      if (controller.current !== request) return; // la reemplazó otra carga
      if (request.signal.aborted) finish({ kind: 'cancelled' });
      else finish({ kind: 'error', message: err instanceof Error ? err.message : 'No se pudo subir el archivo.' });
    }
  }

  function cancelUpload() {
    controller.current?.abort();
    // El estado se restablece acá mismo: no depende de que XHR avise.
    finish({ kind: 'cancelled' });
  }

  function changeAction(choice: ActionChoice) {
    // Cambiar el tipo de acción NO inventa un destino: el campo queda vacío y
    // la validación pide completarlo.
    if (choice === 'social') onChange({ ...slide, actionType: 'social', actionTarget: '' });
    else if (choice === 'modal') onChange({ ...slide, actionType: 'modal', actionTarget: '' });
    else onChange({ ...slide, actionType: 'link', actionTarget: '' });
  }

  const action = actionOf(slide);

  return (
    <div className="space-y-5">
      <Field>
        <FieldLabel htmlFor={`${ids}-file`}>Imagen o video</FieldLabel>
        <div className="overflow-hidden rounded-xl border bg-muted">
          {slide.mediaUrl ? slide.mediaType === 'video'
            ? <video src={slide.mediaUrl} muted controls className="aspect-video w-full object-contain" />
            : <img src={slide.mediaUrl} alt="Imagen actual del banner" className="aspect-video w-full object-contain" />
            : <div className="grid aspect-video place-items-center text-sm text-muted-foreground">Sin imagen todavía</div>}
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

        <div id={`${ids}-upload-status`} aria-live="polite" className="space-y-2">
          {upload.kind === 'sending' && (
            <>
              <Progress value={upload.percent ?? null} aria-label="Progreso de la carga" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{upload.percent === null ? 'Enviando archivo…' : `Enviando ${upload.percent}%`}</p>
                <Button type="button" variant="cancel" size="sm" className="h-10" onClick={cancelUpload}>Cancelar carga</Button>
              </div>
            </>
          )}
          {upload.kind === 'processing' && (
            <>
              <Progress value={null} aria-label="Procesando el archivo" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">Procesando archivo…</p>
                <Button type="button" variant="cancel" size="sm" className="h-10" onClick={cancelUpload}>Cancelar carga</Button>
              </div>
            </>
          )}
          {upload.kind === 'done' && <p className="text-sm text-foreground">Archivo listo. Se ve en el banner al aplicar.</p>}
          {upload.kind === 'cancelled' && <p className="text-sm text-muted-foreground">Carga cancelada. La imagen anterior no cambió.</p>}
          {upload.kind === 'error' && (
            <p role="alert" className="text-sm text-destructive">{upload.message} La imagen anterior no cambió.</p>
          )}
        </div>
        {slide.mediaUrl && !busy && (
          <Button type="button" variant="outline" size="sm" className="h-10 w-fit" onClick={() => set('mediaUrl', '')}>
            Quitar imagen
          </Button>
        )}
      </Field>

      <fieldset disabled={busy} className="space-y-5">
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor={`${ids}-title`} required>Título</FieldLabel>
          <Textarea id={`${ids}-title`} rows={2} maxLength={120} value={slide.title} aria-invalid={Boolean(errors.title)} onChange={(event) => set('title', event.target.value)} />
          <span className="text-right text-xs text-muted-foreground">{slide.title.length}/120</span>
          <FieldError>{errors.title}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-description`}>Descripción</FieldLabel>
          <Textarea id={`${ids}-description`} rows={3} maxLength={400} value={slide.description} onChange={(event) => set('description', event.target.value)} />
          <FieldDescription>Ideal: dos o tres líneas. No repitas el texto que ya trae la imagen.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-action`}>Al tocar el botón</FieldLabel>
          <NativeSelect id={`${ids}-action`} value={action} onChange={(event) => changeAction(event.target.value as ActionChoice)}>
            <option value="link">Ir a un enlace</option>
            <option value="product" disabled={!products.length}>Ver un producto</option>
            <option value="social">Mostrar redes sociales</option>
            {/* Solo para configuraciones guardadas antes: se conserva tal cual. */}
            {action === 'modal' && <option value="modal">Abrir «Quiénes somos»</option>}
          </NativeSelect>
        </Field>
        {action !== 'modal' && (
          <Field data-invalid={Boolean(errors.buttonText)}>
            <FieldLabel htmlFor={`${ids}-button`} required>Texto del botón</FieldLabel>
            <Input id={`${ids}-button`} maxLength={40} value={slide.buttonText} aria-invalid={Boolean(errors.buttonText)} onChange={(event) => set('buttonText', event.target.value)} />
            <FieldError>{errors.buttonText}</FieldError>
          </Field>
        )}
        {action === 'product' && (
          <Field data-invalid={Boolean(errors.actionTarget)}>
            <FieldLabel htmlFor={`${ids}-product`} required>Producto</FieldLabel>
            <NativeSelect id={`${ids}-product`} value={slide.actionTarget} aria-invalid={Boolean(errors.actionTarget)} onChange={(event) => onChange({ ...slide, actionType: 'link', actionTarget: event.target.value })}>
              <option value="">Elegí un producto</option>
              {products.map((product) => <option key={product.id} value={getProductUrl(product.id, product.name)}>{product.name}</option>)}
            </NativeSelect>
            <FieldError>{errors.actionTarget}</FieldError>
          </Field>
        )}
        {action === 'link' && (
          <Field data-invalid={Boolean(errors.actionTarget)}>
            <FieldLabel htmlFor={`${ids}-link`} required>Destino</FieldLabel>
            <Input id={`${ids}-link`} value={slide.actionTarget} placeholder="/#catalogo o https://…" aria-invalid={Boolean(errors.actionTarget)} onChange={(event) => set('actionTarget', event.target.value)} />
            <FieldDescription>Un enlace de la tienda (empieza con /) o una dirección https://.</FieldDescription>
            <FieldError>{errors.actionTarget}</FieldError>
          </Field>
        )}
        {action === 'social' && errors.actionTarget && <FieldError>{errors.actionTarget}</FieldError>}
      </fieldset>
    </div>
  );
}
