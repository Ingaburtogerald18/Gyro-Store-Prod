// Presentador del catálogo público: fila de base → objeto listo para pintar.
//
// Vive en el servidor a propósito: resolver variantes y sumar stock por lote
// necesita datos que el navegador no debe ver.
//
// La fila cruda ya viene validada contra `publicCatalogItemSchema`, así que acá
// solo se normaliza. Los campos jsonb (`images`, `axis_options`, template.axes)
// son opacos en el contrato: se leen de forma tolerante y nunca tiran excepción.
import type {
  Availability,
  CatalogDetail,
  CatalogProduct,
  CatalogVariant,
  PublicCatalogItem,
  SpecRow,
  VariantMapping,
} from '../../../shared/schemas';

// Forma canónica de un eje, ya normalizada desde cualquiera de las variantes de
// jsonb que puede traer el template. `label` es lo que ve el cliente ("Tipo de
// conector"); `key` es el id interno con el que `axis_options` lo referencia.
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

// `template.axes` es jsonb opaco y admite dos formas en el proyecto:
//   · array  (v1):  [{ key, label, options, isColor }]
//   · record (v2):  { color: ['negro', ...] }  — la que usa el seed de dev
// Se soportan ambas para que la migración de datos de v1 no rompa nada, y para
// que el panel del Hito 2 pueda fijar una sin tocar este archivo.
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

// Opciones que ESTE producto ofrece de un eje: `axis_options` puede recortar el
// catálogo de opciones del template (ej. el template tiene 5 colores, el ítem
// vende 2). Sin recorte, se ofrecen todas.
export function includedOptions(item: PublicCatalogItem, axis: Axis): string[] {
  const selected = asStringArray(
    (item.axis_options as Record<string, unknown> | null)?.[axis.key],
  );
  if (selected.length) return axis.options.filter((o) => selected.includes(o));
  return axis.options;
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

// ── Vínculo con bodega ──
//
// `variant_mappings` es jsonb opaco: { "Negro / Con micrófono": { codes: [...],
// price?: 390, promoPrice?: 350 } }. Se lee tolerando la forma vieja de v1
// (`skus`/`sku`, cuando el vínculo era contra un SKU compartido) para que los
// datos migrados no se pierdan en silencio.
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

// Todos los códigos de lote que un ítem referencia. La ruta los junta de varios
// ítems para pedir la disponibilidad a bodega en UNA sola consulta, en vez de
// una por producto (N+1).
export function collectMappedCodes(item: Pick<PublicCatalogItem, 'variant_mappings'>): string[] {
  return [...mappingsOf(item).values()].flatMap((m) => m.codes);
}

// Color de una combinación: las ofertas van por color ('' si no hay eje de color).
export function colorOfCombo(axes: Axis[], axisValues: string[]): string {
  const index = axes.findIndex((axis) => axis.isColor);
  return index >= 0 ? (axisValues[index] ?? '') : '';
}

// Producto cartesiano de las opciones OFRECIDAS, en el orden de los ejes. El
// orden importa: el nombre resultante ("Negro / Con micrófono") es la llave
// exacta con la que el editor guardó el mapeo.
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

// ── Precio ──
//
// Una sola regla para la tarjeta, la ficha, el selector rápido y el pedido:
//   1. Precio regular de la variante: el de venta del lote de bodega que toca
//      (`lotPrice`). Los lotes viejos sin precio usan el del catálogo: el de la
//      variante (`mapping.price`) o el del producto (`base_price` con oferta
//      activa — ahí `price` es el de oferta —; `price` sin oferta, con
//      `base_price` de respaldo).
//   2. Oferta vigente: la del color (`offerPrice`, Stock actual). Las
//      promociones viejas del catálogo (`mapping.promoPrice`, `price` con
//      `is_promo`) solo cuentan con el precio del catálogo, no con el de bodega.
//      Solo cuenta si es > 0 y menor que el regular: una «oferta» que no
//      rebaja no se anuncia.
//   3. Sin promoción, un `base_price` mayor al regular sigue funcionando como
//      precio «antes» (comportamiento previo del panel).
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

// ── Disponibilidad ──
//
// Lote de bodega visto por la tienda (getLotsByCodes). Un número suelto es solo
// lo disponible del lote, sin estado ni precio.
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

// Stock real de una variante: suma de lo disponible en los lotes vinculados.
//   · Sin vínculo con bodega → 'unknown': no se sabe, y no se inventa una
//     unidad para poder venderla (antes se mostraba stock 1).
//   · Sin unidades y con una compra en camino → 'coming_soon'.
//   · Vinculada y sin unidades → 'sold_out'.
// `lotPrice` es el precio de venta del lote más viejo con unidades (el que
// descuenta la próxima venta); agotada, el del último lote recibido.
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

// Detalle: lo mismo que el listado + los ejes resueltos (para el selector de
// opciones) y las variantes con su precio y stock ya calculados.
//
// Los códigos de lote NO salen al cable: son datos internos de bodega y el
// cliente no necesita saber de qué lote sale su pedido.
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
    ...(variants.length === 1 && variants[0] ? { singleVariant: variants[0].variantName } : {}),
    templateId: item.template_id,
  };
}
