// Ventas (Hito 3 admin). Contrato exacto de server/routes/sales.ts — no
// inventar campos: quote/register devuelven lo que el backend realmente
// manda (ver server/services/sales.ts para los shapes de QuoteResult/
// RegisteredSale/SaleListItem).
import { baseApi } from './baseApi';

export type SaleStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected';

export interface SaleLineInput {
  productName: string;
  quantity: number;
  salePrice: number;
  applyWholesale?: boolean;
}

export interface SellableProduct {
  productName: string;
  price: number;
  stock: number;
  /** Código del primer lote disponible. Se muestra junto al nombre. */
  code: string | null;
  /** Todos los códigos con stock: el buscador matchea contra cualquiera. */
  codes: string[];
}

// Los campos financieros son OPCIONALES porque el backend los recorta por rol:
// un vendedor no recibe costos ni ganancia de tienda (ver routes/sales.ts).
export interface QuoteLine {
  productName: string;
  quantity: number;
  precioUnit: number;
  /** Costo de UNA unidad. */
  costeFinalSnap?: number;
  /** Costo de todas las unidades. */
  costoTotal?: number;
  utilidadBruta?: number;
  salary?: number;
  utilidadNeta?: number;
  comision: number;
  /** Fracción (0.40 = 40%). Su tramo se busca por la utilidad neta UNITARIA. */
  comisionPercent: number;
  gananciaTienda?: number;

  // La misma cadena por unidad: el desglose muestra las dos columnas.
  utilidadBrutaUnit?: number;
  salaryUnit?: number;
  utilidadNetaUnit?: number;
  comisionUnit?: number;
  gananciaTiendaUnit?: number;

  wholesale: { discountPercent: number; warning: boolean };
  available: number;
  insufficientStock: boolean;
  belowMinMargin?: boolean;
}

export interface QuoteResult {
  lines: QuoteLine[];
  total: number;
  totalComision: number;
  totalGananciaTienda?: number;
}

export interface RegisterSaleInput {
  /** Código impreso de la factura (`GS-PR-12`). El backend también acepta "12". */
  invoiceNumber?: string | number;
  customerName?: string;
  phone?: string;
  overrideSellerId?: string;
  overrideSellerName?: string;
  items: SaleLineInput[];
}

export interface RegisteredSale {
  id: string;
  status: string;
  total: number;
}

// Edición de una venta ya registrada (PUT /api/sales/:id, solo admin).
// `reason` es OBLIGATORIO cuando la venta ya salió de `pending_approval`:
// el backend lo rechaza sin él (server/services/sales.ts → updateSale).
export interface UpdateSaleInput {
  id: string;
  customerName?: string;
  phone?: string;
  overrideSellerId?: string;
  overrideSellerName?: string;
  items: SaleLineInput[];
  reason?: string;
}

/**
 * Una venta con sus líneas. La devuelve `GET /api/sales/:id`.
 *
 * Los campos financieros por línea son OPCIONALES porque el backend los recorta
 * por rol: un vendedor recibe qué vendió y a cuánto, nunca el costo ni la
 * ganancia de la tienda.
 */
export interface SaleWithItems extends SaleListItem {
  items: (SaleLineInput & {
    costeFinalSnap?: number;
    comision?: number;
    gananciaTienda?: number;
  })[];
}

export interface SaleListItem {
  id: string;
  status: SaleStatus;
  saleOrigin: string;
  sellerUid: string | null;
  sellerEmail: string;
  /** Nombre registrado en `profiles`. Vacío si nunca se completó el perfil. */
  sellerName: string;
  weekOf: string | null;
  customerName: string | null;
  phone: string | null;
  total: number;
  /** Suma de la comisión de TODAS las líneas de la venta. */
  totalComision: number;
  /** Correlativo de la factura con que se registró la venta. Null si no tiene. */
  invoiceNumber?: number | null;
  /** Código legible de esa factura: `GS-PR-12`. Null si no tiene. */
  invoiceCode?: string | null;
  createdAt: string;
}

// ── Pago de comisiones ──
// Un lote de pago es inmutable: registra lo que se entregó. Si después se edita
// una venta ya pagada, la diferencia va a `balance` y se salda en el próximo
// corte (ver server/services/sellerPayments.ts).

export interface CommissionPayment {
  id: string;
  sellerEmail: string;
  sellerName: string;
  orderIds: string[];
  grossComision: number;
  /** Ajustes arrastrados de cortes anteriores. */
  saldoAplicado: number;
  totalComision: number;
  isSettlement: boolean;
  paymentMethod: string;
  receiptUrl: string | null;
  noReceiptComment: string | null;
  createdAt: string;
}

export interface SellerBalance {
  sellerEmail: string;
  sellerName: string;
  /** >0 la tienda le debe · <0 el vendedor debe devolver */
  balance: number;
  count: number;
}

export interface SellerSummary {
  pendingApproval: { count: number; comision: number };
  approvedUnpaid: { count: number; comision: number };
  paid: { count: number; comision: number };
  balance: number;
}

/** El comprobante se sube antes a `POST /api/upload`; acá viaja como URL. */
export interface PayoutProof {
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  receiptUrl?: string;
  noReceiptComment?: string;
}

