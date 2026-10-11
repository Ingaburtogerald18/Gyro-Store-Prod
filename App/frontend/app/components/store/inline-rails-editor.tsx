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

import type { StoreCategory } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectDraftHomeCategories, updateHomeCategories } from '~/store/slices/builderSlice';

import { Button } from '~/components/ui/button';
import { HugeIcon } from '~/components/ui/icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';

function SortableRailItem({
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
        'flex w-full items-center gap-3 rounded-xl border bg-card p-3',
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
        aria-label={`Mover la sección ${category.name}`}
      >
        <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} />
      </Button>

      <div className="flex flex-1 items-center gap-2 font-medium">
        {category.icon && <span className="text-xl">{category.icon}</span>}
        <span className="text-sm">{category.name}</span>
      </div>

      <Button
        variant="cancel"
        size="icon"
        disabled={disabled}
        onClick={() => onRemove(id)}
        aria-label={`Quitar la sección ${category.name}`}
      >
        <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </Button>
    </div>
  );
}

interface InlineRailsEditorProps {
  allCategories: StoreCategory[];
  disabled?: boolean;
}

export function InlineRailsEditor({ allCategories, disabled = false }: InlineRailsEditorProps) {
  const dispatch = useAppDispatch();
  const draftHomeCategories = useAppSelector(selectDraftHomeCategories);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const availableToAdd = useMemo(() => {
    return allCategories.filter((c) => !draftHomeCategories.includes(c.id));
  }, [allCategories, draftHomeCategories]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (disabled) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = draftHomeCategories.indexOf(active.id as string);
      const newIndex = draftHomeCategories.indexOf(over.id as string);
      if (oldIndex >= 0 && newIndex >= 0)
        dispatch(updateHomeCategories(arrayMove(draftHomeCategories, oldIndex, newIndex)));
    }
  };

  const handleRemove = (idToRemove: string) => {
    if (disabled) return;
    dispatch(updateHomeCategories(draftHomeCategories.filter((id) => id !== idToRemove)));
  };

  const handleAdd = (idToAdd: string) => {
    if (disabled || draftHomeCategories.length >= 20) return;
    dispatch(updateHomeCategories([...draftHomeCategories, idToAdd]));
  };

  return (
    <div className="flex flex-col items-stretch gap-4">
      <p className="text-xs text-muted-foreground">
        Arrastrá desde el asa para ordenar. Con teclado, presioná Espacio y usá las flechas.
      </p>

      <div className="flex w-full flex-col items-center gap-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftHomeCategories} strategy={verticalListSortingStrategy}>
            {draftHomeCategories.map((id) => {
              const cat = allCategories.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <SortableRailItem
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
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full"
            disabled={disabled || draftHomeCategories.length >= 20 || availableToAdd.length === 0}
          >
            <HugeIcon icon={Add01Icon} size={18} strokeWidth={2} />
            Agregar sección
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
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
        {draftHomeCategories.length} de 20 secciones seleccionadas.
      </p>
    </div>
  );
}
