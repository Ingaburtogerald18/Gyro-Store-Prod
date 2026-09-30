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
import { Badge } from '~/components/ui/badge';
import { formatCordobas, formatNumber } from '~/lib/formatters';
import { useGetTopProductsQuery, type TopProductRow } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';

export function TopProductsTable({
  range,
  sellerUid,
  limit = 10,
  title = 'Top 10 productos más vendidos',
}: {
  range: PeriodRange;
  sellerUid?: string;
  limit?: number;
  title?: string;
}) {
  const { data = [], isLoading, isError } = useGetTopProductsQuery({ ...range, sellerUid, limit });

  const hasMargin = useMemo(() => data.some((r) => r.margen !== undefined), [data]);

  const columns = useMemo<ColumnDef<TopProductRow, unknown>[]>(() => {
    const cols: ColumnDef<TopProductRow, unknown>[] = [
      {
        id: 'position',
        header: '#',
        cell: ({ row }) => (
          <span className="nums font-semibold text-muted-foreground">
            {row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-2xs font-medium">
            {row.original.sku}
          </Badge>
        ),
      },
      {
        id: 'nombre',
        header: 'Nombre del producto',
        cell: ({ row }) => {
          const name = row.original.nombre || row.original.sku;
          return <span className="font-medium text-foreground">{name}</span>;
        },
      },
      {
        accessorKey: 'unidades',
        header: 'Unidades vendidas',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="nums font-medium text-foreground">
            {formatNumber(row.original.unidades)}
          </span>
        ),
      },
      {
        accessorKey: 'ingreso',
        header: 'Ingreso generado',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="nums font-semibold text-foreground">
            {formatCordobas(row.original.ingreso, 'C$', 2)}
          </span>
        ),
      },
    ];

    if (hasMargin) {
      cols.push({
        id: 'margen',
        header: 'Margen',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const m = row.original.margen;
          if (m === undefined) return <span className="text-muted-foreground">—</span>;
          const isHigh = m >= 35;
          const isMid = m >= 20 && m < 35;
          return (
            <span
              className={`nums inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                isHigh
                  ? 'bg-success/15 text-success'
                  : isMid
                  ? 'bg-warning/15 text-warning'
                  : 'bg-destructive/15 text-destructive'
              }`}
            >
              {m.toFixed(1)}%
            </span>
          );
        },
      });
    }

    return cols;
  }, [hasMargin]);

  return (
    <SpotlightCard variant="default" className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <div className="flex items-center gap-2">
          <HugeIcon icon={Tag01Icon} size={20} strokeWidth={2} className="text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-xs text-muted-foreground">ordenado por ingreso</span>
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
          emptyText="No se vendió ningún producto en este mes."
        />
      </QueryState>
    </SpotlightCard>
  );
}

