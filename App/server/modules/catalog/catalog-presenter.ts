// Presentador del catálogo público: fila de la base → objeto listo para pintar. Vive en el servidor
// porque resolver variantes y stock necesita datos que el navegador no debe ver.
import type {
  Availability,
  CatalogDetail,
  CatalogProduct,
  CatalogVariant,
  PublicCatalogItem,
  SpecRow,
  VariantMapping,
} from '../../../shared/schemas';

// Eje normalizado: `label` lo ve el cliente; `key` es el id con que lo referencia `axis_options`.
export interface Axis {
  key: string;
  label: string;
  options: string[];
  isColor: boolean;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

// `template.axes` admite dos formas: array [{ key, label, options, isColor }] o record { color: [...] }.
export function normalizeAxes(axes: unknown): Axis[] {
  if (Array.isArray(axes)) {
    return axes.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const axis = raw as Record<string, unknown>;
      const key = typeof axis.key === 'string' ? axis.key : '';
      if (!key) return [];
      const label = typeof axis.label === 'string' && axis.label ? axis.label : key;
      return [{
        key,
        label,
        options: asStringArray(axis.options),
        isColor: axis.isColor === true || key.toLowerCase().includes('color') || label.toLowerCase().includes('color'),
      }];
    });
  }
  if (axes && typeof axes === 'object') {
    return Object.entries(axes as Record<string, unknown>).map(([key, options]) => ({
      key,
      label: key,
      options: asStringArray(options),
      isColor: key.toLowerCase().includes('color'),
    }));
  }
  return [];
}

// Opciones que ofrece este producto: `axis_options` puede recortar las de la plantilla.
export function includedOptions(item: PublicCatalogItem, axis: Axis): string[] {
  const selected = asStringArray(
    (item.axis_options as Record<string, unknown> | null)?.[axis.key],
  );
  if (selected.length) return axis.options.filter((o) => selected.includes(o));
  return axis.options;
}

/** La fecha más reciente entre el producto y su plantilla; sin fechas, nada. */
function latestUpdate(...dates: (string | null | undefined)[]): { updatedAt?: string } {
  const latest = dates.filter((d): d is string => Boolean(d)).sort().at(-1);
  return latest ? { updatedAt: latest } : {};
}

// Pills de la tarjeta: opciones NO-color que ofrece el producto (los colores ya
// se ven en las fotos, repetirlos como texto es ruido).
function buildAxesSummary(item: PublicCatalogItem, axes: Axis[]): string[] {
  const out: string[] = [];
  for (const axis of axes) {
    if (axis.isColor) continue;
    out.push(...includedOptions(item, axis));
  }
  return out.slice(0, 6);
}

// Combinaciones = producto cartesiano de las opciones ofrecidas. La tarjeta lo
// usa para decidir si puede agregar directo (≤1) o necesita selector de variante.
function countCombos(item: PublicCatalogItem, axes: Axis[]): number {
  if (!axes.length) return 1;
  let total = 1;
  for (const axis of axes) total *= includedOptions(item, axis).length || 1;
  return total;
}

// `images` es jsonb opaco: tolera strings sueltos u objetos { url } / { src }.
export function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return entry ? [entry] : [];
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const url = typeof obj.url === 'string' ? obj.url : obj.src;
      if (typeof url === 'string' && url) return [url];
    }
    return [];
  });
}

export function normalizeSpecs(value: unknown): SpecRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const spec = raw as Record<string, unknown>;
      if (typeof spec.label !== 'string') return [];
      return [{ label: spec.label, value: String(spec.value ?? '') }];
    });
  }
  // Forma de diccionario: { driver: '10 mm' } → [{ label: 'driver', value: '10 mm' }]
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([label, v]) => ({
      label,
      value: String(v ?? ''),
    }));
  }
  return [];
}

