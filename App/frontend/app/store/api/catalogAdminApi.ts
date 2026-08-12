import { baseApi } from './baseApi';
import type {
  AdminCombo,
  AdminComboInput,
  AdminProduct,
  AdminProductInput,
  AdminTemplate,
  Category,
  TemplateInput,
} from '@shared/schemas';

// Un lote de bodega ya recibido, tal como lo devuelve
// GET /admin/catalog/inventory-lots. Es la unidad a la que se vincula una
// variante del catálogo: en v2 `purchases.code` es único por lote, no hay un
// SKU compartido entre lotes.
export interface InventoryLot {
  code: string;
  productName: string;
  category: string | null;
  lot: string;
  available: number;
  suggestedPrice: number | null;
  linkedTo: string | null;
}

export const catalogAdminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminCatalog: builder.query<AdminProduct[], void>({
      query: () => '/admin/catalog',
      transformResponse: (response: { items: AdminProduct[] }) => response.items,
      providesTags: ['AdminCatalog'],
    }),
    createAdminProduct: builder.mutation<AdminProduct, AdminProductInput>({
      query: (body) => ({
        url: '/admin/catalog',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['AdminCatalog', 'Catalog'],
    }),
    // `AdminProductInput` COMPLETO, no `Partial`: el backend hace
    // `adminProductInputSchema.parse(req.body)` sobre el body entero, así que un
    // parcial se rechaza con 400. Tipado como parcial, ese error solo aparecía en
    // runtime; ahora no compila.
    updateAdminProduct: builder.mutation<AdminProduct, { id: string; data: AdminProductInput }>({
      query: ({ id, data }) => ({
        url: `/admin/catalog/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'AdminCatalog', id },
        'AdminCatalog',
        'Catalog',
      ],
    }),
    deleteAdminProduct: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/catalog/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AdminCatalog', 'Catalog'],
    }),
    reorderAdminCatalog: builder.mutation<void, { items: { id: string; sortOrder: number }[] }>({
      query: (body) => ({
        url: '/admin/catalog/reorder',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['AdminCatalog', 'Catalog'],
    }),
    // ── Plantillas (moldes de variantes) ──
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
      invalidatesTags: ['Templates'],
    }),
    updateTemplate: builder.mutation<AdminTemplate, { id: string; data: TemplateInput }>({
      query: ({ id, data }) => ({
        url: `/admin/catalog/templates/${id}`,
        method: 'PUT',
        body: data,
      }),
      // Cambiar los ejes de un molde cambia las combinaciones de TODOS los
      // productos que lo usan: el catálogo del panel y el público se invalidan.
      invalidatesTags: ['Templates', 'AdminCatalog', 'Catalog'],
    }),
    deleteTemplate: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/catalog/templates/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Templates'],
    }),

    // Lotes de bodega disponibles para vincular a una variante.
    getInventoryLots: builder.query<InventoryLot[], string | undefined>({
      query: (excludeProductId) => ({
        url: '/admin/catalog/inventory-lots',
        params: excludeProductId ? { excludeProductId } : undefined,
      }),
      // Depende de `Purchase`: al recibir un lote en inventario, el buscador de
      // este editor tiene que mostrarlo sin recargar la página.
      providesTags: ['Purchase'],
    }),

    getCategories: builder.query<Category[], void>({
      query: () => '/admin/catalog/categories',
      providesTags: ['Categories'],
    }),
    createCategory: builder.mutation<Category, { name: string; slug: string }>({
      query: (body) => ({
        url: '/admin/catalog/categories',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Categories'],
    }),
    updateCategory: builder.mutation<Category, { id: string; name: string; slug: string }>({
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
  useGetAdminCatalogQuery,
  useCreateAdminProductMutation,
  useUpdateAdminProductMutation,
  useDeleteAdminProductMutation,
  useReorderAdminCatalogMutation,
  useGetTemplatesQuery,
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useDeleteTemplateMutation,
  useGetInventoryLotsQuery,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetAdminCombosQuery,
  useCreateAdminComboMutation,
  useUpdateAdminComboMutation,
  useDeleteAdminComboMutation,
} = catalogAdminApi;
