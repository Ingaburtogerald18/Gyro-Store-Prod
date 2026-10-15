// Config pública desde el loader: así sale en el HTML del servidor y el visitante no la vuelve a pedir.
// El personal además la pide a /api, para ver al instante lo que guarda en el panel o en el modo edición.
import { useMemo } from 'react';
import { useMatches } from '@remix-run/react';
import { useAppSelector } from '~/state/hooks';
import { selectDraftLandingConfig, selectPreviewCatalog } from '~/state/slices/builder-slice';
import { selectEditMode, selectIsStaff } from '~/state/slices/auth-slice';

import type { CatalogProduct, LandingConfig, PublicStorePolicies } from '@shared/schemas';
import { useGetConfigQuery, type StoreConfig } from '~/state/api/session-api';
import { useGetCatalogQuery, useGetLandingConfigQuery } from '~/state/api/storefront-api';
import { countByCategory } from '~/lib/catalog-query';

function configFromMatches(matches: ReturnType<typeof useMatches>): StoreConfig | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i].data as { config?: StoreConfig | null } | undefined;
    if (data && typeof data === 'object' && data.config) return data.config;
  }
  return undefined;
}

export function useStoreConfig(): StoreConfig | undefined {
  const fromLoader = configFromMatches(useMatches());
  const isStaff = useAppSelector(selectIsStaff);
  const { data } = useGetConfigQuery(undefined, { skip: Boolean(fromLoader) && !isStaff });
  return data ?? fromLoader;
}

/** Pagos, entregas y garantía de Configuración → Atención (sin borradores). */
export function useStorePolicies(): PublicStorePolicies | undefined {
  return useStoreConfig()?.policies;
}

function landingFromMatches(matches: ReturnType<typeof useMatches>): LandingConfig | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i].data as { landing?: LandingConfig | null } | undefined;
    if (data && typeof data === 'object' && data.landing) return data.landing;
  }
  return undefined;
}

/** Igual que useStoreConfig, para la config de la landing (categorías del header, carriles, hero). */
export function useStoreLanding(): LandingConfig | undefined {
  const draft = useAppSelector(selectDraftLandingConfig);
  const editing = useAppSelector(selectEditMode);
  const fromLoader = landingFromMatches(useMatches());
  const isStaff = useAppSelector(selectIsStaff);
  const { data } = useGetLandingConfigQuery(undefined, { skip: Boolean(fromLoader) && !isStaff });
  if (editing && draft) return draft;
  return data ?? fromLoader;
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

/** Productos por categoría para header, menú y pie. Las páginas los mandan ya contados; la portada y la
 *  vista previa del editor traen el catálogo y se cuentan acá. Sin datos, undefined: se muestran todas. */
export function useCategoryCounts(): Record<string, number> | undefined {
  const preview = useAppSelector(selectPreviewCatalog);
  const categories = useStoreConfig()?.categories;
  const matches = useMatches();
  return useMemo(() => {
    if (preview) return countByCategory(preview, categories ?? []);
    for (let i = matches.length - 1; i >= 0; i--) {
      const d = matches[i].data as { categoryCounts?: Record<string, number> | null; products?: CatalogProduct[] } | undefined;
      if (!d || typeof d !== 'object') continue;
      if (d.categoryCounts) return d.categoryCounts;
      if (Array.isArray(d.products)) return countByCategory(d.products, categories ?? []);
    }
    return undefined;
  }, [preview, categories, matches]);
}
