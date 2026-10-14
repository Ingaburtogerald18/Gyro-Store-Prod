// Acceso a datos del inventario: CRUD de `purchases` (lotes de compra),
// recepción de lotes (arrival) y las funciones
// FIFO (reserveForItems, takeFifo, consumeReservation). Sigue el contrato de
// frontend/app/store/api/inventoryV1Api.ts, que es lo que de verdad consumen
// los componentes reciclados de admin/inventory/ (no inventoryApi.ts, que es
// un draft sin usar). Usa `db` de supabase.ts y consume costing.ts al recibir
// una compra para persistir costo real / F-U / coste final.
import { db } from '../../core/supabase';
import { getFinancialConfig } from '../settings/app-config';
import { costPurchaseOnArrival, round } from '../finance/costing';
import { BadRequestError } from '../../utils/http-error';
import { isMissingColumn } from '../orders/order-persistence';
import { fetchAllRows } from '../../utils/fetch-all-rows';
import type {
  UpdatePurchaseInput,
  ArrivalInput,
} from '../../../shared/schemas';
import type { LotInfo } from '../catalog/catalog-presenter';
import { resolveTemplateLink } from '../catalog/template-products';

// ============================================================================
// ── Tipos (contrato con inventoryV1Api.ts) ──
// ============================================================================
// `PurchaseStatus` real de la DB tiene 3 valores (`purchase_status` enum); el
// tipo del frontend hoy solo declara 2 (`china`|`received`), un desfase que no
// toca a este archivo — se corrige cuando se retoque inventoryV1Api.ts.
export type PurchaseStatus = 'china' | 'pending' | 'received';

export interface Purchase {
  id: string;
  lot: string;
  code: string;
  productName: string;
  category: string | null;
  purchaseDate: string;
  arrivalDate: string | null;
  quantity: number;
  costUnit: number;
  taxUnit: number;
  shippingUnit: number;
  priceUnit: number;
  total: number;
  quantitySold: number;
  quantityReserved: number;
  suggestedPrice: number | null;
  status: PurchaseStatus;
  /** Producto del catálogo al que pertenece el lote (migración 0022). */
  catalogItemId: string | null;
  /** Variante dentro de ese producto ("Negro / Con micrófono"; '' sin variantes). */
  variantKey: string | null;
  /** Orden de Alibaba a la que pertenece la línea (migración 0024). */
  orderId: string | null;
  /** Lo pedido, cuando llegó otra cantidad (null = llegó lo pedido). */
  quantityOrdered: number | null;
}

export interface InventoryRow {
  id: string;
  code: string;
  productName: string;
  category: string | null;
  lot?: string;
  quantityOriginal?: number;
  quantitySold?: number;
  quantityReserved?: number;
  available: number;
  priceUnitUsd?: number;
  shippingUnitUsd?: number;
  priceUnitFinalUsd?: number;
  costRealCordobas?: number;
  costoFijoCordobas?: number;
  costeFinalCordobas?: number;
  preTotalUsd?: number;
  totalFinalUsd?: number;
  suggestedPrice?: number | null;
  gananciaUnitCordobas?: number;
  catalogItemId?: string | null;
  variantKey?: string | null;
}

export interface InventoryKpis {
  totalPurchases: number;
  inTransit: number;
  received: number;
  /** Lo que de verdad queda en bodega: recibido − vendido − reservado. */
  availableUnits: number;
  subtotalInvertidoUsd: number;
  totalImpuestosUsd: number;
  totalInversionConImpuestosUsd: number;
  totalEnviosUsd: number;
}

// ============================================================================
// ── Filas crudas de la DB (snake_case) ──
// ============================================================================

interface PurchaseRow {
  id: string;
  code: string;
  lot: string | null;
  status: PurchaseStatus;
  purchase_date: string;
  quantity: number;
  quantity_sold: number;
  quantity_reserved: number;
  costo_china_usd: number | null;
  impuesto_unit_usd: number | null;
  envio_unit_usd: number | null;
  exchange_rate: number | null;
  costo_real_usd: number | null;
  costo_real_cs: number | null;
  product_name: string;
  category: string | null;
  arrival_date: string | null;
  suggested_price: number | null;
  costo_f_u: number | null;
  coste_final: number | null;
  catalog_item_id?: string | null;
  variant_key?: string | null;
  order_id?: string | null;
  quantity_ordered?: number | null;
}

const PURCHASE_COLUMNS = [
  'id', 'code', 'lot', 'status', 'purchase_date',
  'quantity', 'quantity_sold', 'quantity_reserved',
  'costo_china_usd', 'impuesto_unit_usd', 'envio_unit_usd', 'exchange_rate',
  'costo_real_usd', 'costo_real_cs',
  'product_name', 'category', 'arrival_date', 'suggested_price',
  'costo_f_u', 'coste_final',
].join(', ');

// Columnas del vínculo con el catálogo (migración 0022). Mientras la migración
// no esté aplicada no existen: toda lectura reintenta sin ellas y el módulo
// sigue funcionando como antes.
const LINK_COLUMNS = 'catalog_item_id, variant_key';
const PURCHASE_COLUMNS_LINKED = `${PURCHASE_COLUMNS}, ${LINK_COLUMNS}`;
// Orden de Alibaba (migración 0024). Mismo criterio: si falta, se lee sin ella.
const ORDER_COLUMNS = 'order_id, quantity_ordered';
// De la más completa a la más básica: cada migración puede estar o no aplicada.
const PURCHASE_COLUMN_TIERS = [
  `${PURCHASE_COLUMNS_LINKED}, ${ORDER_COLUMNS}`,
  `${PURCHASE_COLUMNS}, ${ORDER_COLUMNS}`,
  PURCHASE_COLUMNS_LINKED,
  PURCHASE_COLUMNS,
];

// ============================================================================
// ── Helpers ──
// ============================================================================

// "YYYY-MM" → [primer día del mes, primer día del mes siguiente). El mes de
// entrada es 1-based (marzo = "03"); `Date.UTC` lo toma tal cual porque su
// parámetro de mes es 0-based, así que ya apunta al mes siguiente.
function periodRange(period: string): { start: string; end: string } {
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = `${yearStr}-${monthStr}-01`;
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start, end };
}

