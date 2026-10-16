// Ficha y navegación del celular: el precio que se muestra (nunca C$0), cuándo se pide aviso en vez de comprar,
// a dónde lleva «Volver» y qué categorías tiene el ☰.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogVariant } from '@shared/schemas';
import { anyOrderable, priceDisplay, purchaseState } from '../app/lib/purchase';
import { backLabel, backStateFor, readBackState } from '../app/lib/back-link';
import { menuCategories } from '../app/lib/store-navigation';

const variant = (over: Partial<CatalogVariant>): CatalogVariant => ({
  variantName: 'Blanco', axisValues: ['Blanco'], price: 1200, isPromo: false, stock: 1, availability: 'available', ...over,
});
const colors = [{ key: 'color', label: 'Color', options: ['Blanco', 'Negro'], isColor: true }];

test('G3 Pro: la variante sin precio confirmado no se muestra como gratis', () => {
  const product = { availability: 'available' as const, price: 1200, priceFrom: false };
  const negro = variant({ variantName: 'Negro', axisValues: ['Negro'], price: 0, stock: 0, availability: 'unknown' });
  assert.deepEqual(priceDisplay(product, negro), { kind: 'consult' });
  assert.deepEqual(priceDisplay(product, variant({})), { kind: 'price', amount: 1200, from: false });
  // Sin elegir, el precio del producto; «Desde» solo si varían.
  assert.deepEqual(priceDisplay({ ...product, priceFrom: true }, null), { kind: 'price', amount: 1200, from: true });
  // El estado de compra de esa variante es consultar, no agregar.
  const state = purchaseState({ axes: colors, variants: [variant({}), negro], selection: { color: 'Negro' } });
  assert.equal(state.kind, 'unknown');
});

test('Próximamente nunca muestra precio, aunque traiga uno', () => {
  assert.deepEqual(priceDisplay({ availability: 'coming_soon', price: 0 }, null), { kind: 'coming_soon' });
  assert.deepEqual(priceDisplay({ availability: 'available', price: 900 }, variant({ availability: 'coming_soon', price: 750 })), { kind: 'coming_soon' });
  // Agotado conserva su precio: se ve, aunque no se pueda pedir.
  assert.deepEqual(priceDisplay({ availability: 'sold_out', price: 550 }, null), { kind: 'price', amount: 550, from: false });
});

test('stock disponible sin precio confirmado tampoco permite agregar al carrito', () => {
  const unpriced = variant({ price: 0 });
  assert.equal(anyOrderable([unpriced]), false);
  assert.equal(purchaseState({ axes: colors, variants: [unpriced], selection: { color: 'Blanco' } }).kind, 'unknown');
});

test('X11: si ninguna combinación se puede pedir, la intención es pedir aviso', () => {
  const comingSoon = ['Blanco', 'Negro', 'Rojo'].map((c) => variant({ variantName: c, axisValues: [c], price: 0, stock: 0, availability: 'coming_soon' }));
  assert.equal(anyOrderable(comingSoon), false);
  assert.equal(anyOrderable([...comingSoon, variant({ stock: 0 })]), false, 'disponible sin unidades no se puede pedir');
  assert.equal(anyOrderable([...comingSoon, variant({})]), true);
});

test('«Volver» regresa al listado de origen, también después de pasar por relacionados', () => {
  const fromListing = backStateFor({ pathname: '/categoria/mouses', search: '?disponible=1&orden=precio-asc', state: null });
  assert.deepEqual(fromListing, { backTo: '/categoria/mouses?disponible=1&orden=precio-asc', steps: 1 });
  // Desde una ficha con origen, un relacionado suma un paso más.
  assert.deepEqual(backStateFor({ pathname: '/producto/kz-edx-pro', search: '', state: fromListing }), {
    backTo: '/categoria/mouses?disponible=1&orden=precio-asc',
    steps: 2,
  });
  // Entró directo a la ficha: sin origen no se inventa uno.
  assert.equal(backStateFor({ pathname: '/producto/kz-edx-pro', search: '', state: null }), undefined);
  assert.equal(readBackState({ backTo: '/catalogo', steps: 0 }), null);
  assert.equal(readBackState('cualquier cosa'), null);
  assert.equal(readBackState({ backTo: 'https://example.com', steps: 1 }), null);
  assert.equal(readBackState({ backTo: '//example.com', steps: 1 }), null);
  assert.equal(readBackState({ backTo: '/\\example.com', steps: 1 }), null);
});

test('El texto de «Volver» dice a dónde vuelve', () => {
  const categories = [{ id: 'm', slug: 'mouses', name: 'Mouses' }];
  assert.equal(backLabel('/categoria/mouses?orden=precio-asc', categories), 'Volver a Mouses');
  assert.equal(backLabel('/catalogo?q=kz', categories), 'Volver a la búsqueda');
  assert.equal(backLabel('/catalogo', categories), 'Volver al catálogo');
  assert.equal(backLabel('/', categories), 'Volver al inicio');
});

test('☰ del celular: con categorías elegidas suma las demás con productos; automático y oculto, como el header', () => {
  const categories = [
    { id: 'audio', name: 'KZ Audífonos' },
    { id: 'pc', name: 'Audífonos para Computadora' },
    { id: 'mouses', name: 'Mouses' },
  ];
  const counts = { audio: 4, pc: 0, mouses: 2 };
  // Como en la tienda publicada: lista elegida sin Mouses (creada después) y con una vacía.
  const custom = menuCategories({ headerCategories: ['audio', 'pc'] }, categories, counts);
  assert.deepEqual(custom.map((c) => c.id), ['audio', 'mouses']);
  assert.deepEqual(menuCategories({ headerCategories: [], headerCategoriesMode: 'auto' }, categories, counts).map((c) => c.id), ['audio', 'mouses']);
  assert.deepEqual(menuCategories({ headerCategories: ['audio'], headerCategoriesMode: 'hidden' }, categories, counts), []);
});
