// Top de productos del periodo. Sirve al admin (todo el negocio) y al vendedor
// (lo suyo): el backend fuerza el `sellerUid` cuando quien pregunta no es admin,
// así que la misma tabla es segura en los dos lugares. El margen solo llega
// para admin, y solo cuando hay costo registrado.
import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { Tag01Icon } from '@hugeicons/core-free-icons';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import { formatCordobas, formatNumber, splitProductName } from '~/lib/formatters';
import { useGetTopProductsQuery } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';
import { RelativeBar } from './RelativeBar';
import { cn } from '~/lib/utils';

const fmt = (n: number) => formatCordobas(n, 'C$', 2);

export function TopProductsTable({
  range,
  sellerUid,
  limit = 10,
  title = 'Productos más vendidos',
  className,
}: {
  range: PeriodRange;
  sellerUid?: string;
  limit?: number;
  title?: string;
  className?: string;
}) {
  const { data = [], isLoading, isError } = useGetTopProductsQuery({ ...range, sellerUid, limit });
  const max = useMemo(() => Math.max(...data.map((r) => r.ingreso), 1), [data]);

  return (
    <SpotlightCard variant="default" className={cn('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <HugeIcon icon={Tag01Icon} size={18} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-xs text-muted-foreground">por ingreso</span>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={data.length === 0}
        emptyFallback={<p className="py-12 text-center text-xs text-muted-foreground">No se vendió ningún producto en este período.</p>}
        loadingFallback={<div className="h-48 animate-pulse rounded-card bg-muted" />}
      >
        <ol className="space-y-3">
          {data.map((row, index) => {
            const { model, variant } = splitProductName(row.nombre || row.sku);
            return (
              <li key={row.sku} className="grid grid-cols-[1.5rem_1fr] gap-x-3">
                <span className={cn('nums pt-0.5 text-sm', index === 0 ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-x-3">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground" title={row.nombre || row.sku}>
                      {model}
                      {variant && <span className="font-normal text-muted-foreground"> · {variant}</span>}
                    </span>
                    <span className="nums shrink-0 font-display text-sm font-semibold text-foreground">{fmt(row.ingreso)}</span>
                  </div>
                  <RelativeBar ratio={row.ingreso / max} animKey={`${range.startDate}-${row.ingreso}`} />
                  <div className="flex justify-between gap-x-3 text-2xs text-muted-foreground">
                    <span className="nums">{formatNumber(row.unidades)} {row.unidades === 1 ? 'unidad' : 'unidades'}</span>
                    {row.margen !== undefined && (
                      <span className="nums">
                        Margen{' '}
                        <span className={cn('font-medium', row.margen < 20 ? 'text-destructive' : 'text-foreground')}>
                          {row.margen.toLocaleString('es-NI', { maximumFractionDigits: 1 })}%
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </QueryState>
    </SpotlightCard>
  );
}
