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

  // ── Préstamos y Ganancia Real ──
  total_prestamos?: number;
  total_prestamos_prev?: number;
  budget_prestamos_disponible?: number;
  prestamos_cubierto_por_budget?: number;
  prestamos_de_ganancia?: number;
  /** Todo lo que los gastos del mes tomaron de la ganancia (pozos, préstamos y salario). */
  gastos_de_ganancia?: number;
  ganancia_real?: number;
  ganancia_real_prev?: number;
}

export interface LoanPaymentItem {
  id: string;
  monto_cs: number;
  monto_usd: number | null;
  exchange_rate: number | null;
  fecha: string;
  nota: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LoanPaymentsListResponse {
  payments: LoanPaymentItem[];
  total: number;
}

export interface CreateLoanPaymentPayload {
  monto?: number;
  monto_cs?: number;
  moneda?: 'COR' | 'USD';
  fecha: string;
  nota?: string | null;
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

export interface ExpenseItem {
  id: string;
  pozo: string;
  monto: number;
  montoUsd: number | null;
  exchangeRate: number | null;
  category: string;
  description: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

/** Una fila del libro de pozos del mes (server/services/pozoLedger.ts). */
export interface PozoLedgerRow {
  pozo: string;
  label: string;
  recogido: number;
  heredado: number;
  gastado: number;
  /** heredado + recogido − gastado, antes de cubrir desbordes. Negativo = se pasó. */
  disponible: number;
  tomadoExtra: number;
  tomadoPozos: number;
  tomadoGanancia: number;
  prestado: number;
  saldoFinal: number;
}

export interface MonthLedger {
  month: string;
  pozos: PozoLedgerRow[];
  extraInicio: number;
  extraUsado: number;
  extraSiguiente: number;
  sobranteSalario: number;
  gananciaTienda: number;
  deGanancia: { comunes: number; prestamos: number; salario: number; total: number };
  gananciaReal: number;
}

export interface ExpensesListResponse {
  expenses: ExpenseItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateExpensePayload {
  pozo: string;
  monto: number;
  moneda?: 'COR' | 'USD';
  fecha?: string;
  category: string;
  description?: string;
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
  nombre?: string;
  unidades: number;
  ingreso: number;
  margen?: number;
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
      providesTags: ['Sale', 'Purchase', 'Product', 'LoanPayment'],
    }),
    getLosses: build.query<any, void>({
      query: () => 'reports/losses',
    }),
    getSalesExport: build.query<any, KpiParams | void>({
      query: (params) => ({ url: 'reports/sales-export', params: params ?? undefined }),
    }),
    getExpensesByPozo: build.query<ExpensePozoItem[], KpiParams | void>({
      query: (params) => ({ url: 'reports/expenses', params: params ?? undefined }),
      providesTags: ['Expense', 'Sale'],
    }),
    getExpensesOverflow: build.query<MonthLedger, KpiParams | void>({
      query: (params) => ({ url: 'reports/expenses/overflow', params: params ?? undefined }),
      providesTags: ['Expense', 'Sale'],
    }),
    getExpensesList: build.query<
      ExpensesListResponse,
      { pozo?: string; desde?: string; hasta?: string; page?: number; pageSize?: number } | void
    >({
      query: (params) => ({
        url: 'reports/expenses',
        params: { detail: 'true', ...(params ?? {}) },
      }),
      providesTags: ['Expense'],
    }),
    createExpense: build.mutation<ExpenseItem, CreateExpensePayload>({
      query: (body) => ({
        url: 'reports/expenses',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Expense', 'Sale'],
    }),
    deleteExpense: build.mutation<{ success: boolean; id: string }, string>({
      query: (id) => ({
        url: `reports/expenses/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Expense', 'Sale'],
    }),

    getLoanPaymentsSummary: build.query<{ total: number }, KpiParams | void>({
      query: (params) => ({ url: 'reports/loan-payments/summary', params: params ?? undefined }),
      providesTags: ['LoanPayment'],
    }),
    getLoanPaymentsList: build.query<LoanPaymentsListResponse, KpiParams | void>({
      query: (params) => ({ url: 'reports/loan-payments', params: params ?? undefined }),
      providesTags: ['LoanPayment'],
    }),
    createLoanPayment: build.mutation<LoanPaymentItem, CreateLoanPaymentPayload>({
      query: (body) => ({
        url: 'reports/loan-payments',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['LoanPayment', 'Sale'],
    }),
    deleteLoanPayment: build.mutation<{ success: boolean; id: string }, string>({
      query: (id) => ({
        url: `reports/loan-payments/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['LoanPayment', 'Sale'],
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
  useGetExpensesOverflowQuery,
  useGetExpensesListQuery,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useGetLoanPaymentsSummaryQuery,
  useGetLoanPaymentsListQuery,
  useCreateLoanPaymentMutation,
  useDeleteLoanPaymentMutation,
  useGetSalesTrendQuery,
  useGetSellerPerformanceQuery,
  useGetTopProductsQuery,
  useGetSalesBreakdownQuery,
  useGetSalesLedgerQuery,
  useGetDeliveryInvoicesQuery,
} = reportsApi;