function toPurchase(row: PurchaseRow): Purchase {
  const costUnit = row.costo_china_usd ?? 0;
  const taxUnit = row.impuesto_unit_usd ?? 0;
  const shippingUnit = row.envio_unit_usd ?? 0;
  // Docs/03-Finanzas.md §1: "costo unitario origen" = (Cantidad×costo + Cantidad×impuesto) / Cantidad = costo + impuesto.
  const priceUnit = costUnit + taxUnit;

  return {
    id: row.id,
    lot: row.lot ?? '',
    code: row.code,
    productName: row.product_name,
    category: row.category,
    purchaseDate: row.purchase_date,
    arrivalDate: row.arrival_date,
    quantity: row.quantity,
    costUnit,
    taxUnit,
    shippingUnit,
    priceUnit: round(priceUnit, 4),
    total: round(priceUnit * row.quantity, 4),
    quantitySold: row.quantity_sold,
    quantityReserved: row.quantity_reserved,
    suggestedPrice: row.suggested_price,
    status: row.status,
    catalogItemId: row.catalog_item_id ?? null,
    variantKey: row.variant_key ?? null,
    orderId: row.order_id ?? null,
    quantityOrdered: row.quantity_ordered ?? null,
  };
}

function toInventoryRow(row: PurchaseRow): InventoryRow {
  const available = Math.max(0, row.quantity - row.quantity_sold - row.quantity_reserved);
  const priceUnit = (row.costo_china_usd ?? 0) + (row.impuesto_unit_usd ?? 0);
  const shippingUnit = row.envio_unit_usd ?? 0;
  const priceUnitFinal = priceUnit + shippingUnit;
  const costeFinal = row.coste_final ?? 0;
  const suggested = row.suggested_price ?? 0;

  return {
    id: row.id,
    code: row.code,
    productName: row.product_name,
    category: row.category,
    lot: row.lot ?? undefined,
    quantityOriginal: row.quantity,
    quantitySold: row.quantity_sold,
    quantityReserved: row.quantity_reserved,
    available,
    priceUnitUsd: round(priceUnit, 4),
    shippingUnitUsd: shippingUnit,
    priceUnitFinalUsd: round(priceUnitFinal, 4),
    costRealCordobas: row.costo_real_cs ?? 0,
    costoFijoCordobas: row.costo_f_u ?? 0,
    costeFinalCordobas: costeFinal,
    preTotalUsd: round(priceUnit * available, 4),
    totalFinalUsd: round(priceUnitFinal * available, 4),
    suggestedPrice: row.suggested_price,
    gananciaUnitCordobas: round(suggested - costeFinal, 2),
    catalogItemId: row.catalog_item_id ?? null,
    variantKey: row.variant_key ?? null,
  };
}