// ── Vínculo con bodega ── `variant_mappings`: { "Negro / Con micrófono": { codes, price?, promoPrice? } }.
// Se tolera la forma vieja (`skus`/`sku`) para que esos datos no se pierdan en silencio.
function readMapping(raw: unknown): VariantMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;

  const codes = [
    ...asStringArray(entry.codes),
    ...asStringArray(entry.skus),
    ...(typeof entry.sku === 'string' && entry.sku ? [entry.sku] : []),
  ];
  if (!codes.length) return null;

  const price = typeof entry.price === 'number' && entry.price > 0 ? entry.price : undefined;
  const promoPrice =
    typeof entry.promoPrice === 'number' && entry.promoPrice > 0 ? entry.promoPrice : undefined;
  return { codes: [...new Set(codes)], price, promoPrice };
}

export function mappingsOf(item: Pick<PublicCatalogItem, 'variant_mappings'>): Map<string, VariantMapping> {
  const out = new Map<string, VariantMapping>();
  const raw = item.variant_mappings;
  if (!raw || typeof raw !== 'object') return out;
  for (const [combo, entry] of Object.entries(raw as Record<string, unknown>)) {
    const mapping = readMapping(entry);
    if (mapping) out.set(combo, mapping);
  }
  return out;
}

// Todos los códigos de lote de un ítem: la ruta los junta para pedir la disponibilidad
// en una sola consulta en vez de una por producto.
export function collectMappedCodes(item: Pick<PublicCatalogItem, 'variant_mappings'>): string[] {
  return [...mappingsOf(item).values()].flatMap((m) => m.codes);
}

// Color de una combinación: las ofertas van por color ('' si no hay eje de color).
export function colorOfCombo(axes: Axis[], axisValues: string[]): string {
  const index = axes.findIndex((axis) => axis.isColor);
  return index >= 0 ? (axisValues[index] ?? '') : '';
}

// Producto cartesiano de las opciones ofrecidas, en el orden de los ejes: el nombre resultante
// ("Negro / Con micrófono") es la llave exacta del mapeo.
function buildCombinations(item: PublicCatalogItem, axes: Axis[]): string[][] {
  let combos: string[][] = [[]];
  for (const axis of axes) {
    const next: string[][] = [];
    for (const combo of combos) {
      for (const option of includedOptions(item, axis)) next.push([...combo, option]);
    }
    combos = next;
  }
  return combos;
}

// ── Precio ── Una regla para tarjeta, ficha y pedido: precio del lote (o del catálogo si el lote
// no tiene); la oferta por color solo cuenta si rebaja. Detalle en Docs/03-Finanzas.md §3.
export interface ResolvedPrice {
  price: number;
  compareAtPrice?: number;
  isPromo: boolean;
}

type PriceFields = Pick<PublicCatalogItem, 'price' | 'base_price' | 'is_promo'>;

export function resolveVariantPrice(
  item: PriceFields,
  mapping?: Pick<VariantMapping, 'price' | 'promoPrice'>,
  lotPrice?: number,
  offerPrice?: number,
): ResolvedPrice {
  const itemPrice = item.price ?? null;
  const basePrice = item.base_price ?? null;
  const productRegular = item.is_promo
    ? (basePrice && basePrice > 0 ? basePrice : (itemPrice ?? 0))
    : (itemPrice ?? basePrice ?? 0);
  const catalogRegular = mapping?.price && mapping.price > 0 ? mapping.price : productRegular;
  const fromLot = lotPrice !== undefined && lotPrice > 0;
  const regular = fromLot ? lotPrice : catalogRegular;

  const candidates = fromLot
    ? [offerPrice]
    : [offerPrice, mapping?.promoPrice, item.is_promo ? (itemPrice ?? undefined) : undefined];
  const promo = candidates.find((p): p is number => typeof p === 'number' && p > 0 && p < regular);
  if (promo !== undefined) return { price: promo, compareAtPrice: regular, isPromo: true };

  const compareAtPrice = !fromLot && !item.is_promo && basePrice && basePrice > regular ? basePrice : undefined;
  return { price: regular, ...(compareAtPrice ? { compareAtPrice } : {}), isPromo: false };
}

