// Ranking del equipo de ventas del período: quién vendió cuánto, qué parte
// del total del equipo es y cuánto se lleva de comisión.
import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { UserGroupIcon } from '@hugeicons/core-free-icons';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSellerPerformanceQuery } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';
import { RelativeBar } from './RelativeBar';
import { cn } from '~/lib/utils';

const fmt = (n: number) => formatCordobas(n, 'C$', 2);

export function SellerRankingTable({
  range,
  className,
}: {
  range: PeriodRange;
  className?: string;
}) {
  const { data = [], isLoading, isError } = useGetSellerPerformanceQuery(range);

  const sellers = useMemo(() => [...data].sort((a, b) => b.total_vendido - a.total_vendido), [data]);
  const max = Math.max(...sellers.map((s) => s.total_vendido), 1);
  const totalEquipo = sellers.reduce((s, row) => s + row.total_vendido, 0);

  return (
    <SpotlightCard variant="default" className={cn('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <HugeIcon icon={UserGroupIcon} size={18} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">Vendedores</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {sellers.length} {sellers.length === 1 ? 'vendedor' : 'vendedores'} ·{' '}
          <span className="nums font-display font-semibold text-foreground">{fmt(totalEquipo)}</span>
        </span>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={sellers.length === 0}
        emptyFallback={<p className="py-12 text-center text-xs text-muted-foreground">Nadie vendió en este período.</p>}
        loadingFallback={<div className="h-56 animate-pulse rounded-card bg-muted" />}
      >
        <ol className="space-y-3">
          {sellers.map((seller, index) => {
            const name = seller.seller_name || seller.seller_email || 'Sin nombre';
            const share = totalEquipo > 0 ? (seller.total_vendido / totalEquipo) * 100 : 0;
            return (
              <li key={seller.seller_uid ?? seller.seller_email ?? index} className="grid grid-cols-[1.5rem_1fr] gap-x-3">
                <span className={cn('nums pt-0.5 text-sm', index === 0 ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="truncate text-sm font-medium text-foreground" title={seller.seller_email ?? undefined}>{name}</span>
                    <span className="nums font-display text-sm font-semibold text-foreground">{fmt(seller.total_vendido)}</span>
                  </div>
                  <RelativeBar ratio={seller.total_vendido / max} animKey={`${range.startDate}-${seller.total_vendido}`} />
                  <div className="flex flex-wrap justify-between gap-x-3 text-2xs text-muted-foreground">
                    <span className="nums">
                      {share.toLocaleString('es-NI', { maximumFractionDigits: 1 })}% del equipo · {formatNumber(seller.num_ventas)}{' '}
                      {seller.num_ventas === 1 ? 'venta' : 'ventas'} · {formatNumber(seller.unidades)} uds
                    </span>
                    <span className="nums">
                      Comisión <span className="font-medium text-foreground">{fmt(seller.comision)}</span>
                    </span>
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
