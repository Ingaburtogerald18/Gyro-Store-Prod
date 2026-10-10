// Vista «Plantillas» de Inventario: una plantilla por modelo, con lo que ve la
// tienda (nombre, descripción, categoría) y sus variantes. También administra
// las categorías.
import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { AdminTemplate } from "@shared/schemas";
import { ToneDot } from "~/components/catalog/ToneDot";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { DataTable } from "~/components/ui/DataTable";
import { serverErrorMessage } from "~/components/ui/form-feedback";
import { HugeIcon } from "~/components/ui/icon";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { Skeleton } from "~/components/ui/skeleton";
import { useDeleteTemplateMutation, useGetCategoriesQuery, useGetTemplatesQuery } from "~/store/api/catalogAdminApi";
import { TemplateFormDialog } from "./TemplateFormDialog";

function variantsText(template: AdminTemplate): string {
  if (!template.axes.length) return "Sin variantes";
  return template.axes.map((axis) => `${axis.label}: ${axis.options.join(", ")}`).join(" · ");
}

function productsText(template: AdminTemplate): string {
  const total = template.products.length;
  if (total === 0) return "Sin compras todavía";
  const published = template.products.filter((p) => p.published).length;
  if (total === 1) return published ? "Publicado" : "Sin publicar";
  return `${total} productos · ${published} publicados`;
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

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const columns = useMemo<ColumnDef<AdminTemplate>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Modelo",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{row.original.name}</p>
            {row.original.internalNote && <p className="truncate text-sm text-muted-foreground">{row.original.internalNote}</p>}
          </div>
        ),
      },
      {
        id: "category",
        header: "Categoría",
        accessorFn: (t) => (t.categoryId ? categoryName.get(t.categoryId) ?? "" : ""),
        cell: ({ row, getValue }) =>
          getValue() ? (
            <span className="inline-flex items-center gap-1.5">
              <ToneDot toneKey={row.original.categoryId} />
              {getValue() as string}
            </span>
          ) : (
            <span className="text-warning">Falta la categoría</span>
          ),
      },
      {
        id: "variants",
        header: "Variantes",
        accessorFn: variantsText,
        enableSorting: false,
        cell: ({ getValue }) => <span className="line-clamp-2 text-sm text-muted-foreground">{getValue() as string}</span>,
      },
      {
        id: "products",
        header: "En la tienda",
        accessorFn: productsText,
        cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { className: "w-[1%]" },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowActionsMenu
              label={`Acciones de ${row.original.name}`}
              actions={[
                { label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditing(row.original) },
                {
                  label: "Eliminar",
                  icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />,
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
    [categoryName],
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
