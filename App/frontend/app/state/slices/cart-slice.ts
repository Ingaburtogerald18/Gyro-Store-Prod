import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PublicOrderItemInput } from '@shared/schemas';
import type { CartItem } from '~/types/cart';
import { clampCartQuantity, lineCeiling, lineKey, MAX_CART_LINES } from '~/lib/cart';
import { matchesAttemptItems } from '~/lib/checkout-attempt';
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
    // La misma variante suma cantidad (hasta su tope); otra variante del mismo
    // producto es otra línea.
    addItem(state, action: PayloadAction<CartItem>) {
      const incoming = { ...action.payload, quantity: clampCartQuantity(action.payload.quantity) };
      if (incoming.quantity <= 0) return;
      const existing = state.items.find((i) => lineKey(i) === lineKey(incoming));
      if (existing) {
        // El tope y el precio más recientes son los que valen.
        existing.maxQuantity = incoming.maxQuantity;
        existing.price = incoming.price;
        existing.quantity = Math.min(clampCartQuantity(existing.quantity + incoming.quantity), lineCeiling(existing));
      } else {
        if (state.items.length >= MAX_CART_LINES) return;
        state.items.push({ ...incoming, quantity: Math.min(incoming.quantity, lineCeiling(incoming)) });
      }
    },
    // Nunca baja de 1: quitar la línea es una acción aparte (removeItem).
    setQuantity(state, action: PayloadAction<{ key: string; quantity: number }>) {
      const item = state.items.find((i) => lineKey(i) === action.payload.key);
      if (item) item.quantity = Math.min(Math.max(1, clampCartQuantity(action.payload.quantity)), lineCeiling(item));
    },
    // Revisión pedida por el servidor (409): el cliente ACEPTA explícitamente el
    // precio vigente o el nuevo tope. Nada se cambia sin esa acción.
    reviseItem(state, action: PayloadAction<{ key: string; price?: number; maxQuantity?: number }>) {
      const item = state.items.find((i) => lineKey(i) === action.payload.key);
      if (!item) return;
      if (action.payload.price !== undefined) item.price = action.payload.price;
      if (action.payload.maxQuantity !== undefined) {
        item.maxQuantity = action.payload.maxQuantity;
        item.quantity = Math.min(item.quantity, Math.max(1, lineCeiling(item)));
      }
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => lineKey(i) !== action.payload);
    },
    clearCart(state) {
      state.items = [];
    },
    clearCartIfUnchanged(state, action: PayloadAction<PublicOrderItemInput[]>) {
      // Una respuesta tardía de un pedido anterior no borra compras nuevas.
      if (matchesAttemptItems(toOrderItems(state.items), action.payload)) state.items = [];
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

// Una línea es producto o combo. `unitPrice` es el que vio el cliente: si el servidor calcula otro,
// el pedido se frena para revisar.
export function toOrderItems(items: CartItem[]): PublicOrderItemInput[] {
  return items.map((i) =>
    i.comboId
      ? { comboId: i.comboId, quantity: i.quantity, unitPrice: i.price }
      : { catalogItemId: i.catalogId, quantity: i.quantity, variantName: i.variantName, unitPrice: i.price },
  );
}

export const {
  hydrate,
  addItem,
  setQuantity,
  reviseItem,
  removeItem,
  clearCart,
  clearCartIfUnchanged,
  openCart,
  closeCart,
  toggleCart,
} = cartSlice.actions;
export const { selectCartItems, selectCartOpen, selectCartCount, selectCartSubtotal } =
  cartSlice.selectors;
export const cartReducer = cartSlice.reducer;
