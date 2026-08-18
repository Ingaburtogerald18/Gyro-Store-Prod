// Panel de combos del catálogo (pestaña "Combos"). Grilla de combos + alta/edición
// con ComboEditorDialog. Solo lo ve el admin (la pestaña está oculta al vendedor).
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Delete02Icon, Edit02Icon, SquareIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AdminCombo, AdminComboInput } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { QueryState } from '~/components/ui/QueryState';
import { Skeleton } from '~/components/ui/skeleton';
import { formatCordobas } from '~/lib/formatters';
import {
  useCreateAdminComboMutation,
  useDeleteAdminComboMutation,
  useGetAdminCatalogQuery,
  useGetAdminCombosQuery,
  useUpdateAdminComboMutation,
} from '~/store/api/catalogAdminApi';
import { ComboEditorDialog } from './ComboEditorDialog';
import { CatalogCardMedia } from './CatalogCardMedia';

export function CombosPanel() {
  const { data: combos = [], isLoading, isError, refetch } = useGetAdminCombosQuery();
  // El editor necesita el catálogo para elegir los productos que componen el combo.
  const { data: products = [] } = useGetAdminCatalogQuery();
  const [createCombo, { isLoading: isCreating }] = useCreateAdminComboMutation();
  const [updateCombo, { isLoading: isUpdating }] = useUpdateAdminComboMutation();
  const [deleteCombo] = useDeleteAdminComboMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCombo | null>(null);
  const [comboToDelete, setComboToDelete] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setIsOpen(true);
  };
  const openEdit = (combo: AdminCombo) => {
    setEditing(combo);
    setIsOpen(true);
  };

  async function handleSave(input: AdminComboInput) {
    try {
      if (editing) {
        await updateCombo({ id: editing.id, data: input }).unwrap();
        toast.success('Combo actualizado.');
      } else {
        await createCombo(input).unwrap();
        toast.success('Combo creado.');
      }
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudo guardar el combo.');
    }
  }

  async function handleDelete(id: string) {
    setComboToDelete(id);
  }

  async function confirmDeleteCombo() {
    if (!comboToDelete) return;
    try {
      await deleteCombo(comboToDelete).unwrap();
      toast.success('Combo eliminado.');
      setComboToDelete(null);
    } catch (error: any) {
      toast.error(error?.data?.error || 'No se pudo eliminar el combo.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="font-bold h-10">
          <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" />
          Nuevo combo
        </Button>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={combos.length === 0}
        errorMessage="No se pudieron cargar los combos."
        onRetry={refetch}
        loadingFallback={
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 rounded-card" />
            ))}
          </div>
        }
        emptyFallback={
          <Card className="border-dashed bg-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <HugeIcon icon={SquareIcon} size={48} strokeWidth={2} className="text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">Sin combos</h3>
              <p className="text-muted-foreground text-sm mt-1 mb-4 text-center max-w-sm">
                Creá un paquete de productos con un precio especial.
              </p>
              <Button onClick={openCreate}>
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" />
                Crear combo
              </Button>
            </CardContent>
          </Card>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {combos.map((combo) => (
            <Card key={combo.id} className="bg-card border overflow-hidden flex flex-col h-full relative">
              <div className="absolute right-2 top-2 z-10 flex gap-1">
                <button
                  onClick={() => openEdit(combo)}
                  className="rounded-lg bg-black/60 p-1.5 text-white hover:text-primary hover:bg-black/80 transition-colors"
                  aria-label="Editar"
                >
                  <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />
                </button>
                <button
                  onClick={() => handleDelete(combo.id)}
                  className="rounded-lg bg-black/60 p-1.5 text-white hover:text-destructive hover:bg-black/80 transition-colors"
                  aria-label="Eliminar"
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                </button>
              </div>

              <CatalogCardMedia
                image={combo.images[0]}
                alt={combo.name}
                published={combo.published}
              />

              <CardContent className="p-4 flex-1 flex flex-col">
                <h3 className="font-semibold text-foreground line-clamp-2" title={combo.name}>
                  {combo.name}
                </h3>
                <div className="mt-auto flex flex-col items-start pt-2">
                  <div className="nums text-lg font-bold text-primary-2">{formatCordobas(combo.price)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {combo.items.length} artículo{combo.items.length === 1 ? '' : 's'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </QueryState>

      {isOpen && (
        <ComboEditorDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          combo={editing}
          products={products}
          isSaving={isCreating || isUpdating}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!comboToDelete}
        onOpenChange={(open) => !open && setComboToDelete(null)}
        title="Eliminar combo"
        description="¿Seguro que deseas eliminar este combo? Esta acción no se puede deshacer."
        onConfirm={confirmDeleteCombo}
      />
    </div>
  );
}
