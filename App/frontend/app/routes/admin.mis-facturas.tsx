// "Mis Facturas" — portal de vendedor. Solo lectura: ve ÚNICAMENTE las
// facturas que Caja le asignó (invoices.seller_uid), nunca crea, edita ni
// anula desde acá. El flujo es abrir el ticket, copiar el número de factura y
// después ir a Ventas a registrar la venta con ese código (ver
// server/modules/invoices/invoices-routes.ts → /mine, /lookup, /:id/ticket).
import { HugeIcon } from '~/components/ui/icon';
import { File01Icon, Time02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { type ColumnDef } from '@tanstack/react-table';
import { pageTitle } from '~/lib/brand';

import { PageHeader } from '~/components/layout/PageHeader';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Mis facturas"
        className="mb-0"
        description="Las facturas que Caja emitió a tu nombre. Copiá el número y registrá la venta en Ventas."
      />

      <section aria-labelledby="mis-facturas-pendientes" className="space-y-3">
        <h2 id="mis-facturas-pendientes" className="text-lg font-semibold">Pendientes de registrar</h2>
          <QueryState
            loading={loadingUnlinked}
            error={unlinkedError}
            empty={unlinkedInvoices.length === 0}
            shape="table"
            emptyFallback={
              <div className="rounded-2xl border border-border bg-card py-10 text-center">
                <HugeIcon icon={File01Icon} size={24} strokeWidth={2} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
                <p className="font-medium text-foreground">No tenés facturas pendientes de registrar.</p>
              </div>
            }
          >
            <DataTable tableId="mis-facturas-pendientes" columns={unlinkedColumns} data={unlinkedInvoices} hideSearch emptyText="No hay facturas pendientes." />
          </QueryState>
      </section>

      <section aria-labelledby="mis-facturas-registradas" className="space-y-3">
        <h2 id="mis-facturas-registradas" className="text-lg font-semibold">Ya registradas</h2>
          <QueryState
            loading={loadingLinked}
            error={linkedError}
            empty={linkedInvoices.length === 0}
            shape="table"
            emptyFallback={
              <p className="rounded-2xl border border-border bg-card py-8 text-center text-sm text-muted-foreground">
                Todavía no registraste ninguna venta con estas facturas.
              </p>
            }
          >
            <DataTable tableId="mis-facturas-vinculadas" columns={linkedColumns} data={linkedInvoices} hideSearch emptyText="No hay facturas vinculadas." />
          </QueryState>
      </section>

      <TicketPrintModal invoiceId={printInvoiceId} onClose={() => setPrintInvoiceId(null)} />
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
