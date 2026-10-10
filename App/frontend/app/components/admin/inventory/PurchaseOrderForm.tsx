// Registrar una compra de Alibaba: la orden con todos sus productos de una vez.
// Si el número ya está registrado, los productos se agregan a esa orden.
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { AdminTemplate } from "@shared/schemas";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DiscardChangesDialog, fieldMessages, FormErrorBanner, serverErrorMessage } from "~/components/ui/form-feedback";
import { formatUsd, splitProductName } from "~/lib/formatters";
import { useGetCategoriesQuery, useGetTemplatesQuery } from "~/store/api/catalogAdminApi";
import {
  useAddPurchaseOrderLinesMutation,
  useCreatePurchaseOrderMutation,
  useGetPurchaseOrdersQuery,
  useGetPurchasesQuery,
  useGetSuppliersQuery,
  type Purchase,
  type PurchaseOrder,
} from "~/store/api/inventoryV1Api";
import {
  emptyOrderHeader,
  invoiceGapText,
  invoicesFromOrders,
  orderHeaderPayload,
  OrderHeaderFields,
  validateOrderHeader,
  type OrderHeaderState,
} from "./OrderHeaderFields";
import {
  emptyOrderLine,
  lineTotalUsd,
  OrderLinesEditor,
  orderLinesPayload,
  validateOrderLines,
  type OrderLineErrors,
  type OrderLineState,
} from "./OrderLinesEditor";
import { MISSING_LABELS } from "./PurchaseOrderDialogs";

interface PurchaseFormValues {
  header: OrderHeaderState;
  lines: OrderLineState[];
}

const emptyValues = (): PurchaseFormValues => ({ header: emptyOrderHeader(), lines: [emptyOrderLine()] });

/** La orden ya registrada con ese número, si la hay. */
function findOrder(orders: PurchaseOrder[], orderNumber: string): PurchaseOrder | null {
  const typed = orderNumber.trim().toUpperCase();
  return typed ? orders.find((o) => o.orderNumber.toUpperCase() === typed) ?? null : null;
}

// Las reglas son las de OrderHeaderFields y OrderLinesEditor, que también usan
// «Editar orden» y «Agregar productos».
function purchaseFormSchema(templates: AdminTemplate[], orders: PurchaseOrder[]) {
  return z
    .object({ header: z.custom<OrderHeaderState>(), lines: z.array(z.custom<OrderLineState>()) })
    .superRefine((values, ctx) => {
      const existing = findOrder(orders, values.header.orderNumber);
      const headerErrors = existing ? {} : validateOrderHeader(values.header, { requireSupplier: true });
      for (const [field, message] of Object.entries(headerErrors)) ctx.addIssue({ code: "custom", path: ["header", field], message });
      const lineErrors = validateOrderLines(values.lines, templates);
      values.lines.forEach((line, index) => {
        for (const [field, message] of Object.entries(lineErrors[line.key] ?? {}))
          ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
      });
    });
}

const taxNumber = (value: string) => (value.trim() === "" ? 0 : Number(value));

