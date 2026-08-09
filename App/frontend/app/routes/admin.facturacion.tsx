import { HugeIcon } from "~/components/ui/icon";
import { Delete02Icon, Edit02Icon, File01Icon, Invoice01Icon, PlusSignIcon, Time02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

import { PageHeader } from '~/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Spinner } from '~/components/ui/spinner';
import { SkeletonCard } from '~/components/ui/skeletons';
import { RowActionsMenu } from '~/components/ui/RowActionsMenu';
import { errMsg, formatCordobas } from "~/lib/formatters";
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
        toast.success(`${invoice.invoiceCode} cancelada. Quedó en Facturas eliminadas.`);
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
      { accessorKey: 'invoiceCode', header: 'Número de Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} bold /> },
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
      { accessorKey: 'invoiceCode', header: 'Número de Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} /> },
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
      { accessorKey: 'invoiceCode', header: 'Número de Factura', cell: ({ row }) => <InvoiceCodeCell code={row.original.invoiceCode} /> },
      { accessorKey: 'customerName', header: 'Cliente', cell: ({ row }) => row.original.customerName || '—' },
      // Quién la canjeó — el que cobra la comisión de esta venta. Puede ser
      // distinto de a quién Caja se la asignó originalmente al emitirla.
      {
        accessorKey: 'registeredByName',
        header: 'Vendedor (registró la venta)',
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
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('es-NI'),
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tienda"
        title="Facturación"
        description="Genera facturas (ticket) y luego liganlas al registrar la venta."
        actions={
          <Button onClick={() => setIsCreating(true)}>
            <HugeIcon icon={PlusSignIcon} size={16} strokeWidth={2} className="mr-1.5" />
            Nueva Factura
          </Button>
        }
      />

      <Card className="bg-card border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <HugeIcon icon={Invoice01Icon} size={20} className="text-warning" />
            Facturas pendientes de vincular
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Ya se imprimió el ticket pero ningún vendedor ha registrado la venta con este número.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={loadingUnlinked}
            error={unlinkedError}
            empty={unlinkedInvoices.length === 0}
            loadingFallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}
            emptyFallback={
              <div className="rounded-lg border border-dashed bg-muted/50 py-10 text-center">
                <HugeIcon icon={File01Icon} size={36} strokeWidth={2} className="mx-auto mb-3 text-muted-foreground opacity-50" aria-hidden />
                <p className="font-medium text-foreground">Todas las facturas emitidas están registradas como venta.</p>
              </div>
            }
          >
            <DataTable tableId="facturas-pendientes" columns={unlinkedColumns} data={unlinkedInvoices} hideSearch emptyText="No hay facturas pendientes." />
          </QueryState>
        </CardContent>
      </Card>

      <Card className="bg-card border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Facturas completadas (vinculadas)</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={loadingLinked}
            error={linkedError}
            loadingFallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}
          >
            <DataTable
              tableId="facturas-vinculadas"
              columns={linkedColumns}
              data={linkedInvoices}
              searchPlaceholder="Buscar por número o cliente…"
              exportFilename="facturas"
              emptyText="No hay facturas vinculadas."
            />
          </QueryState>
        </CardContent>
      </Card>

      {/* Facturas eliminadas. Se muestra siempre, aunque esté vacía: si aparece
          solo cuando hay anuladas, nadie sabe que el tab existe hasta que
          cancela una y la factura "desaparece". */}
      <Card className="bg-card border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <HugeIcon icon={Delete02Icon} size={20} className="text-destructive" />
            Facturas eliminadas
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Canceladas. Conservan su número: el correlativo no retrocede, así que descartarlas
            deja ese número retirado para siempre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={loadingVoid}
            error={voidError}
            empty={voidInvoices.length === 0}
            loadingFallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}
            emptyFallback={
              <p className="rounded-lg border border-dashed bg-muted/50 py-8 text-center text-sm text-muted-foreground">
                No hay facturas canceladas.
              </p>
            }
          >
            <DataTable columns={voidColumns} data={voidInvoices} hideSearch emptyText="No hay facturas canceladas." />
          </QueryState>
        </CardContent>
      </Card>

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
                  {confirm?.invoice.invoiceCode} pasa a Facturas eliminadas. Conserva su número y
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
            <Button
              onClick={handleConfirm}
              disabled={voiding || deleting}
              className="bg-destructive/90 hover:bg-destructive"
            >
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
