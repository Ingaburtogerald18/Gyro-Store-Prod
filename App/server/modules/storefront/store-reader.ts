// Lo que ve la tienda pública, guardado 60 s en memoria. Lo usan las rutas públicas de /api y los
// loaders de Remix; cualquier escritura del panel lo borra (clearMemos en index.ts).
import { z } from 'zod';
import type { StoreReader } from '../../../shared/store-reader';
import { findByDetailParam, parseDetailParam, slugify, uniqueSlugs } from '../../../shared/detail-slug';
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
// Mismo nombre que muestra la tienda para un combo sin nombre («Combo especial»).
const COMBO_SLUG = 'combo-especial';

export function readCatalog() {
  return memo.get('catalog', async () => {
    const rows = await listPublishedCatalog();
    // Una sola consulta a bodega para todo el listado, en vez de una por producto.
    const [lots, offers] = await Promise.all([getLotsByCodes(rows.flatMap(collectMappedCodes)), getActiveOffers()]);
    const products = rows.map((row) => toCatalogProduct(row, lots, offers.get(row.id)));
    // El slug se decide con todo el catálogo a la vista: así dos con el mismo nombre no comparten URL.
    const slugs = uniqueSlugs(products, 'producto');
    return products.map((product) => ({ ...product, slug: slugs.get(product.id)! }));
  });
}

// `ref`: el slug de la URL o el id (enlaces viejos). Un id mal formado es «no existe» sin tocar la base:
// si no, sale como error 500 de Postgres.
export async function readProduct(ref: string) {
  const parsed = parseDetailParam(ref);
  const catalog = readCatalog();
  // Con el id, detalle y catálogo se leen a la vez; con el slug, el catálogo dice cuál es.
  const id = 'id' in parsed ? parsed.id : findByDetailParam(await catalog, ref)?.id;
  if (!id || !isUuid(id)) return null;
  const [detail, products] = await Promise.all([
    memo.get(`product:${id}`, async () => {
      const item = await getPublishedCatalogItem(id);
      if (!item) return null;
      const [lots, offers] = await Promise.all([getLotsByCodes(collectMappedCodes(item)), getActiveOffers()]);
      return toCatalogDetail(item, lots, offers.get(item.id));
    }),
    catalog,
  ]);
  if (!detail) return null;
  return { ...detail, slug: products.find((p) => p.id === detail.id)?.slug ?? (slugify(detail.name) || 'producto') };
}

export function readCombos() {
  return memo.get('combos', async () => {
    const combos = await listPublishedCombos();
    const slugs = uniqueSlugs(combos, COMBO_SLUG);
    return combos.map((combo) => ({ ...combo, slug: slugs.get(combo.id)! }));
  });
}

export async function readCombo(ref: string) {
  const parsed = parseDetailParam(ref);
  const list = readCombos();
  const id = 'id' in parsed ? parsed.id : findByDetailParam(await list, ref)?.id;
  if (!id || !isUuid(id)) return null;
  const [combo, combos] = await Promise.all([memo.get(`combo:${id}`, () => getPublishedCombo(id)), list]);
  if (!combo) return null;
  return { ...combo, slug: combos.find((c) => c.id === combo.id)?.slug ?? (slugify(combo.name ?? '') || COMBO_SLUG) };
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
