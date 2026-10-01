// La cadena financiera de una línea (doc 11 §4) y el reparto en pozos (§2),
// dibujados una sola vez para los dos momentos en que se miran:
//
//   · el cotizador, ANTES de registrar — números estimados;
//   · el detalle de una venta, DESPUÉS — el snapshot congelado en order_items.
//
// Vivían duplicados: `QuoteSummary` tenía su propio `LineBreakdown` y
// `CostDistributionCard` su propia pila de barras de pozos. Son la misma
// información leída en dos pantallas, y dos copias divergen — que es justo lo
// que `commission.ts` evita del lado del cálculo con una función única para los
// dos momentos. Acá se hace lo mismo del lado del dibujo.
//
// Doble capa para lo sensible: el backend ya recorta los campos de costo según
// el rol, así que acá NO se decide quién ve qué — si un campo viene `undefined`,
// su fila no se renderiza. Un vendedor nunca ve costo, utilidad ni pozos porque
// no le llegan.
import { HugeIcon } from '~/components/ui/icon';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { useState, type ReactNode } from 'react';

import { Progress } from '~/components/ui/progress';
import { formatCordobas } from '~/lib/formatters';
import { cn } from '~/lib/utils';

/**
 * Lo que necesita el desglose, sin atarse a `QuoteLine` ni a `SaleWithItems`.
 * Todo lo financiero es opcional: es lo que el backend poda por rol.
 */
export interface FinancialChainLine {
  productName: string;
  quantity: number;
  precioUnit: number;
  /** Costo de UNA unidad. */
  costeFinalSnap?: number;
  /** Costo de todas las unidades de la línea. */
  costoTotal?: number;
  utilidadBruta?: number;
  salary?: number;
  utilidadNeta?: number;
  comision?: number;
  /** Fracción (0.40 = 40%). Su tramo se busca por la utilidad neta UNITARIA. */
  comisionPercent?: number;
  gananciaTienda?: number;

  // La misma cadena por unidad: el desglose muestra las dos columnas.
  utilidadBrutaUnit?: number;
  salaryUnit?: number;
  utilidadNetaUnit?: number;
  comisionUnit?: number;
  gananciaTiendaUnit?: number;

  /** Reparto del Costo F/U de esta línea en los 7 pozos (doc 11 §2). */
  pozos?: Record<string, number>;
}

/**
 * Desglose de una línea, colapsable.
 *
 * `defaultExpanded` porque los dos usos quieren cosas distintas: el cotizador
 * abre el detalle de una sola línea que estás construyendo, y el detalle de una
 * venta con cinco productos sería un muro si arrancara todo abierto.
 */
