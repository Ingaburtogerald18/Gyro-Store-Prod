import { HugeIcon } from "~/components/ui/icon";
import { Delete02Icon, DragDropVerticalIcon, Edit02Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { AdminProduct } from '@shared/schemas';
import { Card, CardContent } from '~/components/ui/card';
import { formatCordobas } from '~/lib/formatters';
import { CatalogCardMedia } from './CatalogCardMedia';

interface SortableCatalogGridProps {
  items: AdminProduct[];
  onReorder: (items: AdminProduct[]) => void;
  onEdit: (product: AdminProduct) => void;
  onDelete: (id: string) => void;
  // Vista de vendedor: sin arrastrar, editar ni borrar. Solo ver + abrir el SPO.
  readOnly?: boolean;
}

export function SortableCatalogGrid({ items: initialItems, onReorder, onEdit, onDelete, readOnly = false }: SortableCatalogGridProps) {
  const [items, setItems] = useState<AdminProduct[]>([]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);

    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems); // Update local state for immediate feedback
    onReorder(newItems); // Notify parent to save the new order
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id || '')} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <SortableCard
              key={item.id}
              item={item}
              readOnly={readOnly}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item.id!)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableCardProps {
  item: AdminProduct;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableCard({ item, readOnly, onEdit, onDelete }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id || '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`flex flex-col h-full relative group/catalog-card ${isDragging ? 'shadow-2xl ring-2 ring-ring z-50' : 'hover:ring-foreground/10 transition-colors'}`}
    >
      {!readOnly && (
        <div className="absolute left-2 top-2 z-10 flex gap-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-xl bg-black/60 p-1.5 text-white active:cursor-grabbing hover:bg-black/80 transition-colors"
            aria-label="Reordenar"
          >
            <HugeIcon icon={DragDropVerticalIcon} size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      {!readOnly && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="rounded-xl bg-black/60 p-1.5 text-white hover:text-primary hover:bg-black/80 transition-colors"
            aria-label="Editar"
          >
            <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-xl bg-black/60 p-1.5 text-white hover:text-destructive hover:bg-black/80 transition-colors"
            aria-label="Eliminar"
          >
            <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      <CatalogCardMedia image={item.images?.[0]} alt={item.name} published={item.published} />
      <CardContent className="p-4 flex-1 flex flex-col">
        {item.isPromo && (
          <span className="mb-1 block text-xs font-semibold text-primary">Promoción</span>
        )}
        <h3 className="font-semibold text-foreground line-clamp-2" title={item.name}>
          {item.name}
        </h3>
        
        <div className="mt-auto flex flex-col items-start pt-2">
          <div className="flex items-baseline gap-2">
            <span className="nums text-lg font-bold text-primary-2">{formatCordobas(item.price)}</span>
            {item.basePrice != null && item.basePrice > item.price && (
              <span className="nums text-xs text-muted-foreground line-through">{formatCordobas(item.basePrice)}</span>
            )}
          </div>
          {item.spoLink && (
            <a
              href={item.spoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <HugeIcon icon={Image01Icon} size={14} strokeWidth={2} />
              Fotos y videos
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
