// Query lazy: un año son decenas de miles de filas, y solo viajan al tocar el botón.
import { HugeIcon } from '~/components/ui/icon';
import { Download04Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { errMsg } from '~/lib/formatters';
import { useLazyGetSalesExportQuery } from '~/state/api/reports-api';
import type { PeriodRange } from './period';

/** Escapa un valor para CSV: comillas dobles duplicadas y todo entre comillas. */
function csvCell(value: unknown): string {
  if (value == null) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const mapped = rows.map((r) => ({
    'Fecha': r.created_at ? new Date(String(r.created_at)).toLocaleDateString('es-NI') : '',
    'Cliente': r.customer_phone ?? '',
    'Vendedor': r.seller_email ?? '',
    'Producto (SKU)': r.item_sku ?? '',
    'Cantidad': r.item_quantity ?? '',
    'Precio unitario': r.item_price ?? '',
    'Monto total': (Number(r.item_price || 0) * Number(r.item_quantity || 1)).toFixed(2),
    'Método de pago': r.payment_method ?? '',
    'Factura': r.invoice_number ? `#${r.invoice_number}` : 'Sin factura',
    'Estado': r.order_status ?? '',
  }));

  const headers = Object.keys(mapped[0]!);
  const lines = [
    headers.map(csvCell).join(','),
    ...mapped.map((row) => headers.map((h) => csvCell((row as Record<string, unknown>)[h])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
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
