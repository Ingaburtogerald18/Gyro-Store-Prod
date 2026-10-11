import { FormLayout, FormDialogContent, FormActions, FormBody } from "~/components/ui/form-layout";
// Diálogos sobre una orden ya registrada: completar o corregir sus datos
// (también las órdenes viejas, que nacen sin proveedor, factura ni fotos) y
// agregarle productos que faltaron al cargarla.
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { AdminTemplate } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import {
  DiscardChangesDialog,
  fieldMessages,
  FormErrorBanner,
  serverErrorMessage,
} from "~/components/ui/form-feedback";
import { formatUsd } from "~/lib/formatters";
import { useGetCategoriesQuery, useGetTemplatesQuery } from "~/store/api/catalogAdminApi";
import {
  useAddPurchaseOrderLinesMutation,
  useGetPurchaseOrdersQuery,
  useGetPurchasesQuery,
  useGetSuppliersQuery,
  useUpdatePurchaseOrderMutation,
  type PurchaseOrder,
} from "~/store/api/inventoryV1Api";
import {
  emptyOrderHeader,
  invoicesFromOrders,
  orderHeaderFrom,
  orderHeaderPayload,
  OrderHeaderFields,
  validateOrderHeader,
  type OrderHeaderState,
} from "./OrderHeaderFields";
import {
  emptyOrderLine,
  OrderLinesEditor,
  orderLinesPayload,
  validateOrderLines,
  type OrderLineErrors,
  type OrderLineState,
} from "./OrderLinesEditor";

export const MISSING_LABELS: Record<PurchaseOrder["missing"][number], string> = {
  number: "número de orden",
  supplier: "proveedor",
  invoice: "factura",
  photos: "fotos del empaque",
};

const focusFirstError = (form: HTMLFormElement | null) =>
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

const headerSchema = z
  .object({ header: z.custom<OrderHeaderState>() })
  .superRefine((values, ctx) => {
    for (const [field, message] of Object.entries(
      validateOrderHeader(values.header, { requireSupplier: false }),
    ))
      ctx.addIssue({ code: "custom", path: ["header", field], message });
  });

function taxHelpFor(order: PurchaseOrder): string | undefined {
  if (order.lineCount === 0) return undefined;
  if (order.taxUnit == null)
    return "Hoy cada producto tiene uno distinto. Si escribís uno, se aplica a todos y se recalcula el costo de lo que ya llegó.";
  return "El mismo para todos los productos. Si lo cambiás, se recalcula el costo de lo que ya llegó.";
}

