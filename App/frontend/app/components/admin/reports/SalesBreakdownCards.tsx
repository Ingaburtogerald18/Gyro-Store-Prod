// Los cinco cortes del periodo. Cada grupo llega del backend como
// {key, count, total}: acá solo se traduce la clave y se dibuja la proporción,
// para que agregar un corte nuevo en el RPC no obligue a tocar este archivo más
// que para ponerle nombre en español.
import { HugeIcon } from '~/components/ui/icon';
import { CreditCardIcon, Invoice01Icon, Store01Icon, Tag01Icon, Calendar03Icon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import { useMemo } from 'react';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import { Progress } from '~/components/ui/progress';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSalesBreakdownQuery, type BreakdownGroup, type SalesBreakdown } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';

// Traducción de las claves que emite `get_sales_breakdown`. Una clave sin
// entrada acá se muestra tal cual: es preferible un rótulo feo a una tarjeta
// vacía si mañana el enum de la base crece.
const KEY_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  sin_metodo: 'Sin factura',
  native: 'Inventario propio',
  migrated: 'Inventario migrado',
  con_factura: 'Con factura',
  sin_factura: 'Sin factura',
  con_codigo: 'Con código',
  sin_codigo: 'Sin código',
  a_cuotas: 'A cuotas',
  contado: 'De contado',
};

export interface BreakdownSection {
  key: keyof SalesBreakdown;
  title: string;
  icon: IconSvgElement;
  hint: string;
}

const SECTIONS: BreakdownSection[] = [
  { key: 'by_method', title: 'Método de pago', icon: CreditCardIcon, hint: 'Todas las ventas; sin factura no hay método' },
  { key: 'by_origin', title: 'Origen del inventario', icon: Store01Icon, hint: 'Propio vs migrado' },
  { key: 'by_invoiced', title: 'Facturación', icon: Invoice01Icon, hint: 'Ventas con papel emitido' },
  { key: 'by_discount', title: 'Código de descuento', icon: Tag01Icon, hint: 'El código se canjea al facturar' },
  { key: 'by_installment', title: 'Forma de cobro', icon: Calendar03Icon, hint: 'Plan de cuotas vs contado' },
];

function GroupRows({ groups }: { groups: BreakdownGroup[] }) {
  const max = Math.max(...groups.map((g) => g.total), 1);

  if (groups.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Sin datos.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">{KEY_LABELS[g.key] ?? g.key}</span>
            <span className="nums text-muted-foreground">
              {formatCordobas(g.total, 'C$', 2)}
            </span>
          </div>
          <Progress
            value={(g.total / max) * 100}
            aria-label={KEY_LABELS[g.key] ?? g.key}
            className="h-1.5"
          />
          <span className="nums text-xs text-muted-foreground">
            {formatNumber(g.count)} {g.count === 1 ? 'venta' : 'ventas'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SalesBreakdownCards({
  range,
  excludeMethod = false,
  className,
}: {
  range: PeriodRange;
  excludeMethod?: boolean;
  className?: string;
}) {
  const { data, isLoading, isError } = useGetSalesBreakdownQuery(range);

  const activeSections = useMemo(() => {
    if (!excludeMethod) return SECTIONS;
    return SECTIONS.filter((s) => s.key !== 'by_method');
  }, [excludeMethod]);

  return (
    <QueryState
      loading={isLoading}
      error={isError}
      empty={!data}
      loadingFallback={
        <div className={className || 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'}>
          {activeSections.map((s) => (
            <div key={s.key} className="h-48 animate-pulse rounded-card bg-muted" />
          ))}
        </div>
      }
    >
      {data && (
        <div className={className || 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'}>
          {activeSections.map((s) => (
            <SpotlightCard key={s.key} variant="default" className="p-5">
              <div className="mb-4 flex items-start justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <HugeIcon icon={s.icon} size={18} strokeWidth={2} className="text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">{s.title}</h4>
                </div>
              </div>
              <GroupRows groups={data[s.key]} />
              <p className="mt-3 text-xs text-muted-foreground">{s.hint}</p>
            </SpotlightCard>
          ))}
        </div>
      )}
    </QueryState>
  );
}
