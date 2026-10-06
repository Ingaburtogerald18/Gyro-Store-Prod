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

