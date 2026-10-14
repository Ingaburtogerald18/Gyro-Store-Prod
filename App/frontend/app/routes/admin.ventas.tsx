import { FormDialogContent } from '~/components/ui/form-layout';
// Portal de Ventas (doc 09 ítem 65): cotizador + registro + aprobar/rechazar
// (admin) + listado scoped por rol (lo scopea el backend, no el frontend).
//
// Esta ruta es solo el SHELL: monta el editor y el listado. El armado de la
// venta vive en `components/admin/sales/` (SaleEditor + SaleLinesTable +
// QuoteSummary), como en v1.
//
// Reciclaje de v1 (admin.ventas.tsx + AdminSales.tsx): se recicla la idea de
// "un shell, admin y vendedor ven lo mismo, el rol decide qué botones
// aparecen". Se reescribe todo lo demás: v1 resolvía productos nativos+migrados
// con foto de recibo y admin-en-nombre-de un vendedor — el backend v2 (MVP
// Hito 3) solo tiene inventario nativo, sin fotos, y cada vendedor registra su
// propia venta (ver server/services/sales.ts). Un producto no puede repetirse
// en dos líneas (mismo límite del backend, evita la lógica de "distribuir
// reservas" de v1).
import { HugeIcon } from '~/components/ui/icon';
import { Add01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { MetaFunction } from '@remix-run/node';
import { pageTitle } from '~/lib/brand';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import React from 'react';


import { PageHeader } from '~/components/layout/PageHeader';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { DataTable } from '~/components/ui/DataTable';
import { QueryState } from '~/components/ui/QueryState';
import { SkeletonCard } from '~/components/ui/skeletons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { StatusBadge } from '~/components/ui/StatusBadge';
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
import { useAppSelector } from '~/store/hooks';
import { selectIsAdmin } from '~/store/slices/authSlice';
import { errMsg, formatCordobas, formatLongDate } from '~/lib/formatters';
import {
  useApproveSaleMutation,
  useGetSalesQuery,
  useRejectSaleMutation,
  type SaleListItem,
  type SaleWithItems,
} from '~/store/api/salesApi';
import { Spinner } from '~/components/ui/spinner';
// `SaleEditor` son 22 KB que hoy se descargaban al abrir Ventas aunque nadie
// registrara nada. Con `lazy` el chunk viaja recién al abrir el diálogo — y
// para entonces el usuario ya decidió esperar.
const SaleEditor = lazy(() =>
  import('~/components/admin/sales/SaleEditor').then((m) => ({ default: m.SaleEditor })),
);
import { SellerPerformance } from '~/components/admin/sales/SellerPerformance';
import { SaleDetailDrawer } from '~/components/admin/sales/SaleDetailDrawer';
import { InvoiceCodeCell } from '~/components/admin/invoices/InvoiceCodeCell';
import {
  SellerPayoutSummaryDialog,
  type PayoutSummaryTarget,
} from '~/components/admin/sales/SellerPayoutSummaryDialog';
import { PayCommissionsDialog } from '~/components/admin/sales/PayCommissionsDialog';
import { CommissionPaymentsDialog } from '~/components/admin/sales/CommissionPaymentsDialog';

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
  // Estado propio y no `isLoading` del hook: al rechazar varias en paralelo
  // (`Promise.allSettled`) el `isLoading` del hook solo refleja la ÚLTIMA
  // llamada disparada, no el lote completo.
  const [rejecting, setRejecting] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Venta en edición (corregir datos antes/después de aprobar). El mismo editor
  // sirve para registrar (sin `sale`) y para editar (con `sale`).
  const [editingSale, setEditingSale] = useState<SaleWithItems | null>(null);

  function closeEditor() {
    setIsEditorOpen(false);
    setEditingSale(null);
  }

  // El filtro vive en la URL para que la campana de notificaciones pueda
  // enlazar directo al estado que anuncia ("3 ventas esperan tu aprobación").
  // Con estado local a secas el enlace llegaba a la pestaña equivocada.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? 'pending_approval';

  // `?nueva=1` abre el editor: la acción "Registrar venta" queda ENLAZABLE
  // (una notificación o un mensaje pueden apuntar directo al formulario) sin
  // subir el estado del diálogo a un store global.
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

  // `?sale=<id>` abre el detalle. Vive en la URL, no en estado local, para que
  // una notificación pueda enlazar al REGISTRO exacto y no solo a la pestaña
  // que lo contiene.
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

  // Filtro por vendedor: vive fuera de la URL (a diferencia de `statusFilter`)
  // porque nada externo necesita enlazar directo a "las pendientes de Fulano".
  // Las opciones salen de la pestaña ACTUAL (`sales`, ya scopeada por status),
  // no de `filteredSales`: si no, elegir un vendedor haría desaparecer al resto
  // de la lista de opciones.
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

  // Lo que la tabla y el resumen de dinero realmente muestran: la pestaña
  // (ya la filtró el servidor) + el vendedor (client-side, mismo criterio que
  // `filteredPurchases` en Inventario).
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

  // ── Selección múltiple: SOLO en "Pendientes" y SOLO admin (es quien puede
  // aprobar/rechazar; a un vendedor mirando sus propias pendientes no le sirve
  // de nada seleccionar varias). Se resetea al cambiar de pestaña para no
  // dejar ids seleccionados de un listado que ya no se está viendo. ──
  const canBulkSelect = isAdmin && statusFilter === 'pending_approval';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, sellerFilter]);

  // El pago se hace por vendedor (es lo que arma el popup de resumen), así
  // que un lote mezclado no tendría un "cuánto le debemos" que tenga sentido.
  // Se bloquea agregar una venta de OTRO vendedor a una selección existente
  // en vez de dejar mezclar y recién avisar al aprobar — así el usuario nunca
  // llega a un estado que después haya que deshacer.
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
        // `accessorFn` y no `accessorKey`: el filtro global de la tabla busca
        // sobre el VALOR de la celda, así que el nombre tiene que ser el valor
        // para que "buscar por vendedor" funcione. El correo queda de respaldo
        // para las cuentas que nunca completaron el perfil.
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

  // La comisión de una venta rechazada no se le debe a nadie — el rótulo
  // avisa qué representa el número en CADA pestaña en vez de un genérico
  // "Comisión" que en Pendientes/Aprobadas se leería como ya pagada.
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
            {/* El fallback tiene la ALTURA aproximada del editor: con un spinner
                    chico el panel se abriría casi vacío y saltaría al llegar el
                    chunk. */}
            <Suspense fallback={<SkeletonCard lines={8} className="border-none" />}>
              <SaleEditor sale={editingSale} onDone={closeEditor} onCancel={closeEditor} />
            </Suspense>
          </div>
        </FormDialogContent>
      </Dialog>

      {/* El vendedor no tiene Dashboard en su nav, así que su reportería propia
              vive acá. Al admin no se le muestra: ya la tiene completa (y de todo
              el equipo) en /admin. */}
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

        {/* Resumen de dinero de lo que se está VIENDO (estado + vendedor), no
                del total sin filtrar. La cantidad de ventas va como dato del
                importe para que la franja quepa en cuatro. */}
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

          {/* Sin `<Card>` envolvente: `DataTable` ya trae su borde y su fondo, así
                que envolverla daba doble borde y una sombra de más sobre el
                contenido más importante de la pantalla. La tabla va directo en el
                flujo, a ancho completo. */}
          {/* `isLoading` (primera vez) → esqueleto; `isFetching` (refetch)
                → los datos que ya estaban, atenuados. Cambiar de pestaña no
                debería vaciar la tabla. */}
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
export { AdminRouteError as ErrorBoundary } from '~/components/layout/route-error';
