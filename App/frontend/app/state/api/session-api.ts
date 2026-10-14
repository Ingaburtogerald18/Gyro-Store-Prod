// Sesión (quién soy) y config pública del negocio: casi todas las pantallas los piden al montar.
import type { BusinessHoursRow, Category, PublicStorePolicies, StoreBankAccount } from '@shared/schemas';
import { baseApi } from './base-api';
import { sessionResolved, signedOut } from '../slices/auth-slice';

export type { StoreBankAccount, Category as StoreCategory };

// La configuración del negocio (tasa de cambio, pozos, escalas, logos) cambia
// una vez cada varios días y la consultan casi todas las pantallas. 5 minutos.
const CONFIG_CACHE_SECONDS = 300;


// Espejo de GET /api/config: lo del entorno, los datos del negocio editados en el panel, categorías
// e imágenes (ver modules/settings/config-routes.ts).
export interface StoreConfig {
  // ── Desde env (server/modules/settings/public-config.ts) ──
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
  businessHours?: BusinessHoursRow[];
  // Configuración → Atención, sin borradores (ver toPublicPolicies).
  policies?: PublicStorePolicies;
  categories: Category[];
  images?: {
    logoStatic?: string;
    logoAnimated?: string;
    favicon?: string;
    posLogo?: string;
    cartEmpty?: string;
    cartBanner?: string;
    orderSuccess?: string;
    loginImage?: string;
  };
}

export const sessionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // `providesTags: ['Me']`: las mutations del perfil propio lo invalidan y el header se actualiza solo.
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

    // /api/config: constantes de negocio públicas. El
    // shape espeja PublicConfig de server/modules/settings/public-config.ts.
    getConfig: builder.query<StoreConfig, void>({
      query: () => 'config',
      providesTags: ['Config'],
      keepUnusedDataFor: CONFIG_CACHE_SECONDS,
    }),
  }),
});

export const { useGetMeQuery, useLazyGetMeQuery, useGetConfigQuery } = sessionApi;

// Alias: algún call-site usa `configApi.util.invalidateTags`; es el mismo baseApi.
export const configApi = sessionApi;
