// Lo que ve la tienda pública, guardado 60 s en memoria. Lo usan las rutas públicas de /api y los
// loaders de Remix; cualquier escritura del panel lo borra (clearMemos en index.ts).
import { z } from 'zod';
import type { StoreReader } from '../../../shared/store-reader';
import { toPublicPolicies } from '../../../shared/schemas';
import { createMemo } from '../../utils/memo-cache';
import { logger } from '../../utils/logger';
import { getPublishedCatalogItem, listPublishedCatalog } from '../catalog/catalog';
import { collectMappedCodes, toCatalogDetail, toCatalogProduct } from '../catalog/catalog-presenter';
import { getActiveOffers } from '../catalog/offers';
import { listCategories } from '../catalog/categories';
import { getLotsByCodes } from '../inventory/inventory-links';
import { getPublishedCombo, listPublishedCombos } from '../combos/combos';
import { getPublicConfig } from '../settings/public-config';
import { getBusinessInfo, getFinancialConfig, getImageResources, getStorePolicies } from '../settings/app-config';
import { getLandingConfig } from '../store-editor/landing';

const memo = createMemo(60_000);
const isUuid = (id: string) => z.uuid().safeParse(id).success;

export function readCatalog() {
  return memo.get('catalog', async () => {
    const rows = await listPublishedCatalog();
    // Una sola consulta a bodega para todo el listado, en vez de una por producto.
    const [lots, offers] = await Promise.all([getLotsByCodes(rows.flatMap(collectMappedCodes)), getActiveOffers()]);
    return rows.map((row) => toCatalogProduct(row, lots, offers.get(row.id)));
  });
}

// Un id mal formado es «no existe» sin tocar la base: si no, sale como error 500 de Postgres.
export function readProduct(id: string) {
  if (!isUuid(id)) return Promise.resolve(null);
  return memo.get(`product:${id}`, async () => {
    const item = await getPublishedCatalogItem(id);
    if (!item) return null;
    const [lots, offers] = await Promise.all([getLotsByCodes(collectMappedCodes(item)), getActiveOffers()]);
    return toCatalogDetail(item, lots, offers.get(item.id));
  });
}

export function readCombos() {
  return memo.get('combos', listPublishedCombos);
}

export function readCombo(id: string) {
  if (!isUuid(id)) return Promise.resolve(null);
  return memo.get(`combo:${id}`, () => getPublishedCombo(id));
}

// Lo editado en el panel (`business`, `financial`) pisa lo que viene del entorno. De las políticas
// sale solo lo publicado: un borrador nunca llega a la tienda.
export function readConfig() {
  return memo.get('config', async () => {
    const [images, categories, business, financial, policies] = await Promise.all([
      getImageResources(),
      listCategories(),
      getBusinessInfo(),
      getFinancialConfig(),
      getStorePolicies(),
    ]);
    return {
      ...getPublicConfig(),
      ...business,
      exchangeRate: financial.exchangeRate,
      categories,
      images,
      policies: toPublicPolicies(policies),
    };
  });
}

type PublicConfig = Awaited<ReturnType<typeof readConfig>>;

// Para Remix: con tope de tiempo, así una base lenta da una página de error en vez de una que no
// termina de cargar, y con registro, porque el loader convierte el error en una página 503.
function guarded<A extends unknown[], T>(name: string, read: (...args: A) => Promise<T>) {
  return (...args: A): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name}: sin respuesta en 8 s`)), 8_000);
    });
    return Promise.race([read(...args), timeout])
      .catch((err: unknown) => {
        logger.error(`[tienda] No se pudo leer ${name}`, { error: err instanceof Error ? err.message : String(err) });
        throw err;
      })
      .finally(() => clearTimeout(timer));
  };
}

export const storeReader: StoreReader<PublicConfig> = {
  catalog: guarded('el catálogo', readCatalog),
  product: guarded('el producto', readProduct),
  combos: guarded('los combos', readCombos),
  combo: guarded('el combo', readCombo),
  config: guarded('la configuración', readConfig),
  landing: guarded('la portada', getLandingConfig),
};
