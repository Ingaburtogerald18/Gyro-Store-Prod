// Versiones de la tienda (migración 0030): cada «Publicar» guarda cómo quedó la
// portada y la presentación de los productos. Se guardan las últimas 5.
import { db } from '../../core/supabase';
import { logger } from '../../utils/logger';
import { firstOfEmbed } from '../../utils/first-of-embed';
import { NotFoundError } from '../../utils/http-error';
import {
  landingConfigSchema,
  type LandingConfig,
  type StoreDraftProducts,
  type StoreVersion,
} from '../../../shared/schemas';
import { normalizeImages } from '../catalog/catalog-presenter';
import { getLandingConfig } from './landing';
import { deleteFileByUrl } from '../files/storage';

const VERSIONS_KEPT = 5;
const MISSING_TABLE = ['42P01', 'PGRST205'];

export interface StoreSnapshot {
  landing: LandingConfig;
  /** Estado completo de cada producto y combo, y el orden de la tienda. */
  products: StoreDraftProducts;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function colorImagesOf(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [color, images] of Object.entries(raw as Record<string, unknown>)) {
    const list = normalizeImages(images);
    if (list.length) out[color] = list;
  }
  return out;
}

const sortedEntries = (byColor: Record<string, string[]> = {}) =>
  Object.entries(byColor).sort(([a], [b]) => a.localeCompare(b));

/** Cómo está publicada la tienda ahora (sin precio, stock ni plantillas). */
export async function snapshotLive(): Promise<StoreSnapshot> {
  const [landing, items, combos] = await Promise.all([
    getLandingConfig(),
    db.from('catalog_items').select('id, images, images_by_color, published, sort_order, created_at'),
    db.from('combos').select('id, images, published'),
  ]);
  if (items.error) throw items.error;
  if (combos.error) throw combos.error;
  const rows = (items.data ?? []) as Array<{
    id: string;
    images: unknown;
    images_by_color: unknown;
    published: boolean;
    sort_order: number;
    created_at: string;
  }>;
  const comboRows = (combos.data ?? []) as Array<{ id: string; images: unknown; published: boolean }>;
  return {
    landing,
    products: {
      items: Object.fromEntries(
        rows.map((r) => [
          r.id,
          { images: normalizeImages(r.images), imagesByColor: colorImagesOf(r.images_by_color), published: r.published },
        ]),
      ),
      combos: Object.fromEntries(comboRows.map((c) => [c.id, { images: normalizeImages(c.images), published: c.published }])),
      order: [...rows]
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
        .map((r) => r.id),
    },
  };
}

/** Lo mínimo que hay que cambiar para pasar de `from` a `to` (solo lo que existe en los dos). */
export function diffProducts(from: StoreDraftProducts, to: StoreDraftProducts): StoreDraftProducts {
  const items: StoreDraftProducts['items'] = {};
  for (const [id, target] of Object.entries(to.items)) {
    const current = from.items[id];
    if (!current) continue;
    const change: StoreDraftProducts['items'][string] = {};
    if (target.images && !same(target.images, current.images)) change.images = target.images;
    if (target.imagesByColor && !same(sortedEntries(target.imagesByColor), sortedEntries(current.imagesByColor)))
      change.imagesByColor = target.imagesByColor;
    if (target.published !== undefined && target.published !== current.published) change.published = target.published;
    if (Object.keys(change).length) items[id] = change;
  }
  const combos: StoreDraftProducts['combos'] = {};
  for (const [id, target] of Object.entries(to.combos)) {
    const current = from.combos[id];
    if (!current) continue;
    const change: StoreDraftProducts['combos'][string] = {};
    if (target.images && !same(target.images, current.images)) change.images = target.images;
    if (target.published !== undefined && target.published !== current.published) change.published = target.published;
    if (Object.keys(change).length) combos[id] = change;
  }
  const existing = new Set(from.order ?? Object.keys(from.items));
  const order = to.order?.filter((id) => existing.has(id));
  const currentOrder = from.order?.filter((id) => order?.includes(id));
  return { items, combos, ...(order && !same(order, currentOrder) ? { order } : {}) };
}

