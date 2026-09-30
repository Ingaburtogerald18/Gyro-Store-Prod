// Tabla de compras (registro China) con badges de estado y acciones según estado:
// En tránsito → Reportar llegada / Eliminar; Pendiente → Aprobar recepción.
import { HugeIcon } from "~/components/ui/icon";
import { Add01Icon, Delete02Icon, Edit02Icon, ShippingTruck01Icon, Store01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { PurchaseCommandPalette } from "./PurchaseCommandPalette";
import { toast } from "sonner";
import { BrandLoader } from "~/components/ui/module-loader";
import { DataTable } from "~/components/ui/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { FilterSelect, type FilterSelectOption } from "~/components/ui/FilterSelect";
import { RowActionsMenu } from "~/components/ui/RowActionsMenu";
import { StatusBadge, type BadgeStatus } from "~/components/ui/StatusBadge";
import { ArrivalModal } from "./ArrivalModal";
import { EditPurchaseModal } from "./EditPurchaseModal";
import {
  useGetPurchasesQuery,
  useDeletePurchaseMutation,
  type Purchase,
} from "~/store/api/inventoryV1Api";
import { formatUsd } from "~/lib/formatters";
import { cn } from "~/lib/utils";
import { CodeCell, MoneyCell } from "~/components/ui/cells";
import { Spinner } from "~/components/ui/spinner";
import { useCategoryLabel } from "~/hooks/useCategoryLabel";
import {
  formatShortDate,
  getTransitInfo,
  TRANSIT_BANDS,
  type TransitBand,
} from "~/lib/transit";

// Tono del StatusBadge canónico por estado de la compra.
const STATUS_META: Record<Purchase["status"], { label: string; status: BadgeStatus }> = {
  china: { label: "En tránsito", status: "info" },
  received: { label: "Recibido", status: "whatsapp" },
};

const ALL_OPT: FilterSelectOption = { value: "all", label: "Todos" };

const STATUS_OPTIONS: FilterSelectOption[] = [
  ALL_OPT,
  { value: "china", label: "En tránsito" },
  { value: "received", label: "Recibido" },
];

// Sin emojis (DESIGN.md §8): no siguen el tema, se ven distinto en cada sistema
// operativo y un lector de pantalla los lee como "círculo verde grande".
// El rango en la etiqueta ya dice cuál es cuál sin necesidad de color.
const TRANSIT_OPTIONS: FilterSelectOption[] = [
  ALL_OPT,
  { value: "good", label: `Bueno · menos de ${TRANSIT_BANDS.good} días` },
  { value: "regular", label: `Regular · ${TRANSIT_BANDS.good}–${TRANSIT_BANDS.regular} días` },
  { value: "bad", label: `Atrasado · más de ${TRANSIT_BANDS.regular} días` },
  { value: "transit", label: "En tránsito" },
  { value: "arrived", label: "Ya llegaron" },
  { value: "waiting", label: "Sin zarpar" },
];

const BAND_STYLES: Record<TransitBand, string> = {
  good: "bg-success/10 text-success border-success/30",
  regular: "bg-warning/10 text-warning border-warning/30",
  bad: "bg-destructive/10 text-destructive border-destructive/30",
};

/**
 * Días de tránsito con su banda de color.
 *
 * Tres lecturas distintas según el momento de la compra: sin zarpar no hay
 * contador (mostrar "0 días" durante dos semanas parecería un reloj roto), en
 * tránsito el número corre contra hoy, y ya recibida el número es final.
 *
 * El `title` lleva la cadena completa del cálculo. Sin eso, nadie puede
 * verificar de dónde salió el 62 y la columna deja de ser confiable a la
 * primera duda.
 */
function TransitCell({ purchase }: { purchase: Purchase }) {
  const info = getTransitInfo(purchase);

  if (info.state === "unknown") return <span className="text-muted-foreground">—</span>;

  const salida = info.departure ? formatShortDate(info.departure) : "?";
  const compra = purchase.purchaseDate?.slice(0, 10) ?? "?";

  if (info.state === "waiting") {
    return (
      <span
        className="whitespace-nowrap text-xs text-muted-foreground"
        title={`Compra ${compra} → zarpa el ${salida}. El contador arranca ese día.`}
      >
        Zarpa {salida}
        {info.daysToDeparture !== null && ` · en ${info.daysToDeparture}d`}
      </span>
    );
  }

  if (info.days === null || !info.band) {
    return (
      <span className="text-muted-foreground" title="Recibida sin fecha de llegada cargada.">
        —
      </span>
    );
  }

  const llegada = info.state === "arrived" ? "Tardó" : "Lleva";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-baseline gap-1 whitespace-nowrap rounded-full border px-2 py-0.5",
        BAND_STYLES[info.band],
        // En tránsito el número todavía se mueve: el borde punteado lo dice sin
        // gastar una palabra.
        info.state === "transit" && "border-dashed",
      )}
      title={`Compra ${compra} → zarpó el ${salida} → ${llegada.toLowerCase()} ${info.days} días.`}
    >
      <span className="nums text-xs font-semibold">{info.days}d</span>
      <span className="text-2xs opacity-70">{llegada}</span>
    </span>
  );
}

