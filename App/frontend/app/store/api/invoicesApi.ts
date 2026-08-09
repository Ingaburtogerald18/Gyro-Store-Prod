import { baseApi } from './baseApi';

export interface Invoice {
  id: string;
  saleId: string | null;
  /** Correlativo numérico interno (orden y unicidad). */
  invoiceNumber: number;
  /** Código legible que se imprime y que el vendedor tipea: `GS-PR-12`. */
  invoiceCode: string;
  /** Solo viene del lookup: el editor de ventas se precarga con esto. */
  items?: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
  status: string;
  method: string | null;
  deliveryFee: number;
  total: number;
  createdAt: string;
  customerName?: string | null;
  phone?: string | null;
  subtotal?: number;
  discount?: number;
  deliveryName?: string | null;
  /** Vendedor al que Caja le asignó la factura al emitirla (o null). */
  sellerUid?: string | null;
  /** Solo lo trae el listado (`GET /invoices`, `/mine`): nombre resuelto del vendedor. */
  sellerName?: string | null;
  /**
   * Vendedor que CANJEÓ la factura (la vinculó a su venta) — quien cobra la
   * comisión. Puede ser distinto de `sellerName` (a quién se la asignó Caja).
   * Solo tiene valor en facturas `linked`, y solo lo trae el listado.
   */
  registeredByName?: string | null;
}

/** Vendedor activo, para el selector "Vendedor" de InvoiceEditor. */
export interface InvoiceSeller {
  id: string;
  name: string;
}

/**
 * Campos corregibles de una factura huérfana, líneas incluidas.
 * El CÓDIGO de descuento no está: ya se canjeó al emitir y volver a aplicarlo
 * consumiría otro uso. El monto se conserva y el servidor lo resta al subtotal
 * nuevo.
 */
export interface UpdateInvoiceInput {
  method?: 'efectivo' | 'transferencia' | 'tarjeta';
  deliveryFee?: number;
  customerName?: string;
  phone?: string;
  deliveryName?: string;
  items?: InvoiceItemInput[];
}

export interface InvoiceItemInput {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  customerName?: string;
  phone?: string;
  method: 'efectivo' | 'transferencia' | 'tarjeta';
  deliveryFee?: number;
  deliveryName?: string;
  discount?: number;
  /** Código de descuento opcional; el servidor lo canjea al crear la factura. */
  discountCode?: string;
  /** Vendedor al que se le asigna la factura (opcional: ticket de mostrador). */
  sellerUid?: string;
  items: InvoiceItemInput[];
}

export type InvoiceStatus = 'unlinked' | 'linked' | 'void';

export interface TicketData {
  ticketNumber: number;
  createdAt: string;
  customer: {
    name: string;
    phone?: string;
  };
  sellerName?: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  deliveryName?: string;
  total: number;
  method: string;
}

export const invoicesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getInvoices: build.query<Invoice[], { status?: InvoiceStatus } | void>({
      query: (args) => ({
        url: 'invoices',
        params: args && args.status ? { status: args.status } : undefined,
      }),
      providesTags: ['Invoice'],
    }),
    // "Mis Facturas" del portal de vendedor: solo las que Caja le asignó
    // (invoices.seller_uid), de solo lectura.
    getMyInvoices: build.query<Invoice[], { status?: InvoiceStatus } | void>({
      query: (args) => ({
        url: 'invoices/mine',
        params: args && args.status ? { status: args.status } : undefined,
      }),
      providesTags: ['Invoice'],
    }),
    // Selector "Vendedor" del formulario de emisión (InvoiceEditor).
    getInvoiceSellers: build.query<InvoiceSeller[], void>({
      query: () => 'invoices/sellers',
    }),
    getInvoiceTicket: build.query<TicketData, string>({
      query: (id) => `invoices/${encodeURIComponent(id)}/ticket`,
      providesTags: ['Invoice'],
    }),
    createInvoice: build.mutation<Invoice, CreateInvoiceInput>({
      query: (body) => ({ url: 'invoices', method: 'POST', body }),
      invalidatesTags: ['Invoice', 'Sale', 'DiscountCode'],
    }),
    // Búsqueda por el código impreso en el papel (`GS-PR-12`), que es lo que el
    // cliente trae cuando vuelve al mostrador.
    lookupInvoice: build.query<Invoice, string | number>({
      // Acepta el código impreso (`GS-PR-12`) o el número pelado.
      query: (invoiceNumber: string | number) => ({ url: 'invoices/lookup', params: { number: invoiceNumber } }),
      providesTags: ['Invoice'],
    }),
    // Solo datos accesorios: las líneas no se editan (moverían el subtotal de
    // un papel ya impreso). Si están mal, se anula y se emite otra.
    updateInvoice: build.mutation<Invoice, { id: string; data: UpdateInvoiceInput }>({
      query: ({ id, data }) => ({ url: `invoices/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Invoice'],
    }),
    // Anular, no borrar: el correlativo conserva el número y el motivo.
    voidInvoice: build.mutation<Invoice, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `invoices/${id}/void`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Invoice', 'Sale'],
    }),
    // Descartar definitivamente. NO reabre el número: la secuencia no retrocede.
    deleteInvoice: build.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `invoices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Invoice'],
    }),
  }),
});

export const {
  useGetInvoicesQuery,
  useGetMyInvoicesQuery,
  useGetInvoiceSellersQuery,
  useGetInvoiceTicketQuery,
  useCreateInvoiceMutation,
  useLookupInvoiceQuery,
  useLazyLookupInvoiceQuery,
  useUpdateInvoiceMutation,
  useVoidInvoiceMutation,
  useDeleteInvoiceMutation,
} = invoicesApi;
