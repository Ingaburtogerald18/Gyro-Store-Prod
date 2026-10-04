// "Mis Facturas" — portal de vendedor. Solo lectura: ve ÚNICAMENTE las
// facturas que Caja le asignó (invoices.seller_uid), nunca crea, edita ni
// anula desde acá. El flujo es abrir el ticket, copiar el número de factura y
// después ir a Ventas a registrar la venta con ese código (ver
// server/routes/invoices.ts → /mine, /lookup, /:id/ticket).
import { HugeIcon } from '~/components/ui/icon';
import { File01Icon, Invoice01Icon, Time02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { type ColumnDef } from '@tanstack/react-table';
import { pageTitle } from '~/lib/brand';

import { PageHeader } from '~/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import { BrandLoader } from '~/components/ui/module-loader';
import { RowActionsMenu } from '~/components/ui/RowActionsMenu';
import { formatCordobas } from '~/lib/formatters';
import { useGetMyInvoicesQuery, type Invoice } from '~/store/api/invoicesApi';
import { TicketPrintModal } from '~/components/admin/invoices/TicketPrintModal';
import { InvoiceCodeCell } from '~/components/admin/invoices/InvoiceCodeCell';

export const meta: MetaFunction = () => [{ title: pageTitle('Mis Facturas', { admin: true }) }];

export default function AdminMisFacturas() {
  const { data: unlinkedInvoices = [], isLoading: loadingUnlinked, isError: unlinkedError } = useGetMyInvoicesQuery({ status: 'unlinked' });
  const { data: linkedInvoices = [], isLoading: loadingLinked, isError: linkedError } = useGetMyInvoicesQuery({ status: 'linked' });

  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);

  const unlinkedColumns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { accessorKey: 'invoiceCode', header: 'Número de Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} bold /> },
      { accessorKey: 'customerName', header: 'Cliente', cell: ({ row }) => row.original.customerName || '—' },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-semibold">{formatCordobas(row.original.total)}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Antigüedad',
        cell: ({ row }) => {
          const date = new Date(row.original.createdAt);
          const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);

          let display = '';
          if (diffMinutes < 60) display = `Hace ${diffMinutes} min`;
          else if (diffMinutes < 1440) display = `Hace ${Math.floor(diffMinutes / 60)} hs`;
          else display = date.toLocaleDateString('es-NI');

          const isOld = diffMinutes > 60;
          return (
            <div className={`flex items-center gap-1.5 ${isOld ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              <HugeIcon icon={Time02Icon} size={14} />
              {display}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <RowActionsMenu
            className="ml-auto"
            actions={[
              {
                label: 'Ver detalle',
                icon: <HugeIcon icon={ViewIcon} size={16} strokeWidth={2} />,
                onClick: () => setPrintInvoiceId(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const linkedColumns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { accessorKey: 'invoiceCode', header: 'Número de Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} /> },
      { accessorKey: 'customerName', header: 'Cliente', cell: ({ row }) => row.original.customerName || '—' },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-semibold">{formatCordobas(row.original.total)}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Fecha',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('es-NI'),
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <RowActionsMenu
            className="ml-auto"
            actions={[
              {
                label: 'Ver detalle',
                icon: <HugeIcon icon={ViewIcon} size={16} strokeWidth={2} />,
                onClick: () => setPrintInvoiceId(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Mis Facturas"
        description="Las facturas que Caja emitió a tu nombre. Copiá el número y registrá la venta en Ventas."
      />

      <Card className="bg-card border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <HugeIcon icon={Invoice01Icon} size={20} className="text-warning" />
            Pendientes de registrar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={loadingUnlinked}
            error={unlinkedError}
            empty={unlinkedInvoices.length === 0}
            loadingFallback={<BrandLoader text="Cargando facturas..." />}
            emptyFallback={
              <div className="rounded-lg border border-dashed bg-muted/50 py-10 text-center">
                <HugeIcon icon={File01Icon} size={36} strokeWidth={2} className="mx-auto mb-3 text-muted-foreground opacity-50" aria-hidden />
                <p className="font-medium text-foreground">No tenés facturas pendientes de registrar.</p>
              </div>
            }
          >
            <DataTable tableId="mis-facturas-pendientes" columns={unlinkedColumns} data={unlinkedInvoices} hideSearch emptyText="No hay facturas pendientes." />
          </QueryState>
        </CardContent>
      </Card>

      <Card className="bg-card border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Ya registradas</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={loadingLinked}
            error={linkedError}
            empty={linkedInvoices.length === 0}
            loadingFallback={<BrandLoader text="Cargando facturas..." />}
            emptyFallback={
              <p className="rounded-lg border border-dashed bg-muted/50 py-8 text-center text-sm text-muted-foreground">
                Todavía no registraste ninguna venta con estas facturas.
              </p>
            }
          >
            <DataTable tableId="mis-facturas-vinculadas" columns={linkedColumns} data={linkedInvoices} hideSearch emptyText="No hay facturas vinculadas." />
          </QueryState>
        </CardContent>
      </Card>

      <TicketPrintModal invoiceId={printInvoiceId} onClose={() => setPrintInvoiceId(null)} />
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
