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
}

export interface InventoryKpis {
  totalPurchases: number;
  inTransit: number;
  received: number;
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
}

export interface ArrivalPayload {
  arrivalDate: string;
  shippingUnit: number;
  suggestedPrice?: number;
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
    simulateCost: build.mutation<{ precioSugerido: number }, { id: string; shippingUnit: number }>({
      query: ({ id, shippingUnit }) => ({ url: `/inventory/purchases/${id}/simulate-cost`, method: "POST", body: { shippingUnit } }),
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
      invalidatesTags: ["Purchase"],
    }),
  }),
});

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
} = inventoryApi;

