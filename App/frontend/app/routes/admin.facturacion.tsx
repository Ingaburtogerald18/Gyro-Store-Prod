import { HugeIcon } from "~/components/ui/icon";
import { Delete02Icon, Edit02Icon, PlusSignIcon, Time02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

import { PageHeader } from '~/components/layout/PageHeader';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import {
  Kbd,
  Metric,
  MetricStrip,
  SegmentedControl,
  ToolbarSearch,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from '~/components/admin/workspace';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Spinner } from '~/components/ui/spinner';
import { SkeletonCard } from '~/components/ui/skeletons';
import { RowActionsMenu } from '~/components/ui/RowActionsMenu';
import { errMsg, formatCordobas, formatLongDate } from "~/lib/formatters";
import {
  useDeleteInvoiceMutation,
  useGetInvoicesQuery,
  useVoidInvoiceMutation,
  type Invoice,
} from '~/store/api/invoicesApi';
import { TicketPrintModal } from '~/components/admin/invoices/TicketPrintModal';
import { InvoiceEditDialog } from '~/components/admin/invoices/InvoiceEditDialog';
import { InvoiceCodeCell } from '~/components/admin/invoices/InvoiceCodeCell';
// 21 KB que se descargaban al abrir Facturación aunque nadie emitiera nada.
const InvoiceEditor = lazy(() =>
  import('~/components/admin/invoices/InvoiceEditor').then((m) => ({ default: m.InvoiceEditor })),
);

export const meta: MetaFunction = () => [{ title: pageTitle('Facturación', { admin: true }) }];

export default function AdminFacturacion() {
  const { data: unlinkedInvoices = [], isLoading: loadingUnlinked, isError: unlinkedError } = useGetInvoicesQuery({ status: 'unlinked' });
  const { data: linkedInvoices = [], isLoading: loadingLinked, isError: linkedError } = useGetInvoicesQuery({ status: 'linked' });
  const { data: voidInvoices = [], isLoading: loadingVoid, isError: voidError } = useGetInvoicesQuery({ status: 'void' });

  const [isCreating, setIsCreating] = useState(false);

  // Una sola tabla a la vista, elegida con el selector de la barra.
  type View = 'unlinked' | 'linked' | 'void';
  const [view, setView] = useState<View>('unlinked');
  const [search, setSearch] = useState('');
  useShortcut('n', () => setIsCreating(true));

  // `?nueva=1` abre el editor: deja la acción "Emitir factura" enlazable desde
  // otro módulo, una notificación o un mensaje.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('nueva') === '1') {
      setIsCreating(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('nueva');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  // Una sola confirmación para las dos acciones destructivas: `mode` decide si
  // se anula (reversible en el sentido de que la factura queda archivada) o si
  // se descarta de verdad.
  const [confirm, setConfirm] = useState<{ invoice: Invoice; mode: 'void' | 'delete' } | null>(null);
  const [reason, setReason] = useState('');

  const [voidInvoice, { isLoading: voiding }] = useVoidInvoiceMutation();
  const [deleteInvoice, { isLoading: deleting }] = useDeleteInvoiceMutation();

  async function handleConfirm() {
    if (!confirm) return;
    const { invoice, mode } = confirm;
    try {
      if (mode === 'void') {
        if (!reason.trim()) {
          toast.error('El motivo de la cancelación es obligatorio.');
          return;
        }
        await voidInvoice({ id: invoice.id, reason: reason.trim() }).unwrap();
        toast.success(`${invoice.invoiceCode} cancelada. Quedó en Canceladas.`);
      } else {
        await deleteInvoice(invoice.id).unwrap();
        toast.success(`${invoice.invoiceCode} descartada definitivamente.`);
      }
      setConfirm(null);
      setReason('');
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo completar la operación.'));
    }
  }

  const unlinkedColumns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { accessorKey: 'invoiceCode', header: 'Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} bold /> },
      { accessorKey: 'customerName', header: 'Cliente', cell: ({ row }) => row.original.customerName || '—' },
      { accessorKey: 'sellerName', header: 'Vendedor', cell: ({ row }) => row.original.sellerName || '—' },
      { accessorKey: 'method', header: 'Método', cell: ({ row }) => <span className="capitalize">{row.original.method ?? '—'}</span> },
      // Subtotal · Delivery · Total: el modelo ya trae los tres, y con una sola
      // columna "Total" no se podía saber cuánto de esa cifra era envío.
      // `meta.align` en vez de un <div className="text-right"> dentro del
      // header: DataTable envuelve el header en un flex propio y el div no se
      // estiraba, así que el título quedaba a la izquierda y la cifra a la derecha.
      {
        accessorKey: 'subtotal',
        header: 'Subtotal',
        meta: { align: 'right' },
        cell: ({ row }) => formatCordobas(row.original.subtotal ?? 0),
      },
      {
        accessorKey: 'deliveryFee',
        header: 'Delivery',
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.deliveryFee > 0 ? (
            formatCordobas(row.original.deliveryFee)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
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
          else if (diffMinutes < 1440) display = `Hace ${Math.floor(diffMinutes / 60)} h`;
          else display = formatLongDate(row.original.createdAt);

          // Ámbar recién pasado un día sin vincular: en rojo desde la primera
          // hora, TODAS las pendientes se veían como una emergencia.
          const isOld = diffMinutes > 1440;
          return (
            <div className={`flex items-center gap-1.5 whitespace-nowrap ${isOld ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
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
                label: 'Ver ticket',
                icon: <HugeIcon icon={ViewIcon} size={16} strokeWidth={2} />,
                onClick: () => setPrintInvoiceId(row.original.id),
              },
              {
                label: 'Editar datos',
                icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />,
                onClick: () => setEditInvoice(row.original),
              },
              {
                label: 'Cancelar factura',
                icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />,
                danger: true,
                separatorBefore: true,
                onClick: () => {
                  setReason('');
                  setConfirm({ invoice: row.original, mode: 'void' });
                },
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  // Facturas anuladas. Sin acciones de edición: lo único que se puede hacer con
  // una factura muerta es mirarla o sacarla de la vista.
  const voidColumns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { accessorKey: 'invoiceCode', header: 'Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} /> },
      { accessorKey: 'customerName', header: 'Cliente', cell: ({ row }) => row.original.customerName || '—' },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="text-muted-foreground line-through">{formatCordobas(row.original.total)}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Emitida',
        cell: ({ row }) => <span className="whitespace-nowrap">{formatLongDate(row.original.createdAt)}</span>,
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
                label: 'Ver ticket',
                icon: <HugeIcon icon={ViewIcon} size={16} strokeWidth={2} />,
                onClick: () => setPrintInvoiceId(row.original.id),
              },
              {
                label: 'Descartar definitivamente',
                icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />,
                danger: true,
                separatorBefore: true,
                onClick: () => setConfirm({ invoice: row.original, mode: 'delete' }),
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
      { accessorKey: 'invoiceCode', header: 'Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} /> },
      { accessorKey: 'customerName', header: 'Cliente', cell: ({ row }) => row.original.customerName || '—' },
      // Quién la canjeó — el que cobra la comisión de esta venta. Puede ser
      // distinto de a quién Caja se la asignó originalmente al emitirla.
      {
        accessorKey: 'registeredByName',
        header: 'Registró la venta',
        cell: ({ row }) => row.original.registeredByName || '—',
      },
      { accessorKey: 'method', header: 'Método', cell: ({ row }) => <span className="capitalize">{row.original.method ?? '—'}</span> },
      // Subtotal · Delivery · Total: el modelo ya trae los tres, y con una sola
      // columna "Total" no se podía saber cuánto de esa cifra era envío.
      // `meta.align` en vez de un <div className="text-right"> dentro del
      // header: DataTable envuelve el header en un flex propio y el div no se
      // estiraba, así que el título quedaba a la izquierda y la cifra a la derecha.
      {
        accessorKey: 'subtotal',
        header: 'Subtotal',
        meta: { align: 'right' },
        cell: ({ row }) => formatCordobas(row.original.subtotal ?? 0),
      },
      {
        accessorKey: 'deliveryFee',
        header: 'Delivery',
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.deliveryFee > 0 ? (
            formatCordobas(row.original.deliveryFee)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-semibold">{formatCordobas(row.original.total)}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Fecha',
        cell: ({ row }) => <span className="whitespace-nowrap">{formatLongDate(row.original.createdAt)}</span>,
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        // Una factura vinculada NO se edita ni se cancela desde acá: está atada
        // a una venta con su snapshot financiero. Para eso hay que ir a la venta.
        cell: ({ row }) => (
          <RowActionsMenu
            className="ml-auto"
            actions={[
              {
                label: 'Ver ticket',
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
        eyebrow="Tienda"
        title="Facturación"
        description="Emití el ticket y vinculalo cuando se registre la venta."
        className="mb-0"
        actions={
          <Button onClick={() => setIsCreating(true)} className="h-9 gap-2 rounded-xl">
            <HugeIcon icon={PlusSignIcon} size={16} strokeWidth={2} aria-hidden />
            Nueva factura
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Facturas"
            value={view}
            onChange={setView}
            options={[
              { value: 'unlinked', label: `Pendientes de vincular (${unlinkedInvoices.length})` },
              { value: 'linked', label: 'Vinculadas' },
              { value: 'void', label: 'Canceladas' },
            ]}
          />
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar número, cliente o vendedor" />
        </WorkspaceToolbar>

        <MetricStrip columns={3}>
          <Metric
            label="Pendientes de vincular"
            value={unlinkedInvoices.length}
            sub={<span className={unlinkedInvoices.length > 0 ? 'font-medium text-warning' : undefined}>{formatCordobas(unlinkedInvoices.reduce((acc, i) => acc + (i.total ?? 0), 0))} sin venta registrada</span>}
          />
          <Metric
            label="Vinculadas"
            value={linkedInvoices.length}
            sub={`${formatCordobas(linkedInvoices.reduce((acc, i) => acc + (i.total ?? 0), 0))} facturado`}
          />
          <Metric
            label="Canceladas"
            value={voidInvoices.length}
            sub="Conservan su número"
          />
        </MetricStrip>

        <div>
          {view === 'unlinked' && (
            <QueryState loading={loadingUnlinked} error={unlinkedError} shape="table">
              <DataTable
                tableId="facturas-pendientes"
                columns={unlinkedColumns}
                data={unlinkedInvoices}
                hideSearch
                globalFilterValue={search}
                onGlobalFilterChange={setSearch}
                emptyText="Todas las facturas emitidas ya están vinculadas a una venta."
              />
            </QueryState>
          )}
          {view === 'linked' && (
            <QueryState loading={loadingLinked} error={linkedError} shape="table">
              <DataTable
                tableId="facturas-vinculadas"
                columns={linkedColumns}
                data={linkedInvoices}
                hideSearch
                globalFilterValue={search}
                onGlobalFilterChange={setSearch}
                exportFilename="facturas"
                emptyText="No hay facturas vinculadas."
              />
            </QueryState>
          )}
          {/* Canceladas: se ofrecen siempre en el selector, aunque estén vacías:
              si aparecieran solo cuando hay, nadie sabría dónde fue a parar
              una factura cancelada. */}
          {view === 'void' && (
            <QueryState loading={loadingVoid} error={voidError} shape="table">
              <p className="mb-3 text-xs text-muted-foreground">
                Conservan su número: el correlativo no retrocede, así que descartarlas deja ese número retirado para siempre.
              </p>
              <DataTable
                columns={voidColumns}
                data={voidInvoices}
                hideSearch
                globalFilterValue={search}
                onGlobalFilterChange={setSearch}
                emptyText="No hay facturas canceladas."
              />
            </QueryState>
          )}
        </div>
      </Workspace>

      <TicketPrintModal invoiceId={printInvoiceId} onClose={() => setPrintInvoiceId(null)} />

      <InvoiceEditDialog invoice={editInvoice} onClose={() => setEditInvoice(null)} />

      {/* Confirmación de las dos acciones destructivas. Cancelar pide motivo
          (queda guardado en la factura); descartar no, porque no queda nada
          donde escribirlo. */}
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.mode === 'void' ? 'Cancelar factura' : 'Descartar definitivamente'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.mode === 'void' ? (
                <>
                  {confirm?.invoice.invoiceCode} pasa a Canceladas. Conserva su número y
                  su motivo. Si solo hay que corregir un dato, usá <strong>Editar</strong> en vez
                  de cancelar.
                </>
              ) : (
                <>
                  {confirm?.invoice.invoiceCode} se borra de la base y no se puede recuperar. El
                  número queda retirado: no se reasigna a ninguna factura nueva.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {confirm?.mode === 'void' && (
            <div className="space-y-2">
              <Label htmlFor="void-reason">Motivo (obligatorio)</Label>
              <Input
                id="void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="¿Por qué se cancela?"
              />
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Volver
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={voiding || deleting}>
              {(voiding || deleting) && <Spinner className="mr-2" />}
              {confirm?.mode === 'void' ? 'Cancelar factura' : 'Descartar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawer y no modal: el formulario es largo y un `Dialog` con
          `max-h-[90vh] overflow-y-auto` mete un scroll interno que compite con
          el de la página. Acá el header queda fijo, el cuerpo scrollea solo, y
          el listado de facturas se sigue viendo detrás — que es el contexto que
          el cajero necesita para saber en qué número va. */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
            <DialogTitle>Nueva factura (POS)</DialogTitle>
            <DialogDescription>
              Se emite el ticket y después se vincula al registrar la venta.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <Suspense fallback={<SkeletonCard lines={8} className="border-none" />}>
              <InvoiceEditor
                onCreated={(id) => {
                  setIsCreating(false);
                  setPrintInvoiceId(id);
                }}
              />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