async function fetchPurchaseRows(period?: string, status?: PurchaseStatus): Promise<PurchaseRow[]> {
  const run = (columns: string) => {
    let query = db
      .from('purchases')
      .select(columns)
      .order('purchase_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (status) query = query.eq('status', status);
    if (period) {
      const { start, end } = periodRange(period);
      query = query.gte('purchase_date', start).lt('purchase_date', end);
    }
    return query;
  };

  for (const columns of PURCHASE_COLUMN_TIERS) {
    const { data, error } = await run(columns);
    if (isMissingColumn(error)) continue;
    if (error) throw error;
    return (data ?? []) as unknown as PurchaseRow[];
  }
  return [];
}

/**
 * Los próximos `count` códigos GS-IN-N: siempre el mayor + 1, sin rellenar
 * huecos. El catálogo vincula variantes por código, y reutilizar el de un lote
 * borrado le pasaría su vínculo (y su stock en la tienda) a otro producto.
 * Se leen TODOS los códigos (paginado): con más de 1000 lotes, PostgREST corta
 * la respuesta y el máximo salía mal.
 */
export async function nextPurchaseCodes(count: number): Promise<string[]> {
  const rows = await fetchAllRows<{ code: string }>((from, to) =>
    db.from('purchases').select('code').like('code', 'GS-IN-%').range(from, to),
  );
  const maxUsed = rows
    .map((r) => parseInt(r.code.replace('GS-IN-', ''), 10))
    .filter((n) => !isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return Array.from({ length: count }, (_, i) => `GS-IN-${maxUsed + 1 + i}`);
}

// ── Vínculo lote ↔ variante del catálogo ──

export interface CatalogLink {
  catalogItemId: string;
  variantKey: string;
}

/** Códigos de una entrada de `variant_mappings`, tolerando la forma vieja de v1. */
function codesOfMapping(entry: unknown): string[] {
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
 * Suma a `variant_mappings` los lotes vinculados por columna, para que todo lo
 * que lee stock por códigos (tienda, ficha, checkout) vea también las compras
 * nuevas sin que nadie las tenga que vincular a mano en Catálogo. No escribe
 * nada: es solo la vista en memoria.
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

/**
 * Nombre del lote para una variante del catálogo. Si ya hay lotes de esa
 * variante se reutiliza su nombre: Ventas descuenta por nombre (FIFO), así que
 * todas las compras de la misma variante tienen que llamarse igual.
 */
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

// ============================================================================
// ── Lectura (purchases) ──
// ============================================================================

export async function getPurchases(period?: string): Promise<Purchase[]> {
  const rows = await fetchPurchaseRows(period);
  return rows.map(toPurchase);
}

export async function getIncomingInventory(): Promise<Purchase[]> {
  const rows = await fetchPurchaseRows(undefined, 'china');
  return rows.map(toPurchase);
}

export async function getCurrentInventory(period?: string): Promise<InventoryRow[]> {
  const rows = await fetchPurchaseRows(period, 'received');
  return rows.map(toInventoryRow);
}

// A diferencia de getCurrentInventory (todo lo recibido, para el listado
// completo del panel), esto filtra a lo que de verdad queda disponible: es lo
// que alimentará el selector de productos de una venta.
export async function getAvailableInventory(): Promise<InventoryRow[]> {
  const rows = await fetchPurchaseRows(undefined, 'received');
  return rows
    .filter((row) => row.quantity - row.quantity_sold - row.quantity_reserved > 0)
    .map(toInventoryRow);
}

export async function getInventoryKpis(period?: string): Promise<InventoryKpis> {
  const rows = await fetchPurchaseRows(period);
  let inTransit = 0;
  let received = 0;
  let availableUnits = 0;
  let subtotalInvertidoUsd = 0;
  let totalImpuestosUsd = 0;
  let totalEnviosUsd = 0;

  for (const row of rows) {
    if (row.status === 'received') {
      received += row.quantity;
      availableUnits += Math.max(0, row.quantity - row.quantity_sold - row.quantity_reserved);
    } else inTransit += row.quantity;
    subtotalInvertidoUsd += (row.costo_china_usd ?? 0) * row.quantity;
    totalImpuestosUsd += (row.impuesto_unit_usd ?? 0) * row.quantity;
    totalEnviosUsd += (row.envio_unit_usd ?? 0) * row.quantity;
  }

  return {
    totalPurchases: rows.reduce((acc, r) => acc + r.quantity, 0),
    inTransit,
    received,
    availableUnits,
    subtotalInvertidoUsd: round(subtotalInvertidoUsd, 4),
    totalImpuestosUsd: round(totalImpuestosUsd, 4),
    totalInversionConImpuestosUsd: round(subtotalInvertidoUsd + totalImpuestosUsd, 4),
    totalEnviosUsd: round(totalEnviosUsd, 4),
  };
}

// ============================================================================
// ── Escritura (purchases) ──
// ============================================================================

/** Saca un código de lote de los vínculos que se cargaban a mano en el editor de Catálogo. */
async function dropManualLinks(code: string): Promise<void> {
  const { data, error } = await db.from('catalog_items').select('id, variant_mappings').not('variant_mappings', 'is', null);
  if (error) throw error;
  for (const item of (data ?? []) as { id: string; variant_mappings: Record<string, unknown> }[]) {
    const entries = Object.entries(item.variant_mappings ?? {});
    if (!entries.some(([, entry]) => codesOfMapping(entry).includes(code))) continue;
    const mappings = Object.fromEntries(
      entries.map(([key, entry]) => {
        if (!codesOfMapping(entry).includes(code)) return [key, entry];
        const { sku: _sku, skus: _skus, ...rest } = entry as Record<string, unknown>;
        return [key, { ...rest, codes: codesOfMapping(entry).filter((c) => c !== code) }];
      }),
    );
    const { error: updateError } = await db.from('catalog_items').update({ variant_mappings: mappings }).eq('id', item.id);
    if (updateError) throw updateError;
  }
}

/** Link de fotos y videos del producto de cada lote (`catalog_items.spo_link`). */
export async function withMediaLinks<T extends InventoryRow & { offerTarget?: { catalogItemId: string } | null }>(
  rows: T[],
): Promise<Array<T & { spoLink: string | null }>> {
  const productOf = (row: T) => row.offerTarget?.catalogItemId ?? row.catalogItemId ?? null;
  const ids = [...new Set(rows.map(productOf).filter((id): id is string => Boolean(id)))];
  const links = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await db.from('catalog_items').select('id, spo_link').in('id', ids).not('spo_link', 'is', null);
    if (error) throw error;
    for (const item of (data ?? []) as { id: string; spo_link: string | null }[]) {
      if (item.spo_link) links.set(item.id, item.spo_link);
    }
  }
  return rows.map((row) => ({ ...row, spoLink: links.get(productOf(row) ?? '') ?? null }));
}

/**
 * Vincula (o desvincula, con `null`) un lote existente a una variante del
 * catálogo. Requiere la migración 0022.
 */
export async function setPurchaseLink(id: string, link: CatalogLink | null): Promise<void> {
  const { error } = await db
    .from('purchases')
    .update({ catalog_item_id: link?.catalogItemId ?? null, variant_key: link ? link.variantKey : null })
    .eq('id', id);
  if (isMissingColumn(error)) {
    throw new BadRequestError('Para vincular lotes desde Inventario falta aplicar la migración 0022 en la base.');
  }
  if (error) throw error;
}

// "Sube stock": pasa el lote a `received` y persiste la
// cadena de costeo completa de Docs/03-Finanzas.md §1-3 vía costing.ts. La tasa de cambio
// se congela acá (regla de oro #4) con la vigente en `app_config` al momento
// de recibir — no se vuelve a tocar después.
export async function reportArrival(id: string, input: ArrivalInput): Promise<boolean> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('quantity, costo_china_usd, impuesto_unit_usd')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  const config = await getFinancialConfig();
  // La tasa que se congela es la que confirma quien recibe (el modal la
  // precarga con la de Configuración); sin ella, la vigente.
  const exchangeRate = input.exchangeRate ?? config.exchangeRate;
  const costing = costPurchaseOnArrival(
    {
      quantity: existing.quantity,
      costoChinaUsd: existing.costo_china_usd ?? 0,
      impuestoUnitUsd: existing.impuesto_unit_usd ?? 0,
      envioUnitUsd: input.shippingUnit,
      exchangeRate,
    },
    config,
  );

  const { error } = await db
    .from('purchases')
    .update({
      status: 'received',
      arrival_date: input.arrivalDate,
      envio_unit_usd: input.shippingUnit,
      exchange_rate: exchangeRate,
      costo_real_usd: costing.costoRealUsd,
      costo_real_cs: costing.costoRealCs,
      costo_f_u: costing.costoFU,
      coste_final: costing.costeFinal,
      suggested_price: input.suggestedPrice,
    })
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function simulateCost(
  id: string,
  shippingUnit: number,
  exchangeRateOverride?: number,
): Promise<{ precioSugerido: number; exchangeRate: number }> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('quantity, costo_china_usd, impuesto_unit_usd')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new BadRequestError('Lote no encontrado');

  const config = await getFinancialConfig();
  const exchangeRate = exchangeRateOverride ?? config.exchangeRate;
  const costing = costPurchaseOnArrival(
    {
      quantity: existing.quantity,
      costoChinaUsd: existing.costo_china_usd ?? 0,
      impuestoUnitUsd: existing.impuesto_unit_usd ?? 0,
      envioUnitUsd: shippingUnit,
      exchangeRate,
    },
    config,
  );

  return { precioSugerido: costing.precioSugerido, exchangeRate };
}

export async function updatePurchase(
  id: string,
  rawInput: UpdatePurchaseInput,
  authorUid?: string,
  opts: { fromOrder?: boolean } = {},
): Promise<boolean> {
  let input = rawInput;
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  const sold = existing.quantity_sold ?? 0;
  const reserved = existing.quantity_reserved ?? 0;

  // Una línea de una orden de Alibaba toma el número y la fecha de la orden:
  // cambiarlos acá la separaría de su orden. Se cambian desde la orden.
  if (existing.order_id) {
    if (input.lot !== undefined && input.lot.trim().toUpperCase() !== String(existing.lot ?? '').trim().toUpperCase()) {
      throw new BadRequestError('El número de orden se cambia desde la orden, no desde una línea.');
    }
    if (input.purchaseDate !== undefined && input.purchaseDate !== existing.purchase_date) {
      throw new BadRequestError('La fecha de compra se cambia desde la orden, no desde una línea.');
    }
    if (!opts.fromOrder && input.taxUnit !== undefined && Number(input.taxUnit) !== Number(existing.impuesto_unit_usd ?? 0)) {
      throw new BadRequestError('El impuesto es el mismo para toda la orden: cambialo desde «Editar orden».');
    }
  }

  // El código lo genera el sistema y es la llave del vínculo con el catálogo:
  // cambiarlo dejaría la variante apuntando a un lote que ya no existe.
  if (input.code !== undefined && input.code !== existing.code) {
    throw new BadRequestError('El código del lote no se puede cambiar.');
  }
  // Las ventas pendientes se costean al aprobarlas buscando su lote por este
  // nombre: renombrar en el medio dejaría esas líneas con costo 0.
  if (input.productName !== undefined && input.productName !== existing.product_name && reserved > 0) {
    throw new BadRequestError(
      `No se puede cambiar el nombre: hay ${reserved} unidad(es) reservadas en ventas o pedidos web pendientes. Resolvelos primero.`,
    );
  }
  if (input.quantity !== undefined && input.quantity < sold + reserved) {
    throw new BadRequestError(
      `La cantidad no puede ser menor a ${sold + reserved}: ya hay ${sold} vendida(s) y ${reserved} reservada(s).`,
    );
  }

  // Con plantilla, el servidor busca (o crea, sin publicar) su producto.
  if (input.templateId) {
    const { link } = await resolveTemplateLink({
      templateId: input.templateId,
      variantKey: input.variantKey ?? '',
      catalogItemId: input.catalogItemId ?? undefined,
    });
    input = { ...input, ...link };
  }

  // Vincular a una variante: el lote toma el nombre que ya usan los otros lotes
  // de esa variante (Ventas los agrupa por nombre). Si tiene unidades
  // reservadas se conserva el nombre: renombrar rompería el costeo.
  if (input.catalogItemId !== undefined) {
    const link: CatalogLink | null = input.catalogItemId
      ? { catalogItemId: input.catalogItemId, variantKey: input.variantKey ?? '' }
      : null;
    const canonical = link && reserved === 0 ? await nameForVariant(link) : null;
    await setPurchaseLink(id, link);
    // El vínculo por columna queda como el único: sin el editor de Catálogo, uno
    // cargado a mano ahí ya no se podría corregir.
    await dropManualLinks(existing.code);
    if (canonical) {
      input = {
        ...input,
        productName: canonical.productName,
        ...(input.templateId && canonical.categoryId ? { category: canonical.categoryId } : {}),
      };
    }
  }

  // Solo se toma como "cambio" lo que es distinto de lo guardado: el panel
  // manda el formulario entero aunque se haya tocado un solo campo.
  const differs = (next: number | undefined, current: number | null) =>
    next !== undefined && Number(next) !== Number(current ?? 0);

  const patch: Record<string, unknown> = {};
  if (input.purchaseDate !== undefined) patch.purchase_date = input.purchaseDate;
  if (input.lot !== undefined) patch.lot = input.lot;
  if (input.productName !== undefined) patch.product_name = input.productName;
  if (input.category !== undefined) patch.category = input.category;
  if (differs(input.quantity, existing.quantity)) patch.quantity = input.quantity;
  if (differs(input.costUnit, existing.costo_china_usd)) patch.costo_china_usd = input.costUnit;
  if (differs(input.taxUnit, existing.impuesto_unit_usd)) patch.impuesto_unit_usd = input.taxUnit;
  if (differs(input.shippingUnit, existing.envio_unit_usd)) patch.envio_unit_usd = input.shippingUnit;
  if (input.suggestedPrice !== undefined) patch.suggested_price = input.suggestedPrice;

  // Si el lote ya fue recibido y un insumo del costeo cambió DE VERDAD, se
  // recalcula la cadena de costos con la tasa YA congelada del lote (regla de
  // oro #4). El precio de venta NO se toca: es una decisión de quien vende,
  // y antes se pisaba con el sugerido en cualquier edición, aunque solo se
  // hubiera corregido el nombre. Para cambiarlo hay que mandarlo explícito.
  const costingInputsChanged =
    existing.status === 'received' &&
    ('quantity' in patch || 'costo_china_usd' in patch || 'impuesto_unit_usd' in patch || 'envio_unit_usd' in patch);

  if (costingInputsChanged) {
    if (existing.exchange_rate == null) {
      throw new BadRequestError('El lote está marcado como recibido pero no tiene tasa de cambio congelada.');
    }
    const config = await getFinancialConfig();
    const costing = costPurchaseOnArrival(
      {
        quantity: (patch.quantity as number | undefined) ?? existing.quantity,
        costoChinaUsd: (patch.costo_china_usd as number | undefined) ?? existing.costo_china_usd ?? 0,
        impuestoUnitUsd: (patch.impuesto_unit_usd as number | undefined) ?? existing.impuesto_unit_usd ?? 0,
        envioUnitUsd: (patch.envio_unit_usd as number | undefined) ?? existing.envio_unit_usd ?? 0,
        exchangeRate: existing.exchange_rate,
      },
      config,
    );
    patch.costo_real_usd = costing.costoRealUsd;
    patch.costo_real_cs = costing.costoRealCs;
    patch.costo_f_u = costing.costoFU;
    patch.coste_final = costing.costeFinal;
  }

  if (Object.keys(patch).length === 0) return true;

  const { data: updated, error } = await db.from('purchases').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) throw error;

  // Rastro de quién cambió qué: cantidades, costos y precio mueven la plata.
  await db.from('audit_logs').insert({
    entity: 'purchases',
    entity_id: id,
    action: 'update',
    reason: 'Edición desde panel',
    author_uid: authorUid ?? null,
    before: existing,
    after: updated ?? null,
  });

  return true;
}

