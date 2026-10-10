// Inventario: barra de herramientas, métricas y la lista (órdenes de compra,
// productos en bodega o plantillas), en bloques sueltos sobre el crema.
import { useMemo, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { Add01Icon, DashboardSquare01Icon, ShoppingBag01Icon, Tag01Icon, WarehouseIcon } from "@hugeicons/core-free-icons";
import type { MetaFunction } from "@remix-run/node";

import { PurchaseMetrics, StockMetrics } from "~/components/admin/inventory/InventoryMetrics";
import { PurchaseOrderForm } from "~/components/admin/inventory/PurchaseOrderForm";
import { PurchasesTable, type PurchaseStatusFilter } from "~/components/admin/inventory/PurchasesTable";
import { CurrentInventoryTable } from "~/components/admin/inventory/CurrentInventoryTable";
import { PurchaseCommandPalette } from "~/components/admin/inventory/PurchaseCommandPalette";
import { TemplatesView } from "~/components/admin/inventory/TemplatesView";
import { CategoriesDialog } from "~/components/admin/inventory/CategoriesDialog";
import { Kbd, ToolbarSearch, ToolbarSelect, useShortcut } from "~/components/admin/workspace";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/button";
import { Toolbar } from "~/components/ui/toolbar";
import { HugeIcon } from "~/components/ui/icon";
import { pageTitle } from "~/lib/brand";
import { useGetPurchasesQuery } from "~/store/api/inventoryV1Api";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle("Inventario", { admin: true }) }];
};

type View = "purchases" | "inventory" | "templates";

const VIEWS: { value: View; label: string; icon: typeof ShoppingBag01Icon }[] = [
  { value: "purchases", label: "Compras", icon: ShoppingBag01Icon },
  { value: "inventory", label: "Stock actual", icon: WarehouseIcon },
  { value: "templates", label: "Plantillas", icon: DashboardSquare01Icon },
];
type StockFilter = "current" | "outOfStock";

const PURCHASE_STATUS: { value: PurchaseStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "received", label: "En bodega" },
  { value: "transit", label: "En tránsito" },
  { value: "late", label: "Demorados" },
  { value: "incomplete", label: "Datos por completar" },
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
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusFilter>("all");
  const monthOptions = useMemo(buildMonthOptions, []);

  const { data: purchases = [] } = useGetPurchasesQuery();

  const tab = searchParams.get("tab");
  const view: View = tab === "inventory" || tab === "templates" ? tab : "purchases";
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

  const goToView = (v: View) => {
    if (v === "inventory") updateParams({ tab: "inventory", type: stockFilter });
    else updateParams({ tab: v === "templates" ? "templates" : null, type: null });
  };

  // "N" abre la acción principal de la vista ("/" y Esc los maneja ToolbarSearch).
  const openPrimary = () => (view === "templates" ? setTemplateFormOpen(true) : setPurchaseFormOpen(true));
  useShortcut("n", openPrimary);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        className="mb-0"
        actions={
          <Button onClick={openPrimary} className="gap-2">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
            {view === "templates" ? "Crear plantilla" : "Registrar compra"}
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <Toolbar className="gap-2 sm:gap-3 sm:px-4">
        <div role="group" aria-label="Vista" className="flex shrink-0 gap-2">
          {VIEWS.map((v) => {
            const active = view === v.value;
            return (
              <Button
                key={v.value}
                type="button"
                variant="outline"
                aria-pressed={active}
                onClick={() => {
                  if (v.value !== view) setSearch("");
                  goToView(v.value);
                }}
                className="gap-2 px-3.5"
              >
                <HugeIcon icon={v.icon} size={16} strokeWidth={2} aria-hidden className="text-primary-2" />
                {v.label}
              </Button>
            );
          })}
        </div>
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder={view === "templates" ? "Buscar modelo" : "Buscar producto, código u orden"}
        />
        {view === "purchases" && (
          <ToolbarSelect
            label="Período"
            value={period}
            onChange={(p) => updateParams({ period: p === "all" ? null : p })}
            options={monthOptions}
          />
        )}
        {view === "purchases" && (
          <ToolbarSelect label="Estado" value={purchaseStatus} onChange={setPurchaseStatus} options={PURCHASE_STATUS} />
        )}
        {view === "inventory" && (
          <ToolbarSelect label="Estado" value={stockFilter} onChange={(v) => updateParams({ type: v })} options={STOCK_STATUS} />
        )}
        {view === "templates" && (
          <Button variant="outline" onClick={() => setCategoriesOpen(true)} className="gap-2">
            <HugeIcon icon={Tag01Icon} size={16} strokeWidth={2} aria-hidden className="text-primary-2" />
            Categorías
          </Button>
        )}
      </Toolbar>

      {view === "purchases" && <PurchaseMetrics period={effectivePeriod} />}
      {view === "inventory" && <StockMetrics />}

      {view === "purchases" ? (
        <PurchasesTable
          period={period}
          search={search}
          status={purchaseStatus}
          onViewStock={() => goToView("inventory")}
        />
      ) : view === "templates" ? (
        <TemplatesView search={search} createOpen={templateFormOpen} onCreateOpenChange={setTemplateFormOpen} />
      ) : (
        <section aria-labelledby="inventory-stock-title" className="space-y-3">
          <h2 id="inventory-stock-title" className="font-heading text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {stockFilter === "outOfStock" ? "Productos agotados" : "Productos en bodega"}
          </h2>
          <CurrentInventoryTable
            period={effectivePeriod}
            mode={stockFilter === "outOfStock" ? "outOfStock" : "inStock"}
            search={search}
          />
        </section>
      )}

      <PurchaseOrderForm open={purchaseFormOpen} onOpenChange={setPurchaseFormOpen} />
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />

      {/* Paleta de compras (Ctrl+K). */}
      <PurchaseCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        purchases={purchases}
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
