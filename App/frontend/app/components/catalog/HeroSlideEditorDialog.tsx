// Editor de una diapositiva del hero, desde la home misma (modo edición).
//
// Portado del `HeroSlideEditorModal` de la v1. Se edita EN LA HOME y no en el
// panel porque una diapositiva es composición visual: el texto y la foto se
// juzgan viendo el resultado, no un formulario en otra pantalla.
//
// Actualiza una diapositiva del borrador; el encabezado publica el conjunto.
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { HugeIcon } from '~/components/ui/icon';
import { Cancel01Icon, CheckmarkCircle02Icon, CloudUploadIcon } from '@hugeicons/core-free-icons';

import type { HeroSlide } from '@shared/schemas';
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
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Progress } from '~/components/ui/progress';
import { uploadSlideMedia } from '~/lib/uploadSlideMedia';

type UploadState =
  | { phase: 'idle' | 'preparing' | 'processing' | 'success' }
  | { phase: 'sending'; percent: number | null }
  | { phase: 'error'; message: string };

export function HeroSlideEditorDialog({
  slide,
  saving,
  onSave,
  onClose,
}: {
  /** `null` = cerrado. */
  slide: HeroSlide | null;
  saving: boolean;
  onSave: (slide: HeroSlide) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<HeroSlide | null>(slide);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });
  const uploadController = useRef<AbortController | null>(null);
  const uploading = ['preparing', 'sending', 'processing'].includes(uploadState.phase);

  // Se re-siembra al abrir con OTRA diapositiva. Sin esto, abrir la segunda tras
  // cerrar la primera mostraría los datos de la primera.
  useEffect(() => {
    setDraft(slide);
    setUploadState({ phase: 'idle' });
    return () => {
      uploadController.current?.abort();
      uploadController.current = null;
    };
  }, [slide]);

  if (!draft) return null;

  const set = <K extends keyof HeroSlide>(key: K, value: HeroSlide[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  async function handleFile(file: File | undefined) {
    if (!file) return;
    uploadController.current?.abort();
    const controller = new AbortController();
    uploadController.current = controller;
    const isCurrent = () => uploadController.current === controller && !controller.signal.aborted;
    setUploadState({ phase: 'preparing' });
    try {
      const url = await uploadSlideMedia(file, {
        signal: controller.signal,
        onProgress: (percent) => {
          if (isCurrent()) setUploadState({ phase: 'sending', percent });
        },
        onTransferred: () => {
          if (isCurrent()) setUploadState({ phase: 'processing' });
        },
      });
      if (!isCurrent()) return;
      // El tipo se deduce del archivo: pedirlo aparte es una pregunta que el
      // navegador ya respondió, y elegir mal deja el slide en blanco.
      setDraft((current) =>
        current
          ? { ...current, mediaUrl: url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' }
          : current,
      );
      setUploadState({ phase: 'success' });
    } catch (err) {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : 'No se pudo subir el archivo.';
      setUploadState({ phase: 'error', message });
      toast.error(message);
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
    }
  }

  function handleClose() {
    if (saving) return;
    uploadController.current?.abort();
    uploadController.current = null;
    onClose();
  }

  return (
    <Dialog open={!!slide} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton={false} className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogClose asChild>
          <Button variant="destructiveSolid" size="icon" disabled={saving} className="absolute top-4 right-4 z-10 size-9 rounded-full">
            <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
            <span className="sr-only">Cerrar editor</span>
          </Button>
        </DialogClose>
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle>Editar diapositiva</DialogTitle>
          <DialogDescription>
            Guarda en el borrador y publica con «Guardar cambios».
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <Field>
            <FieldLabel htmlFor="slide-media">Imagen o video</FieldLabel>
            <div className="flex items-center gap-3">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-card border bg-muted/40">
                {draft.mediaUrl ? (
                  draft.mediaType === 'video' ? (
                    <video src={draft.mediaUrl} className="size-full object-cover" muted />
                  ) : (
                    <img src={draft.mediaUrl} alt="" className="size-full object-cover" />
                  )
                ) : (
                  <HugeIcon icon={CloudUploadIcon} size={20} strokeWidth={2} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  id="slide-media"
                  type="file"
                  accept="image/*,video/*"
                  disabled={uploading || saving}
                  onClick={(e) => { e.currentTarget.value = ''; }}
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <div aria-live="polite" aria-atomic="true">
                  {uploading ? (
                    <div className="mt-3 space-y-2">
                      <Progress
                        value={uploadState.phase === 'sending' ? uploadState.percent : null}
                        aria-label={uploadState.phase === 'preparing' ? 'Preparando archivo' : uploadState.phase === 'processing' ? 'Procesando y guardando archivo' : 'Enviando archivo'}
                        className="slide-upload-progress h-2"
                      />
                      <div className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                        <Spinner aria-hidden className="mt-0.5 shrink-0 text-primary motion-reduce:animate-none" />
                        <p>
                          {uploadState.phase === 'preparing' ? 'Preparando archivo…'
                            : uploadState.phase === 'processing' ? 'Procesando y guardando archivo…'
                            : `Enviando archivo…${uploadState.phase === 'sending' && uploadState.percent !== null ? ` ${uploadState.percent}%` : ''}`}
                        </p>
                      </div>
                    </div>
                  ) : uploadState.phase === 'success' ? (
                    <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-success">
                      <HugeIcon icon={CheckmarkCircle02Icon} size={16} aria-hidden className="shrink-0" />
                      Archivo listo para guardar la diapositiva.
                    </p>
                  ) : uploadState.phase === 'error' ? (
                    <p className="mt-2 text-xs font-medium text-destructive">{uploadState.message} Selecciona el archivo para reintentar.</p>
                  ) : (
                    <FieldDescription>
                      PNG, JPG, WEBP, GIF o MP4.
                    </FieldDescription>
                  )}
                </div>
              </div>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="slide-eyebrow">Antetítulo</FieldLabel>
            <Input
              id="slide-eyebrow"
              maxLength={60}
              placeholder="AUDIO SIN CABLES"
              value={draft.eyebrow}
              onChange={(e) => set('eyebrow', e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="slide-title" required>Título</FieldLabel>
            <Input
              id="slide-title"
              maxLength={120}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="slide-description">Descripción</FieldLabel>
            <Textarea
              id="slide-description"
              rows={3}
              maxLength={400}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="slide-button">Texto del botón</FieldLabel>
              <Input
                id="slide-button"
                maxLength={40}
                placeholder="Ver catálogo"
                value={draft.buttonText}
                onChange={(e) => set('buttonText', e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="slide-action">Acción</FieldLabel>
              <Select
                value={draft.actionType}
                onValueChange={(v) => set('actionType', v as HeroSlide['actionType'])}
              >
                <SelectTrigger id="slide-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Ir a un enlace</SelectItem>
                  <SelectItem value="modal">Abrir el producto</SelectItem>
                  <SelectItem value="social">Mostrar redes sociales</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {draft.actionType === 'social' ? (
            // Sin campo de destino: los links salen de Configuración (los mismos
            // del pie de página). Las redes sin link no aparecen en el menú.
            <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              El botón abre un menú con Facebook, Instagram y TikTok. Los links se toman de
              Configuración → Redes sociales; las redes sin link no se muestran.
            </p>
          ) : (
          <Field>
            <FieldLabel htmlFor="slide-target">
              {draft.actionType === 'link' ? 'Destino del enlace' : 'Id del producto'}
            </FieldLabel>
            <Input
              id="slide-target"
              maxLength={2048}
              placeholder={draft.actionType === 'link' ? '/#catalogo' : 'uuid del producto'}
              value={draft.actionTarget}
              onChange={(e) => set('actionTarget', e.target.value)}
            />
          </Field>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="destructiveSolid" onClick={handleClose} disabled={saving} className="h-11 px-5">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!draft.title.trim()) {
                toast.error('La diapositiva necesita un título.');
                return;
              }
              onSave(draft);
            }}
            disabled={saving || uploading}
            className="h-11 px-5"
          >
            {saving && <Spinner className="mr-2" />}
            Guardar diapositiva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
