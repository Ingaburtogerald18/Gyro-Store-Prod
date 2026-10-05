// Dominio de arranque de sesión + config pública del negocio. Agrupa authApi
// (quién soy) y configApi (constantes de negocio) — dos slices diminutos que
// casi todas las pantallas consultan al montar. Un solo injectEndpoints sobre
// baseApi; mismos hooks, tags y tipos que antes.
import type { StoreBankAccount, Category } from '@shared/schemas';
import { baseApi } from './baseApi';
import { sessionResolved, signedOut } from '../slices/authSlice';

export type { StoreBankAccount, Category as StoreCategory };

// La configuración del negocio (tasa de cambio, pozos, escalas, logos) cambia
// una vez cada varios días y la consultan casi todas las pantallas. 5 minutos.
const CONFIG_CACHE_SECONDS = 300;


// Espejo de lo que responde GET /api/config: `getPublicConfig()` (desde env) +
// `getBusinessInfo()` (editable en el panel, pisa brandName/whatsapp/contactEmail
// y agrega ruc/address) + categorías + imágenes. Ver server/routes/config.ts.
//
// Los campos de negocio faltaban acá aunque el endpoint ya los devolvía, así que
// el footer no podía mostrar la dirección y `config.brandName` no compilaba.
export interface StoreConfig {
  // ── Desde env (server/services/config.ts) ──
  brandName: string;
  contactEmail: string;
  internalDomain: string;
  appUrl: string;
  // Símbolo de la moneda local, ej. 'C$' (córdoba).
  currency: string;
  // Tasa USD → córdoba vigente.
  exchangeRate: number;
  // Número de WhatsApp del negocio (para wa.me/...).
  whatsapp: string;
  // ── Desde app_config → 'business_info' (editable en el panel) ──
  ruc: string;
  address: string;
  locationUrl?: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
  };
  bankAccounts?: StoreBankAccount[];
  categories: Category[];
  images?: {
    logoStatic?: string;
    logoAnimated?: string;
    favicon?: string;
    posLogo?: string;
    cartEmpty?: string;
    cartBanner?: string;
    orderSuccess?: string;
  };
}

export const sessionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Sesión actual. Al resolver, sincroniza el authSlice.
    //
    // `providesTags: ['Me']` para que las mutations del perfil PROPIO
    // (usersApi: updateMyProfile / uploadMyAvatar / deleteMyAvatar) lo invaliden:
    // así el avatar y el nombre del header se actualizan sin recargar la página.
    getMe: builder.query<{ user: any }, void>({
      query: () => '/auth/me',
      providesTags: ['Me'],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.user) {
            dispatch(sessionResolved(data.user));
          } else {
            dispatch(signedOut());
          }
        } catch {
          dispatch(signedOut());
        }
      },
    }),

    // /api/config (doc 09 ítems 25-26): constantes de negocio públicas. El
    // shape espeja PublicConfig de server/services/config.ts.
    getConfig: builder.query<StoreConfig, void>({
      query: () => 'config',
      providesTags: ['Config'],
      keepUnusedDataFor: CONFIG_CACHE_SECONDS,
    }),
  }),
});

export const { useGetMeQuery, useLazyGetMeQuery, useGetConfigQuery } = sessionApi;

// Alias de compatibilidad: algún call-site usa `configApi.util.invalidateTags`.
// Todas las apis inyectadas comparten el mismo baseApi subyacente, así que el
// objeto merged sirve igual.
export const configApi = sessionApi;
