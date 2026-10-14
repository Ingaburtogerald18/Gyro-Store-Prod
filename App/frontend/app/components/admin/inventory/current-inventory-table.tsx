// Stock actual: productos recibidos en bodega con todas las columnas calculadas
// (cantidad = original − vendidos, costos). `readOnly` es la vista del vendedor, sin costos.
import { HugeIcon } from "~/components/ui/icon";
import { Alert02Icon, CheckmarkCircle01Icon, Edit02Icon, Delete02Icon, DiscountTag01Icon, LinkSquare02Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { Skeleton } from "~/components/ui/skeleton";
import { DataTable } from "~/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { RowActionsMenu } from "~/components/ui/row-actions-menu";
import { EditArrivalModal } from "./edit-arrival-modal";
import { StockAdjustDialog } from "./stock-adjust-dialog";
import { ColorOfferDialog } from "./color-offer-dialog";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { serverErrorMessage } from "~/components/ui/form-feedback";
import { stockPerProduct } from "./inventory-metrics";
import {
  useGetCurrentInventoryQuery,
  useRevertPurchaseMutation,
  useGetPurchasesQuery,
  useRemoveColorOfferMutation,
  type InventoryRow,
  type Purchase,
} from "~/state/api/inventory-api";
import { formatCordobas, formatNicaraguaDateTime, formatUsd, splitProductName } from "~/lib/formatters";
import { CodeCell, MoneyCell } from "~/components/ui/cells";
import { Spinner } from "~/components/ui/spinner";
import { useCategoryLabel } from "~/hooks/use-category-label";

export function CurrentInventoryTable({
  period = "all",
  mode = "all",
  search,
  readOnly = false,
}: {
  period?: string;
  mode?: "inStock" | "outOfStock" | "all";
  /** Búsqueda controlada desde la barra de la pantalla. Si se pasa, la tabla
   *  no dibuja su propio buscador (habría dos). */
  search?: string;
  readOnly?: boolean;
}) {
  const { data: allRows = [], isLoading } = useGetCurrentInventoryQuery(period);
  const rows = useMemo(() => {
    if (mode === "inStock") return allRows.filter(r => (r.available || 0) > 0);
    if (mode === "outOfStock") {
      // Agotado = el PRODUCTO no tiene stock en ningún lote. Un lote viejo
      // vendido entero de un producto que ya se repuso no es "para reponer".
      const byProduct = stockPerProduct(allRows);
      return allRows.filter(r => (byProduct.get(r.productName) ?? 0) <= 0);
    }
    return allRows;
  }, [allRows, mode]);
  // Las compras se traen sin filtro de periodo: se usan para resolver el lote
  // detrás de una fila al editar, y ese lote puede ser de cualquier mes.
  const { data: purchases = [] } = useGetPurchasesQuery(undefined, { skip: readOnly });
  const categoryLabel = useCategoryLabel();
  const [revert] = useRevertPurchaseMutation();
  const [removeOffer] = useRemoveColorOfferMutation();

  const [revertFor, setRevertFor] = useState<InventoryRow | null>(null);
  const [adjustFor, setAdjustFor] = useState<InventoryRow | null>(null);
  const [editFor, setEditFor] = useState<Purchase | null>(null);
  const [offerFor, setOfferFor] = useState<InventoryRow | null>(null);
  const [removeOfferFor, setRemoveOfferFor] = useState<InventoryRow | null>(null);
  const [reverting, setReverting] = useState(false);

  async function handleRemoveOffer(row: InventoryRow) {
    if (!row.offer) return;
    try {
      await removeOffer(row.offer.id).unwrap();
      toast.success("Oferta quitada", { description: `${row.offerTarget?.label ?? row.productName} vuelve a su precio normal.` });
    } catch (err) {
      toast.error(serverErrorMessage(err, "No se pudo quitar la oferta."));
    }
  }

  async function handleRevert() {
    if (!revertFor) return;
    setReverting(true);
    try {
      await revert(revertFor.id).unwrap();
      toast.success(`Se descartó la llegada del lote ${revertFor.lot}. El producto volvió a "En tránsito".`);
      setRevertFor(null);
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo descartar la llegada.");
    } finally {
      setReverting(false);
    }
  }

  const allColumns = useMemo<ColumnDef<InventoryRow, any>[]>(
    () => [
      { accessorKey: "code", header: "Código", sortingFn: "alphanumeric", cell: (c) => <CodeCell value={c.getValue() as string} /> },
      {
        accessorKey: "productName",
        header: "Producto",
        cell: (c) => {
          const { model, variant } = splitProductName(c.getValue() as string);
          return (
            // Ancho mínimo: con 12 columnas el nombre se partía palabra por palabra.
            <div className="flex min-w-36 flex-col">
              <span className="font-semibold text-foreground">{model}</span>
              {variant && <span className="text-sm text-muted-foreground">{variant}</span>}
            </div>
          );
        },
      },
      {
        id: "catalogMatch",
        header: "Tienda",
        cell: ({ row }) =>
          // Vinculado por columna (al registrar o editar la compra) o, en lotes viejos, a mano en el antiguo Catálogo.
          row.original.catalogItemId || row.original.offerTarget ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
              <HugeIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={2} className="text-foreground" aria-hidden />
              Vinculado
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-warning"
              title="La tienda no ve este lote. Vinculalo a una plantilla con «Editar datos de compra» en Compras."
            >
              <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
              Sin vincular
            </span>
          ),
      },
      {
        id: "media",
        header: "Fotos y videos",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.spoLink ? (
            <a
              href={row.original.spoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl text-xs font-medium text-primary-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeIcon icon={LinkSquare02Icon} size={13} strokeWidth={2} aria-hidden />
              Abrir
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "category",
        header: "Categoría",
        // Mismo `useCategoryLabel` que Compras: muestra el nombre, no el uuid.
        cell: (c) => {
          const val = c.getValue() as string;
          const label = val ? categoryLabel(val).replace(/^KZ\s+/, "") : "";
          if (!label || label === "—") return <span className="text-muted-foreground">—</span>;
          return (
            <span className="whitespace-nowrap rounded-xl border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {label}
            </span>
          );
        },
      },
      { 
        accessorKey: "quantityOriginal", 
        header: "Comprado", 
        meta: { align: "right" }
      },
      {
        accessorKey: "quantitySold",
        header: "Vendido",
        meta: { align: "right" },
        cell: (c) => <span className={(c.getValue() as number) > 0 ? "text-foreground" : "text-muted-foreground"}>{c.getValue() as number}</span>
      },
      {
        // Sin esta columna Comprado − Vendido no daba el Stock cuando había
        // ventas pendientes de aprobar.
        accessorKey: "quantityReserved",
        header: "Reservado",
        meta: { align: "right" },
        cell: (c) => <span className={(c.getValue() as number) > 0 ? "text-foreground" : "text-muted-foreground"}>{(c.getValue() as number) ?? 0}</span>
      },
      {
        accessorKey: "available",
        header: "Stock",
        meta: { align: "right" },
        // Stock en negrita y en color de texto; solo el 0 se marca (ámbar:
        // es "para reponer", no un error).
        cell: (c) => <span className={c.getValue() === 0 ? "font-semibold text-warning" : "font-semibold text-foreground"}>{c.getValue() as number}</span>
      },
      { accessorKey: "priceUnitFinalUsd", header: "Costo USD", meta: { align: "right" }, cell: (c) => <span title={formatUsd(c.getValue(), 4)}><MoneyCell currency="usd" value={c.getValue() as number} /></span> },

      {
        accessorKey: "costRealCordobas",
        header: "Costo C$",
        meta: { align: "right" },
        cell: (c) => <MoneyCell value={c.getValue() as number} />
      },
      {
        // La ganancia se calcula contra el costo final, así que es el que se ve.
        accessorKey: "costeFinalCordobas",
        header: "Costo final",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span
            title={`Costo C$ ${(row.original.costRealCordobas ?? 0).toFixed(2)} + costos fijos C$ ${(row.original.costoFijoCordobas ?? 0).toFixed(2)}`}
          >
            <MoneyCell tone="strong" value={row.original.costeFinalCordobas ?? 0} />
          </span>
        ),
      },
      {
        id: "precioSugerido",
        header: "Precio de venta",
        meta: { align: "right" },
        cell: ({ row }) => {
          const ps = row.original.suggestedPrice;
          const offer = row.original.offer;
          return (
            <div className="flex flex-col items-end">
              {/* Sin precio, la tienda usa el del catálogo hasta que se le ponga uno con «Editar». */}
              {ps ? <MoneyCell tone="strong" value={ps} /> : <span className="text-xs text-warning">Sin precio</span>}
              {offer && (
                <span className="text-xs whitespace-nowrap text-muted-foreground" title={`Oferta del color hasta el ${formatNicaraguaDateTime(offer.endsAt)}`}>
                  Oferta {formatCordobas(offer.price)} · {formatNicaraguaDateTime(offer.endsAt)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "gananciaEsperada",
        header: "Ganancia unit.",
        meta: { align: "right" },
        cell: ({ row }) => {
          const ganancia = row.original.gananciaUnitCordobas;
          if (ganancia == null) return <span className="text-muted-foreground text-xs">—</span>;
          return <MoneyCell tone={ganancia < 0 ? "neg" : "pos"} value={ganancia} />;
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { className: "w-[1%]" },
        cell: ({ row }) => {
          const rowData = row.original;
          const p = purchases.find((x) => x.id === rowData.id);
          return (
            <div className="flex justify-end">
              <RowActionsMenu
                actions={[
                  ...(p ? [{ label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) }] : []),
                  ...(rowData.offerTarget
                    ? [{ label: rowData.offer ? "Cambiar oferta" : "Poner oferta", icon: <HugeIcon icon={DiscountTag01Icon} size={16} strokeWidth={2} />, onClick: () => setOfferFor(rowData) }]
                    : []),
                  ...(rowData.offer
                    ? [{ label: "Quitar oferta", icon: <HugeIcon icon={DiscountTag01Icon} size={16} strokeWidth={2} />, onClick: () => setRemoveOfferFor(rowData) }]
                    : []),
                  { label: "Ajustar stock", icon: <HugeIcon icon={PackageIcon} size={16} strokeWidth={2} />, onClick: () => setAdjustFor(rowData) },
                  { label: "Descartar llegada", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: !!p, onClick: () => setRevertFor(rowData) }
                ]}
              />
            </div>
          );
        },
      },
    ],
    // `categoryLabel` en la lista: sin él la columna se quedaba con el primer
    // valor resuelto y no reaccionaba a un renombrado de categoría.
    [purchases, categoryLabel],
  );

  const columns = useMemo(() => {
    const allowed = readOnly
      ? mode === "outOfStock"
        ? ["code", "productName", "category", "media"]
        : ["code", "productName", "category", "available", "precioSugerido", "media"]
      : mode === "outOfStock"
        ? ["code", "productName", "catalogMatch", "category", "quantitySold", "actions"]
        : null;
    if (!allowed) return allColumns;
    return allColumns.filter((c) => allowed.includes(("accessorKey" in c ? String(c.accessorKey) : c.id) ?? ""));
  }, [allColumns, mode, readOnly]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder={mode === "outOfStock" ? "Buscar en agotados…" : "Buscar en bodega…"}
        hideSearch={search !== undefined}
        globalFilterValue={search}
        emptyText={mode === "outOfStock" ? "No hay productos agotados." : "No hay productos recibidos en bodega todavía."}
        initialSorting={[{ id: "code", desc: false }]}
        // Las columnas secundarias se activan desde «Columnas» para caber en 1280 px.
        tableId={readOnly ? "inventario-stock-vendedor" : "inventario-stock"}
        defaultHiddenColumns={readOnly ? [] : ["category", "quantityOriginal", "quantityReserved", "costRealCordobas", "media"]}
      />

      <Dialog open={!!revertFor} onOpenChange={() => setRevertFor(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Descartar llegada del lote</DialogTitle>
    </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            ¿Querés descartar la llegada de{" "}
            <strong className="text-foreground font-semibold">{revertFor?.productName}</strong> (Lote:{" "}
            <span className="font-spec font-semibold text-foreground">{revertFor?.lot}</span>)?
          </p>
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive leading-normal">
            <strong className="mb-1 block font-semibold text-destructive">Esto cambia el inventario</strong>
            Se restarán <strong className="text-destructive font-bold">{revertFor?.available} unidades</strong> del stock actual en bodega. El lote completo volverá al estado original de <strong className="text-destructive font-semibold">"En tránsito"</strong> en el Registro de Compras.
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="cancel" onClick={() => setRevertFor(null)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleRevert} disabled={reverting}>
            {reverting && <Spinner className="mr-2" />}
            Descartar llegada
          </Button>
        </div>
        </DialogContent>
</Dialog>

      <EditArrivalModal purchase={editFor} onClose={() => setEditFor(null)} />
      <StockAdjustDialog lot={adjustFor} onClose={() => setAdjustFor(null)} />
      <ColorOfferDialog target={offerFor?.offerTarget ?? null} offer={offerFor?.offer ?? null} onClose={() => setOfferFor(null)} />
      <ConfirmDialog
        open={!!removeOfferFor}
        onOpenChange={(open) => !open && setRemoveOfferFor(null)}
        title="¿Quitar la oferta?"
        description={`${removeOfferFor?.offerTarget?.label ?? ""} vuelve a su precio normal en la tienda.`}
        confirmText="Quitar oferta"
        onConfirm={() => removeOfferFor && handleRemoveOffer(removeOfferFor)}
      />
    </>
  );
}

