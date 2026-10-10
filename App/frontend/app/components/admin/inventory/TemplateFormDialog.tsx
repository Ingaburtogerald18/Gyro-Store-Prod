// Formulario de una plantilla: una por modelo (KZ EDX Pro, KZ Castor…). Nombre,
// descripción y categoría son los que muestra la tienda; la nota interna no se
// publica. Se usa desde la vista Plantillas y desde Registrar compra.
import { Add01Icon, Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type FieldError as RhfFieldError,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { templateInputSchema, type AdminTemplate, type Category, type TemplateInput } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { DiscardChangesDialog, FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { ToneDot } from "~/components/catalog/ToneDot";
import { cn } from "~/lib/utils";
import { useCreateTemplateMutation, useUpdateTemplateMutation } from "~/store/api/catalogAdminApi";

type TemplateFormValues = z.input<typeof templateInputSchema>;

const EMPTY: TemplateFormValues = { name: "", categoryId: "", description: "", internalNote: "", axes: [], specs: [] };

function toValues(template: AdminTemplate | null, initialName?: string): TemplateFormValues {
  if (!template) return { ...EMPTY, name: initialName ?? "" };
  return {
    name: template.name,
    categoryId: template.categoryId ?? "",
    description: template.description,
    internalNote: template.internalNote,
    axes: template.axes,
    specs: template.specs,
  };
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  categories,
  initialName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AdminTemplate | null;
  categories: Category[];
  /** Nombre ya escrito en el buscador de Registrar compra. */
  initialName?: string;
  onSaved?: (template: AdminTemplate) => void;
}) {
  const [createTemplate] = useCreateTemplateMutation();
  const [updateTemplate] = useUpdateTemplateMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<TemplateFormValues, unknown, TemplateInput>({
    resolver: zodResolver(templateInputSchema),
    defaultValues: EMPTY,
  });
  const axes = useFieldArray({ control, name: "axes" });
  const specs = useFieldArray({ control, name: "specs" });

  useEffect(() => {
    if (!open) return;
    reset(toValues(template, initialName));
    setServerError(null);
  }, [open, template, initialName, reset]);

  function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  async function onSubmit(values: TemplateInput) {
    setServerError(null);
    try {
      const saved = template
        ? await updateTemplate({ id: template.id, data: values }).unwrap()
        : await createTemplate(values).unwrap();
      toast.success(template ? "Plantilla guardada" : "Plantilla creada");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setServerError(serverErrorMessage(err, "No se pudo guardar la plantilla."));
    }
  }

  const inUse = (template?.products.length ?? 0) > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{template ? "Editar plantilla" : "Crear plantilla"}</DialogTitle>
          </DialogHeader>

          {/* Se abre dentro de «Registrar compra»: el submit no debe llegar a ese formulario. */}
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              return handleSubmit(onSubmit)(e);
            }}
            className="flex flex-col gap-5"
            noValidate
          >
            <FormErrorBanner message={serverError} />

            <section className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="template-name" required>
                    Nombre del modelo
                  </FieldLabel>
                  <Input
                    id="template-name"
                    placeholder="Ej. KZ EDX Pro"
                    aria-required
                    aria-invalid={!!errors.name}
                    {...register("name")}
                  />
                  <FieldDescription>Así se ve en la tienda.</FieldDescription>
                  <FieldError errors={[errors.name]} />
                </Field>
                <Field data-invalid={!!errors.categoryId}>
                  <FieldLabel htmlFor="template-category" required>
                    Categoría
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="categoryId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id="template-category" aria-invalid={!!errors.categoryId} className="w-full">
                          <SelectValue placeholder="Elegí la categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <ToneDot toneKey={c.id} />
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.categoryId]} />
                </Field>
              </div>

              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="template-description">Descripción para la tienda</FieldLabel>
                <Textarea
                  id="template-description"
                  rows={4}
                  placeholder="Qué es, para quién es y qué lo hace distinto."
                  aria-invalid={!!errors.description}
                  {...register("description")}
                />
                <FieldError errors={[errors.description]} />
              </Field>
            </section>

            <section className="flex flex-col gap-3 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Variantes</h3>
                  <p className="text-xs text-muted-foreground">Lo que elige el cliente y tiene stock propio. Ej. Color: Negro, Blanco.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    // `key` no se vuelve a tocar: es la llave con la que cada producto recorta sus opciones.
                    axes.append({ key: `eje_${Date.now()}`, label: "", options: [""], isColor: false })
                  }
                >
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                  Agregar variante
                </Button>
              </div>
              {inUse && (
                <p className="text-xs text-muted-foreground">
                  Ya hay compras de este modelo: cambiar el nombre de una opción la deja sin sus compras en la tienda. Para algo nuevo, agregá una opción.
                </p>
              )}
              <FieldError errors={[errors.axes]} />
              {axes.fields.length === 0 ? (
                <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Sin variantes: el modelo se vende en una sola versión.
                </p>
              ) : (
                axes.fields.map((axis, axisIndex) => (
                  <div key={axis.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                    <div className="flex items-end gap-2">
                      <Field className="flex-1" data-invalid={!!errors.axes?.[axisIndex]?.label}>
                        <FieldLabel htmlFor={`axis-${axis.id}`} required>
                          Nombre de la variante
                        </FieldLabel>
                        <Input
                          id={`axis-${axis.id}`}
                          placeholder="Ej. Color"
                          aria-required
                          aria-invalid={!!errors.axes?.[axisIndex]?.label}
                          {...register(`axes.${axisIndex}.label`)}
                        />
                        <FieldError errors={[errors.axes?.[axisIndex]?.label]} />
                      </Field>
                      <Button type="button" variant="ghost" size="icon" aria-label="Quitar variante" onClick={() => axes.remove(axisIndex)}>
                        <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                      </Button>
                    </div>
                    <AxisOptionsField control={control} axisIndex={axisIndex} errors={errors} />
                    <Field orientation="horizontal" className="justify-between">
                      <FieldLabel htmlFor={`axis-color-${axis.id}`} className="font-normal">
                        Es el color: cada opción lleva sus fotos
                      </FieldLabel>
                      <Controller
                        control={control}
                        name={`axes.${axisIndex}.isColor`}
                        render={({ field }) => (
                          <Switch id={`axis-color-${axis.id}`} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                        )}
                      />
                    </Field>
                  </div>
                ))
              )}
            </section>

            <section className="flex flex-col gap-3 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Especificaciones</h3>
                  <p className="text-xs text-muted-foreground">Lo que es igual en todas las unidades. Ej. Driver: 10 mm.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => specs.append({ label: "", value: "" })}>
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                  Agregar especificación
                </Button>
              </div>
              <FieldError errors={[errors.specs]} />
              {specs.fields.map((spec, index) => (
                <div key={spec.id} className="flex items-center gap-2">
                  <Input placeholder="Etiqueta" className="w-1/3" aria-label={`Etiqueta ${index + 1}`} {...register(`specs.${index}.label`)} />
                  <Input placeholder="Valor" className="flex-1" aria-label={`Valor ${index + 1}`} {...register(`specs.${index}.value`)} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar especificación" onClick={() => specs.remove(index)}>
                    <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                  </Button>
                </div>
              ))}
            </section>

            <Field className="border-t pt-5" data-invalid={!!errors.internalNote}>
              <FieldLabel htmlFor="template-note">Nota interna</FieldLabel>
              <Textarea id="template-note" rows={2} aria-invalid={!!errors.internalNote} {...register("internalNote")} />
              <FieldDescription>Solo la ve el equipo; no se publica.</FieldDescription>
              <FieldError errors={[errors.internalNote]} />
            </Field>

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="cancel" onClick={() => requestClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : template ? "Guardar cambios" : "Crear plantilla"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={() => onOpenChange(false)} />
    </>
  );
}

