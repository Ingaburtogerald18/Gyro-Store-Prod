// Reglas críticas del pedido público, sin red ni base: el presentador y la resolución son puros y
// la persistencia usa un almacén en memoria.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogDetail, PublicCatalogItem } from '../shared/schemas';
import {
  buildVariants,
  resolveAvailability,
  resolveVariantPrice,
  summarizeVariants,
  toCatalogProduct,
} from '../server/modules/catalog/catalog-presenter';
import { pickVariant, resolveOrderLines } from '../server/modules/orders/order-lines';
import { restoreOrderAttempt } from '../server/modules/orders/order-persistence';
import { createAttemptRegistry, orderRequestHash } from '../server/modules/orders/order-idempotency';
import type { PublicOrderInput } from '../shared/schemas';

const ID = '11111111-1111-4111-8111-111111111111';

function item(overrides: Partial<PublicCatalogItem> = {}): PublicCatalogItem {
  return {
    id: ID,
    template_id: 'tpl',
    price: 0,
    base_price: 500,
    variant_mappings: {
      Negro: { codes: ['L-NEGRO'], price: 500 },
      Blanco: { codes: ['L-BLANCO'], price: 650, promoPrice: 590 },
      Rojo: { codes: ['L-ROJO'], price: 500 },
    },
    axis_options: {},
    images: [],
    images_by_color: {},
    published: true,
    is_promo: false,
    sort_order: 0,
    created_at: null,
    updated_at: null,
    category_id: null,
    template: { id: 'tpl', name: 'KZ Prueba', axes: [{ key: 'color', label: 'Color', options: ['Negro', 'Blanco', 'Rojo', 'Verde'], isColor: true }], specs: [] },
    category: null,
    ...overrides,
  } as unknown as PublicCatalogItem;
}

const stock = new Map([
  ['L-NEGRO', 3],
  ['L-BLANCO', 2],
  ['L-ROJO', 0],
]);

test('cada variante tiene su precio y la promoción aplica solo a la suya', () => {
  const variants = buildVariants(item(), stock);
  const byName = Object.fromEntries(variants.map((v) => [v.variantName, v]));
  assert.equal(byName.Negro?.price, 500);
  assert.equal(byName.Negro?.isPromo, false);
  assert.equal(byName.Blanco?.price, 590);
  assert.equal(byName.Blanco?.compareAtPrice, 650);
  assert.equal(byName.Blanco?.isPromo, true);
});

test('la disponibilidad distingue disponible, agotado y desconocido', () => {
  const byName = Object.fromEntries(buildVariants(item(), stock).map((v) => [v.variantName, v]));
  assert.equal(byName.Negro?.availability, 'available');
  assert.equal(byName.Rojo?.availability, 'sold_out');
  // Sin vínculo con bodega no se inventa una unidad.
  assert.equal(byName.Verde?.availability, 'unknown');
  assert.equal(byName.Verde?.stock, 0);
  assert.deepEqual(resolveAvailability(undefined, stock), { stock: 0, availability: 'unknown' });
});

test('la tarjeta muestra «desde» y no promete la rebaja de una sola variante', () => {
  const card = toCatalogProduct(item(), stock);
  assert.equal(card.price, 500);
  assert.equal(card.priceFrom, true);
  assert.equal(card.compareAtPrice, undefined);
  assert.equal(card.isPromo, true);
  assert.equal(card.promoScope, 'some');
  assert.equal(card.availability, 'available');
});

test('la oferta del modelo entero rebaja todas las variantes vinculadas', () => {
  const promo = item({ is_promo: true, price: 450, variant_mappings: { Negro: { codes: ['L-NEGRO'], price: 500 }, Blanco: { codes: ['L-BLANCO'], price: 500 } } } as Partial<PublicCatalogItem>);
  const card = toCatalogProduct(promo, stock);
  assert.equal(card.price, 450);
  assert.equal(card.priceFrom, false);
  assert.equal(card.compareAtPrice, 500);
  assert.equal(card.promoScope, 'all');
  // Una oferta que no rebaja (450 ≥ 400) no se anuncia.
  assert.deepEqual(resolveVariantPrice({ price: 450, base_price: 500, is_promo: true }, { price: 400 }), { price: 400, isPromo: false });
});

test('sin vínculos el producto queda «consultar», sin stock ficticio', () => {
  const card = toCatalogProduct(item({ variant_mappings: {} } as Partial<PublicCatalogItem>), stock);
  assert.equal(card.availability, 'unknown');
  assert.equal(card.stock, 0);
  assert.equal(summarizeVariants([]).availability, 'unknown');
});

function detail(): CatalogDetail {
  const raw = item();
  return {
    ...toCatalogProduct(raw, stock),
    axes: [{ key: 'color', label: 'Color', options: ['Negro', 'Blanco', 'Rojo', 'Verde'], isColor: true }],
    variants: buildVariants(raw, stock),
  };
}

