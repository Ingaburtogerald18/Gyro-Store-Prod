// Registro de compras (China), agrupado por ORDEN DE ALIBABA (migración 0024).
// Sin la migración, o para compras sueltas sin orden, se agrupa por lote como
// antes. Cada grupo conserva su resumen al cerrar los productos. El total
// completo de la orden se distingue del subtotal de productos filtrados.
//
// El filtrado (búsqueda, estado) lo decide la pantalla; esta tabla recibe los
// valores ya elegidos para que la barra de herramientas sea una sola.
import {
  Add01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  Image01Icon,
  Invoice01Icon,
  PackageReceiveIcon,
  Share01Icon,
  ShippingTruck01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { HugeIcon } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { Chip, chipVariants } from "~/components/ui/chip";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { StatusBadge, type BadgeStatus } from "~/components/ui/StatusBadge";
import { useCategoryLabel } from "~/hooks/useCategoryLabel";
import { formatLongDate, formatUsd, splitProductName } from "~/lib/formatters";
import { getTransitInfo, formatShortDate, type TransitInfo } from "~/lib/transit";
import { cn } from "~/lib/utils";
import {
  useDeletePurchaseMutation,
  useDeletePurchaseOrderMutation,
  useGetPurchaseOrdersQuery,
  useGetPurchasesQuery,
  type Purchase,
  type PurchaseOrder,
} from "~/store/api/inventoryV1Api";
import { canSharePhotoFiles, downloadOrderPhotos, shareOrderPhotos } from "~/lib/purchaseOrderPhotos";
import { ArrivalModal } from "./ArrivalModal";
import { EditPurchaseModal } from "./EditPurchaseModal";
import { EditArrivalModal } from "./EditArrivalModal";
import { AddOrderLinesDialog, EditPurchaseOrderDialog, MISSING_LABELS } from "./PurchaseOrderDialogs";
import { OrderAccordion } from "./OrderAccordion";
import { ReceiveOrderDialog } from "./ReceiveOrderDialog";

export type PurchaseStatusFilter = "all" | "transit" | "received" | "late" | "incomplete";

// ── Estado: UNA píldora por fila ──
// Verde = en bodega, azul = en camino, ámbar = en camino más de lo normal
// (banda "bad" de lib/transit). El rojo no se usa: ninguna compra es un error.
type Tone = "ok" | "transit" | "late" | "partial";

const TONE_BADGE: Record<Tone, { status: BadgeStatus; label: string }> = {
  ok: { status: "success", label: "En bodega" },
  transit: { status: "info", label: "En tránsito" },
  late: { status: "pending", label: "Demorado" },
  // Orden que llegó por partes: algo en bodega, algo todavía en camino.
  partial: { status: "info", label: "Llegó en parte" },
};

function toneOf(p: Purchase, info: TransitInfo = getTransitInfo(p)): Tone {
  if (p.status === "received") return "ok";
  return info.state === "transit" && info.band === "bad" ? "late" : "transit";
}

function StatusPill({ tone }: { tone: Tone }) {
  return <StatusBadge status={TONE_BADGE[tone].status} label={TONE_BADGE[tone].label} />;
}

/** Cómo va el tránsito del lote, en palabras. Neutro: el color lo da la píldora. */
function transitText(info: TransitInfo): string | null {
  if (info.state === "waiting") {
    return info.departure ? `zarpa el ${formatShortDate(info.departure)}` : "por zarpar";
  }
  if (info.days === null) return null;
  if (info.state === "arrived") return `llegó en ${info.days} ${info.days === 1 ? "día" : "días"}`;
  if (info.state === "transit") return `${info.days} ${info.days === 1 ? "día" : "días"} en camino`;
  return null;
}

interface Lot {
  key: string;
  lot: string;
  /** La orden de Alibaba del grupo (null = compras sueltas agrupadas por lote). */
  order: PurchaseOrder | null;
  date: string;
  items: Purchase[];
  total: number;
  units: number;
  lineCount: number;
  tone: Tone;
  transit: string | null;
}


export function PurchasesTable({
  period = "all",
  search = "",
  status = "all",
  onViewStock,
}: {
  period?: string;
  search?: string;
  status?: PurchaseStatusFilter;
  /** Lleva a la pestaña de stock (acción "Ver en stock" de lo ya recibido). */
  onViewStock?: () => void;
}) {
  const { data: purchases = [], isLoading } = useGetPurchasesQuery(period);
  // Todas las líneas (sin filtro de mes): "Recibir" necesita la orden completa.
  const { data: allPurchases = [] } = useGetPurchasesQuery();
  const { data: ordersData } = useGetPurchaseOrdersQuery();
  const [del, { isLoading: deleting }] = useDeletePurchaseMutation();
  const [delOrder] = useDeletePurchaseOrderMutation();
  const categoryLabel = useCategoryLabel();

  const ordersById = useMemo(
    () => new Map((ordersData?.orders ?? []).map((o) => [o.id, o])),
    [ordersData],
  );
  const orderOf = (p: Purchase) => (p.orderId ? ordersById.get(p.orderId) ?? null : null);

  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null);
  const [editOrderFor, setEditOrderFor] = useState<PurchaseOrder | null>(null);
  const [addLinesFor, setAddLinesFor] = useState<PurchaseOrder | null>(null);
  const [photosBusy, setPhotosBusy] = useState<string | null>(null);
  const [arrivalFor, setArrivalFor] = useState<Purchase | null>(null);
  const [editFor, setEditFor] = useState<Purchase | null>(null);
  const [editArrivalFor, setEditArrivalFor] = useState<Purchase | null>(null);
  const [deleteFor, setDeleteFor] = useState<Purchase | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (status === "incomplete") {
        if (!orderOf(p)?.missing.length) return false;
      } else if (status !== "all") {
        const tone = toneOf(p);
        if (status === "received" && tone !== "ok") return false;
        if (status === "transit" && tone === "ok") return false;
        if (status === "late" && tone !== "late") return false;
      }
      if (!q) return true;
      return [p.code, p.productName, p.lot, categoryLabel(p.category ?? ""), orderOf(p)?.orderNumber, orderOf(p)?.supplier?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, search, status, categoryLabel, ordersById]);

  // Lotes del más reciente al más viejo; dentro del lote, por código (GS-IN-2
  // antes que GS-IN-10).
  const lots = useMemo<Lot[]>(() => {
    const map = new Map<string, Purchase[]>();
    const matchingIds = new Set(filtered.map((p) => p.id));
    for (const p of purchases) {
      const order = orderOf(p);
      const key = order ? `order:${order.id}` : `${p.lot || "—"}|${p.purchaseDate}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()]
      .map(([key, fullItems]) => {
        const items = fullItems.filter((p) => matchingIds.has(p.id));
        if (items.length === 0) return null;
        items.sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), undefined, { numeric: true }));
        const order = orderOf(items[0]);
        const tones = fullItems.map((p) => toneOf(p));
        // El grupo toma el estado "peor": uno demorado lo marca demorado. Una
        // orden con algo en bodega y algo en camino "llegó en parte".
        const tone: Tone = tones.includes("late")
          ? "late"
          : order?.status === "partial"
            ? "partial"
            : tones.includes("transit")
              ? "transit"
              : "ok";
        return {
          key,
          lot: order?.orderNumber ?? (items[0].lot || "Sin lote"),
          order,
          date: order?.purchaseDate ?? items[0].purchaseDate,
          items,
          total: order?.linesTotalUsd ?? fullItems.reduce((s, p) => s + (p.total ?? 0), 0),
          units: order?.units ?? fullItems.reduce((s, p) => s + (p.quantity ?? 0), 0),
          lineCount: order?.lineCount ?? fullItems.length,
          tone,
          transit: transitText(getTransitInfo(fullItems.find((p) => p.status === 'china') ?? fullItems[0])),
        };
      })
      .filter((lot): lot is Lot => lot !== null)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.lot.localeCompare(b.lot, undefined, { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, filtered, ordersById]);

  const totalUnits = filtered.reduce((s, p) => s + (p.quantity ?? 0), 0);
  const totalUsd = filtered.reduce((s, p) => s + (p.total ?? 0), 0);

  async function handlePhotos(order: PurchaseOrder, mode: "download" | "share") {
    setPhotosBusy(order.id);
    try {
      if (mode === "share") {
        const result = await shareOrderPhotos(order.id, order.orderNumber, order.packagePhotos.length);
        if (result === "downloaded") toast.success("Fotos descargadas.");
      } else {
        await downloadOrderPhotos(order.id, order.orderNumber, order.packagePhotos.length);
        toast.success("Fotos descargadas.");
      }
    } catch (err) {
      // Cerrar el menú de compartir sin elegir nada no es un error.
      if ((err as Error)?.name !== "AbortError") toast.error((err as Error)?.message || "No se pudieron bajar las fotos.");
    } finally {
      setPhotosBusy(null);
    }
  }

  async function handleDeleteOrder(order: PurchaseOrder) {
    try {
      await delOrder(order.id).unwrap();
      toast.success(`Orden ${order.orderNumber} eliminada.`);
    } catch (err: unknown) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "No se pudo eliminar la orden.");
    }
  }

  async function handleDelete() {
    if (!deleteFor) return;
    try {
      await del(deleteFor.id).unwrap();
      toast.success("Compra eliminada.");
      setDeleteFor(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "No se pudo eliminar la compra.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }


  return (
    <>
      {lots.length === 0 ? (
        <div className="rounded-2xl border bg-card px-4 py-16 text-center">
          <p className="font-heading text-lg font-bold text-foreground">
            {purchases.length === 0 ? 'Aún no hay compras registradas' : 'Ninguna compra coincide'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {purchases.length === 0 ? 'Registrá la primera con «Registrar compra».' : 'Probá con otra búsqueda o quitá algún filtro.'}
          </p>
        </div>
      ) : (
        <>
          <OrderAccordion
            key={JSON.stringify([period, status, search.trim().toLowerCase()])}
            searching={!!search.trim()}
            panels={lots.map((lot) => ({
              id: lot.key,
              label: `${lot.order ? 'Orden' : 'Lote'} ${lot.lot}`,
              summary: (
                <span className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <span className="min-w-0 space-y-1.5">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <span className="break-all font-heading text-lg leading-tight font-bold text-foreground">
                        {lot.order ? 'Orden' : 'Lote'} <span className="font-spec text-base font-semibold">{lot.lot}</span>
                      </span>
                      <StatusPill tone={lot.tone} />
                      {lot.order?.numberProvisional && (
                        <Chip variant="status" tone="warning">Número provisional</Chip>
                      )}
                    </span>
                    <span className="block text-sm font-semibold text-foreground">{lot.order?.supplier?.name || (lot.order ? 'Proveedor por completar' : 'Compra por lote')}</span>
                    <span className="block text-xs text-muted-foreground">{formatLongDate(lot.date)} · {lot.lineCount} {lot.lineCount === 1 ? 'producto' : 'productos'} · {lot.units.toLocaleString('es-NI')} unidades{lot.transit && ` · ${lot.transit}`}</span>
                    {lot.items.length < lot.lineCount && <span className="block text-xs font-medium text-primary-2">{lot.items.length} de {lot.lineCount} productos coinciden con los filtros</span>}
                  </span>
                  <span className="shrink-0 sm:text-right">
                    <span className="block text-xs text-muted-foreground">Total {lot.order ? 'de la orden' : 'del lote'} · USD</span>
                    <span className="font-heading text-xl font-extrabold tracking-tight text-foreground tabular-nums">{formatUsd(lot.total)}</span>
                  </span>
                </span>
              ),
              toolbar: lot.order ? <OrderHeader
                order={lot.order}
                photosBusy={photosBusy === lot.order.id}
                onReceive={() => setReceiveFor(lot.order)}
                onEdit={() => setEditOrderFor(lot.order)}
                onAddLines={() => setAddLinesFor(lot.order)}
                onPhotos={(mode) => handlePhotos(lot.order!, mode)}
                onDelete={() => handleDeleteOrder(lot.order!)}
              /> : null,
              details: (
                <Table
                  aria-label={`Productos de ${lot.lot}`}
                  containerClassName="rounded-none border-0"
                  className="min-w-[780px] table-fixed tabular-nums"
                >
                    <caption className="sr-only">Productos de {lot.order ? 'la orden' : 'lote'} {lot.lot}. Importes en dólares estadounidenses.</caption>
                    <colgroup>
                      <col className="w-[120px]" />
                      <col />
                      <col className="w-[156px]" />
                      <col className="w-[132px]" />
                      <col className="w-[132px]" />
                      <col className="w-[84px]" />
                    </colgroup>
                    <TableHeader>
                      <tr>
                        <TableHead scope="col">Código</TableHead>
                        <TableHead scope="col">Producto</TableHead>
                        <TableHead scope="col" className="text-right">Costo unit. USD</TableHead>
                        <TableHead scope="col" className="text-right">Total USD</TableHead>
                        <TableHead scope="col">Estado</TableHead>
                        <TableHead scope="col" className="text-right">Acciones</TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {lot.items.map((p) => {
                        const { model, variant } = splitProductName(p.productName);
                        const tone = toneOf(p);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{p.code || 'Sin código'}</TableCell>
                            <TableCell className="min-w-0">
                              <div className="flex flex-col gap-0.5 break-words">
                                <span className="font-semibold text-foreground">{model}</span>
                                {variant && <span className="text-xs text-muted-foreground">{variant}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end" title={`Base ${formatUsd(p.costUnit, 4)} + impuesto ${formatUsd(p.taxUnit, 4)}`}>
                                <span className="font-medium text-foreground">{formatUsd(p.priceUnit)}</span>
                                <span className="text-2xs text-muted-foreground">
                                  {formatUsd(p.costUnit)} + {formatUsd(p.taxUnit)} imp.
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-heading font-extrabold text-foreground">{formatUsd(p.total)}</span>
                                <span className="text-2xs text-muted-foreground">
                                  {p.quantity.toLocaleString('es-NI')} {p.quantity === 1 ? 'unidad' : 'unidades'}
                                </span>
                                {p.quantityOrdered != null && p.quantityOrdered !== p.quantity && (
                                  <span className="text-2xs text-warning">de {p.quantityOrdered} pedidas</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusPill tone={tone} />
                            </TableCell>
                            <TableCell className="text-right">
                              <RowActionsMenu
                                label={`Acciones de ${p.code || p.productName}`}
                                className="inline-flex size-9 items-center justify-center rounded-xl border border-input bg-card text-foreground hover:border-primary-2"
                                actions={
                                  p.status === "china"
                                    ? [
                                        // Una línea de una orden se recibe con su orden (envío total repartido).
                                        !p.orderId && { group: "Movimiento", label: "Reportar ingreso", icon: <HugeIcon icon={ShippingTruck01Icon} size={16} strokeWidth={2} />, onClick: () => setArrivalFor(p) },
                                        { group: "Gestión", label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) },
                                        { label: "Eliminar", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: () => setDeleteFor(p) },
                                      ]
                                    : [
                                        onViewStock && { label: "Ver en stock actual", icon: <HugeIcon icon={Store01Icon} size={16} strokeWidth={2} />, onClick: onViewStock },
                                        { label: "Editar llegada y precio", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditArrivalFor(p) },
                                        { label: "Editar datos de compra", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) },
                                        { label: "Eliminar", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: () => setDeleteFor(p) },
                                      ]
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter className="static">
                      <tr>
                        <th scope="row" colSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                          Subtotal mostrado · {lot.items.length} productos · {lot.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0).toLocaleString('es-NI')} unidades
                        </th>
                        <td />
                        <td className="px-4 py-3 text-right font-heading font-extrabold text-foreground">{formatUsd(lot.items.reduce((sum, item) => sum + (item.total ?? 0), 0))}</td>
                        <td colSpan={2} />
                      </tr>
                    </TableFooter>
                </Table>
              ),
            }))}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
            <span className="text-sm text-muted-foreground">Resumen filtrado · {filtered.length} productos · {totalUnits.toLocaleString('es-NI')} unidades</span>
            <span className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">Total mostrado</span>
              <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums">{formatUsd(totalUsd)}</span>
              <span className="text-xs font-medium text-muted-foreground">USD</span>
            </span>
          </div>
        </>
      )}

      <ReceiveOrderDialog
        order={receiveFor}
        orders={ordersData?.orders ?? []}
        purchases={allPurchases}
        onClose={() => setReceiveFor(null)}
      />
      <EditPurchaseOrderDialog order={editOrderFor} onClose={() => setEditOrderFor(null)} />
      <AddOrderLinesDialog order={addLinesFor} onClose={() => setAddLinesFor(null)} />
      <ArrivalModal purchase={arrivalFor} onClose={() => setArrivalFor(null)} />
      <EditPurchaseModal purchase={editFor} onClose={() => setEditFor(null)} />
      <EditArrivalModal purchase={editArrivalFor} onClose={() => setEditArrivalFor(null)} />
      <Dialog open={!!deleteFor} onOpenChange={() => setDeleteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar compra</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Eliminar la compra <strong className="text-foreground">{deleteFor?.code}</strong>? Esta acción no se
            puede deshacer.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="cancel" onClick={() => setDeleteFor(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Spinner className="mr-2" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Encabezado de una orden de Alibaba en la tabla: número, proveedor, estado,
// lo que le falta y sus acciones (recibir, completar datos, fotos).
function OrderHeader({
  order,
  photosBusy,
  onReceive,
  onEdit,
  onAddLines,
  onPhotos,
  onDelete,
}: {
  order: PurchaseOrder;
  photosBusy: boolean;
  onReceive: () => void;
  onEdit: () => void;
  onAddLines: () => void;
  onPhotos: (mode: "download" | "share") => void;
  onDelete: () => void;
}) {
  const hasPending = order.status === "transit" || order.status === "partial";
  const photos = order.packagePhotos.length;
  const missing = order.missing.map((m) => MISSING_LABELS[m]).join(", ");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {order.missing.length > 0 && (
        <button
          type="button"
          onClick={onEdit}
          title={`Falta: ${missing}`}
          className="min-h-9 rounded-xl px-1 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Chip variant="status" tone="warning">Datos por completar</Chip>
        </button>
      )}
      {order.invoice?.mismatch && (
        <Chip
          variant="status"
          tone="warning"
          className="min-h-9"
          title={`Factura ${formatUsd(order.invoice.totalUsd ?? 0)} · productos de sus órdenes ${formatUsd(order.invoice.linesTotalUsd)}`}
        >
          {/* Se carga de a un producto: que falte es normal mientras se carga. */}
          {(order.invoice.totalUsd ?? 0) > order.invoice.linesTotalUsd
            ? `Faltan ${formatUsd((order.invoice.totalUsd ?? 0) - order.invoice.linesTotalUsd)} de la factura`
            : "Suma más que la factura"}
        </Chip>
      )}
      {order.invoice?.fileUrl && (
        <a
          href={order.invoice.fileUrl}
          target="_blank"
          rel="noreferrer"
          title={
            order.invoice.orders.length > 1
              ? `Compartida con ${order.invoice.orders.filter((o) => o.id !== order.id).map((o) => o.orderNumber).join(", ")}`
              : undefined
          }
          className={cn(chipVariants({ variant: "category" }), "min-h-9 px-3 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          <HugeIcon icon={Invoice01Icon} size={14} strokeWidth={2} aria-hidden className="text-primary-2" />
          {order.invoice.orders.length > 1 ? `Factura (${order.invoice.orders.length} órdenes)` : "Factura"}
        </a>
      )}
      {photos > 0 && (
        <span className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <HugeIcon icon={Image01Icon} size={14} strokeWidth={2} aria-hidden />
          {photos} {photos === 1 ? "foto" : "fotos"}
          {photosBusy && <Spinner className="size-3" />}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {hasPending && (
          <Button className="gap-1.5" onClick={onReceive}>
            <HugeIcon icon={PackageReceiveIcon} size={16} strokeWidth={2} aria-hidden />
            Recibir
          </Button>
        )}
        <RowActionsMenu
          label={`Acciones de la orden ${order.orderNumber}`}
          className="inline-flex size-11 items-center justify-center rounded-xl border border-input bg-card text-foreground hover:border-primary-2"
          actions={[
            hasPending && { group: "Orden", label: "Recibir en Nicaragua", icon: <HugeIcon icon={PackageReceiveIcon} size={16} strokeWidth={2} />, onClick: onReceive },
            { group: "Orden", label: order.missing.length ? "Completar datos" : "Editar orden", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: onEdit },
            { group: "Orden", label: "Agregar productos", icon: <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />, onClick: onAddLines },
            photos > 0 && { group: "Fotos del empaque", label: "Descargar fotos", icon: <HugeIcon icon={Download01Icon} size={16} strokeWidth={2} />, onClick: () => onPhotos("download") },
            photos > 0 && canSharePhotoFiles() && { group: "Fotos del empaque", label: "Compartir fotos", icon: <HugeIcon icon={Share01Icon} size={16} strokeWidth={2} />, onClick: () => onPhotos("share") },
            order.lineCount === 0 && { label: "Eliminar orden", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: onDelete },
          ]}
        />
      </span>
    </div>
  );
}
