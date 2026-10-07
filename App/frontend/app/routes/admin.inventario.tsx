// Inventario (panel). Una sola superficie de trabajo: barra de herramientas,
// franja de métricas y tabla, debajo de un encabezado de una fila.
//
// ── Por qué así ──
// Antes, entre el título, el periodo con su propia etiqueta, las pestañas
// píldora, seis tarjetas y una barra de resumen, la tabla empezaba a ~760 px y
// en una laptop no se veía ni una fila. Ahora: el encabezado lleva la acción
// principal (atajo N), una sola fila de filtros, cuatro métricas y la tabla.
//
// Radios de esta pantalla: 8 px en controles (rounded-md), 12 px en
// contenedores (rounded-card) y píldora solo en los estados. Las piezas salen
// de components/admin/workspace.tsx, compartidas con el resto del panel.
import { useMemo, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type { MetaFunction } from "@remix-run/node";

import { PurchaseMetrics, StockMetrics } from "~/components/admin/inventory/InventoryMetrics";
import { PurchaseForm } from "~/components/admin/inventory/PurchaseForm";
import { PurchasesTable, type PurchaseStatusFilter } from "~/components/admin/inventory/PurchasesTable";
import { CurrentInventoryTable } from "~/components/admin/inventory/CurrentInventoryTable";
import { PurchaseCommandPalette } from "~/components/admin/inventory/PurchaseCommandPalette";
import {
  Kbd,
  SegmentedControl,
  ToolbarSearch,
  ToolbarSelect,
  Workspace,
  WorkspaceToolbar,
  useShortcut,
} from "~/components/admin/workspace";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { HugeIcon } from "~/components/ui/icon";
import { pageTitle } from "~/lib/brand";
import { useGetPurchasesQuery } from "~/store/api/inventoryV1Api";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle("Inventario", { admin: true }) }];
};

type View = "purchases" | "inventory";
type StockFilter = "current" | "outOfStock";

const PURCHASE_STATUS: { value: PurchaseStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "received", label: "En bodega" },
  { value: "transit", label: "En tránsito" },
  { value: "late", label: "Demorados" },
];

const STOCK_STATUS: { value: StockFilter; label: string }[] = [
  { value: "current", label: "Con stock" },
  { value: "outOfStock", label: "Agotados" },
];

function buildMonthOptions() {
  const opts = [{ value: "all", label: "Todo el historial" }];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const raw = d.toLocaleDateString("es-NI", { month: "long", year: "numeric" });
    opts.push({ value, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
  }
  return opts;
}

export default function AdminInventario() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusFilter>("all");
  const monthOptions = useMemo(buildMonthOptions, []);

  const { data: purchases = [] } = useGetPurchasesQuery();

  const view: View = searchParams.get("tab") === "inventory" ? "inventory" : "purchases";
  // `?type=migrated` de un enlace viejo cae a "current": ese módulo ya no existe.
  const stockFilter: StockFilter = searchParams.get("type") === "outOfStock" ? "outOfStock" : "current";
  const period = searchParams.get("period") || "all";
  // El periodo solo aplica a Compras ("qué compré en marzo"). El stock es una
  // FOTO de hoy: filtrarlo por mes de compra escondería lotes que siguen en
  // bodega. Se pasa "all" en vez de solo ocultar el control para que un mes
  // elegido en Compras no siga filtrando, invisible, en Stock.
  const effectivePeriod = view === "purchases" ? period : "all";

  function updateParams(updates: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  }

  const goToView = (v: View) =>
    v === "inventory" ? updateParams({ tab: "inventory", type: stockFilter }) : updateParams({ tab: null, type: null });

  // "N" abre Registrar compra ("/" y Esc los maneja ToolbarSearch).
  useShortcut("n", () => setPurchaseFormOpen(true));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        className="mb-0"
        actions={
          <Button onClick={() => setPurchaseFormOpen(true)} className="h-9 gap-2 rounded-md">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
            Registrar compra
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <Workspace>
        <WorkspaceToolbar>
          <SegmentedControl
            label="Vista"
            value={view}
            onChange={goToView}
            options={[
              { value: "purchases", label: "Compras" },
              { value: "inventory", label: "Stock actual" },
            ]}
          />
          <ToolbarSearch value={search} onChange={setSearch} placeholder="Buscar producto, código o lote" />
          {view === "purchases" && (
            <ToolbarSelect
              label="Período"
              value={period}
              onChange={(p) => updateParams({ period: p === "all" ? null : p })}
              options={monthOptions}
            />
          )}
          {view === "purchases" ? (
            <ToolbarSelect label="Estado" value={purchaseStatus} onChange={setPurchaseStatus} options={PURCHASE_STATUS} />
          ) : (
            <ToolbarSelect label="Estado" value={stockFilter} onChange={(v) => updateParams({ type: v })} options={STOCK_STATUS} />
          )}
        </WorkspaceToolbar>

        {view === "purchases" ? <PurchaseMetrics period={effectivePeriod} /> : <StockMetrics />}

        {view === "purchases" ? (
          <PurchasesTable
            period={period}
            search={search}
            status={purchaseStatus}
            onViewStock={() => goToView("inventory")}
          />
        ) : (
          <div className="p-4">
            <CurrentInventoryTable
              period={effectivePeriod}
              mode={stockFilter === "outOfStock" ? "outOfStock" : "inStock"}
              search={search}
            />
          </div>
        )}
      </Workspace>

      <Dialog open={purchaseFormOpen} onOpenChange={setPurchaseFormOpen}>
        <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Registrar compra en China</DialogTitle>
          </DialogHeader>
          <PurchaseForm onDone={() => setPurchaseFormOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Paleta de compras (Ctrl+K). */}
      <PurchaseCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        purchases={purchases}
        // Antes elegir una compra solo cerraba la paleta. Ahora la busca en Compras.
        onSelect={(p) => {
          setSearch(p.code);
          setPurchaseStatus("all");
          goToView("purchases");
          setCommandPaletteOpen(false);
        }}
      />
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from "~/components/layout/route-error";
