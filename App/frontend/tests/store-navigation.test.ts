// Header de la tienda: qué categorías se muestran, cuántas entran y qué ve cada rol.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fittingCount, headerCategories, staffActions } from '../app/lib/store-navigation';
import { roleLabel } from '../app/lib/roles';

const cats = [
  { id: 'a', name: 'Audífonos' },
  { id: 'b', name: 'Bocinas' },
  { id: 'c', name: 'Cables' },
];
const ids = (list: { id: string }[]) => list.map((c) => c.id);

test('automática: todas las que tienen productos, sin tope', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}` }));
  const counts = Object.fromEntries(many.map((c) => [c.id, 1]));
  assert.equal(headerCategories({ headerCategories: [] }, many, counts).length, 12);
  assert.deepEqual(ids(headerCategories({ headerCategories: [], headerCategoriesMode: 'auto' }, cats, { a: 2, b: 0, c: 1 })), ['a', 'c']);
});

test('elegidas: el orden del dueño, sin las vacías ni las que ya no existen', () => {
  const landing = { headerCategories: ['c', 'x', 'b', 'a'], headerCategoriesMode: 'custom' as const };
  assert.deepEqual(ids(headerCategories(landing, cats, { a: 1, b: 0, c: 3 })), ['c', 'a']);
  // Configuración vieja sin modo: con ids es «elegidas».
  assert.deepEqual(ids(headerCategories({ headerCategories: ['b'] }, cats, { b: 1 })), ['b']);
});

test('oculta: ninguna, aunque tengan productos', () => {
  assert.deepEqual(headerCategories({ headerCategories: ['a'], headerCategoriesMode: 'hidden' }, cats, { a: 1 }), []);
});

test('sin conteos se muestran todas: no se esconde una categoría por no saber si tiene productos', () => {
  assert.equal(headerCategories({ headerCategories: [] }, cats, undefined).length, 3);
});

test('fila de categorías: todas si entran; si no, deja lugar para «Más categorías»', () => {
  assert.equal(fittingCount([100, 100, 100], 320, 120, 4), 3);
  // 100 + 4 + 100 + 4 + 120 = 328 entra en 330; con la tercera no.
  assert.equal(fittingCount([100, 100, 100, 100], 330, 120, 4), 2);
  assert.equal(fittingCount([300], 200, 120, 4), 0);
  assert.equal(fittingCount([], 200, 120, 4), 0);
});

test('herramientas del personal: según el rol y la página, nunca para clientes ni visitantes', () => {
  const list = (role: string | null, onHome: boolean) => staffActions(role, { onHome }).map((a) => a.id);
  assert.deepEqual(list('global_admin', true), ['admin', 'editor', 'profile']);
  assert.deepEqual(list('admin', false), ['admin', 'profile']);
  assert.deepEqual(list('seller', true), ['admin', 'profile']);
  assert.deepEqual(list('customer', true), []);
  assert.deepEqual(list(null, true), []);
});

test('el rol se muestra con su nombre, nunca el valor interno', () => {
  assert.equal(roleLabel('global_admin'), 'Administrador general');
  assert.equal(roleLabel('logistics_customer'), 'Logística (lectura)');
  assert.equal(roleLabel('rol_nuevo'), 'Colaborador');
  assert.equal(roleLabel(null), 'Colaborador');
});
