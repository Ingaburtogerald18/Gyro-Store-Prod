import { useMemo } from 'react';
import { HugeIcon } from '~/components/ui/icon';
import { UserGroupIcon, Award01Icon } from '@hugeicons/core-free-icons';

import { SpotlightCard } from '~/components/ui/stat-card';
import { QueryState } from '~/components/ui/QueryState';
import { Progress } from '~/components/ui/progress';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetSellerPerformanceQuery } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';
import { cn } from '~/lib/utils';

export function SellerRankingTable({
  range,
  className,
}: {
  range: PeriodRange;
  className?: string;
}) {
  const { data = [], isLoading, isError } = useGetSellerPerformanceQuery(range);

  const sortedSellers = useMemo(() => {
    return [...data].sort((a, b) => b.total_vendido - a.total_vendido);
  }, [data]);

  const maxSales = useMemo(() => {
    return Math.max(...sortedSellers.map((s) => s.total_vendido), 1);
  }, [sortedSellers]);

  const totalTeamSales = useMemo(() => {
    return sortedSellers.reduce((s, row) => s + row.total_vendido, 0);
  }, [sortedSellers]);

  return (
    <SpotlightCard variant="default" className={className}>
      <div className="mb-4 flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <HugeIcon icon={UserGroupIcon} size={18} strokeWidth={2} className="text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Ranking de vendedores</h4>
        </div>
        <span className="nums text-xs font-medium text-muted-foreground">
          {sortedSellers.length} {sortedSellers.length === 1 ? 'vendedor' : 'vendedores'} • {formatCordobas(totalTeamSales, 'C$', 0)}
        </span>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        empty={sortedSellers.length === 0}
        emptyFallback={
          <p className="py-12 text-center text-xs text-muted-foreground">
            No hay actividad de vendedores registrada en este periodo.
          </p>
        }
        loadingFallback={<div className="h-56 animate-pulse rounded-card bg-muted" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2 text-center w-8">#</th>
                <th className="py-2 pr-4">Vendedor</th>
                <th className="py-2 px-3">Ventas totales</th>
                <th className="py-2 px-3 text-right">Transacciones</th>
                <th className="py-2 pl-3 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sortedSellers.map((seller, index) => {
                const rank = index + 1;
                const ratio = (seller.total_vendido / maxSales) * 100;
                const displayName = seller.seller_name || seller.seller_email || 'Sin nombre';

                return (
                  <tr
                    key={seller.seller_uid ?? seller.seller_email ?? index}
                    className="group transition-colors hover:bg-muted/30"
                  >
                    {/* Posición */}
                    <td className="py-2.5 pr-2 text-center">
                      {rank === 1 ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-400">
                          1
                        </span>
                      ) : rank === 2 ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-300/20 text-[11px] font-bold text-slate-300">
                          2
                        </span>
                      ) : rank === 3 ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-700/20 text-[11px] font-bold text-amber-600">
                          3
                        </span>
                      ) : (
                        <span className="nums text-muted-foreground font-medium">
                          {rank}
                        </span>
                      )}
                    </td>

                    {/* Vendedor */}
                    <td className="py-2.5 pr-4 min-w-[140px]">
                      <p className="font-medium text-foreground truncate">{displayName}</p>
                      {seller.seller_email && seller.seller_name && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {seller.seller_email}
                        </p>
                      )}
                    </td>

                    {/* Ventas totales con barra de progreso relativa */}
                    <td className="py-2.5 px-3 min-w-[150px]">
                      <div className="space-y-1">
                        <span className="nums font-semibold text-foreground">
                          {formatCordobas(seller.total_vendido, 'C$', 2)}
                        </span>
                        <Progress
                          value={ratio}
                          aria-label={`Rendimiento relativo de ${displayName}`}
                          className="h-1.5 bg-muted/60"
                        />
                      </div>
                    </td>

                    {/* Transacciones */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <span className="nums font-medium text-foreground">
                        {formatNumber(seller.num_ventas)}
                      </span>
                      <span className="nums text-[10px] text-muted-foreground ml-1">
                        ({seller.unidades} uds)
                      </span>
                    </td>

                    {/* Comisión */}
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <span className="nums font-semibold text-emerald-400">
                        {formatCordobas(seller.comision, 'C$', 2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </QueryState>
    </SpotlightCard>
  );
}
