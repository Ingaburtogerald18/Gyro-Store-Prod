import {
  FormLayout,
  FormDialogContent,
  FormActions,
  FormBody,
  FormSection,
} from '~/components/ui/form-layout';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
// Editor de producto: la columna ancha define el producto (nombre, fotos,
// variantes) y la angosta lo clasifica y publica.
//
// El molde es compartido, así que este editor no lo modifica, y las variantes
// se vinculan a lotes de bodega (`purchases.code`).
import { HugeIcon } from '~/components/ui/icon';
import { Tick01Icon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { processPendingUploads } from '~/lib/uploadQueue';

import {
  adminProductInputSchema,
  type AdminProduct,
  type AdminProductInput,
  type Category,
  type TemplateAxis,
  type VariantMappings,
} from '@shared/schemas';
import { Button } from '~/components/ui/button';
// Drawer, no modal. El nombre del archivo se conserva para no romper imports;
// lo que cambió es el contenedor. Un formulario de este largo dentro de un
// modal de 5xl tapa el catálogo que se está editando — y editar un producto es
// justo cuando conviene seguir viendo los demás.
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import {
  useGetInventoryLotsQuery,
  useGetTemplatesQuery,
  type InventoryLot,
} from '~/store/api/catalogAdminApi';
import { ImageUploader } from './ImageUploader';
import { ToneDot } from './ToneDot';
import { buildCombinations, VariantMappingTable } from './VariantMappingTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { cn } from '~/lib/utils';
import { formatCordobas } from '~/lib/formatters';

/**
 * Primer mensaje de error del árbol de `formState.errors`.
 *
 * Los errores de react-hook-form son un objeto ANIDADO que espeja la forma del
 * formulario: un fallo en `variantMappings["Negro / 128GB"].codes` queda a tres
 * niveles de profundidad. Recorrerlo es la única forma de encontrar el mensaje
 * sin saber de antemano qué campo falló.
 */
function firstErrorMessage(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;

  // Hoja: un `FieldError` de RHF trae `message` (y `type`).
  const message = (node as { message?: unknown }).message;
  if (typeof message === 'string' && message) return message;

  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = firstErrorMessage(value);
    if (found) return found;
  }
  return null;
}

const EMPTY: AdminProductInput = {
  name: '',
  description: '',
  price: 0,
  basePrice: 0,
  images: [],
  colorImages: {},
  specs: [],
  categoryId: null,
  published: false,
  isPromo: false,
  sortOrder: 0,
  spoLink: '',
  templateId: null,
  axisOptions: {},
  variantMappings: {},
};

