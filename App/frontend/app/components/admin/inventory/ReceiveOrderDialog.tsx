// Recibir en Nicaragua. El envío se escribe TOTAL y se reparte entre las
// unidades recibidas (decisión 2026-10-09; por peso/CBM queda para después).
// Se marca qué productos llegaron y cuántos: lo que no llegó sigue en tránsito
// y se recibe después.
//
// Un envío del agente suele traer varias órdenes de Alibaba (una por
// proveedor). Se abre desde una orden y se le suman las demás que llegaron en
// el mismo envío: el envío total se divide entre las unidades de todas.
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "~/components/ui/field";
import { HugeIcon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Spinner } from "~/components/ui/spinner";
import { formatCordobas, formatUsd, splitProductName } from "~/lib/formatters";
import {
  useReceivePurchaseOrderMutation,
  useSimulateOrderReceiptMutation,
  type Purchase,
  type PurchaseOrder,
  type ReceiptPreview,
} from "~/store/api/inventoryV1Api";

interface RowState {
  selected: boolean;
  received: string;
  salePrice: string;
  /** El precio lo escribió la persona: el sugerido ya no lo pisa. */
  priceTouched: boolean;
}

const toNumber = (v: string) => (v.trim() === "" ? NaN : Number(v));

// Sin estado guardado, una línea entra marcada y con lo pedido como recibido.
const defaultRow = (p: Purchase): RowState => ({
  selected: true,
  received: String(p.quantity),
  salePrice: "",
  priceTouched: false,
});

const orderLabel = (o: PurchaseOrder) =>
  `Orden ${o.orderNumber}${o.numberProvisional ? " (provisional)" : ""}${o.supplier ? ` · ${o.supplier.name}` : ""}`;

