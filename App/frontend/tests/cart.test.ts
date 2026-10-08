import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartReducer, addItem, clearCart, hydrate, lineKey, removeItem, setQuantity, toOrderItems } from '../app/store/slices/cartSlice';
import { createAppStore } from '../app/store/store';
import { signedOut, sessionResolved } from '../app/store/slices/authSlice';
import { loadCart, persistCart } from '../app/lib/cartStorage';
import type { CartItem } from '../app/types/cart';

const product: CartItem = {
  catalogId: 'product', name: 'Audífono', variantName: 'Negro',
  price: 100, image: '', quantity: 2,
};

test('los reducers mantienen cantidades y combos sin acceder al almacenamiento', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Efecto en reducer'); } });
  try {
    let state = cartReducer(undefined, addItem(product));
    state = cartReducer(state, addItem({ ...product, quantity: 1000 }));
    assert.equal(state.items[0]?.quantity, 999);
    state = cartReducer(state, addItem({ ...product, comboId: 'combo', quantity: 1 }));
    assert.equal(state.items.length, 2);
    assert.deepEqual(toOrderItems(state.items), [
      { catalogItemId: 'product', quantity: 999, variantName: 'Negro', unitPrice: 100 },
      { comboId: 'combo', quantity: 1, unitPrice: 100 },
    ]);
    state = cartReducer(state, setQuantity({ key: lineKey(product), quantity: 3 }));
    assert.equal(state.items[0]?.quantity, 3);
    state = cartReducer(state, removeItem(lineKey(product)));
    assert.equal(state.items.length, 1);
    assert.deepEqual(cartReducer(state, clearCart()).items, []);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('cada store empieza vacío y cerrar sesión conserva el carrito sin compartirlo', () => {
  const first = createAppStore();
  const second = createAppStore();
  first.dispatch(hydrate([product]));
  first.dispatch(sessionResolved({ id: 'staff', email: null, phone: null, role: 'admin' }));
  assert.deepEqual(second.getState().cart.items, []);
  first.dispatch(signedOut());
  assert.equal(first.getState().auth.status, 'anonymous');
  assert.deepEqual(first.getState().cart.items, [product]);
  assert.equal(second.getState().auth.status, 'unknown');
});

test('SSR no intenta leer ni escribir localStorage', () => {
  assert.deepEqual(loadCart(), []);
  assert.doesNotThrow(() => persistCart([product]));
});

test('restaura el carrito y tolera almacenamiento corrupto o bloqueado', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = JSON.stringify([product, { ...product, quantity: 1500 }, { ...product, quantity: -1 }, null]);
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    assert.deepEqual(loadCart().map(item => item.quantity), [2, 999]);
    persistCart([product]);
    assert.deepEqual(loadCart(), [product]);
    stored = '{invalid';
    assert.deepEqual(loadCart(), []);
    storage.getItem = () => { throw new Error('Storage bloqueado'); };
    storage.setItem = () => { throw new Error('Storage bloqueado'); };
    assert.deepEqual(loadCart(), []);
    assert.doesNotThrow(() => persistCart([product]));
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
