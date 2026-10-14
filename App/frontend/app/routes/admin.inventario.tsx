// Inventario: barra de herramientas, métricas y la lista (órdenes de compra,
// stock, plantillas o combos). El vendedor ve solo Stock actual, sin costos.
import { useMemo, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { Add01Icon, DashboardSquare01Icon, GiftIcon, ShoppingBag01Icon, Tag01Icon, WarehouseIcon } from "@hugeicons/core-free-icons";
import type { MetaFunction } from "@remix-run/node";

import { PurchaseMetrics, StockMetrics } from "~/components/admin/inventory/inventory-metrics";
import { PurchaseOrderForm } from "~/components/admin/inventory/purchase-order-form";
import { PurchasesTable, type PurchaseStatusFilter } from "~/components/admin/inventory/purchases-table";
import { CurrentInventoryTable } from "~/components/admin/inventory/current-inventory-table";
import { PurchaseCommandPalette } from "~/components/admin/inventory/purchase-command-palette";
import { TemplatesView } from "~/components/admin/inventory/templates-view";
import { CombosView } from "~/components/admin/inventory/combos-view";
import { CategoriesDialog } from "~/components/admin/inventory/categories-dialog";
import { Kbd, ToolbarSearch, ToolbarSelect, useShortcut } from "~/components/admin/workspace";
import { PageHeader } from "~/components/admin/page-header";
import { Button } from "~/components/ui/button";
import { Toolbar } from "~/components/ui/toolbar";
import { HugeIcon } from "~/components/ui/icon";
import { pageTitle } from "~/lib/brand";
import { useGetPurchasesQuery } from "~/state/api/inventory-api";
import { useAppSelector } from "~/state/hooks";
import { selectIsAdmin } from "~/state/slices/auth-slice";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle("Inventario", { admin: true }) }];
};

type View = "purchases" | "inventory" | "templates" | "combos";

const VIEWS: { value: View; label: string; icon: typeof ShoppingBag01Icon; action?: string }[] = [
  { value: "purchases", label: "Compras", icon: ShoppingBag01Icon },
  { value: "inventory", label: "Stock actual", icon: WarehouseIcon },
  { value: "templates", label: "Plantillas", icon: DashboardSquare01Icon, action: "Crear plantilla" },
  { value: "combos", label: "Combos", icon: GiftIcon, action: "Crear combo" },
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
  const [comboFormOpen, setComboFormOpen] = useState(false);
  const isAdmin = useAppSelector(selectIsAdmin);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusFilter>("all");
  const monthOptions = useMemo(buildMonthOptions, []);

  const { data: purchases = [] } = useGetPurchasesQuery(undefined, { skip: !isAdmin });

  const tab = searchParams.get("tab");
  const view: View = !isAdmin ? "inventory" : VIEWS.find((v) => v.value === tab && tab !== "purchases")?.value ?? "purchases";
  // `?type=migrated` de un enlace viejo cae a "current".
  const stockFilter: StockFilter = searchParams.get("type") === "outOfStock" ? "outOfStock" : "current";
  const period = searchParams.get("period") || "all";
  // El periodo solo aplica a Compras: el stock es una foto de hoy. Se pasa "all" para que un mes
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
    else updateParams({ tab: v === "purchases" ? null : v, type: null });
  };

  // "N" abre la acción principal de la vista ("/" y Esc los maneja ToolbarSearch).
  const openPrimary = () =>
    view === "templates" ? setTemplateFormOpen(true) : view === "combos" ? setComboFormOpen(true) : setPurchaseFormOpen(true);
  useShortcut("n", openPrimary, isAdmin);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        className="mb-0"
        actions={
          isAdmin && (
            <Button onClick={openPrimary} className="gap-2">
              <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
              {VIEWS.find((v) => v.value === view)?.action ?? "Registrar compra"}
              <Kbd>N</Kbd>
            </Button>
          )
        }
      />

      <Toolbar className="gap-2 sm:gap-3 sm:px-4">
        {isAdmin && (
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
        )}
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder={
            view === "templates"
              ? "Buscar modelo"
              : view === "combos"
                ? "Buscar combo"
                : isAdmin
                  ? "Buscar producto, código u orden"
                  : "Buscar producto o código"
          }
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
      {view === "inventory" && <StockMetrics showCosts={isAdmin} />}

      {view === "purchases" ? (
        <PurchasesTable
          period={period}
          search={search}
          status={purchaseStatus}
          onViewStock={() => goToView("inventory")}
        />
      ) : view === "templates" ? (
        <TemplatesView search={search} createOpen={templateFormOpen} onCreateOpenChange={setTemplateFormOpen} />
      ) : view === "combos" ? (
        <CombosView search={search} createOpen={comboFormOpen} onCreateOpenChange={setComboFormOpen} />
      ) : (
        <section aria-labelledby="inventory-stock-title" className="space-y-3">
          <h2 id="inventory-stock-title" className="font-heading text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {stockFilter === "outOfStock" ? "Productos agotados" : "Productos en bodega"}
          </h2>
          <CurrentInventoryTable
            period={effectivePeriod}
            mode={stockFilter === "outOfStock" ? "outOfStock" : "inStock"}
            search={search}
            readOnly={!isAdmin}
          />
        </section>
      )}

      {isAdmin && (
        <>
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
        </>
      )}
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from "~/components/route-error";
