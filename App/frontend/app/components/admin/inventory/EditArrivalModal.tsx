import { FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { FormLayout, FormDialogContent, FormActions, FormBody } from "~/components/ui/form-layout";
// Modal para editar los datos de recepción de una compra (flete, categoría, fecha de ingreso).
import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { arrivalFormSchema, type ArrivalFormInput, type ArrivalFormValues } from "~/lib/validators";
import {
  useUpdatePurchaseMutation,
  useSimulateCostMutation,
  type Purchase,
} from "~/store/api/inventoryV1Api";
import { formatCordobas } from "~/lib/formatters";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { DatePicker } from "~/components/ui/date-picker";

export function EditArrivalModal({
  purchase,
  onClose,
}: {
  purchase: Purchase | null;
  onClose: () => void;
}) {
  const [updatePurchase, { isLoading }] = useUpdatePurchaseMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [simulateCost] = useSimulateCostMutation();
  const [simulatedPrice, setSimulatedPrice] = useState<number | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ArrivalFormValues, any, ArrivalFormInput>({
    resolver: zodResolver(arrivalFormSchema),
  });

  // Cargar valores actuales al abrir el modal
  useEffect(() => {
    if (purchase) {
      reset({
        arrivalDate: purchase.arrivalDate || "",
        shippingUnit: purchase.shippingUnit,
        suggestedPrice: purchase.suggestedPrice ?? undefined,
      });
    }
  }, [purchase, reset]);

  const shippingUnit = useWatch({ control, name: "shippingUnit" });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (purchase && shippingUnit !== undefined && String(shippingUnit) !== "") {
        const val = Number(shippingUnit);
        if (val >= 0 && !isNaN(val)) {
          simulateCost({ id: purchase.id, shippingUnit: val })
            .unwrap()
            .then(res => {
              // Solo se muestra: copiarlo al campo pisaría el precio puesto a mano.
              setSimulatedPrice(res.precioSugerido);
            })
            .catch(err => {
              console.error("Error simulando costo:", err);
              setSimulatedPrice(null);
            });
        }
      } else {
        setSimulatedPrice(null);
      }
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [shippingUnit, purchase, simulateCost]);

  async function onSubmit(data: ArrivalFormInput) {
    if (!purchase) return;
    setServerError(null);
    try {
      // Combinamos los datos actuales con los campos de arribo editados.
      // Enviar suggestedPrice explícito es lo que permite cambiar el precio de venta
      // del producto en bodega (el server solo toca el precio cuando viene explícito).
      const body = {
        ...purchase,
        arrivalDate: data.arrivalDate,
        shippingUnit: data.shippingUnit,
        suggestedPrice: data.suggestedPrice,
      };
      await updatePurchase({ id: purchase.id, body }).unwrap();
      toast.success("Datos de inventario actualizados correctamente.");
      onClose();
    } catch (err: any) {
      setServerError(serverErrorMessage(err, "No se pudieron guardar los cambios."));
    }
  }

  useEffect(() => setServerError(null), [purchase]);

  return (
    <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}>
      <FormDialogContent>
        <DialogHeader>
          <DialogTitle>Editar recepción · {purchase?.code ?? ""}</DialogTitle>
        </DialogHeader>
        <FormLayout onSubmit={handleSubmit(onSubmit)} autoComplete="off">
          <FormErrorBanner message={serverError} />
          <FormBody>
            <Field data-invalid={!!errors.arrivalDate}>
              <FieldLabel htmlFor="edit-arrival-date" required>
                Fecha de ingreso a Nicaragua
              </FieldLabel>
              <Controller
                control={control}
                name="arrivalDate"
                render={({ field }) => (
                  <DatePicker id="edit-arrival-date" value={field.value} onChange={field.onChange} />
                )}
              />
              <FieldError errors={[errors.arrivalDate]} />
            </Field>

            <Field data-invalid={!!errors.shippingUnit}>
              <FieldLabel htmlFor="edit-arrival-shipping" required>
                Costo de envío unitario (USD)
              </FieldLabel>
              <Input
                id="edit-arrival-shipping"
                type="number"
                step="0.0001"
                min={0}
                aria-required
                {...register("shippingUnit")}
                aria-invalid={!!errors.shippingUnit}
              />
              <FieldError errors={[errors.shippingUnit]} />
            </Field>

            {simulatedPrice !== null && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-2xl">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">Precio sugerido calculado:</span>{" "}
                  <span className="nums">{formatCordobas(simulatedPrice, "C$", 2)}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Tu precio de abajo no cambia si no lo tocás.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setValue("suggestedPrice", simulatedPrice, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  >
                    Usar este precio
                  </Button>
                </div>
              </div>
            )}

            <Field data-invalid={!!errors.suggestedPrice}>
              <FieldLabel htmlFor="edit-arrival-price" required>
                Precio de venta (C$)
              </FieldLabel>
              <Input
                id="edit-arrival-price"
                type="number"
                step="1"
                min={0}
                placeholder="Precio al que se vende"
                {...register("suggestedPrice")}
                aria-invalid={!!errors.suggestedPrice}
              />
              <FieldDescription>
                Es el precio que verá el vendedor al cotizar. Puedes cambiarlo cuando quieras.
              </FieldDescription>
              <FieldError errors={[errors.suggestedPrice]} />
            </Field>
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
