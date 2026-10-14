// Reglas puras de «una compra = una variante de una plantilla». Sin base de
// datos, para poder probarlas solas (la parte con base está en template-products.ts).
import type { TemplateAxis } from '../../../shared/schemas';
import { BadRequestError } from '../../utils/http-error';

/** Llaves de variante de una plantilla ("Negro / Con micrófono"); '' si no tiene ejes. */
export function templateVariantKeys(axes: Pick<TemplateAxis, 'options'>[]): string[] {
  if (!axes.length) return [''];
  let combos: string[][] = [[]];
  for (const axis of axes) combos = combos.flatMap((combo) => axis.options.map((option) => [...combo, option]));
  return combos.map((combo) => combo.join(' / '));
}

export type ProductChoice = { action: 'create' } | { action: 'use'; id: string };

/**
 * Qué producto del catálogo recibe la compra. Una plantilla nueva tiene uno
 * solo; las plantillas viejas compartidas pueden tener varios y ahí se elige.
 */
export function chooseTemplateProduct(
  productIds: string[],
  requestedId: string | undefined,
  templateName: string,
): ProductChoice {
  if (requestedId) {
    if (!productIds.includes(requestedId)) {
      throw new BadRequestError(`El producto elegido no pertenece a la plantilla ${templateName}.`);
    }
    return { action: 'use', id: requestedId };
  }
  if (productIds.length === 0) return { action: 'create' };
  if (productIds.length === 1) return { action: 'use', id: productIds[0]! };
  throw new BadRequestError(`La plantilla ${templateName} tiene varios productos: elegí a cuál va la compra.`);
}

/**
 * `axis_options` con la opción de la variante comprada: si el producto recorta sus opciones,
 * la tienda no mostraría lo que llegó a bodega. Null si no hace falta cambiar nada.
 */
export function axisOptionsWithVariant(
  axisOptions: Record<string, string[]>,
  axes: Pick<TemplateAxis, 'key' | 'options'>[],
  variantKey: string,
): Record<string, string[]> | null {
  const parts = variantKey ? variantKey.split(' / ') : [];
  let changed = false;
  const next = { ...axisOptions };
  axes.forEach((axis, i) => {
    const chosen = parts[i];
    const current = next[axis.key];
    // Sin recorte (lista vacía o ausente) el producto ya ofrece todas las opciones.
    if (!chosen || !current?.length || current.includes(chosen)) return;
    next[axis.key] = axis.options.filter((option) => current.includes(option) || option === chosen);
    changed = true;
  });
  return changed ? next : null;
}
