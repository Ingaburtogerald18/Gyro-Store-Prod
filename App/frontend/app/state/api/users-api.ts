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

  // ── Contacto y pago ──
  // `bank_account` es dato sensible: solo viaja por los endpoints de admin
  // (`/api/admin/users`) y por el del perfil PROPIO (`/api/me/profile`). El
  // directorio que ve el resto del staff (`/api/staff/directory`) no lo trae.
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
   * Entrada SINTÉTICA (no una fila real de `profiles`): un rol reservado por
   * correo para alguien que un admin agregó desde Personal pero que todavía no
   * inició sesión con Microsoft ni una vez. `id` es `pending:<email>`, no un
   * uuid real — no sirve para /suspend, /restore, /profile ni /performance.
   * Se activa sola (y desaparece de acá) en cuanto esa persona entra de
   * verdad. Ver la sección `pending_role_grants` de database/01_schema.sql.
   */
  pending?: boolean;
}

export interface UserPerformance {
  pendingApproval: { count: number; comision: number };
  approvedUnpaid: { count: number; comision: number };
  paid: { count: number; comision: number };
  balance: number;
}

/**
 * Perfil propio (`/api/me/profile`). Es el MISMO shape que `UserProfile` pero
 * sin los campos que solo tienen sentido mirando a otra persona (`isProtected`,
 * `pending`, `last_login`): acá siempre es uno mismo. La cuenta bancaria SÍ
 * viene — es la propia.
 */
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
    /**
     * Directorio para NO-admins (`/api/staff/directory`, requireAnyRole). Mismo
     * tipo que `getUsers` pero el backend nunca manda `bank_account` ni
     * `last_login`, y no incluye invitaciones pendientes. Un vendedor pegándole
     * a `/admin/users` recibe 403 y la lista queda vacía: por eso hay dos.
     */
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
    // El backend valida con `updateProfileSchema` (App/shared/schemas/staff.ts).
    // Un string vacío significa "borrar el dato" y se guarda como NULL; omitir
    // la clave deja el valor como está.
    updateUserProfile: builder.mutation<
      { message: string; data: UserProfile[] },
      {
        id: string;
        name: string;
        phone?: string;
        personal_email?: string;
        /** `null` limpia la cuenta guardada. */
        bank_account?: BankAccount | null;
        /**
         * URL ya subida a R2 por `/api/upload` (carpeta `avatars`). `null` quita
         * la foto; OMITIR la clave la deja como está — no mandarla nunca sería
         * lo mismo que borrarla en cada guardado.
         */
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

    // ── Perfil propio (self-service, cualquier rol) ──
    // Todas invalidan 'Me' para que el avatar y el nombre del header se
    // actualicen sin recargar, y 'Config' para que la lista de Personal (que
    // muestra a esta misma persona) se refresque.
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
    /**
     * Sube la foto propia. `FormData` como body a propósito: `fetchBaseQuery` lo
     * pasa tal cual (no lo serializa a JSON) y deja que el navegador ponga el
     * `Content-Type` con el boundary del multipart — fijarlo a mano rompe la
     * subida.
     */
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
