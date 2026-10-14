// Cortes de ventas del período, en una sola tarjeta: una barra 100 % por corte
// (origen, facturación, código de descuento, forma de cobro y método de pago),
// con su leyenda debajo. Así se comparan los cortes de un vistazo.
//
// Todo es "ventas": un solo tono (bordó) en distinta intensidad, no un color
// por grupo. Cada grupo llega del backend como
// {key, count, total}; acá solo se traduce la clave.
//
// Todos suman el total vendido (sin delivery), salvo método de pago, que solo
// existe en las ventas facturadas y lo dice en el título.
import { motion, useReducedMotion } from 'framer-motion';
import { HugeIcon } from '~/components/ui/icon';
import { CreditCardIcon, Invoice01Icon, Store01Icon, Tag01Icon, Calendar03Icon, PieChartIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/query-state';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSalesBreakdownQuery, type BreakdownGroup, type SalesBreakdown } from '~/state/api/reports-api';
import type { PeriodRange } from './period';
import { cn } from '~/lib/utils';

// Una clave sin entrada acá se muestra tal cual: es preferible un rótulo feo a
// un grupo vacío si mañana el enum de la base crece.
const KEY_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  sin_metodo: 'Sin método',
  native: 'Inventario propio',
  migrated: 'Inventario migrado',
  con_factura: 'Con factura',
  sin_factura: 'Sin factura',
  con_codigo: 'Con código',
  sin_codigo: 'Sin código',
  a_cuotas: 'A cuotas',
  contado: 'De contado',
};

interface Cut {
  key: keyof SalesBreakdown;
  title: string;
  icon: IconSvgElement;
  hint: string;
}

const CUTS: Cut[] = [
  { key: 'by_invoiced', title: 'Facturación', icon: Invoice01Icon, hint: 'Ventas con factura emitida' },
  { key: 'by_method', title: 'Métodos de pago (ventas facturadas)', icon: CreditCardIcon, hint: 'El método vive en la factura' },
  { key: 'by_origin', title: 'Origen del inventario', icon: Store01Icon, hint: 'Propio vs migrado' },
  { key: 'by_discount', title: 'Código de descuento', icon: Tag01Icon, hint: 'El código se canjea al facturar' },
  { key: 'by_installment', title: 'Forma de cobro', icon: Calendar03Icon, hint: 'Plan de cuotas vs contado' },
];

// Intensidad por posición (el grupo más grande, el más intenso).
const SHADES = ['opacity-100', 'opacity-60', 'opacity-35', 'opacity-20'];
const fmt = (n: number) => formatCordobas(n, 'C$', 2);

function CutRow({ cut, groups, animKey }: { cut: Cut; groups: BreakdownGroup[]; animKey?: string }) {
  const reduce = useReducedMotion();
  const sorted = [...groups].filter((g) => g.total > 0 || g.count > 0).sort((a, b) => b.total - a.total);
  const total = sorted.reduce((s, g) => s + g.total, 0);

  return (
    <div className="grid gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0 lg:grid-cols-[16rem_1fr]">
      <div className="flex items-start gap-2">
        <HugeIcon icon={cut.icon} size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{cut.title}</p>
          <p className="text-2xs text-muted-foreground">
            {cut.hint} · <span className="nums">{fmt(total)}</span>
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <div className="space-y-2">
          <motion.div
            key={animKey}
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            style={{ originX: 0 }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {sorted.map((g, i) => (
              <div
                key={g.key}
                title={`${KEY_LABELS[g.key] ?? g.key}: ${fmt(g.total)}`}
                className={cn('h-full bg-primary-2', SHADES[Math.min(i, SHADES.length - 1)], i > 0 && 'border-l-2 border-card')}
                style={{ width: `${total > 0 ? (g.total / total) * 100 : 0}%` }}
              />
            ))}
          </motion.div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {sorted.map((g, i) => (
              <li key={g.key} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-2.5 rounded-sm bg-primary-2', SHADES[Math.min(i, SHADES.length - 1)])} />
                <span className="text-muted-foreground">{KEY_LABELS[g.key] ?? g.key}</span>
                <span className="nums font-medium text-foreground">{fmt(g.total)}</span>
                <span className="nums text-muted-foreground">
                  ({total > 0 ? ((g.total / total) * 100).toLocaleString('es-NI', { maximumFractionDigits: 1 }) : 0}% · {formatNumber(g.count)}{' '}
                  {g.count === 1 ? 'venta' : 'ventas'})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SalesBreakdownCards({ range, className }: { range: PeriodRange; className?: string }) {
  const { data, isLoading, isError } = useGetSalesBreakdownQuery(range);

  return (
    <SpotlightCard variant="default" className={cn('p-5', className)}>
      <div className="mb-4 flex items-center gap-2 border-b pb-3">
        <HugeIcon icon={PieChartIcon} size={18} strokeWidth={2} className="text-primary" />
        <h3 className="font-semibold text-foreground">Cómo se repartieron las ventas</h3>
      </div>
      <QueryState
        loading={isLoading}
        error={isError}
        empty={!data}
        loadingFallback={<div className="h-72 animate-pulse rounded-2xl bg-muted" />}
      >
        {data && (
          <div className="divide-y divide-border/70">
            {CUTS.map((cut) => (
              <CutRow key={cut.key} cut={cut} groups={data[cut.key]} animKey={range.startDate} />
            ))}
          </div>
        )}
      </QueryState>
    </SpotlightCard>
  );
}
