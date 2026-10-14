// Reglas de compra compartidas por la ficha y el selector rápido, y límites del
// carrito por variante.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogAxis, CatalogVariant } from '@shared/schemas';
import { autoSelection, optionAvailability, purchaseState } from '../app/lib/purchase';
import { addItem, cartReducer, lineKey, reviseItem, setQuantity } from '../app/state/slices/cart-slice';
import type { CartItem } from '../app/types/cart';

const axes: CatalogAxis[] = [
  { key: 'color', label: 'Color', options: ['Negro', 'Blanco'], isColor: true },
  { key: 'mic', label: 'Micrófono', options: ['Con', 'Sin'], isColor: false },
];
const v = (color: string, mic: string, availability: CatalogVariant['availability'], stock = 0, price = 500): CatalogVariant => ({
  variantName: `${color} / ${mic}`, axisValues: [color, mic], price, isPromo: false, stock, availability,
});
const variants = [
  v('Negro', 'Con', 'available', 3, 520),
  v('Negro', 'Sin', 'sold_out'),
  v('Blanco', 'Con', 'unknown'),
  v('Blanco', 'Sin', 'available', 1, 480),
];

test('con varias opciones se exige elegir; con una sola válida se preselecciona', () => {
  assert.deepEqual(autoSelection(axes, variants), {});
  const single: CatalogAxis[] = [{ key: 'color', label: 'Color', options: ['Negro'], isColor: true }];
  assert.deepEqual(autoSelection(single, [{ ...v('Negro', '', 'available', 2), axisValues: ['Negro'], variantName: 'Negro' }]), { color: 'Negro' });
});

test('no se puede agregar mientras carga, falla, falta elegir o la variante no es comprable', () => {
  assert.equal(purchaseState({ loading: true, axes, variants, selection: {} }).kind, 'loading');
  assert.equal(purchaseState({ error: true, axes, variants, selection: {} }).kind, 'error');
  // Detalle vacío (respuesta inválida) también es error, no «disponible».
  assert.equal(purchaseState({ axes, variants: [], selection: {} }).kind, 'error');
  const missing = purchaseState({ axes, variants, selection: { color: 'Negro' } });
  assert.equal(missing.kind === 'missing' && missing.axis.key, 'mic');
  assert.equal(purchaseState({ axes, variants, selection: { color: 'Negro', mic: 'Sin' } }).kind, 'sold_out');
  assert.equal(purchaseState({ axes, variants, selection: { color: 'Blanco', mic: 'Con' } }).kind, 'unknown');
  const ready = purchaseState({ axes, variants, selection: { color: 'Blanco', mic: 'Sin' } });
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.kind === 'ready' && ready.variant.price, 480);
});

test('el estado de cada opción depende de lo ya elegido en los otros ejes', () => {
  assert.equal(optionAvailability(axes, variants, { color: 'Negro' }, 1, 'Sin'), 'sold_out');
  assert.equal(optionAvailability(axes, variants, { color: 'Blanco' }, 1, 'Con'), 'unknown');
  assert.equal(optionAvailability(axes, variants, {}, 1, 'Sin'), 'available');
});

const line: CartItem = { catalogId: 'p', name: 'KZ', variantName: 'Negro / Con', price: 520, image: '', quantity: 1, maxQuantity: 3 };

test('el carrito separa variantes, suma la misma y respeta su tope', () => {
  let state = cartReducer(undefined, addItem(line));
  state = cartReducer(state, addItem({ ...line, variantName: 'Blanco / Sin', price: 480, maxQuantity: 1 }));
  assert.equal(state.items.length, 2);
  state = cartReducer(state, addItem({ ...line, quantity: 5 }));
  assert.equal(state.items[0]?.quantity, 3);
  state = cartReducer(state, setQuantity({ key: lineKey(line), quantity: 10 }));
  assert.equal(state.items[0]?.quantity, 3);
  // Restar nunca deja una línea en 0: eliminar es otra acción.
  state = cartReducer(state, setQuantity({ key: lineKey(line), quantity: 0 }));
  assert.equal(state.items[0]?.quantity, 1);
});

test('la revisión del servidor solo cambia precio o tope con una acción explícita', () => {
  let state = cartReducer(undefined, addItem({ ...line, quantity: 3 }));
  state = cartReducer(state, reviseItem({ key: lineKey(line), price: 540 }));
  assert.equal(state.items[0]?.price, 540);
  state = cartReducer(state, reviseItem({ key: lineKey(line), maxQuantity: 2 }));
  assert.equal(state.items[0]?.quantity, 2);
});
