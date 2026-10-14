import { baseApi } from './base-api';
import type {
  AdminContactInput,
  AdminContactUpdate,
  Contact,
  Contact360,
  ContactActivity,
  FollowUp,
  FollowUpInput,
  FollowUpUpdate,
} from '@shared/schemas';

// CRM Fase A (Docs/05-Pendientes.md §4): contactos, Ficha 360 y agenda. Sin WhatsApp todavía.
export const crmApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getContacts: builder.query<Contact[], { search?: string; stage?: string } | void>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params && params.search) qs.set('search', params.search);
        if (params && params.stage) qs.set('stage', params.stage);
        const s = qs.toString();
        return `/crm/contacts${s ? `?${s}` : ''}`;
      },
      transformResponse: (response: { items: Contact[] }) => response.items,
      providesTags: ['Contacts'],
    }),
    getContact360: builder.query<Contact360, string>({
      query: (id) => `/crm/contacts/${id}`,
      providesTags: (result, error, id) => [{ type: 'Contacts', id }],
    }),
    createContact: builder.mutation<Contact, AdminContactInput>({
      query: (body) => ({ url: '/crm/contacts', method: 'POST', body }),
      invalidatesTags: ['Contacts'],
    }),
    updateContact: builder.mutation<Contact, { id: string; data: AdminContactUpdate }>({
      query: ({ id, data }) => ({ url: `/crm/contacts/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Contacts', id }, 'Contacts'],
    }),
    addContactActivity: builder.mutation<ContactActivity, { id: string; note: string }>({
      query: ({ id, note }) => ({ url: `/crm/contacts/${id}/activities`, method: 'POST', body: { note } }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Contacts', id }],
    }),
    getFollowUps: builder.query<FollowUp[], { status?: string; upto?: string } | void>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params && params.status) qs.set('status', params.status);
        if (params && params.upto) qs.set('upto', params.upto);
        const s = qs.toString();
        return `/crm/follow-ups${s ? `?${s}` : ''}`;
      },
      transformResponse: (response: { items: FollowUp[] }) => response.items,
      providesTags: ['FollowUps'],
    }),
    createFollowUp: builder.mutation<FollowUp, FollowUpInput>({
      query: (body) => ({ url: '/crm/follow-ups', method: 'POST', body }),
      invalidatesTags: (result, error, arg) => ['FollowUps', { type: 'Contacts', id: arg.contactId }],
    }),
    updateFollowUp: builder.mutation<FollowUp, { id: string; data: FollowUpUpdate }>({
      query: ({ id, data }) => ({ url: `/crm/follow-ups/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (result) =>
        result ? ['FollowUps', { type: 'Contacts', id: result.contactId }] : ['FollowUps'],
    }),
  }),
});

export const {
  useGetContactsQuery,
  useGetContact360Query,
  useCreateContactMutation,
  useUpdateContactMutation,
  useAddContactActivityMutation,
  useGetFollowUpsQuery,
  useCreateFollowUpMutation,
  useUpdateFollowUpMutation,
} = crmApi;
