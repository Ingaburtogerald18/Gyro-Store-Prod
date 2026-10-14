import {
  FormLayout,
  FormDialogContent,
  FormActions,
  FormBody,
  FormSection,
} from "~/components/ui/form-layout";
import { Add01Icon, Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldError as RhfFieldError,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import {
  templateInputSchema,
  type AdminTemplate,
  type Category,
  type TemplateInput,
} from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import {
  DiscardChangesDialog,
  FormErrorBanner,
  serverErrorMessage,
} from "~/components/ui/form-feedback";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { ToneDot } from "~/components/admin/inventory/tone-dot";
import { cn } from "~/lib/utils";
import { templateNameKey } from "@shared/template-names";
import {
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useGetTemplatesQuery,
} from "~/state/api/catalog-admin-api";
import { TemplatePreview } from "./template-preview";

type TemplateFormValues = z.input<typeof templateInputSchema>;

const EMPTY: TemplateFormValues = {
  name: "",
  categoryId: "",
  description: "",
  internalNote: "",
  axes: [],
  specs: [],
};

function toValues(template: AdminTemplate | null, initialName?: string): TemplateFormValues {
  if (!template) return { ...EMPTY, name: initialName ?? "" };
  return {
    name: template.name,
    categoryId: template.categoryId ?? "",
    description: template.description ?? "",
    internalNote: template.internalNote ?? "",
    // Copias con strings garantizados: el formulario y la vista previa hacen trim().
    axes: (template.axes ?? []).map((axis) => ({
      ...axis,
      label: axis.label ?? "",
      options: (axis.options ?? []).map((option) => String(option ?? "")),
    })),
    specs: (template.specs ?? []).map((spec) => ({
      label: String(spec?.label ?? ""),
      value: String(spec?.value ?? ""),
    })),
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
  const { data: templates = [] } = useGetTemplatesQuery(undefined, { skip: !open });
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<TemplateFormValues, unknown, TemplateInput>({
    resolver: zodResolver(templateInputSchema),
    defaultValues: EMPTY,
  });
  const axes = useFieldArray({ control, name: "axes" });
  const specs = useFieldArray({ control, name: "specs" });
  const name = useWatch({ control, name: "name" }) ?? "";
  const nameKey = templateNameKey(name);
  const duplicate =
    template && templateNameKey(template.name) === nameKey
      ? undefined
      : templates.find(
          (item) => item.id !== template?.id && nameKey && templateNameKey(item.name) === nameKey,
        );
  const duplicateMessage = duplicate
    ? `Ya existe la plantilla «${duplicate.name}». Usá esa plantilla para este modelo.`
    : undefined;

  useEffect(() => {
    if (!open) return;
    reset(toValues(template, initialName));
    setServerError(null);
  }, [open, template, initialName, reset]);

  function requestClose(next: boolean) {
    if (!next && isSubmitting) return;
    if (next) return onOpenChange(true);
    if (isDirty) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  async function onSubmit(values: TemplateInput) {
    setServerError(null);
    if (duplicateMessage) {
      setError("name", { type: "duplicate", message: duplicateMessage });
      return;
    }
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
        <FormDialogContent size="long">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {template ? "Editar plantilla" : "Crear plantilla"}
            </DialogTitle>
            <DialogDescription>
              Una plantilla por modelo. Sus productos vinculados usan esta información.
            </DialogDescription>
          </DialogHeader>

          {/* Se abre dentro de «Registrar compra»: el submit no debe llegar a ese formulario. */}
          <FormLayout
            onSubmit={(e) => {
              e.stopPropagation();
              return handleSubmit(onSubmit)(e);
            }}
            noValidate
          >
            <FormErrorBanner message={serverError} />
            <FormBody>
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="min-w-0 space-y-5">
                  <FormSection
                    title="Información pública"
                    description="Nombre, categoría y descripción que ve el cliente."
                  >
                    <Field data-invalid={!!errors.name || !!duplicate}>
                      <FieldLabel htmlFor="template-name" required>
                        Nombre del modelo
                      </FieldLabel>
                      <Input
                        id="template-name"
                        placeholder="Ej. KZ EDX Pro"
                        aria-required
                        aria-invalid={!!errors.name || !!duplicate}
                        {...register("name")}
                      />
                      <FieldError>{duplicateMessage || errors.name?.message}</FieldError>
                      {duplicate && !template && onSaved && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => {
                            onSaved(duplicate);
                            onOpenChange(false);
                          }}
                        >
                          Usar plantilla existente
                        </Button>
                      )}
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
                            <SelectTrigger
                              ref={field.ref}
                              onBlur={field.onBlur}
                              id="template-category"
                              aria-required
                              aria-invalid={!!errors.categoryId}
                              className="w-full"
                            >
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
                    <Field data-invalid={!!errors.description}>
                      <FieldLabel htmlFor="template-description">
                        Descripción para la tienda
                      </FieldLabel>
                      <Textarea
                        id="template-description"
                        rows={4}
                        placeholder="Qué es, para quién es y qué lo hace distinto."
                        aria-invalid={!!errors.description}
                        {...register("description")}
                      />
                      <FieldError errors={[errors.description]} />
                    </Field>
                  </FormSection>

                  <FormSection
                    title="Opciones del modelo"
                    description="Lo que cambia entre variantes, como color o micrófono."
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={axes.fields.length >= 6}
                        onClick={() =>
                          axes.append({
                            key: `eje_${Date.now()}`,
                            label: "",
                            options: [""],
                            isColor: false,
                          })
                        }
                      >
                        <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                        Agregar opción
                      </Button>
                    }
                  >
                    {inUse && (
                      <p className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
                        Ya hay compras de este modelo: cambiar el nombre de una opción la deja sin
                        sus compras en la tienda. Para algo nuevo, agregá una opción.
                      </p>
                    )}
                    <FieldError errors={[errors.axes]} />
                    {axes.fields.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-4">
                        <p className="font-semibold">Una sola versión</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Este modelo no tiene opciones de variante.
                        </p>
                      </div>
                    ) : (
                      axes.fields.map((axis, axisIndex) => (
                        <div
                          key={axis.id}
                          className="flex flex-col gap-4 rounded-2xl border bg-background p-4"
                        >
                          <div className="flex items-end gap-2">
                            <Field
                              className="flex-1"
                              data-invalid={!!errors.axes?.[axisIndex]?.label}
                            >
                              <FieldLabel htmlFor={`axis-${axis.id}`} required>
                                Tipo de opción
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Quitar tipo de opción ${axisIndex + 1}`}
                              onClick={() => axes.remove(axisIndex)}
                            >
                              <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                            </Button>
                          </div>
                          <AxisOptionsField
                            control={control}
                            axisIndex={axisIndex}
                            errors={errors}
                          />
                          <Field orientation="horizontal" className="justify-between">
                            <FieldLabel htmlFor={`axis-color-${axis.id}`} className="font-normal">
                              Es el color: cada opción lleva sus fotos
                            </FieldLabel>
                            <Controller
                              control={control}
                              name={`axes.${axisIndex}.isColor`}
                              render={({ field }) => (
                                <Switch
                                  id={`axis-color-${axis.id}`}
                                  checked={Boolean(field.value)}
                                  onCheckedChange={field.onChange}
                                />
                              )}
                            />
                          </Field>
                        </div>
                      ))
                    )}
                  </FormSection>

                  <FormSection
                    title="Ficha técnica"
                    description="Especificaciones que comparten todas las variantes."
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={specs.fields.length >= 30}
                        onClick={() => specs.append({ label: "", value: "" })}
                      >
                        <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                        Agregar especificación
                      </Button>
                    }
                  >
                    <FieldError errors={[errors.specs]} />
                    {specs.fields.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Sin especificaciones. Podés agregar datos como driver, conexión o material.
                      </p>
                    )}
                    {specs.fields.map((spec, index) => (
                      <div key={spec.id} className="flex items-start gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                          <Field data-invalid={!!errors.specs?.[index]?.label}>
                            <FieldLabel htmlFor={`spec-label-${spec.id}`}>Dato</FieldLabel>
                            <Input
                              id={`spec-label-${spec.id}`}
                              placeholder="Ej. Driver"
                              aria-invalid={!!errors.specs?.[index]?.label}
                              {...register(`specs.${index}.label`)}
                            />
                            <FieldError errors={[errors.specs?.[index]?.label]} />
                          </Field>
                          <Field data-invalid={!!errors.specs?.[index]?.value}>
                            <FieldLabel htmlFor={`spec-value-${spec.id}`}>Valor</FieldLabel>
                            <Input
                              id={`spec-value-${spec.id}`}
                              placeholder="Ej. 10 mm"
                              aria-invalid={!!errors.specs?.[index]?.value}
                              {...register(`specs.${index}.value`)}
                            />
                            <FieldError errors={[errors.specs?.[index]?.value]} />
                          </Field>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-7 shrink-0"
                          aria-label={`Quitar especificación ${index + 1}`}
                          onClick={() => specs.remove(index)}
                        >
                          <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </FormSection>

                  <FormSection
                    title="Notas internas"
                    description="Información privada para el equipo; no se publica."
                  >
                    <Field data-invalid={!!errors.internalNote}>
                      <FieldLabel htmlFor="template-note">Nota interna</FieldLabel>
                      <Textarea
                        id="template-note"
                        rows={3}
                        placeholder="Referencias o indicaciones para el equipo."
                        aria-invalid={!!errors.internalNote}
                        {...register("internalNote")}
                      />
                      <FieldError errors={[errors.internalNote]} />
                    </Field>
                  </FormSection>
                </div>
                <TemplatePreview control={control} categories={categories} />
              </div>
            </FormBody>

            <FormActions>
              <Button
                type="button"
                variant="cancel"
                disabled={isSubmitting}
                onClick={() => requestClose(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !!duplicate}>
                {isSubmitting ? "Guardando…" : template ? "Guardar cambios" : "Crear plantilla"}
              </Button>
            </FormActions>
          </FormLayout>
        </FormDialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => onOpenChange(false)}
      />
    </>
  );
}

// `options` tiene strings: se controla el array entero porque useFieldArray necesita objetos.
function AxisOptionsField({
  control,
  axisIndex,
  errors,
}: {
  control: Control<TemplateFormValues>;
  axisIndex: number;
  errors: FieldErrors<TemplateFormValues>;
}) {
  const raw = errors.axes?.[axisIndex]?.options as unknown as
    | (RhfFieldError & ArrayLike<RhfFieldError | undefined>)
    | undefined;
  const perOption: (RhfFieldError | undefined)[] = Array.isArray(raw) ? raw : [];
  const rootError = raw?.message ? { message: raw.message } : undefined;

  return (
    <Field data-invalid={!!raw}>
      <FieldLabel required>Valores disponibles</FieldLabel>
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
                    onChange={(e) =>
                      field.onChange(
                        options.map((o, i) => (i === optionIndex ? e.target.value : o)),
                      )
                    }
                    onBlur={field.onBlur}
                    placeholder="Opción"
                    aria-label={`Opción ${optionIndex + 1}`}
                    aria-required
                    aria-invalid={!!perOption[optionIndex]}
                    className="h-full w-32 rounded-xl bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <Button
                type="button"
                variant="outline"
                disabled={options.length >= 40}
                onClick={() => field.onChange([...options, ""])}
              >
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
                Agregar valor
              </Button>
            </div>
          );
        }}
      />
      <FieldError errors={[rootError, ...perOption]} />
    </Field>
  );
}
