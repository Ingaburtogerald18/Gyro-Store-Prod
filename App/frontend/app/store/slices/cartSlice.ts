import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PublicOrderItemInput } from '@shared/schemas';
import type { CartItem } from '~/types/cart';
import { clampCartQuantity, lineKey, MAX_CART_LINES } from '~/lib/cart';
export { lineKey } from '~/lib/cart';

export interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

const initialState: CartState = { items: [], isOpen: false };

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Se despacha al montar en cliente (el SSR arranca con el carrito vacío).
    hydrate(state, action: PayloadAction<CartItem[]>) {
      state.items = action.payload;
    },
    addItem(state, action: PayloadAction<CartItem>) {
      const incoming = { ...action.payload, quantity: clampCartQuantity(action.payload.quantity) };
      if (incoming.quantity <= 0) return;
      const existing = state.items.find((i) => lineKey(i) === lineKey(incoming));
      if (existing) {
        existing.quantity = clampCartQuantity(existing.quantity + incoming.quantity);
      } else {
        if (state.items.length >= MAX_CART_LINES) return;
        state.items.push(incoming);
      }
    },
    setQuantity(state, action: PayloadAction<{ key: string; quantity: number }>) {
      const item = state.items.find((i) => lineKey(i) === action.payload.key);
      if (item) item.quantity = Math.max(1, clampCartQuantity(action.payload.quantity));
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => lineKey(i) !== action.payload);
    },
    clearCart(state) {
      state.items = [];
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