// Deshace una recepción (received → china). Bloqueado si ya se vendió o
// reservó algo del lote: revertir eso dejaría números inconsistentes.
export async function revertPurchase(id: string): Promise<boolean> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('status, quantity_sold, quantity_reserved')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  if (existing.status !== 'received') {
    throw new BadRequestError('Solo se puede revertir un lote que ya fue recibido.');
  }
  if (existing.quantity_sold > 0 || existing.quantity_reserved > 0) {
    throw new BadRequestError('No se puede revertir un lote con stock ya vendido o reservado.');
  }

  const { error } = await db
    .from('purchases')
    .update({
      status: 'china',
      arrival_date: null,
      envio_unit_usd: 0,
      exchange_rate: null,
      costo_real_usd: null,
      costo_real_cs: null,
      costo_f_u: null,
      coste_final: null,
    })
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function deletePurchase(id: string, authorUid: string): Promise<boolean> {
  const { data: existing, error: fetchError } = await db
    .from('purchases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return false;

  if (existing.quantity_sold > 0 || existing.quantity_reserved > 0) {
    throw new BadRequestError('No se puede borrar un lote con stock ya vendido o reservado.');
  }

  const { error } = await db.from('purchases').delete().eq('id', id);
  if (error) throw error;
  await dropManualLinks(existing.code);

  await db.from('audit_logs').insert({
    entity: 'purchases',
    entity_id: id,
    action: 'delete',
    reason: 'Eliminación manual desde panel',
    author_uid: authorUid,
    before: existing,
    after: null,
  });

  return true;
}

// ============================================================================
// ── FIFO ──
// ============================================================================
// Agrupa los lotes por `product_name`: por eso las compras nuevas toman el
// nombre que ya usan los lotes de su variante (nameForVariant).
//
// Tampoco hay una función de Postgres con locking real (`FOR UPDATE`) como
// pide la regla de stock con transacción: sin acceso a Supabase para probar una función
// plpgsql esta sesión, esto usa UPDATEs condicionados (compare-and-swap sobre
// el valor leído + el CHECK constraint de la tabla como última defensa) y una
// compensación manual best-effort si algo falla a mitad de camino. Conviene
// migrar esto a una función de Postgres con locking antes de manejar tráfico
// concurrente real.

export interface ReserveItem {
  productName: string;
  quantity: number;
}

interface FifoTakenLot {
  purchaseId: string;
  code: string;
  quantity: number;
  costeFinalUsd: number | null;
}

const FIFO_MAX_PASSES = 3;

/** Qué lotes entran al FIFO: los de un nombre (Ventas) o los de una lista de códigos (variante del catálogo). */
type FifoTarget = string | { codes: string[]; label: string };

export async function walkFifoLots(
  target: FifoTarget,
  quantity: number,
  column: 'quantity_reserved' | 'quantity_sold',
): Promise<FifoTakenLot[]> {
  let remaining = quantity;
  const taken: FifoTakenLot[] = [];
  const productName = typeof target === 'string' ? target : target.label;

  for (let pass = 0; pass < FIFO_MAX_PASSES && remaining > 0; pass++) {
    let query = db
      .from('purchases')
      .select('id, code, quantity, quantity_sold, quantity_reserved, coste_final, exchange_rate');
    query = typeof target === 'string' ? query.eq('product_name', target) : query.in('code', target.codes);
    const { data, error } = await query
      .eq('status', 'received')
      .order('purchase_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const lots = (data ?? []) as unknown as {
      id: string;
      code: string;
      quantity: number;
      quantity_sold: number;
      quantity_reserved: number;
      coste_final: number | null;
      exchange_rate: number | null;
    }[];

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = lot.quantity - lot.quantity_sold - lot.quantity_reserved;
      if (available <= 0) continue;

      const take = Math.min(available, remaining);
      const currentValue = column === 'quantity_reserved' ? lot.quantity_reserved : lot.quantity_sold;

      const { data: updated, error: updateError } = await db
        .from('purchases')
        .update({ [column]: currentValue + take })
        .eq('id', lot.id)
        .eq(column, currentValue) // compare-and-swap: solo si nadie más lo tocó desde la lectura
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) continue; // conflicto: se reintenta este lote en la próxima pasada

      remaining -= take;
      const costeFinalUsd =
        lot.coste_final != null && lot.exchange_rate ? round(lot.coste_final / lot.exchange_rate, 4) : null;
      taken.push({ purchaseId: lot.id, code: lot.code, quantity: take, costeFinalUsd });
    }
  }

  if (remaining > 0) {
    // Compensación best-effort: no hay TX real, así que se deshace a mano lo
    // que sí se alcanzó a tomar antes de reportar el faltante.
    for (const lot of taken) {
      await releaseFifoLot(lot.purchaseId, column, lot.quantity);
    }
    throw new BadRequestError(`Stock insuficiente de "${productName}": faltan ${remaining} unidad(es).`);
  }

  return taken;
}

