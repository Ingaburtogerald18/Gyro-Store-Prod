// Tienda pública (sin sesión): catálogo, combos, pedidos, portada y contacto.
import type {
  CatalogProduct,
  Combo,
  LandingConfig,
  PublicContactInput,
  PublicOrderInput,
  PublicOrderStatus,
  StockNoticeInput,
  StoredDeliveryMethod,
  TrackPublicOrderInput,
} from '@shared/schemas';
import { baseApi } from './base-api';

// GET /api/catalog y /api/combos responden { items: [...] }.
interface ItemsResponse<T> {
  items: T[];
}

// Respuesta de /api/orders/public: el backend recalcula el total y arma el
// mensaje de WhatsApp ya formateado.
export interface CreatedPublicOrder {
  id: string;
  phone: string;
  total: number;
  status: string;
  /** Cada línea trae `catalogItemId` (producto) o `comboId` (paquete), nunca ambos. */
  items: Array<{
    catalogItemId?: string;
    comboId?: string;
    quantity: number;
    unitPrice: number;
    variantName?: string;
  }>;
  /** Link a WhatsApp con el pedido ya formateado, listo para abrir. */
  whatsappUrl: string;
}

/** Línea de un pedido ya resuelta por el servidor (nombre e imagen actuales). */
export interface PublicOrderLine {
  name: string;
  /** Combinación elegida; null en pedidos viejos. */
  variantName: string | null;
  image: string | null;
  quantity: number;
  unitPrice: number;
}

// GET /api/orders/public/:id — la vista de seguimiento. No trae teléfono ni
// dirección: el link puede reenviarse.
export interface PublicOrderTracking {
  id: string;
  status: PublicOrderStatus;
  deliveryMethod: StoredDeliveryMethod | null;
  firstName: string | null;
  /** Fecha real de recepción (inicio de la garantía); null mientras no se registre. */
  receivedDate: string | null;
  total: number;
  codeDiscount: number;
  createdAt: string;
  items: PublicOrderLine[];
}

export const storefrontApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ── Catálogo público ── El backend valida y presenta `CatalogProduct` antes de responder.
    getCatalog: build.query<CatalogProduct[], void>({
      query: () => 'catalog',
      transformResponse: (response: ItemsResponse<CatalogProduct>) => response.items,
      providesTags: ['Catalog'],
    }),
    getCombos: build.query<Combo[], void>({
      query: () => 'combos',
      transformResponse: (response: ItemsResponse<Combo>) => response.items,
      providesTags: ['Combos'],
    }),

    // ── Pedidos públicos del storefront (checkout por WhatsApp). Comprador
    // anónimo: no requiere auth.
    createPublicOrder: build.mutation<CreatedPublicOrder, PublicOrderInput>({
      query: (body) => ({ url: 'orders/public', method: 'POST', body }),
      transformResponse: (response: { order: CreatedPublicOrder }) => response.order,
      invalidatesTags: ['Orders'],
    }),
    recoverPublicOrder: build.mutation<CreatedPublicOrder | null, string>({
      query: (idempotencyKey) => ({ url: 'orders/public/recover', method: 'POST', body: { idempotencyKey } }),
      transformResponse: (response: { order: CreatedPublicOrder | null }) => response.order,
    }),

    // ── Configuración del landing: slides del hero + orden de categorías.
    // GET es público (lo necesita la home); se publica desde storeEditorApi.
    getLandingConfig: build.query<LandingConfig, void>({
      query: () => 'landing-config',
      providesTags: ['Landing'],
    }),

    // ── Contacto ── Captura el lead en el CRM.
    sendContact: build.mutation<{ ok: boolean }, PublicContactInput>({
      query: (body) => ({ url: 'contact', method: 'POST', body }),
    }),
    // «Avisame cuando haya»: `already` si ese teléfono ya esperaba esa opción.
    createStockNotice: build.mutation<{ already: boolean }, StockNoticeInput>({
      query: (body) => ({ url: 'stock-notices', method: 'POST', body }),
    }),

    // ── Seguimiento del pedido sin cuenta. El tag por id hace que, si el panel
    // cambia el estado en este mismo navegador, la página de seguimiento se refresque.
    getPublicOrder: build.query<PublicOrderTracking, string>({
      query: (id) => `orders/public/${id}`,
      transformResponse: (response: { order: PublicOrderTracking }) => response.order,
      providesTags: (_res, _err, id) => [{ type: 'Orders' as const, id }],
    }),
    // Número corto + teléfono → id completo, para navegar a /pedido/<id>.
    trackPublicOrder: build.mutation<{ id: string }, TrackPublicOrderInput>({
      query: (body) => ({ url: 'orders/public/track', method: 'POST', body }),
    }),
  }),
});

export const {
  useGetCatalogQuery,
  useGetCombosQuery,
  useCreatePublicOrderMutation,
  useRecoverPublicOrderMutation,
  useGetLandingConfigQuery,
  useSendContactMutation,
  useCreateStockNoticeMutation,
  useGetPublicOrderQuery,
  useTrackPublicOrderMutation,
} = storefrontApi;
