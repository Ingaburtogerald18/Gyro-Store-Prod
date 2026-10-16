// Catálogo y portada: orden por disponibilidad y por precio, filtros juntos, de a cuántos se muestra,
// qué bloques arma la portada y qué resume cada tarjeta.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogProduct } from '@shared/schemas';
import { DEFAULT_FILTERS } from '../app/lib/catalog-query';
import { filterCatalog, publicPrice, sortProducts, visibleWindow } from '../app/lib/catalog-products';
import { HOME_SHELF_SIZE, homeSections } from '../app/lib/home-sections';
import { cardOptions, cardSpecs } from '../app/lib/card-summary';

const cats = [
  { id: 'c-audio', slug: 'audio', name: 'Audífonos' },
  { id: 'c-moto', slug: 'moto', name: 'Accesorios para motocicleta' },
  { id: 'c-mouse', slug: 'mouse', name: 'Mouses' },
];

let n = 0;
function product(over: Partial<CatalogProduct>): CatalogProduct {
  n += 1;
  return {
    id: `p${n}`, name: `Producto ${n}`, category: 'Audífonos', categoryId: 'c-audio', images: [], price: 500,
    priceFrom: false, stock: 3, availability: 'available', isPromo: false, promoScope: 'none', specs: [],
    axesSummary: [], variantCount: 1, colorCount: 0, templateId: null, ...over,
  };
}
const ids = (list: { id: string }[]) => list.map((p) => p.id);

test('«Recomendados»: disponibles, consultar, próximamente y agotados, sin perder el orden de la tienda', () => {
  const list = [
    product({ id: 'agotado-1', availability: 'sold_out' }),
    product({ id: 'disp-1' }),
    product({ id: 'pronto-1', availability: 'coming_soon', price: 0 }),
    product({ id: 'consultar', availability: 'unknown' }),
    product({ id: 'disp-2' }),
    product({ id: 'agotado-2', availability: 'sold_out' }),
  ];
  assert.deepEqual(ids(sortProducts(list, 'relevant')), ['disp-1', 'disp-2', 'consultar', 'pronto-1', 'agotado-1', 'agotado-2']);
  // Copia: el orden guardado no se toca.
  assert.equal(list[0]!.id, 'agotado-1');
});

test('por precio: el precio público manda y lo que no tiene precio va al final en los dos sentidos', () => {
  const list = [
    product({ id: 'pronto', availability: 'coming_soon', price: 0 }),
    product({ id: 'caro', price: 900 }),
    product({ id: 'agotado-barato', availability: 'sold_out', price: 100 }),
    product({ id: 'sin-precio', availability: 'unknown', price: 0 }),
    product({ id: 'medio', price: 500 }),
  ];
  assert.deepEqual(ids(sortProducts(list, 'price-asc')), ['agotado-barato', 'medio', 'caro', 'pronto', 'sin-precio']);
  assert.deepEqual(ids(sortProducts(list, 'price-desc')), ['caro', 'medio', 'agotado-barato', 'pronto', 'sin-precio']);
  assert.equal(publicPrice({ availability: 'coming_soon', price: 750 }), null);
});

test('filtros combinados: búsqueda, categoría, precio, ofertas y disponibilidad se suman', () => {
  const list = [
    product({ id: 'kz-oferta', name: 'KZ EDX Pro', compareAtPrice: 600, price: 420 }),
    product({ id: 'kz-caro', name: 'KZ Castor', price: 950 }),
    product({ id: 'kz-agotado', name: 'KZ EDX Ultra', availability: 'sold_out', compareAtPrice: 700, price: 550 }),
    product({ id: 'kz-pronto', name: 'KZ AE01', availability: 'coming_soon', price: 0 }),
    product({ id: 'moto', name: 'Pantalla F92', category: 'Accesorios para motocicleta', categoryId: 'c-moto', price: 400 }),
  ];
  const run = (over: Partial<typeof DEFAULT_FILTERS>) => ids(filterCatalog(list, { ...DEFAULT_FILTERS, ...over }, cats).filtered);
  assert.deepEqual(run({ search: 'kz', category: 'audio', priceMax: 600 }), ['kz-oferta', 'kz-agotado']);
  assert.deepEqual(run({ search: 'kz', priceMax: 600, onlyInStock: true }), ['kz-oferta']);
  assert.deepEqual(run({ onlyOnSale: true }), ['kz-oferta', 'kz-agotado']);
  // Sin precio público no cae en ningún rango: «Próximamente» no es «hasta C$600».
  assert.ok(!run({ priceMax: 600 }).includes('kz-pronto'));
  // Sin filtro de precio sigue a la vista: ocultar agotados o próximos lo decide el comprador.
  assert.deepEqual(run({ category: 'audio' }), ['kz-oferta', 'kz-caro', 'kz-pronto', 'kz-agotado']);
  // Un rango imposible no filtra: se avisa junto a los campos.
  const bad = filterCatalog(list, { ...DEFAULT_FILTERS, priceMin: 900, priceMax: 100 }, cats);
  assert.equal(bad.filtered.length, list.length);
  assert.ok(bad.priceError);
  assert.equal(filterCatalog(list, { ...DEFAULT_FILTERS, category: 'ya-no-existe' }, cats).unknownCategory, true);
});

test('el listado se ve de a 12, con el total de todos los resultados', () => {
  assert.deepEqual(visibleWindow(30, 12, 12), { visible: 12, hasMore: true, next: 24 });
  assert.deepEqual(visibleWindow(30, 24, 12), { visible: 24, hasMore: true, next: 30 });
  assert.deepEqual(visibleWindow(30, 36, 12), { visible: 30, hasMore: false, next: 30 });
  assert.deepEqual(visibleWindow(5, 12, 12), { visible: 5, hasMore: false, next: 5 });
  // Lo guardado al volver de una ficha nunca baja de 12.
  assert.equal(visibleWindow(30, 0, 12).visible, 12);
});

