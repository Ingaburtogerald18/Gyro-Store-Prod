import type { CartItem } from '~/types/cart';

// Límites del pedido público.
export const MAX_CART_QUANTITY = 999;
export const MAX_CART_LINES = 50;
export const clampCartQuantity = (quantity: number) =>
  Math.min(Math.max(Math.trunc(quantity) || 0, 0), MAX_CART_QUANTITY);

// Identidad de línea: un combo es atómico (no se fusiona con productos sueltos);
// el resto se agrupa por producto + variante.
export function lineKey(i: Pick<CartItem, 'catalogId' | 'variantName' | 'comboId'>) {
  if (i.comboId) return `combo::${i.comboId}`;
  return `${i.catalogId}::${i.variantName}`;
}


/** Tope efectivo de una línea: el de la variante (si se conoce) y el del contrato. */
export function lineCeiling(i: Pick<CartItem, 'maxQuantity'>) {
  return i.maxQuantity && i.maxQuantity > 0 ? Math.min(i.maxQuantity, MAX_CART_QUANTITY) : MAX_CART_QUANTITY;
}

/** Variante visible de una línea, sin la etiqueta heredada «Estándar». */
export function variantText(i: Pick<CartItem, 'variantName' | 'comboId'>) {
  if (i.comboId) return '';
  const name = i.variantName.trim();
  return name && name !== 'Estándar' ? name : '';
}
