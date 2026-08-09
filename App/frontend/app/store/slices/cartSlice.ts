// Carrito local del storefront. Portado de la v1 (misma API de acciones y misma
// clave de línea, para que CartDrawer/CheckoutModal se reciclen sin cambios),
// con los límites del contrato compartido de la v2 aplicados al persistir.
//
// El checkout final es por WhatsApp: al confirmar se manda solo
// { catalogItemId, quantity } y el backend recalcula precios (doc 04 §6).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PublicOrderItemInput } from '@shared/schemas';
import type { CartItem } from '~/types/cart';

// Espejo de los techos de `publicOrderInputSchema`: 999 u. por línea, 50 líneas.
const MAX_QTY_PER_LINE = 999;
const MAX_LINES = 50;

const STORAGE_KEY = 'gyro_cart';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

const initialState: CartState = { items: [], isOpen: false };

const clampQty = (qty: number) =>
  Math.min(Math.max(Math.trunc(qty) || 0, 0), MAX_QTY_PER_LINE);

// Identidad de línea: un combo es atómico (no se fusiona con productos sueltos);
// el resto se agrupa por producto + variante.
export function lineKey(i: Pick<CartItem, 'catalogId' | 'variantName' | 'comboId'>) {
  if (i.comboId) return `combo::${i.comboId}`;
  return `${i.catalogId}::${i.variantName}`;
}

// Lectura defensiva: localStorage lo puede haber tocado cualquiera, y una línea
// corrupta no debe tumbar el arranque de la app.
function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i): i is CartItem => {
        if (!i || typeof i !== 'object') return false;
        const item = i as CartItem;
        return typeof item.catalogId === 'string' && typeof item.quantity === 'number';
      })
      .slice(0, MAX_LINES)
      .map((i) => ({ ...i, quantity: clampQty(i.quantity) }))
      .filter((i) => i.quantity > 0);
  } catch {
    return [];
  }
}

function persist(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Cuota llena o storage bloqueado: el carrito sigue vivo en memoria.
  }
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Se despacha al montar en cliente (el SSR arranca con el carrito vacío).
    hydrate(state) {
      state.items = loadCart();
    },
    addItem(state, action: PayloadAction<CartItem>) {
      const incoming = { ...action.payload, quantity: clampQty(action.payload.quantity) };
      if (incoming.quantity <= 0) return;
      const existing = state.items.find((i) => lineKey(i) === lineKey(incoming));
      if (existing) {
        existing.quantity = clampQty(existing.quantity + incoming.quantity);
      } else {
        if (state.items.length >= MAX_LINES) return;
        state.items.push(incoming);
      }
      persist(state.items);
    },
    setQuantity(state, action: PayloadAction<{ key: string; quantity: number }>) {
      const item = state.items.find((i) => lineKey(i) === action.payload.key);
      if (item) item.quantity = Math.max(1, clampQty(action.payload.quantity));
      persist(state.items);
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => lineKey(i) !== action.payload);
      persist(state.items);
    },
    clearCart(state) {
      state.items = [];
      persist(state.items);
    },
    openCart(state) {
      state.isOpen = true;
    },
    closeCart(state) {
      state.isOpen = false;
    },
    toggleCart(state) {
      state.isOpen = !state.isOpen;
    },
  },
  selectors: {
    selectCartItems: (state) => state.items,
    selectCartOpen: (state) => state.isOpen,
    selectCartCount: (state) =>
      state.items.reduce((sum, i) => sum + i.quantity, 0),
    // Subtotal informativo: el total real lo calcula el backend.
    selectCartSubtotal: (state) =>
      state.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  },
});

// Payload para POST /api/orders/public. Una línea viaja como producto O como
// combo — nunca las dos cosas: el contrato lo exige y el servidor resuelve el
// precio a partir del id que reciba.
//
// Antes esta función hacía `.filter((i) => !i.comboId)`: el combo se veía en el
// carrito, sumaba al subtotal y desaparecía del pedido sin avisar.
export function toOrderItems(items: CartItem[]): PublicOrderItemInput[] {
  return items.map((i) =>
    i.comboId
      ? { comboId: i.comboId, quantity: i.quantity }
      : { catalogItemId: i.catalogId, quantity: i.quantity, variantName: i.variantName },
  );
}

export const {
  hydrate,
  addItem,
  setQuantity,
  removeItem,
  clearCart,
  openCart,
  closeCart,
  toggleCart,
} = cartSlice.actions;
export const { selectCartItems, selectCartOpen, selectCartCount, selectCartSubtotal } =
  cartSlice.selectors;
export const cartReducer = cartSlice.reducer;