// ── Disponibilidad ── Lote visto por la tienda; un número suelto es solo lo disponible.
export interface LotInfo {
  available: number;
  inTransit: boolean;
  salePrice: number | null;
  /** Orden FIFO: fecha de compra y de registro. */
  fifoKey: string;
}
export type StockByCode = ReadonlyMap<string, number | LotInfo>;
/** Ofertas vigentes de un producto: color → precio de oferta. */
export type ColorOffers = ReadonlyMap<string, number>;

// Sin vínculo con bodega → 'unknown' (no se inventa stock); sin unidades y con compra en camino →
// 'coming_soon'. `lotPrice` es el del lote más viejo con unidades (el que descuenta la próxima venta).
export function resolveAvailability(
  mapping: Pick<VariantMapping, 'codes'> | undefined,
  stockByCode: StockByCode,
): { stock: number; availability: Availability; lotPrice?: number } {
  if (!mapping || mapping.codes.length === 0) return { stock: 0, availability: 'unknown' };
  let stock = 0;
  const lots: LotInfo[] = [];
  for (const code of mapping.codes) {
    const lot = stockByCode.get(code);
    if (lot === undefined) continue;
    if (typeof lot === 'number') {
      stock += lot;
      continue;
    }
    stock += lot.available;
    lots.push(lot);
  }
  lots.sort((a, b) => a.fifoKey.localeCompare(b.fifoKey));

  if (stock > 0) {
    const price = lots.find((lot) => lot.available > 0)?.salePrice;
    return { stock, availability: 'available', ...(price ? { lotPrice: price } : {}) };
  }
  if (lots.some((lot) => lot.inTransit)) return { stock: 0, availability: 'coming_soon' };
  const last = lots.filter((lot) => lot.salePrice).at(-1)?.salePrice;
  return { stock: 0, availability: 'sold_out', ...(last ? { lotPrice: last } : {}) };
}

export function buildVariants(
  item: PublicCatalogItem,
  stockByCode: StockByCode = new Map(),
  offers: ColorOffers = new Map(),
): CatalogVariant[] {
  const axes = normalizeAxes(item.template?.axes);
  const mappings = mappingsOf(item);
  return buildCombinations(item, axes).map((axisValues) => {
    const variantName = axisValues.join(' / ');
    const mapping = mappings.get(variantName);
    const { stock, availability, lotPrice } = resolveAvailability(mapping, stockByCode);
    if (availability === 'coming_soon') {
      return { variantName, axisValues, price: 0, isPromo: false, stock, availability };
    }
    const price = resolveVariantPrice(item, mapping, lotPrice, offers.get(colorOfCombo(axes, axisValues)));
    // Sin ningún precio no se vende por la tienda: se consulta.
    const priced = availability !== 'available' || price.price > 0;
    return { variantName, axisValues, ...price, stock, availability: priced ? availability : 'unknown' };
  });
}

type VariantSummary = Pick<
  CatalogProduct,
  'price' | 'compareAtPrice' | 'priceFrom' | 'stock' | 'availability' | 'isPromo' | 'promoScope'
>;

