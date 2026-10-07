// Ajuste de stock de un lote: merma (defecto, rotura, pérdida) o corrección de
// conteo, siempre con motivo. Cada ajuste queda en el historial del lote
// (`stock_movements`, migración 0023), junto con las devoluciones de ventas.
import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Field, FieldLabel } from "~/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { errMsg, formatCordobas, formatLongDate } from "~/lib/formatters";
import {
  useAdjustStockMutation,
  useGetStockMovementsQuery,
  type InventoryRow,
  type StockMovementKind,
} from "~/store/api/inventoryV1Api";

const KIND_LABEL: Record<StockMovementKind, string> = {
  write_off: "Merma",
  adjust_out: "Salida por conteo",
  adjust_in: "Entrada por conteo",
  return_to_stock: "Devolución a bodega",
};

type AdjustKind = "write_off" | "adjust_out" | "adjust_in";

export function StockAdjustDialog({ lot, onClose }: { lot: InventoryRow | null; onClose: () => void }) {
  const [adjust, { isLoading }] = useAdjustStockMutation();
  const { data: movements = [], isFetching } = useGetStockMovementsQuery(lot?.id ?? "", { skip: !lot });
  const [kind, setKind] = useState<AdjustKind>("write_off");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");

  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty > 0;
  const exceeds = kind !== "adjust_in" && lot != null && validQty && qty > (lot.available ?? 0);
  const disabled = !lot || !validQty || exceeds || reason.trim().length < 3 || isLoading;

  function close() {
    setKind("write_off");
    setQuantity("1");
    setReason("");
    onClose();
  }

  async function submit() {
    if (!lot || disabled) return;
    try {
      const res = await adjust({ id: lot.id, body: { kind, quantity: qty, reason: reason.trim() } }).unwrap();
      toast.success(`Lote ${lot.code}: quedan ${res.available} unidad(es) disponibles.`);
      close();
    } catch (err) {
      toast.error(errMsg(err, "No se pudo ajustar el stock."));
    }
  }

  return (
    <Dialog open={!!lot} onOpenChange={(open) => !open && !isLoading && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription>
            {lot?.productName} · <span className="font-spec">{lot?.code}</span> · {lot?.available ?? 0} disponible(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field>
            <FieldLabel htmlFor="adjust-kind">Tipo</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as AdjustKind)} disabled={isLoading}>
              <SelectTrigger id="adjust-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="write_off">Merma (defecto, rotura, pérdida)</SelectItem>
                <SelectItem value="adjust_out">Salida por conteo</SelectItem>
                <SelectItem value="adjust_in">Entrada por conteo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="adjust-qty">Cantidad</FieldLabel>
            <Input
              id="adjust-qty"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isLoading}
            />
            {exceeds && <p className="text-xs text-destructive">Solo hay {lot?.available ?? 0} disponible(s) para sacar.</p>}
          </Field>
          <Field>
            <FieldLabel htmlFor="adjust-reason">Motivo</FieldLabel>
            <Textarea
              id="adjust-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Llegó con el cable roto."
              disabled={isLoading}
            />
          </Field>
          <Button className="w-full" onClick={submit} disabled={disabled}>
            {isLoading && <Spinner className="mr-2" />}
            Guardar ajuste
          </Button>
        </div>

        <div className="mt-2 space-y-2 border-t pt-3">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Historial del lote</p>
          {isFetching && movements.length === 0 ? (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          ) : movements.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin ajustes ni devoluciones.</p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
              {movements.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-foreground">
                      {KIND_LABEL[m.kind]} · {m.kind === "adjust_in" || m.kind === "return_to_stock" ? "+" : "−"}
                      {m.quantity}
                    </span>
                    <span className="block truncate text-muted-foreground">{m.reason}</span>
                  </span>
                  <span className="shrink-0 text-right text-muted-foreground">
                    {formatLongDate(m.createdAt)}
                    {m.kind === "write_off" && m.unitCostCs != null && (
                      <span className="block">{formatCordobas(m.unitCostCs * m.quantity)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
