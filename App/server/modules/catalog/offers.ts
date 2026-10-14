// Ofertas por color (migración 0027): precio fijo menor al normal, con
// vencimiento. Las ve la tienda y los pedidos web; Ventas sigue con el precio normal.
import { db } from '../../core/supabase';
import { BadRequestError } from '../../utils/http-error';
import type { ColorOfferInput, PublicCatalogItem } from '../../../shared/schemas';
import {
  buildVariants,
  collectMappedCodes,
  colorOfCombo,
  includedOptions,
  mappingsOf,
  normalizeAxes,
  type StockByCode,
} from './catalog-presenter';
import { listCatalogForPricing } from './catalog';
import { getLotsByCodes, type InventoryRow } from '../inventory/inventory';

export interface ColorOffer {
  id: string;
  price: number;
  endsAt: string;
}

/** A qué producto y color pertenece un lote de Stock actual. */
export interface OfferTarget {
  catalogItemId: string;
  color: string;
  /** «KZ EDX Pro · Negro». */
  label: string;
  /** Precio normal de ese color en la tienda; null si todavía no tiene. */
  normalPrice: number | null;
}

export type InventoryRowWithOffer = InventoryRow & { offerTarget: OfferTarget | null; offer: ColorOffer | null };

interface OfferRow {
  id: string;
  catalog_item_id: string;
  color: string;
  price: number;
  ends_at: string;
}

// Sin la migración 0027 la tabla no existe: la tienda sigue sin ofertas.
const isMissingTable = (error: { code?: string } | null) =>
  !!error && ['42P01', 'PGRST205'].includes(error.code ?? '');

async function fetchActiveOffers(): Promise<OfferRow[]> {
  const { data, error } = await db
    .from('product_offers')
    .select('id, catalog_item_id, color, price, ends_at')
    .gt('ends_at', new Date().toISOString());
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data ?? []) as OfferRow[];
}

/** Ofertas vigentes por producto: color → precio. */
export async function getActiveOffers(): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  for (const row of await fetchActiveOffers()) {
    const byColor = out.get(row.catalog_item_id) ?? new Map<string, number>();
    byColor.set(row.color, Number(row.price));
    out.set(row.catalog_item_id, byColor);
  }
  return out;
}

// El precio normal de un color es el más bajo de sus combinaciones con precio,
// sin ofertas: la oferta tiene que rebajarlas a todas.
function normalPricesByColor(item: PublicCatalogItem, lots: StockByCode): Map<string, number> {
  const axes = normalizeAxes(item.template?.axes);
  const out = new Map<string, number>();
  for (const variant of buildVariants(item, lots)) {
    if (variant.availability === 'coming_soon') continue;
    const normal = variant.isPromo && variant.compareAtPrice ? variant.compareAtPrice : variant.price;
    if (!(normal > 0)) continue;
    const color = colorOfCombo(axes, variant.axisValues);
    const current = out.get(color);
    out.set(color, current === undefined ? normal : Math.min(current, normal));
  }
  return out;
}

function itemName(item: PublicCatalogItem): string {
  return item.template?.name?.trim() || 'Producto';
}

/** Suma a cada fila de Stock actual su producto y color, y la oferta vigente. */
export async function withOffers(rows: InventoryRow[]): Promise<InventoryRowWithOffer[]> {
  const [items, offers] = await Promise.all([listCatalogForPricing(), fetchActiveOffers()]);
  const lots = await getLotsByCodes(items.flatMap(collectMappedCodes));

  // Código de lote → producto y combinación. Incluye los vinculados por columna (withLinkedLots).
  const byCode = new Map<string, { item: PublicCatalogItem; variantKey: string }>();
  for (const item of items) {
    for (const [variantKey, mapping] of mappingsOf(item)) {
      for (const code of mapping.codes) byCode.set(code, { item, variantKey });
    }
  }
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const normalCache = new Map<string, Map<string, number>>();
  const offerByKey = new Map(offers.map((o) => [`${o.catalog_item_id}|${o.color}`, o]));

  return rows.map((row) => {
    const linkedItem = row.catalogItemId ? itemsById.get(row.catalogItemId) : undefined;
    const link = linkedItem ? { item: linkedItem, variantKey: row.variantKey ?? '' } : byCode.get(row.code);
    if (!link) return { ...row, offerTarget: null, offer: null };

    const axes = normalizeAxes(link.item.template?.axes);
    const color = colorOfCombo(axes, link.variantKey ? link.variantKey.split(' / ').map((p) => p.trim()) : []);
    // Con eje de color, un lote sin color no se puede ofertar: no se sabe a qué códigos va.
    if (axes.some((axis) => axis.isColor) && !color) return { ...row, offerTarget: null, offer: null };

    let normals = normalCache.get(link.item.id);
    if (!normals) {
      normals = normalPricesByColor(link.item, lots);
      normalCache.set(link.item.id, normals);
    }
    const offer = offerByKey.get(`${link.item.id}|${color}`);
    return {
      ...row,
      offerTarget: {
        catalogItemId: link.item.id,
        color,
        label: color ? `${itemName(link.item)} · ${color}` : itemName(link.item),
        normalPrice: normals.get(color) ?? null,
      },
      offer: offer ? { id: offer.id, price: Number(offer.price), endsAt: offer.ends_at } : null,
    };
  });
}

export async function setColorOffer(input: ColorOfferInput, authorUid: string): Promise<ColorOffer> {
  const [item] = await listCatalogForPricing([input.catalogItemId]);
  if (!item) throw new BadRequestError('El producto ya no existe.');

  const axes = normalizeAxes(item.template?.axes);
  const colorAxis = axes.find((axis) => axis.isColor);
  if (colorAxis ? !includedOptions(item, colorAxis).includes(input.color) : input.color !== '') {
    throw new BadRequestError('Ese color no es de este producto.');
  }
  if (new Date(input.endsAt).getTime() <= Date.now()) {
    throw new BadRequestError('La fecha de vencimiento ya pasó: elegí una más adelante.');
  }

  const lots = await getLotsByCodes(collectMappedCodes(item));
  const normal = normalPricesByColor(item, lots).get(input.color);
  if (normal === undefined) {
    throw new BadRequestError('Este color todavía no tiene precio de venta. Ponéselo con «Editar» antes de ofertarlo.');
  }
  if (input.price >= normal) {
    const shown = normal.toLocaleString('en-US', { maximumFractionDigits: 2 });
    throw new BadRequestError(`La oferta tiene que ser menor que el precio normal (C$${shown}).`);
  }

  const { data, error } = await db
    .from('product_offers')
    .upsert(
      {
        catalog_item_id: input.catalogItemId,
        color: input.color,
        price: input.price,
        ends_at: input.endsAt,
        created_by: authorUid,
      },
      { onConflict: 'catalog_item_id,color' },
    )
    .select('id, price, ends_at')
    .single();
  if (isMissingTable(error)) throw new BadRequestError('Falta correr la migración 0027 de ofertas en Supabase.');
  if (error) throw error;
  return { id: data.id as string, price: Number(data.price), endsAt: data.ends_at as string };
}

export async function removeColorOffer(id: string): Promise<boolean> {
  const { data, error } = await db.from('product_offers').delete().eq('id', id).select('id');
  if (isMissingTable(error)) return false;
  if (error) throw error;
  return (data ?? []).length > 0;
}
