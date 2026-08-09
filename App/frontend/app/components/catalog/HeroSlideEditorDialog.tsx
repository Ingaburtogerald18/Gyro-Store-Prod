// Editor de una diapositiva del hero, desde la home misma (modo edición).
//
// Portado del `HeroSlideEditorModal` de la v1. Se edita EN LA HOME y no en el
// panel porque una diapositiva es composición visual: el texto y la foto se
// juzgan viendo el resultado, no un formulario en otra pantalla.
//
// Guarda contra `PUT /api/landing-config` a través del componente padre, que es
// quien conoce el arreglo completo de slides — acá solo se edita UNA.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HugeIcon } from '~/components/ui/icon';
import { CloudUploadIcon } from '@hugeicons/core-free-icons';

import type { HeroSlide } from '@shared/schemas';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { getSupabaseClient } from '~/lib/supabase.client';

/** Sube a R2 por `/api/upload`, igual que el editor de productos. */
async function uploadMedia(file: File): Promise<string> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const body = new FormData();
  body.append('file', file);
  body.append('folder', 'landing');

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo.');
  return data.url as string;
}

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
  const [uploading, setUploading] = useState(false);

  // Se re-siembra al abrir con OTRA diapositiva. Sin esto, abrir la segunda tras
  // cerrar la primera mostraría los datos de la primera.
  useEffect(() => setDraft(slide), [slide]);

  if (!draft) return null;

  const set = <K extends keyof HeroSlide>(key: K, value: HeroSlide[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMedia(file);
      // El tipo se deduce del archivo: pedirlo aparte es una pregunta que el
      // navegador ya respondió, y elegir mal deja el slide en blanco.
      setDraft((current) =>
        current
          ? { ...current, mediaUrl: url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' }
          : current,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={!!slide} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle>Editar diapositiva</DialogTitle>
          <DialogDescription>
            Los cambios se publican en la tienda al guardar.
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
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <FieldDescription>
                  {uploading ? 'Subiendo…' : 'PNG, JPG, WEBP o MP4.'}
                </FieldDescription>
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
                </SelectContent>
              </Select>
            </Field>
          </div>

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
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
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
          >
            {saving && <Spinner className="mr-2" />}
            Guardar diapositiva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
