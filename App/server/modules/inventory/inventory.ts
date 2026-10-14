// Lotes de bodega (purchases): lectura, inventario actual y KPIs.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { isMissingColumn } from '../orders/order-persistence';
import { fetchAllRows } from '../../utils/fetch-all-rows';

// El enum `purchase_status` tiene 3 valores; el frontend (`inventory-api.ts`) declara 2: falta 'pending'.
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
  /** Producto del catálogo al que pertenece el lote. */
  catalogItemId: string | null;
  /** Variante dentro de ese producto ("Negro / Con micrófono"; '' sin variantes). */
  variantKey: string | null;
  /** Orden de compra a la que pertenece la línea. */
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

// Columnas del vínculo con el catálogo. Si faltan en la base, la lectura reintenta sin ellas.
const LINK_COLUMNS = 'catalog_item_id, variant_key';
const PURCHASE_COLUMNS_LINKED = `${PURCHASE_COLUMNS}, ${LINK_COLUMNS}`;
// Orden de compra del lote. Si la columna falta en la base, se lee sin ella.
const ORDER_COLUMNS = 'order_id, quantity_ordered';
// De la más completa a la más básica: cada migración puede estar o no aplicada.
const PURCHASE_COLUMN_TIERS = [
  `${PURCHASE_COLUMNS_LINKED}, ${ORDER_COLUMNS}`,
  `${PURCHASE_COLUMNS}, ${ORDER_COLUMNS}`,
  PURCHASE_COLUMNS_LINKED,
  PURCHASE_COLUMNS,
];

// "YYYY-MM" → [primer día del mes, primer día del siguiente). El mes 1-based pasado a `Date.UTC`
// (0-based) ya apunta al mes siguiente.
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
 * Los próximos códigos GS-IN-N: siempre el mayor + 1, sin rellenar huecos, porque reutilizar el
 * de un lote borrado le pasaría su vínculo y su stock a otro producto. Se leen paginados.
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

// Solo lo que queda disponible (getCurrentInventory trae todo lo recibido): alimenta el selector
// de productos de una venta.
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
