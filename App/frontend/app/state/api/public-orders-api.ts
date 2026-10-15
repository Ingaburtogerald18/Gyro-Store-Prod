// Pedidos web en el panel (admin + vendedor): la lista que entra por el checkout
// y el cambio de estado que ve el cliente en su página de seguimiento.
import type { PublicOrderOperation, PublicOrderStatus, StoredDeliveryMethod } from '@shared/schemas';
import { baseApi } from './base-api';
import type { PublicOrderLine } from './storefront-api';

export interface AdminPublicOrder {
  id: string;
  status: PublicOrderStatus;
  customerName: string | null;
  phone: string | null;
  deliveryMethod: StoredDeliveryMethod | null;
  address: string | null;
  locationUrl: string | null;
  note: string | null;
  total: number;
  discountCode: string | null;
  codeDiscount: number;
  createdAt: string;
  items: PublicOrderLine[];
  /** Venta en que se convirtió, o null. */
  saleId?: string | null;
  /** Pagos, transporte y recepción (solo panel). */
  operation: PublicOrderOperation;
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
    // Pagos, transporte y recepción: la fila se actualiza con lo que devolvió el servidor.
    updatePublicOrderOperation: build.mutation<PublicOrderOperation, { id: string; operation: PublicOrderOperation }>({
      query: ({ id, operation }) => ({ url: `orders/admin/${id}/operation`, method: 'PATCH', body: operation }),
      transformResponse: (response: { operation: PublicOrderOperation }) => response.operation,
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            publicOrdersApi.util.updateQueryData('getAdminPublicOrders', undefined, (draft) => {
              const row = draft.find((o) => o.id === id);
              if (row) row.operation = data;
            }),
          );
        } catch {
          // El formulario muestra el error y conserva lo escrito.
        }
      },
    }),
    // Crea una venta pendiente con el stock que el pedido ya tenía apartado.
    convertPublicOrderToSale: build.mutation<
      { saleId: string; newlyReserved: number },
      { id: string; sellerId?: string }
    >({
      query: ({ id, sellerId }) => ({
        url: `orders/admin/${id}/convert-to-sale`,
        method: 'POST',
        body: sellerId ? { sellerId } : {},
      }),
      invalidatesTags: ['Orders', 'Sale', 'Purchase', 'Product'],
    }),
  }),
});

export const {
  useGetAdminPublicOrdersQuery,
  useUpdatePublicOrderStatusMutation,
  useUpdatePublicOrderOperationMutation,
  useConvertPublicOrderToSaleMutation,
} = publicOrdersApi;
