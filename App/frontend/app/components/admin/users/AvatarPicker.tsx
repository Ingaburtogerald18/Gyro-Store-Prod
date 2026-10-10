// Foto de perfil: previsualización y subida manual. No sabe a qué endpoint sube:
// «Mi perfil» usa `POST /api/me/avatar` y el diálogo del admin `/api/upload`.
import { useRef, useState } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { Camera01Icon, Delete02Icon } from '@hugeicons/core-free-icons';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { getInitials } from './constants';

// Se avisa ANTES de gastar el viaje al servidor. El backend aplica el mismo tope
// (multer, 10 MB) — este chequeo es cortesía, no la regla.
const MAX_BYTES = 10 * 1024 * 1024;

export function AvatarPicker({
  src,
  name,
  uploading,
  disabled,
  onPick,
  onRemove,
  hint,
}: {
  src?: string | null;
  /** Para las iniciales del fallback y el texto alternativo. */
  name: string;
  uploading?: boolean;
  disabled?: boolean;
  onPick: (file: File) => void;
  /** Si falta, no se ofrece quitar la foto. */
  onRemove?: () => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = !!uploading || !!disabled;

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('La foto tiene que ser una imagen.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('La imagen supera los 10 MB.');
      return;
    }
    setError(null);
    onPick(file);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* La zona de arrastre es el avatar mismo: es donde la gente suelta el
          archivo por instinto, y evita un dropzone gigante para una sola foto
          cuadrada de 80 px. El botón de abajo cubre el camino por teclado. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'relative rounded-full p-1 transition-colors motion-reduce:transition-none',
          isDragging ? 'bg-primary/15 ring-2 ring-primary' : 'ring-2 ring-transparent',
        )}
      >
        <Avatar className="size-20">
          <AvatarImage src={src ?? undefined} alt={name} referrerPolicy="no-referrer" />
          <AvatarFallback className="font-heading text-2xl font-bold uppercase">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>

        {uploading && (
          <span className="absolute inset-1 grid place-items-center rounded-full bg-background/70">
            <Spinner className="size-5" />
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <HugeIcon icon={Camera01Icon} size={16} strokeWidth={2} className="mr-2" aria-hidden />
          {src ? 'Cambiar foto' : 'Subir foto'}
        </Button>

        {src && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={() => {
              setError(null);
              onRemove();
            }}
          >
            <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} className="mr-2" aria-hidden />
            Quitar foto
          </Button>
        )}
      </div>

      <p className={cn('text-center text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ?? hint ?? 'PNG, JPG o WEBP hasta 10 MB. También podés arrastrarla al círculo.'}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          // Se limpia para que volver a elegir el MISMO archivo dispare el change
          // de nuevo (si no, el input lo considera sin cambios).
          e.target.value = '';
        }}
      />
    </div>
  );
}