test('portada sin destacados: los 4 primeros por disponibilidad; con 8 o 9 productos, la misma composición', () => {
  const list = [
    product({ id: 'pronto', availability: 'coming_soon', price: 0 }),
    ...Array.from({ length: 7 }, (_, i) => product({ id: `a${i}`, categoryId: i % 2 ? 'c-audio' : 'c-mouse', category: i % 2 ? 'Audífonos' : 'Mouses' })),
  ];
  const eight = homeSections(list, cats, { featuredProductIds: [] });
  assert.equal(eight.manual, false);
  assert.deepEqual(ids(eight.highlight), ['a0', 'a1', 'a2', 'a3']);
  assert.ok(eight.rows.length > 0, 'las categorías no esperan a un noveno producto');
  assert.ok(eight.rows.every((r) => r.products.length <= HOME_SHELF_SIZE));
  const nine = homeSections([...list, product({ id: 'a7' })], cats, { featuredProductIds: [] });
  assert.deepEqual(nine.rows.map((r) => r.category?.id), eight.rows.map((r) => r.category?.id));
});

test('destacados elegidos: todos y en su orden, aunque estén agotados', () => {
  const list = [product({ id: 'x' }), product({ id: 'y', availability: 'sold_out' }), product({ id: 'z' })];
  const s = homeSections(list, cats, { featuredProductIds: ['y', 'borrado', 'x'] });
  assert.equal(s.manual, true);
  assert.deepEqual(ids(s.highlight), ['y', 'x']);
});

test('categorías: automático primero las que tienen algo disponible; elegido respeta su orden; oculto no muestra', () => {
  const list = [
    product({ id: 'moto-pronto', categoryId: 'c-moto', category: 'Accesorios para motocicleta', availability: 'coming_soon', price: 0 }),
    product({ id: 'mouse-1', categoryId: 'c-mouse', category: 'Mouses' }),
    ...Array.from({ length: 5 }, (_, i) => product({ id: `audio-${i}` })),
  ];
  const featured = { featuredProductIds: ['mouse-1'] };
  const auto = homeSections(list, cats, { ...featured, homeCategoriesMode: 'auto' });
  assert.deepEqual(auto.rows.map((r) => r.category?.slug), ['audio', 'moto']);
  assert.equal(auto.rows[0]!.products.length, HOME_SHELF_SIZE);
  assert.equal(auto.rows[0]!.total, 5);
  const custom = homeSections(list, cats, { ...featured, homeCategoriesMode: 'custom', homeCategories: ['c-moto', 'c-audio'] });
  assert.deepEqual(custom.rows.map((r) => r.category?.slug), ['moto', 'audio']);
  assert.deepEqual(homeSections(list, cats, { homeCategoriesMode: 'hidden', homeCategories: [] }).rows, []);
});

test('un bloque que repite justo lo que ya está arriba no se muestra', () => {
  const list = [product({ id: 'a' }), product({ id: 'b' }), product({ id: 'm', categoryId: 'c-mouse', category: 'Mouses' })];
  const s = homeSections(list, cats, { featuredProductIds: [] });
  assert.deepEqual(ids(s.highlight), ['a', 'b', 'm']);
  assert.deepEqual(s.rows, [], 'cada categoría repetiría los mismos productos de arriba');
  const deals = homeSections([...list, ...Array.from({ length: 5 }, () => product({ isPromo: true }))], cats, { featuredProductIds: [] });
  assert.ok(deals.deals && deals.deals.products.length === HOME_SHELF_SIZE, 'ofertas limitadas a 4');
});

test('tarjeta: las opciones que deciden la compra y, a lo sumo, un dato que no las repite', () => {
  const kz = product({
    name: 'KZ EDX Pro',
    colorCount: 2,
    axesSummary: ['Jack 3.5mm', 'Con Micrófono'],
    specs: [
      { label: 'Tipo de conector', value: 'Jack 3.5mm/Tipo C' },
      { label: 'Modelo', value: 'EDX Pro' },
      { label: 'Rango de respuesta de frecuencia', value: '20 Hz - 40,000 Hz' },
      { label: 'Impedancia', value: '24Ω (Ohmios)' },
    ],
  });
  // Sin lugar para los colores en una línea: se ven en las fotos.
  assert.equal(cardOptions(kz), 'Jack 3.5mm · Con Micrófono');
  assert.deepEqual(cardSpecs(kz, 1), [{ label: 'Impedancia', value: '24Ω (Ohmios)' }]);

  const adapter = product({
    axesSummary: ['Pin C'],
    colorCount: 2,
    specs: [
      { label: 'Autonomía', value: '6 horas' },
      { label: 'Bluetooth', value: '5.4' },
      { label: 'Conectividad', value: 'Wi-Fi, Bluetooth 5.2 y cable USB-C' },
    ],
  });
  assert.equal(cardOptions(adapter), 'Pin C · 2 colores');
  // Primero lo que decide (Bluetooth); el valor largo no entra entero, va a la ficha.
  assert.deepEqual(cardSpecs(adapter, 2).map((s) => s.label), ['Bluetooth', 'Autonomía']);
  assert.equal(cardOptions(product({ colorCount: 3 })), '3 colores');
  assert.deepEqual(cardSpecs(product({ specs: [] }), 1), []);
});
