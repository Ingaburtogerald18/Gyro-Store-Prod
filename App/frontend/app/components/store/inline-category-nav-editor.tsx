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
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

import type { StoreCategory } from '~/store/api/sessionApi';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import {
  selectDraftHeaderCategories,
  updateHeaderCategories,
} from '~/store/slices/builderSlice';

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
}: {
  id: string;
  category: StoreCategory;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

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
        "group relative flex items-center gap-2 rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
        isDragging && "opacity-50 ring-2 ring-primary bg-muted shadow-lg"
      )}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-foreground touch-none flex items-center gap-2"
        aria-label="Arrastrar para reordenar"
      >
        {category.icon && <span>{category.icon}</span>}
        {category.name}
      </div>
      
      {/* Botón de quitar, solo visible en hover (desktop) o siempre en móvil */}
      <button
        onClick={() => onRemove(id)}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Quitar categoría"
      >
        <HugeIcon icon={Cancel01Icon} size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

interface InlineCategoryNavEditorProps {
  allCategories: StoreCategory[];
}

export function InlineCategoryNavEditor({ allCategories }: InlineCategoryNavEditorProps) {
  const dispatch = useAppDispatch();
  const draftHeaderCategories = useAppSelector(selectDraftHeaderCategories);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const availableToAdd = useMemo(() => {
    return allCategories.filter(c => !draftHeaderCategories.includes(c.id));
  }, [allCategories, draftHeaderCategories]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = draftHeaderCategories.indexOf(active.id as string);
      const newIndex = draftHeaderCategories.indexOf(over.id as string);
      dispatch(updateHeaderCategories(arrayMove(draftHeaderCategories, oldIndex, newIndex)));
    }
  };

  const handleRemove = (idToRemove: string) => {
    dispatch(updateHeaderCategories(draftHeaderCategories.filter(id => id !== idToRemove)));
  };

  const handleAdd = (idToAdd: string) => {
    if (draftHeaderCategories.length >= 7) return;
    dispatch(updateHeaderCategories([...draftHeaderCategories, idToAdd]));
  };

  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto no-scrollbar">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={draftHeaderCategories}
          strategy={horizontalListSortingStrategy}
        >
          {draftHeaderCategories.map((id) => {
            const cat = allCategories.find((c) => c.id === id);
            if (!cat) return null;
            return (
              <SortableCategoryItem
                key={id}
                id={id}
                category={cat}
                onRemove={handleRemove}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Botón de añadir */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 shrink-0 gap-1 rounded-xl px-2 text-primary"
            disabled={draftHeaderCategories.length >= 7}
          >
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
            <span className="text-xs">Añadir</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {availableToAdd.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">No hay más categorías</div>
          ) : (
            availableToAdd.map(cat => (
              <DropdownMenuItem key={cat.id} onClick={() => handleAdd(cat.id)}>
                {cat.icon && <span className="mr-2">{cat.icon}</span>}
                {cat.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Contador de uso */}
      <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-2xs font-medium text-muted-foreground">
        <span className={cn(draftHeaderCategories.length >= 7 && "text-warning")}>
          {draftHeaderCategories.length}
        </span>
        / 7
      </div>
    </div>
  );
}
