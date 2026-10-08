// API del portal de inventario (admin). Invalida las tags Purchase/Product/Catalog
// para refrescar la UI al aprobar recepciones.
import { baseApi } from "./baseApi";

export type PurchaseStatus = "china" | "received";

export interface Purchase {
  id: string;
  lot: string;
  code: string;
  productName: string;
  category: string | null;
  purchaseDate: string;
  arrivalDate: string | null;
  quantity: number;
  costUnit: number;
  taxUnit: number;
  shippingUnit: number;
  priceUnit: number;
  total: number;
  quantitySold: number;
  quantityReserved: number;
  suggestedPrice: number | null;
  status: PurchaseStatus;
  /** Producto del catálogo del lote (null sin vínculo o sin la migración 0022). */
  catalogItemId?: string | null;
  /** Variante ("Negro / Con micrófono"; '' en productos sin variantes). */
  variantKey?: string | null;
}

export interface InventoryRow {
  id: string;
  code: string;
  productName: string;
  category: string | null;
  lot?: string;
  quantityOriginal?: number;
  quantitySold?: number;
  quantityReserved?: number;
  available: number;
  priceUnitUsd?: number;
  shippingUnitUsd?: number;
  priceUnitFinalUsd?: number;
  costRealCordobas?: number;
  costoFijoCordobas?: number;
  costeFinalCordobas?: number;
  preTotalUsd?: number;
  totalFinalUsd?: number;
  suggestedPrice?: number | null;
  gananciaUnitCordobas?: number;
  catalogItemId?: string | null;
  variantKey?: string | null;
}

export interface InventoryKpis {
  totalPurchases: number;
  inTransit: number;
  received: number;
  /** Recibido − vendido − reservado: lo que queda de verdad en bodega. */
  availableUnits: number;
  subtotalInvertidoUsd: number;
  totalImpuestosUsd: number;
  totalInversionConImpuestosUsd: number;
  totalEnviosUsd: number;
}

export interface NewPurchase {
  purchaseDate: string;
  lot: string;
  code?: string;
  productName: string;
  category: string;
  quantity: number;
  costUnit: number;
  taxUnit: number;
  suggestedPrice?: number;
  catalogItemId?: string;
  variantKey?: string;
}

export interface ArrivalPayload {
  arrivalDate: string;
  shippingUnit: number;
  suggestedPrice?: number;
  /** Tasa C$/USD que se congela en el lote. Sin ella, la de Configuración. */
  exchangeRate?: number;
}

// Añade ?period=YYYY-MM al endpoint cuando hay un mes seleccionado.
// "all" o vacío = sin filtro (historial completo). El backend leerá este
// parámetro cuando implementemos el filtrado por fecha en la base de datos.
const withPeriod = (base: string, period?: string) =>
  period && period !== "all" ? `${base}?period=${encodeURIComponent(period)}` : base;

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPurchases: build.query<Purchase[], string | void>({
      query: (period) => withPeriod("/inventory/purchases", period || undefined),
      providesTags: ["Purchase"],
    }),
    getCurrentInventory: build.query<InventoryRow[], string | void>({
      query: (period) => withPeriod("/inventory/current", period || undefined),
      providesTags: ["Product"],
    }),
    getAvailableInventory: build.query<InventoryRow[], void>({
      query: () => "/inventory/available",
      providesTags: ["Product"],
    }),
    getIncomingInventory: build.query<any[], void>({
      query: () => "/inventory/incoming",
      providesTags: ["Purchase"],
    }),
    getInventoryKpis: build.query<InventoryKpis, string | void>({
      query: (period) => withPeriod("/inventory/kpis", period || undefined),
      providesTags: ["Purchase"],
    }),
    createPurchase: build.mutation<Purchase, NewPurchase>({
      query: (body) => ({ url: "/inventory/purchases", method: "POST", body }),
      invalidatesTags: ["Purchase"],
    }),
    reportArrival: build.mutation<{ ok: boolean }, { id: string; body: ArrivalPayload }>({
      query: ({ id, body }) => ({ url: `/inventory/purchases/${id}/arrival`, method: "PATCH", body }),
      invalidatesTags: ["Purchase", "Product", "Catalog"],
    }),
    simulateCost: build.mutation<
      { precioSugerido: number; exchangeRate: number },
      { id: string; shippingUnit: number; exchangeRate?: number }
    >({
      query: ({ id, shippingUnit, exchangeRate }) => ({
        url: `/inventory/purchases/${id}/simulate-cost`,
        method: "POST",
        body: { shippingUnit, exchangeRate },
      }),
    }),
    updatePurchase: build.mutation<{ ok: boolean }, { id: string; body: Partial<Purchase> }>({
      query: ({ id, body }) => ({ url: `/inventory/purchases/${id}`, method: "PUT", body }),
      invalidatesTags: ["Purchase", "Product", "Catalog"],
    }),
    revertPurchase: build.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/inventory/purchases/${id}/revert`, method: "PATCH" }),
      invalidatesTags: ["Purchase", "Product", "Catalog"],
    }),
    deletePurchase: build.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/inventory/purchases/${id}`, method: "DELETE" }),
      invalidatesTags: ["Purchase", "Product", "Catalog"],
    }),
    // Merma o corrección de conteo de un lote (migración 0023).
    adjustStock: build.mutation<
      { quantity: number; available: number },
      { id: string; body: { kind: "adjust_in" | "adjust_out" | "write_off"; quantity: number; reason: string } }
    >({
      query: ({ id, body }) => ({ url: `/inventory/purchases/${id}/adjust`, method: "POST", body }),
      invalidatesTags: ["Purchase", "Product", "Catalog"],
    }),
    getStockMovements: build.query<StockMovement[], string>({
      query: (purchaseId) => ({ url: "/inventory/movements", params: { purchaseId } }),
      providesTags: ["Purchase"],
    }),
  }),
});

export type StockMovementKind = "return_to_stock" | "write_off" | "adjust_in" | "adjust_out";

export interface StockMovement {
  id: string;
  purchaseId: string | null;
  code: string | null;
  kind: StockMovementKind;
  quantity: number;
  /** Costo final por unidad (C$) del lote al momento del movimiento. */
  unitCostCs: number | null;
  reason: string;
  orderId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const {
  useGetPurchasesQuery,
  useGetCurrentInventoryQuery,
  useGetAvailableInventoryQuery,
  useGetIncomingInventoryQuery,
  useGetInventoryKpisQuery,
  useCreatePurchaseMutation,
  useReportArrivalMutation,
  useSimulateCostMutation,
  useUpdatePurchaseMutation,
  useRevertPurchaseMutation,
  useDeletePurchaseMutation,
  useAdjustStockMutation,
  useGetStockMovementsQuery,
} = inventoryApi;