export async function releaseFifoLot(
  purchaseId: string,
  column: 'quantity_reserved' | 'quantity_sold',
  quantity: number,
): Promise<void> {
  // Compare-and-swap con reintentos: sin el `.eq(column, current)` dos
  // liberaciones simultáneas se pisaban y una se perdía.
  for (let pass = 0; pass < FIFO_MAX_PASSES; pass++) {
    const { data } = await db.from('purchases').select(column).eq('id', purchaseId).maybeSingle();
    if (!data) return; // best-effort: si esto falla queda para revisión manual
    const current = (data as unknown as Record<string, number>)[column] ?? 0;
    const { data: updated } = await db
      .from('purchases')
      .update({ [column]: Math.max(0, current - quantity) })
      .eq('id', purchaseId)
      .eq(column, current)
      .select('id')
      .maybeSingle();
    if (updated) return;
  }
  console.error(`[inventory] No se pudo liberar ${quantity} de ${column} en el lote ${purchaseId}: revisar a mano.`);
}

// Reserva stock para las líneas de un pedido/cotización (quantity_reserved),
// creando una fila en `stock_reservations` por cada lote que aporta unidades.
export async function reserveForItems(
  orderId: string,
  items: ReserveItem[],
): Promise<FifoTakenLot[]> {
  const allTaken: FifoTakenLot[] = [];

  try {
    for (const item of items) {
      const taken = await walkFifoLots(item.productName, item.quantity, 'quantity_reserved');
      for (const lot of taken) {
        const { error } = await db.from('stock_reservations').insert({
          order_id: orderId,
          purchase_id: lot.purchaseId,
          code: lot.code,
          quantity: lot.quantity,
          unit_final_usd: lot.costeFinalUsd,
          status: 'active',
        });
        if (error) throw error;
      }
      allTaken.push(...taken);
    }
    return allTaken;
  } catch (err) {
    // Compensación best-effort de las líneas anteriores que sí se alcanzaron
    // a reservar antes de que fallara esta.
    for (const lot of allTaken) {
      await releaseFifoLot(lot.purchaseId, 'quantity_reserved', lot.quantity);
    }
    await db
      .from('stock_reservations')
      .delete()
      .eq('order_id', orderId)
      .eq('status', 'active');
    throw err;
  }
}

