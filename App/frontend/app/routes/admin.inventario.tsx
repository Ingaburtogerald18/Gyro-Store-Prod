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
// contenedores (rounded-card) y píldora solo en los estados.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { MetaFunction } from "@remix-run/node";

import { PurchaseMetrics, StockMetrics } from "~/components/admin/inventory/InventoryMetrics";
import { PurchaseForm } from "~/components/admin/inventory/PurchaseForm";
import { PurchasesTable, type PurchaseStatusFilter } from "~/components/admin/inventory/PurchasesTable";
import { CurrentInventoryTable } from "~/components/admin/inventory/CurrentInventoryTable";
import { PurchaseCommandPalette } from "~/components/admin/inventory/PurchaseCommandPalette";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { HugeIcon } from "~/components/ui/icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { pageTitle } from "~/lib/brand";
import { cn } from "~/lib/utils";
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

/** ¿El foco está en un campo de texto? Los atajos de una letra no aplican ahí. */
function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    Boolean(el?.isContentEditable)
  );
}

const CONTROL = "h-9 rounded-md border border-border bg-card text-sm";

export default function AdminInventario() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);
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

  // Atajos: "/" enfoca la búsqueda, "N" abre Registrar compra, Esc limpia la
  // búsqueda. Nunca mientras se escribe ni con un diálogo abierto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
        return;
      }
      if (isTyping() || purchaseFormOpen || document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setPurchaseFormOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [purchaseFormOpen]);

  return (
    <div className="space-y-5">
      {/* ── Encabezado en una fila ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Operación / Inventario</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Inventario</h1>
        </div>
        <Button onClick={() => setPurchaseFormOpen(true)} className="h-9 gap-2 rounded-md">
          <HugeIcon icon={Add01Icon} size={16} strokeWidth={2} aria-hidden />
          Registrar compra
          <kbd className="rounded border border-current/40 px-1 font-spec text-2xs opacity-80">N</kbd>
        </Button>
      </header>

      {/* ── Superficie de trabajo ──
          overflow-clip (no hidden): recorta las esquinas sin crear un contexto
          de scroll, así el encabezado y el pie de la tabla pueden ser sticky. */}
      <section className="overflow-clip rounded-card border border-border bg-card">
        {/* Barra de herramientas: una sola fila. */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-muted/40 px-4 py-3">
          <div role="group" aria-label="Vista" className="inline-flex rounded-md border border-border bg-card p-0.5">
            {(
              [
                { value: "purchases", label: "Compras" },
                { value: "inventory", label: "Stock actual" },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={view === t.value}
                onClick={() => goToView(t.value)}
                className={cn(
                  "rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === t.value
                    ? "bg-primary/10 text-primary-2"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label
            className={cn(
              CONTROL,
              "flex min-w-[220px] flex-1 items-center gap-2 px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
            )}
          >
            <HugeIcon icon={Search01Icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar</span>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto, código o lote"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-border px-1.5 font-spec text-2xs text-muted-foreground">/</kbd>
          </label>

          {view === "purchases" && (
            <Select value={period} onValueChange={(p) => updateParams({ period: p === "all" ? null : p })}>
              <SelectTrigger aria-label="Período" className={cn(CONTROL, "w-auto gap-2 px-3")}>
                <span className="text-muted-foreground">Período</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-sm">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {view === "purchases" ? (
            <Select value={purchaseStatus} onValueChange={(v) => setPurchaseStatus(v as PurchaseStatusFilter)}>
              <SelectTrigger aria-label="Estado" className={cn(CONTROL, "w-auto gap-2 px-3")}>
                <span className="text-muted-foreground">Estado</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                {PURCHASE_STATUS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-sm">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={stockFilter} onValueChange={(v) => updateParams({ type: v })}>
              <SelectTrigger aria-label="Estado del stock" className={cn(CONTROL, "w-auto gap-2 px-3")}>
                <span className="text-muted-foreground">Estado</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                {STOCK_STATUS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-sm">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="p-4">
            <CurrentInventoryTable
              period={effectivePeriod}
              mode={stockFilter === "outOfStock" ? "outOfStock" : "inStock"}
              search={search}
            />
          </div>
        )}
      </section>

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
        onSelect={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}

// Error dentro de la sección: se muestra en el área de contenido y la barra lateral sigue viva.
export { AdminRouteError as ErrorBoundary } from "~/components/layout/route-error";
