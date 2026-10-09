// Registrar una compra de Alibaba. Las compras se cargan producto por producto
// y muchos comparten la misma orden (y el mismo proveedor): si el número de
// orden ya está registrado, el producto se agrega a esa orden y no se vuelve a
// pedir proveedor, factura ni fotos. Si es nuevo, se registra la orden con su
// encabezado completo; su factura puede ser una ya cargada, porque Alibaba
// parte un pago en varias órdenes con una sola factura. "Guardar y cargar
// otro" deja la orden puesta para el siguiente producto.
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { formatUsd, splitProductName } from "~/lib/formatters";
import { useGetAdminCatalogQuery } from "~/store/api/catalogAdminApi";
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
  type OrderHeaderErrors,
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

type AfterSave = "close" | "another";

export function PurchaseOrderForm({ onDone }: { onDone?: () => void }) {
  const [createOrder, { isLoading: creating }] = useCreatePurchaseOrderMutation();
  const [addLines, { isLoading: adding }] = useAddPurchaseOrderLinesMutation();
  const { data: suppliers = [] } = useGetSuppliersQuery();
  const { data: purchases = [] } = useGetPurchasesQuery();
  const { data: catalog = [] } = useGetAdminCatalogQuery();
  const { data: ordersData, refetch: refetchOrders } = useGetPurchaseOrdersQuery();

  const [header, setHeader] = useState<OrderHeaderState>(emptyOrderHeader);
  const [lines, setLines] = useState<OrderLineState[]>(() => [emptyOrderLine()]);
  const [headerErrors, setHeaderErrors] = useState<OrderHeaderErrors>({});
  const [lineErrors, setLineErrors] = useState<OrderLineErrors>({});
  const [saving, setSaving] = useState(false);
  // La orden recién guardada, por si la lista todavía no se recargó.
  const [lastSaved, setLastSaved] = useState<PurchaseOrder | null>(null);

  // Las provisionales (lotes viejos) no se sugieren: sus nombres se repiten.
  const registered = useMemo(
    () => (ordersData?.orders ?? []).filter((o) => !o.numberProvisional),
    [ordersData],
  );
  const typedNumber = header.orderNumber.trim().toUpperCase();
  const existing = useMemo<PurchaseOrder | null>(() => {
    if (!typedNumber) return null;
    const fromList = registered.find((o) => o.orderNumber.toUpperCase() === typedNumber);
    if (fromList) return fromList;
    return lastSaved && lastSaved.orderNumber.toUpperCase() === typedNumber ? lastSaved : null;
  }, [registered, typedNumber, lastSaved]);
  const invoices = useMemo(() => invoicesFromOrders(ordersData?.orders ?? []), [ordersData]);
  const existingLines = useMemo(
    () => (existing ? purchases.filter((p) => p.orderId === existing.id) : []),
    [existing, purchases],
  );

  const linesTotal = lines.reduce((sum, line) => sum + lineTotalUsd(line), 0);

  /** Deja la orden puesta y un producto vacío para cargar el siguiente. */
  function keepOrder(order: PurchaseOrder) {
    setHeader({
      ...emptyOrderHeader(),
      orderNumber: order.orderNumber,
      // Por si después cambia a otra orden del mismo proveedor y día.
      purchaseDate: order.purchaseDate,
      supplierChoice: order.supplier?.id ?? "",
      // Otra orden del mismo pago suele venir en la misma factura.
      invoiceChoice: order.invoice?.id ?? "",
    });
    setLines([emptyOrderLine()]);
    setHeaderErrors({});
    setLineErrors({});
  }

  function changeOrder() {
    setHeader(emptyOrderHeader());
    setHeaderErrors({});
  }

  async function submit(after: AfterSave) {
    if (saving) return;
    const hErrors = existing
      ? typedNumber.length < 3
        ? { orderNumber: "Escribí el número de orden de Alibaba." }
        : {}
      : validateOrderHeader(header, { requireSupplier: true });
    const lErrors = validateOrderLines(lines, catalog);
    setHeaderErrors(hErrors);
    setLineErrors(lErrors);
    if (Object.keys(hErrors).length || Object.keys(lErrors).length) {
      toast.error("Revisá los campos marcados en rojo.");
      return;
    }
    setSaving(true);
    try {
      let order: PurchaseOrder;
      if (existing) {
        order = await addLines({ id: existing.id, lines: orderLinesPayload(lines) }).unwrap();
        toast.success(
          lines.length === 1
            ? `Producto agregado a la orden ${order.orderNumber}.`
            : `${lines.length} productos agregados a la orden ${order.orderNumber}.`,
        );
      } else {
        const payload = await orderHeaderPayload(header);
        order = await createOrder({ ...payload, lines: orderLinesPayload(lines) }).unwrap();
        toast.success(`Orden ${order.orderNumber} registrada (En tránsito).`);
      }
      setLastSaved(order);
      if (after === "close" && onDone) onDone();
      else keepOrder(order);
    } catch (err: any) {
      const message: string = err?.data?.error || err?.message || "No se pudo guardar la compra.";
      // Otra persona la registró recién: con la lista al día, el formulario
      // pasa solo a "agregar a esa orden".
      if (/ya está registrada/.test(message)) refetchOrders();
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || creating || adding;

  return (
    <div className="space-y-6 p-1">
      <section className="space-y-3">
        <h3 className="border-b pb-2 text-sm font-semibold text-foreground">Orden</h3>
        <OrderHeaderFields
          value={header}
          onChange={(patch) => setHeader((prev) => ({ ...prev, ...patch }))}
          errors={headerErrors}
          suppliers={suppliers}
          linesTotalUsd={linesTotal}
          orderOptions={registered}
          invoices={invoices}
          existingOrder={existing}
          existingSlot={
            existing && (
              <ExistingOrderSummary order={existing} lines={existingLines} newLinesTotal={linesTotal} onChangeOrder={changeOrder} />
            )
          }
        />
      </section>

      <section className="space-y-3">
        <h3 className="border-b pb-2 text-sm font-semibold text-foreground">
          {existing ? "Producto que se agrega a la orden" : "Productos de la orden"}
        </h3>
        <OrderLinesEditor
          lines={lines}
          onChange={setLines}
          errors={lineErrors}
          purchases={purchases}
          alreadyInOrder={existingLines}
        />
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {onDone && (
          <Button type="button" variant="cancel" onClick={onDone}>
            Cancelar
          </Button>
        )}
        {onDone && (
          <Button type="button" variant="outline" onClick={() => submit("close")} disabled={busy}>
            Guardar y cerrar
          </Button>
        )}
        <Button type="button" onClick={() => submit("another")} disabled={busy}>
          {busy && <Spinner className="mr-2" />}
          Guardar y cargar otro producto
        </Button>
      </div>
    </div>
  );
}

// Resumen de la orden ya registrada a la que se agrega el producto: lo que ya
// tiene (para no cargar dos veces lo mismo) y cuánto falta para la factura.
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
    <div className="space-y-2 rounded-card border border-primary/30 bg-primary/5 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">Esta orden ya está registrada: el producto se agrega a ella.</p>
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