// Venta directa sin reserva previa (ej. POS/factura inmediata): suma
// directamente a quantity_sold en vez de pasar por quantity_reserved.
export async function takeFifo(productName: string, quantity: number): Promise<FifoTakenLot[]> {
  return walkFifoLots(productName, quantity, 'quantity_sold');
}

// Confirma una reserva existente (ej. al aprobar el pedido): mueve lo
// reservado a vendido en cada lote y marca las reservas como consumidas.
export async function consumeReservation(orderId: string): Promise<{ consumed: number }> {
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('order_id', orderId)
    .eq('status', 'active');
  if (error) throw error;

  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  if (!reservations.length) return { consumed: 0 };

  // En serie y con reintentos: antes, si el compare-and-swap no encontraba la
  // fila (otro proceso tocó el lote en el medio) no había error, la reserva se
  // marcaba consumida igual y esas unidades quedaban reservadas para siempre.
  for (const reservation of reservations) {
    let done = false;
    for (let pass = 0; pass < FIFO_MAX_PASSES && !done; pass++) {
      const { data: purchase, error: purchaseError } = await db
        .from('purchases')
        .select('quantity_sold, quantity_reserved')
        .eq('id', reservation.purchase_id)
        .single();
      if (purchaseError) throw purchaseError;

      const { data: updated, error: updateError } = await db
        .from('purchases')
        .update({
          quantity_sold: purchase.quantity_sold + reservation.quantity,
          quantity_reserved: purchase.quantity_reserved - reservation.quantity,
        })
        .eq('id', reservation.purchase_id)
        .eq('quantity_reserved', purchase.quantity_reserved) // compare-and-swap
        .eq('quantity_sold', purchase.quantity_sold)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      done = !!updated;
    }
    if (!done) {
      throw new BadRequestError('El stock del lote cambió mientras se aprobaba la venta. Intentá aprobarla de nuevo.');
    }
    // Se marca una por una: si la siguiente falla, un reintento solo procesa
    // las que siguen activas y no vuelve a sumar a vendido las ya movidas.
    const { error: markError } = await db
      .from('stock_reservations')
      .update({ status: 'consumed' })
      .eq('id', reservation.id);
    if (markError) throw markError;
  }

  return { consumed: reservations.length };
}

// Contraparte de consumeReservation: libera reservas activas de un pedido sin
// convertirlas en venta (rechazo de pedido, o limpieza si el registro falló a
// mitad de camino). Devuelve quantity_reserved en cada lote y marca las
// reservas como liberadas.
export async function releaseReservations(orderId: string): Promise<{ released: number }> {
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('order_id', orderId)
    .eq('status', 'active');
  if (error) throw error;

  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  if (!reservations.length) return { released: 0 };

  const releasePromises = reservations.map(reservation => 
    releaseFifoLot(reservation.purchase_id, 'quantity_reserved', reservation.quantity)
  );
  await Promise.all(releasePromises);

  const reservationIds = reservations.map(r => r.id);
  const { error: markError } = await db
    .from('stock_reservations')
    .update({ status: 'released' })
    .in('id', reservationIds);
  if (markError) throw markError;

  return { released: reservations.length };
}

export async function releaseConsumedReservations(orderId: string): Promise<{ released: number }> {
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('order_id', orderId)
    .eq('status', 'consumed');
  if (error) throw error;

  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  if (!reservations.length) return { released: 0 };

  const releasePromises = reservations.map(reservation => 
    releaseFifoLot(reservation.purchase_id, 'quantity_sold', reservation.quantity)
  );
  await Promise.all(releasePromises);

  const reservationIds = reservations.map(r => r.id);
  const { error: markError } = await db
    .from('stock_reservations')
    .update({ status: 'released' })
    .in('id', reservationIds);
  if (markError) throw markError;

  return { released: reservations.length };
}

