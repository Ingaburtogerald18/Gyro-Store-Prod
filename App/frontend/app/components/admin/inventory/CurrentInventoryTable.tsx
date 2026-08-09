// Inventario Actual: productos recibidos en bodega con todas las columnas
// calculadas (cantidad = original − vendidos, precios USD y costo real en C$).
import { HugeIcon } from "~/components/ui/icon";
import { Alert02Icon, CheckmarkCircle01Icon, Edit02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { DataTable } from "~/components/ui/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { EditArrivalModal } from "./EditArrivalModal";
import {
  useGetCurrentInventoryQuery,
  useRevertPurchaseMutation,
  useGetPurchasesQuery,
  type InventoryRow,
  type Purchase,
} from "~/store/api/inventoryV1Api";
import { useGetAdminCatalogQuery } from "~/store/api/catalogAdminApi";
import { formatUsd } from "~/lib/formatters";
import { CodeCell, MoneyCell } from "~/components/ui/cells";
import { useNavigate } from "@remix-run/react";
import { Spinner } from "~/components/ui/spinner";
import { useGetConfigQuery } from "~/store/api/sessionApi";
import { useCategoryLabel } from "~/hooks/useCategoryLabel";

export function CurrentInventoryTable({ period = "all", mode = "all" }: { period?: string; mode?: "inStock" | "outOfStock" | "all" }) {
  const navigate = useNavigate();
  const { data: allRows = [], isLoading } = useGetCurrentInventoryQuery(period);
  const rows = useMemo(() => {
    if (mode === "inStock") return allRows.filter(r => (r.available || 0) > 0);
    if (mode === "outOfStock") return allRows.filter(r => (r.available || 0) <= 0);
    return allRows;
  }, [allRows, mode]);
  // Las compras se traen sin filtro de periodo: se usan para resolver el lote
  // detrás de una fila al editar, y ese lote puede ser de cualquier mes.
  const { data: purchases = [] } = useGetPurchasesQuery();
  const { data: catalog = [] } = useGetAdminCatalogQuery();
  const { data: config } = useGetConfigQuery();
  const categoryLabel = useCategoryLabel();
  const [revert] = useRevertPurchaseMutation();

  const skuToCatalogMap = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((c: any) => {
      if (c.variantMappings) {
        Object.values(c.variantMappings).forEach((m: any) => {
          if (m.sku) map.set(m.sku, c.id);
          if (m.skus) m.skus.forEach((s: string) => map.set(s, c.id));
        });
      }
    });
    return map;
  }, [catalog]);

  const [revertFor, setRevertFor] = useState<InventoryRow | null>(null);
  const [editFor, setEditFor] = useState<Purchase | null>(null);
  const [reverting, setReverting] = useState(false);

  async function handleRevert() {
    if (!revertFor) return;
    setReverting(true);
    try {
      await revert(revertFor.id).unwrap();
      toast.success(`La llegada del lote "${revertFor.lot}" ha sido descartada. El producto volvió a estar en tránsito.`);
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
        cell: (c) => <span className="font-medium text-foreground">{c.getValue() as string}</span>
      },
      {
        id: "catalogMatch",
        header: "Catálogo",
        cell: ({ row }) => {
          const rowData = row.original;
          const hasMatch = skuToCatalogMap.has(rowData.code);
          return (
            <button
              onClick={() => hasMatch && navigate(`/admin/catalogo?sku=${rowData.code}`)}
              className={`flex items-center gap-1.5 transition-colors ${hasMatch ? "hover:text-primary" : "cursor-default"}`}
            >
              {hasMatch ? (
                <span className="flex items-center gap-1 text-xs font-medium text-primary-2 bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                  <HugeIcon icon={CheckmarkCircle01Icon} size={12} strokeWidth={2} />
                  Enlazado
                </span>
              ) : (
                <span title="Este producto aún no está vinculado al catálogo público" className="flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-md border border-warning/20">
                  <HugeIcon icon={Alert02Icon} size={12} strokeWidth={2} />
                  Sin mapear
                </span>
              )}
            </button>
          );
        }
      },
      {
        accessorKey: "category",
        header: "Categoría",
        // Mismo `useCategoryLabel` que la tabla de Compras. Antes cada una
        // resolvía por su cuenta contra `config`, así que acá seguían saliendo
        // los uuids crudos de las categorías de Catálogo.
        cell: (c) => {
          const val = c.getValue() as string;
          if (!val) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap bg-muted px-2 py-0.5 rounded-full w-fit">
              <span className="text-xs font-medium text-foreground">{categoryLabel(val)}</span>
            </div>
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
        cell: (c) => <span className={(c.getValue() as number) > 0 ? "text-warning font-medium" : "text-muted-foreground"}>{c.getValue() as number}</span>
      },
      {
        accessorKey: "available",
        header: "Stock",
        meta: { align: "right" },
        cell: (c) => <span className={c.getValue() === 0 ? "text-destructive font-bold" : "text-primary-2 font-bold"}>{c.getValue() as number}</span>
      },
      { accessorKey: "priceUnitFinalUsd", header: "Coste ($USD)", meta: { align: "right" }, cell: (c) => <span title={formatUsd(c.getValue(), 4)}><MoneyCell currency="usd" value={c.getValue() as number} /></span> },

      {
        accessorKey: "costRealCordobas",
        header: "Coste (C$)",
        meta: { align: "right" },
        cell: (c) => <MoneyCell tone="pos" value={c.getValue() as number} />
      },
      {
        accessorKey: "costoFijoCordobas",
        header: "Coste c/ Fijos",
        meta: { align: "right" },
        cell: (c) => <MoneyCell tone="strong" value={c.getValue() as number} />,
      },
      {
        id: "precioSugerido",
        header: "Precio de venta",
        meta: { align: "right" },
        cell: ({ row }) => {
          const ps = row.original.suggestedPrice;
          if (!ps) return <span className="text-muted-foreground text-xs">—</span>;
          return <MoneyCell tone="pos" value={ps} />;
        },
      },
      {
        id: "gananciaEsperada",
        header: "Ganancia unit.",
        meta: { align: "right" },
        cell: ({ row }) => {
          const ganancia = row.original.gananciaUnitCordobas;
          if (ganancia == null) return <span className="text-muted-foreground text-xs">—</span>;
          return <MoneyCell tone="strong" value={ganancia} />;
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
    [purchases, skuToCatalogMap, navigate, config, categoryLabel],
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
    return <div className="h-64 animate-pulse rounded-card border bg-card shadow-lg" />;
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder={mode === "outOfStock" ? "Buscar en agotados…" : "Buscar en bodega…"}
        emptyText={mode === "outOfStock" ? "No hay productos agotados." : "No hay productos recibidos en bodega todavía."}
        initialSorting={[{ id: "code", desc: false }]}
      />

      <Dialog open={!!revertFor} onOpenChange={() => setRevertFor(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{"Descartar Llegada de Lote"}</DialogTitle>
    </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            ¿Estás seguro de que deseas descartar la llegada del producto{" "}
            <strong className="text-foreground font-semibold">{revertFor?.productName}</strong> (Lote:{" "}
            <span className="text-primary-2 font-mono font-bold">{revertFor?.lot}</span>)?
          </p>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive leading-normal">
            <strong className="block mb-1 text-destructive font-semibold">⚠️ Advertencia de Inventario:</strong>
            Se restarán <strong className="text-destructive font-bold">{revertFor?.available} unidades</strong> del stock actual en bodega. El lote completo volverá al estado original de <strong className="text-destructive font-semibold">"En tránsito"</strong> en el Registro de Compras.
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRevertFor(null)}>
            Cancelar
          </Button>
          <Button onClick={handleRevert} disabled={reverting} className="bg-destructive/90 text-destructive-foreground hover:bg-destructive">
        {reverting && <Spinner className="mr-2" />}
        Confirmar y Descartar
      </Button>
        </div>
        </DialogContent>
</Dialog>

      <EditArrivalModal purchase={editFor} onClose={() => setEditFor(null)} />
    </>
  );
}