export function ReceiveOrderDialog({
  order,
  orders,
  purchases,
  onClose,
}: {
  order: PurchaseOrder | null;
  /** Todas las órdenes: de ahí salen las que llegaron en el mismo envío. */
  orders: PurchaseOrder[];
  /** Todas las líneas (se reciben las que siguen en tránsito). */
  purchases: Purchase[];
  onClose: () => void;
}) {
  const [receive, { isLoading }] = useReceivePurchaseOrderMutation();
  const [simulate] = useSimulateOrderReceiptMutation();

  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [arrivalDate, setArrivalDate] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [shippingTotal, setShippingTotal] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [preview, setPreview] = useState<ReceiptPreview | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"arrivalDate" | "shippingTotal" | "exchangeRate" | "lines", string>>>({});

  // Al abrir, todo limpio. Las filas no se inicializan acá: sin estado, cada
  // línea usa `defaultRow`, así sirve igual si las líneas cargan tarde o se
  // suma otra orden.
  useEffect(() => {
    if (!order) return;
    setExtraIds([]);
    setArrivalDate("");
    setExchangeRate("");
    setShippingTotal("");
    setRows({});
    setPreview(null);
    setErrors({});
  }, [order?.id]);

  const pendingOf = useMemo(() => {
    const map = new Map<string, Purchase[]>();
    for (const p of purchases) {
      if (p.status !== "china" || !p.orderId) continue;
      map.set(p.orderId, [...(map.get(p.orderId) ?? []), p]);
    }
    return map;
  }, [purchases]);

  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const shipment = useMemo(
    () =>
      order
        ? [order, ...extraIds.map((id) => ordersById.get(id)).filter((o): o is PurchaseOrder => !!o)]
        : [],
    [order, extraIds, ordersById],
  );
  const groups = shipment.map((o) => ({ order: o, lines: pendingOf.get(o.id) ?? [] }));
  const pending = groups.flatMap((g) => g.lines);
  // Otras órdenes con algo en tránsito que se pueden sumar a este envío.
  const candidates = orders.filter(
    (o) => !shipment.some((s) => s.id === o.id) && (pendingOf.get(o.id)?.length ?? 0) > 0,
  );

  const rowOf = (p: Purchase) => rows[p.id] ?? defaultRow(p);
  const setRow = (p: Purchase, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? defaultRow(p)), ...patch } }));

  const selectedLines = pending
    .filter((p) => rowOf(p).selected)
    .map((p) => ({ purchase: p, received: toNumber(rowOf(p).received) }));
  const validQuantities = selectedLines.every((l) => Number.isInteger(l.received) && l.received > 0);
  const totalUnits = validQuantities ? selectedLines.reduce((s, l) => s + l.received, 0) : 0;
  const shippingValue = toNumber(shippingTotal);
  const rateValue = toNumber(exchangeRate);
  const shippingUnit = totalUnits > 0 && Number.isFinite(shippingValue) ? shippingValue / totalUnits : null;
  const extraOrderIds = extraIds.length ? extraIds : undefined;

  // Vista previa del costo y el precio sugerido de cada línea.
  const previewKey = JSON.stringify({
    extraIds,
    lines: selectedLines.map((l) => [l.purchase.id, l.received]),
    shippingTotal,
    exchangeRate,
  });
  useEffect(() => {
    if (!order || selectedLines.length === 0 || !validQuantities || !Number.isFinite(shippingValue) || shippingValue < 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      simulate({
        id: order.id,
        body: {
          extraOrderIds,
          shippingTotalUsd: shippingValue,
          exchangeRate: rateValue > 0 ? rateValue : undefined,
          lines: selectedLines.map((l) => ({ purchaseId: l.purchase.id, receivedQuantity: l.received })),
        },
      })
        .unwrap()
        .then((result) => {
          setPreview(result);
          // El sugerido llena el precio mientras nadie lo haya escrito a mano.
          setRows((prev) => {
            const next = { ...prev };
            for (const line of result.lines) {
              const p = pending.find((x) => x.id === line.purchaseId);
              if (!p) continue;
              const row = next[line.purchaseId] ?? defaultRow(p);
              if (!row.priceTouched) next[line.purchaseId] = { ...row, salePrice: String(line.precioSugerido) };
            }
            return next;
          });
        })
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, order?.id]);

  async function submit() {
    if (!order) return;
    const found: typeof errors = {};
    if (!arrivalDate) found.arrivalDate = "Elegí la fecha de llegada.";
    if (!Number.isFinite(shippingValue) || shippingValue < 0) found.shippingTotal = "Escribí el envío total (0 si no hubo).";
    if (exchangeRate.trim() !== "" && !(rateValue > 0 && rateValue <= 1000)) found.exchangeRate = "Revisá la tasa.";
    if (selectedLines.length === 0) found.lines = "Marcá al menos un producto que llegó.";
    else if (!validQuantities) found.lines = "Lo recibido tiene que ser un número mayor a 0.";
    else if (selectedLines.some((l) => rowOf(l.purchase).salePrice.trim() !== "" && !(toNumber(rowOf(l.purchase).salePrice) >= 0))) {
      found.lines = "Revisá los precios de venta.";
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    try {
      const result = await receive({
        id: order.id,
        body: {
          arrivalDate,
          extraOrderIds,
          shippingTotalUsd: shippingValue,
          exchangeRate: rateValue > 0 ? rateValue : undefined,
          lines: selectedLines.map((l) => {
            const price = toNumber(rowOf(l.purchase).salePrice);
            return {
              purchaseId: l.purchase.id,
              receivedQuantity: l.received,
              ...(Number.isFinite(price) ? { salePrice: price } : {}),
            };
          }),
        },
      }).unwrap();
      const left = pending.length - result.received;
      toast.success(
        left > 0
          ? `Llegada registrada: ${result.received} producto(s) en bodega, ${left} siguen en tránsito.`
          : shipment.length > 1
            ? `Llegada registrada. Las ${shipment.length} órdenes ya están en bodega.`
            : "Llegada registrada. La orden ya está en bodega.",
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo registrar la llegada.");
    }
  }

  const previewById = new Map((preview?.lines ?? []).map((l) => [l.purchaseId, l]));
  const multiple = shipment.length > 1;

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{multiple ? `Recibir envío (${shipment.length} órdenes)` : `Recibir orden ${order?.orderNumber ?? ""}`}</DialogTitle>
          <DialogDescription>
            Marcá lo que llegó. Lo que no marques sigue en tránsito y lo recibís después.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field data-invalid={!!errors.arrivalDate}>
            <FieldLabel htmlFor="receive-date" required>
              Fecha de llegada a Nicaragua
            </FieldLabel>
            <DatePicker id="receive-date" value={arrivalDate} onChange={setArrivalDate} />
            <FieldError errors={[errors.arrivalDate ? { message: errors.arrivalDate } : undefined]} />
          </Field>
          <Field data-invalid={!!errors.shippingTotal}>
            <FieldLabel htmlFor="receive-shipping" required>
              {multiple ? "Envío total de todo el envío (USD)" : "Envío total (USD)"}
            </FieldLabel>
            <Input
              id="receive-shipping"
              type="number"
              step="0.01"
              min={0}
              value={shippingTotal}
              onChange={(e) => setShippingTotal(e.target.value)}
              aria-invalid={!!errors.shippingTotal}
            />
            <FieldDescription>
              {shippingUnit != null
                ? `${formatUsd(shippingValue)} ÷ ${totalUnits.toLocaleString("en-US")} u = ${formatUsd(shippingUnit, 4)} por unidad`
                : "Se divide entre las unidades recibidas."}
            </FieldDescription>
            <FieldError errors={[errors.shippingTotal ? { message: errors.shippingTotal } : undefined]} />
          </Field>
          <Field data-invalid={!!errors.exchangeRate}>
            <FieldLabel htmlFor="receive-rate">Tasa (C$ por USD)</FieldLabel>
            <Input
              id="receive-rate"
              type="number"
              step="0.0001"
              min={0}
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              placeholder={preview ? String(preview.exchangeRate) : "La de Configuración"}
              aria-invalid={!!errors.exchangeRate}
            />
            <FieldDescription>Vacía = la de Configuración. Queda fija en cada producto.</FieldDescription>
            <FieldError errors={[errors.exchangeRate ? { message: errors.exchangeRate } : undefined]} />
          </Field>
        </div>

        {(candidates.length > 0 || multiple) && (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium text-foreground">Órdenes en este envío</p>
            <div className="flex flex-wrap gap-2">
              {shipment.map((o) => (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
                >
                  {orderLabel(o)}
                  {o.id !== order?.id && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Quitar la orden ${o.orderNumber} de este envío`}
                      onClick={() => setExtraIds((prev) => prev.filter((id) => id !== o.id))}
                    >
                      <HugeIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {candidates.length > 0 && (
              <NativeSelect
                aria-label="Sumar otra orden que llegó en este envío"
                className="w-full sm:w-auto"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) setExtraIds((prev) => [...prev, id]);
                }}
              >
                <NativeSelectOption value="">+ Sumar otra orden que vino en este envío</NativeSelectOption>
                {candidates.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {orderLabel(o)} · {pendingOf.get(o.id)?.length ?? 0} en tránsito
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
        )}

        <Table className="min-w-[720px] tabular-nums">
            <TableHeader>
              <tr>
                <TableHead className="px-3 w-px">
                  <span className="sr-only">Llegó</span>
                </TableHead>
                <TableHead className="px-3">Producto</TableHead>
                <TableHead className="px-3 text-right">Pedido</TableHead>
                <TableHead className="px-3">Recibido</TableHead>
                <TableHead className="px-3 text-right">Costo final</TableHead>
                <TableHead className="px-3">Precio de venta (C$)</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {pending.length === 0 && (
                <tr>
                  <TableCell colSpan={6} className="h-auto py-8 text-center text-muted-foreground">
                    Todos los productos de esta orden ya están en bodega.
                  </TableCell>
                </tr>
              )}
              {groups.map(({ order: o, lines }) => (
                <Fragment key={o.id}>
                  {multiple && (
                    <tr className="border-b border-border bg-muted">
                      <TableCell colSpan={6} className="h-auto py-1.5 text-xs font-medium text-muted-foreground">
                        {orderLabel(o)} · {lines.length} en tránsito
                      </TableCell>
                    </tr>
                  )}
                  {lines.map((p) => {
                    const row = rowOf(p);
                    const { model, variant } = splitProductName(p.productName);
                    const received = toNumber(row.received);
                    const short = Number.isInteger(received) && received < p.quantity ? p.quantity - received : 0;
                    const line = previewById.get(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="px-3">
                          <input
                            type="checkbox"
                            className="size-4 rounded-sm accent-primary"
                            checked={row.selected}
                            onChange={(e) => setRow(p, { selected: e.target.checked })}
                            aria-label={`Llegó ${p.productName}`}
                          />
                        </TableCell>
                        <TableCell className="px-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{model}</span>
                            <span className="text-xs text-muted-foreground">
                              {variant ? `${variant} · ` : ""}
                              <span className="font-spec">{p.code}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 text-right">{p.quantity}</TableCell>
                        <TableCell className="px-3">
                          <Input
                            type="number"
                            min={1}
                            className="h-9 w-24"
                            disabled={!row.selected}
                            value={row.received}
                            onChange={(e) => setRow(p, { received: e.target.value })}
                            aria-label={`Recibido de ${p.productName}`}
                          />
                          {row.selected && short > 0 && (
                            <span className="mt-1 block text-2xs font-medium text-warning">Faltan {short}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 text-right">
                          {row.selected && line ? formatCordobas(line.costeFinal, "C$", 2) : "—"}
                        </TableCell>
                        <TableCell className="px-3">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-9 w-28 font-semibold"
                            disabled={!row.selected}
                            value={row.salePrice}
                            onChange={(e) => setRow(p, { salePrice: e.target.value, priceTouched: true })}
                            aria-label={`Precio de venta de ${p.productName}`}
                          />
                          {row.selected && line && (
                            <span className="mt-1 block text-2xs text-muted-foreground">
                              Sugerido {formatCordobas(line.precioSugerido, "C$", 2)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
        </Table>
        {errors.lines && <FieldError errors={[{ message: errors.lines }]} />}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="cancel" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={isLoading || pending.length === 0}>
            {isLoading && <Spinner className="mr-2" />}
            Confirmar llegada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
