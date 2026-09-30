// Formulario de registro de compra (China). Al guardar, la compra entra en estado "En tránsito".
import { HugeIcon } from "~/components/ui/icon";
import { CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useForm, Controller, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";


import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { purchaseFormSchema, type PurchaseFormInput, type PurchaseFormValues } from "~/lib/validators";
import { useCreatePurchaseMutation, useGetPurchasesQuery } from "~/store/api/inventoryV1Api";
import { useGetCategoriesQuery } from "~/store/api/catalogAdminApi";
import { Input } from "~/components/ui/input";
import { Combobox } from "~/components/ui/combobox";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { formatUsd } from "~/lib/formatters";
import { Spinner } from "~/components/ui/spinner";
import { DatePicker } from "~/components/ui/date-picker";

const EMPTY_PURCHASE = {
  purchaseDate: "",
  lot: "",
  productName: "",
  category: "",
  quantity: "",
  costUnit: "",
  taxUnit: "",
} as unknown as DefaultValues<PurchaseFormValues>;

export function PurchaseForm({ onDone }: { onDone?: () => void } = {}) {
  const [createPurchase, { isLoading }] = useCreatePurchaseMutation();
  const { data: purchases = [] } = useGetPurchasesQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const [showSuccessPrompt, setShowSuccessPrompt] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PurchaseFormValues, any, PurchaseFormInput>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: EMPTY_PURCHASE,
    mode: "onBlur",
  });

  const usedNumbers = purchases
    .map((p) => {
      const match = p.code?.match(/^GS-IN-(\d+)$/i);
      return match ? parseInt(match[1], 10) : NaN;
    })
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  let nextCodeNumber = 1;
  for (const n of usedNumbers) {
    if (n === nextCodeNumber) {
      nextCodeNumber++;
    } else if (n > nextCodeNumber) {
      break;
    }
  }
  const nextCode = `GS-IN-${nextCodeNumber}`;

  const cost = Number(watch("costUnit")) || 0;
  const tax = Number(watch("taxUnit")) || 0;
  const qty = Number(watch("quantity")) || 0;
  const subtotal = cost * qty;
  const totalTax = tax * qty;
  const totalFinal = subtotal + totalTax;

  async function onSubmit(data: PurchaseFormInput) {
    // Normalizar a mayúsculas antes de guardar
    data.lot = data.lot.toUpperCase();
    try {
      await createPurchase(data).unwrap();
      toast.success("Compra registrada (En tránsito).");
      setShowSuccessPrompt(true);
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo registrar la compra.");
    }
  }

  if (showSuccessPrompt) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeIcon icon={CheckmarkCircle01Icon} size={32} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-xl font-bold">¡Compra registrada con éxito!</h2>
          <p className="text-muted-foreground mt-1">La compra ha sido guardada con estado "En tránsito".</p>
        </div>
        <p className="font-medium mt-4">¿Deseas registrar otra compra?</p>
        <div className="flex w-full sm:w-auto gap-3 pt-4">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { reset(EMPTY_PURCHASE); setShowSuccessPrompt(false); onDone?.(); }}>
            No, volver
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => { reset(EMPTY_PURCHASE); setShowSuccessPrompt(false); }}>
            Sí, agregar otra
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-5 p-1">

      {/* ── Bloque 1: Datos del ítem ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Fila 1: Fecha + Lote */}
        <Field data-invalid={!!errors.purchaseDate}>
          <FieldLabel htmlFor="purchase-date" required>Fecha de compra</FieldLabel>
          <Controller
            control={control}
            name="purchaseDate"
            render={({ field }) => (
              <DatePicker
                id="purchase-date"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError errors={[errors.purchaseDate]} />
        </Field>
        <Field data-invalid={!!errors.lot}>
          <FieldLabel htmlFor="purchase-lot" required>Lote</FieldLabel>
          <Controller
            control={control}
            name="lot"
            render={({ field }) => (
              <Combobox
                id="purchase-lot"
                value={field.value || ""}
                onChange={field.onChange}
                options={Array.from(new Set(purchases.map((p) => p.lot).filter(Boolean))) as string[]}
                placeholder="Seleccionar o crear lote..."
                aria-invalid={!!errors.lot}
              />
            )}
          />
          <FieldError errors={[errors.lot]} />
        </Field>

        {/* Fila 1 cont. (lg): Código */}
        <Field>
          <FieldLabel htmlFor="purchase-code">Código</FieldLabel>
          <Input id="purchase-code" value={nextCode} disabled className="bg-muted text-muted-foreground font-mono" />
          <FieldDescription>Siguiente asignación automática</FieldDescription>
        </Field>

        {/* Fila 2: Nombre del producto — ancho completo */}
        <Field className="sm:col-span-2 lg:col-span-3" data-invalid={!!errors.productName}>
          <FieldLabel htmlFor="purchase-product-name" required>Nombre del producto</FieldLabel>
          <Controller
            control={control}
            name="productName"
            render={({ field }) => (
              <Combobox
                id="purchase-product-name"
                value={field.value || ""}
                onChange={field.onChange}
                options={Array.from(new Set(purchases.map((p) => p.productName).filter(Boolean))) as string[]}
                placeholder="Seleccionar o escribir producto..."
                aria-invalid={!!errors.productName}
              />
            )}
          />
          <FieldError errors={[errors.productName]} />
        </Field>
      </div>

      {/* Categoría: obligatoria en el backend al registrar la compra.
          Las opciones salen de la tabla `categories` — las que se administran
          en Catálogo — y NO de `config.categories` (las del storefront, que
          viven en app_config). Eran dos listas distintas: se podía comprar en
          una categoría que no existía en el catálogo. */}
      <Field data-invalid={!!errors.category}>
        <FieldLabel htmlFor="purchase-category" required>Categoría</FieldLabel>
        <NativeSelect
          id="purchase-category"
          className="w-full"
          defaultValue=""
          aria-required
          aria-invalid={!!errors.category}
          {...register("category")}
        >
          <NativeSelectOption value="" disabled>
            {categories.length === 0 ? 'No hay categorías creadas' : 'Seleccioná una categoría'}
          </NativeSelectOption>
          {categories.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError errors={[errors.category]} />
        {categories.length === 0 && (
          <FieldDescription>
            Creá las categorías en Catálogo → Categorías y volvé acá.
          </FieldDescription>
        )}
      </Field>

      {/* ── Bloque 2: Datos financieros ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field data-invalid={!!errors.quantity}>
          <FieldLabel htmlFor="purchase-qty" required>Cantidad</FieldLabel>
          <Input id="purchase-qty" type="number" min={1} aria-required {...register("quantity")} aria-invalid={!!errors.quantity} />
          <FieldError errors={[errors.quantity]} />
        </Field>
        <Field data-invalid={!!errors.costUnit}>
          <FieldLabel htmlFor="purchase-cost" required>Precio base (USD)</FieldLabel>
          <Input id="purchase-cost" type="number" step="0.01" min={0} aria-required {...register("costUnit")} aria-invalid={!!errors.costUnit} />
          <FieldError errors={[errors.costUnit]} />
        </Field>
        <Field data-invalid={!!errors.taxUnit}>
          <FieldLabel htmlFor="purchase-tax" required>Imp. unitario (USD)</FieldLabel>
          <Input id="purchase-tax" type="number" step="0.0001" min={0} aria-required {...register("taxUnit")} aria-invalid={!!errors.taxUnit} />
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
            <span className="text-xs font-bold uppercase tracking-wider text-primary-2">Total Final</span>
            <span className="font-heading text-xl font-bold text-primary-2">{formatUsd(totalFinal)}</span>
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
        {isLoading && <Spinner className="mr-2" />}
        Registrar compra
      </Button>
    </form>
  );
}
