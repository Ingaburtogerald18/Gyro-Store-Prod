// Desglose de la cotización en vivo; el detalle por línea es el mismo FinancialBreakdown del detalle
// de una venta, con números estimados.
import { HugeIcon } from '~/components/ui/icon';
import { Alert02Icon, Invoice01Icon, Wallet01Icon } from '@hugeicons/core-free-icons';

import { Spinner } from '~/components/ui/spinner';
import { formatCordobas } from '~/lib/formatters';
import { ChainRow, LineBreakdown } from './financial-breakdown';
import type { QuoteLine, QuoteResult } from '~/state/api/sales-api';
import type { Invoice } from '~/state/api/invoices-api';

export function QuoteSummary({
  result,
  loading,
  errorMsg,
  invoice,
}: {
  result: QuoteResult | null;
  loading: boolean;
  errorMsg?: string;
  /** Con factura, el importe es el de la factura: la cotización no conoce descuento ni delivery. */
  invoice?: Invoice | null;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <HugeIcon icon={Invoice01Icon} size={16} strokeWidth={2} className="text-primary-2" aria-hidden />
        <h3 className="font-semibold text-foreground">Resumen</h3>
        {loading && <Spinner className="ml-auto" aria-label="Cotizando…" />}
      </header>

      {errorMsg ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {errorMsg}
        </p>
      ) : !result ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <HugeIcon icon={Wallet01Icon} size={32} strokeWidth={2} className="text-muted-foreground opacity-40" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Agregá producto, cantidad y precio para ver la estimación.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Importe total */}
          {invoice ? (
            <InvoiceTotalBreakdown invoice={invoice} />
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <span className="text-xs text-muted-foreground">Importe total</span>
              <span className="nums block font-heading text-3xl font-bold text-primary-2">
                {formatCordobas(result.total)}
              </span>
            </div>
          )}

          {/* Comisión: para el vendedor es SU dato principal, así que va
              destacada arriba del desglose (que puede ni existir para él). */}
          <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 p-3">
            <span className="text-sm font-medium text-foreground">Comisión estimada</span>
            <span className="nums text-xl font-bold text-primary-2">
              {formatCordobas(result.totalComision)}
            </span>
          </div>

          {result.lines.map((line) => (
            <LineBreakdown key={line.productName} line={line} warnings={<QuoteWarnings line={line} />} />
          ))}

          {/* Totales de la venta: solo aportan cuando hay más de un producto. */}
          {result.lines.length > 1 && (
            <div className="space-y-1 rounded-2xl border-2 border-primary/20 bg-primary/5 p-3">
              <span className="text-2xs font-bold uppercase tracking-wider text-primary-2">
                Totales de la venta
              </span>
              <dl className="nums divide-y divide-border/60">
                <ChainRow label="Comisión total" total={formatCordobas(result.totalComision)} />
                {result.totalGananciaTienda !== undefined && (
                  <ChainRow label="Ganancia tienda total" total={formatCordobas(result.totalGananciaTienda)} strong />
                )}
                {/* Con factura manda su total (incluye descuento y delivery). */}
                <ChainRow
                  label={invoice ? 'Total a cobrar' : 'Importe total'}
                  total={formatCordobas(invoice ? invoice.total : result.total)}
                  strong
                />
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Mismo orden que el ticket impreso (subtotal → descuento → delivery → total) para contrastarlo. */
function InvoiceTotalBreakdown({ invoice }: { invoice: Invoice }) {
  const subtotal = invoice.subtotal ?? 0;
  const discount = invoice.discount ?? 0;
  const deliveryFee = invoice.deliveryFee ?? 0;
  const hasExtras = discount > 0 || deliveryFee > 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      {hasExtras && (
        <dl className="nums mb-2 space-y-1 border-b border-primary/15 pb-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Subtotal productos</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatCordobas(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Descuento</dt>
              <dd className="font-medium tabular-nums text-muted-foreground">
                −{formatCordobas(discount)}
              </dd>
            </div>
          )}
          {deliveryFee > 0 && (
            <div className="flex items-center justify-between gap-2">
              <dt className="min-w-0 truncate text-muted-foreground">
                Delivery{invoice.deliveryName ? ` · ${invoice.deliveryName}` : ''}
              </dt>
              <dd className="shrink-0 font-medium tabular-nums text-foreground">
                +{formatCordobas(deliveryFee)}
              </dd>
            </div>
          )}
        </dl>
      )}

      <span className="text-xs text-muted-foreground">
        {hasExtras ? 'Total a cobrar' : 'Importe total'} · factura {invoice.invoiceCode}
      </span>
      <span className="nums block font-heading text-3xl font-bold text-primary-2">
        {formatCordobas(invoice.total)}
      </span>

      {deliveryFee > 0 && (
        <p className="mt-2 text-2xs leading-snug text-muted-foreground">
          El envío no genera comisión ni entra en las ventas de reportería: se
          informa aparte, en el reporte de Delivery.
        </p>
      )}
    </div>
  );
}

/** El stock insuficiente bloquea; el margen mínimo no (lo ve solo el admin). Son propios del cotizador. */
function QuoteWarnings({ line }: { line: QuoteLine }) {
  if (!line.insufficientStock && !line.belowMinMargin) return null;

  return (
    <>
      {line.insufficientStock && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} className="shrink-0" aria-hidden />
          Stock insuficiente — disponible: {line.available}.
        </p>
      )}
      {line.belowMinMargin && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} className="shrink-0" aria-hidden />
          Bajo el margen mínimo: la venta queda marcada para revisar al aprobar.
        </p>
      )}
    </>
  );
}
