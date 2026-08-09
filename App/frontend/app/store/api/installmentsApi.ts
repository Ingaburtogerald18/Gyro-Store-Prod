// Cuotas (Hito 3 admin). Contrato exacto de server/routes/installments.ts —
// modelo delgado: agenda el cobro de una venta ya aprobada (ver
// server/services/installments.ts para el shape real de InstallmentPlan).
import { baseApi } from './baseApi';

export interface InstallmentPayment {
  id: string;
  amount: number;
  method: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface InstallmentPlan {
  id: string;
  orderId: string;
  phone: string | null;
  sellerEmail: string | null;
  total: number;
  numCuotas: number;
  firstDue: string;
  status: string;
  amountPaid: number;
  amountPending: number;
  payments: InstallmentPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstallmentPlanInput {
  orderId: string;
  numCuotas: number;
  firstDue: string;
}

export interface RegisterInstallmentPaymentInput {
  amount: number;
  method?: 'efectivo' | 'transferencia' | 'tarjeta';
  note?: string;
}

export interface RegisterPaymentResult {
  ok: boolean;
  amountPaid: number;
  amountPending: number;
  completed: boolean;
}

export const installmentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getInstallments: build.query<InstallmentPlan[], string | void>({
      query: (status) => ({ url: 'installments', params: status ? { status } : undefined }),
      providesTags: ['Installment'],
    }),
    getPendingInstallments: build.query<InstallmentPlan[], void>({
      query: () => 'installments/pending',
      providesTags: ['Installment'],
    }),
    createInstallmentPlan: build.mutation<InstallmentPlan, CreateInstallmentPlanInput>({
      query: (body) => ({ url: 'installments', method: 'POST', body }),
      invalidatesTags: ['Installment', 'Sale'],
    }),
    registerInstallmentPayment: build.mutation<
      RegisterPaymentResult,
      { id: string; body: RegisterInstallmentPaymentInput }
    >({
      query: ({ id, body }) => ({ url: `installments/${id}/payments`, method: 'POST', body }),
      invalidatesTags: ['Installment'],
    }),
    cancelInstallmentPlan: build.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `installments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Installment'],
    }),
  }),
});

export const {
  useGetInstallmentsQuery,
  useGetPendingInstallmentsQuery,
  useCreateInstallmentPlanMutation,
  useRegisterInstallmentPaymentMutation,
  useCancelInstallmentPlanMutation,
} = installmentsApi;
