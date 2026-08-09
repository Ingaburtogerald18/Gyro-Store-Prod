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

    // ── Configuración del landing: slides del hero + orden de categorías.
    // GET es público (lo necesita la home); PUT lo restringe el backend a admin.
    getLandingConfig: build.query<LandingConfig, void>({
      query: () => 'landing-config',
      providesTags: ['Landing'],
    }),
    updateLandingConfig: build.mutation<LandingConfig, LandingConfig>({
      query: (body) => ({ url: 'landing-config', method: 'PUT', body }),
      invalidatesTags: ['Landing'],
    }),

    // ── Formulario de contacto público → captura el lead en el CRM
    // (server/services/crm.ts). En v2 escribe en el dominio de contactos.
    sendContact: build.mutation<{ ok: boolean }, PublicContactInput>({
      query: (body) => ({ url: 'contact', method: 'POST', body }),
    }),
  }),
});

export const {
  useGetCatalogQuery,
  useGetCatalogDetailQuery,
  useGetCombosQuery,
  useCreatePublicOrderMutation,
  useGetLandingConfigQuery,
  useUpdateLandingConfigMutation,
  useSendContactMutation,
} = storefrontApi;
