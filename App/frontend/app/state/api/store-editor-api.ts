// Modo edición: bloqueo, latido y borrador compartido en el servidor
// (server/modules/store-editor/store-editor-routes.ts). Publicar actualiza la portada en caché.
import type {
  EditorEntry,
  EditorLockHolder,
  EditorProduct,
  LandingConfig,
  StoreDraftInput,
  StorePublishInput,
  StoreVersion,
} from '@shared/schemas';
import { getAccessToken } from '~/lib/session.client';
import { baseApi } from './base-api';
import { storefrontApi } from './storefront-api';

const BASE = 'admin/store-editor';

export const storeEditorApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    enterStoreEditor: build.mutation<EditorEntry, string>({
      query: (session) => ({ url: `${BASE}/enter`, method: 'POST', body: { session } }),
    }),
    getEditorProducts: build.query<EditorProduct[], void>({
      query: () => `${BASE}/products`,
      providesTags: ['Catalog'],
    }),
    sendEditorHeartbeat: build.mutation<void, { session: string; active: boolean }>({
      query: (body) => ({ url: `${BASE}/heartbeat`, method: 'POST', body }),
    }),
    saveStoreDraft: build.mutation<{ changedAt: string | null }, StoreDraftInput>({
      query: (body) => ({ url: `${BASE}/draft`, method: 'PUT', body }),
    }),
    discardStoreDraft: build.mutation<void, string>({
      query: (session) => ({ url: `${BASE}/discard`, method: 'POST', body: { session } }),
    }),
    publishStoreDraft: build.mutation<LandingConfig, StorePublishInput>({
      query: (body) => ({ url: `${BASE}/publish`, method: 'POST', body }),
      invalidatesTags: ['Catalog', 'Combos'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(storefrontApi.util.updateQueryData('getLandingConfig', undefined, () => data));
        } catch {
          // El error lo muestra el editor; la caché queda como estaba.
        }
      },
    }),
    getStoreVersions: build.query<StoreVersion[], void>({
      query: () => `${BASE}/versions`,
    }),
    restoreStoreVersion: build.mutation<EditorEntry, { id: string; session: string; discardDraft: boolean }>({
      query: ({ id, ...body }) => ({ url: `${BASE}/versions/${id}/restore`, method: 'POST', body }),
      invalidatesTags: ['Catalog', 'Combos'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(storefrontApi.util.updateQueryData('getLandingConfig', undefined, () => data.published));
        } catch {
          // El error lo muestra el editor.
        }
      },
    }),
  }),
});

export const {
  useEnterStoreEditorMutation,
  useGetEditorProductsQuery,
  useSendEditorHeartbeatMutation,
  useSaveStoreDraftMutation,
  useDiscardStoreDraftMutation,
  usePublishStoreDraftMutation,
  useGetStoreVersionsQuery,
  useRestoreStoreVersionMutation,
} = storeEditorApi;

/** Quién tiene el editor, si el servidor rechazó la entrada por eso. */
export function editorHolderOf(err: unknown): EditorLockHolder | null {
  const holder = (err as { data?: { holder?: EditorLockHolder } })?.data?.holder;
  return holder?.name ? holder : null;
}

export const isEditorLockLost = (err: unknown) => (err as { status?: unknown })?.status === 409;

let lastToken: string | null = null;

/** Se llama en cada latido: al cerrar la pestaña no hay tiempo de pedir el token. */
export async function refreshEditorToken() {
  lastToken = (await getAccessToken()) ?? lastToken;
}

/**
 * Suelta el bloqueo con `keepalive`, que sobrevive al cierre de la pestaña, y
 * de paso guarda el último cambio que faltaba.
 */
export function releaseStoreEditor(session: string, draft: Omit<StoreDraftInput, 'session'> | null) {
  if (!lastToken) return;
  const send = (body: object) =>
    fetch(`/api/${BASE}/release`, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${lastToken}` },
      body: JSON.stringify(body),
    });
  const withDraft = draft ? JSON.stringify({ session, draft }) : '';
  // keepalive admite hasta 64 KB: si el borrador no entra, se suelta sin él.
  if (withDraft && withDraft.length < 60_000) {
    send({ session, draft }).catch(() => send({ session }).catch(() => {}));
  } else {
    send({ session }).catch(() => {});
  }
}