// ============================================================================
// ── Vínculo con el catálogo: disponibilidad por código de lote ──
// ============================================================================
// El catálogo mapea cada variante a uno o más `purchases.code` (decisión de
// diseño: `code` es único por lote, no hay SKU compartido en v2). Estas dos
// funciones son la única puerta que el catálogo usa para leer bodega.
//
// Solo cuentan los lotes `received`: un lote en tránsito desde China existe en
// la tabla pero no es vendible, y publicarlo como stock haría prometer entregas
// que no se pueden cumplir.

// Disponible por código, para resolver el stock de las variantes del storefront.
// Varios lotes NO pueden compartir código (`purchases.code` es unique), así que
// el mapa es 1-a-1; aun así se suma, para no depender de esa restricción.
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

// ============================================================================
// ── Reservas de pedidos web ──
// ============================================================================
// Regla del negocio: el pedido web NO descuenta al crearse (se coordina por
// WhatsApp). Cuando la tienda lo confirma (pasa a "preparing" o "shipped") se
// apartan sus unidades para que la tienda no se las prometa a otro cliente; al
// entregarse, cancelarse o volver a "new" se liberan. La venta formal se sigue
// registrando en Ventas, que es la que descuenta el stock de verdad.
//
// Requiere la migración 0022 (stock_reservations.public_order_id). Sin ella no
// hace nada.

const RESERVING_STATUSES = new Set(['preparing', 'shipped']);

export interface PublicOrderReservationResult {
  reserved: number;
  /** Unidades que no se pudieron apartar (sin stock o variante sin lotes). */
  missing: { name: string; quantity: number }[];
}

// Requiere la 0023 (public_orders.sale_id). Sin ella ningún pedido figura
// como convertido.
export async function isPublicOrderConverted(publicOrderId: string): Promise<boolean> {
  const { data, error } = await db.from('public_orders').select('sale_id').eq('id', publicOrderId).maybeSingle();
  if (isMissingColumn(error)) return false;
  if (error) throw error;
  return !!(data as { sale_id?: string | null } | null)?.sale_id;
}

async function hasPublicReservationColumn(): Promise<boolean> {
  const { error } = await db.from('stock_reservations').select('public_order_id').limit(1);
  if (isMissingColumn(error)) return false;
  if (error) throw error;
  return true;
}

export async function releasePublicOrderReservations(publicOrderId: string): Promise<{ released: number }> {
  if (!(await hasPublicReservationColumn())) return { released: 0 };
  const { data, error } = await db
    .from('stock_reservations')
    .select('id, purchase_id, quantity')
    .eq('public_order_id', publicOrderId)
    .eq('status', 'active');
  if (error) throw error;
  const reservations = (data ?? []) as unknown as { id: string; purchase_id: string; quantity: number }[];
  for (const r of reservations) {
    await releaseFifoLot(r.purchase_id, 'quantity_reserved', r.quantity);
    const { error: markError } = await db.from('stock_reservations').update({ status: 'released' }).eq('id', r.id);
    if (markError) throw markError;
  }
  return { released: reservations.length };
}

export async function reservePublicOrder(publicOrderId: string): Promise<PublicOrderReservationResult> {
  const result: PublicOrderReservationResult = { reserved: 0, missing: [] };
  if (!(await hasPublicReservationColumn())) return result;

  // Ya se convirtió en venta: su stock lo maneja la venta, no el pedido.
  if (await isPublicOrderConverted(publicOrderId)) return result;

  // Ya tiene reservas activas: no se aparta dos veces (preparing → shipped).
  const { data: active, error: activeError } = await db
    .from('stock_reservations')
    .select('id')
    .eq('public_order_id', publicOrderId)
    .eq('status', 'active')
    .limit(1);
  if (activeError) throw activeError;
  if (active?.length) return result;

  type Line = { sku: string | null; quantity: number; variant_name?: string | null; product_name?: string | null };
  const readLines = (columns: string) =>
    db.from('public_order_items').select(columns).eq('public_order_id', publicOrderId);
  let { data: lines, error } = await readLines('sku, quantity, variant_name, product_name');
  // Sin 0019/0021 esas columnas no existen: sin variante solo se puede apartar
  // en productos de una sola combinación ('').
  if (isMissingColumn(error)) ({ data: lines, error } = await readLines('sku, quantity'));
  if (error) throw error;

  for (const line of (lines ?? []) as unknown as Line[]) {
    // Los combos no tienen stock propio.
    if (!line.sku || line.sku.startsWith('combo:')) continue;
    const variantKey = line.variant_name ?? '';
    const label = [line.product_name || 'Producto', variantKey].filter(Boolean).join(' · ');
    const codes = await codesForVariant({ catalogItemId: line.sku, variantKey });
    if (!codes.length) {
      result.missing.push({ name: label, quantity: line.quantity });
      continue;
    }

    const free = [...(await getAvailableByCodes(codes)).values()].reduce((a, b) => a + b, 0);
    const want = Math.min(line.quantity, free);
    if (want < line.quantity) result.missing.push({ name: label, quantity: line.quantity - want });
    if (want <= 0) continue;

    const taken = await walkFifoLots({ codes, label }, want, 'quantity_reserved');
    for (const lot of taken) {
      const { error: insertError } = await db.from('stock_reservations').insert({
        public_order_id: publicOrderId,
        purchase_id: lot.purchaseId,
        code: lot.code,
        quantity: lot.quantity,
        unit_final_usd: lot.costeFinalUsd,
        status: 'active',
      });
      if (insertError) {
        await releaseFifoLot(lot.purchaseId, 'quantity_reserved', lot.quantity);
        throw insertError;
      }
      result.reserved += lot.quantity;
    }
  }
  return result;
}

/** Ajusta las reservas de un pedido web a su nuevo estado. */
export async function syncPublicOrderReservation(
  publicOrderId: string,
  status: string,
): Promise<PublicOrderReservationResult | { released: number }> {
  return RESERVING_STATUSES.has(status)
    ? reservePublicOrder(publicOrderId)
    : releasePublicOrderReservations(publicOrderId);
}

// ============================================================================
// ── Movimientos de stock (devoluciones, merma, ajustes) ──
// ============================================================================
// Todo cambio de stock que NO es una venta normal queda registrado en
// `stock_movements` (migración 0023): devolución a bodega, merma y ajuste de
// conteo. Antes un ajuste solo se podía hacer editando la cantidad del lote, y
// no quedaba rastro de por qué cambió.

