import { useEffect, useState } from 'react';
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
import { Menu01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

import type { StoreCategory } from '~/store/api/sessionApi';
import type { LandingConfig } from '@shared/schemas';
import { useUpdateLandingConfigMutation } from '~/store/api/storefrontApi';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { HugeIcon } from '~/components/ui/icon';
import { cn } from '~/lib/utils';

// --- Sortable Item Component ---
function SortableCategoryItem({
  id,
  category,
  isVisible,
  onToggle,
}: {
  id: string;
  category: StoreCategory;
  isVisible: boolean;
  onToggle: (id: string, visible: boolean) => void;
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
        "flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm transition-opacity",
        isDragging && "opacity-50 ring-2 ring-primary",
        !isVisible && "opacity-60"
      )}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none"
        aria-label="Arrastrar para reordenar"
      >
        <HugeIcon icon={Menu01Icon} size={18} strokeWidth={2} />
      </div>
      
      <div className="flex-1 font-medium text-sm flex items-center gap-2">
        {category.icon && <span>{category.icon}</span>}
        {category.name}
      </div>

      <Switch
        checked={isVisible}
        onCheckedChange={(checked) => onToggle(id, checked)}
        aria-label={`Mostrar ${category.name} en el Navbar`}
      />
    </div>
  );
}

// --- Main Dialog Component ---
export function CategoryNavEditorDialog({
  open,
  onOpenChange,
  allCategories,
  headerCategories,
  landing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allCategories: StoreCategory[];
  headerCategories: string[];
  landing?: LandingConfig;
}) {
  const [updateLanding, { isLoading }] = useUpdateLandingConfigMutation();
  
  // Local state for dragging and toggling
  const [items, setItems] = useState<string[]>([]);
  const [visibleSet, setVisibleSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    
    // Initialize state
    // 1. Visible items in their saved order
    // 2. Hidden items appended at the end
    const savedIds = headerCategories.filter(id => allCategories.some(c => c.id === id));
    const hiddenIds = allCategories.filter(c => !savedIds.includes(c.id)).map(c => c.id);
    
    setItems([...savedIds, ...hiddenIds]);
    setVisibleSet(new Set(savedIds));
  }, [open, allCategories, headerCategories]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleToggle = (id: string, visible: boolean) => {
    setVisibleSet(prev => {
      const next = new Set(prev);
      if (visible) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!landing) return;
    
    // Extract only the visible items in their current sorted order
    const newHeaderCategories = items.filter(id => visibleSet.has(id));
    
    if (newHeaderCategories.length > 7) {
      toast.warning('Se recomiendan máximo 7 categorías para evitar problemas de diseño.');
    }

    try {
      await updateLanding({
        ...landing,
        headerCategories: newHeaderCategories,
      }).unwrap();
      
      toast.success('Navegación actualizada');
      onOpenChange(false);
    } catch (error) {
      toast.error('Error al guardar la navegación');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Editar Barra de Navegación</DialogTitle>
          <DialogDescription>
            Elige qué categorías quieres mostrar en el menú principal y arrástralas para cambiar su orden.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items}
              strategy={verticalListSortingStrategy}
            >
              {items.map((id) => {
                const cat = allCategories.find(c => c.id === id);
                if (!cat) return null;
                
                return (
                  <SortableCategoryItem
                    key={id}
                    id={id}
                    category={cat}
                    isVisible={visibleSet.has(id)}
                    onToggle={handleToggle}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>

        <DialogFooter className="p-6 pt-4 border-t bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Guardando...' : 'Guardar Navbar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
