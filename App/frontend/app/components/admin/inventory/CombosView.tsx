// Combos en Inventario: nombre, precio e incluidos. Si se muestran en la tienda
// y sus fotos se cambian en el modo edición; acá solo se ve el estado.
import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { AdminCombo } from "@shared/schemas";
import { MoneyCell } from "~/components/ui/cells";
import { Chip } from "~/components/ui/chip";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { DataTable } from "~/components/ui/DataTable";
import { serverErrorMessage } from "~/components/ui/form-feedback";
import { HugeIcon } from "~/components/ui/icon";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { Skeleton } from "~/components/ui/skeleton";
import { useDeleteAdminComboMutation, useGetAdminCombosQuery, useGetTemplatesQuery } from "~/store/api/catalogAdminApi";
import { ComboFormDialog } from "./ComboFormDialog";

const itemsText = (combo: AdminCombo) => combo.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ");

export function CombosView({
  search,
  createOpen,
  onCreateOpenChange,
}: {
  search: string;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { data: combos = [], isLoading } = useGetAdminCombosQuery();
  const { data: templates = [] } = useGetTemplatesQuery();
  const [deleteCombo] = useDeleteAdminComboMutation();
  const [editing, setEditing] = useState<AdminCombo | null>(null);
  const [toDelete, setToDelete] = useState<AdminCombo | null>(null);

  const columns = useMemo<ColumnDef<AdminCombo>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Combo",
        meta: { className: "w-[46%]" },
        cell: ({ row }) => (
          <div className="min-w-0 py-2">
            <p className="truncate font-semibold text-foreground" title={row.original.name}>
              {row.original.name}
            </p>
            <p className="truncate text-xs text-muted-foreground" title={itemsText(row.original)}>
              {itemsText(row.original) || "Sin productos"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: "Precio",
        meta: { align: "right", className: "w-[16%]" },
        cell: ({ getValue }) => <MoneyCell tone="strong" value={getValue() as number} />,
      },
      {
        id: "count",
        header: "Productos",
        accessorFn: (combo) => combo.items.reduce((sum, item) => sum + item.quantity, 0),
        meta: { align: "right", className: "w-[12%]" },
        cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
      },
      {
        id: "store",
        header: "En la tienda",
        accessorFn: (combo) => (combo.published ? "Se muestra" : "Oculto"),
        meta: { className: "w-[18%]" },
        cell: ({ row, getValue }) => (
          <Chip variant="status" tone={row.original.published ? "success" : "neutral"}>
            {getValue() as string}
          </Chip>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { className: "w-[8%]" },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowActionsMenu
              label={`Acciones de ${row.original.name}`}
              actions={[
                {
                  label: "Editar",
                  icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />,
                  onClick: () => setEditing(row.original),
                },
                {
                  label: "Eliminar",
                  icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />,
                  danger: true,
                  separatorBefore: true,
                  onClick: () => setToDelete(row.original),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [],
  );

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteCombo(toDelete.id).unwrap();
      toast.success("Combo eliminado");
    } catch (err) {
      toast.error(serverErrorMessage(err, "No se pudo eliminar el combo."));
    }
  }

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Cargando combos" className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-13 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <DataTable
        tableId="inventario-combos"
        columns={columns}
        data={combos}
        layout="fixed"
        onRowClick={setEditing}
        hideSearch
        globalFilterValue={search}
        initialSorting={[{ id: "name", desc: false }]}
        emptyText="Todavía no hay combos. Creá el primero con «Crear combo»."
      />

      <ComboFormDialog
        open={createOpen || !!editing}
        onOpenChange={(open) => {
          if (open) return;
          setEditing(null);
          onCreateOpenChange(false);
        }}
        combo={editing}
        templates={templates}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        variant="destructive"
        title={`¿Eliminar el combo ${toDelete?.name ?? ""}?`}
        description="Sale de la tienda y no se puede recuperar. Si ya tiene pedidos, no se puede eliminar."
        confirmText="Eliminar combo"
        onConfirm={confirmDelete}
      />
    </>
  );
}
