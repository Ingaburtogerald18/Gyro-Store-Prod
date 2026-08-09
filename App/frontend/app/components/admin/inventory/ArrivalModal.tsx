import { useEffect, useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { DatePicker } from "~/components/ui/date-picker";
import { arrivalFormSchema, type ArrivalFormInput, type ArrivalFormValues } from "~/lib/validators";
import { useReportArrivalMutation, useSimulateCostMutation, type Purchase } from "~/store/api/inventoryV1Api";
import { formatCordobas } from "~/lib/formatters";
import { Spinner } from "~/components/ui/spinner";

export function ArrivalModal({
  purchase,
  onClose,
}: {
  purchase: Purchase | null;
  onClose: () => void;
}) {
  const [reportArrival, { isLoading }] = useReportArrivalMutation();
  const [simulateCost] = useSimulateCostMutation();
  const [simulatedPrice, setSimulatedPrice] = useState<number | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<ArrivalFormValues, any, ArrivalFormInput>({
    resolver: zodResolver(arrivalFormSchema),
    defaultValues: { arrivalDate: undefined, shippingUnit: undefined, suggestedPrice: undefined },
  });

  const shippingUnit = useWatch({ control, name: "shippingUnit" });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (purchase && shippingUnit !== undefined && String(shippingUnit) !== "") {
        const val = Number(shippingUnit);
        if (val >= 0 && !isNaN(val)) {
          simulateCost({ id: purchase.id, shippingUnit: val })
            .unwrap()
            .then(res => {
              setSimulatedPrice(res.precioSugerido);
              if (!dirtyFields.suggestedPrice) {
                setValue("suggestedPrice", res.precioSugerido, { shouldValidate: true });
              }
            })
            .catch(err => {
              console.error("Error simulando costo:", err);
              setSimulatedPrice(null);
            });
        }
      } else {
        setSimulatedPrice(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [shippingUnit, purchase, simulateCost, setValue, dirtyFields.suggestedPrice]);

  async function onSubmit(data: ArrivalFormInput) {
    if (!purchase) return;
    try {
      await reportArrival({ id: purchase.id, body: data }).unwrap();
      toast.success("Llegada reportada. Pendiente de aprobación.");
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo reportar la llegada.");
    }
  }

  return (
    <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Reportar llegada · {purchase?.code ?? ""}</DialogTitle>
        </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-3">
        {purchase && (
          <div className="rounded-lg bg-muted p-3 text-sm border flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary-2 bg-primary/10 px-1.5 py-0.5 rounded">{purchase.code}</span>
            <span className="font-medium text-foreground">{purchase.productName}</span>
          </div>
        )}
        
        <Field data-invalid={!!errors.arrivalDate}>
          <FieldLabel htmlFor="arrival-date" required>Fecha de ingreso a Nicaragua</FieldLabel>
          <Controller
            control={control}
            name="arrivalDate"
            render={({ field }) => (
              <DatePicker
                id="arrival-date"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError errors={[errors.arrivalDate]} />
        </Field>

        <Field data-invalid={!!errors.shippingUnit}>
          <FieldLabel htmlFor="arrival-shipping" required>Costo de envío unitario (USD)</FieldLabel>
          <Input id="arrival-shipping" type="number" step="0.0001" min={0} aria-required {...register("shippingUnit")} aria-invalid={!!errors.shippingUnit} />
          <FieldError errors={[errors.shippingUnit]} />
        </Field>


        {simulatedPrice !== null && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-md">
            <p className="text-sm text-foreground">
              <span className="font-semibold">Precio sugerido calculado:</span>{' '}
              <span className="nums">{formatCordobas(simulatedPrice, 'C$', 2)}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Si dejás el campo de abajo vacío, este será el precio que se asigne automáticamente.
            </p>
          </div>
        )}

        <Field data-invalid={!!errors.suggestedPrice}>
          <FieldLabel htmlFor="arrival-price">Precio de venta final (C$)</FieldLabel>
          <Input id="arrival-price" type="number" step="0.01" min={0} className="font-bold" {...register("suggestedPrice")} aria-invalid={!!errors.suggestedPrice} />
          <FieldDescription>Si lo dejás vacío se guarda el sugerido calculado arriba.</FieldDescription>
          <FieldError errors={[errors.suggestedPrice]} />
        </Field>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isLoading}>
        {isLoading && <Spinner className="mr-2" />}
        Confirmar llegada
      </Button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}
