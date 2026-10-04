// Registro de compras (China), agrupado por LOTE.
//
// ── Por qué agrupado ──
// Las compras llegan por lote: todas las filas de LT1 comparten fecha, estado y
// tiempo de tránsito. En la tabla plana esos tres datos se repetían en cada
// fila (13 columnas) y el "92d Tardó" en rojo aparecía 36 veces sobre
// mercadería que ya estaba en bodega. Acá el lote es una fila de encabezado con
// su fecha, su tránsito (neutro si ya llegó) y su total; las filas solo dicen
// lo que cambia entre productos.
//
// El filtrado (búsqueda, estado) lo decide la pantalla; esta tabla recibe los
// valores ya elegidos para que la barra de herramientas sea una sola.
import { Delete02Icon, Edit02Icon, ShippingTruck01Icon, Store01Icon } from "@hugeicons/core-free-icons";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { HugeIcon } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { StatusBadge, type BadgeStatus } from "~/components/ui/StatusBadge";
import { useCategoryLabel } from "~/hooks/useCategoryLabel";
import { formatLongDate, formatUsd, splitProductName } from "~/lib/formatters";
import { getTransitInfo, formatShortDate, type TransitInfo } from "~/lib/transit";
import { cn } from "~/lib/utils";
import { useDeletePurchaseMutation, useGetPurchasesQuery, type Purchase } from "~/store/api/inventoryV1Api";
import { ArrivalModal } from "./ArrivalModal";
import { EditPurchaseModal } from "./EditPurchaseModal";

export type PurchaseStatusFilter = "all" | "transit" | "received" | "late";

// ── Estado: UNA píldora por fila ──
// Verde = en bodega, azul = en camino, ámbar = en camino más de lo normal
// (banda "bad" de lib/transit). El rojo no se usa: ninguna compra es un error.
type Tone = "ok" | "transit" | "late";

const TONE_BADGE: Record<Tone, { status: BadgeStatus; label: string }> = {
  ok: { status: "success", label: "En bodega" },
  transit: { status: "info", label: "En tránsito" },
  late: { status: "pending", label: "Demorado" },
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
  date: string;
  items: Purchase[];
  total: number;
  units: number;
  tone: Tone;
  transit: string | null;
}