export function PurchasesTable({ period = "all", onOpenForm }: { period?: string; onOpenForm?: () => void }) {
  const { data: purchases = [], isLoading } = useGetPurchasesQuery(period);
  const [del, { isLoading: deleting }] = useDeletePurchaseMutation();
  const [globalFilter, setGlobalFilter] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [filterDate, setFilterDate] = useState("all");
  const [filterLot, setFilterLot] = useState("all");
  const [filterCode, setFilterCode] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTransit, setFilterTransit] = useState("all");


  const [arrivalFor, setArrivalFor] = useState<Purchase | null>(null);
  const [editFor, setEditFor] = useState<Purchase | null>(null);
  const [deleteFor, setDeleteFor] = useState<Purchase | null>(null);

  const dateOptions = useMemo<FilterSelectOption[]>(() => {
    const vals = Array.from(new Set(purchases.map((p) => p.purchaseDate).filter(Boolean))).sort().reverse();
    return [ALL_OPT, ...vals.map((v) => ({ value: v, label: v }))];
  }, [purchases]);

  const lotOptions = useMemo<FilterSelectOption[]>(() => {
    const vals = Array.from(new Set(purchases.map((p) => p.lot).filter(Boolean))).sort();
    return [ALL_OPT, ...vals.map((v) => ({ value: v, label: v }))];
  }, [purchases]);

  const codeOptions = useMemo<FilterSelectOption[]>(() => {
    const vals = Array.from(new Set(purchases.map((p) => p.code).filter(Boolean))).sort();
    return [ALL_OPT, ...vals.map((v) => ({ value: v, label: v }))];
  }, [purchases]);

  const productOptions = useMemo<FilterSelectOption[]>(() => {
    const vals = Array.from(new Set(purchases.map((p) => p.productName).filter(Boolean))).sort();
    return [ALL_OPT, ...vals.map((v) => ({ value: v, label: v }))];
  }, [purchases]);

  // Compartido con CurrentInventoryTable: las dos tablas muestran el mismo
  // campo y tienen que resolverlo igual.
  const categoryLabel = useCategoryLabel();

  const categoryOptions = useMemo<FilterSelectOption[]>(() => {
    const vals = Array.from(new Set(purchases.map((p) => p.category).filter(Boolean)));
    return [ALL_OPT, ...vals.map((v) => ({ value: v as string, label: categoryLabel(v as string) }))];
  }, [purchases, categoryLabel]);

  const filteredPurchases = useMemo(() => {
    let r = purchases;
    if (filterDate !== "all") r = r.filter((p) => p.purchaseDate === filterDate);
    if (filterLot !== "all") r = r.filter((p) => p.lot === filterLot);
    if (filterCode !== "all") r = r.filter((p) => p.code === filterCode);
    if (filterProduct !== "all") r = r.filter((p) => p.productName === filterProduct);
    if (filterCategory !== "all") r = r.filter((p) => p.category === filterCategory);
    if (filterStatus !== "all") r = r.filter((p) => p.status === filterStatus);
    // El filtro de tránsito acepta tanto una banda (verde/naranja/rojo) como un
    // estado (en tránsito / recibidas): son las dos preguntas que se hacen acá
    // — "¿qué se está atrasando?" y "¿cuánto tardó lo que ya llegó?".
    if (filterTransit !== "all") {
      r = r.filter((p) => {
        const info = getTransitInfo(p);
        return filterTransit === "transit" || filterTransit === "arrived" || filterTransit === "waiting"
          ? info.state === filterTransit
          : info.band === filterTransit;
      });
    }
    // La búsqueda por texto NO se hace acá: la resuelve el filtro global de la
    // tabla (mismo mecanismo que en Inventario), así que este bloque solo aplica
    // los filtros de los encabezados. Antes había un filtro manual acá que
    // además era inalcanzable: la caja de búsqueda venía con `hideSearch` y
    // `setGlobalFilter` no se llamaba desde ningún lado.
    return [...r].sort((a, b) =>
      String(a.code || "").localeCompare(String(b.code || ""), undefined, { numeric: true })
    );
  }, [purchases, filterDate, filterLot, filterCode, filterProduct, filterCategory, filterStatus, filterTransit]);

  async function handleDelete() {
    if (!deleteFor) return;
    try {
      await del(deleteFor.id).unwrap();
      toast.success("Compra eliminada.");
      setDeleteFor(null);
    } catch (err: any) {
      toast.error(err?.data?.error || "No se pudo eliminar.");
    }
  }

  const columns = useMemo<ColumnDef<Purchase, any>[]>(
    () => [
      {
        accessorKey: "purchaseDate",
        enableSorting: false,
        header: () => (
          <FilterSelect variant="ghost" value={filterDate} onChange={setFilterDate} options={dateOptions} placeholder="Fecha" />
        ),
      },
      {
        accessorKey: "lot",
        enableSorting: false,
        header: () => (
          <FilterSelect variant="ghost" value={filterLot} onChange={setFilterLot} options={lotOptions} placeholder="Lote" />
        ),
      },
      {
        accessorKey: "code",
        enableSorting: false,
        header: () => (
          <FilterSelect variant="ghost" value={filterCode} onChange={setFilterCode} options={codeOptions} placeholder="Código" />
        ),
        cell: (c) => <CodeCell value={c.getValue() as string} />,
      },
      {
        accessorKey: "productName",
        enableSorting: false,
        header: () => (
          <FilterSelect variant="ghost" value={filterProduct} onChange={setFilterProduct} options={productOptions} placeholder="Producto" />
        ),
      },
      {
        id: "category",
        enableSorting: false,
        // `accessorFn` con el NOMBRE resuelto y no `accessorKey: "category"`.
        // El buscador de la tabla filtra sobre el VALOR de la celda, no sobre
        // lo que se dibuja: con el accessorKey buscaba contra el uuid guardado,
        // así que tipear "Audífonos" no encontraba nada aunque la columna
        // mostrara "Audífonos".
        accessorFn: (row) => categoryLabel(row.category ?? ""),
        header: () => (
          <FilterSelect variant="ghost" value={filterCategory} onChange={setFilterCategory} options={categoryOptions} placeholder="Categoría" />
        ),
        cell: (c) => {
          const label = c.getValue() as string;
          if (!label || label === "—") return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap bg-muted px-2 py-0.5 rounded-full w-fit">
              <span className="text-xs font-medium text-foreground">{label}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        enableSorting: false,
        header: () => (
          <FilterSelect variant="ghost" value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} placeholder="Estado" />
        ),
        cell: (c) => {
          const m = STATUS_META[c.getValue() as Purchase["status"]];
          return <StatusBadge status={m.status} label={m.label} />;
        },
      },
      {
        id: "transit",
        header: () => (
          <FilterSelect variant="ghost" value={filterTransit} onChange={setFilterTransit} options={TRANSIT_OPTIONS} placeholder="Tránsito" />
        ),
        // Ordena por DÍAS, no por texto: es lo que sirve para poner las peores
        // arriba. Las que aún no zarparon van al fondo con -1, porque un 0 las
        // mezclaría con las que acaban de salir.
        accessorFn: (row) => getTransitInfo(row).days ?? -1,
        sortingFn: "basic",
        cell: ({ row }) => <TransitCell purchase={row.original} />,
      },
      { 
        accessorKey: "quantity", 
        header: "Cant.", 
        meta: { align: "right" }
      },
      // USD a 2 decimales visibles; precisión completa en el tooltip.
      { accessorKey: "costUnit", header: "P. Base", meta: { align: "right" }, cell: (c) => <span title={formatUsd(c.getValue(), 4)}><MoneyCell currency="usd" value={c.getValue() as number} /></span> },
      { accessorKey: "taxUnit", header: "Imp. Unit.", meta: { align: "right" }, cell: (c) => <span title={formatUsd(c.getValue(), 4)}><MoneyCell currency="usd" value={c.getValue() as number} /></span> },
      { accessorKey: "priceUnit", header: "P. Unit.", meta: { align: "right" }, cell: (c) => <span title={formatUsd(c.getValue(), 4)}><MoneyCell currency="usd" value={c.getValue() as number} /></span> },
      { 
        accessorKey: "total", 
        header: "Total", 
        meta: { align: "right" }, 
        cell: (c) => <MoneyCell currency="usd" tone="strong" value={c.getValue() as number} />
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { className: "w-[1%]" },
        cell: ({ row }) => {
          const p = row.original;
          if (p.status === "china") {
            return (
              <div className="flex justify-end">
                <RowActionsMenu
                  actions={[
                    { group: "Movimiento", label: "Reportar ingreso", icon: <HugeIcon icon={ShippingTruck01Icon} size={16} strokeWidth={2} />, onClick: () => setArrivalFor(p) },
                    { group: "Gestión", label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) },
                    { label: "Eliminar", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: () => setDeleteFor(p) },
                  ]}
                />
              </div>
            );
          }
          if (p.status === "received") {
            return (
              <div className="flex items-center justify-end gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-semibold text-primary-2">
                  <HugeIcon icon={Store01Icon} size={14} strokeWidth={2} />
                  Bodega
                </span>
                <RowActionsMenu
                  actions={[
                    { label: "Editar", icon: <HugeIcon icon={Edit02Icon} size={16} strokeWidth={2} />, onClick: () => setEditFor(p) },
                    { label: "Eliminar", icon: <HugeIcon icon={Delete02Icon} size={16} strokeWidth={2} />, danger: true, separatorBefore: true, onClick: () => setDeleteFor(p) },
                  ]}
                />
              </div>
            );
          }
          return <span className="text-xs text-muted-foreground">—</span>;
        },
      },
    ],
    // `categoryLabel` en vez de `config`: la celda ya no mira la config directo,
    // y sin esta dependencia la columna se quedaba con los uuids crudos hasta el
    // siguiente re-render, porque las categorías llegan después del primer paint.
    [filterDate, filterLot, filterCode, filterProduct, filterCategory, filterStatus, dateOptions, lotOptions, codeOptions, productOptions, categoryOptions, categoryLabel],
  );

  if (isLoading) {
    return <BrandLoader text="Cargando compras..." />;
  }

  return (
    <>
      {/* Barra de herramientas sticky */}
      <div className="sticky top-[116px] z-10 -mx-4 bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-3">
            {/* Resumen basado en los filtros activos */}
            <div className="hidden sm:flex items-center divide-x divide-border rounded-xl border bg-card px-1 py-1">
              <SummaryPill label="Ítems" value={filteredPurchases.length.toString()} />
              <SummaryPill label="Cantidades" value={filteredPurchases.reduce((s, p) => s + (p.quantity ?? 0), 0).toString()} />
              <SummaryPill label="Impuestos" value={formatUsd(filteredPurchases.reduce((s, p) => s + (p.taxUnit ?? 0) * (p.quantity ?? 0), 0))} />
              <SummaryPill label="Total" value={formatUsd(filteredPurchases.reduce((s, p) => s + (p.total ?? 0), 0))} accent />
            </div>
            {onOpenForm && (
          <Button onClick={onOpenForm} aria-label="Registrar compra" className="flex items-center gap-1.5 whitespace-nowrap">
                <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} />
                <span className="hidden sm:inline">Registrar compra</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredPurchases}
        searchPlaceholder="Buscar por código, lote, producto…"
        emptyText="Aún no hay compras registradas."
        globalFilterValue={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
      />
      <PurchaseCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        purchases={purchases}
        onSelect={(p) => { setEditFor(p); setPaletteOpen(false); }}
      />
      <ArrivalModal purchase={arrivalFor} onClose={() => setArrivalFor(null)} />
      <EditPurchaseModal purchase={editFor} onClose={() => setEditFor(null)} />
      <Dialog open={!!deleteFor} onOpenChange={() => setDeleteFor(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{"Eliminar compra"}</DialogTitle>
    </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Eliminar la compra <strong className="text-foreground">{deleteFor?.code}</strong>? Esta acción no
          se puede deshacer.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteFor(null)}>
            Cancelar
          </Button>
          <Button onClick={handleDelete} disabled={deleting} className="bg-destructive/90">
        {deleting && <Spinner className="mr-2" />}
        Eliminar
      </Button>
        </div>
        </DialogContent>
</Dialog>
    </>
  );
}

function SummaryPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center px-3 py-0.5 min-w-[72px]">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${accent ? "text-primary-2" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
