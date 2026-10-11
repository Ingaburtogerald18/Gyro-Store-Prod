import { ImageNotFound01Icon } from '@hugeicons/core-free-icons';
import { Chip } from '~/components/ui/chip';
import { HugeIcon } from '~/components/ui/icon';

export function EditorItemPreview({
  name,
  category,
  price,
  image,
  visible,
}: {
  name: string;
  category?: string;
  price: string;
  image?: string;
  visible: boolean;
}) {
  return (
    <aside
      aria-label="Vista previa del producto"
      className="space-y-4 self-start xl:sticky xl:top-5"
    >
      <div>
        <h3 className="text-lg font-semibold">Así quedará en la tienda</h3>
        <p className="mt-1 text-xs text-muted-foreground">Vista previa de este borrador.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid aspect-square place-items-center border-b bg-background p-6">
          {image ? (
            <img src={image} alt={name} className="size-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <HugeIcon icon={ImageNotFound01Icon} size={24} aria-hidden />
              <span className="text-sm">Todavía no hay fotos</span>
            </div>
          )}
        </div>
        <div className="space-y-3 p-5">
          {category && <Chip variant="category">{category}</Chip>}
          <p className="font-semibold">{name}</p>
          <p className="font-heading text-lg font-extrabold tabular-nums">{price}</p>
        </div>
      </div>
      <Chip variant="status" tone={visible ? 'success' : 'neutral'}>
        {visible ? 'Se mostrará al publicar' : 'Quedará oculto al publicar'}
      </Chip>
    </aside>
  );
}
