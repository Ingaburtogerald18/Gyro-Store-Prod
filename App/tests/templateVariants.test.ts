// Compra contra plantilla: qué producto la recibe y qué variantes existen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { axisOptionsWithVariant, chooseTemplateProduct, templateVariantKeys } from '../server/services/templateVariants';

const axes = [
  { key: 'color', options: ['Negro', 'Blanco'] },
  { key: 'mic', options: ['Con', 'Sin'] },
];

test('las variantes son todas las combinaciones; sin ejes hay una sola, vacía', () => {
  assert.deepEqual(templateVariantKeys(axes), ['Negro / Con', 'Negro / Sin', 'Blanco / Con', 'Blanco / Sin']);
  assert.deepEqual(templateVariantKeys([]), ['']);
});

test('sin productos se crea; con uno se reutiliza; con varios hay que elegir', () => {
  assert.deepEqual(chooseTemplateProduct([], undefined, 'KZ EDX Pro'), { action: 'create' });
  assert.deepEqual(chooseTemplateProduct(['a'], undefined, 'KZ EDX Pro'), { action: 'use', id: 'a' });
  assert.throws(() => chooseTemplateProduct(['a', 'b'], undefined, 'KZ Castor'), /varios productos/);
  assert.deepEqual(chooseTemplateProduct(['a', 'b'], 'b', 'KZ Castor'), { action: 'use', id: 'b' });
  assert.throws(() => chooseTemplateProduct(['a'], 'z', 'KZ Castor'), /no pertenece/);
});

test('la opción comprada se suma al recorte del producto, en el orden de la plantilla', () => {
  assert.deepEqual(axisOptionsWithVariant({ color: ['Blanco'] }, axes, 'Negro / Con'), { color: ['Negro', 'Blanco'] });
  assert.equal(axisOptionsWithVariant({ color: ['Negro'] }, axes, 'Negro / Con'), null);
  assert.equal(axisOptionsWithVariant({}, axes, 'Blanco / Sin'), null);
});
