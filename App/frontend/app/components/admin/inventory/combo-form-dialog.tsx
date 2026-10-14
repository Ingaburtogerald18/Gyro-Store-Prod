// Crear o corregir un combo: nombre, precio del paquete y productos incluidos.
// Las fotos y si se muestra en la tienda se preparan en el modo edición.
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { adminComboInputSchema, type AdminCombo, type AdminTemplate } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { DiscardChangesDialog, FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { FormActions, FormBody, FormDialogContent, FormLayout } from "~/components/ui/form-layout";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { MoneyInput } from "~/components/ui/money-input";
import { useCreateAdminComboMutation, useUpdateAdminComboMutation } from "~/state/api/catalog-admin-api";

const comboFormSchema = z.object({
  name: adminComboInputSchema.shape.name,
  price: z.string().refine((v) => Number(v) > 0, "Escribí el precio del combo."),
  items: z
    .array(
      z.object({
        catalogItemId: z.string().min(1, "Elegí un producto de la lista."),
        name: z.string(),
        quantity: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 999, "Escribí de 1 a 999."),
      }),
    )
    .min(1, "Agregá al menos un producto.")
    .max(30, "Máximo 30 productos por combo."),
});
type ComboFormValues = z.infer<typeof comboFormSchema>;

const EMPTY_ITEM = { catalogItemId: "", name: "", quantity: "1" };

function toValues(combo: AdminCombo | null): ComboFormValues {
  if (!combo) return { name: "", price: "", items: [EMPTY_ITEM] };
  return {
    name: combo.name,
    price: combo.price ? String(combo.price) : "",
    items: combo.items.map((item) => ({ catalogItemId: item.catalogItemId, name: item.name, quantity: String(item.quantity) })),
  };
}

export function ComboFormDialog({
  open,
  onOpenChange,
  combo,
  templates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  combo: AdminCombo | null;
  templates: AdminTemplate[];
}) {
  const [createCombo] = useCreateAdminComboMutation();
  const [updateCombo] = useUpdateAdminComboMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ComboFormValues>({ resolver: zodResolver(comboFormSchema), defaultValues: toValues(null) });
  const items = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (!open) return;
    reset(toValues(combo));
    setServerError(null);
  }, [open, combo, reset]);

  // Un producto por plantilla; en las viejas compartidas se aclara cuál.
  const products = useMemo(() => {
    const list = templates.flatMap((t) =>
      t.products.map((p) => ({ id: p.id, label: t.products.length > 1 ? `${t.name} · ${p.name}` : t.name })),
    );
    for (const item of combo?.items ?? []) {
      if (!list.some((p) => p.id === item.catalogItemId)) list.push({ id: item.catalogItemId, label: item.name });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [templates, combo]);
  const labels = useMemo(() => products.map((p) => p.label), [products]);

  function requestClose(next: boolean) {
    if (next || isSubmitting) return;
    if (isDirty) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  async function onSubmit(values: ComboFormValues) {
    setServerError(null);
    const data = {
      name: values.name,
      price: Number(values.price),
      items: values.items.map((item) => ({ catalogItemId: item.catalogItemId, name: item.name, quantity: Number(item.quantity) })),
    };
    try {
      if (combo) await updateCombo({ id: combo.id, data }).unwrap();
      else await createCombo(data).unwrap();
      toast.success(combo ? "Combo guardado" : "Combo creado", {
        description: combo ? undefined : "Mostralo en la tienda desde el modo edición.",
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(serverErrorMessage(err, "No se pudo guardar el combo."));
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <FormDialogContent>
          <DialogHeader>
            <DialogTitle>{combo ? "Editar combo" : "Crear combo"}</DialogTitle>
            <DialogDescription>
              El precio es el del paquete. Las fotos y si se muestra en la tienda se preparan en el modo edición.
            </DialogDescription>
          </DialogHeader>

          <FormLayout onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormErrorBanner message={serverError} />
            <FormBody>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="combo-name" required>
                  Nombre del combo
                </FieldLabel>
                <Input id="combo-name" placeholder="Ej. Combo gamer" aria-required aria-invalid={!!errors.name} {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.price}>
                <FieldLabel htmlFor="combo-price" required>
                  Precio del paquete
                </FieldLabel>
                <Controller
                  control={control}
                  name="price"
                  render={({ field }) => (
                    <MoneyInput id="combo-price" currency="nio" value={field.value} onChange={field.onChange} invalid={!!errors.price} aria-required />
                  )}
                />
                <FieldError errors={[errors.price]} />
              </Field>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">Productos incluidos</legend>
                {items.fields.map((row, i) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <Field className="min-w-0 flex-1" data-invalid={!!errors.items?.[i]?.catalogItemId}>
                      <FieldLabel htmlFor={`combo-item-${i}`} required>
                        Producto {i + 1}
                      </FieldLabel>
                      <Controller
                        control={control}
                        name={`items.${i}.name`}
                        render={({ field }) => (
                          <Combobox
                            id={`combo-item-${i}`}
                            value={field.value}
                            onChange={(label) => {
                              const found = products.find((p) => p.label.toLowerCase() === label.trim().toLowerCase());
                              field.onChange(found?.label ?? label);
                              setValue(`items.${i}.catalogItemId`, found?.id ?? "", { shouldDirty: true, shouldValidate: !!found });
                            }}
                            options={labels}
                            placeholder="Buscá el modelo"
                            emptyMessage="No hay un producto con ese nombre."
                            aria-invalid={!!errors.items?.[i]?.catalogItemId}
                          />
                        )}
                      />
                      <FieldError errors={[errors.items?.[i]?.catalogItemId]} />
                    </Field>
                    <Field className="w-24 shrink-0" data-invalid={!!errors.items?.[i]?.quantity}>
                      <FieldLabel htmlFor={`combo-qty-${i}`}>Cantidad</FieldLabel>
                      <Input
                        id={`combo-qty-${i}`}
                        inputMode="numeric"
                        className="tabular-nums"
                        aria-invalid={!!errors.items?.[i]?.quantity}
                        {...register(`items.${i}.quantity`, { setValueAs: (v: string) => String(v).replace(/\D/g, "") })}
                      />
                      <FieldError errors={[errors.items?.[i]?.quantity]} />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-7 shrink-0"
                      aria-label={`Quitar producto ${i + 1}`}
                      disabled={items.fields.length === 1}
                      onClick={() => items.remove(i)}
                    >
                      <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                    </Button>
                  </div>
                ))}
                <FieldError errors={[{ message: errors.items?.root?.message ?? errors.items?.message }]} />
                <Button type="button" variant="outline" onClick={() => items.append(EMPTY_ITEM)} disabled={items.fields.length >= 30}>
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                  Agregar producto
                </Button>
              </fieldset>
            </FormBody>
            <FormActions>
              <Button type="button" variant="cancel" onClick={() => requestClose(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : combo ? "Guardar cambios" : "Crear combo"}
              </Button>
            </FormActions>
          </FormLayout>
        </FormDialogContent>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={() => onOpenChange(false)} />
    </>
  );
}
