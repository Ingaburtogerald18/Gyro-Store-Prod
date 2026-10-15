// Datos públicos para los loaders. En producción Express los pasa en el contexto (serve-frontend.ts) y
// se leen en el mismo proceso; en dev no hay contexto y se piden a /api, que Vite reenvía al backend.
import type { AppLoadContext } from '@remix-run/node';
import type { CatalogDetail, CatalogProduct, Combo, LandingConfig } from '@shared/schemas';
import type { StoreReader } from '@shared/store-reader';
import type { StoreConfig } from '~/state/api/session-api';
import { countByCategory } from '~/lib/catalog-query';

export function storeReader(context: AppLoadContext | undefined, request: Request): StoreReader<StoreConfig> {
  const inProcess = (context as { store?: StoreReader<StoreConfig> } | undefined)?.store;
  return inProcess ?? httpReader(new URL(request.url).origin);
}

/** Productos por categoría con lo que ya se leyó; null si falta el catálogo o la config. */
export function categoryCountsOf(products: CatalogProduct[] | null, config: StoreConfig | null) {
  return products && config ? countByCategory(products, config.categories ?? []) : null;
}

/** Lo que header y pie necesitan en cualquier página. Todo accesorio: si algo falla, sale null. */
export async function readStoreFrame(store: StoreReader<StoreConfig>) {
  const [config, landing, catalog] = await Promise.all([
    store.config().catch(() => null),
    store.landing().catch(() => null),
    store.catalog().catch(() => null),
  ]);
  return { config, landing, categoryCounts: categoryCountsOf(catalog, config) };
}

function httpReader(origin: string): StoreReader<StoreConfig> {
  async function get<T>(path: string): Promise<T | null> {
    const res = await fetch(`${origin}/api${path}`, { signal: AbortSignal.timeout(8_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET /api${path} respondió ${res.status}`);
    return (await res.json()) as T;
  }
  async function required<T>(path: string): Promise<T> {
    const data = await get<T>(path);
    if (data === null) throw new Error(`GET /api${path} respondió 404`);
    return data;
  }
  return {
    catalog: async () => (await required<{ items: CatalogProduct[] }>('/catalog')).items,
    product: (id) => get<CatalogDetail>(`/catalog/${encodeURIComponent(id)}`),
    combos: async () => (await required<{ items: Combo[] }>('/combos')).items,
    combo: (id) => get<Combo>(`/combos/${encodeURIComponent(id)}`),
    config: () => required<StoreConfig>('/config'),
    landing: () => required<LandingConfig>('/landing-config'),
  };
}
