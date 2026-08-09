import { baseApi } from './baseApi';
import type {
  Account,
  AccountMovement,
  RegisterMovementInput,
  RegisterTransferInput,
  CashClosure,
  CreateCashClosureInput,
  ExpenseCategories,
} from '@shared/schemas';
import type { AccountBalance } from '../../../../server/services/caja';
import type { FinancialKPIs } from '../../../../server/services/reports';
import type { DailySummary } from '../../../../server/services/dailySummary';

// Dashboard de cuadre (cierre financiero): saldos por cuenta + KPIs del día.
// Vive acá porque es el mismo dominio que caja — las mutaciones de movimientos
// invalidan el tag 'Cuadre' que este query provee.
export interface CuadreDashboard {
  ventasPendientes: number;
  saldosCuentas: AccountBalance[];
  kpisHoy: FinancialKPIs;
}

export const cajaApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCuadre: builder.query<CuadreDashboard, void>({
      query: () => '/cuadre',
      providesTags: ['Cuadre'],
    }),

    // Qué se vendió hoy (por método) + lo que se movió en caja. Comparte el tag
    // 'Cuadre' para refrescarse cuando se registra un movimiento o un cierre.
    getDailySummary: builder.query<DailySummary, void>({
      query: () => '/caja/resumen-dia',
      providesTags: ['Cuadre'],
    }),

    getAccounts: builder.query<Account[], void>({
      query: () => '/caja/accounts',
      providesTags: ['Accounts'],
    }),

    createAccount: builder.mutation<
      Account,
      { nombre: string; tipo: 'banco' | 'efectivo'; moneda?: string; saldo_inicial?: number }
    >({
      query: (body) => ({
        url: '/caja/accounts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Accounts', 'Cuadre'],
    }),

    toggleAccountStatus: builder.mutation<Account, { id: string; activo: boolean }>({
      query: ({ id, activo }) => ({
        url: `/caja/accounts/${id}/toggle`,
        method: 'PATCH',
        body: { activo },
      }),
      invalidatesTags: ['Accounts', 'Cuadre'],
    }),

    getMovements: builder.query<AccountMovement[], { accountId?: string; startDate?: string; endDate?: string } | void>({
      query: (params) => {
        let url = '/caja/movimientos';
        if (params) {
          const qs = new URLSearchParams();
          if (params.accountId) qs.append('accountId', params.accountId);
          if (params.startDate) qs.append('startDate', params.startDate);
          if (params.endDate) qs.append('endDate', params.endDate);
          const q = qs.toString();
          if (q) url += `?${q}`;
        }
        return url;
      },
      providesTags: ['Movements'],
    }),

    registerMovement: builder.mutation<AccountMovement, RegisterMovementInput>({
      query: (body) => ({
        url: '/caja/movimientos',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Movements', 'Cuadre', 'Accounts'],
    }),

    // Traspaso entre cuentas: el backend devuelve las dos patas del movimiento.
    registerTransfer: builder.mutation<AccountMovement[], RegisterTransferInput>({
      query: (body) => ({
        url: '/caja/transferencias',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Movements', 'Cuadre', 'Accounts'],
    }),

    getExpenseCategories: builder.query<ExpenseCategories, void>({
      query: () => '/caja/categorias-gasto',
      providesTags: ['ExpenseCategories'],
    }),

    updateExpenseCategories: builder.mutation<ExpenseCategories, ExpenseCategories>({
      query: (body) => ({
        url: '/caja/categorias-gasto',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['ExpenseCategories'],
    }),

    getClosures: builder.query<CashClosure[], { accountId?: string } | void>({
      query: (params) => {
        let url = '/caja/cierres';
        if (params?.accountId) url += `?accountId=${params.accountId}`;
        return url;
      },
      providesTags: ['Closures'],
    }),

    // Cerrar el día registra un ajuste si hay descuadre → invalida saldos y libro.
    createClosure: builder.mutation<CashClosure, CreateCashClosureInput>({
      query: (body) => ({
        url: '/caja/cierres',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Closures', 'Movements', 'Cuadre', 'Accounts'],
    }),
  }),
});

export const {
  useGetCuadreQuery,
  useGetDailySummaryQuery,
  useGetAccountsQuery,
  useCreateAccountMutation,
  useToggleAccountStatusMutation,
  useGetMovementsQuery,
  useRegisterMovementMutation,
  useRegisterTransferMutation,
  useGetExpenseCategoriesQuery,
  useUpdateExpenseCategoriesMutation,
  useGetClosuresQuery,
  useCreateClosureMutation,
} = cajaApi;