export function LineBreakdown({
  line,
  defaultExpanded = true,
  warnings,
}: {
  line: FinancialChainLine;
  defaultExpanded?: boolean;
  /** Avisos propios del cotizador (stock, margen mínimo). */
  warnings?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
          <span className="nums block text-2xs text-muted-foreground">
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
          {warnings}

          {/* Dos columnas: unitario × cantidad = total. La cadena financiera se
              calcula POR UNIDAD (de ahí sale el tramo de comisión) y recién se
              multiplica, así que mostrar solo el total escondía de dónde salía
              el porcentaje. En móvil no entran dos columnas de cifras: queda
              solo la de totales. */}
          <dl className="nums divide-y divide-border/40 text-xs">
            <div className="flex items-center justify-end gap-4 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="hidden w-20 text-right sm:block">Unitario</span>
              <span className="w-24 text-right">Total ×{line.quantity}</span>
            </div>

            <ChainRow
              label="Precio"
              unit={formatCordobas(line.precioUnit)}
              total={formatCordobas(importe)}
            />
            {line.costeFinalSnap !== undefined && (
              <ChainRow
                label="Costo real"
                unit={`−${formatCordobas(line.costeFinalSnap)}`}
                // El bug era mostrar acá el costo UNITARIO en una columna de
                // totales: la resta no cerraba (1,900 − 219 ≠ 807).
                total={`−${formatCordobas(line.costoTotal ?? line.costeFinalSnap * line.quantity)}`}
                muted
              />
            )}
            {line.utilidadBruta !== undefined && (
              <ChainRow
                label="Utilidad bruta"
                unit={line.utilidadBrutaUnit !== undefined ? formatCordobas(line.utilidadBrutaUnit) : undefined}
                total={formatCordobas(line.utilidadBruta)}
                sub
              />
            )}
            {line.salary !== undefined && (
              <ChainRow
                label="Fondo de empresa"
                unit={line.salaryUnit !== undefined ? `−${formatCordobas(line.salaryUnit)}` : undefined}
                total={`−${formatCordobas(line.salary)}`}
                muted
              />
            )}
            {line.utilidadNeta !== undefined && (
              <ChainRow
                label="Utilidad neta"
                unit={line.utilidadNetaUnit !== undefined ? formatCordobas(line.utilidadNetaUnit) : undefined}
                total={formatCordobas(line.utilidadNeta)}
                sub
              />
            )}
            {line.comision !== undefined && (
              <ChainRow
                // El tramo sale de la utilidad neta UNITARIA: la etiqueta lo dice
                // para que se entienda por qué es ese porcentaje y no otro. Al
                // vendedor no le llega el %, y ahí la fila queda sin paréntesis.
                label={
                  line.comisionPercent !== undefined
                    ? `Comisión vendedor (${Math.round(line.comisionPercent * 100)}% de la neta unitaria)`
                    : 'Comisión vendedor'
                }
                unit={line.comisionUnit !== undefined ? `−${formatCordobas(line.comisionUnit)}` : undefined}
                total={`−${formatCordobas(line.comision)}`}
              />
            )}
            {line.gananciaTienda !== undefined && (
              <ChainRow
                label="Ganancia tienda"
                unit={line.gananciaTiendaUnit !== undefined ? formatCordobas(line.gananciaTiendaUnit) : undefined}
                total={formatCordobas(line.gananciaTienda)}
                strong
              />
            )}
          </dl>

          {!hasFinancials && (
            <p className="text-2xs text-muted-foreground">
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
export function ChainRow({
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
      <dt className={cn('min-w-0 flex-1 text-2xs', tone)}>{label}</dt>
      <dd className="flex shrink-0 items-center gap-4 text-2xs">
        <span className={cn('hidden w-20 text-right tabular-nums sm:block', valueTone, 'opacity-80')}>
          {unit ?? ''}
        </span>
        <span className={cn('w-24 text-right font-semibold tabular-nums', valueTone)}>{total}</span>
      </dd>
    </div>
  );
}

// ── Pozos ──────────────────────────────────────────────────────────────────

/** Nombre a mostrar de cada pozo: los mismos que usa Gastos (server/services/reports.ts). */
const POZO_LABELS: Record<string, string> = {
  publicidad: 'Publicidad',
  mantenimiento: 'Mantenimiento',
  utiles: 'Útiles de Oficina',
  garantias: 'Garantías',
  prestamos: 'Préstamos',
  suscripciones: 'Suscripciones',
  servicios: 'Servicios Básicos',
};

/** Los 7 pozos del doc 11 §2, en el orden en que se reparte el Costo F/U. */
export const POZOS = [
  'publicidad',
  'mantenimiento',
  'utiles',
  'garantias',
  'prestamos',
  'suscripciones',
  'servicios',
] as const;

/**
 * Suma el reparto de varias líneas en un único set de 7 pozos.
 *
 * Se redondea a centavos al cerrar cada pozo: acumular flotantes deja cosas como
 * `14.700000000000001`, y aunque `formatCordobas` lo esconda al imprimir, el
 * valor crudo también alimenta el cálculo de porcentajes de las barras.
 */
export function sumPozos(lines: { pozos?: Record<string, number> }[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const line of lines) {
    for (const [key, amount] of Object.entries(line.pozos ?? {})) {
      acc[key] = (acc[key] ?? 0) + (amount || 0);
    }
  }
  for (const key of Object.keys(acc)) {
    acc[key] = Math.round(acc[key] * 100) / 100;
  }
  return acc;
}

/**
 * El reparto del Costo F/U como barras, de mayor a menor.
 *
 * La barra mide el % SOBRE EL TOTAL repartido, no sobre el pozo más grande. Con
 * `amount / max` el mayor llegaba SIEMPRE al 100% aunque se llevara el 22% del
 * Costo F/U, y el gráfico decía lo mismo con cualquier dato: era un ranking
 * disfrazado de proporción. Así las siete barras suman 100%.
 *
 * `barsReady` lo maneja quien llama: las barras entran desde 0 en el primer
 * frame tras montar para que se vea el llenado.
 */
export function PozosBars({
  pozos,
  formatMoney,
  barsReady,
}: {
  pozos: Record<string, number>;
  formatMoney: (n: number) => string;
  barsReady: boolean;
}) {
  const total = Object.values(pozos || {}).reduce((sum, v) => sum + (v || 0), 0);

  // De mayor a menor, no en el orden fijo del array `POZOS`: esto es un ranking
  // de a dónde se va el costo fijo, y un ranking se lee ordenado.
  const ordenados = [...POZOS]
    .map((pozoKey) => ({ pozoKey, amount: pozos?.[pozoKey] || 0 }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-3">
      {ordenados.map(({ pozoKey, amount }, i) => {
        const pct = total > 0 ? (amount / total) * 100 : 0;
        // Los tres mayores en primary pleno; los cuatro restantes atenuados.
        // Siete barras del mismo color son monótonas y hay que leer los siete
        // números para encontrar el mayor.
        const destacado = i < 3;

        return (
          <div key={pozoKey} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">{POZO_LABELS[pozoKey] ?? pozoKey}</span>
              <span className="nums text-muted-foreground">
                {formatMoney(amount)}
                <span className="ml-2 text-xs opacity-70">{pct.toFixed(1)}%</span>
              </span>
            </div>
            {/* Progress de shadcn: trae role="progressbar" y sus valores ARIA,
                que la barra hecha a mano no tenía. Arranca en 0 y sube al
                montar; con reduced-motion va directo al valor. */}
            <Progress
              value={barsReady ? pct : 0}
              aria-label={`${POZO_LABELS[pozoKey] ?? pozoKey}: ${pct.toFixed(1)}% del costo fijo repartido`}
              className={cn(
                'h-1.5 bg-primary/10',
                destacado
                  ? '[&>[data-slot=progress-indicator]]:bg-primary'
                  : '[&>[data-slot=progress-indicator]]:bg-primary/40',
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
