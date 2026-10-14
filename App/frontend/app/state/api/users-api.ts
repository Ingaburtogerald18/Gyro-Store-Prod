import { baseApi } from './base-api';
import type { BankAccount } from '@shared/schemas';

export type { BankAccount };

export type AppRole = 'global_admin' | 'admin' | 'seller' | 'cashier' | 'logistics_admin' | 'logistics_customer';

// Shape de `GET /api/admin/users` (requireAdmin, `select('*')` sobre `profiles`).
// Los campos nullable lo son de verdad: la columna existe pero puede estar vacía.
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: AppRole[];
  status: string;
  deleted_at: string | null;
  created_at: string;
  avatar_url?: string | null;

  // ── Contacto y pago ── `bank_account` solo viaja por los endpoints de admin y del perfil propio.
  phone?: string | null;
  personal_email?: string | null;
  /** Objeto jsonb `{ bank, currency, number }`, o null si no cargó cuenta. */
  bank_account?: BankAccount | null;

  /** Última conexión. La escribe `middleware/auth.ts` con throttle de 15 min. */
  last_login?: string | null;

  /**
   * Lo calcula el backend contra `config.protectedEmail`. Solo sirve para
   * ocultar acciones en el UI; la denegación real vive en `modules/users/admin-users-routes.ts`.
   */
  isProtected?: boolean;
  /**
   * Fila sintética: rol reservado para alguien que todavía no entró. `id` es `pending:<email>`, no un
   * uuid: no sirve para suspender ni editar. Desaparece con su primer login.
   */
  pending?: boolean;
}

export interface UserPerformance {
  pendingApproval: { count: number; comision: number };
  approvedUnpaid: { count: number; comision: number };
  paid: { count: number; comision: number };
  balance: number;
}

/** Perfil propio: como `UserProfile` sin los campos de mirar a otra persona; con la cuenta bancaria. */
export type MyProfile = Pick<
  UserProfile,
  | 'id'
  | 'email'
  | 'name'
  | 'roles'
  | 'status'
  | 'deleted_at'
  | 'created_at'
  | 'avatar_url'
  | 'phone'
  | 'personal_email'
  | 'bank_account'
>;

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<UserProfile[], void>({
      query: () => '/admin/users',
      providesTags: ['Config'], // Reuse Config tag for now, or we can add 'Users' later
    }),
    /** Directorio para no-admins: sin cuenta bancaria, last_login ni invitaciones. /admin/users da 403. */
    getStaffDirectory: builder.query<UserProfile[], void>({
      query: () => '/staff/directory',
      providesTags: ['Config'],
    }),
    getUserPerformance: builder.query<UserPerformance, string>({
      query: (id) => `/admin/users/${encodeURIComponent(id)}/performance`,
    }),
    updateUserRoles: builder.mutation<UserProfile, { email: string; roles: AppRole[] }>({
      query: ({ email, roles }) => ({
        url: `/admin/users/${encodeURIComponent(email)}/roles`,
        method: 'PATCH',
        body: { roles },
      }),
      invalidatesTags: ['Config'],
    }),
    createUser: builder.mutation<UserProfile, { email: string; name: string; roles: AppRole[] }>({
      query: (body) => ({
        url: '/admin/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Config'],
    }),
    deleteUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/users/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Config'],
    }),
    // Cancela una invitación (rol reservado) que todavía no se activó.
    deletePendingInvite: builder.mutation<void, string>({
      query: (email) => ({
        url: `/admin/users/pending/${encodeURIComponent(email)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Config'],
    }),
    suspendUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/users/${encodeURIComponent(id)}/suspend`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Config'],
    }),
    restoreUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/users/${encodeURIComponent(id)}/restore`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Config'],
    }),
    // Vacío significa «borrar el dato» (NULL); omitir la clave lo deja como está.
    updateUserProfile: builder.mutation<
      { message: string; data: UserProfile[] },
      {
        id: string;
        name: string;
        phone?: string;
        personal_email?: string;
        /** `null` limpia la cuenta guardada. */
        bank_account?: BankAccount | null;
        /** URL ya subida a R2. `null` la quita; omitir la clave la deja. */
        avatar_url?: string | null;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/users/${encodeURIComponent(id)}/profile`,
        method: 'PATCH',
        body,
      }),
      // 'Me' además de 'Config': el admin puede estar editándose a sí mismo, y
      // ahí el nombre/foto del header salen de `/auth/me`.
      invalidatesTags: ['Config', 'Me'],
    }),

    // ── Perfil propio ── Invalidan 'Me' (header) y 'Config' (la lista de Personal).
    getMyProfile: builder.query<MyProfile, void>({
      query: () => '/me/profile',
      providesTags: ['Me'],
    }),
    updateMyProfile: builder.mutation<
      { message: string; data: MyProfile },
      {
        name: string;
        phone?: string;
        personal_email?: string;
        bank_account?: BankAccount | null;
      }
    >({
      query: (body) => ({
        url: '/me/profile',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Me', 'Config'],
    }),
    /** FormData tal cual: el navegador pone el Content-Type con el boundary; fijarlo a mano rompe la subida. */
    uploadMyAvatar: builder.mutation<{ avatar_url: string }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return { url: '/me/avatar', method: 'POST', body };
      },
      invalidatesTags: ['Me', 'Config'],
    }),
    deleteMyAvatar: builder.mutation<{ avatar_url: null }, void>({
      query: () => ({ url: '/me/avatar', method: 'DELETE' }),
      invalidatesTags: ['Me', 'Config'],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetStaffDirectoryQuery,
  useGetUserPerformanceQuery,
  useUpdateUserRolesMutation,
  useCreateUserMutation,
  useDeleteUserMutation,
  useDeletePendingInviteMutation,
  useSuspendUserMutation,
  useRestoreUserMutation,
  useUpdateUserProfileMutation,
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useUploadMyAvatarMutation,
  useDeleteMyAvatarMutation,
} = usersApi;
