import type { CartItem } from '~/types/cart';
import { clampCartQuantity, MAX_CART_LINES } from './cart';

const STORAGE_KEY = 'gyro_cart';

// Lectura defensiva: localStorage lo puede haber tocado cualquiera, y una línea
// corrupta no debe tumbar el arranque de la app.
export function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i): i is CartItem => {
        if (!i || typeof i !== 'object') return false;
        const item = i as CartItem;
        return typeof item.catalogId === 'string'
          && typeof item.name === 'string'
          && typeof item.variantName === 'string'
          && typeof item.image === 'string'
          && typeof item.price === 'number' && Number.isFinite(item.price)
          && typeof item.quantity === 'number' && Number.isFinite(item.quantity);
      })
      .slice(0, MAX_CART_LINES)
      .map((i) => ({ ...i, quantity: clampCartQuantity(i.quantity) }))
      .filter((i) => i.quantity > 0);
  } catch {
    return [];
  }
}

export function persistCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Cuota llena o storage bloqueado: el carrito sigue vivo en memoria.
  }
}

