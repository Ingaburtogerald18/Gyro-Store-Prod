// Modal para editar los datos base de una compra en tránsito (China).
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { purchaseFormSchema, type PurchaseFormInput, type PurchaseFormValues } from "~/lib/validators";
import { useUpdatePurchaseMutation, type Purchase } from "~/store/api/inventoryV1Api";
import { useGetCategoriesQuery } from "~/store/api/catalogAdminApi";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { formatUsd } from "~/lib/formatters";
import { Spinner } from "~/components/ui/spinner";
import { DatePicker } from "~/components/ui/date-picker";

export function EditPurchaseModal({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const [updatePurchase, { isLoading }] = useUpdatePurchaseMutation();
  const { data: categories = [] } = useGetCategoriesQuery();

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
    try {
      await updatePurchase({ id: purchase.id, body: data }).unwrap();
      toast.success("Compra modificada correctamente.");
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo actualizar la compra.");
    }
  }

  return (
    <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Editar compra · {purchase?.code ?? ""}</DialogTitle>
        </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-5">

        {/* ── Bloque 1: Datos del ítem ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Fila 1: Fecha + Lote */}
          <Field data-invalid={!!errors.purchaseDate}>
            <FieldLabel htmlFor="edit-purchase-date" required>Fecha de compra</FieldLabel>
          <Controller
            control={control}
            name="purchaseDate"
            render={({ field }) => (
              <DatePicker
                id="edit-purchase-date"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
            <FieldError errors={[errors.purchaseDate]} />
          </Field>
          <Field data-invalid={!!errors.lot}>
            <FieldLabel htmlFor="edit-purchase-lot" required>Lote</FieldLabel>
            <Input id="edit-purchase-lot" aria-required {...register("lot")} aria-invalid={!!errors.lot} />
            <FieldError errors={[errors.lot]} />
          </Field>

          {/* Fila 3: Nombre — ancho completo */}
          <Field className="sm:col-span-2" data-invalid={!!errors.productName}>
            <FieldLabel htmlFor="edit-purchase-name" required>Nombre del producto</FieldLabel>
            <Input id="edit-purchase-name" aria-required {...register("productName")} aria-invalid={!!errors.productName} />
            <FieldError errors={[errors.productName]} />
          </Field>
          
          {/* Fila 4: Categoría.
              Era un <Input> de texto libre: se podía guardar cualquier cadena,
              y la tabla —que resuelve el valor contra la lista de categorías—
              la mostraba cruda, sin nombre. Ahora es la MISMA lista que en el
              alta: las categorías de Catálogo.

              `legacyCategory` cubre las compras viejas que quedaron con una
              categoría que ya no existe en la lista: sin esa opción el select
              no podría representar su valor y lo borraría en silencio al
              guardar cualquier otro campo. */}
          <Field data-invalid={!!errors.category}>
            <FieldLabel htmlFor="edit-purchase-category" required>Categoría</FieldLabel>
            <NativeSelect
              id="edit-purchase-category"
              className="w-full"
              aria-required
              aria-invalid={!!errors.category}
              {...register("category")}
            >
              <NativeSelectOption value="" disabled>
                {categories.length === 0 ? 'No hay categorías creadas' : 'Selecciona una categoría'}
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

        {/* ── Bloque 2: Datos financieros ── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field data-invalid={!!errors.quantity}>
            <FieldLabel htmlFor="edit-purchase-qty" required>Cantidad</FieldLabel>
            <Input id="edit-purchase-qty" type="number" min={1} aria-required {...register("quantity")} aria-invalid={!!errors.quantity} />
            <FieldError errors={[errors.quantity]} />
          </Field>
          <Field data-invalid={!!errors.costUnit}>
            <FieldLabel htmlFor="edit-purchase-cost" required>Precio base (USD)</FieldLabel>
            <Input id="edit-purchase-cost" type="number" step="0.01" min={0} aria-required {...register("costUnit")} aria-invalid={!!errors.costUnit} />
            <FieldError errors={[errors.costUnit]} />
          </Field>
          <Field data-invalid={!!errors.taxUnit}>
            <FieldLabel htmlFor="edit-purchase-tax" required>Imp. unitario (USD)</FieldLabel>
            <Input id="edit-purchase-tax" type="number" step="0.0001" min={0} aria-required {...register("taxUnit")} aria-invalid={!!errors.taxUnit} />
            <FieldError errors={[errors.taxUnit]} />
          </Field>

          {/* Tarjeta de totales estilo ticket */}
          <div className="col-span-3 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
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
              <span className="text-xs font-bold uppercase tracking-wider text-primary/70">Total Final</span>
              <span className="font-heading text-xl font-bold text-primary-2">{formatUsd(totalFinal)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">Cancelar</Button>
          <Button type="submit" size="sm" disabled={isLoading}>
        {isLoading && <Spinner className="mr-2" />}
        Guardar cambios
      </Button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}
