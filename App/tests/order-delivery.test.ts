// Entrega y operación de los pedidos web: Managua, Cargo Trans y retiro, el mensaje de WhatsApp de cada
// una y las fechas que registra el panel. Sin red ni base.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasDeliveryDestination,
  managuaDate,
  operationDateIssues,
  publicOrderFieldsSchema,
  publicOrderInputSchema,
  type PublicOrderInput,
} from '../shared/schemas';
import { buildWhatsappMessage } from '../server/modules/orders/order-message';

const ID = '11111111-1111-4111-8111-111111111111';
const base: PublicOrderInput = {
  customerName: 'Prueba', phone: '88888888', deliveryMethod: 'retiro',
  items: [{ catalogItemId: ID, quantity: 1 }],
};
const business = { brandName: 'Gyro Store', whatsapp: '+505 8594 4758', currency: 'C$' };
const message = (input: PublicOrderInput) =>
  decodeURIComponent(buildWhatsappMessage(input, [{ name: 'KZ EDX Pro', quantity: 1, lineTotal: 900 }], 900, business).split('?text=')[1] ?? '');

test('el formulario ofrece Managua, Cargo Trans y retiro; el valor viejo solo entra al reintentar un pedido guardado', () => {
  for (const deliveryMethod of ['managua', 'cargo_trans', 'retiro'] as const) {
    assert.ok(publicOrderFieldsSchema.safeParse({ ...base, deliveryMethod, address: 'Bo Monseñor Lezcano' }).success);
  }
  assert.ok(!publicOrderFieldsSchema.safeParse({ ...base, deliveryMethod: 'envio' }).success);
  assert.ok(publicOrderInputSchema.safeParse({ ...base, deliveryMethod: 'envio', address: 'Dirección vieja' }).success);
  assert.ok(!publicOrderInputSchema.safeParse({ ...base, deliveryMethod: 'domicilio' }).success);
});

test('toda entrega que no es retiro necesita dirección o ubicación', () => {
  assert.ok(hasDeliveryDestination({ deliveryMethod: 'retiro' }));
  assert.ok(!hasDeliveryDestination({ deliveryMethod: 'managua' }));
  assert.ok(!hasDeliveryDestination({ deliveryMethod: 'cargo_trans', address: 'León' }));
  assert.ok(hasDeliveryDestination({ deliveryMethod: 'cargo_trans', address: 'León, barrio San Felipe' }));
  assert.ok(hasDeliveryDestination({ deliveryMethod: 'managua', locationUrl: 'https://maps.google.com/?q=1,2' }));
});

test('el mensaje dice cómo se cobra el transporte y nunca lo suma al total', () => {
  const cargo = message({ ...base, deliveryMethod: 'cargo_trans', address: 'León, barrio San Felipe' });
  assert.match(cargo, /Envío por Cargo Trans/);
  assert.match(cargo, /Transporte: aparte, con el comprobante de Cargo Trans/);
  assert.match(cargo, /TOTAL PRODUCTOS:\s+C\$900/);

  const managua = message({ ...base, deliveryMethod: 'managua', address: 'Bo Monseñor Lezcano' });
  assert.match(managua, /Delivery en Managua/);
  assert.match(managua, /Delivery: a cotizar/);

  const pickup = message(base);
  assert.match(pickup, /\*Retiro\*/);
  assert.doesNotMatch(pickup, /tienda/i);
  assert.doesNotMatch(pickup, /Transporte|Delivery:/);
});

test('el mensaje va al WhatsApp de Configuración, no al del entorno', () => {
  assert.match(buildWhatsappMessage(base, [], 0, { ...business, whatsapp: '+505 1234 5678' }), /^https:\/\/wa\.me\/50512345678\?/);
});

test('las fechas del panel no pueden ser futuras ni anteriores al pedido', () => {
  const ok = { productPaidDate: '2026-10-14', shippingPaidDate: null, receivedDate: '2026-10-15' };
  assert.deepEqual(operationDateIssues(ok, '2026-10-14', '2026-10-15'), []);
  const issues = operationDateIssues({ productPaidDate: '2026-10-13', shippingPaidDate: null, receivedDate: '2026-10-20' }, '2026-10-14', '2026-10-15');
  assert.deepEqual(issues.map((i) => i.path), ['productPaidDate', 'receivedDate']);
});

test('el día de una fecha es el de Managua, no el del servidor', () => {
  // 03:00 UTC del 15 es todavía el 14 en Managua (UTC−6).
  assert.equal(managuaDate(new Date('2026-10-15T03:00:00Z')), '2026-10-14');
  assert.equal(managuaDate(new Date('2026-10-15T07:00:00Z')), '2026-10-15');
});
