// Base de RTK Query (doc 09 ítem 39). Todos los API slices por dominio
// (catalogApi, ordersApi, salesApi, …) se cuelgan de acá con injectEndpoints,
// así hay UNA sola instancia de createApi y un solo reducer/middleware.
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getAccessToken } from '~/lib/supabase.client';

export const baseApi = createApi({
  reducerPath: 'api',
  // 60 s de caché tras el último consumidor (el default de RTK son 60 s
  // también, pero acá queda explícito porque es una decisión de producto, no un
  // default heredado): volver a un módulo visitado hace menos de un minuto
  // pinta al instante y revalida en segundo plano, en vez de mostrar esqueleto
  // otra vez. Los endpoints que necesiten otra ventana la declaran ellos.
  keepUnusedDataFor: 60,
  // Fuerza el fetch al MONTAR cada componente que consume una query, no solo la
  // primera vez que se suscribe. Es lo que arregla que en PRODUCCIÓN (SSR) el
  // logo y el favicon del header no aparecieran en la carga inicial: bajo el
  // adaptador Express↔Fetch (serveFrontend.ts), los queries que se suscriben
  // durante la hidratación NO disparaban su primer fetch por sí solos —quedaban
  // suscritos con la caché vacía, así que `useGetConfigQuery` devolvía `undefined`
  // y el header caía al texto—. Solo se activaban tras una navegación cliente.
  // En dev no se nota porque ahí el primer fetch sí arranca al montar. Con este
  // flag, cada montaje (incluida la hidratación inicial) fuerza el fetch, así que
  // la data está desde el primer render. El costo es revalidar al re-montar, pero
  // con `keepUnusedDataFor` la data cacheada se pinta al instante mientras revalida.
  refetchOnMountOrArgChange: true,
  baseQuery: fetchBaseQuery({
    // En dev, Vite proxya /api → Express :3000; en prod es el mismo origen
    // (monolito híbrido, doc 02): la URL relativa sirve en ambos casos.
    baseUrl: '/api',
    prepareHeaders: async (headers) => {
      // Sesión de Supabase Auth → Bearer JWT. Sin sesión (visitante anónimo o
      // SSR) el request sale sin Authorization y el backend decide qué es público.
      const token = await getAccessToken();
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  // Tags de invalidación disponibles para los slices del Hito 1; los dominios
  // posteriores (sales, inventory, crm, …) agregan los suyos con addTagTypes.
  // 'Purchase'/'Product' faltaban acá pese a que inventoryV1Api.ts
  // (Hito 2) ya los usaba — typecheck del frontend nunca se había corrido.
  tagTypes: [
    'Config',
    'Landing',
    'Catalog',
    'AdminCatalog',
    'Combos',
    'Orders',
    'Me',
    'Purchase',
    'Product',
    'Sale',
    'CommissionPayment',
    'Invoice',
    'Installment',
    'Categories',
    'Templates',
    'Accounts',
    'Movements',
    'Cuadre',
    'ExpenseCategories',
    'Closures',
    'DiscountCode',
    'Contacts',
    'FollowUps',
    'Expense',
    'LoanPayment',
  ],
  endpoints: () => ({}),
});