// Resumen de las variantes para la tarjeta del listado.
export function summarizeVariants(variants: CatalogVariant[]): VariantSummary {
  if (variants.length === 0) {
    return { price: 0, priceFrom: false, stock: 0, availability: 'unknown', isPromo: false, promoScope: 'none' };
  }
  const buyable = variants.filter((v) => v.availability === 'available');
  // El precio de la tarjeta sale de lo que se puede comprar; si no hay nada
  // comprable, de todas las variantes (sigue sirviendo para consultar).
  const pool = buyable.length ? buyable : variants;
  const prices = pool.map((v) => v.price);
  const price = Math.min(...prices);
  const priceFrom = new Set(prices).size > 1;

  const promos = pool.filter((v) => v.isPromo);
  const promoScope = promos.length === 0 ? 'none' : promos.length === pool.length ? 'all' : 'some';
  // El «antes» solo se muestra si todas las variantes comparten precio y rebaja.
  const compareSet = new Set(pool.map((v) => v.compareAtPrice ?? null));
  const compareAtPrice = !priceFrom && compareSet.size === 1 ? pool[0]?.compareAtPrice : undefined;

  // Sin nada comprable: «Próximamente» si algo viene en camino; si no,
  // agotado solo cuando nada es desconocido (lo desconocido se puede consultar).
  const availability: Availability = buyable.length
    ? 'available'
    : variants.some((v) => v.availability === 'coming_soon')
      ? 'coming_soon'
      : variants.some((v) => v.availability === 'unknown')
        ? 'unknown'
        : 'sold_out';
  if (availability === 'coming_soon') {
    return { price: 0, priceFrom: false, stock: 0, availability, isPromo: false, promoScope: 'none' };
  }

  return {
    price,
    ...(compareAtPrice ? { compareAtPrice } : {}),
    priceFrom,
    stock: buyable.reduce((sum, v) => sum + v.stock, 0),
    availability,
    isPromo: promos.length > 0,
    promoScope,
  };
}

// Detalle: el listado más ejes y variantes con precio y stock. Los códigos de lote no salen al
// cliente: son datos internos de bodega.
export function toCatalogDetail(
  item: PublicCatalogItem,
  stockByCode: StockByCode = new Map(),
  offers: ColorOffers = new Map(),
): CatalogDetail {
  const axes = normalizeAxes(item.template?.axes);

  const rawColorImages = item.images_by_color as Record<string, unknown> | null;
  const colorImages: Record<string, string[]> = {};
  if (rawColorImages && typeof rawColorImages === 'object') {
    for (const [color, imgs] of Object.entries(rawColorImages)) {
      const normalized = normalizeImages(imgs);
      if (normalized.length) colorImages[color] = normalized;
    }
  }

  const description = item.template?.description?.trim();
  return {
    ...toCatalogProduct(item, stockByCode, offers),
    ...(description ? { description } : {}),
    // Solo las opciones que ESTE producto ofrece (`axis_options` recorta el
    // molde): una opción del molde que no se vende no es «agotada», no existe.
    axes: axes.map((axis) => ({
      key: axis.key,
      label: axis.label,
      options: includedOptions(item, axis),
      isColor: axis.isColor,
    })),
    variants: buildVariants(item, stockByCode, offers),
    ...(Object.keys(colorImages).length > 0 ? { colorImages } : {}),
  };
}

export function toCatalogProduct(
  item: PublicCatalogItem,
  stockByCode: StockByCode = new Map(),
  offers: ColorOffers = new Map(),
): CatalogProduct {
  const axes = normalizeAxes(item.template?.axes);

  // Fotos del ítem; si no tiene, cae a las que estén cargadas por color.
  const ownImages = normalizeImages(item.images);
  const images = ownImages.length
    ? ownImages
    : Object.values(item.images_by_color ?? {}).flatMap(normalizeImages);

  // Precio, promoción y disponibilidad salen de las MISMAS variantes que ve la
  // ficha: la tarjeta no puede prometer algo que la ficha no sostiene.
  const variants = buildVariants(item, stockByCode, offers);
  const summary = summarizeVariants(variants);

  return {
    id: item.id,
    name: item.template?.name ?? 'Producto',
    // La categoría es la de la plantilla; las plantillas viejas sin categoría usan la del producto.
    category: item.template?.category?.name ?? item.category?.name ?? '',
    categoryId: item.template?.category_id ?? item.category_id,
    images,
    ...summary,
    specs: normalizeSpecs(item.template?.specs),
    axesSummary: buildAxesSummary(item, axes),
    variantCount: countCombos(item, axes),
    colorCount: axes.filter((axis) => axis.isColor).reduce((n, axis) => n + includedOptions(item, axis).length, 0),
    ...latestUpdate(item.updated_at, item.template?.updated_at),
    ...(variants.length === 1 && variants[0] ? { singleVariant: variants[0].variantName } : {}),
    templateId: item.template_id,
  };
}
