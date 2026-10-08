// Desglose de la cotización en vivo. Portado de `QuoteSummary` de v1, pero
// reconstruido sobre el shape de v2: allá el servidor devolvía totales planos
// (`saleTotal`, `costReal`, `costosFijos`…) más un `linesFinancials`; acá
// `QuoteResult` trae `lines[]` con el desglose POR LÍNEA y tres totales.
//
// El desglose por línea vive en `FinancialBreakdown`: es el MISMO que muestra
// el detalle de una venta ya registrada, solo que acá con números estimados y
// allá con el snapshot congelado. Una sola copia para los dos momentos, igual
// que `commission.ts` hace del lado del cálculo.
import { HugeIcon } from '~/components/ui/icon';
import { Alert02Icon, Invoice01Icon, Wallet01Icon } from '@hugeicons/core-free-icons';

import { Spinner } from '~/components/ui/spinner';
import { formatCordobas } from '~/lib/formatters';
import { ChainRow, LineBreakdown } from './FinancialBreakdown';
import type { QuoteLine, QuoteResult } from '~/store/api/salesApi';
import type { Invoice } from '~/store/api/invoicesApi';

export function QuoteSummary({
  result,
  loading,
  errorMsg,
  invoice,
}: {
  result: QuoteResult | null;
  loading: boolean;
  errorMsg?: string;
  /**
   * Factura ya verificada de la que nace la venta. Cuando existe, el importe
   * que se cobra NO es la suma de las líneas: la cotización no conoce el
   * descuento ni el delivery, y el botón mostraba C$970 mientras acá se leía
   * C$850. Con la factura a mano se imprime el mismo desglose que el ticket.
   */
  invoice?: Invoice | null;
}) {
  return (
    <section className="rounded-card border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <HugeIcon icon={Invoice01Icon} size={16} strokeWidth={2} className="text-primary-2" aria-hidden />
        <h3 className="font-semibold text-foreground">Resumen</h3>
        {loading && <Spinner className="ml-auto" aria-label="Cotizando…" />}
      </header>

      {errorMsg ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
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
            <div className="space-y-1 rounded-lg border-2 border-primary/20 bg-primary/5 p-3">
              <span className="text-2xs font-bold uppercase tracking-wider text-primary-2">
                Totales de la venta
              </span>
              <dl className="nums divide-y divide-border/60">
                <ChainRow label="Comisión total" total={formatCordobas(result.totalComision)} />
                {result.totalGananciaTienda !== undefined && (
                  <ChainRow label="Ganancia tienda total" total={formatCordobas(result.totalGananciaTienda)} strong />
                )}
                {/* Con factura manda SU total: incluye descuento y delivery, que
                    la suma de líneas no conoce. Repetir acá `result.total`
                    contradecía el desglose de arriba y el botón. */}
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

/**
 * Desglose del importe cuando la venta nace de una factura: mismo orden y
 * mismos conceptos que el ticket impreso (subtotal → descuento → delivery →
 * total), para que el vendedor pueda contrastarlo contra el papel que tiene en
 * la mano. Las filas intermedias solo aparecen si tienen valor.
 */
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

/**
 * Avisos del cotizador. El stock insuficiente bloquea; el margen mínimo no
 * (la venta entra marcada para que el admin decida) y solo lo ve el admin. Son lo único del desglose que es propio del
 * cotizador: una venta ya registrada no tiene "stock insuficiente" que avisar,
 * porque la reserva ya se hizo.
 */
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
