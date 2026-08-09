// Top de productos del periodo. Sirve al admin (todo el negocio) y al vendedor
// (lo suyo): el backend fuerza el `sellerUid` cuando quien pregunta no es admin,
// así que la misma tabla es segura en los dos lugares.
import { HugeIcon } from '~/components/ui/icon';
import { Tag01Icon } from '@hugeicons/core-free-icons';
import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { SpotlightCard } from '~/components/ui/stat-card';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetTopProductsQuery, type TopProductRow } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';

export function TopProductsTable({
  range,
  sellerUid,
  limit = 10,
  title = 'Top productos',
}: {
  range: PeriodRange;
  sellerUid?: string;
  limit?: number;
  title?: string;
}) {
  const { data = [], isLoading, isError } = useGetTopProductsQuery({ ...range, sellerUid, limit });

  const columns = useMemo<ColumnDef<TopProductRow, unknown>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'Producto',
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.sku}</span>,
      },
      {
        accessorKey: 'unidades',
        header: 'Unidades',
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.unidades),
      },
      {
        accessorKey: 'ingreso',
        header: 'Ingreso',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-semibold">{formatCordobas(row.original.ingreso, 'C$', 2)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <SpotlightCard variant="default" className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <div className="flex items-center gap-2">
          <HugeIcon icon={Tag01Icon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        {/* El orden es por ingreso, no por unidades: veinte accesorios baratos
            no pesan lo mismo que tres productos caros. */}
        <span className="text-xs text-muted-foreground">por ingreso</span>
      </div>

      <QueryState
        loading={isLoading}
        error={isError}
        loadingFallback={<div className="h-48 animate-pulse rounded-card bg-muted" />}
      >
        <DataTable
          columns={columns}
          data={data}
          hideSearch
          emptyText="No se vendió nada en este periodo."
        />
      </QueryState>
    </SpotlightCard>
  );
}
