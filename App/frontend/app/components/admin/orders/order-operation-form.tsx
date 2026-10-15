// Pagos, transporte y recepción de un pedido web. Cada dato es independiente: el producto pagado no
// implica el transporte pagado, y marcar «Entregado» no completa la recepción ni ningún pago.
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

import { managuaDate, operationDateIssues, type PublicOrderOperation } from '@shared/schemas';
import { Button } from '~/components/ui/button';
import { DatePicker } from '~/components/ui/date-picker';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { FormErrorBanner, serverErrorMessage } from '~/components/ui/form-feedback';
import { FormActions, FormBody, FormLayout, FormSection } from '~/components/ui/form-layout';
import { Input } from '~/components/ui/input';
import { MoneyInput } from '~/components/ui/money-input';
import { useUpdatePublicOrderOperationMutation, type AdminPublicOrder } from '~/state/api/public-orders-api';

type DateField = 'productPaidDate' | 'shippingPaidDate' | 'receivedDate';

function formSchema(createdOn: string, today: string) {
  return z
    .object({
      shippingQuote: z
        .string()
        .trim()
        .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Escribí un monto válido.'),
      productPaidDate: z.string(),
      shippingPaidDate: z.string(),
      carrierReference: z.string().trim().max(80, 'Máximo 80 caracteres.'),
      receivedDate: z.string(),
    })
    .superRefine((v, ctx) => {
      const dates = { productPaidDate: v.productPaidDate || null, shippingPaidDate: v.shippingPaidDate || null, receivedDate: v.receivedDate || null };
      for (const issue of operationDateIssues(dates, createdOn, today)) {
        ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
      }
    });
}
type FormValues = z.infer<ReturnType<typeof formSchema>>;

const toForm = (op: PublicOrderOperation): FormValues => ({
  shippingQuote: op.shippingQuote == null ? '' : String(op.shippingQuote),
  productPaidDate: op.productPaidDate ?? '',
  shippingPaidDate: op.shippingPaidDate ?? '',
  carrierReference: op.carrierReference ?? '',
  receivedDate: op.receivedDate ?? '',
});

const toOperation = (v: FormValues): PublicOrderOperation => ({
  shippingQuote: v.shippingQuote === '' ? null : Number(v.shippingQuote),
  productPaidDate: v.productPaidDate || null,
  shippingPaidDate: v.shippingPaidDate || null,
  carrierReference: v.carrierReference.trim() || null,
  receivedDate: v.receivedDate || null,
});

export function OrderOperationForm({ order }: { order: AdminPublicOrder }) {
  const [save, { isLoading }] = useUpdatePublicOrderOperationMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const resolver = useMemo(
    () => zodResolver(formSchema(managuaDate(new Date(order.createdAt)), managuaDate(new Date()))),
    [order.createdAt],
  );
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver, defaultValues: toForm(order.operation) });

  const ships = order.deliveryMethod !== 'retiro';
  const ids = `op-${order.id.slice(0, 8)}`;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const saved = await save({ id: order.id, operation: toOperation(values) }).unwrap();
      reset(toForm(saved));
      toast.success('Pedido actualizado');
    } catch (err) {
      setServerError(serverErrorMessage(err, 'No se pudo guardar.'));
    }
  }

  const dateField = (name: DateField, label: string, description: string) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`${ids}-${name}`}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <DatePicker id={`${ids}-${name}`} value={field.value} onChange={field.onChange} placeholder="Sin registrar" disableFuture />
            {field.value && (
              <Button type="button" variant="link" className="h-11 shrink-0 px-2" onClick={() => field.onChange('')}>
                Quitar
              </Button>
            )}
          </div>
        )}
      />
      <FieldDescription>{description}</FieldDescription>
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  return (
    <FormLayout mode="page" onSubmit={handleSubmit(onSubmit)}>
      <FormErrorBanner message={serverError} />
      <FormBody>
        <FormSection title="Pagos y recepción" description="Solo los ve el personal. Cada dato se registra por separado.">
          <div className="grid gap-5 lg:grid-cols-2">
            {dateField('productPaidDate', 'Producto pagado el', 'Vacío mientras no se haya confirmado el pago. Subir un comprobante no lo confirma.')}
            {dateField('receivedDate', 'El cliente lo recibió el', 'Desde esta fecha corre la garantía. Marcar «Entregado» no la completa.')}
            {ships && (
              <>
                <Field data-invalid={!!errors.shippingQuote}>
                  <FieldLabel htmlFor={`${ids}-quote`}>Costo del transporte</FieldLabel>
                  <Controller
                    control={control}
                    name="shippingQuote"
                    render={({ field }) => (
                      <MoneyInput id={`${ids}-quote`} currency="nio" value={field.value} onChange={field.onChange} invalid={!!errors.shippingQuote} placeholder="Sin cotizar" />
                    )}
                  />
                  <FieldDescription>Lo cotizado al cliente. No cambia el total de productos.</FieldDescription>
                  <FieldError errors={[errors.shippingQuote]} />
                </Field>
                {dateField('shippingPaidDate', 'Transporte pagado el', 'Aparte del pago del producto.')}
              </>
            )}
            {order.deliveryMethod === 'cargo_trans' && (
              <Field data-invalid={!!errors.carrierReference}>
                <FieldLabel htmlFor={`${ids}-reference`}>Comprobante de Cargo Trans</FieldLabel>
                <Input id={`${ids}-reference`} placeholder="Número de guía o de comprobante" aria-invalid={!!errors.carrierReference} {...register('carrierReference')} />
                <FieldDescription>Privado: no sale en el seguimiento del cliente.</FieldDescription>
                <FieldError errors={[errors.carrierReference]} />
              </Field>
            )}
          </div>
        </FormSection>
      </FormBody>
      <FormActions>
        <Button type="submit" disabled={isLoading || !isDirty}>
          {isLoading ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </FormActions>
    </FormLayout>
  );
}