const COLS = 8;

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
  const [del, { isLoading: deleting }] = useDeletePurchaseMutation();
  const categoryLabel = useCategoryLabel();

  const [arrivalFor, setArrivalFor] = useState<Purchase | null>(null);
  const [editFor, setEditFor] = useState<Purchase | null>(null);
  const [deleteFor, setDeleteFor] = useState<Purchase | null>(null);

  // "KZ Audífonos" → "Audífonos": el prefijo de marca es ruido en una columna
  // donde todo es KZ. Solo afecta lo que se ve.
  const categoryText = (id: string | null) => {
    const label = categoryLabel(id ?? "");
    return label && label !== "—" ? label.replace(/^KZ\s+/, "") : "";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (status !== "all") {
        const tone = toneOf(p);
        if (status === "received" && tone !== "ok") return false;
        if (status === "transit" && tone === "ok") return false;
        if (status === "late" && tone !== "late") return false;
      }
      if (!q) return true;
      return [p.code, p.productName, p.lot, categoryLabel(p.category ?? "")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [purchases, search, status, categoryLabel]);

  // Lotes del más reciente al más viejo; dentro del lote, por código (GS-IN-2
  // antes que GS-IN-10).
  const lots = useMemo<Lot[]>(() => {
    const map = new Map<string, Purchase[]>();
    for (const p of filtered) {
      const key = `${p.lot || "—"}|${p.purchaseDate}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()]
      .map(([key, items]) => {
        items.sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), undefined, { numeric: true }));
        const tones = items.map((p) => toneOf(p));
        // El lote toma el estado "peor": uno demorado lo marca demorado.
        const tone: Tone = tones.includes("late") ? "late" : tones.includes("transit") ? "transit" : "ok";
        return {
          key,
          lot: items[0].lot || "Sin lote",
          date: items[0].purchaseDate,
          items,
          total: items.reduce((s, p) => s + (p.total ?? 0), 0),
          units: items.reduce((s, p) => s + (p.quantity ?? 0), 0),
          tone,
          transit: transitText(getTransitInfo(items[0])),
        };
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.lot.localeCompare(b.lot, undefined, { numeric: true }));
  }, [filtered]);

  const totalUnits = filtered.reduce((s, p) => s + (p.quantity ?? 0), 0);
  const totalUsd = filtered.reduce((s, p) => s + (p.total ?? 0), 0);

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
      <div className="space-y-2 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const th = "whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
  const td = "px-4 py-2.5 align-middle";

  return (
    <>
      <table className="w-full min-w-[880px] border-collapse text-sm tabular-nums">
        {/* Encabezado fijo bajo el header del panel (h-14). Funciona porque
            el contenedor usa overflow-clip, que no crea un contexto de scroll. */}
        <thead className="sticky top-14 z-10 bg-card">
          <tr className="border-b border-border">
            <th className={th}>Código</th>
            <th className={th}>Producto</th>
            <th className={th}>Categoría</th>
            <th className={cn(th, "text-right")}>Cant.</th>
            <th className={cn(th, "text-right")}>Costo unit.</th>
            <th className={cn(th, "text-right")}>Total</th>
            <th className={th}>Estado</th>
            <th className={cn(th, "w-px")}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {lots.length === 0 && (
            <tr>
              <td colSpan={COLS} className="px-4 py-16 text-center text-sm text-muted-foreground">
                {purchases.length === 0
                  ? "Aún no hay compras registradas."
                  : "Ninguna compra coincide con la búsqueda o el filtro."}
              </td>
            </tr>
          )}

          {lots.map((lot) => (
            <Fragment key={lot.key}>
              <tr className="border-b border-border bg-muted/40">
                <td colSpan={COLS} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">Lote {lot.lot}</span>
                    <span className="text-xs text-muted-foreground">
                      Pedido {formatLongDate(lot.date)}
                      {lot.transit && ` · ${lot.transit}`}
                      {` · ${lot.items.length} ${lot.items.length === 1 ? "producto" : "productos"}`}
                    </span>
                    <StatusPill tone={lot.tone} />
                    <span className="ml-auto font-display text-sm font-bold text-foreground">
                      {formatUsd(lot.total)}
                    </span>
                  </div>
                </td>
              </tr>

              {lot.items.map((p) => {
                const { model, variant } = splitProductName(p.productName);
                const tone = toneOf(p);
                const category = categoryText(p.category);
                return (
                  <tr key={p.id} className="border-b border-border transition-colors hover:bg-muted/30">
                    <td className={cn(td, "whitespace-nowrap font-spec text-xs text-muted-foreground")}>
                      {p.code || "—"}
                    </td>
                    <td className={cn(td, "min-w-0")}>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{model}</span>
                        {variant && <span className="text-xs text-muted-foreground">{variant}</span>}
                      </div>
                    </td>
                    <td className={td}>
                      {category ? (
                        <span className="whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cn(td, "text-right text-foreground")}>{p.quantity}</td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex flex-col items-end" title={`Base ${formatUsd(p.costUnit, 4)} + impuesto ${formatUsd(p.taxUnit, 4)}`}>
                        <span className="text-foreground">{formatUsd(p.priceUnit)}</span>
                        <span className="text-2xs text-muted-foreground">
                          {formatUsd(p.costUnit)} + {formatUsd(p.taxUnit)} imp.
                        </span>
                      </div>
                    </td>
                    <td className={cn(td, "text-right font-display font-bold text-foreground")}>{formatUsd(p.total)}</td>
                    <td className={td}>
                      <StatusPill tone={tone} />
                    </td>
                    <td className={cn(td, "text-right")}>
                      <RowActionsMenu
                        actions={
                          p.status === "china"
                            ? [
                                { group: "Movimiento", label: "Reportar ingreso", icon: <HugeIcon icon={ShippingTruck01Icon} size={16} strokeWidth={2} />, onClick: () => setArrivalFor(p) },
                                { group: "Gestión", label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) },
                                { label: "Eliminar", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: () => setDeleteFor(p) },
                              ]
                            : [
                                onViewStock && { label: "Ver en stock actual", icon: <HugeIcon icon={Store01Icon} size={16} strokeWidth={2} />, onClick: onViewStock },
                                { label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) },
                                { label: "Eliminar", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: () => setDeleteFor(p) },
                              ]
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>

        {/* Totales fijos al pie: lo que antes era la barra de resumen de arriba. */}
        {filtered.length > 0 && (
          <tfoot className="sticky bottom-0 z-10 bg-card">
            <tr className="border-t border-border shadow-[0_-1px_0_var(--color-border)]">
              <td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "compra" : "compras"} · {lots.length}{" "}
                {lots.length === 1 ? "lote" : "lotes"}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-foreground">{totalUnits.toLocaleString("en-US")}</td>
              <td />
              <td className="px-4 py-3 text-right font-display text-base font-bold text-foreground">{formatUsd(totalUsd)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      <ArrivalModal purchase={arrivalFor} onClose={() => setArrivalFor(null)} />
      <EditPurchaseModal purchase={editFor} onClose={() => setEditFor(null)} />
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
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>
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