export function EditPurchaseOrderDialog({
  order,
  onClose,
}: {
  order: PurchaseOrder | null;
  onClose: () => void;
}) {
  const [updateOrder] = useUpdatePurchaseOrderMutation();
  const { data: suppliers = [] } = useGetSuppliersQuery(undefined, { skip: !order });
  const { data: ordersData } = useGetPurchaseOrdersQuery(undefined, { skip: !order });
  const invoices = useMemo(() => invoicesFromOrders(ordersData?.orders ?? []), [ordersData]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<{ header: OrderHeaderState }>({
    resolver: zodResolver(headerSchema),
    defaultValues: { header: emptyOrderHeader() },
  });

  useEffect(() => {
    if (!order) return;
    reset({ header: orderHeaderFrom(order) });
    setServerError(null);
  }, [order, reset]);

  function requestClose(next: boolean) {
    if (next) return;
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onClose();
  }

  async function onSubmit({ header }: { header: OrderHeaderState }) {
    if (!order) return;
    setServerError(null);
    try {
      const body = await orderHeaderPayload(header);
      // Vaciar el impuesto de una orden que tenía uno es dejarla sin impuesto.
      if (body.taxUnit === undefined && order.taxUnit != null) body.taxUnit = 0;
      const updated = await updateOrder({ id: order.id, body }).unwrap();
      toast.success("Orden guardada", {
        description: updated.missing.length
          ? `Todavía falta: ${updated.missing.map((m) => MISSING_LABELS[m]).join(", ")}.`
          : "Ya tiene todos sus datos.",
      });
      onClose();
    } catch (err) {
      setServerError(serverErrorMessage(err, "No se pudo guardar la orden."));
    }
  }

  return (
    <>
      <Dialog open={!!order} onOpenChange={requestClose}>
        <FormDialogContent size="long">
          <DialogHeader>
            <DialogTitle>
              {order?.missing.length ? "Completar datos de la orden" : "Editar orden"}{" "}
              {order?.orderNumber}
            </DialogTitle>
            {order && order.missing.length > 0 && (
              <DialogDescription>
                Falta: {order.missing.map((m) => MISSING_LABELS[m]).join(", ")}.
              </DialogDescription>
            )}
          </DialogHeader>

          <FormLayout
            ref={formRef}
            onSubmit={handleSubmit(onSubmit, () => focusFirstError(formRef.current))}
            noValidate
          >
            <FormErrorBanner message={serverError} />
            <FormBody>
              {order && (
                <Controller
                  control={control}
                  name="header"
                  render={({ field }) => (
                    <OrderHeaderFields
                      value={field.value}
                      onChange={(patch) => field.onChange({ ...getValues("header"), ...patch })}
                      errors={fieldMessages(errors.header)}
                      suppliers={suppliers}
                      allowNoSupplier
                      numberProvisional={order.numberProvisional}
                      linesTotalUsd={order.linesTotalUsd}
                      invoices={invoices}
                      currentInvoiceId={order.invoice?.id ?? null}
                      taxHelp={taxHelpFor(order)}
                    />
                  )}
                />
              )}
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

      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={onClose}
      />
    </>
  );
}

function orderTaxText(order: PurchaseOrder): string {
  if (order.taxUnit == null)
    return order.lineCount ? "sin impuesto, porque sus productos tienen distintos" : "sin impuesto";
  return order.taxUnit === 0
    ? "sin impuesto"
    : `${formatUsd(order.taxUnit, 4)} de impuesto por unidad`;
}

function linesSchema(templates: AdminTemplate[]) {
  return z.object({ lines: z.array(z.custom<OrderLineState>()) }).superRefine((values, ctx) => {
    const lineErrors = validateOrderLines(values.lines, templates);
    values.lines.forEach((line, index) => {
      for (const [field, message] of Object.entries(lineErrors[line.key] ?? {}))
        ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
    });
  });
}

export function AddOrderLinesDialog({
  order,
  onClose,
}: {
  order: PurchaseOrder | null;
  onClose: () => void;
}) {
  const [addLines] = useAddPurchaseOrderLinesMutation();
  const { data: purchases = [] } = useGetPurchasesQuery(undefined, { skip: !order });
  const {
    data: templates = [],
    isLoading: templatesLoading,
    isError: templatesFailed,
    refetch: refetchTemplates,
  } = useGetTemplatesQuery(undefined, { skip: !order });
  const { data: categories = [] } = useGetCategoriesQuery(undefined, { skip: !order });
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const resolver = useMemo(() => zodResolver(linesSchema(templates)), [templates]);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<{ lines: OrderLineState[] }>({
    resolver,
    defaultValues: { lines: [emptyOrderLine()] },
  });

  useEffect(() => {
    if (!order) return;
    reset({ lines: [emptyOrderLine()] });
    setServerError(null);
  }, [order, reset]);

  const lines = watch("lines");
  const lineErrors: OrderLineErrors = {};
  lines.forEach((line, index) => {
    const messages = fieldMessages(errors.lines?.[index]);
    if (Object.keys(messages).length) lineErrors[line.key] = messages;
  });
  // El servidor usa el impuesto de la orden; si sus productos tienen distintos, lo nuevo va con 0.
  const taxUnit = order?.taxUnit ?? 0;

  function requestClose(next: boolean) {
    if (next) return;
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onClose();
  }

  async function onSubmit(values: { lines: OrderLineState[] }) {
    if (!order) return;
    setServerError(null);
    try {
      await addLines({ id: order.id, lines: orderLinesPayload(values.lines, templates) }).unwrap();
      toast.success(values.lines.length === 1 ? "Producto agregado" : "Productos agregados", {
        description: `Orden ${order.orderNumber}: ${
          values.lines.length === 1 ? "1 producto" : `${values.lines.length} productos`
        } en tránsito.`,
      });
      onClose();
    } catch (err) {
      setServerError(serverErrorMessage(err, "No se pudieron agregar los productos."));
    }
  }

  return (
    <>
      <Dialog open={!!order} onOpenChange={requestClose}>
        <FormDialogContent size="long">
          <DialogHeader>
            <DialogTitle>Agregar productos a la orden {order?.orderNumber}</DialogTitle>
            {order && (
              <DialogDescription>
                Entran en tránsito, con la fecha de la orden y {orderTaxText(order)}.
              </DialogDescription>
            )}
          </DialogHeader>

          <FormLayout
            ref={formRef}
            onSubmit={handleSubmit(onSubmit, () => focusFirstError(formRef.current))}
            noValidate
          >
            <FormErrorBanner message={serverError} />
            <FormBody>
              <Controller
                control={control}
                name="lines"
                render={({ field }) => (
                  <OrderLinesEditor
                    lines={field.value}
                    onChange={field.onChange}
                    errors={lineErrors}
                    templates={templates}
                    categories={categories}
                    taxUnit={taxUnit}
                    alreadyInOrder={order ? purchases.filter((p) => p.orderId === order.id) : []}
                    loading={templatesLoading}
                    failed={templatesFailed}
                    onRetry={() => void refetchTemplates()}
                    disabled={isSubmitting}
                  />
                )}
              />
            </FormBody>
            <FormActions>
              <Button type="button" variant="cancel" onClick={() => requestClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || templatesLoading || templatesFailed}>
                {isSubmitting ? "Guardando…" : "Agregar a la orden"}
              </Button>
            </FormActions>
          </FormLayout>
        </FormDialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={onClose}
      />
    </>
  );
}
