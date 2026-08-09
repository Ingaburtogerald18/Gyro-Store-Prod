// Galería de fotos del producto: zona de arrastre + grilla de miniaturas.
//
// La PRIMERA foto es la portada — es la que sale en la tarjeta del catálogo
// (`SortableCatalogGrid` pinta `images[0]`). Por eso se puede promover cualquier
// miniatura a portada en vez de obligar a re-subir en otro orden.
//
// Sube contra `POST /api/upload`, que optimiza a WebP y nombra por hash del
// contenido: re-subir la misma foto devuelve la misma URL en vez de duplicarla.
import { HugeIcon } from '~/components/ui/icon';
import { Cancel01Icon, CloudUploadIcon, StarIcon, DragDropVerticalIcon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

// Tope del contrato (`adminProductInputSchema.images`). Se refleja acá para
// poder avisar ANTES de subir y no perder el viaje a R2.
const MAX_IMAGES = 8;

import { queueFile } from '~/lib/uploadQueue';

export function ImageUploader({
  images,
  onChange,
  disabled,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_IMAGES - images.length;
  const isFull = remaining <= 0;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

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
    try {
      const urls = accepted.map(queueFile);
      // Se deduplica: subir dos veces la misma foto devuelve la misma URL (el
      // backend nombra por hash), y repetirla en la galería no aporta nada.
      onChange([...new Set([...images, ...urls])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron subir las fotos.');
    } finally {
      setUploading(0);
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
    })
  );

  function handleDragEnd(event: any) {
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
          if (!disabled && !isFull) void handleFiles(e.dataTransfer.files);
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
                : `PNG, JPG o WEBP hasta 10 MB · quedan ${remaining} de ${MAX_IMAGES}`}
            </p>
            {!isFull && (
              <Button
                type="button"
                size="sm"
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
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((url, index) => (
                <SortableImageItem
                  key={url}
                  url={url}
                  index={index}
                  isCover={index === 0}
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
  onMakeCover,
  onRemove,
}: {
  url: string;
  index: number;
  isCover: boolean;
  onMakeCover: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });

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
      className={cn(
        "group relative aspect-square overflow-hidden rounded-xl border bg-muted",
        isDragging && "shadow-2xl ring-2 ring-ring"
      )}
    >
      <img
        src={url}
        alt={isCover ? 'Foto de portada del producto' : `Foto ${index + 1} del producto`}
        className="size-full object-cover"
        loading="lazy"
      />

      {isCover && (
        <span className="absolute left-1.5 top-1.5 z-10 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          Portada
        </span>
      )}

      {/* Control de arrastre */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "absolute left-0 top-0 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 cursor-grab active:cursor-grabbing",
          isDragging && "opacity-100 cursor-grabbing"
        )}
      >
        <div className="rounded-md bg-black/60 p-1 text-white backdrop-blur-sm">
          <HugeIcon icon={DragDropVerticalIcon} size={14} strokeWidth={2} />
        </div>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5',
          'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          'motion-reduce:transition-none',
        )}
      >
        {!isCover && (
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            aria-label={`Usar la foto ${index + 1} como portada`}
            title="Hacer portada"
            onClick={() => onMakeCover(url)}
            onPointerDown={(e) => e.stopPropagation()} // Evitar que inicie drag
          >
            <HugeIcon icon={StarIcon} size={12} strokeWidth={2} />
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          aria-label={`Quitar la foto ${index + 1}`}
          title="Quitar"
          onClick={() => onRemove(url)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HugeIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </Button>
      </div>
    </li>
  );
}