export function PurchaseOrderForm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [createOrder] = useCreatePurchaseOrderMutation();
  const [addLines] = useAddPurchaseOrderLinesMutation();
  const { data: suppliers = [] } = useGetSuppliersQuery(undefined, { skip: !open });
  const { data: purchases = [] } = useGetPurchasesQuery(undefined, { skip: !open });
  const { data: templates = [] } = useGetTemplatesQuery(undefined, { skip: !open });
  const { data: categories = [] } = useGetCategoriesQuery(undefined, { skip: !open });
  const { data: ordersData, refetch: refetchOrders } = useGetPurchaseOrdersQuery(undefined, { skip: !open });
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Las provisionales (lotes viejos) no se sugieren: sus nombres se repiten.
  const registered = useMemo(() => (ordersData?.orders ?? []).filter((o) => !o.numberProvisional), [ordersData]);
  const invoices = useMemo(() => invoicesFromOrders(ordersData?.orders ?? []), [ordersData]);

  const resolver = useMemo(() => zodResolver(purchaseFormSchema(templates, registered)), [templates, registered]);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PurchaseFormValues>({ resolver, defaultValues: emptyValues() });

  useEffect(() => {
    if (!open) return;
    reset(emptyValues());
    setServerError(null);
  }, [open, reset]);

  const header = watch("header");
  const lines = watch("lines");
  const found = useMemo(() => findOrder(registered, header.orderNumber), [registered, header.orderNumber]);

  const existingLines = useMemo(() => (found ? purchases.filter((p) => p.orderId === found.id) : []), [found, purchases]);
  // Una orden con productos ya tiene su impuesto; si son distintos, lo nuevo va con 0.
  const taxUnit = found && found.lineCount > 0 ? found.taxUnit ?? 0 : taxNumber(header.taxUnit);
  const linesTotal = lines.reduce((sum, line) => sum + lineTotalUsd(line, taxUnit), 0);

  const headerErrors = fieldMessages(errors.header);
  const lineErrors: OrderLineErrors = {};
  lines.forEach((line, index) => {
    const messages = fieldMessages(errors.lines?.[index]);
    if (Object.keys(messages).length) lineErrors[line.key] = messages;
  });

  function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (isDirty && !isSubmitting) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  async function onSubmit(values: PurchaseFormValues) {
    setServerError(null);
    try {
      const payloadLines = orderLinesPayload(values.lines, templates);
      let order: PurchaseOrder;
      if (found) {
        const tax = values.header.taxUnit.trim();
        order = await addLines({
          id: found.id,
          lines: payloadLines,
          ...(found.lineCount === 0 && tax !== "" ? { taxUnit: Number(tax) } : {}),
        }).unwrap();
      } else {
        const payload = await orderHeaderPayload(values.header);
        order = await createOrder({ ...payload, taxUnit: payload.taxUnit ?? 0, lines: payloadLines }).unwrap();
      }
      const count = values.lines.length === 1 ? "1 producto" : `${values.lines.length} productos`;
      toast.success("Compra registrada", { description: `Orden ${order.orderNumber}: ${count} en tránsito.` });
      onOpenChange(false);
    } catch (err) {
      const message = serverErrorMessage(err, "No se pudo guardar la compra.");
      // Otra persona la registró recién: con la lista al día, pasa a "agregar a esa orden".
      if (/ya está registrada/.test(message)) refetchOrders();
      setServerError(message);
    }
  }

  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Registrar compra</DialogTitle>
          </DialogHeader>

          <form ref={formRef} onSubmit={handleSubmit(onSubmit, focusFirstError)} className="flex flex-col gap-6" noValidate>
            <FormErrorBanner message={serverError} />

            <section className="flex flex-col gap-3">
              <h3 className="border-b pb-2 text-sm font-semibold text-foreground">Orden</h3>
              <Controller
                control={control}
                name="header"
                render={({ field }) => (
                  <OrderHeaderFields
                    value={field.value}
                    onChange={(patch) => field.onChange({ ...getValues("header"), ...patch })}
                    errors={headerErrors}
                    suppliers={suppliers}
                    linesTotalUsd={linesTotal}
                    orderOptions={registered}
                    invoices={invoices}
                    existingOrder={found}
                    existingSlot={
                      found && (
                        <ExistingOrderSummary
                          order={found}
                          lines={existingLines}
                          newLinesTotal={linesTotal}
                          onChangeOrder={() => setValue("header", emptyOrderHeader(), { shouldDirty: true })}
                        />
                      )
                    }
                  />
                )}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="border-b pb-2 text-sm font-semibold text-foreground">
                {found ? "Productos que se agregan a la orden" : "Productos de la orden"}
              </h3>
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
                    alreadyInOrder={existingLines}
                  />
                )}
              />
            </section>

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="cancel" onClick={() => requestClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={() => onOpenChange(false)} />
    </>
  );
}

// Lo que la orden ya tiene (para no cargar dos veces lo mismo) y cuánto falta para la factura.
function ExistingOrderSummary({
  order,
  lines,
  newLinesTotal,
  onChangeOrder,
}: {
  order: PurchaseOrder;
  lines: Purchase[];
  newLinesTotal: number;
  onChangeOrder: () => void;
}) {
  const gap = order.invoice ? invoiceGapText(order.invoice.totalUsd, order.invoice.linesTotalUsd + newLinesTotal) : null;
  const otherOrders = order.invoice ? order.invoice.orders.filter((o) => o.id !== order.id) : [];
  const shown = lines.slice(0, 6);
  const arrived = order.status === "received" || order.status === "partial";

  return (
    <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">Esta orden ya está registrada: los productos se agregan a ella.</p>
          <p className="text-muted-foreground">
            {order.supplier ? order.supplier.name : "Sin proveedor"} · {order.lineCount}{" "}
            {order.lineCount === 1 ? "producto cargado" : "productos cargados"} · {order.units.toLocaleString("en-US")} u ·{" "}
            {formatUsd(order.linesTotalUsd)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeOrder}>
          Cambiar de orden
        </Button>
      </div>

      {shown.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {shown.map((p) => {
            const { model, variant } = splitProductName(p.productName ?? "");
            return (
              <li key={p.id}>
                <span className="text-foreground">{model}</span>
                {variant && ` · ${variant}`} · {p.quantity} u
              </li>
            );
          })}
          {lines.length > shown.length && <li>y {lines.length - shown.length} más</li>}
        </ul>
      )}

      {otherOrders.length > 0 && (
        <p className="text-muted-foreground">
          Su factura también cubre {otherOrders.length === 1 ? "la orden" : "las órdenes"}{" "}
          <span className="font-spec">{otherOrders.map((o) => o.orderNumber).join(", ")}</span>.
        </p>
      )}
      {gap && <p className={gap.over ? "text-warning" : "text-muted-foreground"}>Con lo que estás cargando: {gap.text}</p>}
      {arrived && (
        <p className="text-muted-foreground">Esta orden ya llegó: lo que agregues queda en tránsito hasta que lo recibas.</p>
      )}
      {order.missing.length > 0 && (
        <p className="text-warning">
          Le falta: {order.missing.map((m) => MISSING_LABELS[m]).join(", ")}. Lo completás desde la tabla de compras
          (Completar datos).
        </p>
      )}
    </div>
  );
}
