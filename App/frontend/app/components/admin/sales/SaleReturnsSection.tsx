// Devoluciones de una venta aprobada o pagada (garantía de 1 mes por defecto de
// fábrica, o un cambio). La unidad vuelve a bodega o sale como merma; la línea
// se recalcula y, si la venta ya se pagó, la diferencia de comisión queda como
// ajuste para el próximo pago. Requiere la migración 0023.
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Field, FieldLabel } from '~/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import {
  useGetSaleReturnsQuery,
  useReturnSaleLineMutation,
  type SaleWithItems,
} from '~/store/api/salesApi';

export function SaleReturnsSection({ sale }: { sale: SaleWithItems }) {
  const { data: returns = [] } = useGetSaleReturnsQuery(sale.id);
  const [returnLine, { isLoading }] = useReturnSaleLineMutation();
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState(sale.items[0]?.productName ?? '');
  const [quantity, setQuantity] = useState('1');
  const [destination, setDestination] = useState<'stock' | 'merma'>('merma');
  const [refund, setRefund] = useState('');
  const [reason, setReason] = useState('');

  const item = sale.items.find((it) => it.productName === productName);
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty > 0 && !!item && qty <= item.quantity;
  const defaultRefund = item && validQty ? item.salePrice * qty : 0;
  const refundValue = refund.trim() === '' ? undefined : Number(refund);
  const validRefund = refundValue === undefined || (Number.isFinite(refundValue) && refundValue >= 0);
  const disabled = !validQty || !validRefund || reason.trim().length < 3 || isLoading;

  async function submit() {
    if (disabled || !item) return;
    try {
      await returnLine({
        id: sale.id,
        body: { productName, quantity: qty, destination, refundAmount: refundValue, reason: reason.trim() },
      }).unwrap();
      toast.success(
        `Devolución registrada: ${qty} × ${productName} ${destination === 'stock' ? 'volvió a bodega' : 'salió como merma'}.`,
      );
      setOpen(false);
      setQuantity('1');
      setRefund('');
      setReason('');
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar la devolución.'));
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Devoluciones</h3>
        {!open && sale.items.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Devolver producto
          </Button>
        )}
      </div>

      {returns.length > 0 && (
        <ul className="divide-y divide-border rounded-card border border-border text-sm">
          {returns.map((r) => (
            <li key={r.id} className="space-y-0.5 px-3 py-2">
              <div className="flex justify-between gap-3">
                <span className="text-foreground">
                  {r.quantity} × {r.productName}
                </span>
                <span className="nums text-muted-foreground">−{formatCordobas(r.refundAmount, 'C$', 2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatLongDate(r.createdAt)} · {r.destination === 'stock' ? 'A bodega' : 'Merma'} · {r.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
      {returns.length === 0 && !open && <p className="text-xs text-muted-foreground">Sin devoluciones.</p>}

      {open && (
        <div className="space-y-3 rounded-card border border-border p-3">
          <Field>
            <FieldLabel htmlFor="return-product">Producto</FieldLabel>
            <Select value={productName} onValueChange={setProductName} disabled={isLoading}>
              <SelectTrigger id="return-product">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sale.items.map((it) => (
                  <SelectItem key={it.productName} value={it.productName}>
                    {it.productName} ({it.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="return-qty">Cantidad</FieldLabel>
              <Input
                id="return-qty"
                type="number"
                min={1}
                max={item?.quantity}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={isLoading}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="return-destination">La unidad va a</FieldLabel>
              <Select value={destination} onValueChange={(v) => setDestination(v as 'stock' | 'merma')} disabled={isLoading}>
                <SelectTrigger id="return-destination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merma">Merma (defectuosa)</SelectItem>
                  <SelectItem value="stock">Bodega (se puede revender)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="return-refund">Reembolso al cliente (C$)</FieldLabel>
            <Input
              id="return-refund"
              type="number"
              min={0}
              step="0.01"
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
              placeholder={`${defaultRefund.toFixed(2)} (0 si fue un cambio)`}
              disabled={isLoading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="return-reason">Motivo</FieldLabel>
            <Textarea
              id="return-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Garantía: dejó de cargar a la semana."
              disabled={isLoading}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            La línea se recalcula. Si la venta ya está pagada, la diferencia de comisión se descuenta en el próximo pago.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={submit} disabled={disabled}>
              {isLoading && <Spinner className="mr-2" />}
              Registrar devolución
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
