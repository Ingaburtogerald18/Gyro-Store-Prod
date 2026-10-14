// Config pública también en el HTML del servidor: RTK no tiene datos en SSR y la página salía sin
// logo ni WhatsApp. Se usa el loader como respaldo; en el cliente manda RTK.
import { useMatches } from '@remix-run/react';
import { useAppSelector } from '~/state/hooks';
import { selectDraftLandingConfig, selectPreviewCatalog } from '~/state/slices/builder-slice';
import { selectEditMode } from '~/state/slices/auth-slice';

import type { CatalogProduct, LandingConfig, PublicStorePolicies } from '@shared/schemas';
import { useGetConfigQuery, type StoreConfig } from '~/state/api/session-api';
import { useGetCatalogQuery, useGetLandingConfigQuery } from '~/state/api/storefront-api';

function configFromMatches(matches: ReturnType<typeof useMatches>): StoreConfig | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i].data as { config?: StoreConfig | null } | undefined;
    if (data && typeof data === 'object' && data.config) return data.config;
  }
  return undefined;
}

export function useStoreConfig(): StoreConfig | undefined {
  const { data } = useGetConfigQuery();
  const matches = useMatches();
  return data ?? configFromMatches(matches);
}

/** Pagos, entregas y garantía de Configuración → Atención (sin borradores). */
export function useStorePolicies(): PublicStorePolicies | undefined {
  return useStoreConfig()?.policies;
}

/** Igual que useStoreConfig, para la config de la landing (categorías del
 *  header, carriles, hero). Solo la home la trae en su loader. */
export function useStoreLanding(): LandingConfig | undefined {
  const draft = useAppSelector(selectDraftLandingConfig);
  const editing = useAppSelector(selectEditMode);
  const { data } = useGetLandingConfigQuery();
  const matches = useMatches();
  if (editing && draft) return draft;
  if (data) return data;
  for (let i = matches.length - 1; i >= 0; i--) {
    const d = matches[i].data as { landing?: LandingConfig | null } | undefined;
    if (d && typeof d === 'object' && d.landing) return d.landing;
  }
  return undefined;
}

/** Si la ruta trajo el catálogo en su loader, ese es la fuente; si no, RTK Query. */
export function useStoreCatalog(): CatalogProduct[] {
  const preview = useAppSelector(selectPreviewCatalog);
  const matches = useMatches();
  let fromLoader: CatalogProduct[] | undefined;
  for (let i = matches.length - 1; i >= 0; i--) {
    const d = matches[i].data as { products?: CatalogProduct[] } | undefined;
    if (d && typeof d === 'object' && Array.isArray(d.products)) {
      fromLoader = d.products;
      break;
    }
  }
  const { data } = useGetCatalogQuery(undefined, { skip: Boolean(fromLoader || preview) });
  return preview ?? fromLoader ?? data ?? [];
}
