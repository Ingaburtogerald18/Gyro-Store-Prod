// Editor de combo del panel. Un combo es un PAQUETE con precio propio (plano) y
// una lista de artículos del catálogo que lo componen (solo informativo: el
// precio no se calcula de ahí). Espeja el patrón de ProductEditorDialog pero
// más simple: no tiene plantillas ni variantes.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  adminComboInputSchema,
  type AdminCombo,
  type AdminComboInput,
  type AdminProduct,
} from '@shared/schemas';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { ImageUploader } from './ImageUploader';

const EMPTY: AdminComboInput = {
  name: '',
  price: 0,
  images: [],
  items: [],
  published: false,
  sortOrder: 0,
};

export function ComboEditorDialog({
  open,
  onOpenChange,
  combo,
  products,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  combo: AdminCombo | null;
  products: AdminProduct[];
  isSaving: boolean;
  onSave: (input: AdminComboInput) => Promise<void>;
}) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AdminComboInput>({
    resolver: zodResolver(adminComboInputSchema),
    defaultValues: EMPTY,
  });
  const items = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (!open) return;
    reset(
      combo
        ? {
            name: combo.name,
            price: combo.price,
            images: combo.images,
            items: combo.items,
            published: combo.published,
            sortOrder: combo.sortOrder,
          }
        : EMPTY,
    );
  }, [open, combo, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-14">
          <DialogTitle className="text-lg">{combo ? 'Editar combo' : 'Nuevo combo'}</DialogTitle>
          <DialogDescription>
            El precio es el del paquete. Los artículos son el contenido que se muestra en la ficha.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            await onSave(values);
          })}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="combo-name" required>
                Nombre del combo
              </FieldLabel>
              <Input
                id="combo-name"
                placeholder="Combo Gamer"
                aria-required
                aria-invalid={!!errors.name}
                {...register('name')}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.price}>
                <FieldLabel htmlFor="combo-price" required>
                  Precio del paquete (C$)
                </FieldLabel>
                <Controller
                  control={control}
                  name="price"
                  render={({ field }) => (
                    <Input
                      id="combo-price"
                      type="number"
                      min="0"
                      step="0.01"
                      aria-required
                      aria-invalid={!!errors.price}
                      value={field.value || ''}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  )}
                />
                <FieldError errors={[errors.price]} />
              </Field>

              <Field orientation="horizontal" className="items-center">
                <FieldContent>
                  <FieldLabel htmlFor="combo-published" className="font-medium">
                    Publicado
                  </FieldLabel>
                  <FieldDescription>Visible en la tienda</FieldDescription>
                </FieldContent>
                <Controller
                  control={control}
                  name="published"
                  render={({ field }) => (
                    <Switch id="combo-published" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Fotos</p>
              <Controller
                control={control}
                name="images"
                render={({ field }) => (
                  <ImageUploader images={field.value ?? []} onChange={field.onChange} disabled={isSaving} />
                )}
              />
              <FieldError errors={[errors.images]} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Artículos incluidos</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Los productos que trae el combo. El precio del paquete lo ponés vos arriba.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => items.append({ catalogItemId: '', name: '', quantity: 1 })}
                >
                  <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} className="mr-1.5" />
                  Agregar
                </Button>
              </div>

              {items.fields.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Sin artículos. Agregá los productos que trae el combo.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.fields.map((row, i) => (
                    <div key={row.id} className="flex items-end gap-2">
                      {/* `name` es un snapshot: se guarda oculto y se completa al
                          elegir el producto, para mostrar el contenido sin re-pedir
                          el catálogo. */}
                      <input type="hidden" {...register(`items.${i}.name`)} />
                      <Field className="flex-1" data-invalid={!!errors.items?.[i]?.catalogItemId}>
                        <FieldLabel className="text-xs">Producto</FieldLabel>
                        <Controller
                          control={control}
                          name={`items.${i}.catalogItemId`}
                          render={({ field }) => (
                            <Select
                              value={field.value || ''}
                              onValueChange={(v) => {
                                field.onChange(v);
                                setValue(`items.${i}.name`, products.find((p) => p.id === v)?.name ?? '');
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Elegí un producto" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <FieldError errors={[errors.items?.[i]?.catalogItemId]} />
                      </Field>
                      <Field className="w-24" data-invalid={!!errors.items?.[i]?.quantity}>
                        <FieldLabel className="text-xs">Cantidad</FieldLabel>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          aria-invalid={!!errors.items?.[i]?.quantity}
                          {...register(`items.${i}.quantity`, { valueAsNumber: true })}
                        />
                        <FieldError errors={[errors.items?.[i]?.quantity]} />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        aria-label="Quitar artículo"
                        onClick={() => items.remove(i)}
                      >
                        <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <FieldError errors={[errors.items]} />
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="cancel" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Spinner className="mr-2" />}
              {combo ? 'Guardar cambios' : 'Crear combo'}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
