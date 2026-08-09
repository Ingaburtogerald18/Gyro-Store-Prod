// Códigos de descuento (incentivo por reseña). Crear/listar/activar-desactivar
// es admin-only; validar (preview) es público — lo usa el checkout y la factura
// para dar feedback instantáneo sin gastar un uso del código.
import { baseApi } from './baseApi';

export type DiscountType = 'percent' | 'fixed';

export interface DiscountCode {
  code: string;
  type: DiscountType;
  value: number;
  maxUses: number; // 0 = ilimitado
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  note: string;
  createdAt: string | null;
  createdBy: string;
  redeemedAt: string | null;
  redeemedSource: string | null;
  redeemedLabel: string | null;
  redeemedMethod: string | null;
  redeemedAmount: number | null;
}

// Sin `code`: lo genera la base con la secuencia `GS-DC-N`. La respuesta del
// POST trae el código ya asignado.
export interface NewDiscountCode {
  type: DiscountType;
  value: number;
  maxUses?: number;
  expiresAt?: string;
  /** Se muestra como «Descripción» en el panel; la columna es `note`. */
  note?: string;
}

export interface DiscountCodeValidation {
  ok: true;
  code: string;
  type: DiscountType;
  value: number;
}

export const discountCodesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDiscountCodes: build.query<DiscountCode[], void>({
      query: () => 'discount-codes',
      providesTags: ['DiscountCode'],
    }),
    createDiscountCode: build.mutation<DiscountCode, NewDiscountCode>({
      query: (body) => ({ url: 'discount-codes', method: 'POST', body }),
      invalidatesTags: ['DiscountCode'],
    }),
    setDiscountCodeActive: build.mutation<DiscountCode, { code: string; active: boolean }>({
      query: ({ code, active }) => ({
        url: `discount-codes/${encodeURIComponent(code)}`,
        method: 'PATCH',
        body: { active },
      }),
      invalidatesTags: ['DiscountCode'],
    }),
    // Público: preview de solo lectura (no consume uso). El checkout/factura
    // muestra el mensaje del servidor tal cual si el código no es válido.
    validateDiscountCode: build.mutation<DiscountCodeValidation, string>({
      query: (code) => ({ url: 'discount-codes/validate', method: 'POST', body: { code } }),
    }),
  }),
});

export const {
  useGetDiscountCodesQuery,
  useCreateDiscountCodeMutation,
  useSetDiscountCodeActiveMutation,
  useValidateDiscountCodeMutation,
} = discountCodesApi;
