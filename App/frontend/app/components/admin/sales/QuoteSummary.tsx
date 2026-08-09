// Desglose de la cotización en vivo. Portado de `QuoteSummary` de v1, pero
// reconstruido sobre el shape de v2: allá el servidor devolvía totales planos
// (`saleTotal`, `costReal`, `costosFijos`…) más un `linesFinancials`; acá
// `QuoteResult` trae `lines[]` con el desglose POR LÍNEA y tres totales.
//
// Doble capa para el desglose financiero: el backend ya recorta los campos de
// costo según el rol, así que acá NO se decide quién ve qué — simplemente, si
// un campo viene `undefined`, esa fila no se renderiza. Un vendedor nunca ve
// costo real, utilidad ni ganancia de tienda porque no le llegan.
import { HugeIcon } from '~/components/ui/icon';
import { Alert02Icon, ArrowDown01Icon, Invoice01Icon, Wallet01Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';

import { Spinner } from '~/components/ui/spinner';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';
import type { QuoteLine, QuoteResult } from '~/store/api/salesApi';

export function QuoteSummary({
  result,
  loading,
  errorMsg,
}: {
  result: QuoteResult | null;
  loading: boolean;
  errorMsg?: string;
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
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <span className="text-xs text-muted-foreground">Importe total</span>
            <span className="nums block font-heading text-3xl font-bold text-primary-2">
              {formatCordobas(result.total)}
            </span>
          </div>

          {/* Comisión: para el vendedor es SU dato principal, así que va
              destacada arriba del desglose (que puede ni existir para él). */}
          <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 p-3">
            <span className="text-sm font-medium text-foreground">Comisión estimada</span>
            <span className="nums text-xl font-bold text-primary-2">
              {formatCordobas(result.totalComision)}
            </span>
          </div>

          {result.lines.map((line) => (
            <LineBreakdown key={line.productName} line={line} />
          ))}

          {/* Totales de la venta: solo aportan cuando hay más de un producto. */}
          {result.lines.length > 1 && (
            <div className="space-y-1 rounded-lg border-2 border-primary/20 bg-primary/5 p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-2">
                Totales de la venta
              </span>
              <dl className="nums divide-y divide-border/60">
                <Row label="Comisión total" total={formatCordobas(result.totalComision)} />
                {result.totalGananciaTienda !== undefined && (
                  <Row label="Ganancia tienda total" total={formatCordobas(result.totalGananciaTienda)} strong />
                )}
                <Row label="Importe total" total={formatCordobas(result.total)} strong />
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Desglose de una línea. El detalle arranca colapsado cuando hay varias líneas
// para que el resumen quepa de un vistazo; se despliega con el encabezado.
function LineBreakdown({ line }: { line: QuoteLine }) {
  const [expanded, setExpanded] = useState(true);
  const importe = line.precioUnit * line.quantity;

  // Solo el admin recibe estos campos; para el vendedor vienen `undefined` y
  // el bloque entero desaparece.
  const hasFinancials =
    line.costeFinalSnap !== undefined ||
    line.utilidadBruta !== undefined ||
    line.gananciaTienda !== undefined;

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent motion-reduce:transition-none"
      >
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-foreground">
            {line.productName}
          </span>
          <span className="nums block text-[11px] text-muted-foreground">
            {line.quantity} × {formatCordobas(line.precioUnit)} = {formatCordobas(importe)}
          </span>
        </span>
        <HugeIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-2 border-t px-3 py-2">
          {/* Avisos que bloquean el registro */}
          {line.insufficientStock && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} className="shrink-0" aria-hidden />
              Stock insuficiente — disponible: {line.available}.
            </p>
          )}
          {line.belowMinMargin && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} className="shrink-0" aria-hidden />
              El precio queda por debajo del margen mínimo.
            </p>
          )}

          {/* Dos columnas: unitario × cantidad = total. La cadena financiera se
              calcula POR UNIDAD (de ahí sale el tramo de comisión) y recién se
              multiplica, así que mostrar solo el total escondía de dónde salía
              el porcentaje. En móvil no entran dos columnas de cifras: queda
              solo la de totales. */}
          <dl className="nums divide-y divide-border/40 text-xs">
            <div className="flex items-center justify-end gap-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="hidden w-20 text-right sm:block">Unitario</span>
              <span className="w-24 text-right">Total ×{line.quantity}</span>
            </div>

            <Row
              label="Precio"
              unit={formatCordobas(line.precioUnit)}
              total={formatCordobas(importe)}
            />
            {line.costeFinalSnap !== undefined && (
              <Row
                label="Costo real"
                unit={`−${formatCordobas(line.costeFinalSnap)}`}
                // El bug era mostrar acá el costo UNITARIO en una columna de
                // totales: la resta no cerraba (1,900 − 219 ≠ 807).
                total={`−${formatCordobas(line.costoTotal ?? line.costeFinalSnap * line.quantity)}`}
                muted
              />
            )}
            {line.utilidadBruta !== undefined && (
              <Row
                label="Utilidad bruta"
                unit={line.utilidadBrutaUnit !== undefined ? formatCordobas(line.utilidadBrutaUnit) : undefined}
                total={formatCordobas(line.utilidadBruta)}
                sub
              />
            )}
            {line.salary !== undefined && (
              <Row
                label="Fondo de empresa"
                unit={line.salaryUnit !== undefined ? `−${formatCordobas(line.salaryUnit)}` : undefined}
                total={`−${formatCordobas(line.salary)}`}
                muted
              />
            )}
            {line.utilidadNeta !== undefined && (
              <Row
                label="Utilidad neta"
                unit={line.utilidadNetaUnit !== undefined ? formatCordobas(line.utilidadNetaUnit) : undefined}
                total={formatCordobas(line.utilidadNeta)}
                sub
              />
            )}
            <Row
              // El tramo sale de la utilidad neta UNITARIA: la etiqueta lo dice
              // para que se entienda por qué es ese porcentaje y no otro.
              label={`Comisión vendedor (${Math.round(line.comisionPercent * 100)}% de la neta unitaria)`}
              unit={line.comisionUnit !== undefined ? `−${formatCordobas(line.comisionUnit)}` : undefined}
              total={`−${formatCordobas(line.comision)}`}
            />
            {line.gananciaTienda !== undefined && (
              <Row
                label="Ganancia tienda"
                unit={line.gananciaTiendaUnit !== undefined ? formatCordobas(line.gananciaTiendaUnit) : undefined}
                total={formatCordobas(line.gananciaTienda)}
                strong
              />
            )}
          </dl>

          {!hasFinancials && (
            <p className="text-[11px] text-muted-foreground">
              El desglose de costos solo lo ve un administrador.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fila del desglose. `unit` es opcional: para el rol seller el backend no manda
 * los valores unitarios de costo, y la fila cae a una sola columna.
 *
 * Las dos columnas son de ancho fijo (`w-20` / `w-24`) y `text-right`: con ancho
 * automático los dígitos no se alinean entre filas, que es justo lo que hace
 * legible una tabla de números.
 */
function Row({
  label,
  unit,
  total,
  muted,
  sub,
  strong,
}: {
  label: string;
  unit?: string;
  total: string;
  muted?: boolean;
  sub?: boolean;
  strong?: boolean;
}) {
  const tone = strong
    ? 'font-semibold text-foreground'
    : muted || sub
      ? 'text-muted-foreground'
      : 'font-medium text-foreground';
  const valueTone = strong ? 'text-primary-2' : muted || sub ? 'text-muted-foreground' : 'text-foreground';

  return (
    <div className={cn('flex items-center justify-between gap-2 py-1', sub && 'pl-3')}>
      <dt className={cn('min-w-0 flex-1 text-[11px]', tone)}>{label}</dt>
      <dd className="flex shrink-0 items-center gap-4 text-[11px]">
        <span className={cn('hidden w-20 text-right tabular-nums sm:block', valueTone, 'opacity-80')}>
          {unit ?? ''}
        </span>
        <span className={cn('w-24 text-right font-semibold tabular-nums', valueTone)}>{total}</span>
      </dd>
    </div>
  );
}
