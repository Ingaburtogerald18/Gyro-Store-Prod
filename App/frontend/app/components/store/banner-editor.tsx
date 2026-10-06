import { useEffect, useRef, useState } from 'react';
import type { HeroSlide } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Field, FieldLabel } from '~/components/ui/field';
import { uploadSlideMedia } from '~/lib/uploadSlideMedia';
import { useStoreCatalog } from '~/hooks/useStoreConfig';
import { getProductUrl } from '~/lib/formatters';

export function BannerEditor({ slide, onChange, onBusy, disabled }: {
  slide: HeroSlide;
  onChange: (slide: HeroSlide) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(slide);
  latest.current = slide;
  const products = useStoreCatalog();
  useEffect(() => () => controller.current?.abort(), []);

  const set = <K extends keyof HeroSlide>(key: K, value: HeroSlide[K]) => onChange({ ...slide, [key]: value });
  async function upload(file?: File) {
    if (!file) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setUploading(true);
    onBusy(true);
    setError('');
    try {
      const mediaUrl = await uploadSlideMedia(file, {
        signal: request.signal,
        onProgress: setProgress,
        onTransferred: () => setProgress(null),
      });
      if (!request.signal.aborted) onChange({ ...latest.current, mediaUrl, mediaType: file.type.startsWith('video/') ? 'video' : 'image' });
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      if (!request.signal.aborted) {
        setUploading(false);
        onBusy(false);
      }
    }
  }

  return (
    <fieldset disabled={disabled || uploading} className="space-y-5">
      <Field>
        <FieldLabel htmlFor="banner-file">Imagen o video</FieldLabel>
        <div className="overflow-hidden rounded-xl border bg-muted">
          {slide.mediaUrl ? slide.mediaType === 'video'
            ? <video src={slide.mediaUrl} muted controls className="aspect-video w-full object-contain" />
            : <img src={slide.mediaUrl} alt="Vista previa del banner" className="aspect-video w-full object-contain" />
            : <div className="grid aspect-video place-items-center text-sm text-muted-foreground">Añade una imagen para tu campaña</div>}
        </div>
        <Input id="banner-file" type="file" accept="image/*,video/*" onChange={event => void upload(event.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">PNG, JPG, WebP, GIF o video. Revisa también el encuadre en móvil.</p>
        {uploading && <p role="status" className="text-xs">{progress === null ? 'Procesando archivo…' : `Subiendo ${progress}%…`}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {slide.mediaUrl && <Button variant="outline" size="sm" onClick={() => set('mediaUrl', '')}>Quitar imagen</Button>}
      </Field>
      <Field>
        <FieldLabel htmlFor="banner-title">Título</FieldLabel>
        <Textarea id="banner-title" rows={2} maxLength={120} value={slide.title} onChange={event => set('title', event.target.value)} />
        <span className="text-right text-xs text-muted-foreground">{slide.title.length}/120</span>
      </Field>
      <Field>
        <FieldLabel htmlFor="banner-description">Descripción</FieldLabel>
        <Textarea id="banner-description" rows={3} maxLength={400} value={slide.description} onChange={event => set('description', event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="banner-button">Texto del botón</FieldLabel>
        <Input id="banner-button" maxLength={40} value={slide.buttonText} onChange={event => set('buttonText', event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="banner-action">Al hacer clic</FieldLabel>
        <select id="banner-action" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={slide.actionType === 'modal' ? 'product' : slide.actionType === 'social' ? 'social' : slide.actionTarget.startsWith('/producto/') ? 'product' : 'link'}
          onChange={event => onChange({ ...slide, actionType: event.target.value === 'social' ? 'social' : 'link', actionTarget: event.target.value === 'product' ? products[0] ? getProductUrl(products[0].id, products[0].name) : '' : '/#catalogo' })}>
          <option value="link">Ir a un enlace</option>
          <option value="product" disabled={!products.length}>Ver un producto</option>
          <option value="social">Mostrar redes sociales</option>
        </select>
      </Field>
      {slide.actionType !== 'social' && (slide.actionType === 'modal' || slide.actionTarget.startsWith('/producto/') ? (
        <Field>
          <FieldLabel htmlFor="banner-product">Producto</FieldLabel>
          <select id="banner-product" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={slide.actionTarget} onChange={event => onChange({ ...slide, actionType: 'link', actionTarget: event.target.value })}>
            <option value="">Seleccionar producto</option>
            {products.map(product => <option key={product.id} value={getProductUrl(product.id, product.name)}>{product.name}</option>)}
          </select>
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor="banner-link">Destino</FieldLabel>
          <Input id="banner-link" value={slide.actionTarget} placeholder="/#catalogo o https://…" onChange={event => set('actionTarget', event.target.value)} />
        </Field>
      ))}
    </fieldset>
  );
}
