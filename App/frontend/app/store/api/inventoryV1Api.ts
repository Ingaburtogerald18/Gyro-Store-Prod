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
  /** Orden de Alibaba de la línea (null sin orden o sin la migración 0024). */
  orderId?: string | null;
  /** Lo pedido, cuando llegó otra cantidad (null = llegó lo pedido). */
  quantityOrdered?: number | null;
}

// ── Órdenes de compra (Alibaba, migración 0024) ──

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  storeUrl: string;
  notes: string;
}

export interface SupplierPayload {
  name: string;
  contact?: string;
  storeUrl?: string;
  notes?: string;
}

/** Factura de Alibaba: una puede cubrir varias órdenes. */
export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  fileUrl: string | null;
  totalUsd: number | null;
  notes: string;
  createdAt: string;
  orders: { id: string; orderNumber: string }[];
  /** Suma de los productos de todas sus órdenes (USD). */
  linesTotalUsd: number;
  mismatch: boolean;
}

export interface PurchaseInvoicePayload {
  invoiceNumber?: string;
  fileUrl?: string | null;
  totalUsd?: number | null;
  notes?: string;
}

export type PurchaseOrderStatus = "empty" | "transit" | "partial" | "received";
export type PurchaseOrderMissing = "number" | "supplier" | "invoice" | "photos";

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  /** Número heredado del lote viejo: falta el de Alibaba. */
  numberProvisional: boolean;
  purchaseDate: string;
  supplier: Supplier | null;
  /** Puede ser compartida con otras órdenes. */
  invoice: PurchaseInvoice | null;
  packagePhotos: string[];
  notes: string;
  legacy: boolean;
  createdAt: string;
  lineCount: number;
  receivedLineCount: number;
  units: number;
  linesTotalUsd: number;
  /** Impuesto por unidad de la orden (USD); null si no tiene líneas o difieren. */
  taxUnit: number | null;
  status: PurchaseOrderStatus;
  missing: PurchaseOrderMissing[];
  arrivalDate: string | null;
}

/** Una variante de una plantilla. `catalogItemId` solo si la plantilla tiene varios productos. */
export interface PurchaseOrderLinePayload {
  templateId: string;
  variantKey: string;
  catalogItemId?: string;
  quantity: number;
  costUnit: number;
}

export interface PurchaseOrderHeaderPayload {
  orderNumber: string;
  purchaseDate: string;
  taxUnit?: number;
  supplierId?: string | null;
  newSupplier?: SupplierPayload;
  invoiceId?: string | null;
  newInvoice?: PurchaseInvoicePayload;
  packagePhotos?: string[];
  notes?: string;
}

export interface NewPurchaseOrderPayload extends Omit<PurchaseOrderHeaderPayload, "taxUnit"> {
  taxUnit: number;
  lines: PurchaseOrderLinePayload[];
}

export interface ReceiveOrderLinePayload {
  purchaseId: string;
  receivedQuantity: number;
  salePrice?: number;
}

export interface ReceiveOrderPayload {
  arrivalDate: string;
  /** Otras órdenes que llegaron en el mismo envío (el envío se reparte entre todas). */
  extraOrderIds?: string[];
  exchangeRate?: number;
  shippingTotalUsd: number;
  lines: ReceiveOrderLinePayload[];
}

export interface ReceiptPreview {
  totalUnits: number;
  shippingUnit: number;
  exchangeRate: number;
  lines: {
    purchaseId: string;
    code: string;
    productName: string;
    ordered: number;
    received: number;
    costoRealCs: number;
    costeFinal: number;
    precioSugerido: number;
  }[];
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

    // ── Órdenes de compra ──
    // `available: false` = falta la migración 0024: el panel sigue con el
    // formulario de compra suelta.
    getPurchaseOrders: build.query<{ available: boolean; orders: PurchaseOrder[] }, void>({
      query: () => "/inventory/orders",
      providesTags: ["Purchase"],
    }),
    // Registrar crea (sin publicar) los productos de plantillas nuevas en el catálogo.
    createPurchaseOrder: build.mutation<PurchaseOrder, NewPurchaseOrderPayload>({
      query: (body) => ({ url: "/inventory/orders", method: "POST", body }),
      invalidatesTags: ["Purchase", "Templates", "AdminCatalog"],
    }),
    updatePurchaseOrder: build.mutation<PurchaseOrder, { id: string; body: PurchaseOrderHeaderPayload }>({
      query: ({ id, body }) => ({ url: `/inventory/orders/${id}`, method: "PUT", body }),
      invalidatesTags: ["Purchase"],
    }),
    deletePurchaseOrder: build.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/inventory/orders/${id}`, method: "DELETE" }),
      invalidatesTags: ["Purchase"],
    }),
    addPurchaseOrderLines: build.mutation<PurchaseOrder, { id: string; lines: PurchaseOrderLinePayload[]; taxUnit?: number }>({
      query: ({ id, lines, taxUnit }) => ({ url: `/inventory/orders/${id}/lines`, method: "POST", body: { lines, taxUnit } }),
      invalidatesTags: ["Purchase", "Templates", "AdminCatalog"],
    }),
    simulateOrderReceipt: build.mutation<ReceiptPreview, { id: string; body: Omit<ReceiveOrderPayload, "arrivalDate"> }>({
      query: ({ id, body }) => ({ url: `/inventory/orders/${id}/simulate-receipt`, method: "POST", body }),
    }),
    receivePurchaseOrder: build.mutation<
      { received: number; shippingUnit: number; exchangeRate: number },
      { id: string; body: ReceiveOrderPayload }
    >({
      query: ({ id, body }) => ({ url: `/inventory/orders/${id}/receive`, method: "POST", body }),
      invalidatesTags: ["Purchase", "Product", "Catalog"],
    }),
    getSuppliers: build.query<Supplier[], void>({
      query: () => "/inventory/suppliers",
      providesTags: ["Purchase"],
    }),
    updatePurchaseInvoice: build.mutation<{ ok: boolean }, { id: string; body: PurchaseInvoicePayload }>({
      query: ({ id, body }) => ({ url: `/inventory/invoices/${id}`, method: "PUT", body }),
      invalidatesTags: ["Purchase"],
    }),
    updateSupplier: build.mutation<Supplier, { id: string; body: SupplierPayload }>({
      query: ({ id, body }) => ({ url: `/inventory/suppliers/${id}`, method: "PUT", body }),
      invalidatesTags: ["Purchase"],
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
  useReportArrivalMutation,
  useSimulateCostMutation,
  useUpdatePurchaseMutation,
  useRevertPurchaseMutation,
  useDeletePurchaseMutation,
  useAdjustStockMutation,
  useGetStockMovementsQuery,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useAddPurchaseOrderLinesMutation,
  useSimulateOrderReceiptMutation,
  useReceivePurchaseOrderMutation,
  useGetSuppliersQuery,
  useUpdateSupplierMutation,
  useUpdatePurchaseInvoiceMutation,
} = inventoryApi;

