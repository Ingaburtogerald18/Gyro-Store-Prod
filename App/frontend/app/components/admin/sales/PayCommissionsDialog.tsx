// Pago de comisiones a UN vendedor (admin). El servidor ya lo resolvía
// (`POST /api/sales/pay` y `/settle-balance`, ver server/services/sellerPayments.ts)
// pero ninguna pantalla lo llamaba: las ventas aprobadas nunca pasaban a
// "pagada" y los ajustes por editar ventas pagadas nunca se saldaban.
//
// El lote es inmutable: registra lo que se entregó. Se elige el vendedor, las
// ventas aprobadas que se le pagan (todas por defecto), el método y el
// comprobante (foto) o una justificación de por qué no lo hay.
import { HugeIcon } from '~/components/ui/icon';
import { Alert02Icon, Upload04Icon, Wallet01Icon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import { errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import { uploadOne } from '~/lib/uploadQueue';
import {
  useGetSalesQuery,
  useGetSellerBalancesQuery,
  usePayCommissionsMutation,
  useSettleSellerBalanceMutation,
  type PayoutProof,
  type SaleListItem,
} from '~/store/api/salesApi';

interface SellerOption {
  email: string;
  name: string;
  sales: SaleListItem[];
  comision: number;
  balance: number;
}

export function PayCommissionsDialog({
  open,
  onClose,
  initialSellerEmail,
}: {
  open: boolean;
  onClose: () => void;
  initialSellerEmail?: string | null;
}) {
  const { data: approved = [], isLoading: loadingSales } = useGetSalesQuery(
    { status: 'approved' },
    { skip: !open },
  );
  const { data: balances = [] } = useGetSellerBalancesQuery(undefined, { skip: !open });
  const [payCommissions, { isLoading: paying }] = usePayCommissionsMutation();
  const [settleBalance, { isLoading: settling }] = useSettleSellerBalanceMutation();

  // Vendedores con algo por cobrar: ventas aprobadas sin pagar y/o saldo de
  // ajustes. La clave es `sellerEmail` (en vendedores esporádicos es el nombre).
  const sellers = useMemo<SellerOption[]>(() => {
    const map = new Map<string, SellerOption>();
    for (const sale of approved) {
      const entry = map.get(sale.sellerEmail) ?? {
        email: sale.sellerEmail,
        name: sale.sellerName || sale.sellerEmail,
        sales: [],
        comision: 0,
        balance: 0,
      };
      entry.sales.push(sale);
      entry.comision += sale.totalComision;
      map.set(sale.sellerEmail, entry);
    }
    for (const b of balances) {
      const entry = map.get(b.sellerEmail) ?? {
        email: b.sellerEmail,
        name: b.sellerName || b.sellerEmail,
        sales: [],
        comision: 0,
        balance: 0,
      };
      entry.balance = b.balance;
      map.set(b.sellerEmail, entry);
    }
    return [...map.values()].sort((a, b) => b.comision + b.balance - (a.comision + a.balance));
  }, [approved, balances]);

  const [sellerEmail, setSellerEmail] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PayoutProof['paymentMethod']>('transferencia');
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);

  // Al abrir: el vendedor sugerido (si vino de la aprobación en lote) o el
  // primero de la lista.
  useEffect(() => {
    if (!open) return;
    const preferred = initialSellerEmail && sellers.some((s) => s.email === initialSellerEmail)
      ? initialSellerEmail
      : sellers[0]?.email ?? '';
    setSellerEmail((current) => (current && sellers.some((s) => s.email === current) ? current : preferred));
  }, [open, initialSellerEmail, sellers]);

  const seller = sellers.find((s) => s.email === sellerEmail) ?? null;

  // Cambiar de vendedor preselecciona TODAS sus ventas: es el caso normal (se
  // le paga el corte entero) y destildar es la excepción.
  useEffect(() => {
    setSelected(new Set(seller?.sales.map((s) => s.id) ?? []));
  }, [seller?.email, seller?.sales.length]);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setComment('');
    setMethod('transferencia');
  }, [open]);

  const selectedSales = seller?.sales.filter((s) => selected.has(s.id)) ?? [];
  const gross = selectedSales.reduce((sum, s) => sum + s.totalComision, 0);
  const balance = seller?.balance ?? 0;
  const total = gross + balance;
  const onlyBalance = selectedSales.length === 0 && balance !== 0;

  const busy = paying || settling || uploading;
  const missingProof = !file && !comment.trim();
  const disabledReason = !seller
    ? 'Elegí un vendedor.'
    : selectedSales.length === 0 && balance === 0
      ? 'Elegí al menos una venta.'
      : missingProof
        ? 'Subí el comprobante o explicá por qué no lo hay.'
        : null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!seller || disabledReason) return;
    try {
      let receiptUrl: string | undefined;
      if (file) {
        setUploading(true);
        try {
          receiptUrl = await uploadOne(file, 'comprobantes-comisiones');
        } finally {
          setUploading(false);
        }
      }
      const proof: PayoutProof = {
        paymentMethod: method,
        receiptUrl,
        noReceiptComment: comment.trim() || undefined,
      };

      if (onlyBalance) {
        await settleBalance({ sellerEmail: seller.email, ...proof }).unwrap();
      } else {
        await payCommissions({
          sellerEmail: seller.email,
          orderIds: selectedSales.map((s) => s.id),
          ...proof,
        }).unwrap();
      }
      toast.success(`Pago a ${seller.name} registrado por ${formatCordobas(total, 'C$', 2)}.`);
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo registrar el pago.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <HugeIcon icon={Wallet01Icon} size={18} strokeWidth={2} aria-hidden />
            Pagar comisiones
          </DialogTitle>
          <DialogDescription>
            Las ventas pagadas pasan a "Pagadas" y el saldo de ajustes queda saldado. El pago no se puede editar
            después.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loadingSales ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Cargando ventas aprobadas…
            </div>
          ) : sellers.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No hay comisiones pendientes de pago.</p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="pay-seller">Vendedor</FieldLabel>
                <Select value={sellerEmail} onValueChange={setSellerEmail} disabled={busy}>
                  <SelectTrigger id="pay-seller">
                    <SelectValue placeholder="Elegí un vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map((s) => (
                      <SelectItem key={s.email} value={s.email}>
                        {s.name} · {formatCordobas(s.comision + s.balance, 'C$', 2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {seller && seller.sales.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {selectedSales.length} de {seller.sales.length} venta{seller.sales.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="font-medium text-primary-2 hover:underline"
                      onClick={() =>
                        setSelected(
                          selectedSales.length === seller.sales.length
                            ? new Set()
                            : new Set(seller.sales.map((s) => s.id)),
                        )
                      }
                      disabled={busy}
                    >
                      {selectedSales.length === seller.sales.length ? 'Quitar todas' : 'Elegir todas'}
                    </button>
                  </div>
                  <ul className="divide-y divide-border rounded-card border border-border">
                    {seller.sales.map((sale) => (
                      <li key={sale.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary-2,#0E7C68)]"
                            checked={selected.has(sale.id)}
                            onChange={() => toggle(sale.id)}
                            disabled={busy}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-foreground">{formatLongDate(sale.createdAt)}</span>
                            <span className="nums block text-xs text-muted-foreground">
                              {sale.invoiceCode ?? 'Sin factura'} ·{' '}
                              {formatCordobas(Math.max(0, sale.total - (sale.deliveryFee ?? 0)), 'C$', 2)}
                            </span>
                          </span>
                          <span className="nums shrink-0 font-medium text-foreground">
                            {formatCordobas(sale.totalComision, 'C$', 2)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {seller && (
                <div className="space-y-1.5 rounded-card border border-border px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comisión de las ventas elegidas</span>
                    <span className="nums">{formatCordobas(gross, 'C$', 2)}</span>
                  </div>
                  {balance !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Ajustes arrastrados {balance < 0 ? '(debe devolver)' : '(a su favor)'}
                      </span>
                      <span className="nums">{formatCordobas(balance, 'C$', 2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-foreground">
                    <span>Total a pagar</span>
                    <span className="nums">{formatCordobas(total, 'C$', 2)}</span>
                  </div>
                  {total < 0 && (
                    <p className="flex items-start gap-1.5 pt-1 text-xs text-warning">
                      <HugeIcon icon={Alert02Icon} size={14} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
                      El total es negativo: el vendedor le debe a la tienda.
                    </p>
                  )}
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="pay-method">Método</FieldLabel>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as PayoutProof['paymentMethod'])}
                  disabled={busy}
                >
                  <SelectTrigger id="pay-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="pay-receipt">Comprobante</FieldLabel>
                <label
                  htmlFor="pay-receipt"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50"
                >
                  <HugeIcon icon={Upload04Icon} size={16} strokeWidth={2} aria-hidden />
                  <span className="min-w-0 truncate">{file ? file.name : 'Subir foto del comprobante'}</span>
                </label>
                <input
                  id="pay-receipt"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                />
                <FieldDescription>Si no hay comprobante (por ejemplo, pago en efectivo), explicalo abajo.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="pay-comment">Comentario</FieldLabel>
                <Textarea
                  id="pay-comment"
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ej. Pagado en efectivo en tienda."
                  disabled={busy}
                />
              </Field>
            </>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border px-5 py-4">
          <Button className="w-full" onClick={handleSubmit} disabled={busy || !!disabledReason || sellers.length === 0}>
            {busy && <Spinner className="mr-2" />}
            {onlyBalance ? 'Saldar ajustes' : 'Registrar pago'} · {formatCordobas(total, 'C$', 2)}
          </Button>
          {disabledReason && sellers.length > 0 && (
            <p className="text-xs text-muted-foreground">{disabledReason}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
