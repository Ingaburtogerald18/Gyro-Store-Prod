// Cascada "de lo vendido a la ganancia real" (reemplaza el donut de ingresos).
//
// Una fila por paso, con una barra flotante sobre la misma escala que el
// total vendido: los descuentos cuelgan desde donde terminó el paso anterior,
// así se lee de un vistazo cuánto se lleva cada cosa y qué queda. Los
// subtotales (ganancia bruta, ganancia real) arrancan en 0.
//
// Colores con significado (DESIGN.md §2.4): emerald = ingresos y ganancias,
// sky = costos esperados, rose = lo que la ganancia tuvo que pagar o un
// resultado negativo.
import { motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { ChartBarLineIcon } from '@hugeicons/core-free-icons';
import { SpotlightCard } from '~/components/ui/stat-card';
import { CountUp } from '~/components/ui/CountUp';
import { cn } from '~/lib/utils';

export interface WaterfallInput {
  totalVendido: number;
  coste: number;
  /** Lo que el costo trae adentro para los pozos de costos fijos. */
  retencionPozos: number;
  comision: number;
  salario: number;
  gananciaBruta: number;
  /** Lo que los gastos tomaron de la ganancia (pozos que se pasaron, préstamos, salario). */
  gastosDeGanancia: number;
  /** De eso, cuánto fue pago de préstamos. */
  prestamosDeGanancia: number;
  gananciaReal: number;
}

type Kind = 'total' | 'cost' | 'taken' | 'subtotal';

interface Step {
  key: string;
  label: string;
  note?: string;
  kind: Kind;
  /** Monto que se muestra (positivo para los descuentos; se imprime con −). */
  amount: number;
  from: number;
  to: number;
}

const BAR: Record<Kind, string> = {
  total: 'bg-tone-emerald',
  subtotal: 'bg-tone-emerald',
  cost: 'bg-tone-sky',
  taken: 'bg-tone-rose',
};

export function IncomeWaterfall({
  data,
  formatMoney,
  className,
}: {
  data: WaterfallInput;
  formatMoney: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const d = data;

  const afterCoste = d.totalVendido - d.coste;
  const afterComision = afterCoste - d.comision;
  const steps: Step[] = [
    { key: 'vendido', label: 'Total vendido', note: 'Sin delivery', kind: 'total', amount: d.totalVendido, from: 0, to: d.totalVendido },
    {
      key: 'coste',
      label: 'Costo de productos',
      note: d.retencionPozos > 0 ? `Incluye ${formatMoney(d.retencionPozos)} que se apartan para los pozos` : undefined,
      kind: 'cost',
      amount: d.coste,
      from: afterCoste,
      to: d.totalVendido,
    },
    { key: 'comision', label: 'Comisiones', kind: 'cost', amount: d.comision, from: afterComision, to: afterCoste },
    { key: 'salario', label: 'Fondo salario', kind: 'cost', amount: d.salario, from: afterComision - d.salario, to: afterComision },
    { key: 'bruta', label: 'Ganancia bruta', kind: 'subtotal', amount: d.gananciaBruta, from: Math.min(0, d.gananciaBruta), to: Math.max(0, d.gananciaBruta) },
    ...(d.gastosDeGanancia > 0
      ? [
          {
            key: 'gastos',
            label: 'Gastos pagados con ganancia',
            note:
              d.prestamosDeGanancia > 0
                ? d.prestamosDeGanancia >= d.gastosDeGanancia - 0.005
                  ? 'Préstamo que el pozo Préstamos no alcanzó a cubrir'
                  : `Incluye ${formatMoney(d.prestamosDeGanancia)} de préstamo`
                : 'Lo que los pozos no alcanzaron a cubrir',
            kind: 'taken' as const,
            amount: d.gastosDeGanancia,
            from: d.gananciaBruta - d.gastosDeGanancia,
            to: d.gananciaBruta,
          },
        ]
      : []),
    {
      key: 'real',
      label: 'Ganancia real',
      kind: 'subtotal',
      amount: d.gananciaReal,
      from: Math.min(0, d.gananciaReal),
      to: Math.max(0, d.gananciaReal),
    },
  ];

  // Escala común: de lo más negativo (una ganancia real bajo cero) al total.
  const min = Math.min(0, ...steps.map((s) => s.from));
  const max = Math.max(d.totalVendido, ...steps.map((s) => s.to), 1);
  const span = max - min;
  const pct = (n: number) => ((n - min) / span) * 100;
  const zero = pct(0);
  const margen = d.totalVendido > 0 ? (d.gananciaReal / d.totalVendido) * 100 : 0;

  return (
    <SpotlightCard variant="default" className={cn('p-5', className)}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b pb-4">
        <span className="flex items-center gap-2">
          <HugeIcon icon={ChartBarLineIcon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">De lo vendido a la ganancia real</h3>
        </span>
        <span className="text-xs text-muted-foreground">
          Margen real{' '}
          <span className={cn('nums font-semibold', margen >= 0 ? 'text-foreground' : 'text-destructive')}>
            {margen.toLocaleString('es-NI', { maximumFractionDigits: 1 })}%
          </span>
        </span>
      </div>

      <ol key={d.totalVendido} className="space-y-3">
        {steps.map((s, i) => {
          const isSub = s.kind === 'subtotal' || s.kind === 'total';
          const negative = s.key === 'real' && s.amount < 0;
          const left = pct(s.from);
          const width = Math.max(pct(s.to) - left, 0.4);
          return (
            <li
              key={s.key}
              className={cn(
                'grid grid-cols-1 items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,19rem)_1fr]',
                isSub && i > 0 && 'border-t border-border pt-3',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('text-sm', isSub ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.label}</p>
                  {s.note && <p className="text-2xs text-muted-foreground">{s.note}</p>}
                </div>
                <span
                  className={cn(
                    'nums shrink-0 font-display',
                    isSub ? 'text-base font-bold' : 'text-sm font-semibold',
                    negative || s.kind === 'taken' ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {s.kind === 'cost' || s.kind === 'taken' ? '−' : ''}
                  <CountUp value={Math.abs(s.amount)} format={(n) => formatMoney(negative ? -n : n)} />
                </span>
              </div>

              <div className="relative h-6 rounded-md bg-muted/50">
                {min < 0 && <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: `${zero}%` }} />}
                <motion.div
                  aria-hidden
                  className={cn('absolute inset-y-1 rounded-sm', negative ? 'bg-tone-rose' : BAR[s.kind])}
                  style={{ left: `${left}%`, width: `${width}%`, originX: s.kind === 'cost' || s.kind === 'taken' ? 1 : 0 }}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.06, ease: 'easeOut' }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </SpotlightCard>
  );
}
