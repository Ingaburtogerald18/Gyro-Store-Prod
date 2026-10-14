// Plantillas, categorías y combos del panel (vistas de Inventario).
import { baseApi } from './base-api';
import type {
  AdminCombo,
  AdminComboInput,
  AdminTemplate,
  Category,
  TemplateInput,
} from '@shared/schemas';

export const catalogAdminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Plantillas (una por modelo) ──
    getTemplates: builder.query<AdminTemplate[], void>({
      query: () => '/admin/catalog/templates',
      providesTags: ['Templates'],
    }),
    createTemplate: builder.mutation<AdminTemplate, TemplateInput>({
      query: (body) => ({
        url: '/admin/catalog/templates',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          const { data: template } = await queryFulfilled;
          dispatch(
            catalogAdminApi.util.updateQueryData('getTemplates', undefined, (templates) => {
              if (!templates.some((item) => item.id === template.id)) templates.push(template);
            }),
          );
        } catch {
          // El formulario conserva lo escrito y muestra el error de la creación.
        }
      },
      invalidatesTags: ['Templates'],
    }),
    updateTemplate: builder.mutation<AdminTemplate, { id: string; data: TemplateInput }>({
      query: ({ id, data }) => ({
        url: `/admin/catalog/templates/${id}`,
        method: 'PUT',
        body: data,
      }),
      // Nombre, descripción y variantes se ven en la tienda y en el modo edición.
      invalidatesTags: ['Templates', 'Catalog'],
    }),
    deleteTemplate: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/catalog/templates/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Templates'],
    }),

    getCategories: builder.query<Category[], void>({
      query: () => '/admin/catalog/categories',
      providesTags: ['Categories'],
    }),
    createCategory: builder.mutation<Category, { name: string; slug: string; icon?: string }>({
      query: (body) => ({
        url: '/admin/catalog/categories',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Categories'],
    }),
    updateCategory: builder.mutation<
      Category,
      { id: string; name: string; slug: string; icon?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/catalog/categories/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Categories'],
    }),
    deleteCategory: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/catalog/categories/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Categories'],
    }),

    // ── Combos (paquetes) ──
    getAdminCombos: builder.query<AdminCombo[], void>({
      query: () => '/admin/combos',
      transformResponse: (response: { items: AdminCombo[] }) => response.items,
      providesTags: ['Combos'],
    }),
    createAdminCombo: builder.mutation<AdminCombo, AdminComboInput>({
      query: (body) => ({
        url: '/admin/combos',
        method: 'POST',
        body,
      }),
      // `Catalog` porque el storefront público también lista combos.
      invalidatesTags: ['Combos', 'Catalog'],
    }),
    updateAdminCombo: builder.mutation<AdminCombo, { id: string; data: AdminComboInput }>({
      query: ({ id, data }) => ({
        url: `/admin/combos/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Combos', 'Catalog'],
    }),
    deleteAdminCombo: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/combos/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Combos', 'Catalog'],
    }),
  }),
});

export const {
  useGetTemplatesQuery,
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useDeleteTemplateMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetAdminCombosQuery,
  useCreateAdminComboMutation,
  useUpdateAdminComboMutation,
  useDeleteAdminComboMutation,
} = catalogAdminApi;