export const salesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSellableProducts: build.query<SellableProduct[], void>({
      query: () => 'sales/products',
      providesTags: ['Product'],
    }),
    quoteSale: build.mutation<QuoteResult, SaleLineInput[]>({
      query: (items) => ({ url: 'sales/quote', method: 'POST', body: { items } }),
    }),
    registerSale: build.mutation<RegisteredSale, RegisterSaleInput>({
      query: (body) => ({ url: 'sales', method: 'POST', body }),
      invalidatesTags: ['Sale', 'Purchase', 'Product'],
    }),
    updateSale: build.mutation<RegisteredSale, UpdateSaleInput>({
      query: ({ id, ...body }) => ({ url: `sales/${id}`, method: 'PUT', body }),
      // Editar recalcula el snapshot y mueve reservas de stock.
      invalidatesTags: ['Sale', 'Purchase', 'Product', 'CommissionPayment'],
    }),
    approveSale: build.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `sales/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Sale'],
      // ── Optimistic update ──
      // Aprobar es un click sobre una fila que el admin está mirando. Esperar
      // el round-trip para que la fila cambie de estado hace que el panel se
      // sienta lento aunque el backend responda rápido. Acá la fila cambia al
      // instante y, si el servidor rechaza, `undo()` la devuelve exactamente a
      // donde estaba — no a un estado "refrescado" que podría diferir.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patches = [
          // La venta desaparece del listado de pendientes…
          dispatch(
            salesApi.util.updateQueryData('getSales', { status: 'pending_approval' }, (draft) => {
              const i = draft.findIndex((s) => s.id === id);
              if (i !== -1) draft.splice(i, 1);
            }),
          ),
          // …y en "Todas" solo cambia de estado.
          dispatch(
            salesApi.util.updateQueryData('getSales', { status: undefined }, (draft) => {
              const sale = draft.find((s) => s.id === id);
              if (sale) sale.status = 'approved';
            }),
          ),
        ];
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => p.undo());
        }
      },
    }),
    rejectSale: build.mutation<{ ok: boolean }, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `sales/${id}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Sale', 'Purchase', 'Product'],
    }),
    getSales: build.query<SaleListItem[], { status?: string; sellerEmail?: string } | void>({
      query: (params) => ({ url: 'sales', params: params ?? undefined }),
      providesTags: ['Sale'],
    }),
    /** Una venta con sus líneas. Alimenta el drawer de detalle (`?sale=<id>`). */
    getSale: build.query<SaleWithItems, string>({
      query: (id) => `sales/${id}`,
      providesTags: ['Sale'],
    }),

    // ── Comisiones (admin) ──
    getCommissionPayments: build.query<CommissionPayment[], { sellerEmail?: string } | void>({
      query: (params) => ({ url: 'sales/payments', params: params ?? undefined }),
      providesTags: ['CommissionPayment'],
    }),
    getSellerBalances: build.query<SellerBalance[], void>({
      query: () => 'sales/balances',
      providesTags: ['CommissionPayment'],
    }),
    // Mismo shape que `getMySalesSummary`, pero para un vendedor cualquiera
    // (admin-only). Alimenta el popup "cuánto le debemos" tras aprobar en lote.
    getSellerSummaryFor: build.query<SellerSummary, string>({
      query: (sellerEmail) => ({ url: 'sales/summary', params: { sellerEmail } }),
      providesTags: ['CommissionPayment', 'Sale'],
    }),
    payCommissions: build.mutation<
      CommissionPayment,
      PayoutProof & { sellerEmail: string; orderIds: string[] }
    >({
      query: (body) => ({ url: 'sales/pay', method: 'POST', body }),
      // Pagar mueve las ventas a 'paid': el listado de ventas también cambia.
      invalidatesTags: ['CommissionPayment', 'Sale'],
    }),
    settleSellerBalance: build.mutation<CommissionPayment, PayoutProof & { sellerEmail: string }>({
      query: (body) => ({ url: 'sales/settle-balance', method: 'POST', body }),
      invalidatesTags: ['CommissionPayment'],
    }),

    // ── Portal del vendedor ──
    // Sin parámetros a propósito: el backend resuelve el vendedor desde el
    // token, así que nadie puede pedir el resumen de otro.
    getMySalesSummary: build.query<SellerSummary, void>({
      query: () => 'sales/my-summary',
      providesTags: ['CommissionPayment', 'Sale'],
    }),
    getMyCommissionPayments: build.query<CommissionPayment[], void>({
      query: () => 'sales/my-payments',
      providesTags: ['CommissionPayment'],
    }),
  }),
});

export const {
  useGetSellableProductsQuery,
  useQuoteSaleMutation,
  useRegisterSaleMutation,
  useUpdateSaleMutation,
  useApproveSaleMutation,
  useRejectSaleMutation,
  useGetSalesQuery,
  useGetSaleQuery,
  useGetCommissionPaymentsQuery,
  useGetSellerBalancesQuery,
  useGetSellerSummaryForQuery,
  usePayCommissionsMutation,
  useSettleSellerBalanceMutation,
  useGetMySalesSummaryQuery,
  useGetMyCommissionPaymentsQuery,
} = salesApi;
