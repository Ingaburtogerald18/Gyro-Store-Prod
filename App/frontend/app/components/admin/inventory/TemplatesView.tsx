import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { AdminTemplate } from "@shared/schemas";
import { ToneDot } from "~/components/catalog/ToneDot";
import { Chip } from "~/components/ui/chip";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { DataTable } from "~/components/ui/DataTable";
import { serverErrorMessage } from "~/components/ui/form-feedback";
import { HugeIcon } from "~/components/ui/icon";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { Skeleton } from "~/components/ui/skeleton";
import {
  useDeleteTemplateMutation,
  useGetCategoriesQuery,
  useGetTemplatesQuery,
} from "~/store/api/catalogAdminApi";
import { TemplateFormDialog } from "./TemplateFormDialog";

function variantsText(template: AdminTemplate): string {
  if (!template.axes.length) return "Sin variantes";
  return template.axes
    .map((axis) => `${axis.label}: ${axis.options.join(", ")}`)
    .join(" · ");
}

export function TemplatesView({
  search,
  createOpen,
  onCreateOpenChange,
}: {
  search: string;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { data: templates = [], isLoading } = useGetTemplatesQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const [deleteTemplate] = useDeleteTemplateMutation();
  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [toDelete, setToDelete] = useState<AdminTemplate | null>(null);

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const columns = useMemo<ColumnDef<AdminTemplate>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Modelo",
        meta: { className: "w-[34%]" },
        cell: ({ row }) => (
          <div className="min-w-0 py-2">
            <p
              className="truncate font-semibold text-foreground"
              title={row.original.name}
            >
              {row.original.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.description.trim() || "Sin descripción"}
            </p>
          </div>
        ),
      },
      {
        id: "category",
        header: "Categoría",
        meta: { className: "w-[18%]" },
        accessorFn: (t) =>
          t.categoryId ? categoryName.get(t.categoryId) ?? "" : "",
        cell: ({ row, getValue }) =>
          getValue() ? (
            <Chip variant="category" className="max-w-full">
              <ToneDot toneKey={row.original.categoryId} />
              <span className="truncate" title={getValue() as string}>
                {getValue() as string}
              </span>
            </Chip>
          ) : (
            <Chip variant="status" tone="warning" className="whitespace-normal">
              Falta categoría
            </Chip>
          ),
      },
      {
        id: "variants",
        header: "Opciones del modelo",
        meta: { className: "w-[20%]" },
        accessorFn: variantsText,
        enableSorting: false,
        cell: ({ row, getValue }) => (
          <div className="min-w-0 py-2" title={getValue() as string}>
            <p className="truncate">
              {row.original.axes.map((axis) => axis.label).join(" · ") ||
                "Sin variantes"}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {row.original.axes.length
                ? `${row.original.axes.length} ${
                    row.original.axes.length === 1
                      ? "tipo de opción"
                      : "tipos de opción"
                  }`
                : "Una sola versión"}
            </p>
          </div>
        ),
      },
      {
        id: "products",
        header: "Productos vinculados",
        accessorFn: (template) => template.products.length,
        meta: { align: "right", className: "w-[20%]" },
        cell: ({ row, getValue }) => {
          const published = row.original.products.filter(
            (product) => product.published
          ).length;
          return (
            <div className="py-2">
              <p className="font-semibold tabular-nums">
                {getValue() as number}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {row.original.products.length
                  ? `${published} ${
                      published === 1 ? "publicado" : "publicados"
                    }`
                  : "Sin productos"}
              </p>
            </div>
          );
        },
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
                  icon: (
                    <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />
                  ),
                  onClick: () => setEditing(row.original),
                },
                {
                  label: "Eliminar",
                  icon: (
                    <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                  ),
                  danger: true,
                  separatorBefore: true,
                  disabled: row.original.products.length > 0,
                  onClick: () => setToDelete(row.original),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [categoryName]
  );

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteTemplate(toDelete.id).unwrap();
      toast.success("Plantilla eliminada");
    } catch (err) {
      toast.error(serverErrorMessage(err, "No se pudo eliminar la plantilla."));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-13 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <DataTable
        tableId="inventario-plantillas"
        columns={columns}
        data={templates}
        layout="fixed"
        onRowClick={setEditing}
        hideSearch
        globalFilterValue={search}
        initialSorting={[{ id: "name", desc: false }]}
        emptyText="Todavía no hay plantillas. Creá la primera con «Crear plantilla»."
      />

      <TemplateFormDialog
        open={createOpen || !!editing}
        onOpenChange={(open) => {
          if (open) return;
          setEditing(null);
          onCreateOpenChange(false);
        }}
        template={editing}
        categories={categories}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`¿Eliminar la plantilla ${toDelete?.name ?? ""}?`}
        description="No tiene compras ni productos. Se borra con sus variantes y especificaciones."
        confirmText="Eliminar plantilla"
        onConfirm={confirmDelete}
      />
    </>
  );
}