async function productNames(): Promise<Map<string, string>> {
  const { data, error } = await db.from('catalog_items').select('id, template:templates(name)');
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<{ id: string; template: { name: string | null } | { name: string | null }[] | null }>).map(
      (row) => [row.id, firstOfEmbed(row.template)?.name ?? 'Producto'],
    ),
  );
}

/** «Qué cambió» de una publicación, en palabras del panel. */
export async function describeChanges(before: StoreSnapshot, after: StoreSnapshot): Promise<string[]> {
  const lines: string[] = [];
  const b = before.landing;
  const a = after.landing;
  const parts: string[] = [];
  if (!same(b.heroSlides, a.heroSlides)) parts.push('banners');
  if (!same([b.headerCategories, b.headerCategoriesMode], [a.headerCategories, a.headerCategoriesMode]))
    parts.push('encabezado');
  if (!same([b.homeCategories, b.homeCategoriesMode], [a.homeCategories, a.homeCategoriesMode]))
    parts.push('secciones del inicio');
  if (!same(b.cart, a.cart)) parts.push('carrito');
  if (parts.length) lines.push(`Portada: ${parts.join(', ')}`);

  const changes = diffProducts(before.products, after.products);
  const names = Object.keys(changes.items).length ? await productNames() : new Map<string, string>();
  const shown: string[] = [];
  const hidden: string[] = [];
  let photos = 0;
  for (const [id, change] of Object.entries(changes.items)) {
    if (change.published === true) shown.push(names.get(id) ?? 'Producto');
    if (change.published === false) hidden.push(names.get(id) ?? 'Producto');
    if (change.images || change.imagesByColor) photos += 1;
  }
  if (shown.length) lines.push(`Se mostraron: ${shown.join(', ')}`);
  if (hidden.length) lines.push(`Se ocultaron: ${hidden.join(', ')}`);
  if (photos) lines.push(`Fotos en ${photos} ${photos === 1 ? 'producto' : 'productos'}`);
  if (changes.order) lines.push('Orden de los productos');
  if (Object.keys(changes.combos).length) lines.push('Combos');
  return lines.length ? lines : ['Sin cambios visibles'];
}

async function insertVersion(snapshot: StoreSnapshot, summary: string[], by: string | null, at?: string) {
  const { error } = await db.from('store_versions').insert({
    landing: snapshot.landing,
    products: snapshot.products,
    summary,
    published_by: by,
    ...(at ? { published_at: at } : {}),
  });
  if (error) throw error;
}

/**
 * Guarda la versión publicada y deja solo las últimas 5. La primera vez guarda
 * también cómo estaba la tienda, para poder volver. Si falla, la publicación ya
 * quedó hecha: se registra el error y se sigue.
 */
export async function recordVersion(before: StoreSnapshot, after: StoreSnapshot, by: string, summary?: string[]) {
  try {
    const { count, error } = await db.from('store_versions').select('id', { count: 'exact', head: true });
    if (error) throw error;
    if (count === 0) {
      await insertVersion(
        before,
        ['Cómo estaba la tienda antes de la primera publicación'],
        null,
        new Date(Date.now() - 1000).toISOString(),
      );
    }
    await insertVersion(after, summary ?? (await describeChanges(before, after)), by);

    const { data, error: listError } = await db
      .from('store_versions')
      .select('id')
      .order('published_at', { ascending: false });
    if (listError) throw listError;
    const old = (data ?? []).slice(VERSIONS_KEPT).map((row) => row.id as string);
    if (old.length) {
      const { error: deleteError } = await db.from('store_versions').delete().in('id', old);
      if (deleteError) throw deleteError;
    }
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (MISSING_TABLE.includes(code)) logger.warn('Sin la migración 0030 no se guardan versiones de la tienda.');
    else logger.error('No se pudo guardar la versión de la tienda', { message: (err as Error).message });
  }
}

