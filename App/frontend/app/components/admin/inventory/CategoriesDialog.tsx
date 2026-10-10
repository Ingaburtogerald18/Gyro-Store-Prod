// Categorías de la tienda: cada plantilla pertenece a una. Se administran desde
// la vista Plantillas.
import { Add01Icon, Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { Category } from "@shared/schemas";
import { ToneDot } from "~/components/catalog/ToneDot";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { DiscardChangesDialog, FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMutation,
} from "~/store/api/catalogAdminApi";

const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Escribí el nombre.").max(80),
  slug: z
    .string()
    .trim()
    .min(1, "Escribí cómo se ve en la dirección.")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones."),
  icon: z.string().max(16),
});
type CategoryForm = z.infer<typeof categoryFormSchema>;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: categories = [] } = useGetCategoriesQuery();
  const [deleteCategory] = useDeleteCategoryMutation();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteCategory(toDelete.id).unwrap();
      toast.success("Categoría eliminada");
    } catch (err) {
      toast.error(serverErrorMessage(err, "No se pudo eliminar la categoría."));
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Categorías</DialogTitle>
          </DialogHeader>
          {categories.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              Todavía no hay categorías.
            </p>
          ) : (
            <ul className="divide-y rounded-2xl border">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <ToneDot toneKey={c.id} />
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">/{c.slug}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                      <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Eliminar ${c.name}`} onClick={() => setToDelete(c)}>
                      <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="cancel" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={() => setEditing("new")}>
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
              Crear categoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryFormDialog
        category={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(next) => !next && setToDelete(null)}
        title={`¿Eliminar la categoría ${toDelete?.name ?? ""}?`}
        description="Sus plantillas y productos quedan sin categoría hasta que les elijas otra."
        confirmText="Eliminar categoría"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function CategoryFormDialog({
  category,
  open,
  onOpenChange,
}: {
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [createCategory] = useCreateCategoryMutation();
  const [updateCategory] = useUpdateCategoryMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getFieldState,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CategoryForm>({ resolver: zodResolver(categoryFormSchema), defaultValues: { name: "", slug: "", icon: "" } });

  useEffect(() => {
    if (!open) return;
    reset(category ? { name: category.name, slug: category.slug, icon: category.icon ?? "" } : { name: "", slug: "", icon: "" });
    setServerError(null);
  }, [open, category, reset]);

  function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  async function onSubmit(values: CategoryForm) {
    setServerError(null);
    try {
      if (category) await updateCategory({ id: category.id, ...values }).unwrap();
      else await createCategory(values).unwrap();
      toast.success(category ? "Categoría guardada" : "Categoría creada");
      onOpenChange(false);
    } catch (err) {
      setServerError(serverErrorMessage(err, "No se pudo guardar la categoría."));
    }
  }

  const nameField = register("name");

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="w-full sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{category ? "Editar categoría" : "Crear categoría"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormErrorBanner message={serverError} />
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="category-name" required>
                Nombre
              </FieldLabel>
              <Input
                id="category-name"
                placeholder="Ej. Audífonos in-ear"
                aria-required
                aria-invalid={!!errors.name}
                {...nameField}
                onChange={(e) => {
                  nameField.onChange(e);
                  // La dirección sigue al nombre mientras nadie la haya tocado a mano.
                  if (!category && !getFieldState("slug").isDirty) setValue("slug", slugify(e.target.value));
                }}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="category-slug" required>
                Dirección en la tienda
              </FieldLabel>
              <Input id="category-slug" aria-required aria-invalid={!!errors.slug} {...register("slug")} />
              <FieldDescription>Va en el enlace de la categoría. Solo minúsculas, números y guiones.</FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>
            <Field data-invalid={!!errors.icon}>
              <FieldLabel htmlFor="category-icon">Ícono</FieldLabel>
              <Input id="category-icon" maxLength={16} {...register("icon")} />
              <FieldError errors={[errors.icon]} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="cancel" onClick={() => requestClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={() => onOpenChange(false)} />
    </>
  );
}
