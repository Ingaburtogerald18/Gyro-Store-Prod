// Plantillas: el molde reutilizable de una familia de productos. Define los
// ejes de variante (Color, Conector, Capacidad…) y las specs técnicas base.
//
// No tiene precio, imágenes ni stock: eso vive en cada producto que la usa. Un
// molde lo comparten varios productos, así que editarle los ejes cambia las
// combinaciones de todos — por eso el borrado se bloquea si está en uso.
import { HugeIcon } from '~/components/ui/icon';
import {
  Add01Icon,
  Cancel01Icon,
  DashboardSquare01Icon,
  Delete02Icon,
  Edit02Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type FieldError as RhfFieldError,
  type FieldErrors,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { templateInputSchema, type AdminTemplate, type Category, type TemplateInput } from '@shared/schemas';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useGetTemplatesQuery,
  useUpdateTemplateMutation,
} from '~/store/api/catalogAdminApi';
import { cn } from '~/lib/utils';
import { ToneDot } from './ToneDot';

export function TemplatesPanel({ categories }: { categories: Category[] }) {
  const { data: templates = [], isLoading } = useGetTemplatesQuery();
  const [deleteTemplate] = useDeleteTemplateMutation();

  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<AdminTemplate | null>(null);

  async function handleDelete(template: AdminTemplate) {
    setTemplateToDelete(template);
  }

  async function confirmDeleteTemplate() {
    if (!templateToDelete) return;
    try {
      await deleteTemplate(templateToDelete.id).unwrap();
      toast.success('Plantilla eliminada.');
      setTemplateToDelete(null);
    } catch (err) {
      // El backend responde 409 con el número de productos que la usan: ese
      // mensaje es más útil que un "no se pudo" genérico.
      const message = (err as { data?: { error?: string } })?.data?.error;
      toast.error(message ?? 'No se pudo eliminar la plantilla.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setIsOpen(true);
          }}
        >
          <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-2" />
          Nueva plantilla
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HugeIcon
              icon={DashboardSquare01Icon}
              size={48}
              strokeWidth={2}
              className="mb-4 text-muted-foreground"
            />
            <h3 className="text-lg font-medium text-foreground">Sin plantillas</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Una plantilla define los ejes de variante (Color, Capacidad…) que después reutilizan
              los productos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate font-medium text-foreground">{template.name}</h4>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ToneDot toneKey={template.categoryId} />
                      {categories.find((c) => c.id === template.categoryId)?.name ?? 'Sin categoría'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Editar plantilla"
                      onClick={() => {
                        setEditing(template);
                        setIsOpen(true);
                      }}
                    >
                      <HugeIcon icon={Edit02Icon} size={15} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Eliminar plantilla"
                      className="hover:bg-destructive/20 hover:text-destructive"
                      onClick={() => handleDelete(template)}
                    >
                      <HugeIcon icon={Delete02Icon} size={15} strokeWidth={2} />
                    </Button>
                  </div>
                </div>

                {template.axes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin ejes — producto simple.</p>
                ) : (
                  <div className="space-y-1.5">
                    {template.axes.map((axis) => (
                      <div key={axis.key} className="flex flex-wrap items-center gap-1">
                        <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                          {axis.label}:
                        </span>
                        {axis.options.slice(0, 4).map((option) => (
                          <Badge key={option} variant="category" className="text-2xs">
                            {option}
                          </Badge>
                        ))}
                        {axis.options.length > 4 && (
                          <span className="text-2xs text-muted-foreground">
                            +{axis.options.length - 4}
                          </span>
                        )}
                      </div>
                    ))}
                    <p className="pt-1 text-2xs text-muted-foreground">
                      {template.axes.reduce((total, a) => total * a.options.length, 1)} combinaciones
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateEditorDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        template={editing}
        categories={categories}
      />

      <ConfirmDialog
        open={!!templateToDelete}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
        title="Eliminar plantilla"
        description={`¿Seguro que deseas eliminar la plantilla "${templateToDelete?.name}"? Esta acción no se puede deshacer.`}
        onConfirm={confirmDeleteTemplate}
      />
    </div>
  );
}

const EMPTY: TemplateInput = { name: '', description: '', categoryId: null, axes: [], specs: [] };

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AdminTemplate | null;
  categories: Category[];
}) {
  const [createTemplate, { isLoading: creating }] = useCreateTemplateMutation();
  const [updateTemplate, { isLoading: updating }] = useUpdateTemplateMutation();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TemplateInput>({
    resolver: zodResolver(templateInputSchema),
    defaultValues: EMPTY,
  });

  const axes = useFieldArray({ control, name: 'axes' });
  const specs = useFieldArray({ control, name: 'specs' });

  useEffect(() => {
    if (!open) return;
    reset(
      template
        ? {
            name: template.name,
            description: template.description,
            categoryId: template.categoryId,
            axes: template.axes,
            specs: template.specs,
          }
        : EMPTY,
    );
  }, [open, template, reset]);

  // Los ejes incompletos ya no se avisan por toast: `templateAxisSchema` exige
  // label y al menos una opción no vacía, así que el error sale en el campo que
  // lo causa. El toast queda para el resultado de la operación.
  async function onSubmit(values: TemplateInput) {
    try {
      if (template) {
        await updateTemplate({ id: template.id, data: values }).unwrap();
        toast.success('Plantilla actualizada.');
      } else {
        await createTemplate(values).unwrap();
        toast.success('Plantilla creada.');
      }
      onOpenChange(false);
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error;
      toast.error(message ?? 'No se pudo guardar la plantilla.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {template ? 'Editar plantilla' : 'Nueva plantilla'}
          </DialogTitle>
          <DialogDescription>
            Los ejes generan las variantes de cada producto que use esta plantilla.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="template-name" required>
                Nombre
              </FieldLabel>
              <Input
                id="template-name"
                placeholder="Ej. Audífonos KZ"
                aria-required
                aria-invalid={!!errors.name}
                {...register('name')}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="template-category">Categoría</FieldLabel>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? 'none'}
                    onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                  >
                    <SelectTrigger id="template-category">
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <ToneDot />
                        Sin categoría
                      </SelectItem>
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
            <FieldLabel htmlFor="template-description">Nota interna</FieldLabel>
            <Textarea
              id="template-description"
              rows={2}
              placeholder="Para qué sirve esta plantilla…"
              aria-invalid={!!errors.description}
              {...register('description')}
            />
            <FieldDescription>Solo la ve el equipo; no sale al catálogo público.</FieldDescription>
            <FieldError errors={[errors.description]} />
          </Field>

          {/* ── Ejes ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Ejes de variante</h3>
                <p className="text-xs text-muted-foreground">Ej. Color, Conector, Capacidad.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  // `key` se genera acá y no se vuelve a tocar: es la llave con
                  // la que cada producto guarda su recorte de opciones.
                  axes.append({ key: `eje_${Date.now()}`, label: '', options: [''], isColor: false })
                }
              >
                <HugeIcon icon={Add01Icon} size={14} strokeWidth={2} className="mr-1" />
                Eje
              </Button>
            </div>

            {/* Error del array entero (ej. "Máximo 6 ejes"): RHF lo deja en la
                propia entrada, no en un `.root`. */}
            <FieldError errors={[errors.axes]} />

            {axes.fields.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sin ejes: los productos con esta plantilla no tendrán variantes.
              </p>
            ) : (
              axes.fields.map((axis, axisIndex) => (
                <div key={axis.id} className="space-y-3 rounded-2xl border bg-card p-4">
                  <div className="flex items-end gap-2">
                    <Field className="flex-1" data-invalid={!!errors.axes?.[axisIndex]?.label}>
                      <FieldLabel htmlFor={`axis-${axis.id}`} required>
                        Etiqueta visible
                      </FieldLabel>
                      <Input
                        id={`axis-${axis.id}`}
                        placeholder="Ej. Tipo de conector"
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
                      aria-label="Eliminar eje"
                      className="hover:bg-destructive/20 hover:text-destructive"
                      onClick={() => axes.remove(axisIndex)}
                    >
                      <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                    </Button>
                  </div>

                  <Field orientation="horizontal" className="justify-between rounded-xl bg-muted px-3 py-2">
                    <FieldLabel htmlFor={`axis-color-${axis.id}`} className="text-xs font-normal">
                      Es el eje de color (se representa con fotos)
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

                  <AxisOptionsField control={control} axisIndex={axisIndex} errors={errors} />
                </div>
              ))
            )}
          </div>

          {/* ── Specs base ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Specs técnicas base</h3>
                <p className="text-xs text-muted-foreground">
                  Las heredan todos los productos con esta plantilla.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => specs.append({ label: '', value: '' })}
              >
                <HugeIcon icon={Add01Icon} size={14} strokeWidth={2} className="mr-1" />
                Spec
              </Button>
            </div>

            <FieldError errors={[errors.specs]} />

            {specs.fields.map((spec, index) => (
              <div key={spec.id} className="flex items-center gap-2">
                <Input
                  placeholder="Ej. Frecuencia"
                  className="w-1/3"
                  aria-label="Etiqueta de la spec"
                  {...register(`specs.${index}.label`)}
                />
                <Input
                  placeholder="Ej. 20Hz - 40kHz"
                  className="flex-1"
                  aria-label="Valor de la spec"
                  {...register(`specs.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar spec"
                  className="hover:bg-destructive/20 hover:text-destructive"
                  onClick={() => specs.remove(index)}
                >
                  <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="cancel" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating || updating}>
              {(creating || updating) && <Spinner className="mr-2" />}
              {template ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// `options` es un array de strings PLANOS. `useFieldArray` no sirve acá (necesita
// un objeto por ítem para generar su `id`), así que el array entero es un solo
// campo controlado. Los errores vienen en dos niveles: el del array
// ("Cada eje necesita al menos una opción") y el de cada opción vacía.
function AxisOptionsField({
  control,
  axisIndex,
  errors,
}: {
  control: Control<TemplateInput>;
  axisIndex: number;
  errors: FieldErrors<TemplateInput>;
}) {
  // RHF tipa el error de un array de primitivas como `Merge<FieldError, (FieldError|undefined)[]>`:
  // es un array que además lleva `message` propio. Se leen los dos lados.
  const raw = errors.axes?.[axisIndex]?.options as unknown as
    | (RhfFieldError & ArrayLike<RhfFieldError | undefined>)
    | undefined;
  const perOption: (RhfFieldError | undefined)[] = Array.isArray(raw) ? raw : [];
  const rootError = raw?.message ? { message: raw.message } : undefined;

  return (
    <Field data-invalid={!!raw}>
      <FieldLabel
        className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
        required
      >
        Opciones
      </FieldLabel>
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
                    'flex items-center gap-1 rounded-xl border bg-background pr-1',
                    perOption[optionIndex] && 'border-destructive',
                  )}
                >
                  {/* Input pelado a propósito: el chip ya es el contenedor con
                      apariencia; una primitiva Input acá lo rompería. */}
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
                    aria-invalid={!!perOption[optionIndex]}
                    className="w-28 bg-transparent px-2.5 py-1.5 text-xs outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Quitar opción"
                    onClick={() => field.onChange(options.filter((_, i) => i !== optionIndex))}
                  >
                    <HugeIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => field.onChange([...options, ''])}
              >
                <HugeIcon icon={Add01Icon} size={12} strokeWidth={2} className="mr-1" />
                Añadir
              </Button>
            </div>
          );
        }}
      />
      <FieldError errors={[rootError, ...perOption]} />
    </Field>
  );
}
