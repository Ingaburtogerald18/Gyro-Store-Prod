import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppStore } from '../app/store/store';
import { checkoutCleared, checkoutExtrasChanged, checkoutFieldsChanged } from '../app/store/slices/checkoutSlice';
import { addItem, clearCartIfUnchanged, toOrderItems } from '../app/store/slices/cartSlice';
import { CHECKOUT_ATTEMPT_KEY, clearCheckoutAttempt, loadCheckoutAttempt, matchesAttemptItems, newCheckoutAttemptKey, saveCheckoutAttempt } from '../app/lib/checkoutAttempt';
import type { PublicOrderInput } from '../../shared/schemas';

const input: PublicOrderInput = {
  customerName: 'Prueba', phone: '88888888', deliveryMethod: 'retiro',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  items: [{ catalogItemId: '11111111-1111-4111-8111-111111111111', variantName: 'Negro', quantity: 1, unitPrice: 500 }],
};
function memoryStorage() {
  const values = new Map<string,string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key,value); },
    removeItem: (key: string) => { values.delete(key); } };
}
test('datos y cupón viven fuera del panel y se limpian al completar el pedido', () => {
  const store = createAppStore();
  store.dispatch(checkoutFieldsChanged({ customerName: 'Prueba', phone: '88888888', deliveryMethod: 'envio', address: 'Managua', note: 'Nota' }));
  store.dispatch(checkoutExtrasChanged({ noteOpen: true, couponOpen: true, codeInput: 'GS-TEST',
    appliedCode: { ok: true, code: 'GS-TEST', type: 'fixed', value: 50 } }));
  assert.equal(store.getState().checkout.fields.address, 'Managua');
  assert.equal(store.getState().checkout.appliedCode?.code, 'GS-TEST');
  store.dispatch(checkoutCleared());
  assert.equal(store.getState().checkout.fields.customerName, '');
  assert.equal(store.getState().checkout.appliedCode, null);
});
test('una recarga recupera la misma clave y el request exacto, hasta confirmar el resultado', () => {
  const storage = memoryStorage();
  const saved = saveCheckoutAttempt(input, storage);
  assert.deepEqual(loadCheckoutAttempt(storage), saved);
  assert.equal(loadCheckoutAttempt(storage)?.idempotencyKey, input.idempotencyKey);
  clearCheckoutAttempt(storage);
  assert.equal(loadCheckoutAttempt(storage), null);
});
test('datos dañados y almacenamiento bloqueado no inventan un intento ni envían pedidos', () => {
  const storage = memoryStorage();
  storage.setItem(CHECKOUT_ATTEMPT_KEY, '{"items":[]}');
  assert.equal(loadCheckoutAttempt(storage), null);
  storage.setItem(CHECKOUT_ATTEMPT_KEY, '{inválido');
  assert.equal(loadCheckoutAttempt(storage), null);
  assert.throws(() => saveCheckoutAttempt(input, { ...storage, setItem() { throw new Error('bloqueado'); } }));
  assert.throws(() => saveCheckoutAttempt({ ...input, idempotencyKey: undefined }, storage), /clave/);
  assert.match(newCheckoutAttemptKey(), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
});
test('una respuesta tardía solo vacía el carrito si sus líneas siguen iguales', () => {
  const store = createAppStore();
  const product = { catalogId: input.items[0]!.catalogItemId!, name: 'Prueba', variantName: 'Negro',
    price: 500, quantity: 1, image: '' };
  store.dispatch(addItem(product));
  const sent = toOrderItems(store.getState().cart.items);
  assert.ok(matchesAttemptItems(sent, input.items));
  store.dispatch(addItem({ ...product, variantName: 'Blanco' }));
  store.dispatch(clearCartIfUnchanged(sent));
  assert.equal(store.getState().cart.items.length, 2);
  const current = toOrderItems(store.getState().cart.items);
  store.dispatch(clearCartIfUnchanged(current));
  assert.equal(store.getState().cart.items.length, 0);
});
