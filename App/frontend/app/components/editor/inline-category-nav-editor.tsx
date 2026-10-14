import { useMemo } from 'react';
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
import { Add01Icon, Cancel01Icon, Menu01Icon } from '@hugeicons/core-free-icons';

import type { StoreCategory } from '~/state/api/session-api';
import { useAppDispatch, useAppSelector } from '~/state/hooks';
import { selectDraftHeaderCategories, updateHeaderCategories } from '~/state/slices/builder-slice';

import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';

function SortableCategoryItem({
  id,
  category,
  onRemove,
  disabled,
}: {
  id: string;
  category: StoreCategory;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-sm font-medium',
        isDragging && 'opacity-50 border-primary-2',
      )}
    >
      <Button
        variant="outline"
        size="icon"
        disabled={disabled}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Mover ${category.name}`}
      >
        <HugeIcon icon={Menu01Icon} size={16} aria-hidden />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {category.icon && <span>{category.icon}</span>}
        {category.name}
      </div>
      <Button
        variant="cancel"
        size="icon"
        disabled={disabled}
        onClick={() => onRemove(id)}
        aria-label={`Quitar ${category.name} de la navegación`}
      >
        <HugeIcon icon={Cancel01Icon} size={16} aria-hidden />
      </Button>
    </div>
  );
}

interface InlineCategoryNavEditorProps {
  allCategories: StoreCategory[];
  disabled?: boolean;
}

export function InlineCategoryNavEditor({
  allCategories,
  disabled = false,
}: InlineCategoryNavEditorProps) {
  const dispatch = useAppDispatch();
  const draftHeaderCategories = useAppSelector(selectDraftHeaderCategories);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const availableToAdd = useMemo(() => {
    return allCategories.filter((c) => !draftHeaderCategories.includes(c.id));
  }, [allCategories, draftHeaderCategories]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (disabled) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = draftHeaderCategories.indexOf(active.id as string);
      const newIndex = draftHeaderCategories.indexOf(over.id as string);
      if (oldIndex >= 0 && newIndex >= 0)
        dispatch(updateHeaderCategories(arrayMove(draftHeaderCategories, oldIndex, newIndex)));
    }
  };

  const handleRemove = (idToRemove: string) => {
    if (disabled) return;
    dispatch(updateHeaderCategories(draftHeaderCategories.filter((id) => id !== idToRemove)));
  };

  const handleAdd = (idToAdd: string) => {
    if (disabled || draftHeaderCategories.length >= 7) return;
    dispatch(updateHeaderCategories([...draftHeaderCategories, idToAdd]));
  };

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      <p className="mb-2 text-xs text-muted-foreground">
        Arrastrá desde el asa para ordenar. Con teclado, presioná Espacio y usá las flechas.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draftHeaderCategories} strategy={verticalListSortingStrategy}>
          {draftHeaderCategories.map((id) => {
            const cat = allCategories.find((c) => c.id === id);
            if (!cat) return null;
            return (
              <SortableCategoryItem
                key={id}
                id={id}
                category={cat}
                onRemove={handleRemove}
                disabled={disabled}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="mt-2 w-full"
            disabled={disabled || draftHeaderCategories.length >= 7 || availableToAdd.length === 0}
          >
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
            Agregar categoría
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
          {availableToAdd.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No hay más categorías
            </div>
          ) : (
            availableToAdd.map((cat) => (
              <DropdownMenuItem key={cat.id} onClick={() => handleAdd(cat.id)}>
                {cat.icon && <span className="mr-2">{cat.icon}</span>}
                {cat.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <p className="text-xs text-muted-foreground">
        {draftHeaderCategories.length} de 7 categorías seleccionadas.
      </p>
    </div>
  );
}
