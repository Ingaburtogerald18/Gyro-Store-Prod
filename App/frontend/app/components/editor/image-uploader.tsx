// Galería del producto. La primera foto es la portada: cualquier miniatura se puede promover.
// /api/upload nombra por hash, así la misma foto no se duplica.
import { HugeIcon } from '~/components/ui/icon';
import {
  Cancel01Icon,
  CloudUploadIcon,
  StarIcon,
  DragDropVerticalIcon,
} from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

// Tope del contrato (`adminProductInputSchema.images`). Se refleja acá para
// poder avisar ANTES de subir y no perder el viaje a R2.
const MAX_IMAGES = 8;

import { queueFile, uploadOne } from '~/lib/upload-queue';

export function ImageUploader({
  images,
  onChange,
  disabled,
  folder,
  onBusy,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  /** Sube en el momento a esa carpeta (borrador del modo edición); sin esto, al guardar. */
  folder?: string;
  /** Avisa mientras sube, para no publicar con fotos a medio subir. */
  onBusy?: (busy: boolean) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_IMAGES - images.length;
  const isFull = remaining <= 0;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length || disabled || uploading || isFull) return;

    const picked = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) {
      toast.error('Solo se aceptan imágenes.');
      return;
    }

    // Se recorta al cupo restante en vez de rechazar todo el lote: si arrastró 5
    // y solo caben 2, entran esas 2 y se avisa por qué quedaron afuera las otras.
    const accepted = picked.slice(0, remaining);
    if (accepted.length < picked.length) {
      toast.warning(`Solo caben ${MAX_IMAGES} fotos: se subieron ${accepted.length}.`);
    }

    setUploading(accepted.length);
    onBusy?.(true);
    try {
      const urls = folder
        ? await Promise.all(accepted.map((file) => uploadOne(file, folder)))
        : accepted.map(queueFile);
      // Se deduplica: subir dos veces la misma foto devuelve la misma URL (el
      // backend nombra por hash), y repetirla en la galería no aporta nada.
      onChange([...new Set([...images, ...urls])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron subir las fotos.');
    } finally {
      setUploading(0);
      onBusy?.(false);
    }
  }

  function makeCover(url: string) {
    onChange([url, ...images.filter((i) => i !== url)]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (disabled || uploading) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = images.indexOf(active.id as string);
      const newIndex = images.indexOf(over.id as string);
      onChange(arrayMove(images, oldIndex, newIndex));
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !isFull) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled && !isFull && !uploading) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
          isFull && 'opacity-60',
          'motion-reduce:transition-none',
        )}
      >
        <span
          className={cn(
            'mb-4 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors',
            isDragging && 'bg-primary/10 text-primary',
            'motion-reduce:transition-none',
          )}
          aria-hidden
        >
          <HugeIcon icon={CloudUploadIcon} size={20} strokeWidth={2} />
        </span>

        {uploading > 0 ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5" />
            Subiendo {uploading} {uploading === 1 ? 'foto' : 'fotos'}…
          </p>
        ) : (
          <>
            <p className="font-heading text-base font-medium text-foreground">
              {isFull ? 'Llegaste al máximo de fotos' : 'Subí las fotos'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isFull
                ? `Quitá alguna para subir otra · ${MAX_IMAGES} máximo`
                : `PNG, JPG, WEBP o GIF hasta 25 MB · quedan ${remaining} de ${MAX_IMAGES}`}
            </p>
            {!isFull && (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
              >
                Elegir archivos
              </Button>
            )}
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={disabled || uploading > 0 || isFull}
          onChange={(e) => {
            void handleFiles(e.target.files);
            // Se limpia para que volver a elegir el MISMO archivo dispare el
            // change de nuevo (si no, el input lo considera sin cambios).
            e.target.value = '';
          }}
        />
      </div>

      {images.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
              {images.map((url, index) => (
                <SortableImageItem
                  key={url}
                  url={url}
                  index={index}
                  isCover={index === 0}
                  disabled={Boolean(disabled || uploading > 0)}
                  onMakeCover={makeCover}
                  onRemove={(u) => onChange(images.filter((i) => i !== u))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableImageItem({
  url,
  index,
  isCover,
  disabled,
  onMakeCover,
  onRemove,
}: {
  url: string;
  index: number;
  isCover: boolean;
  disabled: boolean;
  onMakeCover: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: url,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('overflow-hidden rounded-xl border bg-card', isDragging && 'ring-2 ring-ring')}
    >
      <div className="relative aspect-square bg-background">
        <img
          src={url}
          alt={isCover ? 'Foto de portada del producto' : `Foto ${index + 1} del producto`}
          className="size-full object-contain"
          loading="lazy"
        />

        {isCover && (
          <span className="absolute left-2 bottom-2 rounded-xl border border-primary-2 bg-selection px-2 py-1 text-xs font-semibold text-selection-foreground">
            Principal
          </span>
        )}

        <Button
          type="button"
          variant="outline"
          size="icon"
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Mover la foto ${index + 1}`}
          title="Mover foto"
          className="absolute right-2 top-2 cursor-grab touch-none active:cursor-grabbing"
        >
          <HugeIcon icon={DragDropVerticalIcon} size={16} strokeWidth={2} aria-hidden />
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t p-2">
        {!isCover && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label={`Usar la foto ${index + 1} como portada`}
            title="Usar como imagen principal"
            onClick={() => onMakeCover(url)}
            onPointerDown={(e) => e.stopPropagation()} // Evitar que inicie drag
          >
            <HugeIcon icon={StarIcon} size={16} strokeWidth={2} aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          variant="cancel"
          size="icon"
          disabled={disabled}
          aria-label={`Quitar la foto ${index + 1}`}
          title="Quitar"
          onClick={() => onRemove(url)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
        </Button>
      </div>
    </li>
  );
}
