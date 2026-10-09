// Diálogos sobre una orden ya registrada: completar o corregir sus datos
// (también las órdenes viejas, que nacen sin proveedor, factura ni fotos) y
// agregarle productos que faltaron al cargarla.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { useGetAdminCatalogQuery } from "~/store/api/catalogAdminApi";
import {
  useAddPurchaseOrderLinesMutation,
  useGetPurchaseOrdersQuery,
  useGetPurchasesQuery,
  useGetSuppliersQuery,
  useUpdatePurchaseOrderMutation,
  type PurchaseOrder,
} from "~/store/api/inventoryV1Api";
import {
  invoicesFromOrders,
  orderHeaderFrom,
  orderHeaderPayload,
  OrderHeaderFields,
  validateOrderHeader,
  type OrderHeaderErrors,
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

export function EditPurchaseOrderDialog({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) {
  const [updateOrder] = useUpdatePurchaseOrderMutation();
  const { data: suppliers = [] } = useGetSuppliersQuery(undefined, { skip: !order });
  const { data: ordersData } = useGetPurchaseOrdersQuery(undefined, { skip: !order });
  const invoices = useMemo(() => invoicesFromOrders(ordersData?.orders ?? []), [ordersData]);
  const [header, setHeader] = useState<OrderHeaderState | null>(null);
  const [errors, setErrors] = useState<OrderHeaderErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHeader(order ? orderHeaderFrom(order) : null);
    setErrors({});
  }, [order]);

  async function submit() {
    if (!order || !header || saving) return;
    const found = validateOrderHeader(header, { requireSupplier: false });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Revisá los campos marcados en rojo.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateOrder({ id: order.id, body: await orderHeaderPayload(header) }).unwrap();
      toast.success(
        updated.missing.length
          ? `Orden guardada. Todavía falta: ${updated.missing.map((m) => MISSING_LABELS[m]).join(", ")}.`
          : "Orden guardada. Ya tiene todos sus datos.",
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "No se pudo guardar la orden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Orden {order?.orderNumber}</DialogTitle>
          {order && order.missing.length > 0 && (
            <DialogDescription>
              Falta: {order.missing.map((m) => MISSING_LABELS[m]).join(", ")}.
            </DialogDescription>
          )}
        </DialogHeader>
        {header && order && (
          <OrderHeaderFields
            value={header}
            onChange={(patch) => setHeader((prev) => (prev ? { ...prev, ...patch } : prev))}
            errors={errors}
            suppliers={suppliers}
            allowNoSupplier
            numberProvisional={order.numberProvisional}
            linesTotalUsd={order.linesTotalUsd}
            invoices={invoices}
            currentInvoiceId={order.invoice?.id ?? null}
          />
        )}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="cancel" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving && <Spinner className="mr-2" />}
            Guardar orden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddOrderLinesDialog({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) {
  const [addLines] = useAddPurchaseOrderLinesMutation();
  const { data: purchases = [] } = useGetPurchasesQuery(undefined, { skip: !order });
  const { data: catalog = [] } = useGetAdminCatalogQuery(undefined, { skip: !order });
  const [lines, setLines] = useState<OrderLineState[]>(() => [emptyOrderLine()]);
  const [errors, setErrors] = useState<OrderLineErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      setLines([emptyOrderLine()]);
      setErrors({});
    }
  }, [order]);

  async function submit() {
    if (!order || saving) return;
    const found = validateOrderLines(lines, catalog);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Revisá los campos marcados en rojo.");
      return;
    }
    setSaving(true);
    try {
      await addLines({ id: order.id, lines: orderLinesPayload(lines) }).unwrap();
      toast.success(`Se ${lines.length === 1 ? "agregó 1 producto" : `agregaron ${lines.length} productos`} a la orden ${order.orderNumber}.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudieron agregar los productos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agregar productos · Orden {order?.orderNumber}</DialogTitle>
          <DialogDescription>Entran "En tránsito", con la fecha de la orden.</DialogDescription>
        </DialogHeader>
        <OrderLinesEditor
          lines={lines}
          onChange={setLines}
          errors={errors}
          purchases={purchases}
          alreadyInOrder={order ? purchases.filter((p) => p.orderId === order.id) : []}
        />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="cancel" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving && <Spinner className="mr-2" />}
            Agregar a la orden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
