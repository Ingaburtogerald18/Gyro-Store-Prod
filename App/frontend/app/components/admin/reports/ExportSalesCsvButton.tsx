// Descarga el detalle de ventas del periodo como CSV.
//
// Se pide con la query LAZY a propósito: `sales_export_view` devuelve una fila
// por línea de venta, así que un año puede ser decenas de miles de filas. Con
// la query normal se traerían al montar el Dashboard aunque nadie vaya a
// exportar; así solo viajan cuando el usuario pica el botón.
import { HugeIcon } from '~/components/ui/icon';
import { Download04Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { errMsg } from '~/lib/formatters';
import { useLazyGetSalesExportQuery } from '~/store/api/reportsApi';
import type { PeriodRange } from './period';

/** Escapa un valor para CSV: comillas dobles duplicadas y todo entre comillas. */
function csvCell(value: unknown): string {
  if (value == null) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(',')),
  ];
  // El BOM es lo que hace que Excel en Windows abra el archivo en UTF-8; sin
  // él, "Audífonos" sale como "AudÃ­fonos".
  return `﻿${lines.join('\r\n')}`;
}

export function ExportSalesCsvButton({ range }: { range: PeriodRange }) {
  const [fetchExport] = useLazyGetSalesExportQuery();
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const rows = (await fetchExport(range).unwrap()) as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error('No hay ventas en este periodo para exportar.');
        return;
      }

      const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = (range.startDate ?? new Date().toISOString()).slice(0, 10);
      link.href = url;
      link.download = `ventas-${stamp}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} líneas exportadas.`);
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo exportar el detalle de ventas.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={busy}>
      {busy ? (
        <Spinner className="mr-2" />
      ) : (
        <HugeIcon icon={Download04Icon} size={16} strokeWidth={2} className="mr-2" aria-hidden />
      )}
      Exportar CSV
    </Button>
  );
}
