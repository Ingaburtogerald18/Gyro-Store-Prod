// Dominio storefront público (sin auth): catálogo + combos, pedidos por
// WhatsApp, config del landing y formulario de contacto. Agrupa los cuatro
// slices públicos que antes vivían sueltos (catalogApi, ordersApi, landingApi,
// contactApi); un solo injectEndpoints sobre baseApi, mismos hooks y tags.
import type {
  CatalogDetail,
  CatalogProduct,
  Combo,
  LandingConfig,
  PublicContactInput,
  PublicOrderInput,
  PublicOrderStatus,
  TrackPublicOrderInput,
} from '@shared/schemas';
import { baseApi } from './baseApi';

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
  /** Combinación elegida; null en pedidos previos a la migración 0019. */
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
  deliveryMethod: 'retiro' | 'envio' | null;
  firstName: string | null;
  total: number;
  codeDiscount: number;
  createdAt: string;
  items: PublicOrderLine[];
}

export const storefrontApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ── Catálogo público (doc 09 ítem 42). Los tipos vienen del contrato
    // único compartido: el backend valida contra `publicCatalogItemSchema` y
    // presenta `CatalogProduct` (plano, camelCase) antes de responder.
    getCatalog: build.query<CatalogProduct[], void>({
      query: () => 'catalog',
      transformResponse: (response: ItemsResponse<CatalogProduct>) => response.items,
      providesTags: ['Catalog'],
    }),
    // Detalle con ejes de variante resueltos. La ficha lo carga por SSR
    // (loader de producto.$id.tsx); este hook es para el QuickAddSheet, que
    // necesita los ejes desde la tarjeta sin navegar.
    getCatalogDetail: build.query<CatalogDetail, string>({
      query: (id) => `catalog/${id}`,
      providesTags: (_res, _err, id) => [{ type: 'Catalog' as const, id }],
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
    // GET es público (lo necesita la home); PUT lo restringe el backend a admin.
    getLandingConfig: build.query<LandingConfig, void>({
      query: () => 'landing-config',
      providesTags: ['Landing'],
    }),
    updateLandingConfig: build.mutation<LandingConfig, LandingConfig>({
      query: (body) => ({ url: 'landing-config', method: 'PUT', body }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            storefrontApi.util.updateQueryData('getLandingConfig', undefined, () => data)
          );
        } catch {
          // Si el guardado falla, la caché queda como estaba; el error lo
          // muestra quien llamó a la mutation.
        }
      }
    }),

    // ── Formulario de contacto público → captura el lead en el CRM
    // (server/services/crm.ts). En v2 escribe en el dominio de contactos.
    sendContact: build.mutation<{ ok: boolean }, PublicContactInput>({
      query: (body) => ({ url: 'contact', method: 'POST', body }),
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
  useGetCatalogDetailQuery,
  useGetCombosQuery,
  useCreatePublicOrderMutation,
  useRecoverPublicOrderMutation,
  useGetLandingConfigQuery,
  useUpdateLandingConfigMutation,
  useSendContactMutation,
  useGetPublicOrderQuery,
  useTrackPublicOrderMutation,
} = storefrontApi;