test('una etiqueta libre no es autoridad: la variante se resuelve contra el producto', () => {
  const d = detail();
  const negro = pickVariant(d, 'Negro');
  assert.equal('variant' in negro ? negro.variant.price : null, 500);
  assert.deepEqual(pickVariant(d, 'Dorado'), { reason: 'invalid_variant' });
  // Carrito viejo sin variante elegida en un producto con varias combinaciones.
  assert.deepEqual(pickVariant(d, 'Estándar'), { reason: 'variant_required' });
  assert.deepEqual(pickVariant(d, undefined), { reason: 'variant_required' });
});

test('el pedido usa el precio de la variante y detecta cambios, agotados y excesos', () => {
  const details = new Map([[ID, detail()]]);
  const ok = resolveOrderLines(
    [
      { catalogItemId: ID, quantity: 1, variantName: 'Blanco', unitPrice: 590 },
      { catalogItemId: ID, quantity: 2, variantName: 'Negro', unitPrice: 500 },
    ],
    details,
    new Map(),
  );
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.lines.map((l) => [l.variantName, l.unitPrice]), [['Blanco', 590], ['Negro', 500]]);

  const bad = resolveOrderLines(
    [
      { catalogItemId: ID, quantity: 1, variantName: 'Blanco', unitPrice: 650 }, // precio viejo
      { catalogItemId: ID, quantity: 1, variantName: 'Rojo' },                   // agotado
      { catalogItemId: ID, quantity: 1, variantName: 'Verde' },                  // sin stock verificable
      { catalogItemId: ID, quantity: 2, variantName: 'Negro' },
      { catalogItemId: ID, quantity: 2, variantName: 'Negro' },                  // 4 > 3 sumando líneas
      { catalogItemId: '22222222-2222-4222-8222-222222222222', quantity: 1 },
    ],
    details,
    new Map(),
  );
  assert.deepEqual(
    bad.issues.map((i) => [i.index, i.reason]),
    [[0, 'price_changed'], [1, 'sold_out'], [2, 'unknown_stock'], [4, 'insufficient'], [5, 'not_found']],
  );
  assert.equal(bad.issues[0]?.currentPrice, 590);
  assert.equal(bad.issues[3]?.maxQuantity, 1);
});

test('los combos conservan su precio de paquete', () => {
  const combos = new Map([['c1', { id: 'c1', name: 'Combo', price: 900 }]]);
  const { lines, issues } = resolveOrderLines([{ comboId: 'c1', quantity: 2 }], new Map(), combos);
  assert.deepEqual(issues, []);
  assert.equal(lines[0]?.unitPrice, 900);
  assert.equal(lines[0]?.variantName, undefined);
});

test('la clave se liga al contenido y solo agrupa solicitudes idénticas en curso', async () => {
  const registry = createAttemptRegistry<string>();
  let created = 0;
  const task = async () => { await new Promise(r => setImmediate(r)); return 'pedido-' + ++created; };
  const one = registry.run('k1', 'hash-A', task);
  await assert.rejects(registry.run('k1', 'hash-B', task), /otro pedido/);
  assert.deepEqual(await Promise.all([one, registry.run('k1', 'hash-A', task)]), ['pedido-1', 'pedido-1']);
  assert.equal(created, 1);
  await assert.rejects(registry.run('k2', 'hash', async () => { throw new Error('red'); }));
  assert.equal(await registry.run('k2', 'hash', async () => 'ok'), 'ok');
});

test('recuperar una respuesta persistida no recalcula stock ni consume otro cupón', async () => {
  const response = { id: 'pedido-1', total: 590 };
  const store = {
    find: async () => ({ requestHash: 'original', response }),
    commit: async () => { throw new Error('No debe volver a escribir'); },
  };
  assert.deepEqual(await restoreOrderAttempt(store, 'key', 'original'), response);
  await assert.rejects(restoreOrderAttempt(store, 'key', 'distinto'), /otro pedido/);
  assert.deepEqual(await restoreOrderAttempt(store, 'key'), response);
});

test('la huella cubre productos, cantidades, precio, contacto, entrega y código; excluye analítica', () => {
  const input: PublicOrderInput = {
    customerName: 'Prueba', phone: '88888888', deliveryMethod: 'retiro',
    items: [{ catalogItemId: ID, variantName: 'Negro', quantity: 1, unitPrice: 500 }],
  };
  const hash = orderRequestHash(input);
  assert.equal(orderRequestHash({ ...input, sessionId: 'otra', idempotencyKey: 'otra' }), hash);
  for (const changed of [
    { ...input, phone: '99999999' }, { ...input, customerName: 'Otro' },
    { ...input, deliveryMethod: 'envio' as const, address: 'Otra dirección' },
    { ...input, note: 'Otra nota' }, { ...input, discountCode: 'GS-DC-1' },
    { ...input, items: [{ ...input.items[0]!, quantity: 2 }] },
    { ...input, items: [{ ...input.items[0]!, variantName: 'Blanco' }] },
    { ...input, items: [{ ...input.items[0]!, unitPrice: 590 }] },
  ]) assert.notEqual(orderRequestHash(changed), hash);
});
