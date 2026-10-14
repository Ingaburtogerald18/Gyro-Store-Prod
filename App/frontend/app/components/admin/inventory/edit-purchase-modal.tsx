import { FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import {
  FormLayout,
  FormDialogContent,
  FormActions,
  FormBody,
  FormSection,
} from "~/components/ui/form-layout";
// Modal para editar los datos base de una compra en tránsito (China).
import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import {
  purchaseFormSchema,
  type PurchaseFormInput,
  type PurchaseFormValues,
} from "~/lib/validators";
import { useUpdatePurchaseMutation, type Purchase } from "~/state/api/inventory-api";
import { useGetCategoriesQuery, useGetTemplatesQuery } from "~/state/api/catalog-admin-api";
import {
  EMPTY_TEMPLATE_LINK,
  TemplateVariantPicker,
  templateLinkError,
  templateLinkOf,
  templateVariantKey,
  type TemplateLinkValue,
} from "./template-variant-picker";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { formatUsd } from "~/lib/formatters";
import { Spinner } from "~/components/ui/spinner";
import { DatePicker } from "~/components/ui/date-picker";

export function EditPurchaseModal({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const [updatePurchase, { isLoading }] = useUpdatePurchaseMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: templates = [] } = useGetTemplatesQuery();
  // Plantilla y variante del lote: la tienda lo cuenta en esa variante.
  const initialLink = useMemo(
    () => (purchase ? templateLinkOf(templates, purchase.catalogItemId, purchase.variantKey) : EMPTY_TEMPLATE_LINK),
    [purchase, templates],
  );
  const [link, setLink] = useState<TemplateLinkValue>(EMPTY_TEMPLATE_LINK);
  const [linkError, setLinkError] = useState<string | null>(null);
  const templatesReady = templates.length > 0;
  // Línea de una orden de Alibaba: número y fecha son de la orden.
  const inOrder = Boolean(purchase?.orderId);

  // Valor guardado que ya no está en la lista (compra vieja, o categoría
  // borrada en Catálogo). Se agrega como opción propia para no perderlo.
  const legacyCategory =
    purchase?.category && !categories.some((c) => c.id === purchase.category)
      ? purchase.category
      : null;

  const { register, control, handleSubmit, watch, reset, formState: { errors } } = useForm<PurchaseFormValues, any, PurchaseFormInput>({
    resolver: zodResolver(purchaseFormSchema),
    mode: "onBlur",
  });

  useEffect(() => {
    setLink(initialLink);
    setLinkError(null);
    // Solo al abrir otra compra o cuando llegan las plantillas: no pisa lo que se elige.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase, templatesReady]);

  useEffect(() => {
    if (purchase) {
      reset({
        purchaseDate: purchase.purchaseDate || "",
        lot: purchase.lot || "",
        productName: purchase.productName || "",
        category: purchase.category || "",
        quantity: purchase.quantity,
        costUnit: purchase.costUnit,
        taxUnit: purchase.taxUnit,
      });
    }
  }, [purchase, reset]);

  const cost = Number(watch("costUnit")) || 0;
  const tax = Number(watch("taxUnit")) || 0;
  const qty = Number(watch("quantity")) || 0;
  const subtotal = cost * qty;
  const totalTax = tax * qty;
  const totalFinal = subtotal + totalTax;

  async function onSubmit(data: PurchaseFormInput) {
    if (!purchase) return;
    data.lot = data.lot.toUpperCase();
    const template = templates.find((t) => t.id === link.templateId);
    let linkBody: { templateId: string; variantKey: string; catalogItemId?: string } | null = null;
    if (template) {
      const problem = templateLinkError(link, template);
      if (problem) return setLinkError(problem);
      const variantKey = templateVariantKey(link, template) ?? "";
      const changed =
        link.templateId !== initialLink.templateId ||
        variantKey !== templateVariantKey(initialLink, template) ||
        link.catalogItemId !== initialLink.catalogItemId;
      if (changed) linkBody = { templateId: template.id, variantKey, ...(link.catalogItemId ? { catalogItemId: link.catalogItemId } : {}) };
    } else if (link.query.trim()) {
      return setLinkError("Elegí una plantilla de los resultados para vincular el producto.");
    } else if (initialLink.templateId) {
      return setLinkError("Elegí la plantilla del modelo.");
    }
    setLinkError(null);
    setServerError(null);
    try {
      await updatePurchase({ id: purchase.id, body: { ...data, ...linkBody } }).unwrap();
      toast.success("Compra modificada correctamente.");
      onClose();
    } catch (err: any) {
      setServerError(serverErrorMessage(err, "No se pudo actualizar la compra."));
    }
  }

  useEffect(() => setServerError(null), [purchase]);

  return (
    <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}>
      <FormDialogContent size="long">
        <DialogHeader>
          <DialogTitle>Editar compra · {purchase?.code ?? ""}</DialogTitle>
        </DialogHeader>
        <FormLayout onSubmit={handleSubmit(onSubmit)} autoComplete="off">
          <FormErrorBanner message={serverError} />

          {/* ── Bloque 1: Datos del ítem ── */}
          <FormBody>
            <FormSection title="Datos del producto">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Fila 1: Fecha + Lote */}
                <Field data-invalid={!!errors.purchaseDate}>
                  <FieldLabel htmlFor="edit-purchase-date" required>
                    Fecha de compra
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="purchaseDate"
                    render={({ field }) => (
                      <DatePicker
                        id="edit-purchase-date"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={inOrder}
                      />
                    )}
                  />
                  <FieldError errors={[errors.purchaseDate]} />
                </Field>
                <Field data-invalid={!!errors.lot}>
                  <FieldLabel htmlFor="edit-purchase-lot" required>
                    {inOrder ? "Orden" : "Lote"}
                  </FieldLabel>
                  {/* readOnly y no disabled: un campo disabled llega vacío al validar. */}
                  <Input
                    id="edit-purchase-lot"
                    aria-required
                    readOnly={inOrder}
                    className={inOrder ? "bg-muted text-muted-foreground" : undefined}
                    {...register("lot")}
                    aria-invalid={!!errors.lot}
                  />
                  {inOrder && (
                    <FieldDescription>
                      El número y la fecha se cambian desde la orden.
                    </FieldDescription>
                  )}
                  <FieldError errors={[errors.lot]} />
                </Field>

                <div className="sm:col-span-2">
                  <TemplateVariantPicker
                    idPrefix="edit-purchase"
                    templates={templates}
                    categories={categories}
                    disabled={isLoading}
                    value={link}
                    onChange={(next) => {
                      setLink(next);
                      setLinkError(null);
                    }}
                    error={linkError}
                    description={
                      purchase?.catalogItemId && !initialLink.templateId
                        ? "Está vinculado a un producto sin plantilla. Elegí una para cambiarlo."
                        : purchase?.catalogItemId
                          ? "Al cambiarla, el nombre y la categoría pasan a ser los de la plantilla."
                          : "Sin plantilla, la tienda no ve este lote."
                    }
                  />
                </div>

                {/* Fila 3: Nombre — ancho completo */}
                <Field className="sm:col-span-2" data-invalid={!!errors.productName}>
                  <FieldLabel htmlFor="edit-purchase-name" required>
                    Nombre del producto
                  </FieldLabel>
                  <Input
                    id="edit-purchase-name"
                    aria-required
                    {...register("productName")}
                    aria-invalid={!!errors.productName}
                  />
                  <FieldError errors={[errors.productName]} />
                </Field>

                {/* Categoría: la misma lista que en el alta. `legacyCategory` cubre compras con una categoría
                    que ya no existe, para no borrarla en silencio al guardar. */}
                <Field data-invalid={!!errors.category}>
                  <FieldLabel htmlFor="edit-purchase-category" required>
                    Categoría
                  </FieldLabel>
                  <NativeSelect
                    id="edit-purchase-category"
                    className="w-full"
                    aria-required
                    aria-invalid={!!errors.category}
                    {...register("category")}
                  >
                    <NativeSelectOption value="" disabled>
                      {categories.length === 0
                        ? "No hay categorías creadas"
                        : "Seleccioná una categoría"}
                    </NativeSelectOption>
                    {legacyCategory && (
                      <NativeSelectOption value={legacyCategory}>
                        {legacyCategory} (categoría anterior)
                      </NativeSelectOption>
                    )}
                    {categories.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError errors={[errors.category]} />
                </Field>
              </div>
            </FormSection>
            <FormSection title="Costos y cantidades">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.quantity}>
                  <FieldLabel htmlFor="edit-purchase-qty" required>
                    Cantidad
                  </FieldLabel>
                  <Input
                    id="edit-purchase-qty"
                    type="number"
                    min={1}
                    aria-required
                    {...register("quantity")}
                    aria-invalid={!!errors.quantity}
                  />
                  <FieldError errors={[errors.quantity]} />
                </Field>
                <Field data-invalid={!!errors.costUnit}>
                  <FieldLabel htmlFor="edit-purchase-cost" required>
                    Precio base (USD)
                  </FieldLabel>
                  <Input
                    id="edit-purchase-cost"
                    type="number"
                    step="0.01"
                    min={0}
                    aria-required
                    {...register("costUnit")}
                    aria-invalid={!!errors.costUnit}
                  />
                  <FieldError errors={[errors.costUnit]} />
                </Field>
                <Field data-invalid={!!errors.taxUnit}>
                  <FieldLabel htmlFor="edit-purchase-tax" required>
                    Imp. unitario (USD)
                  </FieldLabel>
                  <Input
                    id="edit-purchase-tax"
                    type="number"
                    step="0.0001"
                    min={0}
                    aria-required
                    readOnly={inOrder}
                    className={inOrder ? "bg-muted text-muted-foreground" : undefined}
                    {...register("taxUnit")}
                    aria-invalid={!!errors.taxUnit}
                  />
                  {inOrder && (
                    <FieldDescription>
                      Es el de toda la orden: se cambia en «Editar orden».
                    </FieldDescription>
                  )}
                  <FieldError errors={[errors.taxUnit]} />
                </Field>

                {/* Tarjeta de totales estilo ticket */}
                <div className="flex flex-col gap-2 rounded-xl border bg-background p-4 sm:col-span-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal (Base × Cantidad)</span>
                    <span className="font-medium text-foreground">{formatUsd(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total de Impuestos (Imp × Cantidad)</span>
                    <span className="font-medium text-foreground">+{formatUsd(totalTax, 4)}</span>
                  </div>
                  <div className="my-1 border-t border-primary/10" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Total final</span>
                    <span className="font-heading text-xl font-bold tabular-nums text-foreground">
                      {formatUsd(totalFinal)}
                    </span>
                  </div>
                </div>
              </div>
            </FormSection>
          </FormBody>

          <FormActions>
            <Button variant="cancel" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Spinner className="mr-2" />}
              {isLoading ? "Guardando…" : "Guardar cambios"}
            </Button>
          </FormActions>
        </FormLayout>
      </FormDialogContent>
    </Dialog>
  );
}
