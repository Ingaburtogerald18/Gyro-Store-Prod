// Destacados de la portada: hasta 8 productos elegidos por id y en orden. Se arrastran como las
// secciones; se agregan con el buscador, que tolera escribir parte del nombre.
import { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Cancel01Icon, Image01Icon, Menu01Icon } from '@hugeicons/core-free-icons';

import { MAX_FEATURED_PRODUCTS, type EditorProduct } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Chip } from '~/components/ui/chip';
import { Combobox } from '~/components/ui/combobox';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { HugeIcon } from '~/components/ui/icon';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectDraftFeaturedProducts, updateFeaturedProducts } from '~/state/slices/builder-slice';
import { cn } from '~/lib/utils';

function SortableFeaturedItem({
  product,
  onRemove,
  disabled,
}: {
  product: EditorProduct;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled,
  });
  const image = product.images[0];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 1 }}
      className={cn('flex w-full items-center gap-3 rounded-xl border bg-card p-3', isDragging && 'border-primary-2 opacity-50')}
    >
      <Button
        variant="outline"
        size="icon"
        disabled={disabled}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Mover ${product.name}`}
      >
        <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} />
      </Button>

      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background">
        {image ? <img src={image} alt="" className="size-full object-contain" /> : <HugeIcon icon={Image01Icon} size={16} aria-hidden />}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        {!product.published && (
          <Chip variant="status" tone="neutral">Oculto: no se muestra</Chip>
        )}
      </div>

      <Button
        variant="cancel"
        size="icon"
        disabled={disabled}
        onClick={() => onRemove(product.id)}
        aria-label={`Quitar ${product.name} de destacados`}
      >
        <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </Button>
    </div>
  );
}

export function InlineFeaturedEditor({ products, disabled = false }: { products: EditorProduct[]; disabled?: boolean }) {
  const dispatch = useAppDispatch();
  const featured = useAppSelector(selectDraftFeaturedProducts);
  const [query, setQuery] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selected = featured
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is EditorProduct => Boolean(p));

  // Nombre visible de cada opción; si dos productos se llaman igual, la categoría los distingue.
  const options = useMemo(() => {
    const candidates = products.filter((p) => !featured.includes(p.id));
    const counts = new Map<string, number>();
    for (const p of candidates) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    return candidates.map((p) => ({ id: p.id, label: (counts.get(p.name) ?? 0) > 1 ? `${p.name} · ${p.category}` : p.name }));
  }, [products, featured]);
  const full = featured.length >= MAX_FEATURED_PRODUCTS;

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (disabled || !over || active.id === over.id) return;
    const from = featured.indexOf(String(active.id));
    const to = featured.indexOf(String(over.id));
    if (from >= 0 && to >= 0) dispatch(updateFeaturedProducts(arrayMove(featured, from, to)));
  }

  function handleQuery(value: string) {
    const match = options.find((o) => o.label === value);
    if (match && !full) {
      dispatch(updateFeaturedProducts([...featured, match.id]));
      setQuery('');
      return;
    }
    setQuery(value);
  }

  return (
    <section className="space-y-4" aria-labelledby="featured-title">
      <div className="space-y-1">
        <h3 id="featured-title" className="font-semibold">Destacados</h3>
        <p className="text-xs text-muted-foreground">
          Hasta {MAX_FEATURED_PRODUCTS} productos al principio de la portada. Sin elegir, se muestran los primeros del
          catálogo.
        </p>
      </div>

      {selected.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={featured} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {selected.map((product) => (
                <SortableFeaturedItem
                  key={product.id}
                  product={product}
                  disabled={disabled}
                  onRemove={(id) => dispatch(updateFeaturedProducts(featured.filter((f) => f !== id)))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Field>
        <FieldLabel htmlFor="featured-add">Agregar producto</FieldLabel>
        <Combobox
          id="featured-add"
          value={query}
          onChange={handleQuery}
          options={options.map((o) => o.label)}
          placeholder={full ? 'Ya elegiste el máximo' : 'Buscá por nombre'}
          disabled={disabled || full || options.length === 0}
          emptyMessage="No hay productos con ese nombre."
        />
        <FieldDescription>
          {featured.length} de {MAX_FEATURED_PRODUCTS} elegidos. Arrastrá desde el asa para ordenar; con teclado,
          Espacio y las flechas.
        </FieldDescription>
      </Field>
    </section>
  );
}
