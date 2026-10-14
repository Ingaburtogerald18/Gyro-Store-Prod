import { FormDialogContent } from '~/components/ui/form-layout';
// Ventas: shell del editor y el listado; admin y vendedor ven lo mismo y el rol decide los botones.
// El listado lo recorta el backend. El armado vive en components/admin/sales/.
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import React from 'react';


import { PageHeader } from '~/components/admin/page-header';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { DataTable } from '~/components/ui/data-table';
import { QueryState } from '~/components/ui/query-state';
import { SkeletonCard } from '~/components/ui/skeletons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { StatusBadge } from '~/components/ui/status-badge';
import { SALE_STATUS, statusMeta } from '~/lib/status';
import {
  Kbd,
  Metric,
  MetricStrip,
  SegmentedControl,
  ToolbarSearch,
  ToolbarSelect,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from '~/components/admin/workspace';
import { useAppSelector } from '~/state/hooks';
import { selectIsAdmin } from '~/state/slices/auth-slice';
import { errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import {
  useApproveSaleMutation,
  useGetSalesQuery,
  useRejectSaleMutation,
  type SaleListItem,
  type SaleWithItems,
} from '~/state/api/sales-api';
import { Spinner } from '~/components/ui/spinner';
// `lazy`: el editor (22 KB) viaja recién al abrir el diálogo.
const SaleEditor = lazy(() =>
  import('~/components/admin/sales/sale-editor').then((m) => ({ default: m.SaleEditor })),
);
import { SellerPerformance } from '~/components/admin/sales/seller-performance';
import { SaleDetailDrawer } from '~/components/admin/sales/sale-detail-drawer';
import { InvoiceCodeCell } from '~/components/admin/invoices/invoice-code-cell';
import {
  SellerPayoutSummaryDialog,
  type PayoutSummaryTarget,
} from '~/components/admin/sales/seller-payout-summary-dialog';
import { PayCommissionsDialog } from '~/components/admin/sales/pay-commissions-dialog';
import { CommissionPaymentsDialog } from '~/components/admin/sales/commission-payments-dialog';

export const meta: MetaFunction = () => [{ title: pageTitle('Ventas', { admin: true }) }];

const STATUS_TABS = [
  { value: 'pending_approval', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'all', label: 'Todas' },
] as const;

export default function AdminVentas() {
  const isAdmin = useAppSelector(selectIsAdmin);

  const [approveSale] = useApproveSaleMutation();
  const [rejectSale] = useRejectSaleMutation();
  // Estado propio: al rechazar varias en paralelo, `isLoading` solo refleja la última llamada.
  const [rejecting, setRejecting] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Venta en edición (corregir datos antes/después de aprobar). El mismo editor
  // sirve para registrar (sin `sale`) y para editar (con `sale`).
  const [editingSale, setEditingSale] = useState<SaleWithItems | null>(null);

  function closeEditor() {
    setIsEditorOpen(false);
    setEditingSale(null);
  }

  // El filtro vive en la URL para que la campana enlace al estado que anuncia.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? 'pending_approval';

  // `?nueva=1` abre el editor: «Registrar venta» queda enlazable.
  useEffect(() => {
    if (searchParams.get('nueva') === '1') {
      setIsEditorOpen(true);
      // Se consume el parámetro para que cerrar el diálogo y recargar no lo
      // vuelva a abrir.
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

  // `?sale=<id>` abre el detalle: una notificación enlaza al registro exacto.
  const openSaleId = searchParams.get('sale');
  const openSale = (id: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('sale', id);
        else next.delete('sale');
        return next;
      },
      { replace: true },
    );

  function setStatusFilter(next: string) {
    // `replace` para no llenar el historial con cada cambio de pestaña: volver
    // atrás debería salir de Ventas, no recorrer los filtros que se probaron.
    setSearchParams(next === 'pending_approval' ? {} : { status: next }, { replace: true });
  }

  const {
    data: sales = [],
    isLoading: loadingSales,
    isFetching: fetchingSales,
    isError: salesError,
    refetch: refetchSales,
  } = useGetSalesQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  // El vendedor no va en la URL. Las opciones salen de la pestaña actual, no de lo filtrado, para que
  // elegir uno no haga desaparecer al resto.
  const [sellerFilter, setSellerFilter] = useState('all');
  // Búsqueda de la barra (vendedor, factura…): la resuelve el filtro global
  // de la tabla sobre el valor de cada celda.
  const [search, setSearch] = useState('');
  useShortcut('n', () => setIsEditorOpen(true));
  const sellerOptions = useMemo<{ value: string; label: string }[]>(() => {
    const names = new Set(sales.map((s) => s.sellerName || s.sellerEmail));
    return [
      { value: 'all', label: 'Todos los vendedores' },
      ...Array.from(names).sort().map((name) => ({ value: name, label: name })),
    ];
  }, [sales]);
  useEffect(() => {
    setSellerFilter('all');
  }, [statusFilter]);

  // Lo que se muestra: la pestaña (filtrada en el servidor) más el vendedor (en el cliente).
  const filteredSales = useMemo(
    () =>
      sellerFilter === 'all'
        ? sales
        : sales.filter((s) => (s.sellerName || s.sellerEmail) === sellerFilter),
    [sales, sellerFilter],
  );

  // Puede ser una venta (desde el detalle) o varias (rechazo masivo desde la
  // barra de selección) — el mismo diálogo sirve para las dos.
  const [rejectFor, setRejectFor] = useState<SaleListItem[] | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Selección múltiple solo en Pendientes y para admin; se reinicia al cambiar de pestaña.
  const canBulkSelect = isAdmin && statusFilter === 'pending_approval';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, sellerFilter]);

  // El pago es por vendedor: no se mezclan ventas de otro vendedor en una selección.
  const selectedSellerEmail = useMemo(() => {
    const firstId = selectedIds.values().next().value;
    return firstId ? sales.find((s) => s.id === firstId)?.sellerEmail ?? null : null;
  }, [selectedIds, sales]);

  const toggleSelect = useCallback(
    (row: SaleListItem) => {
      setSelectedIds((prev) => {
        if (prev.has(row.id)) {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        }
        if (selectedSellerEmail && row.sellerEmail !== selectedSellerEmail) {
          toast.error('Solo podés aprobar ventas de UN vendedor a la vez. Deseleccioná las de otro vendedor primero.');
          return prev;
        }
        const next = new Set(prev);
        next.add(row.id);
        return next;
      });
    },
    [selectedSellerEmail],
  );

  const handleSelectAll = useCallback(
    (all: boolean) => {
      if (!all) {
        setSelectedIds(new Set());
        return;
      }
      const sellers = new Set(filteredSales.map((s) => s.sellerEmail));
      if (sellers.size > 1) {
        toast.error('Hay ventas de varios vendedores en esta lista. Seleccioná manualmente las de UN vendedor.');
        return;
      }
      setSelectedIds(new Set(filteredSales.map((s) => s.id)));
    },
    [filteredSales],
  );

  // Pago de comisiones: `payFor` es el vendedor sugerido al abrir (o '' para
  // el primero de la lista); null = cerrado.
  const [payFor, setPayFor] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [bulkApproving, setBulkApproving] = useState(false);
  const [payoutSummaryFor, setPayoutSummaryFor] = useState<PayoutSummaryTarget | null>(null);
  async function handleBulkApprove() {
    const targetSales = sales.filter((s) => selectedIds.has(s.id));
    if (targetSales.length === 0) return;
    const sellerEmail = targetSales[0].sellerEmail;
    const sellerName = targetSales[0].sellerName || sellerEmail;

    setBulkApproving(true);
    try {
      // En serie, no en paralelo: varias ventas suelen tocar los mismos lotes,
      // y aprobarlas a la vez las hacía chocar en el stock y fallar al azar.
      const approved: SaleListItem[] = [];
      let firstError: unknown = null;
      for (const s of targetSales) {
        try {
          await approveSale(s.id).unwrap();
          approved.push(s);
        } catch (err) {
          firstError ??= err;
        }
      }
      const failed = targetSales.length - approved.length;

      if (failed > 0) {
        toast.error(
          `${approved.length} aprobada${approved.length === 1 ? '' : 's'}, ${failed} fallaron. ${errMsg(firstError, '')}`.trim(),
        );
      }
      setSelectedIds(new Set());

      // El popup de resumen es el "recibo" del lote: solo tiene sentido si
      // ALGO se aprobó de verdad.
      if (approved.length > 0) {
        toast.success(`${approved.length} venta${approved.length === 1 ? '' : 's'} aprobada${approved.length === 1 ? '' : 's'}.`, {
          icon: React.createElement(HugeIcon, { icon: CheckmarkCircle02Icon, size: 18 }),
        });
        setPayoutSummaryFor({
          sellerEmail,
          sellerName,
          batchCount: approved.length,
          batchComision: approved.reduce((sum, s) => sum + s.totalComision, 0),
        });
      }
    } finally {
      setBulkApproving(false);
    }
  }

  // `useCallback` para poder incluirlo en las dependencias del `useMemo` de columnas.
  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveSale(id).unwrap();
        toast.success('Venta aprobada.', {
          icon: React.createElement(HugeIcon, { icon: CheckmarkCircle02Icon, size: 18 }),
        });
      } catch (err) {
        toast.error(errMsg(err, 'No se pudo aprobar la venta.'));
      }
    },
    [approveSale],
  );

  async function handleReject() {
    if (!rejectFor || rejectFor.length === 0 || !rejectReason.trim()) {
      toast.error('El motivo de rechazo es obligatorio.');
      return;
    }
    const reason = rejectReason.trim();
    setRejecting(true);
    try {
      // Un solo motivo se aplica a TODAS las seleccionadas: es el mismo
      // formulario para una venta o para varias, así que se manda en paralelo.
      const results = await Promise.allSettled(
        rejectFor.map((s) => rejectSale({ id: s.id, reason }).unwrap()),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(ok === 1 ? 'Venta rechazada.' : `${ok} ventas rechazadas.`);
      } else {
        toast.error(`${ok} rechazada${ok === 1 ? '' : 's'}, ${failed} fallaron.`);
      }
      setRejectFor(null);
      setRejectReason('');
      setSelectedIds(new Set());
    } finally {
      setRejecting(false);
    }
  }


  const columns = useMemo<ColumnDef<SaleListItem, unknown>[]>(() => {
    const cols: ColumnDef<SaleListItem, unknown>[] = [
      {
        accessorKey: 'createdAt',
        header: 'Fecha',
        cell: ({ row }) => <span className="whitespace-nowrap">{formatLongDate(row.original.createdAt)}</span>,
      },
      {
        id: 'vendedor',
        header: 'Vendedor',
        // `accessorFn`: el buscador filtra por el valor de la celda, así el nombre tiene que ser el valor.
        accessorFn: (row) => row.sellerName || row.sellerEmail,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.sellerName || row.original.sellerEmail}
          </span>
        ),
      },
      {
        accessorKey: 'invoiceCode',
        header: 'Nº Factura',
        cell: ({ row }) =>
          row.original.invoiceCode ? (
            <InvoiceCodeCell code={row.original.invoiceCode} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'total',
        header: 'Total',
        // Total de la venta SIN el delivery (el delivery no genera comisión ni
        // entra en las ventas de productos; se informa en el reporte de Delivery).
        accessorFn: (row) => Math.max(0, row.total - (row.deliveryFee ?? 0)),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const totalSinDelivery = Math.max(0, row.original.total - (row.original.deliveryFee ?? 0));
          return <span className="font-semibold">{formatCordobas(totalSinDelivery)}</span>;
        },
      },
      {
        accessorKey: 'totalComision',
        header: 'Comisión',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-medium text-foreground">{formatCordobas(row.original.totalComision)}</span>,
      },
    ];

    if (isAdmin) {
      cols.push({
        accessorKey: 'totalSalary',
        header: 'Fondo empresa',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {formatCordobas(row.original.totalSalary ?? 0)}
          </span>
        ),
      });

      cols.push({
        accessorKey: 'totalGananciaTienda',
        header: 'Ganancia tienda',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {formatCordobas(row.original.totalGananciaTienda ?? 0)}
          </span>
        ),
      });
    }

    cols.push({
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => {
        const meta = statusMeta(SALE_STATUS, row.original.status);
        return (
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status={meta.status} label={meta.label} />
            {/* Solo admin recibe la marca (el backend la recorta al vendedor). */}
            {row.original.belowMinMargin && (
              <span
                className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-warning"
                title="Algún producto se vendió por debajo del margen mínimo"
              >
                Bajo margen
              </span>
            )}
          </span>
        );
      },
    });

    return cols;
  }, [isAdmin]);

  // El rótulo dice qué representa la comisión en cada pestaña (la de una rechazada no se debe).
  const comisionLabel =
    statusFilter === 'pending_approval'
      ? 'Comisión pendiente'
      : statusFilter === 'approved'
        ? 'Comisión por pagar'
        : statusFilter === 'paid'
          ? 'Comisión pagada'
          : 'Comisión total';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Ventas"
        description="Listado general y registro de ventas."
        className="mb-0"
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setHistoryOpen(true)}
                  className="h-9 rounded-xl"
                >
                  Historial de pagos
                </Button>
                <Button variant="outline" onClick={() => setPayFor('')} className="h-9 rounded-xl">
                  Pagar comisiones
                </Button>
              </>
            )}
            <Button onClick={() => setIsEditorOpen(true)} className="h-9 gap-2 rounded-xl">
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
              Registrar venta
              <Kbd>N</Kbd>
            </Button>
          </div>
        }
      />

      {/* El editor sirve para registrar (sin `sale`) y para editar (con `sale`,
              disparado desde el detalle). El header queda fijo y el cuerpo scrollea. */}
      <Dialog open={isEditorOpen || !!editingSale} onOpenChange={(open) => !open && closeEditor()}>
        <FormDialogContent size="long">
          <DialogHeader>
            <DialogTitle>{editingSale ? 'Editar venta' : 'Registrar venta'}</DialogTitle>
            <DialogDescription>
              {editingSale
                ? 'Corregí los datos de la venta antes de aprobarla o rechazarla.'
                : 'El stock se reserva al registrar y se descuenta al aprobar.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            {/* Fallback con la altura del editor para que el panel no salte al llegar el chunk. */}
            <Suspense fallback={<SkeletonCard lines={8} className="border-none" />}>
              <SaleEditor sale={editingSale} onDone={closeEditor} onCancel={closeEditor} />
            </Suspense>
          </div>
        </FormDialogContent>
      </Dialog>

      {/* El vendedor no tiene Reportería: su desempeño vive acá. */}
      {!isAdmin && <SellerPerformance />}

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Estado de la venta"
            value={statusFilter as (typeof STATUS_TABS)[number]['value']}
            onChange={setStatusFilter}
            options={STATUS_TABS}
          />
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder="Buscar vendedor o factura"
          />
          <ToolbarSelect
            label="Vendedor"
            value={sellerFilter}
            onChange={setSellerFilter}
            options={sellerOptions}
          />
        </WorkspaceToolbar>

        {/* Resumen de lo que se ve (estado + vendedor), no del total sin filtrar. */}
        <MetricStrip columns={statusFilter === 'rejected' || !isAdmin ? 2 : 4}>
          <Metric
            label="Importe"
            value={formatCordobas(
              filteredSales.reduce((sum, s) => sum + Math.max(0, s.total - (s.deliveryFee ?? 0)), 0),
            )}
            sub={`${filteredSales.length} ${
              filteredSales.length === 1 ? 'venta' : 'ventas'
            } · sin delivery`}
          />
          {/* Una venta rechazada no genera comisión ni ganancia real: mostrarlas
                  en esa pestaña sería plata que nunca se movió. */}
          {statusFilter !== 'rejected' && (
            <Metric
              label={comisionLabel}
              value={formatCordobas(filteredSales.reduce((sum, s) => sum + s.totalComision, 0))}
            />
          )}
          {/* Fondo de empresa y ganancia de tienda: datos sensibles, solo admin
                  (el backend tampoco los manda a un vendedor común). */}
          {statusFilter !== 'rejected' && isAdmin && (
            <Metric
              label="Fondo empresa"
              value={formatCordobas(filteredSales.reduce((sum, s) => sum + (s.totalSalary ?? 0), 0))}
            />
          )}
          {statusFilter !== 'rejected' && isAdmin && (
            <Metric
              label="Ganancia tienda"
              value={formatCordobas(
                filteredSales.reduce((sum, s) => sum + (s.totalGananciaTienda ?? 0), 0),
              )}
            />
          )}
        </MetricStrip>

        <div className="space-y-3">
          {/* Barra de acciones masivas: solo aparece con algo seleccionado
                (que a su vez solo es posible en Pendientes, para admin). */}
          {canBulkSelect && selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-primary-2/30 bg-primary-2/5 px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size} venta{selectedIds.size === 1 ? '' : 's'} seleccionada
                {selectedIds.size === 1 ? '' : 's'}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setRejectFor(sales.filter((s) => selectedIds.has(s.id)))}
                >
                  Rechazar seleccionadas
                </Button>
                <Button size="sm" onClick={handleBulkApprove} disabled={bulkApproving}>
                  {bulkApproving && <Spinner className="mr-2" />}
                  Aprobar seleccionadas
                </Button>
              </div>
            </div>
          )}

          {/* Sin <Card>: DataTable ya trae borde y fondo, y envolverla daba doble borde. */}
          {/* Primera carga → esqueleto; recarga → los datos de antes, atenuados. */}
          <QueryState
            loading={loadingSales}
            fetching={fetchingSales}
            error={salesError}
            onRetry={refetchSales}
            shape="table"
          >
            <DataTable
              tableId="ventas"
              columns={columns}
              data={filteredSales}
              hideSearch
              globalFilterValue={search}
              onGlobalFilterChange={setSearch}
              exportFilename="ventas"
              emptyText="No hay ventas en este estado."
              onRowClick={(row) => openSale(row.id)}
              selectedRowIds={canBulkSelect ? selectedIds : undefined}
              onToggleRow={canBulkSelect ? toggleSelect : undefined}
              onSelectAll={canBulkSelect ? handleSelectAll : undefined}
              allSelected={
                canBulkSelect &&
                filteredSales.length > 0 &&
                filteredSales.every((s) => selectedIds.has(s.id))
              }
            />
          </QueryState>
        </div>
      </Workspace>

      <SaleDetailDrawer
        saleId={openSaleId}
        onClose={() => openSale(null)}
        isAdmin={isAdmin}
        onApprove={handleApprove}
        onReject={(id) => {
          // El detalle puede venir de un enlace a una venta que no está en la
          // pestaña actual: el rechazo solo necesita el id.
          const sale = sales.find((s) => s.id === id);
          setRejectFor([sale ?? ({ id } as SaleListItem)]);
        }}
        onEdit={(sale) => {
          // El detalle trae la venta completa (SaleWithItems); se abre el editor
          // con ella y se cierra el detalle para no apilar dos diálogos.
          setEditingSale(sale);
          openSale(null);
        }}
      />

      <Dialog open={!!rejectFor} onOpenChange={(open) => !open && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejectFor && rejectFor.length > 1
                ? `Rechazar ${rejectFor.length} ventas`
                : 'Rechazar venta'}
            </DialogTitle>
            {rejectFor && rejectFor.length > 1 && (
              <DialogDescription>
                El mismo motivo se aplica a las {rejectFor.length} ventas seleccionadas.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo (obligatorio)</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="¿Por qué se rechaza?"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="cancel" onClick={() => setRejectFor(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
              {rejecting && <Spinner className="mr-2" />}
              Rechazar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SellerPayoutSummaryDialog
        target={payoutSummaryFor}
        onClose={() => setPayoutSummaryFor(null)}
        onPay={(email) => {
          setPayoutSummaryFor(null);
          setPayFor(email);
        }}
      />

      {isAdmin && (
        <>
          <PayCommissionsDialog
            open={payFor !== null}
            initialSellerEmail={payFor || null}
            onClose={() => setPayFor(null)}
          />
          <CommissionPaymentsDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
        </>
      )}
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from '~/components/route-error';
