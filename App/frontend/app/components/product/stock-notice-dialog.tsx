// «Avisame cuando haya»: nombre y WhatsApp; el producto y la opción los pone la
// ficha. Entra al CRM y el equipo escribe cuando llega (sin mensajes automáticos).
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { stockNoticeInputSchema } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { FormActions, FormBody, FormDialogContent, FormLayout } from "~/components/ui/form-layout";
import { Input } from "~/components/ui/input";
import { useCreateStockNoticeMutation } from "~/store/api/storefrontApi";

const formSchema = stockNoticeInputSchema.pick({ name: true, phone: true });
type NoticeForm = z.input<typeof formSchema>;

export function StockNoticeDialog({
  open,
  onOpenChange,
  catalogItemId,
  productName,
  variantName,
  comingSoon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItemId: string;
  productName: string;
  /** Combinación elegida ('' si el producto no tiene opciones). */
  variantName: string;
  comingSoon: boolean;
}) {
  const [createNotice] = useCreateStockNoticeMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NoticeForm>({ resolver: zodResolver(formSchema), defaultValues: { name: "", phone: "" } });

  useEffect(() => {
    if (open) setServerError(null);
  }, [open]);

  async function onSubmit(values: NoticeForm) {
    setServerError(null);
    try {
      const { already } = await createNotice({ ...values, catalogItemId, variantName }).unwrap();
      toast.success(already ? "Ya estabas en la lista" : "Listo, te avisamos", {
        description: "Te escribimos por WhatsApp cuando llegue.",
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setServerError(serverErrorMessage(err, "No pudimos guardar tu aviso. Intentá de nuevo."));
    }
  }

  const label = variantName ? `${productName} · ${variantName}` : productName;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent size="short">
        <DialogHeader>
          <DialogTitle>Avisame cuando haya</DialogTitle>
          <DialogDescription>
            {label}. {comingSoon ? "Viene en camino" : "Está agotado"}: te escribimos por WhatsApp cuando se pueda pedir.
          </DialogDescription>
        </DialogHeader>
        <FormLayout onSubmit={handleSubmit(onSubmit)}>
          <FormBody>
            <FormErrorBanner message={serverError} />
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="notice-name" required>Tu nombre</FieldLabel>
              <Input id="notice-name" autoComplete="name" aria-required aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="notice-phone" required>WhatsApp</FieldLabel>
              <Input
                id="notice-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="8888 8888"
                aria-required
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              <FieldDescription>Número de Nicaragua: es por donde te vamos a escribir.</FieldDescription>
              <FieldError errors={[errors.phone]} />
            </Field>
          </FormBody>
          <FormActions>
            <Button type="button" variant="cancel" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Avisarme"}
            </Button>
          </FormActions>
        </FormLayout>
      </FormDialogContent>
    </Dialog>
  );
}
