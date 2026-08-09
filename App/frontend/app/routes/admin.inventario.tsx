import { useMemo, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { motion, useReducedMotion } from "framer-motion";
import { HugeIcon } from "~/components/ui/icon";
import { PackageIcon, Calendar02Icon, File01Icon, PackageRemoveIcon } from "@hugeicons/core-free-icons";
import type { MetaFunction } from "@remix-run/node";
import { pageTitle } from '~/lib/brand';

import { InventoryKpis } from "~/components/admin/inventory/InventoryKpis";
import { PurchaseForm } from "~/components/admin/inventory/PurchaseForm";
import { PurchasesTable } from "~/components/admin/inventory/PurchasesTable";
import { CurrentInventoryTable } from "~/components/admin/inventory/CurrentInventoryTable";
import { PurchaseCommandPalette } from "~/components/admin/inventory/PurchaseCommandPalette";

import { PageHeader } from "~/components/layout/PageHeader";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { FilterSelect, type FilterSelectOption } from "~/components/ui/FilterSelect";
import { useGetPurchasesQuery } from "~/store/api/inventoryV1Api";

export const meta: MetaFunction = () => {
  return [{ title: pageTitle('Inventario', { admin: true }) }];
};

type MainTab = "purchases" | "inventory";
type InvType = "current" | "outOfStock";

const MAIN_TABS = [
  { value: "purchases", label: "Registro de compras", icon: File01Icon },
  { value: "inventory", label: "Inventario", icon: PackageIcon },
];

const INV_TYPES = [
  { value: "current", label: "Inventario", icon: PackageIcon },
  { value: "outOfStock", label: "Inventario agotado", icon: PackageRemoveIcon },
];

function buildMonthOptions(): FilterSelectOption[] {
  const opts: FilterSelectOption[] = [{ value: "all", label: "Historial Completo" }];
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
  const monthOptions = useMemo(buildMonthOptions, []);
  const reduceMotion = useReducedMotion();

  // Purchases para el command palette
  const { data: purchases = [] } = useGetPurchasesQuery();

  const tab: MainTab = searchParams.get("tab") === "inventory" ? "inventory" : "purchases";
  const typeParam = searchParams.get("type");
  // `?type=migrated` en un enlace viejo cae a "current" en vez de dejar la
  // pantalla en blanco: el módulo de inventario migrado ya no existe.
  const type: InvType = typeParam === "outOfStock" ? "outOfStock" : "current";
  const period = searchParams.get("period") || "all";

  // El periodo solo tiene sentido en Registro de compras: ahí se mira "qué
  // compré en marzo". El inventario es una FOTO del stock de hoy — filtrarlo
  // por mes de compra escondería lotes que siguen en bodega.
  //
  // Se pasa "all" en vez de solo ocultar el control: si el usuario dejó marzo
  // seleccionado y cambia de pestaña, el filtro seguiría aplicándose sin nada
  // en pantalla que lo explique ni forma de quitarlo.
  const showPeriod = tab === "purchases";
  const effectivePeriod = showPeriod ? period : "all";

  const effectiveView = tab === "purchases" ? "purchases" : type;

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Control de Inventario"
        description="Registro de compras en China y stock recibido en bodega."
        // El periodo baja al slot de filtros: en su propia fila, sin competir
        // con el título. Solo aplica a Registro de compras.
        filters={
          showPeriod ? (
            <div className="w-full sm:w-64">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Periodo
              </label>
              <FilterSelect
                value={period}
                onChange={(p) => updateParams({ period: p })}
                options={monthOptions}
                icon={<HugeIcon icon={Calendar02Icon} size={14} />}
              />
            </div>
          ) : undefined
        }
      />

      <Tabs 
        value={tab} 
        onValueChange={(v) => v === "inventory" ? updateParams({ tab: "inventory", type }) : updateParams({ tab: "purchases" })}
        className="space-y-6"
      >
        <div className="inline-flex w-fit rounded-lg bg-muted/50 border border-border/50 p-1 gap-1">
          {MAIN_TABS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => t.value === "inventory" ? updateParams({ tab: "inventory", type }) : updateParams({ tab: "purchases" })}
              className={`relative flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === t.value && (
                <motion.div
                  layoutId="inventory-tab-pill"
                  className="absolute inset-0 rounded-md bg-primary shadow-sm"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <HugeIcon icon={t.icon} size={16} strokeWidth={2} />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        <InventoryKpis tab={effectiveView} period={effectivePeriod} />

        <TabsContent value="purchases" className="space-y-6 outline-none">
          <PurchasesTable period={period} onOpenForm={() => setPurchaseFormOpen(true)} />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6 outline-none">
          <Tabs 
            value={type} 
            onValueChange={(t) => updateParams({ type: t })}
            className="space-y-6 outline-none"
          >
            <div className="inline-flex w-fit rounded-lg bg-muted/50 border border-border/50 p-1 gap-1">
              {INV_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => updateParams({ type: t.value })}
                  className={`relative flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    type === t.value
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === t.value && (
                    <motion.div
                      layoutId="inventory-nested-pill"
                      className="absolute inset-0 rounded-md bg-primary shadow-sm"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <HugeIcon icon={t.icon} size={16} strokeWidth={2} />
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            <TabsContent value="current" className="outline-none m-0">
              <CurrentInventoryTable period={effectivePeriod} mode="inStock" />
            </TabsContent>

            <TabsContent value="outOfStock" className="outline-none m-0">
              <CurrentInventoryTable period={effectivePeriod} mode="outOfStock" />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Forms Modals */}
      <Dialog open={purchaseFormOpen} onOpenChange={setPurchaseFormOpen}>
        <DialogContent className="w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar compra en China</DialogTitle>
          </DialogHeader>
          <PurchaseForm onDone={() => setPurchaseFormOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <PurchaseCommandPalette 
        open={commandPaletteOpen} 
        onOpenChange={setCommandPaletteOpen} 
        purchases={purchases} 
        onSelect={(p) => {
          setCommandPaletteOpen(false);
        }}
      />
    </div>
  );
}
