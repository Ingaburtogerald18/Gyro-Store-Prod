// Oferta de un color desde Stock actual: precio fijo menor al normal, con
// vencimiento en hora de Nicaragua. Vale para todos los códigos de ese color.
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { DiscardChangesDialog, FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { FormActions, FormBody, FormDialogContent, FormLayout } from "~/components/ui/form-layout";
import { Input } from "~/components/ui/input";
import { MoneyInput } from "~/components/ui/money-input";
import { formatCordobas, formatNicaraguaDateTime } from "~/lib/formatters";
import { useSetColorOfferMutation, type ColorOffer, type OfferTarget } from "~/store/api/inventoryV1Api";

// Nicaragua está en UTC−6 todo el año (sin horario de verano).
const NICARAGUA_OFFSET_MS = 6 * 60 * 60 * 1000;
const toNicaraguaIso = (date: string, time: string) => `${date}T${time}:00-06:00`;

function nicaraguaParts(iso: string): { date: string; time: string } {
  const local = new Date(Date.parse(iso) - NICARAGUA_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

type OfferForm = { price: string; date: string; time: string };

function offerSchema(normalPrice: number | null) {
  return z
    .object({
      price: z
        .string()
        .trim()
        .min(1, "Escribí el precio de oferta.")
        .refine((v) => Number(v) > 0, "Escribí un precio mayor a 0.")
        .refine(
          (v) => normalPrice == null || Number(v) < normalPrice,
          `Tiene que ser menor que el precio normal (${formatCordobas(normalPrice ?? 0)}).`,
        ),
      date: z.string().min(1, "Elegí el día en que vence."),
      time: z.string().regex(/^\d{2}:\d{2}$/, "Elegí la hora en que vence."),
    })
    .refine((v) => !v.date || Date.parse(toNicaraguaIso(v.date, v.time)) > Date.now(), {
      path: ["date"],
      message: "Esa fecha ya pasó: elegí una más adelante.",
    });
}

export function ColorOfferDialog({
  target,
  offer,
  onClose,
}: {
  target: OfferTarget | null;
  offer: ColorOffer | null;
  onClose: () => void;
}) {
  const [setOffer] = useSetColorOfferMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const resolver = useMemo(() => zodResolver(offerSchema(target?.normalPrice ?? null)), [target]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OfferForm>({ resolver, defaultValues: { price: "", date: "", time: "23:59" } });

  useEffect(() => {
    if (!target) return;
    reset(offer ? { price: String(offer.price), ...nicaraguaParts(offer.endsAt) } : { price: "", date: "", time: "23:59" });
    setServerError(null);
  }, [target, offer, reset]);

  function requestClose(next: boolean) {
    if (next) return;
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onClose();
  }

  async function onSubmit(values: OfferForm) {
    if (!target) return;
    setServerError(null);
    try {
      const saved = await setOffer({
        catalogItemId: target.catalogItemId,
        color: target.color,
        price: Number(values.price),
        endsAt: toNicaraguaIso(values.date, values.time),
      }).unwrap();
      toast.success(offer ? "Oferta cambiada" : "Oferta puesta", {
        description: `${target.label}: ${formatCordobas(saved.price)} hasta el ${formatNicaraguaDateTime(saved.endsAt)}.`,
      });
      onClose();
    } catch (err) {
      setServerError(serverErrorMessage(err, "No se pudo guardar la oferta."));
    }
  }

  return (
    <>
      <Dialog open={!!target} onOpenChange={requestClose}>
        <FormDialogContent size="short">
          <DialogHeader>
            <DialogTitle>{offer ? "Cambiar oferta" : "Poner oferta"} · {target?.label}</DialogTitle>
            <DialogDescription>
              Vale para todos los códigos de este color y solo cambia el precio de la tienda. Ventas sigue con el normal.
            </DialogDescription>
          </DialogHeader>

          <FormLayout onSubmit={handleSubmit(onSubmit)} autoComplete="off">
            <FormBody>
              <FormErrorBanner message={serverError} />
              <Controller
                control={control}
                name="price"
                render={({ field }) => (
                  <Field data-invalid={!!errors.price}>
                    <FieldLabel htmlFor="offer-price" required>Precio de oferta</FieldLabel>
                    <MoneyInput
                      id="offer-price"
                      currency="nio"
                      placeholder="0"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.price}
                      aria-required
                    />
                    <FieldDescription>
                      {target?.normalPrice != null
                        ? `Precio normal: ${formatCordobas(target.normalPrice)}. La tienda lo muestra tachado al lado.`
                        : "Este color todavía no tiene precio de venta."}
                    </FieldDescription>
                    <FieldError errors={[errors.price]} />
                  </Field>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="date"
                  render={({ field }) => (
                    <Field data-invalid={!!errors.date}>
                      <FieldLabel htmlFor="offer-date" required>Vence el</FieldLabel>
                      <DatePicker id="offer-date" value={field.value} onChange={field.onChange} />
                      <FieldError errors={[errors.date]} />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="time"
                  render={({ field }) => (
                    <Field data-invalid={!!errors.time}>
                      <FieldLabel htmlFor="offer-time" required>Hora</FieldLabel>
                      <Input
                        id="offer-time"
                        type="time"
                        value={field.value}
                        onChange={field.onChange}
                        aria-invalid={!!errors.time}
                        aria-required
                      />
                      <FieldDescription>Hora de Nicaragua.</FieldDescription>
                      <FieldError errors={[errors.time]} />
                    </Field>
                  )}
                />
              </div>
            </FormBody>
            <FormActions>
              <Button type="button" variant="cancel" onClick={() => requestClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : "Guardar"}
              </Button>
            </FormActions>
          </FormLayout>
        </FormDialogContent>
      </Dialog>

      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}
