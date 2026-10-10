// Inventario Actual: productos recibidos en bodega con todas las columnas
// calculadas (cantidad = original − vendidos, precios USD y costo real en C$).
import { HugeIcon } from "~/components/ui/icon";
import { Alert02Icon, CheckmarkCircle01Icon, Edit02Icon, Delete02Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { Skeleton } from "~/components/ui/skeleton";
import { DataTable } from "~/components/ui/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { EditArrivalModal } from "./EditArrivalModal";
import { StockAdjustDialog } from "./StockAdjustDialog";
import { stockPerProduct } from "./InventoryMetrics";
import {
  useGetCurrentInventoryQuery,
  useRevertPurchaseMutation,
  useGetPurchasesQuery,
  type InventoryRow,
  type Purchase,
} from "~/store/api/inventoryV1Api";
import { useGetAdminCatalogQuery } from "~/store/api/catalogAdminApi";
import { formatUsd, splitProductName } from "~/lib/formatters";
import { CodeCell, MoneyCell } from "~/components/ui/cells";
import { useNavigate } from "@remix-run/react";
import { Spinner } from "~/components/ui/spinner";
import { useCategoryLabel } from "~/hooks/useCategoryLabel";

export function CurrentInventoryTable({
  period = "all",
  mode = "all",
  search,
}: {
  period?: string;
  mode?: "inStock" | "outOfStock" | "all";
  /** Búsqueda controlada desde la barra de la pantalla. Si se pasa, la tabla
   *  no dibuja su propio buscador (habría dos). */
  search?: string;
}) {
  const navigate = useNavigate();
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
  const { data: purchases = [] } = useGetPurchasesQuery();
  const { data: catalog = [] } = useGetAdminCatalogQuery();
  const categoryLabel = useCategoryLabel();
  const [revert] = useRevertPurchaseMutation();

  const codeToCatalogMap = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((c: any) => {
      if (c.variantMappings) {
        Object.values(c.variantMappings).forEach((m: any) => {
          if (m.codes) m.codes.forEach((s: string) => map.set(s, c.id));
          if (m.sku) map.set(m.sku, c.id);
          if (m.skus) m.skus.forEach((s: string) => map.set(s, c.id));
        });
      }
    });
    return map;
  }, [catalog]);

  const [revertFor, setRevertFor] = useState<InventoryRow | null>(null);
  const [adjustFor, setAdjustFor] = useState<InventoryRow | null>(null);
  const [editFor, setEditFor] = useState<Purchase | null>(null);
  const [reverting, setReverting] = useState(false);

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
              {variant && <span className="text-xs text-muted-foreground">{variant}</span>}
            </div>
          );
        },
      },
      {
        id: "catalogMatch",
        header: "Catálogo",
        cell: ({ row }) => {
          const rowData = row.original;
          // Vínculo por columna (elegido al registrar la compra) o, si no, el
          // cargado a mano en el editor de Catálogo.
          const catalogId = rowData.catalogItemId ?? codeToCatalogMap.get(rowData.code);
          // Texto con ícono, sin animación: "Sin vincular" parpadeaba en loop
          // en cada fila, y un parpadeo permanente deja de ser una señal.
          return catalogId ? (
            <button
              type="button"
              onClick={() => navigate(`/admin/catalogo?sku=${rowData.code}`)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={2} className="text-foreground" aria-hidden />
              Vinculado
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                navigate('/admin/catalogo');
                toast.info('Desde acá podés vincular artículos del inventario con productos del catálogo público.');
              }}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl text-xs font-medium text-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
              Sin vincular
            </button>
          );
        }
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
          if (!ps) return <span className="text-muted-foreground text-xs">—</span>;
          return <MoneyCell tone="strong" value={ps} />;
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
    // valor resuelto y no reaccionaba a un renombrado en Catálogo.
    [purchases, codeToCatalogMap, navigate, categoryLabel],
  );

  const columns = useMemo(() => {
    if (mode === "outOfStock") {
      const allowed = ["code", "productName", "catalogMatch", "category", "quantitySold", "actions"];
      return allColumns.filter((c: any) => {
        const id = c.accessorKey || c.id;
        return allowed.includes(id);
      });
    }
    return allColumns;
  }, [allColumns, mode]);

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
        tableId="inventario-stock"
        defaultHiddenColumns={["category", "quantityOriginal", "quantityReserved", "costRealCordobas"]}
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
    </>
  );
}

