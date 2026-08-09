import { baseApi } from './baseApi';

// Los campos de estructura de costos son OPCIONALES porque el backend los
// recorta por rol (server/routes/reports.ts): un vendedor recibe su volumen y
// su comisión, nunca el coste, la ganancia de la tienda ni los pozos. Marcarlos
// `?` es lo que obliga al panel a contemplar el caso en vez de imprimir
// `undefined`.
export interface FinancialKPIs {
  total_ventas: number;
  total_unidades: number;
  total_vendido: number;
  comision_total: number;
  coste_total?: number;
  ganancia_tienda_total?: number;
  salary_acumulado?: number;
  pozos_recogidos?: Record<string, number>;

  // ── Periodo anterior de igual duración (migración 0017) ──
  // `coste_total_prev` y `ganancia_tienda_total_prev` son opcionales por el
  // mismo motivo que sus pares actuales: el backend los recorta para quien no
  // es admin. Con el valor anterior y el delta se reconstruye el actual, así
  // que se podan juntos.
  total_ventas_prev?: number;
  total_unidades_prev?: number;
  total_vendido_prev?: number;
  comision_total_prev?: number;
  coste_total_prev?: number;
  ganancia_tienda_total_prev?: number;
}

export interface KpiParams {
  startDate?: string;
  endDate?: string;
  sellerUid?: string;
}

export interface ExpensePozoItem {
  pozo: string;
  total_gastado: number;
}

// ── Reportería de ventas ──

/** Corte del eje temporal. Lo elige la UI según el largo del rango. */
export type TrendBucket = 'day' | 'week' | 'month';

export interface SalesTrendPoint {
  /** Inicio del bucket, ISO. */
  bucket_start: string;
  total_vendido: number;
  comision: number;
  num_ventas: number;
  /** Ganancia de la TIENDA: solo llega si quien pregunta es admin. */
  ganancia?: number;
}

export interface SellerPerformanceRow {
  seller_uid: string | null;
  seller_email: string;
  /** Nombre registrado en `profiles`; vacío si la cuenta nunca se completó. */
  seller_name: string;
  total_vendido: number;
  comision: number;
  num_ventas: number;
  unidades: number;
}

export interface TopProductRow {
  sku: string;
  unidades: number;
  ingreso: number;
}

/** Todos los cortes comparten forma: la UI solo traduce `key` a español. */
export interface BreakdownGroup {
  key: string;
  count: number;
  total: number;
}

export interface SalesBreakdown {
  by_method: BreakdownGroup[];
  by_origin: BreakdownGroup[];
  by_invoiced: BreakdownGroup[];
  by_discount: BreakdownGroup[];
  by_installment: BreakdownGroup[];
}

/** Una fila por venta: alimenta los pop-ups de Vendido, Coste y Ganancia. */
export interface SalesLedgerRow {
  order_id: string;
  created_at: string;
  /** Nombre del contacto, o el teléfono si nadie lo cargó. */
  cliente: string | null;
  /** Código impreso (`GS-PR-12`). Null si la venta no se facturó. */
  invoice_number: string | null;
  total_vendido: number;
  coste: number;
  comision: number;
  ganancia: number;
}

export interface DeliveryInvoiceRow {
  invoice_number: string | null;
  delivery_fee: number;
  delivery_name: string | null;
  created_at: string;
}

export interface DeliverySummary {
  /** Delivery de TODAS las facturas del periodo, anuladas incluidas. */
  total_delivery: number;
  num_deliveries: number;
  /** Cuánto de `total_delivery` viene de facturas anuladas (ya está sumado). */
  total_anulado: number;
  num_anuladas: number;
  by_repartidor: { repartidor: string; total: number; count: number }[];
}

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getKpis: build.query<FinancialKPIs, KpiParams | void>({
      query: (params) => ({ url: 'reports/kpis', params: params ?? undefined }),
      providesTags: ['Sale', 'Purchase', 'Product'],
    }),
    getLosses: build.query<any, void>({
      query: () => 'reports/losses',
    }),
    getSalesExport: build.query<any, KpiParams | void>({
      query: (params) => ({ url: 'reports/sales-export', params: params ?? undefined }),
    }),
    getExpensesByPozo: build.query<ExpensePozoItem[], KpiParams | void>({
      query: (params) => ({ url: 'reports/expenses', params: params ?? undefined }),
      providesTags: ['Sale'],
    }),

    getSalesTrend: build.query<SalesTrendPoint[], KpiParams & { bucket?: TrendBucket }>({
      query: (params) => ({ url: 'reports/trend', params }),
      providesTags: ['Sale'],
    }),
    getSellerPerformance: build.query<SellerPerformanceRow[], KpiParams | void>({
      query: (params) => ({ url: 'reports/sellers', params: params ?? undefined }),
      providesTags: ['Sale'],
    }),
    getTopProducts: build.query<TopProductRow[], KpiParams & { limit?: number }>({
      query: (params) => ({ url: 'reports/top-products', params }),
      providesTags: ['Sale', 'Product'],
    }),
    getSalesBreakdown: build.query<SalesBreakdown, KpiParams | void>({
      query: (params) => ({ url: 'reports/breakdown', params: params ?? undefined }),
      providesTags: ['Sale', 'Invoice'],
    }),
    getSalesLedger: build.query<SalesLedgerRow[], KpiParams | void>({
      query: (params) => ({ url: 'reports/sales-ledger', params: params ?? undefined }),
      providesTags: ['Sale', 'Invoice'],
    }),
    getDeliveryInvoices: build.query<DeliveryInvoiceRow[], KpiParams | void>({
      query: (params) => ({ url: 'reports/delivery-invoices', params: params ?? undefined }),
      providesTags: ['Invoice'],
    }),
  }),
});

export const {
  useGetKpisQuery,
  useGetLossesQuery,
  // Solo la variante lazy: la exportación de CSV se dispara por click, no al
  // montar. `useGetSalesExportQuery` (la versión ansiosa del MISMO endpoint) no
  // tiene consumidores y se quitó de acá.
  useLazyGetSalesExportQuery,
  useGetExpensesByPozoQuery,
  useGetSalesTrendQuery,
  useGetSellerPerformanceQuery,
  useGetTopProductsQuery,
  useGetSalesBreakdownQuery,
  useGetSalesLedgerQuery,
  useGetDeliveryInvoicesQuery,
} = reportsApi;