export function ProductEditorDialog({
  open,
  onOpenChange,
  product,
  categories,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  product: AdminProduct | null;
  categories: Category[];
  isSaving: boolean;
  onSave: (input: AdminProductInput) => Promise<void>;
}) {
  const { data: templates = [] } = useGetTemplatesQuery(undefined, { skip: !open });
  const { data: lots = [], isLoading: loadingLots } = useGetInventoryLotsQuery(product?.id, { skip: !open });

  // La regla de la oferta no vive en el backend, pero tampoco se inventa acá:
  // es la que ya tenía este editor, movida del `handleSubmit` al schema para que
  // salga como error DEL CAMPO `price` en vez de un toast. El resto del contrato
  // es `adminProductInputSchema` tal cual.
  const formSchema = useMemo(
    () =>
      adminProductInputSchema.superRefine((values, ctx) => {
        if (!values.isPromo) return;
        if (!values.price || values.price <= 0) {
          ctx.addIssue({ code: 'custom', path: ['price'], message: 'Ingresá un precio de oferta válido.' });
          return;
        }

        const tpl = templates.find((t) => t.id === values.templateId);
        if (!tpl || !(tpl.axes?.length > 0)) return;

        // El precio de venta vive en cada variante: la oferta del producto solo
        // tiene sentido si queda por debajo de todas las vinculadas.
        const axes = tpl.axes.map((axis) => ({
          ...axis,
          options: values.axisOptions?.[axis.key] ?? axis.options ?? [],
        }));
        const mapped = buildCombinations(axes)
          .map((combo) => values.variantMappings?.[combo])
          .filter((m): m is NonNullable<typeof m> => Boolean(m?.codes.length));

        if (mapped.length === 0) return;
        if (mapped.some((m) => !m.price || m.price <= 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['price'],
            message: 'Todas las variantes vinculadas necesitan precio propio para validar la oferta.',
          });
          return;
        }

        const minVariantPrice = Math.min(...mapped.map((m) => m.price as number));
        if (values.price >= minVariantPrice) {
          ctx.addIssue({
            code: 'custom',
            path: ['price'],
            message: `El precio de oferta (${formatCordobas(values.price)}) debe ser menor al de las variantes (mínimo ${formatCordobas(minVariantPrice)}).`,
          });
        }
      }),
    [templates],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });

  const form = watch();
  const template = templates.find((t) => t.id === form.templateId) ?? null;

  // Candado anti doble-envío. Subir las fotos a R2 tarda, y `isSaving` (la
  // mutación de RTK) recién se pone en true DESPUÉS de esa subida: hasta entonces
  // el botón seguía activo. Sin este candado, cada clic extra durante la espera
  // lanzaba otro guardado completo y el producto se creaba varias veces (pasó: 4
  // clics = 4 productos). El ref bloquea de forma síncrona (una ráfaga de clics
  // no espera al re-render); el state solo maneja el spinner/disabled.
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Prefill al abrir. Se depende de `product` y no de `open` a secas para que
  // reabrir el mismo producto tras cancelar no arrastre lo que se había tipeado.
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset(
      product
        ? {
            name: product.name,
            description: product.description,
            price: product.price,
            basePrice: product.basePrice ?? 0,
            images: product.images,
            specs: product.specs,
            categoryId: product.categoryId,
            published: product.published,
            isPromo: product.isPromo,
            sortOrder: product.sortOrder,
            spoLink: product.spoLink ?? '',
            templateId: product.templateId,
            axisOptions: product.axisOptions,
            variantMappings: product.variantMappings,
            colorImages: product.colorImages ?? {},
          }
        : EMPTY,
    );
  }, [open, product, reset]);

  // Ejes con las opciones recortadas a lo que ESTE producto ofrece. Todo lo que
  // se genera abajo (combinaciones, tabla de mapeo) sale de acá, no del molde
  // completo: una opción apagada no existe para el cliente.
  const effectiveAxes: TemplateAxis[] = useMemo(() => {
    if (!template || !template.axes) return [];
    return template.axes.map((axis) => ({
      ...axis,
      options: form.axisOptions?.[axis.key] ?? axis.options ?? [],
    }));
  }, [template, form.axisOptions]);

  const colorAxis = useMemo(() => template?.axes?.find((a) => a.isColor), [template]);
  const activeColorOptions = useMemo(() => {
    if (!colorAxis) return [];
    return form.axisOptions?.[colorAxis.key] ?? colorAxis.options ?? [];
  }, [colorAxis, form.axisOptions]);
  const [activeColorTab, setActiveColorTab] = useState('');

  useEffect(() => {
    if (activeColorOptions.length > 0 && !activeColorOptions.includes(activeColorTab)) {
      setActiveColorTab(activeColorOptions[0]);
    }
  }, [activeColorOptions, activeColorTab]);

  // Cuando se activa el modo por-color y hay fotos en `images` pero no en
  // `colorImages`, migrarlas al primer color para no perderlas.
  useEffect(() => {
    if (activeColorOptions.length === 0) return;
    const currentImages = getValues('images') ?? [];
    const currentColorImages = getValues('colorImages') ?? {};
    const hasAnyColorImages = Object.values(currentColorImages).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    );
    if (currentImages.length > 0 && !hasAnyColorImages) {
      setValue('colorImages', {
        ...currentColorImages,
        [activeColorOptions[0]]: currentImages,
      });
    }
  }, [activeColorOptions, getValues, setValue]);

  const filteredTemplates = useMemo(() => {
    if (!form.categoryId) return templates;
    // Mostrar solo las plantillas que pertenecen a la categoría elegida
    return templates.filter((t) => t.categoryId === form.categoryId);
  }, [templates, form.categoryId]);

  const combos = useMemo(() => buildCombinations(effectiveAxes), [effectiveAxes]);
  const mappedCount = combos.filter((c) => form.variantMappings?.[c]?.codes.length).length;

  // Al elegir molde: cada eje arranca con TODAS sus opciones activas, pero se
  // conserva lo que ya estaba elegido y se descartan opciones que el molde ya
  // no tiene (pasa si alguien editó la plantilla después).
  useEffect(() => {
    if (!template) return;
    const prev = getValues();
    const next: Record<string, string[]> = {};
    for (const axis of template.axes || []) {
      const previous = prev.axisOptions?.[axis.key];
      next[axis.key] = previous ? (axis.options || []).filter((o) => previous.includes(o)) : (axis.options || []);
    }
    setValue('axisOptions', next);
    // Nombre y descripción del molde son el punto de partida del producto
    // (mismo gesto que v1). Solo prellenan si están vacíos: nunca pisan.
    if (!prev.name?.trim()) setValue('name', template.name);
    if (!prev.description?.trim()) setValue('description', template.description);
  }, [template, getValues, setValue]);

  function toggleAxisOption(axis: TemplateAxis, option: string) {
    const current = form.axisOptions?.[axis.key] ?? axis.options;
    // El último encendido no se puede apagar: en vez de dejar intentarlo y
    // responder con un toast, la casilla se deshabilita (ver `OptionToggle`).
    if (current.includes(option) && current.length <= 1) return;

    const nextSet = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setValue('axisOptions', {
      ...form.axisOptions,
      // Se reordena según el molde: el orden define el nombre de la
      // combinación, que es la llave del mapeo.
      [axis.key]: axis.options.filter((o) => nextSet.includes(o)),
    });
  }

  /**
   * Qué hacer cuando la validación RECHAZA el formulario.
   *
   * Sin esto, `handleSubmit` simplemente no llamaba a `onSubmit` y el botón
   * «Crear producto» no hacía absolutamente nada: ni toast, ni error visible, ni
   * pista. Los errores sí quedaban en `formState.errors`, pero este diálogo tiene
   * secciones plegables y campos que solo se renderizan según el estado (el
   * precio de oferta, por ejemplo, aparece únicamente con `isPromo` activo), así
   * que un error en un campo no renderizado era literalmente invisible.
   *
   * `shouldFocusError` de react-hook-form tampoco ayuda ahí: solo puede enfocar
   * un input que exista en el DOM.
   */
  function onInvalid(formErrors: typeof errors) {
    const first = firstErrorMessage(formErrors);
    setFormError(first ?? 'Revisá los campos marcados en rojo.');
  }

  // Se llama desde el `onClick` del botón Y desde el `onSubmit` del form (para
  // el Enter). `preventDefault` acá porque cuando entra por el form hay evento
  // que frenar, y cuando entra por el botón no hay ninguno.
  const submitForm = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (submittingRef.current) return;
    setFormError(null);
    void handleSubmit(onSubmit, onInvalid)();
  };

  async function onSubmit(values: AdminProductInput) {
    // Segundo cerrojo (además del de `submitForm`): bloquea envíos que ya pasaron
    // la validación mientras uno está en curso.
    if (submittingRef.current) return;

    // Aviso no bloqueante: una variante sin lote se muestra «Agotado». Va en un
    // toast porque el navegador suprime los `window.confirm` repetidos.
    const unmapped = combos.length - mappedCount;
    if (unmapped > 0) {
      toast.warning(
        `${unmapped} de ${combos.length} variantes quedan sin lote: se mostrarán como «Agotado» hasta que les asignes bodega.`,
      );
    }

    // Si hay colores, pero el usuario no subió "fotos generales" porque la caja está oculta,
    // tomamos la primera foto del primer color para que sirva de portada en el catálogo.
    if (values.images.length === 0 && activeColorOptions.length > 0) {
      for (const color of activeColorOptions) {
        if (values.colorImages?.[color]?.length) {
          values.images = [values.colorImages[color][0]];
          break;
        }
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const processedValues = await processPendingUploads(values, 'catalog');
      await onSave(processedValues);
    } catch (err) {
      setFormError(serverErrorMessage(err, 'No se pudo guardar el producto o subir sus fotos. Probá de nuevo.'));
    } finally {
      // Se libera SIEMPRE: si el guardado falla, el usuario tiene que poder
      // reintentar sin cerrar y reabrir el diálogo.
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* El cuerpo scrollea solo y el pie con «Guardar» queda siempre a la vista. */}
      <FormDialogContent size="long">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {product ? 'Editar producto' : 'Crear producto'}
          </DialogTitle>
          <DialogDescription>
            El precio de venta se define en cada variante, junto con el lote de bodega que la surte.
          </DialogDescription>
        </DialogHeader>

        {/* El form se conserva para que Enter en un campo también envíe. */}
        <FormLayout onSubmit={submitForm}>
          <FormErrorBanner message={formError} />
          <FormBody>
            <div className="space-y-5">
              <FormSection
                title="1. Organización"
                description="Elegí la plantilla primero para que el producto se autocomplete."
              >
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field data-invalid={!!errors.categoryId}>
                    <FieldLabel htmlFor="product-category">Categoría</FieldLabel>
                    <Controller
                      control={control}
                      name="categoryId"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? 'none'}
                          onValueChange={(v) => {
                            const newCat = v === 'none' ? null : v;
                            field.onChange(newCat);
                            const currentTemplateId = getValues('templateId');
                            if (newCat && currentTemplateId) {
                              const current = templates.find((t) => t.id === currentTemplateId);
                              if (current && current.categoryId !== newCat) {
                                setValue('templateId', null);
                              }
                            }
                          }}
                        >
                          <SelectTrigger id="product-category" className="w-full">
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

                  <Field data-invalid={!!errors.templateId}>
                    <FieldLabel htmlFor="product-template">Plantilla</FieldLabel>
                    <Controller
                      control={control}
                      name="templateId"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? 'none'}
                          onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                        >
                          <SelectTrigger id="product-template" className="w-full">
                            <SelectValue placeholder="Sin plantilla" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <ToneDot />
                              Sin plantilla (producto simple)
                            </SelectItem>
                            {filteredTemplates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                <ToneDot toneKey={t.categoryId} />
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldDescription>
                      {form.categoryId
                        ? 'Define las variantes (ej. colores).'
                        : 'Define las variantes del producto.'}
                    </FieldDescription>
                    <FieldError errors={[errors.templateId]} />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="2. Información General">
                <div className="space-y-6">
                  <Field data-invalid={!!errors.name}>
                    <FieldLabel htmlFor="product-name" required>
                      Nombre del producto
                    </FieldLabel>
                    <Input
                      id="product-name"
                      placeholder="KZ ZSN Pro X"
                      className="h-11 text-base font-medium"
                      aria-required
                      aria-invalid={!!errors.name}
                      {...register('name')}
                    />
                    <FieldError errors={[errors.name]} />
                  </Field>

                  <Field data-invalid={!!errors.description}>
                    <FieldLabel htmlFor="product-description">Descripción</FieldLabel>
                    <Textarea
                      id="product-description"
                      rows={5}
                      placeholder="Lo que el cliente lee en la ficha del producto…"
                      aria-invalid={!!errors.description}
                      {...register('description')}
                    />
                    <FieldError errors={[errors.description]} />
                  </Field>

                  <Field data-invalid={!!errors.spoLink}>
                    <FieldLabel htmlFor="product-spo-link">Link de SharePoint</FieldLabel>
                    <Input
                      id="product-spo-link"
                      type="url"
                      placeholder="https://…"
                      aria-invalid={!!errors.spoLink}
                      {...register('spoLink')}
                    />
                    <FieldDescription>
                      Biblioteca con fotos y videos del artículo. Solo la ve el staff.
                    </FieldDescription>
                    <FieldError errors={[errors.spoLink]} />
                  </Field>
                </div>
              </FormSection>

              {template && (template.axes?.length ?? 0) > 0 && (
                <FormSection
                  title="3. Opciones que ofrece"
                  description="Lo apagado no existe para el cliente."
                >
                  <div className="space-y-4">
                    {template.axes.map((axis) => {
                      const included = form.axisOptions?.[axis.key] ?? axis.options ?? [];
                      return (
                        <div key={axis.key}>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            {axis.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(axis.options ?? []).map((option) => {
                              const checked = included.includes(option);
                              return (
                                <OptionToggle
                                  key={option}
                                  label={option}
                                  checked={checked}
                                  disabled={checked && included.length <= 1}
                                  onToggle={() => toggleAxisOption(axis, option)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </FormSection>
              )}

              <FormSection
                title="4. Variantes y bodega"
                description="El precio va acá. El stock se lee de los lotes vinculados, en vivo."
                action={
                  template && combos.length > 0 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {mappedCount}/{combos.length} vinculadas
                    </span>
                  ) : null
                }
              >
                {template ? (
                  <Controller
                    control={control}
                    name="variantMappings"
                    render={({ field }) => (
                      <VariantMappingTable
                        axes={effectiveAxes}
                        variantMappings={field.value ?? {}}
                        onChange={(variantMappings: VariantMappings) =>
                          field.onChange(variantMappings)
                        }
                        lots={lots as InventoryLot[]}
                        basePrice={form.price}
                        isLoading={loadingLots}
                      />
                    )}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Elegí una plantilla en «Organización» para generar las variantes.
                  </p>
                )}
              </FormSection>

              <FormSection
                title={activeColorOptions.length > 0 ? '5. Fotos por Variante (Color)' : '5. Fotos'}
                description={
                  activeColorOptions.length > 0
                    ? 'Seleccioná un color y subí sus fotos. La primera de cada color es la portada.'
                    : 'La primera es la portada. Tamaño recomendado: 1080x1080px. Puedes arrastrarlas para reordenar.'
                }
              >
                {activeColorOptions.length > 0 ? (
                  <Tabs value={activeColorTab} onValueChange={setActiveColorTab}>
                    <TabsList className="mb-4 flex-wrap">
                      {activeColorOptions.map((color) => {
                        const count = (form.colorImages?.[color] ?? []).length;
                        return (
                          <TabsTrigger key={color} value={color} className="gap-1.5 px-3">
                            <ToneDot toneKey={color} />
                            {color}
                            {count > 0 && (
                              <span className="ml-1 rounded-full bg-primary-2/20 px-1.5 text-2xs font-bold text-primary-2">
                                {count}
                              </span>
                            )}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                    {activeColorOptions.map((color) => (
                      <TabsContent key={color} value={color}>
                        <Controller
                          control={control}
                          name={`colorImages.${color}`}
                          defaultValue={[]}
                          render={({ field }) => (
                            <ImageUploader
                              images={field.value ?? []}
                              onChange={field.onChange}
                              disabled={isSaving}
                            />
                          )}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <>
                    <Controller
                      control={control}
                      name="images"
                      render={({ field }) => (
                        <ImageUploader
                          images={field.value ?? []}
                          onChange={field.onChange}
                          disabled={isSaving}
                        />
                      )}
                    />
                    <FieldError errors={[errors.images]} />
                  </>
                )}
              </FormSection>

              <FormSection
                title="6. Estado y Publicación"
                description="Configura la visibilidad del producto en la tienda."
              >
                <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-5">
                  <Controller
                    control={control}
                    name="published"
                    render={({ field }) => (
                      <ToggleRow
                        id="product-published"
                        label="Publicado"
                        hint="Visible en la tienda"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />

                  <Controller
                    control={control}
                    name="isPromo"
                    render={({ field }) => (
                      <ToggleRow
                        id="product-promo"
                        label="En oferta"
                        hint="Se destaca en el inicio"
                        checked={field.value}
                        onCheckedChange={(c) => {
                          field.onChange(c);
                          if (!c) setValue('price', 0);
                        }}
                      />
                    )}
                  />

                  {form.isPromo && (
                    <Field className="border-t pt-4 mt-2" data-invalid={!!errors.price}>
                      <FieldLabel htmlFor="product-offer-price" required>
                        Precio de oferta (C$)
                      </FieldLabel>
                      <Controller
                        control={control}
                        name="price"
                        render={({ field }) => (
                          <Input
                            id="product-offer-price"
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
                      <FieldDescription>Debe ser menor al precio de las variantes.</FieldDescription>
                      <FieldError errors={[errors.price]} />
                    </Field>
                  )}
                </div>
              </FormSection>
            </div>
          </FormBody>

          <FormActions>
            <Button type="button" variant="cancel" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {/* `onClick` directo y NO `type="submit"`: el envío nativo del form
                    dentro del diálogo de Radix no llegaba a dispararse (clic sin
                    efecto, sin error ni petición). `handleSubmit(...)` devuelve una
                    función que se puede llamar a mano, así que no dependemos del
                    evento submit. Es el mismo patrón que ya usa UserDetailDialog. */}
            <Button type="button" onClick={submitForm} disabled={isSaving || isSubmitting}>
              {(isSaving || isSubmitting) && <Spinner className="mr-2" />}
              {isSaving || isSubmitting
                ? 'Guardando…'
                : product
                ? 'Guardar cambios'
                : 'Crear producto'}
            </Button>
          </FormActions>
        </FormLayout>
      </FormDialogContent>
    </Dialog>
  );
}

// Opción que el producto ofrece o no: `role="checkbox"` porque son selecciones
// independientes. El estado lo marca la casilla; el texto va a contraste pleno.
function OptionToggle({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={disabled ? 'Cada eje debe ofrecer al menos una opción.' : undefined}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-2 text-xs transition-colors',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none',
        'motion-reduce:transition-none',
        'disabled:cursor-not-allowed',
        checked
          ? 'border-primary/40 bg-primary/5 text-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-sm border transition-colors',
          'motion-reduce:transition-none',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-input/60',
        )}
      >
        {checked && <HugeIcon icon={Tick01Icon} size={12} strokeWidth={2.5} />}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}


function ToggleRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-medium">
          {label}
        </FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  );
}