export async function listVersions(): Promise<StoreVersion[]> {
  const { data, error } = await db
    .from('store_versions')
    .select('id, summary, published_by, published_at')
    .order('published_at', { ascending: false })
    .limit(VERSIONS_KEPT);
  if (error && MISSING_TABLE.includes(error.code ?? '')) {
    throw Object.assign(new Error('Falta correr la migración 0030 en Supabase para ver las versiones.'), { status: 400 });
  }
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; summary: unknown; published_by: string | null; published_at: string }>;
  const ids = [...new Set(rows.map((r) => r.published_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await db.from('profiles').select('id, name, email').in('id', ids);
    for (const p of people ?? []) names.set(p.id as string, (p.name as string | null) || (p.email as string));
  }
  return rows.map((row, index) => ({
    id: row.id,
    publishedAt: row.published_at,
    publishedBy: row.published_by ? (names.get(row.published_by) ?? null) : null,
    summary: Array.isArray(row.summary) ? row.summary.filter((s): s is string => typeof s === 'string') : [],
    current: index === 0,
  }));
}

/** Contenido de una versión, leído con tolerancia (puede ser de antes de un cambio de formato). */
export async function getVersionSnapshot(id: string): Promise<{ snapshot: StoreSnapshot; publishedAt: string }> {
  const { data, error } = await db
    .from('store_versions')
    .select('landing, products, published_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Esa versión ya no está: se guardan las últimas 5.');
  const landing = landingConfigSchema.safeParse(data.landing);
  if (!landing.success) throw Object.assign(new Error('Esa versión no se puede restaurar.'), { status: 400 });

  const raw = (data.products ?? {}) as { items?: unknown; combos?: unknown; order?: unknown };
  const items: StoreDraftProducts['items'] = {};
  for (const [itemId, value] of Object.entries((raw.items as Record<string, Record<string, unknown>>) ?? {})) {
    items[itemId] = {
      images: normalizeImages(value?.images),
      imagesByColor: colorImagesOf(value?.imagesByColor),
      ...(typeof value?.published === 'boolean' ? { published: value.published } : {}),
    };
  }
  const combos: StoreDraftProducts['combos'] = {};
  for (const [comboId, value] of Object.entries((raw.combos as Record<string, Record<string, unknown>>) ?? {})) {
    combos[comboId] = {
      images: normalizeImages(value?.images),
      ...(typeof value?.published === 'boolean' ? { published: value.published } : {}),
    };
  }
  const order = Array.isArray(raw.order) ? raw.order.filter((v): v is string => typeof v === 'string') : undefined;
  return {
    snapshot: { landing: landing.data, products: { items, combos, ...(order ? { order } : {}) } },
    publishedAt: data.published_at as string,
  };
}

const mediaOf = (landing: unknown): string[] => {
  const slides = (landing as { heroSlides?: Array<{ mediaUrl?: unknown }> } | null)?.heroSlides;
  return Array.isArray(slides) ? slides.map((s) => s?.mediaUrl).filter((u): u is string => typeof u === 'string' && !!u) : [];
};

/**
 * Borra de R2 las fotos de banners que la tienda dejó de usar, salvo las que
 * siguen en una versión o en el borrador. Corre en segundo plano.
 */
export async function cleanupLandingMedia(before: LandingConfig, after: LandingConfig) {
  const candidates = mediaOf(before).filter((url) => !mediaOf(after).includes(url));
  if (candidates.length === 0) return;
  const [versions, draft] = await Promise.all([
    db.from('store_versions').select('landing'),
    db.from('store_draft').select('landing'),
  ]);
  // Sin poder leer qué se usa, no se borra nada.
  if (versions.error && !MISSING_TABLE.includes(versions.error.code ?? '')) return;
  if (draft.error && !MISSING_TABLE.includes(draft.error.code ?? '')) return;
  const used = new Set([
    ...mediaOf(after),
    ...(versions.data ?? []).flatMap((v) => mediaOf(v.landing)),
    ...(draft.data ?? []).flatMap((d) => mediaOf(d.landing)),
  ]);
  for (const url of candidates) {
    if (!used.has(url)) deleteFileByUrl(url).catch((err) => logger.error('Error limpiando R2', err));
  }
}
