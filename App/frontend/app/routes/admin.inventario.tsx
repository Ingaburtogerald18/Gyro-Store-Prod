// Inventario (panel). Sigue el lenguaje del catálogo de la tienda: tarjetas
// blancas sueltas sobre el crema, una barra de filtros con la línea esmeralda
// arriba, controles de 44 px, selección en esmeralda y el amarillo solo para
// acciones (Registrar compra, Recibir).
//
// Orden de la pantalla: encabezado con la acción principal (atajo N), barra de
// filtros, métricas y la lista (órdenes de compra o productos en bodega) con
// su título, como «Resultados» en el catálogo.
//
// Radios: 12 px en controles y 16 px en tarjetas, igual que la tienda. Los
// estilos propios viven en styles/admin.css bajo `.inventory-page`, para no
// tocar el resto del panel.
import { useMemo, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { Add01Icon, ShoppingBag01Icon, WarehouseIcon } from "@hugeicons/core-free-icons";
import type { MetaFunction } from "@remix-run/node";

import { PurchaseMetrics, StockMetrics } from "~/components/admin/inventory/InventoryMetrics";
import { PurchaseForm } from "~/components/admin/inventory/PurchaseForm";
import { PurchaseOrderForm } from "~/components/admin/inventory/PurchaseOrderForm";
import { PurchasesTable, type PurchaseStatusFilter } from "~/components/admin/inventory/PurchasesTable";
import { CurrentInventoryTable } from "~/components/admin/inventory/CurrentInventoryTable";
import { PurchaseCommandPalette } from "~/components/admin/inventory/PurchaseCommandPalette";
import { Kbd, ToolbarSearch, ToolbarSelect, useShortcut } from "~/components/admin/workspace";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { HugeIcon } from "~/components/ui/icon";
import { pageTitle } from "~/lib/brand";
import { cn } from "~/lib/utils";
import { useGetPurchaseOrdersQuery, useGetPurchasesQuery } from "~/store/api/inventoryV1Api";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle("Inventario", { admin: true }) }];
};

type View = "purchases" | "inventory";

const VIEWS: { value: View; label: string; icon: typeof ShoppingBag01Icon }[] = [
  { value: "purchases", label: "Compras", icon: ShoppingBag01Icon },
  { value: "inventory", label: "Stock actual", icon: WarehouseIcon },
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusFilter>("all");
  const monthOptions = useMemo(buildMonthOptions, []);

  const { data: purchases = [] } = useGetPurchasesQuery();
  // Con la migración 0024 se registran órdenes de Alibaba; sin ella, compras
  // sueltas como antes.
  const { data: ordersData } = useGetPurchaseOrdersQuery();
  const ordersEnabled = ordersData?.available === true;

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
    // gap y no space-y: el `mb-0` del encabezado le ganaba al margen de space-y
    // y la barra quedaba pegada al título.
    <div className="inventory-page flex flex-col gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        className="mb-0"
        actions={
          <Button onClick={() => setPurchaseFormOpen(true)} className="h-11 gap-2 px-4">
            <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
            Registrar compra
            <Kbd>N</Kbd>
          </Button>
        }
      />

      {/* Barra de filtros: la misma pieza que la del catálogo de la tienda. */}
      <div className="inventory-toolbar flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 sm:gap-3 sm:px-4">
        <div role="group" aria-label="Vista" className="flex shrink-0 gap-2">
          {VIEWS.map((v) => {
            const active = view === v.value;
            return (
              <Button
                key={v.value}
                type="button"
                variant="outline"
                aria-pressed={active}
                onClick={() => goToView(v.value)}
                className={cn("inventory-control inventory-toggle gap-2 px-3.5", active && "font-semibold")}
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
          placeholder="Buscar producto, código u orden"
          className="inventory-control md:h-11"
        />
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
      </div>

      {view === "purchases" ? <PurchaseMetrics period={effectivePeriod} /> : <StockMetrics />}

      {view === "purchases" ? (
        <PurchasesTable
          period={period}
          search={search}
          status={purchaseStatus}
          onViewStock={() => goToView("inventory")}
        />
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

      <Dialog open={purchaseFormOpen} onOpenChange={setPurchaseFormOpen}>
        <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{ordersEnabled ? "Registrar compra de Alibaba" : "Registrar compra en China"}</DialogTitle>
          </DialogHeader>
          {ordersEnabled ? (
            <PurchaseOrderForm onDone={() => setPurchaseFormOpen(false)} />
          ) : (
            <PurchaseForm onDone={() => setPurchaseFormOpen(false)} />
          )}
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
