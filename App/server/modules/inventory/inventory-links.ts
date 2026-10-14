// Vínculo entre lotes y variantes del catálogo, y disponibilidad por código de lote.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import { isMissingColumn } from '../orders/order-persistence';
import type { LotInfo } from '../catalog/catalog-presenter';
import type { PurchaseStatus } from './inventory';

// ── Vínculo lote ↔ variante del catálogo ──

export interface CatalogLink {
  catalogItemId: string;
  variantKey: string;
}

/** Códigos de una entrada de `variant_mappings`, tolerando la forma vieja. */
export function codesOfMapping(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object') return [];
  const e = entry as Record<string, unknown>;
  return [
    ...(Array.isArray(e.codes) ? e.codes.filter((c): c is string => typeof c === 'string') : []),
    ...(Array.isArray(e.skus) ? e.skus.filter((c): c is string => typeof c === 'string') : []),
    ...(typeof e.sku === 'string' && e.sku ? [e.sku] : []),
  ];
}

/**
 * Lotes vinculados por columna (0022), agrupados por producto y variante.
 * Vacío si la migración todavía no se aplicó.
 */
export async function getLinkedCodesByItem(itemIds: string[]): Promise<Map<string, Map<string, string[]>>> {
  const out = new Map<string, Map<string, string[]>>();
  const ids = [...new Set(itemIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data, error } = await db
    .from('purchases')
    .select('code, catalog_item_id, variant_key')
    .in('catalog_item_id', ids);
  if (isMissingColumn(error)) return out;
  if (error) throw error;

  for (const row of (data ?? []) as unknown as { code: string; catalog_item_id: string; variant_key: string | null }[]) {
    const byVariant = out.get(row.catalog_item_id) ?? new Map<string, string[]>();
    const key = row.variant_key ?? '';
    byVariant.set(key, [...(byVariant.get(key) ?? []), row.code]);
    out.set(row.catalog_item_id, byVariant);
  }
  return out;
}

/**
 * Suma a `variant_mappings` los lotes vinculados por columna, para que todo lo que lee stock vea
 * las compras nuevas. Solo en memoria: no escribe.
 */
export async function withLinkedLots<T extends { id: string; variant_mappings: Record<string, unknown> }>(
  items: T[],
): Promise<T[]> {
  const linked = await getLinkedCodesByItem(items.map((item) => item.id));
  if (linked.size === 0) return items;

  return items.map((item) => {
    const byVariant = linked.get(item.id);
    if (!byVariant) return item;
    const mappings: Record<string, unknown> = { ...(item.variant_mappings ?? {}) };
    for (const [key, codes] of byVariant) {
      const current = mappings[key];
      const base = current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
      mappings[key] = { ...base, codes: [...new Set([...codesOfMapping(current), ...codes])] };
    }
    return { ...item, variant_mappings: mappings };
  });
}

/** Todos los códigos de lote de una variante: los vinculados en Catálogo + los vinculados por columna. */
export async function codesForVariant(link: CatalogLink): Promise<string[]> {
  const { data: item, error } = await db
    .from('catalog_items')
    .select('id, variant_mappings')
    .eq('id', link.catalogItemId)
    .maybeSingle();
  if (error) throw error;
  const fromMappings = item
    ? codesOfMapping((item.variant_mappings as Record<string, unknown> | null)?.[link.variantKey])
    : [];
  const fromColumns = (await getLinkedCodesByItem([link.catalogItemId])).get(link.catalogItemId)?.get(link.variantKey) ?? [];
  return [...new Set([...fromMappings, ...fromColumns])];
}

/** Si ya hay lotes de la variante se reutiliza su nombre: Ventas descuenta por nombre (FIFO). */
export async function nameForVariant(link: CatalogLink): Promise<{ productName: string; categoryId: string | null }> {
  const { data: item, error } = await db
    .from('catalog_items')
    .select('id, name, category_id, template:templates(name)')
    .eq('id', link.catalogItemId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new BadRequestError('El producto elegido ya no existe en Catálogo.');

  const codes = await codesForVariant(link);
  if (codes.length) {
    const { data: existing } = await db
      .from('purchases')
      .select('product_name')
      .in('code', codes)
      .order('purchase_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.product_name) {
      return { productName: existing.product_name as string, categoryId: (item.category_id as string | null) ?? null };
    }
  }

  const template = Array.isArray(item.template) ? item.template[0] : item.template;
  const baseName = ((item.name as string | null) || (template as { name?: string } | null)?.name || 'Producto').trim();
  const parts = link.variantKey ? link.variantKey.split(' / ').map((p) => p.trim()).filter(Boolean) : [];
  return {
    productName: [baseName, ...parts].join(' | '),
    categoryId: (item.category_id as string | null) ?? null,
  };
}

// ── Disponibilidad por código de lote ── La única puerta del catálogo a bodega. Solo cuentan los
// lotes `received`: uno en tránsito no es vendible y prometerlo haría fallar la entrega.

// `purchases.code` es único, así que el mapa es 1 a 1; igual se suma para no depender de eso.
export async function getAvailableByCodes(codes: string[]): Promise<Map<string, number>> {
  const available = new Map<string, number>();
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return available;

  const { data, error } = await db
    .from('purchases')
    .select('code, quantity, quantity_sold, quantity_reserved')
    .eq('status', 'received')
    .in('code', unique);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as {
    code: string;
    quantity: number;
    quantity_sold: number;
    quantity_reserved: number;
  }[]) {
    const free = Math.max(0, row.quantity - row.quantity_sold - row.quantity_reserved);
    available.set(row.code, (available.get(row.code) ?? 0) + free);
  }
  return available;
}

/**
 * Lotes de bodega por código para la tienda: unidades libres, si siguen en
 * camino, su precio de venta y su lugar en el FIFO (el mismo orden de Ventas).
 */
export async function getLotsByCodes(codes: string[]): Promise<Map<string, LotInfo>> {
  const lots = new Map<string, LotInfo>();
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return lots;

  const { data, error } = await db
    .from('purchases')
    .select('code, status, quantity, quantity_sold, quantity_reserved, suggested_price, purchase_date, created_at')
    .in('code', unique);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as {
    code: string;
    status: PurchaseStatus;
    quantity: number;
    quantity_sold: number;
    quantity_reserved: number;
    suggested_price: number | string | null;
    purchase_date: string;
    created_at: string;
  }[]) {
    const received = row.status === 'received';
    const price = row.suggested_price == null ? null : Number(row.suggested_price);
    lots.set(row.code, {
      available: received ? Math.max(0, row.quantity - row.quantity_sold - row.quantity_reserved) : 0,
      inTransit: !received,
      salePrice: price && price > 0 ? price : null,
      fifoKey: `${row.purchase_date}|${row.created_at}`,
    });
  }
  return lots;
}
