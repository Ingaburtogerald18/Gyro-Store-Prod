// Contrato URL ↔ filtros del catálogo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FILTERS,
  catalogHref,
  categoryFromPath,
  categoryHref,
  filtersKey,
  hasCatalogParams,
  isCatalogPath,
  legacyCatalogRedirect,
  parseCatalogLocation,
  parseCatalogParams,
  priceRangeError,
  writeCatalogParams,
} from '../app/lib/catalog-query';

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

test('la categoría vive en la ruta y el resto en la query', () => {
  assert.equal(categoryHref('kz-audifonos'), '/categoria/kz-audifonos');
  assert.equal(categoryHref(null), '/catalogo');
  assert.equal(categoryFromPath('/categoria/kz-audifonos'), 'kz-audifonos');
  assert.equal(categoryFromPath('/categoria/kz%20audifonos/'), 'kz audifonos');
  assert.equal(categoryFromPath('/catalogo'), null);
  assert.equal(categoryFromPath('/categoria/%E0%A4%A'), null);
  assert.ok(isCatalogPath('/catalogo') && isCatalogPath('/categoria/mouses'));
  assert.ok(!isCatalogPath('/') && !isCatalogPath('/producto/x--1'));

  const f = parseCatalogLocation('/categoria/kz-audifonos', new URLSearchParams('q=edx&orden=precio-asc&categoria=otra'), categories);
  assert.equal(f.category, 'kz-audifonos');
  assert.equal(f.search, 'edx');
  assert.equal(parseCatalogLocation('/catalogo', new URLSearchParams('categoria=kz-audifonos'), categories).category, null);
});

test('la URL del listado sale de los filtros y respeta parámetros ajenos', () => {
  const base = new URLSearchParams('utm_source=ig&categoria=vieja');
  assert.equal(catalogHref({ ...DEFAULT_FILTERS, category: 'kz-audifonos', search: 'edx' }, base), '/categoria/kz-audifonos?utm_source=ig&q=edx');
  assert.equal(catalogHref(DEFAULT_FILTERS), '/catalogo');
  // Ida y vuelta: lo que se escribe es lo que se vuelve a leer.
  const filters = { ...DEFAULT_FILTERS, category: 'kz-audifonos', priceMax: 900, onlyInStock: true };
  const href = new URL(catalogHref(filters), 'https://x.test');
  assert.equal(filtersKey(parseCatalogLocation(href.pathname, href.searchParams, categories)), filtersKey(filters));
});

test('los enlaces viejos del catálogo redirigen a su página nueva', () => {
  const at = (path: string, query: string) => legacyCatalogRedirect(path, new URLSearchParams(query), categories);
  assert.equal(at('/', 'categoria=kz-audifonos&q=edx'), '/categoria/kz-audifonos?q=edx');
  assert.equal(at('/', `categoria=${categories[0]!.id}`), '/categoria/kz-audifonos');
  assert.equal(at('/', 'q=kz%20negro&orden=precio-asc'), '/catalogo?q=kz+negro&orden=precio-asc');
  assert.equal(at('/', 'categoria=no-existe'), '/catalogo');
  assert.equal(at('/catalogo', 'categoria=kz-audifonos'), '/categoria/kz-audifonos');
  // Sin categorías cargadas se confía en el valor; la página de la categoría decide si existe.
  assert.equal(legacyCatalogRedirect('/', new URLSearchParams('categoria=mouses'), []), '/categoria/mouses');
  // Lo que no es del catálogo no redirige: la vista previa del editor sigue en la portada.
  assert.equal(at('/', 'landing-preview=1'), null);
  assert.equal(at('/catalogo', 'q=kz'), null);
  assert.equal(at('/categoria/kz-audifonos', 'min=100'), null);
  assert.ok(hasCatalogParams(new URLSearchParams('orden=precio-asc')));
  assert.ok(!hasCatalogParams(new URLSearchParams('utm_source=ig')));
});
