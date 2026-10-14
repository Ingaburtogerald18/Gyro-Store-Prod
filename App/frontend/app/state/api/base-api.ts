import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getAccessToken } from '~/lib/supabase.client';

export const baseApi = createApi({
  reducerPath: 'api',
  keepUnusedDataFor: 60,
  // Revalida al montar; se conserva la política usada en producción.
  refetchOnMountOrArgChange: true,
  baseQuery: fetchBaseQuery({
    // En dev, Vite proxya /api → Express :3000; en prod es el mismo origen
    // (monolito, Docs/02-Arquitectura.md): la URL relativa sirve en ambos casos.
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
  // Tags de invalidación; cada dominio agrega los suyos con addTagTypes.
  tagTypes: [
    'Config',
    'Landing',
    'Catalog',
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
    'DiscountCode',
    'Contacts',
    'FollowUps',
    'Expense',
    'LoanPayment',
  ],
  endpoints: () => ({}),
});
