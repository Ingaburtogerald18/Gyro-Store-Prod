// Pedidos web en el panel (admin + vendedor): la lista que entra por el checkout
// y el cambio de estado que ve el cliente en su página de seguimiento.
import type { PublicOrderStatus } from '@shared/schemas';
import { baseApi } from './baseApi';
import type { PublicOrderLine } from './storefrontApi';

export interface AdminPublicOrder {
  id: string;
  status: PublicOrderStatus;
  customerName: string | null;
  phone: string | null;
  deliveryMethod: 'retiro' | 'envio' | null;
  address: string | null;
  locationUrl: string | null;
  note: string | null;
  total: number;
  discountCode: string | null;
  codeDiscount: number;
  createdAt: string;
  items: PublicOrderLine[];
}

export const publicOrdersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminPublicOrders: build.query<AdminPublicOrder[], void>({
      query: () => 'orders/admin',
      transformResponse: (response: { items: AdminPublicOrder[] }) => response.items,
      providesTags: ['Orders'],
    }),
    updatePublicOrderStatus: build.mutation<
      { id: string; status: PublicOrderStatus },
      { id: string; status: PublicOrderStatus }
    >({
      query: ({ id, status }) => ({ url: `orders/admin/${id}/status`, method: 'PATCH', body: { status } }),
      // Actualiza la fila en el acto (el panel no parpadea ni recarga la lista
      // entera) y deshace el cambio si el servidor lo rechaza.
      async onQueryStarted({ id, status }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          publicOrdersApi.util.updateQueryData('getAdminPublicOrders', undefined, (draft) => {
            const row = draft.find((o) => o.id === id);
            if (row) row.status = status;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Orders' as const, id }],
    }),
  }),
});

export const { useGetAdminPublicOrdersQuery, useUpdatePublicOrderStatusMutation } = publicOrdersApi;
