// Reglas de compra de una variante, compartidas por la ficha y el selector
// rápido. Puras y sin React: se prueban en tests/purchase.test.ts.
import type { Availability, CatalogAxis, CatalogVariant } from '@shared/schemas';

export type VariantSelection = Record<string, string>;

/** Los ejes que de verdad ofrecen algo que elegir. */
export function pickableAxes(axes: CatalogAxis[]): CatalogAxis[] {
  return axes.filter((a) => a.options.length > 0);
}

// `variants[].axisValues` viene alineado posicionalmente con `axes`.
const valueAt = (variant: CatalogVariant, index: number) => variant.axisValues[index] ?? null;

/** Nombre legible de la combinación elegida, en el orden de los ejes ('' sin ejes). */
export function variantLabel(axes: CatalogAxis[], selection: VariantSelection): string {
  return axes.map((a) => selection[a.key]).filter(Boolean).join(' / ');
}

/**
 * La combinación exacta de la selección, o null si falta elegir algún eje o
 * no existe. Un producto sin ejes tiene una única combinación ('').
 */
export function resolveVariant(
  axes: CatalogAxis[],
  variants: CatalogVariant[],
  selection: VariantSelection,
): CatalogVariant | null {
  if (pickableAxes(axes).some((a) => !selection[a.key])) return null;
  return variants.find((v) => axes.every((a, i) => !selection[a.key] || valueAt(v, i) === selection[a.key])) ?? null;
}

/**
 * Estado de una opción dentro de un eje, dado lo que ya está elegido en los
 * demás: 'available' si lleva a alguna combinación comprable; si no, la mejor
 * de las otras (próximamente, consultar y por último agotado).
 */
export function optionAvailability(
  axes: CatalogAxis[],
  variants: CatalogVariant[],
  selection: VariantSelection,
  axisIndex: number,
  value: string,
): Availability {
  const matching = variants.filter(
    (v) =>
      valueAt(v, axisIndex) === value &&
      axes.every((a, i) => i === axisIndex || !selection[a.key] || valueAt(v, i) === selection[a.key]),
  );
  if (matching.some((v) => v.availability === 'available')) return 'available';
  if (matching.some((v) => v.availability === 'coming_soon')) return 'coming_soon';
  if (matching.some((v) => v.availability === 'unknown')) return 'unknown';
  return 'sold_out';
}

/**
 * Selección inicial: un eje con UNA sola opción válida se elige solo. Válida =
 * lleva a algo comprable; si nada es comprable, cuenta cualquier opción
 * existente. Con varias opciones se exige una elección explícita.
 */
export function autoSelection(axes: CatalogAxis[], variants: CatalogVariant[]): VariantSelection {
  const selection: VariantSelection = {};
  if (variants.length === 0) return selection;
  const anyAvailable = variants.some((v) => v.availability === 'available');
  axes.forEach((axis, i) => {
    if (axis.options.length === 0) return;
    const valid = axis.options.filter((o) =>
      variants.some((v) => valueAt(v, i) === o && (!anyAvailable || v.availability === 'available')),
    );
    if (valid.length === 1 && valid[0]) selection[axis.key] = valid[0];
  });
  return selection;
}

export type PurchaseState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'missing'; axis: CatalogAxis }
  | { kind: 'invalid' }
  | { kind: 'sold_out'; variant: CatalogVariant }
  | { kind: 'coming_soon'; variant: CatalogVariant }
  | { kind: 'unknown'; variant: CatalogVariant }
  | { kind: 'ready'; variant: CatalogVariant; maxQuantity: number };

/**
 * ¿Se puede agregar al carrito? Solo con datos cargados, todos los ejes
 * elegidos y una combinación disponible. Mientras falten datos, haya error o
 * la variante esté agotada o sin stock verificable, no.
 */
export function purchaseState({
  loading = false,
  error = false,
  axes,
  variants,
  selection,
}: {
  loading?: boolean;
  error?: boolean;
  axes: CatalogAxis[];
  variants: CatalogVariant[];
  selection: VariantSelection;
}): PurchaseState {
  if (loading) return { kind: 'loading' };
  if (error || variants.length === 0) return { kind: 'error' };
  const missing = pickableAxes(axes).find((a) => !selection[a.key]);
  if (missing) return { kind: 'missing', axis: missing };
  const variant = resolveVariant(axes, variants, selection);
  if (!variant) return { kind: 'invalid' };
  if (variant.availability === 'unknown') return { kind: 'unknown', variant };
  if (variant.availability === 'coming_soon') return { kind: 'coming_soon', variant };
  if (variant.availability === 'sold_out' || variant.stock <= 0) return { kind: 'sold_out', variant };
  return { kind: 'ready', variant, maxQuantity: variant.stock };
}

/** Ni comprable ni con precio que mostrar: solo se consulta. */
export const isConsultOnly = (kind: PurchaseState['kind']) =>
  kind === 'sold_out' || kind === 'coming_soon' || kind === 'unknown';

/** Texto cualitativo de disponibilidad: nunca cantidades. */
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Disponible',
  coming_soon: 'Próximamente',
  sold_out: 'Agotado',
  unknown: 'Consultar disponibilidad',
};