export type StockMovementKind = 'return_to_stock' | 'write_off' | 'adjust_in' | 'adjust_out';

export interface StockMovement {
  id: string;
  purchaseId: string | null;
  code: string | null;
  kind: StockMovementKind;
  quantity: number;
  unitCostCs: number | null;
  reason: string;
  orderId: string | null;
  createdBy: string | null;
  createdAt: string;
}

const MISSING_0023 = 'Falta aplicar la migración 0023 en Supabase para registrar movimientos de stock.';

export async function hasStockMovementsTable(): Promise<boolean> {
  const { error } = await db.from('stock_movements').select('id').limit(1);
  if (!error) return true;
  // 42P01 = tabla inexistente; PGRST205 = PostgREST no la tiene en caché.
  const code = (error as { code?: string }).code;
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return false;
  throw error;
}

export async function recordStockMovement(input: {
  purchaseId: string;
  kind: StockMovementKind;
  quantity: number;
  reason: string;
  orderId?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  const { data: lot } = await db
    .from('purchases')
    .select('code, coste_final')
    .eq('id', input.purchaseId)
    .maybeSingle();
  const { error } = await db.from('stock_movements').insert({
    purchase_id: input.purchaseId,
    code: (lot?.code as string | undefined) ?? null,
    kind: input.kind,
    quantity: input.quantity,
    unit_cost_cs: (lot?.coste_final as number | null | undefined) ?? null,
    reason: input.reason,
    order_id: input.orderId ?? null,
    created_by: input.createdBy ?? null,
  });
  if (error) throw error;
}

// Mueve unidades vendidas de un lote: `stock` las vuelve disponibles
// (quantity_sold − n); `merma` las saca del lote (quantity − n y
// quantity_sold − n), así no vuelven a venderse pero el lote cuadra.
export async function returnSoldUnits(
  purchaseId: string,
  quantity: number,
  destination: 'stock' | 'merma',
): Promise<void> {
  for (let pass = 0; pass < FIFO_MAX_PASSES; pass++) {
    const { data, error } = await db
      .from('purchases')
      .select('quantity, quantity_sold')
      .eq('id', purchaseId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('El lote de esa venta ya no existe.');
    const lot = data as { quantity: number; quantity_sold: number };
    if (lot.quantity_sold < quantity) {
      throw new BadRequestError('El lote no tiene tantas unidades vendidas para devolver.');
    }
    const patch =
      destination === 'stock'
        ? { quantity_sold: lot.quantity_sold - quantity }
        : { quantity: lot.quantity - quantity, quantity_sold: lot.quantity_sold - quantity };
    const { data: updated, error: updateError } = await db
      .from('purchases')
      .update(patch)
      .eq('id', purchaseId)
      .eq('quantity', lot.quantity) // compare-and-swap
      .eq('quantity_sold', lot.quantity_sold)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) return;
  }
  throw new BadRequestError('El stock del lote cambió mientras se procesaba la devolución. Intentá de nuevo.');
}

// Ajuste manual de conteo o merma sobre un lote recibido. Una salida no puede
// dejar el lote por debajo de lo vendido + reservado.
export async function adjustStock(
  purchaseId: string,
  input: { kind: 'adjust_in' | 'adjust_out' | 'write_off'; quantity: number; reason: string },
  authorUid: string,
): Promise<{ quantity: number; available: number }> {
  if (!(await hasStockMovementsTable())) throw new BadRequestError(MISSING_0023);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new BadRequestError('La cantidad tiene que ser un entero mayor a 0.');
  }
  if (!input.reason.trim()) throw new BadRequestError('Escribí el motivo del ajuste.');

  const delta = input.kind === 'adjust_in' ? input.quantity : -input.quantity;

  for (let pass = 0; pass < FIFO_MAX_PASSES; pass++) {
    const { data, error } = await db
      .from('purchases')
      .select('status, quantity, quantity_sold, quantity_reserved')
      .eq('id', purchaseId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestError('El lote no existe.');
    const lot = data as { status: string; quantity: number; quantity_sold: number; quantity_reserved: number };
    if (lot.status !== 'received') throw new BadRequestError('Solo se ajusta stock de lotes ya recibidos.');

    const next = lot.quantity + delta;
    const free = lot.quantity - lot.quantity_sold - lot.quantity_reserved;
    if (next < lot.quantity_sold + lot.quantity_reserved) {
      throw new BadRequestError(`Solo hay ${free} unidad(es) libres en este lote para sacar.`);
    }

    const { data: updated, error: updateError } = await db
      .from('purchases')
      .update({ quantity: next })
      .eq('id', purchaseId)
      .eq('quantity', lot.quantity) // compare-and-swap
      .eq('quantity_sold', lot.quantity_sold)
      .eq('quantity_reserved', lot.quantity_reserved)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) continue;

    await recordStockMovement({
      purchaseId,
      kind: input.kind,
      quantity: input.quantity,
      reason: input.reason.trim(),
      createdBy: authorUid,
    });
    return { quantity: next, available: next - lot.quantity_sold - lot.quantity_reserved };
  }
  throw new BadRequestError('El stock del lote cambió mientras se ajustaba. Intentá de nuevo.');
}

export async function listStockMovements(purchaseId?: string, limit = 200): Promise<StockMovement[]> {
  if (!(await hasStockMovementsTable())) return [];
  let query = db
    .from('stock_movements')
    .select('id, purchase_id, code, kind, quantity, unit_cost_cs, reason, order_id, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (purchaseId) query = query.eq('purchase_id', purchaseId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    purchase_id: string | null;
    code: string | null;
    kind: StockMovementKind;
    quantity: number;
    unit_cost_cs: number | null;
    reason: string;
    order_id: string | null;
    created_by: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    purchaseId: r.purchase_id,
    code: r.code,
    kind: r.kind,
    quantity: r.quantity,
    unitCostCs: r.unit_cost_cs == null ? null : Number(r.unit_cost_cs),
    reason: r.reason,
    orderId: r.order_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}
