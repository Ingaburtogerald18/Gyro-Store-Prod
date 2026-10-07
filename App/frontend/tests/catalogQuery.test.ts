// Contrato URL ↔ filtros del catálogo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_FILTERS, filtersKey, parseCatalogParams, priceRangeError, writeCatalogParams } from '../app/lib/catalogQuery';

const categories = [{ id: '3f1c0b1e-0000-4000-8000-000000000001', slug: 'kz-audifonos', name: 'Audífonos KZ' }];

test('un parámetro ausente vuelve el filtro a su valor por defecto', () => {
  assert.deepEqual(parseCatalogParams(new URLSearchParams('')), DEFAULT_FILTERS);
  const f = parseCatalogParams(new URLSearchParams('q=kz%20negro&categoria=kz-audifonos&min=200&max=900&oferta=1&disponible=1&orden=precio-asc'), categories);
  assert.deepEqual(f, { search: 'kz negro', category: 'kz-audifonos', priceMin: 200, priceMax: 900, sort: 'price-asc', onlyOnSale: true, onlyInStock: true });
});

test('enlaces viejos con id o nombre se normalizan al slug', () => {
  assert.equal(parseCatalogParams(new URLSearchParams(`categoria=${categories[0]!.id}`), categories).category, 'kz-audifonos');
  assert.equal(parseCatalogParams(new URLSearchParams('categoria=Audífonos%20KZ'), categories).category, 'kz-audifonos');
});

test('valores inválidos se descartan en vez de vaciar el catálogo', () => {
  const f = parseCatalogParams(new URLSearchParams('min=-5&max=abc&orden=raro'));
  assert.equal(f.priceMin, null);
  assert.equal(f.priceMax, null);
  assert.equal(f.sort, 'relevant');
  assert.equal(priceRangeError({ priceMin: 900, priceMax: 100 }), 'El mínimo no puede ser mayor que el máximo.');
  assert.equal(priceRangeError({ priceMin: 100, priceMax: null }), null);
});

test('escribir filtros quita los parámetros vacíos y respeta los ajenos', () => {
  const base = new URLSearchParams('categoria=kz-audifonos&q=kz&landing-preview=1');
  const next = writeCatalogParams({ ...DEFAULT_FILTERS, search: 'kz' }, base);
  assert.equal(next.get('categoria'), null);
  assert.equal(next.get('q'), 'kz');
  assert.equal(next.get('landing-preview'), '1');
  // Ida y vuelta estable: sin bucles entre URL y estado.
  const f = parseCatalogParams(next);
  assert.equal(filtersKey(f), filtersKey(parseCatalogParams(writeCatalogParams(f))));
});