// `options` es un array de strings planos: `useFieldArray` necesita objetos, así
// que el array entero es un campo controlado. El error viene en dos niveles: el
// del array («al menos una opción») y el de cada opción vacía.
function AxisOptionsField({
  control,
  axisIndex,
  errors,
}: {
  control: Control<TemplateFormValues>;
  axisIndex: number;
  errors: FieldErrors<TemplateFormValues>;
}) {
  const raw = errors.axes?.[axisIndex]?.options as unknown as (RhfFieldError & ArrayLike<RhfFieldError | undefined>) | undefined;
  const perOption: (RhfFieldError | undefined)[] = Array.isArray(raw) ? raw : [];
  const rootError = raw?.message ? { message: raw.message } : undefined;

  return (
    <Field data-invalid={!!raw}>
      <FieldLabel required>Opciones</FieldLabel>
      <Controller
        control={control}
        name={`axes.${axisIndex}.options`}
        render={({ field }) => {
          const options = field.value ?? [];
          return (
            <div className="flex flex-wrap gap-2">
              {options.map((option, optionIndex) => (
                <div
                  key={optionIndex}
                  className={cn(
                    "flex h-11 items-center gap-1 rounded-xl border border-input bg-background pr-1",
                    perOption[optionIndex] && "border-destructive",
                  )}
                >
                  <input
                    value={option}
                    onChange={(e) => field.onChange(options.map((o, i) => (i === optionIndex ? e.target.value : o)))}
                    onBlur={field.onBlur}
                    placeholder="Opción"
                    aria-label={`Opción ${optionIndex + 1}`}
                    aria-invalid={!!perOption[optionIndex]}
                    className="w-32 bg-transparent px-3 text-sm outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar opción ${option || optionIndex + 1}`}
                    onClick={() => field.onChange(options.filter((_, i) => i !== optionIndex))}
                  >
                    <HugeIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => field.onChange([...options, ""])}>
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                Opción
              </Button>
            </div>
          );
        }}
      />
      <FieldError errors={[rootError, ...perOption]} />
    </Field>
  );
}
