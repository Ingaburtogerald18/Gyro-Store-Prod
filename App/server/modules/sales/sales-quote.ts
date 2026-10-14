// Cotizador: productos vendibles y cálculo de una venta sin reservar stock.
import { db } from '../../core/supabase';
import { round } from '../finance/costing';
import { getFinancialConfig } from '../settings/app-config';
import { getAvailableInventory, type InventoryRow } from '../inventory/inventory';
import { computeOrderLineSnapshot } from './commission';
import type { SaleLineInput } from '../../../shared/schemas';
import { resolveVariantPrice } from '../catalog/catalog-presenter';
import { estimateLineCost } from './sales-helpers';

// `getIsoWeek` (Docs/02-Arquitectura.md §6: orders.week_of agrupa pagos de comisión) vive ahora
// en utils/iso-week.ts: lo comparte con las carpetas semanales de comprobantes en
// SharePoint, y dos copias del mismo cálculo terminan divergiendo justo en el
// borde de fin de año, que es donde más duele.

// ── Productos vendibles (cotizador) ──

export interface SellableProduct {
  productName: string;
  price: number;
  stock: number;
  /** Código del primer lote disponible. El que se muestra junto al nombre. */
  code: string | null;
  /** Todos los códigos de lote con stock: el buscador matchea contra cualquiera. */
  codes: string[];
  /** De dónde sale `price`: la variante del catálogo (lo normal) o el lote (sin vínculo). */
  priceSource: 'catalog' | 'lot';
}

interface CatalogPriceRow {
  id: string;
  price: number | null;
  base_price: number | null;
  is_promo: boolean;
  variant_mappings: Record<string, unknown> | null;
}

// Precio de venta por código de lote, según la variante del catálogo a la que
// pertenece (decisión 2026-10-07: el precio vive en el catálogo; el del lote
// solo sugiere). Mismo cálculo que la tienda, promoción incluida.
async function catalogPriceByCode(rows: InventoryRow[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await db.from('catalog_items').select('id, price, base_price, is_promo, variant_mappings');
  if (error) throw error;
  const items = new Map(((data ?? []) as unknown as CatalogPriceRow[]).map((item) => [item.id, item]));

  const priceOf = (item: CatalogPriceRow, key: string) => {
    const entry = (item.variant_mappings ?? {})[key] as Record<string, unknown> | undefined;
    const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : undefined);
    return resolveVariantPrice(item, entry ? { price: num(entry.price), promoPrice: num(entry.promoPrice) } : undefined).price;
  };

  // 1) Vínculo por columna (migración 0022).
  for (const row of rows) {
    const item = row.catalogItemId ? items.get(row.catalogItemId) : undefined;
    if (item) out.set(row.code, priceOf(item, row.variantKey ?? ''));
  }
  // 2) Vínculo cargado a mano en el editor de Catálogo.
  for (const item of items.values()) {
    for (const [key, entry] of Object.entries(item.variant_mappings ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const codes = (entry as { codes?: unknown }).codes;
      if (!Array.isArray(codes)) continue;
      for (const code of codes) {
        if (typeof code === 'string' && !out.has(code)) out.set(code, priceOf(item, key));
      }
    }
  }
  return out;
}

export async function listSellableProducts(): Promise<SellableProduct[]> {
  const rows = await getAvailableInventory();
  const catalogPrices = await catalogPriceByCode(rows);
  const byProduct = new Map<string, SellableProduct>();

  for (const row of rows) {
    const existing = byProduct.get(row.productName);
    if (existing) {
      existing.stock += row.available;
      // Un mismo producto puede venir de varios lotes, cada uno con su código.
      // Se acumulan TODOS para que buscar por cualquiera de ellos encuentre el
      // producto; el que se muestra es el primero (`code`).
      if (row.code && !existing.codes.includes(row.code)) existing.codes.push(row.code);
      if (existing.priceSource === 'lot' && catalogPrices.has(row.code)) {
        existing.price = catalogPrices.get(row.code)!;
        existing.priceSource = 'catalog';
      }
    } else {
      const catalogPrice = catalogPrices.get(row.code);
      byProduct.set(row.productName, {
        productName: row.productName,
        price: catalogPrice ?? row.suggestedPrice ?? 0,
        priceSource: catalogPrice !== undefined ? 'catalog' : 'lot',
        stock: row.available,
        code: row.code ?? null,
        codes: row.code ? [row.code] : [],
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
}

// ── Cotizador (no persiste, no reserva) ──

export interface QuoteLine {
  productName: string;
  quantity: number;
  precioUnit: number;
  /** Costo de UNA unidad. */
  costeFinalSnap?: number;
  /** Costo de todas las unidades (`costeFinalSnap × quantity`). */
  costoTotal?: number;
  utilidadBruta?: number;
  salary?: number;
  utilidadNeta?: number;
  comision: number;
  comisionPercent: number;
  gananciaTienda?: number;

  // La cadena por unidad: el panel muestra unitario y total lado a lado, y el
  // tramo de `comisionPercent` sale del valor UNITARIO.
  utilidadBrutaUnit?: number;
  salaryUnit?: number;
  utilidadNetaUnit?: number;
  comisionUnit?: number;
  gananciaTiendaUnit?: number;

  wholesale: { discountPercent: number; warning: boolean };
  available: number;
  insufficientStock: boolean;
  belowMinMargin?: boolean;
}

export interface QuoteResult {
  lines: QuoteLine[];
  total: number;
  totalComision: number;
  totalGananciaTienda?: number;
}

export async function quoteSale(items: SaleLineInput[]): Promise<QuoteResult> {
  const [config, availableRows] = await Promise.all([getFinancialConfig(), getAvailableInventory()]);

  const lines = items.map((item) => {
    const estimate = estimateLineCost(item.productName, item.quantity, availableRows);
    const snapshot = computeOrderLineSnapshot(
      {
        sku: item.productName,
        quantity: item.quantity,
        basePrice: item.salePrice,
        costeFinal: estimate.costeFinal,
        costoFU: estimate.costoFU,
        applyWholesale: item.applyWholesale,
      },
      config,
    );

    return {
      productName: item.productName,
      quantity: snapshot.quantity,
      precioUnit: snapshot.precioUnit,
      costeFinalSnap: snapshot.costeFinalSnap,
      costoTotal: snapshot.costoTotal,
      utilidadBruta: snapshot.utilidadBruta,
      salary: snapshot.salary,
      utilidadNeta: snapshot.utilidadNeta,
      comision: snapshot.comision,
      comisionPercent: snapshot.comisionPercent,
      gananciaTienda: snapshot.gananciaTienda,
      utilidadBrutaUnit: snapshot.utilidadBrutaUnit,
      salaryUnit: snapshot.salaryUnit,
      utilidadNetaUnit: snapshot.utilidadNetaUnit,
      comisionUnit: snapshot.comisionUnit,
      gananciaTiendaUnit: snapshot.gananciaTiendaUnit,
      wholesale: snapshot.wholesale,
      available: estimate.available,
      insufficientStock: estimate.available < item.quantity,
      belowMinMargin: snapshot.precioUnit < round(snapshot.costeFinalSnap * (config.minMarginMultiplier ?? 1.15), 2),
    };
  });

  return {
    lines,
    total: round(
      lines.reduce((sum, line) => sum + line.precioUnit * line.quantity, 0),
      2,
    ),
    totalComision: round(
      lines.reduce((sum, line) => sum + line.comision, 0),
      2,
    ),
    totalGananciaTienda: round(
      lines.reduce((sum, line) => sum + line.gananciaTienda, 0),
      2,
    ),
  };
}
