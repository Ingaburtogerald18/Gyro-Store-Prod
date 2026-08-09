// Presentador del catálogo público: fila de base → objeto listo para pintar.
//
// Portado del `enrich()` que corría en la v1 (server/routes/catalog.js). Vive en
// el servidor a propósito: resolver variantes desde los ejes del template y —más
// adelante— sumar stock por SKU necesita datos que el navegador no debe ver.
//
// La fila cruda ya viene validada contra `publicCatalogItemSchema`, así que acá
// solo se normaliza. Los campos jsonb (`images`, `axis_options`, template.axes)
// son opacos en el contrato: se leen de forma tolerante y nunca tiran excepción.
import type {
  CatalogDetail,
  CatalogProduct,
  CatalogVariant,
  PublicCatalogItem,
  SpecRow,
  VariantMapping,
} from '../../shared/schemas';

// Forma canónica de un eje, ya normalizada desde cualquiera de las variantes de
// jsonb que puede traer el template. `label` es lo que ve el cliente ("Tipo de
// conector"); `key` es el id interno con el que `axis_options` lo referencia.
interface Axis {
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
      return [{
        key,
        // Las filas viejas (forma de diccionario) no tienen label: cae al key,
        // que al menos es legible, en vez de dejar el selector sin título.
        label: typeof axis.label === 'string' && axis.label ? axis.label : key,
        options: asStringArray(axis.options),
        isColor: axis.isColor === true || key.toLowerCase().includes('color'),
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
function normalizeImages(value: unknown): string[] {
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
// price?: 390 } }. Se lee tolerando la forma vieja de v1 (`skus`/`sku`, cuando
// el vínculo era contra un SKU compartido) para que los datos migrados no se
// pierdan en silencio.
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
  return { codes: [...new Set(codes)], price };
}

function mappingsOf(item: PublicCatalogItem): Map<string, VariantMapping> {
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
export function collectMappedCodes(item: PublicCatalogItem): string[] {
  return [...mappingsOf(item).values()].flatMap((m) => m.codes);
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

// Stock real de una variante: suma de lo disponible en los lotes vinculados.
// Sin lotes mapeados el resultado es 0 — «Agotado», que es la verdad: no hay
// nada en bodega que se le pueda entregar al cliente.
function variantStock(mapping: VariantMapping | undefined, stockByCode: Map<string, number>): number {
  if (!mapping) return 0;
  return mapping.codes.reduce((sum, code) => sum + (stockByCode.get(code) ?? 0), 0);
}

// Detalle: lo mismo que el listado + los ejes resueltos (para el selector de
// opciones) y las variantes con su precio y stock ya calculados.
//
// Los códigos de lote NO salen al cable: son datos internos de bodega y el
// cliente no necesita saber de qué lote sale su pedido.
export function toCatalogDetail(
  item: PublicCatalogItem,
  stockByCode: Map<string, number> = new Map(),
): CatalogDetail {
  const axes = normalizeAxes(item.template?.axes);
  const mappings = mappingsOf(item);
  const basePrice = item.price ?? item.base_price ?? 0;

  const variants: CatalogVariant[] = buildCombinations(item, axes).map((axisValues) => {
    const variantName = axisValues.join(' / ');
    const mapping = mappings.get(variantName);
    return {
      variantName,
      axisValues,
      price: mapping?.price ?? basePrice,
      stock: variantStock(mapping, stockByCode),
    };
  });

  return {
    ...toCatalogProduct(item, stockByCode),
    axes: axes.map((axis) => ({
      key: axis.key,
      label: axis.label,
      options: includedOptions(item, axis),
      isColor: axis.isColor,
    })),
    variants,
  };
}

export function toCatalogProduct(
  item: PublicCatalogItem,
  stockByCode: Map<string, number> = new Map(),
): CatalogProduct {
  const axes = normalizeAxes(item.template?.axes);

  // Fotos del ítem; si no tiene, cae a las que estén cargadas por color.
  const ownImages = normalizeImages(item.images);
  const images = ownImages.length
    ? ownImages
    : Object.values(item.images_by_color ?? {}).flatMap(normalizeImages);

  // `price` es lo que se cobra; `base_price` actúa como precio "antes" cuando es
  // mayor (habilita el badge de descuento). Si solo hay uno, ese manda.
  const price = item.price ?? item.base_price ?? 0;
  const basePrice = item.base_price ?? 0;
  const compareAtPrice = basePrice > price ? basePrice : undefined;

  const mappedCodes = collectMappedCodes(item);
  const totalStock = mappedCodes.reduce((sum, code) => sum + (stockByCode.get(code) ?? 0), 0);

  return {
    id: item.id,
    name: item.template?.name ?? 'Producto',
    // Ahora resolvemos la categoría desde el join embebido
    category: item.category?.name ?? '',
    categoryId: item.category_id,
    images,
    price,
    compareAtPrice,
    // Stock = suma de lo disponible en TODOS los lotes vinculados a alguna
    // variante. Un producto sin ningún mapeo conserva el placeholder de 1: no
    // se sabe su stock, y mostrarlo agotado esconderría del storefront a los
    // productos que todavía no pasaron por el editor de variantes.
    stock: mappedCodes.length ? totalStock : 1,
    isPromo: item.is_promo,
    specs: normalizeSpecs(item.template?.specs),
    axesSummary: buildAxesSummary(item, axes),
    variantCount: countCombos(item, axes),
    templateId: item.template_id,
  };
}
