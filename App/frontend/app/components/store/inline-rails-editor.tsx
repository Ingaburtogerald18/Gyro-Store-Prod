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
import {
  selectDraftHomeCategories,
  updateHomeCategories,
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

function SortableRailItem({
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
        "group flex w-full max-w-2xl items-center gap-3 rounded-xl border bg-card p-3 transition-all",
        isDragging && "opacity-50 ring-2 ring-primary shadow-lg"
      )}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none flex-shrink-0"
        aria-label="Arrastrar para reordenar"
      >
        <HugeIcon icon={Menu01Icon} size={20} strokeWidth={2} />
      </div>
      
      <div className="flex flex-1 items-center gap-2 font-medium">
        {category.icon && <span className="text-xl">{category.icon}</span>}
        <span className="text-sm">{category.name}</span>
      </div>
      
      <button
        onClick={() => onRemove(id)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive transition-opacity hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`Quitar la sección ${category.name}`}
      >
        <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

interface InlineRailsEditorProps {
  allCategories: StoreCategory[];
}

export function InlineRailsEditor({ allCategories }: InlineRailsEditorProps) {
  const dispatch = useAppDispatch();
  const draftHomeCategories = useAppSelector(selectDraftHomeCategories);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const availableToAdd = useMemo(() => {
    return allCategories.filter(c => !draftHomeCategories.includes(c.id));
  }, [allCategories, draftHomeCategories]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = draftHomeCategories.indexOf(active.id as string);
      const newIndex = draftHomeCategories.indexOf(over.id as string);
      dispatch(updateHomeCategories(arrayMove(draftHomeCategories, oldIndex, newIndex)));
    }
  };

  const handleRemove = (idToRemove: string) => {
    dispatch(updateHomeCategories(draftHomeCategories.filter(id => id !== idToRemove)));
  };

  const handleAdd = (idToAdd: string) => {
    if (draftHomeCategories.length >= 20) return;
    dispatch(updateHomeCategories([...draftHomeCategories, idToAdd]));
  };

  return (
    <div className="flex flex-col items-stretch gap-4">
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Arrastra para ordenar las secciones. Sin selección, se muestran automáticamente todas las categorías con productos.
      </p>

      <div className="flex w-full flex-col items-center gap-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={draftHomeCategories}
            strategy={verticalListSortingStrategy}
          >
            {draftHomeCategories.map((id) => {
              const cat = allCategories.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <SortableRailItem
                  key={id}
                  id={id}
                  category={cat}
                  onRemove={handleRemove}
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
            className="mt-4 gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            disabled={draftHomeCategories.length >= 20}
          >
            <HugeIcon icon={Add01Icon} size={18} strokeWidth={2} />
            Añadir sección
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56 max-h-64 overflow-y-auto">
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
    </div>
  );
}
